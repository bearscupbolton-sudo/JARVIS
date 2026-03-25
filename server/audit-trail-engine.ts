import { db } from "./db";
import { firmTransactions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { listEmails, getEmailWithAttachmentInfo, downloadAttachment, type EmailMessage, type AttachmentInfo } from "./gmail";

export interface AuditSearchResult {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  hasAttachment: boolean;
  attachments: AttachmentInfo[];
  relevanceScore: number;
}

export class AuditTrailAssessor {
  private formatDateOffset(dateStr: string, offsetDays: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  }

  private buildSearchQuery(tx: { amount: number; description: string; date: string }): string {
    const absAmount = Math.abs(tx.amount).toFixed(2);
    const vendor = tx.description
      .replace(/[*#]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 3)
      .join(" ");

    const after = this.formatDateOffset(tx.date, -5);
    const before = this.formatDateOffset(tx.date, 5);

    return `{${absAmount} "${vendor}"} after:${after} before:${before}`;
  }

  private buildBroadSearchQuery(tx: { amount: number; description: string; date: string }): string {
    const vendor = tx.description
      .replace(/[*#]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 2)
      .join(" ");

    const after = this.formatDateOffset(tx.date, -7);
    const before = this.formatDateOffset(tx.date, 7);

    return `"${vendor}" after:${after} before:${before}`;
  }

  private scoreResult(tx: { amount: number; description: string }, msg: EmailMessage & { attachments: AttachmentInfo[] }): number {
    let score = 0;
    const absAmount = Math.abs(tx.amount).toFixed(2);
    const content = `${msg.subject} ${msg.snippet}`.toLowerCase();
    const descWords = tx.description.toLowerCase().replace(/[*#]/g, "").split(/\s+/);

    if (content.includes(absAmount)) score += 40;
    if (content.includes("$" + absAmount)) score += 10;

    const matchedWords = descWords.filter(w => w.length > 2 && content.includes(w));
    score += Math.min(matchedWords.length * 10, 30);

    if (msg.attachments.length > 0) score += 15;
    const hasPdf = msg.attachments.some(a => a.mimeType === "application/pdf" || a.filename.endsWith(".pdf"));
    if (hasPdf) score += 5;

    return Math.min(score, 100);
  }

  async performLookup(transactionId: number): Promise<AuditSearchResult[]> {
    const tx = await storage.getFirmTransaction(transactionId);
    if (!tx) throw new Error(`Transaction #${transactionId} not found`);

    const narrowQuery = this.buildSearchQuery(tx);
    let results: AuditSearchResult[] = [];

    try {
      const { messages } = await listEmails(narrowQuery, 10);
      for (const msg of messages) {
        try {
          const full = await getEmailWithAttachmentInfo(msg.id);
          const score = this.scoreResult(tx, full);
          results.push({
            messageId: full.id,
            threadId: full.threadId,
            subject: full.subject,
            from: full.from,
            date: full.date,
            snippet: full.snippet,
            hasAttachment: full.attachments.length > 0,
            attachments: full.attachments,
            relevanceScore: score,
          });
        } catch {}
      }
    } catch (e) {
      console.warn(`[AuditTrail] Narrow search failed for TX #${transactionId}:`, e);
    }

    if (results.length === 0) {
      try {
        const broadQuery = this.buildBroadSearchQuery(tx);
        const { messages } = await listEmails(broadQuery, 10);
        for (const msg of messages) {
          try {
            const full = await getEmailWithAttachmentInfo(msg.id);
            const score = this.scoreResult(tx, full);
            results.push({
              messageId: full.id,
              threadId: full.threadId,
              subject: full.subject,
              from: full.from,
              date: full.date,
              snippet: full.snippet,
              hasAttachment: full.attachments.length > 0,
              attachments: full.attachments,
              relevanceScore: score,
            });
          } catch {}
        }
      } catch (e) {
        console.warn(`[AuditTrail] Broad search also failed for TX #${transactionId}:`, e);
      }
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results;
  }

  async linkEvidence(transactionId: number, messageId: string): Promise<{ success: boolean; auditTrailLink: string }> {
    const tx = await storage.getFirmTransaction(transactionId);
    if (!tx) throw new Error(`Transaction #${transactionId} not found`);

    const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

    await db.update(firmTransactions)
      .set({
        auditTrailLink: gmailLink,
        auditTrailGmailId: messageId,
        isAuditVerified: true,
      })
      .where(eq(firmTransactions.id, transactionId));

    console.log(`[AuditTrail] Evidence linked for TX #${transactionId} → Gmail ${messageId}`);
    return { success: true, auditTrailLink: gmailLink };
  }

  async unlinkEvidence(transactionId: number): Promise<void> {
    await db.update(firmTransactions)
      .set({
        auditTrailLink: null,
        auditTrailGmailId: null,
        isAuditVerified: false,
      })
      .where(eq(firmTransactions.id, transactionId));
    console.log(`[AuditTrail] Evidence unlinked for TX #${transactionId}`);
  }

  async getVerificationStats(): Promise<{
    total: number;
    verified: number;
    unverified: number;
    verifiedPercent: number;
  }> {
    const all = await db.select({
      id: firmTransactions.id,
      isAuditVerified: firmTransactions.isAuditVerified,
    }).from(firmTransactions);

    const total = all.length;
    const verified = all.filter(t => t.isAuditVerified).length;

    return {
      total,
      verified,
      unverified: total - verified,
      verifiedPercent: total > 0 ? Math.round((verified / total) * 100) : 0,
    };
  }
}

export const auditTrailAssessor = new AuditTrailAssessor();
