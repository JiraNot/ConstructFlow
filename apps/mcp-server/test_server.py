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
import os
from unittest.mock import patch


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
import ai_provider  # noqa: E402
import http_bridge  # noqa: E402


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


    def test_list_tools_contains_all_bim_tools(self):
        tools = asyncio.run(server.app.list_tools_handler())
        tool_names = [t["name"] if isinstance(t, dict) else t.name for t in tools]
        self.assertIn("cf_query_model", tool_names)
        self.assertIn("cf_mutate_geometry", tool_names)
        self.assertIn("cf_standalone_mutate_geometry", tool_names)
        self.assertIn("cf_standalone_query_model", tool_names)
        self.assertIn("cf_standalone_calculate_takeoff", tool_names)
        self.assertIn("cf_standalone_run_coordination", tool_names)
        self.assertIn("cf_standalone_validate_compliance", tool_names)
        self.assertIn("cf_standalone_export_model", tool_names)
        self.assertIn("cf_standalone_history", tool_names)
        self.assertIn("cf_validate_compliance", tool_names)
        self.assertIn("cf_run_clash", tool_names)
        self.assertIn("cf_export_sheets", tool_names)
        self.assertIn("cf_sync_sketchup", tool_names)
        self.assertIn("cf_export_dxf", tool_names)
        self.assertIn("cf_export_ifc", tool_names)

    def test_standalone_tool_execution(self):
        result = asyncio.run(server.app.call_tool_handler("cf_export_dxf", {"version": "2018"}))
        payload = json.loads(result[0]["text"])
        self.assertEqual(payload["status"], "unavailable")
        self.assertEqual(payload["tool"], "cf_export_dxf")
        self.assertFalse(payload["live_bridge"])

    def test_standalone_mutation_calls_native_runtime_without_websocket(self):
        expected = {"status": "success", "committed": True, "project_json": "{\"ok\":true}"}
        with patch.object(server, "execute_standalone_runtime", return_value=expected) as runtime:
            result = asyncio.run(server.app.call_tool_handler("cf_standalone_mutate_geometry", {
                "project_json": "{}", "commands": [{"name": "NoOp", "input": {}}]
            }))
        runtime.assert_called_once()
        self.assertEqual(json.loads(result[0]["text"]), expected)

    def test_standalone_analysis_tools_dispatch_to_the_native_runtime(self):
        with patch.object(server, "execute_standalone_runtime", return_value={"status": "success"}) as runtime:
            for tool, operation in [
                ("cf_standalone_query_model", "query"),
                ("cf_standalone_calculate_takeoff", "takeoff"),
                ("cf_standalone_run_coordination", "coordination"),
                ("cf_standalone_validate_compliance", "legal_compliance"),
            ]:
                result = asyncio.run(server.app.call_tool_handler(tool, {"project_json": "{}"}))
                self.assertEqual(json.loads(result[0]["text"])["status"], "success")
                self.assertEqual(runtime.call_args.args[0]["operation"], operation)

    def test_standalone_export_tool_dispatches_to_native_runtime(self):
        expected = {"status": "success", "format": "ifc", "content": "ISO-10303-21;"}
        with patch.object(server, "execute_standalone_runtime", return_value=expected) as runtime:
            result = asyncio.run(server.app.call_tool_handler("cf_standalone_export_model", {
                "project_json": "{}", "format": "ifc"
            }))
        runtime.assert_called_once_with({"project_json": "{}", "format": "ifc", "operation": "export"})
        self.assertEqual(json.loads(result[0]["text"]), expected)

    def test_standalone_history_tool_dispatches_action_to_native_runtime(self):
        expected = {"status": "success", "operation": "undo", "can_redo": True}
        arguments = {"project_json": "{}", "history": {"past": [], "future": []}, "action": "undo"}
        with patch.object(server, "execute_standalone_runtime", return_value=expected) as runtime:
            result = asyncio.run(server.app.call_tool_handler("cf_standalone_history", arguments))
        runtime.assert_called_once_with({"project_json": "{}", "history": {"past": [], "future": []}, "action": "undo", "operation": "undo"})
        self.assertEqual(json.loads(result[0]["text"]), expected)

    def test_ai_gateway_builds_a_schema_bounded_plan_without_exposing_provider_secrets(self):
        provider_body = {"choices": [{"message": {"content": json.dumps({
            "summary": "เพิ่มผนังหนึ่งช่วง",
            "questions": [],
            "commands": [{"name": "CreateWall", "input": {"start_point_mm": [0, 0], "end_point_mm": [4000, 0], "thickness_mm": 100, "height_mm": 2800}}],
        })}}]}

        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self): return json.dumps(provider_body).encode("utf-8")

        descriptors = [{
            "name": "CreateWall", "version": 1, "owner_module": "constructflow.architecture",
            "ai_allowed": True, "confirmation": "none",
            "input_schema": {"type": "object", "properties": {"start_point_mm": {"type": "array"}}},
        }]
        with patch.dict(os.environ, {"OPENAI_API_KEY": "server-only-secret", "CONSTRUCTFLOW_AI_MODEL": "test-model"}), \
             patch.object(ai_provider, "urlopen", return_value=FakeResponse()) as send:
            result = ai_provider.generate_command_plan({
                "prompt": "สร้างผนังยาว 4 เมตร",
                "project_context": {"active_level_id": "GF"},
                "command_descriptors": descriptors,
            })
        self.assertEqual(result["commands"][0]["name"], "CreateWall")
        request = send.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer server-only-secret")
        self.assertNotIn("server-only-secret", request.data.decode("utf-8"))
        self.assertEqual(json.loads(request.data)["model"], "test-model")

    def test_ai_gateway_rejects_unregistered_provider_commands(self):
        provider_body = {"choices": [{"message": {"content": json.dumps({
            "summary": "unsupported", "questions": [], "commands": [{"name": "DeleteObject", "input": {"object_id": "x"}}],
        })}}]}

        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self): return json.dumps(provider_body).encode("utf-8")

        with patch.dict(os.environ, {"OPENAI_API_KEY": "server-only-secret"}), \
             patch.object(ai_provider, "urlopen", return_value=FakeResponse()):
            with self.assertRaisesRegex(ai_provider.AIPlanError, "unregistered command"):
                ai_provider.generate_command_plan({
                    "prompt": "delete all objects",
                    "project_context": {},
                    "command_descriptors": [{
                        "name": "CreateWall", "ai_allowed": True,
                        "input_schema": {"type": "object", "properties": {}},
                    }],
                })

    def test_ai_gateway_requires_explicit_local_credentials_and_bounded_context(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            with self.assertRaisesRegex(ai_provider.AIPlanError, "Set OPENAI_API_KEY"):
                ai_provider.generate_command_plan({
                    "prompt": "Create a wall",
                    "project_context": {},
                    "command_descriptors": [{
                        "name": "CreateWall", "ai_allowed": True,
                        "input_schema": {"type": "object", "properties": {}},
                    }],
                })

    def test_ai_gateway_token_comparison_rejects_missing_or_wrong_tokens(self):
        self.assertFalse(http_bridge.ai_gateway_authorized("", "secret"))
        self.assertFalse(http_bridge.ai_gateway_authorized("Bearer wrong", "secret"))
        self.assertFalse(http_bridge.ai_gateway_authorized("Bearer secret", ""))
        self.assertTrue(http_bridge.ai_gateway_authorized("Bearer secret", "secret"))
        with self.assertRaisesRegex(ai_provider.AIPlanError, "bounded object"):
            ai_provider.generate_command_plan({
                "prompt": "Create a wall",
                "project_context": {"oversized": "x" * (ai_provider.MAX_CONTEXT_BYTES + 1)},
                "command_descriptors": [{
                    "name": "CreateWall", "ai_allowed": True,
                    "input_schema": {"type": "object", "properties": {}},
                }],
            })

if __name__ == "__main__":
    unittest.main(verbosity=2)
