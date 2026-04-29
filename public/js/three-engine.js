export function initThreeEngine() {
  const THREE = window.THREE;
  const canvas = document.getElementById("engine-canvas");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!THREE || !canvas || reducedMotion) {
    return { setPreset() {} };
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 0.8, 18);

  const group = new THREE.Group();
  scene.add(group);

  const accent = new THREE.Color(0xff5722);
  const steel = new THREE.Color(0x9ba6a4);
  const dark = new THREE.Color(0x11110d);

  const lineMaterial = new THREE.LineBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.45
  });
  const steelMaterial = new THREE.LineBasicMaterial({
    color: steel,
    transparent: true,
    opacity: 0.18
  });
  const pointMaterial = new THREE.PointsMaterial({
    color: accent,
    size: 0.055,
    transparent: true,
    opacity: 0.8
  });

  buildTopography({ THREE, group, steelMaterial });
  buildCore({ THREE, group, lineMaterial, steelMaterial });
  buildDataTree({ THREE, group, lineMaterial, pointMaterial });

  const ambient = new THREE.AmbientLight(0xffffff, 0.38);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xff5722, 0.8);
  key.position.set(6, 7, 8);
  scene.add(key);
  const fill = new THREE.PointLight(0xdfff00, 0.12, 38);
  fill.position.set(-8, -2, 6);
  scene.add(fill);

  const pointer = { x: 0, y: 0 };
  const scroll = { value: 0 };
  const state = {
    targetScale: 1,
    targetOpacity: 0.45,
    pulse: 1
  };

  document.addEventListener(
    "pointermove",
    (event) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true }
  );

  window.addEventListener(
    "scroll",
    () => {
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      scroll.value = window.scrollY / max;
    },
    { passive: true }
  );

  function setPreset(name, index = 0) {
    const presets = {
      core: [1.0, 0.42, 1.0],
      secure: [1.04, 0.54, 1.14],
      ai: [1.08, 0.66, 1.35],
      cloud: [1.12, 0.58, 1.22],
      production: [1.18, 0.72, 1.5]
    };
    const [scale, opacity, pulse] = presets[name] || presets.core;
    state.targetScale = scale;
    state.targetOpacity = opacity;
    state.pulse = pulse;
    lineMaterial.opacity = opacity;
    pointMaterial.opacity = Math.min(0.95, opacity + 0.18);
    fill.intensity = 0.1 + index * 0.035;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });

  const clock = new THREE.Clock();
  function animate() {
    const elapsed = clock.getElapsedTime();

    group.rotation.y += ((scroll.value * Math.PI * 1.8 + pointer.x * 0.14) - group.rotation.y) * 0.035;
    group.rotation.x += ((-pointer.y * 0.08) - group.rotation.x) * 0.035;
    group.position.z = Math.sin(scroll.value * Math.PI * 2) * 2.4;
    group.scale.lerp(new THREE.Vector3(state.targetScale, state.targetScale, state.targetScale), 0.04);

    group.children.forEach((child, index) => {
      child.rotation.z += Math.sin(elapsed * 0.15 + index) * 0.0006 * state.pulse;
    });

    camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.02;
    camera.position.y += (0.8 - pointer.y * 0.7 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);

    renderer.setClearColor(dark, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  return { setPreset };
}

function buildTopography({ THREE, group, steelMaterial }) {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const size = 18;
  const rows = 22;

  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < rows - 1; x++) {
      const ax = (x / (rows - 1) - 0.5) * size;
      const bx = ((x + 1) / (rows - 1) - 0.5) * size;
      const az = (z / (rows - 1) - 0.5) * size;
      const ay = Math.sin(ax * 0.8) * 0.25 + Math.cos(az * 0.8) * 0.24 - 3.4;
      const by = Math.sin(bx * 0.8) * 0.25 + Math.cos(az * 0.8) * 0.24 - 3.4;
      vertices.push(ax, ay, az, bx, by, az);
    }
  }

  for (let x = 0; x < rows; x++) {
    for (let z = 0; z < rows - 1; z++) {
      const ax = (x / (rows - 1) - 0.5) * size;
      const az = (z / (rows - 1) - 0.5) * size;
      const bz = ((z + 1) / (rows - 1) - 0.5) * size;
      const ay = Math.sin(ax * 0.8) * 0.25 + Math.cos(az * 0.8) * 0.24 - 3.4;
      const by = Math.sin(ax * 0.8) * 0.25 + Math.cos(bz * 0.8) * 0.24 - 3.4;
      vertices.push(ax, ay, az, ax, by, bz);
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const mesh = new THREE.LineSegments(geometry, steelMaterial);
  mesh.position.z = -2;
  group.add(mesh);
}

function buildCore({ THREE, group, lineMaterial, steelMaterial }) {
  const rings = new THREE.Group();

  for (let i = 0; i < 7; i++) {
    const radius = 1.5 + i * 0.62;
    const geometry = new THREE.TorusGeometry(radius, 0.008, 6, 96);
    const material = i % 2 === 0 ? lineMaterial : steelMaterial;
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = Math.PI / 2 + i * 0.13;
    ring.rotation.y = i * 0.22;
    ring.position.y = -0.2 + i * 0.08;
    rings.add(ring);
  }

  const axisGeometry = new THREE.BufferGeometry();
  const axisVertices = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const x = Math.cos(angle) * 4.8;
    const z = Math.sin(angle) * 4.8;
    axisVertices.push(0, 0, 0, x, Math.sin(i) * 0.5, z);
  }
  axisGeometry.setAttribute("position", new THREE.Float32BufferAttribute(axisVertices, 3));
  rings.add(new THREE.LineSegments(axisGeometry, lineMaterial));

  rings.position.set(4.6, 0.2, -5.2);
  group.add(rings);
}

function buildDataTree({ THREE, group, lineMaterial, pointMaterial }) {
  const points = [];
  const branches = [];
  const levels = 5;

  for (let level = 0; level < levels; level++) {
    const count = 4 + level * 3;
    const y = 3.8 - level * 1.15;
    const radius = 0.8 + level * 1.15;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + level * 0.28;
      const point = new THREE.Vector3(Math.cos(angle) * radius - 4.8, y, Math.sin(angle) * radius - 3.2);
      points.push(point);
      if (level > 0) {
        const parentIndex = Math.floor((points.length - 1) * 0.54) % Math.max(1, points.length - count);
        branches.push(points[parentIndex], point);
      }
    }
  }

  const pointGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const branchGeometry = new THREE.BufferGeometry().setFromPoints(branches);
  const pointCloud = new THREE.Points(pointGeometry, pointMaterial);
  const branchLines = new THREE.LineSegments(branchGeometry, lineMaterial);

  group.add(branchLines);
  group.add(pointCloud);
}
