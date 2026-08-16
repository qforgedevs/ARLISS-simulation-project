import type { ScenarioConfig, SensorProfile } from '../domain/simulation/types';
import { defaultScenario } from './defaultScenario';

export type ScenarioPreset = Readonly<{
  id: 'ideal' | 'noisy-gps' | 'field-sensors';
  label: string;
  description: string;
  scenario: ScenarioConfig;
}>;

const noisyGpsSensors: SensorProfile = Object.freeze({
  randomSeed: 2026,
  gps: {
    updateRateHz: 5,
    noiseStdDevM: 2.5,
    biasEastM: 4,
    biasNorthM: -2,
    horizontalAccuracyM: 5,
    dropoutProbability: 0.08,
  },
  compass: {
    updateRateHz: 20,
    noiseStdDevRad: degreesToRadians(2.5),
    biasRad: degreesToRadians(4),
    dropoutProbability: 0.02,
  },
  encoders: {
    updateRateHz: 25,
    noiseStdDevTicks: 0.8,
    leftBiasTicks: 3,
    rightBiasTicks: -2,
    slipFraction: 0.03,
    dropoutProbability: 0.01,
  },
});

const fieldSensors: SensorProfile = Object.freeze({
  randomSeed: 2026,
  gps: {
    updateRateHz: 1,
    noiseStdDevM: 5,
    biasEastM: 8,
    biasNorthM: -5,
    horizontalAccuracyM: 10,
    dropoutProbability: 0.2,
  },
  compass: {
    updateRateHz: 10,
    noiseStdDevRad: degreesToRadians(6),
    biasRad: degreesToRadians(-8),
    dropoutProbability: 0.1,
  },
  encoders: {
    updateRateHz: 10,
    noiseStdDevTicks: 1.5,
    leftBiasTicks: 8,
    rightBiasTicks: -5,
    slipFraction: 0.12,
    dropoutProbability: 0.08,
  },
});

export const scenarioPresets: readonly ScenarioPreset[] = Object.freeze([
  {
    id: 'ideal',
    label: 'Ideal sensors',
    description: '50 Hz, no measurement error or dropouts. Best for first controller tests.',
    scenario: defaultScenario,
  },
  {
    id: 'noisy-gps',
    label: 'Noisy GPS',
    description: 'Slower GPS with bias/noise plus modest compass and encoder imperfections.',
    scenario: withSensors('noisy-gps-navigation', noisyGpsSensors),
  },
  {
    id: 'field-sensors',
    label: 'Field sensors',
    description: 'Low-rate GPS and intermittent, biased compass/encoder observations.',
    scenario: withSensors('field-sensor-navigation', fieldSensors),
  },
]);

export function scenarioForPreset(id: ScenarioPreset['id']): ScenarioConfig {
  const preset = scenarioPresets.find((candidate) => candidate.id === id);
  if (!preset) return defaultScenario;
  return preset.scenario;
}

function withSensors(id: string, sensors: SensorProfile): ScenarioConfig {
  return Object.freeze({ ...defaultScenario, id, sensors });
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
