import asyncio
import hmac
import json
import os
import uuid
import sys
import websockets
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
from ai_provider import AIPlanError, generate_command_plan

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
    "components": {"securitySchemes": {"GatewayToken": {"type": "http", "scheme": "bearer"}}}
}

def ai_gateway_authorized(authorization, expected_token):
    return bool(expected_token) and hmac.compare_digest(
        authorization or "", f"Bearer {expected_token}"
    )

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
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/openapi.json":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(OPENAPI_SPEC, indent=2).encode('utf-8'))
            return

        if self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "running", "bridge": "ConstructFlow AI REST Gateway"}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/ai/plan":
            expected_token = os.environ.get("CONSTRUCTFLOW_AI_TOKEN", "")
            if not expected_token:
                self.send_response(503)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error":"Set CONSTRUCTFLOW_AI_TOKEN on the AI gateway"}')
                return
            provided = self.headers.get("Authorization", "")
            if not ai_gateway_authorized(provided, expected_token):
                self.send_response(401)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error":"Invalid AI gateway token"}')
                return
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length < 1 or content_length > 128_000:
                    raise AIPlanError("Request must be between 1 and 128000 bytes")
                data = json.loads(self.rfile.read(content_length).decode("utf-8"))
                result = generate_command_plan(data)
                status = 200
            except (AIPlanError, json.JSONDecodeError, UnicodeDecodeError) as error:
                result = {"error": str(error)}
                status = 422
            except Exception as error:
                result = {"error": f"AI gateway failed: {error}"}
                status = 502
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            return

        if self.path == "/api/command":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                command_name = data.get("command_name")
                params = data.get("params", {})

                # Call SketchUp via WebSocket
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(send_to_sketchup(command_name, params))
                loop.close()

                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

def run_http_server():
    host = os.environ.get("CONSTRUCTFLOW_HTTP_HOST", "127.0.0.1")
    server = HTTPServer((host, HTTP_PORT), BridgeHandler)
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
