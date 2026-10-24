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
    // 현관·주방·감시탑·테라스 한 줄은 docs/STORY.md 그대로. 연회·무기고·저장고는 영입 방이라 STORY.md 의 "아직 오지 못했다" 문장과 어긋나 기존 문장 유지
    gate: { name: "현관", line: "아린: 왕성은 무너졌다. 이 현관은 우리 것이 아니다. 문은 하나면 충분하다." },
    servants: { name: "시종 방", line: "짧은 방. 급한 숨은 여기서 고른다." },
    banquet: { name: "연회 홀", line: "뒤집힌 잔 사이에 카드 한 장이 빛난다." },
    armory: { name: "무기고", line: "녹슨 창 사이로 그림자가 일어선다." },
    kitchen: { name: "주방", line: "우물은 왕관의 것도, 사냥터의 것도 아니다. 값을 내면 쓰러진 사람도 마신다." },
    store: { name: "저장고", line: "룬 상자가 반쯤 열려 있다." },
    watch: { name: "감시탑", line: "그림자 장군: 명은 아직 유효하다. 지킬 왕이 바뀌었을 뿐이다." },
    terrace: { name: "테라스", line: "셀레스: 사냥꾼. 네 세계도, 저 왕관도, 이 문 앞에서 끝이다." },
    // 스테이지 2 뒤집힌 홀 (docs/stage-2.md "방 한 줄")
    mirror_gate: { name: "거울 현관", line: "바닥이 천장이다. 샹들리에가 발밑에서 흔들린다." },
    ballroom: { name: "무도회장", line: "왈츠가 거꾸로 돈다. 꼭두각시는 박자를 놓치지 않는다." },
    gallery: { name: "초상 회랑", line: "액자 속 얼굴이 모두 아래를 본다." },
    card_table: { name: "카드 테이블", line: "엎어진 카드 한 장이 위를 보고 있다." },
    workshop: { name: "인형 공방", line: "은실이 바닥에서 천장으로 늘어졌다." },
    moon_hall: { name: "달빛 회랑", line: "달은 창 아래에 떴다." },
    archive_stair: { name: "서고 계단", line: "책장이 거꾸로 꽂혀 있다. 글자는 바로 읽힌다." },
    mirror_spring: { name: "거울 샘", line: "샘물은 아래에서 위로 떨어진다. 값을 내면 마실 수 있다." },
    balcony: { name: "가고일 발코니", line: "가고일: 성벽은 밤에만 움직인다. 이 밤은 길다." },
    queen_gate: { name: "성문 홀", line: "녹스: 여왕의 성문은 닫혀 있다. 지나가려면 내 근무를 끝내라." },
    // 스테이지 3 룬 밭 (docs/stage-3.md "방 한 줄")
    field_gate: { name: "밭 어귀", line: "밭고랑마다 룬이 하나씩 박혀 있다." },
    furrow: { name: "룬 고랑", line: "고랑을 밟을 때마다 글자가 빛난다." },
    ring_road: { name: "고리 길", line: "길은 시계 방향으로만 돈다." },
    scarecrow: { name: "허수아비 칸", line: "빈 칸에 이름표만 걸려 있다." },
    inn: { name: "여행자 쉼터", line: "모닥불 옆에 펼친 지도 한 장." },
    ledger_shed: { name: "장부 헛간", line: "헛간 벽에 월급이 적혀 있다." },
    survey_post: { name: "측량 말뚝", line: "말뚝마다 눈금이 새겨져 있다." },
    rune_spring: { name: "룬 샘", line: "샘 바닥에 치유의 룬이 가라앉아 있다. 값을 내면 마실 수 있다." },
    gate_ruin: { name: "관문 터", line: "관문 파괴자: 닫힌 칸은 부수면 열린다." },
    storm_hill: { name: "폭풍 언덕", line: "폭풍 거인: 이 밭의 칸은 전부 내 하늘 아래다." },
    // 스테이지 4 성문 잔해 (docs/stage-4.md "방 한 줄")
    ash_gate: { name: "잿빛 현관", line: "성문 잔해 위로 재가 내린다." },
    broken_bridge: { name: "끊어진 다리", line: "다리 반쪽이 해자에 잠겼다." },
    watch_post: { name: "초소 터", line: "횃불은 꺼졌고 창만 서 있다." },
    banner_hall: { name: "깃발 홀", line: "찢어진 왕관 깃발이 바닥에 깔려 있다." },
    guardhouse: { name: "수비대 막사", line: "방패걸이에 하나만 비어 있다." },
    chapel_ruin: { name: "무너진 예배당", line: "성기사의 맹세문이 반쯤 타 있다." },
    record_room: { name: "기록실", line: "성문 장부가 펼쳐진 채 굳었다." },
    moat_well: { name: "해자 우물", line: "해자 물은 차다. 값을 내면 상처를 씻을 수 있다." },
    gatehouse: { name: "성문 누각", line: "그림자 기사: 이 누각은 그림자의 것이다." },
    great_gate: { name: "큰 성문", line: "요새 문지기: 열쇠는 넘겼다. 이 문은 이제 아무도 지나가지 못한다." },
    // 스테이지 5 왕좌 너머 (docs/stage-5.md "방 한 줄")
    throne_steps: { name: "왕좌 계단", line: "왕좌는 비어 있다. 그 뒤에 문이 하나 더 있다." },
    door_hall: { name: "문들의 복도", line: "지금까지 연 문이 벽에 걸려 있다." },
    echo_hall: { name: "메아리 홀", line: "고르지 않은 방의 소리가 들린다." },
    three_altar: { name: "세 문의 제단", line: "카드와 룬과 깃발이 한 제단에 놓였다." },
    mark_shield: { name: "표식의 방 · 방패", line: "문 앞에 방패 하나가 세워져 있다." },
    mark_card: { name: "표식의 방 · 카드", line: "카드 한 장이 문틈에 끼어 있다." },
    mark_rune: { name: "표식의 방 · 글자", line: "벽에 룬 한 획이 새겨져 있다." },
    last_well: { name: "마지막 우물", line: "저택 첫 우물과 같은 물이다. 값을 내면 마실 수 있다." },
    shadow_throne: { name: "그림자 왕좌", line: "그림자 장군: 왕좌는 비었다. 명은 아직 남았다." },
    beyond_throne: { name: "왕좌 너머", line: "아르: 문은 내가 열었다. 이 저택은 내 카드 한 장이다." },
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
  // 난이도: 적 HP·공격 배율만 (층 보정 SCALE 위에 곱한다). 보통 = 1 그대로, 다른 수치는 건드리지 않는다
  var DIFF_KEY = "fcb-diff-v1";
  var DIFF = {
    normal: { name: "보통", hp: 1, atk: 1 },
    hard: { name: "하드", hp: 1.25, atk: 1.1 },
  };
  function diffOf(run) { return run && run.diff === "hard" ? "hard" : "normal"; }
  // 적 배율 = 층 보정 × 난이도. 보통이면 층 보정 그대로 (곱하지 않음 → 보통 결과 그대로)
  function enemyScale(run, tier) {
    var sc = SCALE[tier] || SCALE.t1;
    if (diffOf(run) !== "hard") return sc;
    return { hp: sc.hp * DIFF.hard.hp, atk: sc.atk * DIFF.hard.atk };
  }
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
    "우물, 상자, 주사위. 쉼에도 값이 있다.",
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

  // 스테이지 2 만남 (docs/stage-2.md 대사 그대로). reunion = 마리엘이 출전 중일 때
  var MEET2 = {
    mariel: {
      room: "workshop",
      open: [
        ["마리엘", "무대가 뒤집혔다. 나는 마리엘. 이 홀은 내 덱의 것이다."],
        ["아린", "왕관의 아린이다. 저택이 너희 성까지 삼켰나."],
        ["마리엘", "성이 아니라 홀 하나. 여왕은 아직 저쪽에 있다."],
        ["아리아", "그럼 이 은실은 누구 것이냐."],
        ["마리엘", "내 것. 데려가면 끊지 않겠다."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["마리엘", "실은 여기 묶어 둔다. 이름은 이미 둘이다."]],
    },
    serena: {
      room: "moon_hall",
      reunion: [
        ["마리엘", "세레나. 박자를 또 혼자 세고 있었나."],
        ["세레나", "마리엘. 네 실이 보여서 반 박자 늦췄어."],
        ["세레나", "이 홀은 거꾸로 돌아. 그래도 춤은 같아."],
      ],
      open: [
        ["세레나", "거꾸로 선 무도회장에 손님이라니. 나는 세레나."],
        ["세라", "성역의 세라다. 칼을 든 무희는 처음 본다."],
        ["세레나", "박자만 맞춰 줘. 나머지는 내가 벤다."],
        ["아리아", "박자는 모른다. 약점이면 안다."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["세레나", "이 곡은 다음 홀에서. 박자는 기억해 둘게."]],
    },
    odette: {
      room: "archive_stair",
      reunion: [
        ["오데트", "마리엘. 네 이름은 이 홀 기록에 세 번 나온다."],
        ["마리엘", "오데트. 그 기록, 이번엔 끝까지 적어."],
        ["오데트", "제17조까지. 이 밤의 계약은 거기서 끝난다."],
      ],
      open: [
        ["오데트", "기록관 오데트. 이 계단은 서고 쪽으로만 내려간다."],
        ["아린", "위로 가야 한다. 문은 맨 위에 있다."],
        ["오데트", "뒤집힌 홀에선 위가 아래다. 적어 둘게. 따라와."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["오데트", "기록만 남긴다. 사람은 다음 장이다."]],
    },
  };

  // 스테이지 3 만남 (docs/stage-3.md 대사 그대로). reunion = 레오가 출전 중일 때
  var MEET3 = {
    leo: {
      room: "inn",
      open: [
        ["레오", "여기는 내 밭이다. 나는 레오. 룬 영토에서 칸을 걷던 사람이다."],
        ["아린", "왕관의 아린이다. 이 밭도 저택이 삼켰나."],
        ["레오", "고리째로. 길이 시계 방향으로만 돈다."],
        ["아리아", "거꾸로 걸으면 어떻게 되지."],
        ["레오", "칸이 너를 잊는다. 데려가면 길을 알려 주겠다."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["레오", "지도는 두고 간다. 이름은 이미 둘이다."]],
    },
    noel: {
      room: "ledger_shed",
      reunion: [
        ["노엘", "레오. 네 칸 값은 아직 장부에 남아 있다."],
        ["레오", "노엘. 오늘은 갚으러 온 게 아니다. 같이 걷자."],
        ["노엘", "좋다. 대신 이 밭의 값은 내가 적는다."],
      ],
      open: [
        ["노엘", "감사 노엘이다. 이 헛간에 들어온 사람은 다 적힌다."],
        ["세라", "성역의 세라다. 무엇을 적나."],
        ["노엘", "누가 칸을 지켰고, 누가 칸을 버렸는지."],
        ["아리아", "그럼 적어라. 우리는 지킨다."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["노엘", "이름은 장부에만 둔다. 자리는 이미 찼다."]],
    },
    lin: {
      room: "survey_post",
      reunion: [
        ["린", "레오. 이 말뚝, 네가 박은 거지. 눈금이 틀렸어."],
        ["레오", "린. 그래서 네가 필요했다."],
        ["린", "이름은 재고 나서 붙여. 따라갈게."],
      ],
      open: [
        ["린", "측량사 린. 이 밭이 원래 무엇이었는지부터 재야 해."],
        ["아린", "지금은 싸움터다. 그걸로 충분하지 않나."],
        ["린", "충분하지 않아. 그래도 같이 재 줄게."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["린", "눈금만 남길게. 다음 칸에서 다시 재자."]],
    },
  };

  // 스테이지 4 만남 (docs/stage-4.md 대사 그대로). reunion = 아린·세라·가렌 중 한 명이라도 출전
  var MEET4 = {
    garen: {
      room: "guardhouse",
      reunion: [
        ["가렌", "폐하. 이번엔 방패도 함께 떨어졌소."],
        ["아린", "가렌. 여기는 네가 지키던 성문이다."],
        ["가렌", "그래서 내가 먼저 서겠소. 잔해는 내가 잘 아오."],
      ],
      open: [
        ["가렌", "왕관 문장도 없는 이들이 성문 잔해에 왔군."],
        ["아리아", "헌터 아리아다. 길만 알면 된다."],
        ["가렌", "길은 무너졌소. 대신 내가 앞에 서겠소."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["가렌", "방패는 성문에 두겠소. 이름은 이미 둘이오."]],
    },
    arthur: {
      room: "chapel_ruin",
      reunion: [
        ["아서", "아린. 왕성이 무너진 날, 길은 내가 안다고 했지."],
        ["아린", "아서. 이번에도 길을 아나."],
        ["아서", "잔해 사이 길이라면. 따라와."],
      ],
      open: [
        ["아서", "성기사 아서다. 이 문은 내가 지키던 문이 아니다."],
        ["아리아", "그럼 누가 지켰지."],
        ["아서", "문지기다. 지금은 그림자에게 열쇠를 넘겼다."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["아서", "길만 알려 주마. 사람은 다음 문이다."]],
    },
    kael: {
      room: "record_room",
      reunion: [
        ["카엘", "하르트만의 카엘입니다. 성문 장부는 아직 제 손에 있습니다."],
        ["세라", "카엘. 그 장부를 끝까지 들고 왔군요."],
        ["카엘", "들고 왔습니다. 이제 갑옷으로 앞을 막겠습니다."],
      ],
      open: [
        ["카엘", "하르트만의 카엘. 몰락한 집안이지만 갑옷은 아직 무겁다."],
        ["아리아", "무거운 건 좋다. 앞에 서라."],
        ["카엘", "그러려고 왔다."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["카엘", "장부는 내가 들고 있겠다. 자리는 이미 찼다."]],
    },
  };

  // 스테이지 5 만남 (docs/stage-5.md 대사 그대로). 스테이지 1의 세 사람이 표식으로 기다린다.
  // reunion = 가렌·마리엘·레오 중 한 명이라도 출전 (먼저 데려간 표식이 다음 표식을 알아본다)
  var MEET5 = {
    garen: {
      room: "mark_shield",
      reunion: null,
      open: [
        ["가렌", "방패를 세워 둔 건 나요. 다음 문의 표식이 되라고."],
        ["아린", "가렌. 마지막 문까지 와 있었나."],
        ["가렌", "데려가지 못한 이름은 여기서 기다리오. 이번엔 데려가시오."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["가렌", "방패는 문 앞에 두겠소. 이름은 이미 둘이오."]],
    },
    mariel: {
      room: "mark_card",
      reunion: [
        ["마리엘", "방패가 먼저 와 있군. 카드는 늦지 않았다."],
        ["가렌", "마리엘. 패는 남았소?"],
        ["마리엘", "한 장. 마지막 문에 쓸 패다."],
      ],
      open: [
        ["마리엘", "문틈에 낀 카드는 내 것이다. 나는 마리엘."],
        ["아리아", "저택 첫 층에서 본 카드다."],
        ["마리엘", "그 카드가 표식이었다. 이번엔 같이 연다."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["마리엘", "카드는 문틈에 남긴다. 이름은 이미 둘이다."]],
    },
    leo: {
      room: "mark_rune",
      reunion: [
        ["레오", "먼저 온 표식이 있군. 글자가 늦었다."],
        ["레오", "룬 한 획은 남겨 두었다. 이제 같이 긋는다."],
      ],
      open: [
        ["레오", "벽의 한 획은 내 글자다. 나는 레오."],
        ["세라", "저택 저장고에서 본 글자군요."],
        ["레오", "그게 표식이었다. 자리가 있으면 서겠다."],
      ],
      full: [["저택", "이름을 더 받지 않는다."], ["레오", "한 획만 남긴다. 사람은 다음 판이다."]],
    },
  };

  // 스테이지. open = 테스트(node tools/run-sim.js 100)를 통과해 타이틀 목록에 열린 것만 true.
  // 수치(SCALE·적 수치)는 스테이지마다 같다. 스테이지 2 적은 스테이지 1 짝과 같은 수치·AI (이슈 1 보류).
  var STAGES = {
    1: {
      no: 1, name: "균열 저택", door: "잿빛 왕관 · 헌트 나우", boss: "셀레스", open: true, bgm: null, bg: null,
      plan: FLOOR_PLAN, packs: PACKS, battleRooms: BATTLE_ROOMS, floorLine: FLOOR_LINE, meet: MEET,
      rooms: { elite: "watch", boss: "terrace", rest: "kitchen", treasure: "store", event: "banquet", first: "gate" },
      // 결과 한 줄은 docs/STORY.md "결과 (#res-line 만)" 그대로
      win: "셀레스가 무릎을 꺾였다. 균열이 한 박자 늦다. 저택은 아직 닫히지 않았다.", lose: "저택이 셋을 현관 밖으로 뱉었다. 문은 다시 섞인다.",
      winImg: "img/arin.png", loseImg: "img/celes.webp",
    },
    2: {
      no: 2, name: "뒤집힌 홀", door: "미녀 덱", boss: "녹스", open: true, bgm: "sfx/bgm-stage2.mp3", bg: "img/stage2.webp",
      plan: [
        { kinds: ["battle", "battle"], tier: "t1" },
        { kinds: ["battle", "event", "meet:mariel"], tier: "t1" },
        { kinds: ["elite", "battle"], tier: "t2" },
        { kinds: ["rest", "meet:serena", "event"], tier: "t2" },
        { kinds: ["battle", "elite", "meet:odette"], tier: "t3" },
        { kinds: ["boss"], tier: "boss" },
      ],
      packs: {
        t1: [["puppet", "puppet"], ["bat", "puppet"]],
        t2: [["bat", "bat"], ["puppet", "bat"]],
        t3: [["bat", "bat"], ["puppet", "puppet"]],
        ambush: [["puppet", "bat"]],
        elite: [["puppet", "gargoyle"]],
        boss: [["bat", "knox"]],
      },
      battleRooms: ["mirror_gate", "ballroom", "gallery", "card_table"],
      floorLine: [
        "거울 현관. 저택이 미녀 덱의 홀을 거꾸로 삼켰다.",
        "왈츠가 거꾸로 돈다. 인형 공방에 은실이 보인다.",
        "발코니의 석상이 눈을 뜬다.",
        "달은 창 아래에 떴다. 샘과 카드가 기다린다.",
        "서고 계단. 위로 가려면 내려가야 한다.",
        "여왕의 성문. 녹스가 아직 근무 중이다.",
      ],
      meet: MEET2, reunionWith: "mariel",
      rooms: { elite: "balcony", boss: "queen_gate", rest: "mirror_spring", treasure: "card_table", event: "card_table", first: "mirror_gate" },
      win: "마리엘: “녹스의 근무는 끝났다. 홀이 바로 섰으니, 다음 패를 넘기자.”",
      lose: "녹스: “근무는 끝나지 않는다. 왈츠는 처음부터 다시다.”",
      winImg: "img/mariel.webp", loseImg: "img/knox.webp",
    },
    3: {
      no: 3, name: "룬 밭", door: "룬 영토", boss: "폭풍 거인", open: true, bgm: "sfx/bgm-stage3.mp3", bg: "img/stage3.webp",
      plan: [
        { kinds: ["battle", "battle"], tier: "t1" },
        { kinds: ["battle", "event", "meet:leo"], tier: "t1" },
        { kinds: ["elite", "battle"], tier: "t2" },
        { kinds: ["rest", "meet:noel", "event"], tier: "t2" },
        { kinds: ["battle", "elite", "meet:lin"], tier: "t3" },
        { kinds: ["boss"], tier: "boss" },
      ],
      packs: {
        t1: [["moss_turtle", "moss_turtle"], ["ember_fox", "moss_turtle"]],
        t2: [["ember_fox", "ember_fox"], ["moss_turtle", "ember_fox"]],
        t3: [["ember_fox", "ember_fox"], ["moss_turtle", "moss_turtle"]],
        ambush: [["moss_turtle", "ember_fox"]],
        elite: [["moss_turtle", "gate_breaker"]],
        boss: [["ember_fox", "tempest_giant"]],
      },
      battleRooms: ["field_gate", "furrow", "ring_road", "scarecrow"],
      floorLine: [
        "밭 어귀. 저택이 룬 영토의 들판을 통째로 삼켰다.",
        "고리 길이 시작된다. 모닥불 옆에 지도가 보인다.",
        "관문 터. 닫힌 칸 앞에 뿔 달린 그림자가 선다.",
        "헛간과 샘. 쉼에도 값이 적힌다.",
        "측량 말뚝. 이름 없는 칸이 하나 남았다.",
        "폭풍 언덕. 거인이 하늘에서 칸을 긋는다.",
      ],
      meet: MEET3, reunionWith: "leo",
      rooms: { elite: "gate_ruin", boss: "storm_hill", rest: "rune_spring", treasure: "scarecrow", event: "scarecrow", first: "field_gate" },
      win: "레오: “폭풍이 걷혔다. 칸마다 이름이 돌아온다. 이제 다음 문이다.”",
      lose: "폭풍 거인: “이 밭의 칸은 내 하늘 아래다. 너희 이름은 지웠다.”",
      winImg: "img/leo.webp", loseImg: "img/tempest_giant.webp",
    },
    4: {
      no: 4, name: "성문 잔해", door: "잿빛 왕관", boss: "요새 문지기", open: true, bgm: "sfx/bgm-stage4.mp3", bg: "img/stage4.webp",
      plan: [
        { kinds: ["battle", "battle"], tier: "t1" },
        { kinds: ["battle", "event", "meet:garen"], tier: "t1" },
        { kinds: ["elite", "battle"], tier: "t2" },
        { kinds: ["rest", "meet:arthur", "event"], tier: "t2" },
        { kinds: ["battle", "elite", "meet:kael"], tier: "t3" },
        { kinds: ["boss"], tier: "boss" },
      ],
      packs: {
        t1: [["shade", "shade"], ["shadow_spear", "shade"]],
        t2: [["shadow_spear", "shadow_spear"], ["shade", "shadow_spear"]],
        t3: [["shadow_spear", "shadow_spear"], ["shade", "shade"]],
        ambush: [["shade", "shadow_spear"]],
        elite: [["shade", "shadow_knight"]],
        boss: [["shadow_spear", "gatekeeper"]],
      },
      battleRooms: ["ash_gate", "broken_bridge", "watch_post", "banner_hall"],
      floorLine: [
        "잿빛 현관. 저택이 무너진 성문까지 삼켰다.",
        "끊어진 다리. 막사에 빈 방패걸이가 보인다.",
        "성문 누각. 그림자 기사가 깃발을 든다.",
        "예배당과 우물. 맹세에도 값이 있다.",
        "기록실. 성문을 연 이름이 적혀 있다.",
        "큰 성문. 문지기가 열쇠 없이 버틴다.",
      ],
      meet: MEET4, reunionWith: ["arin", "sera", "garen"],
      rooms: { elite: "gatehouse", boss: "great_gate", rest: "moat_well", treasure: "banner_hall", event: "banner_hall", first: "ash_gate" },
      win: "가렌: “큰 성문이 열렸소. 왕관의 길은 이어졌고, 남은 건 마지막 문뿐이오.”",
      lose: "요새 문지기: “열쇠는 없다. 재가 가라앉으면 이 문은 다시 닫힌다.”",
      winImg: "img/garen.webp", loseImg: "img/gatekeeper.png",
    },
    5: {
      no: 5, name: "왕좌 너머", door: "저택이 삼킨 마지막 문", boss: "아르", open: true, bgm: "sfx/bgm-stage5.mp3", bg: "img/stage5.webp",
      plan: [
        { kinds: ["battle", "battle"], tier: "t1" },
        { kinds: ["battle", "event", "meet:garen"], tier: "t1" },
        { kinds: ["elite", "battle"], tier: "t2" },
        { kinds: ["rest", "meet:mariel", "event"], tier: "t2" },
        { kinds: ["battle", "elite", "meet:leo"], tier: "t3" },
        { kinds: ["boss"], tier: "boss" },
      ],
      // 삼킨 문 셋의 적을 섞는다. 짝은 스테이지 1과 같은 AI(grunt/wolf) 자리로만
      packs: {
        t1: [["shade", "puppet"], ["wolf", "moss_turtle"]],
        t2: [["bat", "ember_fox"], ["puppet", "shadow_spear"]],
        t3: [["wolf", "shadow_spear"], ["moss_turtle", "shade"]],
        ambush: [["puppet", "ember_fox"]],
        elite: [["shade", "shadow_general"]],
        boss: [["ember_fox", "ar"]],
      },
      battleRooms: ["throne_steps", "door_hall", "echo_hall", "three_altar"],
      floorLine: [
        "왕좌 계단. 왕좌는 비었고, 그 뒤에 마지막 문이 있다.",
        "문들의 복도. 문 앞에 방패 하나가 서 있다.",
        "그림자 왕좌. 장군의 명이 마지막으로 남은 곳.",
        "마지막 우물. 문틈에 카드 한 장이 끼어 있다.",
        "표식의 방. 벽에 룬 한 획이 남았다.",
        "왕좌 너머. 아르가 저택을 카드처럼 펼쳤다.",
      ],
      meet: MEET5, reunionWith: ["garen", "mariel", "leo"],
      rooms: { elite: "shadow_throne", boss: "beyond_throne", rest: "last_well", treasure: "three_altar", event: "three_altar", first: "throne_steps" },
      win: "아린: “카드가 흩어졌다. 삼킨 문은 제 세계로 돌아간다. 이 저택도, 이제 문을 닫는다.”",
      lose: "아르: “셋을 카드 한 장에 접었다. 저택은 첫 문부터 다시 섞인다.”",
      winImg: "img/arin.png", loseImg: "img/ar.webp",
    },
  };
  function stageOf(run) { return STAGES[(run && run.stage) || 1] || STAGES[1]; }
  function openStages() { return Object.keys(STAGES).map(Number).filter(function (n) { return STAGES[n].open; }); }
  // 받침에 맞는 조사 (이/가, 은/는)
  function josa(name, a, b) {
    var c = name.charCodeAt(name.length - 1);
    var has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
    return name + (has ? a : b);
  }

  // 보물·전술 (rift TACTICS "기합"·"수호"를 게이지 효과로 옮김. 피해 공식은 안 건드림)
  var BOONS = {
    rally: { name: "전술 · 기합", text: "공격·스킬 뒤 다른 아군 필살 게이지 +5", mod: true },
    guard: { name: "전술 · 수호", text: "방어할 때 필살 게이지 +15 더", mod: true },
    holy: { name: "성수", text: "전원 HP +35 · 쓰러진 아군도 일으킴" },
    dawn: { name: "새벽 조각", text: "전원 필살 게이지 +50" },
    // 유물 (docs/GROWTH.md ③): 그 세계 동료가 Lv4 가 되면 고르기에 섞인다. 새 저장에는 안 나온다
    crown: { name: "유물 · 왕관 문장", text: "잿빛 왕관 아군, 전투 시작 필살 게이지 +20", mod: true, relic: "ashen" },
    arrow: { name: "유물 · 사냥 화살촉", text: "기본 공격 피해 +15%", mod: true, relic: "hunt" },
    queen: { name: "유물 · 여왕의 카드", text: "필살기를 쓰면 다른 아군 필살 게이지 +10", mod: true, relic: "deck" },
    healrune: { name: "유물 · 치유 룬", text: "전투에서 이기면 전원 최대 HP 10% 회복", mod: true, relic: "rune" },
  };
  // 강적 변종: 스테이지를 한 번 깨면 3층 강적 자리에 (수치·AI 같음)
  var VARIANT = {
    1: { id: "alpha_wolf", line: "서리 늑대 우두머리: 무리는 셋이었다. 이제 하나 남았다." },
    2: { id: "bat_lord", line: "흡혈 박쥐 군주: 거꾸로 매달린 건 너희다." },
    3: { id: "fox_elder", line: "불꽃여우 장로: 칸 하나 태우는 데 꼬리 하나면 된다." },
    4: { id: "spear_captain", line: "그림자 창병 대장: 누각은 넘겼다. 창은 넘기지 않는다." },
    5: { id: "knox_guard", line: "녹스: 여왕의 성문은 닫혔다. 그래서 여기서 근무한다." },
  };
  var VARIANT_XP = 25;
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

  function makeNode(r, kind, tier, used, st) {
    st = st || STAGES[1];
    var PK = st.packs, RM = st.rooms;
    if (kind.indexOf("meet:") === 0) {
      var who = kind.slice(5);
      var n = { kind: "meet", who: who, room: st.meet[who].room };
      used.push(n.room);
      return n;
    }
    var n = { kind: kind };
    if (kind === "battle") {
      var BR = st.battleRooms;
      var rooms = BR.filter(function (x) { return used.indexOf(x) < 0; });
      n.room = pickOf(r, rooms.length ? rooms : BR);
      // 같은 층 두 전투 칸은 다른 무리로
      var packs = PK[tier].filter(function (pk) { return used.indexOf("pack:" + pk.join(",")) < 0; });
      n.pack = pickOf(r, packs.length ? packs : PK[tier]).slice(); n.tier = tier;
      used.push("pack:" + n.pack.join(","));
    } else if (kind === "elite") { n.room = RM.elite; n.pack = PK.elite[0].slice(); n.tier = "elite"; }
    else if (kind === "boss") { n.room = RM.boss; n.pack = PK.boss[0].slice(); n.tier = "boss"; }
    else if (kind === "rest") n.room = RM.rest;
    else if (kind === "treasure") n.room = RM.treasure;
    else if (kind === "event") n.room = RM.event;
    used.push(n.room);
    return n;
  }

  // party: 출전 고르기에서 고른 셋 (없으면 시작 셋 = 지금과 같다)
  function newRun(seed, stage, diff, party, growth, extra) {
    if (seed == null) seed = (Date.now() & 0x7fffffff);
    var st = STAGES[stage] && STAGES[stage].plan ? STAGES[stage] : STAGES[1];
    var r = rng(seed);
    var map = st.plan.map(function (f) {
      var used = [];
      var kinds = f.kinds.slice();
      // 칸 순서만 섞는다 (종류 구성은 고정 → 난이도 일정)
      for (var i = kinds.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t; }
      return kinds.map(function (k) { return makeNode(r, k, f.tier, used, st); });
    });
    var active = validStart(party) ? party.slice() : C.PARTY.slice();
    var party = {};
    var g = growth || null;
    active.forEach(function (id) { party[id] = { hp: g && g[id] ? g[id].hp : C.CAST[id].hp, gauge: 0 }; });
    var run = {
      v: 2, stage: st.no, diff: diff === "hard" ? "hard" : "normal", seed: seed, floor: 0, map: map, path: [], party: party,
      active: active, roster: active.slice(), recruited: [], start: active.slice(),
      boons: [], over: null,
      stats: { battles: 0, rounds: 0, maxHit: 0, ults: 0, breaks: 0 },
    };
    // 성장 값(Lv2 이상·갈림길)이 있을 때만. 새 저장은 키 자체가 없다
    if (g) run.growth = g;
    // ③ 컨텐츠 (meta 가 있을 때만): 유물 후보 · 3층 강적 변종 · 균열 거울
    if (extra) {
      if (extra.relics && extra.relics.length) run.relicPool = extra.relics.filter(function (id) { return BOONS[id] && BOONS[id].relic; });
      if (extra.variant && VARIANT[st.no]) {
        map[2].forEach(function (n) {
          if (n.kind !== "elite") return;
          n.pack = n.pack.map(function (id) { return C.ENEMY[id].boss ? VARIANT[st.no].id : id; });
          n.variant = VARIANT[st.no].id;
        });
      }
      if (extra.mirror) run.mirror = 1;
    }
    return run;
  }

  function validStart(ids) {
    if (!Array.isArray(ids) || ids.length !== 3) return false;
    return ids.every(function (id, i) { return C.CAST[id] && ids.indexOf(id) === i; });
  }
  // 만남 대사에서 명단에 없는 사람이 말하는 줄은 뺀다 (시작 셋 그대로면 아무것도 안 빠진다)
  var NAME_ID = {};
  Object.keys(C.CAST).forEach(function (id) { NAME_ID[C.CAST[id].name] = id; });
  function present(run, who, lines) {
    var out = lines.filter(function (ln) { var id = NAME_ID[ln[0]]; return !id || id === who || run.roster.indexOf(id) >= 0; });
    return out.length ? out : lines;
  }
  // 이미 명단에 있는 동료의 만남 방: 영입 대신 보물 (docs/GROWTH.md ①)
  function meetKnown(run, who) { return run.roster.indexOf(who) >= 0; }

  function mods(run) {
    var o = { rally: run.boons.indexOf("rally") >= 0 ? 5 : 0, guardPlus: run.boons.indexOf("guard") >= 0 ? 15 : 0 };
    // 유물 (가진 때만 키가 생긴다)
    if (run.boons.indexOf("crown") >= 0) {
      o.startGauge = {};
      Object.keys(run.party).forEach(function (id) { if (C.CAST[id].origin === "ashen") o.startGauge[id] = 20; });
    }
    if (run.boons.indexOf("arrow") >= 0) o.basicMul = 1.15;
    if (run.boons.indexOf("queen") >= 0) o.ultShare = 10;
    return o;
  }

  function current(run) { return run.map[run.floor] || []; }

  // 전투 설정 (arena-core create 옵션)
  function battleConfig(run, node, seed) {
    var room = ROOMS[node.room] || ROOMS[stageOf(run).rooms.first];
    var ids = run.active && run.active.length === 3 ? run.active : C.PARTY.slice();
    var carry = {};
    ids.forEach(function (id) {
      var p = run.party[id];
      carry[id] = { hp: p.hp, gauge: Math.min(100, p.gauge + AFTER.gaugeStart) };
    });
    var cfg = {
      seed: seed,
      party: ids,
      waves: [{ name: room.name, enemies: node.pack.slice(), line: room.line,
        hpMul: enemyScale(run, node.tier).hp, atkMul: enemyScale(run, node.tier).atk }],
      carry: carry,
      mods: mods(run),
    };
    if (run.growth) cfg.growth = run.growth;
    // 동료 조합 (docs/SYNERGY.md): 켜진 게 있을 때만 키가 생긴다 (시작 셋 = 없음)
    var syn = C.synergyOf(ids);
    if (syn.length) cfg.syn = syn;
    return cfg;
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
    if (node.variant) run.bonusXp = (run.bonusXp || 0) + VARIANT_XP;
    if (node.kind === "boss") { run.over = "win"; return "win"; }
    if (run.boons.indexOf("healrune") >= 0) healAll(run, 0.1);
    return "next";
  }

  function maxHp(run, id) { var g = run && run.growth && run.growth[id]; return g ? g.hp : C.CAST[id].hp; }
  function healAll(run, frac, flat) {
    var out = {};
    Object.keys(run.party).forEach(function (id) {
      var p = run.party[id], m = maxHp(run, id);
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
    var pool = Object.keys(BOONS).filter(function (id) {
      if (BOONS[id].relic && !(run.relicPool && run.relicPool.indexOf(id) >= 0)) return false;
      return !BOONS[id].mod || run.boons.indexOf(id) < 0;
    });
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
      return { id: id, name: C.CAST[id].name, hp: p.hp, maxHp: maxHp(run, id), gauge: p.gauge, lv: run.growth && run.growth[id] ? run.growth[id].lv : 1 };
    });
  }
  function meetScript(run, who) {
    var st = stageOf(run), m = st.meet[who];
    if (!m) return [];
    if (meetKnown(run, who)) return present(run, who, m.reunion || m.open || m.arin || m.none || []);
    if (run.recruited.length >= 2) return present(run, who, m.full);
    var rw = [].concat(st.reunionWith || []);
    if (m.reunion && rw.some(function (id) { return run.active.indexOf(id) >= 0; })) return present(run, who, m.reunion);
    if (!m.arin) return present(run, who, m.open);   // 스테이지 1 가렌만 아린/세라/아리아 갈래가 따로 있다
    if (run.active.indexOf("arin") >= 0) return present(run, who, m.arin);
    if (run.active.indexOf("sera") >= 0) return present(run, who, m.sera);
    return present(run, who, m.none);
  }
  function recruit(run, who, benchId) {
    if (!stageOf(run).meet[who] || run.recruited.length >= 2) return null;
    if (run.roster.indexOf(who) >= 0) return null;
    if (run.active.indexOf(benchId) < 0) return null;
    run.roster.push(who);
    run.recruited.push(who);
    run.party[who] = { hp: maxHp(run, who), gauge: 0 };
    run.active[run.active.indexOf(benchId)] = who;
    return josa(C.CAST[who].name, "이", "가") + " 앞에 선다. " + josa(C.CAST[benchId].name, "은", "는") + " 우물에서 쉰다.";
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
    var st = stageOf(run);
    if (st.no !== 1) {
      var l2 = st.floorLine[run.floor] || "다음 문을 고르세요.";
      return run.floor === 0 ? l2 + " 문은 " + current(run).length + "개. 하나만 열 수 있다." : l2;
    }
    var a = run.active || [];
    var both = function (x, y) { return a.indexOf(x) >= 0 && a.indexOf(y) >= 0; };
    if (run.floor === 1 && both("arin", "sera")) return "세라: 폐하, 성문 깃발은 아직 저쪽입니다. 아린: 알아. 오늘은 우리가 먼저다.";
    if (run.floor === 2 && both("arin", "aria")) return "아리아: 왕관은 사람을 이렇게 데리고 다니나. 아린: 데리고 다닌 게 아니다. 같이 떨어졌다.";
    if (run.floor === 5 && both("arin", "garen")) return "가렌: 얼음은 방패가 먼저 받겠소. 아린: 나란히다. 뒤에 서지 마라.";
    var line = FLOOR_LINE[run.floor] || "다음 문을 고르세요.";
    if (run.floor === 0) return line + " 문은 " + current(run).length + "개. 하나만 열 수 있다.";
    return line;
  }
  function eliteLine(run, node) {
    if (node && node.variant && VARIANT[stageOf(run).no]) return VARIANT[stageOf(run).no].line;
    if (stageOf(run).no !== 1) return ROOMS[stageOf(run).rooms.elite].line;
    if (run.active && run.active.indexOf("arin") >= 0) return "아린: 장군은 내 명을 듣던 자다. 그 명은 이미 더럽혀졌다.";
    return ROOMS.watch.line;
  }

  function validRun(o) {
    return !!(o && o.v === 2 && (o.stage == null || (STAGES[o.stage] && STAGES[o.stage].open)) && Array.isArray(o.map) && o.map.length === FLOORS && o.party && Array.isArray(o.active) && o.active.length === 3 && typeof o.floor === "number" && !o.over);
  }

  var api = {
    SAVE_KEY: SAVE_KEY, FLOORS: FLOORS, ROOMS: ROOMS, KIND: KIND, PACKS: PACKS, FLOOR_PLAN: FLOOR_PLAN,
    SCALE: SCALE, DIFF: DIFF, DIFF_KEY: DIFF_KEY, diffOf: diffOf, enemyScale: enemyScale, BOONS: BOONS, REST: REST, AFTER: AFTER, EVENT: EVENT,
    STAGES: STAGES, stageOf: stageOf, openStages: openStages, josa: josa, STAGE_KEY: "fcb-stages-v1",
    newRun: newRun, current: current, battleConfig: battleConfig, applyBattle: applyBattle,
    healAll: healAll, addGauge: addGauge, gainBoon: gainBoon, boonOffer: boonOffer, rollEvent: rollEvent,
    choose: choose, advance: advance, maxHp: maxHp, VARIANT: VARIANT, VARIANT_XP: VARIANT_XP, partySummary: partySummary, validRun: validRun, mods: mods, meetScript: meetScript, meetKnown: meetKnown, recruit: recruit, setActive: setActive, mapLine: mapLine, eliteLine: eliteLine,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FCBRun = api;
})(this);
