import * as THREE from 'three';
import { Input } from './core/input.js';
import { Environment } from './core/environment.js';
import { World } from './core/world.js';
import { Fx } from './core/fx.js';
import { Sfx } from './core/audio.js';
import { UI } from './core/ui.js';
import { CHARACTERS } from './characters/index.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 800);
camera.position.set(0, 1.6, 0);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

const ctx = { renderer, scene, camera, rig };
ctx.sfx = new Sfx();
ctx.fx = new Fx(scene, renderer);
ctx.input = new Input(renderer, rig, camera, renderer.domElement);
ctx.env = new Environment(scene);
ctx.world = new World(ctx);
ctx.ui = new UI(ctx);

let charDef = CHARACTERS[0];
ctx.character = charDef.create(ctx);
ctx.ui.drawPanel();
document.fonts?.ready?.then(() => {
  ctx.ui.drawPanel();
  ctx.ui.drawHud();
});

// ── 시작 화면 ──
const overlay = document.getElementById('overlay');
const btnVR = document.getElementById('btn-vr');
const btnDesk = document.getElementById('btn-desktop');
const status = document.getElementById('status');
const crosshair = document.getElementById('crosshair');

async function checkXR() {
  if (!('xr' in navigator)) {
    status.textContent = '이 브라우저는 WebXR을 지원하지 않습니다. HTTPS 주소로 VR 기기 브라우저에서 열거나, 데스크톱 모드로 체험하세요.';
    btnVR.disabled = true;
    return;
  }
  try {
    const ok = await navigator.xr.isSessionSupported('immersive-vr');
    if (!ok) {
      status.textContent = 'VR 기기가 감지되지 않았습니다. 데스크톱 모드로 체험할 수 있습니다.';
      btnVR.disabled = true;
    } else status.textContent = 'VR 준비 완료 — 컨트롤러와 핸드트래킹 모두 지원합니다. 컨트롤러를 내려놓으면 자동으로 손 인식으로 전환됩니다.';
  } catch (e) {
    status.textContent = 'WebXR 확인 실패: ' + e.message;
    btnVR.disabled = true;
  }
}
checkXR();

btnVR.addEventListener('click', async () => {
  ctx.sfx.unlock();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    });
    await renderer.xr.setSession(session);
    try { renderer.xr.setFoveation(1); } catch (_) { /* 미지원 */ }
    overlay.classList.add('hidden');
    ctx.input.mode = 'xr';
    session.addEventListener('end', () => {
      overlay.classList.remove('hidden');
      ctx.input.mode = 'none';
    });
    // VR 진입 시 패널을 눈앞에
    setTimeout(() => ctx.ui.showPanel(true), 300);
  } catch (e) {
    status.textContent = 'VR 세션 시작 실패: ' + e.message;
  }
});

btnDesk.addEventListener('click', () => {
  ctx.sfx.unlock();
  overlay.classList.add('hidden');
  crosshair.classList.remove('hidden');
  ctx.input.mode = 'desktop';
  ctx.ui.showPanel(true);
  renderer.domElement.requestPointerLock?.();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && ctx.input.mode === 'desktop' && !document.pointerLockElement) {
    overlay.classList.remove('hidden');
    crosshair.classList.add('hidden');
    ctx.input.mode = 'none';
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── 메인 루프 ──
const clock = new THREE.Clock();
const _up = new THREE.Vector3();
let idleT = 0;
renderer.setAnimationLoop((t, frame) => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const inp = ctx.input;
  inp.update(dt, frame);

  if (inp.mode === 'none') {
    // 시작 화면 뒤에서 천천히 회전하는 배경
    idleT += dt;
    rig.rotation.y = idleT * 0.05;
  }

  ctx.ui.handleInput(dt);
  if (inp.mode !== 'none') {
    ctx.character.update(dt);
    ctx.world.update(dt);
  }
  ctx.env.update(dt);
  ctx.fx.update(dt, renderer.xr.isPresenting);
  ctx.ui.update(dt);
  _up.set(0, 1, 0).applyQuaternion(inp.headQuat);
  ctx.sfx.updateListener(inp.head, inp.headDir, _up);
  inp.endFrame();

  renderer.render(scene, camera);
});

// 디버그용
window.__animevr = ctx;
