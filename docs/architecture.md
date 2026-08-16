# MVP 1 architecture

## Major components

```text
React UI + Zustand projection
          │ user actions / immutable snapshots
SimulationSession (lifecycle, fixed-step scheduling, recovery)
          ├─────────────── pure calls ──────────────► simulation domain
          └──────────── postMessage ────────────────► Pyodide Web Worker
                                                            │
                                           Python initialize(mission) / update(readings)
```

- `src/domain/simulation`: pure immutable models, validation, sensor generation, differential-drive integration, lifecycle primitives, and result creation. It has no browser, React, worker, or renderer dependency.
- `src/features/simulation/SimulationSession`: the authoritative runtime coordinator. It owns the active simulation state, uses requestAnimationFrame only to schedule fixed simulation ticks, serializes controller calls, and publishes throttled UI snapshots.
- `src/workers`: the versioned request/response protocol, `WorkerClient`, and Pyodide worker. The worker is the only code that imports/runs Pyodide.
- `src/components` are UI-only. Canvas 2D and Three.js 3D are projections of immutable state and cannot change physics.
- Zustand stores serializable editor, speed, and view snapshots. The session object itself remains outside the store to avoid high-frequency and imperative state in React.

## Simulation boundary

The world uses meters, +x east, +y north, and radians internally. Heading zero points along +x and positive rotation is counterclockwise. A fixed 0.02 second timestep advances a two-wheel differential-drive model using validated normalized wheel commands in `[-1, 1]`.

At each tick the session creates a raw `Readings` frame: WGS84-style GPS latitude/longitude, compass heading, and signed wheel-encoder totals/deltas. It supplies only that frame to Python, requests exactly one command, validates the response again at the simulation boundary, integrates physics, records a path point, and evaluates target/time-limit termination. The simulator may still calculate true pose and target distance/bearing for map rendering and UI telemetry, but those values never cross the Python boundary. The physics result is deterministic for a fixed scenario and command sequence. Rendering rate and selected simulation speed never change `dt`.

## Worker communication and recovery

The protocol is versioned and correlates every initialize, controller-load, and command request by `requestId`. Controller load provides a mission target latitude/longitude/radius; each update provides copied raw GPS, compass, and encoder readings. Python may produce `MotorCommand(left, right)` and captured stdout/stderr only.

Each command has a 150 ms wall-clock deadline. A synchronous Python infinite loop cannot be interrupted within Pyodide, so expiry or Stop terminates the dedicated worker. `WorkerClient` rejects pending work, increments the worker generation, creates a fresh worker, and stale messages are ignored because their request IDs are no longer pending. This preserves UI responsiveness and gives the next run a clean Python module state.

## Lifecycle

`booting_worker → ready → loading_controller → running ⇄ paused → finished`

From `ready`, `finished`, or `setup_error`, a user may also enter `batch_running`. A batch
executes one fresh controller namespace at a time for a bounded integer seed range, then returns
to `ready`; cancellation terminates and recreates the worker before returning to `ready`.
Selected completed trials enter the normal loading/finished path to regenerate their diagnostics.

Mission benchmarks are named, immutable scenario definitions containing the route, target, sensor
profile, seed range, and trial count. Their scoring and short comparison history are React/UI data
only. The session tags a benchmark batch for the UI but does not send benchmark metadata, scores,
or private truth to the worker.

The benchmark suite coordinator invokes those same batches sequentially using each benchmark's
scenario override. It aggregates completed batch results only after a batch finishes, so there is
never more than one Python controller call stream or worker batch in flight. Cancelling the suite
delegates to the existing batch cancellation path, which terminates/recreates the worker and leaves
any completed mission rows available for UI inspection.

Student code may optionally call `report_estimate(latitude_deg, longitude_deg, heading_rad, label)`
inside `update`. The worker validates and returns these records alongside its motor command. The
session stores them next to the raw reading and separate UI-only truth-at-reading value, allowing
the renderer to draw estimate/truth paths and errors without widening Python authority.

`setup_error` represents runtime initialization failure. Reset returns the simulation to `ready`; a successful target, timeout, controller error, controller timeout, or user stop enters `finished`. A terminal state cannot resume directly.

## Important decisions

- Browser-only MVP: persistence, users, and remote execution do not justify a backend yet.
- Canvas 2D and lazy-loaded Monaco favor a clear desktop learning surface over visual realism.
- A basic Three.js view renders the rover, path, target radius, grid, and flat desert plane. It is deliberately visualization-only: there is no 3D terrain or altered physics.
- Pyodide is loaded from a version-pinned CDN in the worker. This keeps the application bundle manageable; offline asset self-hosting is deferred.
- The browser worker is a responsiveness boundary, not a hostile-code security sandbox. Server-side isolation is required before accepting third-party submissions.
- Monte Carlo batches retain only UI-side outcome, distance, and time summaries. Selecting a
  result deterministically reruns the captured source with that trial's seed to obtain a full
  replay trace; raw records and truth state never cross into Python.
- Benchmark score is deterministic: 60 points for target-success rate, 25 for normalized
  final-distance progress, and 15 for successful-arrival time, minus up to 20 points for
  controller errors/timeouts. Results are browser-session-only comparisons, not grades or
  persistent records.
- The mission-results dashboard stores only browser-memory snapshots. Completed benchmark rows
  keep the batch's immutable scenario and controller source strictly for UI replay; selecting a
  row creates a session for that scenario and replays its first seed. This retained replay data,
  score history, suite aggregates, and truth diagnostics are never serialized into the Python API.
