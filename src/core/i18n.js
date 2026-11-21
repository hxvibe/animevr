// 언어 설정: 한국어로 나오는 글만 바꾼다 (기술을 쓸 때 나오는 일본어 연출 글자는 그대로).
//  - 원문(한국어) → 번역 사전 (src/i18n/*.js). 사전에 없으면 원문 그대로.
//  - 캔버스 글자(VR 패널 · HUD · 안내)와 HTML 글자를 한 곳에서 바꾼다: 한글이 든 문자열만 건드린다.
import EN from '../i18n/en.js';
import JA from '../i18n/ja.js';

export const LANGS = [
  ['ko', '한국어'],
  ['en', 'English'],
  ['ja', '日本語'],
];
const DICTS = { en: EN, ja: JA };
const HANGUL = /[가-힣]/;
const KEY = 'animevr.lang';

function detect() {
  try {
    const s = localStorage.getItem(KEY);
    if (s && (s === 'ko' || DICTS[s])) return s;
  } catch {
    /* 저장소를 못 쓰면 기기 언어 */
  }
  const n = (navigator.language || 'ko').toLowerCase();
  if (n.startsWith('ko')) return 'ko';
  if (n.startsWith('ja')) return 'ja';
  return 'en';
}

let lang = detect();
let dict = null;
let patterns = [];
const cache = new Map();
const listeners = new Set();
export const misses = new Set();

/** 사전 준비: 여러 줄 문장은 줄마다도 넣고, {0} 자리가 있는 문장은 정규식으로 */
function prepare() {
  cache.clear();
  patterns = [];
  dict = null;
  const D = DICTS[lang];
  if (!D) return;
  dict = new Map();
  for (const [k, v] of Object.entries(D)) {
    dict.set(k, v);
    const kl = k.split('\n');
    const vl = v.split('\n');
    if (kl.length > 1 && kl.length === vl.length) kl.forEach((x, i) => !dict.has(x) && dict.set(x, vl[i]));
    // 앞뒤 공백 · 앞의 " · " 를 뗀 꼴로도 (이어 붙인 글을 나눴을 때)
    const strip = (x) => x.replace(/^\s*·\s*/, '').trim();
    if (strip(k) !== k && !dict.has(strip(k))) dict.set(strip(k), strip(v));
  }
  dict.set('한국어', '한국어');
  dict.set('언어 · Language', lang === 'ja' ? '言語 · Language' : 'Language');
  for (const [k, v] of dict) {
    if (!/\{\d\}/.test(k)) continue;
    const parts = k.split(/(\{\d\})/);
    const order = [];
    const src = parts.map((p) => {
      const m = p.match(/^\{(\d)\}$/);
      if (m) {
        order.push(+m[1]);
        return '([\\s\\S]*?)';
      }
      return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    // 고정 글자가 너무 적은 틀(예: "{0}{1}")은 아무 문장에나 걸리므로 뺀다
    const fixed = k.replace(/\{\d\}/g, '');
    if (!HANGUL.test(fixed)) continue;
    patterns.push({ re: new RegExp('^' + src + '$'), order, v, w: fixed.length });
  }
  patterns.sort((a, b) => b.w - a.w);
}
prepare();

// 사전에 없는 긴 문장은 구분자로 나눠 조각마다 바꿔 본다 (실행 중에 이어 붙인 글: "손목 HUD  ON" 등)
//  먼저 큰 구분자(줄 · 두 칸 띄움 · 가운뎃점 …)로, 그래도 없으면 괄호 · 따옴표로 더 잘게
const LEVELS = [/(\n)/, /(\s{2,})/, /( · )/, /( — | – )/, /( → | ↔ | \/ )/, /(: )/, /(「|」|\(|\)|（|）)/];
function piece(p, level) {
  if (!HANGUL.test(p)) return p;
  const r = lookup(p);
  if (r !== undefined) return r;
  for (let L = level; L < LEVELS.length; L++) {
    const parts = p.split(LEVELS[L]);
    if (parts.length > 1) return parts.map((x) => piece(x, L + 1)).join('');
  }
  return p;
}

function lookup(s) {
  const d = dict.get(s);
  if (d !== undefined) return d;
  const t = s.trim();
  if (t !== s) {
    const d2 = dict.get(t);
    if (d2 !== undefined) return s.replace(t, d2);
  }
  for (const P of patterns) {
    const m = P.re.exec(s);
    if (!m) continue;
    const g = P.order.map((_, i) => m[i + 1]);
    return P.v.replace(/\{(\d)\}/g, (_, n) => {
      const idx = P.order.indexOf(+n);
      return idx < 0 ? '' : tr(g[idx]);
    });
  }
  return undefined;
}

/** 번역: 한글이 없거나 한국어 설정이면 그대로 */
export function tr(s) {
  if (!dict || typeof s !== 'string' || !HANGUL.test(s)) return s;
  const c = cache.get(s);
  if (c !== undefined) return c;
  let out = lookup(s);
  if (out === undefined) out = piece(s, 0);
  if (HANGUL.test(out)) misses.add(s); // 아직 번역이 없는 글 (개발용: tools/i18n 에 추가)
  if (cache.size > 5000) cache.clear();
  cache.set(s, out);
  return out;
}

export function getLang() {
  return lang;
}

export function setLang(l) {
  if (l !== 'ko' && !DICTS[l]) return;
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* 무시 */
  }
  prepare();
  document.documentElement.lang = l;
  retranslateDom();
  for (const f of listeners) f(l);
}

export function onLangChange(f) {
  listeners.add(f);
}

// ── 캔버스: 그리기 · 재기 모두 번역한 글자로 (자리 계산이 어긋나지 않게) ──
const C2D = CanvasRenderingContext2D.prototype;
for (const fn of ['fillText', 'strokeText', 'measureText']) {
  const orig = C2D[fn];
  C2D[fn] = function (text, ...rest) {
    return orig.call(this, typeof text === 'string' ? tr(text) : text, ...rest);
  };
}
if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') {
  const O2D = OffscreenCanvasRenderingContext2D.prototype;
  for (const fn of ['fillText', 'strokeText', 'measureText']) {
    const orig = O2D[fn];
    O2D[fn] = function (text, ...rest) {
      return orig.call(this, typeof text === 'string' ? tr(text) : text, ...rest);
    };
  }
}

// ── HTML: 글자 마디와 title/placeholder 를 원문을 기억해 두고 바꾼다 ──
const orig = new WeakMap();
const ATTRS = ['title', 'placeholder', 'aria-label'];
function doNode(n) {
  if (n.nodeType === 3) {
    let o = orig.get(n);
    if (o === undefined) {
      if (!HANGUL.test(n.nodeValue)) return;
      o = n.nodeValue;
      orig.set(n, o);
    } else if (n.nodeValue !== n.__trOut) {
      // 코드가 글자를 새로 넣었다 → 그게 새 원문
      o = n.nodeValue;
      orig.set(n, o);
    }
    const t = tr(o);
    n.__trOut = t;
    if (n.nodeValue !== t) n.nodeValue = t;
    return;
  }
  if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
  for (const a of ATTRS) {
    const v = n.getAttribute?.(a);
    if (!v) continue;
    const key = '__tr_' + a;
    if (n[key] === undefined || v !== n[key + 'Out']) n[key] = v;
    if (!HANGUL.test(n[key])) continue;
    const t = tr(n[key]);
    n[key + 'Out'] = t;
    if (v !== t) n.setAttribute(a, t);
  }
  for (const c of n.childNodes) doNode(c);
}
let _busy = false;
function retranslateDom() {
  if (!document.body) return;
  _busy = true;
  doNode(document.body);
  if (!document.__trTitle) document.__trTitle = document.title;
  document.title = tr(document.__trTitle);
  _busy = false;
}
function startDom() {
  retranslateDom();
  new MutationObserver((ms) => {
    if (_busy) return;
    _busy = true;
    for (const m of ms) {
      if (m.type === 'characterData') doNode(m.target);
      else if (m.type === 'attributes') doNode(m.target);
      else for (const n of m.addedNodes) doNode(n);
    }
    _busy = false;
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startDom);
else startDom();
document.documentElement.lang = lang;
