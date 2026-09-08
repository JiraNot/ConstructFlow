# AI Orchestration Module

Status: Proposed v1  
Module ID: `constructflow.ai`

## Mission

Interpret user intent, search catalogs, propose options and orchestrate registered ConstructFlow commands without owning production geometry or bypassing domain rules.

## Dependencies

Required:

- Core command/capability registries;
- AI orchestration architecture contract.

Optional:

- Library search;
- QA summaries;
- Quantity/Drawing status;
- provider adapters.

## Owns

- AIProviderAdapter
- IntentPlan
- CommandProposal
- AIActionAudit metadata
- Conversation/session-local orchestration state where needed

It does not own domain smart objects such as Roof, Wall, Pipe or Cabinet.

## Commands

AI generally invokes commands owned by other modules. AI-specific platform commands may include:

- `InterpretIntent`
- `SearchCompatibleAssets`
- `ProposeCommandPlan`
- `CompareScenarioOptions`

These do not bypass target-domain commands.

## Provider abstraction

Provider adapters may support OpenAI, Gemini, Claude or future providers. Domain modules remain provider-independent.

## Confirmation

Destructive or high-impact domain commands obey their registered confirmation policy. AI cannot suppress it.

## Uncertainty

AI preserves Assumed/Unknown/Verify On Site and preliminary engineering states. Missing hidden construction facts are not fabricated.

## Audit

AI-originated domain commands record actor kind `ai` and correlation metadata where useful.

## Acceptance criteria

- AC-AI-001: UI and AI invocation of the same domain command reach the same validator/executor path.
- AC-AI-002: AI cannot invoke a command with `ai_allowed=false`.
- AC-AI-003: destructive command requiring confirmation is not auto-committed without confirmation.
- AC-AI-004: AI provider can be changed without modifying domain modules.
- AC-AI-005: AI unavailable does not prevent deterministic project modeling/editing/reopen.

See `../architecture/AI-ORCHESTRATION.md` and ADR-0002 for binding boundaries.