/* 환상 콜라보 배틀 — 균열 아레나 전투 엔진 (DOM 없음, node 시뮬 가능)
   파티: 아린·세라(잿빛 왕관) · 아리아(헌트 나우)
   웨이브: 그림자 장군(+그림자 병사) → 셀레스(+서리 늑대)
   수치는 CAST / ENEMY / GAUGE 에만. 밸런스: node tools/sim.js (필살·스킬 쓰면 승, 기본기만이면 패)
   2026-10-24 1패스: 적 atk 병사24 장군30 늑대24 셀레스33, hp 장군260 셀레스320, 게이지 15/12/20.
   결과 이벤트는 UI가 순서대로 재생한다.
   2026-10-24 런 맵: create({ waves, carry, mods }) 로 방 하나짜리 전투를 만든다(js/run-core.js).
     waves 없으면 기존 2웨이브 아레나. carry = { arin:{hp,gauge}, ... } 이전 전투의 HP·게이지 이어받기.
     mods.rally = 공격·스킬 뒤 다른 아군 게이지 +N, mods.guardPlus = 방어 게이지 +N (보물·전술. 피해 공식은 그대로)
*/
(function (root) {
  "use strict";

  var ORIGINS = {
    ashen: { name: "잿빛 왕관", color: "#e4b547", tint: "#1b2a4a" },
    hunt: { name: "헌트 나우", color: "#7fd36b", tint: "#3a2412" },
    deck: { name: "미녀 덱", color: "#d46b8c", tint: "#2a1420" },
    rune: { name: "룬 영토", color: "#8fbf6a", tint: "#142414" },
  };

  // kind: hit | mark | heal | dawn | sanctum | crush
  var CAST = {
    arin: {
      id: "arin", name: "아린", title: "새벽의 군주", origin: "ashen", hp: 120, atk: 18,
      color: "#e4b547", img: "img/arin.png", pixel: true,
      actions: {
        attack: { name: "검격", kind: "hit", pow: 1.0, desc: "단일 피해" },
        skill: { name: "왕관 일섬", kind: "hit", pow: 1.6, cd: 2, breakMul: 1.5, desc: "강타 · 브레이크 ×1.5 · 2턴" },
        ult: { name: "새벽의 서약", kind: "dawn", pow: 1.8, buff: 1.3, turns: 3,
          desc: "아군 공격 ×1.3(3턴) + 일격", voice: "새벽의 서약으로… 함께 나아가자!",
          fx: "dawn", colors: ["#fff4c2", "#e4b547", "#1b2a4a"] },
      },
    },
    sera: {
      id: "sera", name: "세라", title: "성역의 사제", origin: "ashen", hp: 100, atk: 12,
      color: "#7fe0d0", img: "img/sera.png", pixel: true,
      actions: {
        attack: { name: "성광 지팡이", kind: "hit", pow: 0.85, desc: "약한 단일 피해" },
        skill: { name: "치유의 빛", kind: "heal", pow: 40, cd: 2, desc: "가장 다친 아군 +40 · 2턴" },
        ult: { name: "성역의 손길", kind: "sanctum", pow: 50, revive: 0.4, guard: 0.7,
          desc: "전원 +50 · 정화 · 부활 · 피해 -30%", voice: "성역이여, 상처를 감싸 주소서.",
          fx: "sanctum", colors: ["#ffffff", "#7fe0d0", "#14303a"] },
      },
    },
    aria: {
      id: "aria", name: "아리아", title: "황금 방패 헌터", origin: "hunt", hp: 108, atk: 22,
      color: "#f39a3c", img: "img/aria.webp", cut: "img/aria_full.webp",
      actions: {
        attack: { name: "대검 베기", kind: "hit", pow: 1.05, desc: "단일 피해" },
        skill: { name: "약점 간파", kind: "mark", pow: 0.6, cd: 3, turns: 3,
          desc: "약점 표시: 받는 피해 +30%, 브레이크 ×2 · 3턴" },
        ult: { name: "부위 분쇄", kind: "crush", pow: 2.4, markMul: 1.5,
          desc: "초강타 · 약점 ×1.5 · 충전 즉시 파괴", voice: "약점 확인… 분쇄!",
          fx: "crush", colors: ["#ffe2a8", "#f39a3c", "#3a2412"] },
      },
    },
    garen: {
      id: "garen", name: "가렌", title: "왕관의 방패", origin: "ashen", hp: 136, atk: 16,
      color: "#c9d2df", img: "img/garen.webp",
      actions: {
        attack: { name: "방패 강타", kind: "hit", pow: 1.0, desc: "단일 피해" },
        skill: { name: "밀어내기", kind: "hit", pow: 1.2, cd: 2, desc: "단일 강타 · 2턴" },
        ult: { name: "방패의 맹세", kind: "dawn", pow: 1.4, buff: 1.2, turns: 2,
          desc: "아군 공격 ×1.2(2턴) + 일격", voice: "폐하는 내가 막는다.",
          fx: "dawn", colors: ["#e8eef5", "#c9d2df", "#1b2a4a"] },
      },
    },
    mariel: {
      id: "mariel", name: "마리엘", title: "덱의 독자", origin: "deck", hp: 98, atk: 16,
      color: "#d46b8c", img: "img/mariel.webp",
      actions: {
        attack: { name: "카드 베기", kind: "hit", pow: 0.9, desc: "단일 피해" },
        skill: { name: "패 읽기", kind: "mark", pow: 0.45, cd: 3, turns: 2, desc: "약점 표시 2턴 · 3턴" },
        ult: { name: "결정타", kind: "hit", pow: 2.1, desc: "강타", voice: "이 패로 끝낸다.",
          fx: "crush", colors: ["#ffd0de", "#d46b8c", "#2a1420"] },
      },
    },
    leo: {
      id: "leo", name: "레오", title: "룬의 서기", origin: "rune", hp: 110, atk: 19,
      color: "#8fbf6a", img: "img/leo.webp",
      actions: {
        attack: { name: "룬 새김", kind: "hit", pow: 1.0, desc: "단일 피해" },
        skill: { name: "각인", kind: "hit", pow: 1.45, cd: 2, desc: "단일 강타 · 2턴" },
        ult: { name: "불칸의 한 획", kind: "hit", pow: 2.2, desc: "강타", voice: "이 칸은 이제 내 것이다.",
          fx: "dawn", colors: ["#e4f5c8", "#8fbf6a", "#142414"] },
      },
    },
    // 스테이지 2 뒤집힌 홀 (docs/stage-2.md). 초상은 beauty-deck 재사용
    serena: {
      id: "serena", name: "세레나", title: "월무검사", origin: "deck", hp: 104, atk: 18,
      color: "#b9c6ff", img: "img/serena.webp",
      actions: {
        attack: { name: "초승 베기", kind: "hit", pow: 1.0, desc: "단일 피해" },
        skill: { name: "보름 일섬", kind: "hit", pow: 1.5, cd: 2, desc: "단일 강타 · 2턴" },
        ult: { name: "닉스의 마지막 곡", kind: "hit", pow: 2.3, desc: "강타", voice: "이 곡은, 아침에 끝나요.",
          fx: "crush", colors: ["#eef2ff", "#b9c6ff", "#1a2050"] },
      },
    },
    odette: {
      id: "odette", name: "오데트", title: "기록관", origin: "deck", hp: 96, atk: 15,
      color: "#e0b46a", img: "img/odette.webp",
      actions: {
        attack: { name: "펜촉 찌르기", kind: "hit", pow: 0.9, desc: "단일 피해" },
        skill: { name: "각주 달기", kind: "mark", pow: 0.4, cd: 3, turns: 2, desc: "약점 표시 2턴 · 3턴" },
        ult: { name: "제17조", kind: "dawn", pow: 1.3, buff: 1.2, turns: 2,
          desc: "아군 공격 ×1.2(2턴) + 일격", voice: "제17조. 이 밤은 여기서 끝난다.",
          fx: "dawn", colors: ["#fff1d6", "#e0b46a", "#3a2614"] },
      },
    },
    // 스테이지 3 룬 밭 (docs/stage-3.md). 초상은 rune-territories 재사용
    noel: {
      id: "noel", name: "노엘", title: "감사", origin: "rune", hp: 112, atk: 15,
      color: "#6f8fb8", img: "img/noel.webp",
      actions: {
        attack: { name: "장부 치기", kind: "hit", pow: 1.0, desc: "단일 피해" },
        skill: { name: "감사 표시", kind: "mark", pow: 0.45, cd: 3, turns: 2, desc: "약점 표시 2턴 · 3턴" },
        ult: { name: "닫힌 장부", kind: "dawn", pow: 1.3, buff: 1.25, turns: 2,
          desc: "아군 공격 ×1.25(2턴) + 일격", voice: "장부는 닫혔다. 이제 받을 차례다.",
          fx: "dawn", colors: ["#e6eef8", "#6f8fb8", "#14203a"] },
      },
    },
    lin: {
      id: "lin", name: "린", title: "측량사", origin: "rune", hp: 100, atk: 19,
      color: "#a8c070", img: "img/lin.webp",
      actions: {
        attack: { name: "측량봉", kind: "hit", pow: 1.0, desc: "단일 피해" },
        skill: { name: "눈금 찌르기", kind: "hit", pow: 1.5, cd: 2, desc: "단일 강타 · 2턴" },
        ult: { name: "이름 없는 칸", kind: "hit", pow: 2.2, desc: "강타", voice: "이 칸의 이름은, 내가 잰다.",
          fx: "crush", colors: ["#f0f6dc", "#a8c070", "#1f2a12"] },
      },
    },
    // 스테이지 4 성문 잔해 (docs/stage-4.md). 초상은 srpg-prototype 픽셀 초상 재사용
    arthur: {
      id: "arthur", name: "아서", title: "성기사", origin: "ashen", hp: 118, atk: 18,
      color: "#d8c27a", img: "img/arthur.png", pixel: true,
      actions: {
        attack: { name: "기사검", kind: "hit", pow: 1.0, desc: "단일 피해" },
        skill: { name: "길잡이 일격", kind: "hit", pow: 1.4, cd: 2, desc: "단일 강타 · 2턴" },
        ult: { name: "왕성의 길", kind: "dawn", pow: 1.4, buff: 1.2, turns: 2,
          desc: "아군 공격 ×1.2(2턴) + 일격", voice: "길은 내가 안다. 따라와!",
          fx: "dawn", colors: ["#fff6d8", "#d8c27a", "#2a2412"] },
      },
    },
    kael: {
      id: "kael", name: "카엘", title: "아머나이트", origin: "ashen", hp: 120, atk: 15,
      color: "#7f9cc8", img: "img/kael.png", pixel: true,
      actions: {
        attack: { name: "창 찌르기", kind: "hit", pow: 1.0, desc: "단일 피해" },
        skill: { name: "하르트만의 장부", kind: "mark", pow: 0.45, cd: 3, turns: 2, desc: "약점 표시 2턴 · 3턴" },
        ult: { name: "무너지지 않는 창", kind: "hit", pow: 2.0, desc: "강타", voice: "하르트만은 아직 무너지지 않았다.",
          fx: "crush", colors: ["#e6eef8", "#7f9cc8", "#141e30"] },
      },
    },
  };

  var ENEMY = {
    shade: { id: "shade", name: "그림자 병사", origin: "ashen", hp: 70, atk: 24, img: "img/shade.png", pixel: true, ai: "grunt" },
    shadow_general: { id: "shadow_general", name: "그림자 장군", origin: "ashen", hp: 260, atk: 30, img: "img/shadow_general.png", pixel: true, ai: "general", boss: true, breakNeed: 45 },
    wolf: { id: "wolf", name: "서리 늑대", origin: "hunt", hp: 80, atk: 24, img: "img/wolf.webp", ai: "wolf" },
    celes: { id: "celes", name: "셀레스", title: "얼음 마녀", origin: "hunt", hp: 320, atk: 33, img: "img/celes.webp", ai: "celes", boss: true, breakNeed: 60 },
    // 스테이지 2 (beauty-deck 그림 재사용). 수치·AI는 스테이지 1 짝과 같다. moves = 기술 이름만
    puppet: { id: "puppet", name: "꼭두각시 인형", origin: "deck", hp: 70, atk: 24, img: "img/puppet.webp", ai: "grunt", moves: { hit: "실 당기기" } },
    bat: { id: "bat", name: "흡혈 박쥐", origin: "deck", hp: 80, atk: 24, img: "img/bat.webp", ai: "wolf", moves: { hit: "흡혈 이빨" } },
    gargoyle: { id: "gargoyle", name: "가고일", origin: "deck", hp: 260, atk: 30, img: "img/gargoyle.webp", ai: "general", boss: true, breakNeed: 45,
      moves: { hit: "석조 발톱", charge: "석상의 포효", voice: "성벽이… 깨어난다." } },
    knox: { id: "knox", name: "녹스", title: "해골 기사", origin: "deck", hp: 320, atk: 33, img: "img/knox.webp", ai: "celes", boss: true, breakNeed: 60,
      moves: { hit: "녹슨 대검", pillar: "성문 내리치기", charge: "여왕의 경계령", voice: "성문은 닫혔다. 여왕의 경계령.", frost: "결박", enrage: "근무는 끝나지 않는다. — 기사의 예고" } },
  };
  // 스테이지 3 (rune-territories 카드 그림 재사용). 수치·AI는 스테이지 1 짝과 같다
  ENEMY.moss_turtle = { id: "moss_turtle", name: "이끼거북", origin: "rune", hp: 70, atk: 24, img: "img/moss_turtle.webp", ai: "grunt", moves: { hit: "등껍질 박치기" } };
  ENEMY.ember_fox = { id: "ember_fox", name: "불꽃여우", origin: "rune", hp: 80, atk: 24, img: "img/ember_fox.webp", ai: "wolf", moves: { hit: "불꽃 이빨" } };
  ENEMY.gate_breaker = { id: "gate_breaker", name: "관문 파괴자", origin: "rune", hp: 260, atk: 30, img: "img/gate_breaker.webp", ai: "general", boss: true, breakNeed: 45,
    moves: { hit: "파성 망치", charge: "관문 부수기", voice: "닫힌 칸은… 부수면 열린다." } };
  ENEMY.tempest_giant = { id: "tempest_giant", name: "폭풍 거인", origin: "rune", hp: 320, atk: 33, img: "img/tempest_giant.webp", ai: "celes", boss: true, breakNeed: 60,
    moves: { hit: "번개 주먹", pillar: "낙뢰", charge: "폭풍 부르기", voice: "폭풍이 칸을 지운다.", frost: "감전", enrage: "하늘이 칸을 다시 긋는다. — 거인의 예고" } };
  // 스테이지 4 (srpg-prototype 초상 재사용). 수치·AI는 스테이지 1 짝과 같다. 그림자 병사는 기존 shade 그대로
  ENEMY.shadow_spear = { id: "shadow_spear", name: "그림자 창병", origin: "ashen", hp: 80, atk: 24, img: "img/shadow_spear.png", pixel: true, ai: "wolf", moves: { hit: "그림자 창" } };
  ENEMY.shadow_knight = { id: "shadow_knight", name: "그림자 기사", origin: "ashen", hp: 260, atk: 30, img: "img/shadow_knight.png", pixel: true, ai: "general", boss: true, breakNeed: 45,
    moves: { hit: "흑기사 참격", charge: "그림자 돌격", voice: "누각은… 그림자의 것이다." } };
  ENEMY.gatekeeper = { id: "gatekeeper", name: "요새 문지기", origin: "ashen", hp: 320, atk: 33, img: "img/gatekeeper.png", pixel: true, ai: "celes", boss: true, breakNeed: 60,
    moves: { hit: "철문 방패", pillar: "성문 낙하", charge: "성문 봉쇄", voice: "이 문은 닫힌다. 성문 봉쇄.", frost: "속박", enrage: "열쇠는 없다. — 문지기의 예고" } };
  // 스테이지 5 보스 (rune-territories 아르 그림 재사용). 수치·AI는 셀레스와 같다
  ENEMY.ar = { id: "ar", name: "아르", title: "룬 마도사", origin: "rune", hp: 320, atk: 33, img: "img/ar.webp", ai: "celes", boss: true, breakNeed: 60,
    moves: { hit: "룬 화살", pillar: "카드 낙인", charge: "균열 포식", voice: "균열이여, 방을 삼켜라. 균열 포식.", frost: "봉인", enrage: "마지막 패는 내가 쥔다. — 아르의 예고" } };
  // 강적 변종 (docs/GROWTH.md ③): 그 스테이지를 한 번 깨면 3층 강적이 바뀐다. 수치·AI는 그 강적과 같다(general 260/30, 브레이크 45). 그림은 있는 것
  ENEMY.alpha_wolf = { id: "alpha_wolf", name: "서리 늑대 우두머리", origin: "hunt", hp: 260, atk: 30, img: "img/wolf.webp", ai: "general", boss: true, breakNeed: 45, variant: true,
    moves: { hit: "우두머리 송곳니", charge: "무리 부르기", voice: "무리는 셋이었다. 이제 하나 남았다." } };
  ENEMY.bat_lord = { id: "bat_lord", name: "흡혈 박쥐 군주", origin: "deck", hp: 260, atk: 30, img: "img/bat.webp", ai: "general", boss: true, breakNeed: 45, variant: true,
    moves: { hit: "핏빛 날개", charge: "박쥐 떼", voice: "거꾸로 매달린 건 너희다." } };
  ENEMY.fox_elder = { id: "fox_elder", name: "불꽃여우 장로", origin: "rune", hp: 260, atk: 30, img: "img/ember_fox.webp", ai: "general", boss: true, breakNeed: 45, variant: true,
    moves: { hit: "여우불", charge: "불꽃 고리", voice: "칸 하나 태우는 데 꼬리 하나면 된다." } };
  ENEMY.spear_captain = { id: "spear_captain", name: "그림자 창병 대장", origin: "ashen", hp: 260, atk: 30, img: "img/shadow_spear.png", pixel: true, ai: "general", boss: true, breakNeed: 45, variant: true,
    moves: { hit: "대장의 창", charge: "창벽 돌격", voice: "누각은 넘겼다. 창은 넘기지 않는다." } };
  ENEMY.knox_guard = { id: "knox_guard", name: "녹스 — 저택 경비", origin: "deck", hp: 260, atk: 30, img: "img/knox.webp", ai: "general", boss: true, breakNeed: 45, variant: true,
    moves: { hit: "녹슨 대검", charge: "마지막 근무", voice: "여왕의 성문은 닫혔다. 그래서 여기서 근무한다." } };
  function mv(e, key, def) { var m = ENEMY[e.id].moves; return (m && m[key]) || def; }

  var WAVES = [
    { name: "잿빛 성문", enemies: ["shade", "shadow_general"], line: "그림자가… 명을 따른다." },
    { name: "서리의 사냥터", enemies: ["wolf", "celes"], line: "사냥꾼이 사냥당할 차례다." },
  ];
  var PARTY = ["arin", "sera", "aria"];

  // 동료 조합 (docs/SYNERGY.md). 시작 셋만으로는 하나도 켜지지 않는다
  var MARKERS = ["aria", "mariel", "odette", "noel", "kael"], FINISHERS = ["leo", "serena", "lin"];
  // FCB-SYN-02: 생명의 칸 보스전 룬 방패 (고정 흡수량). 15 는 승천 6 아리아·레오·린 56% (기준 45 초과) → 10
  var WARD_LIFERUNE = 10;
  function has(ids, id) { return ids.indexOf(id) >= 0; }
  function cnt(ids, list) { return ids.filter(function (id) { return has(list, id); }).length; }
  function ofOrigin(ids, o) { return ids.filter(function (id) { return CAST[id] && CAST[id].origin === o; }); }
  var SYN = [
    { id: "knights", name: "왕관 기사단", desc: "잿빛 왕관 아군 방어 → 다른 아군 게이지 +8", line: "가렌: 깃발 아래 다시 섰소. 방패는 혼자 들지 않소.",
      need: function (ids) { return ofOrigin(ids, "ashen").length >= 2 && cnt(ids, ["garen", "arthur", "kael"]) >= 1; } },
    { id: "stage", name: "미녀 덱 무대", desc: "필살기 → 다른 아군 게이지 +10 · 전원 HP 8%", line: "세레나: 무대가 뒤집혀도 박자는 그대로예요.",
      need: function (ids) { return cnt(ids, ["mariel", "serena", "odette"]) >= 2; } },
    { id: "survey", name: "룬 측량", desc: "전투 시작 적 전원 약점 표시", line: "린: 재 봤어. 약한 데는 여기.",
      need: function (ids) { return cnt(ids, ["leo", "noel", "lin"]) >= 2; } },
    { id: "finisher", name: "표식과 결정타", desc: "표시된 적에게 마무리 동료 피해 ×1.2", line: "레오: 표시된 칸에 긋는다. 한 번이면 된다.",
      need: function (ids) { return cnt(ids, MARKERS) >= 1 && cnt(ids, FINISHERS) >= 1; } },
    { id: "shield", name: "방패와 성역", desc: "방어 피해 60% 감소 · 세라 치유 +10", line: "세라: 앞에 서 주시면, 제가 뒤에서 일으킬게요.",
      need: function (ids) { return has(ids, "sera") && (has(ids, "garen") || has(ids, "kael")); } },
    { id: "ledgers", name: "두 권의 장부", desc: "노엘·카엘 표시 +1턴 · 표시하면 게이지 +15", line: "카엘: 장부는 둘이 맞춰 봐야 틀린 데가 보인다.",
      need: function (ids) { return has(ids, "noel") && has(ids, "kael"); } },
    { id: "banquet", name: "연회의 패", desc: "마리엘 표시 +1턴 · 아린 게이지 +20", line: "마리엘: 연회장에서 본 패다. 이번엔 네 편으로 읽는다.",
      need: function (ids) { return has(ids, "arin") && has(ids, "mariel"); } },
    { id: "side", name: "나란히", desc: "아린·가렌 브레이크 → 전원 게이지 +15", line: "아린: 나란히다. 뒤에 서지 마라.",
      need: function (ids) { return has(ids, "arin") && has(ids, "garen"); } },
    { id: "clause", name: "조항과 장부", desc: "약점 피해 ×1.4 · 표시된 적 공격 −15%", line: "노엘: 조항대로, 장부대로. 깎을 데를 깎는다.",
      need: function (ids) { return has(ids, "odette") && has(ids, "noel"); } },
  ];
  SYN.push(
    { id: "bandage", name: "군영의 붕대", desc: "세라 없이 · 매 라운드 끝 최저 HP 아군 +14%", line: "아서: 붕대는 내가 감는다. 방패는 내려놓지 마라.",
      need: function (ids) { return !has(ids, "sera") && cnt(ids, ["garen", "arthur", "kael"]) >= 2; } },
    { id: "liferune", name: "생명의 칸", desc: "세라 없이 · 레오 필살 → 전원 +15% · 첫 회 부활 · 보스전 룬 방패 10", line: "레오: 칸에 이름을 새기면, 그 사람은 다시 선다.",
      need: function (ids) { return !has(ids, "sera") && has(ids, "leo") && (has(ids, "noel") || has(ids, "lin")); } },
    { id: "decree", name: "왕의 조항", desc: "두 서약 버프가 겹친다 · 필살 → 서로 게이지 +30", line: "오데트: 폐하의 서약 아래, 제17조를 읽겠습니다.",
      need: function (ids) { return has(ids, "arin") && has(ids, "odette"); } },
    { id: "audit", name: "성역의 장부", desc: "노엘 표시 → 세라 게이지 +10", line: "노엘: 치유 값은 장부에서 빼 두지. 마음껏 써.",
      need: function (ids) { return has(ids, "sera") && has(ids, "noel"); } },
    { id: "hunt", name: "패와 사냥", desc: "마리엘 표시 +1턴 · 아리아 게이지 +25 · 분쇄 ×1.2 · 보스 첫 턴 기절", line: "아리아: 네 카드가 가리키는 데를 부순다.",
      need: function (ids) { return has(ids, "aria") && has(ids, "mariel"); } }
  );
  var SYN_WHO = {"knights": ["arin", "sera", "garen", "arthur", "kael"], "stage": ["mariel", "serena", "odette"], "survey": ["leo", "noel", "lin"], "finisher": ["aria", "mariel", "odette", "noel", "kael", "leo", "serena", "lin"], "shield": ["sera", "garen", "kael"], "ledgers": ["noel", "kael"], "banquet": ["arin", "mariel"], "side": ["arin", "garen"], "clause": ["odette", "noel"], "decree": ["arin", "odette"], "audit": ["sera", "noel"], "hunt": ["aria", "mariel"], "bandage": ["garen", "arthur", "kael"], "liferune": ["leo", "noel", "lin"]};
  SYN.forEach(function (c) { c.who = SYN_WHO[c.id] || []; });
  function synergyOf(ids) { ids = ids || []; return SYN.filter(function (c) { return c.need(ids); }).map(function (c) { return c.id; }); }
  function SY(s, k) { return !!(s.syn && s.syn[k]); }

  var GAUGE = { attack: 15, skill: 12, guard: 20, hurtMul: 40, wave: 15, start: 10 };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 성장 갈림길 (docs/GROWTH.md). 성장 값이 없으면 perks 가 없어 지금과 똑같이 돈다
  function P(u, k) { return !!(u && u.perks && u.perks[k]); }

  var uidN = 0;
  var REG = {};  // uid → 유닛 (웨이브가 바뀌어도 이전 이벤트 재생용으로 남김)
  function makeUnit(src, side) {
    uidN += 1;
    var u = {
      uid: src.id + "#" + uidN, id: src.id, name: src.name, title: src.title || "", side: side,
      origin: src.origin, img: src.img, pixel: !!src.pixel, boss: !!src.boss,
      maxHp: src.hp, hp: src.hp, atk: src.atk, alive: true,
      gauge: side === "ally" ? GAUGE.start : 0, cd: 0,
      atkUp: 0, atkUpTurns: 0, mark: 0, frost: 0, guard: false, sanctum: 0, stun: 0,
      intent: null, charge: null, t: 0, enraged: false,
    };
    REG[u.uid] = u;
    return u;
  }

  function create(opts) {
    opts = opts || {};
    uidN = 0; REG = {};
    var s = {
      rand: mulberry32(opts.seed != null ? opts.seed : (Date.now() & 0xffffffff)),
      round: 1, wave: 0, phase: "player",
      waves: opts.waves && opts.waves.length ? opts.waves : WAVES,
      mods: opts.mods || {},
      syn: null,
      allies: ((opts.party && opts.party.length === 3 && opts.party.every(function (id) { return CAST[id]; })) ? opts.party : PARTY).map(function (id) { return makeUnit(CAST[id], "ally"); }),
      enemies: [], acted: {},
      stats: { maxHit: 0, ults: 0, breaks: 0, rounds: 0, dealt: 0 },
    };
    if (opts.growth) {
      s.allies.forEach(function (u) {
        var g = opts.growth[u.id]; if (!g) return;
        if (g.hp > 0) u.maxHp = u.hp = Math.round(g.hp);
        if (g.atk > 0) u.atk = g.atk;
        u.lv = g.lv || 1;
        u.perks = g.perks || {};
        if (g.gx) u.gx = g.gx;
      });
    }
    if (opts.carry) {
      s.allies.forEach(function (u) {
        var c = opts.carry[u.id]; if (!c) return;
        if (c.hp != null) u.hp = Math.max(0, Math.min(u.maxHp, Math.round(c.hp)));
        if (u.hp <= 0) { u.hp = 0; u.alive = false; }
        if (c.gauge != null) u.gauge = Math.max(0, Math.min(100, Math.round(c.gauge)));
      });
    }
    if (opts.syn && opts.syn.length) { s.syn = {}; opts.syn.forEach(function (k) { s.syn[k] = 1; }); }
    // 승천 규칙 「치유 약화」 (run-core ASC): 아군이 받는 회복 × healMul. 키가 있을 때만
    if (s.mods.healMul != null) s.allies.forEach(function (u) { u.healMul = s.mods.healMul; });
    s.allies.forEach(function (u) {
      if (P(u, "vanguard") && u.alive) u.gauge = Math.min(100, u.gauge + 25);
      if (u.gx && u.gx.gauge && u.alive) u.gauge = Math.min(100, u.gauge + u.gx.gauge);
      if (s.mods.gaugeAll && u.alive) u.gauge = Math.min(100, u.gauge + s.mods.gaugeAll);
      if (s.mods.startGauge && s.mods.startGauge[u.id] && u.alive) u.gauge = Math.min(100, u.gauge + s.mods.startGauge[u.id]);
    });
    loadWave(s, 0);
    if (SY(s, "survey")) s.enemies.forEach(function (e) { e.mark = Math.max(e.mark, 1); });
    if (s.mods.markStart) s.enemies.forEach(function (e) { e.mark = Math.max(e.mark, s.mods.markStart); });
    // FCB-SYN-02 퍼센트 없는 자리 (docs/SYNERGY.md): 보스가 처음부터 있는 전투에서 한 번만
    var bossFight = s.enemies.some(function (e) { return e.boss; });
    if (bossFight && SY(s, "hunt")) s.enemies.forEach(function (e) { if (e.boss) e.stun = 1; });
    if (bossFight && SY(s, "liferune")) s.allies.forEach(function (u) { if (u.alive) u.ward = WARD_LIFERUNE; });
    planIntents(s);
    if (bossFight && SY(s, "hunt")) s.enemies.forEach(function (e) { if (e.boss && e.intent && e.intent.kind === "stun") e.intent = { kind: "stun", name: "몰이", text: "사냥감 몰이! 이번 턴 행동 불가" }; });
    return s;
  }

  function loadWave(s, i) {
    s.wave = i;
    var w = s.waves[i];
    s.enemies = w.enemies.map(function (id) {
      var u = makeUnit(ENEMY[id], "enemy");
      // 런 층 보정(웨이브 옵션 hpMul/atkMul). 기본 ENEMY 수치·피해 공식은 그대로
      if (w.hpMul) { u.maxHp = u.hp = Math.round(u.maxHp * w.hpMul); }
      if (w.atkMul) u.atk = Math.round(u.atk * w.atkMul);
      return u;
    });
  }

  function living(list) { return list.filter(function (u) { return u.alive; }); }
  function find(s, uid) { return REG[uid] || null; }
  function lowestHp(list) {
    return list.reduce(function (a, b) { return a.hp / a.maxHp <= b.hp / b.maxHp ? a : b; });
  }
  function pick(s, list) { return list[Math.floor(s.rand() * list.length)]; }

  function atkOf(u) {
    var m = u.atkUpTurns > 0 ? u.atkUp : 1;
    if (u.frost > 0) m *= 0.85;
    if (P(u, "laststand") && u.hp <= u.maxHp * 0.4) m *= 1.3;
    if (u.gx && u.gx.low && u.hp <= u.maxHp * 0.4) m *= u.gx.low;
    return u.atk * m;
  }

  function damage(s, src, dst, pow, extra, ev, opt) {
    opt = opt || {};
    var v = atkOf(src) * pow * (extra || 1);
    var weak = dst.mark > 0;
    if (weak) v *= SY(s, "clause") ? 1.4 : 1.3;
    if (weak && src.side === "ally" && SY(s, "finisher") && FINISHERS.indexOf(src.id) >= 0) v *= 1.2;
    if (dst.guard) v *= SY(s, "shield") ? 0.4 : 0.5;
    if (src.side === "enemy" && src.mark > 0 && SY(s, "clause")) v *= 0.85;
    if (dst.sanctum > 0) v *= 0.7;
    v *= 0.92 + s.rand() * 0.16;
    var amt = Math.max(1, Math.round(v));
    // 룬 방패 (생명의 칸, 보스전): 고정 피해 흡수. 퍼센트 아님 → 레벨·스테이지와 같이 커지지 않는다
    var ward = 0;
    if (dst.ward > 0 && src.side === "enemy") { ward = Math.min(dst.ward, amt); dst.ward -= ward; amt -= ward; }
    dst.hp = Math.max(0, dst.hp - amt);
    var big = amt >= (src.side === "ally" ? 45 : 30) || !!opt.big;
    var hitEv = { type: "hit", src: src.uid, dst: dst.uid, amount: amt, weak: weak, big: big, guard: dst.guard };
    if (ward) hitEv.ward = ward;
    ev.push(hitEv);
    if (src.side === "ally") {
      s.stats.dealt += amt;
      if (amt > s.stats.maxHit) s.stats.maxHit = amt;
    } else if (dst.alive) {
      dst.gauge = Math.min(100, dst.gauge + Math.round((amt / dst.maxHp) * GAUGE.hurtMul));
    }
    // 브레이크(충전 저지)
    if (dst.charge && dst.hp > 0) {
      dst.charge.dealt += Math.round(amt * (weak ? 2 : 1) * (opt.breakMul || 1) * (P(src, "wedge") ? 1.6 : 1));
      if (opt.forceBreak || dst.charge.dealt >= dst.charge.need) {
        doBreak(s, dst, ev);
        if (SY(s, "side") && (src.id === "arin" || src.id === "garen")) living(s.allies).forEach(function (m) { m.gauge = Math.min(100, m.gauge + 15); });
      }
    }
    if (dst.hp <= 0 && dst.alive) {
      dst.alive = false; dst.charge = null; dst.intent = null;
      ev.push({ type: "down", dst: dst.uid });
    }
    if (src.side === "ally" && src.alive && P(src, "drain") && src.hp < src.maxHp) heal(src, Math.max(1, Math.round(amt * 0.2)), ev);
    // 회복 유물 (docs/GROWTH.md 「회복 유물」): 가진 때만 mods 키가 생긴다
    if (src.side === "ally" && src.alive && s.mods.leech && src.hp < src.maxHp) heal(src, Math.max(1, Math.round(amt * s.mods.leech)), ev);
    var kill = !dst.alive && ev.some(function (e) { return e.type === "down" && e.dst === dst.uid; });
    if (src.side === "ally" && src.alive && s.mods.killHeal && kill && src.hp < src.maxHp) heal(src, Math.round(src.maxHp * s.mods.killHeal), ev);
    // 장비 (docs/GEAR.md): 그 동료가 낀 것만 u.gx
    var gx = src.gx;
    if (gx && src.alive && gx.leech && src.hp < src.maxHp) heal(src, Math.max(1, Math.round(amt * gx.leech)), ev);
    if (gx && src.alive && gx.killHeal && kill && src.hp < src.maxHp) heal(src, Math.round(src.maxHp * gx.killHeal), ev);
    if (gx && src.alive && gx.killAll && kill) living(s.allies).forEach(function (m) { if (m.hp < m.maxHp) heal(m, Math.round(m.maxHp * gx.killAll), ev); });
    if (gx && src.alive && gx.killGauge && kill) src.gauge = Math.min(100, src.gauge + gx.killGauge);
    return amt;
  }

  function doBreak(s, u, ev) {
    ev.push({ type: "break", dst: u.uid, skill: u.charge.name });
    u.charge = null; u.stun = 1;
    u.intent = { kind: "stun", name: "기절", text: "브레이크! 이번 턴 행동 불가" };
    s.stats.breaks += 1;
  }

  function heal(u, amt, ev, revive) {
    if (!u.alive) {
      if (!revive) return 0;
      u.alive = true; u.hp = 0;
      amt = Math.max(amt, Math.round(u.maxHp * revive));
      ev.push({ type: "revive", dst: u.uid });
    }
    if (u.healMul != null && amt > 0) amt = Math.max(1, Math.round(amt * u.healMul));
    var before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amt);
    ev.push({ type: "heal", dst: u.uid, amount: u.hp - before });
    return u.hp - before;
  }

  function canUse(s, u, key) {
    if (!u || !u.alive || s.phase !== "player" || s.acted[u.uid]) return false;
    if (key === "skill") return u.cd <= 0;
    if (key === "ult") return u.gauge >= 100;
    return true;
  }

  function needsTarget(u, key) {
    if (key === "guard") return false;
    var a = CAST[u.id].actions[key];
    return a.kind === "hit" || a.kind === "mark" || a.kind === "dawn" || a.kind === "crush";
  }

  // 아군 행동. 반환: 이벤트 배열
  function act(s, uid, key, targetUid) {
    var u = find(s, uid);
    if (!canUse(s, u, key)) return null;
    var ev = [];
    var foes = living(s.enemies);
    var target = targetUid ? find(s, targetUid) : null;
    if (!target || !target.alive || target.side !== "enemy") target = defaultTarget(s);
    if (key === "guard") {
      u.guard = true;
      u.gauge = Math.min(100, u.gauge + GAUGE.guard + (s.mods.guardPlus || 0) + (P(u, "breath") ? 10 : 0));
      ev.push({ type: "guard", dst: u.uid });
      if (P(u, "breath")) heal(u, Math.round(u.maxHp * 0.12), ev);
      if (P(u, "mend")) { var lo = lowestHp(living(s.allies)); heal(lo, Math.round(lo.maxHp * 0.12), ev); }
      if (u.gx && u.gx.guardHeal && u.hp < u.maxHp) heal(u, Math.round(u.maxHp * u.gx.guardHeal), ev);
      if (u.gx && u.gx.guardAll) living(s.allies).forEach(function (m) { if (m.hp < m.maxHp) heal(m, Math.round(m.maxHp * u.gx.guardAll), ev); });
      if (s.mods.guardHeal) { var lg = lowestHp(living(s.allies)); if (lg.hp < lg.maxHp) heal(lg, Math.round(lg.maxHp * s.mods.guardHeal), ev); }
      if (SY(s, "knights") && CAST[u.id].origin === "ashen") living(s.allies).forEach(function (m) { if (m !== u) m.gauge = Math.min(100, m.gauge + 8); });
    } else {
      var a = CAST[u.id].actions[key];
      // 갈림길 보정 (원본 CAST 는 건드리지 않고 복사본에)
      if (u.perks) {
        var b = {}; for (var k0 in a) b[k0] = a[k0]; a = b;
        if (key === "skill" && P(u, "power")) { if (a.kind === "heal") a.pow += 15; else a.pow *= 1.3; }
        if (key === "ult" && P(u, "ultpow")) { if (a.kind === "sanctum") a.pow += 15; else a.pow *= 1.25; }
        if (key === "skill" && P(u, "quick")) { a.cd = Math.max(1, a.cd - 1); if (a.kind === "heal") a.pow -= 20; }
        if (key === "ult" && P(u, "extend")) a.turns = (a.turns || 2) + 1;
        if (key === "skill" && a.kind === "mark" && P(u, "longmark")) a.turns += 1;
        if (P(u, "first") && !u.firstDone && a.kind !== "heal" && a.kind !== "sanctum") a.pow *= 1.6;
        u.firstDone = true;
      }
      if (s.syn) {
        var c2 = {}; for (var k1 in a) c2[k1] = a[k1]; a = c2;
        if (key === "skill" && a.kind === "heal" && u.id === "sera" && SY(s, "shield")) a.pow += 10;
        if (key === "skill" && a.kind === "mark" && SY(s, "ledgers") && (u.id === "noel" || u.id === "kael")) { a.turns += 1; u.gauge = Math.min(100, u.gauge + 15); }
        if (key === "ult" && u.id === "aria" && SY(s, "hunt")) a.pow *= 1.2;
        if (key === "skill" && a.kind === "mark" && u.id === "mariel" && (SY(s, "hunt") || SY(s, "banquet"))) a.turns += 1;
      }
      var buddy = function (id, n) { living(s.allies).forEach(function (m) { if (m.id === id && m !== u) m.gauge = Math.min(100, m.gauge + n); }); };
      if (key === "ult" && SY(s, "decree")) { if (u.id === "arin") buddy("odette", 30); if (u.id === "odette") buddy("arin", 30); }
      if (key === "skill" && a.kind === "mark" && u.id === "noel" && SY(s, "audit")) buddy("sera", 10);
      if (key === "skill" && a.kind === "mark" && P(u, "markheal")) living(s.allies).forEach(function (m) { if (m.hp < m.maxHp) heal(m, Math.round(m.maxHp * 0.05), ev); });
      if (key === "ult" && u.gx && u.gx.ultGauge) living(s.allies).forEach(function (m) { if (m !== u) m.gauge = Math.min(100, m.gauge + u.gx.ultGauge); });
      if (key === "ult" && u.gx && u.gx.ultAll) living(s.allies).forEach(function (m) { if (m.hp < m.maxHp) heal(m, Math.round(m.maxHp * u.gx.ultAll), ev); });
      if (key === "ult" && s.mods.ultHeal) living(s.allies).forEach(function (m) { if (m.hp < m.maxHp) heal(m, Math.round(m.maxHp * s.mods.ultHeal), ev); });
      if (key === "ult" && P(u, "ultheal")) living(s.allies).forEach(function (m) { if (m.hp < m.maxHp) heal(m, Math.round(m.maxHp * 0.12), ev); });
      if (key === "ult" && u.id === "leo" && SY(s, "liferune")) { var rv = s.liferune ? 0 : 0.25; s.liferune = 1; s.allies.forEach(function (m) { heal(m, Math.round(m.maxHp * 0.15), ev, rv); }); }
      if (key === "skill" && a.kind === "mark" && u.id === "mariel" && SY(s, "hunt")) buddy("aria", 25);
      if (key === "skill" && a.kind === "mark" && u.id === "mariel" && SY(s, "banquet")) buddy("arin", 20);
      if (key === "ult") {
        u.gauge = 0; s.stats.ults += 1;
        if (SY(s, "stage")) living(s.allies).forEach(function (m) { if (m !== u) m.gauge = Math.min(100, m.gauge + 10); if (m.hp < m.maxHp) heal(m, Math.round(m.maxHp * 0.08), ev); });
        if (s.mods.ultShare) living(s.allies).forEach(function (m) { if (m !== u) m.gauge = Math.min(100, m.gauge + s.mods.ultShare); });
        ev.push({ type: "cutin", src: u.uid, unit: u.id, name: a.name, voice: a.voice, fx: a.fx, colors: a.colors, origin: ORIGINS[CAST[u.id].origin].name });
      } else {
        u.gauge = Math.min(100, u.gauge + (key === "attack" ? GAUGE.attack : GAUGE.skill));
        if (s.mods.rally) living(s.allies).forEach(function (m) { if (m !== u) m.gauge = Math.min(100, m.gauge + s.mods.rally); });
        if (P(u, "inspire")) living(s.allies).forEach(function (m) { if (m !== u) m.gauge = Math.min(100, m.gauge + 5); });
      }
      if (key === "skill") u.cd = a.cd;
      ev.push({ type: "use", src: u.uid, key: key, name: a.name });
      if (a.kind === "hit" && target) {
        damage(s, u, target, a.pow, key === "attack" && s.mods.basicMul ? s.mods.basicMul : 1, ev, { breakMul: a.breakMul });
      } else if (a.kind === "mark" && target) {
        target.mark = a.turns;
        ev.push({ type: "mark", dst: target.uid, turns: a.turns });
        damage(s, u, target, a.pow, 1, ev);
      } else if (a.kind === "heal") {
        var hurt = living(s.allies);
        heal(lowestHp(hurt), a.pow, ev);
      } else if (a.kind === "dawn") {
        var stack = SY(s, "decree") && (u.id === "arin" || u.id === "odette");
        living(s.allies).forEach(function (m) {
          if (stack && m.atkUpTurns > 0) { m.atkUp = Math.min(1.6, m.atkUp + a.buff - 1); m.atkUpTurns = Math.max(m.atkUpTurns, a.turns); }
          else { m.atkUp = a.buff; m.atkUpTurns = a.turns; }
        });
        ev.push({ type: "buff", dsts: living(s.allies).map(function (m) { return m.uid; }), text: "공격 ×" + a.buff });
        if (target) damage(s, u, target, a.pow, 1, ev, { big: true });
      } else if (a.kind === "sanctum") {
        s.allies.forEach(function (m) {
          heal(m, a.pow, ev, a.revive);
          if (m.alive) { m.frost = 0; m.sanctum = a.turns || 2; }
        });
        ev.push({ type: "buff", dsts: living(s.allies).map(function (m) { return m.uid; }), text: "정화 · 성역" });
      } else if (a.kind === "crush" && target) {
        var weak = target.mark > 0;
        if (target.charge) ev.push({ type: "partbreak", dst: target.uid });
        damage(s, u, target, a.pow, weak ? a.markMul : 1, ev, { big: true, forceBreak: !!target.charge });
      }
    }
    s.acted[u.uid] = true;
    ev = ev.concat(checkWave(s));
    return ev;
  }

  function defaultTarget(s) {
    var foes = living(s.enemies);
    if (!foes.length) return null;
    var charging = foes.filter(function (f) { return f.charge; })[0];
    return charging || foes.filter(function (f) { return !f.boss; })[0] || foes[0];
  }

  function pendingAllies(s) {
    return living(s.allies).filter(function (u) { return !s.acted[u.uid]; });
  }

  function checkWave(s) {
    var ev = [];
    if (!living(s.allies).length) { s.phase = "lose"; ev.push({ type: "lose" }); return ev; }
    if (!living(s.enemies).length) {
      if (s.wave + 1 < s.waves.length) {
        loadWave(s, s.wave + 1);
        living(s.allies).forEach(function (a) { a.gauge = Math.min(100, a.gauge + GAUGE.wave); });
        s.acted = {};
        living(s.allies).forEach(function (a) { a.guard = false; });
        planIntents(s);
        ev.push({ type: "wave", wave: s.wave, name: s.waves[s.wave].name, line: s.waves[s.wave].line });
      } else {
        s.phase = "win"; ev.push({ type: "win" });
      }
    }
    return ev;
  }

  // 적 의도 계획 (플레이어 턴 시작 시 보이게)
  function planIntents(s) {
    var allies = living(s.allies);
    if (!allies.length) return;
    living(s.enemies).forEach(function (e) {
      if (e.stun > 0) { e.intent = { kind: "stun", name: "기절", text: "브레이크! 이번 턴 행동 불가" }; return; }
      var low = lowestHp(allies);
      var ai = ENEMY[e.id].ai;
      if (e.charge) {
        e.intent = e.charge.turns <= 1
          ? { kind: "aoe", name: e.charge.name, pow: e.charge.pow, frost: e.charge.frost, text: "⚠ 이번 턴 전체 공격!", charge: true }
          : { kind: "charging", name: e.charge.name, text: "충전 중 · " + e.charge.turns + "턴 후 전체 공격", charge: true };
        return;
      }
      if (ai === "grunt") {
        e.intent = { kind: "hit", name: mv(e, "hit", "그림자 베기"), pow: 1.0, target: pick(s, allies).uid };
      } else if (ai === "wolf") {
        e.intent = { kind: "hit", name: mv(e, "hit", "서리 이빨"), pow: 1.0, target: low.uid };
      } else if (ai === "general") {
        if (e.t % 3 === 2) {
          e.intent = { kind: "startCharge", name: mv(e, "charge", "그림자 명령"), turns: 1, pow: 1.15, need: ENEMY[e.id].breakNeed, text: "충전 시작 · 다음 턴 전체 공격", charge: true };
        } else {
          e.intent = { kind: "hit", name: mv(e, "hit", "흑철 일격"), pow: 1.2, target: low.uid };
        }
      } else if (ai === "celes") {
        var cyc = e.t % 4;
        if (!e.enraged && e.hp <= e.maxHp / 2) { cyc = 3; }
        if (cyc === 1) {
          // 얼음 기둥: 대상 예고 → 같은 턴 낙하
          e.intent = { kind: "pillar", name: mv(e, "pillar", "얼음 기둥"), pow: 2.0, target: pick(s, allies).uid, text: "대상 위 예고 · 방어하면 절반" };
        } else if (cyc === 3) {
          e.intent = { kind: "startCharge", name: mv(e, "charge", "서리 노바"), turns: 2, pow: 1.25, frost: 2, need: ENEMY[e.id].breakNeed, text: "충전 시작 · 2턴 후 전체 + " + mv(e, "frost", "빙결"), charge: true, enrage: !e.enraged && e.hp <= e.maxHp / 2 };
        } else {
          e.intent = { kind: "hit", name: mv(e, "hit", "빙결 화살"), pow: 1.1, target: low.uid };
        }
      }
    });
  }

  function enemyPhase(s) {
    var ev = [];
    if (s.phase !== "player") return ev;
    s.phase = "enemy";
    living(s.enemies).forEach(function (e) {
      if (!living(s.allies).length || !e.alive) return;
      var it = e.intent;
      e.t += 1;
      if (!it) return;
      if (it.kind === "stun") { e.stun = 0; ev.push({ type: "stunned", src: e.uid }); return; }
      if (it.kind === "startCharge") {
        if (it.enrage) { e.enraged = true; ev.push({ type: "say", src: e.uid, text: mv(e, "enrage", "도망칠 곳은 없다. — 마녀의 예고") }); }
        e.charge = { name: it.name, turns: it.turns, pow: it.pow, frost: it.frost || 0, need: it.need, dealt: 0 };
        ev.push({ type: "charge", src: e.uid, name: it.name, turns: it.turns });
        return;
      }
      if (it.kind === "charging") {
        e.charge.turns -= 1;
        ev.push({ type: "charge", src: e.uid, name: it.name, turns: e.charge.turns });
        return;
      }
      if (it.kind === "aoe") {
        ev.push({ type: "enemyUse", src: e.uid, name: it.name, aoe: true, voice: mv(e, "voice", e.id === "shadow_general" ? "그림자가… 명을 따른다." : "얼어붙어라. 서리 노바.") });
        e.charge = null;
        living(s.allies).forEach(function (a) {
          damage(s, e, a, it.pow, 1, ev, { big: true });
          if (it.frost && a.alive) { a.frost = it.frost + 1; a.frostName = mv(e, "frost", "빙결"); ev.push({ type: "frost", dst: a.uid, label: a.frostName }); }
        });
        return;
      }
      var tgt = find(s, it.target);
      if (!tgt || !tgt.alive) tgt = lowestHp(living(s.allies));
      ev.push({ type: "enemyUse", src: e.uid, name: it.name, dst: tgt.uid, pillar: it.kind === "pillar" });
      damage(s, e, tgt, it.pow, 1, ev, { big: it.kind === "pillar" });
    });
    // 라운드 종료 처리
    var end = checkWave(s);
    ev = ev.concat(end);
    if (s.phase === "enemy") {
      s.round += 1; s.stats.rounds = s.round;
      living(s.allies).forEach(function (gu) {
        if (!gu.gx) return;
        if (gu.gx.regen && gu.hp < gu.maxHp) heal(gu, Math.round(gu.maxHp * gu.gx.regen), ev);
        if (gu.gx.regenLow) { var gl = lowestHp(living(s.allies)); if (gl && gl.hp < gl.maxHp) heal(gl, Math.round(gl.maxHp * gu.gx.regenLow), ev); }
      });
      if (s.mods.regen) { var rl = lowestHp(living(s.allies)); if (rl && rl.hp < rl.maxHp) heal(rl, Math.round(rl.maxHp * s.mods.regen), ev); }
      if (SY(s, "bandage")) { var bl = lowestHp(living(s.allies)); if (bl && bl.hp < bl.maxHp) heal(bl, Math.round(bl.maxHp * 0.14), ev); }   // 12 → 14% (FCB-SYN-01: 명세 상한 18% 는 붕대 셋 s3 87% · s5 83% 로 세라 셋(73%)을 넘어 14% 로)
      s.allies.concat(s.enemies).forEach(function (u) {
        u.guard = false;
        if (u.cd > 0) u.cd -= 1;
        if (u.atkUpTurns > 0) u.atkUpTurns -= 1;
        if (u.mark > 0) u.mark -= 1;
        if (u.frost > 0) u.frost -= 1;
        if (u.sanctum > 0) u.sanctum -= 1;
      });
      s.acted = {};
      s.phase = "player";
      planIntents(s);
      ev.push({ type: "round", round: s.round });
    }
    return ev;
  }

  var api = {
    SYN: SYN, synergyOf: synergyOf,
    ORIGINS: ORIGINS, CAST: CAST, ENEMY: ENEMY, WAVES: WAVES, PARTY: PARTY, GAUGE: GAUGE,
    create: create, act: act, enemyPhase: enemyPhase, canUse: canUse, needsTarget: needsTarget,
    living: living, find: find, pendingAllies: pendingAllies, defaultTarget: defaultTarget,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FCBCore = api;
})(this);
