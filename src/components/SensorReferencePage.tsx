import type { ReactNode } from 'react';

type SensorReferencePageProps = Readonly<{ onReturnToLab: () => void }>;

export function SensorReferencePage({ onReturnToLab }: SensorReferencePageProps) {
  return (
    <section className="sensor-reference-page" aria-labelledby="reference-heading">
      <div className="reference-heading">
        <div>
          <p className="eyebrow">Student reference</p>
          <h2 id="reference-heading">Robot sensor and mission API</h2>
          <p>
            These are the only supported values supplied to your Python controller. You design the
            sensor processing, localization, navigation, and motor-control logic.
          </p>
        </div>
        <button type="button" onClick={onReturnToLab}>
          Return to lab
        </button>
      </div>

      <section className="reference-card" aria-labelledby="lifecycle-heading">
        <h3 id="lifecycle-heading">Controller lifecycle</h3>
        <pre>{`def initialize(mission):
    # Optional: save mission data and create your state.
    pass

def update(readings):
    # Required: read sensors and return motor commands.
    return MotorCommand(left=0.0, right=0.0)`}</pre>
        <p>
          <code>initialize</code> runs once per simulation run. <code>update</code> runs once per
          fixed simulation tick. Module-level variables persist during that run only.
        </p>
      </section>

      <div className="reference-grid">
        <SensorCard
          title="Mission target"
          code="mission.target_latitude_deg\nmission.target_longitude_deg\nmission.target_radius_m"
        >
          The target location and success radius. Save these in <code>initialize(mission)</code> if
          your algorithm needs them.
        </SensorCard>
        <SensorCard
          title="GPS"
          code="readings.gps.valid\nreadings.gps.latitude_deg\nreadings.gps.longitude_deg\nreadings.gps.horizontal_accuracy_m"
        >
          Decimal-degree latitude/longitude. Check <code>valid</code> before using a GPS fix. A
          scenario can apply slower samples, noise, bias, or dropouts; an invalid fix retains its
          last coordinate values.
        </SensorCard>
        <SensorCard title="Compass" code="readings.compass.heading_rad">
          Heading in radians. Zero points east; positive values rotate counterclockwise toward
          north. During a dropout, this field holds its previous sample.
        </SensorCard>
        <SensorCard
          title="Wheel encoders"
          code="readings.encoders.left_ticks\nreadings.encoders.right_ticks\nreadings.encoders.left_delta_ticks\nreadings.encoders.right_delta_ticks"
        >
          Signed cumulative tick counts and signed changes since the previous fixed simulation tick.
          Use them if you choose to implement odometry or fusion. A delayed or dropped encoder
          sample holds its counts and reports zero deltas.
        </SensorCard>
        <SensorCard title="Time" code="readings.time_s">
          Authoritative elapsed simulation time in seconds. Use it for your algorithm’s own timing;
          do not use browser or wall-clock time.
        </SensorCard>
        <SensorCard title="Motors" code="MotorCommand(left, right)">
          Return one command from <code>update</code>. Both normalized wheel commands must be finite
          numbers from -1.0 through 1.0.
        </SensorCard>
        <SensorCard
          title="Optional estimator report"
          code={'report_estimate(latitude_deg, longitude_deg, heading_rad, label=None)'}
        >
          Call only from <code>update</code> to record your own localization estimate for replay
          diagnostics. It does not alter rover state or expose truth. Coordinates must be valid
          decimal degrees; the optional label is limited to 80 characters.
        </SensorCard>
      </div>

      <p className="reference-boundary">
        True rover pose, direct distance/bearing to target, map state, and simulator controls are
        not available to student Python. The lab’s telemetry is for inspection only.
      </p>
    </section>
  );
}

function SensorCard({
  title,
  code,
  children,
}: Readonly<{ title: string; code: string; children: ReactNode }>) {
  return (
    <section className="reference-card sensor-reference-card">
      <h3>{title}</h3>
      <pre>{code}</pre>
      <p>{children}</p>
    </section>
  );
}
