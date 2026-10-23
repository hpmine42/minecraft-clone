// selftest.js — Integrated self-diagnostics (runs in the browser, including mobile).
// Checks the system, WebGL, input, storage, world logic, and performance.

export async function runSelfTest(game) {
  const results = [];
  const add = (name, ok, detail = '') => results.push({ name, ok, detail });

  // ---- System --------------------------------------------------------------
  add('JavaScript-Engine', typeof window !== 'undefined', navigator.userAgent.slice(0, 80));
  add('Touch Detection', true, game.isTouch
    ? `Touch active (maxTouchPoints=${navigator.maxTouchPoints})`
    : 'No touch detected (desktop mode)');
  add('Viewport', true, `${window.innerWidth}×${window.innerHeight} px, DPR ${window.devicePixelRatio || 1}`);
  add('Orientation', true, window.innerWidth > window.innerHeight ? 'Landscape' : 'Portrait');

  // ---- WebGL ---------------------------------------------------------------
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      add('WebGL', true, String(renderer).slice(0, 70));
    } else {
      add('WebGL', false, 'Unable to create a WebGL context');
    }
  } catch (e) {
    add('WebGL', false, String(e).slice(0, 70));
  }

  // ---- Storage -------------------------------------------------------------
  try {
    localStorage.setItem('mkl-selftest', '1');
    const ok = localStorage.getItem('mkl-selftest') === '1';
    localStorage.removeItem('mkl-selftest');
    add('localStorage', ok, ok ? 'Read/write works' : 'Error');
  } catch (e) {
    add('localStorage', false, String(e).slice(0, 70));
  }

  // ---- Audio ---------------------------------------------------------------
  const audioOk = !!(window.AudioContext || window.webkitAudioContext);
  add('WebAudio', audioOk, audioOk ? 'Available (active after first tap)' : 'Not available');

  // ---- Game logic ---------------------------------------------------------
  if (game.world) {
    const w = game.world;
    const b = w.getBlock(Math.floor(game.player.position.x), Math.floor(game.player.position.y) - 1, Math.floor(game.player.position.z));
    add('World Loaded', w.chunks.size > 0, `${w.chunks.size} chunks generated`);
    add('Ground Below Player', b !== 0, `Block ID ${b} (${typeof b === 'number' ? 'ok' : 'invalid'})`);
    const stats = w.stats();
    add('Meshes', stats.solidVerts > 0, `${stats.solidVerts} visible vertices`);
    add('Raycast', true, (() => {
      const hit = w.raycast(game.player.eyePosition(), game.player.lookDir(), 5.2);
      return hit ? `hits block ${hit.id}` : 'no block in view';
    })());
    add('Lighting Engine', true, `Skylight at player: ${w.getSkyLight(Math.floor(game.player.position.x), Math.floor(game.player.position.y), Math.floor(game.player.position.z))}/15`);
  }

  if (game.inventory) {
    add('Inventory', game.inventory.slots.length === 36, `${game.inventory.slots.length} Slots`);
  }
  if (game.mobs) {
    add('Entities', true, `${game.mobs.mobs.length} Mobs, ${game.mobs.items.length} Items`);
  }

  // ---- Performance ---------------------------------------------------------
  const t0 = performance.now();
  let frames = 0;
  await new Promise((resolve) => {
    const tick = () => {
      frames++;
      if (frames >= 30) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Timeout-Fallback
    setTimeout(resolve, 1500);
  });
  const elapsed = performance.now() - t0;
  const fps = frames > 0 ? Math.round(frames / (elapsed / 1000)) : 0;
  add('Performance', fps >= 20, `approx. ${fps} FPS during test (${frames} frames in ${Math.round(elapsed)} ms)`);

  // ---- Controls -----------------------------------------------------------
  add('Input', true, game.isTouch
    ? 'Touch controls ready (joystick + buttons)'
    : `Keyboard/mouse ready${game.input && game.input.locked ? ' (pointer lock active)' : ''}`);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { results, passed, failed, fps };
}

/** Display results in the selftest screen. */
export function renderSelfTest(container, report) {
  const rows = report.results.map((r) => `
    <tr class="${r.ok ? 'ok' : 'fail'}">
      <td>${r.ok ? '✔' : '✘'}</td>
      <td>${r.name}</td>
      <td>${r.detail}</td>
    </tr>
  `).join('');
  container.innerHTML = `
    <h3>Self-Diagnostics: ${report.passed} passed, ${report.failed} failed</h3>
    <table class="selftest-table">${rows}</table>
    <p class="selftest-note">Tip: Run this test on your mobile device too, with particular attention
    to the controls and performance. If FPS is low, reduce Render Distance in Settings.</p>
  `;
}
