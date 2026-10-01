import * as THREE from 'three';

/** True isometric camera: looking down the (-1, -1, -1) diagonal. */
export const CAMERA_DIR = new THREE.Vector3(1, 1, 1).normalize();
export const CAMERA_DISTANCE = 60;
/** sin of the isometric elevation angle (35.26 deg): how much ground depth shrinks on screen. */
export const SIN_ELEVATION = 1 / Math.sqrt(3);

/** Map-plane (x, y=z) directions matching screen right / screen up. */
export const SCREEN_RIGHT = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
export const SCREEN_UP = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };

export const screenX = (dx: number, dy: number): number => (dx - dy) * Math.SQRT1_2;

/** Screen-space angle (radians, counter-clockwise from screen right) of a map-plane direction. */
export function screenAngle(dx: number, dy: number): number {
  const right = (dx - dy) * Math.SQRT1_2;
  const up = (-dx - dy) * Math.SQRT1_2 * SIN_ELEVATION;
  return Math.atan2(up, right);
}

export function spriteMaterial(map: THREE.Texture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
}
