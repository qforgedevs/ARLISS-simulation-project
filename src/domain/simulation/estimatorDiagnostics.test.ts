import { describe, expect, it } from 'vitest';
import { defaultScenario } from '../../scenarios/defaultScenario';
import { worldToGps } from './sensors';
import { createInitialRecord } from './runRecorder';
import { estimateErrorsForRecord, summarizeEstimates } from './estimatorDiagnostics';
import { createInitialState } from './simulation';

describe('student estimator diagnostics', () => {
  it('compares reported geographic estimates against truth at the sensor-reading time', () => {
    const state = createInitialState(defaultScenario);
    const gps = worldToGps(state.rover.pose.position, defaultScenario);
    const record = {
      ...createInitialRecord(state),
      studentEstimates: [
        {
          latitudeDeg: gps.latitudeDeg,
          longitudeDeg: gps.longitudeDeg,
          headingRad: state.rover.pose.headingRad + Math.PI * 2,
          label: 'dead reckoning',
        },
      ],
    };

    const [error] = estimateErrorsForRecord(record, defaultScenario);
    const summary = summarizeEstimates([record], defaultScenario);
    expect(error?.positionErrorM).toBeCloseTo(0, 8);
    expect(error?.headingErrorDeg).toBeCloseTo(0, 8);
    expect(summary.reportedSamples).toBe(1);
    expect(summary.meanPositionErrorM).toBeCloseTo(0, 8);
    expect(summary.finalHeadingErrorDeg).toBeCloseTo(0, 8);
  });

  it('reports no localization metrics when the controller does not report estimates', () => {
    const record = createInitialRecord(createInitialState(defaultScenario));
    const summary = summarizeEstimates([record], defaultScenario);
    expect(summary).toEqual({
      reportedSamples: 0,
      meanPositionErrorM: undefined,
      finalPositionErrorM: undefined,
      meanHeadingErrorDeg: undefined,
      finalHeadingErrorDeg: undefined,
    });
  });
});
