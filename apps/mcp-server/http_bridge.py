import asyncio
import json
import uuid
import sys
import websockets
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

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
        }
    }
}

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
    server = HTTPServer(('0.0.0.0', HTTP_PORT), BridgeHandler)
    print(f"🌐 HTTP/OpenAPI Bridge running at http://localhost:{HTTP_PORT}")
    print(f"📄 OpenAPI schema for Custom GPT: http://localhost:{HTTP_PORT}/openapi.json")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    run_http_server()
