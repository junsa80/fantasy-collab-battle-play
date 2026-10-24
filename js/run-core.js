/* 환상 콜라보 — 균열 런(방 선택 → 조우 → 전투) 규칙. DOM 없음, node 시뮬 가능.
   2026-10-24: 보관 실험판(rift.js "걸음의 균열")의 방·대사·우물·상자·조우 주사위·전술을 가볍게 옮겼다.
   자유 이동(출구 왕복)·걸음 수·영입·랭크 강화는 넣지 않는다 (HANDOFF "rift에서 뺀 것").
   전투는 arena-core(FCBCore) 그대로. 여기 수치는 FLOOR_PLAN / PACKS / BOONS / REST 만.
*/
(function (root) {
  "use strict";
  var C = root.FCBCore || (typeof require !== "undefined" ? require("./arena-core.js") : null);

  var SAVE_KEY = "fcb-run-v1";      // 새 키. rift(fcb-rift-v1)·설정(fcb-arena-settings-v1)은 건드리지 않음
  var FLOORS = 6;

  // rift.js ROOMS 에서 가져온 방 이름·한 줄 (가렌 대사 등 미등장 캐릭터 문장만 손봄)
  var ROOMS = {
    gate: { name: "현관", line: "균열 저편에서 발소리가 들린다." },
    servants: { name: "시종 방", line: "짧은 방. 급한 숨은 여기서 고른다." },
    banquet: { name: "연회 홀", line: "뒤집힌 잔 사이에 카드 한 장이 빛난다." },
    armory: { name: "무기고", line: "녹슨 창 사이로 그림자가 일어선다." },
    kitchen: { name: "주방", line: "우물은 이 방의 위험만 감수하면 모두를 일으킨다." },
    store: { name: "저장고", line: "룬 상자가 반쯤 열려 있다." },
    watch: { name: "감시탑", line: "깃발 아래, 장군은 이미 이쪽을 보고 있다." },
    terrace: { name: "테라스", line: "밤바람 너머로 셀레스가 길을 막고 있다." },
  };

  var KIND = {
    battle: { name: "전투", icon: "⚔️" },
    elite: { name: "강적", icon: "☠️" },
    rest: { name: "휴식", icon: "⛲" },
    treasure: { name: "보물", icon: "🎁" },
    event: { name: "균열", icon: "🎲" },
    boss: { name: "보스", icon: "👑" },
  };

  // 층별 적 무리 (적 수치는 arena-core ENEMY 그대로)
  var PACKS = {
    t1: [["shade", "shade"], ["wolf", "shade"]],
    t2: [["wolf", "wolf"], ["shade", "wolf"]],
    t3: [["wolf", "wolf"], ["shade", "shade"]],
    ambush: [["shade", "wolf"]],
    elite: [["shade", "shadow_general"]],
    boss: [["wolf", "celes"]],
  };
  // 층별 적 보정 (런이 길어질수록 단단해짐). 1.0 = 기본 아레나 수치
  var SCALE = {
    t1: { hp: 1.0, atk: 1.0 }, t2: { hp: 1.15, atk: 1.1 }, t3: { hp: 1.35, atk: 1.25 },
    ambush: { hp: 1.1, atk: 1.05 }, elite: { hp: 1.2, atk: 1.1 }, boss: { hp: 1.6, atk: 1.4 },
  };
  var BATTLE_ROOMS = ["servants", "banquet", "armory", "store"];

  // 층 설계: 층마다 고를 수 있는 칸 종류 (seed 로 방·무리만 섞는다). 마지막은 보스 고정.
  var FLOOR_PLAN = [
    { kinds: ["battle", "battle"], tier: "t1" },
    { kinds: ["battle", "event", "treasure"], tier: "t1" },
    { kinds: ["elite", "battle"], tier: "t2" },
    { kinds: ["rest", "treasure", "event"], tier: "t2" },
    { kinds: ["battle", "elite", "rest"], tier: "t3" },
    { kinds: ["boss"], tier: "boss" },
  ];

  // 보물·전술 (rift TACTICS "기합"·"수호"를 게이지 효과로 옮김. 피해 공식은 안 건드림)
  var BOONS = {
    rally: { name: "전술 · 기합", text: "공격·스킬 뒤 다른 아군 필살 게이지 +5", mod: true },
    guard: { name: "전술 · 수호", text: "방어할 때 필살 게이지 +15 더", mod: true },
    holy: { name: "성수", text: "전원 HP +35 · 쓰러진 아군도 일으킴" },
    dawn: { name: "새벽 조각", text: "전원 필살 게이지 +50" },
  };
  var REST = { heal: 0.5, gauge: 40 };          // 우물: 최대 HP 50% 회복(부활) / 명상: 게이지 +40
  // 전투 뒤: 쓰러진 아군 reviveHp 로 일어남 · 게이지는 keepGauge 만큼만 이어감 · 다음 전투 시작 +gaugeStart
  var AFTER = { reviveHp: 0.25, keepGauge: 0.5, gaugeStart: 10 };
  var EVENT = { chance: 50 };                    // 균열 주사위: 1–50 기습 전투, 51–100 보물

  function rng(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pickOf(r, list) { return list[Math.floor(r() * list.length)]; }

  function makeNode(r, kind, tier, used) {
    var n = { kind: kind };
    if (kind === "battle") {
      var rooms = BATTLE_ROOMS.filter(function (x) { return used.indexOf(x) < 0; });
      n.room = pickOf(r, rooms.length ? rooms : BATTLE_ROOMS);
      // 같은 층 두 전투 칸은 다른 무리로
      var packs = PACKS[tier].filter(function (pk) { return used.indexOf("pack:" + pk.join(",")) < 0; });
      n.pack = pickOf(r, packs.length ? packs : PACKS[tier]).slice(); n.tier = tier;
      used.push("pack:" + n.pack.join(","));
    } else if (kind === "elite") { n.room = "watch"; n.pack = PACKS.elite[0].slice(); n.tier = "elite"; }
    else if (kind === "boss") { n.room = "terrace"; n.pack = PACKS.boss[0].slice(); n.tier = "boss"; }
    else if (kind === "rest") n.room = "kitchen";
    else if (kind === "treasure") n.room = "store";
    else if (kind === "event") n.room = "banquet";
    used.push(n.room);
    return n;
  }

  function newRun(seed) {
    if (seed == null) seed = (Date.now() & 0x7fffffff);
    var r = rng(seed);
    var map = FLOOR_PLAN.map(function (f) {
      var used = [];
      var kinds = f.kinds.slice();
      // 칸 순서만 섞는다 (종류 구성은 고정 → 난이도 일정)
      for (var i = kinds.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t; }
      return kinds.map(function (k) { return makeNode(r, k, f.tier, used); });
    });
    var party = {};
    C.PARTY.forEach(function (id) { party[id] = { hp: C.CAST[id].hp, gauge: 0 }; });
    return {
      v: 1, seed: seed, floor: 0, map: map, path: [], party: party, boons: [], over: null,
      stats: { battles: 0, rounds: 0, maxHit: 0, ults: 0, breaks: 0 },
    };
  }

  function mods(run) {
    return { rally: run.boons.indexOf("rally") >= 0 ? 5 : 0, guardPlus: run.boons.indexOf("guard") >= 0 ? 15 : 0 };
  }

  function current(run) { return run.map[run.floor] || []; }

  // 전투 설정 (arena-core create 옵션)
  function battleConfig(run, node, seed) {
    var room = ROOMS[node.room] || ROOMS.gate;
    var carry = {};
    Object.keys(run.party).forEach(function (id) {
      var p = run.party[id];
      carry[id] = { hp: p.hp, gauge: Math.min(100, p.gauge + AFTER.gaugeStart) };
    });
    return {
      seed: seed,
      waves: [{ name: room.name, enemies: node.pack.slice(), line: room.line,
        hpMul: (SCALE[node.tier] || SCALE.t1).hp, atkMul: (SCALE[node.tier] || SCALE.t1).atk }],
      carry: carry,
      mods: mods(run),
    };
  }

  // 전투 결과 반영. 반환: "next" | "win" | "lose"
  function applyBattle(run, s, node) {
    run.stats.battles += 1;
    run.stats.rounds += s.round;
    run.stats.ults += s.stats.ults;
    run.stats.breaks += s.stats.breaks;
    run.stats.maxHit = Math.max(run.stats.maxHit, s.stats.maxHit);
    if (s.phase !== "win") { run.over = "lose"; return "lose"; }
    s.allies.forEach(function (u) {
      var hp = u.alive ? u.hp : Math.round(u.maxHp * AFTER.reviveHp);
      run.party[u.id] = { hp: Math.max(1, hp), gauge: u.alive ? Math.round(u.gauge * AFTER.keepGauge) : 0 };
    });
    if (node.kind === "boss") { run.over = "win"; return "win"; }
    return "next";
  }

  function maxHp(id) { return C.CAST[id].hp; }
  function healAll(run, frac, flat) {
    var out = {};
    Object.keys(run.party).forEach(function (id) {
      var p = run.party[id], m = maxHp(id);
      var before = p.hp;
      p.hp = Math.min(m, Math.max(p.hp, 0) + (flat || 0) + Math.round(m * (frac || 0)));
      out[id] = p.hp - before;
    });
    return out;
  }
  function addGauge(run, n) {
    Object.keys(run.party).forEach(function (id) { run.party[id].gauge = Math.min(100, run.party[id].gauge + n); });
  }
  function gainBoon(run, id) {
    var b = BOONS[id]; if (!b) return;
    if (id === "holy") healAll(run, 0, 35);
    else if (id === "dawn") addGauge(run, 50);
    else if (run.boons.indexOf(id) < 0) run.boons.push(id);
  }
  // 고를 수 있는 보물 2개 (이미 가진 전술 제외)
  function boonOffer(run, seed) {
    var r = rng(seed);
    var pool = Object.keys(BOONS).filter(function (id) { return !BOONS[id].mod || run.boons.indexOf(id) < 0; });
    var a = pickOf(r, pool);
    var rest = pool.filter(function (x) { return x !== a; });
    return [a, pickOf(r, rest)];
  }
  function rollEvent(seed) {
    var die = 1 + Math.floor(rng(seed)() * 100);
    return { die: die, ambush: die <= EVENT.chance };
  }

  function choose(run, idx) {
    var node = current(run)[idx];
    if (!node || run.over) return null;
    run.path[run.floor] = idx;
    return node;
  }
  function advance(run) {
    run.floor += 1;
    if (run.floor >= FLOORS) run.over = run.over || "win";
  }

  function partySummary(run) {
    return C.PARTY.map(function (id) {
      var p = run.party[id];
      return { id: id, name: C.CAST[id].name, hp: p.hp, maxHp: maxHp(id), gauge: p.gauge };
    });
  }

  function validRun(o) {
    return !!(o && o.v === 1 && Array.isArray(o.map) && o.map.length === FLOORS && o.party && typeof o.floor === "number" && !o.over);
  }

  var api = {
    SAVE_KEY: SAVE_KEY, FLOORS: FLOORS, ROOMS: ROOMS, KIND: KIND, PACKS: PACKS, FLOOR_PLAN: FLOOR_PLAN,
    SCALE: SCALE, BOONS: BOONS, REST: REST, AFTER: AFTER, EVENT: EVENT,
    newRun: newRun, current: current, battleConfig: battleConfig, applyBattle: applyBattle,
    healAll: healAll, addGauge: addGauge, gainBoon: gainBoon, boonOffer: boonOffer, rollEvent: rollEvent,
    choose: choose, advance: advance, partySummary: partySummary, validRun: validRun, mods: mods,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FCBRun = api;
})(this);
