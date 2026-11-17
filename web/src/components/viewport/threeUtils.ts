import * as THREE from "three";
import type { LocalAxes } from "../../types/pymas";
import type { Vec3 } from "../../engine/geometry";

export const Y_AXIS = new THREE.Vector3(0, 1, 0);
export const Z_AXIS = new THREE.Vector3(0, 0, 1);

export function toVector3(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

export function quaternionFromUnitVectors(
  from: THREE.Vector3,
  to: THREE.Vector3,
): THREE.Quaternion {
  const a = from.clone().normalize();
  const b = to.clone().normalize();
  return new THREE.Quaternion().setFromUnitVectors(a, b);
}

/** Cuaternión que lleva el eje +Z al eje indicado (para toros/rótulas). */
export function quaternionForAxis(axis: Vec3): THREE.Quaternion {
  return quaternionFromUnitVectors(Z_AXIS, toVector3(axis));
}

/** Cuaternión de una sección: base local (x,y,z) -> ejes globales. */
export function quaternionForLocalAxes(axes: LocalAxes): THREE.Quaternion {
  const matrix = new THREE.Matrix4().makeBasis(
    toVector3(axes.x),
    toVector3(axes.y),
    toVector3(axes.z),
  );
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}
