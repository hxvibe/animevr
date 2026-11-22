// 1단계: STL을 옮긴 고밀도 메시 → 정점 합치기 · 한 메시로 · 줄이기 → 위치/인덱스 덤프
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, join, flatten, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'fs';
const [src, out, ratio] = process.argv.slice(2);
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: 0.0008, lockBorder: false }), prune());
const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
console.log('prims', prims.length);
// 월드 변환 적용해서 덤프
const node = doc.getRoot().listNodes().find((n) => n.getMesh());
const M = node.getWorldMatrix();
let P = [], I = [], off = 0;
for (const n of doc.getRoot().listNodes()) {
  if (!n.getMesh()) continue;
  const W = n.getWorldMatrix();
  for (const p of n.getMesh().listPrimitives()) {
    const pos = p.getAttribute('POSITION');
    for (let i = 0; i < pos.getCount(); i++) {
      const v = pos.getElement(i, []);
      P.push(W[0]*v[0]+W[4]*v[1]+W[8]*v[2]+W[12], W[1]*v[0]+W[5]*v[1]+W[9]*v[2]+W[13], W[2]*v[0]+W[6]*v[1]+W[10]*v[2]+W[14]);
    }
    const idx = p.getIndices().getArray();
    for (const k of idx) I.push(k + off);
    off += pos.getCount();
  }
}
console.log('verts', P.length / 3, 'tris', I.length / 3);
fs.writeFileSync(out + '.pos.bin', Buffer.from(new Float32Array(P).buffer));
fs.writeFileSync(out + '.idx.bin', Buffer.from(new Uint32Array(I).buffer));
