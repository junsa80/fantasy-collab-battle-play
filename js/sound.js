/* 환상 콜라보 — 소리. 토글 키 fcb-sfx = "on" | "off" (기본 on). 설정 키 fcb-arena-settings-v1 은 건드리지 않음.
   효과음 sfx/*.wav, 필살 음성 sfx/vo_<id>.mp3 (docs/ASSETS.md), 스테이지 배경 음악 sfx/bgm-stageN.mp3 (루프).
   소리를 끄면 배경 음악도 멈춘다.
*/
(function (root) {
  "use strict";
  var KEY = "fcb-sfx";
  var VOICES = { arin: 1, sera: 1, aria: 1, garen: 1, mariel: 1, leo: 1, serena: 1, odette: 1, noel: 1, lin: 1, arthur: 1, kael: 1 };
  var on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (e) {}
  var cache = {}, music = null, want = null, ducked = false;
  function vol() { return ducked ? 0.12 : 0.32; }

  function play(name, vol) {
    if (!on) return;
    try {
      var src = "sfx/" + name;
      var base = cache[src] || (cache[src] = new Audio(src));
      var a = base.paused ? base : base.cloneNode();
      a.volume = vol == null ? 0.6 : vol;
      a.currentTime = 0;
      var p = a.play(); if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function sfx(n) { play(n + ".wav", n === "click" ? 0.35 : 0.55); }
  function voice(id) { if (VOICES[id]) play("vo_" + id + ".mp3", 0.9); }
  function startMusic() {
    if (!on || !want) return;
    try {
      if (!music || music.dataset.src !== want) {
        if (music) music.pause();
        music = new Audio(want); music.dataset.src = want; music.loop = true; music.volume = vol();
      }
      if (music.paused) { var p = music.play(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) {}
  }
  function bgm(src) { want = src || null; if (!want) return stopBgm(); startMusic(); }
  function stopBgm() { want = null; if (music) { try { music.pause(); } catch (e) {} } }
  function duck(v) { ducked = !!v; if (music) music.volume = vol(); }
  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
    if (!on) { if (music) try { music.pause(); } catch (e) {} } else startMusic();
  }
  root.FCBSound = {
    KEY: KEY, sfx: sfx, voice: voice, bgm: bgm, stopBgm: stopBgm, duck: duck, setOn: setOn,
    get on() { return on; },
    get playing() { return !!(music && !music.paused); },
    get track() { return want; },
  };
})(this);
