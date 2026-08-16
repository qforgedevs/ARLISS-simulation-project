import { summarizeBenchmarkSuite } from './benchmarks';
import { summarizeMonteCarlo } from './monteCarlo';
import type { BenchmarkBatchResult, BenchmarkSuite } from './types';

export type DashboardRun = Readonly<{
  id: string;
  label: string;
  kind: 'benchmark' | 'suite';
  score: number;
  successRate: number;
  meanFinalDistanceM: number;
  meanElapsedTimeS: number;
  controllerFailureCount: number;
  meanPositionErrorM?: number;
  benchmarkResult?: BenchmarkBatchResult;
}>;

export function dashboardRunFromBenchmark(
  result: BenchmarkBatchResult,
  label: string,
): DashboardRun {
  const summary = summarizeMonteCarlo(result.batch.trials);
  return Object.freeze({
    id: result.batch.id,
    label: normalizedLabel(label),
    kind: 'benchmark',
    score: result.score.total,
    successRate: summary.successRate,
    meanFinalDistanceM: summary.meanFinalDistanceM,
    meanElapsedTimeS: summary.meanElapsedTimeS,
    controllerFailureCount: result.score.controllerFailureCount,
    meanPositionErrorM: summary.estimation.meanPositionErrorM,
    benchmarkResult: result,
  });
}

export function dashboardRunFromSuite(suite: BenchmarkSuite, label: string): DashboardRun {
  const summary = summarizeBenchmarkSuite(suite.results);
  return Object.freeze({
    id: suite.id,
    label: normalizedLabel(label),
    kind: 'suite',
    score: summary.overallScore,
    successRate: summary.successRate,
    meanFinalDistanceM: summary.meanFinalDistanceM,
    meanElapsedTimeS: summary.meanElapsedTimeS,
    controllerFailureCount: summary.controllerFailureCount,
    meanPositionErrorM: summary.estimation.meanPositionErrorM,
  });
}

export function normalizedLabel(label: string): string {
  return label.trim() || 'Unlabelled algorithm';
}
