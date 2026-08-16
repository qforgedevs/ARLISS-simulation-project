# Approved MVP 1 implementation plan

This file is the source of truth for the approved MVP 1 implementation. It preserves the approved milestone sequence and links to the detailed design contracts in `docs/architecture/` and `docs/product/`.

## Scope and architecture

Build a browser-only, desktop-first navigation laboratory. Use React, TypeScript, Vite, Canvas 2D, an optional basic Three.js 3D visualization, Zustand, Vitest, Playwright, and Pyodide in a dedicated Web Worker. The pure TypeScript simulation engine is authoritative; student Python receives immutable raw GPS, compass, and wheel-encoder readings plus a mission target coordinate, then returns only validated normalized left/right motor commands. True rover pose and direct target distance/bearing stay inside the simulator. Include deterministic seeded GPS/compass/encoder profile settings for noise, bias, sample rate, and dropouts. Do not add a backend, authentication, persistence, 3D terrain physics, terrain, obstacles, barometer, energy modeling, or cloud execution.

Detailed contracts:

- `docs/product/mvp1-scope.md`
- `docs/architecture/system-architecture.md`
- `docs/architecture/simulation-model.md`
- `docs/architecture/student-python-api.md`
- `docs/architecture/worker-protocol.md`

## Delivery sequence

| Milestone                          | Deliverable                                                                                                  | Acceptance criteria                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Foundation                      | Vite React/TS project, lint/format, Vitest/Playwright harness, domain folders                                | `npm test` and a smoke browser test run locally; no simulator behavior yet.                                                                                       |
| 1. Deterministic vertical slice    | Canvas map, pure core, test-only command fixture, start/pause/step/reset, target outcome                     | Rover follows a reproducible path; step advances one `dt`; pause advances none; reset restores exact initial state; entering radius ends `target_reached`.        |
| 2. Session UX and observability    | Zustand session orchestration, run/resume/stop/speed, telemetry/path/result panels, configuration validation | Each control obeys lifecycle rules; telemetry/path agree with core; time limit and user stop produce explicit results; UI remains responsive at supported speeds. |
| 3. Python worker integration       | Lazy Pyodide worker, API prelude, Monaco editor, console/error output, timeout/recovery                      | Valid Python controls rover; syntax/runtime/invalid-return errors are clear; infinite loop ends by deadline without freezing UI; next run works after recovery.   |
| 4. Hardening and release readiness | Scenario/editor polish, accessibility pass, e2e coverage, documentation and browser performance checks       | An authored student controller succeeds; key workflows pass in supported browsers; no known lifecycle race or test flake; planning/usage docs are accurate.       |

## Mandatory implementation requirements

1. Use strict TypeScript and keep the simulation core free of React, DOM, rendering, clocks, and worker dependencies.
2. Implement deterministic fixed-step differential-drive physics, ideal sensors, command/configuration validation, target success, timeout, and stopped/controller-error outcomes.
3. Run Pyodide only in a dedicated worker. Correlate versioned typed messages, reject stale responses, capture output/errors, and use worker termination/recreation as the stop/timeout recovery mechanism.
4. Provide an editor, map with rover/heading/target/radius/path, run/pause/resume/step/stop/reset/speed controls, telemetry, console, and result UI.
5. Add unit, integration, and browser end-to-end coverage. Verify formatting, linting, typing, tests, and production build before completion.

## Deferrals

PWA/offline support, scenarios persistence/import, additional sensor models/fault modes, energy, terrain/obstacles, large-scale Monte Carlo campaigns, student accounts/teams, assignments, competitions, collaboration, 3D terrain, landing phases, and hardware integration are post-MVP work.
