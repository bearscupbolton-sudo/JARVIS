// Gmail integration via Replit connector (google-mail)
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
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
