import { create } from 'zustand';
import { defaultScenario } from '../../scenarios/defaultScenario';
import {
  createInitialState,
  rawSensorFrame,
  sensorFrame,
} from '../../domain/simulation/simulation';
import type { SessionSnapshot } from './simulationSession';

const initialSimulation = createInitialState(defaultScenario);

const initialSnapshot: SessionSnapshot = {
  phase: 'booting_worker',
  simulation: initialSimulation,
  telemetry: {
    tick: 0,
    state: initialSimulation.rover,
    sensors: sensorFrame(initialSimulation, defaultScenario),
    command: initialSimulation.lastCommand,
  },
  rawReadings: rawSensorFrame(initialSimulation, defaultScenario),
  recordedTicks: [],
  consoleEntries: [],
};

type SimulationStore = {
  source: string;
  speed: number;
  snapshot: SessionSnapshot;
  setSource: (source: string) => void;
  setSpeed: (speed: number) => void;
  setSnapshot: (snapshot: SessionSnapshot) => void;
};

export const useSimulationStore = create<SimulationStore>((set) => ({
  source: `# ARLISS Navigation Lab\n# You own sensor interpretation, localization, navigation, and motor control.\n# Consult the Sensor API page for field names and units.\n\ndef initialize(mission):\n    # Save mission data and initialize your algorithm state here.\n    pass\n\ndef update(readings):\n    # Read raw GPS, compass, and wheel-encoder measurements here.\n    # Optional: report_estimate(latitude_deg, longitude_deg, heading_rad, label=None)\n    # records your own localization estimate for UI diagnostics only.\n    # Return normalized MotorCommand(left, right) values in [-1.0, 1.0].\n    return MotorCommand(0.0, 0.0)\n`,
  speed: 1,
  snapshot: initialSnapshot,
  setSource: (source) => set({ source }),
  setSpeed: (speed) => set({ speed }),
  setSnapshot: (snapshot) => set({ snapshot }),
}));
