import asyncio
import json
import uuid
import os
import websockets

# You must install the Gemini SDK: pip install google-genai
from google import genai
from google.genai import types

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_API_KEY_HERE")

async def send_command_to_sketchup(command_name: str, params: dict):
    """Sends a command to the SketchUp WebSocket bridge."""
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
            print(f"Sent command to SketchUp: {command_name}")
            
            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
            return json.loads(response)
    except Exception as e:
        return {"error": str(e)}

def execute_constructflow_command(command_name: str, params_json: str) -> str:
    """
    Execute a ConstructFlow command in SketchUp.
    
    Args:
        command_name: The name of the command (e.g. DrawWall, UpdateProperty)
        params_json: A JSON string of the parameters to send.
    """
    try:
        params = json.loads(params_json)
        result = asyncio.run(send_command_to_sketchup(command_name, params))
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})

async def main():
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    # We define the tool for Gemini
    tools = [execute_constructflow_command]
    
    print("🤖 Gemini Agent for ConstructFlow Started!")
    print("Type your request (e.g. 'สร้างกำแพงยาว 5 เมตรให้หน่อย'). Type 'exit' to quit.")
    
    chat = client.chats.create(
        model="gemini-2.5-flash",
        config=types.GenerateContentConfig(
            tools=tools,
            system_instruction="You are a BIM assistant. Use execute_constructflow_command to control SketchUp.",
            temperature=0.2
        )
    )
    
    while True:
        user_input = input("\nYou: ")
        if user_input.lower() in ["exit", "quit"]:
            break
            
        print("Gemini is thinking...")
        response = chat.send_message(user_input)
        print(f"🤖 Gemini: {response.text}")

if __name__ == "__main__":
    asyncio.run(main())
