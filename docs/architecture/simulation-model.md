# Simulation model and data contracts

## Coordinate system and kinematics

World coordinates are meters, +x east and +y north. Heading `theta` is radians, with zero along +x and positive counterclockwise. Commands `uL` and `uR` are normalized [-1, 1]. With wheel radius `r`, track width `b`, max wheel angular speed `omegaMax`, and fixed timestep `dt`:

```text
omegaL = uL * omegaMax
omegaR = uR * omegaMax
v      = r * (omegaR + omegaL) / 2
w      = r * (omegaR - omegaL) / b
theta' = normalize(theta + w * dt)
x'     = x + v * cos(theta + w * dt / 2) * dt
y'     = y + v * sin(theta + w * dt / 2) * dt
```

Use the midpoint heading form above for a stable deterministic discrete update. For a straight command it reduces to standard Euler translation. Track cumulative distance as `distance + abs(v) * dt`. The simulation uses IEEE-754 JavaScript numbers and defines exact input/config defaults, so replay is deterministic within the same supported browser/runtime; do not promise bit-identical results across all engines.

## TypeScript-shaped data models

```ts
type Vec2 = Readonly<{ x: number; y: number }>;
type Pose2 = Readonly<{ position: Vec2; headingRad: number }>;

type RoverState = Readonly<{
  pose: Pose2;
  linearVelocityMps: number;
  angularVelocityRadps: number;
  distanceTravelledM: number;
  elapsedTimeS: number;
  leftEncoderTicks: number;
  rightEncoderTicks: number;
  leftEncoderDeltaTicks: number;
  rightEncoderDeltaTicks: number;
}>;
type MotorCommand = Readonly<{ left: number; right: number }>;
type Mission = Readonly<{
  targetLatitudeDeg: number;
  targetLongitudeDeg: number;
  targetRadiusM: number;
}>;
type RawSensorFrame = Readonly<{
  timeS: number;
  gps: { valid: boolean; latitudeDeg: number; longitudeDeg: number; horizontalAccuracyM: number };
  compass: { headingRad: number };
  encoders: {
    leftTicks: number;
    rightTicks: number;
    leftDeltaTicks: number;
    rightDeltaTicks: number;
  };
}>;
type RoverConfig = Readonly<{
  wheelRadiusM: number;
  trackWidthM: number;
  maxWheelSpeedRadps: number;
  encoderTicksPerRevolution: number;
}>;
type ScenarioConfig = Readonly<{
  id: string;
  mapBoundsM: { minX: number; maxX: number; minY: number; maxY: number };
  start: Pose2;
  target: Vec2;
  targetRadiusM: number;
  geographicReference: { latitudeDeg: number; longitudeDeg: number };
  timeLimitS: number;
  fixedDtS: number;
  rover: RoverConfig;
  sensors: SensorProfile;
}>;
type TelemetrySample = Readonly<{
  tick: number;
  state: RoverState;
  sensors: SensorFrame;
  command: MotorCommand;
}>;
type RecordedTick = Readonly<{
  tick: number;
  readingTimeS: number;
  readings: RawSensorFrame; // exact frame sent to Python
  command: MotorCommand;
  groundTruth: RoverState; // UI-only; never sent to Python
  sensorStatus: {
    gps: 'fresh' | 'held' | 'dropped';
    compass: 'fresh' | 'held' | 'dropped';
    encoders: 'fresh' | 'held' | 'dropped';
  };
}>;
type MonteCarloTrial = Readonly<{
  index: number;
  seed: number;
  outcome: RunOutcome;
  finalDistanceM: number;
  elapsedTimeS: number;
  tick: number;
}>;
type RunResult = Readonly<{
  outcome:
    | 'target_reached'
    | 'time_limit_exceeded'
    | 'energy_limit_exceeded'
    | 'student_code_error'
    | 'student_code_timeout'
    | 'stopped_by_user';
  finishedAtS: number;
  tick: number;
  finalState: RoverState;
  message: string;
  error?: { name: string; message: string; traceback?: string };
}>;
```

All public models are immutable snapshots. `energy_limit_exceeded` is reserved but cannot be produced in MVP 1. Map boundaries are visual guidance only in MVP 1, not collision walls; document this in the UI.

`RawSensorFrame` is the only sensor model sent to student Python. `SensorFrame` target-relative values are an internal telemetry/rendering model, not part of the student API. GPS converts the local map to latitude/longitude around the scenario's geographic reference using a small-area equirectangular approximation. Encoder ticks are derived from signed wheel travel and the configured ticks-per-revolution.

## Deterministic sensor-fidelity profiles

Each scenario carries a `SensorProfile` with one integer replay seed and GPS, compass, and encoder settings. Each sensor has an update rate and dropout probability. GPS supports east/north meter bias and meter standard deviation; compass supports radian bias and standard deviation; encoders support independent tick biases, tick noise, and a slip fraction that scales measured wheel travel.

At each fixed tick, the simulator updates only sensors whose sample index has advanced. A deterministic hash of `(seed, sensor stream, sample index)` produces the pseudo-random values, so a command sequence, scenario, and seed replay exactly within the same runtime. GPS dropouts set `valid` false and preserve the last coordinate; compass/encoder dropouts preserve the last sample, with encoder deltas reported as zero. The sensor-runtime state is simulation-private and is reduced to the unchanged `RawSensorFrame` before crossing the worker boundary.

## Run recording and replay

After a controller is loaded, the session records an initial sample and then one `RecordedTick` for every completed simulation tick. A record pairs the raw frame captured before the controller call with the validated command and the resulting authoritative rover state. It also preserves sample-status metadata derived from the private sensor runtime state. The UI can scrub these records, render charts, show raw GPS fixes, and display truth values for teaching/debugging. `RecordedTick`, the profile seed, and truth state are deliberately absent from the worker protocol and Python prelude.

## Monte Carlo batches

A batch executes the same captured Python source sequentially for a bounded set of integer seeds. Each trial loads a fresh controller namespace and uses a copy of the selected scenario whose sensor profile differs only by seed. The batch retains lightweight outcome/distance/time summaries, not every trace. Selecting a table row reruns that exact source/seed pair and replaces the current UI replay trace. Batch cancellation increments the batch token and recreates the worker, so a stalled Python controller cannot block the main UI or a later run.

## Mission benchmarks and scoring

Mission benchmarks are named immutable scenario presets. Each fixes the start pose, target/radius,
sensor profile, seed range, and trial count so two runs of the same source can be compared. The
current presets are Open desert qualification, Noisy GPS crossing, and Field sensor recovery.

For a completed benchmark batch, the UI calculates a score out of 100: 60 points from target
success rate, 25 from normalized final-distance progress from the fixed start to the target radius,
and 15 from the mean arrival-time efficiency of successful trials. Controller errors and controller
timeouts subtract up to 20 points in proportion to failed trials. The batch outcome records,
score, and browser-session comparison history are UI-only; they are absent from `RawSensorFrame`,
the Python prelude, and worker protocol.

## Benchmark suites

A benchmark suite executes the current captured Python source over every named mission benchmark,
strictly one benchmark batch at a time. It uses each mission's fixed scenario, seed start, and
trial count and produces a UI-only report card. The overall score is the arithmetic mean of the
completed mission scores; success rate, final distance, and elapsed time aggregate all completed
trials; controller failures are summed. A cancellation keeps only completed mission results and
uses normal worker recreation to halt the in-flight controller execution.

## Student estimator diagnostics

Student code may call `report_estimate(latitude_deg, longitude_deg, heading_rad, label=None)` from
inside `update`. The worker validates finite/range-safe values and attaches zero or more reports to
the resulting command response. `RecordedTick` stores these reports and UI-only ground truth at the
input-reading instant, so localization error is not offset by the following physics step. Replay
renders the reported path against true trajectory, a position-error chart, and run-level mean/final
position and heading error. Monte Carlo trials retain only their aggregate estimator summary;
benchmark and suite reports aggregate those UI-only summaries. Reports never appear in
`RawSensorFrame`, `Mission`, or sensor values passed to Python.

## Scheduled sensor faults

Scenarios may define deterministic `[startS, endS)` fault windows. GPS supports `dropout` and
`hold`; compass supports `bias`, `hold`, and `freeze`; encoders support `slip`, `hold`, and
`freeze`. Fault state is applied inside the sensor provider and never crosses the Python boundary.
Replay diagnostics show the active fault names at each scrubbed tick and mark the estimator-error
chart as fault-aware. The Scheduled fault recovery benchmark exercises GPS blackout, compass freeze,
and encoder slip.

## Validation

Validate scenarios before a run: finite values, positive geometry/timestep/radius/time limit/sensor rates, valid bounds, sensor noise constraints, dropout probabilities in `[0, 1]`, encoder slip below one, and start/target inside bounds. Validate every command before physics. Reject invalid configuration with a user-facing setup error; invalid student output ends the run with `student_code_error`.

## Termination order

At initialization and after each physics tick: (1) target radius inclusive, (2) enabled energy rules in future versions, (3) time limit inclusive. Controller/validation failure terminates before physics for that attempted tick. User stop is an immediate terminal event using the last authoritative state.
