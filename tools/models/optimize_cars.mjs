// 차 팩 최적화: 바닥 원판 제거 · 텍스처 WebP(긴 변 1024) · 정점 양자화 + meshopt 압축
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, reorder, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
const [src, dst] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();
// 이미지 크기
for (const t of root.listTextures()) {
  const s = t.getSize();
  console.log('tex', t.getMimeType(), s?.join('x'), (t.getImage()?.byteLength / 1024).toFixed(0) + 'KB');
}
// 바닥 원판 (Cylinder001) 제거
for (const n of root.listNodes()) if (n.getName() === 'Cylinder001') n.dispose();
await doc.transform(
  prune(),
  dedup(),
  weld(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  reorder({ encoder: MeshoptEncoder }),
  quantize(),
  prune(),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(dst, doc);
console.log('written');
