/* 환상 콜라보 — 균열 런 UI: 타이틀 → 방 선택(지도) → 조우 → 전투(arena.js) → 다음 층 … → 보스 → 결과
   규칙·수치: js/run-core.js (FCBRun). 전투: js/arena.js (window.__fcb.start).
   저장: localStorage "fcb-run-v1" (방 선택·조우 화면에서만 저장. 전투 중 나가면 그 방 앞에서 이어함)
   테스트 훅: window.__fcbRun
*/
(function () {
  "use strict";
  var C = window.FCBCore, R = window.FCBRun, A = window.__fcb, SND = window.FCBSound;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = A.esc;
  var run = null;

  var HINT = {
    shade: "무작위 한 명을 벤다",
    wolf: "가장 다친 아군을 노린다",
    shadow_general: "⚠ 그림자 명령(전체) 충전 → 피해를 모아 BREAK",
    celes: "❄ 얼음 기둥 예고 · ⚠ 서리 노바 충전(전체+빙결)",
    puppet: "무작위 한 명을 실로 당긴다",
    bat: "가장 다친 아군을 문다",
    gargoyle: "⚠ 석상의 포효(전체) 충전 → 피해를 모아 BREAK",
    knox: "⬇ 성문 내리치기 예고 · ⚠ 여왕의 경계령 충전(전체+결박)",
  };
  function eliteName(n) { var id = n.pack.filter(function (x) { return C.ENEMY[x].boss; })[0]; return id ? C.ENEMY[id].name : "강적"; }
  var KIND_DESC = {
    battle: function (n) { return n.pack.map(function (id) { return C.ENEMY[id].name; }).join(" · "); },
    elite: function (n) { return eliteName(n) + " · 이기면 전술·보물 선택"; },
    rest: function () { return "우물 HP 50% 회복 또는 명상 게이지 +40"; },
    treasure: function () { return "보물·전술 둘 중 하나"; },
    event: function () { return "균열 주사위: 보물 또는 기습"; },
    meet: function (n) { return C.CAST[n.who].name + " · 데려가면 한 명이 쉰다"; },
    // 559c57e 에서 빠져 6층 지도가 멈추던 것 복구 (26b428e 문구: 셀레스 · 서리 늑대)
    boss: function (n) { return n.pack.slice().reverse().map(function (id) { return C.ENEMY[id].name; }).join(" · "); },
  };

  // ---------- 저장 ----------
  function save() {
    try {
      if (run && !run.over) localStorage.setItem(R.SAVE_KEY, JSON.stringify(run));
      else localStorage.removeItem(R.SAVE_KEY);
    } catch (e) {}
  }
  function loadSave() {
    try { var o = JSON.parse(localStorage.getItem(R.SAVE_KEY) || "null"); return R.validRun(o) ? o : null; } catch (e) { return null; }
  }

  // ---------- 공통 ----------
  function floorText() { return (Math.min(run.floor, R.FLOORS - 1) + 1) + "층 / " + R.FLOORS + "층"; }
  function partyHtml() {
    return R.partySummary(run).map(function (p) {
      var cd = C.CAST[p.id];
      return '<div class="pm" style="--c:' + cd.color + '">' +
        '<img class="' + (cd.pixel ? "px" : "") + '" src="' + cd.img + '" alt="" />' +
        '<div class="pm-t"><b>' + esc(p.name) + '</b><span>' + p.hp + "/" + p.maxHp + "</span></div>" +
        '<div class="pm-bars"><div class="bar hp"><i style="width:' + (p.hp / p.maxHp * 100) + '%"></i></div>' +
        '<div class="bar gbar"><i style="width:' + p.gauge + '%"></i></div></div></div>';
    }).join("");
  }
  function boonText() {
    if (!run.boons.length) return "전술 없음";
    return run.boons.map(function (b) { return R.BOONS[b].name.replace("전술 · ", ""); }).join(" · ");
  }
  function btn(label, sub, cls, onClick, id) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn " + (cls || "");
    if (id) b.id = id;
    b.innerHTML = esc(label) + (sub ? "<small>" + esc(sub) + "</small>" : "");
    b.addEventListener("click", onClick);
    return b;
  }

  // ---------- 스테이지 ----------
  function stage() { return R.stageOf(run); }
  function stageScene() {
    var st = stage();
    document.body.dataset.stage = String(st.no);
    if (SND) { if (st.bgm) SND.bgm(st.bgm); else SND.stopBgm(); }
  }
  function leaveScene() { document.body.dataset.stage = ""; if (SND) SND.stopBgm(); }
  function loadStages() {
    try { var o = JSON.parse(localStorage.getItem(R.STAGE_KEY) || "null"); if (o && o.v === 1) return o; } catch (e) {}
    return { v: 1, clears: {}, last: 1 };
  }
  function saveStages(o) { try { localStorage.setItem(R.STAGE_KEY, JSON.stringify(o)); } catch (e) {} }

  // ---------- 지도 ----------
  function showMap() {
    run.pending = null; save();
    stageScene();
    $("#map-sub").textContent = stage().name + " · 다음 방을 고르세요";
    $("#map-floor").textContent = floorText();
    $("#map-boons").textContent = boonText();
    var track = $("#track"); track.innerHTML = "";
    run.map.forEach(function (nodes, f) {
      var li = document.createElement("li");
      var cls = f < run.floor ? "done" : f === run.floor ? "now" : "";
      var label;
      if (f < run.floor) { var n = nodes[run.path[f]]; label = R.KIND[n.kind].icon; }
      else if (nodes.length === 1) label = R.KIND[nodes[0].kind].icon;
      else label = String(f + 1);
      li.className = cls + (nodes[0].kind === "boss" ? " boss" : "");
      li.innerHTML = "<b>" + label + "</b><span>" + (f + 1) + "층</span>";
      track.appendChild(li);
    });
    var cur = R.current(run);
    $("#map-line").textContent = R.mapLine(run);
    var box = $("#choices"); box.innerHTML = "";
    cur.forEach(function (n, i) {
      var k = R.KIND[n.kind], room = R.ROOMS[n.room];
      var b = document.createElement("button");
      b.type = "button"; b.className = "node k-" + n.kind; b.dataset.idx = i;
      var faces = n.pack ? '<span class="faces">' + n.pack.map(function (id) {
        var e = C.ENEMY[id]; return '<img class="' + (e.pixel ? "px" : "") + '" src="' + e.img + '" alt="" />';
      }).join("") + "</span>" : "";
      b.innerHTML = '<span class="n-ic">' + k.icon + '</span><span class="n-t"><b>' + esc(k.name) + " · " + esc(room.name) + "</b><small>" + esc(KIND_DESC[n.kind](n)) + "</small></span>" + faces;
      b.addEventListener("click", function () { enterNode(i); });
      box.appendChild(b);
    });
    var nx = run.map[run.floor + 1];
    $("#map-next").textContent = nx ? "다음 층: " + nx.map(function (n) { return R.KIND[n.kind].icon + " " + R.KIND[n.kind].name; }).join(" · ") : "이 방을 넘으면 결전.";
    $("#map-party").innerHTML = partyHtml();
    A.show("scr-map");
  }

  // ---------- 조우 ----------
  function enterNode(i) {
    var node = R.choose(run, i); if (!node) return;
    run.pending = { idx: i };
    save();
    showNode();
  }
  function curNode() { return run.pending ? R.current(run)[run.pending.idx] : null; }

  function showNode() {
    var node = curNode(); if (!node) return showMap();
    stageScene();
    var p = run.pending, k = R.KIND[node.kind], room = R.ROOMS[node.room];
    $("#node-floor").textContent = floorText();
    $("#node-kind").textContent = k.icon + " " + k.name + " · " + room.name;
    var line = node.kind === "elite" ? R.eliteLine(run) : room.line;
    $("#room-head").innerHTML = "<b>" + esc(room.name) + '</b><p>“' + esc(line) + "”</p>";
    var body = $("#room-body"), acts = $("#room-actions");
    body.innerHTML = ""; acts.innerHTML = "";
    $("#scr-node").dataset.kind = node.kind;
    var fightPack = null, scale = null;

    if (p.reward) {
      body.innerHTML = '<p class="room-msg">' + esc(p.msg || "하나를 고르세요.") + "</p>";
      p.reward.forEach(function (id, j) {
        var b = R.BOONS[id];
        acts.appendChild(btn(b.name, b.text, j === 0 ? "primary" : "", function () { takeBoon(id); }, "boon-" + j));
      });
      acts.appendChild(btn("그냥 간다", "받지 않고 다음 층", "ghost", function () { nextFloor(); }, "btn-skip"));
    } else if (p.won) {
      body.innerHTML = '<p class="room-msg">' + esc(p.msg) + "</p>";
      acts.appendChild(btn("다음 층으로", "지도로 돌아갑니다", "primary big", nextFloor, "btn-next"));
    } else if (node.kind === "meet") {
      if (p.bench) {
        body.innerHTML = '<p class="room-msg">누구를 우물에서 쉬게 할까. 셋은 그대로다.</p>';
        run.active.forEach(function (id) {
          acts.appendChild(btn(C.CAST[id].name + "을 쉬게 한다", "그 자리에 " + C.CAST[node.who].name + "이 선다", "", function () {
            var msg = R.recruit(run, node.who, id);
            if (!msg) return;
            doneMsg(msg);
          }, "bench-" + id));
        });
      } else {
        var lines = R.meetScript(run, node.who);
        body.innerHTML = lines.map(function (ln) {
          return '<p class="room-msg"><b>' + esc(ln[0]) + '</b> ' + esc(ln[1]) + "</p>";
        }).join("");
        var full = run.recruited.length >= 2;
        if (!full) acts.appendChild(btn("데려간다", "출전 중인 한 명을 쉬게 한다", "primary", function () {
          p.bench = true; save(); showNode();
        }, "btn-take"));
        acts.appendChild(btn("남긴다", full ? "이 저택은 이름을 더 받지 않는다" : "이 층은 그냥 지나간다", "ghost", nextFloor, "btn-skip"));
      }
    } else if (node.kind === "rest" && p.swap) {
      if (!p.pick) p.pick = run.active.slice();
      body.innerHTML = '<p class="room-msg">출전은 셋. 쉬는 사람은 우물에 남는다.</p>';
      run.roster.forEach(function (id) {
        var on = p.pick.indexOf(id) >= 0;
        acts.appendChild(btn((on ? "출전 · " : "쉼 · ") + C.CAST[id].name, on ? "누르면 쉰다" : "누르면 세운다", on ? "primary" : "", function () {
          var i = p.pick.indexOf(id);
          if (i >= 0) p.pick.splice(i, 1);
          else if (p.pick.length < 3) p.pick.push(id);
          save(); showNode();
        }));
      });
      var ok3 = p.pick.length === 3;
      acts.appendChild(btn("이 셋으로 둔다", ok3 ? "우물로 돌아간다" : "셋을 고르세요", ok3 ? "primary" : "", function () {
        if (!R.setActive(run, p.pick)) return;
        delete p.swap; delete p.pick; save(); showNode();
      }, "btn-swap-ok"));
    } else if (node.kind === "rest") {
      body.innerHTML = '<p class="room-msg">우물물은 차갑다. 둘 중 하나만 할 시간이 있다.</p>';
      acts.appendChild(btn("우물 · 회복", "전원 최대 HP 50% 회복", "primary", function () {
        var got = R.healAll(run, R.REST.heal);
        doneMsg("우물물로 상처를 씻었다. " + Object.keys(got).map(function (id) { return C.CAST[id].name + " +" + got[id]; }).join(" · "));
      }, "rest-heal"));
      acts.appendChild(btn("명상 · 집중", "전원 필살 게이지 +" + R.REST.gauge, "", function () {
        R.addGauge(run, R.REST.gauge); doneMsg("숨을 고르며 다음 일격을 그렸다. 필살 게이지 +" + R.REST.gauge);
      }, "rest-gauge"));
      if (run.roster.length > 3) acts.appendChild(btn("출전을 바꾼다", "쉬는 사람과 교대", "ghost", function () {
        p.swap = true; save(); showNode();
      }, "btn-swap"));
    } else if (node.kind === "treasure") {
      p.reward = R.boonOffer(run, run.seed * 31 + run.floor);
      p.msg = "룬 상자가 열렸다. 하나만 챙길 수 있다.";
      save(); return showNode();
    } else if (node.kind === "event") {
      if (p.roll == null) {
        body.innerHTML = '<p class="room-msg">뒤집힌 잔 사이 카드 한 장. 집으면 균열이 주사위를 굴린다.</p>' +
          '<p class="room-rule">🎲 1–' + R.EVENT.chance + " 기습 전투(" + stage().packs.ambush[0].map(function (id) { return C.ENEMY[id].name; }).join(" · ") + ") · " + (R.EVENT.chance + 1) + "–100 보물</p>";
        acts.appendChild(btn("카드를 집는다", "주사위를 지금 굴린다", "primary big", function () {
          var e = R.rollEvent(run.seed * 31 + run.floor);
          p.roll = e.die; p.ambush = e.ambush;
          if (!e.ambush) { p.reward = R.boonOffer(run, run.seed * 17 + run.floor); p.msg = "주사위 " + e.die + " · 균열이 조용하다. 카드 뒤에 보물이 있었다."; }
          save(); showNode();
        }, "event-roll"));
        acts.appendChild(btn("지나간다", "아무 일 없이 다음 층", "ghost", nextFloor, "btn-skip"));
      } else {
        fightPack = stage().packs.ambush[0]; scale = "ambush";
        body.innerHTML = '<p class="room-msg">주사위 ' + p.roll + " · 기습! 카드가 그림자로 변했다.</p>";
      }
    } else {
      fightPack = node.pack; scale = node.tier;
    }

    if (fightPack) {
      var sc = R.SCALE[scale] || R.SCALE.t1;
      var foes = document.createElement("div"); foes.className = "foes";
      foes.innerHTML = fightPack.map(function (id) {
        var e = C.ENEMY[id];
        return '<div class="foe' + (e.boss ? " boss" : "") + '"><img class="' + (e.pixel ? "px" : "") + '" src="' + e.img + '" alt="" />' +
          "<b>" + esc(e.name) + "</b><span>HP " + Math.round(e.hp * sc.hp) + "</span><small>" + esc(HINT[id] || "") + "</small></div>";
      }).join("");
      body.appendChild(foes);
      var tip = document.createElement("p"); tip.className = "room-rule";
      tip.textContent = node.kind === "boss" ? "결전. 이기면 균열이 닫힌다." : node.kind === "elite" ? "강적. 이기면 전술·보물을 고른다." : "적 카드 아래 예고를 보고 싸우세요.";
      body.appendChild(tip);
      acts.appendChild(btn(node.kind === "boss" ? "결전에 나선다" : "싸운다", "도망칠 수 없다", "primary big", function () {
        fight(node, fightPack, scale);
      }, "btn-fight"));
    }
    $("#node-party").innerHTML = partyHtml();
    A.show("scr-node");
  }

  function doneMsg(msg) { run.pending.won = true; run.pending.msg = msg; save(); showNode(); }
  function takeBoon(id) {
    R.gainBoon(run, id);
    A.banner(R.BOONS[id].name, R.BOONS[id].text, 1200);
    nextFloor();
  }
  function nextFloor() {
    R.advance(run);
    if (run.over) return result();
    showMap();
  }

  function fight(node, pack, scale) {
    var bnode = { kind: node.kind === "event" ? "battle" : node.kind, room: node.room, pack: pack, tier: scale };
    var cfg = R.battleConfig(run, bnode, (run.seed * 131 + run.floor * 7) >>> 0);
    A.start({
      config: cfg,
      seedOffset: run.floor,
      floorText: floorText(),
      bannerTitle: node.kind === "boss" ? "BOSS" : node.kind === "elite" ? "ELITE" : "BATTLE",
      onEnd: function (S) {
        var res = R.applyBattle(run, S, bnode);
        if (res === "lose" || res === "win") { save(); return result(); }
        var p = run.pending;
        var downs = S.allies.filter(function (u) { return !u.alive; }).length;
        var msg = "승리! 라운드 " + S.round + (downs ? " · 쓰러진 아군은 HP " + Math.round(R.AFTER.reviveHp * 100) + "%로 일어났다" : "") + " · 필살 게이지는 절반만 이어진다.";
        if (node.kind === "elite") {
          p.reward = R.boonOffer(run, run.seed * 7 + run.floor);
          p.msg = msg + " 강적의 전리품을 고르세요.";
        } else { p.won = true; p.msg = msg; }
        delete p.roll; delete p.ambush;
        save(); showNode();
      },
    });
    window.__fcbRun.battle = true;
  }

  // ---------- 결과 ----------
  function result() {
    var win = run.over === "win";
    var st = run.stats, sg = stage();
    leaveScene();
    if (SND) SND.sfx(win ? "win" : "lose");
    if (win) { var rec = loadStages(); rec.clears[sg.no] = (rec.clears[sg.no] || 0) + 1; saveStages(rec); }
    var t = $("#res-title");
    t.textContent = win ? (sg.no === 1 ? "균열 봉인!" : sg.name + " 돌파!") : "패배…";
    t.className = "res-title " + (win ? "win" : "lose");
    var img = $("#res-img");
    img.src = win ? sg.winImg : sg.loseImg;
    img.className = "res-img" + (/\.png$/.test(img.src) ? " px" : "");
    img.style.borderColor = win ? "var(--gold)" : "var(--ice)";
    $("#res-line").textContent = win ? sg.win : sg.lose;
    $("#res-stats").innerHTML =
      "<div><b>" + (Math.min(run.floor, R.FLOORS - 1) + 1) + "</b>도달 층</div>" +
      "<div><b>" + st.battles + "</b>전투</div>" +
      "<div><b>" + st.ults + "</b>필살기</div>" +
      "<div><b>" + st.breaks + "</b>브레이크</div>";
    $("#res-tip").textContent = win
      ? "최대 피해 " + st.maxHit + " · 총 " + st.rounds + "라운드. 강적 방을 더 들러 보세요."
      : (Math.min(run.floor, R.FLOORS - 1) + 1) + "층에서 쓰러졌어요. 팁: 보스 전엔 ⛲ 휴식, ⚠ 충전은 「부위 분쇄」로 끊기.";
    run.over = run.over || "lose";
    save();
    updateTitle();
    A.show("scr-result");
  }

  // ---------- 타이틀·메뉴 ----------
  function updateTitle() {
    leaveScene();
    var sv = loadSave();
    var c = $("#btn-continue");
    c.hidden = !sv;
    if (sv) $("#continue-sub").textContent = R.stageOf(sv).name + " · " + (Math.min(sv.floor, R.FLOORS - 1) + 1) + "층 · " + R.partySummary(sv).map(function (p) { return p.name + " " + p.hp; }).join(" · ");
    var rec = loadStages();
    var list = $("#stage-list"); list.innerHTML = "";
    var shut = [];
    Object.keys(R.STAGES).map(Number).forEach(function (n) {
      var st = R.STAGES[n];
      if (!st.open) { shut.push(n + " " + st.name); return; }
      var cl = rec.clears[n] ? " · 클리어 " + rec.clears[n] : "";
      var b = btn(n + " · " + st.name, (sv ? "새로 시작 · " : "") + st.door + " · 보스 " + st.boss + cl, "stage" + (!sv && n === rec.last ? " primary" : ""), function () { newRun(n); }, n === 1 ? "btn-start" : "btn-stage-" + n);
      b.dataset.stage = n;
      list.appendChild(b);
    });
    $("#stage-shut").textContent = shut.length ? shut.join(" · ") + " — 준비 중" : "";
  }
  function newRun(stageNo) {
    A.abort();
    if (typeof stageNo !== "number") stageNo = run && run.stage ? run.stage : loadStages().last || 1;
    if (!R.STAGES[stageNo] || !R.STAGES[stageNo].open) stageNo = 1;
    var rec = loadStages(); rec.last = stageNo; saveStages(rec);
    var seed = A.hash.seed != null ? Number(A.hash.seed) : undefined;
    run = R.newRun(seed, stageNo);
    save();
    showMap();
  }
  function cont() {
    var sv = loadSave(); if (!sv) return updateTitle();
    run = sv;
    if (run.pending) showNode(); else showMap();
  }
  function openMenu() { $("#pause").hidden = false; }
  function $$snd() { return Array.prototype.slice.call(document.querySelectorAll(".btn-snd")); }

  function init() {
    $("#btn-continue").addEventListener("click", cont);
    $("#btn-retry").addEventListener("click", function () { newRun(); });
    $("#btn-to-title").addEventListener("click", updateTitle);
    $("#btn-map-menu").addEventListener("click", openMenu);
    $("#btn-node-menu").addEventListener("click", openMenu);
    $("#btn-restart").addEventListener("click", function () { $("#pause").hidden = true; newRun(); });
    var sndLabel = function () { return "소리: " + (SND && SND.on ? "켬" : "끔"); };
    $$snd().forEach(function (b) {
      b.textContent = sndLabel();
      b.addEventListener("click", function () {
        if (!SND) return;
        SND.setOn(!SND.on);
        $$snd().forEach(function (x) { x.textContent = sndLabel(); });
        if (SND.on && run && !run.over && !$("#scr-title").classList.contains("active") && !$("#scr-result").classList.contains("active")) stageScene();
      });
    });
    $("#btn-quit").addEventListener("click", function () {
      A.abort(); save(); updateTitle(); A.show("scr-title");
    });
    updateTitle();
    window.__fcbRun = {
      get run() { return run; }, R: R, newRun: newRun, cont: cont, showMap: showMap, showNode: showNode, enterNode: enterNode,
      result: result, save: save, loadSave: loadSave, battle: false, loadStages: loadStages, updateTitle: updateTitle,
    };
  }
  init();
})();
