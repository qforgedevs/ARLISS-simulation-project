# ARLISS Rover Navigation Lab

ARLISS Rover Navigation Lab is an open-source, browser-based robotics simulator inspired by the ARLISS Comeback Competition. Students write the Python sensing and navigation stack for a differential-drive rover, then observe its behavior on a map.

## MVP 1

MVP 1 is a deterministic, desktop-first navigation laboratory. It includes raw GPS latitude/longitude, compass heading, and wheel-encoder measurements; seeded ideal, noisy-GPS, and field-sensor profiles; a fixed-step TypeScript simulation engine; a Monaco Python editor; 2D Canvas and basic Three.js 3D map views; trajectory/telemetry/console panels; and explicit run results. Python is executed locally by Pyodide inside a dedicated Web Worker; it receives raw readings and a mission target coordinate, then returns motor commands. It cannot mutate simulator state or access true rover pose/target bearing.

MVP 1 intentionally has no backend, accounts, persistence, 3D terrain, terrain physics, obstacles, energy model, cloud execution, or hardware integration.

## Prerequisites

- Node.js 20.19+ or 22.12+ (Node 22 LTS recommended)
- npm 10+
- A modern desktop browser with Web Worker and WebAssembly support
- Network access on first Python runtime load. Pyodide 0.27.7 assets are fetched from jsDelivr; offline/PWA asset packaging is post-MVP work.

## Setup

```bash
npm install
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`). The editor starts with an API-only controller scaffold; students implement sensing and navigation themselves. Select a higher simulation speed to complete runs sooner.

## Development commands

```bash
npm run dev             # start the development server
npm run typecheck       # strict TypeScript checking
npm run lint            # lint TypeScript and React files
npm run format:check    # check formatting
npm run test            # run Vitest unit/integration tests
npm run test:e2e        # run Playwright browser tests
npm run build           # type-check and create a production bundle
npm run preview         # serve the production bundle locally
```

For first-time end-to-end testing, install the browser binary:

```bash
npx playwright install chromium
```

## Basic usage

1. Wait for the Python runtime to report `ready`.
2. Open **Sensor API** to consult every mission, GPS, compass, encoder, timing, and motor field.
3. Select a **Sensor scenario** in the left-hand panel. The replay seed and optional raw-sensor tuning make every run reproducible.
4. Edit `initialize(mission)` and `update(readings)` in the full-width Python editor. Implement your own sensing and navigation logic.
   Optionally call `report_estimate(latitude_deg, longitude_deg, heading_rad, label=None)` from `update` to visualize your localization estimate without gaining access to ground truth.
5. Select **Run**. The rover moves, and telemetry and `print()` output update.
   The **Raw sensor readings** panel shows exactly the GPS, compass, encoder, and timestamp values sent to `update(readings)`.
6. Use **Replay diagnostics** after stepping or running to scrub recorded ticks, inspect sensor sample/dropout status, compare raw measurements with UI-only truth, and view GPS/compass/encoder charts. The 2D map overlays valid raw GPS fixes.
7. Use **Monte Carlo batch** to run the current source sequentially across a seed range. Review reliability statistics, then select a trial to regenerate its detailed replay trace.
8. Select a **Mission benchmark** to load a fixed route, target, sensor profile, seed range, and trial count. Run it to record a UI-only score and compare completed benchmark batches from this browser session.
9. Use **Run full suite** to execute the current controller across every named benchmark in order. The report card aggregates score, success, distance, time, and controller failures; **Cancel suite** stops the active worker-backed batch safely.
   The suite includes **Scheduled fault recovery**, which applies deterministic GPS, compass, and encoder fault windows without revealing them to Python.
10. The **Mission results dashboard** keeps completed benchmark and suite summaries for the open browser session under the current algorithm label. It shows score, success, distance, time, controller-failure, and localization-error history; compare any two saved rows. A benchmark row's **Replay first trial** action restores its retained scenario and controller source, then regenerates that trial's diagnostics. Suite rows are aggregate summaries.
11. Use **Pause**, **Resume**, or **Step** to inspect controller behavior. **Stop** terminates the active Python worker, records a stopped result, and recreates a fresh runtime for the next run. **Reset** restores the deterministic start state.
    Use the **2D/3D** selector above the map to change visualization; this has no effect on rover physics.
12. A run ends at the target radius, time limit, user stop, controller error, or controller timeout.

## Architecture and planning

- [Current architecture](docs/architecture.md)
- [Student Python API](docs/architecture/student-python-api.md)
- [Approved MVP 1 plan](docs/mvp-1-plan.md)
- [Detailed simulation model](docs/architecture/simulation-model.md)
- [Worker protocol](docs/architecture/worker-protocol.md)
- [Test strategy](docs/planning/mvp1-test-strategy.md)
