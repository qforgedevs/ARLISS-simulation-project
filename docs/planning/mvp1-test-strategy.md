# MVP 1 test strategy

## Test pyramid

| Layer                                          | Scope                                        | Examples                                                                                                                                             |
| ---------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)                                  | Pure core and protocol validation            | kinematics, seeded sensor sampling/holding/dropouts, run-record construction, target/time termination, config/command validation, lifecycle reducer. |
| Integration (Vitest + worker test environment) | Session, scheduler abstraction, WorkerClient | ordered messages, stale responses, Python error mapping, deadline/termination/recreation, console limits.                                            |
| Component                                      | React/Canvas control wiring                  | disabled controls, telemetry/result presentation, reset behavior, error states.                                                                      |
| End-to-end (Playwright)                        | Browser user workflows                       | starter controller reaches goal; pause/step/reset; Python syntax/runtime timeout errors; rerun after failure.                                        |
| Manual/performance                             | Real browser capability                      | Pyodide/Monaco startup, responsive canvas, worker recovery, Chromium/Firefox/Safari checks.                                                          |

## Deterministic fixtures

Keep one small scenario and named commands/controllers in test fixtures. Assert values with an appropriate floating-point tolerance, except reset/replay snapshots within the same runtime, which should be exact. Do not make e2e tests depend on animation timing: expose controlled stepping or wait for explicit lifecycle/result UI state.

## Essential cases

- Zero, straight, in-place-turn, and curved motion; heading wrap at +/-pi.
- Distance/bearing calculation, target-radius inclusivity, initial-at-target, and exact time-limit boundary.
- Scenario rejects NaN, invalid bounds, and non-positive physical parameters; command rejects invalid numbers/ranges.
- Paused simulation does not advance; step advances exactly one tick; reset clears path/result and controller state; a terminal run cannot resume.
- Speed changes scheduler throughput, not `dt` or resulting per-tick physics.
- Identical seed, profile, and command sequence produce equal raw sensor frames; a different seed changes the noisy sequence.
- GPS validity, held compass/encoder samples, encoder zero deltas during dropout, and configured sample-rate boundaries are deterministic.
- A recorded tick contains the exact raw frame provided to Python, accepted motor command, resulting UI-only truth state, and deterministic fresh/held/dropped status; none crosses the worker boundary.
- Student estimator reports are validated at the worker boundary, stored against truth at the raw
  reading instant, and produce deterministic position/heading error summaries without exposing
  truth to Python. Browser coverage exercises valid and invalid Pyodide reports.
- Batch utilities preserve seed isolation, derive success/distance/time statistics correctly, and append trial summaries immutably. Browser coverage exercises progress, replay selection, and cancellation.
- Benchmark scoring is deterministic for fixed batch trial records and exercises success,
  final-distance progress, elapsed-time efficiency, and controller-failure penalty terms. Browser
  coverage loads a fixed mission, runs its batch, and displays its comparison row.
- Suite aggregation derives its overall report from completed mission batches only. Browser coverage
  runs all fixed missions sequentially, renders per-mission/overall results, and cancels an
  in-flight suite without freezing the UI.
- Dashboard metric fixtures derive score, success, distance, time, failures, and localization
  error from immutable completed batches. Browser coverage labels two benchmark runs, compares
  them, and uses a specific retained row to restore its original scenario/source and replay its
  first trial. The dashboard is verified to use browser-session memory only.
- Worker handles load success, missing `update`, syntax error, runtime exception, bad return, stale response, output cap, timeout, termination, and successful recreation.
- UI never freezes under the intentional infinite-loop fixture; the terminal reason explains the deadline.

## Quality gates

Every pull request runs formatting/lint, typecheck, unit/integration tests, build, and relevant Playwright tests. Treat deterministic-core coverage as a release gate; target near-complete branch coverage there rather than an arbitrary project-wide percentage. Quarantine no flaky simulation tests: fix timing/control seams instead.

## Security-testing boundary

Test the stated authority contract (no supported mutation pathway) and responsiveness recovery. Do not claim the browser worker is a hostile-code sandbox. Add security review and server isolation testing only when executing third-party submissions or adding a backend.
