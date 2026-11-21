import fs from 'fs';
const keys = JSON.parse(fs.readFileSync(new URL('ui_strings.json', import.meta.url), 'utf8')).map((x) => x.k);
fs.mkdirSync(new URL('../../src/i18n', import.meta.url).pathname, { recursive: true });
for (const L of ['en', 'ja']) {
  const map = {};
  let n = 0;
  for (const line of fs.readFileSync(new URL(L + '.tsv', import.meta.url), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const t = line.indexOf('\t');
    const i = +line.slice(0, t);
    const v = line.slice(t + 1).replace(/\\n/g, '\n');
    const k = keys[i];
    if (k === undefined) { console.log('bad idx', L, i); continue; }
    // 자리표시자 수 확인
    const ph = (s) => (s.match(/\{\d\}/g) ?? []).sort().join();
    if (ph(k) !== ph(v)) console.log('placeholder mismatch', L, i, JSON.stringify(k), JSON.stringify(v));
    if (k.split('\n').length !== v.split('\n').length) console.log('line mismatch', L, i);
    map[k] = v;
    n++;
  }
  const missing = keys.filter((k) => !(k in map));
  console.log(L, n, 'missing', missing.length, missing.slice(0, 5));
  fs.writeFileSync(new URL(`../../src/i18n/${L}.js`, import.meta.url).pathname, `// ${L} 번역 (한국어 원문 → 번역). 생성: i18n/build.mjs\nexport default ${JSON.stringify(map, null, 1)};\n`);
}
