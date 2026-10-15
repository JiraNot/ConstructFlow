# Deploy ConstructFlow with Coolify

The repository root contains the Coolify Compose application. Select the `web`
service and set its exposed port to `80`; TLS and the public domain are managed by
Coolify's proxy. The web image builds the local TypeScript packages and serves the
Plan Editor as a static single-page app with the isolation and security headers it
needs.

## Web editor only

Deploy `compose.yaml` as a Docker Compose application. No provider key or AI
credentials are needed for the editor itself. The editor is served at the domain
assigned to the `web` service.

## Enable the AI gateway

The gateway is opt-in through the `ai` Compose profile. In Coolify, enable the
`ai` profile for the Compose deployment and configure these runtime variables:

- `OPENAI_API_KEY`: provider secret.
- `CONSTRUCTFLOW_AI_TOKEN`: private random token with at least 32 characters.
- `CONSTRUCTFLOW_AI_ALLOWED_ORIGINS`: exact public editor origin, such as
  `https://constructflow.example.com`, with no trailing path or wildcard.
- Optionally `CONSTRUCTFLOW_AI_MODEL` and `CONSTRUCTFLOW_AI_BASE_URL`.

The gateway is only exposed on the internal Compose network. Nginx proxies
`/api/ai/plan` to it over that network, preserving the editor's same-origin
request and CSP. Enter the configured bearer token in the editor's AI panel. Do
not publish port 8000 directly.

## Persistence and project files

Project files are saved or opened by the browser on the user's device. The
container does not store project documents. Back up any server-side Coolify
environment secrets through Coolify's normal secret management.

The Compose health check covers the static web server. When enabled, the gateway
also checks its HTTP status endpoint. Coolify should route public traffic only to
`web:80`.
