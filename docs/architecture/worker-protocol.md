# Worker protocol

## Principles

Messages are versioned, JSON-serializable discriminated objects. The UI never sends true simulation state to Python: it sends an immutable raw GPS/compass/encoder `RawSensorFrame` and a mission target coordinate during controller load. Python never returns state, only a command or structured failure. Every call is correlated by `requestId`. Transfer no mutable shared buffers in MVP 1.

## UI/session to worker

```ts
type WorkerRequest =
  | { protocol: 1; type: 'initialize'; requestId: string }
  | { protocol: 1; type: 'loadController'; requestId: string; source: string; mission: Mission }
  | { protocol: 1; type: 'getCommand'; requestId: string; readings: RawSensorFrame };
```

`initialize` loads Pyodide and the fixed Python prelude. `loadController` compiles/executes student source in a fresh controller namespace, verifies callable `update(readings)`, and invokes optional `initialize(mission)`. `getCommand` invokes `update` once. The host may terminate the worker at any time.

## Worker to UI/session

```ts
type WorkerEvent =
  | { protocol: 1; type: 'ready'; requestId: string }
  | { protocol: 1; type: 'controllerLoaded'; requestId: string }
  | { protocol: 1; type: 'command'; requestId: string; command: MotorCommand }
  | { protocol: 1; type: 'console'; text: string; stream: 'stdout' | 'stderr' }
  | {
      protocol: 1;
      type: 'error';
      requestId: string;
      phase: 'initialize' | 'load' | 'execute';
      error: SerializedPythonError;
    };
```

`SerializedPythonError` includes a short message, exception type, and sanitized traceback. A console event is asynchronous and may occur before the matching command or error event. The client discards events with an unknown request ID except console events associated with the active run.

## Call and recovery behavior

1. On Run, `SimulationSession` asks a ready worker to `loadController`; it starts no physics until `controllerLoaded`.
2. For each tick, the session creates `getCommand` with a deadline. Exactly one command request may be outstanding.
3. A command response is schema-validated by the host before the core receives it.
4. A Python exception yields `student_code_error`; no tick advances for that command.
5. Deadline expiry causes the client to call `worker.terminate()`, rejects all pending calls, reports `student_code_timeout`, and starts fresh-worker initialization in the background for the next run.
6. Worker initialization/load failure is reported as a usable error state; a retry recreates it.

Because JavaScript cannot interrupt a synchronous infinite loop running inside Pyodide, host termination is the reliable timeout mechanism. Use one dedicated worker per active session, never run student Python on the main thread, and never attempt to queue a second command while one is pending.

Monte Carlo orchestration is UI/session-only: it repeats the same `loadController` and `getCommand` messages one trial at a time with a new seeded scenario on the host. Batch metadata, trial summaries, and UI-only replay records are never protocol messages. A `command` response may additionally carry validated student estimator reports produced during that exact `update(readings)` call. They are one-way diagnostics, not worker requests and not truth/simulation-state data.

## Conversion boundary

The worker explicitly constructs Python `Mission`, `Readings`, `GPS`, `Compass`, and `WheelEncoders` values from primitive message fields and explicitly extracts the two `MotorCommand` fields back to primitives. Avoid generic `toPy`/`toJs` for the supported API: it obscures validation, proxy lifetimes, and error messages. Destroy temporary PyProxy values in `finally` blocks.
