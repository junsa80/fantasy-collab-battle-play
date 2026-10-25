/* 환상 콜라보 — 기존 효과음·음성·스테이지 음악.
   fcb-sfx 설정만 사용하며 게임 저장 데이터는 변경하지 않는다. */
(function (root) {
  "use strict";
  var KEY = "fcb-sfx";
  var VOICES = { arin: 1, sera: 1, aria: 1, garen: 1, mariel: 1, leo: 1, serena: 1, odette: 1, noel: 1, lin: 1, arthur: 1, kael: 1 };
  var on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (e) {}
  var music = null, want = null, ducked = false, away = false, active = [];
  function hidden() { return away || (root.document && root.document.hidden); }
  function vol() { return ducked ? 0.12 : 0.32; }
  function pause(a) { try { a.pause(); } catch (e) {} }
  function remove(a) {
    var i = active.indexOf(a);
    if (i >= 0) active.splice(i, 1);
    a.onended = a.onerror = null;
  }
  function stopEffects() {
    active.slice().forEach(function (a) { pause(a); remove(a); });
  }
  function play(name, volume) {
    if (!on || hidden()) return;
    try {
      // Bound overlapping voices; finished/error elements are released.
      if (active.length >= 16) { var old = active[0]; pause(old); remove(old); }
      var a = new Audio("sfx/" + name);
      a.volume = volume == null ? 0.6 : volume;
      a.onended = a.onerror = function () { remove(a); };
      active.push(a);
      var p = a.play();
      if (p && p.then) p.then(function () {
        if (!on || hidden() || active.indexOf(a) < 0) { pause(a); remove(a); }
      }, function () { remove(a); });
    } catch (e) { if (a) remove(a); }
  }
  function sfx(n) { play(n + ".wav", n === "click" ? 0.35 : 0.55); }
  function voice(id) { if (VOICES[id]) play("vo_" + id + ".mp3", 0.9); }
  function startMusic() {
    if (!on || !want || hidden()) return;
    try {
      if (!music || music.dataset.src !== want) {
        if (music) pause(music);
        music = new Audio(want); music.dataset.src = want; music.loop = true;
      }
      music.volume = vol();
      if (music.paused) {
        var a = music, p = a.play();
        if (p && p.then) p.then(function () {
          if (!on || hidden() || a !== music || !want) pause(a);
        }, function () {});
      }
    } catch (e) {}
  }
  function bgm(src) { want = src || null; if (!want) return stopBgm(); startMusic(); }
  function stopBgm() { want = null; if (music) pause(music); }
  function duck(v) { ducked = !!v; if (music) music.volume = vol(); }
  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
    if (!on) { if (music) pause(music); stopEffects(); } else startMusic();
  }
  function visibility() {
    if (hidden()) { if (music) pause(music); stopEffects(); }
    else startMusic();
  }
  if (root.document) {
    root.document.addEventListener("visibilitychange", visibility);
    // Retry browser autoplay rejection on a real user gesture.
    root.document.addEventListener("pointerdown", startMusic);
    root.document.addEventListener("keydown", startMusic);
  }
  if (root.addEventListener) {
    root.addEventListener("pagehide", function () { away = true; visibility(); });
    root.addEventListener("pageshow", function () { away = false; visibility(); });
  }
  root.FCBSound = {
    KEY: KEY, sfx: sfx, voice: voice, bgm: bgm, stopBgm: stopBgm, duck: duck, setOn: setOn,
    get on() { return on; },
    get playing() { return !!(music && !music.paused); },
    get track() { return want; },
  };
})(this);
