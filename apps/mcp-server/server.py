import asyncio
import json
import os
import subprocess
import uuid
import sys
from pathlib import Path
import websockets
from mcp.server import Server
from mcp.types import Tool, TextContent

app = Server("constructflow-mcp")

# Max time to wait for SketchUp / Bridge to answer one command (seconds).
COMMAND_TIMEOUT_SECONDS = 10.0

# Global state for WebSocket connection to SketchUp
sketchup_ws = None
pending_commands = {}

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
STANDALONE_RUNTIME = REPOSITORY_ROOT / "apps" / "mcp-server" / "standalone_runtime.mjs"

def execute_standalone_runtime(arguments):
    """Execute an AI command batch through the same TypeScript runtime as Plan Editor."""
    node = os.environ.get("CONSTRUCTFLOW_NODE", "node")
    try:
        completed = subprocess.run(
            [node, str(STANDALONE_RUNTIME)],
            input=json.dumps(arguments, ensure_ascii=False),
            text=True,
            capture_output=True,
            cwd=REPOSITORY_ROOT,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"status": "unavailable", "committed": False, "errors": [str(error)]}
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError:
        detail = completed.stderr.strip() or "Standalone command runtime returned invalid JSON"
        return {"status": "failed", "committed": False, "errors": [detail]}
    if completed.returncode != 0 and result.get("status") == "success":
        return {"status": "failed", "committed": False, "errors": [completed.stderr.strip() or "Standalone command runtime failed"]}
    return result

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
            name="cf_standalone_mutate_geometry",
            description="Execute a bounded atomic batch through ConstructFlow's standalone TypeScript CommandBus. Supply the canonical .cfproj JSON and command requests; a rejected batch returns the original document unchanged.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_json": {"type": "string", "description": "Canonical .cfproj v1 or v2 JSON document"},
                    "commands": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 100,
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "input": {"type": "object"}
                            },
                            "required": ["name", "input"]
                        }
                    },
                    "history": {"type": "object", "description": "Caller-held history returned by the previous mutation or history operation."}
                },
                "required": ["project_json", "commands"]
            }
        ),
        Tool(
            name="cf_standalone_query_model",
            description="Read Smart Objects from canonical .cfproj JSON using the standalone model schema; optional filters are phase, level_id and category.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_json": {"type": "string"},
                    "filters": {
                        "type": "object",
                        "properties": {
                            "phase": {"type": "string", "enum": ["existing", "demolition", "new_construction"]},
                            "level_id": {"type": "string"},
                            "category": {"type": "string"}
                        }
                    },
                    "limit": {"type": "integer", "minimum": 1, "maximum": 5000, "default": 500}
                },
                "required": ["project_json"]
            }
        ),
        Tool(
            name="cf_standalone_calculate_takeoff",
            description="Calculate supported phased quantities from a canonical .cfproj through the standalone takeoff engine.",
            inputSchema={"type": "object", "properties": {"project_json": {"type": "string"}}, "required": ["project_json"]}
        ),
        Tool(
            name="cf_standalone_run_coordination",
            description="Run standalone geometry-aware clash and coordination analysis on a canonical .cfproj.",
            inputSchema={"type": "object", "properties": {"project_json": {"type": "string"}}, "required": ["project_json"]}
        ),
        Tool(
            name="cf_standalone_validate_compliance",
            description="Run the standalone Thai site and building legal compliance audit on a canonical .cfproj, with optional site and zoning inputs.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_json": {"type": "string"},
                    "options": {"type": "object", "description": "Optional road, waterway, land-fill and zoning inputs for the audit."}
                },
                "required": ["project_json"]
            }
        ),
        Tool(
            name="cf_standalone_export_model",
            description="Export a canonical .cfproj as native DXF, IFC 4.3 STEP, or Revit transfer JSON. This creates an interchange file; it does not synchronize a live external model.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_json": {"type": "string"},
                    "format": {"type": "string", "enum": ["dxf", "ifc", "revit_transfer"]},
                    "options": {"type": "object", "description": "Optional exporter metadata such as project name, author or organization."}
                },
                "required": ["project_json", "format"]
            }
        ),
        Tool(
            name="cf_standalone_history",
            description="Undo or redo one committed standalone command batch using the caller-held project JSON and history snapshot.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project_json": {"type": "string"},
                    "history": {
                        "type": "object",
                        "properties": {
                            "past": {"type": "array", "items": {"type": "string"}, "maxItems": 100},
                            "future": {"type": "array", "items": {"type": "string"}, "maxItems": 100}
                        },
                        "required": ["past", "future"]
                    },
                    "action": {"type": "string", "enum": ["undo", "redo"]}
                },
                "required": ["project_json", "history", "action"]
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

    if name == "cf_standalone_mutate_geometry":
        result = execute_standalone_runtime(arguments)
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
    if name in ["cf_standalone_query_model", "cf_standalone_calculate_takeoff", "cf_standalone_run_coordination", "cf_standalone_validate_compliance"]:
        operation = {
            "cf_standalone_query_model": "query",
            "cf_standalone_calculate_takeoff": "takeoff",
            "cf_standalone_run_coordination": "coordination",
            "cf_standalone_validate_compliance": "legal_compliance",
        }[name]
        result = execute_standalone_runtime({**arguments, "operation": operation})
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
    if name == "cf_standalone_export_model":
        result = execute_standalone_runtime({**arguments, "operation": "export"})
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
    if name == "cf_standalone_history":
        result = execute_standalone_runtime({**arguments, "operation": arguments["action"]})
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

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

        return [TextContent(type="text", text=json.dumps({
            "status": "unavailable",
            "tool": name,
            "message": "This tool requires the SketchUp WebSocket bridge. Use cf_standalone_mutate_geometry for native TypeScript CommandBus edits.",
            "live_bridge": False,
        }, ensure_ascii=False, indent=2))]
    
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
