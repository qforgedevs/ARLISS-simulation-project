import { describe, expect, it } from 'vitest';
import { defaultScenario } from '../../scenarios/defaultScenario';
import { scoreBenchmarkBatch, summarizeBenchmarkSuite } from './benchmarks';
import type { BenchmarkBatchResult, MonteCarloBatch, MonteCarloTrial } from './types';

describe('benchmark scoring', () => {
  it('scores success, distance, time, and controller failures deterministically', () => {
    const score = scoreBenchmarkBatch(
      batch([
        trial('target_reached', 1, 60),
        trial('time_limit_exceeded', 10, 180),
        trial('student_code_timeout', 20, 12),
      ]),
      defaultScenario,
    );

    expect(score.successPoints).toBe(20);
    expect(score.distancePoints).toBeCloseTo(18.9, 1);
    expect(score.timePoints).toBe(10);
    expect(score.controllerFailurePenalty).toBeCloseTo(6.7, 1);
    expect(score.controllerFailureCount).toBe(1);
    expect(score.total).toBeCloseTo(42.2, 1);
  });

  it('does not award time points when no trial reaches the target', () => {
    const score = scoreBenchmarkBatch(
      batch([trial('time_limit_exceeded', 8, 180)]),
      defaultScenario,
    );

    expect(score.timePoints).toBe(0);
    expect(score.total).toBeGreaterThan(0);
    expect(score.total).toBeLessThan(25);
  });

  it('summarizes completed mission scores and all underlying trials', () => {
    const first = batch([
      {
        ...trial('target_reached', 1, 30),
        estimation: {
          reportedSamples: 2,
          meanPositionErrorM: 1,
          finalPositionErrorM: 1,
          meanHeadingErrorDeg: 2,
          finalHeadingErrorDeg: 2,
        },
      },
    ]);
    const second = batch([
      {
        ...trial('student_code_error', 20, 2),
        estimation: {
          reportedSamples: 1,
          meanPositionErrorM: 4,
          finalPositionErrorM: 4,
          meanHeadingErrorDeg: 8,
          finalHeadingErrorDeg: 8,
        },
      },
    ]);
    const results: readonly BenchmarkBatchResult[] = [result(first, 70), result(second, 10)];

    const summary = summarizeBenchmarkSuite(results);
    expect(summary.overallScore).toBe(40);
    expect(summary.successRate).toBe(0.5);
    expect(summary.meanFinalDistanceM).toBe(10.5);
    expect(summary.meanElapsedTimeS).toBe(16);
    expect(summary.controllerFailureCount).toBe(1);
    expect(summary.estimation.reportedSamples).toBe(3);
    expect(summary.estimation.meanPositionErrorM).toBeCloseTo(2);
    expect(summary.estimation.meanHeadingErrorDeg).toBeCloseTo(4);
  });
});

function batch(trials: readonly MonteCarloTrial[]): MonteCarloBatch {
  return {
    id: 'benchmark-test',
    benchmark: { id: 'open-desert', name: 'Open desert qualification' },
    scenario: defaultScenario,
    controllerSource: 'def update(readings): return MotorCommand(0, 0)',
    status: 'completed',
    totalTrials: trials.length,
    completedTrials: trials.length,
    seedStart: 100,
    trials,
  };
}

function result(batchResult: MonteCarloBatch, score: number): BenchmarkBatchResult {
  return {
    batch: batchResult,
    benchmark: { id: `mission-${score}`, name: `Mission ${score}` },
    score: {
      total: score,
      successPoints: 0,
      distancePoints: 0,
      timePoints: 0,
      controllerFailurePenalty: 0,
      controllerFailureCount: batchResult.trials.filter(
        (trial) =>
          trial.outcome === 'student_code_error' || trial.outcome === 'student_code_timeout',
      ).length,
    },
  };
}

function trial(
  outcome: MonteCarloTrial['outcome'],
  finalDistanceM: number,
  elapsedTimeS: number,
): MonteCarloTrial {
  return {
    index: 0,
    seed: 100,
    outcome,
    finalDistanceM,
    elapsedTimeS,
    tick: Math.round(elapsedTimeS / defaultScenario.fixedDtS),
    message: outcome,
    estimation: { reportedSamples: 0 },
  };
}
