"""Local Sign in with ChatGPT support for the ConstructFlow editor."""

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

AUTH_BASE = "https://auth.openai.com"
API_BASE = "https://api.openai.com/v1"
RESOURCE = "https://api.openai.com/v1"
SERVICE_NAME = "ConstructFlow ChatGPT"
ACCOUNT_NAME = "primary"
AUTHORIZATION_ENDPOINT = f"{AUTH_BASE}/api/accounts/authorize"
TOKEN_ENDPOINT = f"{AUTH_BASE}/api/accounts/oauth/token"
DISCOVERY_ENDPOINT = f"{AUTH_BASE}/.well-known/openid-configuration"
SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"

_pending = {}
_pending_lock = threading.Lock()


class ChatGPTAuthError(Exception):
    pass


def _secure_keyring():
    try:
        import keyring
        backend = keyring.get_keyring()
        backend_name = f"{backend.__class__.__module__}.{backend.__class__.__name__}"
        if backend.priority <= 0 or not any(
            trusted in backend_name for trusted in (
                "keyring.backends.Windows.WinVaultKeyring",
                "keyring.backends.macOS.Keyring",
                "keyring.backends.SecretService.Keyring",
                "keyring.backends.kwallet.KWallet",
                "keyring.backends.kwallet.DBusKeyring",
            )
        ):
            raise ChatGPTAuthError("ไม่พบ secure credential store ของระบบปฏิบัติการ (Keychain, Credential Manager หรือ Secret Service)")
        return keyring
    except ChatGPTAuthError:
        raise
    except Exception as error:
        raise ChatGPTAuthError("ต้องติดตั้ง keyring และเปิดใช้ credential store ของระบบปฏิบัติการก่อน") from error


def _load_record():
    keyring = _secure_keyring()
    raw = keyring.get_password(SERVICE_NAME, ACCOUNT_NAME)
    if not raw:
        return None
    try:
        record = json.loads(raw)
        if not isinstance(record, dict) or record.get("client_id") is None:
            raise ValueError("invalid record")
        return record
    except (TypeError, ValueError, json.JSONDecodeError) as error:
        raise ChatGPTAuthError("ข้อมูล Sign in with ChatGPT ใน credential store อ่านไม่ได้ กรุณาเชื่อมต่อบัญชีใหม่") from error


def _save_record(record):
    _secure_keyring().set_password(SERVICE_NAME, ACCOUNT_NAME, json.dumps(record, separators=(",", ":")))


def _clear_record():
    keyring = _secure_keyring()
    try:
        keyring.delete_password(SERVICE_NAME, ACCOUNT_NAME)
    except keyring.errors.PasswordDeleteError:
        pass


def _b64url(data):
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _json_request(url, *, data=None, headers=None, timeout=20):
    request = Request(url, data=data, headers=headers or {}, method="POST" if data is not None else "GET")
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read(1_000_001)
            if len(raw) > 1_000_000:
                raise ChatGPTAuthError("OpenAI authentication response exceeds the 1 MB limit")
            if not raw:
                return {}
            return json.loads(raw.decode("utf-8"))
    except HTTPError as error:
        raise ChatGPTAuthError(f"OpenAI authentication request failed (HTTP {error.code})") from error
    except (URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ChatGPTAuthError(f"OpenAI authentication request failed: {type(error).__name__}") from error


def start_sign_in(return_origin):
    if not isinstance(return_origin, str) or return_origin not in _allowed_origins():
        raise ChatGPTAuthError("แหล่งที่มาของหน้า editor ไม่ได้รับอนุญาต")
    record = _load_record()
    host_id = (record or {}).get("ext_agent_host_id") or f"urn:uuid:{uuid.uuid4()}"
    client_id = (record or {}).get("client_id") or "dynamic_agent_client"
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = _b64url(secrets.token_bytes(48))
    challenge = _b64url(hashlib.sha256(verifier.encode("ascii")).digest())
    redirect_uri = f"http://127.0.0.1:{_http_port()}/auth/callback"
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": SCOPES,
        "resource": RESOURCE,
        "state": state,
        "nonce": nonce,
        "code_challenge_method": "S256",
        "code_challenge": challenge,
        "ext_agent_host_id": host_id,
    }
    if client_id == "dynamic_agent_client":
        params["agent_name_hint"] = "ConstructFlow"
    else:
        if record.get("id_token"):
            params["id_token_hint"] = record["id_token"]
        if record.get("email"):
            params["login_hint"] = record["email"]
    with _pending_lock:
        now = time.time()
        for key in list(_pending):
            if _pending[key]["created_at"] < now - 600:
                del _pending[key]
        _pending[state] = {
            "created_at": now,
            "nonce": nonce,
            "verifier": verifier,
            "redirect_uri": redirect_uri,
            "host_id": host_id,
            "existing_client_id": (record or {}).get("client_id"),
        }
    return f"{AUTHORIZATION_ENDPOINT}?{urlencode(params)}"


def _openid_config():
    return _json_request(DISCOVERY_ENDPOINT)


def _verify_id_token(id_token, client_id, nonce):
    try:
        import jwt
        from jwt import PyJWKClient
    except ImportError as error:
        raise ChatGPTAuthError("ต้องติดตั้ง PyJWT[crypto] เพื่อยืนยันตัวตน ChatGPT") from error
    try:
        config = _openid_config()
        signing_key = PyJWKClient(config["jwks_uri"]).get_signing_key_from_jwt(id_token).key
        claims = jwt.decode(
            id_token,
            signing_key,
            algorithms=["RS256", "ES256"],
            audience=client_id,
            issuer=config["issuer"],
            options={"require": ["exp", "iss", "aud", "sub", "nonce"]},
            leeway=30,
        )
    except Exception as error:
        raise ChatGPTAuthError("ตรวจสอบตัวตนจาก OpenAI ไม่สำเร็จ กรุณาเริ่ม Sign in ใหม่") from error
    if not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
        raise ChatGPTAuthError("ยืนยัน nonce ของบัญชี ChatGPT ไม่สำเร็จ")
    return claims


def finish_sign_in(query):
    state = query.get("state", [""])[0]
    with _pending_lock:
        pending = _pending.pop(state, None)
    if not pending or pending["created_at"] < time.time() - 600:
        raise ChatGPTAuthError("คำขอล็อกอินหมดอายุหรือ state ไม่ตรงกัน กรุณาเริ่มใหม่")
    error_code = query.get("error", [""])[0]
    if error_code:
        raise ChatGPTAuthError("ยกเลิกหรือไม่อนุญาตการเชื่อมต่อ ChatGPT")
    code = query.get("code", [""])[0]
    callback_client_id = query.get("client_id", [""])[0]
    if not code:
        raise ChatGPTAuthError("OpenAI ไม่ได้ส่ง authorization code กลับมา")
    client_id = callback_client_id or pending["existing_client_id"]
    if not client_id or client_id == "dynamic_agent_client":
        raise ChatGPTAuthError("การลงทะเบียนบัญชี ChatGPT ยังไม่สมบูรณ์")
    if pending["existing_client_id"] and client_id != pending["existing_client_id"]:
        raise ChatGPTAuthError("บัญชีที่ callback ส่งกลับมาไม่ตรงกับบัญชีที่เลือกไว้")
    form = urlencode({
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": code,
        "code_verifier": pending["verifier"],
        "redirect_uri": pending["redirect_uri"],
        "resource": RESOURCE,
    }).encode("ascii")
    token_response = _json_request(TOKEN_ENDPOINT, data=form, headers={"Content-Type": "application/x-www-form-urlencoded"})
    if not isinstance(token_response, dict):
        raise ChatGPTAuthError("OpenAI token response มีรูปแบบไม่ถูกต้อง")
    id_token = token_response.get("id_token")
    access_token = token_response.get("access_token")
    refresh_token = token_response.get("refresh_token")
    if not id_token or not access_token or not refresh_token:
        raise ChatGPTAuthError("OpenAI token response ไม่มี credential ที่จำเป็น")
    identity = _verify_id_token(id_token, client_id, pending["nonce"])
    granted_scopes = set((token_response.get("scope") or query.get("scope", [""])[0]).split())
    if "chatgpt.tokens.use.direct" not in granted_scopes or "resource.invoke" not in granted_scopes:
        raise ChatGPTAuthError("บัญชีนี้ยังไม่ได้อนุญาตให้ใช้ ChatGPT plan กับ ConstructFlow")
    old = _load_record() or {}
    _save_record({
        "issuer": identity["iss"],
        "subject": identity["sub"],
        "email": identity.get("email", ""),
        "name": identity.get("name", ""),
        "client_id": client_id,
        "ext_agent_host_id": pending["host_id"],
        "id_token": id_token,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": token_response.get("token_type", "Bearer"),
        "expires_at": time.time() + int(token_response.get("expires_in", 3600)),
        "scopes": sorted(granted_scopes),
        "selected_model": old.get("selected_model", ""),
    })
    return None


def auth_status():
    record = _load_record()
    if not record:
        return {"mode": "local", "connected": False, "email": "", "name": "", "sharing": False}
    return {
        "mode": "local",
        "connected": True,
        "email": record.get("email", ""),
        "name": record.get("name", ""),
        "sharing": "chatgpt.tokens.use.direct" in record.get("scopes", []),
    }


def _access_token(record):
    if record.get("expires_at", 0) > time.time() + 60:
        return record["access_token"]
    form = urlencode({
        "grant_type": "refresh_token",
        "client_id": record["client_id"],
        "refresh_token": record["refresh_token"],
        "resource": RESOURCE,
    }).encode("ascii")
    response = _json_request(TOKEN_ENDPOINT, data=form, headers={"Content-Type": "application/x-www-form-urlencoded"})
    access_token = response.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise ChatGPTAuthError("OpenAI ไม่ได้ต่ออายุ session ChatGPT ให้")
    record["access_token"] = access_token
    record["refresh_token"] = response.get("refresh_token", record["refresh_token"])
    record["expires_at"] = time.time() + int(response.get("expires_in", 3600))
    _save_record(record)
    return record["access_token"]


_refresh_lock = threading.Lock()


def _api_json(path):
    with _refresh_lock:
        record = _load_record()
        if not record or "chatgpt.tokens.use.direct" not in record.get("scopes", []):
            raise ChatGPTAuthError("เชื่อมต่อบัญชี ChatGPT ที่อนุญาตให้ใช้ plan ก่อน")
        token = _access_token(record)
    request = Request(f"{API_BASE}{path}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read(1_000_001).decode("utf-8"))
    except HTTPError as error:
        if error.code == 401:
            raise ChatGPTAuthError("session ChatGPT หมดอายุ กรุณาเชื่อมต่อบัญชีใหม่") from error
        raise ChatGPTAuthError(f"ChatGPT API ตอบกลับ HTTP {error.code}") from error
    except (URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ChatGPTAuthError(f"ติดต่อ ChatGPT API ไม่สำเร็จ: {type(error).__name__}") from error


def list_models():
    result = _api_json("/models")
    models = result.get("models", [])
    return [
        {"slug": item["slug"], "display_name": item.get("display_name") or item["slug"]}
        for item in models
        if isinstance(item, dict) and item.get("visibility") == "list" and isinstance(item.get("slug"), str)
    ]


def selected_model():
    record = _load_record()
    return (record or {}).get("selected_model", "")


def select_model(model):
    if not isinstance(model, str) or not model.strip() or len(model) > 200:
        raise ChatGPTAuthError("เลือกรุ่นโมเดลที่ถูกต้อง")
    available = {entry["slug"] for entry in list_models()}
    if model not in available:
        raise ChatGPTAuthError("โมเดลนี้ไม่อยู่ในรายการของบัญชี ChatGPT ที่เชื่อมต่อ")
    record = _load_record()
    record["selected_model"] = model
    _save_record(record)


def stream_response(model, input_text, instructions):
    if not isinstance(model, str) or not model.strip():
        raise ChatGPTAuthError("เลือกรุ่นโมเดล ChatGPT ก่อน")
    with _refresh_lock:
        record = _load_record()
        if not record or "chatgpt.tokens.use.direct" not in record.get("scopes", []):
            raise ChatGPTAuthError("เชื่อมต่อบัญชี ChatGPT ที่อนุญาตให้ใช้ plan ก่อน")
        if model != record.get("selected_model"):
            raise ChatGPTAuthError("เลือกรุ่นโมเดลจากรายการบัญชี ChatGPT ก่อนส่งคำขอ")
        token = _access_token(record)
    payload = json.dumps({
        "model": model,
        "instructions": instructions,
        "input": [{"role": "user", "content": input_text}],
        "store": False,
        "stream": True,
    }, ensure_ascii=False).encode("utf-8")
    request = Request(f"{API_BASE}/responses", data=payload, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }, method="POST")
    try:
        with urlopen(request, timeout=60) as response:
            output = []
            output_size = 0
            stream_size = 0
            completed = False
            for line in response:
                stream_size += len(line)
                if stream_size > 1_000_000:
                    raise ChatGPTAuthError("ChatGPT stream exceeds the 1 MB limit")
                if not line.startswith(b"data:"):
                    continue
                raw = line[5:].strip()
                if not raw or raw == b"[DONE]":
                    continue
                event = json.loads(raw.decode("utf-8"))
                if not isinstance(event, dict):
                    raise ChatGPTAuthError("ChatGPT stream returned an invalid event")
                event_type = event.get("type")
                if event_type == "response.output_text.delta":
                    delta = event.get("delta", "")
                    if not isinstance(delta, str):
                        raise ChatGPTAuthError("ChatGPT stream returned invalid text")
                    output_size += len(delta.encode("utf-8"))
                    if output_size > 256_000:
                        raise ChatGPTAuthError("ChatGPT plan exceeds the 256 KB limit")
                    output.append(delta)
                elif event_type == "response.failed":
                    failure = (event.get("response") or {}).get("error") or {}
                    raise ChatGPTAuthError(f"ChatGPT request failed: {failure.get('code', 'unknown_error')}")
                elif event_type == "response.completed":
                    completed = True
            if not completed:
                raise ChatGPTAuthError("ChatGPT stream จบก่อน response.completed")
            return "".join(output)
    except HTTPError as error:
        raise ChatGPTAuthError(f"ChatGPT API ตอบกลับ HTTP {error.code}") from error
    except (URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ChatGPTAuthError(f"ChatGPT request ไม่สำเร็จ: {type(error).__name__}") from error


def sign_out():
    record = _load_record()
    if not record:
        return
    discovery = _openid_config()
    endpoint = discovery.get("revocation_endpoint")
    if endpoint and record.get("refresh_token"):
        form = urlencode({
            "token": record["refresh_token"],
            "token_type_hint": "refresh_token",
            "client_id": record["client_id"],
        }).encode("ascii")
        try:
            _json_request(endpoint, data=form, headers={"Content-Type": "application/x-www-form-urlencoded"})
        except ChatGPTAuthError:
            # Local credentials are still deleted even if the remote revoke endpoint is unavailable.
            pass
    _clear_record()


def _allowed_origins():
    configured = os.environ.get("CONSTRUCTFLOW_AI_ALLOWED_ORIGINS", "").strip()
    if configured:
        return {origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()}
    return {"http://localhost:5183", "http://127.0.0.1:5183", "http://localhost:5184", "http://127.0.0.1:5184"}


def _http_port():
    return int(os.environ.get("CONSTRUCTFLOW_HTTP_PORT", "8000"))
