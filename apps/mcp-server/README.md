# ConstructFlow AI Integration Guide (ChatGPT, Codex & Gemini)

ระบบเชื่อมต่อ AI เข้ากับ Trimble SketchUp ผ่านส่วนขยาย **ConstructFlow** แบบ Real-Time สั่งงานด้วยภาษาธรรมชาติ (Natural Language) เพื่อสร้างและควบคุมโมเดล BIM ทั้งหมด

---

## 🌟 โครงสร้างระบบ (Architecture)

```
┌───────────────────────────────┐
│     AI (ChatGPT / Gemini)     │
│   • OpenAI GPT-4o / Codex     │
│   • Google Gemini 2.5 Flash   │
│   • ChatGPT Web (Custom GPT)  │
└──────────────┬────────────────┘
               │ Tool / Function Call
               ▼
┌───────────────────────────────┐
│     ConstructFlow Bridge      │
│   • server.py (WebSocket)     │  <-- Port 8765
│   • http_bridge.py (REST)     │  <-- Port 8000 + OpenAPI Schema
└──────────────┬────────────────┘
               │ WebSocket
               ▼
┌───────────────────────────────┐
│    SketchUp ConstructFlow     │
│   • HtmlDialog (panel.js)     │
│   • Ruby Command Bus          │
│   • 3D Viewport Geometry      │
└───────────────────────────────┘
```

---

## 1. วิธีใช้งานกับ ChatGPT / OpenAI Codex (ผ่าน Terminal / Python)

เหมาะสำหรับการสั่งงานแบบ Interactive หรือรันสคริปต์อัตโนมัติ

### 1.1 ติดตั้ง Dependencies
```bash
pip install openai websockets
```

### 1.2 ตั้งค่า API Key
```bash
export OPENAI_API_KEY="sk-..."   # บน Linux/WSL/macOS
# หรือบน Windows PowerShell:
# $env:OPENAI_API_KEY="sk-..."
```

### 1.3 สั่งรันสะพานเชื่อมต่อ (Bridge Server)
เปิดหน้าต่าง Terminal ที่ 1:
```bash
python apps/mcp-server/server.py
```
> ระบบจะเปิด WebSocket ที่ `ws://localhost:8765` และรอรับการเชื่อมต่อจาก SketchUp

### 1.4 เปิด SketchUp และ ConstructFlow Inspector
1. เปิด SketchUp
2. เปิดแท็บ Extensions -> **ConstructFlow** -> **Inspector**
3. หน้าต่าง Inspector จะเชื่อมต่อกับ WebSocket Server อัตโนมัติ

### 1.5 เริ่มแชทสั่งงานกับ ChatGPT / Codex
เปิดหน้าต่าง Terminal ที่ 2:
```bash
python apps/mcp-server/openai_agent.py
```

### Standalone TypeScript tools

MCP clients can use standalone tools without a running SketchUp process:

- `cf_standalone_mutate_geometry`: pass canonical `.cfproj` JSON in `project_json` and an
  array of `{name, input}` command requests in `commands`. The server validates/migrates the
  project and executes one atomic batch through the same TypeScript `CommandBus` as Plan
  Editor. On success the response contains updated canonical project JSON; on rejection it
  returns the original JSON and no committed mutation. Batches are limited to 100 commands.
- `cf_standalone_query_model`: return Smart Objects with optional phase, level and category
  filters; result size is capped.
- `cf_standalone_calculate_takeoff`: run the native phased takeoff engine.
- `cf_standalone_run_coordination`: run the native geometry-aware coordination engine.
- `cf_standalone_validate_compliance`: run the unified Thai site/building compliance audit;
  optional `options` provide project-specific road, waterway, land-fill and zoning inputs.
- `cf_standalone_export_model`: export `dxf`, `ifc` (IFC 4.3 STEP), or `revit_transfer`
  JSON from the canonical model. These are interchange exports, not live diff-based sync.
- `cf_standalone_history`: undo or redo one mutation batch. Pass the latest `project_json`
  and `history` returned by mutation/history calls. History is caller-held, limited to 100
  snapshots in each direction, and bound to its project UUID.

These tools take the project JSON on each call, so the MCP client must retain and pass back
the latest returned JSON after a successful mutation. Build the standalone packages first
with `npm run build:standalone` (or `npm run test:standalone`).

Tools that export directly to a live SketchUp session still require the WebSocket bridge;
when no SketchUp client is connected they return `unavailable`, never a simulated success.

### Plan Editor AI sidebar

The right inspector's **AI** tab asks the HTTP gateway for a structured command proposal. The
gateway returns a plan only; the editor previews it with the same `CommandBus`, then a human
confirmation commits the batch as actor `ai` so it is undoable as one action. The HTTP endpoint
never executes the proposed commands.

Configure the gateway in PowerShell and start it:

```powershell
$env:OPENAI_API_KEY = "<provider API key>"
$env:CONSTRUCTFLOW_AI_TOKEN = "<a private random token>"
$env:CONSTRUCTFLOW_AI_MODEL = "gpt-4o-mini" # optional
python apps/mcp-server/http_bridge.py
```

By default the gateway binds to `127.0.0.1:8000`. The AI route requires the configured bearer
token. In the editor's AI tab, use `/api/ai/plan` and enter the same token; the development server
proxies that same-origin path to the local gateway. The editor keeps the token in memory only.
The project name, active level/phase, catalog types, selected IDs and a capped object summary are
sent to the configured gateway. Set `CONSTRUCTFLOW_AI_BASE_URL` to use an OpenAI-compatible provider
endpoint.

When a PDF, JPG or PNG is attached, the proposal can also include a visual wall/opening trace in
normalized source-page coordinates. The editor shows it over the original drawing; endpoints can be
dragged or nudged with arrow keys, and false segments can be removed before asking AI to build a new
proposal from the reviewed trace. Trace coordinates are image-space only: they never become model
dimensions by themselves. Add a known point-to-point distance and the required level/placement
information before asking for BIM commands. Multiple reference distances are cross-checked by the
AI; the image-calibration panel also warns when its references imply noticeably different scales.

If an AI response has follow-up questions and also contains independent commands, the editor still
previews the commands through `CommandBus`. Only the selected, valid items are eligible for human
confirmation. Missing dimensions are never replaced by pixel estimates or typical defaults.

For a remote deployment, terminate TLS at a reverse proxy, route `/api/ai/plan` to this gateway,
and serve the editor with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` so the isolated extension worker can use its bounded
asynchronous RPC channel. Keep the editor's Content-Security-Policy `connect-src` same-origin by
using that reverse proxy. Set `CONSTRUCTFLOW_HTTP_HOST` to the private interface behind the proxy,
`CONSTRUCTFLOW_AI_ALLOWED_ORIGINS` to the exact editor origins, and use a random
`CONSTRUCTFLOW_AI_TOKEN` of at least 32 characters when the remote AI endpoint is enabled. A
collaboration-only deployment can bind without an AI provider key when its project tokens and TLS
termination are configured below. Do not expose the plain HTTP listener directly to the public
internet.

The legacy `/api/command` SketchUp route separately requires `CONSTRUCTFLOW_BRIDGE_TOKEN`; it is
not enabled by merely starting the AI gateway. The route shares the exact-origin CORS allowlist.

### Authenticated project revision sync

The version-history panel can merge offline revision trails through the same-origin
`/api/collaboration/projects/{project_uuid}/revisions` endpoint. The service is opt-in and stores
append-only snapshots in SQLite. It validates project UUIDs and snapshot ownership, deduplicates
repeated uploads of the same revision snapshot, and preserves different snapshots that claim the
same revision UUID as conflicts. `owner` and `editor` roles can upload; `viewer` can only download. This transports
revision history and supports review/restore; it does not provide simultaneous canvas editing.

Provision one random token per person and assign project-scoped roles in the gateway environment:

```bash
export CONSTRUCTFLOW_COLLABORATION_USERS='[
  {"user_id":"design-lead","token":"REPLACE_WITH_A_UNIQUE_RANDOM_TOKEN_OF_32_PLUS_CHARACTERS","projects":{"PROJECT_UUID":"owner"},"company_id":"COMPANY_UUID","company_role":"owner"},
  {"user_id":"site-reviewer","token":"USE_A_DIFFERENT_UNIQUE_RANDOM_TOKEN_OF_32_PLUS_CHARACTERS","projects":{"PROJECT_UUID":"viewer"},"company_id":"COMPANY_UUID","company_role":"viewer"}
]'
export CONSTRUCTFLOW_COLLABORATION_DB="/var/lib/constructflow/collaboration.sqlite3"
```

Replace `PROJECT_UUID` with the project's canonical UUID. Roles may be `owner`, `editor`, or
`viewer`; use `"*"` only when every account in that deployment is intentionally allowed to access
every project. User IDs and tokens must be unique. `company_id` and `company_role` are optional;
when set, use the same company UUID for all users in that organization and assign a separate
`owner`/`editor`/`viewer` company role. The gateway validates the configuration at startup. The
database directory and file are created with owner-only permissions where the host
supports them. Back up the SQLite database as part of the deployment's protected project-data
backup; the database is not encrypted by ConstructFlow.

The editor sends requests to its own origin. During Vite development,
`CONSTRUCTFLOW_AI_GATEWAY_TARGET` proxies `/api/collaboration` and `/api/drawing-download` to the
gateway. In production, route `/api/collaboration/*` and `/api/drawing-download` through the same
TLS reverse proxy used for `/api/ai/plan`; do not open a new browser connection to the gateway
host. If the gateway itself binds to a non-loopback interface, terminate TLS before it and set
`CONSTRUCTFLOW_COLLABORATION_TLS_TERMINATED=true`. Keep `CONSTRUCTFLOW_AI_ALLOWED_ORIGINS`
restricted to exact trusted editor origins.

### Customer and team drawing download links

An owner or editor can use **แชร์ Vector PDF A3 ให้ลูกค้า/ทีม** from the project menu. The editor
compiles every current permit sheet into one A3 vector PDF using the native sheet engine, then
uploads the immutable snapshot to the collaboration gateway. Choose a 7-, 14-, or 30-day lifetime;
copy the one-time link or open the device share sheet. Recipients do not need a ConstructFlow
account and receive download access only, never model-edit access. The URL keeps its bearer token in
the browser fragment, so it is not sent in the HTTP request or referrer header. The public download
page reads file metadata first and transfers the PDF only after the recipient taps **ดาวน์โหลด PDF**.

The owner/editor can review link expiry and download counts or revoke a link from the project menu.
Revocation and expiry disable downloads and clear the PDF payload from its active SQLite record.
Tokens are never stored in plaintext on the gateway and are returned only once, so copy the link before closing the dialog. The gateway accepts
PDFs up to 50 MB, allows up to 25 active links per project, and caps active project storage at
200 MB. Link files are stored in the configured collaboration SQLite database alongside the other
team data; protect and back up that database accordingly. This feature shares a frozen drawing
snapshot, not an interactive live view.

On each device, enter the assigned token in **ประวัติเวอร์ชัน → ซิงค์ประวัติกับทีม** and save
it locally. The token stays in that device's IndexedDB settings and is not included in project
files or revision bundles. **ซิงค์ตอนนี้** checkpoints the current project if needed, uploads the
local revision bundle, downloads the merged team history, and imports it through the same
snapshot validation used for file transfer. Sync is manual so offline edits remain local until a
user initiates the exchange. A project owner can open **สมาชิกและสิทธิ์** from the same panel to
invite a member, assign `owner`/`editor`/`viewer`, change a role, or revoke access. Newly issued
tokens are shown once and only their SHA-256 hashes are stored in SQLite; copy the token to the
member using an organization-approved channel. Environment-configured members remain read-only in
the panel, and the service prevents demoting or revoking the last project owner. While a tokenized
project is open in the editor, each visible tab refreshes a project-scoped presence session every
1.5 seconds and closes it when possible on hide or exit. The gateway reports member names active in
the last 90 seconds and relays ephemeral plan cursor coordinates plus up to 50 selected object
UUIDs; cursor marks expire after five seconds without movement. Project-linked comment threads use
the separate `/api/collaboration/projects/{project_uuid}/comments` endpoint and merge every four
seconds while the editor is visible. The gateway unions replies by UUID, preserves immutable thread
identity, rejects conflicting UUID reuse, and resolves status races by the explicit status-change
timestamp. Owner/editor roles can publish comments; viewers can download them. ETags avoid sending
the full comment collection when it has not changed. Comment sync does not send drawing geometry or
project snapshots.

### Live model-command sync

Authenticated owner/editor sessions can exchange incremental model changes through
`/api/collaboration/projects/{project_uuid}/commands`. Each successful local CommandBus batch is
stored in a project-scoped IndexedDB outbox with its stable command and transaction UUIDs. The
gateway validates and appends transactions in a monotonic per-project sequence; other visible
editors poll that sequence and replay each batch through their own CommandBus validators and one
undo-history entry. Each transaction includes a compact resulting-model fingerprint; receivers
verify it before applying, and devices joining an existing stream must match the server's head
fingerprint before they can edit. Viewer tokens can pull but cannot append.

The gateway does not accept project snapshots on this endpoint. Every upload carries the sequence
it was based on. A stale writer receives HTTP 409, keeps its local outbox, and stops until the team
compares or restores a matching project version. A new device joins at the current sequence head
instead of replaying old commands, so load the matching `.cfproj` or revision first when a stream
already exists. If the stream is empty, the first editor can seed it with queued local commands.
Offline edits are queued, but concurrent remote edits can require manual revision reconciliation.
Undo/redo and whole-project revision restores pause live command sync because they do not yet have
incremental inverse-command records. Direct document replacements outside CommandBus also pause live sync. The
self-hosted gateway and its SQLite database must be backed up as part of the project collaboration
service.

The **Company Library → ซิงค์กับทีม** action uses the same bearer token and owner/editor/viewer
roles. Tokens with a server-assigned `company_id` sync one shared catalog across projects; other
tokens fall back to the current project's catalog. A project owner who invites a member passes on
the company's scope, with a company role no higher than the inviter's; revoking that project token
revokes its company-library access too. The version-6 exchange includes price books, proposal
templates, reusable discount rules, field-form templates, supplier products/bundles, margin policy,
and the shared supplier-category order as one validated bundle. Versions 1–5 remain importable.
Discount rules and category order use update timestamps during merge; a proposal stores the selected
rule's UUID, name and percentage as its own frozen snapshot, so later catalog edits cannot silently
change a saved quote. Products and bundles share the same touch-reorderable category list.
Editors merge records by UUID and `updated_at`, then publish with an optimistic version check;
concurrent edits trigger a fresh pull and merge, with a retry limit so no older bundle silently
replaces a newer version. Viewers can pull and merge but cannot publish. SQLite retains one current
bundle per company or, for unassigned accounts, per project (up to 20 MB). File JSON remains
available for offline transfer. Company identity is configured by the gateway; clients cannot
choose or switch the company scope in a request.

### Project field photo media

Field photo inspection metadata (photo UUID, plan pin, level, dimensions and notes) remains part of
the canonical project snapshot. The **หน้างาน → ซิงค์ภาพกับทีม** action exchanges only the linked
image bytes with the authenticated project gateway; it does not change the BIM model or require a
network connection to continue editing. The client stores copies in IndexedDB and the portable
`.cfproj` media sidecar remains available for offline transfer.

`owner` and `editor` project members can upload, while `viewer` members can download. Assets are
immutable and addressed by their existing photo UUID. The gateway verifies image signatures and
SHA-256, accepts JPEG/PNG/WebP/GIF/AVIF up to 20 MB each, and caps each project at 500 assets and
100 MB. Re-uploading the same UUID/content is idempotent; different bytes under an existing UUID
return a conflict and never replace the original. Remote images are downloaded only when the local
project snapshot already references their UUID. The gateway does not delete assets automatically,
so removed photos can remain as unused media until an administrator manages storage.

Media files live under `CONSTRUCTFLOW_COLLABORATION_MEDIA_DIR` when configured; otherwise they are
stored in a `media/` directory beside the SQLite database. Both locations are created with
owner-only permissions where supported. Include the media directory with the SQLite database in
protected backups. Reverse proxies must allow PUT bodies up to 20 MB and long enough upload
timeouts. As with the rest of remote collaboration, route the editor through the same-origin TLS
proxy and keep bearer tokens out of shared project files.

### Proposal delivery to Zapier

The project inspector can send a selected proposal snapshot to a device-local Zapier Catch Hook
URL. Recipient contact fields and submitted Field Data remain opt-in; the BIM model is not sent.
The editor stores the Catch Hook URL and frozen retry payload in that device's IndexedDB, and sends
the request through `/api/collaboration/projects/{project_uuid}/integrations/zapier` using the
locally saved collaboration token. Only project `owner` and `editor` roles can deliver; viewers
cannot. Configure and save a team token in **ประวัติเวอร์ชัน → ซิงค์ประวัติกับทีม** first.

The gateway accepts only HTTPS `hooks.zapier.com/hooks/catch/...` URLs and does not follow redirects.
It form-encodes the snapshot, records the event UUID plus payload/target hashes in SQLite, and
returns the Catch Hook's HTTP status to the editor. It never stores the Catch Hook URL or proposal
payload in SQLite. A repeated successful event UUID returns the saved acknowledgement without
another request. The same UUID cannot be redirected to a different Catch Hook or reused with a
different payload. A timeout, redirect, or provider 5xx is marked uncertain and is not resent;
check Zapier task history before creating a new event. Other non-2xx responses can be retried with
the same UUID. HTTP 2xx confirms that Zapier accepted the Catch Hook request, not that later Zap
steps completed. Remote deployments must route this endpoint through the same-origin TLS reverse
proxy described above.

### One-time proposal approval links

For a proposal in `sent` status, the editor can create a frozen customer-facing snapshot and share
its one-time URL manually through the device share sheet, LINE, or email. The link expires after
14 days; creating another link revokes the prior pending link. The snapshot contains only proposal
output rows, visible commercial totals, terms, notes, and matched conditional text. It excludes
model object UUIDs, internal hidden line details, and field-form/GPS data. The bearer token is in
the URL fragment, is returned only once, and is stored in SQLite as a SHA-256 hash. Team users can
read recent link status or revoke a pending link through the authenticated
`/api/collaboration/projects/{project_uuid}/proposals/{proposal_uuid}/approval-links` routes.

Recipients can submit one accepted or declined decision with a self-reported name, drawn signature,
and optional note at `/api/proposal-approval`. The team editor polls for the result and materializes
it into the project through `TransitionProposalStatus`, preserving the link UUID and captured
signature in command history. This records the response and signature strokes, but does not verify
signer identity or provide provider-certified/legal eSignature. Email delivery and external
identity verification are not included. Remote deployments must publish the public route through
the same-origin TLS reverse proxy; keep the collaboration database and backups protected.

### Signed business-event webhooks

The project inspector also supports an owner-configured custom HTTPS receiver for proposal,
change-order, and invoice snapshots. Set an exact DNS-host allow-list on the self-hosted gateway:

```bash
export CONSTRUCTFLOW_WEBHOOK_ALLOWED_HOSTS='hooks.example.com,hook.us1.make.com'
```

Use hostnames only, separated by commas; wildcards, IP addresses, non-HTTPS URLs, non-443 ports,
redirects, and DNS answers containing non-public addresses are rejected. The gateway resolves the
host, pins the validated public address for the TLS request, and keeps the collaboration token
project-scoped. The same-host `/api/collaboration` reverse proxy and TLS requirements above apply.

Create a 32-byte-or-longer signing secret in the editor, configure the receiver to use that value,
then save the endpoint locally. The URL and secret remain in the device's IndexedDB; the secret is
sent to the gateway only with an authenticated delivery, used in memory to calculate
`X-ConstructFlow-Signature: sha256=<hex HMAC-SHA256>`, and never written to the gateway database.
Verify the signature against the exact raw JSON request body before parsing it. The event includes
`X-ConstructFlow-Event-ID` and `X-ConstructFlow-Event-Type`, plus the versioned
`constructflow.integration-event` envelope. The chosen business snapshot does not include BIM
geometry; recipient details and proposal Field Data (which can contain GPS coordinates) are opt-in.

Delivery records contain only event UUID, a payload hash, a destination hash, status, attempt count,
and HTTP status. Successful event UUIDs are idempotent; a different payload/destination conflicts.
Uncertain timeouts, redirects, and receiver 5xx responses are not resent. A project is limited to
100 new events per hour and 10 attempts per event. CRM, accounting, and field-service products can
consume these events through the approved receiver/automation host; the native QuickBooks OAuth
connection described below is also available.

### QuickBooks Online connection

QuickBooks Online can be connected from the project inspector. The authenticated gateway stores
the connection at company scope when the collaboration identity has a company assignment, or at
project scope otherwise. Only a Company Owner or Project Owner can connect or disconnect it.
OAuth state is random, one-use, bound to the initiating user and scope, and expires after ten
minutes. The callback exchanges the authorization code on the gateway and stores access/refresh
tokens encrypted with AES-256-GCM; tokens are never returned to the browser. Disconnect asks Intuit
to revoke the refresh token before removing the encrypted local record.

Create an Intuit app with the QuickBooks Online Accounting scope and register the exact gateway
callback URL. Configure the gateway without putting these values in project files or the browser:

```bash
export CONSTRUCTFLOW_QUICKBOOKS_CLIENT_ID='...'
export CONSTRUCTFLOW_QUICKBOOKS_CLIENT_SECRET='...'
export CONSTRUCTFLOW_QUICKBOOKS_REDIRECT_URI='https://gateway.example.com/api/integrations/quickbooks/callback'
export CONSTRUCTFLOW_QUICKBOOKS_ENVIRONMENT='production' # or sandbox
export CONSTRUCTFLOW_QBO_TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

The redirect URL must match the Intuit app registration exactly. HTTP is accepted only for a
localhost development callback; remote gateway traffic must use the TLS reverse proxy. The gateway
redacts OAuth callback parameters from its own request log; configure the reverse proxy to redact
callback query strings too. Keep the encryption key in the gateway's secret manager and include it
in protected backups: changing or losing it makes saved tokens undecryptable.

After connecting, a Company Owner/Editor or Project Owner/Editor can map one active QuickBooks
Service item and the company's active Tax Code for each VAT rate used by the project. Catalog IDs
and tax percentages are read from QuickBooks, and the gateway requires a THB company currency and
an exact VAT-rate match. It does not convert currencies or accept account names/rates supplied by
the browser. The editor can explicitly create a QuickBooks Estimate from a proposal, or create a
QuickBooks Invoice from an issued, unpaid ConstructFlow invoice. When the matching proposal was
already exported successfully as an Estimate, the user may link the invoice to that Estimate.
This stores a transaction relationship only: ConstructFlow still calculates and freezes the
installment, because the [QuickBooks Invoice API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice)
does not support progress-invoice allocation through the API. The operation creates the document
only and does not email the customer.

QuickBooks Customers are matched by exact normalized email; if no match exists, an export creates
the Customer with the recipient name and email. Ambiguous duplicate email matches stop for manual
resolution. Export rows include frozen amounts, line descriptions, construction phase/cost center,
and source UUIDs, but not BIM geometry, field-form answers, GPS, or photos. The editor can explicitly
read QuickBooks Payments linked through `Line.LinkedTxn` to successfully exported ConstructFlow
Invoices, review candidate allocations, and select receipts to record through CommandBus. This
receipt import requires a THB company base currency, matches the gateway's successful export ledger,
and checks each invoice's remaining balance. It records accounting receipt history only: it does not
move funds, create a provider payment, or reverse/cancel a QuickBooks payment. Any invoice with a
recorded receipt remains blocked from export to avoid duplicate accounting entries. The gateway uses
Intuit `requestid` plus a durable export ledger; an uncertain result must be checked in QuickBooks,
and a retry uses the same request ID. If QBO calculates a different total, the export stays recorded
as created and is flagged for review rather than being created a second time. QBO's taxable-transaction
line limit is 750; larger proposals must be reduced before export. See Intuit's [Invoice API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice),
[Payment API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment),
and [API limits](https://static.developer.intuit.com/output_html/qbo/docs/learn/limits-and-throttles.html).

The editor currently describes built-in wall, column, beam, door and window commands, plus
AI-enabled commands contributed by registered SDK modules. AI asks for missing host/level/design
inputs instead of inventing them, while continuing with independent supported items. Final domain
validation remains authoritative.

For local use, the Plan Editor also supports **Continue with ChatGPT**. Install the local
gateway dependencies once, then run the gateway in a terminal while using the editor:

```bash
python -m pip install -r apps/mcp-server/requirements.txt
python apps/mcp-server/http_bridge.py
```

The gateway stays bound to loopback by default. Sign-in opens the system browser and returns to
the local gateway; access and refresh tokens are stored in the operating system credential store
(Windows Credential Manager, macOS Keychain, or Linux Secret Service/KWallet), never in browser
storage. The user chooses a model available to their ChatGPT account. Requests use the public
Responses API and are sent with `store: false`. If no OS credential store is available, the UI
reports that requirement and will not store credentials in a plain file. This local sign-in flow
is disabled when the gateway binds to a non-loopback host; Coolify continues to use its separate
server API-key profile.

คุณสามารถพิมพ์สั่งงานด้วยภาษาไทยหรืออังกฤษได้ทันที เช่น:
- *"สร้างเสา ค.ส.ล. 4 ต้น ขนาด 0.3x0.3 เมตร สูง 3.5 เมตร ที่พิกัด 0,0 และ 0,6 และ 4,0 และ 4,6"*
- *"สร้างกำแพงรอบห้อง 4x6 เมตร ความหนา 0.15 เมตร"*
- *"คำนวณถอดราคา BOQ ของโมเดลทั้งหมด"*
- *"ปรับ LOD โมเดลเป็น LOD 350"*

---

## 2. วิธีใช้งานผ่าน ChatGPT Web (chatgpt.com) ด้วย Custom GPT

หากต้องการพิมพ์สั่งงานบนหน้าเว็บหรือแอป ChatGPT มือถือ/ไอแพด ให้ใช้ **HTTP Bridge + OpenAPI**:

### 2.1 รัน HTTP Bridge
เปิด Terminal:
```bash
python apps/mcp-server/http_bridge.py
```
> Server จะรันที่ `http://localhost:8000` และมีสกีมา OpenAPI อยู่ที่ `http://localhost:8000/openapi.json`

### 2.2 เชื่อมต่อกับอินเทอร์เน็ต (เช่น ngrok หรือ Cloudflare Tunnel)
```bash
ngrok http 8000
```
จะได้ URL สาธารณะ เช่น `https://xxxx.ngrok-free.app`

### 2.3 สร้าง Custom GPT ใน ChatGPT
1. ไปที่ [chatgpt.com/gpts/create](https://chatgpt.com/gpts/create)
2. เลือกแท็บ **Configure**
3. เลื่อนลงมาที่หัวข้อ **Actions** -> กด **Create new action**
4. นำเนื้อหาจาก `http://localhost:8000/openapi.json` ไปวางในช่อง **Schema** (เปลี่ยน server url เป็น url จาก ngrok)
5. เริ่มคุยสั่งงาน SketchUp บนหน้าต่าง ChatGPT ได้ทันที!

---

## 3. วิธีใช้งานกับ Google Gemini

### 3.1 ติดตั้ง SDK
```bash
pip install google-genai websockets
```

### 3.2 ตั้งค่า API Key
export GEMINI_API_KEY="AIza..."
```

### 3.3 รัน Agent
```bash
python apps/mcp-server/gemini_agent.py
```

---

## 4. รายการคำสั่งที่ AI รองรับ (Supported Commands)

| Command Name | Description | Example Parameters |
|---|---|---|
| `DrawWall` | สร้างผนังอาคาร | `{"start_point": [0,0,0], "end_point": [4,0,0], "thickness": 0.15, "height": 3.0}` |
| `DrawColumn` | ปักเสาโครงสร้าง | `{"point": [0,0,0], "width": 0.3, "depth": 0.3, "height": 3.5}` |
| `DrawBeam` | วางคานเชื่อมหัวเสา | `{"start_point": [0,0,3.5], "end_point": [4,0,3.5], "width": 0.25, "depth": 0.5}` |
| `DrawFloor` | เทพื้น Slab | `{"boundary_points": [[0,0,0],[4,0,0],[4,6,0],[0,6,0]], "thickness": 0.15}` |
| `SwitchLOD` | สลับระดับรายละเอียด LOD | `{"lod": "lod100" | "lod200" | "lod300" | "lod350" | "lod400"}` |
| `CalculateBOQ`| ถอดปริมาณงานและราคา | `{}` |
