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
    if (o.gear && o.gear.up && typeof o.gear.up === "object") { m.gear.up = {}; Object.keys(o.gear.up).forEach(function (g) { var n = o.gear.up[g] | 0; if (GEAR[g] && n > 0) m.gear.up[g] = Math.min(UP_MAX, n); }); }
    // 반복 동기 (docs/GROWTH.md 「반복」): 조각 · 업적 · 승천 · 칭호 · 오늘의 런 · 기록 — 있을 때만 키
    if (o.shards > 0) m.shards = Math.floor(o.shards);
    if (o.ach && typeof o.ach === "object") m.ach = o.ach;
    if (o.asc && typeof o.asc === "object") m.asc = { open: Math.max(0, Math.min(10, o.asc.open | 0)), best: Math.max(0, Math.min(10, o.asc.best | 0)), cleared: o.asc.cleared && typeof o.asc.cleared === "object" ? o.asc.cleared : {} };
    if (typeof o.title === "string") m.title = o.title;
    if (o.daily && typeof o.daily === "object") m.daily = o.daily;
    if (o.rec && typeof o.rec === "object") m.rec = o.rec;
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
        var fx = fxOf(m, gid), gx = {};
        if (fx.hp) out[id].hp = Math.round(st.hp * (1 + fx.hp));
        if (fx.atk) out[id].atk = Math.round(st.atk * (1 + fx.atk) * 10) / 10;
        Object.keys(fx).forEach(function (k) { if (k !== "hp" && k !== "atk") gx[k] = fx[k]; });
        if (Object.keys(gx).length) out[id].gx = gx;
        out[id].gear = gid;
        if (fx.hp || fx.atk) out[id].gfx = { hp: fx.hp || 0, atk: fx.atk || 0 };   // 승천 「녹슨 장비」가 되돌릴 때 쓴다
      }
    });
    return out;
  }

  // ---------- ⑤ 반복 동기 (docs/GROWTH.md 「반복」) ----------
  // 장비 조각: 지면 (도달 층 + 1), 이기면 4 (하드 ×2, 승천 +단계). 조각으로 안 가진 장비(★1–3) 제작 · 가진 장비 강화(+1~+3)
  var UP_MAX = 3, UP_STEP = 0.2;
  var CRAFT = { 1: 6, 2: 15, 3: 30 };
  function upOf(m, gid) { return (m.gear && m.gear.up && m.gear.up[gid]) | 0; }
  // 강화한 효과: 좋은 쪽(+) 만 × (1 + 0.2n), 대가(−)는 그대로
  function fxOf(m, gid) {
    var fx = GEAR[gid].fx, u = upOf(m, gid); if (!u) return fx;
    var o = {}; Object.keys(fx).forEach(function (k) { var v = fx[k]; o[k] = k === "low" ? 1 + (v - 1) * (1 + UP_STEP * u) : v > 0 ? (v >= 1 ? Math.round(v * (1 + UP_STEP * u)) : Math.round(v * (1 + UP_STEP * u) * 1000) / 1000) : v; });
    return o;
  }
  function upCost(gid, n) { var t = GEAR[gid].tier; return (t === 4 ? 20 : t * 5) * n; }   // n = 다음 단계
  function shardsOf(m) { return m.shards | 0; }
  function addShards(m, n) { n = Math.round(n); if (n > 0) m.shards = shardsOf(m) + n; return n; }
  function canCraft(m, gid) { var G = GEAR[gid]; return !!G && G.tier < 4 && gearSave(m).own.indexOf(gid) < 0 && shardsOf(m) >= CRAFT[G.tier]; }
  function craft(m, gid) { if (!canCraft(m, gid)) return false; m.shards -= CRAFT[GEAR[gid].tier]; gearSave(m).own.push(gid); return true; }
  function canUpgrade(m, gid) { var u = upOf(m, gid); return gearSave(m).own.indexOf(gid) >= 0 && u < UP_MAX && shardsOf(m) >= upCost(gid, u + 1); }
  function upgrade(m, gid) { if (!canUpgrade(m, gid)) return false; var u = upOf(m, gid); m.shards -= upCost(gid, u + 1); gearSave(m).up = gearSave(m).up || {}; m.gear.up[gid] = u + 1; return true; }
  function runShards(run) {
    var win = run.over === "win", nf = run.map ? run.map.length : 6;
    var n = win ? 4 : 1 + Math.max(0, Math.min(nf - 1, run.floor | 0));
    if (run.diff === "hard") n *= 2;
    if (run.asc > 0) n += run.asc;
    return n;
  }
  // 승천: 하드에서 아무 스테이지나 깨면 1 이 열리고, 승천 k 를 깨면 k+1. 처음 깰 때 조각 5+3k · 칭호(1·5·10) · 25% 로 안 가진 유니크 하나
  function ascSave(m) { if (!m.asc) m.asc = { open: 0, best: 0, cleared: {} }; m.asc.cleared = m.asc.cleared || {}; return m.asc; }
  function ascOpen(m) { return (m.asc && m.asc.open) | 0; }
  function ascWin(m, a, seed) {
    var as = ascSave(m), out = { first: false, opened: 0, shards: 0, unique: null };
    if (a <= 0) { if (as.open < 1) { as.open = 1; out.opened = 1; } return out; }
    if (a + 1 > as.open && a < 10) { as.open = a + 1; out.opened = a + 1; }
    if (!as.cleared[a]) {
      as.cleared[a] = 1; out.first = true; as.best = Math.max(as.best, a);
      out.shards = addShards(m, 5 + 3 * a);
      if (rnd((seed >>> 0) + a * 977) < 0.25) {
        var left = GEAR_LIST.filter(function (g) { return GEAR[g].tier === 4 && gearSave(m).own.indexOf(g) < 0; });
        if (left.length) { out.unique = left[Math.floor(rnd((seed >>> 0) + 31) * left.length)]; m.gear.own.push(out.unique); }
      }
    }
    return out;
  }
  // 칭호 (보이기만): 업적 · 승천에서 열린다
  var TITLES = { pilgrim: "균열 순례자", sealer: "다섯 문의 봉인자", asc5: "승천 5의 문지기", asc10: "균열의 끝을 본 자", daily: "오늘의 정복자", collector: "장비 수집가", veteran: "다시 일어선 자", maxed: "만렙 동료의 벗" };
  // 업적: 조건 · 보상 조각 · (칭호)
  var ACH = [
    { id: "first_win", name: "첫 승리", text: "아무 스테이지나 한 번 이긴다", shards: 5 },
    { id: "all_stages", name: "다섯 문", text: "스테이지 1~5 를 모두 깬다", shards: 20, title: "sealer" },
    { id: "hard_win", name: "하드 돌파", text: "하드로 한 번 이긴다", shards: 10 },
    { id: "asc1", name: "첫 승천", text: "승천 1 을 깬다", shards: 10, title: "pilgrim" },
    { id: "asc5", name: "승천 5", text: "승천 5 를 깬다", shards: 20, title: "asc5" },
    { id: "asc10", name: "균열의 끝", text: "승천 10 을 깬다", shards: 40, title: "asc10" },
    { id: "no_sera", name: "치유사 없이", text: "세라 없이 이긴다", shards: 10 },
    { id: "quests", name: "의뢰 해결사", text: "동료 의뢰 넷을 모두 끝낸다", shards: 15 },
    { id: "roster", name: "열두 명", text: "동료 열둘을 모두 해금한다", shards: 15 },
    { id: "lv8", name: "최대 레벨", text: "동료 하나를 Lv8 로 키운다", shards: 10, title: "maxed" },
    { id: "gear10", name: "장비 열 개", text: "장비 열 개를 가진다", shards: 10, title: "collector" },
    { id: "up3", name: "+3 강화", text: "장비 하나를 +3 까지 강화한다", shards: 10 },
    { id: "daily1", name: "오늘의 승리", text: "오늘의 런을 이긴다", shards: 5 },
    { id: "daily3", name: "사흘의 승리", text: "서로 다른 사흘에 오늘의 런을 이긴다", shards: 15, title: "daily" },
    { id: "loss10", name: "다시 일어서기", text: "열 번 진다 (지는 것도 성장)", shards: 5, title: "veteran" },
  ];
  // ctx: { stages: {clears, hard}, quests: n완료 } — 지금 저장으로 새로 달성한 업적을 찍고 보상을 준다
  function checkAch(m, ctx) {
    m.ach = m.ach || {}; var got = [], st = ctx && ctx.stages || {}, cl = st.clears || {}, hd = st.hard || {}, r = m.rec || {};
    var cleared = function (n) { return (cl[n] | 0) > 0 || (hd[n] | 0) > 0; };
    var cond = {
      first_win: (r.wins | 0) > 0 || [1, 2, 3, 4, 5].some(cleared),
      all_stages: [1, 2, 3, 4, 5].every(cleared),
      hard_win: Object.keys(hd).some(function (n) { return hd[n] > 0; }) || (ascOpen(m) > 0),
      asc1: !!(m.asc && m.asc.cleared && m.asc.cleared[1]), asc5: !!(m.asc && m.asc.cleared && m.asc.cleared[5]), asc10: !!(m.asc && m.asc.cleared && m.asc.cleared[10]),
      no_sera: (r.noSera | 0) > 0,
      quests: (ctx && ctx.quests | 0) >= 4,
      roster: m.unlocked.length >= ORDER.length,
      lv8: m.unlocked.some(function (id) { return level(m, id) >= MAX_LV; }),
      gear10: gearSave(m).own.length >= 10,
      up3: Object.keys(gearSave(m).up || {}).some(function (g) { return m.gear.up[g] >= UP_MAX; }),
      daily1: (m.daily && (m.daily.wins || []).length) > 0,
      daily3: (m.daily && (m.daily.wins || []).length) >= 3,
      loss10: (r.losses | 0) >= 10,
    };
    ACH.forEach(function (a) { if (!m.ach[a.id] && cond[a.id]) { m.ach[a.id] = 1; addShards(m, a.shards); got.push(a.id); } });
    return got;
  }
  function titlesOf(m) { var t = []; ACH.forEach(function (a) { if (a.title && m.ach && m.ach[a.id]) t.push(a.title); }); return t; }
  // 런 기록 (업적용): 승리 · 패배 · 세라 없이 승리
  function recordRun(m, run) {
    m.rec = m.rec || {};
    if (run.over === "win") { m.rec.wins = (m.rec.wins | 0) + 1; if ((run.roster || run.active || []).indexOf("sera") < 0) m.rec.noSera = (m.rec.noSera | 0) + 1; }
    else m.rec.losses = (m.rec.losses | 0) + 1;
  }
  // 오늘의 런: 날짜(현지) → 같은 시드 · 같은 스테이지 (보통). 기록 = 이김 > 도달 층 > 적은 라운드. 하루 처음 끝내면 조각 3, 처음 이기면 +5
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function dailyOf(key) {
    var h = 2166136261; for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    var p = key.split("-").map(Number), day = Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
    return { key: key, seed: (h % 2000000000) + 1, stage: (day % 5) + 1 };
  }
  function dailyScore(r) { return (r.win ? 100000 : 0) + r.floor * 1000 - Math.min(999, r.rounds | 0); }
  function dailyResult(m, run) {
    var key = run.daily, d = m.daily && m.daily.key === key ? m.daily : { key: key, best: null, tries: 0, done: 0, won: 0, wins: (m.daily && m.daily.wins) || [] };
    var win = run.over === "win", nf = run.map ? run.map.length : 6, r = { win: win, floor: win ? nf : Math.min(nf, (run.floor | 0) + 1), rounds: run.stats ? run.stats.rounds : 0 };
    var out = { best: false, shards: 0, rec: r };
    d.tries = (d.tries | 0) + 1;
    if (!d.best || dailyScore(r) > dailyScore(d.best)) { d.best = r; out.best = true; }
    if (!d.done) { d.done = 1; out.shards += addShards(m, 3); }
    if (win && !d.won) { d.won = 1; out.shards += addShards(m, 5); if (d.wins.indexOf(key) < 0) d.wins = d.wins.concat([key]).slice(-30); }
    m.daily = d;
    return out;
  }

  // ---------- 권장 레벨 (docs/STAGES.md 「권장 레벨」) ----------
  // [보통, 하드]. tools/reclevel-run.sh (2026-10-25 곡선 뒤): 그때 쓸 수 있는 무난한 셋 중 기준 셋 다섯(Lv3·Lv8 곡선 없이 승률 1~5등)의
  // 승률 중앙값이 50%를 넘는 가장 낮은 레벨 (casual · 신중 경로 · 그 레벨쯤 가진 장비 자동 장착). 뒤 스테이지 ≥ 앞 · 하드 ≥ 보통으로 다듬음. 9 = 「8+」
  var REC = { s1: [1, 3], s2: [1, 3], s3: [3, 6], s4: [4, 7], s5: [6, 8], q1: [3, 3], q2: [3, 3], q3: [3, 3], q4: [6, 9] };
  function recLevel(key, diff) { var r = REC[key]; return r ? r[diff === "hard" ? 1 : 0] : null; }
  function recText(n) { return "권장 Lv " + (n > MAX_LV ? MAX_LV + "+" : n); }
  function avgLevel(m, ids) { if (!ids || !ids.length) return 1; return ids.reduce(function (a, id) { return a + level(m, id); }, 0) / ids.length; }
  // ok = 평균이 권장 이상 · near = 1~2 아래 · far = 그보다 아래
  function recState(avg, n) { return avg >= n ? "ok" : avg >= n - 2 ? "near" : "far"; }

  // ---------- ④ 장비 (docs/GEAR.md) ----------
  // 동료 하나에 한 칸. 장비는 한 벌씩만 (두 동료가 같은 장비를 낄 수 없다).
  // 「최강」 = 그 동료·그 셋(세라 유무)·그 난이도에서 승률을 실제로 가장 올리는 묶음 (값 표 GV, 시뮬로 맞춤). 등급은 안 본다.
  // tier 1 일반 · 2 희귀 · 3 영웅 · 4 유니크(한 저장에 한 번, src 에서만). 자동 장착 값은 아래 GV
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
    ledger: { name: "칸 값 장부", tier: 4, src: "q3", world: "rune", heal: 1, fx: { regenLow: 0.025, atk: -0.15 }, text: "매 라운드 끝 가장 다친 아군 HP 2.5% 회복 · 공격 −15%" },
    hartmann: { name: "하르트만 장부", tier: 4, src: "q4", world: "ashen", fx: { gauge: 35, hp: 0.08, atk: -0.05 }, text: "전투 시작 필살 게이지 +35 · 최대 HP +8% · 공격 −5%" },
    crown: { name: "무너진 왕관", tier: 4, src: "stage5", world: "ashen", heal: 1, fx: { low: 1.3, leech: 0.08 }, text: "HP 40% 이하면 공격 ×1.3 · 준 피해 8% 회복" },
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
  // 값 표 GV[난이도][세라 있음 s / 없음 n][동료] = 장비 순서(GEAR_LIST)대로 21칸, 단위 0.01 승률 로짓.
  // tools/gear-fit.js 로 220 파티 × 칸 × 장비 하나씩 (Lv4 · 스테이지 1 · 300런) 돌려 맞춘 값 (tools/gear-fit-make.js → tools/gear-val.json). 장비 효과를 바꾸면 다시 돌린다.
  var GV = {
    normal: {
      s: {
        arin: "0 4 -3 5 -2 -5 -1 2 5 5 -2 -1 14 5 6 10 -13 -10 0 0 -10",
        sera: "31 0 46 15 2 10 11 22 4 0 16 0 3 22 0 -9 -6 11 55 11 34",
        aria: "-2 6 9 7 -7 -3 -2 9 -9 10 16 -8 -18 7 -4 6 -11 -22 -10 8 -7",
        garen: "-16 3 -1 3 -5 -9 -5 4 -9 3 5 -6 10 1 1 2 -21 22 -13 -4 -22",
        mariel: "1 1 8 4 -3 0 0 5 -3 2 7 11 7 6 -2 16 -6 10 4 2 -3",
        leo: "-5 3 2 2 -2 -3 -5 4 -12 6 4 4 4 2 4 13 -17 27 -2 -2 -2",
        serena: "10 0 14 5 -7 -3 -4 10 -9 1 7 0 7 10 2 20 -30 24 12 -2 13",
        odette: "7 5 7 5 0 0 2 10 0 6 9 8 12 9 2 11 -9 14 7 1 2",
        noel: "-4 6 7 8 -2 -4 -6 4 -4 5 5 9 9 6 3 13 -4 10 2 -2 -7",
        lin: "-1 1 6 5 -5 -1 -2 4 -10 3 2 7 -4 6 2 19 -11 34 6 -1 0",
        arthur: "-18 -6 2 -1 2 -18 -17 2 -9 -3 5 3 -6 -1 -12 7 -27 7 -1 -15 -15",
        kael: "-9 3 5 4 5 -8 -4 4 3 8 5 12 17 10 0 16 -9 18 8 -7 -8",
      },
      n: {
        arin: "50 25 30 35 9 40 48 34 23 32 40 46 52 43 32 32 49 15 42 62 35",
        aria: "32 10 12 -5 10 46 29 13 -3 17 17 23 29 5 7 20 21 13 -16 79 28",
        garen: "107 14 27 19 4 20 6 36 -7 24 28 53 99 31 35 45 -30 98 7 40 76",
        mariel: "19 5 18 12 16 9 11 23 13 9 33 30 14 16 2 22 -9 39 19 30 25",
        leo: "54 37 37 32 9 57 42 31 15 47 35 40 29 48 25 17 53 -5 5 77 28",
        serena: "3 17 3 13 6 11 7 12 -1 31 22 26 28 17 17 17 12 -4 -17 33 -6",
        odette: "0 16 5 2 2 2 3 13 13 19 17 15 14 12 9 9 3 14 17 22 4",
        noel: "7 5 -3 -1 -2 -2 2 4 -1 11 17 23 19 1 6 16 3 20 -7 15 9",
        lin: "-2 28 7 15 1 9 12 11 7 35 46 17 18 24 27 26 20 7 -13 41 -18",
        arthur: "48 20 39 23 0 32 20 22 -9 31 25 54 61 32 37 65 11 46 12 43 22",
        kael: "48 14 51 27 -5 17 14 29 -11 26 35 44 83 38 21 48 3 93 16 35 36",
      },
    },
    hard: {
      s: {
        arin: "12 16 6 4 1 18 13 9 9 22 17 19 33 13 6 23 12 -5 9 24 -1",
        sera: "15 4 19 12 5 9 2 13 11 3 11 11 9 14 4 0 -30 2 34 9 13",
        aria: "-6 7 17 14 -2 1 -8 12 -5 8 14 9 9 14 7 15 -10 -18 12 6 -9",
        garen: "-12 11 6 7 1 -2 -10 6 0 11 7 12 12 10 11 0 -7 -12 -4 1 -25",
        mariel: "-2 6 10 4 2 -2 -6 8 -2 8 5 12 15 6 1 17 -5 -3 -11 2 -4",
        leo: "3 1 8 5 0 3 -2 5 -1 3 6 7 9 7 3 9 -15 -15 -5 7 -12",
        serena: "3 15 9 10 -2 0 -3 5 -7 17 8 3 9 14 11 -3 -7 -21 -5 3 -17",
        odette: "17 12 13 5 9 9 10 9 10 18 2 22 24 12 13 28 7 7 20 11 5",
        noel: "5 4 14 10 -3 2 1 14 2 8 13 13 6 14 9 14 -4 -5 9 5 -2",
        lin: "-5 4 2 4 -2 -3 -6 2 -4 6 3 -4 2 3 5 10 1 -13 -6 1 -11",
        arthur: "-1 23 11 20 -1 -3 -4 11 -3 26 12 16 16 23 9 -2 -5 -3 -4 0 -15",
        kael: "-4 7 3 2 -3 0 -3 -2 -3 11 2 10 10 5 7 15 -7 -7 -4 3 -19",
      },
      n: {
        arin: "49 27 21 33 8 24 5 37 31 32 36 42 48 33 21 37 32 36 54 54 41",
        aria: "2 -3 13 6 5 3 -2 10 -3 -11 26 2 8 5 5 15 7 -19 -23 32 11",
        garen: "33 14 59 42 -20 27 22 71 10 15 36 58 86 46 35 56 -26 89 52 33 61",
        mariel: "-18 4 -3 1 2 -13 -8 4 8 6 7 -10 -3 5 -9 -20 -18 -16 -14 -2 -3",
        leo: "31 34 2 16 -31 37 23 13 -37 52 12 -26 19 30 14 -1 -9 -27 -92 51 -6",
        serena: "42 5 22 12 0 42 24 14 -1 -3 42 17 51 10 26 44 -15 68 -3 59 42",
        odette: "-20 -3 2 0 -2 -3 0 0 12 4 4 -2 -3 0 -8 -10 -2 0 14 5 -13",
        noel: "8 6 7 9 6 -1 -6 6 6 7 21 12 6 0 2 5 -5 -2 3 20 13",
        lin: "-1 6 9 7 -2 9 5 13 2 8 44 7 3 9 7 -10 -22 -9 -19 43 8",
        arthur: "49 9 12 -2 -2 35 10 2 -11 11 5 40 47 2 17 18 -5 79 -8 44 50",
        kael: "20 10 16 14 -4 -6 -20 17 -3 10 18 5 62 14 2 14 -11 83 14 5 19",
      },
    },
  };
  var GV_N = {};   // 문자열 → 숫자 배열 (처음 쓸 때 한 번)
  function gvRow(diff, ctx, id) {
    var key = diff + ctx + id;
    if (!GV_N[key]) { var t = GV[diff] && GV[diff][ctx] && GV[diff][ctx][id]; GV_N[key] = t ? t.split(" ").map(Number) : GEAR_LIST.map(function () { return 0; }); }
    return GV_N[key];
  }
  var MIN_VAL = 3;   // 이보다 작은 값(0.03 로짓 ≈ 승률 1%p 미만)의 장비는 안 낀다 → 장비 없는 것보다 나빠지지 않게
  // 한 장비의 값: 그 동료 · 그 셋(세라 유무) · 그 난이도에서 승률을 얼마나 올리는지. 등급은 안 본다
  function gearScore(gid, id, party, ctx) {
    var diff = ctx && ctx.diff === "hard" ? "hard" : "normal", c = party.indexOf("sera") >= 0 ? "s" : "n";
    var i = GEAR_LIST.indexOf(gid); if (i < 0) return 0;
    var v = gvRow(diff, c, id)[i], u = ctx && ctx.up ? ctx.up[gid] | 0 : 0;
    return u && v > 0 ? Math.round(v * (1 + UP_STEP * u)) : v;   // 강화 +n = 좋은 효과 × (1 + 0.2n) → 값도 그만큼
  }
  // 장비 묶음 값 = 합 (로짓 더하기. 묶음 시뮬로 확인: docs/GEAR.md)
  function setValue(list, party, ctx) { return list.reduce(function (a, x) { return a + gearScore(x.g, x.id, party, ctx); }, 0); }
  function wearer(m, gid) { var eq = gearSave(m).eq; return Object.keys(eq).filter(function (id) { return eq[id] === gid; })[0] || null; }
  // 자동 장착: 파티 셋에 가진 장비 중 「값」(GV · setValue)이 가장 큰 묶음을 통째로 찾는다 (빈 칸 포함, 겹침 없음).
  // 직접 고른(잠금) 칸은 두고 값에만 넣는다. 값이 MIN_VAL 미만인 장비는 안 낀다 → 장비 없는 것보다 나빠지지 않게. 쉬는 동료가 낀 것도 가져온다.
  function autoEquip(m, party, opts) {
    var gs = gearSave(m), before = {}, ctx = { diff: opts && opts.diff, up: gs.up };
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
    UP_MAX: UP_MAX, UP_STEP: UP_STEP, CRAFT: CRAFT, upOf: upOf, fxOf: fxOf, upCost: upCost, shardsOf: shardsOf, addShards: addShards, canCraft: canCraft, craft: craft, canUpgrade: canUpgrade, upgrade: upgrade, runShards: runShards,
    ascSave: ascSave, ascOpen: ascOpen, ascWin: ascWin, TITLES: TITLES, ACH: ACH, checkAch: checkAch, titlesOf: titlesOf, recordRun: recordRun, dayKey: dayKey, dailyOf: dailyOf, dailyScore: dailyScore, dailyResult: dailyResult,
    REC: REC, recLevel: recLevel, recText: recText, avgLevel: avgLevel, recState: recState,
    GEAR: GEAR, GEAR_LIST: GEAR_LIST, GV: GV, setValue: setValue, ROLE: ROLE, ROLE_NAME: ROLE_NAME, gearOf: gearOf, gearScore: gearScore, stars: stars, autoEquip: autoEquip, equip: equip, dropGear: dropGear, grantUnique: grantUnique, wearer: wearer, DROP: DROP, RARITY: RARITY, rarity: rarity, whereText: whereText, SRC_TEXT: SRC_TEXT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FCBMeta = api;
})(this);
