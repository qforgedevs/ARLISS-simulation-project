import { useEffect, useState } from 'react';
import { summarizeMonteCarlo } from '../domain/simulation/monteCarlo';
import type { MonteCarloBatch } from '../domain/simulation/types';
import type { SessionPhase } from '../features/simulation/simulationSession';

type MonteCarloPanelProps = Readonly<{
  batch?: MonteCarloBatch;
  defaultSeed: number;
  phase: SessionPhase;
  onStart: (totalTrials: number, seedStart: number) => void;
  onCancel: () => void;
  onReplay: (trialIndex: number) => void;
}>;

export function MonteCarloPanel({
  batch,
  defaultSeed,
  phase,
  onStart,
  onCancel,
  onReplay,
}: MonteCarloPanelProps) {
  const [trialCount, setTrialCount] = useState(5);
  const [seedStart, setSeedStart] = useState(defaultSeed);
  useEffect(() => setSeedStart(defaultSeed), [defaultSeed]);

  const running = batch?.status === 'running';
  const canStart = phase === 'ready' || phase === 'finished' || phase === 'setup_error';
  const summary = batch ? summarizeMonteCarlo(batch.trials) : undefined;

  return (
    <section className="panel monte-carlo-panel" aria-labelledby="batch-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Reliability testing</p>
          <h2 id="batch-heading">Monte Carlo batch</h2>
        </div>
        {running ? (
          <span className="phase">running</span>
        ) : (
          batch && <span className="phase">{batch.status}</span>
        )}
      </div>
      <p className="panel-help">
        Runs the current Python source once per seed, sequentially. Select any finished trial to
        regenerate its full replay trace.
      </p>
      <div className="batch-controls">
        <label>
          Trials
          <input
            aria-label="Batch trial count"
            type="number"
            min={1}
            max={20}
            value={trialCount}
            onChange={(event) => setTrialCount(clampInteger(event.target.value, 1, 20, trialCount))}
          />
        </label>
        <label>
          First seed
          <input
            aria-label="Batch first seed"
            type="number"
            min={0}
            step={1}
            value={seedStart}
            onChange={(event) =>
              setSeedStart(clampInteger(event.target.value, 0, Number.MAX_SAFE_INTEGER, seedStart))
            }
          />
        </label>
        {running ? (
          <button type="button" className="danger" onClick={onCancel}>
            Cancel batch
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={!canStart}
            onClick={() => onStart(trialCount, seedStart)}
          >
            Run batch
          </button>
        )}
      </div>

      {batch && (
        <>
          <div className="batch-progress" aria-label="Batch progress">
            <div>
              <span>
                {batch.completedTrials} / {batch.totalTrials} trials
              </span>
              <span>
                seeds {batch.seedStart}–{batch.seedStart + batch.totalTrials - 1}
              </span>
            </div>
            <progress value={batch.completedTrials} max={batch.totalTrials} />
          </div>
          {summary && (
            <dl className="batch-summary" aria-label="Batch summary">
              <Data label="Success rate" value={`${(summary.successRate * 100).toFixed(0)}%`} />
              <Data
                label="Successful trials"
                value={`${summary.successCount} / ${batch.completedTrials}`}
              />
              <Data
                label="Mean final distance"
                value={`${summary.meanFinalDistanceM.toFixed(1)} m`}
              />
              <Data label="Mean elapsed time" value={`${summary.meanElapsedTimeS.toFixed(1)} s`} />
              <Data label="Timeouts" value={String(summary.outcomes.student_code_timeout ?? 0)} />
              <Data label="Code errors" value={String(summary.outcomes.student_code_error ?? 0)} />
            </dl>
          )}
          <div className="batch-table-wrap">
            <table aria-label="Batch trial results">
              <thead>
                <tr>
                  <th>Trial</th>
                  <th>Seed</th>
                  <th>Outcome</th>
                  <th>Final distance</th>
                  <th>Time</th>
                  <th>Replay</th>
                </tr>
              </thead>
              <tbody>
                {batch.trials.map((trial) => (
                  <tr key={trial.index}>
                    <td>{trial.index + 1}</td>
                    <td>{trial.seed}</td>
                    <td>{trial.outcome.replaceAll('_', ' ')}</td>
                    <td>{trial.finalDistanceM.toFixed(1)} m</td>
                    <td>{trial.elapsedTimeS.toFixed(1)} s</td>
                    <td>
                      <button
                        type="button"
                        disabled={running}
                        onClick={() => onReplay(trial.index)}
                      >
                        Replay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Data({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function clampInteger(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
