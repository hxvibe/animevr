import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import fs from 'fs';
import path from 'path';
const root = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const files = [];
const rec = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) rec(p); else if (p.endsWith('.js')) files.push(p); } };
rec(root + '/src');
const H = /[가-힣]/;
const out = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }); } catch (e) { console.error('parse', f, e.message); continue; }
  walk.full(ast, (n) => {
    if (n.type === 'Literal' && typeof n.value === 'string' && H.test(n.value)) out.set(n.value, (out.get(n.value) ?? []).concat(path.relative(root, f)));
    if (n.type === 'TemplateLiteral') {
      const q = n.quasis.map((x) => x.value.cooked);
      if (!q.some((x) => H.test(x))) return;
      // GLSL 등 제외
      let s = q[0];
      for (let i = 1; i < q.length; i++) s += `{${i - 1}}` + q[i];
      out.set(s, (out.get(s) ?? []).concat(path.relative(root, f)));
    }
  });
}
const html = fs.readFileSync(root + '/index.html', 'utf8');
for (const m of html.matchAll(/>([^<>]*[가-힣][^<>]*)</g)) out.set(m[1].trim(), ['index.html']);
for (const m of html.matchAll(/(?:title|placeholder|aria-label)="([^"]*[가-힣][^"]*)"/g)) out.set(m[1], ['index.html']);
const arr = [...out.entries()].map(([k, v]) => ({ k, f: [...new Set(v)] }));
fs.writeFileSync('strings.json', JSON.stringify(arr, null, 1));
console.log(arr.length, arr.reduce((a, b) => a + b.k.length, 0));
