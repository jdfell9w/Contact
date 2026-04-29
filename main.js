import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRButton } from "three/addons/webxr/VRButton.js";

let camera, scene, renderer, controls;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tempMatrix = new THREE.Matrix4();
const clickTargets = [];
const nodeMap = new Map();
let worldRoot;
let detailPanel;

window.addEventListener("error", (event) => {
  const msg = event.message || event.error?.message || "Unknown error";
  showError(msg);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  showError(reason instanceof Error ? reason.message : String(reason));
});

function showError(message) {
  let box = document.getElementById("errorBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "errorBox";
    box.style.cssText = `
      position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 9999;
      padding: 12px 14px; border-radius: 12px;
      color: #fff; background: rgba(160,0,20,0.9);
      font: 14px/1.35 system-ui, sans-serif; white-space: pre-wrap;
      border: 1px solid rgba(255,255,255,0.25);`;
    document.body.appendChild(box);
  }
  box.textContent = "Contact XR Presentation error:\n" + message;
}

init();

async function init() {
  const loading = document.createElement("div");
  loading.id = "loadStatus";
  loading.style.cssText = "position:fixed;right:12px;top:12px;z-index:20;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.55);color:white;font:13px system-ui";
  loading.textContent = "Loading Contact XR Presentation...";
  document.body.appendChild(loading);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040611);
  scene.fog = new THREE.FogExp2(0x040611, 0.020);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 250);
  camera.position.set(0, 1.0, 7.4);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.2, -3.8);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2.5;
  controls.maxDistance = 20;

  worldRoot = new THREE.Group();
  scene.add(worldRoot);

  addLights();
  addStars();
  addAtmosphereHint();

  const sceneData = await fetch("./scene.json").then(r => r.json());
  addReferenceBillboard(sceneData.settings.referenceImage);
  buildMindMap(sceneData);

  detailPanel = createDetailPanel();
  scene.add(detailPanel);

  setupControllers();
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("pointerdown", onPointerDown);

  loading.remove();
  renderer.setAnimationLoop(render);
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xb8cbff, 0x060814, 1.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(3, 6, 5);
  scene.add(key);

  const cyan = new THREE.PointLight(0x71d6ff, 24, 16);
  cyan.position.set(-4, 2, 2.5);
  scene.add(cyan);

  const magenta = new THREE.PointLight(0xff78ae, 20, 16);
  magenta.position.set(0, 3.4, 1.4);
  scene.add(magenta);

  const amber = new THREE.PointLight(0xffbc73, 20, 16);
  amber.position.set(4.8, 2.1, 2.0);
  scene.add(amber);
}

function addStars() {
  const count = 2200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 26 + Math.random() * 80;
    const t = Math.random() * Math.PI * 2;
    const u = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(u) * Math.cos(t);
    positions[i * 3 + 1] = r * Math.sin(u) * Math.sin(t);
    positions[i * 3 + 2] = -22 - Math.abs(r * Math.cos(u));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const m = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.05, transparent: true, opacity: 0.84, depthWrite: false
  });
  scene.add(new THREE.Points(g, m));
}

function addAtmosphereHint() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(6.15, 6.35, 120),
    new THREE.MeshBasicMaterial({ color: 0x2b4266, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, -2.45, -3.9);
  scene.add(ring);

  for (const [x, y, z, color, size, op] of [
    [-5.2, 1.0, -9.0, 0xff5d90, 6.5, 0.14],
    [0.3, 2.0, -8.7, 0x7d67ff, 7.4, 0.16],
    [5.0, 1.2, -9.2, 0x44d8ff, 6.7, 0.15],
  ]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture(color),
      transparent: true,
      opacity: op,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    s.position.set(x, y, z);
    s.scale.set(size, size, 1);
    scene.add(s);
  }
}

function radialTexture(hexColor) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  const color = new THREE.Color(hexColor);
  const rgb = `${Math.round(color.r*255)},${Math.round(color.g*255)},${Math.round(color.b*255)}`;
  grad.addColorStop(0, `rgba(${rgb},0.95)`);
  grad.addColorStop(0.38, `rgba(${rgb},0.25)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addReferenceBillboard(path) {
  new THREE.TextureLoader().load(
    path,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const aspect = tex.image.width / tex.image.height;
      const w = 12.6;
      const h = w / aspect;
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.20, side: THREE.DoubleSide })
      );
      board.position.set(0, 0.3, -8.1);
      worldRoot.add(board);
    },
    undefined,
    () => console.warn("Could not load reference image.")
  );
}

function buildMindMap(data) {
  for (const node of data.nodes) {
    let obj;
    if (node.kind === "ufo") obj = createUfoNode(node);
    else if (node.kind === "pair-earth") obj = createPairEarthNode(node);
    else obj = createCardNode(node);

    obj.position.set(...node.pos);
    obj.userData.node = node;
    worldRoot.add(obj);
    nodeMap.set(node.id, obj);

    obj.traverse((child) => {
      if (child.isMesh && child.name && child.name.startsWith("click_")) clickTargets.push(child);
    });
  }

  for (const edge of data.edges) {
    const a = nodeMap.get(edge.from);
    const b = nodeMap.get(edge.to);
    if (a && b) worldRoot.add(createConnector(a.position.clone(), b.position.clone(), edge.color));
  }
}

function createCardNode(node) {
  const group = new THREE.Group();
  const [w, h] = node.size || [2.5, 1.2];

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(node.panel || "#141926"),
      emissive: new THREE.Color(node.accent || "#ffffff").multiplyScalar(0.14),
      roughness: 0.52,
      metalness: 0.04,
      transparent: true,
      opacity: 0.93,
      side: THREE.DoubleSide
    })
  );
  base.name = `click_${node.id}`;
  group.add(base);

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)),
    new THREE.LineBasicMaterial({
      color: new THREE.Color(node.accent || "#ffffff"),
      transparent: true,
      opacity: 0.88
    })
  );
  border.position.z = 0.006;
  group.add(border);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(node.accent || "#ffffff"),
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  halo.position.z = -0.03;
  halo.scale.set(w * 1.35, h * 1.7, 1);
  group.add(halo);

  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.94, h * 0.88),
    new THREE.MeshBasicMaterial({
      map: makeCardTexture(node),
      transparent: true,
      side: THREE.DoubleSide
    })
  );
  text.position.z = 0.012;
  group.add(text);

  return group;
}

function makeCardTexture(node) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 700;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = node.accent || "#ffffff";
  ctx.shadowColor = node.accent || "#ffffff";
  ctx.shadowBlur = 12;
  ctx.font = "bold 64px system-ui, sans-serif";
  wrapText(ctx, node.title || "", c.width / 2, 110, 900, 68);

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.shadowBlur = 6;
  ctx.font = "30px system-ui, sans-serif";
  wrapText(ctx, node.subtitle || "", c.width / 2, 240, 890, 38);

  ctx.fillStyle = "rgba(255,255,255,0.93)";
  ctx.shadowBlur = 3;
  ctx.font = "26px system-ui, sans-serif";
  let y = 405;
  for (const line of (node.lines || []).slice(0, 3)) {
    wrapText(ctx, "• " + line, c.width / 2, y, 880, 34);
    y += 42;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return;
  const words = text.split(/\s+/);
  let line = "";
  const lines = [];
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  lines.push(line);
  const startY = y - (lines.length - 1) * lineHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}

function createPairEarthNode(node) {
  const group = new THREE.Group();
  const s = node.scale || 0.42;

  const left = createEarthSphere(s);
  left.position.set(-0.48, 0, 0);
  left.name = `click_${node.id}`;
  group.add(left);

  const right = createEarthSphere(s);
  right.position.set(0.48, 0, 0);
  group.add(right);

  const link = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.22, 0.0, 0.0),
      new THREE.Vector3(0.0, 0.08, 0.06),
      new THREE.Vector3(0.22, 0.0, 0.0),
    ]), 20, 0.012, 8, false),
    new THREE.MeshBasicMaterial({ color: 0x7ed8ff, transparent: true, opacity: 0.70 })
  );
  group.add(link);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.25),
    new THREE.MeshBasicMaterial({ map: makeLabelTexture(node.title || "Twin Earths", "#ffffff"), transparent: true, side: THREE.DoubleSide })
  );
  label.position.set(0, -0.78, 0);
  group.add(label);

  return group;
}

function createEarthSphere(radius) {
  const group = new THREE.Group();
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshStandardMaterial({
      map: makeEarthTexture(),
      emissive: 0x10315e,
      emissiveIntensity: 0.26,
      roughness: 0.88,
      metalness: 0.02
    })
  );
  earth.userData.earth = true;
  group.add(earth);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(0x7ed8ff),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  glow.scale.set(radius * 4.3, radius * 4.3, 1);
  group.add(glow);

  return group;
}

function makeEarthTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1f5fa8";
  ctx.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.03 + Math.random()*0.04})`;
    ctx.beginPath();
    ctx.ellipse(Math.random()*1024, Math.random()*512, 60+Math.random()*120, 20+Math.random()*50, Math.random()*Math.PI, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.fillStyle = "#5dbb63";
  const blobs = [
    [[110,120],[160,70],[240,85],[260,150],[230,200],[145,190]],
    [[295,245],[350,220],[420,245],[445,300],[400,345],[330,330]],
    [[515,120],[595,80],[680,110],[700,170],[650,230],[555,220],[505,170]],
    [[620,280],[680,250],[760,280],[780,350],[735,405],[655,392],[615,330]],
    [[815,140],[870,120],[930,140],[955,185],[920,225],[845,210],[800,175]],
    [[875,300],[930,280],[985,310],[990,360],[950,398],[900,390],[862,345]],
  ];
  for (const pts of blobs) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "rgba(47,110,44,0.55)";
  for (const pts of blobs) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + 10, pts[0][1] + 8);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + 10, pts[i][1] + 8);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createUfoNode(node) {
  const group = new THREE.Group();

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeUfoTexture(),
    transparent: true,
    depthWrite: false
  }));
  sprite.scale.set(1.05 * (node.scale || 1), 0.7 * (node.scale || 1), 1);
  sprite.name = `click_${node.id}`;
  group.add(sprite);

  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.9, 22, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x8de0ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide
    })
  );
  beam.rotation.x = Math.PI;
  beam.position.y = -0.56;
  group.add(beam);

  return group;
}

function makeUfoTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 512);

  ctx.shadowColor = "#77ff90";
  ctx.shadowBlur = 18;

  ctx.fillStyle = "rgba(170,255,182,0.92)";
  ctx.beginPath();
  ctx.ellipse(256, 210, 88, 58, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(185,190,195,0.98)";
  ctx.beginPath();
  ctx.ellipse(256, 260, 170, 58, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(122,128,136,0.96)";
  ctx.beginPath();
  ctx.ellipse(256, 282, 120, 28, 0, 0, Math.PI * 2);
  ctx.fill();

  const xs = [148, 205, 256, 307, 364];
  const cols = ["#ffe96b", "#90ff91", "#8ce3ff", "#ff9ad7", "#ffe96b"];
  for (let i = 0; i < xs.length; i++) {
    ctx.shadowColor = cols[i];
    ctx.shadowBlur = 16;
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.arc(xs[i], 272, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabelTexture(text, color="#ffffff") {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createConnector(start, end, color) {
  const group = new THREE.Group();
  const s = start.clone();
  const e = end.clone();
  const mid = s.clone().lerp(e, 0.5);
  mid.y += 0.18 + Math.random() * 0.12;
  mid.z += 0.28;

  const curve = new THREE.CatmullRomCurve3([s, mid, e]);
  const tube = new THREE.TubeGeometry(curve, 28, 0.013, 8, false);
  group.add(new THREE.Mesh(
    tube,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.74 })
  ));

  const spark = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(color),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  spark.position.copy(mid);
  spark.scale.set(0.18, 0.18, 1);
  group.add(spark);

  return group;
}

function createDetailPanel() {
  const group = new THREE.Group();
  group.visible = false;

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(3.7, 1.92),
    new THREE.MeshStandardMaterial({
      color: 0x0a0e18,
      emissive: 0x131d2f,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    })
  );
  group.add(bg);

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.7, 1.92)),
    new THREE.LineBasicMaterial({ color: 0xdde6ff, transparent: true, opacity: 0.72 })
  );
  border.position.z = 0.006;
  group.add(border);

  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(3.35, 1.62),
    new THREE.MeshBasicMaterial({ map: makeDetailTexture("Select a node", "Its longer note will appear here."), transparent: true, side: THREE.DoubleSide })
  );
  text.position.z = 0.012;
  text.name = "detailText";
  group.add(text);

  return group;
}

function makeDetailTexture(title, body) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 560;
  const ctx = c.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "bold 52px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#8fb2ff";
  ctx.shadowBlur = 10;
  wrapText(ctx, title, c.width / 2, 95, 920, 58);

  ctx.font = "30px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.shadowBlur = 4;
  wrapText(ctx, body, c.width / 2, 315, 900, 40);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function setupControllers() {
  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    scene.add(controller);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5)
    ]);
    const line = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    );
    controller.add(line);
    controller.addEventListener("selectstart", onControllerSelect);
  }
}

function onControllerSelect(event) {
  const controller = event.target;
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  selectIntersect();
}

function onPointerDown(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  selectIntersect();
}

function selectIntersect() {
  const hits = raycaster.intersectObjects(clickTargets, false);
  if (!hits.length) return;
  const mesh = hits[0].object;
  let group = mesh.parent;
  while (group && !group.userData.node) group = group.parent;
  if (group) focusNode(group);
}

function focusNode(group) {
  const p = new THREE.Vector3();
  group.getWorldPosition(p);
  controls.target.copy(p);
  const desired = p.clone().add(new THREE.Vector3(0, 0.15, 3.05));
  camera.position.lerp(desired, 0.55);
  updateDetailPanel(group.userData.node, p);
}

function updateDetailPanel(node, worldPos) {
  const mesh = detailPanel.getObjectByName("detailText");
  mesh.material.map?.dispose();
  mesh.material.map = makeDetailTexture(node.title || node.id, node.detail || node.subtitle || "");
  mesh.material.needsUpdate = true;
  detailPanel.position.copy(worldPos).add(new THREE.Vector3(0, -1.0, 0.32));
  detailPanel.visible = true;
}

function applyXrMovement() {
  if (!renderer.xr.isPresenting) return;
  const session = renderer.xr.getSession();
  if (!session) return;

  let x = 0, y = 0;
  for (const source of session.inputSources) {
    const gp = source.gamepad;
    if (!gp || gp.axes.length < 2) continue;
    const axX = gp.axes[2] ?? gp.axes[0] ?? 0;
    const axY = gp.axes[3] ?? gp.axes[1] ?? 0;
    if (Math.abs(axX) > 0.15) x = axX;
    if (Math.abs(axY) > 0.15) y = axY;
  }
  if (Math.abs(x) > 0.01 || Math.abs(y) > 0.01) {
    worldRoot.position.x -= x * 0.035;
    worldRoot.position.z += y * 0.05;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function billboardToCamera(obj) {
  const target = new THREE.Vector3();
  camera.getWorldPosition(target);
  obj.lookAt(target);
}

function render() {
  controls.update();
  applyXrMovement();

  const t = performance.now() * 0.001;
  nodeMap.forEach((obj) => {
    billboardToCamera(obj);
    if (obj.userData.node?.kind === "ufo") {
      obj.position.y += Math.sin(t * 1.9 + obj.position.x) * 0.0008;
    }
    if (obj.userData.node?.kind === "pair-earth") {
      obj.traverse((child) => {
        if (child.userData.earth) child.rotation.y += 0.0033;
      });
    }
  });

  if (detailPanel.visible) billboardToCamera(detailPanel);
  renderer.render(scene, camera);
}
