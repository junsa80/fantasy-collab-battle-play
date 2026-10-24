/* 환상 콜라보 — 동료 의뢰 (연계 퀘스트 · docs/QUESTS.md, 이슈 #4 t336u)
   본편 스테이지 1~5 와 따로 도는 짧은 던전 4개. 특정 동료를 영입해야 그 동료가 단서를 말하고, 단서를 들으면 던전이 열린다.
   한 의뢰를 끝내면 다음 의뢰 단서가 나온다 (오데트 → 마리엘, 노엘 → 노엘·카엘).
   진행 저장: localStorage "fcb-quest-v1" = { v: 1, heard: {id:1}, clears: {id:n}, hard: {id:n}, done: {id:1} }
   던전 규칙은 run-core 그대로(방·전투·휴식·보물·균열). 적 수치·AI·SCALE·하드 배율은 그대로, 층 수(4)와 적 무리만 다르다.
   DOM 없음 → node 시뮬(tools/quest-sim.js) 가능. run-sim 기본 출력은 이 파일을 읽지 않는다.
*/
(function (root) {
  "use strict";
  var R = root.FCBRun || (typeof require !== "undefined" ? require("./run-core.js") : null);
  var M = root.FCBMeta || (typeof require !== "undefined" ? require("./meta.js") : null);
  var KEY = "fcb-quest-v1";

  // 던전 방 (한 줄 = 방 머리말)
  var ROOMS = {
    q1_stacks: { name: "거꾸로 서가", line: "책등이 천장을 향해 꽂혀 있다. 먼지는 위로 쌓인다." },
    q1_index: { name: "색인 방", line: "색인 카드가 바닥에서 천장 쪽으로 정렬돼 있다." },
    q1_log: { name: "근무 일지 서가", line: "같은 필체가 삼백 장째 이어진다." },
    q1_lamp: { name: "꺼진 등불 방", line: "등불은 거꾸로 매달려 있다. 오늘 밤은 꺼졌다." },
    q1_inkwell: { name: "잉크 샘", line: "잉크병 아래 맑은 물이 고였다. 값을 내면 마실 수 있다." },
    q1_night_desk: { name: "야간 근무대", line: "녹스: 근무 일지는 내가 쓴다. 마지막 줄은 아직 아니다." },
    q2_frames: { name: "매달린 액자", line: "액자 속 여왕이 거꾸로 웃는다." },
    q2_deck: { name: "흩어진 덱", line: "카드 쉰한 장. 한 장이 모자란다." },
    q2_thread: { name: "은실 회랑", line: "끊긴 은실이 위로 늘어졌다." },
    q2_stage: { name: "뒤집힌 무대", line: "막은 아래에서 위로 오른다." },
    q2_belfry: { name: "종탑 발코니", line: "가고일: 이 종은 거꾸로 울린다. 너희를 위해." },
    q2_dew: { name: "거꾸로 이슬", line: "천장의 이슬이 위로 떨어진다. 값을 내면 마실 수 있다." },
    q2_roost: { name: "박쥐 둥지", line: "흡혈 박쥐 군주: 거꾸로 매달린 패는 거꾸로 읽어야지." },
    q3_ash: { name: "재 고랑", line: "고랑마다 글자 대신 재가 쌓였다." },
    q3_stake: { name: "그을린 말뚝", line: "눈금 반쪽이 타서 지워졌다." },
    q3_shed: { name: "빈 헛간", line: "벽의 월급표가 반만 남았다." },
    q3_canal: { name: "마른 수로", line: "물길이 칸 경계에서 끊겼다." },
    q3_gate: { name: "불탄 관문", line: "관문 파괴자: 타 버린 칸은 부수기도 쉽다." },
    q3_spring: { name: "남은 샘", line: "재 밑에서 샘 하나가 살아 있다. 값을 내면 마실 수 있다." },
    q3_burnt: { name: "불탄 칸", line: "불꽃여우 장로: 칸 하나 태우는 데 꼬리 하나면 된다." },
    q4_door: { name: "기록고 입구", line: "하르트만 문장이 문틀에 반쯤 남았다." },
    q4_shelves: { name: "장부 서가", line: "같은 표지의 장부가 끝없이 꽂혀 있다." },
    q4_keyroom: { name: "열쇠 대장실", line: "열쇠 고리는 비었고 서명란만 남았다." },
    q4_armor: { name: "갑옷 보관소", line: "하르트만 갑옷 한 벌이 비어 있다." },
    q4_post: { name: "기록고 초소", line: "그림자 기사: 장부는 그림자가 지킨다." },
    q4_cistern: { name: "기록고 물탱크", line: "차가운 물이다. 값을 내면 상처를 씻을 수 있다." },
    q4_vault: { name: "열쇠 금고", line: "그림자 창병 대장: 누각은 넘겼다. 장부는 넘기지 않는다." },
  };

  // 의뢰 4. need = 출전 필수(영입해 있어야 단서가 나온다) · after = 먼저 끝낼 의뢰
  var LIST = ["q1", "q2", "q3", "q4"];
  var QUESTS = {
    q1: {
      id: "q1", no: "q1", scene: 2, name: "제18조", place: "거꾸로 선 서고", who: "odette", need: ["odette"], after: null,
      door: "미녀 덱 · 오데트", boss: "녹스 — 저택 경비", bgm: "sfx/bgm-stage2.mp3", bg: "img/stage2.webp",
      lead: [
        ["오데트", "제17조까지 적었는데, 제18조 자리가 통째로 비어 있어요."],
        ["아린", "비어 있는 조항이라. 무엇을 정하는 조항이지."],
        ["오데트", "누가 언제 근무를 끝내도 되는지요. 뒤집힌 홀 서고 지하에서 누가 아직 근무 일지를 쓰고 있어요."],
      ],
      intro: "서고 지하에 녹스의 근무 일지가 있다. 오데트는 비어 있는 제18조를 채우려 한다.",
      plan: [
        { kinds: ["battle", "battle"], tier: "t1" },
        { kinds: ["battle", "event", "treasure"], tier: "t2" },
        { kinds: ["rest", "battle"], tier: "t2" },
        { kinds: ["boss"], tier: "boss" },
      ],
      packs: {
        t1: [["puppet", "puppet"], ["bat", "puppet"]],
        t2: [["bat", "bat"], ["puppet", "bat"]],
        ambush: [["puppet", "bat"]],
        elite: [["puppet", "gargoyle"]],
        boss: [["puppet", "knox_guard"]],
      },
      battleRooms: ["q1_stacks", "q1_index", "q1_log", "q1_lamp"],
      rooms: { elite: "q1_lamp", boss: "q1_night_desk", rest: "q1_inkwell", treasure: "q1_index", event: "q1_index", first: "q1_stacks" },
      floorLine: [
        "서고 지하. 책장이 거꾸로 꽂혀 있고, 글자는 바로 읽힌다.",
        "오데트: 근무 일지예요. 한 사람이 삼백 밤을 혼자 섰어요.",
        "오데트: 마지막 장 서명이 녹스예요. 아직 퇴근을 못 했어요.",
        "야간 근무대. 녹스가 성문 대신 서고 문을 지킨다.",
      ],
      bossTalk: [["오데트", "녹스. 제18조를 찾았어요. 근무는 끝날 수 있다."], ["녹스", "적힌 적 없는 조항이다. 나는 적힌 것만 지킨다."]],
      win: "오데트: “제18조. 근무는 끝날 수 있다. 녹스, 오늘이 그날이에요.”",
      lose: "녹스: “일지에 한 줄 더. 침입자, 퇴근 처리.”",
      winImg: "img/odette.webp", loseImg: "img/knox.webp",
      chapter: { title: "오데트 · 제18조", text: "오데트는 미녀 덱 왕성의 기록관이었다. 여왕은 법전을 열일곱 조까지만 공표했고, 제18조는 ‘언젠가 적을 것’으로 비워 두었다. 그 빈칸 때문에 성문 경비 녹스는 교대 없이 삼백 밤을 섰다. 서고 지하에서 찾은 건 조항이 아니라 일지였고, 오데트는 그 마지막 장에 직접 제18조를 적었다 — 근무는 끝날 수 있다. 일지 맨 뒤에는 여왕 문장이 찍힌 카드 한 장이 끼워져 있었다." },
      reward: { xp: { odette: 100 }, relic: null, next: "q2" },
    },
    q2: {
      id: "q2", no: "q2", scene: 2, name: "마지막 패", place: "거꾸로 매달린 회랑", who: "mariel", need: ["mariel"], after: "q1",
      door: "미녀 덱 · 마리엘", boss: "흡혈 박쥐 군주", bgm: "sfx/bgm-stage2.mp3", bg: "img/stage2.webp",
      lead: [
        ["오데트", "녹스 일지 맨 뒤에 카드 한 장이 끼워져 있었어요. 여왕의 문장이에요."],
        ["마리엘", "내 덱에서 빠진 패다. 판을 끝낼 때 쓰는 마지막 패."],
        ["마리엘", "그 카드가 가리키는 곳은 거꾸로 매달린 회랑 끝, 박쥐 둥지다. 남은 패는 거기 매달려 있다."],
      ],
      intro: "여왕의 마지막 패가 박쥐 둥지에 매달려 있다. 마리엘은 끝나지 않는 판을 끝내려 한다.",
      plan: [
        { kinds: ["battle", "battle"], tier: "t1" },
        { kinds: ["elite", "battle"], tier: "t2" },
        { kinds: ["rest", "event"], tier: "t2" },
        { kinds: ["boss"], tier: "boss" },
      ],
      packs: {
        t1: [["puppet", "bat"], ["bat", "puppet"]],
        t2: [["bat", "bat"], ["puppet", "bat"]],
        ambush: [["bat", "puppet"]],
        elite: [["puppet", "gargoyle"]],
        boss: [["bat", "bat_lord"]],
      },
      battleRooms: ["q2_frames", "q2_deck", "q2_thread", "q2_stage"],
      rooms: { elite: "q2_belfry", boss: "q2_roost", rest: "q2_dew", treasure: "q2_deck", event: "q2_deck", first: "q2_frames" },
      floorLine: [
        "회랑 천장에 액자가 매달려 있다. 아니, 바닥이다.",
        "마리엘: 이 회랑은 같은 패를 세 번 돌린다. 읽으면 이긴다.",
        "마리엘: 박쥐 소리다. 마지막 패는 저 위, 아니 저 아래다.",
        "박쥐 둥지. 군주가 여왕의 카드를 날개에 끼웠다.",
      ],
      bossTalk: [["마리엘", "그 패는 내 거다. 네 날개에 끼울 패가 아니다."], ["흡혈 박쥐 군주", "패는 쥔 자의 것. 매달린 자의 것이다."]],
      win: "마리엘: “마지막 패를 찾았다. 이제 어떤 판이든 끝낼 수 있다.”",
      lose: "흡혈 박쥐 군주: “패는 거꾸로 매달린 채로. 다음 판에.”",
      winImg: "img/mariel.webp", loseImg: "img/bat.webp",
      chapter: { title: "마리엘 · 마지막 패", text: "마리엘은 미녀 덱의 독자, 패를 읽어 상대의 다음 수를 맞히는 사람이다. 저택이 왕성 홀을 삼키던 밤, 덱에서 단 한 장 — 여왕이 판을 끝낼 때 쓰는 마지막 패가 빠졌다. 그 패가 없으면 어떤 판도 끝나지 않는다. 박쥐 둥지에서 되찾은 패 뒷면에는 오데트의 필체로 ‘제18조 참조’가 적혀 있었다. 판도, 근무도, 끝날 수 있다." },
      reward: { xp: { mariel: 100, odette: 40 }, relic: "lastcard", next: null },
    },
    q3: {
      id: "q3", no: "q3", scene: 3, name: "칸 값", place: "불탄 고랑", who: "noel", need: ["noel"], after: null,
      door: "룬 영토 · 노엘", boss: "불꽃여우 장로", bgm: "sfx/bgm-stage3.mp3", bg: "img/stage3.webp",
      lead: [
        ["노엘", "장부에 갚지 못한 칸이 하나 남았다. 레오가 지키던 칸이다."],
        ["노엘", "룬 밭 아래 불탄 고랑. 누가 그 칸을 태웠는지, 장부엔 이름 대신 재가 적혔다."],
        ["아린", "재로 적힌 이름이라. 찾아가서 읽자."],
      ],
      intro: "레오가 지키던 칸이 불탔다. 노엘은 장부의 ‘미납’ 한 줄을 정리하러 간다.",
      plan: [
        { kinds: ["battle", "battle"], tier: "t1" },
        { kinds: ["elite", "battle", "event"], tier: "t2" },
        { kinds: ["rest", "battle"], tier: "t3" },
        { kinds: ["boss"], tier: "boss" },
      ],
      packs: {
        t1: [["moss_turtle", "moss_turtle"], ["ember_fox", "moss_turtle"]],
        t2: [["ember_fox", "ember_fox"], ["moss_turtle", "ember_fox"]],
        t3: [["ember_fox", "ember_fox"], ["moss_turtle", "moss_turtle"]],
        ambush: [["moss_turtle", "ember_fox"]],
        elite: [["moss_turtle", "gate_breaker"]],
        boss: [["ember_fox", "fox_elder"]],
      },
      battleRooms: ["q3_ash", "q3_stake", "q3_shed", "q3_canal"],
      rooms: { elite: "q3_gate", boss: "q3_burnt", rest: "q3_spring", treasure: "q3_shed", event: "q3_shed", first: "q3_ash" },
      floorLine: [
        "룬 밭 아래. 고랑마다 글자 대신 재가 쌓였다.",
        "노엘: 칸 값은 거짓말을 안 한다. 태운 자는 값을 치른다.",
        "노엘: 재 냄새가 진하다. 장부의 빈칸이 이 근처다.",
        "불탄 칸. 장로가 꼬리 하나로 칸을 태운다.",
      ],
      bossTalk: [["노엘", "장로. 레오의 칸을 태운 건 너다. 장부에 재가 남았다."], ["불꽃여우 장로", "재는 값이 없다. 갚을 것도 없다."]],
      bossTalkWith: { leo: ["레오", "노엘. 그 칸 값은 내가 같이 받는다."] },
      win: "노엘: “장부를 닫는다. 레오의 칸 값은 오늘로 완납이다.”",
      lose: "불꽃여우 장로: “장부째로 태워 주지. 재는 적을 수 없으니.”",
      winImg: "img/noel.webp", loseImg: "img/ember_fox.webp",
      chapter: { title: "노엘 · 칸 값", text: "노엘은 룬 영토의 감사관이다. 영토의 칸에는 저마다 값이 있고, 그 값은 칸을 지킨 사람에게 돌아간다. 레오가 지키던 칸이 불탄 날, 장부에는 지킨 사람 대신 재가 적혔고 노엘은 그 줄을 ‘미납’으로 남겼다. 불탄 고랑에서 장로를 꺾은 뒤에야 그 줄은 ‘완납’이 되었다. 그런데 재 밑에서 나온 장부 쪽지에는 다른 세계의 문장 — 하르트만 가의 인장이 찍혀 있었다." },
      reward: { xp: { noel: 100 }, relic: null, next: "q4" },
    },
    q4: {
      id: "q4", no: "q4", scene: 4, name: "두 권의 장부", place: "하르트만 기록고", who: "kael", need: ["noel", "kael"], after: "q3",
      door: "잿빛 왕관 · 카엘 + 노엘", boss: "그림자 창병 대장", bgm: "sfx/bgm-stage4.mp3", bg: "img/stage4.webp",
      lead: [
        ["노엘", "재 밑 쪽지에 하르트만 인장이 찍혀 있었다. 카엘, 네 집안 것이다."],
        ["카엘", "…성문 장부의 찢긴 쪽이다. 성문 열쇠를 받은 이름이 거기 있었다."],
        ["노엘", "두 권을 맞춰 보자. 틀린 데가 보일 거다."],
      ],
      intro: "하르트만 가는 성문을 판 집안으로 몰렸다. 카엘과 노엘은 두 권의 장부를 맞춰 진짜 이름을 찾는다.",
      plan: [
        { kinds: ["battle", "battle"], tier: "t1" },
        { kinds: ["elite", "battle", "event"], tier: "t2" },
        { kinds: ["rest", "treasure"], tier: "t3" },
        { kinds: ["boss"], tier: "boss" },
      ],
      packs: {
        t1: [["shade", "shade"], ["shadow_spear", "shade"]],
        t2: [["shadow_spear", "shadow_spear"], ["shade", "shadow_spear"]],
        t3: [["shadow_spear", "shadow_spear"], ["shade", "shade"]],
        ambush: [["shade", "shadow_spear"]],
        elite: [["shade", "shadow_knight"]],
        boss: [["shadow_spear", "spear_captain"]],
      },
      battleRooms: ["q4_door", "q4_shelves", "q4_keyroom", "q4_armor"],
      rooms: { elite: "q4_post", boss: "q4_vault", rest: "q4_cistern", treasure: "q4_keyroom", event: "q4_keyroom", first: "q4_door" },
      floorLine: [
        "무너진 성문 아래 기록고. 하르트만 가의 장부가 쌓여 있다.",
        "카엘: 성문 열쇠 수령인. 이 줄만 찢겨 있다.",
        "노엘: 내 쪽지와 맞추면 이름이 나온다. 그림자 창병 대장.",
        "열쇠 금고. 창병 대장이 열쇠 대신 창을 쥐었다.",
      ],
      bossTalk: [["카엘", "성문을 연 건 네가 열쇠를 받아서다. 장부에 다 있다."], ["그림자 창병 대장", "몰락한 집 장부를 누가 믿나."], ["노엘", "감사가 믿는다. 두 권이 맞으면 그게 증거다."]],
      win: "카엘: “하르트만은 성문을 팔지 않았다. 두 권의 장부가 그걸 증명했다.”",
      lose: "그림자 창병 대장: “장부는 다시 찢는다. 몰락한 이름과 함께.”",
      winImg: "img/kael.png", loseImg: "img/shadow_spear.png",
      chapter: { title: "카엘 · 두 권의 장부", text: "하르트만 가는 성문 열쇠를 맡던 집안이었다. 성문이 그림자에게 열린 밤, 사람들은 열쇠를 맡은 집을 탓했고 하르트만은 몰락했다. 카엘은 갑옷과 찢긴 장부 한 권만 들고 버텼다. 노엘의 감사 장부에서 나온 쪽지와 맞추자 찢긴 줄이 이어졌다 — 열쇠를 받은 이름은 그림자 창병 대장. 하르트만은 문을 판 적이 없다. 카엘은 장부를 덮고 처음으로 투구를 벗었다." },
      reward: { xp: { kael: 100, noel: 40 }, relic: "seal", next: null },
    },
  };

  // run-core 에 던전·방 등록 (본편 STAGES 는 그대로 → run-sim 기본 출력 그대로)
  Object.keys(ROOMS).forEach(function (k) { R.ROOMS[k] = ROOMS[k]; });
  LIST.forEach(function (id) { var q = QUESTS[id]; q.meet = {}; R.addQuest(q); });

  // ---------- 진행 ----------
  function fresh() { return { v: 1, heard: {}, clears: {}, hard: {}, done: {} }; }
  function normalize(o) {
    if (!o || o.v !== 1) return fresh();
    ["heard", "clears", "hard", "done"].forEach(function (k) { if (!o[k] || typeof o[k] !== "object") o[k] = {}; });
    return o;
  }
  function cleared(qs, id) { return !!(qs.clears[id] || qs.hard[id]); }
  // 상태: locked(동료·앞 의뢰 부족) · lead(단서 들을 수 있음) · open(출발 가능) · clear(끝냄)
  function state(qs, m, id) {
    var q = QUESTS[id];
    if (cleared(qs, id)) return "clear";
    var miss = missing(qs, m, id);
    if (miss.length) return "locked";
    return qs.heard[id] ? "open" : "lead";
  }
  // 잠금 이유 (화면 힌트용). [{ kind: "after"|"who", id }]
  function missing(qs, m, id) {
    var q = QUESTS[id], out = [];
    if (q.after && !cleared(qs, q.after)) out.push({ kind: "after", id: q.after });
    q.need.forEach(function (w) { if ((m.unlocked || []).indexOf(w) < 0) out.push({ kind: "who", id: w }); });
    return out;
  }
  function hint(qs, m, id) {
    var C = root.FCBCore || require("./arena-core.js");
    var miss = missing(qs, m, id);
    var who = miss.filter(function (x) { return x.kind === "who"; }).map(function (x) { return C.CAST[x.id].name; });
    var aft = miss.filter(function (x) { return x.kind === "after"; })[0];
    var parts = [];
    if (aft) { var nm = QUESTS[aft.id].name; parts.push("「" + nm + "」" + R.josa(nm, "을", "를").slice(nm.length) + " 끝내면 다음 단서가 나온다"); }
    if (who.length) parts.push(R.josa(who.join("·"), "을", "를") + " 영입하면 정보를 얻을 수 있다");
    return parts.join(" · ");
  }
  function hear(qs, m, id) { if (state(qs, m, id) !== "lead") return false; qs.heard[id] = 1; return true; }
  function progress(qs) { return LIST.filter(function (id) { return cleared(qs, id); }).length; }
  function newLeads(qs, m) { return LIST.filter(function (id) { return state(qs, m, id) === "lead"; }); }
  // 보상 유물: 끝낸 의뢰의 유물 (보물 고르기에 섞인다)
  function relics(qs) { return LIST.filter(function (id) { return qs.done[id] && QUESTS[id].reward.relic; }).map(function (id) { return QUESTS[id].reward.relic; }); }
  // 출전 셋이 필수 동료를 다 품었는가
  function partyOk(id, ids) { return QUESTS[id].need.every(function (w) { return ids.indexOf(w) >= 0; }); }
  // 승리 기록 + 첫 클리어 보상 (경험치는 meta 에 바로). 반환 = 보상 요약
  function complete(qs, m, id, hard) {
    var q = QUESTS[id];
    if (hard) qs.hard[id] = (qs.hard[id] || 0) + 1; else qs.clears[id] = (qs.clears[id] || 0) + 1;
    if (qs.done[id]) return { first: false, xp: [], relic: null, next: null };
    qs.done[id] = 1;
    var xp = [];
    Object.keys(q.reward.xp).forEach(function (w) {
      if ((m.unlocked || []).indexOf(w) < 0) return;
      var r = M.addXp(m, w, q.reward.xp[w]);
      if (r) xp.push(r);
    });
    return { first: true, xp: xp, relic: q.reward.relic, next: q.reward.next };
  }
  function bossTalk(id, active) {
    var q = QUESTS[id], out = q.bossTalk.slice();
    if (q.bossTalkWith) Object.keys(q.bossTalkWith).forEach(function (w) { if ((active || []).indexOf(w) >= 0) out.push(q.bossTalkWith[w]); });
    return out;
  }

  var api = { KEY: KEY, LIST: LIST, QUESTS: QUESTS, ROOMS: ROOMS, fresh: fresh, normalize: normalize, state: state, missing: missing, hint: hint, hear: hear,
    cleared: cleared, progress: progress, newLeads: newLeads, relics: relics, partyOk: partyOk, complete: complete, bossTalk: bossTalk };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FCBQuest = api;
})(this);
