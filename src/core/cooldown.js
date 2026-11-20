// 스킬 쿨타임 (설정 '스킬 쿨타임' 으로 끄기). 캐릭터마다 기술을 쓰는 순간 cool(ctx, 이름, 초)를 부른다
const until = new Map();
let lastWarn = -10;

/** 쓸 수 있으면 true 를 돌려주고 쿨타임을 건다. 아직이면 false (남은 시간을 잠깐 알려 준다) */
export function cool(ctx, key, sec, label = null) {
  if (ctx.settings?.cooldowns === false) return true;
  const now = ctx.world?.time ?? 0;
  const t = until.get(key) ?? -1;
  if (now < t) {
    if (now - lastWarn > 0.8) {
      lastWarn = now;
      ctx.ui?.callout?.(`${label ?? key} 재사용 대기 ${Math.ceil(t - now)}초`, { color: '#c8d0ff', size: 34, dur: 0.8 });
    }
    return false;
  }
  until.set(key, now + sec);
  return true;
}

/** 남은 쿨타임(초) — 손목 HUD 용 */
export function coolLeft(ctx, key) {
  if (ctx.settings?.cooldowns === false) return 0;
  return Math.max(0, (until.get(key) ?? -1) - (ctx.world?.time ?? 0));
}

export function resetCooldowns() {
  until.clear();
}
