// 캐릭터 레지스트리. 새 캐릭터는 여기에 추가한다.
// 각 캐릭터 클래스는 다음 인터페이스를 구현한다:
//   constructor(ctx) / update(dt) / dispose()
//   name / helpLines(mode) / hudRows()
import { Gojo } from './gojo/gojo.js';
import { Sukuna } from './sukuna/sukuna.js';
import { Itadori } from './itadori/itadori.js';
import { Megumi } from './megumi/megumi.js';

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
];
