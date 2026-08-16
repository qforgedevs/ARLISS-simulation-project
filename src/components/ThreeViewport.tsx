import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ScenarioConfig, SimulationState } from '../domain/simulation/types';

type ThreeViewportProps = Readonly<{ scenario: ScenarioConfig; simulation: SimulationState }>;

type SceneHandles = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rover: THREE.Group;
  path?: THREE.Line;
};

export function ThreeViewport({ scenario, simulation }: ThreeViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<SceneHandles | undefined>(undefined);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handles = createScene(host, scenario);
    handlesRef.current = handles;
    const observer = new ResizeObserver(() => resizeScene(host, handles));
    observer.observe(host);
    resizeScene(host, handles);
    return () => {
      observer.disconnect();
      handles.path?.geometry.dispose();
      handles.renderer.dispose();
      host.replaceChildren();
      handlesRef.current = undefined;
    };
  }, [scenario]);

  useEffect(() => {
    const handles = handlesRef.current;
    if (!handles) return;
    updateScene(handles, simulation);
  }, [simulation]);

  return (
    <div
      ref={hostRef}
      className="three-viewport"
      aria-label="Three-dimensional rover navigation view"
      role="img"
    />
  );
}

function createScene(host: HTMLDivElement, scenario: ScenarioConfig): SceneHandles {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor('#c8d8df');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#c8d8df', 80, 220);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
  const centerX = (scenario.mapBoundsM.minX + scenario.mapBoundsM.maxX) / 2;
  const centerY = (scenario.mapBoundsM.minY + scenario.mapBoundsM.maxY) / 2;
  camera.position.set(centerX + 56, 85, centerY + 62);
  camera.lookAt(centerX, 0, centerY);

  scene.add(new THREE.HemisphereLight('#eaf7ff', '#8a6239', 2.2));
  const sun = new THREE.DirectionalLight('#fff4d8', 2.6);
  sun.position.set(-50, 100, 35);
  scene.add(sun);

  const worldWidth = scenario.mapBoundsM.maxX - scenario.mapBoundsM.minX;
  const worldHeight = scenario.mapBoundsM.maxY - scenario.mapBoundsM.minY;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, worldHeight),
    new THREE.MeshStandardMaterial({ color: '#c99e64', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, 0, centerY);
  scene.add(ground);

  const grid = new THREE.GridHelper(Math.max(worldWidth, worldHeight), 12, '#9d764d', '#b88f60');
  grid.position.set(centerX, 0.015, centerY);
  scene.add(grid);

  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(scenario.targetRadiusM * 0.86, scenario.targetRadiusM, 48),
    new THREE.MeshBasicMaterial({
      color: '#d85230',
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    }),
  );
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.set(scenario.target.x, 0.04, scenario.target.y);
  scene.add(targetRing);
  const targetMarker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 2.4, 20),
    new THREE.MeshStandardMaterial({ color: '#d85230', emissive: '#4a1209', roughness: 0.6 }),
  );
  targetMarker.position.set(scenario.target.x, 1.2, scenario.target.y);
  scene.add(targetMarker);

  const rover = createRover();
  scene.add(rover);
  return { renderer, scene, camera, rover };
}

function createRover(): THREE.Group {
  const rover = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.65, 1.2),
    new THREE.MeshStandardMaterial({ color: '#1f4d63', roughness: 0.55 }),
  );
  body.position.y = 0.75;
  rover.add(body);
  for (const side of [-0.78, 0.78]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.24, 20),
      new THREE.MeshStandardMaterial({ color: '#18262b', roughness: 0.9 }),
    );
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, 0.42, side);
    rover.add(wheel);
  }
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.9, 16),
    new THREE.MeshStandardMaterial({ color: '#f5d46c', emissive: '#4e3d09' }),
  );
  arrow.rotation.z = -Math.PI / 2;
  arrow.position.set(1.4, 0.8, 0);
  rover.add(arrow);
  return rover;
}

function updateScene(handles: SceneHandles, simulation: SimulationState): void {
  const { position, headingRad } = simulation.rover.pose;
  handles.rover.position.set(position.x, 0, position.y);
  handles.rover.rotation.y = -headingRad;
  if (handles.path) {
    handles.scene.remove(handles.path);
    handles.path.geometry.dispose();
  }
  if (simulation.trajectory.length > 1) {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      simulation.trajectory.map((point) => new THREE.Vector3(point.x, 0.08, point.y)),
    );
    handles.path = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: '#197a88', linewidth: 2 }),
    );
    handles.scene.add(handles.path);
  }
  handles.renderer.render(handles.scene, handles.camera);
}

function resizeScene(host: HTMLDivElement, handles: SceneHandles): void {
  const width = Math.max(host.clientWidth, 1);
  const height = Math.max(host.clientHeight, 1);
  handles.renderer.setSize(width, height, false);
  handles.camera.aspect = width / height;
  handles.camera.updateProjectionMatrix();
  handles.renderer.render(handles.scene, handles.camera);
}
