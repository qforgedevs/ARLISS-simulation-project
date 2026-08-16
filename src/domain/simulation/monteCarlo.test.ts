import { describe, expect, it } from 'vitest';
import { defaultScenario } from '../../scenarios/defaultScenario';
import { scenarioWithSeed, summarizeMonteCarlo, updateBatch } from './monteCarlo';
import type { MonteCarloBatch, MonteCarloTrial } from './types';

describe('Monte Carlo utilities', () => {
  it('creates an isolated scenario with a deterministic seed', () => {
    const seeded = scenarioWithSeed(defaultScenario, 77);
    expect(seeded.sensors.randomSeed).toBe(77);
    expect(seeded.id).toContain('seed-77');
    expect(defaultScenario.sensors.randomSeed).toBe(2026);
  });

  it('summarizes outcome, distance, and elapsed-time statistics', () => {
    const summary = summarizeMonteCarlo([
      trial(0, 10, 'target_reached', 2, 12),
      trial(1, 11, 'time_limit_exceeded', 8, 20),
      trial(2, 12, 'student_code_timeout', 5, 18),
    ]);
    expect(summary.successCount).toBe(1);
    expect(summary.successRate).toBeCloseTo(1 / 3);
    expect(summary.meanFinalDistanceM).toBeCloseTo(5);
    expect(summary.meanElapsedTimeS).toBeCloseTo(50 / 3);
    expect(summary.outcomes.time_limit_exceeded).toBe(1);
    expect(summary.outcomes.student_code_timeout).toBe(1);
    expect(summary.estimation.reportedSamples).toBe(0);
  });

  it('adds completed trials without mutating the prior batch snapshot', () => {
    const batch: MonteCarloBatch = {
      id: 'batch-test',
      scenario: defaultScenario,
      controllerSource: 'def update(readings): return MotorCommand(0, 0)',
      status: 'running',
      totalTrials: 2,
      completedTrials: 0,
      seedStart: 4,
      trials: [],
    };
    const updated = updateBatch(batch, trial(0, 4, 'target_reached', 1, 3));
    expect(batch.completedTrials).toBe(0);
    expect(updated.completedTrials).toBe(1);
    expect(updated.trials[0]?.seed).toBe(4);
  });
});

function trial(
  index: number,
  seed: number,
  outcome: MonteCarloTrial['outcome'],
  finalDistanceM: number,
  elapsedTimeS: number,
): MonteCarloTrial {
  return {
    index,
    seed,
    outcome,
    finalDistanceM,
    elapsedTimeS,
    tick: Math.round(elapsedTimeS * 50),
    message: outcome,
    estimation: { reportedSamples: 0 },
  };
}
