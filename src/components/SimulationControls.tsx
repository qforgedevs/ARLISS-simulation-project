import type { SessionPhase } from '../features/simulation/simulationSession';

type SimulationControlsProps = Readonly<{
  phase: SessionPhase;
  speed: number;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
  onStep: () => void;
  onStop: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
}>;

export function SimulationControls(props: SimulationControlsProps) {
  const { phase } = props;
  const runnable = phase === 'ready' || phase === 'finished' || phase === 'setup_error';
  return (
    <section className="controls" aria-label="Simulation controls">
      <div className="control-buttons">
        <button type="button" className="primary" onClick={props.onRun} disabled={!runnable}>
          Run
        </button>
        {phase === 'running' ? (
          <button type="button" onClick={props.onPause}>
            Pause
          </button>
        ) : (
          <button type="button" onClick={props.onResume} disabled={phase !== 'paused'}>
            Resume
          </button>
        )}
        <button
          type="button"
          onClick={props.onStep}
          disabled={phase !== 'ready' && phase !== 'paused'}
        >
          Step
        </button>
        <button
          type="button"
          className="danger"
          onClick={props.onStop}
          disabled={phase !== 'loading_controller' && phase !== 'running' && phase !== 'paused'}
        >
          Stop
        </button>
        <button type="button" onClick={props.onReset} disabled={phase === 'booting_worker'}>
          Reset
        </button>
      </div>
      <label className="speed-control">
        Simulation speed
        <select
          value={props.speed}
          onChange={(event) => props.onSpeedChange(Number(event.target.value))}
        >
          <option value={0.25}>0.25×</option>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      </label>
    </section>
  );
}
