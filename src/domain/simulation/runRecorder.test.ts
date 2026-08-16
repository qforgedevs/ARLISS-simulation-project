import { describe, expect, it } from 'vitest';
import { defaultScenario } from '../../scenarios/defaultScenario';
import { createInitialRecord, recordSimulationTick } from './runRecorder';
import { createInitialState, rawSensorFrame, startSimulation, stepSimulation } from './simulation';

describe('run recorder', () => {
  it('records the exact raw input, accepted command, and private output truth for a tick', () => {
    const input = startSimulation(createInitialState(defaultScenario));
    const command = { left: 0.2, right: 0.7 };
    const output = stepSimulation(input, defaultScenario, command).state;
    const record = recordSimulationTick(input.sensorState, input, output, command);

    expect(createInitialRecord(input).readings).toEqual(rawSensorFrame(input, defaultScenario));
    expect(record.readings).toEqual(rawSensorFrame(input, defaultScenario));
    expect(record.command).toEqual(command);
    expect(record.studentEstimates).toEqual([]);
    expect(record.groundTruthAtReading).toBe(input.rover);
    expect(record.groundTruth).toBe(output.rover);
    expect(record.tick).toBe(output.tick);
    expect(record.sensorStatus).toEqual({ gps: 'held', compass: 'held', encoders: 'held' });
  });

  it('distinguishes fresh samples from deterministic dropped samples', () => {
    const command = { left: 0, right: 1 };
    const initial = startSimulation(createInitialState(defaultScenario));
    const firstOutput = stepSimulation(initial, defaultScenario, command).state;
    const secondOutput = stepSimulation(firstOutput, defaultScenario, command).state;
    const fresh = recordSimulationTick(initial.sensorState, firstOutput, secondOutput, command);
    expect(fresh.sensorStatus).toEqual({ gps: 'fresh', compass: 'fresh', encoders: 'fresh' });

    const dropoutScenario = {
      ...defaultScenario,
      sensors: {
        ...defaultScenario.sensors,
        gps: { ...defaultScenario.sensors.gps, dropoutProbability: 1 },
        compass: { ...defaultScenario.sensors.compass, dropoutProbability: 1 },
        encoders: { ...defaultScenario.sensors.encoders, dropoutProbability: 1 },
      },
    };
    const dropoutInitial = startSimulation(createInitialState(dropoutScenario));
    const dropoutOutput = stepSimulation(dropoutInitial, dropoutScenario, command).state;
    const dropped = recordSimulationTick(
      dropoutInitial.sensorState,
      dropoutOutput,
      stepSimulation(dropoutOutput, dropoutScenario, command).state,
      command,
    );
    expect(dropped.sensorStatus).toEqual({
      gps: 'dropped',
      compass: 'dropped',
      encoders: 'dropped',
    });
  });
});
