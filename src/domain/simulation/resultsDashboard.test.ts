import { describe, expect, it } from 'vitest';
import { defaultScenario } from '../../scenarios/defaultScenario';
import {
  dashboardRunFromBenchmark,
  dashboardRunFromSuite,
  normalizedLabel,
} from './resultsDashboard';
import type {
  BenchmarkBatchResult,
  BenchmarkSuite,
  MonteCarloBatch,
  MonteCarloTrial,
} from './types';

describe('mission-results dashboard metrics', () => {
  it('derives deterministic benchmark metrics and retains its replay result', () => {
    const result: BenchmarkBatchResult = {
      benchmark: { id: 'test', name: 'Test mission' },
      batch: batch([
        trial('target_reached', 1, 4, { reportedSamples: 2, meanPositionErrorM: 1.5 }),
        trial('student_code_error', 9, 10, { reportedSamples: 1, meanPositionErrorM: 4.5 }),
      ]),
      score: {
        total: 68.5,
        successPoints: 0,
        distancePoints: 0,
        timePoints: 0,
        controllerFailurePenalty: 0,
        controllerFailureCount: 1,
      },
    };

    const run = dashboardRunFromBenchmark(result, '  Filter v1  ');
    expect(run).toMatchObject({
      id: 'dashboard-batch',
      label: 'Filter v1',
      kind: 'benchmark',
      score: 68.5,
      successRate: 0.5,
      meanFinalDistanceM: 5,
      meanElapsedTimeS: 7,
      controllerFailureCount: 1,
      meanPositionErrorM: 2.5,
      benchmarkResult: result,
    });
  });

  it('summarizes suite metrics and labels blank algorithms clearly', () => {
    const result: BenchmarkBatchResult = {
      benchmark: { id: 'test', name: 'Test mission' },
      batch: batch([trial('time_limit_exceeded', 7, 12, { reportedSamples: 0 })]),
      score: {
        total: 25,
        successPoints: 0,
        distancePoints: 0,
        timePoints: 0,
        controllerFailurePenalty: 0,
        controllerFailureCount: 0,
      },
    };
    const suite: BenchmarkSuite = {
      id: 'suite-dashboard',
      status: 'completed',
      totalMissions: 1,
      completedMissions: 1,
      results: [result],
    };

    expect(dashboardRunFromSuite(suite, '  ')).toMatchObject({
      id: 'suite-dashboard',
      label: 'Unlabelled algorithm',
      kind: 'suite',
      score: 25,
      successRate: 0,
      meanFinalDistanceM: 7,
      meanElapsedTimeS: 12,
    });
    expect(normalizedLabel('  navigation stack  ')).toBe('navigation stack');
  });
});

function batch(trials: readonly MonteCarloTrial[]): MonteCarloBatch {
  return {
    id: 'dashboard-batch',
    scenario: defaultScenario,
    controllerSource: 'def update(readings): return MotorCommand(0, 0)',
    status: 'completed',
    totalTrials: trials.length,
    completedTrials: trials.length,
    seedStart: 20,
    trials,
  };
}

function trial(
  outcome: MonteCarloTrial['outcome'],
  finalDistanceM: number,
  elapsedTimeS: number,
  estimation: MonteCarloTrial['estimation'],
): MonteCarloTrial {
  return {
    index: 0,
    seed: 20,
    outcome,
    finalDistanceM,
    elapsedTimeS,
    tick: 0,
    message: outcome,
    estimation,
  };
}
