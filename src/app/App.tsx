import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BenchmarkSuitePanel } from '../components/BenchmarkSuitePanel';
import { ResultsDashboard } from '../components/ResultsDashboard';
import { ConsolePanel } from '../components/ConsolePanel';
import { EditorPane } from '../components/EditorPane';
import { MapCanvas } from '../components/MapCanvas';
import { MissionBenchmarkPanel } from '../components/MissionBenchmarkPanel';
import { MonteCarloPanel } from '../components/MonteCarloPanel';
import { RunResultPanel } from '../components/RunResultPanel';
import { ReplayDiagnostics } from '../components/ReplayDiagnostics';
import { ScenarioPanel } from '../components/ScenarioPanel';
import { SensorPanel } from '../components/SensorPanel';
import { SensorReferencePage } from '../components/SensorReferencePage';
import { SimulationControls } from '../components/SimulationControls';
import { TelemetryPanel } from '../components/TelemetryPanel';
import {
  benchmarkReference,
  missionBenchmarkForId,
  missionBenchmarks,
  type MissionBenchmark,
} from '../scenarios/missionBenchmarks';
import { scenarioForPreset, type ScenarioPreset } from '../scenarios/presets';
import { scoreBenchmarkBatch } from '../domain/simulation/benchmarks';
import type {
  BenchmarkBatchResult,
  BenchmarkSuite,
  MonteCarloBatch,
  ScenarioConfig,
  SensorProfile,
} from '../domain/simulation/types';
import { SimulationSession } from '../features/simulation/simulationSession';
import { useSimulationStore } from '../features/simulation/store';

const ThreeViewport = lazy(() =>
  import('../components/ThreeViewport').then((module) => ({ default: module.ThreeViewport })),
);

type Page = 'lab' | 'sensors';

export function App() {
  const sessionRef = useRef<SimulationSession | undefined>(undefined);
  const [page, setPage] = useState<Page>(pageFromHash());
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [scenario, setScenario] = useState<ScenarioConfig>(
    () => missionBenchmarkForId('open-desert').scenario,
  );
  const [presetId, setPresetId] = useState<ScenarioPreset['id'] | 'custom'>('ideal');
  const [benchmarkId, setBenchmarkId] = useState<MissionBenchmark['id'] | undefined>('open-desert');
  const [benchmarkResults, setBenchmarkResults] = useState<readonly BenchmarkBatchResult[]>([]);
  const [suite, setSuite] = useState<BenchmarkSuite>();
  const [selectedRecordIndex, setSelectedRecordIndex] = useState<number | undefined>();
  const nextBatchId = useRef(0);
  const nextSuiteId = useRef(0);
  const suiteToken = useRef(0);
  const recordedBenchmarkBatchIds = useRef(new Set<string>());
  const pendingDashboardReplay = useRef<
    Readonly<{ batch: MonteCarloBatch; trialIndex: number }> | undefined
  >(undefined);
  const source = useSimulationStore((state) => state.source);
  const speed = useSimulationStore((state) => state.speed);
  const snapshot = useSimulationStore((state) => state.snapshot);
  const setSource = useSimulationStore((state) => state.setSource);
  const setSpeed = useSimulationStore((state) => state.setSpeed);
  const setSnapshot = useSimulationStore((state) => state.setSnapshot);

  const appendBenchmarkResult = useCallback((result: BenchmarkBatchResult) => {
    recordedBenchmarkBatchIds.current.add(result.batch.id);
    setBenchmarkResults((current) => {
      if (current.some((candidate) => candidate.batch.id === result.batch.id)) return current;
      return [...current, result].slice(-12);
    });
  }, []);

  useEffect(() => {
    const syncPage = () => setPage(pageFromHash());
    window.addEventListener('hashchange', syncPage);
    return () => window.removeEventListener('hashchange', syncPage);
  }, []);

  useEffect(() => {
    if (page !== 'lab') return;
    const session = new SimulationSession(scenario);
    sessionRef.current = session;
    const unsubscribe = session.subscribe(setSnapshot);
    void session.initialize().then(() => {
      const request = pendingDashboardReplay.current;
      if (!request || request.batch.scenario.id !== scenario.id) return;
      pendingDashboardReplay.current = undefined;
      void session.replayStoredBatchTrial(request.batch, request.trialIndex);
    });
    return () => {
      unsubscribe();
      session.dispose();
      sessionRef.current = undefined;
    };
  }, [page, scenario, setSnapshot]);

  useEffect(() => {
    if (snapshot.recordedTicks.length === 0) setSelectedRecordIndex(undefined);
  }, [snapshot.recordedTicks.length]);

  useEffect(() => {
    const batch = snapshot.batch;
    if (
      !batch ||
      batch.status !== 'completed' ||
      !batch.benchmark ||
      recordedBenchmarkBatchIds.current.has(batch.id)
    )
      return;
    const benchmark = missionBenchmarks.find((candidate) => candidate.id === batch.benchmark?.id);
    if (!benchmark) return;
    appendBenchmarkResult(toBenchmarkResult(batch, benchmark));
  }, [appendBenchmarkResult, snapshot.batch]);

  const navigate = (nextPage: Page) => {
    window.location.hash = nextPage === 'lab' ? '' : 'sensors';
    setPage(nextPage);
  };
  const updateSpeed = (nextSpeed: number) => {
    setSpeed(nextSpeed);
    sessionRef.current?.setSpeed(nextSpeed);
  };
  const run = () => void sessionRef.current?.run(source);
  const step = () => void sessionRef.current?.step(source);
  const replayDashboardBenchmark = (result: BenchmarkBatchResult) => {
    const request = { batch: result.batch, trialIndex: 0 };
    if (scenario.id === result.batch.scenario.id) {
      void sessionRef.current?.replayStoredBatchTrial(request.batch, request.trialIndex);
      return;
    }
    pendingDashboardReplay.current = request;
    setBenchmarkId(result.benchmark.id as MissionBenchmark['id']);
    setScenario(result.batch.scenario);
  };
  const selectPreset = (nextPresetId: ScenarioPreset['id']) => {
    setBenchmarkId(undefined);
    setPresetId(nextPresetId);
    setScenario(scenarioForPreset(nextPresetId));
  };
  const updateSensors = (sensors: SensorProfile) => {
    setBenchmarkId(undefined);
    setPresetId('custom');
    setScenario((current) => ({ ...current, id: 'custom-sensor-navigation', sensors }));
  };
  const selectBenchmark = (nextBenchmarkId: MissionBenchmark['id']) => {
    const benchmark = missionBenchmarkForId(nextBenchmarkId);
    setBenchmarkId(benchmark.id);
    setPresetId(benchmark.sensorProfileId);
    setScenario(benchmark.scenario);
  };
  const runBenchmark = (benchmark: MissionBenchmark) => {
    const batchId = `benchmark-${++nextBatchId.current}`;
    void sessionRef.current?.runBatch(source, benchmark.trialCount, benchmark.seedStart, {
      id: batchId,
      benchmark: benchmarkReference(benchmark),
    });
  };
  const runSuite = async () => {
    if (!sessionRef.current || snapshot.phase === 'batch_running') return;
    const session = sessionRef.current;
    const token = ++suiteToken.current;
    const id = `suite-${++nextSuiteId.current}`;
    setSuite({
      id,
      status: 'running',
      totalMissions: missionBenchmarks.length,
      completedMissions: 0,
      results: [],
    });

    for (const benchmark of missionBenchmarks) {
      if (token !== suiteToken.current) return;
      const reference = benchmarkReference(benchmark);
      setSuite((current) =>
        current?.id === id ? { ...current, currentMission: reference } : current,
      );
      const batch = await session.runBatch(source, benchmark.trialCount, benchmark.seedStart, {
        id: `${id}-${benchmark.id}`,
        benchmark: reference,
        scenario: benchmark.scenario,
      });
      if (token !== suiteToken.current) return;
      if (!batch) {
        setSuite((current) =>
          current?.id === id
            ? { ...current, status: 'cancelled', currentMission: undefined }
            : current,
        );
        return;
      }
      const result = toBenchmarkResult(batch, benchmark);
      appendBenchmarkResult(result);
      setSuite((current) =>
        current?.id === id
          ? {
              ...current,
              completedMissions: current.completedMissions + 1,
              currentMission: undefined,
              results: [...current.results, result],
            }
          : current,
      );
    }
    if (token === suiteToken.current) {
      setSuite((current) =>
        current?.id === id
          ? { ...current, status: 'completed', currentMission: undefined }
          : current,
      );
    }
  };
  const cancelSuite = () => {
    if (suite?.status !== 'running') return;
    ++suiteToken.current;
    sessionRef.current?.cancelBatch();
    setSuite({ ...suite, status: 'cancelled', currentMission: undefined });
  };
  const cancelActiveBatch = () => {
    if (suite?.status === 'running') cancelSuite();
    else sessionRef.current?.cancelBatch();
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">ARLISS Comeback-inspired</p>
          <h1>Rover Navigation Lab</h1>
        </div>
        <div className="app-header-actions">
          <p>
            {page === 'lab'
              ? 'You build the robot navigation stack.'
              : 'Consult sensor API fields and units.'}
          </p>
          <nav className="top-nav" aria-label="Application pages">
            <button
              type="button"
              className={page === 'lab' ? 'selected' : ''}
              onClick={() => navigate('lab')}
            >
              Navigation lab
            </button>
            <button
              type="button"
              className={page === 'sensors' ? 'selected' : ''}
              onClick={() => navigate('sensors')}
            >
              Sensor API
            </button>
          </nav>
        </div>
      </header>

      {page === 'sensors' ? (
        <SensorReferencePage onReturnToLab={() => navigate('lab')} />
      ) : (
        <>
          <EditorPane source={source} onChange={setSource} />
          <div className="run-deck">
            <SimulationControls
              phase={snapshot.phase}
              speed={speed}
              onRun={run}
              onPause={() => sessionRef.current?.pause()}
              onResume={() => sessionRef.current?.resume()}
              onStep={step}
              onStop={() => sessionRef.current?.stop()}
              onReset={() => sessionRef.current?.reset()}
              onSpeedChange={updateSpeed}
            />
            <RunResultPanel snapshot={snapshot} />
          </div>
          <MonteCarloPanel
            batch={snapshot.batch}
            defaultSeed={scenario.sensors.randomSeed}
            phase={snapshot.phase}
            onStart={(totalTrials, seedStart) =>
              void sessionRef.current?.runBatch(source, totalTrials, seedStart)
            }
            onCancel={cancelActiveBatch}
            onReplay={(trialIndex) => void sessionRef.current?.replayBatchTrial(trialIndex)}
          />
          <MissionBenchmarkPanel
            selectedId={benchmarkId}
            phase={snapshot.phase}
            results={benchmarkResults}
            onSelect={selectBenchmark}
            onRun={runBenchmark}
          />
          <BenchmarkSuitePanel
            suite={suite}
            phase={snapshot.phase}
            onRun={() => void runSuite()}
            onCancel={cancelSuite}
          />
          <ResultsDashboard
            results={benchmarkResults}
            suite={suite}
            onReplay={replayDashboardBenchmark}
          />
          <div className="lab-content">
            <aside className="lab-sidebar">
              <ScenarioPanel
                presetId={presetId}
                sensors={scenario.sensors}
                onPresetChange={selectPreset}
                onSensorsChange={updateSensors}
              />
              <TelemetryPanel snapshot={snapshot} />
              <SensorPanel snapshot={snapshot} />
            </aside>
            <div className="map-column">
              <section className="map-panel" aria-labelledby="map-heading">
                <div className="map-heading">
                  <div>
                    <p className="eyebrow">Mission map</p>
                    <h2 id="map-heading">Desert navigation</h2>
                  </div>
                  <div className="map-actions">
                    <div className="map-legend">
                      <span className="legend rover">Rover</span>
                      <span className="legend path">Path</span>
                      <span className="legend gps">GPS</span>
                      <span className="legend estimate">Estimate</span>
                      <span className="legend target">Target</span>
                    </div>
                    <div className="view-toggle" aria-label="Map view">
                      <button
                        type="button"
                        className={viewMode === '2d' ? 'selected' : ''}
                        onClick={() => setViewMode('2d')}
                        aria-pressed={viewMode === '2d'}
                      >
                        2D
                      </button>
                      <button
                        type="button"
                        className={viewMode === '3d' ? 'selected' : ''}
                        onClick={() => setViewMode('3d')}
                        aria-pressed={viewMode === '3d'}
                      >
                        3D
                      </button>
                    </div>
                  </div>
                </div>
                {viewMode === '2d' ? (
                  <MapCanvas
                    scenario={scenario}
                    simulation={snapshot.simulation}
                    recordedTicks={snapshot.recordedTicks}
                    selectedRecordIndex={selectedRecordIndex}
                  />
                ) : (
                  <Suspense fallback={<div className="viewport-loading">Loading 3D view…</div>}>
                    <ThreeViewport scenario={scenario} simulation={snapshot.simulation} />
                  </Suspense>
                )}
              </section>
            </div>
          </div>
          <ReplayDiagnostics
            records={snapshot.recordedTicks}
            selectedRecordIndex={selectedRecordIndex}
            scenario={scenario}
            result={snapshot.simulation.result}
            onSelect={setSelectedRecordIndex}
            onFollowLive={() => setSelectedRecordIndex(undefined)}
          />
          <div className="lab-console">
            <ConsolePanel entries={snapshot.consoleEntries} />
          </div>
        </>
      )}
    </main>
  );
}

function pageFromHash(): Page {
  return window.location.hash === '#sensors' ? 'sensors' : 'lab';
}

function toBenchmarkResult(
  batch: MonteCarloBatch,
  benchmark: MissionBenchmark,
): BenchmarkBatchResult {
  return Object.freeze({
    batch,
    benchmark: benchmarkReference(benchmark),
    score: scoreBenchmarkBatch(batch, benchmark.scenario),
  });
}
