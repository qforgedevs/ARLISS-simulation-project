import {
  controllerFailure,
  createInitialState,
  missionFromScenario,
  pauseSimulation,
  rawSensorFrame,
  sensorFrame,
  startSimulation,
  stepSimulation,
  stopSimulation,
} from '../../domain/simulation/simulation';
import { createInitialRecord, recordSimulationTick } from '../../domain/simulation/runRecorder';
import { summarizeEstimates } from '../../domain/simulation/estimatorDiagnostics';
import { scenarioWithSeed, updateBatch } from '../../domain/simulation/monteCarlo';
import type {
  BenchmarkReference,
  MonteCarloBatch,
  MonteCarloTrial,
  RecordedTick,
  RawSensorFrame,
  ScenarioConfig,
  SensorRuntimeState,
  SimulationState,
  TelemetrySample,
} from '../../domain/simulation/types';
import { WorkerExecutionError, WorkerTimeoutError, WorkerClient } from '../../workers/workerClient';

export type SessionPhase =
  | 'booting_worker'
  | 'ready'
  | 'loading_controller'
  | 'running'
  | 'paused'
  | 'batch_running'
  | 'finished'
  | 'setup_error';

export type ConsoleEntry = Readonly<{ stream: 'stdout' | 'stderr'; text: string }>;

export type BatchRunOptions = Readonly<{
  id?: string;
  benchmark?: BenchmarkReference;
  scenario?: ScenarioConfig;
}>;

export type SessionSnapshot = Readonly<{
  phase: SessionPhase;
  simulation: SimulationState;
  telemetry: TelemetrySample;
  rawReadings: RawSensorFrame;
  recordedTicks: readonly RecordedTick[];
  batch?: MonteCarloBatch;
  consoleEntries: readonly ConsoleEntry[];
  setupError?: string;
}>;

export class SimulationSession {
  private readonly worker: WorkerClient;
  private readonly listeners = new Set<(snapshot: SessionSnapshot) => void>();
  private phase: SessionPhase = 'booting_worker';
  private simulation: SimulationState;
  private readonly consoleEntries: ConsoleEntry[] = [];
  private readonly recordedTicks: RecordedTick[] = [];
  private previousRecordedSensorState: SensorRuntimeState | undefined;
  private batch?: MonteCarloBatch;
  private batchSequence = 0;
  private batchToken = 0;
  private batchSource?: string;
  private lastAnimationTime = 0;
  private accumulatorS = 0;
  private animationFrame?: number;
  private tickInFlight = false;
  private runToken = 0;
  private speed = 1;
  private workerReady: Promise<void> = Promise.resolve();
  private lastPublishedAt = 0;

  constructor(private readonly scenario: ScenarioConfig) {
    this.simulation = createInitialState(scenario);
    this.worker = new WorkerClient();
    this.worker.onConsole((text, stream) => {
      if (this.consoleEntries.length >= 400) this.consoleEntries.shift();
      this.consoleEntries.push({ text, stream });
      this.publish();
    });
  }

  async initialize(): Promise<void> {
    this.phase = 'booting_worker';
    this.publish();
    this.workerReady = this.worker.initialize();
    try {
      await this.workerReady;
      await this.worker.waitUntilReady();
      this.phase = this.simulation.phase === 'finished' ? 'finished' : 'ready';
    } catch (error) {
      this.phase = 'setup_error';
      this.publishError(error);
      return;
    }
    this.publish();
  }

  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  async run(source: string): Promise<void> {
    if (
      this.phase === 'booting_worker' ||
      this.phase === 'loading_controller' ||
      this.phase === 'batch_running'
    )
      return;
    this.cancelScheduler();
    const token = ++this.runToken;
    this.consoleEntries.length = 0;
    this.recordedTicks.length = 0;
    this.previousRecordedSensorState = undefined;
    this.simulation = createInitialState(this.scenario);
    if (this.simulation.phase === 'finished') {
      this.phase = 'finished';
      this.publish();
      return;
    }
    this.phase = 'loading_controller';
    this.publish();
    try {
      await this.workerReady;
      await this.worker.waitUntilReady();
      await this.worker.loadController(source, missionFromScenario(this.scenario));
      if (token !== this.runToken) return;
      this.simulation = startSimulation(this.simulation);
      this.beginRecording();
      this.phase = 'running';
      this.lastAnimationTime = performance.now();
      this.publish();
      this.schedule();
    } catch (error) {
      if (token !== this.runToken) return;
      this.finishControllerError(error);
    }
  }

  pause(): void {
    if (this.phase !== 'running') return;
    this.simulation = pauseSimulation(this.simulation);
    this.phase = 'paused';
    this.cancelScheduler();
    this.publish();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.simulation = startSimulation(this.simulation);
    this.phase = 'running';
    this.lastAnimationTime = performance.now();
    this.publish();
    this.schedule();
  }

  async step(source: string): Promise<void> {
    if (this.phase === 'ready') {
      const token = ++this.runToken;
      this.phase = 'loading_controller';
      this.publish();
      try {
        await this.workerReady;
        await this.worker.waitUntilReady();
        await this.worker.loadController(source, missionFromScenario(this.scenario));
        if (token !== this.runToken) return;
        this.simulation = pauseSimulation(startSimulation(createInitialState(this.scenario)));
        this.beginRecording();
        this.phase = 'paused';
      } catch (error) {
        if (token === this.runToken) this.finishControllerError(error);
        return;
      }
    }
    if (this.phase !== 'paused') return;
    await this.executeTick(this.runToken);
  }

  async runBatch(
    source: string,
    totalTrials: number,
    seedStart: number,
    options: BatchRunOptions = {},
  ): Promise<MonteCarloBatch | undefined> {
    if (
      !Number.isInteger(totalTrials) ||
      totalTrials < 1 ||
      totalTrials > 20 ||
      !Number.isInteger(seedStart) ||
      this.phase === 'booting_worker' ||
      this.phase === 'loading_controller' ||
      this.phase === 'running' ||
      this.phase === 'paused' ||
      this.phase === 'batch_running'
    )
      return undefined;
    const batchScenario = options.scenario ?? this.scenario;
    this.cancelScheduler();
    ++this.runToken;
    const token = ++this.batchToken;
    this.consoleEntries.length = 0;
    this.recordedTicks.length = 0;
    this.previousRecordedSensorState = undefined;
    this.simulation = createInitialState(batchScenario);
    this.batchSource = source;
    this.batch = Object.freeze({
      id: options.id ?? `batch-${++this.batchSequence}`,
      benchmark: options.benchmark,
      scenario: batchScenario,
      controllerSource: source,
      status: 'running',
      totalTrials,
      completedTrials: 0,
      seedStart,
      trials: [],
    });
    this.phase = 'batch_running';
    this.publish();

    for (let index = 0; index < totalTrials; index += 1) {
      if (token !== this.batchToken) return;
      const seed = seedStart + index;
      const trial = await this.executeControllerTrial(
        source,
        scenarioWithSeed(batchScenario, seed),
        () => token !== this.batchToken,
      );
      if (!trial || token !== this.batchToken || !this.batch) return undefined;
      this.batch = updateBatch(
        this.batch,
        this.toBatchTrial(index, seed, trial.state, trial.records, batchScenario),
      );
      this.publish();
    }
    if (token !== this.batchToken || !this.batch) return undefined;
    this.batch = Object.freeze({ ...this.batch, status: 'completed' });
    const completedBatch = this.batch;
    this.phase = 'ready';
    this.simulation = createInitialState(this.scenario);
    this.publish();
    return completedBatch;
  }

  cancelBatch(): void {
    if (this.phase !== 'batch_running' || !this.batch) return;
    ++this.batchToken;
    ++this.runToken;
    this.batch = Object.freeze({ ...this.batch, status: 'cancelled' });
    this.recordedTicks.length = 0;
    this.previousRecordedSensorState = undefined;
    this.simulation = createInitialState(this.scenario);
    this.phase = 'ready';
    this.workerReady = this.worker.recreate().catch((error) => {
      this.phase = 'setup_error';
      this.publishError(error);
    });
    this.publish();
  }

  async replayBatchTrial(index: number): Promise<void> {
    const batch = this.batch;
    const trial = batch?.trials[index];
    const source = this.batchSource;
    if (!trial || !source || this.phase === 'batch_running' || this.phase === 'booting_worker')
      return;
    this.cancelScheduler();
    const token = ++this.runToken;
    this.consoleEntries.length = 0;
    this.recordedTicks.length = 0;
    this.previousRecordedSensorState = undefined;
    this.phase = 'loading_controller';
    this.publish();
    const batchScenario = batch.scenario;
    const replay = await this.executeControllerTrial(
      source,
      scenarioWithSeed(batchScenario, trial.seed),
      () => token !== this.runToken,
    );
    if (!replay || token !== this.runToken) return;
    this.simulation = replay.state;
    this.recordedTicks.push(...replay.records);
    this.previousRecordedSensorState = replay.state.sensorState;
    this.phase = 'finished';
    this.publish();
  }

  /** Restores a completed browser-session batch before replaying one of its trials. */
  async replayStoredBatchTrial(batch: MonteCarloBatch, index: number): Promise<void> {
    if (
      batch.status !== 'completed' ||
      this.phase === 'batch_running' ||
      this.phase === 'booting_worker'
    )
      return;
    this.batch = batch;
    this.batchSource = batch.controllerSource;
    this.publish();
    await this.replayBatchTrial(index);
  }

  stop(): void {
    if (this.phase !== 'loading_controller' && this.phase !== 'running' && this.phase !== 'paused')
      return;
    ++this.runToken;
    this.cancelScheduler();
    this.simulation = stopSimulation(this.simulation);
    this.phase = 'finished';
    this.publish();
    this.workerReady = this.worker.recreate().catch((error) => {
      this.phase = 'setup_error';
      this.publishError(error);
    });
  }

  reset(): void {
    if (this.phase === 'batch_running') {
      this.cancelBatch();
      return;
    }
    const activeRun =
      this.phase === 'loading_controller' || this.phase === 'running' || this.phase === 'paused';
    ++this.runToken;
    this.cancelScheduler();
    this.consoleEntries.length = 0;
    this.recordedTicks.length = 0;
    this.previousRecordedSensorState = undefined;
    this.simulation = createInitialState(this.scenario);
    this.phase = this.simulation.phase === 'finished' ? 'finished' : 'ready';
    this.publish();
    if (activeRun) {
      this.workerReady = this.worker.recreate().catch((error) => {
        this.phase = 'setup_error';
        this.publishError(error);
      });
    }
  }

  dispose(): void {
    ++this.batchToken;
    this.cancelScheduler();
    this.worker.dispose();
    this.listeners.clear();
  }

  private schedule(): void {
    this.animationFrame = requestAnimationFrame((timestamp) => {
      this.animationFrame = undefined;
      if (this.phase !== 'running') return;
      const elapsedS = Math.min((timestamp - this.lastAnimationTime) / 1000, 0.25);
      this.lastAnimationTime = timestamp;
      this.accumulatorS += elapsedS * this.speed;
      if (!this.tickInFlight && this.accumulatorS >= this.scenario.fixedDtS) {
        this.accumulatorS -= this.scenario.fixedDtS;
        void this.executeTick(this.runToken);
      }
      this.schedule();
    });
  }

  private async executeTick(token: number): Promise<void> {
    if (this.tickInFlight || (this.phase !== 'running' && this.phase !== 'paused')) return;
    this.tickInFlight = true;
    try {
      const inputState = this.simulation;
      const readings = rawSensorFrame(inputState, this.scenario);
      const response = await this.worker.getCommand(readings);
      const command = response.command;
      if (token !== this.runToken || (this.phase !== 'running' && this.phase !== 'paused')) return;
      const result = stepSimulation(inputState, this.scenario, command);
      this.simulation = result.state;
      this.recordedTicks.push(
        recordSimulationTick(
          this.previousRecordedSensorState ?? inputState.sensorState,
          inputState,
          this.simulation,
          command,
          response.estimates,
        ),
      );
      this.previousRecordedSensorState = inputState.sensorState;
      if (this.simulation.phase === 'finished') {
        this.phase = 'finished';
        this.cancelScheduler();
      }
      this.publish(result.telemetry);
    } catch (error) {
      if (token === this.runToken) this.finishControllerError(error);
    } finally {
      this.tickInFlight = false;
      if (
        token === this.runToken &&
        this.phase === 'running' &&
        this.accumulatorS >= this.scenario.fixedDtS
      ) {
        this.accumulatorS -= this.scenario.fixedDtS;
        setTimeout(() => void this.executeTick(token), 0);
      }
    }
  }

  private async executeControllerTrial(
    source: string,
    scenario: ScenarioConfig,
    isCancelled: () => boolean,
  ): Promise<Readonly<{ state: SimulationState; records: readonly RecordedTick[] }> | undefined> {
    let state = createInitialState(scenario);
    const records: RecordedTick[] = [createInitialRecord(state)];
    let previousSensorState = state.sensorState;
    if (state.phase === 'finished') return { state, records };
    try {
      await this.workerReady;
      await this.worker.waitUntilReady();
      if (isCancelled()) return undefined;
      await this.worker.loadController(source, missionFromScenario(scenario));
      if (isCancelled()) return undefined;
      state = startSimulation(state);
      while (state.phase !== 'finished') {
        if (isCancelled()) return undefined;
        const inputState = state;
        const response = await this.worker.getCommand(rawSensorFrame(inputState, scenario));
        const command = response.command;
        if (isCancelled()) return undefined;
        state = stepSimulation(inputState, scenario, command).state;
        records.push(
          recordSimulationTick(previousSensorState, inputState, state, command, response.estimates),
        );
        previousSensorState = inputState.sensorState;
      }
    } catch (error) {
      if (isCancelled()) return undefined;
      const timeout = error instanceof WorkerTimeoutError;
      const workerError = error instanceof WorkerExecutionError ? error.pythonError : undefined;
      state = controllerFailure(
        state,
        timeout ? 'student_code_timeout' : 'student_code_error',
        timeout
          ? 'Student code exceeded the execution time limit.'
          : (workerError?.message ?? 'Student controller failed.'),
        workerError,
      );
    }
    return { state, records };
  }

  private toBatchTrial(
    index: number,
    seed: number,
    state: SimulationState,
    records: readonly RecordedTick[],
    scenario: ScenarioConfig,
  ): MonteCarloTrial {
    const result = state.result;
    const finalDistanceM = Math.hypot(
      state.rover.pose.position.x - scenario.target.x,
      state.rover.pose.position.y - scenario.target.y,
    );
    return Object.freeze({
      index,
      seed,
      outcome: result?.outcome ?? 'student_code_error',
      finalDistanceM,
      elapsedTimeS: state.rover.elapsedTimeS,
      tick: state.tick,
      message: result?.message ?? 'Trial ended without a result.',
      estimation: summarizeEstimates(records, scenario),
    });
  }

  private finishControllerError(error: unknown): void {
    this.cancelScheduler();
    const timeout = error instanceof WorkerTimeoutError;
    const workerError = error instanceof WorkerExecutionError ? error.pythonError : undefined;
    this.simulation = controllerFailure(
      this.simulation,
      timeout ? 'student_code_timeout' : 'student_code_error',
      timeout
        ? 'Student code exceeded the execution time limit.'
        : (workerError?.message ?? 'Student controller failed.'),
      workerError,
    );
    this.phase = 'finished';
    this.publish();
  }

  private snapshot(telemetry?: TelemetrySample): SessionSnapshot {
    return Object.freeze({
      phase: this.phase,
      simulation: this.simulation,
      telemetry: telemetry ?? {
        tick: this.simulation.tick,
        state: this.simulation.rover,
        sensors: sensorFrame(this.simulation, this.scenario),
        command: this.simulation.lastCommand,
      },
      rawReadings: rawSensorFrame(this.simulation, this.scenario),
      recordedTicks: [...this.recordedTicks],
      batch: this.batch,
      consoleEntries: [...this.consoleEntries],
      setupError:
        this.phase === 'setup_error'
          ? 'Python runtime could not be initialized. Check your network connection and retry.'
          : undefined,
    });
  }

  private publish(telemetry?: TelemetrySample): void {
    const now = performance.now();
    const mustPublish = this.phase !== 'running' || now - this.lastPublishedAt >= 33;
    if (!mustPublish) return;
    this.lastPublishedAt = now;
    const snapshot = this.snapshot(telemetry);
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private publishError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.consoleEntries.push({ stream: 'stderr', text: message });
    this.publish();
  }

  private cancelScheduler(): void {
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.accumulatorS = 0;
  }

  private beginRecording(): void {
    this.recordedTicks.length = 0;
    this.recordedTicks.push(createInitialRecord(this.simulation));
    this.previousRecordedSensorState = this.simulation.sensorState;
  }
}
