import type {
  Mission,
  MotorCommand,
  RawSensorFrame,
  StudentEstimate,
} from '../domain/simulation/types';
import {
  WORKER_PROTOCOL_VERSION,
  type SerializedPythonError,
  type WorkerEvent,
  type WorkerRequest,
} from './protocol';

export class WorkerTimeoutError extends Error {
  constructor(message = 'Student controller execution timed out.') {
    super(message);
    this.name = 'WorkerTimeoutError';
  }
}

export class WorkerExecutionError extends Error {
  readonly pythonError: SerializedPythonError;

  constructor(pythonError: SerializedPythonError) {
    super(pythonError.message);
    this.name = pythonError.name;
    this.pythonError = pythonError;
  }
}

type WorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

type PendingRequest = {
  resolve: (event: WorkerEvent) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export type WorkerClientOptions = Readonly<{
  commandTimeoutMs?: number;
  workerFactory?: () => WorkerLike;
}>;

export type ControllerResponse = Readonly<{
  command: MotorCommand;
  estimates: readonly StudentEstimate[];
}>;

export class WorkerClient {
  private readonly commandTimeoutMs: number;
  private readonly createWorker: () => WorkerLike;
  private worker: WorkerLike;
  private generation = 0;
  private sequence = 0;
  private recovery?: Promise<void>;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly consoleListeners = new Set<
    (text: string, stream: 'stdout' | 'stderr') => void
  >();

  constructor(options: WorkerClientOptions = {}) {
    this.commandTimeoutMs = options.commandTimeoutMs ?? 150;
    this.createWorker =
      options.workerFactory ??
      (() => new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' }));
    this.worker = this.spawnWorker();
  }

  initialize(): Promise<void> {
    return this.request({ type: 'initialize' }, 30_000).then(() => undefined);
  }

  loadController(source: string, mission: Mission): Promise<void> {
    return this.request({ type: 'loadController', source, mission }, 5_000).then(() => undefined);
  }

  getCommand(readings: RawSensorFrame): Promise<ControllerResponse> {
    return this.request({ type: 'getCommand', readings }, this.commandTimeoutMs).then((event) => {
      if (event.type !== 'command') throw new Error('Worker returned an unexpected response.');
      return { command: event.command, estimates: event.estimates ?? [] };
    });
  }

  onConsole(listener: (text: string, stream: 'stdout' | 'stderr') => void): () => void {
    this.consoleListeners.add(listener);
    return () => this.consoleListeners.delete(listener);
  }

  recreate(): Promise<void> {
    if (this.recovery) return this.recovery;
    const recovery = this.recreateWorker();
    this.recovery = recovery;
    void recovery.then(
      () => {
        if (this.recovery === recovery) this.recovery = undefined;
      },
      () => {
        if (this.recovery === recovery) this.recovery = undefined;
      },
    );
    return recovery;
  }

  async waitUntilReady(): Promise<void> {
    await this.recovery;
  }

  private async recreateWorker(): Promise<void> {
    this.generation += 1;
    this.rejectPending(new WorkerTimeoutError('Python worker was terminated.'));
    this.worker.terminate();
    this.worker = this.spawnWorker();
    await this.initialize();
  }

  dispose(): void {
    this.rejectPending(new WorkerTimeoutError('Python worker was disposed.'));
    this.worker.terminate();
  }

  private request(
    payload:
      | Omit<Extract<WorkerRequest, { type: 'initialize' }>, 'protocol' | 'requestId'>
      | Omit<Extract<WorkerRequest, { type: 'loadController' }>, 'protocol' | 'requestId'>
      | Omit<Extract<WorkerRequest, { type: 'getCommand' }>, 'protocol' | 'requestId'>,
    timeoutMs: number,
  ): Promise<WorkerEvent> {
    const requestId = `${this.generation}:${++this.sequence}`;
    const request = { protocol: WORKER_PROTOCOL_VERSION, requestId, ...payload } as WorkerRequest;
    return new Promise<WorkerEvent>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.pending.has(requestId)) return;
        this.pending.delete(requestId);
        const timeoutError = new WorkerTimeoutError();
        reject(timeoutError);
        if (payload.type === 'getCommand') void this.recreate().catch(() => undefined);
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timeoutId });
      this.worker.postMessage(request);
    });
  }

  private spawnWorker(): WorkerLike {
    const worker = this.createWorker();
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => this.handleWorkerError(event);
    return worker;
  }

  private handleMessage(event: WorkerEvent): void {
    if (event.protocol !== WORKER_PROTOCOL_VERSION) return;
    if (event.type === 'console') {
      this.consoleListeners.forEach((listener) => listener(event.text, event.stream));
      return;
    }
    const pending = this.pending.get(event.requestId);
    if (!pending) return;
    this.pending.delete(event.requestId);
    clearTimeout(pending.timeoutId);
    if (event.type === 'error') pending.reject(new WorkerExecutionError(event.error));
    else pending.resolve(event);
  }

  private handleWorkerError(event: ErrorEvent): void {
    this.rejectPending(new Error(event.message || 'Python worker failed unexpectedly.'));
  }

  private rejectPending(error: Error): void {
    this.pending.forEach((pending) => {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    });
    this.pending.clear();
  }
}
