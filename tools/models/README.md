# 모델 가공 스크립트

`@gltf-transform/{core,functions,extensions}@4` · `meshoptimizer` · `sharp` (Node), `numpy` · `Pillow` (Python) 필요.

- `optimize_cars.mjs 원본.glb assets/models/prop_cars.glb` — 차 팩: 바닥 원판 제거 · 텍스처 WebP 1024 · 양자화 + meshopt 압축
- 메구미의 주구 (STL을 옮긴 고밀도 메시, UV·텍스처 없음):
  1. `node simplify.mjs 원본.glb work/v1 0.011` — 정점 합치기 · 한 메시로 · 약 1.6만 삼각형으로 줄여 위치/인덱스 덤프
  2. `python3 bake.py v1 v2` (work 폴더에서) — 길이 축 정렬(손잡이 끝→칼끝 = +Y, 날 = +X, 원점 = 쥐는 곳) · 부위 나누기 ·
     면 방향으로 날 면/넓은 면 구분 · UV · 각진 법선 · 텍스처(색 · 거칠기/금속 · 노멀) 그리기
  3. `node buildsword.mjs work v1 assets/models/wpn_megumi_blade.glb megumi_blade` (v2 → `wpn_megumi_sword.glb`)
