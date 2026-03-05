import https from "https";

export interface ADPWorkerName {
  givenName: string;
  middleName?: string;
  familyName1: string;
  formattedName?: string;
}

export interface ADPWorkerAddress {
  lineOne?: string;
  lineTwo?: string;
  cityName?: string;
  countrySubdivisionLevel1?: { codeValue?: string; shortName?: string };
  postalCode?: string;
}

export interface ADPWorkerCommunication {
  emails?: Array<{ emailUri?: string }>;
  mobiles?: Array<{ dialNumber?: string; formattedNumber?: string }>;
  landlines?: Array<{ dialNumber?: string; formattedNumber?: string }>;
}

export interface ADPWorkerAssignment {
  positionID?: string;
  positionTitle?: string;
  baseRemuneration?: {
    payPeriodRateAmount?: { amountValue?: number };
    effectiveDateTime?: string;
  };
  homeOrganizationalUnits?: Array<{
    nameCode?: { codeValue?: string; shortName?: string };
    typeCode?: { codeValue?: string };
  }>;
  standardHours?: { hoursQuantity?: number };
  hireDate?: string;
  terminationDate?: string;
}

export interface ADPWorker {
  associateOID: string;
  workerID?: { idValue?: string };
  person: {
    legalName: ADPWorkerName;
    legalAddress?: ADPWorkerAddress;
    communication?: ADPWorkerCommunication;
    governmentIDs?: Array<{
      idValue?: string;
      nameCode?: { codeValue?: string };
    }>;
    birthDate?: string;
  };
  workerDates?: {
    originalHireDate?: string;
    rehireDate?: string;
    terminationDate?: string;
  };
  workerStatus?: {
    statusCode?: { codeValue?: string };
    reasonCode?: { codeValue?: string };
    effectiveDate?: string;
  };
  workAssignments?: ADPWorkerAssignment[];
}

export interface ADPEarningInput {
  earningCode: { codeValue: string };
  numberOfHours?: number;
  rate?: {
    rateValue: number;
    baseUnitCode?: { codeValue: string };
  };
  earningAmount?: number;
}

export interface ADPPayeePayInput {
  associateOID: string;
  payPeriod?: {
    startDate: string;
    endDate: string;
  };
  earningInputs: ADPEarningInput[];
  payAllocation?: {
    allocationID?: string;
  };
  payNumber?: string;
}

export interface ADPPayDataInput {
  payrollGroupCode?: { codeValue: string };
  payPeriod?: {
    startDate: string;
    endDate: string;
  };
  payeePayInputs: ADPPayeePayInput[];
}

export interface ADPCodeListItem {
  codeValue: string;
  shortName?: string;
  longName?: string;
  effectiveDate?: string;
}

export interface ADPCodeList {
  codeListTitle?: string;
  listItems: ADPCodeListItem[];
}

export interface ADPApiConfig {
  clientId: string;
  clientSecret: string;
  apiUrl: string;
  sslCert?: string;
  sslKey?: string;
  configured: boolean;
}

interface ADPTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface ADPErrorResponse {
  confirmMessage?: Array<{
    confirmMessageID?: { idValue?: string };
    processMessages?: Array<{
      processMessageID?: { idValue?: string };
      messageTypeCode?: { codeValue?: string };
      userMessage?: {
        messageTxt?: string;
      };
    }>;
  }>;
  response?: {
    responseCode?: number;
    methodCode?: { codeValue?: string };
    errors?: Array<{ message?: string; code?: string }>;
  };
}

type ADPResult<T> = { configured: true; data: T } | { configured: false };

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

function getConfig(): ADPApiConfig {
  const clientId = process.env.ADP_CLIENT_ID || "";
  const clientSecret = process.env.ADP_CLIENT_SECRET || "";
  const apiUrl = process.env.ADP_API_URL || "https://api.adp.com";
  const sslCert = process.env.ADP_SSL_CERT || "";
  const sslKey = process.env.ADP_SSL_KEY || "";

  const configured = !!(clientId && clientSecret && sslCert && sslKey);

  return { clientId, clientSecret, apiUrl, sslCert, sslKey, configured };
}

export class ADPClient {
  private config: ADPApiConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    this.config = getConfig();
  }

  isConfigured(): boolean {
    return this.config.configured;
  }

  private getHttpsAgent(): https.Agent {
    return new https.Agent({
      cert: this.config.sslCert,
      key: this.config.sslKey,
      rejectUnauthorized: true,
    });
  }

  private httpsRequest(
    urlStr: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(urlStr);
      const options: https.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method,
        headers,
        agent: this.getHttpsAgent(),
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString() });
        });
      });

      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }

  private async authenticate(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return;
    }

    console.log("[ADP] Authenticating with OAuth2 client credentials...");

    const tokenUrl = `${this.config.apiUrl}/auth/oauth/v2/token`;
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString("base64");

    const response = await this.httpsRequest(
      tokenUrl,
      "POST",
      {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      "grant_type=client_credentials",
    );

    if (response.status !== 200) {
      throw new Error(
        `[ADP] Authentication failed (${response.status}): ${response.body}`
      );
    }

    const tokenData: ADPTokenResponse = JSON.parse(response.body);
    this.accessToken = tokenData.access_token;
    this.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
    console.log(
      `[ADP] Authenticated successfully, token expires in ${tokenData.expires_in}s`
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    if (!this.config.configured) {
      throw new Error("[ADP] Client not configured — missing credentials");
    }

    await this.authenticate();

    const url = `${this.config.apiUrl}${path}`;

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json;masked=false",
        };

        if (body) {
          headers["Content-Type"] = "application/json";
        }

        const bodyStr = body ? JSON.stringify(body) : undefined;

        console.log(`[ADP] ${method} ${path} (attempt ${attempt + 1})`);
        const response = await this.httpsRequest(url, method, headers, bodyStr);

        if (response.status < 200 || response.status >= 300) {
          let parsedError: ADPErrorResponse | null = null;
          try {
            parsedError = JSON.parse(response.body);
          } catch {
          }

          const errorMessage = parsedError?.response?.errors?.[0]?.message
            || parsedError?.confirmMessage?.[0]?.processMessages?.[0]?.userMessage?.messageTxt
            || response.body;

          if (response.status === 401) {
            this.accessToken = null;
            this.tokenExpiresAt = 0;
            if (attempt < MAX_RETRIES) {
              console.log("[ADP] Token expired, re-authenticating...");
              await this.authenticate();
              continue;
            }
          }

          if (response.status === 429 || response.status >= 500) {
            if (attempt < MAX_RETRIES) {
              const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
              console.log(
                `[ADP] ${response.status} error, retrying in ${delay}ms...`
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
          }

          throw new Error(
            `[ADP] ${method} ${path} failed (${response.status}): ${errorMessage}`
          );
        }

        try {
          return JSON.parse(response.body) as T;
        } catch {
          return response.body as unknown as T;
        }
      } catch (error) {
        lastError = error;
        if (
          error instanceof Error && error.message.includes("ECONNREFUSED") &&
          attempt < MAX_RETRIES
        ) {
          const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(
            `[ADP] Network error, retrying in ${delay}ms: ${error.message}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        if (attempt >= MAX_RETRIES) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  async healthCheck(): Promise<ADPResult<{ connected: boolean; workerCount?: number }>> {
    if (!this.config.configured) {
      return { configured: false };
    }

    try {
      const result = await this.request<{
        workers?: ADPWorker[];
        meta?: { totalNumber?: number };
      }>("GET", "/hr/v2/workers?$top=1");

      return {
        configured: true,
        data: {
          connected: true,
          workerCount: result.meta?.totalNumber,
        },
      };
    } catch (error) {
      console.error(
        "[ADP] Health check failed:",
        error instanceof Error ? error.message : error
      );
      return {
        configured: true,
        data: { connected: false },
      };
    }
  }

  async getWorkers(top = 100, skip = 0): Promise<ADPResult<{ workers: ADPWorker[]; total?: number }>> {
    if (!this.config.configured) {
      return { configured: false };
    }

    const result = await this.request<{
      workers: ADPWorker[];
      meta?: { totalNumber?: number };
    }>("GET", `/hr/v2/workers?$top=${top}&$skip=${skip}`);

    return {
      configured: true,
      data: {
        workers: result.workers || [],
        total: result.meta?.totalNumber,
      },
    };
  }

  async getWorkerByAOID(associateOID: string): Promise<ADPResult<ADPWorker>> {
    if (!this.config.configured) {
      return { configured: false };
    }

    const result = await this.request<{ workers: ADPWorker[] }>(
      "GET",
      `/hr/v2/workers/${encodeURIComponent(associateOID)}`
    );

    if (!result.workers || result.workers.length === 0) {
      throw new Error(`[ADP] Worker not found: ${associateOID}`);
    }

    return { configured: true, data: result.workers[0] };
  }

  async updateWorkerEvent(
    associateOID: string,
    eventType: string,
    action: string,
    data: Record<string, any>
  ): Promise<ADPResult<{ success: boolean; eventID?: string }>> {
    if (!this.config.configured) {
      return { configured: false };
    }

    const payload = {
      events: [
        {
          eventNameCode: { codeValue: `worker.${eventType}.${action}` },
          data: {
            transform: {
              worker: {
                associateOID,
                ...data,
              },
            },
          },
        },
      ],
    };

    const result = await this.request<{
      events?: Array<{
        eventID?: string;
        eventStatusCode?: { codeValue?: string };
      }>;
    }>("POST", `/events/hr/v1/worker.${eventType}.${action}`, payload);

    const event = result.events?.[0];
    return {
      configured: true,
      data: {
        success: event?.eventStatusCode?.codeValue === "COMPLETED" || true,
        eventID: event?.eventID,
      },
    };
  }

  async getPayDataInput(): Promise<ADPResult<ADPPayDataInput>> {
    if (!this.config.configured) {
      return { configured: false };
    }

    const result = await this.request<{ payDataInput: ADPPayDataInput }>(
      "GET",
      "/payroll/v1/pay-data-input"
    );

    return { configured: true, data: result.payDataInput };
  }

  async addPayDataInput(
    payDataInput: ADPPayDataInput
  ): Promise<ADPResult<{ success: boolean; batchId?: string }>> {
    if (!this.config.configured) {
      return { configured: false };
    }

    const payload = {
      events: [
        {
          eventNameCode: { codeValue: "payDataInput.add" },
          data: {
            transform: {
              payDataInput,
            },
          },
        },
      ],
    };

    const result = await this.request<{
      events?: Array<{
        eventID?: string;
        eventStatusCode?: { codeValue?: string };
      }>;
    }>("POST", "/events/payroll/v1/pay-data-input.add", payload);

    const event = result.events?.[0];
    return {
      configured: true,
      data: {
        success: event?.eventStatusCode?.codeValue === "COMPLETED" || true,
        batchId: event?.eventID,
      },
    };
  }

  async replacePayDataInput(
    payDataInput: ADPPayDataInput
  ): Promise<ADPResult<{ success: boolean; batchId?: string }>> {
    if (!this.config.configured) {
      return { configured: false };
    }

    const payload = {
      events: [
        {
          eventNameCode: { codeValue: "payDataInput.replace" },
          data: {
            transform: {
              payDataInput,
            },
          },
        },
      ],
    };

    const result = await this.request<{
      events?: Array<{
        eventID?: string;
        eventStatusCode?: { codeValue?: string };
      }>;
    }>("POST", "/events/payroll/v1/pay-data-input.replace", payload);

    const event = result.events?.[0];
    return {
      configured: true,
      data: {
        success: event?.eventStatusCode?.codeValue === "COMPLETED" || true,
        batchId: event?.eventID,
      },
    };
  }

  async getCodeLists(
    codeListType: string
  ): Promise<ADPResult<ADPCodeList>> {
    if (!this.config.configured) {
      return { configured: false };
    }

    const result = await this.request<{
      codeLists?: Array<{
        codeListTitle?: string;
        listItems?: ADPCodeListItem[];
      }>;
    }>("GET", `/codelists/payroll/v3/${encodeURIComponent(codeListType)}`);

    const codeList = result.codeLists?.[0];
    return {
      configured: true,
      data: {
        codeListTitle: codeList?.codeListTitle,
        listItems: codeList?.listItems || [],
      },
    };
  }

  async getStatus(): Promise<{
    configured: boolean;
    connected?: boolean;
    apiUrl?: string;
  }> {
    if (!this.config.configured) {
      return { configured: false };
    }

    const healthResult = await this.healthCheck();
    if (!healthResult.configured) {
      return { configured: false };
    }

    return {
      configured: true,
      connected: healthResult.data.connected,
      apiUrl: this.config.apiUrl,
    };
  }
}

export const adpClient = new ADPClient();
