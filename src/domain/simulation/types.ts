export type Vec2 = Readonly<{ x: number; y: number }>;

export type Pose2 = Readonly<{ position: Vec2; headingRad: number }>;

export type MotorCommand = Readonly<{ left: number; right: number }>;

export type StudentEstimate = Readonly<{
  latitudeDeg: number;
  longitudeDeg: number;
  headingRad: number;
  label?: string;
}>;

export type EstimationSummary = Readonly<{
  reportedSamples: number;
  meanPositionErrorM?: number;
  finalPositionErrorM?: number;
  meanHeadingErrorDeg?: number;
  finalHeadingErrorDeg?: number;
}>;

export type RoverConfig = Readonly<{
  wheelRadiusM: number;
  trackWidthM: number;
  maxWheelSpeedRadps: number;
  encoderTicksPerRevolution: number;
}>;

export type GeographicReference = Readonly<{
  latitudeDeg: number;
  longitudeDeg: number;
}>;

export type GpsSensorConfig = Readonly<{
  updateRateHz: number;
  noiseStdDevM: number;
  biasEastM: number;
  biasNorthM: number;
  horizontalAccuracyM: number;
  dropoutProbability: number;
}>;

export type CompassSensorConfig = Readonly<{
  updateRateHz: number;
  noiseStdDevRad: number;
  biasRad: number;
  dropoutProbability: number;
}>;

export type EncoderSensorConfig = Readonly<{
  updateRateHz: number;
  noiseStdDevTicks: number;
  leftBiasTicks: number;
  rightBiasTicks: number;
  slipFraction: number;
  dropoutProbability: number;
}>;

export type SensorProfile = Readonly<{
  randomSeed: number;
  gps: GpsSensorConfig;
  compass: CompassSensorConfig;
  encoders: EncoderSensorConfig;
}>;

export type SensorFaultWindow = Readonly<{
  startS: number;
  endS: number;
  mode: 'dropout' | 'hold' | 'bias' | 'freeze' | 'slip';
  value?: number;
}>;

export type SensorFaultSchedule = Readonly<{
  gps: readonly SensorFaultWindow[];
  compass: readonly SensorFaultWindow[];
  encoders: readonly SensorFaultWindow[];
}>;

export type ScenarioConfig = Readonly<{
  id: string;
  mapBoundsM: Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;
  start: Pose2;
  target: Vec2;
  targetRadiusM: number;
  geographicReference: GeographicReference;
  timeLimitS: number;
  fixedDtS: number;
  rover: RoverConfig;
  sensors: SensorProfile;
  faults?: SensorFaultSchedule;
}>;

export type RoverState = Readonly<{
  pose: Pose2;
  linearVelocityMps: number;
  angularVelocityRadps: number;
  distanceTravelledM: number;
  elapsedTimeS: number;
  leftEncoderTicks: number;
  rightEncoderTicks: number;
  leftEncoderDeltaTicks: number;
  rightEncoderDeltaTicks: number;
  leftWheelTravelledM: number;
  rightWheelTravelledM: number;
}>;

export type Mission = Readonly<{
  targetLatitudeDeg: number;
  targetLongitudeDeg: number;
  targetRadiusM: number;
}>;

export type RawSensorFrame = Readonly<{
  timeS: number;
  gps: Readonly<{
    valid: boolean;
    latitudeDeg: number;
    longitudeDeg: number;
    horizontalAccuracyM: number;
  }>;
  compass: Readonly<{ headingRad: number }>;
  encoders: Readonly<{
    leftTicks: number;
    rightTicks: number;
    leftDeltaTicks: number;
    rightDeltaTicks: number;
  }>;
}>;

export type SensorRuntimeState = Readonly<{
  gps: RawSensorFrame['gps'] & Readonly<{ sampleIndex: number; dropped: boolean }>;
  compass: RawSensorFrame['compass'] & Readonly<{ sampleIndex: number; dropped: boolean }>;
  encoders: RawSensorFrame['encoders'] & Readonly<{ sampleIndex: number; dropped: boolean }>;
}>;

export type SensorObservationStatus = Readonly<{
  gps: 'fresh' | 'held' | 'dropped';
  compass: 'fresh' | 'held' | 'dropped';
  encoders: 'fresh' | 'held' | 'dropped';
}>;

export type RecordedTick = Readonly<{
  tick: number;
  readingTimeS: number;
  readings: RawSensorFrame;
  command: MotorCommand;
  studentEstimates: readonly StudentEstimate[];
  groundTruthAtReading: RoverState;
  groundTruth: RoverState;
  sensorStatus: SensorObservationStatus;
}>;

export type MonteCarloTrial = Readonly<{
  index: number;
  seed: number;
  outcome: RunOutcome;
  finalDistanceM: number;
  elapsedTimeS: number;
  tick: number;
  message: string;
  estimation: EstimationSummary;
}>;

export type BenchmarkReference = Readonly<{
  id: string;
  name: string;
}>;

export type MonteCarloBatchStatus = 'running' | 'completed' | 'cancelled';

export type MonteCarloBatch = Readonly<{
  id: string;
  benchmark?: BenchmarkReference;
  /** UI-only replay context. It is never included in a Python sensor frame. */
  scenario: ScenarioConfig;
  /** UI-only controller source retained for deterministic browser-session replay. */
  controllerSource: string;
  status: MonteCarloBatchStatus;
  totalTrials: number;
  completedTrials: number;
  seedStart: number;
  trials: readonly MonteCarloTrial[];
}>;

export type MonteCarloSummary = Readonly<{
  successCount: number;
  successRate: number;
  meanFinalDistanceM: number;
  meanElapsedTimeS: number;
  outcomes: Readonly<Partial<Record<RunOutcome, number>>>;
  estimation: EstimationSummary;
}>;

export type BenchmarkScore = Readonly<{
  total: number;
  successPoints: number;
  distancePoints: number;
  timePoints: number;
  controllerFailurePenalty: number;
  controllerFailureCount: number;
}>;

export type BenchmarkBatchResult = Readonly<{
  batch: MonteCarloBatch;
  benchmark: BenchmarkReference;
  score: BenchmarkScore;
}>;

export type BenchmarkSuiteStatus = 'running' | 'completed' | 'cancelled';

export type BenchmarkSuite = Readonly<{
  id: string;
  status: BenchmarkSuiteStatus;
  totalMissions: number;
  completedMissions: number;
  currentMission?: BenchmarkReference;
  results: readonly BenchmarkBatchResult[];
}>;

export type BenchmarkSuiteSummary = Readonly<{
  overallScore: number;
  successRate: number;
  meanFinalDistanceM: number;
  meanElapsedTimeS: number;
  controllerFailureCount: number;
  estimation: EstimationSummary;
}>;

export type SensorFrame = Readonly<{
  position: Vec2;
  headingRad: number;
  target: Vec2;
  distanceToTargetM: number;
  bearingToTargetRad: number;
  timeS: number;
}>;

export type RunOutcome =
  | 'target_reached'
  | 'time_limit_exceeded'
  | 'energy_limit_exceeded'
  | 'student_code_error'
  | 'student_code_timeout'
  | 'stopped_by_user';

export type RunResult = Readonly<{
  outcome: RunOutcome;
  finishedAtS: number;
  tick: number;
  finalState: RoverState;
  message: string;
  error?: Readonly<{ name: string; message: string; traceback?: string }>;
}>;

export type SimulationPhase = 'ready' | 'running' | 'paused' | 'finished';

export type SimulationState = Readonly<{
  phase: SimulationPhase;
  tick: number;
  rover: RoverState;
  sensorState: SensorRuntimeState;
  trajectory: readonly Vec2[];
  lastCommand: MotorCommand;
  result?: RunResult;
}>;

export type TelemetrySample = Readonly<{
  tick: number;
  state: RoverState;
  sensors: SensorFrame;
  command: MotorCommand;
}>;

export type SimulationStep = Readonly<{
  state: SimulationState;
  telemetry: TelemetrySample;
}>;
