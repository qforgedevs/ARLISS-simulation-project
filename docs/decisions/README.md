# Architecture decision records

Record decisions that are costly to reverse, affect public contracts, or constrain safety/performance. Use one Markdown file per accepted decision under this directory, named `NNNN-short-title.md`.

Suggested format:

```md
# ADR NNNN: Title

Status: Proposed | Accepted | Superseded
Date: YYYY-MM-DD

## Context

## Decision

## Consequences

## Alternatives considered
```

## ADRs to create before or during implementation

1. Client-only architecture for MVP 1; no backend/authentication.
2. Fixed-timestep deterministic differential-drive integration and coordinate conventions.
3. Simulation core is authoritative and pure TypeScript; controller boundary is commands only.
4. Pyodide executes in one dedicated worker and timeouts recover through worker termination/recreation.
5. Student API: module-level `initialize(Mission)` and `update(Readings) -> MotorCommand`, units, validation, and state lifetime.
6. Worker protocol versioning, serialization, console/error limits, and command ordering.
7. Canvas 2D for MVP visualization and lazy-loaded Monaco editor.
8. Browser support, deployment/asset hosting, and Pyodide version pinning once selected.

Do not create ADRs for routine file names, transient package versions, or implementation details that do not establish a lasting constraint.
