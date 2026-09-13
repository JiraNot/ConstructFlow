import asyncio
import json
import uuid
import os
import sys
import websockets

try:
    from openai import OpenAI
except ImportError:
    print("Please install the OpenAI library: pip install openai websockets")
    sys.exit(1)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

async def send_command_to_sketchup(command_name: str, params: dict):
    """Sends a command to the SketchUp ConstructFlow WebSocket bridge."""
    try:
        async with websockets.connect("ws://localhost:8765") as websocket:
            cmd_id = str(uuid.uuid4())
            payload = {
                "type": "execute_command",
                "command_id": cmd_id,
                "command_name": command_name,
                "params": params
            }
            await websocket.send(json.dumps(payload))
            print(f"📡 [ConstructFlow Bridge] Dispatching '{command_name}' to SketchUp...")
            
            # Wait for response from SketchUp
            response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
            return json.loads(response)
    except ConnectionRefusedError:
        return {"error": "Connection refused. Please make sure server.py and SketchUp ConstructFlow Inspector are open."}
    except Exception as e:
        return {"error": str(e)}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "execute_constructflow_command",
            "description": "Executes a BIM command directly inside Trimble SketchUp via ConstructFlow extension.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command_name": {
                        "type": "string",
                        "description": "ConstructFlow command name, e.g. 'DrawWall', 'DrawColumn', 'DrawBeam', 'DrawFloor', 'CalculateBOQ', 'SwitchLOD', 'RunCustomScript'."
                    },
                    "params": {
                        "type": "object",
                        "description": "Parameters for the command (e.g. dimensions, coordinates, LOD level, etc.)"
                    }
                },
                "required": ["command_name", "params"]
            }
        }
    }
]

SYSTEM_PROMPT = """You are an intelligent BIM Architectural Assistant integrated directly with Trimble SketchUp via the ConstructFlow extension.
You can execute commands in SketchUp in real time using the tool 'execute_constructflow_command'.

Supported commands:
1. 'DrawWall': Draw architectural walls.
   Params: { 'start_point': [x, y, z], 'end_point': [x, y, z], 'thickness': 0.15, 'height': 3.0 } (coordinates and dimensions in meters)
2. 'DrawColumn': Place a structural or architectural column.
   Params: { 'point': [x, y, z], 'width': 0.3, 'depth': 0.3, 'height': 3.5 }
3. 'DrawBeam': Place a structural beam.
   Params: { 'start_point': [x, y, z], 'end_point': [x, y, z], 'width': 0.25, 'depth': 0.5 }
4. 'DrawFloor': Create a floor slab.
   Params: { 'boundary_points': [[x1, y1, z1], [x2, y2, z2], ...], 'thickness': 0.15 }
5. 'SwitchLOD': Switch the Level of Development / Detail for selected or all elements.
   Params: { 'lod': 'lod100' | 'lod200' | 'lod300' | 'lod350' | 'lod400' }
6. 'CalculateBOQ': Calculate Bill of Quantities / material takeoff.
   Params: {}

When the user asks you to model, design, or modify objects in SketchUp, choose the appropriate tool parameters and execute them. Always explain to the user in Thai what actions you have performed.
"""

def chat_loop():
    api_key = OPENAI_API_KEY
    if not api_key:
        print("⚠️ Warning: OPENAI_API_KEY environment variable is not set.")
        api_key = input("Please enter your OpenAI API Key: ").strip()

    client = OpenAI(api_key=api_key)
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]
    
    print("\n" + "="*60)
    print("🤖 ChatGPT / Codex Agent for ConstructFlow (SketchUp)")
    print("="*60)
    print("ตัวอย่างคำสั่ง:")
    print(" - 'สร้างเสา 4 ต้น ขนาด 0.3x0.3 เมตร สูง 3.5 เมตร ที่มุม 0,0 ถึง 4,6'")
    print(" - 'สร้างกำแพงล้อมรอบห้อง 4x6 เมตร'")
    print(" - 'คำนวณ BOQ ถอดราคาทั้งหมด'")
    print(" - 'สลับ LOD เป็น LOD 350'")
    print("พิมพ์ 'exit' เพื่อออก\n")
    
    while True:
        try:
            user_input = input("\n👤 คุณ: ").strip()
            if not user_input:
                continue
            if user_input.lower() in ["exit", "quit", "q"]:
                print("👋 ลาก่อน!")
                break
                
            messages.append({"role": "user", "content": user_input})
            print("⏳ ChatGPT กำลังประมวลผล...")
            
            # Request completion with tool calling
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                tools=TOOLS,
                tool_choice="auto"
            )
            
            response_msg = response.choices[0].message
            messages.append(response_msg)
            
            # Check if model wants to call tools
            if response_msg.tool_calls:
                for tool_call in response_msg.tool_calls:
                    func_name = tool_call.function.name
                    func_args = json.loads(tool_call.function.arguments)
                    
                    if func_name == "execute_constructflow_command":
                        cmd_name = func_args.get("command_name")
                        params = func_args.get("params", {})
                        
                        print(f"⚙️ สั่งงาน SketchUp: {cmd_name} พร้อมพารามิเตอร์ {params}")
                        result = asyncio.run(send_command_to_sketchup(cmd_name, params))
                        
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(result, ensure_ascii=False)
                        })
                
                # Second turn to summarize result
                second_response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages
                )
                final_text = second_response.choices[0].message.content
                messages.append(second_response.choices[0].message)
                print(f"\n🤖 ChatGPT: {final_text}")
            else:
                print(f"\n🤖 ChatGPT: {response_msg.content}")
                
        except KeyboardInterrupt:
            print("\n👋 สิ้นสุดการทำงาน")
            break
        except Exception as e:
            print(f"❌ เกิดข้อผิดพลาด: {e}")

if __name__ == "__main__":
    chat_loop()
