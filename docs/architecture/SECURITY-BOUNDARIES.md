# Safety, Trust and Security Boundaries

Status: Accepted foundation contract.

## External data

Catalogs, imported files, URLs and AI-generated structured inputs are untrusted until validated. They must not execute arbitrary Ruby/JavaScript merely because metadata was imported.

## Module trust

A module can mutate only its owned domain state and registered public capabilities. Module loading validates manifest/version/dependencies before activation.

## Destructive operations

Demolition, replacement, deletion, schema migration and bulk type swaps with geometry consequences require explicit command semantics and appropriate confirmation/preview.

## Engineering boundary

ConstructFlow can model structural systems, reinforcement and constructability checks, but must not present unverified generated structural design as licensed engineering approval.

## Site certainty

AI/generators must not fabricate unknown existing utility positions, invert levels, reinforcement or hidden construction. Use Assumed/Unknown/Verify On Site.

## AI boundary

AI cannot directly mutate private domain data or production geometry. See `AI-ORCHESTRATION.md` and ADR-0002.

## Project integrity

A failed external service, catalog or optional module should not silently destroy project-local semantic data.

## Logs/diagnostics

Developer/support diagnostics may expose object IDs, commands/events and schema state but should avoid storing unrelated sensitive external credentials in model metadata or logs.

## Future cloud services

Authentication, authorization, tenant isolation and secret storage for future cloud/library collaboration require dedicated security design before implementation. The SketchUp extension must not embed long-lived provider secrets in project files.