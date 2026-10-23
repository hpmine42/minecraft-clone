// block-cracks.js — Fixed, pixel-perfect Minecraft-style mining stages.
import * as THREE from '../../lib/three.module.js';

const TEXTURE_SIZE = 16;
const CRACK_CORE = 'rgba(28,28,28,0.96)';
const CRACK_EDGE = 'rgba(112,112,112,0.82)';

// A single hand-drawn crack network expands in stages, so cracks do not jump
// randomly across the surface and remain pixel-identical at every stage.
const CRACK_SEGMENTS = [
  // Three pixels in the center form the starting point, from which the network branches.
  { stage: 0, points: [[7, 7], [8, 8], [9, 7]] },
  // The first stages grow in two diagonal directions.
  { stage: 1, points: [[9, 7], [10, 6], [11, 6]] },
  { stage: 2, points: [[7, 7], [6, 6], [5, 6]] },
  { stage: 3, points: [[11, 6], [12, 5], [13, 5]] },
  { stage: 4, points: [[5, 6], [4, 5], [3, 5]] },
  // Connected upper, lower-left, and lower-right branches are added next.
  { stage: 5, points: [[8, 8], [8, 7], [8, 6]] },
  { stage: 6, points: [[8, 8], [7, 9], [6, 10]] },
  { stage: 7, points: [[6, 10], [5, 10], [4, 11]] },
  { stage: 8, points: [[8, 8], [9, 9], [10, 10]] },
  // The final stage extends the southeast arm and adds a short south arm.
  { stage: 9, points: [[10, 10], [11, 10], [12, 11]] },
  { stage: 9, points: [[8, 8], [8, 9], [8, 10]] },
];

function directionOf(points, index) {
  const before = points[Math.max(0, index - 1)];
  const after = points[Math.min(points.length - 1, index + 1)];
  return [Math.sign(after[0] - before[0]), Math.sign(after[1] - before[1])];
}

function renderStage(ctx, stage) {
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  ctx.imageSmoothingEnabled = false;

  const corePixels = new Set();
  const edgePixels = new Set();
  for (const segment of CRACK_SEGMENTS) {
    if (segment.stage > stage) continue;
    for (let i = 0; i < segment.points.length; i++) {
      const [x, y] = segment.points[i];
      corePixels.add(`${x},${y}`);
      const [dx, dy] = directionOf(segment.points, i);
      const edgeX = x + Math.sign(-dy);
      const edgeY = y + Math.sign(dx);
      if (edgeX >= 0 && edgeX < TEXTURE_SIZE && edgeY >= 0 && edgeY < TEXTURE_SIZE) {
        edgePixels.add(`${edgeX},${edgeY}`);
      }
    }
  }

  // A gray pixel beside the dark core creates the grainy, sharp-edged vanilla
  // crack look. Only 1×1 pixels are drawn.
  ctx.fillStyle = CRACK_EDGE;
  for (const pixel of edgePixels) {
    if (corePixels.has(pixel)) continue;
    const [x, y] = pixel.split(',').map(Number);
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = CRACK_CORE;
  for (const pixel of corePixels) {
    const [x, y] = pixel.split(',').map(Number);
    ctx.fillRect(x, y, 1, 1);
  }
}

export class BlockCracks {
  constructor(scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = TEXTURE_SIZE;
    this.context = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // Full-face coplanar overlays; depth bias prevents z-fighting without an air gap.
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.96,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false,
    });
    this.mesh = new THREE.Group();
    this.faces = [];
    const faceTransforms = [
      { position: [0.5, 0, 0], rotation: [0, Math.PI / 2, 0] },
      { position: [-0.5, 0, 0], rotation: [0, -Math.PI / 2, 0] },
      { position: [0, 0.5, 0], rotation: [-Math.PI / 2, 0, 0] },
      { position: [0, -0.5, 0], rotation: [Math.PI / 2, 0, 0] },
      { position: [0, 0, 0.5], rotation: [0, 0, 0] },
      { position: [0, 0, -0.5], rotation: [0, Math.PI, 0] },
    ];
    for (const face of faceTransforms) {
      const plane = new THREE.Mesh(this.geometry, this.material);
      plane.position.set(...face.position);
      plane.rotation.set(...face.rotation);
      plane.renderOrder = 11;
      plane.frustumCulled = false;
      this.mesh.add(plane);
      this.faces.push(plane);
    }
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.scene = scene;
    this.scene.add(this.mesh);
    this.stage = -1;
  }

  /** Map progress from 0 to 1 onto one of ten fixed mining stages. */
  update(hit, progress) {
    if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y) || !Number.isFinite(hit.z)
      || !Number.isFinite(progress) || progress <= 0) {
      this.hide();
      return;
    }
    const stage = Math.min(9, Math.max(0, Math.floor(Math.min(1, progress) * 10)));
    if (stage !== this.stage) this._drawStage(stage);
    this.mesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    this.mesh.visible = true;
  }

  _drawStage(stage) {
    renderStage(this.context, stage);
    this.texture.needsUpdate = true;
    this.stage = stage;
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
