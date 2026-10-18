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
import threading
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
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
            def read(self, size=-1): return json.dumps(provider_body).encode("utf-8")[:size]

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

    def test_ai_gateway_requires_https_for_remote_provider_and_bounds_response_size(self):
        request_data = {
            "prompt": "test plan",
            "project_context": {"active_level_id": "GF"},
            "command_descriptors": [{"name": "CreateWall", "ai_allowed": True, "input_schema": {"type": "object", "properties": {}}}],
        }
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "CONSTRUCTFLOW_AI_BASE_URL": "http://provider.example/v1/chat/completions"}):
            with self.assertRaisesRegex(ai_provider.AIPlanError, "must use HTTPS"):
                ai_provider.generate_command_plan(request_data)

        class OversizedResponse:
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self, size=-1): return b"x" * size

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "CONSTRUCTFLOW_AI_BASE_URL": "http://127.0.0.1:8001/v1/chat/completions"}), \
             patch.object(ai_provider, "urlopen", return_value=OversizedResponse()):
            with self.assertRaisesRegex(ai_provider.AIProviderError, "1 MB limit"):
                ai_provider.generate_command_plan(request_data)

    def test_ai_gateway_rejects_unregistered_provider_commands(self):
        provider_body = {"choices": [{"message": {"content": json.dumps({
            "summary": "unsupported", "questions": [], "commands": [{"name": "DeleteObject", "input": {"object_id": "x"}}],
        })}}]}

        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self, size=-1): return json.dumps(provider_body).encode("utf-8")[:size]

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

    def test_gateway_public_binding_requires_provider_credentials_strong_token_and_exact_origins(self):
        with patch.dict(os.environ, {"CONSTRUCTFLOW_AI_TOKEN": "short", "OPENAI_API_KEY": "", "CONSTRUCTFLOW_AI_ALLOWED_ORIGINS": "*"}, clear=False):
            with self.assertRaisesRegex(RuntimeError, r"32\+ character"):
                http_bridge.validate_gateway_binding("0.0.0.0")
        with patch.dict(os.environ, {
            "CONSTRUCTFLOW_AI_TOKEN": "x" * 40,
            "OPENAI_API_KEY": "server-only-secret",
            "CONSTRUCTFLOW_AI_ALLOWED_ORIGINS": "https://editor.constructflow.example",
        }, clear=False):
            http_bridge.validate_gateway_binding("0.0.0.0")
        with patch.dict(os.environ, {
            "CONSTRUCTFLOW_AI_TOKEN": "x" * 40,
            "OPENAI_API_KEY": "server-only-secret",
            "CONSTRUCTFLOW_AI_ALLOWED_ORIGINS": "*",
        }, clear=False):
            with self.assertRaisesRegex(RuntimeError, r"exact http\(s\) origins"):
                http_bridge.validate_gateway_binding("0.0.0.0")

    def test_http_ai_gateway_authenticates_restricts_origins_and_returns_provider_plan(self):
        server_http = ThreadingHTTPServer(("127.0.0.1", 0), http_bridge.BridgeHandler)
        thread = threading.Thread(target=server_http.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.dict(os.environ, {
                "CONSTRUCTFLOW_HTTP_HOST": "0.0.0.0",  # Exercise the API-key gateway, not local ChatGPT sign-in.
                "CONSTRUCTFLOW_AI_TOKEN": "test-secret-token",
                "CONSTRUCTFLOW_AI_ALLOWED_ORIGINS": "http://localhost:5184",
            }, clear=False), patch.object(http_bridge, "generate_command_plan", return_value={
                "summary": "plan", "questions": [], "commands": [],
            }) as provider:
                request = Request(
                    f"http://127.0.0.1:{server_http.server_address[1]}/api/ai/plan",
                    data=b'{"prompt":"plan","project_context":{},"command_descriptors":[]}',
                    headers={"Content-Type": "application/json", "Authorization": "Bearer test-secret-token", "Origin": "http://localhost:5184"},
                    method="POST",
                )
                with urlopen(request, timeout=2) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:5184")
                    self.assertEqual(response.headers.get("Cache-Control"), "no-store")
                    self.assertEqual(json.loads(response.read()), {"summary": "plan", "questions": [], "commands": []})
                provider.assert_called_once()

                wrong_token = Request(
                    f"http://127.0.0.1:{server_http.server_address[1]}/api/ai/plan",
                    data=b"{}", headers={"Content-Type": "application/json", "Authorization": "Bearer wrong"}, method="POST",
                )
                with self.assertRaises(HTTPError) as unauthorized:
                    urlopen(wrong_token, timeout=2)
                self.assertEqual(unauthorized.exception.code, 401)

                bad_origin = Request(
                    f"http://127.0.0.1:{server_http.server_address[1]}/api/ai/plan",
                    data=b"{}", headers={"Content-Type": "application/json", "Authorization": "Bearer test-secret-token", "Origin": "https://attacker.example"}, method="POST",
                )
                with self.assertRaises(HTTPError) as forbidden:
                    urlopen(bad_origin, timeout=2)
                self.assertEqual(forbidden.exception.code, 403)
        finally:
            server_http.shutdown()
            server_http.server_close()
            thread.join(timeout=2)

    def test_http_gateway_runs_complete_openai_compatible_provider_roundtrip(self):
        received_provider_request = []
        provider_payload = {
            "choices": [{"message": {"content": json.dumps({
                "summary": "Create a wall",
                "questions": [],
                "commands": [{"name": "CreateWall", "input": {"start_point_mm": [0, 0], "end_point_mm": [4000, 0]}}],
            })}}],
        }

        class ProviderHandler(http_bridge.BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
                received_provider_request.append((self.headers.get("Authorization"), body))
                encoded = json.dumps(provider_payload).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def log_message(self, *_args):
                return

        provider_http = ThreadingHTTPServer(("127.0.0.1", 0), ProviderHandler)
        provider_thread = threading.Thread(target=provider_http.serve_forever, daemon=True)
        provider_thread.start()
        gateway_http = ThreadingHTTPServer(("127.0.0.1", 0), http_bridge.BridgeHandler)
        gateway_thread = threading.Thread(target=gateway_http.serve_forever, daemon=True)
        gateway_thread.start()
        try:
            with patch.dict(os.environ, {
                "CONSTRUCTFLOW_HTTP_HOST": "0.0.0.0",  # Exercise the API-key gateway, not local ChatGPT sign-in.
                "CONSTRUCTFLOW_AI_TOKEN": "test-secret-token",
                "CONSTRUCTFLOW_AI_ALLOWED_ORIGINS": "http://localhost:5184",
                "OPENAI_API_KEY": "server-only-key",
                "CONSTRUCTFLOW_AI_BASE_URL": f"http://127.0.0.1:{provider_http.server_address[1]}/v1/chat/completions",
                "CONSTRUCTFLOW_AI_MODEL": "test-model",
            }, clear=False):
                request = Request(
                    f"http://127.0.0.1:{gateway_http.server_address[1]}/api/ai/plan",
                    data=json.dumps({
                        "prompt": "สร้างผนัง",
                        "project_context": {"active_level_id": "GF"},
                        "drawing_attachments": [
                            {"filename": "floor.pdf", "mime_type": "application/pdf", "data_url": "data:application/pdf;base64,JVBERi0xLjQK", "source_page_numbers": [4, 5]},
                            {"filename": "plan.png", "mime_type": "image/png", "data_url": "data:image/png;base64,iVBORw0KGgo="},
                        ],
                        "command_descriptors": [{
                            "name": "CreateWall", "version": 1, "owner_module": "constructflow.architecture",
                            "ai_allowed": True, "confirmation": "none",
                            "input_schema": {"type": "object", "properties": {"start_point_mm": {"type": "array"}}},
                        }],
                    }).encode("utf-8"),
                    headers={"Content-Type": "application/json", "Authorization": "Bearer test-secret-token", "Origin": "http://localhost:5184"},
                    method="POST",
                )
                with urlopen(request, timeout=3) as response:
                    result = json.loads(response.read())
                self.assertEqual(result["commands"][0]["name"], "CreateWall")
                self.assertEqual(len(received_provider_request), 1)
                provider_auth, body = received_provider_request[0]
                self.assertEqual(provider_auth, "Bearer server-only-key")
                self.assertEqual(body["model"], "test-model")
                system_instructions = body["messages"][0]["content"]
                self.assertIn("multi-page PDF", system_instructions)
                self.assertIn("PDF page number", system_instructions)
                self.assertIn("ask the user to choose", system_instructions)
                user_content = body["messages"][1]["content"]
                self.assertIsInstance(user_content, list)
                self.assertIn("CreateWall", user_content[0]["text"])
                self.assertEqual(user_content[1]["type"], "file")
                self.assertEqual(user_content[1]["file"]["filename"], "floor.pdf")
                self.assertEqual(user_content[1]["file"]["file_data"], "data:application/pdf;base64,JVBERi0xLjQK")
                self.assertIn('"source_page_numbers": [4, 5]', user_content[0]["text"])
                self.assertEqual(user_content[2]["type"], "image_url")
                self.assertEqual(user_content[2]["image_url"]["url"], "data:image/png;base64,iVBORw0KGgo=")
                self.assertNotIn("server-only-key", json.dumps(body))
        finally:
            gateway_http.shutdown()
            gateway_http.server_close()
            gateway_thread.join(timeout=2)
            provider_http.shutdown()
            provider_http.server_close()
            provider_thread.join(timeout=2)

    def test_drawing_attachment_validation_rejects_malformed_type_count_and_total_size(self):
        import ai_provider

        with self.assertRaises(ai_provider.AIPlanError):
            ai_provider.validate_drawing_attachments({
                "filename": "plan.png", "mime_type": "image/png", "data_url": "data:image/png;base64,JVBERi0xLjQK",
            })
        with self.assertRaises(ai_provider.AIPlanError):
            ai_provider.validate_drawing_attachments([
                {"filename": f"{index}.pdf", "mime_type": "application/pdf", "data_url": "data:application/pdf;base64,JVBERi0xLjQK"}
                for index in range(9)
            ])
        too_large = "A" * (((20 * 1024 * 1024) * 4 // 3) + 4)
        with self.assertRaises(ai_provider.AIPlanError):
            ai_provider.validate_drawing_attachments({
                "filename": "large.pdf", "mime_type": "application/pdf", "data_url": f"data:application/pdf;base64,{too_large}",
            })

if __name__ == "__main__":
    unittest.main(verbosity=2)
