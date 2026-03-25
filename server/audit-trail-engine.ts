import { db } from "./db";
import { firmTransactions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { listEmails, getEmailWithAttachmentInfo, getProfile, type EmailMessage, type AttachmentInfo } from "./gmail";

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
  searchedAccount: string;
}

export class AuditTrailAssessor {
  private ACCOUNTS = [
    "Singingdanielle@gmail.com",
    "Loudesantis24@gmail.com",
    "Bearscupbolton@gmail.com",
    "Bearscupsaratoga@gmail.com",
  ];

  private formatDate(date: Date): string {
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
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

  async getConnectedAccount(): Promise<string> {
    try {
      const profile = await getProfile();
      return profile.email;
    } catch {
      return "unknown";
    }
  }

  async performJarvisLookup(transactionId: number): Promise<{
    transactionId: number;
    searchedAccounts: string[];
    connectedAccount: string;
    pendingAccounts: string[];
    results: AuditSearchResult[];
  }> {
    const tx = await storage.getFirmTransaction(transactionId);
    if (!tx) throw new Error(`Transaction #${transactionId} not found`);

    const connectedAccount = await this.getConnectedAccount();

    const startDate = new Date(tx.date);
    startDate.setDate(startDate.getDate() - 3);
    const endDate = new Date(tx.date);
    endDate.setDate(endDate.getDate() + 4);

    const amountStr = Math.abs(Number(tx.amount)).toFixed(2);
    const vendorClean = tx.description
      .replace(/[*#]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const query = `(${amountStr} OR "${vendorClean}") after:${this.formatDate(startDate)} before:${this.formatDate(endDate)}`;

    const results: AuditSearchResult[] = [];

    try {
      const { messages } = await listEmails(query, 15);
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
            searchedAccount: connectedAccount,
          });
        } catch {}
      }
    } catch (e) {
      console.warn(`[AuditTrail] Search failed for TX #${transactionId} on ${connectedAccount}:`, e);
    }

    if (results.length === 0) {
      const broadVendor = vendorClean.split(" ").slice(0, 2).join(" ");
      const broadStart = new Date(tx.date);
      broadStart.setDate(broadStart.getDate() - 7);
      const broadEnd = new Date(tx.date);
      broadEnd.setDate(broadEnd.getDate() + 7);
      const broadQuery = `"${broadVendor}" after:${this.formatDate(broadStart)} before:${this.formatDate(broadEnd)}`;

      try {
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
              searchedAccount: connectedAccount,
            });
          } catch {}
        }
      } catch (e) {
        console.warn(`[AuditTrail] Broad search also failed for TX #${transactionId}:`, e);
      }
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const pendingAccounts = this.ACCOUNTS.filter(
      a => a.toLowerCase() !== connectedAccount.toLowerCase()
    );

    return {
      transactionId,
      searchedAccounts: [connectedAccount],
      connectedAccount,
      pendingAccounts,
      results,
    };
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
    connectedAccount: string;
    allAccounts: string[];
  }> {
    const all = await db.select({
      id: firmTransactions.id,
      isAuditVerified: firmTransactions.isAuditVerified,
    }).from(firmTransactions);

    const total = all.length;
    const verified = all.filter(t => t.isAuditVerified).length;
    const connectedAccount = await this.getConnectedAccount();

    return {
      total,
      verified,
      unverified: total - verified,
      verifiedPercent: total > 0 ? Math.round((verified / total) * 100) : 0,
      connectedAccount,
      allAccounts: this.ACCOUNTS,
    };
  }
}

export const auditTrailAssessor = new AuditTrailAssessor();
