import { loadPyodide, type PyodideInterface } from 'pyodide';
import type { Mission, RawSensorFrame } from '../domain/simulation/types';
import { WORKER_PROTOCOL_VERSION, type WorkerEvent, type WorkerRequest } from './protocol';

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
const PRELUDE = `
from typing import NamedTuple
import math

class MotorCommand(NamedTuple):
    left: float
    right: float

class Mission(NamedTuple):
    target_latitude_deg: float
    target_longitude_deg: float
    target_radius_m: float

class GPS(NamedTuple):
    valid: bool
    latitude_deg: float
    longitude_deg: float
    horizontal_accuracy_m: float

class Compass(NamedTuple):
    heading_rad: float

class WheelEncoders(NamedTuple):
    left_ticks: int
    right_ticks: int
    left_delta_ticks: int
    right_delta_ticks: int

class Readings(NamedTuple):
    time_s: float
    gps: GPS
    compass: Compass
    encoders: WheelEncoders

_controller_ns = None
_arliss_estimates = []
_arliss_collecting_estimates = False

def report_estimate(latitude_deg, longitude_deg, heading_rad, label=None):
    global _arliss_estimates
    if not _arliss_collecting_estimates:
        raise RuntimeError("report_estimate may only be called from update(readings).")
    latitude = float(latitude_deg)
    longitude = float(longitude_deg)
    heading = float(heading_rad)
    if not math.isfinite(latitude) or not math.isfinite(longitude) or not math.isfinite(heading):
        raise ValueError("Estimate latitude, longitude, and heading must be finite numbers.")
    if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
        raise ValueError("Estimate latitude/longitude are outside their valid ranges.")
    if label is not None and (not isinstance(label, str) or len(label) > 80):
        raise ValueError("Estimate label must be a string of at most 80 characters.")
    estimate = {"latitudeDeg": latitude, "longitudeDeg": longitude, "headingRad": heading}
    if label is not None:
        estimate["label"] = label
    _arliss_estimates.append(estimate)
`;

let pyodide: PyodideInterface | undefined;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data);
};

async function handleRequest(request: WorkerRequest): Promise<void> {
  try {
    switch (request.type) {
      case 'initialize':
        await initialize(request.requestId);
        return;
      case 'loadController':
        await loadController(request.requestId, request.source, request.mission);
        return;
      case 'getCommand':
        await getCommand(request.requestId, request.readings);
        return;
    }
  } catch (error) {
    const phase =
      request.type === 'initialize'
        ? 'initialize'
        : request.type === 'loadController'
          ? 'load'
          : 'execute';
    post({
      protocol: WORKER_PROTOCOL_VERSION,
      type: 'error',
      requestId: request.requestId,
      phase,
      error: serializeError(error),
    });
  }
}

async function initialize(requestId: string): Promise<void> {
  if (!pyodide) {
    pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    pyodide.setStdout({ batched: (text) => postConsole(text, 'stdout') });
    pyodide.setStderr({ batched: (text) => postConsole(text, 'stderr') });
    await pyodide.runPythonAsync(PRELUDE);
  }
  post({ protocol: WORKER_PROTOCOL_VERSION, type: 'ready', requestId });
}

async function loadController(requestId: string, source: string, mission: Mission): Promise<void> {
  const runtime = requirePyodide();
  const encodedSource = JSON.stringify(source);
  const encodedMission = JSON.stringify(mission);
  await runtime.runPythonAsync(`
_controller_ns = {"__builtins__": __builtins__, "MotorCommand": MotorCommand, "report_estimate": report_estimate}
exec(compile(${encodedSource}, "<student-controller>", "exec"), _controller_ns)
if not callable(_controller_ns.get("update")):
    raise TypeError("Define a module-level function named update(readings).")
_mission_raw = ${encodedMission}
_mission = Mission(
    float(_mission_raw["targetLatitudeDeg"]),
    float(_mission_raw["targetLongitudeDeg"]),
    float(_mission_raw["targetRadiusM"]),
)
_initialize = _controller_ns.get("initialize")
if _initialize is not None:
    if not callable(_initialize):
        raise TypeError("initialize, when provided, must be a function.")
    _initialize(_mission)
`);
  post({ protocol: WORKER_PROTOCOL_VERSION, type: 'controllerLoaded', requestId });
}

async function getCommand(requestId: string, readings: RawSensorFrame): Promise<void> {
  const runtime = requirePyodide();
  runtime.globals.set('_arliss_readings_raw', readings);
  try {
    const commandJson = await runtime.runPythonAsync(`
import json
import math
_raw = _arliss_readings_raw
_readings = Readings(
    float(_raw.timeS),
    GPS(
        bool(_raw.gps.valid),
        float(_raw.gps.latitudeDeg),
        float(_raw.gps.longitudeDeg),
        float(_raw.gps.horizontalAccuracyM),
    ),
    Compass(float(_raw.compass.headingRad)),
    WheelEncoders(
        int(_raw.encoders.leftTicks),
        int(_raw.encoders.rightTicks),
        int(_raw.encoders.leftDeltaTicks),
        int(_raw.encoders.rightDeltaTicks),
    ),
)
_arliss_estimates = []
_arliss_collecting_estimates = True
try:
    _result = _controller_ns["update"](_readings)
finally:
    _arliss_collecting_estimates = False
if type(_result) is not MotorCommand:
    raise TypeError("update must return MotorCommand(left, right).")
_left = float(_result.left)
_right = float(_result.right)
if not math.isfinite(_left) or not math.isfinite(_right):
    raise ValueError("MotorCommand values must be finite numbers.")
if not (-1.0 <= _left <= 1.0 and -1.0 <= _right <= 1.0):
    raise ValueError("MotorCommand values must be between -1.0 and 1.0.")
json.dumps({"left": _left, "right": _right, "estimates": _arliss_estimates})
`);
    const parsed = JSON.parse(String(commandJson)) as unknown;
    const response = validateControllerResponse(parsed);
    post({
      protocol: WORKER_PROTOCOL_VERSION,
      type: 'command',
      requestId,
      command: response.command,
      estimates: response.estimates,
    });
  } finally {
    runtime.globals.delete('_arliss_readings_raw');
  }
}

function validateControllerResponse(value: unknown): {
  command: { left: number; right: number };
  estimates: readonly {
    latitudeDeg: number;
    longitudeDeg: number;
    headingRad: number;
    label?: string;
  }[];
} {
  if (!isObject(value) || !Array.isArray(value.estimates)) {
    throw new Error('Python worker produced an invalid controller response.');
  }
  if (typeof value.left !== 'number' || typeof value.right !== 'number') {
    throw new Error('Python worker produced an invalid motor command.');
  }
  return {
    command: { left: value.left, right: value.right },
    estimates: value.estimates.map(validateEstimate),
  };
}

function validateEstimate(value: unknown): {
  latitudeDeg: number;
  longitudeDeg: number;
  headingRad: number;
  label?: string;
} {
  if (!isObject(value)) throw new Error('Python worker produced an invalid estimate.');
  const { latitudeDeg, longitudeDeg, headingRad, label } = value;
  if (
    typeof latitudeDeg !== 'number' ||
    typeof longitudeDeg !== 'number' ||
    typeof headingRad !== 'number' ||
    !Number.isFinite(latitudeDeg) ||
    !Number.isFinite(longitudeDeg) ||
    !Number.isFinite(headingRad) ||
    latitudeDeg < -90 ||
    latitudeDeg > 90 ||
    longitudeDeg < -180 ||
    longitudeDeg > 180 ||
    (label !== undefined && (typeof label !== 'string' || label.length > 80))
  ) {
    throw new Error('Python worker produced an invalid estimate.');
  }
  return label === undefined
    ? { latitudeDeg, longitudeDeg, headingRad }
    : { latitudeDeg, longitudeDeg, headingRad, label };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requirePyodide(): PyodideInterface {
  if (!pyodide) throw new Error('Python runtime is not initialized.');
  return pyodide;
}

function serializeError(error: unknown): { name: string; message: string; traceback?: string } {
  if (error instanceof Error)
    return { name: error.name, message: error.message, traceback: error.stack };
  return { name: 'PythonError', message: String(error) };
}

function postConsole(text: string, stream: 'stdout' | 'stderr'): void {
  post({ protocol: WORKER_PROTOCOL_VERSION, type: 'console', text, stream });
}

function post(event: WorkerEvent): void {
  self.postMessage(event);
}
