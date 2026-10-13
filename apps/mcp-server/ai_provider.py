"""Provider-neutral HTTP gateway for structured ConstructFlow AI command plans."""

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MAX_PROMPT_LENGTH = 8_000
MAX_CONTEXT_BYTES = 96_000
MAX_COMMANDS = 100


class AIPlanError(ValueError):
    pass


def generate_command_plan(data):
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

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise AIPlanError("Set OPENAI_API_KEY on the ConstructFlow AI gateway")
    base_url = os.environ.get("CONSTRUCTFLOW_AI_BASE_URL", "https://api.openai.com/v1/chat/completions").strip()
    model = os.environ.get("CONSTRUCTFLOW_AI_MODEL", "gpt-4o-mini").strip()
    request_payload = {
        "model": model,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are ConstructFlow's BIM authoring planner. Return only a JSON object with keys "
                    "summary (string), questions (array of strings), and commands (array of {name,input}). "
                    "Use only command names in the supplied AI-eligible command descriptors and follow their input schemas. "
                    "Command coordinates and dimensions are millimetres. Use only supplied project UUIDs and catalog type IDs. "
                    "Never invent survey measurements, levels, hosts, or object IDs. If required information is missing or ambiguous, "
                    "return questions and an empty commands array. Do not claim structural, legal, or permit approval. "
                    "All proposed commands will be previewed and validated before the user confirms execution."
                ),
            },
            {
                "role": "user",
                "content": json.dumps({
                    "request": prompt.strip(),
                    "project_context": context,
                    "ai_command_descriptors": list(allowed.values()),
                }, ensure_ascii=False),
            },
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
            provider_response = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise AIPlanError(f"AI provider returned HTTP {error.code}: {detail}") from error
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise AIPlanError(f"AI provider request failed: {error}") from error

    try:
        content = provider_response["choices"][0]["message"]["content"]
        plan = json.loads(content)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise AIPlanError("AI provider returned an invalid command plan") from error
    if not isinstance(plan, dict):
        raise AIPlanError("AI provider response must be an object")
    commands = plan.get("commands", [])
    questions = plan.get("questions", [])
    if not isinstance(commands, list) or len(commands) > MAX_COMMANDS:
        raise AIPlanError("AI plan must contain at most 100 commands")
    if not isinstance(questions, list) or any(not isinstance(question, str) for question in questions):
        raise AIPlanError("AI plan questions must be strings")
    validated = []
    for command in commands:
        if not isinstance(command, dict) or command.get("name") not in allowed or not isinstance(command.get("input"), dict):
            raise AIPlanError("AI plan included an unregistered command or invalid input")
        validated.append({"name": command["name"], "input": command["input"]})
    return {
        "summary": str(plan.get("summary", "แผนคำสั่งพร้อมตรวจสอบ"))[:2_000],
        "questions": questions[:20],
        "commands": validated,
    }
