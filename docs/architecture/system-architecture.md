# System architecture

## Recommendation

Adopt the proposed React + TypeScript + Vite + Canvas 2D + Zustand + Vitest + Playwright stack. It is the smallest practical browser stack for this MVP. Use Pyodide in a dedicated module worker with a narrow message protocol. A lazy-loaded Three.js 3D view may render the same simulation state, but it must not introduce 3D physics. Do **not** introduce a backend, a separate physics engine, or a state-machine library in MVP 1.

Monaco is acceptable and familiar, though its bundle/startup cost is material. Load it lazily after the shell and map are interactive; a lighter editor can be substituted later without affecting the controller protocol. PWA support is deferred.

## Boundaries

```text
React UI ── commands/events ── SimulationSession ── pure calls ── Simulation core
  │                                  │                                  │
  │                                  └── WorkerClient ── postMessage ── Pyodide worker
  │                                                                     │
  └── Zustand (UI/session projection)                                  └── student controller
```

### React UI

Owns layout, interactions, rendering, and user-visible diagnostics. Components include `EditorPane`, `ScenarioPanel`, `MissionBenchmarkPanel`, `BenchmarkSuitePanel`, `MonteCarloPanel`, `MapCanvas`, `SimulationControls`, `TelemetryPanel`, `ConsolePanel`, and `RunResultPanel`. Canvas receives immutable render snapshots; it never mutates physics state. Changing a scenario profile or benchmark recreates the session with its selected deterministic configuration. Benchmark result comparison and suite reports remain browser-session UI state.

### Zustand store

Owns serializable application/session view state: editor text, selected speed, lifecycle phase, render snapshot, console entries, worker readiness, and result. Keep high-frequency simulation internals out of React subscriptions; publish snapshots at a bounded display cadence.

### SimulationSession orchestrator

Owns the runtime loop and lifecycle transition enforcement. On each logical tick it captures the raw controller input, obtains one command, validates it, advances the pure core exactly once, records the command/result pair for UI-only replay, checks termination, emits telemetry, and schedules rendering. It also runs bounded Monte Carlo trials sequentially with fresh controller namespaces and supports worker-backed cancellation. It is the sole writer of simulation state.

### Simulation core

Pure TypeScript domain module with no DOM, clocks, workers, or Zustand dependency. Given prior state, scenario, and validated command, it returns next state and telemetry deterministically. Its private sensor-runtime state samples GPS, compass, and encoders using seeded profile settings, then reduces them to the public raw frame. This makes physics and sensor behavior testable and enables later headless/Monte Carlo adapters.

### WorkerClient and Pyodide worker

`WorkerClient` correlates requests, applies wall-clock deadlines, surfaces structured errors, and terminates/recreates a stuck worker. The worker loads Pyodide, installs a small Python adapter, captures supported output, calls `initialize(mission)` once and `update(readings)` per tick, and returns JSON-compatible data. Student code has no protocol object, DOM access, or reference to simulation state.

## Runtime loop

Use requestAnimationFrame only as a scheduler. Accumulate real elapsed time and execute zero or more fixed `dt` ticks subject to a maximum catch-up budget; speed changes scale the accumulator. A single-step executes exactly one `dt` tick. The authoritative timestamp is simulation time, never wall time.

For MVP simplicity, controller calls are sequential: the next simulation tick does not begin until the command response is received. At normal speed, the loop can await the worker call. If it misses its deadline, end the run; never silently reuse a prior command. This preserves deterministic state transitions given the same code/scenario and avoids unbounded command queues.

## Simulation lifecycle

Use an explicit discriminated lifecycle value in the session/store; no additional state-machine dependency is needed.

```text
booting_worker → ready → loading_controller → running ⇄ paused
                              │                  │        │
                              └─ setup_error     ├─ step ─┘
                                                 ├─ stop → finished
                                                 └─ outcome/error → finished
ready | paused | finished | setup_error ── reset ──→ ready
finished | setup_error ── rerun ──→ loading_controller
```

`booting_worker` is UI-visible while Pyodide initializes. `loading_controller` compiles student source and creates fresh module globals. `running` permits scheduled ticks; `paused` permits a single tick and resume but no automatic advancement. `finished` always includes one immutable `RunResult`; terminal states never transition back to running without reset/rerun. `setup_error` represents invalid scenario or worker initialization/load failure before a run. User Stop during an outstanding call cancels it by invalidating its request, optionally terminates the worker, and records `stopped_by_user`; a late worker response is ignored.

## Recommended initial repository structure

```text
src/
  app/                 # App shell, providers, routing-free composition
  components/          # Editor, controls, telemetry, console, result panels
  features/simulation/ # SimulationSession, Zustand store, scheduler, view adapters
  domain/
    simulation/        # Pure models, kinematics, sensors, termination, validation
  workers/             # WorkerClient, protocol types, Pyodide worker entry/prelude
  rendering/           # Canvas coordinate transform and map renderer
  scenarios/           # Default scenario and fixtures
  test/                # Shared test helpers/fixtures
docs/
e2e/                   # Playwright specifications
public/                # Static assets (including pinned Pyodide assets if self-hosted)
```

Prefer co-locating unit tests beside pure modules and component tests beside components; keep only shared fixtures under `src/test`. Do not create generic `utils`, `services`, or a backend-shaped API layer until a concrete dependency needs one.

## Future-compatible extension points

- `Sensor profile`: produces seeded raw measurements from state and scenario; future models can add latency, calibration, or new devices without widening the Python authority boundary.
- `TerminationRule`: evaluates result conditions.
- `TerrainModel`: initially flat/no-op; later provides surface effects.
- `Controller`: worker-backed student controller with a narrow raw-sensor/command contract.
- `RunRecorder`: an in-memory deterministic trace for timeline diagnostics; optional future export/persistence remains separate from live physics.

## Authority and safety model

The browser user ultimately controls their own tab; MVP 1 does not claim adversarial code security. The simulator nevertheless protects educational correctness and responsiveness: only validated numeric motor commands cross the worker boundary, Python gets a copied sensor snapshot, calls have deadlines, and worker recovery clears corrupted runtime state. Server-side isolation is required before executing submitted code on behalf of others.
