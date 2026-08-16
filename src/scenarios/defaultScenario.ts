import type { ScenarioConfig } from '../domain/simulation/types';

export const defaultScenario: ScenarioConfig = Object.freeze({
  id: 'desert-navigation-intro',
  mapBoundsM: { minX: -10, maxX: 110, minY: -10, maxY: 110 },
  start: { position: { x: 10, y: 12 }, headingRad: 0 },
  target: { x: 38, y: 34 },
  targetRadiusM: 3,
  geographicReference: { latitudeDeg: 40.7864, longitudeDeg: -119.2065 },
  timeLimitS: 180,
  fixedDtS: 0.02,
  rover: {
    wheelRadiusM: 0.12,
    trackWidthM: 0.62,
    maxWheelSpeedRadps: 12,
    encoderTicksPerRevolution: 360,
  },
  sensors: {
    randomSeed: 2026,
    gps: {
      updateRateHz: 50,
      noiseStdDevM: 0,
      biasEastM: 0,
      biasNorthM: 0,
      horizontalAccuracyM: 0,
      dropoutProbability: 0,
    },
    compass: {
      updateRateHz: 50,
      noiseStdDevRad: 0,
      biasRad: 0,
      dropoutProbability: 0,
    },
    encoders: {
      updateRateHz: 50,
      noiseStdDevTicks: 0,
      leftBiasTicks: 0,
      rightBiasTicks: 0,
      slipFraction: 0,
      dropoutProbability: 0,
    },
  },
  faults: { gps: [], compass: [], encoders: [] },
});
