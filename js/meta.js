/* 환상 콜라보 — 상시 명단·성장 저장 (docs/GROWTH.md). DOM 없음, node 시뮬 가능.
   저장 fcb-meta-v1 = { v:1, unlocked, party, xp, perks, bonds, relics, gear:{ own, eq, lock } }.
   새 저장(시작 셋, 경험치 0)은 지금 게임과 똑같이 돈다.
*/
(function (root) {
  "use strict";
  var C = root.FCBCore || (typeof require !== "undefined" ? require("./arena-core.js") : null);

  var KEY = "fcb-meta-v1";
  var STARTERS = ["arin", "sera", "aria"];
  // 명단 순서: 시작 셋 → 스테이지 1 → 2 → 3 → 4
  var ORDER = ["arin", "sera", "aria", "garen", "mariel", "leo", "serena", "odette", "noel", "lin", "arthur", "kael"];

  function fresh() {
    return { v: 1, unlocked: STARTERS.slice(), party: STARTERS.slice(), xp: {}, perks: {}, bonds: {}, relics: [], gear: { own: [], eq: {}, lock: {} } };
  }
  function sortIds(ids) { return ORDER.filter(function (id) { return ids.indexOf(id) >= 0; }); }
  function normalize(o) {
    if (!o || o.v !== 1) return null;
    var m = fresh();
    var un = Array.isArray(o.unlocked) ? o.unlocked : [];
    m.unlocked = sortIds(STARTERS.concat(un.filter(function (id) { return C.CAST[id]; })));
    if (o.xp && typeof o.xp === "object") Object.keys(o.xp).forEach(function (id) { if (C.CAST[id] && o.xp[id] > 0) m.xp[id] = Math.floor(o.xp[id]); });
    if (o.perks && typeof o.perks === "object") m.perks = o.perks;
    if (o.bonds && typeof o.bonds === "object") m.bonds = o.bonds;
    if (Array.isArray(o.relics)) m.relics = o.relics.slice();
    if (o.gear && typeof o.gear === "object") {
      var own = Array.isArray(o.gear.own) ? o.gear.own.filter(function (g, i, a) { return GEAR[g] && a.indexOf(g) === i; }) : [];
      m.gear = { own: own, eq: {}, lock: {} };
      var used = {};
      if (o.gear.eq) Object.keys(o.gear.eq).forEach(function (id) { var g = o.gear.eq[id]; if (C.CAST[id] && own.indexOf(g) >= 0 && !used[g]) { m.gear.eq[id] = g; used[g] = 1; } });
      if (o.gear.lock) Object.keys(o.gear.lock).forEach(function (id) { if (C.CAST[id] && o.gear.lock[id]) m.gear.lock[id] = 1; });
    }
    if (validParty(m, o.party)) m.party = o.party.slice();
    if (o.migrated) m.migrated = o.migrated;
    return m;
  }
  function unlock(m, id) {
    if (!C.CAST[id] || m.unlocked.indexOf(id) >= 0) return false;
    m.unlocked = sortIds(m.unlocked.concat([id]));
    return true;
  }
  // 옛 저장 옮기기: 진행 중 런 명단 + 클리어한 스테이지(보통·하드)의 만남 동료
  function migrate(stagesRec, runSave, STAGES) {
    var m = fresh();
    if (runSave && Array.isArray(runSave.roster)) runSave.roster.forEach(function (id) { unlock(m, id); });
    var cleared = {};
    if (stagesRec) [stagesRec.clears, stagesRec.hard].forEach(function (c) { if (c) Object.keys(c).forEach(function (n) { if (c[n] > 0) cleared[n] = 1; }); });
    Object.keys(cleared).forEach(function (n) {
      var st = STAGES && STAGES[n];
      if (st && st.meet) Object.keys(st.meet).forEach(function (id) { unlock(m, id); });
    });
    m.migrated = 1;
    return m;
  }
  function validParty(m, ids) {
    if (!Array.isArray(ids) || ids.length !== 3) return false;
    var seen = {};
    for (var i = 0; i < 3; i++) {
      if (!C.CAST[ids[i]] || seen[ids[i]] || m.unlocked.indexOf(ids[i]) < 0) return false;
      seen[ids[i]] = 1;
    }
    return true;
  }
  function defaultParty(m) { return validParty(m, m.party) ? m.party.slice() : STARTERS.slice(); }


  // ---------- ② 성장 (docs/GROWTH.md) ----------
  var MAX_LV = 8;
  var THRESH = [0, 0, 60, 150, 270, 420, 600, 820, 1080];   // THRESH[lv] = 그 레벨 누적 경험치
  var XP = { floor: 10, win: 20, hard: 1.5, bench: 0.3 };
  var PER_LV = { hp: 0.015, atk: 0.01 };
  // 효과 종류 (엔진 arena-core 의 perks 키)
  var PERK = {
    power: { name: "강타", desc: "스킬 위력 ×1.3 (치유면 +15)" },
    quick: { name: "단축", desc: "스킬 재사용 −1턴 (치유면 회복 −20)" },
    wedge: { name: "쐐기", desc: "브레이크 누적 ×1.6" },
    ultpow: { name: "극의", desc: "필살 위력 ×1.25 (성역이면 회복 +15)" },
    extend: { name: "연장", desc: "필살 버프·성역 +1턴" },
    vanguard: { name: "선봉", desc: "전투 시작 필살 게이지 +25" },
    breath: { name: "숨 고르기", desc: "방어 때 HP 12% 회복 · 게이지 +10" },
    inspire: { name: "고무", desc: "공격·스킬 뒤 다른 아군 게이지 +5" },
    first: { name: "선제", desc: "전투 첫 행동 피해 ×1.6" },
    laststand: { name: "배수진", desc: "HP 40% 이하면 공격 ×1.3" },
    drain: { name: "흡수", desc: "준 피해 20% 만큼 회복" },
    plate: { name: "철갑", desc: "최대 HP +15%" },
    longmark: { name: "긴 표식", desc: "약점 표시 +1턴" },
    mend: { name: "수호", desc: "방어하면 가장 다친 아군 HP 12% 회복" },
    markheal: { name: "탕감", desc: "약점 표시하면 아군 전원 HP 5% 회복" },
    ultheal: { name: "보호 조항", desc: "필살기를 쓰면 아군 전원 HP 12% 회복" },
  };
  // 동료별 갈림길 [Lv3 A, Lv3 B], [Lv6 A, Lv6 B] = [효과, 이름]
  var PICKS = {
    arin: { 3: [["wedge", "왕관 쐐기"], ["vanguard", "선봉의 새벽"]], 6: [["extend", "긴 새벽"], ["laststand", "무너진 왕관"]] },
    sera: { 3: [["power", "깊은 치유"], ["quick", "짧은 기도"]], 6: [["extend", "성역 연장"], ["inspire", "축복의 노래"]] },
    aria: { 3: [["longmark", "깊은 약점"], ["first", "선제 사냥"]], 6: [["ultpow", "완전 분쇄"], ["breath", "황금 방패"]] },
    garen: { 3: [["plate", "철벽"], ["breath", "방패 숨"]], 6: [["extend", "긴 맹세"], ["mend", "수호의 방패"]] },
    mariel: { 3: [["quick", "빠른 패"], ["longmark", "긴 읽기"]], 6: [["ultpow", "마지막 패"], ["first", "선제 카드"]] },
    leo: { 3: [["power", "깊은 각인"], ["wedge", "획 끊기"]], 6: [["ultpow", "큰 한 획"], ["drain", "생명 룬"]] },
    serena: { 3: [["first", "첫 박자"], ["power", "보름달"]], 6: [["laststand", "새벽 직전"], ["drain", "달빛 흡수"]] },
    odette: { 3: [["longmark", "긴 각주"], ["inspire", "기록의 박자"]], 6: [["extend", "제18조"], ["ultheal", "보호 조항"]] },
    noel: { 3: [["inspire", "결산"], ["quick", "빠른 감사"]], 6: [["extend", "긴 장부"], ["markheal", "장부 탕감"]] },
    lin: { 3: [["wedge", "눈금 끊기"], ["quick", "빠른 측량"]], 6: [["ultpow", "새 이름"], ["first", "첫 눈금"]] },
    arthur: { 3: [["vanguard", "길 안내"], ["power", "길잡이 강타"]], 6: [["extend", "긴 길"], ["laststand", "왕성의 기사"]] },
    kael: { 3: [["plate", "판금"], ["longmark", "긴 장부"]], 6: [["breath", "하르트만의 벽"], ["ultpow", "꺾이지 않는 창"]] },
  };
  var PERK_LV = [3, 6];

  function xpOf(m, id) { return (m.xp && m.xp[id]) || 0; }
  function levelOfXp(xp) { var lv = 1; while (lv < MAX_LV && xp >= THRESH[lv + 1]) lv++; return lv; }
  function level(m, id) { return levelOfXp(xpOf(m, id)); }
  // 고른 갈림길 효과 키 목록 (레벨이 닿은 것만)
  function perkKeys(m, id, lv) {
    if (lv == null) lv = level(m, id);
    var ch = (m.perks && m.perks[id]) || {}, out = [];
    PERK_LV.forEach(function (t) { if (lv >= t && (ch[t] === 0 || ch[t] === 1) && PICKS[id]) out.push(PICKS[id][t][ch[t]][0]); });
    return out;
  }
  function pending(m, id) {
    var lv = level(m, id), ch = (m.perks && m.perks[id]) || {};
    return PERK_LV.filter(function (t) { return lv >= t && ch[t] !== 0 && ch[t] !== 1; });
  }
  function choosePerk(m, id, t, idx) {
    if (!PICKS[id] || PERK_LV.indexOf(t) < 0 || (idx !== 0 && idx !== 1) || level(m, id) < t) return false;
    m.perks = m.perks || {}; m.perks[id] = m.perks[id] || {}; m.perks[id][t] = idx;
    return true;
  }
  function statsAt(id, lv, keys) {
    var c = C.CAST[id];
    var hp = Math.round(c.hp * (1 + PER_LV.hp * (lv - 1)));
    if (keys.indexOf("plate") >= 0) hp = Math.round(hp * 1.15);
    var atk = Math.round(c.atk * (1 + PER_LV.atk * (lv - 1)) * 10) / 10;
    return { lv: lv, hp: hp, atk: atk, perks: keys };
  }
  function stats(m, id) { var lv = level(m, id); return statsAt(id, lv, perkKeys(m, id, lv)); }
  // 런 시작 때 찍어 두는 성장 값. Lv1 · 갈림길 없음이면 넣지 않는다 → 새 저장은 null (엔진이 지금과 똑같이 돈다)
  // 장비를 낀 동료도 넣는다 (HP·공격은 장비 % 를 얹은 값, 회복·게이지는 gx). 장비 없음 = 예전 그대로
  function growthMap(m) {
    var out = null;
    (m.unlocked || []).forEach(function (id) {
      var st = stats(m, id), gid = gearOf(m, id);
      if (st.lv <= 1 && !st.perks.length && !gid) return;
      var pk = {}; st.perks.forEach(function (k) { pk[k] = 1; });
      out = out || {};
      out[id] = { lv: st.lv, hp: st.hp, atk: st.atk, perks: pk };
      if (gid) {
        var fx = GEAR[gid].fx, gx = {};
        if (fx.hp) out[id].hp = Math.round(st.hp * (1 + fx.hp));
        if (fx.atk) out[id].atk = Math.round(st.atk * (1 + fx.atk) * 10) / 10;
        Object.keys(fx).forEach(function (k) { if (k !== "hp" && k !== "atk") gx[k] = fx[k]; });
        if (Object.keys(gx).length) out[id].gx = gx;
        out[id].gear = gid;
      }
    });
    return out;
  }

  // ---------- ④ 장비 (docs/GEAR.md) ----------
  // 동료 하나에 한 칸. 장비는 한 벌씩만 (두 동료가 같은 장비를 낄 수 없다).
  // 「최강」 = 그 동료·그 셋·그 난이도에서 실제로 쓸모 있는 값 (gearParts). 등급은 안 본다. 셋 통째로 가장 값이 큰 묶음.
  // tier 1 일반 · 2 희귀 · 3 영웅 · 4 유니크(한 저장에 한 번, src 에서만). 자동 장착 값은 아래 VAL · gearParts
  var GEAR = {
    cord: { name: "붕대 손목끈", tier: 1, heal: 1, fx: { regen: 0.03 }, text: "매 라운드 끝 자기 HP 3% 회복" },
    whet: { name: "숫돌 단검", tier: 1, fx: { atk: 0.08 }, text: "공격 +8%" },
    quilt: { name: "누빈 조끼", tier: 1, fx: { hp: 0.08 }, text: "최대 HP +8%" },
    gloves: { name: "가죽 장갑", tier: 1, fx: { hp: 0.04, atk: 0.03 }, text: "최대 HP +4% · 공격 +3%" },
    bell: { name: "작은 종", tier: 1, fx: { gauge: 10 }, text: "전투 시작 필살 게이지 +10" },
    fangring: { name: "송곳니 반지", tier: 2, heal: 1, fx: { leech: 0.08 }, text: "준 피해 8%만큼 자기 회복" },
    charm: { name: "사냥꾼 부적", tier: 2, heal: 1, fx: { killHeal: 0.12 }, text: "적을 쓰러뜨리면 자기 HP 12% 회복" },
    buckler: { name: "성문 버클러", tier: 2, heal: 1, fx: { hp: 0.05, guardHeal: 0.1 }, text: "최대 HP +5% · 방어하면 자기 HP 10% 회복" },
    quill: { name: "기록관 깃펜", tier: 2, fx: { gauge: 20 }, text: "전투 시작 필살 게이지 +20" },
    moonblade: { name: "달빛 검", tier: 2, fx: { atk: 0.11 }, text: "공격 +11%" },
    oath: { name: "피의 맹세 팔찌", tier: 2, fx: { low: 1.3, hp: 0.04 }, text: "최대 HP +4% · HP 40% 이하면 공격 ×1.3" },
    brooch: { name: "장미 브로치", tier: 3, heal: 1, fx: { ultAll: 0.05, gauge: 10 }, text: "필살기 때 아군 전원 HP 5% 회복 · 시작 게이지 +10" },
    mantle: { name: "룬 이끼 망토", tier: 3, heal: 1, fx: { regenLow: 0.02 }, text: "매 라운드 끝 가장 다친 아군 HP 2% 회복" },
    epaulet: { name: "새벽 견장", tier: 3, fx: { hp: 0.05, atk: 0.05 }, text: "최대 HP +5% · 공격 +5%" },
    compass: { name: "균열 나침반", tier: 3, heal: 1, fx: { killAll: 0.03, atk: 0.03 }, text: "적을 쓰러뜨리면 아군 전원 HP 3% 회복 · 공격 +3%" },
    // 유니크 ◆ — 강하지만 대가가 있다. 나온 곳에서 딱 한 번
    article18: { name: "제18조 원본", tier: 4, src: "q1", world: "deck", fx: { ultGauge: 20, ultAll: 0.07, atk: -0.05 }, text: "필살기를 쓰면 다른 아군 게이지 +20 · 아군 전원 HP 7% 회복 · 공격 −5%", heal: 1 },
    lastqueen: { name: "여왕의 마지막 패", tier: 4, src: "q2", world: "deck", fx: { killGauge: 25, killHeal: 0.1, atk: 0.05, hp: -0.08 }, text: "적을 쓰러뜨리면 자기 게이지 +25 · HP 10% 회복 · 공격 +5% · 최대 HP −8%", heal: 1 },
    ledger: { name: "칸 값 장부", tier: 4, src: "q3", world: "rune", heal: 1, fx: { regenLow: 0.03, atk: -0.15 }, text: "매 라운드 끝 가장 다친 아군 HP 3% 회복 · 공격 −15%" },
    hartmann: { name: "하르트만 장부", tier: 4, src: "q4", world: "ashen", fx: { gauge: 35, hp: 0.08, atk: -0.05 }, text: "전투 시작 필살 게이지 +35 · 최대 HP +8% · 공격 −5%" },
    crown: { name: "무너진 왕관", tier: 4, src: "stage5", world: "ashen", heal: 1, fx: { low: 1.35, leech: 0.1 }, text: "HP 40% 이하면 공격 ×1.35 · 준 피해 10% 회복" },
    grail: { name: "성녀의 성배", tier: 4, src: "hard", world: "ashen", heal: 1, fx: { guardAll: 0.07, regen: 0.03, atk: -0.08 }, text: "방어하면 아군 전원 HP 7% · 매 라운드 끝 자기 HP 3% 회복 · 공격 −8%" },
  };
  var RARITY = ["", "일반", "희귀", "영웅", "유니크"];
  var SRC_TEXT = { q1: "의뢰 「제18조」 첫 완료", q2: "의뢰 「마지막 패」 첫 완료", q3: "의뢰 「칸 값」 첫 완료", q4: "의뢰 「두 권의 장부」 첫 완료", stage5: "5 · 왕좌 너머 첫 클리어", hard: "하드 첫 클리어 (아무 스테이지)" };
  // 랜덤 전리품: 출처마다 확률 · 등급 가중치 (일반·희귀·영웅). 유니크는 랜덤에 안 나온다
  var DROP = {
    battle: { p: 0.15, w: [0, 80, 20, 0] },
    treasure: { p: 0.35, w: [0, 60, 35, 5] },
    elite: { p: 1, w: [0, 50, 40, 10] },
    boss: { p: 1, w: [0, 0, 50, 50] },
    quest: { p: 1, w: [0, 0, 40, 60] },
  };
  var DROP_TEXT = { 1: "일반 전투 15% · 보물 35% · 강적", 2: "강적 · 보스 · 보물 · 의뢰", 3: "보스 · 의뢰 · 강적 10% · 보물 5%" };
  var GEAR_LIST = Object.keys(GEAR);
  var ROLE = { arin: "dps", sera: "healer", aria: "dps", garen: "tank", mariel: "dps", leo: "dps", serena: "dps", odette: "support", noel: "support", lin: "dps", arthur: "tank", kael: "tank" };
  var ROLE_NAME = { dps: "공격", tank: "방패", support: "보조", healer: "치유" };
  function gearSave(m) { if (!m.gear || typeof m.gear !== "object") m.gear = { own: [], eq: {}, lock: {} }; m.gear.own = m.gear.own || []; m.gear.eq = m.gear.eq || {}; m.gear.lock = m.gear.lock || {}; return m.gear; }
  function gearOf(m, id) { var g = m.gear && m.gear.eq && m.gear.eq[id]; return g && GEAR[g] ? g : null; }
  function stars(gid) { return GEAR[gid].tier === 4 ? "◆" : "★★★".slice(0, GEAR[gid].tier); }
  function rarity(gid) { return RARITY[GEAR[gid].tier]; }
  function whereText(gid) { var G = GEAR[gid]; return G.tier === 4 ? SRC_TEXT[G.src] + " · 한 번만" : DROP_TEXT[G.tier]; }
  // 장비 값 (docs/GEAR.md 「자동 장착」): 효과마다 「승률 몇 점쯤」으로 환산한 합. 대가(공격 −% 등)도 그대로 뺀다.
  // relic-sim D(장비 하나씩) 결과로 맞춘 계수. 역할 · 세라 유무 · 난이도(하드는 HP·회복 무게 ↑)를 본다. 등급은 안 본다.
  var VAL = {
    hp: { tank: 0.45, dps: 0.2, support: 0.3, healer: 0.35 },          // 최대 HP 1%당 (하드 ×1.5)
    atk: { tank: 0.15, dps: 0.3, support: 0.05, healer: 0.02 },        // 공격 +1%당. −면 ×3 (공격 자리 ×5: 처치 타이밍이 밀려 크게 진다)
    regen: { tank: 1.6, dps: 0.9, support: 0.9, healer: 0.6 },         // 자기 라운드 회복 1%당
    regenLow: { tank: 2.0, dps: 0.25, support: 1.2, healer: 2.2 },  // 가장 다친 아군 1%당. 공격 자리에는 거의 안 준다
    ultAll: 0.25, killAll: 0.9,
    guardAll: { tank: 0.25, healer: 0.7, dps: 0.2, support: 0.3 },
    leech: { tank: 0.08, dps: 0.18, support: 0.05, healer: 0.03 },
    killHeal: { tank: 0.08, dps: 0.2, support: 0.05, healer: 0.03 },
    guardHeal: { tank: 0.18, dps: 0.05, support: 0.05, healer: 0.05 },
    ultGauge: 0.06, killGauge: { tank: 0.02, dps: 0.05, support: 0.02, healer: 0.01 },
    low: { tank: 0.6, dps: 0.3, support: 0.2, healer: 0 },            // (배율 −1) × 10 당. 공격 자리는 무조건 공격이 더 크다
  };
  // 시작 게이지 1점당 (동료마다): 세라는 성역을 일찍, 레오는 큰 획을 일찍. 아리아는 「부위 분쇄」를 충전 적에 아껴야 해서 −
  var GAUGE_W = { sera: 0.3, leo: 0.15, odette: 0.12, noel: 0.12, mariel: 0.08, aria: -0.1 };
  var FINISH = { leo: 1.6, serena: 1.6, lin: 1.6 };   // 처치 회복·처치 게이지가 잘 터지는 동료
  var MIN_VAL = 1;   // 이보다 작은 값의 장비는 안 낀다 (거의 0 = 안 끼는 것과 같음)
  var HEAL_KEYS = ["regen", "regenLow", "ultAll", "killAll", "guardAll", "leech", "killHeal", "guardHeal"];
  // 한 장비의 값 = { heal, other } (회복 몫은 겹치면 줄어서 따로)
  function gearParts(gid, id, party, ctx) {
    var fx = GEAR[gid].fx, r = ROLE[id] || "dps", hard = ctx && ctx.diff === "hard", heal = 0, other = 0;
    Object.keys(fx).forEach(function (k) {
      var v = fx[k], pts;
      if (k === "gauge") pts = v * (GAUGE_W[id] != null ? GAUGE_W[id] : 0.05);
      else {
        var w = VAL[k]; if (w == null) return;
        var c = typeof w === "number" ? w : (w[r] || 0);
        if ((k === "killHeal" || k === "killGauge") && FINISH[id]) {
          var dpsN = party.filter(function (pid) { return (ROLE[pid] || "dps") === "dps"; }).length;
          c *= dpsN >= 2 ? FINISH[id] : 0.55;
        }
        pts = k === "low" ? (v - 1) * 100 * c / 10 : k === "ultGauge" || k === "killGauge" ? v * c : v * 100 * c;
        if (k === "atk" && v < 0) pts *= r === "dps" ? 5 : 3;
        if (k === "hp" && hard) pts *= 1.5;
      }
      if (HEAL_KEYS.indexOf(k) >= 0) heal += pts * (hard ? 1.2 : 1); else other += pts;
    });
    if (party.indexOf("sera") >= 0) heal *= 0.45;   // 세라가 있으면 회복은 덜 급하다
    return { heal: heal, other: other };
  }
  function gearScore(gid, id, party, ctx) { var p = gearParts(gid, id, party, ctx); return Math.round((p.heal + p.other) * 10) / 10; }
  // 장비 묶음 값: 회복 몫은 큰 것부터 1 · 0.7 · 0.5 (겹치면 덜 는다)
  function setValue(list, party, ctx) {
    var hs = [], o = 0;
    list.forEach(function (x) { var p = gearParts(x.g, x.id, party, ctx); hs.push(p.heal); o += p.other; });
    hs.sort(function (a, b) { return b - a; });
    var DIM = [1, 0.7, 0.5];
    hs.forEach(function (h, i) { o += h * (h > 0 ? DIM[i] : 1); });
    return o;
  }
  function wearer(m, gid) { var eq = gearSave(m).eq; return Object.keys(eq).filter(function (id) { return eq[id] === gid; })[0] || null; }
  // 자동 장착: 파티 셋에 가진 장비 중 「값」(gearParts · setValue)이 가장 큰 묶음을 통째로 찾는다 (빈 칸 포함, 겹침 없음).
  // 직접 고른(잠금) 칸은 두고 값에만 넣는다. 값이 MIN_VAL 미만인 장비는 안 낀다 → 장비 없는 것보다 나빠지지 않게. 쉬는 동료가 낀 것도 가져온다.
  function autoEquip(m, party, opts) {
    var gs = gearSave(m), before = {}, ctx = { diff: opts && opts.diff };
    party.forEach(function (id) { before[id] = gs.eq[id] || null; });
    if (opts && opts.reset) party.forEach(function (id) { delete gs.lock[id]; });
    var fixed = [], free = [], used = {};
    party.forEach(function (id) { if (gs.lock[id]) { if (gs.eq[id]) { fixed.push({ g: gs.eq[id], id: id }); used[gs.eq[id]] = 1; } } else free.push(id); });
    var cand = gs.own.filter(function (g) { return !used[g]; });
    var best = { v: setValue(fixed, party, ctx), pick: [] };
    (function go(i, pick, taken) {
      if (i === free.length) {
        var v = setValue(fixed.concat(pick), party, ctx);
        if (v > best.v + 1e-9) best = { v: v, pick: pick.slice() };
        return;
      }
      go(i + 1, pick, taken);   // 빈 칸
      cand.forEach(function (g) {
        if (taken[g] || gearScore(g, free[i], party, ctx) < MIN_VAL) return;
        taken[g] = 1; pick.push({ g: g, id: free[i] });
        go(i + 1, pick, taken);
        pick.pop(); delete taken[g];
      });
    })(0, [], {});
    free.forEach(function (id) { delete gs.eq[id]; });
    best.pick.forEach(function (p) {
      var w = wearer(m, p.g); if (w && party.indexOf(w) < 0) delete gs.eq[w];
      gs.eq[p.id] = p.g;
    });
    return party.map(function (id) { return { id: id, from: before[id], to: gs.eq[id] || null }; });
  }
  // 직접 끼우기 (gid null = 빼기). 그 칸은 잠근다 — 자동 장착이 건드리지 않는다
  function equip(m, id, gid) {
    var gs = gearSave(m);
    if (!C.CAST[id] || (gid && gs.own.indexOf(gid) < 0)) return false;
    if (gid) { var w = wearer(m, gid); if (w) delete gs.eq[w]; gs.eq[id] = gid; } else delete gs.eq[id];
    gs.lock[id] = 1;
    return true;
  }
  // 랜덤 전리품 (DROP): 확률 → 등급 가중치 → 그 등급의 안 가진 것. 그 등급을 다 가졌으면 다른 등급, 다 가졌으면 null
  function rnd(seed) { var x = ((seed >>> 0) * 2654435761 + 0x9e3779b9) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; }
  function dropGear(m, seed, src) {
    var gs = gearSave(m), D = DROP[src]; if (!D) return null;
    if (rnd(seed) >= D.p) return null;
    var left = function (t) { return GEAR_LIST.filter(function (g) { return GEAR[g].tier === t && gs.own.indexOf(g) < 0; }); };
    var tot = 0, ws = D.w.map(function (w, t) { var v = left(t).length ? w : 0; tot += v; return v; });
    var tier = 0;
    if (tot > 0) { var r = rnd(seed + 1) * tot; for (var t = 1; t < 4; t++) { r -= ws[t]; if (r < 0) { tier = t; break; } } if (!tier) tier = 3; }
    else { for (var t2 = 1; t2 < 4 && !tier; t2++) if (left(t2).length && D.w.some(function (w) { return w > 0; })) tier = t2; }
    if (!tier) return null;
    var pool = left(tier), gid = pool[Math.floor(rnd(seed + 2) * pool.length)];
    gs.own.push(gid);
    return gid;
  }
  // 유니크: 그 출처에서 처음 한 번. 이미 가졌으면 null
  function grantUnique(m, src) {
    var gs = gearSave(m), gid = GEAR_LIST.filter(function (g) { return GEAR[g].tier === 4 && GEAR[g].src === src; })[0];
    if (!gid || gs.own.indexOf(gid) >= 0) return null;
    gs.own.push(gid);
    return gid;
  }
  // 런 경험치: 지난 층 × 10 + 승리 20, 하드 ×1.5. 명단 전부, 명단 밖 해금 동료 30%
  function runXp(run) {
    var win = run.over === "win";
    var nf = run.quest && run.map ? run.map.length : 6;   // 의뢰 던전(docs/QUESTS.md)은 4층
    var floors = win ? nf : Math.max(0, Math.min(nf, run.floor | 0));
    var x = floors * XP.floor + (win ? XP.win : 0) + (run.bonusXp || 0);
    if (run.diff === "hard") x = Math.round(x * XP.hard);
    return x;
  }
  function addXp(m, id, n) {
    if (!C.CAST[id] || !(n > 0)) return null;
    var before = stats(m, id), x0 = xpOf(m, id);
    m.xp[id] = Math.min(THRESH[MAX_LV], x0 + Math.round(n));
    var after = stats(m, id);
    return { id: id, gain: m.xp[id] - x0, xp: m.xp[id], from: before, to: after, up: after.lv > before.lv, pending: pending(m, id) };
  }
  function award(m, run) {
    var full = runXp(run), out = [], rel0 = relicsOf(m);
    var roster = (run.roster || []).slice();
    roster.forEach(function (id) { unlock(m, id); });
    m.unlocked.forEach(function (id) {
      var bench = roster.indexOf(id) < 0;
      var r = addXp(m, id, bench ? Math.round(full * XP.bench) : full);
      if (r) { r.bench = bench; out.push(r); }
    });
    m.relics = relicsOf(m);
    return { xp: full, list: out, relics: m.relics.filter(function (x) { return rel0.indexOf(x) < 0; }) };
  }
  function nextAt(m, id) { var lv = level(m, id); return lv >= MAX_LV ? null : THRESH[lv + 1]; }

  // ---------- ③ 컨텐츠 (docs/GROWTH.md) ----------
  // 모닥불 대화: 명단 동료 Lv2·Lv4·Lv7 에 하나씩. 처음 들으면 경험치 +15
  var BOND_LV = [2, 4, 7], BOND_XP = 15, MIRROR_XP = 20;
  var BONDS = {
      "arin": {
          "2": "왕관은 무너졌어도 새벽은 온다. 나는 그걸 믿고 걷는다.",
          "4": "장군을 벨 때마다 옛 명령이 들린다. 그래도 멈추지 않는다.",
          "7": "이 저택에서 만난 이름들, 왕성으로 데려가고 싶다. 전부."
      },
      "sera": {
          "2": "성역의 물이 여기선 값을 받네요. 그래도 기도는 공짜예요.",
          "4": "폐하가 웃는 걸 오랜만에 봤어요. 이 방 덕분인지도요.",
          "7": "쓰러진 사람을 일으키는 건 제 몫이에요. 끝까지요."
      },
      "aria": {
          "2": "셀레스를 쫓다 여기까지 왔다. 표적이 출구라니, 웃기지.",
          "4": "혼자 사냥하는 게 편했는데. 등 뒤가 든든한 것도 나쁘지 않네.",
          "7": "방패는 지키라고 있는 거다. 이번엔 너희를 지킨다."
      },
      "garen": {
          "2": "방패가 무거운 날은 폐하 뒷모습을 보오. 그럼 가벼워지오.",
          "4": "성문을 지키지 못한 밤을 잊지 않소. 그래서 앞에 서는 거요.",
          "7": "이번 문은 끝까지 막겠소. 누구의 이름도 흘리지 않게."
      },
      "mariel": {
          "2": "패는 읽는 거다. 운에 맡기는 건 하수나 하는 짓이지.",
          "4": "무대가 뒤집혀도 박자는 그대로다. 너희 박자도 이제 알겠다.",
          "7": "마지막 패는 남겨 둔다. 같이 뒤집을 사람이 생겼으니까."
      },
      "leo": {
          "2": "칸마다 이름을 새겼다. 지워져도 다시 새기면 된다.",
          "4": "상자 속 글자는 내가 남긴 표식이다. 찾아 줘서 고맙다.",
          "7": "이 저택의 칸도 언젠가 이름을 되찾겠지. 그때까지 같이 긋자."
      },
      "serena": {
          "2": "박자를 세는 버릇이 있어요. 싸울 때도, 걸을 때도.",
          "4": "마리엘은 무뚝뚝해도 박자를 맞춰 줘요. 당신들도 그렇고요.",
          "7": "마지막 곡은 아침에 끝나요. 그때까지 같이 춰 줄래요?"
      },
      "odette": {
          "2": "오늘 일도 적어 둘게요. 이긴 날도, 진 날도.",
          "4": "기록이 남으면 사람은 다시 일어설 수 있어요. 제17조처럼요.",
          "7": "이 저택의 마지막 장은 우리가 같이 쓰는 거예요."
      },
      "noel": {
          "2": "쉼에도 값이 있다. 나는 그 값을 깎는 사람이다.",
          "4": "레오의 칸 값은 아직 장부에 남아 있다. 이번엔 탕감하지.",
          "7": "장부를 닫을 때가 왔다. 받을 건 받고, 줄 건 준다."
      },
      "lin": {
          "2": "이 방, 생각보다 넓어. 재 보니까 문이 하나 더 있어.",
          "4": "싸움터라도 원래 이름은 있었을 거야. 그걸 잊지 않으려고 재.",
          "7": "다음 칸은 내가 먼저 잴게. 너희는 걷기만 해."
      },
      "arthur": {
          "2": "길은 내가 안다. 잔해 사이라도, 저택 속이라도.",
          "4": "성문 문지기를 기억한다. 그도 처음엔 사람을 지켰다.",
          "7": "맹세문은 반쯤 탔지만 남은 반은 아직 읽힌다. 너희를 지킨다."
      },
      "kael": {
          "2": "하르트만은 몰락했지만 갑옷은 아직 무겁다. 그게 자랑이다.",
          "4": "장부는 내 손에 있다. 성문을 연 이름도 거기 적혀 있다.",
          "7": "무너지지 않는다. 내가 앞에 있는 한, 아무도."
      }
  };
  function bondNext(m, id) {
    var lv = level(m, id), heard = (m.bonds && m.bonds[id]) || [];
    for (var i = 0; i < BOND_LV.length; i++) if (lv >= BOND_LV[i] && heard.indexOf(BOND_LV[i]) < 0 && BONDS[id]) return BOND_LV[i];
    return null;
  }
  function hearBond(m, id, L) {
    if (bondNext(m, id) !== L) return null;
    m.bonds = m.bonds || {}; m.bonds[id] = (m.bonds[id] || []).concat([L]);
    var r = addXp(m, id, BOND_XP);
    if (r) r.line = BONDS[id][String(L)];
    return r;
  }
  // 유물: 세계마다 하나, 그 세계 동료가 Lv4 가 되면 보물 고르기에 섞인다
  var RELIC_LV = 4;
  var RELIC_OF = { ashen: "crown", hunt: "arrow", deck: "queen", rune: "healrune" };
  function relicsOf(m) {
    var out = [];
    Object.keys(RELIC_OF).forEach(function (o) {
      if ((m.unlocked || []).some(function (id) { return C.CAST[id].origin === o && level(m, id) >= RELIC_LV; })) out.push(RELIC_OF[o]);
    });
    return out;
  }

  var api = { KEY: KEY, STARTERS: STARTERS, ORDER: ORDER, fresh: fresh, normalize: normalize, unlock: unlock, migrate: migrate, validParty: validParty, defaultParty: defaultParty,
    MAX_LV: MAX_LV, THRESH: THRESH, XP: XP, PER_LV: PER_LV, PERK: PERK, PICKS: PICKS, PERK_LV: PERK_LV,
    xpOf: xpOf, level: level, levelOfXp: levelOfXp, perkKeys: perkKeys, pending: pending, choosePerk: choosePerk, stats: stats, statsAt: statsAt, growthMap: growthMap, runXp: runXp, addXp: addXp, award: award, nextAt: nextAt,
    BOND_LV: BOND_LV, BOND_XP: BOND_XP, MIRROR_XP: MIRROR_XP, BONDS: BONDS, bondNext: bondNext, hearBond: hearBond, RELIC_LV: RELIC_LV, RELIC_OF: RELIC_OF, relicsOf: relicsOf,
    GEAR: GEAR, GEAR_LIST: GEAR_LIST, VAL: VAL, setValue: setValue, ROLE: ROLE, ROLE_NAME: ROLE_NAME, gearOf: gearOf, gearScore: gearScore, stars: stars, autoEquip: autoEquip, equip: equip, dropGear: dropGear, grantUnique: grantUnique, wearer: wearer, DROP: DROP, RARITY: RARITY, rarity: rarity, whereText: whereText, SRC_TEXT: SRC_TEXT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FCBMeta = api;
})(this);
