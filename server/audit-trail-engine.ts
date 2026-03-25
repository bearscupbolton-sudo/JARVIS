import { db } from "./db";
import { firmTransactions, emailAuditIndex } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { searchAcrossAccounts, getConnectedAccounts, type MultiAccountSearchResult } from "./gmail-multi";

export interface AuditSearchResult extends MultiAccountSearchResult {
  cached?: boolean;
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

  private scoreResult(tx: { amount: number; description: string }, result: MultiAccountSearchResult): number {
    let score = 0;
    const absAmount = Math.abs(tx.amount).toFixed(2);
    const content = `${result.subject} ${result.snippet}`.toLowerCase();
    const descWords = tx.description.toLowerCase().replace(/[*#]/g, "").split(/\s+/);

    if (content.includes(absAmount)) score += 40;
    if (content.includes("$" + absAmount)) score += 10;

    const matchedWords = descWords.filter(w => w.length > 2 && content.includes(w));
    score += Math.min(matchedWords.length * 10, 30);

    if (result.hasAttachment) score += 15;
    const hasPdf = result.attachmentNames.some(n => n.toLowerCase().endsWith(".pdf"));
    if (hasPdf) score += 5;

    return Math.min(score, 100);
  }

  async performJarvisLookup(transactionId: number): Promise<{
    transactionId: number;
    searchedAccounts: string[];
    failedAccounts: string[];
    pendingAccounts: string[];
    results: AuditSearchResult[];
  }> {
    const tx = await storage.getFirmTransaction(transactionId);
    if (!tx) throw new Error(`Transaction #${transactionId} not found`);

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

    const { results: rawResults, searchedAccounts, failedAccounts } = await searchAcrossAccounts(query, 15);

    let results: AuditSearchResult[] = rawResults.map(r => ({
      ...r,
      relevanceScore: this.scoreResult(tx, r),
    }));

    if (results.length === 0) {
      const broadVendor = vendorClean.split(" ").slice(0, 2).join(" ");
      const broadStart = new Date(tx.date);
      broadStart.setDate(broadStart.getDate() - 7);
      const broadEnd = new Date(tx.date);
      broadEnd.setDate(broadEnd.getDate() + 7);
      const broadQuery = `"${broadVendor}" after:${this.formatDate(broadStart)} before:${this.formatDate(broadEnd)}`;

      const { results: broadRaw } = await searchAcrossAccounts(broadQuery, 10);
      results = broadRaw.map(r => ({
        ...r,
        relevanceScore: this.scoreResult(tx, r),
      }));
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    for (const r of results) {
      try {
        const existing = await db.select().from(emailAuditIndex)
          .where(eq(emailAuditIndex.messageId, r.messageId));
        if (existing.length === 0) {
          await db.insert(emailAuditIndex).values({
            messageId: r.messageId,
            accountOwner: r.accountOwner,
            subject: r.subject,
            sender: r.from,
            snippet: r.snippet,
            detectedAmount: parseFloat(amountStr) || null,
            dateReceived: r.date,
            hasAttachments: r.hasAttachment,
            attachmentNames: r.attachmentNames.length > 0 ? r.attachmentNames : null,
            transactionId: null,
          });
        }
      } catch {}
    }

    const connectedAccounts = await getConnectedAccounts();
    const connectedEmails = connectedAccounts.map(a => a.email.toLowerCase());
    const pendingAccounts = this.ACCOUNTS.filter(
      a => !connectedEmails.includes(a.toLowerCase())
    );

    return {
      transactionId,
      searchedAccounts,
      failedAccounts,
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

    await db.update(emailAuditIndex)
      .set({ transactionId })
      .where(eq(emailAuditIndex.messageId, messageId));

    console.log(`[AuditTrail] Evidence linked for TX #${transactionId} → Gmail ${messageId}`);
    return { success: true, auditTrailLink: gmailLink };
  }

  async unlinkEvidence(transactionId: number): Promise<void> {
    const tx = await storage.getFirmTransaction(transactionId);
    if (tx?.auditTrailGmailId) {
      await db.update(emailAuditIndex)
        .set({ transactionId: null })
        .where(eq(emailAuditIndex.messageId, tx.auditTrailGmailId));
    }

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
    connectedAccounts: { email: string; isActive: boolean; lastSyncedAt: Date | null }[];
    pendingAccounts: string[];
    indexedEmails: number;
  }> {
    const all = await db.select({
      id: firmTransactions.id,
      isAuditVerified: firmTransactions.isAuditVerified,
    }).from(firmTransactions);

    const total = all.length;
    const verified = all.filter(t => t.isAuditVerified).length;

    const connectedAccounts = await getConnectedAccounts();
    const connectedEmails = connectedAccounts.map(a => a.email.toLowerCase());
    const pendingAccounts = this.ACCOUNTS.filter(
      a => !connectedEmails.includes(a.toLowerCase())
    );

    const indexed = await db.select({ id: emailAuditIndex.id }).from(emailAuditIndex);

    return {
      total,
      verified,
      unverified: total - verified,
      verifiedPercent: total > 0 ? Math.round((verified / total) * 100) : 0,
      connectedAccounts,
      pendingAccounts,
      indexedEmails: indexed.length,
    };
  }
}

export const auditTrailAssessor = new AuditTrailAssessor();
