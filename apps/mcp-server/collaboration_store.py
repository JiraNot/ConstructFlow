"""Authenticated, append-only project revision transport for self-hosted teams."""

from __future__ import annotations

import hashlib
import hmac
import http.client
import ipaddress
import json
import math
import os
import re
import secrets
import sqlite3
import socket
import ssl
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


REVISION_BUNDLE_FORMAT = "constructflow.project-revisions"
COMPANY_LIBRARY_BUNDLE_FORMAT = "constructflow.company-library"
MAX_BUNDLE_BYTES = 100_000_000
MAX_COMPANY_LIBRARY_BYTES = 20_000_000
MAX_ZAPIER_PAYLOAD_BYTES = 1_000_000
MAX_CUSTOM_WEBHOOK_BYTES = 1_000_000
MAX_CUSTOM_WEBHOOK_EVENTS_PER_HOUR = 100
MAX_FIELD_PHOTO_BYTES = 20_000_000
MAX_PROJECT_FIELD_PHOTOS = 500
MAX_PROJECT_FIELD_PHOTO_BYTES = 100_000_000
MAX_PROJECT_COMMENT_BYTES = 20_000_000
MAX_PROJECT_COMMENTS = 2_000
MAX_COMMAND_TRANSACTION_BYTES = 20_000_000
MAX_COMMAND_UPLOAD_BYTES = 20_000_000
MAX_COMMANDS_PER_TRANSACTION = 500
MAX_COMMAND_TRANSACTIONS_PER_UPLOAD = 100
MAX_COMMAND_TRANSACTIONS_PER_PULL = 100
MAX_REVISIONS_PER_BUNDLE = 500
MAX_PROPOSAL_APPROVAL_SNAPSHOT_BYTES = 2_000_000
PROPOSAL_APPROVAL_LINK_TTL_DAYS = 14
MAX_DRAWING_DOWNLOAD_BYTES = 50_000_000
MAX_PROJECT_DRAWING_DOWNLOAD_BYTES = 200_000_000
MAX_DRAWING_DOWNLOAD_LINKS_PER_PROJECT = 25
MAX_DRAWING_DOWNLOAD_TTL_DAYS = 30
PRESENCE_TTL_SECONDS = 90
MAX_PRESENCE_SESSIONS_PER_PROJECT = 1000
MAX_PRESENCE_SELECTED_OBJECTS = 50
MAX_PRESENCE_COORDINATE_MM = 100_000_000
UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE)
ZAPIER_CATCH_PATH_PATTERN = re.compile(r"^/hooks/catch/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/?$")
_QUICKBOOKS_REFRESH_LOCKS: dict[tuple[str, str], threading.Lock] = {}
_QUICKBOOKS_REFRESH_LOCKS_GUARD = threading.Lock()


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


class CollaborationError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _database_path() -> Path:
    configured = os.environ.get("CONSTRUCTFLOW_COLLABORATION_DB", "").strip()
    return Path(configured).expanduser() if configured else Path.home() / ".constructflow" / "collaboration.sqlite3"


def _open_database() -> sqlite3.Connection:
    path = _database_path()
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        path.parent.chmod(0o700)
    except OSError:
        pass
    database = sqlite3.connect(path, timeout=15)
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA journal_mode=WAL")
    database.execute("PRAGMA synchronous=FULL")
    database.execute("""CREATE TABLE IF NOT EXISTS project_revisions (
        server_record_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        source_revision_id TEXT,
        snapshot_hash TEXT NOT NULL,
        revision_json TEXT NOT NULL
    )""")
    database.execute("CREATE INDEX IF NOT EXISTS project_revisions_order ON project_revisions(project_id, revision_id)")
    database.execute("""CREATE TABLE IF NOT EXISTS project_members (
        member_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        company_id TEXT,
        company_role TEXT CHECK(company_role IS NULL OR company_role IN ('owner', 'editor', 'viewer')),
        company_role_cap TEXT CHECK(company_role_cap IS NULL OR company_role_cap IN ('owner', 'editor', 'viewer')),
        UNIQUE(project_id, user_id)
    )""")
    member_columns = {row["name"] for row in database.execute("PRAGMA table_info(project_members)").fetchall()}
    if "company_id" not in member_columns:
        database.execute("ALTER TABLE project_members ADD COLUMN company_id TEXT")
    if "company_role" not in member_columns:
        database.execute("ALTER TABLE project_members ADD COLUMN company_role TEXT")
    if "company_role_cap" not in member_columns:
        database.execute("ALTER TABLE project_members ADD COLUMN company_role_cap TEXT")
    database.execute("CREATE INDEX IF NOT EXISTS project_members_project ON project_members(project_id, user_id)")
    database.execute("""CREATE TABLE IF NOT EXISTS project_presence (
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        selected_object_ids_json TEXT NOT NULL DEFAULT '[]',
        cursor_x_mm REAL,
        cursor_y_mm REAL,
        cursor_updated_at TEXT,
        PRIMARY KEY(project_id, session_id)
    )""")
    presence_columns = {row["name"] for row in database.execute("PRAGMA table_info(project_presence)").fetchall()}
    if "selected_object_ids_json" not in presence_columns:
        database.execute("ALTER TABLE project_presence ADD COLUMN selected_object_ids_json TEXT NOT NULL DEFAULT '[]'")
    if "cursor_x_mm" not in presence_columns:
        database.execute("ALTER TABLE project_presence ADD COLUMN cursor_x_mm REAL")
    if "cursor_y_mm" not in presence_columns:
        database.execute("ALTER TABLE project_presence ADD COLUMN cursor_y_mm REAL")
    if "cursor_updated_at" not in presence_columns:
        database.execute("ALTER TABLE project_presence ADD COLUMN cursor_updated_at TEXT")
    database.execute("CREATE INDEX IF NOT EXISTS project_presence_recent ON project_presence(project_id, last_seen)")
    database.execute("""CREATE TABLE IF NOT EXISTS project_comments (
        project_id TEXT NOT NULL,
        comment_id TEXT NOT NULL,
        comment_json TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, comment_id)
    )""")
    database.execute("CREATE INDEX IF NOT EXISTS project_comments_order ON project_comments(project_id, comment_id)")
    # `sequence` is the internal globally unique row ID; `project_sequence` is the client cursor.
    database.execute("""CREATE TABLE IF NOT EXISTS project_command_transactions (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        project_sequence INTEGER,
        transaction_id TEXT NOT NULL,
        source_device_id TEXT NOT NULL,
        base_sequence INTEGER NOT NULL,
        submitted_by TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        transaction_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(project_id, transaction_id)
    )""")
    command_transaction_columns = {row["name"] for row in database.execute("PRAGMA table_info(project_command_transactions)").fetchall()}
    if "project_sequence" not in command_transaction_columns:
        database.execute("ALTER TABLE project_command_transactions ADD COLUMN project_sequence INTEGER")
    rows_without_project_sequence = database.execute(
        "SELECT sequence, project_id FROM project_command_transactions WHERE project_sequence IS NULL ORDER BY project_id, sequence"
    ).fetchall()
    next_by_project: dict[str, int] = {}
    for row in rows_without_project_sequence:
        next_by_project[row["project_id"]] = next_by_project.get(row["project_id"], 0) + 1
        database.execute("UPDATE project_command_transactions SET project_sequence=? WHERE sequence=?", (next_by_project[row["project_id"]], row["sequence"]))
    database.execute("CREATE UNIQUE INDEX IF NOT EXISTS project_command_transactions_project_sequence ON project_command_transactions(project_id, project_sequence)")
    database.execute("CREATE INDEX IF NOT EXISTS project_command_transactions_order ON project_command_transactions(project_id, project_sequence)")
    database.execute("""CREATE TABLE IF NOT EXISTS project_command_ids (
        project_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        transaction_sequence INTEGER NOT NULL,
        PRIMARY KEY(project_id, command_id),
        FOREIGN KEY(transaction_sequence) REFERENCES project_command_transactions(sequence) ON DELETE CASCADE
    )""")
    database.execute("""CREATE TABLE IF NOT EXISTS project_company_libraries (
        project_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        bundle_json TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""")
    database.execute("""CREATE TABLE IF NOT EXISTS company_libraries (
        company_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        bundle_json TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""")
    database.execute("""CREATE TABLE IF NOT EXISTS integration_deliveries (
        project_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        target_host TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'succeeded', 'failed', 'uncertain')),
        attempt_count INTEGER NOT NULL,
        response_status INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, event_id)
    )""")
    database.execute("""CREATE TABLE IF NOT EXISTS quickbooks_connections (
        scope_type TEXT NOT NULL CHECK(scope_type IN ('company', 'project')),
        scope_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        realm_id TEXT NOT NULL,
        token_ciphertext TEXT NOT NULL,
        environment TEXT NOT NULL CHECK(environment IN ('sandbox', 'production')),
        connected_by TEXT NOT NULL,
        connected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(scope_type, scope_id)
    )""")
    database.execute("""CREATE TABLE IF NOT EXISTS quickbooks_oauth_states (
        state_hash TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        scope_type TEXT NOT NULL CHECK(scope_type IN ('company', 'project')),
        scope_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    database.execute("CREATE INDEX IF NOT EXISTS quickbooks_oauth_states_expiry ON quickbooks_oauth_states(expires_at)")
    database.execute("""CREATE TABLE IF NOT EXISTS quickbooks_mappings (
        scope_type TEXT NOT NULL CHECK(scope_type IN ('company', 'project')),
        scope_id TEXT NOT NULL,
        realm_id TEXT NOT NULL DEFAULT '',
        service_item_id TEXT NOT NULL,
        service_item_name TEXT NOT NULL,
        tax_codes_json TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(scope_type, scope_id)
    )""")
    mapping_columns = {row[1] for row in database.execute("PRAGMA table_info(quickbooks_mappings)")}
    if "realm_id" not in mapping_columns:
        database.execute("ALTER TABLE quickbooks_mappings ADD COLUMN realm_id TEXT NOT NULL DEFAULT ''")
    database.execute("""CREATE TABLE IF NOT EXISTS quickbooks_exports (
        scope_type TEXT NOT NULL CHECK(scope_type IN ('company', 'project')),
        scope_id TEXT NOT NULL,
        document_type TEXT NOT NULL CHECK(document_type IN ('estimate', 'invoice')),
        source_record_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        request_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'succeeded', 'failed', 'uncertain')),
        customer_id TEXT,
        qbo_document_id TEXT,
        qbo_document_number TEXT,
        requires_review INTEGER NOT NULL DEFAULT 0,
        response_status INTEGER,
        message TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(scope_type, scope_id, document_type, source_record_id)
    )""")
    export_columns = {row[1] for row in database.execute("PRAGMA table_info(quickbooks_exports)")}
    if "customer_id" not in export_columns:
        database.execute("ALTER TABLE quickbooks_exports ADD COLUMN customer_id TEXT")
    if "requires_review" not in export_columns:
        database.execute("ALTER TABLE quickbooks_exports ADD COLUMN requires_review INTEGER NOT NULL DEFAULT 0")
    database.execute("CREATE INDEX IF NOT EXISTS quickbooks_exports_recent ON quickbooks_exports(scope_type, scope_id, updated_at DESC)")
    database.execute("""CREATE TABLE IF NOT EXISTS proposal_approval_links (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        snapshot_hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        decided_at TEXT,
        signer_name TEXT,
        signature_json TEXT,
        response_note TEXT
    )""")
    database.execute("CREATE INDEX IF NOT EXISTS proposal_approval_links_project ON proposal_approval_links(project_id, proposal_id, created_at DESC)")
    database.execute("CREATE INDEX IF NOT EXISTS proposal_approval_links_expiry ON proposal_approval_links(status, expires_at)")
    database.execute("""CREATE TABLE IF NOT EXISTS drawing_download_links (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL CHECK(content_type='application/pdf'),
        sha256 TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        payload BLOB,
        status TEXT NOT NULL CHECK(status IN ('active', 'revoked', 'expired')),
        download_count INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_downloaded_at TEXT
    )""")
    database.execute("CREATE INDEX IF NOT EXISTS drawing_download_links_project ON drawing_download_links(project_id, created_at DESC)")
    database.execute("CREATE INDEX IF NOT EXISTS drawing_download_links_expiry ON drawing_download_links(status, expires_at)")
    database.execute("""CREATE TABLE IF NOT EXISTS project_media_assets (
        project_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(project_id, asset_id)
    )""")
    database.execute("CREATE INDEX IF NOT EXISTS project_media_assets_project ON project_media_assets(project_id, asset_id)")
    database.execute("CREATE TABLE IF NOT EXISTS collaboration_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    database.execute("INSERT OR IGNORE INTO collaboration_meta(key, value) VALUES('server_id', ?)", (str(uuid.uuid4()),))
    database.execute(
        "UPDATE drawing_download_links SET status='expired', payload=NULL WHERE status='active' AND expires_at<=?",
        (datetime.now(timezone.utc).isoformat(),),
    )
    database.commit()
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return database


def _accounts() -> list[dict]:
    configured = os.environ.get("CONSTRUCTFLOW_COLLABORATION_USERS", "").strip()
    if not configured:
        raise CollaborationError(503, "Project collaboration is not configured on this server")
    try:
        accounts = json.loads(configured)
    except json.JSONDecodeError as error:
        raise CollaborationError(503, "Collaboration user configuration is not valid JSON") from error
    if not isinstance(accounts, list) or not accounts or len(accounts) > 500:
        raise CollaborationError(503, "Collaboration user configuration must contain 1–500 users")
    seen_users: set[str] = set()
    seen_tokens: set[str] = set()
    for account in accounts:
        if not isinstance(account, dict):
            raise CollaborationError(503, "Collaboration user entries must be objects")
        user_id, token, projects = account.get("user_id"), account.get("token"), account.get("projects")
        if not isinstance(user_id, str) or not user_id.strip() or len(user_id) > 120 or user_id in seen_users:
            raise CollaborationError(503, "Collaboration user IDs must be unique non-empty strings")
        if not isinstance(token, str) or token != token.strip() or len(token) < 32 or len(token) > 512 or token in seen_tokens:
            raise CollaborationError(503, "Each collaboration token must be unique and at least 32 characters")
        if not isinstance(projects, dict) or not projects:
            raise CollaborationError(503, f"Collaboration user {user_id} must have project role assignments")
        for project_id, role in projects.items():
            if project_id != "*" and not UUID_PATTERN.fullmatch(str(project_id)):
                raise CollaborationError(503, f"Collaboration role for {user_id} has an invalid project UUID")
            if not isinstance(role, str) or role not in {"owner", "editor", "viewer"}:
                raise CollaborationError(503, f"Collaboration role for {user_id} must be owner, editor or viewer")
        company_id, company_role = account.get("company_id"), account.get("company_role")
        if company_id is None and company_role is not None:
            raise CollaborationError(503, f"Collaboration company_role for {user_id} requires a company_id")
        if company_id is not None:
            if not isinstance(company_id, str) or not UUID_PATTERN.fullmatch(company_id):
                raise CollaborationError(503, f"Collaboration company_id for {user_id} must be a UUID")
            if not isinstance(company_role, str) or company_role not in {"owner", "editor", "viewer"}:
                raise CollaborationError(503, f"Collaboration company_role for {user_id} must be owner, editor or viewer")
            account["company_id"] = str(uuid.UUID(company_id))
        seen_users.add(user_id)
        seen_tokens.add(token)
    return accounts


def validate_configuration() -> bool:
    """Validate configured team accounts at gateway startup; return whether sync is enabled."""
    if not os.environ.get("CONSTRUCTFLOW_COLLABORATION_USERS", "").strip():
        return False
    _accounts()
    return True


def _authorize(project_id: str, authorization: str, *, write: bool) -> tuple[str, str]:
    if not UUID_PATTERN.fullmatch(project_id):
        raise CollaborationError(400, "Project ID must be a UUID")
    project_id = str(uuid.UUID(project_id))
    if not authorization.startswith("Bearer "):
        raise CollaborationError(401, "A collaboration bearer token is required")
    provided = authorization[7:]
    if not provided:
        raise CollaborationError(401, "A collaboration bearer token is required")
    matched = None
    for account in _accounts():
        if hmac.compare_digest(provided, account["token"]):
            matched = account
    if matched is not None:
        projects = matched["projects"]
        role = projects.get(project_id) or projects.get(project_id.lower()) or projects.get("*")
        if role is None:
            raise CollaborationError(403, "This account does not have access to the project")
        user_id = matched["user_id"]
    else:
        token_hash = hashlib.sha256(provided.encode("utf-8")).hexdigest()
        database = _open_database()
        try:
            member = database.execute(
                "SELECT user_id, role FROM project_members WHERE project_id=? AND token_hash=?",
                (project_id, token_hash),
            ).fetchone()
        except sqlite3.Error as error:
            raise CollaborationError(503, "Could not read project membership") from error
        finally:
            database.close()
        if member is None:
            raise CollaborationError(401, "Collaboration token is invalid")
        user_id, role = member["user_id"], member["role"]
    if write and role == "viewer":
        raise CollaborationError(403, "Viewer access cannot upload project revisions")
    return user_id, role


def _company_identity_for_token(authorization: str) -> tuple[str, str | None, str | None]:
    if not authorization.startswith("Bearer ") or not authorization[7:]:
        raise CollaborationError(401, "A collaboration bearer token is required")
    provided = authorization[7:]
    for account in _accounts():
        if hmac.compare_digest(provided, account["token"]):
            return account["user_id"], account.get("company_id"), account.get("company_role")

    token_hash = hashlib.sha256(provided.encode("utf-8")).hexdigest()
    database = _open_database()
    try:
        member = database.execute(
            "SELECT user_id, company_id, company_role FROM project_members WHERE token_hash=?",
            (token_hash,),
        ).fetchone()
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not read company membership") from error
    finally:
        database.close()
    if member is None:
        raise CollaborationError(401, "Collaboration token is invalid")
    return member["user_id"], member["company_id"], member["company_role"]


def _authorize_company(authorization: str, *, write: bool) -> tuple[str, str, str]:
    user_id, company_id, role = _company_identity_for_token(authorization)
    if not company_id or not role:
        raise CollaborationError(403, "This account is not assigned to a company library")
    if write and role == "viewer":
        raise CollaborationError(403, "Viewer access cannot publish the Company Library")
    return user_id, company_id, role


def _validate_company_library_bundle(bundle: object) -> str:
    if not isinstance(bundle, dict) or bundle.get("format") != COMPANY_LIBRARY_BUNDLE_FORMAT:
        raise CollaborationError(422, "Request must contain a ConstructFlow Company Library bundle")
    version = bundle.get("schema_version")
    if not isinstance(version, int) or isinstance(version, bool) or version not in {1, 2, 3, 4, 5, 6} or bundle.get("currency") != "THB":
        raise CollaborationError(422, "Company Library schema version or currency is unsupported")
    exported_at = bundle.get("exported_at")
    if not isinstance(exported_at, str) or len(exported_at) > 80:
        raise CollaborationError(422, "Company Library export timestamp is invalid")
    try:
        datetime.fromisoformat(exported_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise CollaborationError(422, "Company Library export timestamp is invalid") from error
    if version >= 2:
        settings = bundle.get("pricing_settings")
        if not isinstance(settings, dict):
            raise CollaborationError(422, "Company Library pricing settings are required")
        for key in ("default_gross_margin_percent", "minimum_gross_margin_percent"):
            amount = settings.get(key)
            if not isinstance(amount, (int, float)) or isinstance(amount, bool) or amount < 0 or amount >= 100:
                raise CollaborationError(422, "Company Library pricing settings are invalid")
    settings_updated_at = bundle.get("pricing_settings_updated_at")
    if settings_updated_at is not None:
        if not isinstance(settings_updated_at, str) or len(settings_updated_at) > 80:
            raise CollaborationError(422, "Company Library pricing timestamp is invalid")
        try:
            datetime.fromisoformat(settings_updated_at.replace("Z", "+00:00"))
        except ValueError as error:
            raise CollaborationError(422, "Company Library pricing timestamp is invalid") from error
    limits = {
        "price_books": 100,
        "proposal_templates": 100,
        "discount_rules": 100,
        "field_form_templates": 100,
        "supplier_products": 1000,
        "supplier_product_bundles": 500,
    }
    for key, maximum in limits.items():
        records = bundle.get(key)
        if key == "field_form_templates" and records is None and version < 3:
            continue
        if key == "discount_rules" and records is None and version < 5:
            continue
        if not isinstance(records, list) or len(records) > maximum:
            raise CollaborationError(422, f"Company Library {key} must contain at most {maximum} records")
        ids: set[str] = set()
        for index, record in enumerate(records, 1):
            if not isinstance(record, dict) or not isinstance(record.get("id"), str) or not UUID_PATTERN.fullmatch(record["id"]):
                raise CollaborationError(422, f"Company Library {key} record {index} has an invalid UUID")
            if record["id"] in ids:
                raise CollaborationError(422, f"Company Library {key} contains duplicate UUIDs")
            ids.add(record["id"])
    if version >= 3 and not isinstance(bundle.get("field_form_templates"), list):
        raise CollaborationError(422, "Company Library field form templates are required")
    if version >= 6:
        category_order = bundle.get("supplier_category_order")
        if not isinstance(category_order, list) or len(category_order) > 1500:
            raise CollaborationError(422, "Company Library supplier category order must contain at most 1500 names")
        category_names: set[str] = set()
        for name in category_order:
            if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80 or name.strip().casefold() == "ทุกหมวด":
                raise CollaborationError(422, "Company Library supplier category order contains an invalid name")
            key = name.strip().casefold()
            if key in category_names:
                raise CollaborationError(422, "Company Library supplier category order contains duplicate names")
            category_names.add(key)
    category_order_updated_at = bundle.get("supplier_category_order_updated_at")
    if category_order_updated_at is not None:
        if not isinstance(category_order_updated_at, str) or len(category_order_updated_at) > 80:
            raise CollaborationError(422, "Company Library supplier category timestamp is invalid")
        try:
            datetime.fromisoformat(category_order_updated_at.replace("Z", "+00:00"))
        except ValueError as error:
            raise CollaborationError(422, "Company Library supplier category timestamp is invalid") from error
    if version >= 5:
        discount_rules = bundle["discount_rules"]
        names: set[str] = set()
        for index, record in enumerate(discount_rules, 1):
            name = record.get("name")
            percent = record.get("discount_percent")
            notes = record.get("notes")
            if not isinstance(name, str) or not name.strip() or len(name) > 100:
                raise CollaborationError(422, f"Company Library discount rule {index} has an invalid name")
            name_key = name.strip().casefold()
            if name_key in names:
                raise CollaborationError(422, "Company Library discount rules contain duplicate names")
            names.add(name_key)
            if not isinstance(percent, (int, float)) or isinstance(percent, bool) or percent < 0 or percent > 100 or not math.isfinite(percent):
                raise CollaborationError(422, f"Company Library discount rule {index} has an invalid percentage")
            if not isinstance(notes, str) or len(notes) > 500:
                raise CollaborationError(422, f"Company Library discount rule {index} has invalid notes")
            for timestamp_key in ("created_at", "updated_at"):
                timestamp = record.get(timestamp_key)
                if not isinstance(timestamp, str) or len(timestamp) > 80:
                    raise CollaborationError(422, f"Company Library discount rule {index} has an invalid timestamp")
                try:
                    datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                except ValueError as error:
                    raise CollaborationError(422, f"Company Library discount rule {index} has an invalid timestamp") from error
    try:
        encoded = json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as error:
        raise CollaborationError(422, "Company Library contains unsupported JSON values") from error
    if len(encoded.encode("utf-8")) > MAX_COMPANY_LIBRARY_BYTES:
        raise CollaborationError(413, "Company Library exceeds 20 MB")
    return encoded


def get_project_company_library(project_id: str, authorization: str) -> dict:
    _user_id, role = _authorize(project_id, authorization, write=False)
    database = _open_database()
    try:
        row = database.execute(
            "SELECT version, bundle_json, updated_by, updated_at FROM project_company_libraries WHERE project_id=?",
            (project_id,),
        ).fetchone()
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not read the shared Company Library") from error
    finally:
        database.close()
    if row is None:
        return {"project_id": project_id, "version": 0, "can_write": role != "viewer", "bundle": None, "updated_by": None, "updated_at": None}
    return {
        "project_id": project_id,
        "version": row["version"],
        "can_write": role != "viewer",
        "bundle": json.loads(row["bundle_json"]),
        "updated_by": row["updated_by"],
        "updated_at": row["updated_at"],
    }


def save_project_company_library(project_id: str, authorization: str, payload: object) -> dict:
    user_id, _role = _authorize(project_id, authorization, write=True)
    if not isinstance(payload, dict):
        raise CollaborationError(422, "Request must be a JSON object")
    base_version = payload.get("base_version")
    if not isinstance(base_version, int) or isinstance(base_version, bool) or base_version < 0:
        raise CollaborationError(422, "Company Library base_version must be a non-negative integer")
    bundle_json = _validate_company_library_bundle(payload.get("bundle"))
    now = datetime.now(timezone.utc).isoformat()
    database = None
    try:
        database = _open_database()
        database.execute("BEGIN IMMEDIATE")
        row = database.execute(
            "SELECT version FROM project_company_libraries WHERE project_id=?",
            (project_id,),
        ).fetchone()
        current_version = row["version"] if row else 0
        if base_version != current_version:
            database.rollback()
            raise CollaborationError(409, "Shared Company Library changed since it was loaded; sync again to merge the latest version")
        next_version = current_version + 1
        database.execute(
            """INSERT INTO project_company_libraries(project_id, version, bundle_json, updated_by, updated_at)
               VALUES(?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET
               version=excluded.version, bundle_json=excluded.bundle_json,
               updated_by=excluded.updated_by, updated_at=excluded.updated_at""",
            (project_id, next_version, bundle_json, user_id, now),
        )
        database.commit()
    except CollaborationError:
        raise
    except sqlite3.Error as error:
        if database is not None:
            database.rollback()
        raise CollaborationError(503, "Could not save the shared Company Library") from error
    finally:
        if database is not None:
            database.close()
    return {"project_id": project_id, "version": next_version, "updated_by": user_id, "updated_at": now}


def get_company_library(authorization: str) -> dict:
    _user_id, company_id, role = _authorize_company(authorization, write=False)
    database = _open_database()
    try:
        row = database.execute(
            "SELECT version, bundle_json, updated_by, updated_at FROM company_libraries WHERE company_id=?",
            (company_id,),
        ).fetchone()
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not read the shared company library") from error
    finally:
        database.close()
    if row is None:
        return {"company_id": company_id, "version": 0, "can_write": role != "viewer", "bundle": None, "updated_by": None, "updated_at": None}
    return {
        "company_id": company_id,
        "version": row["version"],
        "can_write": role != "viewer",
        "bundle": json.loads(row["bundle_json"]),
        "updated_by": row["updated_by"],
        "updated_at": row["updated_at"],
    }


def save_company_library(authorization: str, payload: object) -> dict:
    user_id, company_id, _role = _authorize_company(authorization, write=True)
    if not isinstance(payload, dict):
        raise CollaborationError(422, "Request must be a JSON object")
    base_version = payload.get("base_version")
    if not isinstance(base_version, int) or isinstance(base_version, bool) or base_version < 0:
        raise CollaborationError(422, "Company Library base_version must be a non-negative integer")
    bundle_json = _validate_company_library_bundle(payload.get("bundle"))
    now = datetime.now(timezone.utc).isoformat()
    database = None
    try:
        database = _open_database()
        database.execute("BEGIN IMMEDIATE")
        row = database.execute(
            "SELECT version FROM company_libraries WHERE company_id=?",
            (company_id,),
        ).fetchone()
        current_version = row["version"] if row else 0
        if base_version != current_version:
            database.rollback()
            raise CollaborationError(409, "Company Library changed since it was loaded; sync again to merge the latest version")
        next_version = current_version + 1
        database.execute(
            """INSERT INTO company_libraries(company_id, version, bundle_json, updated_by, updated_at)
               VALUES(?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET
               version=excluded.version, bundle_json=excluded.bundle_json,
               updated_by=excluded.updated_by, updated_at=excluded.updated_at""",
            (company_id, next_version, bundle_json, user_id, now),
        )
        database.commit()
    except CollaborationError:
        raise
    except sqlite3.Error as error:
        if database is not None:
            database.rollback()
        raise CollaborationError(503, "Could not save the shared company library") from error
    finally:
        if database is not None:
            database.close()
    return {"company_id": company_id, "version": next_version, "updated_by": user_id, "updated_at": now}


def _validate_zapier_catch_hook_url(value: object) -> str:
    if not isinstance(value, str) or not value or len(value) > 2048:
        raise CollaborationError(422, "Zapier Catch Hook URL is invalid")
    try:
        parsed = urllib.parse.urlparse(value)
        port = parsed.port
    except ValueError as error:
        raise CollaborationError(422, "Zapier Catch Hook URL is invalid") from error
    if (
        parsed.scheme.lower() != "https"
        or parsed.hostname is None
        or parsed.hostname.lower() != "hooks.zapier.com"
        or port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or not ZAPIER_CATCH_PATH_PATTERN.fullmatch(parsed.path)
    ):
        raise CollaborationError(422, "Only HTTPS Zapier Catch Hook URLs are allowed")
    return urllib.parse.urlunparse(("https", "hooks.zapier.com", parsed.path, "", "", ""))


def _zapier_target_key(target_url: str) -> str:
    parsed = urllib.parse.urlparse(target_url)
    return hashlib.sha256(f"{parsed.hostname}\n{parsed.path}".encode("utf-8")).hexdigest()


def deliver_zapier_proposal(project_id: str, authorization: str, value: object) -> dict:
    user_id, project_id = _authorize_write_project(project_id, authorization)
    if not isinstance(value, dict):
        raise CollaborationError(422, "Zapier delivery request must be an object")
    target_url = _validate_zapier_catch_hook_url(value.get("target_url"))
    payload = value.get("payload")
    if not isinstance(payload, dict) or not 1 <= len(payload) <= 256:
        raise CollaborationError(422, "Zapier proposal payload must contain 1–256 fields")
    if any(
        not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_]{1,100}", key)
        or not isinstance(item, str)
        for key, item in payload.items()
    ):
        raise CollaborationError(422, "Zapier proposal fields must be named strings")
    event_id = payload.get("event_id")
    if not isinstance(event_id, str) or not UUID_PATTERN.fullmatch(event_id):
        raise CollaborationError(422, "Zapier event_id must be a UUID")
    event_id = str(uuid.UUID(event_id))
    if payload.get("event") != "constructflow.proposal.snapshot" or payload.get("schema_version") != "1":
        raise CollaborationError(422, "Zapier event type or schema version is unsupported")
    if payload.get("project_uuid", "").lower() != project_id:
        raise CollaborationError(422, "Proposal payload project UUID does not match the authenticated project")

    body = urllib.parse.urlencode(payload).encode("utf-8")
    if not body or len(body) > MAX_ZAPIER_PAYLOAD_BYTES:
        raise CollaborationError(413, "Zapier proposal payload exceeds 1 MB")
    canonical_payload = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    payload_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()
    target_key = _zapier_target_key(target_url)
    now = datetime.now(timezone.utc).isoformat()
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        prior = database.execute(
            "SELECT payload_hash, target_host, status, attempt_count, response_status FROM integration_deliveries WHERE project_id=? AND event_id=?",
            (project_id, event_id),
        ).fetchone()
        if prior:
            if prior["payload_hash"] != payload_hash or prior["target_host"] != target_key:
                raise CollaborationError(409, "Zapier event_id was already used with different content or Catch Hook")
            if prior["status"] == "succeeded":
                database.commit()
                return {"event_id": event_id, "status": "already_succeeded", "response_status": prior["response_status"], "attempt": prior["attempt_count"]}
            if prior["status"] in {"pending", "uncertain"}:
                raise CollaborationError(409, "Zapier delivery outcome is uncertain or still pending; this event was not resent")
            attempt = prior["attempt_count"] + 1
            database.execute(
                "UPDATE integration_deliveries SET status='pending', attempt_count=?, response_status=NULL, updated_at=? WHERE project_id=? AND event_id=?",
                (attempt, now, project_id, event_id),
            )
        else:
            attempt = 1
            database.execute(
                "INSERT INTO integration_deliveries(project_id, event_id, payload_hash, target_host, status, attempt_count, response_status, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (project_id, event_id, payload_hash, target_key, "pending", attempt, None, now, now),
            )
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not record Zapier delivery") from error
    finally:
        database.close()

    request = urllib.request.Request(
        target_url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "ConstructFlow-Integration/1"},
        method="POST",
    )
    opener = urllib.request.build_opener(
        _NoRedirectHandler(),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
    )
    response_status = None
    try:
        with opener.open(request, timeout=12) as response:
            response_status = int(response.getcode())
    except urllib.error.HTTPError as error:
        response_status = int(error.code)
        error.close()
    except (urllib.error.URLError, TimeoutError, OSError, ssl.SSLError) as error:
        _finish_zapier_delivery(project_id, event_id, "uncertain", None)
        raise CollaborationError(502, "Zapier delivery outcome is uncertain; the same event will not be resent. Check Zapier task history before creating a new event.") from error

    succeeded = 200 <= response_status < 300
    uncertain = response_status >= 500 or 300 <= response_status < 400
    _finish_zapier_delivery(project_id, event_id, "succeeded" if succeeded else "uncertain" if uncertain else "failed", response_status)
    if not succeeded:
        if uncertain:
            raise CollaborationError(502, f"Zapier returned HTTP {response_status}; delivery outcome is uncertain and this event will not be resent. Check Zapier task history before creating a new event.")
        raise CollaborationError(502, f"Zapier returned HTTP {response_status}; this event can be retried with the same event_id")
    return {"event_id": event_id, "status": "succeeded", "response_status": response_status, "attempt": attempt, "delivered_by": user_id}


def _configured_webhook_hosts() -> list[str]:
    raw = os.environ.get("CONSTRUCTFLOW_WEBHOOK_ALLOWED_HOSTS", "")
    hosts: set[str] = set()
    for entry in raw.split(","):
        host = entry.strip().rstrip(".").lower()
        if not host:
            continue
        try:
            host = host.encode("idna").decode("ascii")
        except UnicodeError as error:
            raise CollaborationError(503, "Configured webhook host is not a valid DNS name") from error
        if len(host) > 253 or not re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*", host):
            raise CollaborationError(503, "Configured webhook hosts must be exact DNS names without wildcards")
        try:
            ipaddress.ip_address(host)
        except ValueError:
            hosts.add(host)
        else:
            raise CollaborationError(503, "Configured webhook hosts must be DNS names, not IP addresses")
    return sorted(hosts)


def get_project_webhook_config(project_id: str, authorization: str) -> dict:
    _authorize(project_id, authorization, write=False)
    return {
        "allowed_hosts": _configured_webhook_hosts(),
        "signature": "HMAC-SHA256",
        "max_payload_bytes": MAX_CUSTOM_WEBHOOK_BYTES,
    }


QUICKBOOKS_OAUTH_SCOPE = "com.intuit.quickbooks.accounting"
QUICKBOOKS_CALLBACK_PATH = "/api/integrations/quickbooks/callback"


def _quickbooks_configuration(*, require_encryption: bool = True) -> dict:
    client_id = os.environ.get("CONSTRUCTFLOW_QUICKBOOKS_CLIENT_ID", "").strip()
    client_secret = os.environ.get("CONSTRUCTFLOW_QUICKBOOKS_CLIENT_SECRET", "").strip()
    redirect_uri = os.environ.get("CONSTRUCTFLOW_QUICKBOOKS_REDIRECT_URI", "").strip()
    environment = os.environ.get("CONSTRUCTFLOW_QUICKBOOKS_ENVIRONMENT", "production").strip().lower()
    encryption_key = os.environ.get("CONSTRUCTFLOW_QBO_TOKEN_ENCRYPTION_KEY", "").strip()
    if not client_id or not client_secret or not redirect_uri or environment not in {"sandbox", "production"}:
        raise CollaborationError(503, "QuickBooks Online OAuth is not configured on this gateway")
    try:
        parsed_redirect = urllib.parse.urlsplit(redirect_uri)
        parsed_redirect.port
    except ValueError as error:
        raise CollaborationError(503, "QuickBooks redirect URI is invalid") from error
    local_http = parsed_redirect.hostname in {"localhost", "127.0.0.1", "::1"} and parsed_redirect.scheme == "http"
    if (
        parsed_redirect.scheme != ("http" if local_http else "https")
        or not parsed_redirect.netloc
        or parsed_redirect.username is not None
        or parsed_redirect.password is not None
        or parsed_redirect.path != QUICKBOOKS_CALLBACK_PATH
        or parsed_redirect.query
        or parsed_redirect.fragment
    ):
        raise CollaborationError(503, f"QuickBooks redirect URI must be a secure URL ending in {QUICKBOOKS_CALLBACK_PATH}")
    key = None
    if encryption_key:
        try:
            key = bytes.fromhex(encryption_key)
        except ValueError as error:
            raise CollaborationError(503, "QuickBooks token encryption key must be 64 hexadecimal characters") from error
        if len(key) != 32:
            raise CollaborationError(503, "QuickBooks token encryption key must be 32 bytes (64 hexadecimal characters)")
    elif require_encryption:
        raise CollaborationError(503, "Set CONSTRUCTFLOW_QBO_TOKEN_ENCRYPTION_KEY to a random 32-byte hex value before connecting QuickBooks")
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "environment": environment,
        "encryption_key": key,
    }


def quickbooks_connection_status(project_id: str, authorization: str) -> dict:
    _user_id, project_role = _authorize(project_id, authorization, write=False)
    _identity_user, company_id, company_role = _company_identity_for_token(authorization)
    scope_type, scope_id = ("company", company_id) if company_id and company_role else ("project", project_id)
    database = _open_database()
    try:
        connection = database.execute(
            "SELECT realm_id, environment, connected_at FROM quickbooks_connections WHERE scope_type=? AND scope_id=?",
            (scope_type, scope_id),
        ).fetchone()
    finally:
        database.close()
    try:
        _quickbooks_configuration(require_encryption=True)
        configured = True
        configuration_error = ""
    except CollaborationError as error:
        configured = False
        configuration_error = str(error)
    return {
        "configured": configured,
        "connected": connection is not None,
        "realm_id": connection["realm_id"] if connection else None,
        "environment": connection["environment"] if connection else None,
        "connected_at": connection["connected_at"] if connection else None,
        "scope": scope_type,
        "scope_id": scope_id,
        "can_manage": (company_role == "owner") if scope_type == "company" else project_role == "owner",
        "can_write": project_role != "viewer" and ((company_role in {"owner", "editor"}) if scope_type == "company" else project_role in {"owner", "editor"}),
        "configuration_error": configuration_error,
    }


def _quickbooks_scope_for_user(project_id: str, authorization: str, *, manage: bool, write: bool = False) -> tuple[str, str, str, str]:
    user_id, project_role = _authorize(project_id, authorization, write=write)
    _identity_user, company_id, company_role = _company_identity_for_token(authorization)
    if company_id and company_role:
        if manage and company_role != "owner":
            raise CollaborationError(403, "Only a company owner can manage the shared QuickBooks connection")
        if write and company_role not in {"owner", "editor"}:
            raise CollaborationError(403, "Only a company owner or editor can use the shared QuickBooks connection")
        return user_id, "company", company_id, project_id
    if manage and project_role != "owner":
        raise CollaborationError(403, "Only a project owner can manage the QuickBooks connection")
    return user_id, "project", project_id, project_id


def start_quickbooks_oauth(project_id: str, authorization: str) -> dict:
    user_id, scope_type, scope_id, project_id = _quickbooks_scope_for_user(project_id, authorization, manage=True)
    configuration = _quickbooks_configuration()
    state = secrets.token_urlsafe(32)
    state_hash = hashlib.sha256(state.encode("ascii")).hexdigest()
    now = datetime.now(timezone.utc)
    database = _open_database()
    try:
        database.execute("DELETE FROM quickbooks_oauth_states WHERE expires_at < ?", (now.isoformat(),))
        database.execute(
            "INSERT INTO quickbooks_oauth_states(state_hash, project_id, scope_type, scope_id, user_id, expires_at, created_at) VALUES(?,?,?,?,?,?,?)",
            (state_hash, project_id, scope_type, scope_id, user_id, (now + timedelta(minutes=10)).isoformat(), now.isoformat()),
        )
        database.commit()
    finally:
        database.close()
    authorization_url = urllib.parse.urlencode({
        "client_id": configuration["client_id"],
        "redirect_uri": configuration["redirect_uri"],
        "response_type": "code",
        "scope": QUICKBOOKS_OAUTH_SCOPE,
        "state": state,
    })
    return {"authorization_url": f"https://appcenter.intuit.com/connect/oauth2?{authorization_url}"}


def _consume_quickbooks_oauth_state(state: str) -> sqlite3.Row:
    if not isinstance(state, str) or len(state) < 32 or len(state) > 256:
        raise CollaborationError(400, "QuickBooks authorization state is invalid or expired")
    try:
        state_hash = hashlib.sha256(state.encode("ascii")).hexdigest()
    except UnicodeEncodeError as error:
        raise CollaborationError(400, "QuickBooks authorization state is invalid or expired") from error
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        row = database.execute("SELECT * FROM quickbooks_oauth_states WHERE state_hash=?", (state_hash,)).fetchone()
        database.execute("DELETE FROM quickbooks_oauth_states WHERE state_hash=?", (state_hash,))
        database.commit()
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not finish QuickBooks authorization") from error
    finally:
        database.close()
    if row is None or datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
        raise CollaborationError(400, "QuickBooks authorization state is invalid or expired")
    return row


def _quickbooks_user_can_complete(state: sqlite3.Row) -> bool:
    for account in _accounts():
        if account["user_id"] != state["user_id"]:
            continue
        if state["scope_type"] == "company":
            return account.get("company_id") == state["scope_id"] and account.get("company_role") == "owner"
        project_roles = account["projects"]
        return (project_roles.get(state["project_id"]) or project_roles.get(state["project_id"].lower()) or project_roles.get("*")) == "owner"
    database = _open_database()
    try:
        member = database.execute(
            "SELECT role, company_id, company_role FROM project_members WHERE project_id=? AND user_id=?",
            (state["project_id"], state["user_id"]),
        ).fetchone()
    finally:
        database.close()
    if member is None:
        return False
    if state["scope_type"] == "company":
        return member["company_id"] == state["scope_id"] and member["company_role"] == "owner"
    return member["role"] == "owner"


def _exchange_quickbooks_code(code: str, configuration: dict) -> dict:
    import base64

    endpoint = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
    credentials = base64.b64encode(f"{configuration['client_id']}:{configuration['client_secret']}".encode("utf-8")).decode("ascii")
    body = urllib.parse.urlencode({"grant_type": "authorization_code", "code": code, "redirect_uri": configuration["redirect_uri"]}).encode("ascii")
    request = urllib.request.Request(endpoint, data=body, headers={
        "Authorization": f"Basic {credentials}",
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }, method="POST")
    opener = urllib.request.build_opener(_NoRedirectHandler())
    try:
        with opener.open(request, timeout=15) as response:
            if response.status != 200:
                raise CollaborationError(502, "QuickBooks token exchange did not succeed")
            payload = json.loads(response.read(64_001))
    except CollaborationError:
        raise
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
        raise CollaborationError(502, "Could not complete QuickBooks token exchange") from error
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("access_token"), str) or not 1 <= len(payload["access_token"]) <= 8192
        or not isinstance(payload.get("refresh_token"), str) or not 1 <= len(payload["refresh_token"]) <= 8192
    ):
        raise CollaborationError(502, "QuickBooks returned an invalid token response")
    if (
        not isinstance(payload.get("expires_in"), int) or isinstance(payload.get("expires_in"), bool) or payload["expires_in"] <= 0
        or not isinstance(payload.get("x_refresh_token_expires_in"), int) or isinstance(payload.get("x_refresh_token_expires_in"), bool)
        or payload["x_refresh_token_expires_in"] <= 0
    ):
        raise CollaborationError(502, "QuickBooks token response is missing expiration data")
    return payload


def complete_quickbooks_oauth(state: str, code: str, realm_id: str) -> dict:
    state_row = _consume_quickbooks_oauth_state(state)
    if not _quickbooks_user_can_complete(state_row):
        raise CollaborationError(403, "The QuickBooks connection owner no longer has access")
    if not isinstance(code, str) or not code or len(code) > 4096 or not isinstance(realm_id, str) or not re.fullmatch(r"\d{1,32}", realm_id):
        raise CollaborationError(400, "QuickBooks authorization response is invalid")
    configuration = _quickbooks_configuration()
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as error:
        raise CollaborationError(503, "Install the gateway requirements to enable encrypted QuickBooks tokens") from error
    tokens = _exchange_quickbooks_code(code, configuration)

    now = datetime.now(timezone.utc)
    token_record = {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "access_expires_at": (now + timedelta(seconds=tokens["expires_in"])).isoformat(),
        "refresh_expires_at": (now + timedelta(seconds=tokens["x_refresh_token_expires_in"])).isoformat(),
    }
    aad = f"quickbooks:{state_row['scope_type']}:{state_row['scope_id']}".encode("utf-8")
    nonce = secrets.token_bytes(12)
    ciphertext = AESGCM(configuration["encryption_key"]).encrypt(nonce, json.dumps(token_record).encode("utf-8"), aad)
    stored_value = (nonce + ciphertext).hex()
    connected_at = now.isoformat()
    database = _open_database()
    try:
        database.execute(
            """INSERT INTO quickbooks_connections(scope_type, scope_id, project_id, realm_id, token_ciphertext, environment, connected_by, connected_at, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(scope_type, scope_id) DO UPDATE SET
               project_id=excluded.project_id, realm_id=excluded.realm_id, token_ciphertext=excluded.token_ciphertext,
               environment=excluded.environment, connected_by=excluded.connected_by, connected_at=excluded.connected_at, updated_at=excluded.updated_at""",
            (state_row["scope_type"], state_row["scope_id"], state_row["project_id"], realm_id, stored_value,
             configuration["environment"], state_row["user_id"], connected_at, connected_at),
        )
        database.commit()
    finally:
        database.close()
    return {"connected": True, "realm_id": realm_id, "scope": state_row["scope_type"]}


def cancel_quickbooks_oauth(state: str) -> None:
    _consume_quickbooks_oauth_state(state)


def disconnect_quickbooks(project_id: str, authorization: str) -> dict:
    _user_id, scope_type, scope_id, _project_id = _quickbooks_scope_for_user(project_id, authorization, manage=True)
    configuration = _quickbooks_configuration()
    database = _open_database()
    try:
        connection = database.execute(
            "SELECT token_ciphertext FROM quickbooks_connections WHERE scope_type=? AND scope_id=?",
            (scope_type, scope_id),
        ).fetchone()
    finally:
        database.close()
    if connection is None:
        return {"disconnected": True, "scope": scope_type}
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as error:
        raise CollaborationError(503, "Install the gateway requirements to manage encrypted QuickBooks tokens") from error
    try:
        encrypted = bytes.fromhex(connection["token_ciphertext"])
        aad = f"quickbooks:{scope_type}:{scope_id}".encode("utf-8")
        token_record = json.loads(AESGCM(configuration["encryption_key"]).decrypt(encrypted[:12], encrypted[12:], aad))
    except Exception as error:
        raise CollaborationError(503, "Could not decrypt the stored QuickBooks connection; the encryption key may have changed") from error
    import base64

    credentials = base64.b64encode(f"{configuration['client_id']}:{configuration['client_secret']}".encode("utf-8")).decode("ascii")
    request = urllib.request.Request(
        "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
        data=json.dumps({"token": token_record["refresh_token"]}).encode("utf-8"),
        headers={"Authorization": f"Basic {credentials}", "Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.build_opener(_NoRedirectHandler()).open(request, timeout=15) as response:
            if response.status not in {200, 204}:
                raise CollaborationError(502, "QuickBooks did not confirm token revocation; the local connection remains saved")
    except CollaborationError:
        raise
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise CollaborationError(502, "QuickBooks revocation outcome is uncertain; the local connection remains saved") from error
    database = _open_database()
    try:
        database.execute(
            "DELETE FROM quickbooks_connections WHERE scope_type=? AND scope_id=? AND token_ciphertext=?",
            (scope_type, scope_id, connection["token_ciphertext"]),
        )
        database.commit()
    finally:
        database.close()
    return {"disconnected": True, "scope": scope_type}


def _quickbooks_refresh_lock(scope_type: str, scope_id: str) -> threading.Lock:
    key = (scope_type, scope_id)
    with _QUICKBOOKS_REFRESH_LOCKS_GUARD:
        return _QUICKBOOKS_REFRESH_LOCKS.setdefault(key, threading.Lock())


def _quickbooks_connection(scope_type: str, scope_id: str) -> sqlite3.Row:
    database = _open_database()
    try:
        row = database.execute(
            "SELECT * FROM quickbooks_connections WHERE scope_type=? AND scope_id=?",
            (scope_type, scope_id),
        ).fetchone()
    finally:
        database.close()
    if row is None:
        raise CollaborationError(409, "Connect a QuickBooks company before using its accounting catalog")
    return row


def _encrypt_quickbooks_tokens(configuration: dict, scope_type: str, scope_id: str, token_record: dict) -> str:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as error:
        raise CollaborationError(503, "Install the gateway requirements to enable encrypted QuickBooks tokens") from error
    nonce = secrets.token_bytes(12)
    aad = f"quickbooks:{scope_type}:{scope_id}".encode("utf-8")
    encrypted = AESGCM(configuration["encryption_key"]).encrypt(
        nonce, json.dumps(token_record, separators=(",", ":")).encode("utf-8"), aad,
    )
    return (nonce + encrypted).hex()


def _decrypt_quickbooks_tokens(configuration: dict, scope_type: str, scope_id: str, ciphertext: str) -> dict:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        encrypted = bytes.fromhex(ciphertext)
        aad = f"quickbooks:{scope_type}:{scope_id}".encode("utf-8")
        token_record = json.loads(AESGCM(configuration["encryption_key"]).decrypt(encrypted[:12], encrypted[12:], aad))
    except Exception as error:
        raise CollaborationError(503, "Could not decrypt the stored QuickBooks connection; the encryption key may have changed") from error
    if not isinstance(token_record, dict):
        raise CollaborationError(503, "The stored QuickBooks token record is invalid")
    return token_record


def _quickbooks_refresh_tokens(refresh_token: str, configuration: dict) -> dict:
    import base64

    endpoint = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
    credentials = base64.b64encode(f"{configuration['client_id']}:{configuration['client_secret']}".encode("utf-8")).decode("ascii")
    request = urllib.request.Request(
        endpoint,
        data=urllib.parse.urlencode({"grant_type": "refresh_token", "refresh_token": refresh_token}).encode("ascii"),
        headers={"Authorization": f"Basic {credentials}", "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.build_opener(_NoRedirectHandler()).open(request, timeout=20) as response:
            payload = json.loads(response.read(64_001))
    except urllib.error.HTTPError as error:
        raise CollaborationError(502, "QuickBooks rejected the stored refresh token; reconnect the company") from error
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
        raise CollaborationError(502, "Could not refresh the QuickBooks access token") from error
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("access_token"), str) or not 1 <= len(payload["access_token"]) <= 8192
        or ("refresh_token" in payload and (not isinstance(payload["refresh_token"], str) or not 1 <= len(payload["refresh_token"]) <= 8192))
        or not isinstance(payload.get("expires_in"), int) or isinstance(payload.get("expires_in"), bool) or payload["expires_in"] <= 0
    ):
        raise CollaborationError(502, "QuickBooks returned an invalid refreshed token response")
    return payload


def _quickbooks_access_token(connection: sqlite3.Row, configuration: dict) -> str:
    scope_type, scope_id = connection["scope_type"], connection["scope_id"]
    with _quickbooks_refresh_lock(scope_type, scope_id):
        current = _quickbooks_connection(scope_type, scope_id)
        token_record = _decrypt_quickbooks_tokens(configuration, scope_type, scope_id, current["token_ciphertext"])
        try:
            expires_at = datetime.fromisoformat(token_record["access_expires_at"])
        except (KeyError, TypeError, ValueError) as error:
            raise CollaborationError(503, "The stored QuickBooks access token is missing expiration data") from error
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at > datetime.now(timezone.utc) + timedelta(seconds=90):
            return token_record["access_token"]
        try:
            refresh_expires_at = datetime.fromisoformat(token_record["refresh_expires_at"])
        except (KeyError, TypeError, ValueError) as error:
            raise CollaborationError(503, "The stored QuickBooks refresh token is missing expiration data") from error
        if refresh_expires_at.tzinfo is None:
            refresh_expires_at = refresh_expires_at.replace(tzinfo=timezone.utc)
        if refresh_expires_at <= datetime.now(timezone.utc):
            raise CollaborationError(409, "The QuickBooks refresh token expired; reconnect the company")
        refreshed = _quickbooks_refresh_tokens(token_record["refresh_token"], configuration)
        now = datetime.now(timezone.utc)
        refreshed_record = {
            "access_token": refreshed["access_token"],
            "refresh_token": refreshed.get("refresh_token", token_record["refresh_token"]),
            "access_expires_at": (now + timedelta(seconds=refreshed["expires_in"])).isoformat(),
            "refresh_expires_at": (now + timedelta(seconds=refreshed["x_refresh_token_expires_in"])).isoformat()
            if isinstance(refreshed.get("x_refresh_token_expires_in"), int) and refreshed["x_refresh_token_expires_in"] > 0
            else token_record["refresh_expires_at"],
        }
        encrypted = _encrypt_quickbooks_tokens(configuration, scope_type, scope_id, refreshed_record)
        database = _open_database()
        try:
            database.execute(
                "UPDATE quickbooks_connections SET token_ciphertext=?, updated_at=? WHERE scope_type=? AND scope_id=? AND token_ciphertext=?",
                (encrypted, now.isoformat(), scope_type, scope_id, current["token_ciphertext"]),
            )
            database.commit()
            latest = database.execute(
                "SELECT token_ciphertext FROM quickbooks_connections WHERE scope_type=? AND scope_id=?",
                (scope_type, scope_id),
            ).fetchone()
        finally:
            database.close()
        if latest is None:
            raise CollaborationError(409, "The QuickBooks connection was removed while refreshing its token")
        if latest["token_ciphertext"] != encrypted:
            token_record = _decrypt_quickbooks_tokens(configuration, scope_type, scope_id, latest["token_ciphertext"])
            return token_record["access_token"]
        return refreshed_record["access_token"]


def _quickbooks_api_request(connection: sqlite3.Row, configuration: dict, path: str, *, method: str = "GET", query: str | None = None, payload: dict | None = None, request_id: str | None = None) -> dict:
    if not path.startswith("/") or ".." in path or "?" in path or "#" in path:
        raise CollaborationError(500, "Invalid internal QuickBooks API path")
    environment_host = "sandbox-quickbooks.api.intuit.com" if connection["environment"] == "sandbox" else "quickbooks.api.intuit.com"
    parameters = {}
    if query is not None:
        parameters["query"] = query
    if request_id:
        parameters["requestid"] = request_id
    url = f"https://{environment_host}/v3/company/{connection['realm_id']}{path}"
    if parameters:
        url += "?" + urllib.parse.urlencode(parameters)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {_quickbooks_access_token(connection, configuration)}",
        "Accept": "application/json",
        **({"Content-Type": "application/json"} if body is not None else {}),
    }, method=method)
    try:
        with urllib.request.build_opener(_NoRedirectHandler()).open(request, timeout=30) as response:
            response_payload = json.loads(response.read(8_000_001))
    except urllib.error.HTTPError as error:
        try:
            provider_payload = json.loads(error.read(128_001))
            details = provider_payload.get("Fault", {}).get("Error", [])
            provider_message = next((item.get("Detail") or item.get("Message") for item in details if isinstance(item, dict) and (item.get("Detail") or item.get("Message"))), "")
        except (OSError, json.JSONDecodeError, UnicodeDecodeError, AttributeError):
            provider_message = ""
        status = 502 if error.code >= 500 else (429 if error.code == 429 else 422)
        safe_message = str(provider_message).replace("\r", " ").replace("\n", " ")[:400]
        raise CollaborationError(status, f"QuickBooks API returned HTTP {error.code}" + (f": {safe_message}" if safe_message else "")) from error
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
        raise CollaborationError(502, "QuickBooks API did not return a complete response") from error
    if not isinstance(response_payload, dict):
        raise CollaborationError(502, "QuickBooks returned an invalid API response")
    return response_payload


def _quickbooks_query(connection: sqlite3.Row, configuration: dict, entity: str) -> list[dict]:
    allowed = {"Item", "TaxCode", "TaxRate", "Customer", "Payment"}
    if entity not in allowed:
        raise CollaborationError(500, "Unsupported QuickBooks catalog entity")
    results: list[dict] = []
    start = 1
    while True:
        query = f"SELECT * FROM {entity} STARTPOSITION {start} MAXRESULTS 1000"
        response = _quickbooks_api_request(connection, configuration, "/query", query=query)
        page = response.get("QueryResponse", {}).get(entity, [])
        if isinstance(page, dict):
            page = [page]
        if not isinstance(page, list) or any(not isinstance(item, dict) for item in page):
            raise CollaborationError(502, f"QuickBooks returned an invalid {entity} catalog")
        results.extend(page)
        if len(page) < 1000:
            return results
        start += len(page)
        if start > 100_000:
            raise CollaborationError(422, f"The QuickBooks {entity} catalog is too large to enumerate safely")


def _quickbooks_tax_catalog(connection: sqlite3.Row, configuration: dict) -> list[dict]:
    rates = _quickbooks_query(connection, configuration, "TaxRate")
    rates_by_id: dict[str, float] = {}
    for rate in rates:
        try:
            value = float(rate.get("RateValue"))
            if rate.get("Id") and math.isfinite(value) and value >= 0:
                rates_by_id[str(rate["Id"])] = value / 100
        except (TypeError, ValueError):
            continue
    catalog: list[dict] = []
    for code in _quickbooks_query(connection, configuration, "TaxCode"):
        if code.get("Active") is False or not code.get("Id"):
            continue
        rate_details = code.get("SalesTaxRateList", {}).get("TaxRateDetail", [])
        if isinstance(rate_details, dict):
            rate_details = [rate_details]
        resolved: list[float] = []
        if isinstance(rate_details, list):
            for detail in rate_details:
                if not isinstance(detail, dict):
                    continue
                ref = detail.get("TaxRateRef") or {}
                rate_value = rates_by_id.get(str(ref.get("value"))) if ref.get("value") is not None else None
                if rate_value is None:
                    try:
                        rate_value = float(detail.get("RateValue")) / 100
                    except (TypeError, ValueError):
                        rate_value = None
                if rate_value is None or not math.isfinite(rate_value):
                    resolved = []
                    break
                resolved.append(rate_value)
        combined_rate = sum(resolved) if resolved else (0.0 if not rate_details and code.get("Taxable") is False else None)
        catalog.append({"id": str(code["Id"]), "name": str(code.get("Name") or code["Id"])[:160], "rate": combined_rate})
    return catalog


def _quickbooks_export_scope_id(scope_id: str, realm_id: str) -> str:
    # Keep idempotency records separate if an owner reconnects a different QBO company.
    return f"{scope_id}:{realm_id}"


def _quickbooks_catalog_for_scope(connection: sqlite3.Row, configuration: dict) -> dict:
    company_response = _quickbooks_api_request(connection, configuration, f"/companyinfo/{connection['realm_id']}")
    company = company_response.get("CompanyInfo")
    if not isinstance(company, dict):
        raise CollaborationError(502, "QuickBooks did not return company currency details")
    currency_ref = company.get("CurrencyRef") or {}
    currency = str(currency_ref.get("value") or "")
    items = _quickbooks_query(connection, configuration, "Item")
    service_items = [
        {"id": str(item["Id"]), "name": str(item.get("Name") or item["Id"])[:160], "sku": str(item.get("Sku") or "")[:80]}
        for item in items if item.get("Active") is not False and item.get("Type") == "Service" and item.get("Id")
    ]
    tax_codes = _quickbooks_tax_catalog(connection, configuration)
    database = _open_database()
    try:
        mapping = database.execute(
            "SELECT realm_id, service_item_id, service_item_name, tax_codes_json FROM quickbooks_mappings WHERE scope_type=? AND scope_id=?",
            (connection["scope_type"], connection["scope_id"]),
        ).fetchone()
        exports = database.execute(
            "SELECT document_type, source_record_id, status, qbo_document_id, qbo_document_number, requires_review, message, updated_at FROM quickbooks_exports WHERE scope_type=? AND scope_id=? ORDER BY updated_at DESC LIMIT 25",
            (connection["scope_type"], _quickbooks_export_scope_id(connection["scope_id"], connection["realm_id"])),
        ).fetchall()
    finally:
        database.close()
    mapped = None
    if mapping and mapping["realm_id"] == connection["realm_id"]:
        try:
            tax_codes_by_rate = json.loads(mapping["tax_codes_json"])
            if isinstance(tax_codes_by_rate, dict):
                mapped = {"service_item_id": mapping["service_item_id"], "service_item_name": mapping["service_item_name"], "tax_codes": tax_codes_by_rate}
        except json.JSONDecodeError:
            mapped = None
    return {
        "realm_id": connection["realm_id"], "company_name": str(company.get("CompanyName") or "QuickBooks company")[:160],
        "currency": currency, "can_export": currency.upper() == "THB", "service_items": service_items,
        "tax_codes": tax_codes, "mapping": mapped,
        "exports": [{**dict(row), "requires_review": bool(row["requires_review"])} for row in exports],
    }


def _quickbooks_rate_key(rate: float) -> str:
    return f"{float(rate):.8f}".rstrip("0").rstrip(".") or "0"


def get_quickbooks_catalog(project_id: str, authorization: str) -> dict:
    _user_id, scope_type, scope_id, _project = _quickbooks_scope_for_user(project_id, authorization, manage=False, write=True)
    configuration = _quickbooks_configuration()
    connection = _quickbooks_connection(scope_type, scope_id)
    return _quickbooks_catalog_for_scope(connection, configuration)


def get_quickbooks_invoice_payments(project_id: str, authorization: str) -> dict:
    """Read applied THB payments for ConstructFlow invoices exported to this QBO realm."""
    _user_id, scope_type, scope_id, _project = _quickbooks_scope_for_user(project_id, authorization, manage=False, write=True)
    configuration = _quickbooks_configuration()
    connection = _quickbooks_connection(scope_type, scope_id)
    company_response = _quickbooks_api_request(connection, configuration, f"/companyinfo/{connection['realm_id']}")
    company = company_response.get("CompanyInfo")
    base_currency = str((company or {}).get("CurrencyRef", {}).get("value") or "").upper() if isinstance(company, dict) else ""
    if base_currency != "THB":
        raise CollaborationError(422, "QuickBooks company base currency must be THB before importing THB invoice payments")
    export_scope_id = _quickbooks_export_scope_id(scope_id, connection["realm_id"])
    database = _open_database()
    try:
        rows = database.execute(
            "SELECT source_record_id, qbo_document_id, qbo_document_number FROM quickbooks_exports "
            "WHERE scope_type=? AND scope_id=? AND document_type='invoice' AND status='succeeded' AND qbo_document_id IS NOT NULL",
            (scope_type, export_scope_id),
        ).fetchall()
    finally:
        database.close()
    invoice_by_qbo_id: dict[str, dict[str, str]] = {}
    ambiguous_qbo_invoice_ids: set[str] = set()
    for row in rows:
        qbo_id = str(row["qbo_document_id"])
        if qbo_id in invoice_by_qbo_id:
            ambiguous_qbo_invoice_ids.add(qbo_id)
        invoice_by_qbo_id[qbo_id] = {
            "source_invoice_id": str(row["source_record_id"]),
            "invoice_number": str(row["qbo_document_number"] or ""),
        }
    for qbo_id in ambiguous_qbo_invoice_ids:
        invoice_by_qbo_id.pop(qbo_id, None)

    payments: list[dict] = []
    warnings: list[dict] = []
    for payment in _quickbooks_query(connection, configuration, "Payment"):
        payment_id = str(payment.get("Id") or "")
        if not payment_id.isdigit():
            continue
        raw_lines = payment.get("Line") or []
        lines = [raw_lines] if isinstance(raw_lines, dict) else raw_lines if isinstance(raw_lines, list) else []
        allocations: dict[str, float] = {}
        ambiguous_targets: set[str] = set()
        for line in lines:
            if not isinstance(line, dict):
                continue
            raw_links = line.get("LinkedTxn") or []
            links = [raw_links] if isinstance(raw_links, dict) else raw_links if isinstance(raw_links, list) else []
            invoice_links = {
                str(link.get("TxnId")) for link in links
                if isinstance(link, dict) and link.get("TxnType") == "Invoice" and link.get("TxnId")
            }
            exported_invoice_links = invoice_links.intersection(invoice_by_qbo_id)
            if not exported_invoice_links:
                continue
            if len(invoice_links) != 1 or len(exported_invoice_links) != 1:
                ambiguous_targets.update(exported_invoice_links)
                continue
            invoice_id = next(iter(exported_invoice_links))
            raw_amount = line.get("Amount")
            if isinstance(raw_amount, bool):
                continue
            try:
                amount = float(raw_amount)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(amount) or amount <= 0:
                continue
            allocations[invoice_id] = allocations.get(invoice_id, 0.0) + amount

        for invoice_id in ambiguous_targets:
            warnings.append({"payment_id": payment_id, "invoice_number": invoice_by_qbo_id[invoice_id]["invoice_number"], "reason": "payment line links multiple exported invoices; review it in QuickBooks"})
            allocations.pop(invoice_id, None)
        if not allocations:
            continue
        currency_ref = payment.get("CurrencyRef") or {}
        currency = str(currency_ref.get("value") or "THB").upper() if isinstance(currency_ref, dict) else "THB"
        received_at = str(payment.get("TxnDate") or "")
        try:
            datetime.strptime(received_at, "%Y-%m-%d")
        except ValueError:
            warnings.append({"payment_id": payment_id, "reason": "payment date is missing or invalid; review it in QuickBooks"})
            continue
        if currency != "THB":
            warnings.append({"payment_id": payment_id, "reason": f"payment currency is {currency}, not THB; review it in QuickBooks"})
            continue
        for qbo_invoice_id, amount in allocations.items():
            source = invoice_by_qbo_id[qbo_invoice_id]
            payments.append({
                "external_reference": f"QBO:{connection['realm_id']}:Payment:{payment_id}:Invoice:{qbo_invoice_id}",
                "source_invoice_id": source["source_invoice_id"],
                "invoice_number": source["invoice_number"],
                "payment_id": payment_id,
                "payment_reference": re.sub(r"[\x00-\x1f\x7f]", " ", str(payment.get("PaymentRefNum") or ""))[:120],
                "received_at": received_at,
                "amount_thb": round(amount, 2),
                "currency": currency,
            })
    payments.sort(key=lambda item: (item["received_at"], item["payment_id"], item["source_invoice_id"]))
    return {"realm_id": connection["realm_id"], "payments": payments[-1000:], "warnings": warnings[:500]}


def save_quickbooks_mapping(project_id: str, authorization: str, payload: object) -> dict:
    user_id, scope_type, scope_id, _project = _quickbooks_scope_for_user(project_id, authorization, manage=False, write=True)
    if not isinstance(payload, dict):
        raise CollaborationError(422, "QuickBooks mapping must be an object")
    service_item_id = payload.get("service_item_id")
    tax_mappings = payload.get("tax_codes")
    if not isinstance(service_item_id, str) or not service_item_id.isdigit() or len(service_item_id) > 32:
        raise CollaborationError(422, "Select an active QuickBooks Service item")
    if not isinstance(tax_mappings, list) or len(tax_mappings) > 100:
        raise CollaborationError(422, "VAT mappings must be a list of at most 100 rates")
    configuration = _quickbooks_configuration()
    connection = _quickbooks_connection(scope_type, scope_id)
    catalog = _quickbooks_catalog_for_scope(connection, configuration)
    if catalog["currency"].upper() != "THB":
        raise CollaborationError(422, "QuickBooks company base currency must be THB before ConstructFlow can export THB estimates")
    service_item = next((item for item in catalog["service_items"] if item["id"] == service_item_id), None)
    if service_item is None:
        raise CollaborationError(422, "The selected QuickBooks Service item is not active in the connected company")
    saved_rates: dict[str, str] = {}
    seen_rates: set[str] = set()
    for entry in tax_mappings:
        if not isinstance(entry, dict):
            raise CollaborationError(422, "Each VAT mapping must include vat_rate and tax_code_id")
        vat_rate, tax_code_id = entry.get("vat_rate"), entry.get("tax_code_id")
        if isinstance(vat_rate, bool) or not isinstance(vat_rate, (int, float)) or not math.isfinite(vat_rate) or vat_rate < 0 or vat_rate > 1:
            raise CollaborationError(422, "VAT rates must be decimal values between 0 and 1")
        if not isinstance(tax_code_id, str) or not tax_code_id.isdigit() or len(tax_code_id) > 32:
            raise CollaborationError(422, "Select a tax code from the connected QuickBooks company")
        rate_key = _quickbooks_rate_key(vat_rate)
        if rate_key in seen_rates:
            raise CollaborationError(422, "A VAT rate can only be mapped once")
        seen_rates.add(rate_key)
        tax_code = next((item for item in catalog["tax_codes"] if item["id"] == tax_code_id), None)
        if tax_code is None or tax_code["rate"] is None or abs(tax_code["rate"] - float(vat_rate)) > 0.0001:
            raise CollaborationError(422, "The selected active QuickBooks tax code does not exactly match this ConstructFlow VAT rate")
        saved_rates[rate_key] = tax_code_id
    now = datetime.now(timezone.utc).isoformat()
    database = _open_database()
    try:
        database.execute(
            """INSERT INTO quickbooks_mappings(scope_type, scope_id, realm_id, service_item_id, service_item_name, tax_codes_json, updated_by, updated_at)
               VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(scope_type, scope_id) DO UPDATE SET realm_id=excluded.realm_id,
               service_item_id=excluded.service_item_id, service_item_name=excluded.service_item_name,
               tax_codes_json=excluded.tax_codes_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at""",
            (scope_type, scope_id, connection["realm_id"], service_item["id"], service_item["name"],
             json.dumps(saved_rates, sort_keys=True, separators=(",", ":")), user_id, now),
        )
        database.commit()
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not save the QuickBooks account mapping") from error
    finally:
        database.close()
    return {"saved": True, "mapping": {"service_item_id": service_item["id"], "service_item_name": service_item["name"], "tax_codes": saved_rates}}


def _qbo_number(value: object, name: str, *, minimum: float = 0, maximum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < minimum or (maximum is not None and value > maximum):
        raise CollaborationError(422, f"QuickBooks export has an invalid {name}")
    return float(value)


def _qbo_text(value: object, name: str, maximum: int, *, required: bool = False) -> str:
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()) or any(ord(char) < 32 and char not in "\t\n\r" for char in value):
        raise CollaborationError(422, f"QuickBooks export has an invalid {name}")
    return value.strip()


def _qbo_email(value: object) -> str:
    email = _qbo_text(value, "recipient email", 254, required=True).lower()
    if email.count("@") != 1 or any(char.isspace() for char in email) or email.startswith("@") or email.endswith("@"):
        raise CollaborationError(422, "QuickBooks export requires a valid recipient email address")
    return email


def _quickbooks_estimate_payload(proposal: object, service_item_id: str, tax_code_id: str) -> tuple[dict, float]:
    if not isinstance(proposal, dict):
        raise CollaborationError(422, "Estimate export requires a proposal snapshot")
    proposal_id = proposal.get("id")
    if not isinstance(proposal_id, str) or not UUID_PATTERN.fullmatch(proposal_id):
        raise CollaborationError(422, "Proposal UUID is invalid")
    status = proposal.get("status")
    if status not in {"draft", "sent", "accepted"}:
        raise CollaborationError(422, "Only draft, sent or accepted proposals can be exported as a QuickBooks Estimate")
    recipient_name = _qbo_text(proposal.get("recipient_name"), "recipient name", 160, required=True)
    recipient_email = _qbo_email(proposal.get("recipient_email"))
    title = _qbo_text(proposal.get("title"), "proposal title", 160, required=True)
    vat_rate = _qbo_number(proposal.get("vat_rate"), "proposal VAT rate", maximum=1)
    factor = _qbo_number(proposal.get("factor_f"), "Factor F", minimum=0.000001, maximum=100)
    preliminaries = _qbo_number(proposal.get("preliminaries_thb"), "preliminaries")
    direct_cost = _qbo_number(proposal.get("direct_cost_thb"), "direct cost")
    grand_total = _qbo_number(proposal.get("grand_total_thb"), "proposal total")
    source_lines = proposal.get("lines")
    if not isinstance(source_lines, list) or not source_lines or len(source_lines) > 5000:
        raise CollaborationError(422, "Proposal must contain between 1 and 5,000 takeoff lines")

    round_money = lambda amount: round(float(amount) + 1e-9, 2)
    line_cost_total = 0.0
    product_margin_total = 0.0
    original_rows: list[dict] = []
    for index, line in enumerate(source_lines, 1):
        if not isinstance(line, dict):
            raise CollaborationError(422, f"Proposal line {index} is invalid")
        line_id = line.get("id")
        if not isinstance(line_id, str) or not UUID_PATTERN.fullmatch(line_id):
            raise CollaborationError(422, f"Proposal line {index} has an invalid UUID")
        amount = _qbo_number(line.get("amount_thb"), f"proposal line {index} amount")
        quantity = _qbo_number(line.get("quantity"), f"proposal line {index} quantity", minimum=0.000001)
        unit = _qbo_text(line.get("unit"), f"proposal line {index} unit", 12, required=True)
        mark = _qbo_text(line.get("mark"), f"proposal line {index} mark", 160, required=True)
        description = _qbo_text(line.get("description"), f"proposal line {index} description", 500, required=True)
        formula = _qbo_text(line.get("formula"), f"proposal line {index} formula", 1000, required=True)
        phase = _qbo_text(line.get("phase"), f"proposal line {index} phase", 40, required=True)
        cost_center = _qbo_text(line.get("cost_center"), f"proposal line {index} cost center", 60, required=True)
        source_object_ids = line.get("source_object_ids", [])
        source_object_count = line.get("source_object_ids_count", len(source_object_ids) if isinstance(source_object_ids, list) else 0)
        if (
            not isinstance(source_object_ids, list) or len(source_object_ids) > 12
            or any(not isinstance(object_id, str) or not UUID_PATTERN.fullmatch(object_id) for object_id in source_object_ids)
            or isinstance(source_object_count, bool) or not isinstance(source_object_count, int) or source_object_count < len(source_object_ids) or source_object_count > 10000
        ):
            raise CollaborationError(422, f"Proposal line {index} source object UUIDs are invalid")
        product_margin = _qbo_number(line.get("product_margin_amount_thb", 0), f"proposal line {index} product margin")
        line_cost_total += amount
        product_margin_total += product_margin
        source_label = f" · source UUIDs {', '.join(source_object_ids)}" if source_object_ids else ""
        if source_object_count > len(source_object_ids):
            source_label += f" … +{source_object_count - len(source_object_ids)} more"
        original_rows.append({
            "description": f"{mark} · {description} · {quantity:g} {unit} · {formula} · {phase}/{cost_center} · line {line_id}{source_label}"[:4000],
            "amount": amount * factor / (1 + vat_rate) + product_margin,
        })
    if abs(line_cost_total - direct_cost) > 0.03:
        raise CollaborationError(422, "Proposal direct cost does not reconcile with its frozen takeoff lines")

    computed_factor_subtotal = round_money((direct_cost + preliminaries) * factor / (1 + vat_rate))
    computed_subtotal = round_money(computed_factor_subtotal + product_margin_total)
    has_breakdown = any(proposal.get(key) is not None for key in (
        "gross_margin_percent", "factor_f_subtotal_thb", "product_margin_amount_thb", "gross_margin_amount_thb",
        "subtotal_before_discount_thb", "discount_percent", "discount_amount_thb", "taxable_amount_thb", "vat_amount_thb",
    ))
    if has_breakdown:
        factor_subtotal = _qbo_number(proposal.get("factor_f_subtotal_thb"), "frozen Factor F subtotal")
        gross_margin = _qbo_number(proposal.get("gross_margin_amount_thb"), "frozen gross margin")
        subtotal = _qbo_number(proposal.get("subtotal_before_discount_thb"), "frozen subtotal")
        discount_amount = _qbo_number(proposal.get("discount_amount_thb"), "frozen discount")
        taxable = _qbo_number(proposal.get("taxable_amount_thb"), "frozen taxable amount")
        vat_amount = _qbo_number(proposal.get("vat_amount_thb"), "frozen VAT amount")
        product_snapshot = _qbo_number(proposal.get("product_margin_amount_thb", product_margin_total), "frozen product margin")
        discount_percent = _qbo_number(proposal.get("discount_percent"), "frozen discount percentage", maximum=100)
        _qbo_number(proposal.get("gross_margin_percent"), "frozen gross margin percentage", maximum=99.999999)
        if abs(factor_subtotal - computed_factor_subtotal) > 0.03 or abs(product_snapshot - product_margin_total) > 0.03:
            raise CollaborationError(422, "Proposal pricing breakdown does not match the frozen takeoff amounts")
        if abs(subtotal - factor_subtotal - product_snapshot - gross_margin) > 0.03:
            raise CollaborationError(422, "Proposal gross margin and subtotal do not reconcile")
        if abs(discount_amount - subtotal * discount_percent / 100) > 0.03 or abs(taxable - subtotal + discount_amount) > 0.03:
            raise CollaborationError(422, "Proposal discount and taxable amount do not reconcile")
        if abs(vat_amount - (grand_total - taxable)) > 0.03 or abs(grand_total - taxable * (1 + vat_rate)) > 0.03:
            raise CollaborationError(422, "Proposal VAT and grand total do not reconcile")
    else:
        factor_subtotal = computed_factor_subtotal
        gross_margin = 0.0
        subtotal = computed_subtotal
        taxable = subtotal
        discount_amount = 0.0
        vat_amount = round_money(taxable * vat_rate)
        if abs(grand_total - (taxable + vat_amount)) > 0.03:
            raise CollaborationError(422, "Legacy proposal total does not reconcile with its VAT rate")

    preliminaries_base = preliminaries * factor / (1 + vat_rate)
    if preliminaries_base > 0:
        original_rows.append({"description": "Project preliminaries · site preparation and setup", "amount": preliminaries_base})
    if gross_margin > 0:
        original_rows.append({"description": "Commercial gross margin · frozen proposal pricing", "amount": gross_margin})
    if taxable <= 0 or subtotal <= 0:
        raise CollaborationError(422, "A QuickBooks Estimate must have a positive taxable amount")
    if abs(sum(row["amount"] for row in original_rows) - subtotal) > 0.03:
        raise CollaborationError(422, "Proposal line amounts do not reconcile with the frozen commercial subtotal")
    if abs(discount_amount) > 0.001:
        ratio = taxable / subtotal
        discounted = [round_money(row["amount"] * ratio) for row in original_rows]
        non_final_total = sum(discounted[:-1])
        discounted[-1] = round_money(taxable - non_final_total)
        for row, amount in zip(original_rows, discounted):
            row["amount"] = amount
    else:
        cents_delta = round_money(taxable - sum(row["amount"] for row in original_rows))
        original_rows[-1]["amount"] = round_money(original_rows[-1]["amount"] + cents_delta)

    lines = []
    for row in original_rows:
        amount = round_money(row["amount"])
        if amount < 0:
            raise CollaborationError(422, "Proposal discount allocation produced a negative QuickBooks line")
        lines.append({
            "Amount": amount, "DetailType": "SalesItemLineDetail", "Description": row["description"],
            "SalesItemLineDetail": {
                "ItemRef": {"value": service_item_id}, "Qty": 1, "UnitPrice": amount,
                "TaxCodeRef": {"value": tax_code_id},
            },
        })
    lines = [line for line in lines if line["Amount"] > 0]
    if not lines or len(lines) > 750:
        raise CollaborationError(422, "QuickBooks Estimates require 1–750 positive-value detail lines")
    private_note = f"ConstructFlow proposal {proposal_id} · {title}"
    for note in (proposal.get("notes", ""), proposal.get("terms", "")):
        if isinstance(note, str) and note.strip():
            private_note += "\n" + note.strip()
    qbo_payload = {
        "CustomerRef": {"value": ""}, "Line": lines, "GlobalTaxCalculation": "TaxExcluded",
        "PrivateNote": private_note[:4000],
    }
    if proposal.get("valid_until"):
        qbo_payload["ExpirationDate"] = _qbo_text(proposal["valid_until"], "proposal validity date", 10)
    return {
        "record_id": proposal_id, "recipient_name": recipient_name, "recipient_email": recipient_email,
        "title": title, "qbo_payload": qbo_payload, "taxable": round_money(taxable), "grand_total": round_money(grand_total),
    }, round_money(grand_total)


def _quickbooks_exported_estimate_id(scope_type: str, scope_id: str, proposal_id: str) -> str | None:
    database = _open_database()
    try:
        row = database.execute(
            "SELECT qbo_document_id FROM quickbooks_exports WHERE scope_type=? AND scope_id=? AND document_type='estimate' AND source_record_id=? AND status='succeeded'",
            (scope_type, scope_id, proposal_id),
        ).fetchone()
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not read the linked QuickBooks Estimate") from error
    finally:
        database.close()
    if row is None or not row["qbo_document_id"]:
        return None
    estimate_id = str(row["qbo_document_id"])
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", estimate_id):
        raise CollaborationError(409, "The linked QuickBooks Estimate ID is invalid; review the export record before continuing")
    return estimate_id


def _quickbooks_invoice_payload(invoice: object, proposal: object, service_item_id: str, tax_code_id: str, linked_estimate_id: str | None = None) -> tuple[dict, float]:
    if not isinstance(invoice, dict) or not isinstance(proposal, dict):
        raise CollaborationError(422, "Invoice export requires its invoice and linked proposal snapshots")
    invoice_id = invoice.get("id")
    if not isinstance(invoice_id, str) or not UUID_PATTERN.fullmatch(invoice_id):
        raise CollaborationError(422, "Invoice UUID is invalid")
    if invoice.get("proposal_id") != proposal.get("id") or proposal.get("status") != "accepted":
        raise CollaborationError(422, "QuickBooks invoices must reference the matching accepted proposal")
    if invoice.get("status") != "issued" or not isinstance(invoice.get("payments"), list) or invoice["payments"]:
        raise CollaborationError(422, "Only an issued, unpaid ConstructFlow invoice can be exported; an invoice with recorded payments cannot be exported to QuickBooks")
    proposal_email = _qbo_email(proposal.get("recipient_email"))
    invoice_title = _qbo_text(invoice.get("title"), "invoice title", 160, required=True)
    invoice_number = _qbo_text(invoice.get("number"), "invoice number", 60, required=True)
    recipient_name = _qbo_text(invoice.get("recipient_name"), "invoice recipient name", 160, required=True)
    recipient_email = _qbo_email(proposal.get("recipient_email"))
    if recipient_email != proposal_email:
        raise CollaborationError(422, "Invoice recipient does not match the accepted proposal")
    vat_rate = _qbo_number(invoice.get("vat_rate"), "invoice VAT rate", maximum=1)
    billing_percent = _qbo_number(invoice.get("billing_percent"), "invoice billing percentage", minimum=0.000001, maximum=100)
    contract_total = _qbo_number(invoice.get("contract_total_thb"), "contract total")
    taxable = _qbo_number(invoice.get("taxable_amount_thb"), "invoice taxable amount")
    vat_amount = _qbo_number(invoice.get("vat_amount_thb"), "invoice VAT amount")
    amount_due = _qbo_number(invoice.get("amount_due_thb"), "invoice total")
    if abs(contract_total * billing_percent / 100 - amount_due) > 0.03 or abs(taxable + vat_amount - amount_due) > 0.03 or abs(taxable * vat_rate - vat_amount) > 0.03:
        raise CollaborationError(422, "Invoice billing percentage and VAT amounts do not reconcile")
    if abs(vat_rate - _qbo_number(proposal.get("vat_rate"), "proposal VAT rate", maximum=1)) > 0.0001:
        raise CollaborationError(422, "Invoice VAT rate does not match its accepted proposal")
    if amount_due <= 0 or taxable <= 0:
        raise CollaborationError(422, "A QuickBooks Invoice must have a positive taxable amount")
    description = f"ConstructFlow milestone {billing_percent:g}% · {invoice_number} · {invoice_title} · source {invoice_id} · contract {proposal.get('id')}"
    line = {
        "Amount": round(taxable, 2), "DetailType": "SalesItemLineDetail", "Description": description[:4000],
        "SalesItemLineDetail": {
            "ItemRef": {"value": service_item_id}, "Qty": 1, "UnitPrice": round(taxable, 2),
            "TaxCodeRef": {"value": tax_code_id},
        },
    }
    qbo_payload = {
        "CustomerRef": {"value": ""}, "DocNumber": invoice_number, "Line": [line],
        "GlobalTaxCalculation": "TaxExcluded",
        "PrivateNote": f"ConstructFlow invoice {invoice_id} · linked proposal {proposal.get('id')} · {invoice_title}"[:4000],
    }
    if linked_estimate_id:
        qbo_payload["LinkedTxn"] = [{"TxnId": linked_estimate_id, "TxnType": "Estimate"}]
    if invoice.get("due_date"):
        qbo_payload["DueDate"] = _qbo_text(invoice["due_date"], "invoice due date", 10)
    return {
        "record_id": invoice_id, "recipient_name": recipient_name, "recipient_email": recipient_email,
        "title": invoice_title, "invoice_number": invoice_number, "qbo_payload": qbo_payload,
        "linked_estimate_id": linked_estimate_id,
        "taxable": round(taxable, 2), "grand_total": round(amount_due, 2),
    }, round(amount_due, 2)


def _quickbooks_exact_customer(connection: sqlite3.Row, configuration: dict, email: str) -> dict | None:
    matches = []
    for customer in _quickbooks_query(connection, configuration, "Customer"):
        primary = customer.get("PrimaryEmailAddr") or {}
        address = primary.get("Address") if isinstance(primary, dict) else None
        if customer.get("Active") is not False and isinstance(address, str) and address.strip().lower() == email:
            matches.append(customer)
            if len(matches) > 1:
                raise CollaborationError(409, "More than one QuickBooks Customer has this exact email; choose or merge the customer in QuickBooks first")
    return matches[0] if matches else None


def _quickbooks_resolve_customer(connection: sqlite3.Row, configuration: dict, email: str, display_name: str, request_id: str) -> dict:
    existing = _quickbooks_exact_customer(connection, configuration, email)
    if existing:
        return existing
    customer_payload = {"DisplayName": display_name[:100], "PrimaryEmailAddr": {"Address": email}}
    customer_request_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"constructflow:qbo:customer:{request_id}"))
    try:
        response = _quickbooks_api_request(connection, configuration, "/customer", method="POST", payload=customer_payload, request_id=customer_request_id)
    except CollaborationError as error:
        if error.status == 502:
            existing = _quickbooks_exact_customer(connection, configuration, email)
            if existing:
                return existing
        raise
    customer = response.get("Customer")
    if not isinstance(customer, dict) or not customer.get("Id"):
        existing = _quickbooks_exact_customer(connection, configuration, email)
        if existing:
            return existing
        raise CollaborationError(502, "QuickBooks did not confirm the Customer created for this export")
    return customer


def _begin_quickbooks_export(scope_type: str, scope_id: str, document_type: str, record_id: str, payload_hash: str, user_id: str) -> tuple[str, dict | None]:
    now = datetime.now(timezone.utc).isoformat()
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        previous = database.execute(
            "SELECT * FROM quickbooks_exports WHERE scope_type=? AND scope_id=? AND document_type=? AND source_record_id=?",
            (scope_type, scope_id, document_type, record_id),
        ).fetchone()
        if previous and previous["status"] == "succeeded":
            if previous["payload_hash"] != payload_hash:
                database.rollback()
                raise CollaborationError(409, "This ConstructFlow record was already exported with different content; create a new source revision to export changes")
            database.commit()
            return "", dict(previous)
        if previous and previous["status"] in {"pending", "uncertain"}:
            if previous["payload_hash"] != payload_hash:
                database.rollback()
                raise CollaborationError(409, "A previous QuickBooks export has an uncertain outcome; resolve it in QuickBooks before changing and re-exporting this record")
            request_id = previous["request_id"]
            database.execute(
                "UPDATE quickbooks_exports SET status='pending', message=?, updated_at=? WHERE scope_type=? AND scope_id=? AND document_type=? AND source_record_id=?",
                ("Retrying the same idempotent QuickBooks request", now, scope_type, scope_id, document_type, record_id),
            )
            database.commit()
            return request_id, dict(previous)
        else:
            request_id = str(uuid.uuid4())
            database.execute(
                """INSERT INTO quickbooks_exports(scope_type, scope_id, document_type, source_record_id, payload_hash, request_id, status,
                   customer_id, qbo_document_id, qbo_document_number, response_status, message, created_by, created_at, updated_at)
                   VALUES(?,?,?,?,?,?,'pending',NULL,NULL,NULL,NULL,?,?,?,?)
                   ON CONFLICT(scope_type, scope_id, document_type, source_record_id) DO UPDATE SET payload_hash=excluded.payload_hash,
                   request_id=excluded.request_id, status='pending', customer_id=NULL, qbo_document_id=NULL, qbo_document_number=NULL,
                   response_status=NULL, message=excluded.message, created_by=excluded.created_by, created_at=excluded.created_at, updated_at=excluded.updated_at""",
                (scope_type, scope_id, document_type, record_id, payload_hash, request_id,
                 "QuickBooks export queued", user_id, now, now),
            )
        database.commit()
        return request_id, None
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not record the QuickBooks export request") from error
    finally:
        database.close()


def _set_quickbooks_export_customer(scope_type: str, scope_id: str, document_type: str, record_id: str, customer_id: str) -> None:
    database = _open_database()
    try:
        database.execute(
            "UPDATE quickbooks_exports SET customer_id=?, updated_at=? WHERE scope_type=? AND scope_id=? AND document_type=? AND source_record_id=? AND status='pending'",
            (customer_id, datetime.now(timezone.utc).isoformat(), scope_type, scope_id, document_type, record_id),
        )
        database.commit()
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not record the QuickBooks Customer reference") from error
    finally:
        database.close()


def _finish_quickbooks_export(scope_type: str, scope_id: str, document_type: str, record_id: str, *, status: str, message: str, response_status: int | None = None, document_id: str | None = None, document_number: str | None = None, requires_review: bool = False) -> None:
    database = _open_database()
    try:
        database.execute(
            "UPDATE quickbooks_exports SET status=?, message=?, response_status=?, qbo_document_id=?, qbo_document_number=?, requires_review=?, updated_at=? WHERE scope_type=? AND scope_id=? AND document_type=? AND source_record_id=?",
            (status, message[:1000], response_status, document_id, document_number, int(requires_review), datetime.now(timezone.utc).isoformat(), scope_type, scope_id, document_type, record_id),
        )
        database.commit()
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "QuickBooks responded but the gateway could not record the export acknowledgement") from error
    finally:
        database.close()


def export_quickbooks_document(project_id: str, authorization: str, payload: object) -> dict:
    user_id, scope_type, scope_id, _project = _quickbooks_scope_for_user(project_id, authorization, manage=False, write=True)
    if not isinstance(payload, dict) or payload.get("project_uuid") != project_id:
        raise CollaborationError(422, "QuickBooks export project UUID does not match the authenticated project")
    document_type = payload.get("document_type")
    if document_type not in {"estimate", "invoice"}:
        raise CollaborationError(422, "QuickBooks document type must be estimate or invoice")
    configuration = _quickbooks_configuration()
    connection = _quickbooks_connection(scope_type, scope_id)
    catalog = _quickbooks_catalog_for_scope(connection, configuration)
    if catalog["currency"].upper() != "THB":
        raise CollaborationError(422, "QuickBooks company base currency must be THB before exporting ConstructFlow amounts")
    mapping = catalog.get("mapping")
    if not mapping:
        raise CollaborationError(409, "Map an active QuickBooks Service item and matching tax code for this VAT rate first")
    if not any(item["id"] == mapping["service_item_id"] for item in catalog["service_items"]):
        raise CollaborationError(409, "The mapped QuickBooks Service item is no longer active; update the account mapping")
    record = payload.get("record")
    link_to_estimate = payload.get("link_to_estimate", False)
    if not isinstance(link_to_estimate, bool) or (document_type != "invoice" and link_to_estimate):
        raise CollaborationError(422, "QuickBooks Estimate linking is available only as an explicit Invoice option")
    export_scope_id = _quickbooks_export_scope_id(scope_id, connection["realm_id"])
    linked_estimate_id = None
    if document_type == "invoice" and link_to_estimate:
        linked_proposal = payload.get("proposal")
        proposal_id = linked_proposal.get("id") if isinstance(linked_proposal, dict) else None
        if not isinstance(proposal_id, str) or not UUID_PATTERN.fullmatch(proposal_id):
            raise CollaborationError(422, "Invoice Estimate linking requires its accepted proposal UUID")
        linked_estimate_id = _quickbooks_exported_estimate_id(scope_type, export_scope_id, proposal_id)
        if linked_estimate_id is None:
            raise CollaborationError(409, "Export the matching proposal as a QuickBooks Estimate before linking this Invoice")
    prepared, expected_total = (
        _quickbooks_estimate_payload(record, mapping["service_item_id"], "")
        if document_type == "estimate"
        else _quickbooks_invoice_payload(record, payload.get("proposal"), mapping["service_item_id"], "", linked_estimate_id)
    )
    vat_rate = _qbo_number(record.get("vat_rate"), "document VAT rate", maximum=1)
    tax_code_id = mapping["tax_codes"].get(_quickbooks_rate_key(vat_rate))
    actual_tax_code = next((item for item in catalog["tax_codes"] if tax_code_id and item["id"] == tax_code_id), None)
    if not actual_tax_code or actual_tax_code["rate"] is None or abs(actual_tax_code["rate"] - vat_rate) > 0.0001:
        raise CollaborationError(409, "The saved QuickBooks tax mapping is missing, inactive or no longer matches the document VAT rate")
    # Apply the server-validated tax code only after validating the document and current company catalog.
    for line in prepared["qbo_payload"]["Line"]:
        line["SalesItemLineDetail"]["TaxCodeRef"]["value"] = tax_code_id
    record_id = prepared["record_id"]
    intent = {
        "document_type": document_type, "record_id": record_id, "realm_id": connection["realm_id"],
        "recipient_email": prepared["recipient_email"], "recipient_name": prepared["recipient_name"],
        "expected_total": expected_total, "qbo_payload": prepared["qbo_payload"],
        "service_item_id": mapping["service_item_id"], "tax_code_id": tax_code_id,
    }
    intent_hash = hashlib.sha256(json.dumps(intent, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()
    request_id, existing = _begin_quickbooks_export(scope_type, export_scope_id, document_type, record_id, intent_hash, user_id)
    if existing is not None and existing["status"] == "succeeded":
        return {
            "status": existing["status"], "document_type": document_type, "source_record_id": record_id,
            "qbo_document_id": existing["qbo_document_id"], "qbo_document_number": existing["qbo_document_number"],
            "message": existing["message"], "requires_review": bool(existing["requires_review"]), "already_exported": True,
        }

    try:
        customer_id = existing.get("customer_id") if existing else None
        if customer_id:
            customer = {"Id": customer_id}
        else:
            customer = _quickbooks_resolve_customer(connection, configuration, prepared["recipient_email"], prepared["recipient_name"], request_id)
            customer_id = str(customer["Id"])
            _set_quickbooks_export_customer(scope_type, export_scope_id, document_type, record_id, customer_id)
        qbo_payload = dict(prepared["qbo_payload"])
        qbo_payload["CustomerRef"] = {"value": customer_id}
        endpoint = "/estimate" if document_type == "estimate" else "/invoice"
        response = _quickbooks_api_request(connection, configuration, endpoint, method="POST", payload=qbo_payload, request_id=request_id)
        entity_name = "Estimate" if document_type == "estimate" else "Invoice"
        entity = response.get(entity_name)
        if not isinstance(entity, dict) or not entity.get("Id"):
            raise CollaborationError(502, f"QuickBooks did not confirm the created {entity_name}; check the company before retrying")
        returned_total = entity.get("TotalAmt")
        requires_review = not isinstance(returned_total, (int, float)) or abs(float(returned_total) - expected_total) > 0.03
        linked_message = f" linked to Estimate {linked_estimate_id}; QBO API does not apply progress-invoice allocation" if linked_estimate_id else ""
        message = (f"Created in QuickBooks; returned total {float(returned_total):.2f} THB differs from ConstructFlow {expected_total:.2f} THB. Review the document before sending." if requires_review else f"Created in QuickBooks with total {expected_total:.2f} THB") + linked_message
        _finish_quickbooks_export(
            scope_type, export_scope_id, document_type, record_id, status="succeeded", message=message,
            response_status=200, document_id=str(entity["Id"]), document_number=str(entity.get("DocNumber") or "") or None,
            requires_review=requires_review,
        )
        return {
            "status": "succeeded", "document_type": document_type, "source_record_id": record_id,
            "qbo_document_id": str(entity["Id"]), "qbo_document_number": entity.get("DocNumber"),
            "total": returned_total, "currency": "THB", "requires_review": requires_review, "message": message,
            **({"linked_estimate_id": linked_estimate_id} if linked_estimate_id else {}),
        }
    except CollaborationError as error:
        status = "failed" if error.status in {409, 422, 429} else "uncertain"
        try:
            _finish_quickbooks_export(scope_type, export_scope_id, document_type, record_id, status=status, message=str(error), response_status=error.status)
        except CollaborationError:
            pass
        raise


def _validate_custom_webhook_url(value: object) -> tuple[str, str, str]:
    if not isinstance(value, str) or not value or len(value) > 2048:
        raise CollaborationError(422, "Webhook URL is invalid")
    try:
        parsed = urllib.parse.urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise CollaborationError(422, "Webhook URL is invalid") from error
    host = (parsed.hostname or "").rstrip(".").lower()
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError as error:
        raise CollaborationError(422, "Webhook host is invalid") from error
    allowed_hosts = _configured_webhook_hosts()
    if (
        parsed.scheme.lower() != "https"
        or not host
        or host not in allowed_hosts
        or port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or any(ord(char) < 32 for char in value)
    ):
        raise CollaborationError(422, "Webhook URL must use HTTPS on a host allowed by the project gateway")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise CollaborationError(422, "Webhook URL must use a configured public DNS host")
    path = parsed.path or "/"
    request_target = urllib.parse.urlunsplit(("", "", path, parsed.query, ""))
    normalized = urllib.parse.urlunsplit(("https", host, path, parsed.query, ""))
    return normalized, host, request_target


def _resolve_public_webhook_addresses(host: str) -> list[str]:
    try:
        answers = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except (OSError, socket.gaierror) as error:
        raise CollaborationError(502, "Webhook destination DNS lookup failed") from error
    addresses: list[str] = []
    for answer in answers:
        raw_address = answer[4][0].split("%", 1)[0]
        try:
            address = ipaddress.ip_address(raw_address)
        except ValueError:
            raise CollaborationError(502, "Webhook destination DNS returned an invalid address")
        if not address.is_global:
            raise CollaborationError(422, "Webhook destination resolves to a non-public address")
        normalized = str(address)
        if normalized not in addresses:
            addresses.append(normalized)
    if not addresses:
        raise CollaborationError(502, "Webhook destination has no public address")
    return addresses


class _PinnedWebhookHTTPSConnection(http.client.HTTPSConnection):
    """Connect to the already-validated address while retaining TLS host verification."""

    def __init__(self, host: str, address: str):
        super().__init__(host, 443, timeout=12, context=ssl.create_default_context())
        self._resolved_public_address = address

    def connect(self) -> None:
        raw_socket = socket.create_connection((self._resolved_public_address, self.port), self.timeout, self.source_address)
        self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)


def _validate_webhook_json(value: object, *, depth: int = 0, nodes: list[int] | None = None) -> None:
    if nodes is None:
        nodes = [0]
    nodes[0] += 1
    if depth > 16 or nodes[0] > 10_000:
        raise CollaborationError(422, "Webhook payload is too deeply nested or contains too many values")
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 200:
                raise CollaborationError(422, "Webhook payload has an invalid object key")
            _validate_webhook_json(item, depth=depth + 1, nodes=nodes)
    elif isinstance(value, list):
        for item in value:
            _validate_webhook_json(item, depth=depth + 1, nodes=nodes)
    elif isinstance(value, str):
        if len(value) > 100_000:
            raise CollaborationError(422, "Webhook payload contains an oversized text value")
    elif value is not None and not isinstance(value, (bool, int, float)):
        raise CollaborationError(422, "Webhook payload contains an unsupported value")
    elif isinstance(value, float) and not math.isfinite(value):
        raise CollaborationError(422, "Webhook payload numbers must be finite")


def deliver_custom_webhook(project_id: str, authorization: str, value: object) -> dict:
    user_id, project_id = _authorize(project_id, authorization, write=True)
    if not isinstance(value, dict):
        raise CollaborationError(422, "Webhook request must be an object")
    target_url, target_host, request_target = _validate_custom_webhook_url(value.get("target_url"))
    event_id = value.get("event_id")
    if not isinstance(event_id, str) or not UUID_PATTERN.fullmatch(event_id):
        raise CollaborationError(422, "Webhook event_id must be a UUID")
    event_id = str(uuid.UUID(event_id))
    event_type = value.get("event_type")
    if not isinstance(event_type, str) or not re.fullmatch(r"constructflow\.[a-z][a-z0-9_.-]{1,78}", event_type):
        raise CollaborationError(422, "Webhook event_type is invalid")
    secret = value.get("signing_secret")
    if not isinstance(secret, str) or len(secret) < 32 or len(secret) > 512:
        raise CollaborationError(422, "Webhook signing secret must contain 32–512 characters")
    payload = value.get("payload")
    if not isinstance(payload, dict) or payload.get("event_id") != event_id or payload.get("event_type") != event_type:
        raise CollaborationError(422, "Webhook payload must match its event ID and type")
    project_snapshot = payload.get("project")
    snapshot_project_id = project_snapshot.get("project_uuid") if isinstance(project_snapshot, dict) else None
    if not isinstance(snapshot_project_id, str) or not UUID_PATTERN.fullmatch(snapshot_project_id) or str(uuid.UUID(snapshot_project_id)) != project_id:
        raise CollaborationError(422, "Webhook snapshot must match the authenticated project UUID")
    _validate_webhook_json(payload)
    try:
        body = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError) as error:
        raise CollaborationError(422, "Webhook payload is not valid JSON") from error
    if not body or len(body) > MAX_CUSTOM_WEBHOOK_BYTES:
        raise CollaborationError(413, "Webhook payload exceeds 1 MB")

    addresses = _resolve_public_webhook_addresses(target_host)
    payload_hash = hashlib.sha256(body).hexdigest()
    target_key = hashlib.sha256(target_url.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        prior = database.execute(
            "SELECT payload_hash, target_host, status, attempt_count, response_status FROM integration_deliveries WHERE project_id=? AND event_id=?",
            (project_id, event_id),
        ).fetchone()
        if prior:
            if prior["payload_hash"] != payload_hash or prior["target_host"] != target_key:
                raise CollaborationError(409, "Webhook event_id was already used with different content or destination")
            if prior["status"] == "succeeded":
                database.commit()
                return {"event_id": event_id, "status": "already_succeeded", "response_status": prior["response_status"], "attempt": prior["attempt_count"]}
            if prior["status"] in {"pending", "uncertain"}:
                raise CollaborationError(409, "Webhook delivery outcome is uncertain or still pending; this event was not resent")
            if prior["attempt_count"] >= 10:
                raise CollaborationError(429, "Webhook event reached its retry limit")
            attempt = prior["attempt_count"] + 1
            database.execute(
                "UPDATE integration_deliveries SET status='pending', attempt_count=?, response_status=NULL, updated_at=? WHERE project_id=? AND event_id=?",
                (attempt, now, project_id, event_id),
            )
        else:
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            recent_count = database.execute(
                "SELECT COUNT(*) AS count FROM integration_deliveries WHERE project_id=? AND created_at>=?",
                (project_id, cutoff),
            ).fetchone()["count"]
            if recent_count >= MAX_CUSTOM_WEBHOOK_EVENTS_PER_HOUR:
                raise CollaborationError(429, "Project webhook delivery limit reached; try again later")
            attempt = 1
            database.execute(
                "INSERT INTO integration_deliveries(project_id, event_id, payload_hash, target_host, status, attempt_count, response_status, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (project_id, event_id, payload_hash, target_key, "pending", attempt, None, now, now),
            )
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not record webhook delivery") from error
    finally:
        database.close()

    signature = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
        "User-Agent": "ConstructFlow-Webhook/1.0",
        "X-ConstructFlow-Event-ID": event_id,
        "X-ConstructFlow-Event-Type": event_type,
        "X-ConstructFlow-Signature": f"sha256={signature}",
    }
    response_status: int | None = None
    connection = _PinnedWebhookHTTPSConnection(target_host, addresses[0])
    try:
        connection.request("POST", request_target, body=body, headers=headers)
        response = connection.getresponse()
        response_status = int(response.status)
        response.read(16_384)
    except (OSError, TimeoutError, ssl.SSLError, http.client.HTTPException) as error:
        _finish_zapier_delivery(project_id, event_id, "uncertain", None)
        raise CollaborationError(502, "Webhook delivery outcome is uncertain; the same event will not be resent. Check the receiving system before creating a new event.") from error
    finally:
        connection.close()

    succeeded = 200 <= response_status < 300
    uncertain = response_status >= 500 or 300 <= response_status < 400
    _finish_zapier_delivery(project_id, event_id, "succeeded" if succeeded else "uncertain" if uncertain else "failed", response_status)
    if not succeeded:
        if uncertain:
            raise CollaborationError(502, f"Webhook receiver returned HTTP {response_status}; delivery outcome is uncertain and this event will not be resent")
        raise CollaborationError(502, f"Webhook receiver returned HTTP {response_status}; this event can be retried with the same event_id")
    return {"event_id": event_id, "status": "succeeded", "response_status": response_status, "attempt": attempt, "delivered_by": user_id}


def _authorize_write_project(project_id: str, authorization: str) -> tuple[str, str]:
    user_id, _role = _authorize(project_id, authorization, write=True)
    return user_id, str(uuid.UUID(project_id))


def validate_project_write_access(project_id: str, authorization: str) -> None:
    _authorize_write_project(project_id, authorization)


def create_project_drawing_download_link(
    project_id: str,
    authorization: str,
    display_name: object,
    ttl_days: object,
    payload: object,
) -> dict:
    user_id, project_id = _authorize_write_project(project_id, authorization)
    if not isinstance(display_name, str) or not display_name.strip() or len(display_name) > 120 or any(ord(char) < 32 for char in display_name) or any(char in display_name for char in ("/", "\\")):
        raise CollaborationError(422, "Drawing download name is invalid")
    if isinstance(ttl_days, bool) or not isinstance(ttl_days, int) or not 1 <= ttl_days <= MAX_DRAWING_DOWNLOAD_TTL_DAYS:
        raise CollaborationError(422, f"Download link lifetime must be 1–{MAX_DRAWING_DOWNLOAD_TTL_DAYS} days")
    if not isinstance(payload, bytes) or not payload or len(payload) > MAX_DRAWING_DOWNLOAD_BYTES:
        raise CollaborationError(413, "Vector drawing PDF must contain 1 byte to 50 MB")
    if not payload.startswith(b"%PDF-"):
        raise CollaborationError(422, "Shared drawing must be a valid PDF file")

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
    link_id = str(uuid.uuid4())
    filename = f"{display_name.strip()}.pdf"
    sha256 = hashlib.sha256(payload).hexdigest()
    now = datetime.now(timezone.utc)
    created_at = now.isoformat()
    expires_at = (now + timedelta(days=ttl_days)).isoformat()
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        database.execute(
            "UPDATE drawing_download_links SET status='expired', payload=NULL WHERE project_id=? AND status='active' AND expires_at<=?",
            (project_id, created_at),
        )
        rows = database.execute(
            "SELECT byte_length FROM drawing_download_links WHERE project_id=? AND status='active'",
            (project_id,),
        ).fetchall()
        if len(rows) >= MAX_DRAWING_DOWNLOAD_LINKS_PER_PROJECT:
            raise CollaborationError(409, "Project has reached its active drawing-link limit; revoke an old link first")
        if sum(row["byte_length"] for row in rows) + len(payload) > MAX_PROJECT_DRAWING_DOWNLOAD_BYTES:
            raise CollaborationError(413, "Active drawing links for this project would exceed the 200 MB storage limit")
        database.execute(
            "INSERT INTO drawing_download_links(id, project_id, token_hash, display_name, filename, content_type, sha256, byte_length, payload, status, download_count, created_by, created_at, expires_at) VALUES(?,?,?,?,?,'application/pdf',?,?,?,'active',0,?,?,?)",
            (link_id, project_id, token_hash, display_name.strip(), filename, sha256, len(payload), sqlite3.Binary(payload), user_id, created_at, expires_at),
        )
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not save the drawing download link") from error
    finally:
        database.close()
    return {
        "id": link_id,
        "token": token,
        "display_name": display_name.strip(),
        "filename": filename,
        "sha256": sha256,
        "byte_length": len(payload),
        "status": "active",
        "created_at": created_at,
        "expires_at": expires_at,
    }


def list_project_drawing_download_links(project_id: str, authorization: str) -> dict:
    _user_id, project_id = _authorize(project_id, authorization, write=False)
    project_id = str(uuid.UUID(project_id))
    now = datetime.now(timezone.utc).isoformat()
    database = _open_database()
    try:
        database.execute(
            "UPDATE drawing_download_links SET status='expired', payload=NULL WHERE project_id=? AND status='active' AND expires_at<=?",
            (project_id, now),
        )
        rows = database.execute(
            "SELECT id, display_name, filename, sha256, byte_length, status, download_count, created_by, created_at, expires_at, last_downloaded_at FROM drawing_download_links WHERE project_id=? ORDER BY created_at DESC LIMIT 50",
            (project_id,),
        ).fetchall()
        database.commit()
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not read project drawing links") from error
    finally:
        database.close()
    return {"project_id": project_id, "links": [dict(row) for row in rows]}


def revoke_project_drawing_download_link(project_id: str, link_id: str, authorization: str) -> dict:
    _user_id, project_id = _authorize_write_project(project_id, authorization)
    if not isinstance(link_id, str) or not UUID_PATTERN.fullmatch(link_id):
        raise CollaborationError(400, "Drawing download link ID must be a UUID")
    link_id = str(uuid.UUID(link_id))
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        cursor = database.execute(
            "UPDATE drawing_download_links SET status='revoked', payload=NULL WHERE id=? AND project_id=? AND status='active'",
            (link_id, project_id),
        )
        database.commit()
        if cursor.rowcount != 1:
            raise CollaborationError(409, "Drawing download link is no longer active")
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not revoke the drawing download link") from error
    finally:
        database.close()
    return {"id": link_id, "status": "revoked"}


def get_public_drawing_download(authorization: str, *, include_payload: bool = True) -> tuple[bytes, dict]:
    if not authorization.startswith("Bearer "):
        raise CollaborationError(401, "Drawing download token is required")
    token = authorization[7:]
    if not re.fullmatch(r"[A-Za-z0-9_-]{40,60}", token):
        raise CollaborationError(401, "Drawing download token is invalid")
    token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
    now = datetime.now(timezone.utc)
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        columns = "*" if include_payload else "id, status, expires_at, filename, sha256, display_name, byte_length"
        row = database.execute(f"SELECT {columns} FROM drawing_download_links WHERE token_hash=?", (token_hash,)).fetchone()
        if row is None:
            raise CollaborationError(404, "Drawing download link was not found")
        if row["status"] == "active" and row["expires_at"] <= now.isoformat():
            database.execute("UPDATE drawing_download_links SET status='expired', payload=NULL WHERE id=? AND status='active'", (row["id"],))
            row = database.execute("SELECT * FROM drawing_download_links WHERE id=?", (row["id"],)).fetchone()
        if row["status"] != "active":
            database.commit()
            raise CollaborationError(410, "Drawing download link has expired or was revoked")
        payload = bytes(row["payload"] or b"") if include_payload else b""
        if include_payload:
            if len(payload) != row["byte_length"] or not hmac.compare_digest(hashlib.sha256(payload).hexdigest(), row["sha256"]):
                raise CollaborationError(503, "Shared drawing PDF is unavailable or failed its integrity check")
            database.execute(
                "UPDATE drawing_download_links SET download_count=download_count+1, last_downloaded_at=? WHERE id=? AND status='active'",
                (now.isoformat(), row["id"]),
            )
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not read the shared drawing PDF") from error
    finally:
        database.close()
    return payload, {
        "filename": row["filename"], "sha256": row["sha256"], "display_name": row["display_name"],
        "byte_length": row["byte_length"], "expires_at": row["expires_at"],
    }


def _validate_proposal_approval_snapshot(value: object, project_id: str, proposal_id: str) -> tuple[dict, str, str]:
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise CollaborationError(422, "Proposal approval snapshot version is unsupported")
    if value.get("project_id") != project_id or value.get("proposal_id") != proposal_id:
        raise CollaborationError(422, "Proposal approval snapshot does not match its project and proposal")

    def text(field: str, maximum: int, *, required: bool = False) -> str:
        item = value.get(field)
        if not isinstance(item, str) or len(item) > maximum or (required and not item.strip()):
            raise CollaborationError(422, f"Proposal approval {field} is invalid")
        return item

    def amount(item: object, field: str, *, minimum: float = 0, maximum: float = 1_000_000_000_000) -> float:
        if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item) or item < minimum or item > maximum:
            raise CollaborationError(422, f"Proposal approval {field} is invalid")
        return float(item)

    project_name = text("project_name", 200, required=True)
    title = text("title", 160, required=True)
    recipient_name = text("recipient_name", 160, required=True)
    notes = text("notes", 4000)
    terms = text("terms", 4000)
    valid_until = value.get("valid_until")
    if valid_until is not None:
        if not isinstance(valid_until, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", valid_until):
            raise CollaborationError(422, "Proposal approval validity date is invalid")
        try:
            datetime.strptime(valid_until, "%Y-%m-%d")
        except ValueError as error:
            raise CollaborationError(422, "Proposal approval validity date is invalid") from error
    conditions = value.get("conditional_texts", [])
    if not isinstance(conditions, list) or len(conditions) > 100 or any(not isinstance(item, str) or len(item) > 4000 for item in conditions):
        raise CollaborationError(422, "Proposal approval conditional text is invalid")
    source_lines = value.get("lines")
    if not isinstance(source_lines, list) or len(source_lines) > 5000:
        raise CollaborationError(422, "Proposal approval lines are invalid")
    allowed_line_fields = {"phase", "cost_center", "mark", "description", "formula", "unit", "quantity", "unit_rate_thb", "amount_thb"}
    def line_text(line: dict, field: str, maximum: int, index: int) -> str:
        item = line.get(field)
        if not isinstance(item, str) or not item.strip() or len(item) > maximum:
            raise CollaborationError(422, f"Proposal approval line {index + 1} {field} is invalid")
        return item

    lines = []
    for index, line in enumerate(source_lines):
        if not isinstance(line, dict) or set(line) != allowed_line_fields:
            raise CollaborationError(422, f"Proposal approval line {index + 1} contains unsupported fields")
        if line.get("phase") not in {"existing", "demolition", "new_construction"}:
            raise CollaborationError(422, f"Proposal approval line {index + 1} phase is invalid")
        if line.get("cost_center") not in {"demolition_site_prep", "new_construction", "remodeling_joint_treatment"}:
            raise CollaborationError(422, f"Proposal approval line {index + 1} cost center is invalid")
        if line.get("unit") not in {"item", "m", "m2", "m3", "kg"}:
            raise CollaborationError(422, f"Proposal approval line {index + 1} unit is invalid")
        lines.append({
            "phase": line["phase"], "cost_center": line["cost_center"], "mark": line_text(line, "mark", 160, index),
            "description": line_text(line, "description", 500, index),
            "formula": line_text(line, "formula", 1000, index), "unit": line["unit"],
            "quantity": amount(line.get("quantity"), f"line {index + 1} quantity", minimum=0.000001),
            "unit_rate_thb": amount(line.get("unit_rate_thb"), f"line {index + 1} unit rate"),
            "amount_thb": amount(line.get("amount_thb"), f"line {index + 1} amount"),
        })
    source_totals = value.get("totals")
    total_fields = ("direct_cost_thb", "preliminaries_thb", "factor_f", "factor_f_subtotal_thb", "product_margin_amount_thb", "gross_margin_percent", "gross_margin_amount_thb", "subtotal_before_discount_thb", "discount_percent", "discount_amount_thb", "taxable_amount_thb", "vat_rate", "vat_amount_thb", "grand_total_thb")
    if not isinstance(source_totals, dict) or set(source_totals) != set(total_fields):
        raise CollaborationError(422, "Proposal approval totals are invalid")
    totals = {field: amount(source_totals[field], field, minimum=0.000001 if field == "factor_f" else 0, maximum=100 if field in {"gross_margin_percent", "discount_percent", "vat_rate"} else 1_000_000_000_000) for field in total_fields}
    if totals["vat_rate"] > 1 or totals["discount_percent"] > 100 or totals["gross_margin_percent"] >= 100:
        raise CollaborationError(422, "Proposal approval tax or margin percentage is invalid")
    snapshot = {
        "schema_version": 1, "project_id": project_id, "proposal_id": proposal_id, "project_name": project_name,
        "title": title, "recipient_name": recipient_name, "valid_until": valid_until, "notes": notes, "terms": terms,
        "conditional_texts": conditions, "lines": lines, "totals": totals,
    }
    serialized = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if len(serialized.encode("utf-8")) > MAX_PROPOSAL_APPROVAL_SNAPSHOT_BYTES:
        raise CollaborationError(413, "Proposal approval snapshot exceeds 2 MB")
    return snapshot, serialized, hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _proposal_approval_decision(row: sqlite3.Row) -> dict | None:
    if not row["decided_at"]:
        return None
    return {
        "status": row["status"], "decided_at": row["decided_at"], "signer_name": row["signer_name"],
        "signature": json.loads(row["signature_json"]) if row["signature_json"] else None,
        "note": row["response_note"] or "",
    }


def create_proposal_approval_link(project_id: str, proposal_id: str, authorization: str, value: object) -> dict:
    user_id, project_id = _authorize_write_project(project_id, authorization)
    if not UUID_PATTERN.fullmatch(proposal_id):
        raise CollaborationError(400, "Proposal ID must be a UUID")
    proposal_id = str(uuid.UUID(proposal_id))
    if not isinstance(value, dict):
        raise CollaborationError(422, "Proposal approval request must be an object")
    _snapshot, snapshot_json, snapshot_hash = _validate_proposal_approval_snapshot(value.get("snapshot"), project_id, proposal_id)
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
    link_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    created_at = now.isoformat()
    expires_at = (now + timedelta(days=PROPOSAL_APPROVAL_LINK_TTL_DAYS)).isoformat()
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        database.execute(
            "UPDATE proposal_approval_links SET status='revoked' WHERE project_id=? AND proposal_id=? AND status='pending'",
            (project_id, proposal_id),
        )
        database.execute(
            "INSERT INTO proposal_approval_links(id, project_id, proposal_id, token_hash, snapshot_hash, snapshot_json, status, created_by, created_at, expires_at) VALUES(?,?,?,?,?,?,'pending',?,?,?)",
            (link_id, project_id, proposal_id, token_hash, snapshot_hash, snapshot_json, user_id, created_at, expires_at),
        )
        database.commit()
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not create proposal approval link") from error
    finally:
        database.close()
    return {"id": link_id, "token": token, "snapshot_hash": snapshot_hash, "status": "pending", "created_at": created_at, "expires_at": expires_at}


def list_proposal_approval_links(project_id: str, proposal_id: str, authorization: str) -> dict:
    _user_id, _role = _authorize(project_id, authorization, write=False)
    if not UUID_PATTERN.fullmatch(proposal_id):
        raise CollaborationError(400, "Proposal ID must be a UUID")
    project_id, proposal_id = str(uuid.UUID(project_id)), str(uuid.UUID(proposal_id))
    now = datetime.now(timezone.utc).isoformat()
    database = _open_database()
    try:
        database.execute("UPDATE proposal_approval_links SET status='expired' WHERE project_id=? AND proposal_id=? AND status='pending' AND expires_at<=?", (project_id, proposal_id, now))
        rows = database.execute(
            "SELECT id, status, created_by, created_at, expires_at, decided_at, signer_name, signature_json, response_note FROM proposal_approval_links WHERE project_id=? AND proposal_id=? ORDER BY created_at DESC LIMIT 10",
            (project_id, proposal_id),
        ).fetchall()
        database.commit()
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not read proposal approval links") from error
    finally:
        database.close()
    return {"project_id": project_id, "proposal_id": proposal_id, "links": [{
        "id": row["id"], "status": row["status"], "created_by": row["created_by"],
        "created_at": row["created_at"], "expires_at": row["expires_at"], "decision": _proposal_approval_decision(row),
    } for row in rows]}


def revoke_proposal_approval_link(project_id: str, proposal_id: str, link_id: str, authorization: str) -> dict:
    _user_id, project_id = _authorize_write_project(project_id, authorization)
    if not UUID_PATTERN.fullmatch(proposal_id) or not UUID_PATTERN.fullmatch(link_id):
        raise CollaborationError(400, "Proposal or approval link ID must be a UUID")
    proposal_id, link_id = str(uuid.UUID(proposal_id)), str(uuid.UUID(link_id))
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        cursor = database.execute(
            "UPDATE proposal_approval_links SET status='revoked' WHERE id=? AND project_id=? AND proposal_id=? AND status='pending'",
            (link_id, project_id, proposal_id),
        )
        database.commit()
        if cursor.rowcount != 1:
            raise CollaborationError(409, "This approval link is no longer pending")
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not revoke proposal approval link") from error
    finally:
        database.close()
    return {"id": link_id, "status": "revoked"}


def _proposal_approval_token(authorization: str) -> str:
    if not authorization.startswith("Bearer "):
        raise CollaborationError(401, "Proposal approval token is required")
    token = authorization[7:]
    if not re.fullmatch(r"[A-Za-z0-9_-]{40,60}", token):
        raise CollaborationError(401, "Proposal approval token is invalid")
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _proposal_approval_expired(row: sqlite3.Row, now: datetime) -> bool:
    if row["expires_at"] <= now.isoformat():
        return True
    snapshot = json.loads(row["snapshot_json"])
    valid_until = snapshot.get("valid_until")
    thai_today = now.astimezone(timezone(timedelta(hours=7))).date().isoformat()
    return isinstance(valid_until, str) and valid_until < thai_today


def get_public_proposal_approval(authorization: str) -> dict:
    token_hash = _proposal_approval_token(authorization)
    now = datetime.now(timezone.utc)
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        row = database.execute("SELECT * FROM proposal_approval_links WHERE token_hash=?", (token_hash,)).fetchone()
        if row is None:
            raise CollaborationError(404, "Proposal approval link was not found")
        if row["status"] == "pending" and _proposal_approval_expired(row, now):
            database.execute("UPDATE proposal_approval_links SET status='expired' WHERE id=? AND status='pending'", (row["id"],))
            row = database.execute("SELECT * FROM proposal_approval_links WHERE id=?", (row["id"],)).fetchone()
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not read proposal approval") from error
    finally:
        database.close()
    if row["status"] in {"revoked", "expired"}:
        return {"status": row["status"], "expires_at": row["expires_at"]}
    if row["expires_at"] <= now.isoformat():
        return {"status": "expired", "expires_at": row["expires_at"]}
    return {
        "status": row["status"], "expires_at": row["expires_at"], "snapshot_hash": row["snapshot_hash"],
        "snapshot": json.loads(row["snapshot_json"]), "decision": _proposal_approval_decision(row),
    }


def submit_public_proposal_decision(authorization: str, value: object) -> dict:
    token_hash = _proposal_approval_token(authorization)
    if not isinstance(value, dict):
        raise CollaborationError(422, "Proposal decision must be an object")
    decision = value.get("decision")
    signer_name = value.get("signer_name")
    strokes = value.get("strokes")
    note = value.get("note", "")
    expected_snapshot_hash = value.get("snapshot_hash")
    if not isinstance(expected_snapshot_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_snapshot_hash):
        raise CollaborationError(422, "Proposal snapshot hash is invalid")
    if decision not in {"accepted", "declined"}:
        raise CollaborationError(422, "Proposal decision must be accepted or declined")
    if not isinstance(signer_name, str) or not signer_name.strip() or len(signer_name) > 120:
        raise CollaborationError(422, "Signer name is invalid")
    if value.get("confirmation") is not True:
        raise CollaborationError(422, "Confirm that the entered decision and signature are intentional")
    if not isinstance(note, str) or len(note) > 1000:
        raise CollaborationError(422, "Proposal response note is invalid")
    if not isinstance(strokes, list) or not 1 <= len(strokes) <= 40:
        raise CollaborationError(422, "Signature must contain between 1 and 40 strokes")
    total_points = 0
    for stroke in strokes:
        if not isinstance(stroke, list) or not 2 <= len(stroke) <= 2500:
            raise CollaborationError(422, "Each signature stroke must contain between 2 and 2500 points")
        total_points += len(stroke)
        for point in stroke:
            if not isinstance(point, dict) or isinstance(point.get("x"), bool) or isinstance(point.get("y"), bool):
                raise CollaborationError(422, "Signature point is invalid")
            if not isinstance(point.get("x"), (int, float)) or not isinstance(point.get("y"), (int, float)):
                raise CollaborationError(422, "Signature point is invalid")
            if not math.isfinite(point["x"]) or not math.isfinite(point["y"]) or not 0 <= point["x"] <= 1 or not 0 <= point["y"] <= 1:
                raise CollaborationError(422, "Signature point is outside its normalized drawing area")
    if total_points > 5000:
        raise CollaborationError(422, "Signature cannot exceed 5000 points")
    signature = {"signer_name": signer_name.strip(), "strokes": strokes}
    signature_json = json.dumps(signature, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        row = database.execute("SELECT * FROM proposal_approval_links WHERE token_hash=?", (token_hash,)).fetchone()
        if row is None:
            raise CollaborationError(404, "Proposal approval link was not found")
        if not hmac.compare_digest(row["snapshot_hash"], expected_snapshot_hash):
            raise CollaborationError(409, "Proposal snapshot changed; reload the link before submitting")
        if row["status"] == "pending" and _proposal_approval_expired(row, now):
            database.execute("UPDATE proposal_approval_links SET status='expired' WHERE id=? AND status='pending'", (row["id"],))
            database.commit()
            raise CollaborationError(410, "Proposal approval link has expired")
        if row["status"] in {"accepted", "declined"}:
            if row["status"] == decision and row["signer_name"] == signature["signer_name"] and row["signature_json"] == signature_json and row["response_note"] == note.strip():
                database.commit()
                return {"status": row["status"], "decided_at": row["decided_at"], "already_submitted": True}
            raise CollaborationError(409, "A decision was already recorded for this proposal link")
        if row["status"] != "pending":
            raise CollaborationError(409, "Proposal approval link is no longer active")
        database.execute(
            "UPDATE proposal_approval_links SET status=?, decided_at=?, signer_name=?, signature_json=?, response_note=? WHERE id=? AND status='pending'",
            (decision, now_iso, signature["signer_name"], signature_json, note.strip(), row["id"]),
        )
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not record proposal decision") from error
    finally:
        database.close()
    return {"status": decision, "decided_at": now_iso, "already_submitted": False}


def _field_photo_directory(project_id: str) -> Path:
    configured = os.environ.get("CONSTRUCTFLOW_COLLABORATION_MEDIA_DIR", "").strip()
    root = Path(configured).expanduser() if configured else _database_path().parent / "media"
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        root.chmod(0o700)
    except OSError:
        pass
    project_directory = root / str(uuid.UUID(project_id))
    project_directory.mkdir(mode=0o700, exist_ok=True)
    try:
        project_directory.chmod(0o700)
    except OSError:
        pass
    return project_directory


def _field_photo_path(project_id: str, asset_id: str) -> Path:
    return _field_photo_directory(project_id) / str(uuid.UUID(asset_id))


def _write_field_photo_atomically(path: Path, payload: bytes) -> None:
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    descriptor = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            descriptor = None
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except OSError as error:
        if descriptor is not None:
            os.close(descriptor)
        try:
            temporary.unlink()
        except OSError:
            pass
        raise CollaborationError(503, "Could not store project field photo") from error


def _validate_field_photo(asset_id: str, content_type: object, payload: object, expected_sha256: object) -> tuple[str, bytes, str]:
    if not isinstance(asset_id, str) or not UUID_PATTERN.fullmatch(asset_id):
        raise CollaborationError(422, "Field photo asset ID must be a UUID")
    normalized_asset_id = str(uuid.UUID(asset_id))
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}
    if not isinstance(content_type, str) or content_type.strip().lower() not in allowed_types:
        raise CollaborationError(422, "Field photos must be JPEG, PNG, WebP, GIF, or AVIF images")
    if not isinstance(payload, bytes) or not payload or len(payload) > MAX_FIELD_PHOTO_BYTES:
        raise CollaborationError(413, "Field photo must contain 1 byte to 20 MB")
    if not isinstance(expected_sha256, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_sha256.lower()):
        raise CollaborationError(422, "Field photo SHA-256 header is invalid")
    normalized_type = content_type.strip().lower()
    signatures = {
        "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
        "image/png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": lambda data: len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP",
        "image/gif": lambda data: data.startswith((b"GIF87a", b"GIF89a")),
        "image/avif": lambda data: len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12] in {b"avif", b"avis"},
    }
    if not signatures[normalized_type](payload):
        raise CollaborationError(422, "Field photo bytes do not match their image type")
    actual_sha256 = hashlib.sha256(payload).hexdigest()
    if not hmac.compare_digest(actual_sha256, expected_sha256.lower()):
        raise CollaborationError(422, "Field photo SHA-256 does not match its content")
    return normalized_asset_id, payload, actual_sha256


def list_project_media(project_id: str, authorization: str) -> dict:
    _user_id, role = _authorize(project_id, authorization, write=False)
    project_id = str(uuid.UUID(project_id))
    database = _open_database()
    try:
        rows = database.execute(
            "SELECT asset_id, sha256, byte_length, content_type, created_at FROM project_media_assets WHERE project_id=? ORDER BY asset_id LIMIT ?",
            (project_id, MAX_PROJECT_FIELD_PHOTOS + 1),
        ).fetchall()
        total_bytes = sum(row["byte_length"] for row in rows)
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not read project field photos") from error
    finally:
        database.close()
    if len(rows) > MAX_PROJECT_FIELD_PHOTOS:
        raise CollaborationError(503, "Project field photo manifest exceeds the supported limit")
    return {
        "project_id": project_id,
        "assets": [dict(row) for row in rows],
        "asset_count": len(rows),
        "total_bytes": total_bytes,
        "can_upload": role in {"owner", "editor"},
    }


def get_project_media(project_id: str, asset_id: str, authorization: str) -> tuple[bytes, dict]:
    _authorize(project_id, authorization, write=False)
    project_id = str(uuid.UUID(project_id))
    if not isinstance(asset_id, str) or not UUID_PATTERN.fullmatch(asset_id):
        raise CollaborationError(422, "Field photo asset ID must be a UUID")
    asset_id = str(uuid.UUID(asset_id))
    database = _open_database()
    try:
        row = database.execute(
            "SELECT asset_id, sha256, byte_length, content_type, created_at FROM project_media_assets WHERE project_id=? AND asset_id=?",
            (project_id, asset_id),
        ).fetchone()
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not read project field photo metadata") from error
    finally:
        database.close()
    if row is None:
        raise CollaborationError(404, "Field photo was not found in the shared project library")
    try:
        payload = _field_photo_path(project_id, asset_id).read_bytes()
    except OSError as error:
        raise CollaborationError(503, "Shared field photo file is unavailable on the gateway") from error
    if len(payload) != row["byte_length"] or not hmac.compare_digest(hashlib.sha256(payload).hexdigest(), row["sha256"]):
        raise CollaborationError(503, "Shared field photo failed its stored integrity check")
    return payload, dict(row)


def put_project_media(project_id: str, asset_id: str, authorization: str, content_type: object, payload: object, expected_sha256: object) -> dict:
    user_id, project_id = _authorize_write_project(project_id, authorization)
    asset_id, payload, digest = _validate_field_photo(asset_id, content_type, payload, expected_sha256)
    normalized_type = content_type.strip().lower()
    now = datetime.now(timezone.utc).isoformat()
    path = _field_photo_path(project_id, asset_id)
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        prior = database.execute(
            "SELECT sha256, byte_length, content_type, created_at FROM project_media_assets WHERE project_id=? AND asset_id=?",
            (project_id, asset_id),
        ).fetchone()
        if prior and (prior["sha256"] != digest or prior["byte_length"] != len(payload) or prior["content_type"] != normalized_type):
            raise CollaborationError(409, "This photo UUID already belongs to different immutable image content")
        if not prior:
            totals = database.execute(
                "SELECT COUNT(*) AS asset_count, COALESCE(SUM(byte_length), 0) AS total_bytes FROM project_media_assets WHERE project_id=?",
                (project_id,),
            ).fetchone()
            if totals["asset_count"] >= MAX_PROJECT_FIELD_PHOTOS:
                raise CollaborationError(413, "Project has reached its 500 field photo limit")
            if totals["total_bytes"] + len(payload) > MAX_PROJECT_FIELD_PHOTO_BYTES:
                raise CollaborationError(413, "Project field photos would exceed the 100 MB gateway limit")

        if path.exists():
            try:
                stored = path.read_bytes()
            except OSError as error:
                raise CollaborationError(503, "Could not verify stored project field photo") from error
            if len(stored) != len(payload) or not hmac.compare_digest(hashlib.sha256(stored).hexdigest(), digest):
                _write_field_photo_atomically(path, payload)
        else:
            _write_field_photo_atomically(path, payload)
        if not prior:
            database.execute(
                "INSERT INTO project_media_assets(project_id, asset_id, sha256, byte_length, content_type, uploaded_by, created_at) VALUES(?,?,?,?,?,?,?)",
                (project_id, asset_id, digest, len(payload), normalized_type, user_id, now),
            )
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not record project field photo metadata") from error
    finally:
        database.close()
    return {"project_id": project_id, "asset_id": asset_id, "sha256": digest, "byte_length": len(payload), "content_type": normalized_type, "status": "already_present" if prior else "stored"}


def _finish_zapier_delivery(project_id: str, event_id: str, status: str, response_status: int | None) -> None:
    database = _open_database()
    try:
        database.execute(
            "UPDATE integration_deliveries SET status=?, response_status=?, updated_at=? WHERE project_id=? AND event_id=?",
            (status, response_status, datetime.now(timezone.utc).isoformat(), project_id, event_id),
        )
        database.commit()
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Remote delivery finished but its acknowledgement could not be recorded") from error
    finally:
        database.close()


def _snapshot_hash(project_json: str) -> str:
    try:
        project = json.loads(project_json, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
        canonical = json.dumps(project, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (json.JSONDecodeError, ValueError, TypeError) as error:
        raise CollaborationError(422, "Revision project_json must contain valid JSON") from error
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _validate_bundle(project_id: str, bundle: object) -> tuple[str, list[dict]]:
    if not isinstance(bundle, dict) or bundle.get("format") != REVISION_BUNDLE_FORMAT or bundle.get("schema_version") != 1:
        raise CollaborationError(422, "Request must contain a ConstructFlow project revision bundle")
    if bundle.get("project_id") != project_id:
        raise CollaborationError(422, "Revision bundle project UUID does not match the request")
    source_device_id = bundle.get("source_device_id")
    if not isinstance(source_device_id, str) or not UUID_PATTERN.fullmatch(source_device_id):
        raise CollaborationError(422, "Revision bundle source device UUID is invalid")
    revisions = bundle.get("revisions")
    if not isinstance(revisions, list) or not revisions or len(revisions) > MAX_REVISIONS_PER_BUNDLE:
        raise CollaborationError(422, "Revision bundle must contain 1–500 revisions")
    total_snapshot_bytes = 0
    validated: list[dict] = []
    for index, source in enumerate(revisions, 1):
        if not isinstance(source, dict):
            raise CollaborationError(422, f"Revision {index} must be an object")
        revision_id = source.get("id")
        if not isinstance(revision_id, str) or not UUID_PATTERN.fullmatch(revision_id):
            raise CollaborationError(422, f"Revision {index} has an invalid UUID")
        if source.get("project_id") != project_id:
            raise CollaborationError(422, f"Revision {index} references a different project UUID")
        label, created_at, project_json = source.get("label"), source.get("created_at"), source.get("project_json")
        if not isinstance(label, str) or not label.strip() or len(label) > 120:
            raise CollaborationError(422, f"Revision {index} has an invalid label")
        if not isinstance(created_at, str) or len(created_at) > 80:
            raise CollaborationError(422, f"Revision {index} has an invalid timestamp")
        try:
            datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError as error:
            raise CollaborationError(422, f"Revision {index} has an invalid timestamp") from error
        if not isinstance(project_json, str) or not project_json.strip():
            raise CollaborationError(422, f"Revision {index} has no project snapshot")
        total_snapshot_bytes += len(project_json.encode("utf-8"))
        if total_snapshot_bytes > MAX_BUNDLE_BYTES:
            raise CollaborationError(413, "Combined project snapshots exceed 100 MB")
        snapshot_hash = _snapshot_hash(project_json)
        try:
            model = json.loads(project_json)
        except json.JSONDecodeError as error:
            raise CollaborationError(422, f"Revision {index} project snapshot is invalid JSON") from error
        if not isinstance(model, dict) or not isinstance(model.get("project"), dict) or model["project"].get("id") != project_id:
            raise CollaborationError(422, f"Revision {index} snapshot project UUID does not match")
        source_revision_id = source.get("source_revision_id")
        if source_revision_id is not None and (not isinstance(source_revision_id, str) or not UUID_PATTERN.fullmatch(source_revision_id)):
            raise CollaborationError(422, f"Revision {index} source UUID is invalid")
        origin_device_id = source.get("origin_device_id")
        if origin_device_id is not None and (not isinstance(origin_device_id, str) or not UUID_PATTERN.fullmatch(origin_device_id)):
            raise CollaborationError(422, f"Revision {index} origin device UUID is invalid")
        conflicts = source.get("conflict_with_revision_ids", [])
        if not isinstance(conflicts, list) or any(not isinstance(value, str) or not UUID_PATTERN.fullmatch(value) for value in conflicts):
            raise CollaborationError(422, f"Revision {index} conflict references are invalid")
        record = dict(source)
        record["project_id"] = project_id
        record["label"] = label.strip()
        record["origin_device_id"] = source.get("origin_device_id") if isinstance(source.get("origin_device_id"), str) else source_device_id
        if source_revision_id:
            record["source_revision_id"] = source_revision_id
        validated.append({"record": record, "snapshot_hash": snapshot_hash, "source_identity": source_revision_id or revision_id})
    return source_device_id, validated


def _bundle_for_project(project_id: str) -> dict:
    database = _open_database()
    try:
        server_id = database.execute("SELECT value FROM collaboration_meta WHERE key='server_id'").fetchone()["value"]
        rows = database.execute(
            "SELECT revision_json FROM project_revisions WHERE project_id=? ORDER BY revision_id, server_record_id",
            (project_id,),
        ).fetchall()
    finally:
        database.close()
    revisions = [json.loads(row["revision_json"]) for row in rows]
    revisions.sort(key=lambda item: (item.get("created_at", ""), item.get("id", "")))
    return {
        "format": REVISION_BUNDLE_FORMAT,
        "schema_version": 1,
        "project_id": project_id,
        "source_device_id": server_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "revisions": revisions,
    }


def get_project_revisions(project_id: str, authorization: str) -> dict:
    _authorize(project_id, authorization, write=False)
    return _bundle_for_project(project_id)


def _comment_timestamp(value: object, field: str) -> datetime:
    if not isinstance(value, str) or len(value) > 80:
        raise CollaborationError(422, f"Project comment {field} must be an ISO timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise CollaborationError(422, f"Project comment {field} must be an ISO timestamp") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _validate_project_comment(raw: object, index: int) -> dict:
    if not isinstance(raw, dict):
        raise CollaborationError(422, f"Project comment {index + 1} must be an object")
    comment_id = raw.get("id")
    level_id = raw.get("level_id")
    object_id = raw.get("object_id")
    if not isinstance(comment_id, str) or not UUID_PATTERN.fullmatch(comment_id):
        raise CollaborationError(422, f"Project comment {index + 1} requires a UUID")
    if not isinstance(level_id, str) or not UUID_PATTERN.fullmatch(level_id):
        raise CollaborationError(422, f"Project comment {comment_id} requires a level UUID")
    if object_id is not None and (not isinstance(object_id, str) or not UUID_PATTERN.fullmatch(object_id)):
        raise CollaborationError(422, f"Project comment {comment_id} requires a model object UUID")
    point = raw.get("point_mm")
    if (not isinstance(point, list) or len(point) != 2
            or any(isinstance(value, bool) or not isinstance(value, (int, float))
                   or not math.isfinite(value) or abs(value) > MAX_PRESENCE_COORDINATE_MM for value in point)):
        raise CollaborationError(422, f"Project comment {comment_id} requires finite plan coordinates in millimeters")
    author, body = raw.get("author"), raw.get("body")
    if not isinstance(author, str) or not author.strip() or len(author.strip()) > 120:
        raise CollaborationError(422, f"Project comment {comment_id} author must contain 1–120 characters")
    if not isinstance(body, str) or not body.strip() or len(body.strip()) > 3000:
        raise CollaborationError(422, f"Project comment {comment_id} message must contain 1–3000 characters")
    status = raw.get("status")
    if status not in {"open", "resolved"}:
        raise CollaborationError(422, f"Project comment {comment_id} status must be open or resolved")
    created_at = raw.get("created_at")
    updated_at = raw.get("updated_at")
    created_time = _comment_timestamp(created_at, "created_at")
    updated_time = _comment_timestamp(updated_at, "updated_at")
    status_updated_at = raw.get("status_updated_at", created_at)
    status_time = _comment_timestamp(status_updated_at, "status_updated_at")
    replies = raw.get("replies")
    if not isinstance(replies, list) or len(replies) > 100:
        raise CollaborationError(422, f"Project comment {comment_id} may contain at most 100 replies")
    normalized_replies = []
    reply_ids = set()
    for reply_index, reply in enumerate(replies):
        if not isinstance(reply, dict):
            raise CollaborationError(422, f"Project comment {comment_id} reply {reply_index + 1} must be an object")
        reply_id = reply.get("id")
        reply_author, reply_body = reply.get("author"), reply.get("body")
        if not isinstance(reply_id, str) or not UUID_PATTERN.fullmatch(reply_id) or reply_id.lower() in reply_ids:
            raise CollaborationError(422, f"Project comment {comment_id} replies require unique UUIDs")
        if not isinstance(reply_author, str) or not reply_author.strip() or len(reply_author.strip()) > 120:
            raise CollaborationError(422, f"Project comment {comment_id} reply author must contain 1–120 characters")
        if not isinstance(reply_body, str) or not reply_body.strip() or len(reply_body.strip()) > 2000:
            raise CollaborationError(422, f"Project comment {comment_id} reply must contain 1–2000 characters")
        reply_created_at = reply.get("created_at")
        _comment_timestamp(reply_created_at, "reply created_at")
        reply_ids.add(reply_id.lower())
        normalized_replies.append({
            "id": reply_id.lower(), "author": reply_author, "body": reply_body,
            "created_at": reply_created_at,
        })
    return {
        "id": comment_id.lower(), "level_id": level_id.lower(),
        "point_mm": [float(point[0]), float(point[1])],
        **({"object_id": object_id.lower()} if object_id is not None else {}),
        "author": author, "body": body, "status": status,
        "status_updated_at": status_updated_at,
        "replies": normalized_replies, "created_at": created_at, "updated_at": updated_at,
        "_created_time": created_time, "_updated_time": updated_time, "_status_time": status_time,
    }


def _merge_project_comments(existing_values: list[dict], incoming_values: list[dict]) -> list[dict]:
    merged = {comment["id"]: comment for comment in existing_values}
    for incoming in incoming_values:
        current = merged.get(incoming["id"])
        if current is None:
            merged[incoming["id"]] = incoming
            continue
        immutable_fields = ("level_id", "point_mm", "object_id", "author", "body", "created_at")
        if any(current.get(field) != incoming.get(field) for field in immutable_fields):
            raise CollaborationError(409, f"Project comment {incoming['id']} conflicts with an existing thread")
        replies = {reply["id"]: reply for reply in current["replies"]}
        for reply in incoming["replies"]:
            prior = replies.get(reply["id"])
            if prior is not None and prior != reply:
                raise CollaborationError(409, f"Project comment reply {reply['id']} conflicts with an existing reply")
            replies[reply["id"]] = reply
        if len(replies) > 100:
            raise CollaborationError(422, f"Project comment {incoming['id']} may contain at most 100 replies")
        current_status_key = (current["_status_time"], current["status"] == "resolved")
        incoming_status_key = (incoming["_status_time"], incoming["status"] == "resolved")
        status_source = incoming if incoming_status_key > current_status_key else current
        update_source = incoming if (incoming["_updated_time"], incoming["updated_at"]) > (current["_updated_time"], current["updated_at"]) else current
        latest_update = update_source["_updated_time"]
        merged[incoming["id"]] = {
            **current,
            "status": status_source["status"],
            "status_updated_at": status_source["status_updated_at"],
            "updated_at": update_source["updated_at"],
            "replies": sorted(replies.values(), key=lambda reply: (_comment_timestamp(reply["created_at"], "reply created_at"), reply["id"])),
            "_created_time": current["_created_time"], "_updated_time": latest_update,
            "_status_time": status_source["_status_time"],
        }
    if len(merged) > MAX_PROJECT_COMMENTS:
        raise CollaborationError(422, f"Project comments may contain at most {MAX_PROJECT_COMMENTS} threads")
    result = []
    for comment in sorted(merged.values(), key=lambda item: item["id"]):
        result.append({key: value for key, value in comment.items() if not key.startswith("_")})
    return result


def _project_comments_etag(project_id: str, count: int, latest_update: str | None) -> str:
    digest = hashlib.sha256(f"{project_id}:{count}:{latest_update or ''}".encode("utf-8")).hexdigest()
    return f'"{digest}"'


def get_project_comments(project_id: str, authorization: str, if_none_match: str | None = None) -> dict:
    _user_id, role = _authorize(project_id, authorization, write=False)
    database = _open_database()
    try:
        metadata = database.execute(
            "SELECT COUNT(*) AS total, MAX(updated_at) AS latest_update FROM project_comments WHERE project_id=?",
            (project_id,),
        ).fetchone()
        etag = _project_comments_etag(project_id, metadata["total"], metadata["latest_update"])
        if if_none_match == etag:
            return {"project_id": project_id, "comments": None, "can_write": role != "viewer", "etag": etag, "not_modified": True}
        rows = database.execute(
            "SELECT comment_json FROM project_comments WHERE project_id=? ORDER BY comment_id",
            (project_id,),
        ).fetchall()
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not read project comments") from error
    finally:
        database.close()
    comments = [json.loads(row["comment_json"]) for row in rows]
    return {"project_id": project_id, "comments": comments, "can_write": role != "viewer", "etag": etag}


def merge_project_comments(project_id: str, authorization: str, value: object) -> dict:
    user_id, role = _authorize(project_id, authorization, write=True)
    if not isinstance(value, dict) or not isinstance(value.get("comments"), list):
        raise CollaborationError(422, "Project comments must be supplied as an array")
    raw_comments = value["comments"]
    if len(raw_comments) > MAX_PROJECT_COMMENTS:
        raise CollaborationError(422, f"Project comments may contain at most {MAX_PROJECT_COMMENTS} threads")
    incoming = [_validate_project_comment(comment, index) for index, comment in enumerate(raw_comments)]
    if len({comment["id"] for comment in incoming}) != len(incoming):
        raise CollaborationError(422, "Project comment UUIDs must be unique")
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        rows = database.execute(
            "SELECT comment_json FROM project_comments WHERE project_id=? ORDER BY comment_id",
            (project_id,),
        ).fetchall()
        existing_raw = [json.loads(row["comment_json"]) for row in rows]
        existing = [_validate_project_comment(comment, index) for index, comment in enumerate(existing_raw)]
        merged = _merge_project_comments(existing, incoming)
        now_value = datetime.now(timezone.utc)
        latest_stored_update = database.execute(
            "SELECT MAX(updated_at) AS latest_update FROM project_comments WHERE project_id=?",
            (project_id,),
        ).fetchone()["latest_update"]
        if latest_stored_update:
            latest_value = _comment_timestamp(latest_stored_update, "server updated_at")
            if now_value <= latest_value:
                now_value = latest_value + timedelta(microseconds=1)
        now = now_value.isoformat()
        existing_by_id = {comment["id"]: comment for comment in existing}
        for comment in merged:
            prior = existing_by_id.get(comment["id"])
            if prior is not None:
                prior_public = {key: field for key, field in prior.items() if not key.startswith("_")}
                if json.dumps(prior_public, ensure_ascii=False, sort_keys=True, separators=(",", ":")) == json.dumps(comment, ensure_ascii=False, sort_keys=True, separators=(",", ":")):
                    continue
            database.execute(
                """INSERT INTO project_comments(project_id, comment_id, comment_json, updated_by, updated_at)
                   VALUES(?,?,?,?,?) ON CONFLICT(project_id, comment_id) DO UPDATE SET
                     comment_json=excluded.comment_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at""",
                (project_id, comment["id"], json.dumps(comment, ensure_ascii=False, separators=(",", ":")), user_id, now),
            )
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not save project comments") from error
    finally:
        database.close()
    snapshot = get_project_comments(project_id, authorization)
    return {**snapshot, "merged_count": len(merged)}


_NON_LIVE_COMMANDS = {"CreateProjectComment", "AddProjectCommentReply", "SetProjectCommentStatus", "MergeProjectComments", "RestoreProjectRevision"}
_COMMAND_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,119}$")


def _validate_command_transaction(project_id: str, raw: object, index: int) -> tuple[dict, list[str]]:
    if not isinstance(raw, dict):
        raise CollaborationError(422, f"Command transaction {index + 1} must be an object")
    transaction_id = raw.get("transaction_id")
    source_device_id = raw.get("source_device_id")
    base_sequence = raw.get("base_sequence")
    commands = raw.get("commands")
    if not isinstance(transaction_id, str) or not UUID_PATTERN.fullmatch(transaction_id):
        raise CollaborationError(422, f"Command transaction {index + 1} requires a UUID")
    if not isinstance(source_device_id, str) or not UUID_PATTERN.fullmatch(source_device_id):
        raise CollaborationError(422, f"Command transaction {transaction_id} requires a device UUID")
    if isinstance(base_sequence, bool) or not isinstance(base_sequence, int) or base_sequence < 0:
        raise CollaborationError(422, f"Command transaction {transaction_id} requires a non-negative base sequence")
    if not isinstance(commands, list) or not commands or len(commands) > MAX_COMMANDS_PER_TRANSACTION:
        raise CollaborationError(422, f"Command transaction {transaction_id} must contain 1–{MAX_COMMANDS_PER_TRANSACTION} commands")
    normalized_commands = []
    command_ids = []
    for command_index, envelope in enumerate(commands):
        if not isinstance(envelope, dict):
            raise CollaborationError(422, f"Command {command_index + 1} in transaction {transaction_id} must be an object")
        command_id, name = envelope.get("command_id"), envelope.get("name")
        if not isinstance(command_id, str) or not UUID_PATTERN.fullmatch(command_id):
            raise CollaborationError(422, f"Command {command_index + 1} in transaction {transaction_id} requires a UUID")
        if not isinstance(name, str) or not _COMMAND_NAME_PATTERN.fullmatch(name) or name in _NON_LIVE_COMMANDS:
            raise CollaborationError(422, f"Command {command_id} cannot be synchronized through the live model channel")
        if envelope.get("version") != 1 or envelope.get("project_id") != project_id:
            raise CollaborationError(422, f"Command {command_id} has an unsupported version or project UUID")
        timestamp = envelope.get("timestamp")
        _comment_timestamp(timestamp, "command timestamp")
        actor = envelope.get("actor")
        if not isinstance(actor, dict) or actor.get("kind") not in {"human", "ai", "sync", "system"}:
            raise CollaborationError(422, f"Command {command_id} has an invalid actor")
        input_value = envelope.get("input")
        if not isinstance(input_value, dict):
            raise CollaborationError(422, f"Command {command_id} input must be an object")
        source_transaction_id = envelope.get("transaction_id")
        if source_transaction_id is not None:
            if not isinstance(source_transaction_id, str) or not UUID_PATTERN.fullmatch(source_transaction_id):
                raise CollaborationError(422, f"Command {command_id} has an invalid transaction UUID")
            if source_transaction_id.lower() != transaction_id.lower():
                raise CollaborationError(422, f"Command {command_id} belongs to a different transaction")
        command_ids.append(command_id.lower())
        normalized_commands.append({
            "command_id": command_id.lower(), "transaction_id": transaction_id.lower(),
            "name": name, "version": 1, "project_id": project_id,
            "timestamp": timestamp, "actor": actor, "input": input_value,
        })
    if len(set(command_ids)) != len(command_ids):
        raise CollaborationError(422, f"Command IDs in transaction {transaction_id} must be unique")
    normalized = {
        "transaction_id": transaction_id.lower(),
        "source_device_id": source_device_id.lower(),
        "base_sequence": base_sequence,
        "commands": normalized_commands,
    }
    project_fingerprint = raw.get("project_fingerprint")
    if not isinstance(project_fingerprint, str) or not re.fullmatch(r"\d{1,12}:[0-9a-f]{16}", project_fingerprint, re.IGNORECASE):
        raise CollaborationError(422, f"Command transaction {transaction_id} requires a valid project fingerprint")
    normalized["project_fingerprint"] = project_fingerprint.lower()
    return normalized, command_ids


def get_project_command_transactions(
    project_id: str, authorization: str, after_sequence: int | None = None, *, join_at_head: bool = False,
) -> dict:
    _user_id, role = _authorize(project_id, authorization, write=False)
    database = _open_database()
    try:
        head = database.execute(
            "SELECT COALESCE(MAX(project_sequence), 0) AS head FROM project_command_transactions WHERE project_id=?",
            (project_id,),
        ).fetchone()["head"]
        head_fingerprint = None
        if head:
            latest = database.execute(
                "SELECT transaction_json FROM project_command_transactions WHERE project_id=? AND project_sequence=?",
                (project_id, head),
            ).fetchone()
            if latest:
                head_fingerprint = json.loads(latest["transaction_json"]).get("project_fingerprint")
        if join_at_head or after_sequence is None:
            return {"project_id": project_id, "transactions": [], "cursor": head, "head_sequence": head,
                    "head_fingerprint": head_fingerprint, "joined": True, "can_write": role != "viewer"}
        if isinstance(after_sequence, bool) or not isinstance(after_sequence, int) or after_sequence < 0:
            raise CollaborationError(422, "Command sync cursor must be a non-negative integer")
        if after_sequence > head:
            return {"project_id": project_id, "transactions": [], "cursor": head, "head_sequence": head, "reset_required": True, "can_write": role != "viewer"}
        rows = database.execute(
            """SELECT project_sequence AS sequence, transaction_id, source_device_id, base_sequence, submitted_by,
                      transaction_json, created_at FROM project_command_transactions
               WHERE project_id=? AND project_sequence>? ORDER BY project_sequence LIMIT ?""",
            (project_id, after_sequence, MAX_COMMAND_TRANSACTIONS_PER_PULL + 1),
        ).fetchall()
        has_more = len(rows) > MAX_COMMAND_TRANSACTIONS_PER_PULL
        rows = rows[:MAX_COMMAND_TRANSACTIONS_PER_PULL]
        transactions = []
        for row in rows:
            transaction = json.loads(row["transaction_json"])
            transactions.append({
                **transaction, "sequence": row["sequence"], "submitted_by": row["submitted_by"],
                "created_at": row["created_at"],
            })
        cursor = rows[-1]["sequence"] if rows else after_sequence
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not read live project commands") from error
    finally:
        database.close()
    return {
        "project_id": project_id, "transactions": transactions, "cursor": cursor,
        "head_sequence": head, "head_fingerprint": head_fingerprint,
        "has_more": has_more, "can_write": role != "viewer",
    }


def merge_project_command_transactions(project_id: str, authorization: str, value: object) -> dict:
    user_id, _role = _authorize(project_id, authorization, write=True)
    if not isinstance(value, dict) or not isinstance(value.get("transactions"), list):
        raise CollaborationError(422, "Live command transactions must be supplied as an array")
    raw_transactions = value["transactions"]
    if not raw_transactions or len(raw_transactions) > MAX_COMMAND_TRANSACTIONS_PER_UPLOAD:
        raise CollaborationError(422, f"Upload must contain 1–{MAX_COMMAND_TRANSACTIONS_PER_UPLOAD} command transactions")
    transactions = [_validate_command_transaction(project_id, item, index) for index, item in enumerate(raw_transactions)]
    normalized_upload_bytes = len(json.dumps([item[0] for item in transactions], ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    if normalized_upload_bytes > MAX_COMMAND_UPLOAD_BYTES:
        raise CollaborationError(413, "Live command upload exceeds 20 MB")
    if len({item[0]["transaction_id"] for item in transactions}) != len(transactions):
        raise CollaborationError(422, "Transaction UUIDs in an upload must be unique")
    total_commands = sum(len(item[0]["commands"]) for item in transactions)
    if total_commands > 2_000:
        raise CollaborationError(422, "An upload may contain at most 2000 commands")
    user_id, _role = _authorize(project_id, authorization, write=True)
    database = _open_database()
    imported = 0
    deduplicated = 0
    accepted = []
    try:
        database.execute("BEGIN IMMEDIATE")
        head = database.execute(
            "SELECT COALESCE(MAX(project_sequence), 0) AS head FROM project_command_transactions WHERE project_id=?",
            (project_id,),
        ).fetchone()["head"]
        for transaction, command_ids in transactions:
            transaction_json = json.dumps(transaction, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            if len(transaction_json.encode("utf-8")) > MAX_COMMAND_TRANSACTION_BYTES:
                raise CollaborationError(413, "A live command transaction exceeds 20 MB")
            payload_hash = hashlib.sha256(transaction_json.encode("utf-8")).hexdigest()
            existing = database.execute(
                "SELECT sequence, project_sequence, payload_hash, source_device_id FROM project_command_transactions WHERE project_id=? AND transaction_id=?",
                (project_id, transaction["transaction_id"]),
            ).fetchone()
            if existing:
                if existing["payload_hash"] != payload_hash or existing["source_device_id"] != transaction["source_device_id"]:
                    raise CollaborationError(409, f"Transaction UUID {transaction['transaction_id']} was reused with different content")
                deduplicated += 1
                accepted.append({"transaction_id": transaction["transaction_id"], "sequence": existing["project_sequence"], "deduplicated": True})
                continue
            if transaction["base_sequence"] != head:
                raise CollaborationError(409, f"Live command conflict: the server is at sequence {head}, device based its edit on {transaction['base_sequence']}")
            command_collision = database.execute(
                "SELECT command_id FROM project_command_ids WHERE project_id=? AND command_id IN ({}) LIMIT 1".format(
                    ",".join("?" for _ in command_ids)
                ),
                (project_id, *command_ids),
            ).fetchone()
            if command_collision:
                raise CollaborationError(409, f"Command UUID {command_collision['command_id']} already belongs to another transaction")
            now = datetime.now(timezone.utc).isoformat()
            next_sequence = head + 1
            cursor = database.execute(
                """INSERT INTO project_command_transactions(project_id, project_sequence, transaction_id, source_device_id,
                          base_sequence, submitted_by, payload_hash, transaction_json, created_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                (project_id, next_sequence, transaction["transaction_id"], transaction["source_device_id"], transaction["base_sequence"], user_id, payload_hash, transaction_json, now),
            )
            sequence = int(cursor.lastrowid)
            for command_id in command_ids:
                database.execute(
                    "INSERT INTO project_command_ids(project_id, command_id, transaction_sequence) VALUES(?,?,?)",
                    (project_id, command_id, sequence),
                )
            head = next_sequence
            imported += 1
            accepted.append({"transaction_id": transaction["transaction_id"], "sequence": next_sequence, "deduplicated": False})
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not append live project commands") from error
    finally:
        database.close()
    return {"project_id": project_id, "imported": imported, "deduplicated": deduplicated, "accepted": accepted, "head_sequence": head}


def list_project_presence(project_id: str, authorization: str) -> dict:
    _authorize(project_id, authorization, write=False)
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=PRESENCE_TTL_SECONDS)).isoformat()
    database = _open_database()
    try:
        rows = database.execute(
            """SELECT user_id, COUNT(*) AS active_sessions, MAX(last_seen) AS last_seen
               FROM project_presence WHERE project_id=? AND last_seen>=?
               GROUP BY user_id ORDER BY user_id COLLATE NOCASE""",
            (project_id, cutoff),
        ).fetchall()
        session_rows = database.execute(
            """SELECT session_id, user_id, last_seen, selected_object_ids_json,
                      cursor_x_mm, cursor_y_mm, cursor_updated_at
               FROM project_presence WHERE project_id=? AND last_seen>=?
               ORDER BY user_id COLLATE NOCASE, session_id""",
            (project_id, cutoff),
        ).fetchall()
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not read project presence") from error
    finally:
        database.close()
    users = [
        {"user_id": row["user_id"], "active_sessions": row["active_sessions"], "last_seen": row["last_seen"]}
        for row in rows
    ]
    sessions = []
    for row in session_rows:
        try:
            selected_object_ids = json.loads(row["selected_object_ids_json"])
        except (TypeError, json.JSONDecodeError):
            selected_object_ids = []
        if not isinstance(selected_object_ids, list):
            selected_object_ids = []
        session = {
            "session_id": row["session_id"],
            "user_id": row["user_id"],
            "last_seen": row["last_seen"],
            "selected_object_ids": selected_object_ids,
        }
        if row["cursor_x_mm"] is not None and row["cursor_y_mm"] is not None and row["cursor_updated_at"]:
            session["cursor_mm"] = [row["cursor_x_mm"], row["cursor_y_mm"]]
            session["cursor_updated_at"] = row["cursor_updated_at"]
        sessions.append(session)
    return {"project_id": project_id, "users": users, "sessions": sessions, "expires_in_seconds": PRESENCE_TTL_SECONDS}


def heartbeat_project_presence(
    project_id: str, authorization: str, session_id: str,
    selected_object_ids: object = None, cursor_mm: object = None,
) -> dict:
    user_id, _role = _authorize(project_id, authorization, write=False)
    if not isinstance(session_id, str) or not UUID_PATTERN.fullmatch(session_id):
        raise CollaborationError(422, "Presence session ID must be a UUID")
    if selected_object_ids is None:
        selected_object_ids = []
    if not isinstance(selected_object_ids, list) or len(selected_object_ids) > MAX_PRESENCE_SELECTED_OBJECTS:
        raise CollaborationError(422, "Presence selection must contain at most 50 object UUIDs")
    if any(not isinstance(value, str) or not UUID_PATTERN.fullmatch(value) for value in selected_object_ids):
        raise CollaborationError(422, "Presence selection must contain object UUIDs")
    selected_json = json.dumps(list(dict.fromkeys(value.lower() for value in selected_object_ids)), separators=(",", ":"))
    cursor_x = cursor_y = None
    cursor_updated_at = None
    if cursor_mm is not None:
        if (not isinstance(cursor_mm, list) or len(cursor_mm) != 2
                or any(isinstance(value, bool) or not isinstance(value, (int, float))
                       or not math.isfinite(value) or abs(value) > MAX_PRESENCE_COORDINATE_MM for value in cursor_mm)):
            raise CollaborationError(422, "Presence cursor must contain two finite millimeter coordinates")
        cursor_x, cursor_y = float(cursor_mm[0]), float(cursor_mm[1])
        cursor_updated_at = datetime.now(timezone.utc).isoformat()
    now = datetime.now(timezone.utc).isoformat()
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=PRESENCE_TTL_SECONDS)).isoformat()
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        database.execute("DELETE FROM project_presence WHERE last_seen<?", (cutoff,))
        existing = database.execute(
            "SELECT 1 FROM project_presence WHERE project_id=? AND session_id=?",
            (project_id, session_id),
        ).fetchone()
        count = database.execute(
            "SELECT COUNT(*) AS total FROM project_presence WHERE project_id=?",
            (project_id,),
        ).fetchone()["total"]
        if existing is None and count >= MAX_PRESENCE_SESSIONS_PER_PROJECT:
            raise CollaborationError(409, "This project has reached its active collaboration session limit")
        database.execute(
            """INSERT INTO project_presence(project_id, session_id, user_id, last_seen,
                      selected_object_ids_json, cursor_x_mm, cursor_y_mm, cursor_updated_at)
               VALUES(?,?,?,?,?,?,?,?)
               ON CONFLICT(project_id, session_id) DO UPDATE SET user_id=excluded.user_id,
                 last_seen=excluded.last_seen, selected_object_ids_json=excluded.selected_object_ids_json,
                 cursor_x_mm=excluded.cursor_x_mm, cursor_y_mm=excluded.cursor_y_mm,
                 cursor_updated_at=excluded.cursor_updated_at""",
            (project_id, session_id, user_id, now, selected_json, cursor_x, cursor_y, cursor_updated_at),
        )
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not update project presence") from error
    finally:
        database.close()
    snapshot = list_project_presence(project_id, authorization)
    snapshot["current_user"] = user_id
    snapshot["current_role"] = _role
    return snapshot


def delete_project_presence(project_id: str, authorization: str, session_id: str) -> None:
    user_id, _role = _authorize(project_id, authorization, write=False)
    if not isinstance(session_id, str) or not UUID_PATTERN.fullmatch(session_id):
        raise CollaborationError(400, "Presence session ID must be a UUID")
    database = _open_database()
    try:
        database.execute(
            "DELETE FROM project_presence WHERE project_id=? AND session_id=? AND user_id=?",
            (project_id, session_id, user_id),
        )
        database.commit()
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not close project presence session") from error
    finally:
        database.close()


def merge_project_revisions(project_id: str, authorization: str, bundle: object) -> dict:
    user_id, _role = _authorize(project_id, authorization, write=True)
    source_device_id, revisions = _validate_bundle(project_id, bundle)
    imported = 0
    deduplicated = 0
    conflicts = 0
    database = None
    try:
        database = _open_database()
        database.execute("BEGIN IMMEDIATE")
        for entry in revisions:
            source = entry["record"]
            source_identity = entry["source_identity"]
            snapshot_hash = entry["snapshot_hash"]
            duplicate = database.execute(
                "SELECT server_record_id FROM project_revisions WHERE project_id=? AND snapshot_hash=? AND (revision_id=? OR source_revision_id=?) LIMIT 1",
                (project_id, snapshot_hash, source_identity, source_identity),
            ).fetchone()
            if duplicate:
                deduplicated += 1
                continue

            siblings = database.execute(
                "SELECT server_record_id, revision_json FROM project_revisions WHERE project_id=? AND (revision_id=? OR source_revision_id=?)",
                (project_id, source_identity, source_identity),
            ).fetchall()
            stored = dict(source)
            if siblings:
                stored_id = str(uuid.uuid4())
                sibling_ids = []
                for sibling in siblings:
                    prior = json.loads(sibling["revision_json"])
                    sibling_ids.append(prior["id"])
                    prior["source_revision_id"] = source_identity
                    prior["conflict_with_revision_ids"] = sorted(set(prior.get("conflict_with_revision_ids", [])) | {stored_id})
                    database.execute(
                        "UPDATE project_revisions SET source_revision_id=?, revision_json=? WHERE server_record_id=?",
                        (source_identity, json.dumps(prior, ensure_ascii=False, separators=(",", ":")), sibling["server_record_id"]),
                    )
                stored["id"] = stored_id
                stored["source_revision_id"] = source_identity
                stored["conflict_with_revision_ids"] = sorted(set(stored.get("conflict_with_revision_ids", [])) | set(sibling_ids))
                conflicts += 1
            else:
                stored_id = stored["id"]

            stored_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
            database.execute(
                "INSERT INTO project_revisions(server_record_id, project_id, revision_id, source_revision_id, snapshot_hash, revision_json) VALUES(?,?,?,?,?,?)",
                (stored_id, project_id, stored["id"], stored.get("source_revision_id"), snapshot_hash, stored_json),
            )
            imported += 1
        database.commit()
    except sqlite3.Error as error:
        if database is not None:
            database.rollback()
        raise CollaborationError(503, "Could not save the project revision bundle") from error
    finally:
        if database is not None:
            database.close()
    return {
        "user_id": user_id,
        "imported": imported,
        "deduplicated": deduplicated,
        "conflicts": conflicts,
        "bundle": _bundle_for_project(project_id),
    }


def _configured_project_members(project_id: str) -> list[dict]:
    members = []
    for account in _accounts():
        role = account["projects"].get(project_id) or account["projects"].get(project_id.lower()) or account["projects"].get("*")
        if role:
            member_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"constructflow:{project_id}:{account['user_id']}"))
            members.append({
                "member_id": member_id,
                "user_id": account["user_id"],
                "role": role,
                "source": "environment",
                "created_at": None,
            })
    return members


def list_project_members(project_id: str, authorization: str) -> dict:
    _user_id, role = _authorize(project_id, authorization, write=False)
    configured = _configured_project_members(project_id)
    database = _open_database()
    try:
        rows = database.execute(
            "SELECT member_id, user_id, role, created_at FROM project_members WHERE project_id=? ORDER BY user_id COLLATE NOCASE",
            (project_id,),
        ).fetchall()
    except sqlite3.Error as error:
        raise CollaborationError(503, "Could not read project members") from error
    finally:
        database.close()
    members = configured + [
        {"member_id": row["member_id"], "user_id": row["user_id"], "role": row["role"], "source": "server", "created_at": row["created_at"]}
        for row in rows
    ]
    members.sort(key=lambda item: (item["user_id"].casefold(), item["source"]))
    return {"project_id": project_id, "members": members, "can_manage": role == "owner"}


def _require_project_owner(project_id: str, authorization: str) -> str:
    user_id, role = _authorize(project_id, authorization, write=True)
    if role != "owner":
        raise CollaborationError(403, "Only a project owner can manage members")
    return user_id


def create_project_member(project_id: str, authorization: str, value: object) -> dict:
    _require_project_owner(project_id, authorization)
    if not isinstance(value, dict):
        raise CollaborationError(422, "Member details must be an object")
    user_id, role = value.get("user_id"), value.get("role")
    if not isinstance(user_id, str) or not user_id.strip() or len(user_id.strip()) > 120:
        raise CollaborationError(422, "Member name must contain 1–120 characters")
    user_id = user_id.strip()
    if not isinstance(role, str) or role not in {"owner", "editor", "viewer"}:
        raise CollaborationError(422, "Member role must be owner, editor or viewer")
    if any(item["user_id"].casefold() == user_id.casefold() for item in _configured_project_members(project_id)):
        raise CollaborationError(409, "This member is managed by server environment configuration")

    _inviter_id, company_id, inviter_company_role = _company_identity_for_token(authorization)
    company_role = None
    company_role_cap = None
    if company_id and inviter_company_role:
        role_rank = {"viewer": 0, "editor": 1, "owner": 2}
        company_role = role if role_rank[role] <= role_rank[inviter_company_role] else inviter_company_role
        company_role_cap = inviter_company_role

    token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        count = database.execute("SELECT COUNT(*) AS total FROM project_members WHERE project_id=?", (project_id,)).fetchone()["total"]
        if count >= 500:
            raise CollaborationError(409, "A project can have at most 500 server-managed members")
        if any(row["user_id"].casefold() == user_id.casefold() for row in database.execute("SELECT user_id FROM project_members WHERE project_id=?", (project_id,)).fetchall()):
            raise CollaborationError(409, "This user already has a project membership")
        member_id = str(uuid.uuid4())
        database.execute(
            "INSERT INTO project_members(member_id, project_id, user_id, role, token_hash, created_at, updated_at, company_id, company_role, company_role_cap) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (member_id, project_id, user_id, role, token_hash, now, now, company_id, company_role, company_role_cap),
        )
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.IntegrityError as error:
        database.rollback()
        raise CollaborationError(409, "This user already has a project membership") from error
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not add project member") from error
    finally:
        database.close()
    return {
        "member": {"member_id": member_id, "user_id": user_id, "role": role, "source": "server", "created_at": now},
        "token": token,
    }


def update_project_member_role(project_id: str, authorization: str, member_id: str, value: object) -> dict:
    _require_project_owner(project_id, authorization)
    if not UUID_PATTERN.fullmatch(member_id) or not isinstance(value, dict):
        raise CollaborationError(422, "Member ID or role update is invalid")
    role = value.get("role")
    if not isinstance(role, str) or role not in {"owner", "editor", "viewer"}:
        raise CollaborationError(422, "Member role must be owner, editor or viewer")
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        member = database.execute(
            "SELECT member_id, user_id, role, created_at, company_role_cap FROM project_members WHERE project_id=? AND member_id=?",
            (project_id, member_id),
        ).fetchone()
        if member is None:
            raise CollaborationError(404, "Project member was not found")
        if member["role"] == "owner" and role != "owner":
            dynamic_owners = database.execute(
                "SELECT COUNT(*) AS total FROM project_members WHERE project_id=? AND role='owner'",
                (project_id,),
            ).fetchone()["total"]
            configured_owners = [item for item in _configured_project_members(project_id) if item["role"] == "owner"]
            if dynamic_owners <= 1 and not configured_owners:
                raise CollaborationError(409, "The project must keep at least one owner")
        company_role = member["company_role_cap"]
        if company_role:
            role_rank = {"viewer": 0, "editor": 1, "owner": 2}
            if role_rank[role] < role_rank[company_role]:
                company_role = role
        database.execute(
            "UPDATE project_members SET role=?, company_role=?, updated_at=? WHERE member_id=?",
            (role, company_role, datetime.now(timezone.utc).isoformat(), member_id),
        )
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not update project member") from error
    finally:
        database.close()
    return {"member": {"member_id": member_id, "user_id": member["user_id"], "role": role, "source": "server", "created_at": member["created_at"]}}


def delete_project_member(project_id: str, authorization: str, member_id: str) -> None:
    _require_project_owner(project_id, authorization)
    if not UUID_PATTERN.fullmatch(member_id):
        raise CollaborationError(400, "Member ID must be a UUID")
    database = _open_database()
    try:
        database.execute("BEGIN IMMEDIATE")
        member = database.execute(
            "SELECT role FROM project_members WHERE project_id=? AND member_id=?",
            (project_id, member_id),
        ).fetchone()
        if member is None:
            raise CollaborationError(404, "Project member was not found")
        if member["role"] == "owner":
            dynamic_owners = database.execute(
                "SELECT COUNT(*) AS total FROM project_members WHERE project_id=? AND role='owner'",
                (project_id,),
            ).fetchone()["total"]
            configured_owners = [item for item in _configured_project_members(project_id) if item["role"] == "owner"]
            if dynamic_owners <= 1 and not configured_owners:
                raise CollaborationError(409, "The project must keep at least one owner")
        database.execute("DELETE FROM project_members WHERE project_id=? AND member_id=?", (project_id, member_id))
        database.commit()
    except CollaborationError:
        database.rollback()
        raise
    except sqlite3.Error as error:
        database.rollback()
        raise CollaborationError(503, "Could not revoke project member") from error
    finally:
        database.close()
