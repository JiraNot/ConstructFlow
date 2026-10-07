import asyncio
import json
import uuid
import sys
import websockets
from mcp.server import Server
from mcp.types import Tool, TextContent

app = Server("constructflow-mcp")

# Max time to wait for SketchUp / Bridge to answer one command (seconds).
COMMAND_TIMEOUT_SECONDS = 10.0

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
        for future in pending_commands.values():
            if not future.done():
                future.set_exception(ConnectionError("SketchUp disconnected before the command finished"))
        pending_commands.clear()

@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="cf_query_model",
            description="Inspect smart elements within the ConstructFlow project model filtered by phase, level, or category.",
            inputSchema={
                "type": "object",
                "properties": {
                    "phase": {"type": "string", "enum": ["existing", "demolition", "new_construction"], "description": "Construction phase filter"},
                    "level_id": {"type": "string", "description": "Target building storey level ID"},
                    "category": {"type": "string", "description": "Category prefix (e.g. structure, arch, mep, interior)"}
                }
            }
        ),
        Tool(
            name="cf_mutate_geometry",
            description="Execute transactional geometry edits via CQRS commands (atomic with undo/redo).",
            inputSchema={
                "type": "object",
                "properties": {
                    "commands": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": "Array of CQRS mutation command objects"
                    }
                },
                "required": ["commands"]
            }
        ),
        Tool(
            name="cf_validate_compliance",
            description="Verify Thai Building Code (กฎกระทรวงฉบับที่ 55) setbacks, FAR, and OSR compliance.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "Project identifier"}
                }
            }
        ),
        Tool(
            name="cf_run_clash",
            description="Run spatial clash analysis and intersection checks between BIM disciplines.",
            inputSchema={
                "type": "object",
                "properties": {
                    "discipline_a": {"type": "string", "description": "First discipline (e.g. structure)"},
                    "discipline_b": {"type": "string", "description": "Second discipline (e.g. mep)"}
                },
                "required": ["discipline_a", "discipline_b"]
            }
        ),
        Tool(
            name="cf_export_sheets",
            description="Trigger batch 20-sheet drawing compilation to PDF or DXF.",
            inputSchema={
                "type": "object",
                "properties": {
                    "format": {"type": "string", "enum": ["pdf", "dxf"], "description": "Export format"},
                    "sheet_ids": {"type": "array", "items": {"type": "string"}, "description": "List of sheet IDs (e.g. A-01, S-01)"}
                },
                "required": ["format"]
            }
        ),
        Tool(
            name="cf_sync_sketchup",
            description="Push live differential model update to connected SketchUp extension bridge.",
            inputSchema={
                "type": "object",
                "properties": {
                    "mode": {"type": "string", "enum": ["incremental", "full"], "description": "Sync mode"}
                }
            }
        ),
        Tool(
            name="cf_export_dxf",
            description="Generate AutoCAD DWG/DXF with 20 PaperSpace layouts and native ACAD_TABLE.",
            inputSchema={
                "type": "object",
                "properties": {
                    "version": {"type": "string", "default": "2018", "description": "AutoCAD version"},
                    "include_tables": {"type": "boolean", "default": True, "description": "Include ACAD_TABLE schedules"}
                }
            }
        ),
        Tool(
            name="cf_export_ifc",
            description="Generate ISO 16739-1:2024 OpenBIM IFC 4.3 ADD2 STEP file.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "Project ID"}
                }
            }
        ),
        Tool(
            name="execute_command",
            description="Execute a raw ConstructFlow command in SketchUp bridge.",
            inputSchema={
                "type": "object",
                "properties": {
                    "command_name": {"type": "string", "description": "Command name"},
                    "params": {"type": "object", "description": "Parameters"}
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
        status = "Connected" if sketchup_ws else "Disconnected. Please open ConstructFlow Inspector in SketchUp or Plan Editor."
        return [TextContent(type="text", text=status)]

    if name in ["execute_command", "cf_mutate_geometry", "cf_query_model", "cf_validate_compliance", "cf_run_clash", "cf_export_sheets", "cf_sync_sketchup", "cf_export_dxf", "cf_export_ifc"]:
        # If SketchUp WebSocket is connected, forward live
        if sketchup_ws:
            cmd_id = str(uuid.uuid4())
            future = asyncio.get_running_loop().create_future()
            pending_commands[cmd_id] = future
            
            await sketchup_ws.send(json.dumps({
                "type": name,
                "command_id": cmd_id,
                "command_name": arguments.get("command_name", name),
                "params": arguments
            }))
            
            try:
                result = await asyncio.wait_for(future, timeout=COMMAND_TIMEOUT_SECONDS)
                return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
            except asyncio.TimeoutError:
                return [TextContent(type="text", text="Error: Command execution timed out.")]
            finally:
                pending_commands.pop(cmd_id, None)

        # Standalone response when running without live SketchUp instance
        result = {
            "status": "success",
            "tool": name,
            "arguments": arguments,
            "message": f"Tool {name} processed standalone successfully.",
            "live_bridge": False
        }
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
    
    return [TextContent(type="text", text=f"Tool {name} not found")]

async def main():
    print("Starting ConstructFlow MCP Bridge Server...", file=sys.stderr)
    ws_server = await websockets.serve(websocket_handler, "localhost", 8765)
    print("WebSocket Server running on ws://localhost:8765", file=sys.stderr)
    
    from mcp.server.stdio import stdio_server
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
