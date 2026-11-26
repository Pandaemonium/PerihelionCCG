/* TAU CETI — Procedural WebAudio sci-fi sound effects & faction soundtrack engine. */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const LEGACY_MUTE_KEY = 'tauceti_muted_v1';
  const PREFS_KEY = 'tauceti_audio_v2';

  const TRACKS = [
    { id: 'title', title: 'Orbital Ascent', sub: 'Main Theme · Planetmind', file: 'audio/theme_title.mp3' },
    { id: 'rootbound', title: 'Misty Rainforest', sub: "Planet's Stepdaughters", file: 'audio/theme_rootbound.mp3' },
    { id: 'ironwake', title: 'Foundry March', sub: 'The Iron Hive', file: 'audio/theme_ironwake.mp3' },
    { id: 'synod', title: 'Iterative Equilibrium', sub: 'University of Tau Ceti', file: 'audio/theme_synod.mp3' },
    { id: 'tide', title: 'Ocean Dockyard', sub: 'The Tidewater Pirates', file: 'audio/theme_tide.mp3' },
    { id: 'cinder', title: 'Sanctum of Ash', sub: 'The Cinder Believers', file: 'audio/theme_cinder.mp3' },
    { id: 'auric', title: 'Orbit Spire', sub: 'Vance Industries', file: 'audio/theme_auric.mp3' },
    { id: 'redline', title: 'Dawn Ridge Protocol', sub: 'The Redline Federation', file: 'audio/theme_redline.mp3' },
  ];
  const TRACK_MAP = {};
  TRACKS.forEach((t) => { TRACK_MAP[t.id] = t; });

  const clamp01 = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  };

  let prefs = {
    sfxMuted: false,
    sfxVol: 0.8,
    musicMuted: false,
    musicVol: 0.22, // intentionally subtle background level by default
  };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      prefs.sfxMuted = !!p.sfxMuted;
      prefs.sfxVol = clamp01(p.sfxVol, 0.8);
      prefs.musicMuted = !!p.musicMuted;
      prefs.musicVol = clamp01(p.musicVol, 0.22);
    } else if (localStorage.getItem(LEGACY_MUTE_KEY) === '1') {
      prefs.sfxMuted = true;
      prefs.musicMuted = true;
    }
  } catch (e) { /* ignore storage errors */ }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      localStorage.setItem(LEGACY_MUTE_KEY, (prefs.sfxMuted && prefs.musicMuted) ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  /* ============================================================ Procedural SFX */
  let ctx = null;

  function ensure() {
    if (prefs.sfxMuted || prefs.sfxVol <= 0.001 || typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, freqEnd, dur, type, gainVal, delay) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    const peak = Math.max(0.0002, (gainVal || 0.08) * prefs.sfxVol);
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd && freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const listeners = new Set();
  function emitChange() { listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); }

  const SFX = {
    get muted() { return prefs.sfxMuted; },
    get volume() { return prefs.sfxVol; },
    setVolume(v) {
      prefs.sfxVol = clamp01(v, prefs.sfxVol);
      if (prefs.sfxVol > 0 && prefs.sfxMuted) prefs.sfxMuted = false;
      savePrefs();
      emitChange();
    },
    setMuted(m) {
      prefs.sfxMuted = !!m;
      savePrefs();
      emitChange();
    },
    toggle() {
      const next = !(prefs.sfxMuted && prefs.musicMuted);
      prefs.sfxMuted = next;
      prefs.musicMuted = next;
      savePrefs();
      Music._syncVolume();
      if (!next) SFX.click();
      emitChange();
      return next;
    },
    toggleSfx() {
      prefs.sfxMuted = !prefs.sfxMuted;
      savePrefs();
      if (!prefs.sfxMuted) SFX.click();
      emitChange();
      return prefs.sfxMuted;
    },
    click() { tone(520, 680, 0.05, 'triangle', 0.05); },
    play() { tone(240, 420, 0.12, 'triangle', 0.08); tone(540, 620, 0.09, 'sine', 0.04, 0.04); },
    build() { tone(160, 220, 0.18, 'sawtooth', 0.06); tone(320, 380, 0.14, 'triangle', 0.05, 0.06); },
    attack() { tone(190, 75, 0.14, 'sawtooth', 0.09); },
    dmg() { tone(130, 55, 0.14, 'square', 0.06); },
    psi() { tone(660, 310, 0.22, 'sine', 0.07); tone(990, 460, 0.2, 'triangle', 0.04, 0.03); },
    heal() { tone(440, 660, 0.18, 'sine', 0.06); tone(660, 880, 0.16, 'sine', 0.04, 0.06); },
    block() { tone(880, 1240, 0.12, 'sine', 0.07); },
    move() { tone(300, 390, 0.09, 'sine', 0.05); },
    raze() { tone(120, 42, 0.36, 'sawtooth', 0.11); tone(220, 80, 0.28, 'square', 0.05, 0.05); },
    pod() { tone(523, 659, 0.12, 'triangle', 0.07); tone(659, 784, 0.16, 'triangle', 0.07, 0.08); },
    project() {
      tone(261.6, 261.6, 0.35, 'triangle', 0.07);
      tone(329.6, 329.6, 0.35, 'triangle', 0.06, 0.1);
      tone(392.0, 523.2, 0.5, 'sine', 0.08, 0.2);
    },
    milestone() {
      tone(440, 554, 0.16, 'sine', 0.07);
      tone(554, 659, 0.22, 'sine', 0.07, 0.1);
    },
    win() {
      [392, 493.88, 587.33, 783.99].forEach((f, i) => tone(f, f * 1.01, 0.32, 'triangle', 0.07, i * 0.1));
    },
    lose() {
      [311, 277, 233, 174].forEach((f, i) => tone(f, f * 0.96, 0.35, 'sawtooth', 0.06, i * 0.12));
    },
  };

  /* ============================================================ Faction Soundtrack Player */
  let mode = 'auto'; // 'auto' or a specific track id
  let contextId = 'title';
  let currentId = null;
  let currentAudio = null;
  let fadeTimer = null;
  let fadingOut = [];
  let unlocked = false;

  const targetVol = () => (prefs.musicMuted ? 0 : prefs.musicVol);
  const desiredId = () => (mode === 'auto' ? (TRACK_MAP[contextId] ? contextId : 'title') : (TRACK_MAP[mode] ? mode : 'title'));

  function clearFaders() {
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  }

  function stopAud(a) {
    if (!a) return;
    try { a.pause(); a.src = ''; } catch (e) { /* ignore */ }
  }

  function startFade() {
    clearFaders();
    const stepMs = 40;
    fadeTimer = setInterval(() => {
      let busy = false;
      const goal = targetVol();
      if (currentAudio) {
        const cur = currentAudio.volume;
        const step = 0.035;
        if (Math.abs(cur - goal) <= step) currentAudio.volume = goal;
        else { currentAudio.volume = clamp01(cur + (cur < goal ? step : -step), goal); busy = true; }
        if (goal === 0 && !currentAudio.paused && currentAudio.volume <= 0.001) {
          currentAudio.pause();
        }
      }
      fadingOut = fadingOut.filter((a) => {
        if (a.volume <= 0.035) { stopAud(a); return false; }
        a.volume = clamp01(a.volume - 0.04, 0);
        busy = true;
        return true;
      });
      if (!busy) clearFaders();
    }, stepMs);
  }

  function playTrack(id, immediate) {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    const tr = TRACK_MAP[id] || TRACK_MAP.title;
    if (!tr) return;

    if (currentId === tr.id && currentAudio) {
      if (targetVol() > 0 && currentAudio.paused) {
        currentAudio.play().then(() => { unlocked = true; startFade(); emitChange(); }).catch(() => {});
      } else {
        startFade();
      }
      return;
    }

    if (currentAudio) {
      if (immediate) stopAud(currentAudio);
      else fadingOut.push(currentAudio);
    }

    const aud = new Audio(tr.file);
    aud.loop = true;
    aud.preload = 'auto';
    aud.volume = immediate ? targetVol() : 0;
    currentAudio = aud;
    currentId = tr.id;

    if (targetVol() > 0) {
      aud.play().then(() => {
        unlocked = true;
        startFade();
        emitChange();
      }).catch(() => {
        // Browser blocked autoplay until first user gesture; unlock listener will start it.
      });
    } else {
      startFade();
    }
    emitChange();
  }

  function ensureUnlocked() {
    if (unlocked) return;
    unlocked = true;
    const id = desiredId();
    if (currentAudio && currentId === id) {
      if (targetVol() > 0 && currentAudio.paused) {
        currentAudio.volume = 0;
        currentAudio.play().then(() => { startFade(); emitChange(); }).catch(() => { unlocked = false; });
      }
    } else {
      playTrack(id);
    }
  }

  if (typeof window !== 'undefined') {
    const onGesture = () => ensureUnlocked();
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture, { passive: true });
  }

  const Music = {
    TRACKS,
    get volume() { return prefs.musicVol; },
    get muted() { return prefs.musicMuted; },
    get allMuted() { return prefs.musicMuted && prefs.sfxMuted; },
    get mode() { return mode; },
    get currentId() { return currentId || desiredId(); },
    get currentTrack() { return TRACK_MAP[currentId || desiredId()] || TRACKS[0]; },
    get playing() { return !!(currentAudio && !currentAudio.paused && !prefs.musicMuted && prefs.musicVol > 0); },

    setVolume(v) {
      prefs.musicVol = clamp01(v, prefs.musicVol);
      if (prefs.musicVol > 0 && prefs.musicMuted) prefs.musicMuted = false;
      savePrefs();
      this._syncVolume();
      emitChange();
    },

    setMuted(m) {
      prefs.musicMuted = !!m;
      savePrefs();
      this._syncVolume();
      emitChange();
    },

    toggleMute() {
      this.setMuted(!prefs.musicMuted);
      return prefs.musicMuted;
    },

    _syncVolume() {
      const goal = targetVol();
      if (!currentAudio) {
        if (goal > 0) playTrack(desiredId());
        return;
      }
      if (goal > 0 && currentAudio.paused) {
        currentAudio.volume = 0;
        currentAudio.play().then(() => { unlocked = true; startFade(); emitChange(); }).catch(() => {});
      } else {
        startFade();
      }
    },

    /** Set the game's contextual theme ('title' or a faction id). Takes effect when mode === 'auto'. */
    setContext(id) {
      contextId = TRACK_MAP[id] ? id : 'title';
      if (mode === 'auto') playTrack(contextId);
      else emitChange();
    },

    /** Pick 'auto' or a specific track id manually from the Settings menu. */
    selectTrack(id) {
      mode = id === 'auto' || !TRACK_MAP[id] ? 'auto' : id;
      playTrack(desiredId());
      emitChange();
    },

    stepTrack(delta) {
      const idx = TRACKS.findIndex((t) => t.id === this.currentId);
      const next = TRACKS[(Math.max(0, idx) + delta + TRACKS.length) % TRACKS.length];
      this.selectTrack(next.id);
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  V.SFX = SFX;
  V.Music = Music;
})(typeof globalThis !== 'undefined' ? globalThis : this);
