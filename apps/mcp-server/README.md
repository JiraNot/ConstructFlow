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
