// engine.js — Renderer, scene, sky, day/night, clouds, rain, and fog.
import * as THREE from '../../lib/three.module.js';
import { createWaterTexture, createLavaTexture } from '../world/textures.js';

const SKY_PALETTE = {
  dayTop: new THREE.Color(0x3879d8),
  dayBottom: new THREE.Color(0x829fca),
  dayHorizon: new THREE.Color(0xc0e4ff),
  nightTop: new THREE.Color(0x030713),
  nightBottom: new THREE.Color(0x090e1c),
  nightHorizon: new THREE.Color(0x17233c),
  duskTop: new THREE.Color(0x523883),
  duskBottom: new THREE.Color(0x542f4e),
  duskHorizon: new THREE.Color(0xffa06a),
  rainGray: new THREE.Color(0x5a6a7a),
  cloudNight: new THREE.Color(0x25324b),
  cloudDay: new THREE.Color(0xffffff),
  cloudDusk: new THREE.Color(0xffb39a),
  cloudRain: new THREE.Color(0x737d8a),
};

export class Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio ?? 2);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: opts.antialias ?? true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if ('outputColorSpace' in this.renderer) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 75, window.innerWidth / window.innerHeight, 0.1, 600);
    this.baseFov = opts.fov ?? 75;

    // Fog
    this.fogColor = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(this.fogColor, 40, 160);

    // ---- Sky (gradient dome) -------------------------------------------
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x3a7bd5) },
      bottomColor: { value: new THREE.Color(0x10182b) },
      horizonColor: { value: new THREE.Color(0xb8dcff) },
    };
    const skyGeom = new THREE.SphereGeometry(400, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 horizonColor;
        varying vec3 vWorldPosition;
        void main() {
          // Direction relative to the camera: the sky remains stable even when
          // the player is far from the world origin.
          float h = normalize(vWorldPosition - cameraPosition).y;
          float upper = smoothstep(-0.04, 0.64, h);
          vec3 skyColor = mix(horizonColor, topColor, upper);
          float belowHorizon = 1.0 - smoothstep(-0.3, -0.02, h);
          skyColor = mix(skyColor, bottomColor * 0.7, belowHorizon);
          float horizonHaze = exp(-abs(h + 0.01) * 17.0) * 0.28;
          skyColor = mix(skyColor, horizonColor, horizonHaze);
          gl_FragColor = vec4(skyColor, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.sky = new THREE.Mesh(skyGeom, skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // ---- Sun & moon (with glow and procedural textures) --------------------
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.MeshBasicMaterial({
        map: this._makeSunTexture(),
        fog: false, transparent: true, depthWrite: false,
      })
    );
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 44),
      new THREE.MeshBasicMaterial({
        map: this._makeMoonTexture(),
        fog: false, transparent: true, depthWrite: false,
      })
    );
    this.scene.add(this.sun, this.moon);

    // ---- Stars ------------------------------------------------------------
    {
      const starCount = 700;
      const positions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const v = new THREE.Vector3(
          Math.random() * 2 - 1,
          Math.random() * 1.4 - 0.2,
          Math.random() * 2 - 1
        ).normalize().multiplyScalar(380);
        positions[i * 3] = v.x;
        positions[i * 3 + 1] = Math.abs(v.y) * 0.9 + 10;
        positions[i * 3 + 2] = v.z;
      }
      const starGeom = new THREE.BufferGeometry();
      starGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.starMaterial = new THREE.PointsMaterial({
        color: 0xffffff, size: 1.6, sizeAttenuation: false,
        transparent: true, opacity: 0, depthWrite: false, fog: false,
      });
      this.stars = new THREE.Points(starGeom, this.starMaterial);
      this.stars.frustumCulled = false;
      this.scene.add(this.stars);
    }

    // ---- Clouds ------------------------------------------------------------
    this.cloudTexture = this._makeCloudTexture();
    this.cloudMaterial = new THREE.MeshBasicMaterial({
      map: this.cloudTexture,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), this.cloudMaterial);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 112;
    this.scene.add(this.clouds);

    // ---- Lighting (for Lambert materials: mobs/items) ------------------------
    this.hemiLight = new THREE.HemisphereLight(0xbfd8ff, 0x6b6b52, 0.9);
    this.dirLight = new THREE.DirectionalLight(0xfff2d5, 0.85);
    this.dirLight.position.set(60, 120, 40);
    this.scene.add(this.hemiLight, this.dirLight);

    // ---- Water/lava texture (animated) ------------------------------------
    this.waterCanvas = createWaterTexture();
    this.waterTexture = new THREE.CanvasTexture(this.waterCanvas);
    this.waterTexture.magFilter = THREE.NearestFilter;
    this.waterTexture.minFilter = THREE.NearestFilter;
    this.waterTexture.wrapS = THREE.RepeatWrapping;
    this.waterTexture.wrapT = THREE.RepeatWrapping;
    this.waterTexture.colorSpace = THREE.SRGBColorSpace;

    this.lavaCanvas = createLavaTexture();
    this.lavaTexture = new THREE.CanvasTexture(this.lavaCanvas);
    this.lavaTexture.magFilter = THREE.NearestFilter;
    this.lavaTexture.minFilter = THREE.NearestFilter;
    this.lavaTexture.wrapS = THREE.RepeatWrapping;
    this.lavaTexture.wrapT = THREE.RepeatWrapping;
    this.lavaTexture.colorSpace = THREE.SRGBColorSpace;

    // ---- Rain -------------------------------------------------------------
    this.rainIntensity = 0;
    this._rainPoints = null;
    this._buildRain();

    // State
    this.timeOfDay = 0.25;  // 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight
    this.underwater = false;
    this._animTime = 0;
    this.dayFactor = 1;
    this._skyScratch = {
      top: new THREE.Color(),
      bottom: new THREE.Color(),
      horizon: new THREE.Color(),
      cloud: new THREE.Color(),
    };
    this._tintables = [];

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Procedural sun texture: core + soft halo. */
  _makeSunTexture() {
    const s = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext('2d');
    const glow = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    glow.addColorStop(0, 'rgba(255, 252, 224, 1)');
    glow.addColorStop(0.28, 'rgba(255, 238, 160, 0.95)');
    glow.addColorStop(0.55, 'rgba(255, 210, 110, 0.32)');
    glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(canvas);
  }

  /** Procedural moon texture: bright core + craters + halo. */
  _makeMoonTexture() {
    const s = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext('2d');
    const glow = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    glow.addColorStop(0, 'rgba(238, 242, 255, 1)');
    glow.addColorStop(0.32, 'rgba(212, 222, 255, 0.9)');
    glow.addColorStop(0.55, 'rgba(180, 195, 245, 0.25)');
    glow.addColorStop(1, 'rgba(160, 180, 240, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, s, s);
    // Craters
    ctx.fillStyle = 'rgba(150, 165, 210, 0.45)';
    for (const [cx, cy, r] of [[52, 50, 9], [72, 68, 6], [58, 82, 5], [78, 46, 4]]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
  }

  /** Procedural cloud texture: crisp cloud tiles instead of a blurred veil. */
  _makeCloudTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    // Deterministic cloud clusters made of crisp rectangular segments (Minecraft style)
    let seed = 777;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const clusters = [];
    for (let i = 0; i < 12; i++) {
      clusters.push({
        x: rand() * size,
        y: rand() * size,
        rx: 16 + rand() * 30,
        ry: 8 + rand() * 16,
      });
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const cl of clusters) {
      for (let i = 0; i < 7; i++) {
        const ox = (rand() - 0.5) * cl.rx * 1.5;
        const oy = (rand() - 0.5) * cl.ry * 1.3;
        const w = Math.round(cl.rx * (0.35 + rand() * 0.55));
        const h = Math.round(cl.ry * (0.4 + rand() * 0.6));
        // Seamlessly tileable, including at the corners
        for (const dx of [-size, 0, size]) {
          for (const dy of [-size, 0, size]) {
            ctx.fillRect(Math.round(cl.x + ox - w / 2 + dx), Math.round(cl.y + oy - h / 2 + dy), w, h);
          }
        }
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.repeat.set(5, 5);
    return tex;
  }

  _buildRain() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._rainPositions = positions;
    this._rainMaterial = new THREE.PointsMaterial({
      color: 0x9db8d8, size: 0.14, transparent: true, opacity: 0,
      depthWrite: false,
    });
    this._rainPoints = new THREE.Points(geom, this._rainMaterial);
    this._rainPoints.frustumCulled = false;
    this.scene.add(this._rainPoints);
    this._rainGeom = geom;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setFov(fov) {
    this.baseFov = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /** Smooth FOV kick while sprinting. */
  updateFov(sprinting, dt) {
    const target = sprinting ? this.baseFov + 8 : this.baseFov;
    if (Math.abs(this.camera.fov - target) > 0.1) {
      this.camera.fov += (target - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }
  }

  /** Interpolate colors. */
  static lerpColor(out, a, b, t) {
    out.r = a.r + (b.r - a.r) * t;
    out.g = a.g + (b.g - a.g) * t;
    out.b = a.b + (b.b - a.b) * t;
    return out;
  }

  /**
   * Register a terrain material to darken at night.
   * @param {THREE.Material} mat
   */
  registerTintable(mat) {
    if (mat && mat.color && !this._tintables.includes(mat)) this._tintables.push(mat);
    return mat;
  }

  /**
   * Adjust sky and lighting for the time of day.
   * @param {number} timeOfDay 0..1
   * @param {number} renderDistance current view distance (chunks) for fog
   */
  updateSky(timeOfDay, renderDistance, dt, raining) {
    this.timeOfDay = timeOfDay;
    this._animTime += dt;

    const t = timeOfDay;
    // Cycle: 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight
    const sunAngle = t * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.cos(sunAngle);
    const sunX = Math.sin(sunAngle);

    const dayFactor = Math.max(0, Math.min(1, (sunY + 0.18) / 0.5)); // 0 = night, 1 = day
    const duskFactor = Math.max(0, 1 - Math.abs(sunY) * 2.4);        // broad twilight phase
    this.dayFactor = dayFactor;

    // Sky colors: rich zenith, soft horizon, and separate twilight colors.
    // Scratch color objects avoid allocations in the mobile frame loop.
    const { top, bottom, horizon, cloud } = this._skyScratch;
    Engine.lerpColor(top, SKY_PALETTE.nightTop, SKY_PALETTE.dayTop, dayFactor);
    Engine.lerpColor(bottom, SKY_PALETTE.nightBottom, SKY_PALETTE.dayBottom, dayFactor);
    Engine.lerpColor(horizon, SKY_PALETTE.nightHorizon, SKY_PALETTE.dayHorizon, dayFactor);
    if (duskFactor > 0.02) {
      top.lerp(SKY_PALETTE.duskTop, duskFactor * 0.58);
      bottom.lerp(SKY_PALETTE.duskBottom, duskFactor * 0.72);
      horizon.lerp(SKY_PALETTE.duskHorizon, duskFactor * 0.88);
    }
    if (raining > 0) {
      top.lerp(SKY_PALETTE.rainGray, raining * 0.55);
      bottom.lerp(SKY_PALETTE.rainGray, raining * 0.45);
      horizon.lerp(SKY_PALETTE.rainGray, raining * 0.52);
    }
    this.skyUniforms.topColor.value.copy(top);
    this.skyUniforms.bottomColor.value.copy(bottom);
    this.skyUniforms.horizonColor.value.copy(horizon);

    // Blend fog smoothly into the horizon color without a gray color break.
    this.fogColor.copy(horizon).lerp(top, 0.16);
    if (this.underwater) {
      this.fogColor.set(0x1a4a8c);
      this.scene.fog.near = 2;
      this.scene.fog.far = 22;
    } else {
      const dist = renderDistance * 16;
      this.scene.fog.near = Math.max(24, dist * 0.45);
      this.scene.fog.far = Math.max(60, dist * 1.15);
    }

    // Sky objects follow the camera so the sky remains stable in the infinite world.
    const camPos = this.camera.position;
    this.stars.position.copy(camPos);
    const skyR = 320;
    this.sun.position.set(camPos.x + sunX * skyR, camPos.y + sunY * skyR * 0.75 + 30, camPos.z - 60);
    this.sun.lookAt(camPos);
    this.moon.position.set(camPos.x - sunX * skyR, camPos.y - sunY * skyR * 0.75 + 30, camPos.z + 60);
    this.moon.lookAt(camPos);

    this.sun.material.opacity = Math.min(1, dayFactor * 1.4 + duskFactor * 0.6);
    this.moon.material.opacity = Math.min(1, 1 - dayFactor + 0.15);
    this.starMaterial.opacity = Math.max(0, 1 - dayFactor * 1.6) * 0.95;

    // Move clouds by scrolling the texture instead of jumping positions (no visible edge jump)
    this.clouds.position.x = camPos.x;
    this.clouds.position.z = camPos.z;
    this.cloudTexture.offset.x = (this._animTime * 0.0016) % 1;
    this.cloudTexture.offset.y = (this._animTime * 0.0003) % 1;
    this.cloudMaterial.opacity = 0.72 + (1 - dayFactor) * 0.06 + raining * 0.18;
    Engine.lerpColor(cloud, SKY_PALETTE.cloudNight, SKY_PALETTE.cloudDay, dayFactor);
    if (duskFactor > 0.02) cloud.lerp(SKY_PALETTE.cloudDusk, duskFactor * 0.48);
    if (raining > 0) cloud.lerp(SKY_PALETTE.cloudRain, raining * 0.6);
    this.cloudMaterial.color.copy(cloud);

    // Night darkening for terrain materials (basic materials need
    // an explicit time-of-day color multiplier).
    const night = 1 - dayFactor;
    for (const m of this._tintables) {
      m.color.setRGB(1 - night * 0.62, 1 - night * 0.58, 1 - night * 0.38);
    }

    // Light colors
    this.hemiLight.intensity = 0.25 + dayFactor * 0.85;
    this.dirLight.intensity = 0.15 + dayFactor * 0.9;
    this.dirLight.position.set(camPos.x + sunX * 80, camPos.y + Math.max(10, sunY * 120), camPos.z + 30);
    this.dirLight.color.setHex(duskFactor > 0.2 ? 0xffb070 : 0xfff2d5);

    // Animate water/lava (4 frames)
    const frame = Math.floor(this._animTime * 3.2) % 4;
    this.waterTexture.offset.x = frame / 4;
    this.waterTexture.repeat.set(1 / 4, 1);
    this.lavaTexture.offset.x = frame / 4;
    this.lavaTexture.repeat.set(1 / 4, 1);

    // Rain
    if (this._rainPoints) {
      const targetOpacity = raining > 0 ? 0.5 * raining : 0;
      this._rainMaterial.opacity += (targetOpacity - this._rainMaterial.opacity) * Math.min(1, dt * 2);
      if (this._rainMaterial.opacity > 0.01) {
        const pos = this._rainPositions;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i + 1] -= dt * 28;
          if (pos[i + 1] < -8) {
            pos[i + 1] = 26;
            pos[i] = (Math.random() - 0.5) * 60;
            pos[i + 2] = (Math.random() - 0.5) * 60;
          }
        }
        this._rainGeom.attributes.position.needsUpdate = true;
        this._rainPoints.position.set(camPos.x, camPos.y, camPos.z);
      }
    }
  }

  /** Return true during daylight (for mobs, etc.). */
  isDay() {
    const sunY = Math.sin(this.timeOfDay * Math.PI * 2);
    return sunY > -0.12;
  }

  render() {
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }
}
