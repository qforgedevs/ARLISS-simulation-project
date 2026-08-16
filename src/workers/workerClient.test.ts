import { describe, expect, it, vi } from 'vitest';
import type { WorkerEvent } from './protocol';
import { WorkerClient, WorkerExecutionError, WorkerTimeoutError } from './workerClient';

const readings = {
  timeS: 0,
  gps: { valid: true, latitudeDeg: 40, longitudeDeg: -119, horizontalAccuracyM: 0 },
  compass: { headingRad: 0 },
  encoders: { leftTicks: 0, rightTicks: 0, leftDeltaTicks: 0, rightDeltaTicks: 0 },
};
const mission = { targetLatitudeDeg: 40.01, targetLongitudeDeg: -119.01, targetRadiusM: 3 };

class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  emit(event: WorkerEvent): void {
    this.onmessage?.({ data: event } as MessageEvent<WorkerEvent>);
  }
}

describe('WorkerClient', () => {
  it('matches command responses and ignores stale messages', async () => {
    const worker = new FakeWorker();
    const client = new WorkerClient({ workerFactory: () => worker, commandTimeoutMs: 100 });
    const pending = client.getCommand(readings);
    const request = worker.postMessage.mock.calls[0]?.[0] as { requestId: string };
    worker.emit({
      protocol: 1,
      type: 'command',
      requestId: 'previous:run',
      command: { left: 1, right: 1 },
      estimates: [],
    });
    worker.emit({
      protocol: 1,
      type: 'command',
      requestId: request.requestId,
      command: { left: 0.4, right: 0.6 },
      estimates: [{ latitudeDeg: 40, longitudeDeg: -119, headingRad: 0, label: 'dead reckoning' }],
    });
    await expect(pending).resolves.toEqual({
      command: { left: 0.4, right: 0.6 },
      estimates: [{ latitudeDeg: 40, longitudeDeg: -119, headingRad: 0, label: 'dead reckoning' }],
    });
    client.dispose();
  });

  it('terminates and rejects an overdue controller call', async () => {
    vi.useFakeTimers();
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const factory = vi.fn().mockReturnValueOnce(firstWorker).mockReturnValue(secondWorker);
    const client = new WorkerClient({ workerFactory: factory, commandTimeoutMs: 10 });
    const pending = client.getCommand(readings);
    const rejection = expect(pending).rejects.toBeInstanceOf(WorkerTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(firstWorker.terminate).toHaveBeenCalled();
    client.dispose();
    vi.useRealTimers();
  });

  it('surfaces structured Python errors without accepting a command', async () => {
    const worker = new FakeWorker();
    const client = new WorkerClient({ workerFactory: () => worker });
    const pending = client.loadController('def update(readings):\n  return nope', mission);
    const request = worker.postMessage.mock.calls[0]?.[0] as { requestId: string };
    worker.emit({
      protocol: 1,
      type: 'error',
      requestId: request.requestId,
      phase: 'load',
      error: { name: 'NameError', message: 'name nope is not defined', traceback: 'traceback' },
    });
    await expect(pending).rejects.toBeInstanceOf(WorkerExecutionError);
    client.dispose();
  });
});
