import * as THREE from 'three';
import { Input } from './core/input.js';
import { Environment } from './core/env/environment.js';
import { World } from './core/world.js';
import { Fx } from './core/fx.js';
import { Sfx } from './core/audio.js';
import { UI, JFONT } from './core/ui.js';
import { Melee } from './core/melee.js';
import { Grab } from './core/grab.js';
import { preload } from './core/assets.js';
import { CHARACTERS } from './characters/index.js';

// ── 설정 (브라우저에 저장) ──
const DEFAULTS = {
  character: 'gojo', background: 'white', hud: false, skillNames: true, damageNumbers: true,
  invincible: false, dummyAI: true, locomotion: true, kaminoRule: false, heightOffset: 0, blackFlashChance: 0.2,
  domainGesture: true, shinigamiEyes: true, deathDelay40: false,
};
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem('animevr.settings') || '{}');
} catch (_) { /* 저장소 사용 불가 */ }
const settings = { ...DEFAULTS, ...saved };

const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.localClippingEnabled = true; // 절단 조각
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 900);
camera.position.set(0, 1.6, 0);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

const ctx = { renderer, scene, camera, rig, settings };
ctx.sfx = new Sfx();
ctx.sfx.preloadClips({
  gojoDomain: 'assets/audio/gojo_domain_voice.mp3',
  sukunaDomain: 'assets/audio/sukuna_domain_voice.mp3',
  shrineMusic: 'assets/audio/sukuna_domain_music.mp3',
});
ctx.fx = new Fx(scene, renderer);
ctx.input = new Input(renderer, rig, camera, renderer.domElement);
ctx.input.locomotion = settings.locomotion;
ctx.world = new World(ctx);
ctx.env = new Environment(ctx);
ctx.ui = new UI(ctx);
ctx.melee = new Melee(ctx);
ctx.grab = new Grab(ctx);
ctx.character = null;

const game = {
  hitstop: 0,
  saveSettings() {
    try {
      localStorage.setItem('animevr.settings', JSON.stringify(settings));
    } catch (_) { /* 무시 */ }
  },
  applyHeight() {
    rig.position.y = settings.heightOffset;
  },
  setBackground(id) {
    settings.background = id;
    ctx.grab.releaseAll();
    ctx.character?.cancelDomain?.();
    return ctx.env.setBackground(id);
  },
  start(charId, bgId) {
    settings.character = charId;
    settings.background = bgId;
    this.saveSettings();
    ctx.grab.releaseAll();
    ctx.character?.dispose();
    const bg = this.setBackground(bgId);
    rig.position.set(bg.spawn.x, settings.heightOffset, bg.spawn.z);
    rig.rotation.set(0, 0, 0);
    ctx.input.yaw = 0;
    ctx.input.pitch = 0;
    const def = CHARACTERS.find((c) => c.id === charId) ?? CHARACTERS[0];
    ctx.character = def.create(ctx);
    ctx.ui.showTitle(false);
    // 바로 시험해볼 수 있게 기본 더미 하나
    ctx.input.update(0);
    ctx.world.spawnDummies('basic', 100, 1);
    ctx.ui.callout(`${def.name} — 메뉴: Y 버튼 / 왼손바닥 위로 / H`, { size: 54, dur: 3 });
  },
  toTitle() {
    ctx.grab.releaseAll();
    ctx.character?.dispose();
    ctx.character = null;
    ctx.world.clearDummies();
    ctx.world.clearDebris();
    ctx.ui.showOptions(false);
    ctx.ui.showTitle(true);
  },
};
ctx.game = game;

// 모델(더미·하얀 방·사당·데스노트·연필)을 먼저 받은 뒤 시작 버튼을 연다
const btnVR0 = document.getElementById('btn-vr');
const btnDesk0 = document.getElementById('btn-desktop');
btnDesk0.disabled = true;
btnVR0.disabled = true;
document.getElementById('status').textContent = '모델 불러오는 중…';
const loading = preload(['dummy', 'white_room', 'shrine', 'death_note', 'pencil']).then(() => {
  game.setBackground(settings.background);
  btnDesk0.disabled = false;
});

// 폰트(한글·일본어)를 미리 받아둔다
const JP_CHARS = '術式順転反蒼赫虚茈領域展開無量空処下限六眼黒閃解捌竈開伏魔御廚子世界を断つ龍鱗反発番いの流星あおかむらさきりょうくうしょげんりくがんこくせんカイハチカミノフーガふくまみづしゅんはつつがいせ「」■';
Promise.all([
  document.fonts?.load?.(`900 100px ${JFONT.split(',')[0]}`, JP_CHARS),
  document.fonts?.load?.(`700 40px ${JFONT.split(',')[0]}`, JP_CHARS),
  document.fonts?.load?.("900 60px 'Noto Sans KR'", '가나다라 술식시뮬레이터'),
])
  .catch(() => {})
  .finally(() => {
    if (ctx.ui.title.mesh.visible) ctx.ui.title.redraw();
  });

// ── 시작 화면 (HTML) ──
const overlay = document.getElementById('overlay');
const btnVR = document.getElementById('btn-vr');
const btnDesk = document.getElementById('btn-desktop');
const status = document.getElementById('status');
const crosshair = document.getElementById('crosshair');

async function checkXR() {
  if (!('xr' in navigator)) {
    await loading;
    status.textContent = '이 브라우저는 WebXR을 지원하지 않습니다. VR 기기 브라우저에서 HTTPS 주소로 열거나 데스크톱 모드로 체험하세요.';
    btnVR.disabled = true;
    return;
  }
  try {
    const ok = await navigator.xr.isSessionSupported('immersive-vr');
    window.__xrOK = ok;
    await loading;
    btnVR.disabled = !ok;
    if (!ok) {
      await loading;
      status.textContent = 'VR 기기가 감지되지 않았습니다. 데스크톱 모드로 체험할 수 있습니다.';
      btnVR.disabled = true;
    } else status.textContent = 'VR 준비 완료 — 핸드트래킹 권장 (컨트롤러를 내려놓으면 손 인식으로 전환)';
  } catch (e) {
    status.textContent = 'WebXR 확인 실패: ' + e.message;
    btnVR.disabled = true;
  }
}
checkXR();

function enterTitle() {
  ctx.input.update(0);
  if (ctx.character) ctx.ui.showOptions(false);
  else ctx.ui.showTitle(true);
}

btnVR.addEventListener('click', async () => {
  ctx.sfx.unlock();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    });
    await renderer.xr.setSession(session);
    try {
      renderer.xr.setFoveation(1);
    } catch (_) { /* 미지원 */ }
    overlay.classList.add('hidden');
    ctx.input.mode = 'xr';
    session.addEventListener('end', () => {
      overlay.classList.remove('hidden');
      ctx.input.mode = 'none';
    });
    setTimeout(enterTitle, 400);
  } catch (e) {
    status.textContent = 'VR 세션 시작 실패: ' + e.message;
  }
});

btnDesk.addEventListener('click', () => {
  ctx.sfx.unlock();
  overlay.classList.add('hidden');
  crosshair.classList.remove('hidden');
  ctx.input.mode = 'desktop';
  rig.rotation.set(0, 0, 0);
  enterTitle();
  renderer.domElement.requestPointerLock?.();
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
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const inp = ctx.input;
  inp.update(dt);

  if (inp.mode === 'none') {
    idleT += dt;
    rig.rotation.y = idleT * 0.05;
  }
  if (inp.actions.toggleMenu && ctx.character) ctx.ui.showOptions(!ctx.ui.options.mesh.visible);
  if (inp.actions.quickSpawn && ctx.character && !ctx.ui.menuOpen) ctx.world.spawnDummies(ctx.ui.spawn.type, ctx.ui.spawn.hp, 1);

  ctx.ui.handleInput(dt);
  // 흑섬 히트스톱: 아주 잠깐 세계가 멈춘다
  let simDt = dt;
  if (game.hitstop > 0) {
    game.hitstop -= dt;
    simDt = dt * 0.05;
  }
  if (inp.mode !== 'none' && ctx.character) {
    ctx.character.update(simDt);
    ctx.grab.update(simDt);
    ctx.melee.update(dt);
    ctx.world.update(simDt);
  }
  ctx.fx.brightBg = !!ctx.env.current?.bright && !ctx.env.hidden;
  ctx.fx.update(simDt, renderer.xr.isPresenting);
  ctx.ui.update(dt);
  _up.set(0, 1, 0).applyQuaternion(inp.headQuat);
  ctx.sfx.updateListener(inp.head, inp.headDir, _up);
  inp.endFrame();
  renderer.render(scene, camera);
});

window.__animevr = ctx;
