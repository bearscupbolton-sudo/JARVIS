// Gmail integration via custom OAuth credentials (gmail.readonly scope)
import { google } from 'googleapis';

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

async function getGmailClient() {
  const auth = getOAuth2Client();
  return google.gmail({ version: 'v1', auth });
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body?: string;
  labels: string[];
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyToMessageId?: string;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function getHeader(headers: any[], name: string): string {
  const h = headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function extractBody(payload: any): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) return decodeBase64Url(htmlPart.body.data);
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return '';
}

export async function listEmails(query?: string, maxResults: number = 20, labelIds?: string[]): Promise<{ messages: EmailMessage[]; resultSizeEstimate: number }> {
  const gmail = await getGmailClient();
  const params: any = { userId: 'me', maxResults };
  if (query) params.q = query;
  if (labelIds && labelIds.length > 0) params.labelIds = labelIds;

  const listRes = await gmail.users.messages.list(params);
  const messageIds = listRes.data.messages || [];

  const messages: EmailMessage[] = [];
  for (const msg of messageIds) {
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });
      const headers = detail.data.payload?.headers || [];
      messages.push({
        id: detail.data.id || '',
        threadId: detail.data.threadId || '',
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        snippet: detail.data.snippet || '',
        labels: detail.data.labelIds || [],
      });
    } catch {}
  }

  return { messages, resultSizeEstimate: listRes.data.resultSizeEstimate || 0 };
}

export async function getEmail(messageId: string): Promise<EmailMessage & { body: string }> {
  const gmail = await getGmailClient();
  const detail = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
  const headers = detail.data.payload?.headers || [];
  const body = extractBody(detail.data.payload);

  return {
    id: detail.data.id || '',
    threadId: detail.data.threadId || '',
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    snippet: detail.data.snippet || '',
    body,
    labels: detail.data.labelIds || [],
  };
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; messageId?: string; message: string }> {
  const gmail = await getGmailClient();

  const headers = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `Content-Type: text/html; charset=utf-8`,
  ];
  if (params.cc) headers.push(`Cc: ${params.cc}`);
  if (params.bcc) headers.push(`Bcc: ${params.bcc}`);
  headers.push('');
  headers.push(params.body);

  const raw = Buffer.from(headers.join('\r\n')).toString('base64url');

  const sendParams: any = { userId: 'me', requestBody: { raw } };
  if (params.replyToMessageId) {
    sendParams.requestBody.threadId = params.replyToMessageId;
  }

  const res = await gmail.users.messages.send(sendParams);
  return {
    success: true,
    messageId: res.data.id || undefined,
    message: `Email sent to ${params.to}`,
  };
}

export interface AttachmentInfo {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

function findAttachments(payload: any): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        attachments.push(...findAttachments(part));
      }
    }
  }
  return attachments;
}

export async function getEmailWithAttachmentInfo(messageId: string): Promise<EmailMessage & { body: string; attachments: AttachmentInfo[] }> {
  const gmail = await getGmailClient();
  const detail = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const headers = detail.data.payload?.headers || [];
  const body = extractBody(detail.data.payload);
  const attachments = findAttachments(detail.data.payload);

  return {
    id: detail.data.id || '',
    threadId: detail.data.threadId || '',
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    snippet: detail.data.snippet || '',
    body,
    labels: detail.data.labelIds || [],
    attachments,
  };
}

export async function downloadAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const gmail = await getGmailClient();
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  const data = res.data.data || '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export const VENDOR_EMAIL_RULES = [
  {
    vendor: "The Chefs' Warehouse",
    fromFilter: "from:chefswarehouse.com",
    subjectKeywords: ["Final Invoice", "Credit Memo"],
    hasAttachment: true,
  },
  {
    vendor: "Sysco",
    fromFilter: "from:sysco.com",
    subjectKeywords: ["Order Allocated", "Invoice"],
    hasAttachment: true,
  },
  {
    vendor: "Copper Horse Coffee",
    fromFilter: "from:quickbooks@notification.intuit.com subject:\"Copper Horse\"",
    subjectKeywords: ["Invoice"],
    hasAttachment: true,
  },
  {
    vendor: "BakeMark",
    fromFilter: "from:bakemark.com",
    subjectKeywords: ["Order Confirmation", "Invoice"],
    hasAttachment: true,
  },
  {
    vendor: "Noissue",
    fromFilter: "from:noissue.co",
    subjectKeywords: ["order"],
    hasAttachment: false,
  },
  {
    vendor: "Ecoware (Agave Straws)",
    fromFilter: "from:store+25342246998@t.shopifyemail.com",
    subjectKeywords: ["confirmed", "shipment"],
    hasAttachment: false,
  },
  {
    vendor: "Harney & Sons Fine Teas",
    fromFilter: "from:email@harney.com",
    subjectKeywords: ["delivery"],
    hasAttachment: false,
  },
  {
    vendor: "Noble Gas Solutions",
    fromFilter: "from:orders@noblegassolutions.com",
    subjectKeywords: ["Delivery Receipt"],
    hasAttachment: true,
  },
];

export async function scanGmailForInvoices(daysBack: number = 7): Promise<{
  vendor: string;
  emails: (EmailMessage & { attachments: AttachmentInfo[] })[];
}[]> {
  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - daysBack);
  const afterStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`;

  const results: { vendor: string; emails: (EmailMessage & { attachments: AttachmentInfo[] })[] }[] = [];

  for (const rule of VENDOR_EMAIL_RULES) {
    try {
      const query = `${rule.fromFilter} after:${afterStr}`;
      const { messages } = await listEmails(query, 10);

      const enriched: (EmailMessage & { attachments: AttachmentInfo[] })[] = [];
      for (const msg of messages) {
        try {
          const full = await getEmailWithAttachmentInfo(msg.id);
          if (rule.subjectKeywords.length > 0) {
            const subjectLower = full.subject.toLowerCase();
            const matches = rule.subjectKeywords.some(kw => subjectLower.includes(kw.toLowerCase()));
            if (!matches) continue;
          }
          if (rule.hasAttachment && full.attachments.length === 0) continue;
          enriched.push(full);
        } catch (e) {
          console.warn(`[Gmail] Error fetching message ${msg.id} for ${rule.vendor}:`, e);
        }
      }
      results.push({ vendor: rule.vendor, emails: enriched });
    } catch (e) {
      console.warn(`[Gmail] Error scanning ${rule.vendor}:`, e);
      results.push({ vendor: rule.vendor, emails: [] });
    }
  }

  return results;
}

export async function getLabels(): Promise<{ id: string; name: string; type: string }[]> {
  const gmail = await getGmailClient();
  const res = await gmail.users.labels.list({ userId: 'me' });
  return (res.data.labels || []).map(l => ({
    id: l.id || '',
    name: l.name || '',
    type: l.type || '',
  }));
}

export async function getProfile(): Promise<{ email: string; messagesTotal: number; threadsTotal: number }> {
  const gmail = await getGmailClient();
  const res = await gmail.users.getProfile({ userId: 'me' });
  return {
    email: res.data.emailAddress || '',
    messagesTotal: res.data.messagesTotal || 0,
    threadsTotal: res.data.threadsTotal || 0,
  };
}
