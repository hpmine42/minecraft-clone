// menu-preview.js — Lightweight instanced voxel diorama for the start screen.
import * as THREE from '../../lib/three.module.js';
import { BLOCK, BLOCKS } from '../world/blocks.js';
import { tileUV } from '../world/chunk.js';

const PREVIEW_BLOCK_IDS = [
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.LOG,
  BLOCK.LEAVES,
  BLOCK.COAL_ORE,
  BLOCK.IRON_ORE,
];

/** Map each cube face to the block's matching atlas tile. */
function createBlockGeometry(tiles) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const uv = geometry.getAttribute('uv');
  const faceTiles = [
    tiles[1], tiles[1], tiles[0], tiles[2] ?? tiles[1], tiles[1], tiles[1],
  ];

  for (let face = 0; face < faceTiles.length; face++) {
    const rect = tileUV(faceTiles[face]);
    for (let vertex = 0; vertex < 4; vertex++) {
      const index = face * 4 + vertex;
      const u = uv.getX(index);
      const v = uv.getY(index);
      uv.setXY(
        index,
        rect.u0 + u * (rect.u1 - rect.u0),
        rect.v0 + v * (rect.v1 - rect.v0)
      );
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

function terrainHeight(x, z) {
  const distance = Math.hypot(x, z);
  const rolling = Math.sin(x * 0.62) * 0.32 + Math.cos(z * 0.57) * 0.28;
  return Math.max(0, Math.round(3.7 - distance * 0.43 + rolling));
}

/**
 * Build a small, inexpensive diorama using actual atlas textures.
 * Blocks of the same type are grouped into an InstancedMesh.
 */
export function createMenuPreview(scene, atlasTexture) {
  const root = new THREE.Group();
  root.name = 'menu-world-preview';

  const placements = new Map(PREVIEW_BLOCK_IDS.map((id) => [id, []]));
  const addBlock = (x, y, z, id) => {
    if (placements.has(id)) placements.get(id).push([x, y, z]);
  };

  // Small rounded island with a grassy top and visible rock layers.
  for (let x = -7; x <= 7; x++) {
    for (let z = -7; z <= 7; z++) {
      if (Math.hypot(x, z) > 9.1) continue;
      const top = terrainHeight(x, z);
      for (let y = -2; y <= top; y++) {
        const id = y === top ? BLOCK.GRASS : y >= top - 1 ? BLOCK.DIRT : BLOCK.STONE;
        addBlock(x, y, z, id);
      }
    }
  }

  // Three small block trees create a clear silhouette without plant meshes.
  for (const [x, z, trunkHeight] of [[-4, -2, 4], [3, -3, 5], [2, 4, 4]]) {
    const ground = terrainHeight(x, z);
    for (let y = 1; y <= trunkHeight; y++) addBlock(x, ground + y, z, BLOCK.LOG);
    const canopyBase = ground + trunkHeight - 1;
    for (let layer = 0; layer < 3; layer++) {
      const radius = layer === 2 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > radius * 2 - 1) continue;
          addBlock(x + dx, canopyBase + layer, z + dz, BLOCK.LEAVES);
        }
      }
    }
    addBlock(x, canopyBase + 3, z, BLOCK.LEAVES);
  }

  // A few exposed ore blocks add deliberate color contrast to the rocky edge.
  addBlock(-7, -1, 0, BLOCK.COAL_ORE);
  addBlock(-7, -1, 1, BLOCK.IRON_ORE);

  const material = new THREE.MeshLambertMaterial({ map: atlasTexture });
  const position = new THREE.Vector3();
  const identity = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();

  for (const id of PREVIEW_BLOCK_IDS) {
    const blocks = placements.get(id);
    if (!blocks.length) continue;
    const definition = BLOCKS[id];
    const geometry = createBlockGeometry(definition.tiles || [0, 0, 0]);
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
    mesh.name = `menu-preview-block-${id}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    for (let index = 0; index < blocks.length; index++) {
      const [x, y, z] = blocks[index];
      position.set(x + 0.5, y + 0.5, z + 0.5);
      matrix.compose(position, identity, scale);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }

  scene.add(root);

  return {
    root,
    setVisible(visible) {
      root.visible = Boolean(visible);
    },
    updateCamera(camera, elapsedSeconds = 0) {
      if (!root.visible) return;
      const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const height = typeof window !== 'undefined' ? window.innerHeight : 720;
      const aspect = width / Math.max(1, height);
      const radius = aspect < 0.75 ? 31 : aspect < 1.15 ? 27 : 23;
      const angle = -0.72 + elapsedSeconds * 0.012;
      camera.position.set(
        Math.cos(angle) * radius,
        radius * 0.43 + Math.sin(elapsedSeconds * 0.36) * 0.22,
        Math.sin(angle) * radius
      );
      camera.lookAt(0, 1.7, 0);
    },
  };
}
