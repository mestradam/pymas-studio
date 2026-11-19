import * as THREE from "three";
import type { LocalAxes, ReleaseFlags, PymasModel } from "../../types/pymas";
import {
  framePositions,
  sectionDisplayDimensions,
  type Vec3,
} from "../../engine/geometry";
import { quaternionForAxis } from "./threeUtils";
import { useThemeStore } from "../../store/useThemeStore";

interface ReleaseMarkersProps {
  model: PymasModel;
  showReleases: boolean;
  sectionScale: number;
  diagonal: number;
}

interface ReleaseEnd {
  key: string;
  point: Vec3;
  inward: Vec3;
  radius: number;
  length: number;
  flags: ReleaseFlags;
  localAxes: LocalAxes;
}

const ROTATION_AXES: Array<keyof ReleaseFlags> = [
  "torsion",
  "bending_y",
  "bending_z",
];

function hasTranslationRelease(flags: ReleaseFlags): boolean {
  return flags.axial || flags.shear_y || flags.shear_z;
}

function hasRotationRelease(flags: ReleaseFlags): boolean {
  return ROTATION_AXES.some((axis) => flags[axis]);
}

export default function ReleaseMarkers({
  model,
  showReleases,
  sectionScale,
  diagonal,
}: ReleaseMarkersProps) {
  const theme = useThemeStore((state) => state.theme);
  const light = theme === "light";
  if (!showReleases) return null;

  const ends: ReleaseEnd[] = [];
  for (const frameId of model.frameOrder) {
    const frame = model.frames[frameId];
    if (!frame) continue;
    const { p1, p2 } = framePositions(frame, model.nodes);
    const section = model.sections[frame.sectionId];
    const dims = section ? sectionDisplayDimensions(section) : { dy: 0, dz: 0 };
    const sectionRadius =
      Math.max(dims.dy, dims.dz) * sectionScale * 0.8;
    const radius = Math.min(
      Math.max(sectionRadius, diagonal * 0.006),
      diagonal * 0.022,
    );
    const inwardX = frame.localAxes.x;
    const length = Math.max(frame.length, 1e-6);

    if (hasTranslationRelease(frame.releaseI) || hasRotationRelease(frame.releaseI)) {
      ends.push({
        key: `${frame.id}-i`,
        point: p1,
        inward: inwardX,
        radius,
        length,
        flags: frame.releaseI,
        localAxes: frame.localAxes,
      });
    }
    if (hasTranslationRelease(frame.releaseJ) || hasRotationRelease(frame.releaseJ)) {
      ends.push({
        key: `${frame.id}-j`,
        point: p2,
        inward: [-inwardX[0], -inwardX[1], -inwardX[2]],
        radius,
        length,
        flags: frame.releaseJ,
        localAxes: frame.localAxes,
      });
    }
  }

  return (
    <group renderOrder={4}>
      {ends.map((end) => {
        const offset = Math.min(
          end.length * 0.12,
          Math.max(end.radius * 1.35, diagonal * 0.006),
        );
        const position: Vec3 = [
          end.point[0] + end.inward[0] * offset,
          end.point[1] + end.inward[1] * offset,
          end.point[2] + end.inward[2] * offset,
        ];
        const rotationAxes = ROTATION_AXES.filter((axis) => end.flags[axis]);
        const materialColor = light ? "#a16207" : "#fde047";

        return (
          <group key={end.key} position={position}>
            {rotationAxes.length > 0 ? (
              rotationAxes.map((axis, index) => {
                const localAxis =
                  axis === "torsion"
                    ? end.localAxes.x
                    : axis === "bending_y"
                      ? end.localAxes.y
                      : end.localAxes.z;
                const r = end.radius * (1 + index * 0.42);
                return (
                  <mesh
                    key={`${end.key}-${axis}`}
                    quaternion={quaternionForAxis(localAxis)}
                  >
                    <torusGeometry args={[r, Math.max(r * 0.16, 0.002), 8, 30]} />
                    <meshStandardMaterial
                      color={materialColor}
                      emissive={materialColor}
                      emissiveIntensity={0.45}
                      roughness={0.3}
                      metalness={0.2}
                    />
                  </mesh>
                );
              })
            ) : (
              <mesh
                quaternion={
                  new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(0.5, 0.4, 0.2),
                  )
                }
              >
                <octahedronGeometry args={[end.radius * 0.9, 0]} />
                <meshStandardMaterial
                  color={light ? "#dc2626" : "#fca5a5"}
                  emissive={light ? "#b91c1c" : "#f87171"}
                  emissiveIntensity={0.35}
                  roughness={0.35}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
