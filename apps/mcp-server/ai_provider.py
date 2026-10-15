"""Provider-neutral HTTP gateway for structured ConstructFlow AI command plans."""

import json
import os
from ipaddress import ip_address
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MAX_PROMPT_LENGTH = 8_000
MAX_CONTEXT_BYTES = 96_000
MAX_COMMANDS = 100
MAX_PROVIDER_RESPONSE_BYTES = 1_000_000


class AIPlanError(ValueError):
    pass


class AIProviderError(AIPlanError):
    """Provider transport/response failure safe to classify as an upstream error."""


def generate_command_plan(data, *, chatgpt_model=None):
    prompt = data.get("prompt")
    context = data.get("project_context")
    descriptors = data.get("command_descriptors")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > MAX_PROMPT_LENGTH:
        raise AIPlanError("prompt is required and must be at most 8000 characters")
    if not isinstance(context, dict) or len(json.dumps(context, ensure_ascii=False).encode("utf-8")) > MAX_CONTEXT_BYTES:
        raise AIPlanError("project_context must be a bounded object")
    if not isinstance(descriptors, list) or not descriptors or len(descriptors) > 250:
        raise AIPlanError("command_descriptors must contain 1-250 registered commands")
    allowed = {}
    for descriptor in descriptors:
        if not isinstance(descriptor, dict) or descriptor.get("ai_allowed") is not True:
            continue
        name = descriptor.get("name")
        schema = descriptor.get("input_schema")
        if not isinstance(name, str) or not isinstance(schema, dict) or schema.get("type") != "object":
            continue
        allowed[name] = descriptor
    if not allowed:
        raise AIPlanError("No AI-eligible command descriptors were supplied")

    instruction = (
        "You are ConstructFlow's BIM authoring planner. Return only a JSON object with keys "
        "summary (string), questions (array of strings), and commands (array of {name,input}). "
        "Use only command names in the supplied AI-eligible command descriptors and follow their input schemas. "
        "Command coordinates and dimensions are millimetres. Use only supplied project UUIDs and catalog type IDs. "
        "Never invent survey measurements, levels, hosts, or object IDs. If required information is missing or ambiguous, "
        "return questions and an empty commands array. Do not claim structural, legal, or permit approval. "
        "All proposed commands will be previewed and validated before the user confirms execution."
    )
    user_input = json.dumps({
        "request": prompt.strip(),
        "project_context": context,
        "ai_command_descriptors": list(allowed.values()),
    }, ensure_ascii=False)

    if chatgpt_model:
        import chatgpt_auth
        try:
            content = chatgpt_auth.stream_response(chatgpt_model, user_input, instruction)
            plan = json.loads(content)
        except Exception as error:
            if isinstance(error, chatgpt_auth.ChatGPTAuthError):
                raise AIProviderError(str(error)) from error
            raise AIProviderError("ChatGPT returned an invalid command plan") from error
    else:
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise AIPlanError("Set OPENAI_API_KEY on the ConstructFlow AI gateway")
        base_url = os.environ.get("CONSTRUCTFLOW_AI_BASE_URL", "https://api.openai.com/v1/chat/completions").strip()
        model = os.environ.get("CONSTRUCTFLOW_AI_MODEL", "gpt-4o-mini").strip()
        parsed_url = urlparse(base_url)
        if parsed_url.scheme not in {"https", "http"} or not parsed_url.netloc or parsed_url.username or parsed_url.password or parsed_url.fragment:
            raise AIPlanError("CONSTRUCTFLOW_AI_BASE_URL must be a valid HTTPS provider endpoint")
        provider_host = (parsed_url.hostname or "").lower()
        try:
            provider_is_loopback = ip_address(provider_host).is_loopback
        except ValueError:
            provider_is_loopback = provider_host == "localhost"
        if parsed_url.scheme != "https" and not provider_is_loopback:
            raise AIPlanError("CONSTRUCTFLOW_AI_BASE_URL must use HTTPS except for a loopback test provider")
        if not model or len(model) > 200:
            raise AIPlanError("CONSTRUCTFLOW_AI_MODEL must contain 1-200 characters")
        request_payload = {
            "model": model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": instruction},
                {"role": "user", "content": user_input},
            ],
        }
        request = Request(
            base_url,
            data=json.dumps(request_payload, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=45) as response:
                raw_response = response.read(MAX_PROVIDER_RESPONSE_BYTES + 1)
                if len(raw_response) > MAX_PROVIDER_RESPONSE_BYTES:
                    raise AIProviderError("AI provider response exceeds the 1 MB limit")
                provider_response = json.loads(raw_response.decode("utf-8"))
        except HTTPError as error:
            raise AIProviderError(f"AI provider returned HTTP {error.code}") from error
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise AIProviderError(f"AI provider request failed: {type(error).__name__}") from error
        try:
            content = provider_response["choices"][0]["message"]["content"]
            plan = json.loads(content)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
            raise AIProviderError("AI provider returned an invalid command plan") from error
    if not isinstance(plan, dict):
        raise AIProviderError("AI provider response must be an object")
    commands = plan.get("commands", [])
    questions = plan.get("questions", [])
    if not isinstance(commands, list) or len(commands) > MAX_COMMANDS:
        raise AIProviderError("AI provider returned too many commands")
    if not isinstance(questions, list) or any(not isinstance(question, str) for question in questions):
        raise AIProviderError("AI provider returned invalid questions")
    validated = []
    for command in commands:
        if not isinstance(command, dict) or command.get("name") not in allowed or not isinstance(command.get("input"), dict):
            raise AIProviderError("AI provider included an unregistered command or invalid input")
        validated.append({"name": command["name"], "input": command["input"]})
    return {
        "summary": str(plan.get("summary", "แผนคำสั่งพร้อมตรวจสอบ"))[:2_000],
        "questions": questions[:20],
        "commands": validated,
    }
