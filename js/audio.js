/* TAU CETI — Procedural WebAudio sci-fi sound effects (zero external assets). */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const MUTE_KEY = 'tauceti_muted_v1';

  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* ignore */ }

  function ensure() {
    if (muted || typeof window === 'undefined') return null;
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
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd && freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainVal || 0.08, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const SFX = {
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (!muted) SFX.click();
      return muted;
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

  V.SFX = SFX;
})(typeof globalThis !== 'undefined' ? globalThis : this);
