/* 환상 콜라보 — 균열 런(방 선택 → 조우 → 전투) 규칙. DOM 없음, node 시뮬 가능.
   2026-10-24: 보관 실험판(rift.js "걸음의 균열")의 방·대사·우물·상자·조우 주사위·전술을 가볍게 옮겼다.
   자유 이동(출구 왕복)·걸음 수·영입·랭크 강화는 넣지 않는다 (HANDOFF "rift에서 뺀 것").
   전투는 arena-core(FCBCore) 그대로. 여기 수치는 FLOOR_PLAN / PACKS / BOONS / REST 만.
*/
(function (root) {
  "use strict";
  var C = root.FCBCore || (typeof require !== "undefined" ? require("./arena-core.js") : null);

  var SAVE_KEY = "fcb-run-v2";      // 새 키. rift(fcb-rift-v1)·설정(fcb-arena-settings-v1)은 건드리지 않음
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
    meet: { name: "만남", icon: "✦" },
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
    { kinds: ["battle", "event", "meet:mariel"], tier: "t1" },
    { kinds: ["elite", "battle"], tier: "t2" },
    { kinds: ["rest", "meet:garen", "event"], tier: "t2" },
    { kinds: ["battle", "elite", "meet:leo"], tier: "t3" },
    { kinds: ["boss"], tier: "boss" },
  ];
  var FLOOR_LINE = [
    "현관. 세 세계가 같은 바닥에 떨어졌다.",
    "짧은 복도, 빈 잔, 녹슨 창. 세 세계의 잔해다.",
    "장군의 깃발. 옛 명이 아직 살아 있다.",
    "우물과 주사위. 쉼에도 값이 있다.",
    "마지막 문 직전. 숨이 남은 사람만 올라간다.",
    "셀레스가 문을 얼렸다. 여기가 출구다.",
  ];
  var MEET = {
    mariel: {
      room: "banquet",
      open: [
        ["마리엘", "카드가 먼저 왔다. 나는 마리엘. 이 잔은 내 덱의 것이 아니다."],
        ["아린", "왕관의 아린이다. 문을 같이 열 셈인가."],
        ["마리엘", "같이 열면, 누구를 남기는지는 네가 정한다."],
        ["아리아", "사냥터에도 패를 읽는 자가 있다. 너는 그걸 무기로 쓰나."],
        ["마리엘", "쓴다. 이 저택은 이름을 둘만 더 받는다."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["마리엘", "카드는 남겨 둔다. 이름은 이미 둘이다."]],
    },
    garen: {
      room: "armory",
      arin: [
        ["아린", "가렌. 방패가 여기 있을 줄은 몰랐다."],
        ["가렌", "폐하. 방패는 저쪽에 두고 왔소. 사람은 왔습니다."],
        ["세라", "숨은 고르셨습니까. 성역은 이 물에 닿지 않습니다."],
        ["가렌", "알아요. 그래도 앞은 내가 막겠소."],
      ],
      sera: [
        ["세라", "가렌. 폐하의 방패가 왜 녹슨 창 사이에 있나."],
        ["가렌", "성문이 사람을 먼저 삼켰습니다. 폐하는 현관에 계시오?"],
        ["세라", "계시다. 지금은 뒤를 보고 계신다."],
        ["가렌", "그럼 내가 앞에 서겠소."],
      ],
      none: [
        ["아리아", "왕관 문장이다. 넌 누구냐."],
        ["가렌", "가렌. 아린 폐하의 방패였소. 그분이 이 저택에 있소?"],
        ["아리아", "있다. 쉬고 있다. 자리는 하나다."],
        ["가렌", "하나면 충분하오."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["가렌", "방패는 여기 두겠소. 나는 다음 문에서."]],
    },
    leo: {
      room: "store",
      open: [
        ["레오", "상자는 내 글자다. 나는 레오. 룬 영토에서 떨어졌다."],
        ["세라", "성역의 세라다. 그 글자는 치유의 문자가 아니다."],
        ["레오", "아니다. 베는 문자다. 자리가 있으면 베고, 없으면 상자를 닫겠다."],
        ["아리아", "자리는 싸움이다. 쉬는 한 명을 네가 대신한다."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["레오", "글자는 남는다. 사람은 다음 칸이다."]],
    },
  };

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
    if (kind.indexOf("meet:") === 0) {
      var who = kind.slice(5);
      var n = { kind: "meet", who: who, room: MEET[who].room };
      used.push(n.room);
      return n;
    }
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
    var active = C.PARTY.slice();
    var party = {};
    active.forEach(function (id) { party[id] = { hp: C.CAST[id].hp, gauge: 0 }; });
    return {
      v: 2, seed: seed, floor: 0, map: map, path: [], party: party,
      active: active, roster: active.slice(), recruited: [],
      boons: [], over: null,
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
    var ids = run.active && run.active.length === 3 ? run.active : C.PARTY.slice();
    var carry = {};
    ids.forEach(function (id) {
      var p = run.party[id];
      carry[id] = { hp: p.hp, gauge: Math.min(100, p.gauge + AFTER.gaugeStart) };
    });
    return {
      seed: seed,
      party: ids,
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
    var ids = run.active && run.active.length === 3 ? run.active : C.PARTY;
    return ids.map(function (id) {
      var p = run.party[id];
      return { id: id, name: C.CAST[id].name, hp: p.hp, maxHp: maxHp(id), gauge: p.gauge };
    });
  }
  function meetScript(run, who) {
    var m = MEET[who];
    if (!m) return [];
    if (run.recruited.length >= 2) return m.full;
    if (who !== "garen") return m.open;
    if (run.active.indexOf("arin") >= 0) return m.arin;
    if (run.active.indexOf("sera") >= 0) return m.sera;
    return m.none;
  }
  function recruit(run, who, benchId) {
    if (!MEET[who] || run.recruited.length >= 2) return null;
    if (run.roster.indexOf(who) >= 0) return null;
    if (run.active.indexOf(benchId) < 0) return null;
    run.roster.push(who);
    run.recruited.push(who);
    run.party[who] = { hp: C.CAST[who].hp, gauge: 0 };
    run.active[run.active.indexOf(benchId)] = who;
    return C.CAST[who].name + "이 앞에 선다. " + C.CAST[benchId].name + "은 우물에서 쉰다.";
  }
  function setActive(run, ids) {
    if (!ids || ids.length !== 3) return false;
    var seen = {};
    for (var i = 0; i < 3; i++) {
      if (run.roster.indexOf(ids[i]) < 0 || seen[ids[i]]) return false;
      seen[ids[i]] = 1;
    }
    run.active = ids.slice();
    return true;
  }
  function mapLine(run) {
    var a = run.active || [];
    var both = function (x, y) { return a.indexOf(x) >= 0 && a.indexOf(y) >= 0; };
    if (run.floor === 1 && both("arin", "sera")) return "세라: 폐하, 성문 깃발은 아직 저쪽입니다. 아린: 알아. 오늘은 우리가 먼저다.";
    if (run.floor === 2 && both("arin", "aria")) return "아리아: 왕관은 사람을 이렇게 데리고 다니나. 아린: 데리고 다닌 게 아니다. 같이 떨어졌다.";
    if (run.floor === 5 && both("arin", "garen")) return "가렌: 얼음은 방패가 먼저 받겠소. 아린: 나란히다. 뒤에 서지 마라.";
    var line = FLOOR_LINE[run.floor] || "다음 문을 고르세요.";
    if (run.floor === 0) return line + " 문은 " + current(run).length + "개. 하나만 열 수 있다.";
    return line;
  }
  function eliteLine(run) {
    if (run.active && run.active.indexOf("arin") >= 0) return "아린: 장군은 내 명을 듣던 자다. 그 명은 이미 더럽혀졌다.";
    return ROOMS.watch.line;
  }

  function validRun(o) {
    return !!(o && o.v === 2 && Array.isArray(o.map) && o.map.length === FLOORS && o.party && Array.isArray(o.active) && o.active.length === 3 && typeof o.floor === "number" && !o.over);
  }

  var api = {
    SAVE_KEY: SAVE_KEY, FLOORS: FLOORS, ROOMS: ROOMS, KIND: KIND, PACKS: PACKS, FLOOR_PLAN: FLOOR_PLAN,
    SCALE: SCALE, BOONS: BOONS, REST: REST, AFTER: AFTER, EVENT: EVENT,
    newRun: newRun, current: current, battleConfig: battleConfig, applyBattle: applyBattle,
    healAll: healAll, addGauge: addGauge, gainBoon: gainBoon, boonOffer: boonOffer, rollEvent: rollEvent,
    choose: choose, advance: advance, partySummary: partySummary, validRun: validRun, mods: mods, meetScript: meetScript, recruit: recruit, setActive: setActive, mapLine: mapLine, eliteLine: eliteLine,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FCBRun = api;
})(this);
