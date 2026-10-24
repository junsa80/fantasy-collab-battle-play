/* 환상 콜라보 — 상시 명단·성장 저장 (docs/GROWTH.md). DOM 없음, node 시뮬 가능.
   저장 fcb-meta-v1 = { v:1, unlocked, party, xp, perks, bonds, relics }.
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
    return { v: 1, unlocked: STARTERS.slice(), party: STARTERS.slice(), xp: {}, perks: {}, bonds: {}, relics: [] };
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
  };
  // 동료별 갈림길 [Lv3 A, Lv3 B], [Lv6 A, Lv6 B] = [효과, 이름]
  var PICKS = {
    arin: { 3: [["wedge", "왕관 쐐기"], ["vanguard", "선봉의 새벽"]], 6: [["extend", "긴 새벽"], ["laststand", "무너진 왕관"]] },
    sera: { 3: [["power", "깊은 치유"], ["quick", "짧은 기도"]], 6: [["extend", "성역 연장"], ["inspire", "축복의 노래"]] },
    aria: { 3: [["longmark", "깊은 약점"], ["first", "선제 사냥"]], 6: [["ultpow", "완전 분쇄"], ["breath", "황금 방패"]] },
    garen: { 3: [["plate", "철벽"], ["breath", "방패 숨"]], 6: [["extend", "긴 맹세"], ["laststand", "최후의 방패"]] },
    mariel: { 3: [["quick", "빠른 패"], ["longmark", "긴 읽기"]], 6: [["ultpow", "마지막 패"], ["first", "선제 카드"]] },
    leo: { 3: [["power", "깊은 각인"], ["wedge", "획 끊기"]], 6: [["ultpow", "큰 한 획"], ["drain", "생명 룬"]] },
    serena: { 3: [["first", "첫 박자"], ["power", "보름달"]], 6: [["laststand", "새벽 직전"], ["drain", "달빛 흡수"]] },
    odette: { 3: [["longmark", "긴 각주"], ["inspire", "기록의 박자"]], 6: [["extend", "제18조"], ["vanguard", "미리 쓴 조항"]] },
    noel: { 3: [["inspire", "결산"], ["quick", "빠른 감사"]], 6: [["extend", "긴 장부"], ["plate", "두꺼운 장부"]] },
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
  function growthMap(m) {
    var out = null;
    (m.unlocked || []).forEach(function (id) {
      var st = stats(m, id);
      if (st.lv <= 1 && !st.perks.length) return;
      var pk = {}; st.perks.forEach(function (k) { pk[k] = 1; });
      out = out || {};
      out[id] = { lv: st.lv, hp: st.hp, atk: st.atk, perks: pk };
    });
    return out;
  }
  // 런 경험치: 지난 층 × 10 + 승리 20, 하드 ×1.5. 명단 전부, 명단 밖 해금 동료 30%
  function runXp(run) {
    var win = run.over === "win";
    var floors = win ? 6 : Math.max(0, Math.min(6, run.floor | 0));
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
    BOND_LV: BOND_LV, BOND_XP: BOND_XP, MIRROR_XP: MIRROR_XP, BONDS: BONDS, bondNext: bondNext, hearBond: hearBond, RELIC_LV: RELIC_LV, RELIC_OF: RELIC_OF, relicsOf: relicsOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FCBMeta = api;
})(this);
