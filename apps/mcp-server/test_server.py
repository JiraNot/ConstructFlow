"""Tests for the ConstructFlow MCP bridge server (apps/mcp-server/server.py).

Run directly (no third-party deps required):

    python test_server.py

The heavy imports (mcp, websockets) are stubbed when missing so the pure
async logic of server.py can be exercised with a plain Python install.
"""

import asyncio
import importlib
import json
import sys
import types
import unittest


class _FakeMcpServer:
    """Minimal stand-in for mcp.server.Server that records handlers."""

    def __init__(self, name):
        self.name = name
        self.list_tools_handler = None
        self.call_tool_handler = None

    def list_tools(self):
        def decorator(fn):
            self.list_tools_handler = fn
            return fn
        return decorator

    def call_tool(self):
        def decorator(fn):
            self.call_tool_handler = fn
            return fn
        return decorator

    async def run(self, _read_stream, _write_stream, _options):  # pragma: no cover
        raise NotImplementedError("not used in tests")


def _ensure_importable():
    """Stub mcp/websockets when the real packages are not installed."""
    if "websockets" not in sys.modules:
        try:
            importlib.import_module("websockets")
        except ImportError:
            stub = types.ModuleType("websockets")
            stub.serve = lambda *args, **kwargs: None
            stub.exceptions = types.SimpleNamespace(ConnectionClosed=Exception)
            sys.modules["websockets"] = stub
    try:
        importlib.import_module("mcp.server")
        importlib.import_module("mcp.types")
    except ImportError:
        mcp_pkg = types.ModuleType("mcp")
        server_mod = types.ModuleType("mcp.server")
        types_mod = types.ModuleType("mcp.types")
        types_mod.Tool = dict
        types_mod.TextContent = dict
        server_mod.Server = _FakeMcpServer
        mcp_pkg.server = server_mod
        mcp_pkg.types = types_mod
        sys.modules["mcp"] = mcp_pkg
        sys.modules["mcp.server"] = server_mod
        sys.modules["mcp.types"] = types_mod


_ensure_importable()
import server  # noqa: E402  (apps/mcp-server/server.py, same directory)


class FakeWebSocket:
    def __init__(self):
        self.sent = []
        self.closed = False

    async def send(self, payload):
        self.sent.append(json.loads(payload))

    def deliver_result(self, command_id, text="ok"):
        """Simulate SketchUp answering one command."""
        server.pending_commands[command_id].set_result({"status": "success", "text": text})


class McpBridgeServerTest(unittest.TestCase):
    def setUp(self):
        server.sketchup_ws = None
        server.pending_commands.clear()

    def tearDown(self):
        server.sketchup_ws = None
        server.pending_commands.clear()

    def test_get_status_reports_disconnected_without_client(self):
        result = asyncio.run(server.app.call_tool_handler("get_status", {}))

        self.assertIn("Disconnected", result[0]["text"])

    def test_get_status_reports_connected_with_client(self):
        server.sketchup_ws = FakeWebSocket()

        result = asyncio.run(server.app.call_tool_handler("get_status", {}))

        self.assertIn("Connected", result[0]["text"])

    def test_execute_command_round_trip(self):
        ws = FakeWebSocket()
        server.sketchup_ws = ws

        async def scenario():
            task = asyncio.create_task(
                server.app.call_tool_handler("execute_command", {"command_name": "CreateLevel", "params": {}})
            )
            await asyncio.sleep(0.01)
            request = ws.sent[0]
            self.assertEqual(request["type"], "execute_command")
            self.assertEqual(request["command_name"], "CreateLevel")
            ws.deliver_result(request["command_id"])
            return await task

        result = asyncio.run(scenario())
        payload = json.loads(result[0]["text"])
        self.assertEqual(payload["status"], "success")
        self.assertEqual(server.pending_commands, {}, "finished command must be cleaned up")

    def test_execute_command_times_out_without_answer(self):
        original_timeout = server.COMMAND_TIMEOUT_SECONDS
        server.COMMAND_TIMEOUT_SECONDS = 0.05
        server.sketchup_ws = FakeWebSocket()
        try:
            result = asyncio.run(
                server.app.call_tool_handler("execute_command", {"command_name": "CreateLevel", "params": {}})
            )
        finally:
            server.COMMAND_TIMEOUT_SECONDS = original_timeout

        self.assertIn("timed out", result[0]["text"])
        self.assertEqual(server.pending_commands, {}, "timed-out command must be cleaned up")

    def test_disconnect_fails_pending_commands_and_clears_state(self):
        ws = FakeWebSocket()
        server.sketchup_ws = ws

        async def scenario():
            task = asyncio.create_task(
                server.app.call_tool_handler("execute_command", {"command_name": "CreateLevel", "params": {}})
            )
            await asyncio.sleep(0.01)
            command_id = ws.sent[0]["command_id"]
            # Mimic websocket_handler's finally block on disconnect.
            for future in server.pending_commands.values():
                if not future.done():
                    future.set_exception(ConnectionError("SketchUp disconnected before the command finished"))
            server.pending_commands.clear()
            server.sketchup_ws = None
            with self.assertRaises(ConnectionError):
                await task
            return command_id

        asyncio.run(scenario())
        self.assertEqual(server.pending_commands, {})
        self.assertIsNone(server.sketchup_ws)


if __name__ == "__main__":
    unittest.main(verbosity=2)
