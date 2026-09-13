import asyncio
import json
import uuid
import sys
import websockets
from mcp.server import Server
from mcp.types import Tool, TextContent

app = Server("constructflow-mcp")

# Global state for WebSocket connection to SketchUp
sketchup_ws = None
pending_commands = {}

async def websocket_handler(websocket):
    global sketchup_ws
    sketchup_ws = websocket
    print("SketchUp connected!", file=sys.stderr)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get("type") == "command_result":
                    cmd_id = data.get("command_id")
                    if cmd_id in pending_commands:
                        pending_commands[cmd_id].set_result(data)
            except json.JSONDecodeError:
                print("Failed to parse websocket message", file=sys.stderr)
    except websockets.exceptions.ConnectionClosed:
        print("SketchUp disconnected", file=sys.stderr)
    finally:
        sketchup_ws = None

@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="execute_command",
            description="Execute a ConstructFlow command in SketchUp. Commonly used to create or modify Smart Objects.",
            inputSchema={
                "type": "object",
                "properties": {
                    "command_name": {"type": "string", "description": "The name of the command to execute (e.g. DrawWall, UpdateProperty)"},
                    "params": {"type": "object", "description": "JSON object containing parameters for the command"}
                },
                "required": ["command_name", "params"]
            }
        ),
        Tool(
            name="get_status",
            description="Check if ConstructFlow is currently connected via WebSocket.",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    global sketchup_ws
    
    if name == "get_status":
        status = "Connected" if sketchup_ws else "Disconnected. Please open ConstructFlow Inspector in SketchUp."
        return [TextContent(type="text", text=status)]

    if name == "execute_command":
        if not sketchup_ws:
            return [TextContent(type="text", text="Error: SketchUp is not connected to the MCP server. Please open SketchUp and the ConstructFlow Inspector.")]
            
        cmd_id = str(uuid.uuid4())
        future = asyncio.get_running_loop().create_future()
        pending_commands[cmd_id] = future
        
        await sketchup_ws.send(json.dumps({
            "type": "execute_command",
            "command_id": cmd_id,
            "command_name": arguments["command_name"],
            "params": arguments["params"]
        }))
        
        try:
            # Wait for SketchUp to respond, max 10 seconds
            result = await asyncio.wait_for(future, timeout=10.0)
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        except asyncio.TimeoutError:
            return [TextContent(type="text", text="Error: Command execution timed out.")]
        finally:
            pending_commands.pop(cmd_id, None)
    
    return [TextContent(type="text", text=f"Tool {name} not found")]

async def main():
    print("Starting ConstructFlow MCP Bridge Server...", file=sys.stderr)
    
    # Start the WebSocket server in the background on port 8765
    ws_server = await websockets.serve(websocket_handler, "localhost", 8765)
    print("WebSocket Server running on ws://localhost:8765", file=sys.stderr)
    
    # Run the MCP server over stdio
    from mcp.server.stdio import stdio_server
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
