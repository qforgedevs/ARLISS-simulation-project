# MVP 1 scope

## Product intent

MVP 1 is an educational navigation laboratory, not a full ARLISS mission recreation. A learner writes `initialize(mission)` and `update(readings)` functions which turn raw sensor measurements into left and right motor commands. They run, inspect, pause, step, reset, and improve the algorithm while seeing why the rover did or did not reach its goal.

## In scope

- A client-only React/TypeScript application, optimized for desktop browsers.
- One deterministic, planar scenario at a time: configurable start pose, target coordinate/radius, map extent, time limit, fixed timestep, and rover parameters.
- Fixed-step two-wheel differential-drive kinematics in TypeScript.
- Raw GPS latitude/longitude, compass heading, wheel-encoder tick totals/deltas, and simulation time readings for student code. Named scenarios provide ideal or seeded noisy/bias/dropout/fixed-rate sensor profiles without changing the student API.
- Optional student-reported latitude/longitude/heading estimates, validated in the worker and stored
  only for UI replay/benchmark diagnostics; ground truth remains simulator-only.
- Deterministic scheduled GPS, compass, and encoder fault windows, observable only through
  UI replay diagnostics after or during a run.
- A mission target latitude/longitude/radius passed once at controller initialization. True local rover pose and calculated target distance/bearing remain simulator-only telemetry.
- A student Python editor and Pyodide execution in a dedicated worker.
- A map with rover pose, heading, start, target/radius, trajectory, and optional coordinate grid.
- Run, pause/resume, single-step, stop, reset, rerun, and simulation-speed controls.
- Current telemetry, console output, Python errors, and an explicit final result.
- Sequential, bounded Monte Carlo batches across seeded sensor-profile trials, with UI-only summary data and deterministic trial replay.
- Named deterministic mission benchmarks with fixed route/sensor/seed configurations, UI-only
  scoring, and browser-session comparison of completed benchmark batches.
- A sequential all-benchmark suite runner with UI-only aggregate/per-mission report cards and
  cancellation through the existing worker recovery path.
- Unit, integration, and end-to-end automated tests.

## Explicit non-goals

- Backend services, authentication, accounts, teams, assignments, competitions, storage, or sharing.
- Networked/cloud execution, collaboration, multiplayer, or server-side code grading.
- Photographic terrain, 3D terrain physics, landing/parachute dynamics, obstacles, soft terrain, or collision physics. A basic presentation-only 3D view is included.
- Battery/energy modeling, barometer/altitude, large-scale or persistent Monte Carlo campaigns, hardware-in-the-loop, or real-hardware interfaces.
- Mobile-first layout, offline PWA packaging, localization, accessibility certification, or a sandbox that treats untrusted code as safe against a hostile user. Browser isolation is an execution-responsiveness boundary, not a security boundary.

## MVP constraints and assumptions

- Modern Chromium, Firefox, and Safari desktop versions are the initial support target; cross-origin isolation is not required.
- A scenario and code exist only for the current browser session in MVP 1. Export/import and persistence are later enhancements.
- Position units are meters, angles are radians internally, time is seconds, and the map uses +x east / +y north with heading zero pointing +x.
- The simulation uses a configurable 50 Hz fixed timestep by default. Rendering may run independently.
- Motor inputs are normalized wheel commands in [-1, 1].
- The default command deadline is intentionally conservative (for example 100 ms wall time) and must be configurable for development; a timeout ends the run and recreates the worker.

## Definition of success

The learner can run a simple controller, see its path and telemetry, identify its terminal outcome, and iteratively correct the controller. A run terminates as `target_reached`, `time_limit_exceeded`, `student_code_error`, `student_code_timeout`, or `stopped_by_user`. Energy is not modeled in MVP 1; its terminal result is reserved for a later capability.

## Deferred extension seams

Scenarios, sensor providers, termination checks, and telemetry are interfaces rather than one-off UI objects. Later capabilities compose through these seams without letting student code own simulation state.
