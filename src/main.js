import * as THREE from 'three';
import { LANGS, getLang, setLang, onLangChange } from './core/i18n.js'; // 먼저: 캔버스 글자 번역을 걸어 둔다
import { Input } from './core/input.js';
import { Environment } from './core/env/environment.js';
import { World } from './core/world.js';
import { Fx } from './core/fx.js';
import { Sfx } from './core/audio.js';
import { UI, JFONT } from './core/ui.js';
import { Melee } from './core/melee.js';
import { Grab } from './core/grab.js';
import { preload, loadModel } from './core/assets.js';
import { loadHandModels } from './core/handDemo.js';
import { makeShiki, SHIKI_MODELS } from './characters/megumi/models.js';
import { preloadChars, RiggedBody } from './core/rigged.js';
import { DUMMY_TYPES } from './core/dummy.js';
import { CHARACTERS } from './characters/index.js';
import { resetCooldowns } from './core/cooldown.js';

const ENEMY_MODELS = [...new Set(Object.values(DUMMY_TYPES).map((d) => d.model).filter(Boolean))];

// ── 설정 (브라우저에 저장) ──
const DEFAULTS = {
  character: 'gojo', background: 'white', hud: false, skillNames: true, damageNumbers: true,
  invincible: false, dummyAI: true, locomotion: true, kaminoRule: false, heightOffset: 0, waist: 1, blackFlashChance: 0.2,
  domainGesture: true, shadows: true, mahoragaTamed: false, dogTotality: false,
  ctrlHands: true, cooldowns: true, mahoragaRitual: true,
};
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem('animevr.settings') || '{}');
} catch (_) { /* 저장소 사용 불가 */ }
const settings = { ...DEFAULTS, ...saved };
if (settings.background === 'passthrough') settings.background = DEFAULTS.background ?? 'white'; // 패스스루는 MR 세션에서만
// 지운 캐릭터(나루토·오공)를 고른 채 저장돼 있으면 처음 캐릭터로
if (!CHARACTERS.some((c) => c.id === settings.character)) settings.character = DEFAULTS.character;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' }); // stencil: 잘린 조각의 평평한 단면
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.localClippingEnabled = true; // 절단 조각
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 900); // near 를 너무 작게 두면 먼 바닥의 깊이 정밀도가 떨어진다
camera.position.set(0, 1.6, 0);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

const ctx = { renderer, scene, camera, rig, settings, beforeRender: [] }; // beforeRender: 본 렌더 직전에 불리는 함수들 (화면 효과용 사전 렌더)
ctx.sfx = new Sfx();
ctx.sfx.preloadSfx();
ctx.sfx.preloadClips({
  sukunaFuga: 'assets/audio/sukuna_fuga_voice.mp3',
  gojoDomain: 'assets/audio/gojo_domain_voice.mp3',
  sukunaDomain: 'assets/audio/sukuna_domain_voice.mp3',
  shrineMusic: 'assets/audio/sukuna_domain_music.mp3',
  mahoragaWheel: 'assets/audio/mahoraga_wheel.mp3',
  megumiDomain: 'assets/audio/megumi_domain_voice.mp3',
  mahoragaSummon: 'assets/audio/mahoraga_summon_voice.mp3',
});
ctx.fx = new Fx(scene, renderer);
ctx.input = new Input(renderer, rig, camera, renderer.domElement);
ctx.input.locomotion = settings.locomotion;
ctx.input.ctx = ctx;
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
    ctx.world.clash.reset();
    ctx.grab.releaseAll();
    ctx.character?.cancelDomain?.();
    return ctx.env.setBackground(id);
  },
  start(charId, bgId) {
    resetCooldowns();
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
    if (ctx.character && !ctx.character.id) ctx.character.id = def.id; // 캐릭터마다 id 가 있게 (잡기 권한 등)
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

// 모델(더미·하얀 방·사당)을 먼저 받은 뒤 시작 버튼을 연다
const btnVR0 = document.getElementById('btn-vr');
// 첫 화면의 언어 버튼 (VR 안의 메뉴에도 있다)
{
  const box = document.getElementById('langs');
  const draw = () => {
    box.innerHTML = '';
    for (const [id, label] of LANGS) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = getLang() === id ? 'on' : '';
      b.onclick = () => setLang(id);
      box.appendChild(b);
    }
  };
  draw();
  onLangChange(draw);
}
const btnDesk0 = document.getElementById('btn-desktop');
btnDesk0.disabled = true;
btnVR0.disabled = true;
document.getElementById('status').textContent = '모델 불러오는 중…';
// 쓰는 3D 모델 전부 (시작하기 전에 다 받는다 — 받기 전에 시작하면 적·무기가 임시 모양으로 나왔다)
const ALL_MODELS = [
  'dummy', 'shrine', 'item_sukuna_finger', 'item_megaphone',
  'chr_geto', 'chr_gojo', 'chr_nobara', 'chr_toji', 'chr_yuta', 'npc_cathy', 'npc_tsukamoto', 'npc_yaga', 'enemy_bagmask',
  'curse_bignose', 'curse_centipede', 'curse_cyclops', 'curse_finger_bearer', 'curse_inventory', 'curse_jogo', 'curse_kuchisake', 'curse_mahito',
  'curse_rainbow_dragon', 'curse_rika', 'curse_tamamo', 'curse_transfigured', 'curse_worm',
  'shiki_dog_black', 'shiki_dog_totality', 'shiki_dog_white', 'shiki_elephant', 'shiki_mahoraga', 'shiki_nue', 'shiki_ox', 'shiki_rabbit', 'shiki_serpent', 'shiki_toad',
  'wpn_chain', 'wpn_hammer', 'wpn_mallet', 'wpn_nail', 'wpn_spear', 'wpn_splitsoul', 'wpn_strawdoll', 'wpn_yuta_sheath', 'wpn_yuta_sword',
];

/** 셰이더를 미리 컴파일한다 (처음 부를 때 퀘스트가 잠깐 멈추지 않게): 적 · 식신 몸을 화면 밖에 한 번씩 만들어 본다 */
async function warmEnemies() {
  const g = new THREE.Group();
  g.position.set(0, -200, 0);
  for (const def of Object.values(DUMMY_TYPES)) {
    if (!def.model) continue;
    try {
      const b = new RiggedBody(def.model, { height: 1.8, outline: 0.01 });
      if (b.ok) g.add(b.model);
    } catch (_) { /* 무시 */ }
  }
  for (const key of Object.keys(SHIKI_MODELS)) {
    try {
      const S = makeShiki(key, 1.5);
      if (S) g.add(S.root);
    } catch (_) { /* 무시 */ }
  }
  scene.add(g);
  try {
    if (renderer.compileAsync) await renderer.compileAsync(g, camera, scene);
    else renderer.compile(g, camera, scene);
  } catch (e) {
    console.warn('셰이더 예열', e);
  }
  scene.remove(g);
}

// 모든 모델 → 손 모델 → 배경 → 셰이더 예열이 끝나야 시작 버튼이 열린다
let _got = 0;
const _st = document.getElementById('status');
const loading = Promise.all([
  ...ALL_MODELS.map((n) =>
    loadModel(n).then((m) => {
      _got++;
      _st.textContent = `3D 모델 불러오는 중… ${_got} / ${ALL_MODELS.length}`;
      return m;
    }),
  ),
  loadHandModels().catch(() => null),
])
  .then(async () => {
    _st.textContent = '배경 · 셰이더 준비 중…';
    game.setBackground(settings.background);
    await new Promise((r) => setTimeout(r, 30));
    await warmEnemies();
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera).catch(() => {});
    _st.textContent = '준비 완료';
    btnDesk0.disabled = false;
  })
  .catch((e) => {
    console.warn('불러오기', e);
    _st.textContent = '일부 모델을 불러오지 못했습니다 — 그래도 시작할 수 있습니다';
    btnDesk0.disabled = false;
  });
void preload;
void preloadChars;
void ENEMY_MODELS;

// 폰트(한글·일본어)를 미리 받아둔다
const JP_CHARS = '術式順転反蒼赫虚茈領域展開無量空処下限六眼黒閃解捌竈開伏魔御廚子世界を断つ龍鱗反発番いの流星あおかむらさきりょうくうしょげんりくがんこくせんカイハチカミノフーガふくまみづしゅんはつつがいせ「」■螺旋丸手裏剣風遁影分身の術多重九喇嘛モードらせんがんしゅりけんふうとんかげぶんしんじゅつたじゅうクラマかめはめ波元気玉瞬間移動超サイヤ人げんきだまどうスーパー呪霊操術虹龍化身玉藻前極ノ番うずまき私キレイ無為転変火山呪力撥体自閉円頓裹じへいえんどんか遍殺即霊体蓋棺鉄囲山がいかんてっちせん隕いん煉獄れんごく火山頭かざんとう火礫蟲完全顕現里香りか純愛砲じゅんあいほう動くなうごく真贋相愛しんがんそうあい嵌合暗翳庭芻霊呪法すうれいじゅほう簪かんざし共鳴ともなり法陣ほうじん領域展開の押合中和必中消滅りょういきてんかい';
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
    const okAR = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
    const mr = document.getElementById('btn-mr');
    if (mr) {
      mr.disabled = !okAR;
      mr.style.display = okAR ? '' : 'none';
    }
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

async function startXR(ar) {
  ctx.sfx.unlock();
  try {
    const session = await navigator.xr.requestSession(ar ? 'immersive-ar' : 'immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    });
    await renderer.xr.setSession(session);
    try {
      renderer.xr.setFoveation(1);
    } catch (_) { /* 미지원 */ }
    overlay.classList.add('hidden');
    ctx.input.mode = 'xr';
    ctx.xrAR = !!ar;
    // MR: 배경을 현실(패스스루)로 · 끝나면 원래 배경으로
    const prevBg = settings.background;
    if (ar) game.setBackground('passthrough');
    session.addEventListener('end', () => {
      overlay.classList.remove('hidden');
      ctx.input.mode = 'none';
      ctx.xrAR = false;
      if (ar || settings.background === 'passthrough') game.setBackground(prevBg !== 'passthrough' ? prevBg : 'white');
    });
    // 메타 퀘스트 기본 메뉴(왼손 ≡ 집기 / 메뉴 버튼)를 누르면 시스템 메뉴가 뜨며 세션이 잠시 가려진다
    // → 돌아오면 게임 옵션을 연다 (손동작으로 방금 직접 연/닫은 경우는 제외)
    let wasBlurred = false;
    session.addEventListener('visibilitychange', () => {
      const v = session.visibilityState;
      if (v !== 'visible') {
        wasBlurred = true;
        return;
      }
      if (!wasBlurred) return;
      wasBlurred = false;
      if (performance.now() - (ctx.ui.lastMenuToggle ?? -1e9) < 3000) return;
      if (ctx.ui.mode === 'game' && ctx.character) ctx.ui.showOptions(true);
    });
    setTimeout(enterTitle, 400);
  } catch (e) {
    status.textContent = (ar ? 'MR' : 'VR') + ' 세션 시작 실패: ' + e.message;
  }
}
btnVR.addEventListener('click', () => startXR(false));
const btnMR = document.getElementById('btn-mr');
btnMR?.addEventListener('click', () => startXR(true));


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
// 한 프레임에서 예외가 나면 three.js가 다음 프레임을 요청하지 못해 게임이 통째로 멈춘다
// → 부분마다 따로 감싸서, 오류가 나도 그 부분만 건너뛰고 화면은 계속 그린다
const errors = (window.__errors = []);
const _errSeen = new Map();
function guard(tag, fn) {
  try {
    fn();
  } catch (e) {
    const key = tag + ':' + (e?.message ?? e);
    const n = (_errSeen.get(key) ?? 0) + 1;
    _errSeen.set(key, n);
    if (n === 1 || n % 300 === 0) {
      console.error('[frame]', tag, e?.stack ?? e);
      errors.push({ tag, msg: String(e?.message ?? e), stack: String(e?.stack ?? '').slice(0, 800), n });
      if (errors.length > 50) errors.shift();
    }
  }
}
renderer.setAnimationLoop(() => {
  try {
    frame();
  } catch (e) {
    console.error('[frame] fatal', e?.stack ?? e);
  }
});
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const inp = ctx.input;
  guard('input', () => inp.update(dt));
  guard('collide', () => ctx.world.collidePlayer());

  if (inp.mode === 'none') {
    idleT += dt;
    rig.rotation.y = idleT * 0.05;
  }
  guard('menu', () => {
    if (inp.actions.toggleMenu && ctx.character) ctx.ui.showOptions(!ctx.ui.options.mesh.visible);
  });
  guard('uiInput', () => ctx.ui.handleInput(dt));
  // 흑섬 히트스톱: 아주 잠깐 세계가 멈춘다
  let simDt = dt;
  if (game.hitstop > 0) {
    game.hitstop -= dt;
    simDt = dt * 0.05;
  }
  if (inp.mode !== 'none' && ctx.character) {
    // 무량공처의 필중: 몸이 굳어 술식도 주먹도 못 쓴다 (손은 보이지만 캐릭터에겐 없는 것처럼)
    const para = ctx.world.player.paralyzed && !ctx.ui.menuOpen;
    if (para) inp.mute(true);
    guard('character', () => ctx.character.update(simDt));
    guard('grab', () => ctx.grab.update(simDt));
    guard('melee', () => ctx.melee.update(dt));
    if (para) inp.mute(false);
    guard('world', () => ctx.world.update(simDt));
  }
  guard('env', () => ctx.env.update(simDt));
  ctx.fx.brightBg = !!ctx.env.current?.bright && !ctx.env.hidden;
  guard('fx', () => ctx.fx.update(simDt, renderer.xr.isPresenting));
  guard('ui', () => ctx.ui.update(dt));
  guard('listener', () => {
    _up.set(0, 1, 0).applyQuaternion(inp.headQuat);
    ctx.sfx.updateListener(inp.head, inp.headDir, _up);
  });
  guard('endFrame', () => inp.endFrame());
  for (const f of ctx.beforeRender) guard('beforeRender', f);
  renderer.render(scene, camera);
}

window.__animevr = ctx;
