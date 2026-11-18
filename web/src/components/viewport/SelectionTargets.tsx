import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useModelStore } from "../../store/useModelStore";
import type { PymasModel } from "../../types/pymas";
import {
  framePositions,
  nodePosition,
  sectionDisplayDimensions,
  type Vec3,
} from "../../engine/geometry";
import { quaternionForLocalAxes } from "./threeUtils";

interface SelectionTargetsProps {
  model: PymasModel;
  diagonal: number;
}

interface FrameTarget {
  frameId: string;
  position: Vec3;
  quaternion: THREE.Quaternion;
  scale: Vec3;
}

interface NodeTarget {
  nodeId: string;
  position: Vec3;
}

/**
 * Volúmenes invisibles para el raycasting.
 *
 * En modo alámbrico las líneas son demasiado finas para acertar con el ratón,
 * así que se usan proxies con un grosor mínimo proporcional a la diagonal del
 * modelo. Los proxies nunca se dibujan (`material.visible = false`) pero sí
 * participan en el raycast de three.js.
 */
export default function SelectionTargets({
  model,
  diagonal,
}: SelectionTargetsProps) {
  const selectFrame = useModelStore((state) => state.selectFrame);
  const selectNode = useModelStore((state) => state.selectNode);

  const minThickness = Math.max(diagonal * 0.008, 1e-5);
  const nodeRadius = Math.max(diagonal * 0.011, minThickness * 0.9);

  const frames = useMemo<FrameTarget[]>(() => {
    const entries: FrameTarget[] = [];
    for (const frameId of model.frameOrder) {
      const frame = model.frames[frameId];
      if (!frame) continue;
      const section = model.sections[frame.sectionId];
      const dims = section
        ? sectionDisplayDimensions(section)
        : { dy: minThickness, dz: minThickness };
      const { p1, p2 } = framePositions(frame, model.nodes);
      entries.push({
        frameId,
        position: [
          (p1[0] + p2[0]) / 2,
          (p1[1] + p2[1]) / 2,
          (p1[2] + p2[2]) / 2,
        ],
        quaternion: quaternionForLocalAxes(frame.localAxes),
        scale: [
          Math.max(frame.length, minThickness),
          Math.max(dims.dy, minThickness),
          Math.max(dims.dz, minThickness),
        ],
      });
    }
    return entries;
  }, [model, minThickness]);

  const nodes = useMemo<NodeTarget[]>(() => {
    const entries: NodeTarget[] = [];
    for (const nodeId of model.nodeOrder) {
      const node = model.nodes[nodeId];
      if (!node) continue;
      entries.push({ nodeId: node.id, position: nodePosition(node) });
    }
    return entries;
  }, [model]);

  const frameRef = useRef<THREE.InstancedMesh>(null);
  const nodeRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = frameRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    frames.forEach((entry, index) => {
      position.set(...entry.position);
      quaternion.copy(entry.quaternion);
      scale.set(...entry.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [frames]);

  useLayoutEffect(() => {
    const mesh = nodeRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(nodeRadius, nodeRadius, nodeRadius);
    nodes.forEach((entry, index) => {
      position.set(...entry.position);
      matrix.compose(position, new THREE.Quaternion(), scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [nodes, nodeRadius]);

  const hoverCursor = (active: boolean) => {
    document.body.style.cursor = active ? "pointer" : "";
  };

  const handleFrame = (event: ThreeEvent<MouseEvent>) => {
    const index = event.instanceId;
    if (index === undefined) return;
    const target = frames[index];
    if (!target) return;
    event.stopPropagation();
    selectFrame(target.frameId);
  };

  const handleNode = (event: ThreeEvent<MouseEvent>) => {
    const index = event.instanceId;
    if (index === undefined) return;
    const target = nodes[index];
    if (!target) return;
    event.stopPropagation();
    selectNode(target.nodeId);
  };

  return (
    <group>
      <instancedMesh
        ref={frameRef}
        args={[undefined, undefined, Math.max(frames.length, 1)]}
        onPointerDown={handleFrame}
        onPointerOver={() => hoverCursor(true)}
        onPointerOut={() => hoverCursor(false)}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial visible={false} />
      </instancedMesh>

      <instancedMesh
        ref={nodeRef}
        args={[undefined, undefined, Math.max(nodes.length, 1)]}
        onPointerDown={handleNode}
        onPointerOver={() => hoverCursor(true)}
        onPointerOut={() => hoverCursor(false)}
      >
        <sphereGeometry args={[1, 14, 10]} />
        <meshBasicMaterial visible={false} />
      </instancedMesh>
    </group>
  );
}
