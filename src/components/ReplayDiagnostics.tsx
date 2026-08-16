import type { CSSProperties } from 'react';
import {
  estimateErrorsForRecord,
  summarizeEstimates,
} from '../domain/simulation/estimatorDiagnostics';
import { gpsToWorld } from '../domain/simulation/sensors';
import { activeFault } from '../domain/simulation/sensors';
import type { RecordedTick, RunResult, ScenarioConfig } from '../domain/simulation/types';

type ReplayDiagnosticsProps = Readonly<{
  records: readonly RecordedTick[];
  selectedRecordIndex: number | undefined;
  scenario: ScenarioConfig;
  result?: RunResult;
  onSelect: (index: number) => void;
  onFollowLive: () => void;
}>;

export function ReplayDiagnostics({
  records,
  selectedRecordIndex,
  scenario,
  result,
  onSelect,
  onFollowLive,
}: ReplayDiagnosticsProps) {
  const activeIndex = Math.min(selectedRecordIndex ?? records.length - 1, records.length - 1);
  const active = records[activeIndex];

  if (!active) {
    return (
      <section className="panel replay-diagnostics" aria-labelledby="replay-heading">
        <p className="eyebrow">Run analysis</p>
        <h2 id="replay-heading">Replay diagnostics</h2>
        <p className="panel-help">Run or step the rover to record raw measurements and commands.</p>
      </section>
    );
  }

  const dropped = countDropouts(records);
  const final = records.at(-1) ?? active;
  const finalDistanceM = Math.hypot(
    final.groundTruth.pose.position.x - scenario.target.x,
    final.groundTruth.pose.position.y - scenario.target.y,
  );
  const activeEstimate = estimateErrorsForRecord(active, scenario).at(-1);
  const estimation = summarizeEstimates(records, scenario);
  const faults = faultsAt(active.readingTimeS, scenario);
  return (
    <section className="panel replay-diagnostics" aria-labelledby="replay-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Run analysis</p>
          <h2 id="replay-heading">Replay diagnostics</h2>
        </div>
        <button type="button" onClick={onFollowLive} disabled={selectedRecordIndex === undefined}>
          Follow live
        </button>
      </div>
      <div className="timeline-control">
        <label htmlFor="replay-tick">Replay tick</label>
        <input
          id="replay-tick"
          aria-label="Replay tick"
          type="range"
          min={0}
          max={Math.max(records.length - 1, 0)}
          value={activeIndex}
          onChange={(event) => onSelect(Number(event.target.value))}
        />
        <output>
          tick {active.tick} · input at {active.readingTimeS.toFixed(2)} s
        </output>
      </div>

      <div className="replay-status-grid">
        <Status label="GPS" value={active.sensorStatus.gps} />
        <Status label="Compass" value={active.sensorStatus.compass} />
        <Status label="Encoders" value={active.sensorStatus.encoders} />
        <Data
          label="Motor command"
          value={`${active.command.left.toFixed(2)} / ${active.command.right.toFixed(2)}`}
        />
        <Data
          label="Truth position"
          value={`${active.groundTruth.pose.position.x.toFixed(1)}, ${active.groundTruth.pose.position.y.toFixed(1)} m`}
        />
        <Data
          label="Truth heading"
          value={`${radiansToDegrees(active.groundTruth.pose.headingRad).toFixed(1)}°`}
        />
        <Data
          label="Student estimate"
          value={
            activeEstimate
              ? `${activeEstimate.estimate.label ?? 'estimate'} · ${activeEstimate.positionErrorM.toFixed(1)} m · ${activeEstimate.headingErrorDeg.toFixed(1)}° error`
              : 'not reported'
          }
        />
        <Data label="Scheduled faults" value={faults.length > 0 ? faults.join(', ') : 'none'} />
      </div>

      <div className="diagnostic-charts">
        <SensorChart title="Raw GPS fixes" unit="m" series={gpsSeries(records, scenario)} />
        <SensorChart
          title="Compass heading"
          unit="°"
          series={[
            {
              label: 'Heading',
              color: '#197a88',
              values: records.map((record) => radiansToDegrees(record.readings.compass.headingRad)),
            },
          ]}
        />
        <SensorChart title="Encoder ticks" unit="ticks" series={encoderSeries(records)} />
        <SensorChart
          title="Estimated position error (fault-aware)"
          unit="m"
          markers={faultTransitionIndexes(records, scenario)}
          series={[
            {
              label: 'Position error',
              color: '#8d4fb3',
              values: records.map(
                (record) =>
                  estimateErrorsForRecord(record, scenario).at(-1)?.positionErrorM ?? Number.NaN,
              ),
            },
          ]}
        />
      </div>

      <div className="run-summary" aria-label="Run summary">
        <Data label="Outcome" value={result?.outcome.replaceAll('_', ' ') ?? 'in progress'} />
        <Data label="Duration" value={`${final.groundTruth.elapsedTimeS.toFixed(2)} s`} />
        <Data label="Final distance" value={`${finalDistanceM.toFixed(1)} m`} />
        <Data label="Recorded samples" value={String(records.length)} />
        <Data label="GPS dropouts" value={String(dropped.gps)} />
        <Data label="Compass dropouts" value={String(dropped.compass)} />
        <Data label="Encoder dropouts" value={String(dropped.encoders)} />
        <Data label="Estimate reports" value={String(estimation.reportedSamples)} />
        <Data label="Mean estimate error" value={formatMeters(estimation.meanPositionErrorM)} />
        <Data label="Final estimate error" value={formatMeters(estimation.finalPositionErrorM)} />
        <Data label="Mean heading error" value={formatDegrees(estimation.meanHeadingErrorDeg)} />
      </div>
    </section>
  );
}

function faultsAt(timeS: number, scenario: ScenarioConfig): readonly string[] {
  const faults = scenario.faults;
  if (!faults) return [];
  return [
    activeFault(faults.gps, timeS) && `GPS ${activeFault(faults.gps, timeS)?.mode}`,
    activeFault(faults.compass, timeS) && `Compass ${activeFault(faults.compass, timeS)?.mode}`,
    activeFault(faults.encoders, timeS) && `Encoders ${activeFault(faults.encoders, timeS)?.mode}`,
  ].filter((fault): fault is string => Boolean(fault));
}

function faultTransitionIndexes(
  records: readonly RecordedTick[],
  scenario: ScenarioConfig,
): readonly number[] {
  let previous = '';
  return records.flatMap((record, index) => {
    const current = faultsAt(record.readingTimeS, scenario).join('|');
    const changed = current !== previous;
    previous = current;
    return changed ? [index] : [];
  });
}

function Status({
  label,
  value,
}: Readonly<{ label: string; value: RecordedTick['sensorStatus']['gps'] }>) {
  return (
    <div className="replay-status">
      <dt>{label}</dt>
      <dd className={`sample-status sample-status-${value}`}>{value}</dd>
    </div>
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

type Series = Readonly<{ label: string; color: string; values: readonly number[] }>;

function SensorChart({
  title,
  unit,
  series,
  markers = [],
}: Readonly<{
  title: string;
  unit: string;
  series: readonly Series[];
  markers?: readonly number[];
}>) {
  const sampled = series.map((item) => ({ ...item, values: downsample(item.values, 180) }));
  const values = sampled.flatMap((item) => item.values).filter(Number.isFinite);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const range = max - min || 1;
  return (
    <section className="sensor-chart">
      <div>
        <h3>{title}</h3>
        <span>
          {min.toFixed(1)}–{max.toFixed(1)} {unit}
        </span>
      </div>
      <svg viewBox="0 0 300 90" role="img" aria-label={`${title} chart`}>
        <line x1="0" y1="89" x2="300" y2="89" className="chart-axis" />
        {markers.map((index) => {
          const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 300;
          return <line key={index} x1={x} y1="0" x2={x} y2="90" className="chart-fault-marker" />;
        })}
        {sampled.map((item) => (
          <path key={item.label} d={pathFor(item.values, min, range)} stroke={item.color} />
        ))}
      </svg>
      <div className="chart-legend">
        {series.map((item) => (
          <span key={item.label} style={{ '--chart-color': item.color } as CSSProperties}>
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function gpsSeries(records: readonly RecordedTick[], scenario: ScenarioConfig): readonly Series[] {
  return [
    {
      label: 'East',
      color: '#5853ba',
      values: records.map((record) =>
        record.readings.gps.valid
          ? gpsToWorld(record.readings.gps.latitudeDeg, record.readings.gps.longitudeDeg, scenario)
              .x
          : Number.NaN,
      ),
    },
    {
      label: 'North',
      color: '#d85230',
      values: records.map((record) =>
        record.readings.gps.valid
          ? gpsToWorld(record.readings.gps.latitudeDeg, record.readings.gps.longitudeDeg, scenario)
              .y
          : Number.NaN,
      ),
    },
  ];
}

function encoderSeries(records: readonly RecordedTick[]): readonly Series[] {
  return [
    {
      label: 'Left',
      color: '#197a88',
      values: records.map((record) => record.readings.encoders.leftTicks),
    },
    {
      label: 'Right',
      color: '#d85230',
      values: records.map((record) => record.readings.encoders.rightTicks),
    },
  ];
}

function pathFor(values: readonly number[], min: number, range: number): string {
  return values.reduce((path, value, index) => {
    if (!Number.isFinite(value)) return path;
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 300;
    const y = 86 - ((value - min) / range) * 82;
    return `${path}${path ? ' L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }, '');
}

function downsample(values: readonly number[], maxPoints: number): readonly number[] {
  if (values.length <= maxPoints) return values;
  const result: number[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    result.push(values[Math.floor((index * (values.length - 1)) / (maxPoints - 1))] ?? Number.NaN);
  }
  return result;
}

function countDropouts(records: readonly RecordedTick[]) {
  return records.reduce(
    (counts, record) => ({
      gps: counts.gps + Number(record.sensorStatus.gps === 'dropped'),
      compass: counts.compass + Number(record.sensorStatus.compass === 'dropped'),
      encoders: counts.encoders + Number(record.sensorStatus.encoders === 'dropped'),
    }),
    { gps: 0, compass: 0, encoders: 0 },
  );
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function formatMeters(value: number | undefined): string {
  return value === undefined ? 'not reported' : `${value.toFixed(1)} m`;
}

function formatDegrees(value: number | undefined): string {
  return value === undefined ? 'not reported' : `${value.toFixed(1)}°`;
}
