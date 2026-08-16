import { summarizeBenchmarkSuite } from '../domain/simulation/benchmarks';
import { summarizeMonteCarlo } from '../domain/simulation/monteCarlo';
import type { BenchmarkSuite } from '../domain/simulation/types';
import type { SessionPhase } from '../features/simulation/simulationSession';

type BenchmarkSuitePanelProps = Readonly<{
  suite?: BenchmarkSuite;
  phase: SessionPhase;
  onRun: () => void;
  onCancel: () => void;
}>;

export function BenchmarkSuitePanel({ suite, phase, onRun, onCancel }: BenchmarkSuitePanelProps) {
  const running = suite?.status === 'running';
  const canRun = phase === 'ready' || phase === 'finished' || phase === 'setup_error';
  const summary =
    suite && suite.results.length > 0 ? summarizeBenchmarkSuite(suite.results) : undefined;

  return (
    <section className="panel suite-panel" aria-labelledby="suite-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Readiness check</p>
          <h2 id="suite-heading">Benchmark suite</h2>
        </div>
        {suite && <span className="phase">{suite.status}</span>}
      </div>
      <p className="panel-help">
        Runs the current controller through every named mission in order. Each mission retains its
        fixed sensor profile, seeds, and trial count.
      </p>
      <div className="suite-controls">
        {running ? (
          <>
            <span>
              {suite.completedMissions} / {suite.totalMissions} missions
              {suite.currentMission ? ` · ${suite.currentMission.name}` : ''}
            </span>
            <button type="button" className="danger" onClick={onCancel}>
              Cancel suite
            </button>
          </>
        ) : (
          <button type="button" className="primary" disabled={!canRun} onClick={onRun}>
            Run full suite
          </button>
        )}
      </div>
      {running && (
        <progress
          className="suite-progress"
          aria-label="Benchmark suite progress"
          value={suite.completedMissions}
          max={suite.totalMissions}
        />
      )}
      {suite && summary && <SuiteReport suite={suite} />}
    </section>
  );
}

function SuiteReport({ suite }: Readonly<{ suite: BenchmarkSuite }>) {
  const summary = summarizeBenchmarkSuite(suite.results);
  return (
    <div className="suite-report" aria-label="Benchmark suite report">
      <h3>Overall report card</h3>
      <dl className="suite-summary">
        <Data label="Overall score" value={`${summary.overallScore.toFixed(1)} / 100`} />
        <Data label="Success rate" value={`${(summary.successRate * 100).toFixed(0)}%`} />
        <Data label="Mean final distance" value={`${summary.meanFinalDistanceM.toFixed(1)} m`} />
        <Data label="Mean elapsed time" value={`${summary.meanElapsedTimeS.toFixed(1)} s`} />
        <Data
          label="Mean estimate error"
          value={formatEstimateError(summary.estimation.meanPositionErrorM)}
        />
        <Data label="Controller failures" value={String(summary.controllerFailureCount)} />
      </dl>
      <div className="batch-table-wrap">
        <table aria-label="Benchmark suite mission results">
          <thead>
            <tr>
              <th>Mission</th>
              <th>Score</th>
              <th>Success</th>
              <th>Mean final distance</th>
              <th>Mean time</th>
              <th>Mean estimate error</th>
              <th>Failures</th>
            </tr>
          </thead>
          <tbody>
            {suite.results.map((result) => {
              const trialSummary = summarizeMonteCarlo(result.batch.trials);
              return (
                <tr key={result.batch.id}>
                  <td>{result.benchmark.name}</td>
                  <td>{result.score.total.toFixed(1)}</td>
                  <td>{(trialSummary.successRate * 100).toFixed(0)}%</td>
                  <td>{trialSummary.meanFinalDistanceM.toFixed(1)} m</td>
                  <td>{trialSummary.meanElapsedTimeS.toFixed(1)} s</td>
                  <td>{formatEstimateError(trialSummary.estimation.meanPositionErrorM)}</td>
                  <td>{result.score.controllerFailureCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatEstimateError(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(1)} m`;
}

function Data({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
