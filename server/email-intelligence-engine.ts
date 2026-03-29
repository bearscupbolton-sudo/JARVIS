import { db } from "./db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  emailExtractions,
  vendorProfiles,
  firmTransactions,
  journalEntries,
  ledgerLines,
  chartOfAccounts,
  emailAuditIndex,
} from "@shared/schema";

const CAPEX_THRESHOLD = 2500;

const PREPAID_KEYWORDS = [
  "retainer", "annual fee", "annual subscription", "yearly",
  "12-month", "12 month", "annual service", "annual plan",
  "professional services agreement", "consulting agreement",
];

const PORTAL_URL_PATTERNS = [
  /https?:\/\/[^\s"'<>]+\/view[-_]?order/i,
  /https?:\/\/[^\s"'<>]+\/invoice/i,
  /https?:\/\/[^\s"'<>]+\/receipt/i,
  /https?:\/\/[^\s"'<>]+\/order[-_]?detail/i,
  /https?:\/\/[^\s"'<>]+\/download/i,
  /https?:\/\/[^\s"'<>]+\/pdf/i,
  /https?:\/\/[^\s"'<>]+\/statement/i,
];

interface StageResult {
  stage: number;
  success: boolean;
  data: Record<string, any>;
  notes: string;
}

interface ExtractionResult {
  vendorName: string | null;
  totalAmount: number | null;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  lineItems: any[] | null;
  confidence: number;
  stagesCompleted: number;
  stageResults: StageResult[];
  portalUrls: string[];
  suggestedCoaCode: string | null;
  suggestedCategory: string | null;
  actionTaken: string | null;
  requiresReview: boolean;
  anchoredTransactionId: number | null;
}

export async function runExtractionPipeline(
  messageId: string,
  subject: string,
  sender: string,
  dateReceived: string,
  body: string,
  attachments: { filename: string; mimeType: string; data?: Buffer }[],
  createdBy: string = "email-engine"
): Promise<ExtractionResult> {
  const existing = await db.select().from(emailExtractions)
    .where(eq(emailExtractions.messageId, messageId)).limit(1);
  if (existing.length > 0 && existing[0].status === "completed") {
    return {
      vendorName: existing[0].vendorName,
      totalAmount: existing[0].extractedAmount,
      invoiceDate: existing[0].extractedDate,
      invoiceNumber: existing[0].extractedInvoiceNumber,
      lineItems: existing[0].extractedLineItems ? JSON.parse(existing[0].extractedLineItems) : null,
      confidence: existing[0].confidence,
      stagesCompleted: existing[0].stageCompleted,
      stageResults: existing[0].stageResults ? JSON.parse(existing[0].stageResults) : [],
      portalUrls: [],
      suggestedCoaCode: existing[0].suggestedCoaCode,
      suggestedCategory: existing[0].suggestedCategory,
      actionTaken: existing[0].actionTaken,
      requiresReview: existing[0].requiresReview,
      anchoredTransactionId: existing[0].anchoredTransactionId,
    };
  }

  const stageResults: StageResult[] = [];
  let vendorName: string | null = extractVendorFromSender(sender, subject);
  let totalAmount: number | null = null;
  let invoiceDate: string | null = null;
  let invoiceNumber: string | null = null;
  let lineItems: any[] | null = null;
  let confidence = 0;
  let portalUrls: string[] = [];

  const pdfAttachments = attachments.filter(a =>
    a.mimeType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf")
  );
  const imageAttachments = attachments.filter(a =>
    a.mimeType.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp)$/i.test(a.filename || "")
  );

  if (pdfAttachments.length > 0 || imageAttachments.length > 0) {
    const stage1 = await runStage1VectorExtraction(pdfAttachments, imageAttachments, vendorName);
    stageResults.push(stage1);
    if (stage1.success) {
      totalAmount = stage1.data.totalAmount ?? totalAmount;
      invoiceDate = stage1.data.invoiceDate ?? invoiceDate;
      invoiceNumber = stage1.data.invoiceNumber ?? invoiceNumber;
      lineItems = stage1.data.lineItems ?? lineItems;
      vendorName = stage1.data.vendorName ?? vendorName;
      confidence = Math.max(confidence, stage1.data.confidence || 0.85);
    }
  }

  if (!totalAmount && body) {
    const stage2 = await runStage2SemanticHTMLParsing(body, subject, vendorName);
    stageResults.push(stage2);
    if (stage2.success) {
      totalAmount = stage2.data.totalAmount ?? totalAmount;
      invoiceDate = stage2.data.invoiceDate ?? invoiceDate;
      invoiceNumber = stage2.data.invoiceNumber ?? invoiceNumber;
      lineItems = stage2.data.lineItems ?? lineItems;
      vendorName = stage2.data.vendorName ?? vendorName;
      confidence = Math.max(confidence, stage2.data.confidence || 0.7);
    }
  }

  if (!totalAmount && body) {
    const stage3 = runStage3URLForensics(body);
    stageResults.push(stage3);
    portalUrls = stage3.data.urls || [];
  }

  if (portalUrls.length > 0 && !totalAmount) {
    stageResults.push({
      stage: 4,
      success: false,
      data: { urls: portalUrls },
      notes: "Headless extraction flagged — portal links found but automated scraping unavailable. Manual review recommended.",
    });
  }

  const crossRef = await runCrossReferenceEngine(vendorName, totalAmount, invoiceDate, dateReceived);
  let anchoredTransactionId = crossRef.transactionId;
  let suggestedCoaCode = crossRef.coaCode;
  let suggestedCategory = crossRef.category;
  if (crossRef.confidence > 0) {
    confidence = Math.max(confidence, crossRef.confidence);
  }

  const vendorProfile = await getOrCreateVendorProfile(vendorName, sender, totalAmount, suggestedCoaCode, suggestedCategory);

  if (vendorProfile && !suggestedCoaCode) {
    suggestedCoaCode = vendorProfile.defaultCoaCode;
    suggestedCategory = vendorProfile.defaultCategory;
  }

  let actionTaken: string | null = null;
  let requiresReview = false;

  if (totalAmount && totalAmount >= CAPEX_THRESHOLD && vendorProfile?.isCapExVendor) {
    actionTaken = `Flagged as potential CapEx ($${totalAmount.toFixed(2)} ≥ $${CAPEX_THRESHOLD}). Route to asset-engine for capitalization assessment.`;
    requiresReview = true;
  } else if (isPrepaidCandidate(subject, body, vendorName, vendorProfile)) {
    const months = vendorProfile?.prepaidMonths || 12;
    actionTaken = `Flagged for prepaid amortization — spread over ${months} months via prepaid-engine.`;
    requiresReview = true;
  } else if (confidence >= 0.85 && suggestedCoaCode && anchoredTransactionId) {
    actionTaken = `Auto-classified: COA ${suggestedCoaCode} (${suggestedCategory}). Anchored to txn #${anchoredTransactionId}.`;
  } else if (confidence >= 0.6 && suggestedCoaCode) {
    actionTaken = `Suggested: COA ${suggestedCoaCode} (${suggestedCategory}). Confidence ${(confidence * 100).toFixed(0)}% — review recommended.`;
    requiresReview = true;
  } else {
    actionTaken = "Insufficient data for classification. Manual review required.";
    requiresReview = true;
  }

  if (!portalUrls.length && !totalAmount && !lineItems) {
    actionTaken = "No financial data extracted from email. May be a confirmation or notification only.";
    requiresReview = false;
  }

  const stagesCompleted = stageResults.filter(s => s.success).length;

  if (existing.length > 0) {
    await db.update(emailExtractions).set({
      vendorName,
      extractedAmount: totalAmount,
      extractedDate: invoiceDate,
      extractedInvoiceNumber: invoiceNumber,
      extractedLineItems: lineItems ? JSON.stringify(lineItems) : null,
      stageCompleted: stagesCompleted,
      stageResults: JSON.stringify(stageResults),
      anchoredTransactionId: anchoredTransactionId,
      suggestedCoaCode,
      suggestedCategory,
      confidence,
      actionTaken,
      requiresReview,
      status: "completed",
    }).where(eq(emailExtractions.id, existing[0].id));
  } else {
    await db.insert(emailExtractions).values({
      messageId,
      subject,
      sender,
      dateReceived,
      vendorName,
      extractedAmount: totalAmount,
      extractedDate: invoiceDate,
      extractedInvoiceNumber: invoiceNumber,
      extractedLineItems: lineItems ? JSON.stringify(lineItems) : null,
      stageCompleted: stagesCompleted,
      stageResults: JSON.stringify(stageResults),
      anchoredTransactionId: anchoredTransactionId,
      suggestedCoaCode,
      suggestedCategory,
      confidence,
      actionTaken,
      requiresReview,
      status: "completed",
    });
  }

  return {
    vendorName,
    totalAmount,
    invoiceDate,
    invoiceNumber,
    lineItems,
    confidence,
    stagesCompleted,
    stageResults,
    portalUrls,
    suggestedCoaCode,
    suggestedCategory,
    actionTaken,
    requiresReview,
    anchoredTransactionId,
  };
}

async function runStage1VectorExtraction(
  pdfs: { filename: string; mimeType: string; data?: Buffer }[],
  images: { filename: string; mimeType: string; data?: Buffer }[],
  knownVendor: string | null
): Promise<StageResult> {
  try {
    let extractedText = "";

    for (const pdf of pdfs) {
      if (pdf.data) {
        try {
          const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
          const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf.data) }).promise;
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            extractedText += content.items.map((item: any) => item.str).join(" ") + "\n";
          }
        } catch (pdfErr: any) {
          console.error("[Stage1] PDF text extraction failed:", pdfErr.message);
        }
      }
    }

    if (!extractedText && images.length > 0) {
      const imageData = images[0].data;
      if (imageData) {
        try {
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI();
          const base64 = imageData.toString("base64");
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: "Extract all text from this invoice/receipt image. Return the raw text content.",
              },
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: `data:${images[0].mimeType};base64,${base64}` } },
                ],
              },
            ],
            max_tokens: 2000,
          });
          extractedText = response.choices[0]?.message?.content || "";
        } catch (ocrErr: any) {
          console.error("[Stage1] OCR/Vision failed:", ocrErr.message);
        }
      }
    }

    if (!extractedText.trim()) {
      return { stage: 1, success: false, data: {}, notes: "No text extracted from attachments" };
    }

    const parsed = await parseExtractedText(extractedText, knownVendor);
    return {
      stage: 1,
      success: parsed.totalAmount !== null,
      data: parsed,
      notes: `Extracted from ${pdfs.length} PDF(s), ${images.length} image(s). Text length: ${extractedText.length}`,
    };
  } catch (err: any) {
    return { stage: 1, success: false, data: {}, notes: `Stage 1 error: ${err.message}` };
  }
}

async function runStage2SemanticHTMLParsing(
  body: string,
  subject: string,
  knownVendor: string | null
): Promise<StageResult> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI();

    const cleanBody = body
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .substring(0, 8000);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert financial document parser for a bakery business (Bear's Cup Bakehouse).
Analyze this email body for financial data — look for "invisible tables" in HTML, order summaries, totals, line items, and invoice numbers.

Return JSON with these fields:
{
  "vendorName": string or null,
  "totalAmount": number or null (the final total/amount due),
  "invoiceDate": "YYYY-MM-DD" or null,
  "invoiceNumber": string or null,
  "lineItems": [{"description": string, "quantity": number, "unitPrice": number, "total": number}] or null,
  "confidence": number (0-1),
  "notes": string (what you found and how)
}

Important:
- Look for dollar amounts in headers, footers, and table structures even if they appear as plain text.
- "Amount Due", "Total", "Grand Total", "Invoice Total", "Order Total" are priority fields.
- If the email is just a notification (no financial data), set totalAmount to null.
- Date format must be YYYY-MM-DD.`,
        },
        {
          role: "user",
          content: `Subject: ${subject}\nKnown Vendor: ${knownVendor || "Unknown"}\n\nEmail Body:\n${cleanBody}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
    return {
      stage: 2,
      success: parsed.totalAmount !== null && parsed.totalAmount !== undefined,
      data: {
        vendorName: parsed.vendorName,
        totalAmount: parsed.totalAmount ? Number(parsed.totalAmount) : null,
        invoiceDate: parsed.invoiceDate,
        invoiceNumber: parsed.invoiceNumber,
        lineItems: parsed.lineItems,
        confidence: parsed.confidence || 0.7,
      },
      notes: parsed.notes || "Semantic HTML parsing completed",
    };
  } catch (err: any) {
    return { stage: 2, success: false, data: {}, notes: `Stage 2 error: ${err.message}` };
  }
}

function runStage3URLForensics(body: string): StageResult {
  const urls: string[] = [];
  const allUrls = body.match(/https?:\/\/[^\s"'<>]+/gi) || [];

  for (const url of allUrls) {
    for (const pattern of PORTAL_URL_PATTERNS) {
      if (pattern.test(url)) {
        urls.push(url);
        break;
      }
    }
  }

  return {
    stage: 3,
    success: urls.length > 0,
    data: { urls, totalFound: urls.length },
    notes: urls.length > 0
      ? `Found ${urls.length} portal URL(s) for potential headless extraction`
      : "No portal URLs found in email body",
  };
}

async function parseExtractedText(text: string, knownVendor: string | null): Promise<Record<string, any>> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI();

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Parse the following extracted invoice/receipt text into structured data for a bakery business.
Return JSON:
{
  "vendorName": string or null,
  "totalAmount": number or null,
  "invoiceDate": "YYYY-MM-DD" or null,
  "invoiceNumber": string or null,
  "lineItems": [{"description": string, "quantity": number, "unitPrice": number, "total": number}] or null,
  "confidence": number (0-1)
}
Focus on the final total, not subtotals or tax lines. Date format must be YYYY-MM-DD.`,
        },
        {
          role: "user",
          content: `Known Vendor: ${knownVendor || "Unknown"}\n\nExtracted Text:\n${text.substring(0, 6000)}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });

    return JSON.parse(response.choices[0]?.message?.content || "{}");
  } catch {
    return {};
  }
}

async function runCrossReferenceEngine(
  vendorName: string | null,
  amount: number | null,
  invoiceDate: string | null,
  dateReceived: string | null
): Promise<{ transactionId: number | null; coaCode: string | null; category: string | null; confidence: number }> {
  if (!amount) {
    return { transactionId: null, coaCode: null, category: null, confidence: 0 };
  }

  try {
    const searchDate = invoiceDate || dateReceived;
    if (!searchDate) return { transactionId: null, coaCode: null, category: null, confidence: 0 };

    const dateObj = new Date(searchDate);
    const startDate = new Date(dateObj);
    startDate.setDate(startDate.getDate() - 5);
    const endDate = new Date(dateObj);
    endDate.setDate(endDate.getDate() + 5);

    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    const candidates = await db.select()
      .from(firmTransactions)
      .where(
        and(
          gte(firmTransactions.date, startStr),
          lte(firmTransactions.date, endStr)
        )
      );

    const absAmount = Math.abs(amount);
    let bestMatch: typeof candidates[0] | null = null;
    let bestConfidence = 0;

    for (const txn of candidates) {
      const txnAbs = Math.abs(txn.amount);
      const amountDiff = Math.abs(txnAbs - absAmount);
      const pctDiff = absAmount > 0 ? amountDiff / absAmount : 1;

      let matchConfidence = 0;

      if (amountDiff < 0.05) {
        matchConfidence = 0.95;
      } else if (pctDiff < 0.02) {
        matchConfidence = 0.85;
      } else if (pctDiff < 0.10) {
        matchConfidence = 0.6;
      }

      if (vendorName && txn.description) {
        const vendorLower = vendorName.toLowerCase();
        const descLower = txn.description.toLowerCase();
        if (descLower.includes(vendorLower) || vendorLower.includes(descLower.split(" ")[0])) {
          matchConfidence += 0.15;
        }
      }

      if (matchConfidence > bestConfidence) {
        bestConfidence = matchConfidence;
        bestMatch = txn;
      }
    }

    if (bestMatch && bestConfidence >= 0.6) {
      let coaCode: string | null = null;
      let category = bestMatch.category;

      const je = await db.select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.referenceType, "firm-txn"),
            eq(journalEntries.referenceId, String(bestMatch.id))
          )
        ).limit(1);

      if (je.length > 0) {
        const lines = await db.select({
          code: chartOfAccounts.code,
        }).from(ledgerLines)
          .innerJoin(chartOfAccounts, eq(ledgerLines.accountId, chartOfAccounts.id))
          .where(
            and(
              eq(ledgerLines.entryId, je[0].id),
              sql`${ledgerLines.debit} > 0`,
              sql`${chartOfAccounts.code} != '1010'`
            )
          ).limit(1);

        if (lines.length > 0) {
          coaCode = lines[0].code;
        }
      }

      if (!coaCode) {
        const historicalMatch = await db.execute(sql`
          SELECT coa.code, COUNT(*) as cnt
          FROM journal_entries je
          JOIN ledger_lines ll ON ll.entry_id = je.id
          JOIN chart_of_accounts coa ON coa.id = ll.account_id
          WHERE je.description ILIKE ${`%${vendorName?.substring(0, 20) || ""}%`}
            AND ll.debit > 0
            AND coa.code != '1010'
          GROUP BY coa.code
          ORDER BY cnt DESC
          LIMIT 1
        `);
        if (historicalMatch.rows && historicalMatch.rows.length > 0) {
          coaCode = (historicalMatch.rows[0] as any).code;
        }
      }

      return {
        transactionId: bestMatch.id,
        coaCode,
        category,
        confidence: Math.min(bestConfidence, 1.0),
      };
    }
  } catch (err: any) {
    console.error("[CrossRef] Error:", err.message);
  }

  return { transactionId: null, coaCode: null, category: null, confidence: 0 };
}

function extractVendorFromSender(sender: string, subject: string): string | null {
  const emailMatch = sender.match(/<([^>]+)>/);
  const email = emailMatch ? emailMatch[1] : sender;
  const domain = email.split("@")[1]?.split(".")[0];

  const knownDomainMap: Record<string, string> = {
    chefswarehouse: "The Chefs' Warehouse",
    sysco: "Sysco",
    usfoods: "US Foods",
    bakemark: "BakeMark",
    amazon: "Amazon",
    noissue: "Noissue",
    harney: "Harney & Sons",
    noblegassolutions: "Noble Gas Solutions",
    quickbooks: "QuickBooks Vendor",
    intuit: "QuickBooks Vendor",
    square: "Square",
    adp: "ADP",
    gusto: "Gusto",
  };

  if (domain && knownDomainMap[domain.toLowerCase()]) {
    return knownDomainMap[domain.toLowerCase()];
  }

  if (domain && domain.length > 2) {
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  return null;
}

function isPrepaidCandidate(
  subject: string,
  body: string,
  vendorName: string | null,
  profile: any | null
): boolean {
  if (profile?.isPrepaidVendor) return true;

  const combined = `${subject} ${body}`.toLowerCase();
  return PREPAID_KEYWORDS.some(kw => combined.includes(kw));
}

async function getOrCreateVendorProfile(
  vendorName: string | null,
  sender: string,
  amount: number | null,
  coaCode: string | null,
  category: string | null
): Promise<any | null> {
  if (!vendorName) return null;

  try {
    const existing = await db.select().from(vendorProfiles)
      .where(eq(vendorProfiles.vendorName, vendorName)).limit(1);

    if (existing.length > 0) {
      const updates: any = {
        lastSeenDate: new Date().toISOString().split("T")[0],
        totalProcessed: (existing[0].totalProcessed || 0) + 1,
        updatedAt: new Date(),
      };

      if (amount) {
        if (!existing[0].typicalAmountMin || amount < existing[0].typicalAmountMin) {
          updates.typicalAmountMin = amount;
        }
        if (!existing[0].typicalAmountMax || amount > existing[0].typicalAmountMax) {
          updates.typicalAmountMax = amount;
        }
      }

      await db.update(vendorProfiles).set(updates).where(eq(vendorProfiles.id, existing[0].id));
      return existing[0];
    }

    const emailMatch = sender.match(/<([^>]+)>/);
    const email = emailMatch ? emailMatch[1] : sender;

    const [created] = await db.insert(vendorProfiles).values({
      vendorName,
      knownEmails: [email],
      defaultCoaCode: coaCode,
      defaultCategory: category,
      receiptDeliveryMethod: "email",
      typicalAmountMin: amount ? Math.abs(amount) : null,
      typicalAmountMax: amount ? Math.abs(amount) : null,
      lastSeenDate: new Date().toISOString().split("T")[0],
      totalProcessed: 1,
    }).returning();

    return created;
  } catch (err: any) {
    console.error("[VendorProfile] Error:", err.message);
    return null;
  }
}

export async function processEmailIntelligence(
  messageId: string,
  createdBy: string = "email-engine"
): Promise<ExtractionResult> {
  const { getEmailWithAttachmentInfo, downloadAttachment } = await import("./gmail");

  const email = await getEmailWithAttachmentInfo(messageId);

  const attachments: { filename: string; mimeType: string; data?: Buffer }[] = [];
  for (const att of email.attachments) {
    try {
      const data = await downloadAttachment(messageId, att.attachmentId);
      attachments.push({ filename: att.filename, mimeType: att.mimeType, data });
    } catch (err: any) {
      console.error(`[EmailIntel] Failed to download attachment ${att.filename}:`, err.message);
      attachments.push({ filename: att.filename, mimeType: att.mimeType });
    }
  }

  return runExtractionPipeline(
    messageId,
    email.subject,
    email.from,
    email.date,
    email.body || "",
    attachments,
    createdBy
  );
}

export async function scanAndProcessVendorEmails(
  daysBack: number = 3,
  createdBy: string = "email-engine"
): Promise<{ processed: number; results: ExtractionResult[] }> {
  const { scanGmailForInvoices } = await import("./gmail");
  const vendorScans = await scanGmailForInvoices(daysBack);

  const alreadyProcessed = await db.select({ messageId: emailExtractions.messageId })
    .from(emailExtractions)
    .where(eq(emailExtractions.status, "completed"));
  const processedSet = new Set(alreadyProcessed.map(e => e.messageId));

  const results: ExtractionResult[] = [];
  let processed = 0;

  for (const vendorScan of vendorScans) {
    for (const email of vendorScan.emails) {
      if (processedSet.has(email.id)) continue;

      try {
        console.log(`[EmailIntel] Processing: ${vendorScan.vendor} — "${email.subject}"`);
        const result = await processEmailIntelligence(email.id, createdBy);
        results.push(result);
        processed++;

        if (processed >= 20) break;
      } catch (err: any) {
        console.error(`[EmailIntel] Failed to process ${email.id}:`, err.message);
      }
    }
    if (processed >= 20) break;
  }

  console.log(`[EmailIntel] Scan complete: ${processed} emails processed`);
  return { processed, results };
}

export async function getExtractionSummary(): Promise<{
  total: number;
  completed: number;
  requiresReview: number;
  byVendor: Record<string, number>;
  recentExtractions: any[];
}> {
  const all = await db.select().from(emailExtractions).orderBy(sql`${emailExtractions.createdAt} DESC`);

  const byVendor: Record<string, number> = {};
  let requiresReview = 0;
  for (const e of all) {
    if (e.vendorName) {
      byVendor[e.vendorName] = (byVendor[e.vendorName] || 0) + 1;
    }
    if (e.requiresReview) requiresReview++;
  }

  return {
    total: all.length,
    completed: all.filter(e => e.status === "completed").length,
    requiresReview,
    byVendor,
    recentExtractions: all.slice(0, 20),
  };
}
