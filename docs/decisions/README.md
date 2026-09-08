# Architecture Decision Records

Accepted ADRs are binding amendments/explanations of the ConstructFlow architecture baseline.

Current records:

- `ADR-0001-modular-monolith.md` — modular monolith with plugin-style domain modules.
- `ADR-0002-ai-command-boundary.md` — AI uses registered commands and cannot bypass domain mutation rules.
- `ADR-0003-single-model-lifecycle.md` — one semantic model for Existing/Demolition/New.
- `ADR-0004-domain-owned-derived-output.md` — domain modules own semantics; platform services aggregate providers.
- `ADR-0005-docs-as-single-source-of-truth.md` — `docs/` is authoritative.

New cross-module breaking decisions should be recorded as the next sequential ADR rather than hidden inside implementation commits.