import type { Vec2 } from './types';

export const TAU = Math.PI * 2;

export function normalizeAngle(angleRad: number): number {
  let normalized = (angleRad + Math.PI) % TAU;
  if (normalized < 0) normalized += TAU;
  return normalized - Math.PI;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function bearingToTarget(position: Vec2, headingRad: number, target: Vec2): number {
  return normalizeAngle(Math.atan2(target.y - position.y, target.x - position.x) - headingRad);
}

export function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}
