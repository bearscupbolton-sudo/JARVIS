import SftpClient from "ssh2-sftp-client";
import { db } from "./db";
import { invoices, invoiceLines, inventoryItems } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const PFG_CONFIG = {
  host: process.env.PFG_SFTP_HOST || "ecomm.pfgc.com",
  port: parseInt(process.env.PFG_SFTP_PORT || "22"),
  username: process.env.PFG_SFTP_USERNAME || "zzBEARSCUP",
  password: process.env.PFG_SFTP_PASSWORD || "",
  opco: process.env.PFG_OPCO || "170",
};

function getSftp(): SftpClient {
  return new SftpClient("pfg-bearscup");
}

export async function testPfgConnection(): Promise<{ success: boolean; message: string; files?: any[] }> {
  const sftp = getSftp();
  try {
    await sftp.connect({
      host: PFG_CONFIG.host,
      port: PFG_CONFIG.port,
      username: PFG_CONFIG.username,
      password: PFG_CONFIG.password,
      readyTimeout: 10000,
    });

    let files: any[] = [];
    try {
      const outFiles = await sftp.list("/OUT");
      files = outFiles.map(f => ({
        name: f.name,
        size: f.size,
        modifyTime: f.modifyTime,
        type: f.type === "d" ? "directory" : "file",
      }));
    } catch (err: any) {
      return { success: true, message: `Connected but could not list /OUT: ${err.message}`, files: [] };
    }

    await sftp.end();
    return {
      success: true,
      message: `Connected successfully. Found ${files.length} file(s) in /OUT.`,
      files,
    };
  } catch (err: any) {
    try { await sftp.end(); } catch {}
    return { success: false, message: `Connection failed: ${err.message}` };
  }
}

export async function listPfgFiles(folder: string = "/OUT"): Promise<{ success: boolean; files: any[]; message?: string }> {
  const sftp = getSftp();
  try {
    await sftp.connect({
      host: PFG_CONFIG.host,
      port: PFG_CONFIG.port,
      username: PFG_CONFIG.username,
      password: PFG_CONFIG.password,
      readyTimeout: 10000,
    });

    const rawFiles = await sftp.list(folder);
    const files = rawFiles
      .filter(f => f.type !== "d")
      .map(f => ({
        name: f.name,
        size: f.size,
        modifyTime: f.modifyTime,
        path: `${folder}/${f.name}`,
      }));

    await sftp.end();
    return { success: true, files };
  } catch (err: any) {
    try { await sftp.end(); } catch {}
    return { success: false, files: [], message: err.message };
  }
}

export async function downloadPfgFile(remotePath: string): Promise<{ success: boolean; content?: string; message?: string }> {
  const sftp = getSftp();
  try {
    await sftp.connect({
      host: PFG_CONFIG.host,
      port: PFG_CONFIG.port,
      username: PFG_CONFIG.username,
      password: PFG_CONFIG.password,
      readyTimeout: 10000,
    });

    const buffer = await sftp.get(remotePath);
    await sftp.end();

    const content = typeof buffer === "string" ? buffer : (buffer as Buffer).toString("utf-8");
    return { success: true, content };
  } catch (err: any) {
    try { await sftp.end(); } catch {}
    return { success: false, message: err.message };
  }
}

export interface PfgInvoiceLine {
  itemNumber: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  extendedPrice: number;
  catchWeight?: number;
}

export interface PfgInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  customerNumber: string;
  lines: PfgInvoiceLine[];
  totalAmount: number;
}

export function parsePfgInvoiceCSV(content: string): PfgInvoice[] {
  const lines = content.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());

  const invNumIdx = header.findIndex(h => h.includes("invoice") && (h.includes("num") || h.includes("no") || h.includes("#")));
  const invDateIdx = header.findIndex(h => h.includes("invoice") && h.includes("date"));
  const custIdx = header.findIndex(h => h.includes("customer") || h.includes("cust"));
  const itemNumIdx = header.findIndex(h => h.includes("item") && (h.includes("num") || h.includes("no") || h.includes("#") || h.includes("code")));
  const descIdx = header.findIndex(h => h.includes("desc") || h.includes("description") || h.includes("product"));
  const qtyIdx = header.findIndex(h => h.includes("qty") || h.includes("quantity") || h.includes("shipped"));
  const unitIdx = header.findIndex(h => h === "unit" || h === "uom" || h.includes("unit of"));
  const priceIdx = header.findIndex(h => h.includes("price") || h.includes("unit cost"));
  const extIdx = header.findIndex(h => h.includes("ext") || h.includes("total") || h.includes("amount"));

  const invoiceMap = new Map<string, PfgInvoice>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;

    const invoiceNum = safeCol(cols, invNumIdx) || `PFG-${i}`;
    const invoiceDate = safeCol(cols, invDateIdx) || new Date().toISOString().split("T")[0];
    const customerNum = safeCol(cols, custIdx) || "";

    const line: PfgInvoiceLine = {
      itemNumber: safeCol(cols, itemNumIdx) || "",
      description: safeCol(cols, descIdx) || `Item ${i}`,
      quantity: parseFloat(safeCol(cols, qtyIdx)) || 0,
      unit: safeCol(cols, unitIdx) || "each",
      unitPrice: parseFloat(safeCol(cols, priceIdx)) || 0,
      extendedPrice: parseFloat(safeCol(cols, extIdx)) || 0,
    };

    if (!invoiceMap.has(invoiceNum)) {
      invoiceMap.set(invoiceNum, {
        invoiceNumber: invoiceNum,
        invoiceDate,
        customerNumber: customerNum,
        lines: [],
        totalAmount: 0,
      });
    }
    const inv = invoiceMap.get(invoiceNum)!;
    inv.lines.push(line);
    inv.totalAmount += line.extendedPrice || (line.quantity * line.unitPrice);
  }

  return Array.from(invoiceMap.values());
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function safeCol(cols: string[], idx: number): string {
  if (idx < 0 || idx >= cols.length) return "";
  return cols[idx].replace(/^"|"$/g, "").trim();
}

export async function importPfgInvoice(invoice: PfgInvoice): Promise<{ invoiceId: number; matchedLines: number; unmatchedLines: number }> {
  const allItems = await db.select().from(inventoryItems);

  const nameMap = new Map<string, typeof allItems[0]>();
  for (const item of allItems) {
    nameMap.set(item.name.toLowerCase(), item);
    if (item.aliases) {
      for (const alias of item.aliases) {
        nameMap.set(alias.toLowerCase(), item);
      }
    }
  }

  const [inserted] = await db.insert(invoices).values({
    vendorName: "Performance Food Group",
    invoiceDate: invoice.invoiceDate,
    invoiceNumber: invoice.invoiceNumber,
    invoiceTotal: invoice.totalAmount,
    notes: `Auto-imported from PFG SFTP on ${new Date().toLocaleDateString()}`,
  }).returning();

  let matchedLines = 0;
  let unmatchedLines = 0;

  for (const line of invoice.lines) {
    const matched = nameMap.get(line.description.toLowerCase()) ||
                    nameMap.get(line.itemNumber.toLowerCase());
    const inventoryItemId = matched?.id || null;

    await db.insert(invoiceLines).values({
      invoiceId: inserted.id,
      itemDescription: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      lineTotal: line.extendedPrice || (line.quantity * line.unitPrice),
      inventoryItemId,
    });

    if (inventoryItemId && line.unitPrice > 0) {
      await db.update(inventoryItems)
        .set({
          costPerUnit: line.unitPrice,
          lastUpdatedCost: new Date(),
        })
        .where(eq(inventoryItems.id, inventoryItemId));
      matchedLines++;
    } else {
      unmatchedLines++;
    }
  }

  return { invoiceId: inserted.id, matchedLines, unmatchedLines };
}

export async function pullAndImportPfgInvoices(): Promise<{
  success: boolean;
  message: string;
  imported: { fileName: string; invoiceCount: number; matchedLines: number; unmatchedLines: number }[];
}> {
  const fileList = await listPfgFiles("/OUT");
  if (!fileList.success) {
    return { success: false, message: `Failed to list files: ${fileList.message}`, imported: [] };
  }

  const invoiceFiles = fileList.files.filter(f =>
    f.name.toLowerCase().includes("invoice") ||
    f.name.toLowerCase().endsWith(".csv") ||
    f.name.toLowerCase().endsWith(".txt")
  );

  if (invoiceFiles.length === 0) {
    return { success: true, message: "No invoice files found in /OUT", imported: [] };
  }

  const imported: { fileName: string; invoiceCount: number; matchedLines: number; unmatchedLines: number }[] = [];

  for (const file of invoiceFiles) {
    const download = await downloadPfgFile(file.path);
    if (!download.success || !download.content) continue;

    const parsedInvoices = parsePfgInvoiceCSV(download.content);
    let totalMatched = 0;
    let totalUnmatched = 0;

    for (const inv of parsedInvoices) {
      const result = await importPfgInvoice(inv);
      totalMatched += result.matchedLines;
      totalUnmatched += result.unmatchedLines;
    }

    imported.push({
      fileName: file.name,
      invoiceCount: parsedInvoices.length,
      matchedLines: totalMatched,
      unmatchedLines: totalUnmatched,
    });
  }

  return {
    success: true,
    message: `Processed ${imported.length} file(s) with ${imported.reduce((s, i) => s + i.invoiceCount, 0)} invoice(s).`,
    imported,
  };
}
