import { summarizeMonteCarlo } from './monteCarlo';
import type {
  BenchmarkBatchResult,
  BenchmarkScore,
  BenchmarkSuiteSummary,
  MonteCarloBatch,
  ScenarioConfig,
} from './types';

export const BENCHMARK_RUBRIC = Object.freeze({
  successPoints: 60,
  distancePoints: 25,
  timePoints: 15,
  controllerFailurePenalty: 20,
});

export function scoreBenchmarkBatch(
  batch: MonteCarloBatch,
  scenario: ScenarioConfig,
): BenchmarkScore {
  const summary = summarizeMonteCarlo(batch.trials);
  const initialDistanceM = Math.hypot(
    scenario.target.x - scenario.start.position.x,
    scenario.target.y - scenario.start.position.y,
  );
  const distanceSpanM = Math.max(0.000_001, initialDistanceM - scenario.targetRadiusM);
  const meanProgress = mean(
    batch.trials.map((trial) => clamp01((initialDistanceM - trial.finalDistanceM) / distanceSpanM)),
  );
  const successfulTrials = batch.trials.filter((trial) => trial.outcome === 'target_reached');
  const meanSuccessfulTimeFraction = mean(
    successfulTrials.map((trial) => clamp01(1 - trial.elapsedTimeS / scenario.timeLimitS)),
  );
  const controllerFailureCount = batch.trials.filter(
    (trial) => trial.outcome === 'student_code_error' || trial.outcome === 'student_code_timeout',
  ).length;
  const count = batch.trials.length;
  const controllerFailurePenalty =
    count === 0 ? 0 : (BENCHMARK_RUBRIC.controllerFailurePenalty * controllerFailureCount) / count;
  const successPoints = BENCHMARK_RUBRIC.successPoints * summary.successRate;
  const distancePoints = BENCHMARK_RUBRIC.distancePoints * meanProgress;
  const timePoints = BENCHMARK_RUBRIC.timePoints * meanSuccessfulTimeFraction;

  return Object.freeze({
    total: roundScore(
      Math.max(0, successPoints + distancePoints + timePoints - controllerFailurePenalty),
    ),
    successPoints: roundScore(successPoints),
    distancePoints: roundScore(distancePoints),
    timePoints: roundScore(timePoints),
    controllerFailurePenalty: roundScore(controllerFailurePenalty),
    controllerFailureCount,
  });
}

export function summarizeBenchmarkSuite(
  results: readonly BenchmarkBatchResult[],
): BenchmarkSuiteSummary {
  const trials = results.flatMap((result) => result.batch.trials);
  const summary = summarizeMonteCarlo(trials);
  const controllerFailureCount = results.reduce(
    (count, result) => count + result.score.controllerFailureCount,
    0,
  );
  return Object.freeze({
    overallScore: roundScore(mean(results.map((result) => result.score.total))),
    successRate: summary.successRate,
    meanFinalDistanceM: summary.meanFinalDistanceM,
    meanElapsedTimeS: summary.meanElapsedTimeS,
    controllerFailureCount,
    estimation: summary.estimation,
  });
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}
