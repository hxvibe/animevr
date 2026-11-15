# ANIME VR — 술식 시뮬레이터

애니메이션 캐릭터의 기술을 직접 손으로 써보는 WebXR VR 게임입니다.
설치 없이 VR 기기(Meta Quest 등)의 브라우저에서 바로 실행되며, **컨트롤러와 핸드트래킹을 모두 지원**합니다.
컨트롤러를 내려놓으면 자동으로 손 인식으로 전환됩니다.

> 비공식 팬메이드 프로젝트입니다. 원작의 이미지·음원은 사용하지 않으며, 모든 그래픽과 효과음은 코드로 직접 생성합니다.

## 현재 캐릭터

### 고죠 사토루 (주술회전) — 무하한 주술 · 육안

| 기술 | 효과 |
|---|---|
| **무하한** | 몸 주위의 "무한"이 날아오는 투사체와 물체를 감속시켜 절대 닿지 못하게 함 (제논의 역설) |
| **술식순전 「창」** | 수렴하는 무한. 주변의 잔해와 적을 끌어당겨 압축·분쇄하는 인력 구체 |
| **술식반전 「혁」** | 발산하는 무한. 충전 후 발사하는 척력탄, 착탄 시 모든 것을 날려버림 |
| **허식 「자」** | 창과 혁을 충돌시켜 만든 가상의 질량. 경로상의 모든 것을 소멸시키고 바닥을 도려냄 |
| **영역전개 「무량공처」** | 공허의 우주 공간을 전개. 영역 안의 적은 무한한 정보에 압도되어 움직이지 못함 |
| **육안** | 주력 소모 70% 감소, 적의 윤곽·체력·투사체 궤적을 시각화 |
| **반전술식** | 피격 2초 후부터 체력 자동 회복 |

## 조작법

### 핸드트래킹

| 기술 | 손동작 |
|---|---|
| 창 | 검지+중지를 펴서 가리키고 유지 (팔을 뻗을수록 멀리 생성) |
| 혁 | 검지만 펴서 충전 → 앞으로 찌르거나 손을 펴면 발사 |
| 허식 「자」 | 한 손은 창, 다른 손은 혁 상태로 두 손끝을 맞대기 → 양손을 앞으로 밀거나 손을 펴서 발사 |
| 무량공처 | 검지·중지를 꼬아(교차) 1초 유지 — 또는 두 손가락을 세워 얼굴 앞에 1초 |
| 무하한 ON/OFF | 양 손바닥을 앞으로 내밀고 1초 |
| 육안 ON/OFF | 펼친 손으로 눈을 가렸다가 떼기 (안대 벗기) |
| 메뉴 | 왼손바닥을 하늘로 펴기, 버튼은 손가락으로 터치 |

### 컨트롤러

| 입력 | 동작 |
|---|---|
| 왼쪽 트리거 (유지) | 창 |
| 오른쪽 트리거 (충전 → 놓기 / 찌르기) | 혁 |
| 창 + 혁 유지 상태로 두 컨트롤러 맞대기 → 밀기 / 트리거 놓기 | 허식 「자」 |
| 양쪽 그립 1초 | 영역전개 「무량공처」 |
| X / A / B / Y | 무하한 / 육안 / 아레나 리셋 / 메뉴 |
| 왼스틱 / 오른스틱 | 이동 / 30° 스냅 회전 |

### 데스크톱 (VR 없이 테스트)

마우스 우클릭 유지 = 창(휠로 거리), 좌클릭 충전 후 놓기 = 혁, 둘 다 누른 채 `E` 후 놓기 = 허식 「자」,
`Q` 1초 = 무량공처, `I` 무하한, `O` 육안, `R` 리셋, `H` 메뉴, `WASD` 이동.

## 실행 방법

WebXR은 **HTTPS**에서만 동작합니다.

### GitHub Pages (권장)
1. 저장소 **Settings → Pages**에서 Source를 `Deploy from a branch`, 브랜치 `main` / `/(root)`로 설정
2. 잠시 후 `https://<사용자명>.github.io/animevr/` 주소를 VR 기기 브라우저에서 열기
3. **VR 시작** 버튼 → 컨트롤러 또는 손으로 플레이

### 로컬
```bash
npx serve .            # 또는 python3 -m http.server 8080
```
PC 브라우저의 데스크톱 모드로 바로 확인할 수 있습니다.
Quest에서 로컬 서버에 접속하려면 USB 연결 후 `adb reverse tcp:8080 tcp:8080`을 실행하고 Quest 브라우저에서 `http://localhost:8080`을 엽니다.
(Meta의 [Immersive Web Emulator](https://github.com/meta-quest/immersive-web-emulator) 확장으로 PC에서 VR 입력을 흉내낼 수도 있습니다.)

## 구조

```
index.html                    시작 화면, three.js import map (CDN)
src/main.js                   렌더러 · XR 세션 · 메인 루프
src/core/input.js             컨트롤러/핸드트래킹/데스크톱 입력 → 통합 HandState(의도)
src/core/gestures.js          손 관절 25개로 손 모양 판별 (open / fist / point / two / crossed)
src/core/world.js             구체 물리, 잔해, 저주령(적) AI, 적 투사체, 플레이어 상태
src/core/environment.js       수련장 + 영역전개용 공허 공간 셰이더와 전환 연출
src/core/fx.js                GPU 파티클, 충격파, 섬광 조명 풀
src/core/audio.js             WebAudio 합성 효과음 (HRTF 3D)
src/core/ui.js                손목 HUD, 터치/레이 패널, 기술명 표시
src/characters/index.js       캐릭터 레지스트리
src/characters/gojo/gojo.js   고죠 사토루 기술 구현
src/characters/gojo/orb.js    창/혁/자 구체 비주얼
```

## 캐릭터 추가하기

1. `src/characters/<id>/` 폴더에 캐릭터 클래스를 만듭니다.
2. 아래 인터페이스를 구현합니다.
   - `constructor(ctx)` — `ctx`에 `scene, input, world, fx, sfx, ui, env`가 들어 있습니다.
   - `update(dt)` — 매 프레임 `ctx.input.left/right`의 의도(`blue`, `red`, `domainSign`, `open`, `thrust`, `pos`, `dir` …)를 읽어 기술을 처리
   - `name`, `subtitle`, `helpLines(mode)`, `panelButtons()`, `onPanelButton(id)`, `hudRows()`, `dispose()`
3. `src/characters/index.js`의 `CHARACTERS` 배열에 등록합니다.

입력 의도 이름(`blue`/`red`)은 "주 기술 / 보조 기술" 슬롯으로 생각하면 됩니다. 캐릭터마다 다른 손동작이 필요하면 `gestures.js`에 손 모양을 추가하고 `input.js`에서 의도에 연결하세요.
