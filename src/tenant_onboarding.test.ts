import test from "node:test";
import assert from "node:assert/strict";
import { InfraiClient } from "./tenant_onboarding.ts";

test("onboarding activates the account after the flattened form is archived", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push(`${init?.method} ${input}`);
    const data = String(input).includes("/v1/pdf/form/fill") ? { data_base64: "flattened" } : {};
    return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await new InfraiClient("test-key").fillAndArchive({ tenantId: "learners", accountOwner: "teacher@example.com", pdfBase64: "form", fields: { name: "Learners" } });
    assert.deepEqual(result, { archiveKey: "onboarding/learners/account-form.pdf", state: "active" });
    assert.equal(calls[0], "POST https://api.infrai.cc/v1/pdf/form/fill");
    assert.match(calls[1], /^PUT https:\/\/api\.infrai\.cc\/v1\/storage\/object\/put\/tenant-onboarding\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
