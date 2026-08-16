import type { ConsoleEntry } from '../features/simulation/simulationSession';

export function ConsolePanel({ entries }: Readonly<{ entries: readonly ConsoleEntry[] }>) {
  return (
    <section className="panel console-panel" aria-labelledby="console-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Python runtime</p>
          <h2 id="console-heading">Console</h2>
        </div>
      </div>
      <pre className="console-output" aria-live="polite">
        {entries.length === 0
          ? 'Run the controller to see Python output and errors.'
          : entries.map((entry, index) => (
              <span key={`${index}-${entry.text}`} className={entry.stream}>
                {entry.text}
                {'\n'}
              </span>
            ))}
      </pre>
    </section>
  );
}
