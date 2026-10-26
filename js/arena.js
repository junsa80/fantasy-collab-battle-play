/* 환상 콜라보 — 균열 아레나 UI (DOM 턴제, 한 화면 터치)
   엔진: js/arena-core.js (FCBCore). 이 파일은 그리기·연출·입력만.
   개발용 해시: #seed=7  #fast  #ult(게이지 가득)  #autowin / #autolose(테스트용 HP 조정)
   2026-10-24 런 맵: 전투는 js/run.js 가 start({ config, onEnd, floorText }) 로 연다. 결과는 onEnd(S) 로 넘긴다.
*/
(function () {
  "use strict";
  var C = window.FCBCore;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var SKEY = "fcb-arena-settings-v1";

  var hash = {};
  location.hash.replace(/^#/, "").split(/[&,]/).forEach(function (p) {
    if (!p) return; var kv = p.split("="); hash[kv[0]] = kv[1] === undefined ? true : kv[1];
  });

  var settings = { fx: "normal" };
  try { var saved = JSON.parse(localStorage.getItem(SKEY) || "null"); if (saved && saved.fx) settings.fx = saved.fx; } catch (e) {}
  if (hash.fast) settings.fx = "fast";
  function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) {} }
  function sp(ms) { return settings.fx === "fast" ? Math.round(ms * 0.45) : ms; }
  function fxLabel() { return "연출: " + (settings.fx === "fast" ? "빠르게" : "보통"); }

  var S = null;           // 엔진 상태
  var active = null;      // 선택된 아군 uid
  var focus = null;       // 집중 대상 적 uid
  var busy = false;
  var paused = false;
  var lastAct = 0;
  var gen = 0;            // 전투 세대: 재시작 시 이전 연출 중단
  var ctx = null;         // 런 전투 문맥 { config, onEnd, floorText }

  function show(id) {
    $$(".screen").forEach(function (s) { s.classList.toggle("active", s.id === id); });
  }
  function delay(ms) {
    return new Promise(function (res) {
      (function wait() { if (paused) return setTimeout(wait, 100); setTimeout(res, sp(ms)); })();
    });
  }
  function esc(t) { return String(t).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function log(html) { $("#log").innerHTML = "<span>" + html + "</span>"; }
  function unitData(u) { return u.side === "ally" ? C.CAST[u.id] : C.ENEMY[u.id]; }
  function cardOf(uid) { return document.querySelector('[data-uid="' + uid + '"]'); }
  function vibrate(ms) { if (settings.fx !== "fast" && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

  // ---------- 빌드 ----------
  function buildEnemies() {
    var row = $("#enemy-row"); row.innerHTML = "";
    S.enemies.forEach(function (u) {
      var d = document.createElement("div");
      d.className = "ecard" + (u.boss ? " boss" : "");
      d.dataset.uid = u.uid;
      d.setAttribute("role", "button");
      d.setAttribute("aria-label", u.name + " 대상 지정");
      d.innerHTML =
        '<div class="pic"><img class="' + (u.pixel ? "px" : "") + '" src="' + u.img + '" alt="" /><div class="tags"></div></div>' +
        '<div class="nm"><b>' + esc(u.name) + '</b><span class="hpn"></span></div>' +
        '<div class="bar hp"><i class="ghost"></i><i></i></div>' +
        '<div class="intent"></div>';
      d.addEventListener("click", function () { onEnemyTap(u.uid); });
      row.appendChild(d);
    });
  }
  function buildAllies() {
    var row = $("#ally-row"); row.innerHTML = "";
    S.allies.forEach(function (u) {
      var cd = C.CAST[u.id];
      var d = document.createElement("div");
      d.className = "acard"; d.dataset.uid = u.uid;
      d.style.setProperty("--c", cd.color);
      d.setAttribute("role", "button");
      d.setAttribute("aria-label", u.name + " 선택");
      d.innerHTML =
        '<img class="face ' + (cd.pixel ? "px" : "") + '" src="' + cd.img + '" alt="" />' +
        '<div class="nm">' + esc(u.name) + '</div>' +
        '<div class="hpnum"></div>' +
        '<div class="bars"><div class="bar hp"><i class="ghost"></i><i></i></div><div class="bar gbar"><i></i></div></div>' +
        '<div class="st"></div>';
      d.addEventListener("click", function () { onAllyTap(u.uid); });
      row.appendChild(d);
    });
  }

  // ---------- 갱신 ----------
  function intentHtml(e) {
    var it = e.intent;
    if (!e.alive || !it) return '<span class="ic">·</span><span>—</span>';
    var tgt = it.target ? C.find(S, it.target) : null;
    var tn = tgt ? " → " + esc(tgt.name) : "";
    var ic = "⚔️", extra = "";
    if (it.kind === "pillar") ic = "❄️";
    if (it.kind === "aoe") ic = "💥";
    if (it.kind === "startCharge" || it.kind === "charging") ic = "⚠️";
    if (it.kind === "stun") ic = "💫";
    var sub = it.text || (it.kind === "hit" ? "단일 공격" : "");
    if (e.charge) {
      var pct = Math.min(100, Math.round((e.charge.dealt / e.charge.need) * 100));
      extra = '<div class="brk"><i style="width:' + pct + '%"></i></div>';
      sub += " · 브레이크 " + Math.min(e.charge.dealt, e.charge.need) + "/" + e.charge.need;
    }
    return '<span class="ic">' + ic + '</span><span style="flex:1;min-width:0"><b>' + esc(it.name) + tn + "</b>" + esc(sub) + extra + "</span>";
  }

  function setBar(el, pct) {
    var bars = el.querySelectorAll("i");
    bars[bars.length - 1].style.width = pct + "%";
    if (bars.length > 1) bars[0].style.width = pct + "%";
  }

  function update() {
    if (!S) return;
    $("#tb-wave").textContent = ctx && ctx.floorText ? ctx.floorText : "웨이브 " + (S.wave + 1) + "/" + S.waves.length;
    $("#tb-wname").textContent = S.waves[S.wave].name;
    $("#tb-round").textContent = "라운드 " + S.round;
    var sy = $("#tb-syn");
    if (sy) {
      var names = S.syn ? C.SYN.filter(function (c) { return S.syn[c.id]; }).map(function (c) { return c.name; }) : [];
      sy.hidden = !names.length;
      sy.textContent = names.length ? "🔗 " + names.join(" · ") : "";
    }
    if (focus) { var f = C.find(S, focus); if (!f || !f.alive) focus = null; }
    if (!focus) { var dt = C.defaultTarget(S); focus = dt ? dt.uid : null; }

    // 아군이 노려지는지
    var aims = {};
    C.living(S.enemies).forEach(function (e) {
      if (e.intent && e.intent.target) aims[e.intent.target] = e.intent;
      if (e.intent && e.intent.kind === "aoe") S.allies.forEach(function (a) { if (!aims[a.uid]) aims[a.uid] = e.intent; });
    });

    S.enemies.forEach(function (u) {
      var d = cardOf(u.uid); if (!d) return;
      d.classList.toggle("dead", !u.alive);
      d.classList.toggle("focus", u.uid === focus && u.alive && S.phase === "player");
      $(".hpn", d).textContent = u.hp + "/" + u.maxHp;
      setBar($(".bar.hp", d), (u.hp / u.maxHp) * 100);
      var it = $(".intent", d);
      it.innerHTML = intentHtml(u);
      it.className = "intent" + (u.intent && (u.intent.charge || u.intent.kind === "pillar") ? " warn" : "") + (u.intent && u.intent.kind === "stun" ? " stun" : "");
      var tags = [];
      if (u.mark > 0) tags.push('<span class="tag weak">약점 ' + u.mark + "</span>");
      if (u.charge) tags.push('<span class="tag charge">충전</span>');
      $(".tags", d).innerHTML = tags.join("");
    });

    S.allies.forEach(function (u) {
      var d = cardOf(u.uid); if (!d) return;
      d.classList.toggle("dead", !u.alive);
      d.classList.toggle("done", u.alive && !!S.acted[u.uid] && S.phase === "player");
      d.classList.toggle("active", u.uid === active && S.phase === "player");
      $(".hpnum", d).textContent = u.hp + "/" + u.maxHp;
      setBar($(".bar.hp", d), (u.hp / u.maxHp) * 100);
      var g = $(".gbar", d); setBar(g, u.gauge); g.classList.toggle("full", u.gauge >= 100);
      var st = [];
      if (u.atkUpTurns > 0) st.push('<span class="tag atk">공↑' + u.atkUpTurns + "</span>");
      if (u.guard) st.push('<span class="tag guard">방어</span>');
      if (u.sanctum > 0) st.push('<span class="tag sanct">성역</span>');
      if (u.frost > 0) st.push('<span class="tag frost">' + esc(u.frostName || "빙결") + '</span>');
      $(".st", d).innerHTML = st.join("");
      var old = $(".aim", d); if (old) old.remove();
      var aim = aims[u.uid];
      if (aim && u.alive && S.phase === "player") {
        var a = document.createElement("div");
        a.className = "aim" + (aim.kind === "pillar" || aim.frost ? " ice" : "");
        a.textContent = "⚠ " + aim.name;
        d.appendChild(a);
      }
    });
    updateActions();
  }

  function updateActions() {
    var panel = $("#actions");
    var u = active ? C.find(S, active) : null;
    var head = $("#act-head");
    var playable = S.phase === "player" && u && u.alive && !S.acted[u.uid] && !busy;
    panel.classList.toggle("locked", !playable);
    if (S.phase !== "player") head.innerHTML = "<b>적 차례…</b><span></span>";
    else if (!u) head.innerHTML = "<b>아군을 탭하세요</b><span></span>";
    else {
      var f = focus ? C.find(S, focus) : null;
      head.innerHTML = "<b>" + esc(u.name) + "</b> 행동 · 남은 " + C.pendingAllies(S).length + "명<span>대상: " + (f ? esc(f.name) : "—") + "</span>";
    }
    var cd = u ? C.CAST[u.id] : C.CAST.arin;
    panel.style.setProperty("--c", cd.color);
    $$(".abtn", panel).forEach(function (b) {
      var key = b.dataset.key;
      if (key !== "guard") {
        var a = cd.actions[key];
        $("b", b).textContent = (key === "ult" ? "필살 「" + a.name + "」" : a.name);
        var sub = a.desc;
        if (key === "skill" && u && u.cd > 0) sub = "대기 " + u.cd + "턴 · " + a.desc;
        if (key === "ult" && u && u.gauge < 100) sub = "게이지 " + u.gauge + "% · " + a.desc;
        $("small", b).textContent = sub;
      }
      b.disabled = !(playable && C.canUse(S, u, key));
      if (key === "ult") {
        var ready = !!(u && u.gauge >= 100 && playable);
        b.classList.toggle("ready", ready);
        $(".ult-fill", b).style.width = (u ? Math.min(100, u.gauge) : 0) + "%";
        b.style.setProperty("--c", cd.color);
      }
    });
  }

  // ---------- 입력 ----------
  function onEnemyTap(uid) {
    if (busy || !S || S.phase !== "player") return;
    var e = C.find(S, uid); if (!e || !e.alive) return;
    focus = uid; update();
    log("<b>" + esc(e.name) + "</b> 집중 대상");
  }
  function onAllyTap(uid) {
    if (busy || !S || S.phase !== "player") return;
    var u = C.find(S, uid);
    if (!u || !u.alive) return;
    if (S.acted[uid]) { log("<b>" + esc(u.name) + "</b>은(는) 이번 라운드에 이미 행동했어요"); return; }
    active = uid; update();
  }
  function onAction(key) {
    if (busy || !S || S.phase !== "player") return;
    var now = Date.now(); if (now - lastAct < 250) return; lastAct = now;
    var u = C.find(S, active);
    if (!C.canUse(S, u, key)) return;
    var ev = C.act(S, active, key, focus);
    if (!ev) return;
    run(ev).then(afterPlayer);
  }

  function nextActive() {
    var p = C.pendingAllies(S);
    active = p.length ? p[0].uid : null;
  }

  function afterPlayer() {
    if (S.phase === "win" || S.phase === "lose") return finish();
    if (!C.pendingAllies(S).length && S.phase === "player") {
      busy = true; active = null; update();
      var g = gen;
      return delay(350).then(function () {
        if (g !== gen) return new Promise(function () {});
        var ev = C.enemyPhase(S);
        return run(ev);
      }).then(function () {
        if (S.phase === "win" || S.phase === "lose") return finish();
        nextActive(); busy = false; update();
        log("라운드 " + S.round + " · 적의 <b>예고</b>를 확인하세요");
      });
    }
    nextActive(); update();
  }

  // ---------- 연출 ----------
  function centerOf(el) {
    var r = el.getBoundingClientRect(), a = $("#app").getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height * 0.4, w: r.width, h: r.height, top: r.top - a.top };
  }
  function floatText(uid, text, cls) {
    var el = cardOf(uid); if (!el) return;
    var c = centerOf(el);
    var n = document.createElement("div");
    n.className = "num " + (cls || "");
    n.textContent = text;
    n.style.left = (c.x + (Math.random() * 24 - 12)) + "px";
    n.style.top = c.y + "px";
    $("#fx").appendChild(n);
    setTimeout(function () { n.remove(); }, 1000);
  }
  function anim(el, cls) {
    if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 600);
  }
  function screenFlash(color) {
    var f = document.createElement("div");
    f.className = "screenflash"; f.style.background = color;
    $("#app").appendChild(f); setTimeout(function () { f.remove(); }, 550);
  }
  function slash(uid, color) {
    var el = cardOf(uid); if (!el) return;
    var c = centerOf(el);
    var s = document.createElement("div");
    s.className = "slash"; s.style.left = c.x + "px"; s.style.top = c.y + "px"; s.style.setProperty("--c", color || "#fff");
    $("#fx").appendChild(s); setTimeout(function () { s.remove(); }, 350);
  }
  function pillar(uid) {
    var el = cardOf(uid); if (!el) return;
    var c = centerOf(el);
    var p = document.createElement("div");
    p.className = "pillar"; p.style.left = c.x + "px"; p.style.top = "0px"; p.style.height = (c.top + c.h) + "px";
    $("#fx").appendChild(p); setTimeout(function () { p.remove(); }, 550);
  }
  function banner(title, sub, ms) {
    var b = $("#banner");
    b.innerHTML = "<b>" + esc(title) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "");
    b.hidden = false; b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
    b.style.animationDuration = sp(ms || 1600) + "ms";
    setTimeout(function () { b.hidden = true; }, sp(ms || 1600));
  }
  function snd(n) { if (window.FCBSound) window.FCBSound.sfx(n); }
  function cutin(e) {
    if (window.FCBSound) { window.FCBSound.sfx("ult"); window.FCBSound.voice(e.unit); }
    return new Promise(function (resolve) {
      var ci = $("#cutin"), cd = C.CAST[e.unit];
      ci.className = "cutin " + e.fx;
      ci.style.setProperty("--c1", e.colors[0]);
      ci.style.setProperty("--c2", e.colors[1]);
      ci.style.setProperty("--c3", e.colors[2]);
      var img = $(".ci-img", ci);
      img.src = cd.cut || cd.img;
      img.className = "ci-img" + (cd.pixel ? " px" : "") + (cd.cut ? " tall" : "");
      $(".ci-origin", ci).textContent = e.origin + " · " + cd.name;
      $(".ci-name", ci).textContent = "「" + e.name + "」";
      $(".ci-voice", ci).textContent = "“" + e.voice + "”";
      ci.hidden = false;
      // 재시작 애니메이션
      $$("*", ci).forEach(function (n) { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
      vibrate([20, 40, 30]);
      var done = false;
      function close() { if (done) return; done = true; ci.hidden = true; ci.removeEventListener("click", close); resolve(); }
      ci.addEventListener("click", close);
      setTimeout(close, sp(1500));
    });
  }

  function run(events) {
    var g = gen;
    busy = true; updateActions();
    var p = Promise.resolve();
    events.forEach(function (e) { p = p.then(function () { if (g === gen) return play(e); }); });
    return p.then(function () {
      if (g !== gen) return new Promise(function () {}); // 버려진 전투: 이후 체인 정지
      busy = false; update();
    }).catch(function (err) {
      // 연출 오류가 나도 조작이 막히지 않게
      console.error("fcb run", err);
      busy = false; update();
    });
  }

  function play(e) {
    var u, d;
    switch (e.type) {
      case "cutin":
        return cutin(e);
      case "use":
        u = C.find(S, e.src);
        anim(cardOf(e.src), "lunge");
        log("<b>" + esc(u.name) + "</b> · " + esc(e.name));
        return delay(e.key === "ult" ? 120 : 220);
      case "hit":
        u = C.find(S, e.dst); d = cardOf(e.dst);
        var src = C.find(S, e.src);
        if (src && src.side === "ally") slash(e.dst, C.CAST[src.id].color);
        else if (src) slash(e.dst, "#ff7a6a"); // 적 공격도 베기 자국(붉은색)
        snd("hit");
        update();
        // 손맛(연출만, 전투 계산과 무관): 히트스톱(번쩍인 채 잠깐 멈춤) → 맞은 쪽 반대로 밀려났다 돌아오는 넉백 흔들림
        var hs = settings.fx === "fast" ? 0 : (e.big ? 90 : 45);
        if (d) d.style.setProperty("--kb", u.side === "ally" ? "7px" : "-9px");
        anim(d, "hitflash");
        if (hs) setTimeout(function () { anim(d, e.big ? "bigshake" : "shake"); }, hs); else anim(d, e.big ? "bigshake" : "shake");
        if (e.big) { anim($("#scr-battle"), "shake"); vibrate(30); }
        floatText(e.dst, String(e.amount), (e.big ? "big " : "") + (e.weak ? "weak " : "") + (u.side === "ally" ? "ally" : ""));
        if (e.weak) setTimeout(function () { floatText(e.dst, "약점!", "label weak"); }, 120);
        if (e.guard) setTimeout(function () { floatText(e.dst, "방어", "label"); }, 120);
        return delay((e.big ? 420 : 300) + hs);
      case "heal":
        snd("heal");
        update(); floatText(e.dst, "+" + e.amount, "heal");
        return delay(220);
      case "revive":
        floatText(e.dst, "부활!", "label heal");
        return delay(200);
      case "down":
        u = C.find(S, e.dst);
        update();
        floatText(e.dst, u.side === "ally" ? "전투 불능" : "격파!", "label");
        return delay(300);
      case "mark":
        snd("skill");
        update(); floatText(e.dst, "약점 표시", "label weak");
        return delay(260);
      case "guard":
        u = C.find(S, e.dst);
        update(); floatText(e.dst, "방어 태세", "label");
        log("<b>" + esc(u.name) + "</b> 방어 — 받는 피해 절반");
        return delay(300);
      case "buff":
        update();
        e.dsts.forEach(function (id) { floatText(id, e.text, "label"); });
        return delay(360);
      case "partbreak":
        floatText(e.dst, "부위 파괴!", "break");
        screenFlash("rgba(243,154,60,.5)");
        return delay(260);
      case "break":
        update();
        floatText(e.dst, "BREAK!", "break"); snd("break");
        screenFlash("rgba(143,208,255,.45)"); vibrate(50);
        log("<b>브레이크!</b> " + esc(e.skill) + " 저지 — 기절");
        return delay(520);
      case "enemyUse":
        u = C.find(S, e.src);
        anim(cardOf(e.src), "elunge");
        snd("skill");
        log((e.voice ? "<em>“" + esc(e.voice) + "”</em><br>" : "") + "<b>" + esc(u.name) + "</b> · " + esc(e.name));
        if (e.aoe) {
          screenFlash(u.id === "celes" ? "rgba(143,208,255,.55)" : "rgba(155,123,255,.5)");
          anim($("#scr-battle"), "bigshake");
          banner(e.name, u.name, 900);
          return delay(520);
        }
        if (e.pillar) { pillar(e.dst); return delay(380); }
        return delay(260);
      case "frost":
        floatText(e.dst, e.label || "빙결", "label");
        return delay(80);
      case "charge":
        u = C.find(S, e.src); update();
        floatText(e.src, "⚠ 충전", "label");
        log("<b>" + esc(u.name) + "</b> · " + esc(e.name) + " 충전 — 피해를 모아 브레이크!");
        return delay(420);
      case "stunned":
        floatText(e.src, "기절…", "label");
        return delay(320);
      case "say":
        u = C.find(S, e.src);
        log("<em>“" + esc(e.text) + "”</em>");
        floatText(e.src, "격노", "label");
        return delay(700);
      case "wave":
        buildEnemies(); focus = null; nextActive(); update();
        banner("WAVE " + (e.wave + 1), e.name + " — " + e.line, 1700);
        log("<em>“" + esc(e.line) + "”</em>");
        return delay(1300);
      case "round":
        update();
        return delay(120);
      case "win":
        banner("VICTORY", "균열 아레나 제압", 1400);
        vibrate([30, 60, 30]);
        return delay(1200);
      case "lose":
        banner("DEFEAT", "파티 전멸", 1400);
        return delay(1200);
    }
    return Promise.resolve();
  }

  // ---------- 흐름 ----------
  function start(c) {
    ctx = c && c.config ? c : null;
    var seed = hash.seed != null ? Number(hash.seed) : undefined;
    gen += 1;
    $("#fx").innerHTML = ""; $("#cutin").hidden = true; $("#banner").hidden = true;
    var opts = ctx ? Object.assign({}, ctx.config) : {};
    if (seed !== undefined) opts.seed = seed + (ctx && ctx.seedOffset || 0);
    S = C.create(opts);
    if (hash.ult) S.allies.forEach(function (a) { a.gauge = 100; });
    if (hash.autowin) S.enemies.forEach(function (e) { e.hp = 1; });
    if (hash.autolose) S.allies.forEach(function (a) { a.hp = 1; });
    busy = false; paused = false; focus = null;
    buildEnemies(); buildAllies(); nextActive();
    show("scr-battle"); update();
    log("<em>“" + esc(S.waves[0].line) + "”</em><br>적을 탭해 대상 · 아래 버튼으로 행동");
    banner(ctx ? (ctx.bannerTitle || "BATTLE") : "WAVE 1", S.waves[0].name, 1400);
    window.__fcb.state = S;
  }

  function finish() {
    busy = false;
    $("#fx").innerHTML = ""; $("#banner").hidden = true;
    if (ctx && ctx.onEnd) { var cb = ctx.onEnd; return cb(S); }
    var win = S.phase === "win";
    var t = $("#res-title");
    t.textContent = win ? "승리!" : "패배…";
    t.className = "res-title " + (win ? "win" : "lose");
    var img = $("#res-img");
    img.src = win ? "img/arin.png" : "img/celes.webp";
    img.className = "res-img" + (win ? " px" : "");
    img.style.borderColor = win ? "var(--gold)" : "var(--ice)";
    $("#res-line").textContent = win ? "아린: “새벽은 우리 편이었어. 모두, 고마워.”" : "셀레스: “사냥은 끝났어. 다음엔 예고를 잘 봐.”";
    $("#res-stats").innerHTML =
      "<div><b>" + S.round + "</b>라운드</div>" +
      "<div><b>" + S.stats.maxHit + "</b>최대 피해</div>" +
      "<div><b>" + S.stats.ults + "</b>필살기</div>" +
      "<div><b>" + S.stats.breaks + "</b>브레이크</div>";
    $("#res-tip").textContent = win
      ? "필살기 연출이 원작처럼 읽혔나요? 다시 도전해 더 빨리 깨 보세요."
      : "팁: ⚠ 충전 중인 적은 아리아 「부위 분쇄」로 바로 끊을 수 있어요. ❄ 얼음 기둥 대상은 방어하세요.";
    show("scr-result");
  }

  function setFx(next, noSave) {
    settings.fx = next; if (!noSave) saveSettings();
    $("#btn-fx").textContent = fxLabel(); $("#btn-fx2").textContent = fxLabel();
  }

  function init() {
    // 타이틀·결과·일시정지의 런 관련 버튼(#btn-start, #btn-retry, #btn-restart, #btn-quit)은 js/run.js 가 연결
    $("#btn-to-title").addEventListener("click", function () { show("scr-title"); });
    $("#btn-howto").addEventListener("click", function () {
      var h = $("#howto"); h.hidden = !h.hidden; this.setAttribute("aria-expanded", String(!h.hidden));
    });
    var toggle = function () { setFx(settings.fx === "fast" ? "normal" : "fast"); };
    $("#btn-fx").addEventListener("click", toggle);
    $("#btn-fx2").addEventListener("click", toggle);
    $("#btn-pause").addEventListener("click", function () { paused = true; $("#pause").hidden = false; });
    $("#btn-resume").addEventListener("click", function () { paused = false; $("#pause").hidden = true; });
    $$(".abtn").forEach(function (b) { b.addEventListener("click", function () { onAction(b.dataset.key); }); });
    setFx(settings.fx, true);
    document.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("button");
      if (b && !b.disabled) snd("click");
    }, true);
    window.__fcb = {
      core: C, state: null, start: start, settings: settings, show: show, banner: banner, esc: esc, hash: hash,
      setFx: setFx, fxLabel: fxLabel, vibrate: vibrate,
      // 전투 중단(일시정지 → 타이틀/새 런): 진행 중 연출 체인을 끊는다
      abort: function () { gen += 1; paused = false; busy = false; ctx = null; S = null; $("#pause").hidden = true; $("#cutin").hidden = true; $("#banner").hidden = true; $("#fx").innerHTML = ""; },
      inBattle: function () { return !!S && $("#scr-battle").classList.contains("active"); },
    };
  }
  init();
})();
