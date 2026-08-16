import type { SessionSnapshot } from '../features/simulation/simulationSession';

export function TelemetryPanel({ snapshot }: Readonly<{ snapshot: SessionSnapshot }>) {
  const { rover } = snapshot.simulation;
  const { sensors, command } = snapshot.telemetry;
  const headingDeg = (rover.pose.headingRad * 180) / Math.PI;
  return (
    <section className="panel telemetry-panel" aria-labelledby="telemetry-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Live data</p>
          <h2 id="telemetry-heading">Telemetry</h2>
        </div>
        <span className={`phase phase-${snapshot.phase}`}>{snapshot.phase.replace('_', ' ')}</span>
      </div>
      <dl className="telemetry-grid">
        <Data
          label="Position"
          value={`${rover.pose.position.x.toFixed(1)}, ${rover.pose.position.y.toFixed(1)} m`}
        />
        <Data label="Heading" value={`${headingDeg.toFixed(1)}°`} />
        <Data label="Distance to target" value={`${sensors.distanceToTargetM.toFixed(1)} m`} />
        <Data
          label="Target bearing"
          value={`${((sensors.bearingToTargetRad * 180) / Math.PI).toFixed(1)}°`}
        />
        <Data label="Linear velocity" value={`${rover.linearVelocityMps.toFixed(2)} m/s`} />
        <Data
          label="Wheel commands"
          value={`${command.left.toFixed(2)} / ${command.right.toFixed(2)}`}
        />
        <Data label="Distance travelled" value={`${rover.distanceTravelledM.toFixed(1)} m`} />
        <Data label="Simulation time" value={`${rover.elapsedTimeS.toFixed(2)} s`} />
      </dl>
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
