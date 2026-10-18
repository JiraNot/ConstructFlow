import asyncio
import hmac
import json
import os
import uuid
import sys
import websockets
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import threading
from urllib.parse import urlparse
from ai_provider import AIPlanError, AIProviderError, generate_command_plan
import chatgpt_auth
from html import escape
from urllib.parse import parse_qs

# Configuration
HTTP_PORT = 8000
WS_URL = "ws://localhost:8765"

OPENAPI_SPEC = {
    "openapi": "3.1.0",
    "info": {
        "title": "ConstructFlow SketchUp AI Bridge",
        "description": "API for controlling Trimble SketchUp through the ConstructFlow BIM extension.",
        "version": "1.0.0"
    },
    "servers": [
        {
            "url": f"http://localhost:{HTTP_PORT}"
        }
    ],
    "paths": {
        "/api/status": {
            "get": {
                "summary": "Check SketchUp Connection Status",
                "description": "Verifies if ConstructFlow inside SketchUp is actively connected.",
                "responses": {
                    "200": {
                        "description": "Current connection status",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "status": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "/api/command": {
            "post": {
                "summary": "Execute ConstructFlow Command in SketchUp",
                "description": "Executes a BIM modeling or management command in SketchUp.",
                "security": [{"BridgeToken": []}],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["command_name"],
                                "properties": {
                                    "command_name": {
                                        "type": "string",
                                        "description": "BIM command to run: DrawWall, DrawColumn, DrawBeam, DrawFloor, SwitchLOD, CalculateBOQ"
                                    },
                                    "params": {
                                        "type": "object",
                                        "description": "Key-value parameters for the command (dimensions in meters, coordinates [x, y, z])"
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {
                        "description": "Command execution result",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object"
                                }
                            }
                        }
                    }
                }
            }
        },
        "/api/ai/plan": {
            "post": {
                "summary": "Draft a validated ConstructFlow command plan",
                "description": "Proposes commands from supplied project context and AI-eligible command descriptors. The editor must preview and confirm them through its CommandBus before execution.",
                "security": [{"GatewayToken": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["prompt", "project_context", "command_descriptors"],
                        "properties": {
                            "prompt": {"type": "string", "maxLength": 8000},
                            "project_context": {"type": "object"},
                            "command_descriptors": {"type": "array", "minItems": 1, "maxItems": 250},
                            "drawing_attachments": {"type": "array", "maxItems": 8, "description": "Optional user-selected PDF, JPG, or PNG drawings. Combined decoded size is limited to 20 MB."},
                        },
                    }}}
                },
                "responses": {
                    "200": {"description": "Structured command proposal; this endpoint does not execute commands."},
                    "401": {"description": "Invalid or missing gateway token."},
                    "422": {"description": "Invalid request or command plan."},
                },
            }
        }
    },
    "components": {"securitySchemes": {
        "GatewayToken": {"type": "http", "scheme": "bearer"},
        "BridgeToken": {"type": "http", "scheme": "bearer"},
    }}
}

def ai_gateway_authorized(authorization, expected_token):
    return bool(expected_token) and hmac.compare_digest(
        authorization or "", f"Bearer {expected_token}"
    )


def allowed_browser_origins():
    configured = os.environ.get("CONSTRUCTFLOW_AI_ALLOWED_ORIGINS", "").strip()
    if configured:
        origins = {origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()}
        if "*" in origins or any(urlparse(origin).scheme not in {"http", "https"} or not urlparse(origin).netloc or urlparse(origin).path for origin in origins):
            raise RuntimeError("CONSTRUCTFLOW_AI_ALLOWED_ORIGINS must contain exact http(s) origins without paths or wildcards")
        return origins
    return {"http://localhost:5183", "http://127.0.0.1:5183", "http://localhost:5184", "http://127.0.0.1:5184"}


def is_loopback_host(host):
    return host in {"127.0.0.1", "localhost", "::1"}


def validate_gateway_binding(host):
    if is_loopback_host(host):
        return
    token = os.environ.get("CONSTRUCTFLOW_AI_TOKEN", "").strip()
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if len(token) < 32 or not api_key:
        raise RuntimeError("Non-loopback gateway binding requires a 32+ character CONSTRUCTFLOW_AI_TOKEN and OPENAI_API_KEY")
    if not os.environ.get("CONSTRUCTFLOW_AI_ALLOWED_ORIGINS", "").strip():
        raise RuntimeError("Non-loopback gateway binding requires explicit CONSTRUCTFLOW_AI_ALLOWED_ORIGINS")
    allowed_browser_origins()


AI_REQUEST_LIMITER = threading.BoundedSemaphore(8)

async def send_to_sketchup(command_name, params):
    try:
        async with websockets.connect(WS_URL) as ws:
            cmd_id = str(uuid.uuid4())
            payload = {
                "type": "execute_command",
                "command_id": cmd_id,
                "command_name": command_name,
                "params": params
            }
            await ws.send(json.dumps(payload))
            res = await asyncio.wait_for(ws.recv(), timeout=12.0)
            return json.loads(res)
    except Exception as e:
        return {"error": str(e)}

class BridgeHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.request.settimeout(15)

    def _send_security_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")

    def _send_cors_headers(self):
        origin = self.headers.get("Origin", "").rstrip("/")
        if origin and origin in allowed_browser_origins():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "").rstrip("/")
        if origin and origin not in allowed_browser_origins():
            self.send_response(403)
            self._send_security_headers()
            self.end_headers()
            return
        self.send_response(204)
        self._send_cors_headers()
        self._send_security_headers()
        self.end_headers()

    def _json_response(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def _origin_is_allowed(self):
        origin = self.headers.get("Origin", "").rstrip("/")
        return not origin or origin in allowed_browser_origins()

    def _read_json_body(self, maximum_bytes):
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            raise AIPlanError("Content-Type must be application/json")
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise AIPlanError("Content-Length must be a valid integer") from error
        if content_length < 1 or content_length > maximum_bytes:
            raise AIPlanError(f"Request must be between 1 and {maximum_bytes} bytes")
        body = self.rfile.read(content_length)
        if len(body) != content_length:
            raise AIPlanError("Request body was incomplete")
        try:
            payload = json.loads(body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise AIPlanError("Request body must be valid UTF-8 JSON") from error
        if not isinstance(payload, dict):
            raise AIPlanError("Request body must be a JSON object")
        return payload

    def do_GET(self):
        if self.path == "/api/ai/auth/status" and not is_loopback_host(os.environ.get("CONSTRUCTFLOW_HTTP_HOST", "127.0.0.1")):
            self._json_response(200, {"mode": "gateway", "connected": False, "email": "", "name": "", "sharing": False})
            return
        if self.path.startswith("/api/ai/auth/") or self.path == "/api/ai/models":
            if not is_loopback_host(os.environ.get("CONSTRUCTFLOW_HTTP_HOST", "127.0.0.1")):
                self._json_response(404, {"error": "Local ChatGPT sign-in is disabled on remotely bound gateways"})
                return
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return

        if self.path == "/api/ai/auth/status":
            try:
                self._json_response(200, chatgpt_auth.auth_status())
            except chatgpt_auth.ChatGPTAuthError as error:
                self._json_response(503, {"error": str(error)})
            return

        if self.path == "/api/ai/models":
            try:
                self._json_response(200, {
                    "models": chatgpt_auth.list_models(),
                    "selected_model": chatgpt_auth.selected_model(),
                })
            except chatgpt_auth.ChatGPTAuthError as error:
                self._json_response(401, {"error": str(error)})
            return

        if self.path.startswith("/auth/callback?") or self.path == "/auth/callback":
            try:
                chatgpt_auth.finish_sign_in(parse_qs(urlparse(self.path).query, keep_blank_values=True))
                self._auth_callback_page("Connected to ChatGPT", "Your ConstructFlow AI connection is ready.", success=True)
            except chatgpt_auth.ChatGPTAuthError as error:
                self._auth_callback_page("ChatGPT sign-in did not finish", str(error), success=False)
            return

        if self.path == "/openapi.json":
            self._json_response(200, OPENAPI_SPEC)
            return

        if self.path == "/api/status":
            self._json_response(200, {"status": "running", "bridge": "ConstructFlow AI REST Gateway"})
            return

        self.send_response(404)
        self.end_headers()

    def _auth_callback_page(self, title, message, *, success):
        body = f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title><style>body{{font:16px system-ui,sans-serif;margin:10vh auto;max-width:34rem;padding:0 1.25rem;color:#172033}}h1{{font-size:1.35rem}}p{{line-height:1.6;color:#526077}}button{{padding:.65rem 1rem;border:0;border-radius:.5rem;background:#0f766e;color:white;font:inherit;cursor:pointer}}</style><h1>{escape(title)}</h1><p>{escape(message)}</p><p>{'Return to ConstructFlow; you can close this window.' if success else 'Return to ConstructFlow and try again.'}</p><button onclick="window.close()">Close window</button></html>""".encode("utf-8")
        self.send_response(200 if success else 400)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not self._origin_is_allowed():
            self._json_response(403, {"error": "Browser origin is not allowed"})
            return
        local_auth_mode = is_loopback_host(os.environ.get("CONSTRUCTFLOW_HTTP_HOST", "127.0.0.1"))
        if self.path.startswith("/api/ai/auth/") or self.path == "/api/ai/auth/model":
            if not local_auth_mode:
                self._json_response(404, {"error": "Local ChatGPT sign-in is disabled on remotely bound gateways"})
                return
            origin = self.headers.get("Origin", "").rstrip("/")
            if not origin or origin not in allowed_browser_origins():
                self._json_response(403, {"error": "A trusted local editor origin is required"})
                return
            if self.path == "/api/ai/auth/start":
                try:
                    authorization_url = chatgpt_auth.start_sign_in(origin)
                    self._json_response(200, {"authorization_url": authorization_url})
                except chatgpt_auth.ChatGPTAuthError as error:
                    self._json_response(503, {"error": str(error)})
                return
            if self.path == "/api/ai/auth/logout":
                try:
                    chatgpt_auth.sign_out()
                    self._json_response(200, {"signed_out": True})
                except chatgpt_auth.ChatGPTAuthError as error:
                    self._json_response(503, {"error": str(error)})
                return
            if self.path == "/api/ai/auth/model":
                try:
                    data = self._read_json_body(8_000)
                    chatgpt_auth.select_model(data.get("model"))
                    self._json_response(200, {"selected_model": chatgpt_auth.selected_model()})
                except chatgpt_auth.ChatGPTAuthError as error:
                    self._json_response(422, {"error": str(error)})
                except AIPlanError as error:
                    self._json_response(422, {"error": str(error)})
                return

        if self.path == "/api/ai/plan":
            if local_auth_mode:
                origin = self.headers.get("Origin", "").rstrip("/")
                if not origin or origin not in allowed_browser_origins():
                    self._json_response(403, {"error": "A trusted local editor origin is required"})
                    return
            else:
                expected_token = os.environ.get("CONSTRUCTFLOW_AI_TOKEN", "")
                if not expected_token:
                    self._json_response(503, {"error": "AI gateway authentication is not configured"})
                    return
                provided = self.headers.get("Authorization", "")
                if not ai_gateway_authorized(provided, expected_token):
                    self._json_response(401, {"error": "Invalid AI gateway token"})
                    return
            if not AI_REQUEST_LIMITER.acquire(blocking=False):
                self._json_response(503, {"error": "AI gateway is at capacity; retry shortly"})
                return
            try:
                data = self._read_json_body(30 * 1024 * 1024)
                if local_auth_mode:
                    model = data.pop("model", "") or chatgpt_auth.selected_model()
                    result = generate_command_plan(data, chatgpt_model=model)
                else:
                    result = generate_command_plan(data)
                status = 200
            except AIProviderError:
                result = {"error": "AI provider request failed; check gateway logs and provider configuration"}
                status = 502
            except AIPlanError as error:
                result = {"error": str(error)}
                status = 422
            except Exception:
                result = {"error": "AI gateway failed; check gateway logs"}
                status = 502
            finally:
                AI_REQUEST_LIMITER.release()
            self._json_response(status, result)
            return

        if self.path == "/api/command":
            expected_token = os.environ.get("CONSTRUCTFLOW_BRIDGE_TOKEN", "")
            if not expected_token:
                self._json_response(503, {"error": "SketchUp bridge authentication is not configured"})
                return
            if not ai_gateway_authorized(self.headers.get("Authorization", ""), expected_token):
                self._json_response(401, {"error": "Invalid bridge token"})
                return
            try:
                data = self._read_json_body(128_000)
                command_name = data.get("command_name")
                params = data.get("params", {})
                if not isinstance(command_name, str) or not command_name.strip() or not isinstance(params, dict):
                    raise AIPlanError("command_name and object params are required")

                # Call SketchUp via WebSocket
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(send_to_sketchup(command_name, params))
                loop.close()

                self._json_response(200, result)
            except AIPlanError as error:
                self._json_response(422, {"error": str(error)})
            except Exception:
                self._json_response(502, {"error": "SketchUp bridge request failed"})
            return

        self.send_response(404)
        self.end_headers()

def run_http_server():
    host = os.environ.get("CONSTRUCTFLOW_HTTP_HOST", "127.0.0.1")
    validate_gateway_binding(host)
    server = ThreadingHTTPServer((host, HTTP_PORT), BridgeHandler)
    server.daemon_threads = True
    server.timeout = 1
    print(f"🌐 HTTP/OpenAPI Bridge running at http://{host}:{HTTP_PORT}")
    print(f"📄 OpenAPI schema for Custom GPT: http://localhost:{HTTP_PORT}/openapi.json")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    run_http_server()
