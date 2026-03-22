import SftpClient from "ssh2-sftp-client";
import { db } from "./db";
import { invoices, invoiceLines, inventoryItems } from "@shared/schema";
import { eq } from "drizzle-orm";

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

async function withSftp<T>(fn: (sftp: SftpClient) => Promise<T>): Promise<T> {
  const sftp = getSftp();
  try {
    await sftp.connect({
      host: PFG_CONFIG.host,
      port: PFG_CONFIG.port,
      username: PFG_CONFIG.username,
      password: PFG_CONFIG.password,
      readyTimeout: 15000,
    });
    const result = await fn(sftp);
    await sftp.end();
    return result;
  } catch (err) {
    try { await sftp.end(); } catch {}
    throw err;
  }
}

export async function testPfgConnection(): Promise<{ success: boolean; message: string; outFiles?: any[]; inFiles?: any[] }> {
  try {
    return await withSftp(async (sftp) => {
      let outFiles: any[] = [];
      let inFiles: any[] = [];
      try {
        const out = await sftp.list("/OUT");
        outFiles = out.filter(f => f.type !== "d").map(f => ({
          name: f.name, size: f.size, modifyTime: f.modifyTime,
        }));
      } catch {}
      try {
        const inp = await sftp.list("/IN");
        inFiles = inp.filter(f => f.type !== "d").map(f => ({
          name: f.name, size: f.size, modifyTime: f.modifyTime,
        }));
      } catch {}
      return {
        success: true,
        message: `Connected. /OUT: ${outFiles.length} file(s), /IN: ${inFiles.length} file(s).`,
        outFiles,
        inFiles,
      };
    });
  } catch (err: any) {
    return { success: false, message: `Connection failed: ${err.message}` };
  }
}

export async function listPfgFiles(folder: string = "/OUT"): Promise<{ success: boolean; files: any[]; message?: string }> {
  try {
    return await withSftp(async (sftp) => {
      const rawFiles = await sftp.list(folder);
      const files = rawFiles
        .filter(f => f.type !== "d")
        .map(f => ({
          name: f.name, size: f.size, modifyTime: f.modifyTime,
          path: `${folder}/${f.name}`,
        }));
      return { success: true, files };
    });
  } catch (err: any) {
    return { success: false, files: [], message: err.message };
  }
}

export async function downloadPfgFile(remotePath: string): Promise<{ success: boolean; content?: string; message?: string }> {
  try {
    return await withSftp(async (sftp) => {
      const buffer = await sftp.get(remotePath);
      const content = typeof buffer === "string" ? buffer : (buffer as Buffer).toString("utf-8");
      return { success: true, content };
    });
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

// ─── PFG Invoice Parser (H/D/F record format) ───

export interface PfgInvoiceHeader {
  opcoId: string;
  customerNumber: string;
  poNumber: string;
  invoiceOrCredit: string;
  invoiceNumber: string;
  invoiceDate: string;
  extendedSales: number;
  tax: number;
  dropCharges: number;
  miscFees: number;
  bottleDeposit: number;
  allowances: number;
  totalAmount: number;
  storeNumber: string;
  franchiseNumber: string;
}

export interface PfgInvoiceDetail {
  itemNumber: string;
  description: string;
  pack: number;
  size: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  extendedPrice: number;
  estimatedTax: number;
  miscFees: number;
  bottleDeposit: number;
}

export interface PfgInvoiceParsed {
  header: PfgInvoiceHeader;
  details: PfgInvoiceDetail[];
  recordCount: number;
}

function parseNum(val: string): number {
  return parseFloat(val?.trim() || "0") || 0;
}

export function parsePfgInvoiceFile(content: string): PfgInvoiceParsed[] {
  const lines = content.split("\n").filter(l => l.trim());
  const result: PfgInvoiceParsed[] = [];
  let current: PfgInvoiceParsed | null = null;

  for (const line of lines) {
    const cols = parseCSVLine(line);
    const recordType = cols[0]?.trim().toUpperCase();

    if (recordType === "H") {
      if (current) result.push(current);
      current = {
        header: {
          opcoId: cols[1] || "",
          customerNumber: cols[2] || "",
          poNumber: cols[3] || "",
          invoiceOrCredit: cols[4] || "I",
          invoiceNumber: cols[5] || "",
          invoiceDate: formatPfgDate(cols[6] || ""),
          extendedSales: parseNum(cols[7]),
          tax: parseNum(cols[8]),
          dropCharges: parseNum(cols[9]),
          miscFees: parseNum(cols[10]),
          bottleDeposit: parseNum(cols[11]),
          allowances: parseNum(cols[12]),
          totalAmount: parseNum(cols[13]),
          storeNumber: cols[14] || "",
          franchiseNumber: cols[15] || "",
        },
        details: [],
        recordCount: 0,
      };
    } else if (recordType === "D" && current) {
      current.details.push({
        itemNumber: cols[1]?.trim() || "",
        description: cols[2]?.trim() || "",
        pack: parseInt(cols[3] || "0") || 0,
        size: cols[4]?.trim() || "",
        quantity: parseNum(cols[5]),
        uom: cols[6]?.trim() || "CS",
        unitPrice: parseNum(cols[7]),
        extendedPrice: parseNum(cols[8]),
        estimatedTax: parseNum(cols[9]),
        miscFees: parseNum(cols[10]),
        bottleDeposit: parseNum(cols[11]),
      });
    } else if (recordType === "F" && current) {
      current.recordCount = parseInt(cols[1] || "0") || 0;
    }
  }
  if (current) result.push(current);
  return result;
}

// ─── PFG Order Guide Parser ───

export interface PfgOrderGuideItem {
  opcoId: string;
  customerNumber: string;
  bidNumber: string;
  itemNumber: string;
  casePrice: number;
  poundPrice: number;
  sellUom: string;
  priceUom: string;
  customerItemNumber: string;
  description: string;
  packCount: number;
  size: string;
  allowBrokenCase: boolean;
  catchWeight: boolean;
  caseWeight: number;
  randomWeight: boolean;
  classCode: string;
  classDescription: string;
  priceBookCode: string;
  priceBookDescription: string;
  additionalDescription: string;
  brandName: string;
  upcCode: string;
  vendorName: string;
  parentItemNumber: string;
}

export function parsePfgOrderGuide(content: string): PfgOrderGuideItem[] {
  const lines = content.split("\n").filter(l => l.trim());
  if (lines.length < 1) return [];

  return lines.map(line => {
    const cols = parseCSVLine(line);
    return {
      opcoId: cols[0]?.trim() || "",
      customerNumber: cols[1]?.trim() || "",
      bidNumber: cols[2]?.trim() || "",
      itemNumber: cols[3]?.trim() || "",
      casePrice: parseNum(cols[4]),
      poundPrice: parseNum(cols[6]),
      sellUom: cols[7]?.trim() || "CS",
      priceUom: cols[8]?.trim() || "CS",
      customerItemNumber: cols[9]?.trim() || "",
      description: cols[11]?.trim() || "",
      packCount: parseInt(cols[12] || "0") || 0,
      size: cols[13]?.trim() || "",
      allowBrokenCase: cols[14]?.trim().toUpperCase() === "Y",
      catchWeight: cols[15]?.trim().toUpperCase() === "Y",
      caseWeight: parseNum(cols[16]),
      randomWeight: cols[17]?.trim().toUpperCase() === "Y",
      classCode: cols[18]?.trim() || "",
      classDescription: cols[19]?.trim() || "",
      priceBookCode: cols[20]?.trim() || "",
      priceBookDescription: cols[21]?.trim() || "",
      additionalDescription: cols[22]?.trim() || "",
      brandName: cols[23]?.trim() || "",
      upcCode: cols[24]?.trim() || "",
      vendorName: cols[26]?.trim() || "",
      parentItemNumber: cols[27]?.trim() || "",
    };
  }).filter(i => i.itemNumber);
}

// ─── PFG Acknowledgement Parser ───

export interface PfgAckHeader {
  opcoId: string;
  ackNumber: string;
  ackDate: string;
  customerNumber: string;
  storeNumber: string;
  poNumber: string;
  poReceivedDate: string;
  ackType: string;
  user: string;
}

export interface PfgAckDetail {
  poLineNumber: number;
  itemNumber: string;
  description: string;
  quantityToShip: number;
  uom: string;
  unitPrice: number;
  extendedPrice: number;
  deliveryDate: string;
  lineStatusCode: string;
  lineStatusDescription: string;
  pack: number;
  size: string;
  originalItem: string;
  quantityOrdered: number;
  note: string;
}

export interface PfgAcknowledgement {
  header: PfgAckHeader;
  details: PfgAckDetail[];
}

export function parsePfgAcknowledgement(content: string): PfgAcknowledgement[] {
  const lines = content.split("\n").filter(l => l.trim());
  const result: PfgAcknowledgement[] = [];
  let current: PfgAcknowledgement | null = null;

  for (const line of lines) {
    const cols = parseCSVLine(line);
    const recordType = cols[0]?.trim().toUpperCase();

    if (recordType === "H") {
      if (current) result.push(current);
      current = {
        header: {
          opcoId: cols[1]?.trim() || "",
          ackNumber: cols[2]?.trim() || "",
          ackDate: formatPfgDate(cols[3] || ""),
          customerNumber: cols[4]?.trim() || "",
          storeNumber: cols[5]?.trim() || "",
          poNumber: cols[6]?.trim() || "",
          poReceivedDate: formatPfgDate(cols[7] || ""),
          ackType: cols[8]?.trim() || "A",
          user: cols[9]?.trim() || "",
        },
        details: [],
      };
    } else if (recordType === "D" && current) {
      current.details.push({
        poLineNumber: parseInt(cols[1] || "0") || 0,
        itemNumber: cols[2]?.trim() || "",
        description: cols[3]?.trim() || "",
        quantityToShip: parseNum(cols[4]),
        uom: cols[5]?.trim() || "CS",
        unitPrice: parseNum(cols[6]),
        extendedPrice: parseNum(cols[7]),
        deliveryDate: formatPfgDate(cols[8] || ""),
        lineStatusCode: cols[9]?.trim() || "",
        lineStatusDescription: cols[10]?.trim() || "",
        pack: parseInt(cols[11] || "0") || 0,
        size: cols[12]?.trim() || "",
        originalItem: cols[13]?.trim() || "",
        quantityOrdered: parseNum(cols[14]),
        note: cols[15]?.trim() || "",
      });
    }
  }
  if (current) result.push(current);
  return result;
}

// ─── PFG Order File Generator (push to /IN) ───

export interface PfgOrderLine {
  pfgItemNumber: string;
  caseQuantity: number;
  specialMessage?: string;
}

export interface PfgOrder {
  customerNumber: string;
  poNumber: string;
  deliveryDate?: string;
  specialInstructions?: string;
  lines: PfgOrderLine[];
}

function sanitizeCsvField(val: string, maxLen?: number): string {
  let clean = val.replace(/[\r\n]/g, " ").replace(/,/g, " ").replace(/"/g, "'");
  if (maxLen) clean = clean.slice(0, maxLen);
  return clean.trim();
}

export function generatePfgOrderFile(order: PfgOrder): string {
  const deliveryDate = (order.deliveryDate || "").replace(/\D/g, "").slice(0, 8);
  const instructions = sanitizeCsvField(order.specialInstructions || "", 50);
  const poNum = sanitizeCsvField(order.poNumber, 15);

  let content = `H,${order.customerNumber},${poNum},${deliveryDate},${instructions}\n`;

  for (const line of order.lines) {
    const itemNum = line.pfgItemNumber.replace(/\D/g, "").slice(0, 10);
    const qty = Math.max(0, Math.floor(line.caseQuantity)).toString().slice(0, 5);
    const msg = sanitizeCsvField(line.specialMessage || "", 25);
    content += `D,${itemNum},${qty},${msg}\n`;
  }

  return content;
}

export function generatePfgOrderFileName(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
  return `PFSOR${PFG_CONFIG.opco}_${date}_${time}_BCB.TXT`;
}

export function getPfgCustomerNumber(): string {
  return process.env.PFG_CUSTOMER_NUMBER || "";
}

export async function pushPfgOrder(order: PfgOrder): Promise<{ success: boolean; message: string; fileName?: string }> {
  try {
    if (!order.customerNumber) {
      order.customerNumber = getPfgCustomerNumber();
    }
    if (!order.customerNumber) {
      return { success: false, message: "PFG customer number not configured. Set PFG_CUSTOMER_NUMBER env var." };
    }
    const content = generatePfgOrderFile(order);
    const fileName = generatePfgOrderFileName();
    const remotePath = `/IN/${fileName}`;

    await withSftp(async (sftp) => {
      await sftp.put(Buffer.from(content, "utf-8"), remotePath);
    });

    return { success: true, message: `Order pushed as ${fileName}`, fileName };
  } catch (err: any) {
    return { success: false, message: `Failed to push order: ${err.message}` };
  }
}

// ─── Invoice Import to DB ───

export async function importPfgInvoice(inv: PfgInvoiceParsed): Promise<{ invoiceId: number; matchedLines: number; unmatchedLines: number; skipped?: boolean }> {
  const existing = await db.select({ id: invoices.id }).from(invoices)
    .where(eq(invoices.invoiceNumber, inv.header.invoiceNumber))
    .limit(1);
  if (existing.length > 0) {
    return { invoiceId: existing[0].id, matchedLines: 0, unmatchedLines: 0, skipped: true };
  }

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

  const isCredit = inv.header.invoiceOrCredit === "C";
  const [inserted] = await db.insert(invoices).values({
    vendorName: "Performance Food Group",
    invoiceDate: inv.header.invoiceDate,
    invoiceNumber: inv.header.invoiceNumber,
    invoiceTotal: inv.header.totalAmount,
    notes: `PFG ${isCredit ? "Credit" : "Invoice"} #${inv.header.invoiceNumber} · PO: ${inv.header.poNumber} · Auto-imported ${new Date().toLocaleDateString()}`,
  }).returning();

  let matchedLines = 0;
  let unmatchedLines = 0;

  for (const line of inv.details) {
    const matched = nameMap.get(line.description.toLowerCase()) ||
                    nameMap.get(line.itemNumber.toLowerCase());
    const inventoryItemId = matched?.id || null;

    await db.insert(invoiceLines).values({
      invoiceId: inserted.id,
      itemDescription: `${line.description} (${line.pack}/${line.size})`,
      quantity: line.quantity,
      unit: line.uom,
      unitPrice: line.unitPrice,
      lineTotal: line.extendedPrice || (line.quantity * line.unitPrice),
      inventoryItemId,
    });

    if (inventoryItemId && line.unitPrice > 0) {
      await db.update(inventoryItems)
        .set({ costPerUnit: line.unitPrice, lastUpdatedCost: new Date() })
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
    f.name.toUpperCase().includes("INV") ||
    f.name.toUpperCase().startsWith("PFGINV")
  );

  if (invoiceFiles.length === 0) {
    return { success: true, message: "No invoice files found in /OUT", imported: [] };
  }

  const imported: { fileName: string; invoiceCount: number; matchedLines: number; unmatchedLines: number; skippedDupes: number }[] = [];

  for (const file of invoiceFiles) {
    const download = await downloadPfgFile(file.path);
    if (!download.success || !download.content) continue;

    const parsedInvoices = parsePfgInvoiceFile(download.content);
    let totalMatched = 0;
    let totalUnmatched = 0;
    let skippedDupes = 0;

    for (const inv of parsedInvoices) {
      const result = await importPfgInvoice(inv);
      if (result.skipped) {
        skippedDupes++;
      } else {
        totalMatched += result.matchedLines;
        totalUnmatched += result.unmatchedLines;
      }
    }

    imported.push({
      fileName: file.name,
      invoiceCount: parsedInvoices.length,
      matchedLines: totalMatched,
      unmatchedLines: totalUnmatched,
      skippedDupes,
    });
  }

  return {
    success: true,
    message: `Processed ${imported.length} file(s) with ${imported.reduce((s, i) => s + i.invoiceCount, 0)} invoice(s).`,
    imported,
  };
}

export async function pullPfgOrderGuide(): Promise<{ success: boolean; message: string; items: PfgOrderGuideItem[] }> {
  const fileList = await listPfgFiles("/OUT");
  if (!fileList.success) return { success: false, message: fileList.message || "Failed", items: [] };

  const ogFiles = fileList.files.filter(f =>
    f.name.toUpperCase().includes("OG") ||
    f.name.toUpperCase().includes("ORDER_GUIDE") ||
    f.name.toUpperCase().startsWith("PFSOG")
  );

  if (ogFiles.length === 0) return { success: true, message: "No order guide files found", items: [] };

  const latest = ogFiles.sort((a: any, b: any) => (b.modifyTime || 0) - (a.modifyTime || 0))[0];
  const download = await downloadPfgFile(latest.path);
  if (!download.success || !download.content) return { success: false, message: "Failed to download", items: [] };

  const items = parsePfgOrderGuide(download.content);
  return { success: true, message: `Parsed ${items.length} items from ${latest.name}`, items };
}

export async function pullPfgAcknowledgements(): Promise<{ success: boolean; message: string; acknowledgements: PfgAcknowledgement[] }> {
  const fileList = await listPfgFiles("/OUT");
  if (!fileList.success) return { success: false, message: fileList.message || "Failed", acknowledgements: [] };

  const ackFiles = fileList.files.filter(f =>
    f.name.toUpperCase().includes("AK") ||
    f.name.toUpperCase().startsWith("PFSAK")
  );

  if (ackFiles.length === 0) return { success: true, message: "No acknowledgement files found", acknowledgements: [] };

  const allAcks: PfgAcknowledgement[] = [];
  for (const file of ackFiles) {
    const download = await downloadPfgFile(file.path);
    if (download.success && download.content) {
      allAcks.push(...parsePfgAcknowledgement(download.content));
    }
  }

  return { success: true, message: `Found ${allAcks.length} acknowledgement(s)`, acknowledgements: allAcks };
}

// ─── Helpers ───

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

function formatPfgDate(raw: string): string {
  const d = raw.trim();
  if (d.length === 8) {
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  return d;
}
