import { normalizeAngle } from './math';
import type {
  RawSensorFrame,
  RoverState,
  ScenarioConfig,
  SensorFaultWindow,
  SensorRuntimeState,
  Vec2,
} from './types';

const GPS_STREAM = 0x47_50_53;
const COMPASS_STREAM = 0x43_4d_50;
const ENCODER_STREAM = 0x45_4e_43;

export function createInitialSensorState(
  rover: RoverState,
  config: ScenarioConfig,
): SensorRuntimeState {
  return Object.freeze({
    gps: sampleGps(rover.pose.position, config, 0),
    compass: sampleCompass(rover.pose.headingRad, config, 0, undefined),
    encoders: sampleEncoders(rover, config, 0, undefined),
  });
}

export function updateSensorState(
  previous: SensorRuntimeState,
  rover: RoverState,
  config: ScenarioConfig,
): SensorRuntimeState {
  const gpsSampleIndex = sampleIndexAt(rover.elapsedTimeS, config.sensors.gps.updateRateHz);
  const compassSampleIndex = sampleIndexAt(rover.elapsedTimeS, config.sensors.compass.updateRateHz);
  const encoderSampleIndex = sampleIndexAt(
    rover.elapsedTimeS,
    config.sensors.encoders.updateRateHz,
  );

  return Object.freeze({
    gps:
      activeFault(config.faults?.gps, rover.elapsedTimeS)?.mode === 'dropout' && previous.gps
        ? Object.freeze({
            ...previous.gps,
            valid: false,
            sampleIndex: gpsSampleIndex,
            dropped: true,
          })
        : activeFault(config.faults?.gps, rover.elapsedTimeS)?.mode === 'hold' && previous.gps
          ? Object.freeze({ ...previous.gps, sampleIndex: gpsSampleIndex, dropped: false })
          : gpsSampleIndex === previous.gps.sampleIndex
            ? previous.gps
            : sampleGps(rover.pose.position, config, gpsSampleIndex, previous.gps),
    compass:
      (activeFault(config.faults?.compass, rover.elapsedTimeS)?.mode === 'hold' ||
        activeFault(config.faults?.compass, rover.elapsedTimeS)?.mode === 'freeze') &&
      previous.compass
        ? Object.freeze({ ...previous.compass, sampleIndex: compassSampleIndex, dropped: true })
        : compassSampleIndex === previous.compass.sampleIndex
          ? previous.compass
          : sampleCompass(
              rover.pose.headingRad,
              config,
              compassSampleIndex,
              previous.compass,
              activeFault(config.faults?.compass, rover.elapsedTimeS),
            ),
    encoders:
      (activeFault(config.faults?.encoders, rover.elapsedTimeS)?.mode === 'hold' ||
        activeFault(config.faults?.encoders, rover.elapsedTimeS)?.mode === 'freeze') &&
      previous.encoders
        ? Object.freeze({
            ...previous.encoders,
            leftDeltaTicks: 0,
            rightDeltaTicks: 0,
            sampleIndex: encoderSampleIndex,
            dropped: true,
          })
        : encoderSampleIndex === previous.encoders.sampleIndex
          ? previous.encoders
          : sampleEncoders(
              rover,
              config,
              encoderSampleIndex,
              previous.encoders,
              activeFault(config.faults?.encoders, rover.elapsedTimeS),
            ),
  });
}

export function rawSensorFrameFromState(
  rover: RoverState,
  sensorState: SensorRuntimeState,
): RawSensorFrame {
  return Object.freeze({
    timeS: rover.elapsedTimeS,
    gps: {
      valid: sensorState.gps.valid,
      latitudeDeg: sensorState.gps.latitudeDeg,
      longitudeDeg: sensorState.gps.longitudeDeg,
      horizontalAccuracyM: sensorState.gps.horizontalAccuracyM,
    },
    compass: { headingRad: sensorState.compass.headingRad },
    encoders: {
      leftTicks: sensorState.encoders.leftTicks,
      rightTicks: sensorState.encoders.rightTicks,
      leftDeltaTicks: sensorState.encoders.leftDeltaTicks,
      rightDeltaTicks: sensorState.encoders.rightDeltaTicks,
    },
  });
}

export function worldToGps(
  point: Vec2,
  config: ScenarioConfig,
): {
  latitudeDeg: number;
  longitudeDeg: number;
} {
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude =
    metersPerDegreeLatitude * Math.cos((config.geographicReference.latitudeDeg * Math.PI) / 180);
  return {
    latitudeDeg: config.geographicReference.latitudeDeg + point.y / metersPerDegreeLatitude,
    longitudeDeg: config.geographicReference.longitudeDeg + point.x / metersPerDegreeLongitude,
  };
}

export function gpsToWorld(
  latitudeDeg: number,
  longitudeDeg: number,
  config: ScenarioConfig,
): Vec2 {
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude =
    metersPerDegreeLatitude * Math.cos((config.geographicReference.latitudeDeg * Math.PI) / 180);
  return {
    x: (longitudeDeg - config.geographicReference.longitudeDeg) * metersPerDegreeLongitude,
    y: (latitudeDeg - config.geographicReference.latitudeDeg) * metersPerDegreeLatitude,
  };
}

function sampleGps(
  position: Vec2,
  config: ScenarioConfig,
  sampleIndex: number,
  previous?: SensorRuntimeState['gps'],
): SensorRuntimeState['gps'] {
  const sensor = config.sensors.gps;
  const dropped =
    previous !== undefined &&
    randomUnit(config.sensors.randomSeed, GPS_STREAM, sampleIndex, 0) < sensor.dropoutProbability;
  if (dropped && previous) {
    return Object.freeze({ ...previous, valid: false, sampleIndex, dropped: true });
  }
  const eastNoise =
    randomNormal(config.sensors.randomSeed, GPS_STREAM, sampleIndex, 1) * sensor.noiseStdDevM;
  const northNoise =
    randomNormal(config.sensors.randomSeed, GPS_STREAM, sampleIndex, 3) * sensor.noiseStdDevM;
  const measurement = worldToGps(
    {
      x: position.x + sensor.biasEastM + eastNoise,
      y: position.y + sensor.biasNorthM + northNoise,
    },
    config,
  );
  return Object.freeze({
    valid: !dropped,
    latitudeDeg: measurement.latitudeDeg,
    longitudeDeg: measurement.longitudeDeg,
    horizontalAccuracyM: sensor.horizontalAccuracyM,
    sampleIndex,
    dropped,
  });
}

function sampleCompass(
  headingRad: number,
  config: ScenarioConfig,
  sampleIndex: number,
  previous?: SensorRuntimeState['compass'],
  fault?: SensorFaultWindow,
): SensorRuntimeState['compass'] {
  const sensor = config.sensors.compass;
  const dropped =
    previous !== undefined &&
    randomUnit(config.sensors.randomSeed, COMPASS_STREAM, sampleIndex, 0) <
      sensor.dropoutProbability;
  if (dropped && previous) return Object.freeze({ ...previous, sampleIndex, dropped: true });
  return Object.freeze({
    headingRad: normalizeAngle(
      headingRad +
        sensor.biasRad +
        (fault?.mode === 'bias' ? (fault.value ?? 0) : 0) +
        randomNormal(config.sensors.randomSeed, COMPASS_STREAM, sampleIndex, 1) *
          sensor.noiseStdDevRad,
    ),
    sampleIndex,
    dropped,
  });
}

function sampleEncoders(
  rover: RoverState,
  config: ScenarioConfig,
  sampleIndex: number,
  previous?: SensorRuntimeState['encoders'],
  fault?: SensorFaultWindow,
): SensorRuntimeState['encoders'] {
  const sensor = config.sensors.encoders;
  const dropped =
    previous !== undefined &&
    randomUnit(config.sensors.randomSeed, ENCODER_STREAM, sampleIndex, 0) <
      sensor.dropoutProbability;
  if (dropped && previous) {
    return Object.freeze({
      ...previous,
      leftDeltaTicks: 0,
      rightDeltaTicks: 0,
      sampleIndex,
      dropped: true,
    });
  }
  const metersPerTick =
    (Math.PI * 2 * config.rover.wheelRadiusM) / config.rover.encoderTicksPerRevolution;
  const slipScale =
    1 - (fault?.mode === 'slip' ? (fault.value ?? sensor.slipFraction) : sensor.slipFraction);
  const leftTicks = Math.round(
    (rover.leftWheelTravelledM * slipScale) / metersPerTick +
      sensor.leftBiasTicks +
      randomNormal(config.sensors.randomSeed, ENCODER_STREAM, sampleIndex, 1) *
        sensor.noiseStdDevTicks,
  );
  const rightTicks = Math.round(
    (rover.rightWheelTravelledM * slipScale) / metersPerTick +
      sensor.rightBiasTicks +
      randomNormal(config.sensors.randomSeed, ENCODER_STREAM, sampleIndex, 3) *
        sensor.noiseStdDevTicks,
  );
  return Object.freeze({
    leftTicks,
    rightTicks,
    leftDeltaTicks: leftTicks - (previous?.leftTicks ?? 0),
    rightDeltaTicks: rightTicks - (previous?.rightTicks ?? 0),
    sampleIndex,
    dropped,
  });
}

export function activeFault(
  windows: readonly SensorFaultWindow[] | undefined,
  timeS: number,
): SensorFaultWindow | undefined {
  return windows?.find((fault) => timeS >= fault.startS && timeS < fault.endS);
}

function sampleIndexAt(timeS: number, rateHz: number): number {
  return Math.floor(timeS * rateHz + 1e-9);
}

function randomNormal(
  seed: number,
  stream: number,
  sampleIndex: number,
  dimension: number,
): number {
  const u1 = Math.max(randomUnit(seed, stream, sampleIndex, dimension), Number.MIN_VALUE);
  const u2 = randomUnit(seed, stream, sampleIndex, dimension + 1);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function randomUnit(seed: number, stream: number, sampleIndex: number, dimension: number): number {
  let value = (Math.trunc(seed) >>> 0) ^ stream;
  value = Math.imul(value ^ (sampleIndex >>> 0), 0x9e37_79b1);
  value = Math.imul(value ^ (dimension >>> 0), 0x85eb_ca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb_352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846c_a68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}
