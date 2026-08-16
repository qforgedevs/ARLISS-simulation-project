import { useEffect, useMemo, useState } from 'react';
import {
  dashboardRunFromBenchmark,
  dashboardRunFromSuite,
  type DashboardRun,
} from '../domain/simulation/resultsDashboard';
import type { BenchmarkBatchResult, BenchmarkSuite } from '../domain/simulation/types';

export function ResultsDashboard({
  results,
  suite,
  onReplay,
}: Readonly<{
  results: readonly BenchmarkBatchResult[];
  suite?: BenchmarkSuite;
  onReplay: (result: BenchmarkBatchResult) => void;
}>) {
  const [label, setLabel] = useState('Algorithm 1');
  const [saved, setSaved] = useState<readonly DashboardRun[]>([]);
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');

  useEffect(() => {
    setSaved((current) => {
      const known = new Set(current.map((run) => run.id));
      const additions = results
        .filter((result) => !known.has(result.batch.id))
        .map((result) => dashboardRunFromBenchmark(result, label));
      return additions.length > 0 ? [...current, ...additions] : current;
    });
  }, [label, results]);

  useEffect(() => {
    if (!suite || suite.status !== 'completed') return;
    setSaved((current) =>
      current.some((run) => run.id === suite.id)
        ? current
        : [...current, dashboardRunFromSuite(suite, label)],
    );
  }, [label, suite]);

  const selected = useMemo(
    () =>
      [saved.find((run) => run.id === left), saved.find((run) => run.id === right)].filter(Boolean),
    [left, right, saved],
  ) as readonly DashboardRun[];
  const trend =
    saved.length > 1 ? { first: saved[0]!, latest: saved[saved.length - 1]! } : undefined;
  return (
    <section className="panel dashboard" aria-labelledby="dashboard-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Progress</p>
          <h2 id="dashboard-heading">Mission results dashboard</h2>
        </div>
      </div>
      <label className="number-input">
        Algorithm label
        <input
          aria-label="Algorithm label"
          value={label}
          onChange={(event) => setLabel(event.target.value.slice(0, 60))}
        />
      </label>
      <p className="panel-help">
        Completed benchmark and suite runs are retained only in this browser session. Benchmark rows
        retain their source and scenario, so their first trial can be replayed after changing
        missions; suite rows summarize their member benchmarks.
      </p>
      {trend && (
        <p className="dashboard-trend" aria-label="Result trend">
          Latest versus first: {signed(trend.latest.score - trend.first.score)} pts ·{' '}
          {signedPercent(trend.latest.successRate - trend.first.successRate)} success ·{' '}
          {signed(trend.latest.meanFinalDistanceM - trend.first.meanFinalDistanceM)} m distance ·{' '}
          {signed(trend.latest.meanElapsedTimeS - trend.first.meanElapsedTimeS)} s time ·{' '}
          {signed(trend.latest.controllerFailureCount - trend.first.controllerFailureCount)}{' '}
          failures
          {trend.latest.meanPositionErrorM !== undefined &&
            trend.first.meanPositionErrorM !== undefined &&
            ` · ${signed(trend.latest.meanPositionErrorM - trend.first.meanPositionErrorM)} m localization`}
        </p>
      )}
      <div className="batch-table-wrap">
        <table aria-label="Saved mission results">
          <thead>
            <tr>
              <th>Label</th>
              <th>Kind</th>
              <th>Score</th>
              <th>Success</th>
              <th>Distance</th>
              <th>Time</th>
              <th>Failures</th>
              <th>Localization</th>
              <th>Replay</th>
            </tr>
          </thead>
          <tbody>
            {saved.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  Run a benchmark or the full suite to create a browser-session record.
                </td>
              </tr>
            ) : (
              saved.map((run) => (
                <tr key={run.id}>
                  <td>{run.label}</td>
                  <td>{run.kind}</td>
                  <td>{run.score.toFixed(1)}</td>
                  <td>{(run.successRate * 100).toFixed(0)}%</td>
                  <td>{run.meanFinalDistanceM.toFixed(1)} m</td>
                  <td>{run.meanElapsedTimeS.toFixed(1)} s</td>
                  <td>{run.controllerFailureCount}</td>
                  <td>
                    {run.meanPositionErrorM === undefined
                      ? '—'
                      : `${run.meanPositionErrorM.toFixed(1)} m`}
                  </td>
                  <td>
                    {run.benchmarkResult ? (
                      <button type="button" onClick={() => onReplay(run.benchmarkResult!)}>
                        Replay first trial
                      </button>
                    ) : (
                      'Summary only'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="dashboard-compare">
        <label>
          Compare
          <select
            aria-label="First comparison run"
            value={left}
            onChange={(event) => setLeft(event.target.value)}
          >
            <option value="">Select</option>
            {saved.map((run) => (
              <option key={run.id} value={run.id}>
                {run.label} · {run.kind}
              </option>
            ))}
          </select>
        </label>
        <label>
          With
          <select
            aria-label="Second comparison run"
            value={right}
            onChange={(event) => setRight(event.target.value)}
          >
            <option value="">Select</option>
            {saved.map((run) => (
              <option key={run.id} value={run.id}>
                {run.label} · {run.kind}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selected.length === 2 && (
        <div className="run-summary" aria-label="Run comparison">
          {selected.map((run) => (
            <div key={run.id}>
              <dt>
                {run.label} ({run.kind})
              </dt>
              <dd>
                {run.score.toFixed(1)} pts · {(run.successRate * 100).toFixed(0)}% success ·{' '}
                {run.meanFinalDistanceM.toFixed(1)} m · {run.meanElapsedTimeS.toFixed(1)} s ·{' '}
                {run.controllerFailureCount} failures
              </dd>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function signedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(0)}%`;
}
