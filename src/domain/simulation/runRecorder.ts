import { rawSensorFrameFromState } from './sensors';
import type {
  MotorCommand,
  RecordedTick,
  SensorObservationStatus,
  SensorRuntimeState,
  SimulationState,
  StudentEstimate,
} from './types';

export function createInitialRecord(state: SimulationState): RecordedTick {
  return Object.freeze({
    tick: state.tick,
    readingTimeS: state.rover.elapsedTimeS,
    readings: rawSensorFrameFromState(state.rover, state.sensorState),
    command: { left: 0, right: 0 },
    studentEstimates: [],
    groundTruthAtReading: state.rover,
    groundTruth: state.rover,
    sensorStatus: { gps: 'fresh' as const, compass: 'fresh' as const, encoders: 'fresh' as const },
  });
}

export function recordSimulationTick(
  previousSensorState: SensorRuntimeState,
  inputState: SimulationState,
  outputState: SimulationState,
  command: MotorCommand,
  studentEstimates: readonly StudentEstimate[] = [],
): RecordedTick {
  return Object.freeze({
    tick: outputState.tick,
    readingTimeS: inputState.rover.elapsedTimeS,
    readings: rawSensorFrameFromState(inputState.rover, inputState.sensorState),
    command: { ...command },
    studentEstimates: studentEstimates.map((estimate) => Object.freeze({ ...estimate })),
    groundTruthAtReading: inputState.rover,
    groundTruth: outputState.rover,
    sensorStatus: observationStatus(previousSensorState, inputState.sensorState),
  });
}

export function observationStatus(
  previous: SensorRuntimeState,
  current: SensorRuntimeState,
): SensorObservationStatus {
  return Object.freeze({
    gps: statusFor(previous.gps, current.gps),
    compass: statusFor(previous.compass, current.compass),
    encoders: statusFor(previous.encoders, current.encoders),
  });
}

function statusFor(
  previous: Readonly<{ sampleIndex: number; dropped: boolean }>,
  current: Readonly<{ sampleIndex: number; dropped: boolean }>,
): 'fresh' | 'held' | 'dropped' {
  if (current.sampleIndex === previous.sampleIndex) return 'held';
  return current.dropped ? 'dropped' : 'fresh';
}
