import type { BenchmarkReference, ScenarioConfig } from '../domain/simulation/types';
import { scenarioForPreset, type ScenarioPreset } from './presets';

export type MissionBenchmark = Readonly<{
  id: 'open-desert' | 'noisy-gps-crossing' | 'field-recovery' | 'scheduled-fault-recovery';
  name: string;
  description: string;
  sensorProfileId: ScenarioPreset['id'];
  trialCount: number;
  seedStart: number;
  scenario: ScenarioConfig;
}>;

export const missionBenchmarks: readonly MissionBenchmark[] = Object.freeze([
  {
    id: 'open-desert',
    name: 'Open desert qualification',
    description: 'A clear, ideal-sensor route for verifying a navigation stack end to end.',
    sensorProfileId: 'ideal',
    trialCount: 5,
    seedStart: 4100,
    scenario: missionScenario('benchmark-open-desert', 'ideal', { x: 10, y: 12 }, 0, {
      x: 38,
      y: 34,
    }),
  },
  {
    id: 'scheduled-fault-recovery',
    name: 'Scheduled fault recovery',
    description: 'GPS blackout, compass freeze, and encoder slip windows test estimator recovery.',
    sensorProfileId: 'field-sensors',
    trialCount: 7,
    seedStart: 7400,
    scenario: Object.freeze({
      ...missionScenario(
        'benchmark-scheduled-fault-recovery',
        'field-sensors',
        { x: 12, y: 18 },
        0.1,
        { x: 88, y: 78 },
      ),
      faults: Object.freeze({
        gps: Object.freeze([{ startS: 3, endS: 18, mode: 'dropout' as const }]),
        compass: Object.freeze([{ startS: 8, endS: 18, mode: 'freeze' as const }]),
        encoders: Object.freeze([{ startS: 12, endS: 24, mode: 'slip' as const, value: 0.35 }]),
      }),
    }),
  },
  {
    id: 'noisy-gps-crossing',
    name: 'Noisy GPS crossing',
    description: 'A longer route with slow, biased GPS and modest compass/encoder error.',
    sensorProfileId: 'noisy-gps',
    trialCount: 7,
    seedStart: 5200,
    scenario: missionScenario('benchmark-noisy-gps-crossing', 'noisy-gps', { x: 14, y: 16 }, 0.15, {
      x: 82,
      y: 74,
    }),
  },
  {
    id: 'field-recovery',
    name: 'Field sensor recovery',
    description: 'A long field run with low-rate, intermittent, biased measurements.',
    sensorProfileId: 'field-sensors',
    trialCount: 7,
    seedStart: 6300,
    scenario: missionScenario(
      'benchmark-field-recovery',
      'field-sensors',
      { x: 18, y: 84 },
      -0.45,
      { x: 86, y: 24 },
    ),
  },
]);

export function missionBenchmarkForId(id: MissionBenchmark['id']): MissionBenchmark {
  const benchmark = missionBenchmarks.find((candidate) => candidate.id === id);
  if (!benchmark) return missionBenchmarks[0];
  return benchmark;
}

export function benchmarkReference(benchmark: MissionBenchmark): BenchmarkReference {
  return Object.freeze({ id: benchmark.id, name: benchmark.name });
}

function missionScenario(
  id: string,
  sensorProfileId: ScenarioPreset['id'],
  startPosition: Readonly<{ x: number; y: number }>,
  headingRad: number,
  target: Readonly<{ x: number; y: number }>,
): ScenarioConfig {
  const base = scenarioForPreset(sensorProfileId);
  return Object.freeze({
    ...base,
    id,
    start: Object.freeze({ position: Object.freeze({ ...startPosition }), headingRad }),
    target: Object.freeze({ ...target }),
  });
}
