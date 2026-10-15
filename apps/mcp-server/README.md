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

For a remote deployment, terminate TLS at a reverse proxy, route `/api/ai/plan` to this gateway,
and serve the editor with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` so the isolated extension worker can use its bounded
asynchronous RPC channel. Keep the editor's Content-Security-Policy `connect-src` same-origin by
using that reverse proxy. Set `CONSTRUCTFLOW_HTTP_HOST` to the private interface behind the proxy,
`CONSTRUCTFLOW_AI_ALLOWED_ORIGINS` to the exact editor origins, and use a random
`CONSTRUCTFLOW_AI_TOKEN` of at least 32 characters. Non-loopback binding also requires the provider
key at startup. Do not expose the plain HTTP listener directly to the public internet.

The legacy `/api/command` SketchUp route separately requires `CONSTRUCTFLOW_BRIDGE_TOKEN`; it is
not enabled by merely starting the AI gateway. The route shares the exact-origin CORS allowlist.

The editor currently describes built-in wall, column, beam, door and window commands, plus
AI-enabled commands contributed by registered SDK modules. AI asks for missing host/level/design
inputs instead of inventing them. Final domain validation remains authoritative.

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
```bash
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
