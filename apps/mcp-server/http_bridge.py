import asyncio
import hmac
import json
import os
import re
import uuid
import sys
import websockets
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import threading
from urllib.parse import urlparse
from urllib.parse import quote, unquote
from ai_provider import AIPlanError, AIProviderError, generate_command_plan
import chatgpt_auth
import collaboration_store
from html import escape
from urllib.parse import parse_qs

# Configuration
HTTP_PORT = 8000
WS_URL = "ws://localhost:8765"
COLLABORATION_REVISIONS_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/revisions$")
COLLABORATION_COMPANY_LIBRARY_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/company-library$")
COLLABORATION_ORG_COMPANY_LIBRARY_PATH = re.compile(r"^/api/collaboration/company-library$")
COLLABORATION_MEMBERS_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/members$")
COLLABORATION_MEMBER_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/members/([0-9a-f-]{36})$")
COLLABORATION_PRESENCE_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/presence$")
COLLABORATION_PRESENCE_SESSION_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/presence/([0-9a-f-]{36})$")
COLLABORATION_COMMENTS_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/comments$")
COLLABORATION_COMMANDS_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/commands$")
COLLABORATION_PROPOSAL_APPROVAL_LINKS_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/proposals/([0-9a-f-]{36})/approval-links$")
COLLABORATION_PROPOSAL_APPROVAL_LINK_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/proposals/([0-9a-f-]{36})/approval-links/([0-9a-f-]{36})$")
COLLABORATION_DRAWING_DOWNLOAD_LINKS_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/drawing-download-links$")
COLLABORATION_DRAWING_DOWNLOAD_LINK_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/drawing-download-links/([0-9a-f-]{36})$")
PUBLIC_PROPOSAL_APPROVAL_PATH = "/api/proposal-approval"
PUBLIC_DRAWING_DOWNLOAD_PATH = "/api/drawing-download"
COLLABORATION_ZAPIER_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/integrations/zapier$")
COLLABORATION_QUICKBOOKS_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/integrations/quickbooks$")
COLLABORATION_QUICKBOOKS_CATALOG_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/integrations/quickbooks/catalog$")
COLLABORATION_QUICKBOOKS_PAYMENTS_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/integrations/quickbooks/payments$")
COLLABORATION_QUICKBOOKS_MAPPING_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/integrations/quickbooks/mapping$")
COLLABORATION_QUICKBOOKS_EXPORTS_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/integrations/quickbooks/exports$")
COLLABORATION_WEBHOOK_CONFIG_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/integrations/webhook/config$")
COLLABORATION_WEBHOOK_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/integrations/webhook$")
COLLABORATION_MEDIA_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/media$")
COLLABORATION_MEDIA_ASSET_PATH = re.compile(r"^/api/collaboration/projects/([0-9a-f-]{36})/media/([0-9a-f-]{36})$")

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
                            "analysis_only": {"type": "boolean", "description": "Classify drawing pages without proposing or executing model commands."},
                            "scale_calibrations": {"type": "array", "maxItems": 100, "description": "User-confirmed known distances between normalized points on source pages."},
                            "drawing_alignments": {"type": "array", "maxItems": 100, "description": "User-confirmed mapping from a normalized source-page anchor to project X/Y, rotation, and level."},
                            "drawing_trace_edits": {"type": "array", "maxItems": 2000, "description": "User-reviewed normalized wall/opening trace segments; accepted as drafting intent but still requires physical scale before model commands."},
                        },
                    }}}
                },
                "responses": {
                    "200": {"description": "Structured command proposal; this endpoint does not execute commands."},
                    "401": {"description": "Invalid or missing gateway token."},
                    "422": {"description": "Invalid request or command plan."},
                },
            }
        },
        "/api/collaboration/projects/{project_id}/revisions": {
            "get": {
                "summary": "Download the authenticated project's revision history",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Project revision bundle"}, "401": {"description": "Missing or invalid collaboration token"}, "403": {"description": "Project role does not permit access"}},
            },
            "post": {
                "summary": "Append and merge project revisions",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["format", "schema_version", "project_id", "source_device_id", "revisions"], "properties": {"format": {"const": "constructflow.project-revisions"}, "schema_version": {"const": 1}, "project_id": {"type": "string", "format": "uuid"}, "source_device_id": {"type": "string", "format": "uuid"}, "revisions": {"type": "array", "minItems": 1, "maxItems": 500}}}}}},
                "responses": {"200": {"description": "Merged revision bundle and conflict summary"}, "401": {"description": "Missing or invalid collaboration token"}, "403": {"description": "Viewer role cannot upload revisions"}, "413": {"description": "Revision data exceeds 100 MB"}, "422": {"description": "Invalid revision bundle"}},
            },
        },
        "/api/collaboration/projects/{project_id}/comments": {
            "get": {
                "summary": "Download model-linked discussion threads for a project",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "If-None-Match", "in": "header", "required": False, "schema": {"type": "string"}, "description": "Comment snapshot ETag for a 304 response when unchanged"}],
                "responses": {"200": {"description": "Project comments and whether this role can write"}, "304": {"description": "Comments are unchanged"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to the project"}},
            },
            "post": {
                "summary": "Merge offline project discussion threads and replies",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["comments"], "properties": {"comments": {"type": "array", "maxItems": 2000, "items": {"type": "object"}}}}}}},
                "responses": {"200": {"description": "Merged comment threads"}, "403": {"description": "Viewer role cannot upload comments"}, "409": {"description": "A UUID collides with different comment content"}, "413": {"description": "Comment data exceeds 20 MB"}, "422": {"description": "Invalid project comments"}},
            },
        },
        "/api/collaboration/projects/{project_id}/proposals/{proposal_id}/approval-links": {
            "get": {
                "summary": "Read recipient approval-link status for a project proposal",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "proposal_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Recent links and any signed decisions; link tokens are never returned"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to the project"}},
            },
            "post": {
                "summary": "Create a one-time recipient approval link for a sent proposal",
                "description": "Owner/editor only. The gateway stores only a SHA-256 token hash and a validated customer-facing snapshot without model object UUIDs or field GPS. The token is returned once and expires after 14 days.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "proposal_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["snapshot"], "properties": {"snapshot": {"type": "object", "description": "Validated schema-versioned customer proposal snapshot, maximum 2 MB"}}}}}},
                "responses": {"200": {"description": "One-time token plus link ID and expiry; the prior pending link is revoked"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "Viewer cannot create links"}, "413": {"description": "Proposal snapshot exceeds 2 MB"}, "422": {"description": "Invalid proposal snapshot"}},
            },
        },
        "/api/collaboration/projects/{project_id}/proposals/{proposal_id}/approval-links/{link_id}": {
            "delete": {
                "summary": "Revoke a pending recipient approval link",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "proposal_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "link_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Link revoked"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "Viewer cannot revoke links"}, "409": {"description": "Link is already decided, expired or revoked"}},
            },
        },
        "/api/proposal-approval": {
            "get": {
                "summary": "Read a proposal snapshot using its one-time bearer token",
                "security": [{"ApprovalToken": []}],
                "responses": {"200": {"description": "Frozen customer-facing proposal and current decision state"}, "401": {"description": "Invalid approval token"}, "404": {"description": "Approval link not found"}},
            },
            "post": {
                "summary": "Submit a signed recipient decision once",
                "security": [{"ApprovalToken": []}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["decision", "signer_name", "strokes", "confirmation", "snapshot_hash"], "properties": {"decision": {"type": "string", "enum": ["accepted", "declined"]}, "signer_name": {"type": "string", "maxLength": 120}, "strokes": {"type": "array", "maxItems": 40}, "confirmation": {"type": "boolean", "const": True}, "snapshot_hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"}, "note": {"type": "string", "maxLength": 1000}}}}}},
                "responses": {"200": {"description": "Decision recorded or idempotently acknowledged"}, "401": {"description": "Invalid approval token"}, "409": {"description": "Link is no longer active or a different decision was already recorded"}, "410": {"description": "Approval link expired"}, "422": {"description": "Invalid decision or signature"}},
            },
        },
        "/api/collaboration/projects/{project_id}/drawing-download-links": {
            "get": {
                "summary": "List shared A3 Vector PDF download links",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Recent links and download counts; link tokens are never returned"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to the project"}},
            },
            "post": {
                "summary": "Create an expiring download link for a frozen A3 Vector PDF",
                "description": "Owner/editor only. The gateway stores the immutable PDF, only a SHA-256 token hash, and enforces per-file and per-project byte limits. The bearer token is returned once; recipients can download until expiry or revocation.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "X-Download-Name", "in": "header", "required": True, "schema": {"type": "string", "maxLength": 120}}, {"name": "X-Link-Ttl-Days", "in": "header", "required": True, "schema": {"type": "integer", "minimum": 1, "maximum": 30}}],
                "requestBody": {"required": True, "content": {"application/pdf": {"schema": {"type": "string", "format": "binary"}}}},
                "responses": {"200": {"description": "One-time token, immutable file metadata, and expiry"}, "403": {"description": "Viewer cannot create links"}, "409": {"description": "Active link limit reached"}, "413": {"description": "PDF exceeds 50 MB or the project storage limit"}, "422": {"description": "Invalid PDF, name, or link expiry"}},
            },
        },
        "/api/collaboration/projects/{project_id}/drawing-download-links/{link_id}": {
            "delete": {
                "summary": "Revoke an active drawing download link and clear its stored PDF payload",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "link_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Link revoked"}, "403": {"description": "Viewer cannot revoke links"}, "409": {"description": "Link is no longer active"}},
            },
        },
        "/api/drawing-download": {
            "get": {
                "summary": "Read metadata for a frozen A3 Vector PDF using its bearer link token",
                "security": [{"ApprovalToken": []}],
                "responses": {"200": {"description": "File name, size, integrity hash, and expiry"}, "404": {"description": "Download link not found"}, "410": {"description": "Download link expired or revoked"}},
            },
            "post": {
                "summary": "Download a frozen A3 Vector PDF using its bearer link token",
                "security": [{"ApprovalToken": []}],
                "responses": {"200": {"description": "PDF attachment with integrity metadata", "content": {"application/pdf": {"schema": {"type": "string", "format": "binary"}}}}, "404": {"description": "Download link not found"}, "410": {"description": "Download link expired or revoked"}},
            },
        },
        "/api/collaboration/projects/{project_id}/commands": {
            "get": {
                "summary": "Pull ordered live model-command transactions",
                "description": "A new device can join at the current server head with join=1. Existing devices pass after=<sequence>. Transactions are replayed by the editor through its CommandBus.",
                "security": [{"CollaborationToken": []}],
                "parameters": [
                    {"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}},
                    {"name": "after", "in": "query", "required": False, "schema": {"type": "integer", "minimum": 0}},
                    {"name": "join", "in": "query", "required": False, "schema": {"type": "boolean"}, "description": "Join at current head without replaying earlier commands"},
                ],
                "responses": {"200": {"description": "Ordered command transactions and next cursor"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to the project"}, "422": {"description": "Invalid command cursor"}},
            },
            "post": {
                "summary": "Append live model-command transactions in server sequence",
                "description": "Owner/editor only. Every transaction carries the server sequence it was based on; stale writers receive 409 and must resolve the conflict before continuing.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["transactions"], "properties": {"transactions": {"type": "array", "minItems": 1, "maxItems": 100, "items": {"type": "object", "required": ["transaction_id", "source_device_id", "base_sequence", "commands", "project_fingerprint"], "properties": {"project_fingerprint": {"type": "string", "pattern": "^[0-9]{1,12}:[0-9a-f]{16}$"}}}}}}}}},
                "responses": {"200": {"description": "Accepted transactions with server sequences"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "Viewer role cannot append model commands"}, "409": {"description": "Sequence or UUID conflict; no transaction was appended"}, "413": {"description": "Command upload exceeds 20 MB"}, "422": {"description": "Invalid command transaction"}},
            },
        },
        "/api/collaboration/projects/{project_id}/company-library": {
            "get": {
                "summary": "Download the shared Company Library for an authenticated project team",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Current version, write permission, and shared company-library bundle"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to the project"}},
            },
            "post": {
                "summary": "Merge and publish a shared Company Library using optimistic version control",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["base_version", "bundle"], "properties": {"base_version": {"type": "integer", "minimum": 0}, "bundle": {"type": "object", "description": "Validated constructflow.company-library JSON bundle, maximum 20 MB"}}}}}},
                "responses": {"200": {"description": "Shared library version saved"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "Viewer role cannot publish the library"}, "409": {"description": "Library changed concurrently; reload and merge"}, "413": {"description": "Company Library exceeds 20 MB"}, "422": {"description": "Invalid Company Library bundle"}},
            },
        },
        "/api/collaboration/company-library": {
            "get": {
                "summary": "Download the Company Library shared across projects",
                "security": [{"CollaborationToken": []}],
                "responses": {"200": {"description": "Company UUID, current version, write permission and shared library bundle"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "The account has no company-library assignment"}},
            },
            "post": {
                "summary": "Merge and publish the cross-project Company Library",
                "security": [{"CollaborationToken": []}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["base_version", "bundle"], "properties": {"base_version": {"type": "integer", "minimum": 0}, "bundle": {"type": "object", "description": "Validated constructflow.company-library JSON bundle, maximum 20 MB"}}}}}},
                "responses": {"200": {"description": "Company Library version saved"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "Viewer role cannot publish the Company Library"}, "409": {"description": "Library changed concurrently; reload and merge"}, "413": {"description": "Company Library exceeds 20 MB"}, "422": {"description": "Invalid Company Library bundle"}},
            },
        },
        "/api/collaboration/projects/{project_id}/integrations/zapier": {
            "post": {
                "summary": "Deliver a proposal snapshot to a Zapier Catch Hook",
                "description": "Requires an authenticated project owner/editor. Accepts only HTTPS hooks.zapier.com Catch Hook URLs. The gateway records event_id idempotency and returns the provider HTTP acknowledgement; uncertain outcomes are not resent.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["target_url", "payload"], "properties": {"target_url": {"type": "string", "format": "uri"}, "payload": {"type": "object", "description": "Flat proposal snapshot with event_id and project_uuid; at most 1 MB when form encoded"}}}}}},
                "responses": {"200": {"description": "Zapier returned a successful HTTP response, or this event had already succeeded"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "Viewer or non-member cannot deliver"}, "409": {"description": "Event id reused with different content, or prior delivery is pending/uncertain"}, "413": {"description": "Payload exceeds 1 MB"}, "422": {"description": "Invalid Catch Hook URL or proposal payload"}, "502": {"description": "Zapier returned a non-success status or delivery outcome is uncertain"}},
            },
        },
        "/api/collaboration/projects/{project_id}/integrations/quickbooks": {
            "get": {
                "summary": "Read the QuickBooks Online connection status",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Connection metadata without access or refresh tokens"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to the project"}},
            },
            "post": {
                "summary": "Begin QuickBooks Online OAuth authorization",
                "description": "Owner-only. Creates a short-lived, one-use OAuth state bound to the user and company or project scope. Credentials and tokens remain on the gateway.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "QuickBooks authorization URL"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "Only the company or project owner can manage this connection"}, "503": {"description": "QuickBooks OAuth or token encryption is not configured"}},
            },
            "delete": {
                "summary": "Disconnect QuickBooks Online",
                "description": "Owner-only. Removes the encrypted gateway token for the current company or project scope.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Connection removed"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "Only the company or project owner can manage this connection"}},
            },
        },
        "/api/collaboration/projects/{project_id}/integrations/quickbooks/catalog": {
            "get": {
                "summary": "Read active QuickBooks Service items, tax codes and export history",
                "description": "Owner/editor only. Catalog IDs and tax rates are fetched from the connected QuickBooks company; gateway never accepts browser-supplied account names or rates as authority.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Company currency, active account catalog and saved mapping"}, "403": {"description": "Owner/editor required"}, "502": {"description": "QuickBooks catalog could not be read"}},
            },
        },
        "/api/collaboration/projects/{project_id}/integrations/quickbooks/payments": {
            "get": {
                "summary": "Read applied QuickBooks payments for exported ConstructFlow invoices",
                "description": "Owner/editor only. Returns only THB Payment line allocations linked by LinkedTxn to a successfully exported invoice in the current QBO realm; does not create a payment or move funds.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Applied payment candidates and review warnings"}, "403": {"description": "Owner/editor required"}, "422": {"description": "QuickBooks company currency is not THB"}, "502": {"description": "QuickBooks payment list could not be read"}},
            },
        },
        "/api/collaboration/projects/{project_id}/integrations/quickbooks/mapping": {
            "put": {
                "summary": "Save and validate ConstructFlow to QuickBooks account mappings",
                "description": "Owner/editor only. The gateway validates each item and VAT tax code ID against the current connected-company catalog before saving it.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["service_item_id", "tax_codes"], "properties": {"service_item_id": {"type": "string"}, "tax_codes": {"type": "array", "items": {"type": "object", "required": ["vat_rate", "tax_code_id"], "properties": {"vat_rate": {"type": "number", "minimum": 0, "maximum": 1}, "tax_code_id": {"type": "string"}}}}}}}}},
                "responses": {"200": {"description": "Validated mapping saved"}, "403": {"description": "Owner/editor required"}, "422": {"description": "Item, company currency or VAT mapping is invalid"}},
            },
        },
        "/api/collaboration/projects/{project_id}/integrations/quickbooks/exports": {
            "post": {
                "summary": "Create a QuickBooks Estimate or Invoice from a frozen ConstructFlow snapshot",
                "description": "Owner/editor only. Creates a Customer by exact email when none exists, then one QBO transaction. Uses stable requestid and gateway export ledger to prevent duplicate creation after uncertain network outcomes. This endpoint does not email the customer.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["project_uuid", "document_type", "record"], "properties": {"project_uuid": {"type": "string", "format": "uuid"}, "document_type": {"type": "string", "enum": ["estimate", "invoice"]}, "record": {"type": "object"}, "proposal": {"type": "object", "description": "Required accepted-proposal snapshot when exporting an Invoice"}}}}}},
                "responses": {"200": {"description": "Transaction created or prior successful export returned"}, "403": {"description": "Owner/editor required"}, "409": {"description": "Mapping missing or previous export has an uncertain result"}, "422": {"description": "Frozen commercial amounts or provider mappings do not validate"}, "502": {"description": "Provider outcome is uncertain; retry uses the same idempotent request"}},
            },
        },
        "/api/collaboration/projects/{project_id}/integrations/webhook/config": {
            "get": {
                "summary": "Read the project gateway's custom webhook policy",
                "description": "Returns the exact HTTPS DNS host allow-list configured by the self-hosted gateway. Viewer access is read-only.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Allowed webhook hosts and HMAC signing format"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to the project"}},
            },
        },
        "/api/collaboration/projects/{project_id}/integrations/webhook": {
            "post": {
                "summary": "Deliver a signed ConstructFlow project event",
                "description": "Requires an authenticated project owner/editor. The gateway permits only exact HTTPS hostnames configured by its operator, rejects non-public DNS addresses and redirects, pins the validated public address for TLS delivery, and records event_id idempotency. The signing secret is used in memory and never stored by the gateway.",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["target_url", "signing_secret", "event_id", "event_type", "payload"], "properties": {"target_url": {"type": "string", "format": "uri"}, "signing_secret": {"type": "string", "minLength": 32, "maxLength": 512}, "event_id": {"type": "string", "format": "uuid"}, "event_type": {"type": "string"}, "payload": {"type": "object", "description": "Versioned business snapshot; model geometry and credentials are excluded; maximum 1 MB"}}}}}},
                "responses": {"200": {"description": "Receiver returned HTTP 2xx or the event already succeeded"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "Viewer or non-member cannot deliver"}, "409": {"description": "Event ID content conflict or prior delivery is pending/uncertain"}, "413": {"description": "Payload exceeds 1 MB"}, "422": {"description": "Invalid event, disallowed host, or private DNS resolution"}, "429": {"description": "Hourly event limit or retry limit reached"}, "502": {"description": "Receiver returned a non-success status or outcome is uncertain"}},
            },
        },
        "/api/collaboration/projects/{project_id}/media": {
            "get": {
                "summary": "List shared field photo assets for a project",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Project photo manifest and upload permission"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to project"}},
            },
        },
        "/api/collaboration/projects/{project_id}/media/{asset_id}": {
            "get": {
                "summary": "Download a shared field photo asset",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "asset_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Image bytes with content type and SHA-256 headers", "content": {"image/jpeg": {"schema": {"type": "string", "format": "binary"}}, "image/png": {"schema": {"type": "string", "format": "binary"}}, "image/webp": {"schema": {"type": "string", "format": "binary"}}, "image/gif": {"schema": {"type": "string", "format": "binary"}}, "image/avif": {"schema": {"type": "string", "format": "binary"}}}}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to project"}, "404": {"description": "Photo asset not found"}},
            },
            "put": {
                "summary": "Store an immutable project field photo asset",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "asset_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "X-Content-SHA256", "in": "header", "required": True, "schema": {"type": "string", "pattern": "^[a-f0-9]{64}$"}}],
                "requestBody": {"required": True, "content": {"image/jpeg": {"schema": {"type": "string", "format": "binary"}}, "image/png": {"schema": {"type": "string", "format": "binary"}}, "image/webp": {"schema": {"type": "string", "format": "binary"}}, "image/gif": {"schema": {"type": "string", "format": "binary"}}, "image/avif": {"schema": {"type": "string", "format": "binary"}}}},
                "responses": {"200": {"description": "Asset stored or already present"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "Viewer role cannot upload photos"}, "409": {"description": "Asset UUID already refers to different image bytes"}, "413": {"description": "Asset or project media limit exceeded"}, "422": {"description": "Unsupported image bytes or invalid checksum"}},
            },
        },
        "/api/collaboration/projects/{project_id}/members": {
            "get": {
                "summary": "List project members and roles",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Members and whether the current user can manage them"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to the project"}},
            },
            "post": {
                "summary": "Invite a project member and issue a bearer token",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["user_id", "role"], "properties": {"user_id": {"type": "string", "minLength": 1, "maxLength": 120}, "role": {"type": "string", "enum": ["owner", "editor", "viewer"]}}}}}},
                "responses": {"200": {"description": "Member record and one-time token"}, "403": {"description": "Only project owners can manage members"}, "409": {"description": "Member already exists or member limit reached"}},
            },
        },
        "/api/collaboration/projects/{project_id}/members/{member_id}": {
            "patch": {
                "summary": "Change a project member role",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "member_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["role"], "properties": {"role": {"type": "string", "enum": ["owner", "editor", "viewer"]}}}}}},
                "responses": {"200": {"description": "Updated project member"}, "403": {"description": "Only project owners can manage members"}, "409": {"description": "The project must retain at least one owner"}},
            },
            "delete": {
                "summary": "Revoke a project member token",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "member_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Membership revoked"}, "403": {"description": "Only project owners can manage members"}, "409": {"description": "The project must retain at least one owner"}},
            },
        },
        "/api/collaboration/projects/{project_id}/presence": {
            "get": {
                "summary": "List collaborators active in the project",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Project users and ephemeral cursor/selection sessions active in the last 90 seconds"}, "401": {"description": "Invalid collaboration token"}, "403": {"description": "No access to the project"}},
            },
            "post": {
                "summary": "Refresh the current project presence session",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "required": ["session_id"], "properties": {"session_id": {"type": "string", "format": "uuid"}, "selected_object_ids": {"type": "array", "maxItems": 50, "items": {"type": "string", "format": "uuid"}}, "cursor_mm": {"type": ["array", "null"], "minItems": 2, "maxItems": 2, "items": {"type": "number", "description": "Plan cursor coordinate in project millimeters"}}}}}}},
                "responses": {"200": {"description": "Updated presence and active collaborators, including ephemeral cursor and selection awareness"}, "401": {"description": "Invalid collaboration token"}, "409": {"description": "Project presence session limit reached"}},
            },
        },
        "/api/collaboration/projects/{project_id}/presence/{session_id}": {
            "delete": {
                "summary": "Close the current user's project presence session",
                "security": [{"CollaborationToken": []}],
                "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}, {"name": "session_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}],
                "responses": {"200": {"description": "Presence session closed"}, "401": {"description": "Invalid collaboration token"}},
            },
        }
    },
    "components": {"securitySchemes": {
        "GatewayToken": {"type": "http", "scheme": "bearer"},
        "BridgeToken": {"type": "http", "scheme": "bearer"},
        "CollaborationToken": {"type": "http", "scheme": "bearer"},
        "ApprovalToken": {"type": "http", "scheme": "bearer"},
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
    collaboration_configured = bool(os.environ.get("CONSTRUCTFLOW_COLLABORATION_USERS", "").strip())
    if api_key and len(token) < 32:
        raise RuntimeError("Non-loopback AI gateway binding requires a 32+ character CONSTRUCTFLOW_AI_TOKEN")
    if not api_key and not collaboration_configured:
        raise RuntimeError("Non-loopback binding requires an authenticated AI provider or project collaboration")
    if collaboration_configured:
        try:
            collaboration_store.validate_configuration()
        except collaboration_store.CollaborationError as error:
            raise RuntimeError(str(error)) from error
        if os.environ.get("CONSTRUCTFLOW_COLLABORATION_TLS_TERMINATED", "").lower() != "true":
            raise RuntimeError("Remote project collaboration requires TLS termination and CONSTRUCTFLOW_COLLABORATION_TLS_TERMINATED=true")
    if not os.environ.get("CONSTRUCTFLOW_AI_ALLOWED_ORIGINS", "").strip():
        raise RuntimeError("Non-loopback binding requires explicit CONSTRUCTFLOW_AI_ALLOWED_ORIGINS")
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

    def log_message(self, format, *args):
        if urlparse(getattr(self, "path", "")).path == collaboration_store.QUICKBOOKS_CALLBACK_PATH:
            super().log_message("%s", f"{self.command} {collaboration_store.QUICKBOOKS_CALLBACK_PATH} [OAuth parameters redacted]")
            return
        super().log_message(format, *args)

    def _send_security_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")

    def _send_cors_headers(self):
        origin = self.headers.get("Origin", "").rstrip("/")
        if origin and origin in allowed_browser_origins():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, If-None-Match, X-Content-SHA256, X-Download-Name, X-Link-Ttl-Days")
        self.send_header("Access-Control-Expose-Headers", "ETag, X-Content-SHA256")

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

    def _json_response(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self._send_cors_headers()
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def _empty_response(self, status, extra_headers=None):
        self.send_response(status)
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self._send_cors_headers()
        self._send_security_headers()
        self.end_headers()

    def _binary_response(self, status, payload, content_type, sha256, content_disposition="inline"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Content-Disposition", content_disposition)
        self.send_header("X-Content-SHA256", sha256)
        self._send_cors_headers()
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(payload)

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

    def _read_binary_body(self, maximum_bytes):
        if self.headers.get("Content-Encoding", "identity").lower() != "identity":
            raise AIPlanError("Encoded request bodies are not supported")
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise AIPlanError("Content-Length must be a valid integer") from error
        if content_length < 1 or content_length > maximum_bytes:
            raise AIPlanError(f"Request must be between 1 and {maximum_bytes} bytes")
        payload = self.rfile.read(content_length)
        if len(payload) != content_length:
            raise AIPlanError("Request body was incomplete")
        return payload

    def do_GET(self):
        if urlparse(self.path).path == collaboration_store.QUICKBOOKS_CALLBACK_PATH:
            query = parse_qs(urlparse(self.path).query, keep_blank_values=True)
            state = query.get("state", [""])[-1]
            try:
                if query.get("error", [""])[-1]:
                    collaboration_store.cancel_quickbooks_oauth(state)
                    self._auth_callback_page("QuickBooks connection was not completed", "Authorization was cancelled or denied in QuickBooks.", success=False)
                    return
                collaboration_store.complete_quickbooks_oauth(
                    state, query.get("code", [""])[-1], query.get("realmId", [""])[-1],
                )
                self._auth_callback_page("QuickBooks connected", "The QuickBooks Online company is connected to ConstructFlow.", success=True)
            except collaboration_store.CollaborationError as error:
                self._auth_callback_page("QuickBooks connection did not finish", str(error), success=False)
            return

        if urlparse(self.path).path == PUBLIC_PROPOSAL_APPROVAL_PATH:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                result = collaboration_store.get_public_proposal_approval(self.headers.get("Authorization", ""))
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        if urlparse(self.path).path == PUBLIC_DRAWING_DOWNLOAD_PATH:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                _payload, metadata = collaboration_store.get_public_drawing_download(
                    self.headers.get("Authorization", ""), include_payload=False,
                )
                self._json_response(200, metadata)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        drawing_links_match = COLLABORATION_DRAWING_DOWNLOAD_LINKS_PATH.fullmatch(urlparse(self.path).path)
        if drawing_links_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                result = collaboration_store.list_project_drawing_download_links(
                    drawing_links_match.group(1).lower(), self.headers.get("Authorization", ""),
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        approval_links_match = COLLABORATION_PROPOSAL_APPROVAL_LINKS_PATH.fullmatch(urlparse(self.path).path)
        if approval_links_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                result = collaboration_store.list_proposal_approval_links(
                    approval_links_match.group(1).lower(), approval_links_match.group(2).lower(), self.headers.get("Authorization", ""),
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        quickbooks_match = COLLABORATION_QUICKBOOKS_PATH.fullmatch(urlparse(self.path).path)
        if quickbooks_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                status = collaboration_store.quickbooks_connection_status(
                    quickbooks_match.group(1).lower(), self.headers.get("Authorization", ""),
                )
                self._json_response(200, status)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        quickbooks_catalog_match = COLLABORATION_QUICKBOOKS_CATALOG_PATH.fullmatch(urlparse(self.path).path)
        if quickbooks_catalog_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                catalog = collaboration_store.get_quickbooks_catalog(
                    quickbooks_catalog_match.group(1).lower(), self.headers.get("Authorization", ""),
                )
                self._json_response(200, catalog)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        quickbooks_payments_match = COLLABORATION_QUICKBOOKS_PAYMENTS_PATH.fullmatch(urlparse(self.path).path)
        if quickbooks_payments_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                payments = collaboration_store.get_quickbooks_invoice_payments(
                    quickbooks_payments_match.group(1).lower(), self.headers.get("Authorization", ""),
                )
                self._json_response(200, payments)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        webhook_config_match = COLLABORATION_WEBHOOK_CONFIG_PATH.fullmatch(urlparse(self.path).path)
        if webhook_config_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                config = collaboration_store.get_project_webhook_config(
                    webhook_config_match.group(1).lower(), self.headers.get("Authorization", ""),
                )
                self._json_response(200, config)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        org_company_library_match = COLLABORATION_ORG_COMPANY_LIBRARY_PATH.fullmatch(urlparse(self.path).path)
        if org_company_library_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                snapshot = collaboration_store.get_company_library(self.headers.get("Authorization", ""))
                self._json_response(200, snapshot)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        company_library_match = COLLABORATION_COMPANY_LIBRARY_PATH.fullmatch(urlparse(self.path).path)
        if company_library_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                snapshot = collaboration_store.get_project_company_library(
                    company_library_match.group(1).lower(), self.headers.get("Authorization", ""),
                )
                self._json_response(200, snapshot)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        media_asset_match = COLLABORATION_MEDIA_ASSET_PATH.fullmatch(urlparse(self.path).path)
        if media_asset_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                payload, metadata = collaboration_store.get_project_media(
                    media_asset_match.group(1).lower(), media_asset_match.group(2).lower(), self.headers.get("Authorization", ""),
                )
                self._binary_response(200, payload, metadata["content_type"], metadata["sha256"])
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        media_match = COLLABORATION_MEDIA_PATH.fullmatch(urlparse(self.path).path)
        if media_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                result = collaboration_store.list_project_media(media_match.group(1).lower(), self.headers.get("Authorization", ""))
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        presence_match = COLLABORATION_PRESENCE_PATH.fullmatch(urlparse(self.path).path)
        if presence_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            project_id = presence_match.group(1).lower()
            try:
                presence = collaboration_store.list_project_presence(project_id, self.headers.get("Authorization", ""))
                self._json_response(200, presence)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        comments_match = COLLABORATION_COMMENTS_PATH.fullmatch(urlparse(self.path).path)
        if comments_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            try:
                comments = collaboration_store.get_project_comments(
                    comments_match.group(1).lower(), self.headers.get("Authorization", ""), self.headers.get("If-None-Match"),
                )
                if comments.get("not_modified"):
                    self._empty_response(304, {"ETag": comments["etag"]})
                else:
                    self._json_response(200, comments, {"ETag": comments["etag"]})
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        commands_match = COLLABORATION_COMMANDS_PATH.fullmatch(urlparse(self.path).path)
        if commands_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            query = parse_qs(urlparse(self.path).query, keep_blank_values=True)
            project_id = commands_match.group(1).lower()
            join_at_head = query.get("join", [""])[-1] == "1"
            after_value = query.get("after", [None])[-1]
            try:
                if after_value is None or after_value == "":
                    after_sequence = None
                elif re.fullmatch(r"\d{1,18}", after_value):
                    after_sequence = int(after_value)
                else:
                    raise collaboration_store.CollaborationError(422, "Command sync cursor must be a non-negative integer")
                snapshot = collaboration_store.get_project_command_transactions(
                    project_id, self.headers.get("Authorization", ""), after_sequence, join_at_head=join_at_head,
                )
                self._json_response(200, snapshot)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        members_match = COLLABORATION_MEMBERS_PATH.fullmatch(urlparse(self.path).path)
        if members_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            project_id = members_match.group(1).lower()
            try:
                members = collaboration_store.list_project_members(project_id, self.headers.get("Authorization", ""))
                self._json_response(200, members)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

        collab_match = COLLABORATION_REVISIONS_PATH.fullmatch(urlparse(self.path).path)
        if collab_match:
            if not self._origin_is_allowed():
                self._json_response(403, {"error": "Browser origin is not allowed"})
                return
            project_id = collab_match.group(1).lower()
            try:
                bundle = collaboration_store.get_project_revisions(project_id, self.headers.get("Authorization", ""))
                self._json_response(200, {"bundle": bundle})
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return

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
        if urlparse(self.path).path == PUBLIC_DRAWING_DOWNLOAD_PATH:
            try:
                payload, metadata = collaboration_store.get_public_drawing_download(self.headers.get("Authorization", ""))
                disposition = f"attachment; filename=\"drawing-set.pdf\"; filename*=UTF-8''{quote(metadata['filename'], safe='')}"
                self._binary_response(200, payload, "application/pdf", metadata["sha256"], disposition)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return
        if urlparse(self.path).path == PUBLIC_PROPOSAL_APPROVAL_PATH:
            try:
                data = self._read_json_body(750_000)
                result = collaboration_store.submit_public_proposal_decision(self.headers.get("Authorization", ""), data)
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return

        drawing_links_match = COLLABORATION_DRAWING_DOWNLOAD_LINKS_PATH.fullmatch(urlparse(self.path).path)
        if drawing_links_match:
            self.request.settimeout(120)
            try:
                project_id = drawing_links_match.group(1).lower()
                authorization = self.headers.get("Authorization", "")
                collaboration_store.validate_project_write_access(project_id, authorization)
                content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                if content_type != "application/pdf":
                    raise collaboration_store.CollaborationError(422, "Shared drawing must be uploaded as application/pdf")
                encoded_name = self.headers.get("X-Download-Name", "")
                try:
                    display_name = unquote(encoded_name, errors="strict")
                except UnicodeDecodeError as error:
                    raise collaboration_store.CollaborationError(422, "Drawing download name encoding is invalid") from error
                ttl_header = self.headers.get("X-Link-Ttl-Days", "")
                ttl_days = int(ttl_header) if re.fullmatch(r"\d{1,2}", ttl_header) else None
                payload = self._read_binary_body(collaboration_store.MAX_DRAWING_DOWNLOAD_BYTES)
                result = collaboration_store.create_project_drawing_download_link(
                    project_id, authorization,
                    display_name, ttl_days, payload,
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return

        approval_links_match = COLLABORATION_PROPOSAL_APPROVAL_LINKS_PATH.fullmatch(urlparse(self.path).path)
        if approval_links_match:
            try:
                data = self._read_json_body(collaboration_store.MAX_PROPOSAL_APPROVAL_SNAPSHOT_BYTES + 16_000)
                result = collaboration_store.create_proposal_approval_link(
                    approval_links_match.group(1).lower(), approval_links_match.group(2).lower(), self.headers.get("Authorization", ""), data,
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return

        org_company_library_match = COLLABORATION_ORG_COMPANY_LIBRARY_PATH.fullmatch(urlparse(self.path).path)
        if org_company_library_match:
            try:
                data = self._read_json_body(collaboration_store.MAX_COMPANY_LIBRARY_BYTES + 16_000)
                result = collaboration_store.save_company_library(self.headers.get("Authorization", ""), data)
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return

        company_library_match = COLLABORATION_COMPANY_LIBRARY_PATH.fullmatch(urlparse(self.path).path)
        if company_library_match:
            try:
                data = self._read_json_body(collaboration_store.MAX_COMPANY_LIBRARY_BYTES + 16_000)
                result = collaboration_store.save_project_company_library(
                    company_library_match.group(1).lower(), self.headers.get("Authorization", ""), data,
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return
        webhook_match = COLLABORATION_WEBHOOK_PATH.fullmatch(urlparse(self.path).path)
        if webhook_match:
            try:
                data = self._read_json_body(collaboration_store.MAX_CUSTOM_WEBHOOK_BYTES + 16_000)
                result = collaboration_store.deliver_custom_webhook(
                    webhook_match.group(1).lower(), self.headers.get("Authorization", ""), data,
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return
        zapier_match = COLLABORATION_ZAPIER_PATH.fullmatch(urlparse(self.path).path)
        if zapier_match:
            try:
                data = self._read_json_body(collaboration_store.MAX_ZAPIER_PAYLOAD_BYTES + 16_000)
                result = collaboration_store.deliver_zapier_proposal(
                    zapier_match.group(1).lower(), self.headers.get("Authorization", ""), data,
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return
        quickbooks_exports_match = COLLABORATION_QUICKBOOKS_EXPORTS_PATH.fullmatch(urlparse(self.path).path)
        if quickbooks_exports_match:
            try:
                data = self._read_json_body(2_500_000)
                result = collaboration_store.export_quickbooks_document(
                    quickbooks_exports_match.group(1).lower(), self.headers.get("Authorization", ""), data,
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return
        quickbooks_match = COLLABORATION_QUICKBOOKS_PATH.fullmatch(urlparse(self.path).path)
        if quickbooks_match:
            try:
                result = collaboration_store.start_quickbooks_oauth(
                    quickbooks_match.group(1).lower(), self.headers.get("Authorization", ""),
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return
        presence_match = COLLABORATION_PRESENCE_PATH.fullmatch(urlparse(self.path).path)
        if presence_match:
            project_id = presence_match.group(1).lower()
            try:
                data = self._read_json_body(16_000)
                presence = collaboration_store.heartbeat_project_presence(
                    project_id, self.headers.get("Authorization", ""), data.get("session_id"),
                    data.get("selected_object_ids", []), data.get("cursor_mm"),
                )
                self._json_response(200, presence)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                self._json_response(422, {"error": str(error)})
            return
        comments_match = COLLABORATION_COMMENTS_PATH.fullmatch(urlparse(self.path).path)
        if comments_match:
            project_id = comments_match.group(1).lower()
            try:
                data = self._read_json_body(collaboration_store.MAX_PROJECT_COMMENT_BYTES)
                comments = collaboration_store.merge_project_comments(project_id, self.headers.get("Authorization", ""), data)
                self._json_response(200, comments, {"ETag": comments["etag"]})
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return
        commands_match = COLLABORATION_COMMANDS_PATH.fullmatch(urlparse(self.path).path)
        if commands_match:
            project_id = commands_match.group(1).lower()
            try:
                data = self._read_json_body(collaboration_store.MAX_COMMAND_UPLOAD_BYTES)
                result = collaboration_store.merge_project_command_transactions(
                    project_id, self.headers.get("Authorization", ""), data,
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return
        members_match = COLLABORATION_MEMBERS_PATH.fullmatch(urlparse(self.path).path)
        if members_match:
            project_id = members_match.group(1).lower()
            try:
                data = self._read_json_body(16_000)
                member = collaboration_store.create_project_member(
                    project_id, self.headers.get("Authorization", ""), data,
                )
                self._json_response(200, member)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                self._json_response(422, {"error": str(error)})
            return
        collab_match = COLLABORATION_REVISIONS_PATH.fullmatch(urlparse(self.path).path)
        if collab_match:
            project_id = collab_match.group(1).lower()
            try:
                data = self._read_json_body(collaboration_store.MAX_BUNDLE_BYTES)
                result = collaboration_store.merge_project_revisions(
                    project_id, self.headers.get("Authorization", ""), data,
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
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

    def do_PATCH(self):
        if not self._origin_is_allowed():
            self._json_response(403, {"error": "Browser origin is not allowed"})
            return
        match = COLLABORATION_MEMBER_PATH.fullmatch(urlparse(self.path).path)
        if not match:
            self.send_response(404)
            self.end_headers()
            return
        try:
            data = self._read_json_body(16_000)
            result = collaboration_store.update_project_member_role(
                match.group(1).lower(), self.headers.get("Authorization", ""), match.group(2).lower(), data,
            )
            self._json_response(200, result)
        except collaboration_store.CollaborationError as error:
            self._json_response(error.status, {"error": str(error)})
        except AIPlanError as error:
            self._json_response(422, {"error": str(error)})

    def do_PUT(self):
        if not self._origin_is_allowed():
            self._json_response(403, {"error": "Browser origin is not allowed"})
            return
        quickbooks_mapping_match = COLLABORATION_QUICKBOOKS_MAPPING_PATH.fullmatch(urlparse(self.path).path)
        if quickbooks_mapping_match:
            try:
                data = self._read_json_body(64_000)
                result = collaboration_store.save_quickbooks_mapping(
                    quickbooks_mapping_match.group(1).lower(), self.headers.get("Authorization", ""), data,
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            except AIPlanError as error:
                status = 413 if "between 1 and" in str(error) else 422
                self._json_response(status, {"error": str(error)})
            return
        match = COLLABORATION_MEDIA_ASSET_PATH.fullmatch(urlparse(self.path).path)
        if not match:
            self.send_response(404)
            self.end_headers()
            return
        self.request.settimeout(120)
        try:
            payload = self._read_binary_body(collaboration_store.MAX_FIELD_PHOTO_BYTES)
            result = collaboration_store.put_project_media(
                match.group(1).lower(), match.group(2).lower(), self.headers.get("Authorization", ""),
                self.headers.get("Content-Type", "").split(";", 1)[0].strip(), payload,
                self.headers.get("X-Content-SHA256", ""),
            )
            self._json_response(200, result)
        except collaboration_store.CollaborationError as error:
            self._json_response(error.status, {"error": str(error)})
        except AIPlanError as error:
            status = 413 if "between 1 and" in str(error) else 422
            self._json_response(status, {"error": str(error)})

    def do_DELETE(self):
        if not self._origin_is_allowed():
            self._json_response(403, {"error": "Browser origin is not allowed"})
            return
        drawing_link_match = COLLABORATION_DRAWING_DOWNLOAD_LINK_PATH.fullmatch(urlparse(self.path).path)
        if drawing_link_match:
            try:
                result = collaboration_store.revoke_project_drawing_download_link(
                    drawing_link_match.group(1).lower(), drawing_link_match.group(2).lower(),
                    self.headers.get("Authorization", ""),
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return
        approval_link_match = COLLABORATION_PROPOSAL_APPROVAL_LINK_PATH.fullmatch(urlparse(self.path).path)
        if approval_link_match:
            try:
                result = collaboration_store.revoke_proposal_approval_link(
                    approval_link_match.group(1).lower(), approval_link_match.group(2).lower(),
                    approval_link_match.group(3).lower(), self.headers.get("Authorization", ""),
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return
        quickbooks_match = COLLABORATION_QUICKBOOKS_PATH.fullmatch(urlparse(self.path).path)
        if quickbooks_match:
            try:
                result = collaboration_store.disconnect_quickbooks(
                    quickbooks_match.group(1).lower(), self.headers.get("Authorization", ""),
                )
                self._json_response(200, result)
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return
        presence_match = COLLABORATION_PRESENCE_SESSION_PATH.fullmatch(urlparse(self.path).path)
        if presence_match:
            try:
                collaboration_store.delete_project_presence(
                    presence_match.group(1).lower(), self.headers.get("Authorization", ""), presence_match.group(2).lower(),
                )
                self._json_response(200, {"closed": True})
            except collaboration_store.CollaborationError as error:
                self._json_response(error.status, {"error": str(error)})
            return
        match = COLLABORATION_MEMBER_PATH.fullmatch(urlparse(self.path).path)
        if not match:
            self.send_response(404)
            self.end_headers()
            return
        try:
            collaboration_store.delete_project_member(
                match.group(1).lower(), self.headers.get("Authorization", ""), match.group(2).lower(),
            )
            self._json_response(200, {"revoked": True})
        except collaboration_store.CollaborationError as error:
            self._json_response(error.status, {"error": str(error)})

def run_http_server():
    host = os.environ.get("CONSTRUCTFLOW_HTTP_HOST", "127.0.0.1")
    validate_gateway_binding(host)
    try:
        collaboration_store.validate_configuration()
    except collaboration_store.CollaborationError as error:
        raise RuntimeError(str(error)) from error
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
