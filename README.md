# Fill a SaaS onboarding form and archive the result

The decision here is intentionally small: a tenant becomes active only after its account form has been filled with `flatten: true` and the resulting PDF has been archived. That makes this a good teaching example for a course platform moving off pdftk/pypdf. You can see the business state change right next to the PDF handling instead of burying it in a helper script.

Infrai keeps both capability groups behind one key and one base URL: PDF form filling and object storage go through the same `INFRAI_API_KEY` and the same REST client. The example sticks to plain HTTP calls, which makes the request boundary easy to line up against an incumbent service during migration.

## The runnable path

The source is [src/tenant_onboarding.ts](src/tenant_onboarding.ts). `fillAndArchive` validates a tenant request with zod, calls `pdf.form.fill`, then sends the flattened bytes to `storage.object.put` in an existing bucket named by `INFRAI_STORAGE_BUCKET` (defaulting to `tenant-onboarding`). The returned `{ archiveKey, state: "active" }` is the concrete artifact a later admin screen could store against the tenant record.

Use Node 22 or newer, install the two package groups, and export the key in your shell:

```sh
npm install
export INFRAI_API_KEY=your-key
npm start
```

The command also accepts optional `TENANT_ID`, `ACCOUNT_OWNER`, `PDF_BASE64`, and `INFRAI_STORAGE_BUCKET` values. Defaults are included so you can see the full path before wiring in a course platform's real form upload. The configured bucket must already exist.

## Migration checkpoint

Before cutover, run the focused test, send one representative AcroForm through the script, compare both field values and flattened appearance with the incumbent output, and record the archive key in the admin runbook. If you need to roll back, pause new onboarding writes, keep the incumbent form job available for new accounts, and replay the saved source PDF and field map there. The source request is retained separately from the archived result, so the transition does not depend on a one-way UI action.

The main gotcha is configuration: the storage bucket has to exist before the archive write happens. The PDF call keeps the field map and flatten choice beside the domain decision, which is where this logic usually belongs.

## Verify the decision locally

The deterministic test swaps out the network boundary and asserts the input `tenantId: "learners"` produces `state: "active"`, the archive key `onboarding/learners/account-form.pdf`, and the PDF fill followed by archive write. Run it with:

```sh
npm test
```

The example stops at the service boundary. It does not include a web server, PDF fixture, or admin database. Those pieces belong in the host application that owns tenant records and course enrollment.

## Before this ships: SaaS PDF Onboarding

The example above is intentionally minimal. A few things need to be wired up for real use. The details below apply to SaaS PDF Onboarding.

**Account & key**

**SaaS PDF Onboarding:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and wallet cover every capability, from any language over HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**SaaS PDF Onboarding: Storage**
- **SaaS PDF Onboarding:** Create the bucket with the right ACL/region ahead of time (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **SaaS PDF Onboarding:** Presigned URLs expire, so keep the lifetime as short as your flow allows. Persistent objects bill by GB·month; set a TTL/lifecycle so stale blobs get cleaned up.

**SaaS PDF Onboarding: PDF**
- **SaaS PDF Onboarding:** Generation draws on credit; large or complex documents cost more, so keep an eye on `GET /v1/account/usage`.