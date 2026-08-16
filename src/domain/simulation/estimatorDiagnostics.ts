import { normalizeAngle } from './math';
import { gpsToWorld } from './sensors';
import type { EstimationSummary, RecordedTick, ScenarioConfig, StudentEstimate } from './types';

export type EstimateError = Readonly<{
  estimate: StudentEstimate;
  positionErrorM: number;
  headingErrorDeg: number;
}>;

export function estimateErrorsForRecord(
  record: RecordedTick,
  scenario: ScenarioConfig,
): readonly EstimateError[] {
  return record.studentEstimates.map((estimate) => {
    const position = gpsToWorld(estimate.latitudeDeg, estimate.longitudeDeg, scenario);
    const truth = record.groundTruthAtReading;
    return Object.freeze({
      estimate,
      positionErrorM: Math.hypot(
        position.x - truth.pose.position.x,
        position.y - truth.pose.position.y,
      ),
      headingErrorDeg: radiansToDegrees(
        Math.abs(normalizeAngle(estimate.headingRad - truth.pose.headingRad)),
      ),
    });
  });
}

export function summarizeEstimates(
  records: readonly RecordedTick[],
  scenario: ScenarioConfig,
): EstimationSummary {
  const errors = records.flatMap((record) => estimateErrorsForRecord(record, scenario));
  const final = errors.at(-1);
  return Object.freeze({
    reportedSamples: errors.length,
    meanPositionErrorM: mean(errors.map((error) => error.positionErrorM)),
    finalPositionErrorM: final?.positionErrorM,
    meanHeadingErrorDeg: mean(errors.map((error) => error.headingErrorDeg)),
    finalHeadingErrorDeg: final?.headingErrorDeg,
  });
}

export function summarizeEstimationSummaries(
  summaries: readonly EstimationSummary[],
): EstimationSummary {
  const reportedSamples = summaries.reduce((total, summary) => total + summary.reportedSamples, 0);
  const last = [...summaries].reverse().find((summary) => summary.reportedSamples > 0);
  return Object.freeze({
    reportedSamples,
    meanPositionErrorM: weightedMean(summaries, 'meanPositionErrorM'),
    finalPositionErrorM: last?.finalPositionErrorM,
    meanHeadingErrorDeg: weightedMean(summaries, 'meanHeadingErrorDeg'),
    finalHeadingErrorDeg: last?.finalHeadingErrorDeg,
  });
}

function mean(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function weightedMean(
  summaries: readonly EstimationSummary[],
  field: 'meanPositionErrorM' | 'meanHeadingErrorDeg',
): number | undefined {
  const contributors = summaries.filter(
    (summary): summary is EstimationSummary & Required<Pick<EstimationSummary, typeof field>> =>
      summary.reportedSamples > 0 && summary[field] !== undefined,
  );
  if (contributors.length === 0) return undefined;
  const totalSamples = contributors.reduce((total, summary) => total + summary.reportedSamples, 0);
  return (
    contributors.reduce((total, summary) => total + summary.reportedSamples * summary[field], 0) /
    totalSamples
  );
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
