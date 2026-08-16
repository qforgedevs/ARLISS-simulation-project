import { describe, expect, it } from 'vitest';
import { defaultScenario } from '../../scenarios/defaultScenario';
import {
  createInitialState,
  rawSensorFrame,
  sensorFrame,
  startSimulation,
  stepSimulation,
  validateMotorCommand,
  validateScenario,
} from './simulation';

describe('deterministic simulation core', () => {
  it('integrates straight-line motion with a fixed timestep', () => {
    const initial = startSimulation(createInitialState(defaultScenario));
    const step = stepSimulation(initial, defaultScenario, { left: 1, right: 1 });

    expect(step.state.rover.pose.position.x).toBeCloseTo(10.0288, 8);
    expect(step.state.rover.pose.position.y).toBeCloseTo(12, 8);
    expect(step.state.rover.pose.headingRad).toBe(0);
    expect(step.state.rover.linearVelocityMps).toBeCloseTo(1.44, 8);
    expect(step.state.rover.distanceTravelledM).toBeCloseTo(0.0288, 8);
  });

  it('rotates in place when wheels have opposite commands', () => {
    const initial = startSimulation(createInitialState(defaultScenario));
    const step = stepSimulation(initial, defaultScenario, { left: -1, right: 1 });

    expect(step.state.rover.pose.position).toEqual({ x: 10, y: 12 });
    expect(step.state.rover.angularVelocityRadps).toBeCloseTo(4.64516129, 8);
    expect(step.state.rover.pose.headingRad).toBeCloseTo(0.0929032258, 8);
  });

  it('provides target-relative ideal sensor data', () => {
    const sensors = sensorFrame(createInitialState(defaultScenario), defaultScenario);
    expect(sensors.distanceToTargetM).toBeCloseTo(Math.hypot(28, 22));
    expect(sensors.bearingToTargetRad).toBeCloseTo(Math.atan2(22, 28));
    expect(sensors.timeS).toBe(0);
  });

  it('provides raw GPS, compass, and encoder readings without target-relative fields', () => {
    const initial = startSimulation(createInitialState(defaultScenario));
    const stepped = stepSimulation(initial, defaultScenario, { left: 0, right: 1 }).state;
    const readings = rawSensorFrame(stepped, defaultScenario);

    expect(readings.gps.valid).toBe(true);
    expect(readings.gps.latitudeDeg).toBeGreaterThan(
      defaultScenario.geographicReference.latitudeDeg,
    );
    expect(readings.gps.longitudeDeg).toBeGreaterThan(
      defaultScenario.geographicReference.longitudeDeg,
    );
    expect(readings.compass.headingRad).toBeGreaterThan(0);
    expect(readings.encoders.leftTicks).toBe(0);
    expect(readings.encoders.rightTicks).toBeGreaterThan(0);
    expect(readings).not.toHaveProperty('target');
    expect(readings).not.toHaveProperty('distanceToTargetM');
    expect(readings).not.toHaveProperty('bearingToTargetRad');
  });

  it('holds a measurement until its configured sensor update time', () => {
    const scenario = withSensors({
      gps: { ...defaultScenario.sensors.gps, updateRateHz: 5 },
      compass: { ...defaultScenario.sensors.compass, updateRateHz: 5 },
      encoders: { ...defaultScenario.sensors.encoders, updateRateHz: 5 },
    });
    let state = startSimulation(createInitialState(scenario));
    const initialReadings = rawSensorFrame(state, scenario);
    for (let index = 0; index < 9; index += 1) {
      state = stepSimulation(state, scenario, { left: 1, right: 1 }).state;
    }
    expect(rawSensorFrame(state, scenario).gps).toEqual(initialReadings.gps);
    expect(rawSensorFrame(state, scenario).encoders.leftTicks).toBe(0);

    state = stepSimulation(state, scenario, { left: 1, right: 1 }).state;
    const updatedReadings = rawSensorFrame(state, scenario);
    expect(updatedReadings.gps.longitudeDeg).toBeGreaterThan(initialReadings.gps.longitudeDeg);
    expect(updatedReadings.encoders.leftTicks).toBeGreaterThan(0);
  });

  it('replays noisy sensor measurements exactly for a fixed seed', () => {
    const scenario = withSensors({
      randomSeed: 41,
      gps: { ...defaultScenario.sensors.gps, updateRateHz: 10, noiseStdDevM: 2 },
      compass: { ...defaultScenario.sensors.compass, noiseStdDevRad: 0.08 },
      encoders: { ...defaultScenario.sensors.encoders, noiseStdDevTicks: 1.2 },
    });
    const run = () => {
      let state = startSimulation(createInitialState(scenario));
      for (let index = 0; index < 12; index += 1) {
        state = stepSimulation(state, scenario, { left: 0.4, right: 0.75 }).state;
      }
      return rawSensorFrame(state, scenario);
    };
    expect(run()).toEqual(run());
  });

  it('changes the deterministic noise sequence when the seed changes', () => {
    const sensors = {
      ...defaultScenario.sensors,
      gps: { ...defaultScenario.sensors.gps, noiseStdDevM: 2 },
    };
    const first = rawSensorFrame(
      createInitialState(withSensors({ ...sensors, randomSeed: 1 })),
      defaultScenario,
    );
    const second = rawSensorFrame(
      createInitialState(withSensors({ ...sensors, randomSeed: 2 })),
      defaultScenario,
    );
    expect(first.gps).not.toEqual(second.gps);
  });

  it('reports deterministic GPS dropout and holds compass/encoder samples during dropout', () => {
    const scenario = withSensors({
      gps: { ...defaultScenario.sensors.gps, dropoutProbability: 1 },
      compass: { ...defaultScenario.sensors.compass, dropoutProbability: 1 },
      encoders: { ...defaultScenario.sensors.encoders, dropoutProbability: 1 },
    });
    let state = startSimulation(createInitialState(scenario));
    const initial = rawSensorFrame(state, scenario);
    state = stepSimulation(state, scenario, { left: -1, right: 1 }).state;
    const dropped = rawSensorFrame(state, scenario);
    expect(dropped.gps.valid).toBe(false);
    expect(dropped.gps.latitudeDeg).toBe(initial.gps.latitudeDeg);
    expect(dropped.compass.headingRad).toBe(initial.compass.headingRad);
    expect(dropped.encoders).toEqual({
      leftTicks: 0,
      rightTicks: 0,
      leftDeltaTicks: 0,
      rightDeltaTicks: 0,
    });
  });

  it('finishes when a target radius is entered', () => {
    const scenario = { ...defaultScenario, target: { x: 10, y: 12 }, targetRadiusM: 1 };
    const state = createInitialState(scenario);
    expect(state.phase).toBe('finished');
    expect(state.result?.outcome).toBe('target_reached');
  });

  it('finishes on the time-limit boundary', () => {
    const scenario = { ...defaultScenario, timeLimitS: defaultScenario.fixedDtS };
    const state = stepSimulation(startSimulation(createInitialState(scenario)), scenario, {
      left: 0,
      right: 0,
    }).state;
    expect(state.phase).toBe('finished');
    expect(state.result?.outcome).toBe('time_limit_exceeded');
  });

  it('replays the same commands exactly after reset', () => {
    const run = () => {
      let state = startSimulation(createInitialState(defaultScenario));
      for (const command of [
        { left: 0.2, right: 0.7 },
        { left: 0.4, right: 0.6 },
        { left: 0, right: 0 },
      ]) {
        state = stepSimulation(state, defaultScenario, command).state;
      }
      return state;
    };
    expect(run()).toEqual(run());
  });

  it('applies deterministic scheduled GPS outages and encoder slip without widening raw readings', () => {
    const scenario = {
      ...defaultScenario,
      fixedDtS: 1,
      sensors: {
        ...defaultScenario.sensors,
        gps: { ...defaultScenario.sensors.gps, updateRateHz: 1 },
        compass: { ...defaultScenario.sensors.compass, updateRateHz: 1 },
        encoders: { ...defaultScenario.sensors.encoders, updateRateHz: 1 },
      },
      faults: {
        gps: [{ startS: 1, endS: 3, mode: 'dropout' as const }],
        compass: [],
        encoders: [{ startS: 1, endS: 3, mode: 'slip' as const, value: 0.5 }],
      },
    };
    const state = stepSimulation(startSimulation(createInitialState(scenario)), scenario, {
      left: 1,
      right: 1,
    }).state;
    const readings = rawSensorFrame(state, scenario);
    expect(readings.gps.valid).toBe(false);
    expect(readings.encoders.leftTicks).toBeGreaterThan(0);
  });

  it('rejects invalid physical setup and motor commands', () => {
    expect(validateScenario({ ...defaultScenario, fixedDtS: 0 })).toMatch('positive');
    expect(
      validateScenario(
        withSensors({ gps: { ...defaultScenario.sensors.gps, dropoutProbability: 2 } }),
      ),
    ).toMatch('dropouts');
    expect(validateMotorCommand({ left: Number.NaN, right: 0 })).toMatch('finite');
    expect(validateMotorCommand({ left: 2, right: 0 })).toMatch('between');
  });
});

function withSensors(sensors: Partial<typeof defaultScenario.sensors>) {
  return {
    ...defaultScenario,
    sensors: {
      ...defaultScenario.sensors,
      ...sensors,
    },
  };
}
