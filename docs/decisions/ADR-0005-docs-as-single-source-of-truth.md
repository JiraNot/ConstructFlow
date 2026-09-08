# ADR-0005 — `docs/` Is the Authoritative Product and Engineering Source of Truth

Status: Accepted  
Date: 2026-09-08

## Context

ConstructFlow's architecture and product scope originated through iterative design discussions. As implementation grows and multiple coding agents/developers contribute, decisions cannot remain scattered across chat history, issues, comments or source code conventions.

## Decision

The `docs/` directory is the authoritative source of truth for product scope, architecture contracts, module ownership, workflows, acceptance criteria and architecture decisions.

Precedence is defined in `docs/README.md`.

Implementation that changes a documented contract must update the relevant specification or add an ADR in the same pull request.

## Consequences

Positive:

- coding agents can start from repository context instead of private chat history;
- architecture drift becomes reviewable in Git;
- module boundaries and acceptance criteria remain traceable;
- future maintainers can understand why contracts exist.

Costs:

- documentation must be maintained with code;
- some implementation PRs become slightly larger because specs/tests change together;
- stale documentation is treated as a defect.

## Rule

No hidden architecture: a decision important enough to constrain future implementation must be represented in `docs/`, not only in a conversation, issue thread or code comment.