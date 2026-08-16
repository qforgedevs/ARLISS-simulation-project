import type {
  Mission,
  MotorCommand,
  RawSensorFrame,
  StudentEstimate,
} from '../domain/simulation/types';

export const WORKER_PROTOCOL_VERSION = 1 as const;

export type SerializedPythonError = Readonly<{
  name: string;
  message: string;
  traceback?: string;
}>;

export type WorkerRequest =
  | Readonly<{ protocol: 1; type: 'initialize'; requestId: string }>
  | Readonly<{
      protocol: 1;
      type: 'loadController';
      requestId: string;
      source: string;
      mission: Mission;
    }>
  | Readonly<{ protocol: 1; type: 'getCommand'; requestId: string; readings: RawSensorFrame }>;

export type WorkerEvent =
  | Readonly<{ protocol: 1; type: 'ready'; requestId: string }>
  | Readonly<{ protocol: 1; type: 'controllerLoaded'; requestId: string }>
  | Readonly<{
      protocol: 1;
      type: 'command';
      requestId: string;
      command: MotorCommand;
      estimates: readonly StudentEstimate[];
    }>
  | Readonly<{ protocol: 1; type: 'console'; text: string; stream: 'stdout' | 'stderr' }>
  | Readonly<{
      protocol: 1;
      type: 'error';
      requestId: string;
      phase: 'initialize' | 'load' | 'execute';
      error: SerializedPythonError;
    }>;
