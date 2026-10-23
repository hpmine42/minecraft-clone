// block-outline.js — Flush black edge outline around the target block.
import * as THREE from '../../lib/three.module.js';

const EDGE_WIDTH = 0.012;
const FACE_DEFINITIONS = [
  { normal: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { normal: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, -1] },
  { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

function makeFaceFrameGeometry() {
  const positions = [];
  const indices = [];
  const half = 0.5;
  const halfWidth = EDGE_WIDTH / 2;

  const addQuad = (face, centerU, centerV, halfU, halfV) => {
    const start = positions.length / 3;
    for (const [uAmount, vAmount] of [
      [centerU - halfU, centerV - halfV],
      [centerU + halfU, centerV - halfV],
      [centerU + halfU, centerV + halfV],
      [centerU - halfU, centerV + halfV],
    ]) {
      positions.push(
        face.normal[0] * half + face.u[0] * uAmount + face.v[0] * vAmount,
        face.normal[1] * half + face.u[1] * uAmount + face.v[1] * vAmount,
        face.normal[2] * half + face.u[2] * uAmount + face.v[2] * vAmount,
      );
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };

  for (const face of FACE_DEFINITIONS) {
    // Four thin strips lie exactly in the block face and outline it.
    for (const sign of [-1, 1]) {
      addQuad(face, 0, sign * (half - halfWidth), half, halfWidth);
      addQuad(face, sign * (half - halfWidth), 0, halfWidth, half);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class BlockOutline {
  constructor(scene) {
    this.geometry = makeFaceFrameGeometry();
    this.material = new THREE.MeshBasicMaterial({
      color: 0x050505,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.scene = scene;
    this.scene.add(this.mesh);
  }

  /** Show flush edges on visible block faces. */
  update(hit) {
    if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y) || !Number.isFinite(hit.z)) {
      this.hide();
      return;
    }
    this.mesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    this.mesh.visible = true;
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
