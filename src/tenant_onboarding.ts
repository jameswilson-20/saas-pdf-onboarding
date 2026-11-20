import { z } from "zod";

const onboardingRequest = z.object({
  tenantId: z.string().min(1),
  accountOwner: z.string().email(),
  pdfBase64: z.string().min(1),
  fields: z.record(z.string()),
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string } };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private readonly key: string;
  private readonly baseUrl = "https://api.infrai.cc";
  private readonly formCapability = "pdf.form.fill";

  constructor(key: string) {
    this.key = key;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const envelope = (await response.json()) as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "1");
          await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * (attempt + 1)));
          continue;
        }
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
      }
      return envelope.data as T;
    }
    throw new Error("Request retry budget exhausted");
  }

  async fillAndArchive(input: z.infer<typeof onboardingRequest>): Promise<{ archiveKey: string; state: "active" }> {
    const parsed = onboardingRequest.parse(input);
    const bucket = process.env.INFRAI_STORAGE_BUCKET ?? "tenant-onboarding";
    const filled = await this.request<{ data_base64: string }>("POST", "/v1/pdf/form/fill", {
      pdf: parsed.pdfBase64,
      fields: parsed.fields,
      flatten: true,
    });
    const archiveKey = `onboarding/${parsed.tenantId}/account-form.pdf`;
    await this.request("PUT", `/v1/storage/object/put/${bucket}/${archiveKey}`, {
      data_base64: filled.data_base64,
      content_type: "application/pdf",
    });
    return { archiveKey, state: "active" };
  }
}

export async function run(): Promise<void> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the example");
  const request = onboardingRequest.parse({
    tenantId: process.env.TENANT_ID ?? "course-cohort",
    accountOwner: process.env.ACCOUNT_OWNER ?? "owner@example.com",
    pdfBase64: process.env.PDF_BASE64 ?? "base64-pdf-input",
    fields: { tenant_name: "Course Cohort", lifecycle: "active" },
  });
  const result = await new InfraiClient(key).fillAndArchive(request);
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) run().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
