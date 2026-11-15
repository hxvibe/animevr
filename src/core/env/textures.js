// 코드로 생성하는 텍스처 (외부 이미지 없음)
import * as THREE from 'three';

let _seed = 7;
export function rnd() {
  _seed = (_seed * 16807) % 2147483647;
  return (_seed - 1) / 2147483646;
}
export function reseed(s) {
  _seed = s;
}

function make(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function noise(g, w, h, amount, alpha = 0.06) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(rnd() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

/** 하얀 방 바닥: 흰 타일 + 연한 줄눈 */
export function whiteTiles() {
  return make(512, 512, (g, w, h) => {
    g.fillStyle = '#f4f5f7';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 3000, 0.025);
    g.strokeStyle = 'rgba(160,165,175,0.55)';
    g.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 256); g.lineTo(w, i * 256); g.stroke();
    }
  });
}

export function whiteWall() {
  return make(256, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#e9ebef');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(180,185,195,0.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
  });
}

export function asphalt(wet = false) {
  return make(512, 512, (g, w, h) => {
    g.fillStyle = wet ? '#25272c' : '#3b3d42';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 40 + Math.floor(rnd() * 50);
      g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // 균열
    g.strokeStyle = 'rgba(15,15,18,0.5)';
    g.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) {
      let x = rnd() * w;
      let y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 8; s++) {
        x += (rnd() - 0.5) * 40;
        y += (rnd() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

export function sidewalk() {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = '#a9a6a0';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 4000, 0.08);
    g.strokeStyle = 'rgba(70,70,70,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke();
    }
  });
}

export function brick(base = '#7b3b2c') {
  return make(512, 512, (g, w, h) => {
    g.fillStyle = '#4a4542';
    g.fillRect(0, 0, w, h);
    const bw = 64;
    const bh = 24;
    const c = new THREE.Color(base);
    for (let y = 0, row = 0; y < h; y += bh, row++) {
      for (let x = -((row % 2) * bw) / 2; x < w; x += bw) {
        const k = 0.75 + rnd() * 0.4;
        g.fillStyle = `rgb(${Math.floor(c.r * 255 * k)},${Math.floor(c.g * 255 * k)},${Math.floor(c.b * 255 * k)})`;
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      }
    }
    noise(g, w, h, 6000, 0.08);
    // 얼룩
    for (let i = 0; i < 8; i++) {
      const grd = g.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 80 + rnd() * 120);
      grd.addColorStop(0, 'rgba(0,0,0,0.25)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }
  });
}

export function concrete(color = '#8d8f93') {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 5000, 0.1);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = 'rgba(0,0,0,0.06)';
      g.fillRect(0, rnd() * h, w, 2 + rnd() * 6);
    }
  });
}

/** 건물 외벽: 층/창문 격자. floors×cols 한 장을 건물 면 전체에 맞춰 반복 */
export function facade({ wall = '#b8b0a4', glass = '#2b3644', lit = 0.18, style = 0 } = {}) {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 2500, 0.06);
    // 4층 x 4칸
    const fw = w / 4;
    const fh = h / 4;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = c * fw;
        const y = r * fh;
        if (style === 1) {
          // 커튼월 유리
          g.fillStyle = glass;
          g.fillRect(x + 2, y + 3, fw - 4, fh - 6);
        } else {
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(x + fw * 0.18, y + fh * 0.18, fw * 0.64, fh * 0.6);
          g.fillStyle = glass;
          g.fillRect(x + fw * 0.2, y + fh * 0.2, fw * 0.6, fh * 0.56);
        }
        if (rnd() < lit) {
          g.fillStyle = 'rgba(255,214,150,0.65)';
          g.fillRect(x + fw * 0.22, y + fh * 0.22, fw * 0.56, fh * 0.52);
        } else {
          g.fillStyle = 'rgba(160,190,220,0.18)';
          g.fillRect(x + fw * 0.22, y + fh * 0.22, fw * 0.25, fh * 0.52);
        }
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(x, y + fh - 3, fw, 3);
      }
    }
  });
}

/** 한글 간판 */
export function sign(text, bg = '#1a1a1a', fg = '#ff5a8a') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 160);
  g.font = "900 100px 'Noto Sans KR', sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = fg;
  g.shadowBlur = 30;
  g.fillStyle = fg;
  g.fillText(text, 256, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
