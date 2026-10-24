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

  var api = { KEY: KEY, STARTERS: STARTERS, ORDER: ORDER, fresh: fresh, normalize: normalize, unlock: unlock, migrate: migrate, validParty: validParty, defaultParty: defaultParty };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FCBMeta = api;
})(this);
