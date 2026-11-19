// 캐릭터 레지스트리. 새 캐릭터는 여기에 추가한다.
// 각 캐릭터 클래스는 다음 인터페이스를 구현한다:
//   constructor(ctx) / update(dt) / dispose()
//   name / helpLines(mode) / hudRows()
import { Gojo } from './gojo/gojo.js';
import { Sukuna } from './sukuna/sukuna.js';
import { Itadori } from './itadori/itadori.js';
import { Megumi } from './megumi/megumi.js';
import { Geto } from './geto/geto.js';
import { Mahito } from './mahito/mahito.js';
import { Jogo } from './jogo/jogo.js';
import { Yuta } from './yuta/yuta.js';

export const CHARACTERS = [
  {
    id: 'gojo',
    name: '고죠 사토루',
    work: '주술회전',
    technique: '무하한 주술 · 육안',
    kanji: '蒼 · 赫 · 茈 · 無量空処',
    color: '#5ab4ff',
    create: (ctx) => new Gojo(ctx),
  },
  {
    id: 'sukuna',
    name: '료멘 스쿠나',
    work: '주술회전',
    technique: '어주자(御廚子)',
    kanji: '解 · 捌 · 開 · 伏魔御廚子',
    color: '#ff3a3a',
    create: (ctx) => new Sukuna(ctx),
  },
  {
    id: 'itadori',
    name: '이타도리 유지',
    work: '주술회전',
    technique: '체술 · 흑섬 · 적혈조술',
    kanji: '逕庭拳 · 黒閃 · 穿血 · 解',
    color: '#ff5a6e',
    create: (ctx) => new Itadori(ctx),
  },
  {
    id: 'megumi',
    name: '후시구로 메구미',
    work: '주술회전',
    technique: '십종영법술',
    kanji: '玉犬 · 鵺 · 魔虚羅 · 嵌合暗翳庭',
    color: '#7f93ff',
    create: (ctx) => new Megumi(ctx),
  },
  {
    id: 'geto',
    name: '게토 스구루',
    work: '주술회전',
    technique: '주령조술',
    kanji: '呪霊操術 · 虹龍 · うずまき',
    color: '#a07ad8',
    create: (ctx) => new Geto(ctx),
  },
  {
    id: 'yuta',
    name: '옷코츠 유타',
    work: '주술회전',
    technique: '리카 · 모방 · 반전술식',
    kanji: '里香 · 純愛砲 · 動くな · 真贋相愛',
    color: '#c8a0ff',
    create: (ctx) => new Yuta(ctx),
  },
  {
    id: 'mahito',
    name: '마히토',
    work: '주술회전',
    technique: '무위전변',
    kanji: '無為転変 · 撥体 · 自閉円頓裹',
    color: '#7ad8ff',
    create: (ctx) => new Mahito(ctx),
  },
  {
    id: 'jogo',
    name: '죠고',
    work: '주술회전',
    technique: '화산 · 화력 조작',
    kanji: '火礫蟲 · 煉獄 · 隕 · 蓋棺鉄囲山',
    color: '#ff7a2a',
    create: (ctx) => new Jogo(ctx),
  },
];
