import type { SensorProfile } from '../domain/simulation/types';
import { scenarioPresets, type ScenarioPreset } from '../scenarios/presets';

type ScenarioPanelProps = Readonly<{
  presetId: ScenarioPreset['id'] | 'custom';
  sensors: SensorProfile;
  onPresetChange: (presetId: ScenarioPreset['id']) => void;
  onSensorsChange: (sensors: SensorProfile) => void;
}>;

export function ScenarioPanel({
  presetId,
  sensors,
  onPresetChange,
  onSensorsChange,
}: ScenarioPanelProps) {
  const update = (next: Partial<SensorProfile>) => onSensorsChange({ ...sensors, ...next });
  const updateGps = (next: Partial<SensorProfile['gps']>) =>
    update({ gps: { ...sensors.gps, ...next } });
  const updateCompass = (next: Partial<SensorProfile['compass']>) =>
    update({ compass: { ...sensors.compass, ...next } });
  const updateEncoders = (next: Partial<SensorProfile['encoders']>) =>
    update({ encoders: { ...sensors.encoders, ...next } });

  return (
    <section className="panel scenario-panel" aria-labelledby="scenario-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Experiment</p>
          <h2 id="scenario-heading">Sensor scenario</h2>
        </div>
      </div>
      <label className="scenario-select">
        Profile
        <select
          aria-label="Sensor scenario profile"
          value={presetId}
          onChange={(event) => onPresetChange(event.target.value as ScenarioPreset['id'])}
        >
          {presetId === 'custom' && <option value="custom">Custom tuning</option>}
          {scenarioPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <p className="scenario-summary">{descriptionFor(presetId)}</p>
      <NumberInput
        label="Replay seed"
        value={sensors.randomSeed}
        min={0}
        step={1}
        onChange={(randomSeed) => update({ randomSeed: Math.trunc(randomSeed) })}
      />
      <details className="sensor-tuning">
        <summary>Tune raw sensor model</summary>
        <p>
          These settings affect only measurements passed to Python; the map remains ground truth.
        </p>
        <div className="tuning-grid">
          <fieldset>
            <legend>GPS</legend>
            <NumberInput
              label="Rate (Hz)"
              value={sensors.gps.updateRateHz}
              min={0.1}
              step={0.1}
              onChange={(updateRateHz) => updateGps({ updateRateHz })}
            />
            <NumberInput
              label="Noise σ (m)"
              value={sensors.gps.noiseStdDevM}
              min={0}
              step={0.1}
              onChange={(noiseStdDevM) => updateGps({ noiseStdDevM })}
            />
            <NumberInput
              label="East bias (m)"
              value={sensors.gps.biasEastM}
              step={0.1}
              onChange={(biasEastM) => updateGps({ biasEastM })}
            />
            <NumberInput
              label="North bias (m)"
              value={sensors.gps.biasNorthM}
              step={0.1}
              onChange={(biasNorthM) => updateGps({ biasNorthM })}
            />
            <NumberInput
              label="Accuracy (m)"
              value={sensors.gps.horizontalAccuracyM}
              min={0}
              step={0.1}
              onChange={(horizontalAccuracyM) => updateGps({ horizontalAccuracyM })}
            />
            <PercentInput
              value={sensors.gps.dropoutProbability}
              onChange={(dropoutProbability) => updateGps({ dropoutProbability })}
            />
          </fieldset>
          <fieldset>
            <legend>Compass</legend>
            <NumberInput
              label="Rate (Hz)"
              value={sensors.compass.updateRateHz}
              min={0.1}
              step={0.1}
              onChange={(updateRateHz) => updateCompass({ updateRateHz })}
            />
            <NumberInput
              label="Noise σ (rad)"
              value={sensors.compass.noiseStdDevRad}
              min={0}
              step={0.001}
              onChange={(noiseStdDevRad) => updateCompass({ noiseStdDevRad })}
            />
            <NumberInput
              label="Bias (rad)"
              value={sensors.compass.biasRad}
              step={0.001}
              onChange={(biasRad) => updateCompass({ biasRad })}
            />
            <PercentInput
              value={sensors.compass.dropoutProbability}
              onChange={(dropoutProbability) => updateCompass({ dropoutProbability })}
            />
          </fieldset>
          <fieldset>
            <legend>Wheel encoders</legend>
            <NumberInput
              label="Rate (Hz)"
              value={sensors.encoders.updateRateHz}
              min={0.1}
              step={0.1}
              onChange={(updateRateHz) => updateEncoders({ updateRateHz })}
            />
            <NumberInput
              label="Noise σ (ticks)"
              value={sensors.encoders.noiseStdDevTicks}
              min={0}
              step={0.1}
              onChange={(noiseStdDevTicks) => updateEncoders({ noiseStdDevTicks })}
            />
            <NumberInput
              label="Left bias (ticks)"
              value={sensors.encoders.leftBiasTicks}
              step={0.1}
              onChange={(leftBiasTicks) => updateEncoders({ leftBiasTicks })}
            />
            <NumberInput
              label="Right bias (ticks)"
              value={sensors.encoders.rightBiasTicks}
              step={0.1}
              onChange={(rightBiasTicks) => updateEncoders({ rightBiasTicks })}
            />
            <PercentInput
              label="Slip"
              value={sensors.encoders.slipFraction}
              onChange={(slipFraction) => updateEncoders({ slipFraction })}
            />
            <PercentInput
              value={sensors.encoders.dropoutProbability}
              onChange={(dropoutProbability) => updateEncoders({ dropoutProbability })}
            />
          </fieldset>
        </div>
      </details>
    </section>
  );
}

function NumberInput({
  label,
  value,
  min,
  step = 1,
  onChange,
}: Readonly<{
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="number-input">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value) && (min === undefined || value >= min)) onChange(value);
        }}
      />
    </label>
  );
}

function PercentInput({
  label = 'Dropout',
  value,
  onChange,
}: Readonly<{ label?: string; value: number; onChange: (value: number) => void }>) {
  return (
    <NumberInput
      label={`${label} (%)`}
      value={value * 100}
      min={0}
      step={1}
      onChange={(percent) => {
        if (percent <= 100) onChange(percent / 100);
      }}
    />
  );
}

function descriptionFor(presetId: ScenarioPreset['id'] | 'custom'): string {
  if (presetId === 'custom') return 'Manual sensor tuning with a reproducible replay seed.';
  return scenarioPresets.find((preset) => preset.id === presetId)?.description ?? '';
}
