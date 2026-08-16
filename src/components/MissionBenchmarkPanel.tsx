import { BENCHMARK_RUBRIC } from '../domain/simulation/benchmarks';
import { summarizeMonteCarlo } from '../domain/simulation/monteCarlo';
import type { BenchmarkBatchResult } from '../domain/simulation/types';
import type { SessionPhase } from '../features/simulation/simulationSession';
import { missionBenchmarks, type MissionBenchmark } from '../scenarios/missionBenchmarks';

type MissionBenchmarkPanelProps = Readonly<{
  selectedId?: MissionBenchmark['id'];
  phase: SessionPhase;
  results: readonly BenchmarkBatchResult[];
  onSelect: (id: MissionBenchmark['id']) => void;
  onRun: (benchmark: MissionBenchmark) => void;
}>;

export function MissionBenchmarkPanel({
  selectedId,
  phase,
  results,
  onSelect,
  onRun,
}: MissionBenchmarkPanelProps) {
  const selected = missionBenchmarks.find((benchmark) => benchmark.id === selectedId);
  const canRun = phase === 'ready' || phase === 'finished' || phase === 'setup_error';

  return (
    <section className="panel benchmark-panel" aria-labelledby="benchmark-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Assessment</p>
          <h2 id="benchmark-heading">Mission benchmarks</h2>
        </div>
        <span className="phase">deterministic</span>
      </div>
      <div className="benchmark-config">
        <label className="scenario-select">
          Mission
          <select
            aria-label="Mission benchmark"
            value={selectedId ?? ''}
            disabled={phase === 'batch_running'}
            onChange={(event) => onSelect(event.target.value as MissionBenchmark['id'])}
          >
            {!selected && <option value="">Custom lab configuration</option>}
            {missionBenchmarks.map((benchmark) => (
              <option key={benchmark.id} value={benchmark.id}>
                {benchmark.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          {selected ? (
            <>
              <strong>{selected.name}</strong>
              <p>{selected.description}</p>
              <span>
                Fixed route · {selected.trialCount} trials · seeds {selected.seedStart}–
                {selected.seedStart + selected.trialCount - 1}
              </span>
            </>
          ) : (
            <p>Select a benchmark to load its fixed route and sensor profile.</p>
          )}
        </div>
        <button
          type="button"
          className="primary"
          disabled={!canRun || !selected}
          onClick={() => selected && onRun(selected)}
        >
          Run benchmark
        </button>
      </div>
      <p className="benchmark-rubric">
        Score: {BENCHMARK_RUBRIC.successPoints} pts success rate + {BENCHMARK_RUBRIC.distancePoints}{' '}
        pts final-distance progress + {BENCHMARK_RUBRIC.timePoints} pts target-arrival time − up to{' '}
        {BENCHMARK_RUBRIC.controllerFailurePenalty} pts for controller failures. Scores are out of
        100.
      </p>

      <BenchmarkResults results={results} />
    </section>
  );
}

function BenchmarkResults({ results }: Readonly<{ results: readonly BenchmarkBatchResult[] }>) {
  return (
    <div className="benchmark-results">
      <h3>Completed benchmark batches</h3>
      {results.length === 0 ? (
        <p>No completed benchmark batches in this browser session yet.</p>
      ) : (
        <div className="batch-table-wrap">
          <table aria-label="Benchmark results">
            <thead>
              <tr>
                <th>Mission</th>
                <th>Score</th>
                <th>Success</th>
                <th>Mean final distance</th>
                <th>Mean time</th>
                <th>Mean estimate error</th>
                <th>Controller failures</th>
              </tr>
            </thead>
            <tbody>
              {[...results].reverse().map((result) => {
                const summary = summarizeMonteCarlo(result.batch.trials);
                return (
                  <tr key={result.batch.id}>
                    <td>{result.benchmark.name}</td>
                    <td>
                      <strong>{result.score.total.toFixed(1)}</strong>/100
                    </td>
                    <td>{(summary.successRate * 100).toFixed(0)}%</td>
                    <td>{summary.meanFinalDistanceM.toFixed(1)} m</td>
                    <td>{summary.meanElapsedTimeS.toFixed(1)} s</td>
                    <td>{formatEstimateError(summary.estimation.meanPositionErrorM)}</td>
                    <td>{result.score.controllerFailureCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatEstimateError(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(1)} m`;
}
