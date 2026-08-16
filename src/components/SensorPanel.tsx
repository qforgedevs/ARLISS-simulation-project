import type { SessionSnapshot } from '../features/simulation/simulationSession';

export function SensorPanel({ snapshot }: Readonly<{ snapshot: SessionSnapshot }>) {
  const { gps, compass, encoders, timeS } = snapshot.rawReadings;
  return (
    <section className="panel sensor-panel" aria-labelledby="sensor-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Passed to Python</p>
          <h2 id="sensor-heading">Raw sensor readings</h2>
        </div>
      </div>
      <dl className="telemetry-grid raw-readings">
        <Data label="GPS latitude" value={`${gps.latitudeDeg.toFixed(7)}°`} />
        <Data label="GPS longitude" value={`${gps.longitudeDeg.toFixed(7)}°`} />
        <Data
          label="GPS valid / accuracy"
          value={`${gps.valid ? 'true' : 'false'} / ${gps.horizontalAccuracyM.toFixed(1)} m`}
        />
        <Data
          label="Compass heading"
          value={`${((compass.headingRad * 180) / Math.PI).toFixed(1)}°`}
        />
        <Data
          label="Left encoder"
          value={`${encoders.leftTicks} ticks (${encoders.leftDeltaTicks >= 0 ? '+' : ''}${encoders.leftDeltaTicks})`}
        />
        <Data
          label="Right encoder"
          value={`${encoders.rightTicks} ticks (${encoders.rightDeltaTicks >= 0 ? '+' : ''}${encoders.rightDeltaTicks})`}
        />
        <Data label="Sensor timestamp" value={`${timeS.toFixed(2)} s`} />
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
