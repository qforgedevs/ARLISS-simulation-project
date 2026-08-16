import { useEffect, useRef } from 'react';
import { gpsToWorld } from '../domain/simulation/sensors';
import type { RecordedTick } from '../domain/simulation/types';
import type { SimulationState } from '../domain/simulation/types';
import type { ScenarioConfig } from '../domain/simulation/types';

type MapCanvasProps = Readonly<{
  scenario: ScenarioConfig;
  simulation: SimulationState;
  recordedTicks?: readonly RecordedTick[];
  selectedRecordIndex?: number;
}>;

export function MapCanvas({
  scenario,
  simulation,
  recordedTicks = [],
  selectedRecordIndex,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
    drawMap(
      context,
      rect.width,
      rect.height,
      scenario,
      simulation,
      recordedTicks,
      selectedRecordIndex,
    );
  }, [scenario, simulation, recordedTicks, selectedRecordIndex]);

  return (
    <canvas ref={canvasRef} className="map-canvas" aria-label="Rover navigation map" role="img" />
  );
}

function drawMap(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scenario: ScenarioConfig,
  simulation: SimulationState,
  recordedTicks: readonly RecordedTick[],
  selectedRecordIndex: number | undefined,
): void {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f6e7c7';
  context.fillRect(0, 0, width, height);

  const padding = 28;
  const worldWidth = scenario.mapBoundsM.maxX - scenario.mapBoundsM.minX;
  const worldHeight = scenario.mapBoundsM.maxY - scenario.mapBoundsM.minY;
  const metersToPixels = Math.min(
    (width - padding * 2) / worldWidth,
    (height - padding * 2) / worldHeight,
  );
  const originX = (width - worldWidth * metersToPixels) / 2;
  const originY = (height - worldHeight * metersToPixels) / 2;
  const project = (point: { x: number; y: number }) => ({
    x: originX + (point.x - scenario.mapBoundsM.minX) * metersToPixels,
    y: originY + (scenario.mapBoundsM.maxY - point.y) * metersToPixels,
  });

  context.strokeStyle = 'rgba(117, 82, 40, 0.16)';
  context.lineWidth = 1;
  for (
    let x = Math.ceil(scenario.mapBoundsM.minX / 20) * 20;
    x <= scenario.mapBoundsM.maxX;
    x += 20
  ) {
    const p = project({ x, y: scenario.mapBoundsM.minY });
    context.beginPath();
    context.moveTo(p.x, originY);
    context.lineTo(p.x, originY + worldHeight * metersToPixels);
    context.stroke();
  }
  for (
    let y = Math.ceil(scenario.mapBoundsM.minY / 20) * 20;
    y <= scenario.mapBoundsM.maxY;
    y += 20
  ) {
    const p = project({ x: scenario.mapBoundsM.minX, y });
    context.beginPath();
    context.moveTo(originX, p.y);
    context.lineTo(originX + worldWidth * metersToPixels, p.y);
    context.stroke();
  }

  const target = project(scenario.target);
  context.fillStyle = 'rgba(219, 82, 48, 0.15)';
  context.beginPath();
  context.arc(target.x, target.y, scenario.targetRadiusM * metersToPixels, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#d85230';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#d85230';
  context.beginPath();
  context.arc(target.x, target.y, 5, 0, Math.PI * 2);
  context.fill();

  const replayRecords =
    selectedRecordIndex === undefined
      ? recordedTicks
      : recordedTicks.slice(0, selectedRecordIndex + 1);
  const trajectory =
    replayRecords.length > 0
      ? replayRecords.map((record) => record.groundTruth.pose.position)
      : simulation.trajectory;
  drawRawGpsOverlay(context, project, scenario, replayRecords);
  drawStudentEstimateOverlay(context, project, scenario, replayRecords);

  if (trajectory.length > 1) {
    context.strokeStyle = '#197a88';
    context.lineWidth = 2.5;
    context.lineJoin = 'round';
    context.beginPath();
    trajectory.forEach((point, index) => {
      const p = project(point);
      if (index === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });
    context.stroke();
  }

  const start = project(scenario.start.position);
  context.strokeStyle = '#775f3c';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(start.x, start.y, 5, 0, Math.PI * 2);
  context.stroke();
  const displayedRover = replayRecords.at(-1)?.groundTruth ?? simulation.rover;
  const rover = project(displayedRover.pose.position);
  context.save();
  context.translate(rover.x, rover.y);
  context.rotate(-displayedRover.pose.headingRad);
  context.fillStyle = '#1f4d63';
  context.beginPath();
  context.moveTo(12, 0);
  context.lineTo(-9, -7);
  context.lineTo(-9, 7);
  context.closePath();
  context.fill();
  context.strokeStyle = '#082b3a';
  context.lineWidth = 1.5;
  context.stroke();
  context.restore();
}

function drawStudentEstimateOverlay(
  context: CanvasRenderingContext2D,
  project: (point: { x: number; y: number }) => { x: number; y: number },
  scenario: ScenarioConfig,
  records: readonly RecordedTick[],
): void {
  const estimates = records.flatMap((record) => record.studentEstimates);
  if (estimates.length === 0) return;
  context.strokeStyle = '#8d4fb3';
  context.lineWidth = 2;
  context.setLineDash([5, 4]);
  context.beginPath();
  estimates.forEach((estimate, index) => {
    const point = project(gpsToWorld(estimate.latitudeDeg, estimate.longitudeDeg, scenario));
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
  context.setLineDash([]);
  const final = project(
    gpsToWorld(estimates.at(-1)?.latitudeDeg ?? 0, estimates.at(-1)?.longitudeDeg ?? 0, scenario),
  );
  context.fillStyle = '#8d4fb3';
  context.beginPath();
  context.arc(final.x, final.y, 3.5, 0, Math.PI * 2);
  context.fill();
}

function drawRawGpsOverlay(
  context: CanvasRenderingContext2D,
  project: (point: { x: number; y: number }) => { x: number; y: number },
  scenario: ScenarioConfig,
  records: readonly RecordedTick[],
): void {
  const visibleRecords = records.filter((record) => record.readings.gps.valid);
  if (visibleRecords.length === 0) return;
  context.fillStyle = 'rgba(89, 83, 186, 0.45)';
  visibleRecords.forEach((record) => {
    const position = gpsToWorld(
      record.readings.gps.latitudeDeg,
      record.readings.gps.longitudeDeg,
      scenario,
    );
    const point = project(position);
    context.beginPath();
    context.arc(point.x, point.y, 2.8, 0, Math.PI * 2);
    context.fill();
  });
}
