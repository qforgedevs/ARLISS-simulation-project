import type { MonteCarloBatch, MonteCarloSummary, MonteCarloTrial, ScenarioConfig } from './types';
import { summarizeEstimationSummaries } from './estimatorDiagnostics';

export function scenarioWithSeed(config: ScenarioConfig, randomSeed: number): ScenarioConfig {
  return Object.freeze({
    ...config,
    id: `${config.id}-seed-${randomSeed}`,
    sensors: { ...config.sensors, randomSeed },
  });
}

export function summarizeMonteCarlo(trials: readonly MonteCarloTrial[]): MonteCarloSummary {
  const outcomes: Partial<Record<MonteCarloTrial['outcome'], number>> = {};
  let successCount = 0;
  let totalDistanceM = 0;
  let totalElapsedTimeS = 0;
  trials.forEach((trial) => {
    outcomes[trial.outcome] = (outcomes[trial.outcome] ?? 0) + 1;
    if (trial.outcome === 'target_reached') successCount += 1;
    totalDistanceM += trial.finalDistanceM;
    totalElapsedTimeS += trial.elapsedTimeS;
  });
  const count = trials.length;
  return Object.freeze({
    successCount,
    successRate: count === 0 ? 0 : successCount / count,
    meanFinalDistanceM: count === 0 ? 0 : totalDistanceM / count,
    meanElapsedTimeS: count === 0 ? 0 : totalElapsedTimeS / count,
    outcomes: Object.freeze(outcomes),
    estimation: summarizeEstimationSummaries(trials.map((trial) => trial.estimation)),
  });
}

export function updateBatch(batch: MonteCarloBatch, trial: MonteCarloTrial): MonteCarloBatch {
  return Object.freeze({
    ...batch,
    completedTrials: batch.completedTrials + 1,
    trials: [...batch.trials, trial],
  });
}
