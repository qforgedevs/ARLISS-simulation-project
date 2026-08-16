import type { SessionSnapshot } from '../features/simulation/simulationSession';

export function RunResultPanel({ snapshot }: Readonly<{ snapshot: SessionSnapshot }>) {
  const result = snapshot.simulation.result;
  const text = result
    ? `${result.outcome.replaceAll('_', ' ')} — ${result.message}`
    : (snapshot.setupError ?? 'Ready to run your navigation algorithm.');
  return (
    <section
      className={`result-panel ${result ? `result-${result.outcome}` : ''}`}
      aria-label="Run result"
      aria-live="polite"
    >
      <strong>Run result</strong>
      <span>{text}</span>
    </section>
  );
}
