# MVP 1 implementation plan

## Delivery sequence

| Milestone                          | Deliverable                                                                                                  | Acceptance criteria                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Foundation                      | Vite React/TS project, lint/format, Vitest/Playwright harness, domain folders                                | `npm test` and a smoke browser test run locally; no simulator behavior yet.                                                                                       |
| 1. Deterministic vertical slice    | Canvas map, pure core, test-only command fixture, start/pause/step/reset, target outcome                     | Rover follows a reproducible path; step advances one `dt`; pause advances none; reset restores exact initial state; entering radius ends `target_reached`.        |
| 2. Session UX and observability    | Zustand session orchestration, run/resume/stop/speed, telemetry/path/result panels, configuration validation | Each control obeys lifecycle rules; telemetry/path agree with core; time limit and user stop produce explicit results; UI remains responsive at supported speeds. |
| 3. Python worker integration       | Lazy Pyodide worker, API prelude, Monaco editor, console/error output, timeout/recovery                      | Valid Python controls rover; syntax/runtime/invalid-return errors are clear; infinite loop ends by deadline without freezing UI; next run works after recovery.   |
| 4. Hardening and release readiness | Scenario/editor polish, accessibility pass, e2e coverage, documentation and browser performance checks       | An authored student controller succeeds; key workflows pass in supported browsers; no known lifecycle race or test flake; planning/usage docs are accurate.       |

## Milestone 0 — foundation

**Deliverables:** Vite React + TypeScript setup; directory structure; strict TypeScript; ESLint/Prettier or equivalent; Vitest; Playwright; CI-ready scripts; baseline app shell.

**Dependencies/risks:** package/version selection and browser-based test runtime. Keep tooling conventional; do not add state, editor, or Pyodide packages prematurely.

**Acceptance:** clean install and scripted unit/e2e smoke test; type check has no errors; production build succeeds.

## Milestone 1 — smallest vertical slice (mandatory)

**Deliverables:** immutable scenario/state models; pure differential-drive core; test-only command fixtures; requestAnimationFrame scheduler; Canvas 2D renderer; controls for start, pause, single step, and reset; target radius success result; focused unit tests.

**Dependencies/risks:** define units and tick/termination ordering before UI. Keep controller interface identical in shape to the later worker-backed controller.

**Acceptance:** tests prove straight, turn, and target boundary behavior; manually stepping produces the same state as one automated tick; two identical resets/runs produce equal sampled states; map shows start, target/radius, rover, heading, and path; target result freezes the run.

## Milestone 2 — controllable lab (mandatory)

**Deliverables:** `SimulationSession`, Zustand projection, resume/stop/speed control, configurable scenario form or fixed editable development config, telemetry/console/result panels, time-limit termination, clear validation errors.

**Dependencies/risks:** retain the core’s DOM-free purity; prevent React from re-rendering for every physics tick.

**Acceptance:** valid lifecycle transitions work; invalid controls are disabled or safely ignored; telemetry distance/bearing matches independently calculated values; time limit and stop outcome are visible and deterministic; rendering remains smooth at planned speed options.

## Milestone 3 — browser Python (mandatory)

**Deliverables:** protocol types, WorkerClient, dedicated Pyodide module worker, Python prelude/API, lazy Monaco integration, stdout/stderr console handling, deadline termination/recreation, Python unit/integration fixtures.

**Dependencies/risks:** Pyodide asset hosting/version pinning, large initial download, browser worker compatibility, and PyProxy cleanup. Prototype loading and worker termination before polishing the editor.

**Acceptance:** an authored `initialize`/`update` controller reaches the target; source compilation is fresh for every run; traceback points to learner code where possible; intentionally infinite code triggers timeout without main-thread freeze; worker becomes usable after recreation; invalid commands do not change rover state.

## Milestone 4 — hardening (mandatory before public MVP)

**Deliverables:** empty/loading/error states, an API-only starter scaffold, keyboard/accessible controls, browser matrix, performance diagnostics, documented run limitations, complete test suite.

**Dependencies/risks:** cross-browser Pyodide and Monaco behavior, test runtime cost, asset caching.

**Acceptance:** core flows pass Playwright tests; visual/manual browser checks on the supported matrix; all terminal results are understandable; a new user can locate the sensor API and author a controller from the starter scaffold; bundle/startup behavior is measured and documented.

## Optional after MVP 1

- Additional sensor-fault models and large-scale/persistent Monte Carlo campaigns.
- Energy, obstacles, terrain interaction, collision/boundary policies.
- Scenario import/export and local persistence; PWA/offline support.
- Lesson/assignment content, accounts, teams, backend execution, and competition features.
- Interactive 3D terrain, landing phases, hardware-in-the-loop.

## Cross-cutting implementation rules

Use small commits per milestone; document public types; add tests alongside every core behavior; maintain a deterministic fixture scenario. No backend is justified until persistence, multi-user workflows, or trusted remote execution becomes a real requirement.
