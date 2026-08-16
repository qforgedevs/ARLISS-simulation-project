import { bearingToTarget, distance, isFiniteNumber, normalizeAngle } from './math';
import {
  createInitialSensorState,
  rawSensorFrameFromState,
  updateSensorState,
  worldToGps,
} from './sensors';
import type {
  MotorCommand,
  Mission,
  RawSensorFrame,
  RoverState,
  RunOutcome,
  RunResult,
  ScenarioConfig,
  SensorFrame,
  SimulationState,
  SimulationStep,
} from './types';

export const STOP_COMMAND: MotorCommand = Object.freeze({ left: 0, right: 0 });

export function validateScenario(config: ScenarioConfig): string | undefined {
  const numbers = [
    config.mapBoundsM.minX,
    config.mapBoundsM.maxX,
    config.mapBoundsM.minY,
    config.mapBoundsM.maxY,
    config.start.position.x,
    config.start.position.y,
    config.start.headingRad,
    config.target.x,
    config.target.y,
    config.targetRadiusM,
    config.geographicReference.latitudeDeg,
    config.geographicReference.longitudeDeg,
    config.timeLimitS,
    config.fixedDtS,
    config.rover.wheelRadiusM,
    config.rover.trackWidthM,
    config.rover.maxWheelSpeedRadps,
    config.rover.encoderTicksPerRevolution,
    config.sensors.randomSeed,
    config.sensors.gps.updateRateHz,
    config.sensors.gps.noiseStdDevM,
    config.sensors.gps.biasEastM,
    config.sensors.gps.biasNorthM,
    config.sensors.gps.horizontalAccuracyM,
    config.sensors.gps.dropoutProbability,
    config.sensors.compass.updateRateHz,
    config.sensors.compass.noiseStdDevRad,
    config.sensors.compass.biasRad,
    config.sensors.compass.dropoutProbability,
    config.sensors.encoders.updateRateHz,
    config.sensors.encoders.noiseStdDevTicks,
    config.sensors.encoders.leftBiasTicks,
    config.sensors.encoders.rightBiasTicks,
    config.sensors.encoders.slipFraction,
    config.sensors.encoders.dropoutProbability,
  ];
  if (!numbers.every(isFiniteNumber)) return 'Scenario values must all be finite numbers.';
  if (
    config.mapBoundsM.minX >= config.mapBoundsM.maxX ||
    config.mapBoundsM.minY >= config.mapBoundsM.maxY
  ) {
    return 'Map bounds must have a positive width and height.';
  }
  if (config.targetRadiusM <= 0 || config.timeLimitS <= 0 || config.fixedDtS <= 0) {
    return 'Target radius, time limit, and timestep must be positive.';
  }
  if (
    config.rover.wheelRadiusM <= 0 ||
    config.rover.trackWidthM <= 0 ||
    config.rover.maxWheelSpeedRadps <= 0 ||
    config.rover.encoderTicksPerRevolution <= 0
  ) {
    return 'Rover dimensions and maximum wheel speed must be positive.';
  }
  if (
    !Number.isInteger(config.sensors.randomSeed) ||
    config.sensors.gps.updateRateHz <= 0 ||
    config.sensors.compass.updateRateHz <= 0 ||
    config.sensors.encoders.updateRateHz <= 0
  ) {
    return 'Sensor seed must be an integer and sensor update rates must be positive.';
  }
  if (
    config.sensors.gps.noiseStdDevM < 0 ||
    config.sensors.gps.horizontalAccuracyM < 0 ||
    config.sensors.compass.noiseStdDevRad < 0 ||
    config.sensors.encoders.noiseStdDevTicks < 0 ||
    config.sensors.encoders.slipFraction < 0 ||
    config.sensors.encoders.slipFraction >= 1 ||
    ![
      config.sensors.gps.dropoutProbability,
      config.sensors.compass.dropoutProbability,
      config.sensors.encoders.dropoutProbability,
    ].every((probability) => probability >= 0 && probability <= 1)
  ) {
    return 'Sensor noise must be non-negative, dropouts must be between 0 and 1, and encoder slip must be below 1.';
  }
  const withinBounds = (point: { x: number; y: number }) =>
    point.x >= config.mapBoundsM.minX &&
    point.x <= config.mapBoundsM.maxX &&
    point.y >= config.mapBoundsM.minY &&
    point.y <= config.mapBoundsM.maxY;
  if (!withinBounds(config.start.position) || !withinBounds(config.target)) {
    return 'Start and target positions must be inside the map bounds.';
  }
  return undefined;
}

export function validateMotorCommand(command: MotorCommand): string | undefined {
  if (!isFiniteNumber(command.left) || !isFiniteNumber(command.right)) {
    return 'Motor command values must be finite numbers.';
  }
  if (command.left < -1 || command.left > 1 || command.right < -1 || command.right > 1) {
    return 'Motor command values must be between -1.0 and 1.0.';
  }
  return undefined;
}

export function createInitialState(config: ScenarioConfig): SimulationState {
  const validationError = validateScenario(config);
  if (validationError) throw new Error(validationError);

  const rover = initialRoverState(config);
  const sensorState = createInitialSensorState(rover, config);
  const initialResult = targetResultIfReached(rover, config, 0);
  return Object.freeze({
    phase: initialResult ? 'finished' : 'ready',
    tick: 0,
    rover,
    sensorState,
    trajectory: Object.freeze([{ ...rover.pose.position }]),
    lastCommand: STOP_COMMAND,
    result: initialResult,
  });
}

export function startSimulation(state: SimulationState): SimulationState {
  if (state.phase !== 'ready' && state.phase !== 'paused') return state;
  return { ...state, phase: 'running' };
}

export function pauseSimulation(state: SimulationState): SimulationState {
  return state.phase === 'running' ? { ...state, phase: 'paused' } : state;
}

export function stopSimulation(state: SimulationState): SimulationState {
  if (state.phase === 'finished') return state;
  return finish(state, 'stopped_by_user', 'Simulation stopped by user.');
}

export function sensorFrame(state: SimulationState, config: ScenarioConfig): SensorFrame {
  const { position, headingRad } = state.rover.pose;
  return Object.freeze({
    position: { ...position },
    headingRad,
    target: { ...config.target },
    distanceToTargetM: distance(position, config.target),
    bearingToTargetRad: bearingToTarget(position, headingRad, config.target),
    timeS: state.rover.elapsedTimeS,
  });
}

export function missionFromScenario(config: ScenarioConfig): Mission {
  const target = worldToGps(config.target, config);
  return Object.freeze({
    targetLatitudeDeg: target.latitudeDeg,
    targetLongitudeDeg: target.longitudeDeg,
    targetRadiusM: config.targetRadiusM,
  });
}

export function rawSensorFrame(state: SimulationState, config: ScenarioConfig): RawSensorFrame {
  void config;
  return rawSensorFrameFromState(state.rover, state.sensorState);
}

export function stepSimulation(
  state: SimulationState,
  config: ScenarioConfig,
  command: MotorCommand,
): SimulationStep {
  if (state.phase === 'finished')
    return { state, telemetry: telemetryFor(state, config, state.lastCommand) };
  const commandError = validateMotorCommand(command);
  if (commandError) throw new Error(commandError);

  const nextRover = integrate(state.rover, config, command);
  const nextSensorState = updateSensorState(state.sensorState, nextRover, config);
  const nextTick = state.tick + 1;
  let nextState: SimulationState = {
    phase: state.phase,
    tick: nextTick,
    rover: nextRover,
    sensorState: nextSensorState,
    trajectory: [...state.trajectory, { ...nextRover.pose.position }],
    lastCommand: { ...command },
  };

  const targetResult = targetResultIfReached(nextRover, config, nextTick);
  if (targetResult) nextState = { ...nextState, phase: 'finished', result: targetResult };
  else if (nextRover.elapsedTimeS >= config.timeLimitS) {
    nextState = {
      ...nextState,
      phase: 'finished',
      result: createResult(
        nextRover,
        nextTick,
        'time_limit_exceeded',
        'Simulation time limit exceeded.',
      ),
    };
  }
  return { state: nextState, telemetry: telemetryFor(nextState, config, command) };
}

export function controllerFailure(
  state: SimulationState,
  outcome: Extract<RunOutcome, 'student_code_error' | 'student_code_timeout'>,
  message: string,
  error?: RunResult['error'],
): SimulationState {
  return {
    ...state,
    phase: 'finished',
    result: createResult(state.rover, state.tick, outcome, message, error),
  };
}

function initialRoverState(config: ScenarioConfig): RoverState {
  return Object.freeze({
    pose: {
      position: { ...config.start.position },
      headingRad: normalizeAngle(config.start.headingRad),
    },
    linearVelocityMps: 0,
    angularVelocityRadps: 0,
    distanceTravelledM: 0,
    elapsedTimeS: 0,
    leftEncoderTicks: 0,
    rightEncoderTicks: 0,
    leftEncoderDeltaTicks: 0,
    rightEncoderDeltaTicks: 0,
    leftWheelTravelledM: 0,
    rightWheelTravelledM: 0,
  });
}

function integrate(state: RoverState, config: ScenarioConfig, command: MotorCommand): RoverState {
  const { wheelRadiusM: radius, trackWidthM: track, maxWheelSpeedRadps: maxSpeed } = config.rover;
  const leftAngularVelocity = command.left * maxSpeed;
  const rightAngularVelocity = command.right * maxSpeed;
  const linearVelocity = (radius * (rightAngularVelocity + leftAngularVelocity)) / 2;
  const angularVelocity = (radius * (rightAngularVelocity - leftAngularVelocity)) / track;
  const dt = config.fixedDtS;
  const midpointHeading = state.pose.headingRad + (angularVelocity * dt) / 2;
  const headingRad = normalizeAngle(state.pose.headingRad + angularVelocity * dt);
  const position = {
    x: state.pose.position.x + linearVelocity * Math.cos(midpointHeading) * dt,
    y: state.pose.position.y + linearVelocity * Math.sin(midpointHeading) * dt,
  };
  const metersPerTick = (Math.PI * 2 * radius) / config.rover.encoderTicksPerRevolution;
  const leftWheelTravelledM = state.leftWheelTravelledM + radius * leftAngularVelocity * dt;
  const rightWheelTravelledM = state.rightWheelTravelledM + radius * rightAngularVelocity * dt;
  const leftEncoderTicks = Math.round(leftWheelTravelledM / metersPerTick);
  const rightEncoderTicks = Math.round(rightWheelTravelledM / metersPerTick);
  return Object.freeze({
    pose: { position, headingRad },
    linearVelocityMps: linearVelocity,
    angularVelocityRadps: angularVelocity,
    distanceTravelledM: state.distanceTravelledM + Math.abs(linearVelocity) * dt,
    elapsedTimeS: state.elapsedTimeS + dt,
    leftEncoderTicks,
    rightEncoderTicks,
    leftEncoderDeltaTicks: leftEncoderTicks - state.leftEncoderTicks,
    rightEncoderDeltaTicks: rightEncoderTicks - state.rightEncoderTicks,
    leftWheelTravelledM,
    rightWheelTravelledM,
  });
}

function targetResultIfReached(
  rover: RoverState,
  config: ScenarioConfig,
  tick: number,
): RunResult | undefined {
  if (distance(rover.pose.position, config.target) > config.targetRadiusM) return undefined;
  return createResult(rover, tick, 'target_reached', 'Target reached.');
}

function finish(state: SimulationState, outcome: RunOutcome, message: string): SimulationState {
  return {
    ...state,
    phase: 'finished',
    result: createResult(state.rover, state.tick, outcome, message),
  };
}

function createResult(
  finalState: RoverState,
  tick: number,
  outcome: RunOutcome,
  message: string,
  error?: RunResult['error'],
): RunResult {
  return Object.freeze({
    outcome,
    finishedAtS: finalState.elapsedTimeS,
    tick,
    finalState,
    message,
    error,
  });
}

function telemetryFor(state: SimulationState, config: ScenarioConfig, command: MotorCommand) {
  return Object.freeze({
    tick: state.tick,
    state: state.rover,
    sensors: sensorFrame(state, config),
    command,
  });
}
