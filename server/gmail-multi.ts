import { google } from "googleapis";
import { db } from "./db";
import { gmailCredentials } from "@shared/schema";
import { eq } from "drizzle-orm";

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required");
  }
  return new google.auth.OAuth2(clientId, clientSecret);
}

export function getAuthUrl(redirectUri: string, state?: string): string {
  const oauth2 = getOAuth2Client();
  oauth2.redirectUri_ = redirectUri;
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    state: state || "",
    redirect_uri: redirectUri,
  });
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{ email: string; refreshToken: string }> {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken({ code, redirect_uri: redirectUri });

  if (!tokens.refresh_token) {
    throw new Error("No refresh token received — make sure to revoke access and re-authorize");
  }

  oauth2.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress || "";

  const existing = await db.select().from(gmailCredentials).where(eq(gmailCredentials.email, email));

  if (existing.length > 0) {
    await db.update(gmailCredentials)
      .set({
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token || null,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope || null,
        isActive: true,
      })
      .where(eq(gmailCredentials.email, email));
  } else {
    await db.insert(gmailCredentials).values({
      email,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token || null,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scope: tokens.scope || null,
      isActive: true,
    });
  }

  console.log(`[GmailMulti] Authorized account: ${email}`);
  return { email, refreshToken: tokens.refresh_token };
}

async function getGmailClientForAccount(email: string) {
  const [cred] = await db.select().from(gmailCredentials)
    .where(eq(gmailCredentials.email, email));

  if (!cred) throw new Error(`No credentials stored for ${email}`);
  if (!cred.isActive) throw new Error(`Account ${email} is deactivated`);

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    refresh_token: cred.refreshToken,
    access_token: cred.accessToken || undefined,
    expiry_date: cred.expiryDate ? cred.expiryDate.getTime() : undefined,
  });

  oauth2.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db.update(gmailCredentials)
        .set({
          accessToken: tokens.access_token,
          expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        })
        .where(eq(gmailCredentials.email, email));
    }
  });

  return google.gmail({ version: "v1", auth: oauth2 });
}

function getHeader(headers: any[], name: string): string {
  const h = headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function findAttachments(payload: any): { filename: string; mimeType: string; attachmentId: string; size: number }[] {
  const attachments: any[] = [];
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || "application/octet-stream",
          size: part.body.size || 0,
        });
      }
      if (part.parts) attachments.push(...findAttachments(part));
    }
  }
  return attachments;
}

export interface MultiAccountSearchResult {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  hasAttachment: boolean;
  attachmentNames: string[];
  accountOwner: string;
  relevanceScore: number;
}

export async function searchAccount(email: string, query: string, maxResults: number = 15): Promise<MultiAccountSearchResult[]> {
  const gmail = await getGmailClientForAccount(email);
  const listRes = await gmail.users.messages.list({ userId: "me", q: query, maxResults });
  const messageIds = listRes.data.messages || [];

  const results: MultiAccountSearchResult[] = [];
  for (const msg of messageIds) {
    try {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });
      const headers = detail.data.payload?.headers || [];
      const attachments = findAttachments(detail.data.payload);

      results.push({
        messageId: detail.data.id || "",
        threadId: detail.data.threadId || "",
        subject: getHeader(headers, "Subject"),
        from: getHeader(headers, "From"),
        date: getHeader(headers, "Date"),
        snippet: detail.data.snippet || "",
        hasAttachment: attachments.length > 0,
        attachmentNames: attachments.map(a => a.filename),
        accountOwner: email,
        relevanceScore: 0,
      });
    } catch {}
  }

  return results;
}

export async function searchAcrossAccounts(query: string, maxPerAccount: number = 15): Promise<{
  results: MultiAccountSearchResult[];
  searchedAccounts: string[];
  failedAccounts: string[];
}> {
  const allCreds = await db.select().from(gmailCredentials)
    .where(eq(gmailCredentials.isActive, true));

  const searchedAccounts: string[] = [];
  const failedAccounts: string[] = [];

  const searchTasks = allCreds.map(async (cred) => {
    try {
      const accountResults = await searchAccount(cred.email, query, maxPerAccount);
      searchedAccounts.push(cred.email);

      await db.update(gmailCredentials)
        .set({ lastSyncedAt: new Date() })
        .where(eq(gmailCredentials.id, cred.id));

      return accountResults;
    } catch (e: any) {
      console.warn(`[GmailMulti] Failed to search ${cred.email}:`, e.message);
      failedAccounts.push(cred.email);
      return [];
    }
  });

  const allResults = await Promise.all(searchTasks);
  const results = allResults.flat();

  return { results, searchedAccounts, failedAccounts };
}

export async function getConnectedAccounts(): Promise<{ email: string; isActive: boolean; lastSyncedAt: Date | null }[]> {
  const creds = await db.select({
    email: gmailCredentials.email,
    isActive: gmailCredentials.isActive,
    lastSyncedAt: gmailCredentials.lastSyncedAt,
  }).from(gmailCredentials);
  return creds;
}

export async function removeAccount(email: string): Promise<void> {
  await db.delete(gmailCredentials).where(eq(gmailCredentials.email, email));
  console.log(`[GmailMulti] Removed credentials for ${email}`);
}
