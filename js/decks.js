/* TAU CETI — Deck storage, validation, share codes, and Expedition Draft generator. */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const CARDS = V.CARDS;
  const FACTIONS = V.FACTIONS;
  const DOCTRINES = V.DOCTRINES || {};

  const STORAGE_KEY = 'tauceti_custom_decks_v1';
  const CAMPAIGN_KEY = 'tauceti_campaign_v1';
  const DRAFT_KEY = 'tauceti_expedition_v1';

  const Decks = {};
  Decks.DECK_SIZE = 30;

  function loadJSON(key, fallback) {
    try {
      if (typeof localStorage === 'undefined') return fallback;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* storage unavailable */ }
  }

  /** Return all legal card ids for a faction's deckbuilder (faction cards + neutral non-tokens). */
  Decks.poolFor = function (fid) {
    const f = FACTIONS[fid];
    return f.cards.concat(V.NEUTRAL_CARDS);
  };

  Decks.countsFromList = function (list) {
    const map = {};
    list.forEach((id) => { if (CARDS[id]) map[id] = (map[id] || 0) + 1; });
    return map;
  };

  Decks.listFromCounts = function (map) {
    const out = [];
    Object.keys(map).forEach((id) => {
      const n = map[id] | 0;
      for (let i = 0; i < n; i++) out.push(id);
    });
    return out;
  };

  Decks.validate = function (fid, list) {
    const errs = [];
    const allowed = new Set(Decks.poolFor(fid));
    const counts = {};
    list.forEach((id) => {
      const c = CARDS[id];
      if (!c || c.token) { errs.push('Unknown card: ' + id); return; }
      if (!allowed.has(id)) { errs.push(`${c.name} belongs to another faction.`); return; }
      counts[id] = (counts[id] || 0) + 1;
      const max = c.unique ? 1 : 2;
      if (counts[id] > max) errs.push(`${c.name} exceeds limit (${max}).`);
    });
    if (list.length !== Decks.DECK_SIZE) errs.push(`Deck must have ${Decks.DECK_SIZE} cards (currently ${list.length}).`);
    return { ok: errs.length === 0, errors: errs, count: list.length };
  };

  Decks.getCustom = function (fid) {
    const all = loadJSON(STORAGE_KEY, {});
    const saved = all[fid];
    if (!saved || !Array.isArray(saved.cards)) return null;
    if (!Decks.validate(fid, saved.cards).ok) return null;
    return saved;
  };

  Decks.saveCustom = function (fid, cards, doctrine) {
    const all = loadJSON(STORAGE_KEY, {});
    all[fid] = { cards: cards.slice(), doctrine: DOCTRINES[doctrine] ? doctrine : 'standard' };
    saveJSON(STORAGE_KEY, all);
  };

  Decks.deleteCustom = function (fid) {
    const all = loadJSON(STORAGE_KEY, {});
    delete all[fid];
    saveJSON(STORAGE_KEY, all);
  };

  /** Encode a deck to a compact copy/paste string. */
  Decks.encode = function (fid, doctrine, cards) {
    const counts = Decks.countsFromList(cards);
    const body = Object.keys(counts).sort().map((id) => `${id}=${counts[id]}`).join(',');
    return `TC1:${fid}:${doctrine || 'standard'}:${body}`;
  };

  Decks.decode = function (str) {
    if (!str || typeof str !== 'string') return { error: 'Empty code.' };
    const parts = str.trim().split(':');
    if (parts.length < 4 || (parts[0] !== 'TC1' && parts[0] !== 'V1')) return { error: 'Invalid Tau Ceti deck code.' };
    const fid = parts[1];
    const doctrine = DOCTRINES[parts[2]] ? parts[2] : 'standard';
    if (!FACTIONS[fid]) return { error: 'Unknown faction: ' + fid };
    const cards = [];
    parts.slice(3).join(':').split(',').filter(Boolean).forEach((entry) => {
      const [id, nStr] = entry.split('=');
      const n = Math.min(2, Math.max(0, parseInt(nStr, 10) || 0));
      for (let i = 0; i < n; i++) cards.push(id);
    });
    const v = Decks.validate(fid, cards);
    if (!v.ok) return { error: v.errors[0] };
    return { fid, doctrine, cards };
  };

  /* ------------------------------------------------------------ campaign progress */
  Decks.getCampaignProgress = () => loadJSON(CAMPAIGN_KEY, { cleared: [] });
  Decks.markMissionCleared = function (missionId) {
    const p = Decks.getCampaignProgress();
    if (!p.cleared.includes(missionId)) { p.cleared.push(missionId); saveJSON(CAMPAIGN_KEY, p); }
    return p;
  };

  /* ------------------------------------------------------------ Expedition Draft mode */
  Decks.getDraft = () => loadJSON(DRAFT_KEY, null);
  Decks.saveDraft = (run) => saveJSON(DRAFT_KEY, run);
  Decks.clearDraft = () => saveJSON(DRAFT_KEY, null);

  function pickN(pool, n) {
    const copy = pool.slice();
    const out = [];
    while (out.length < n && copy.length) {
      const i = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(i, 1)[0]);
    }
    return out;
  }

  /** Start a new 5-battle Expedition run with an 18-card core deck and 3 draft packs. */
  Decks.startDraft = function (fid, doctrine) {
    const f = FACTIONS[fid];
    const firstPreset = Object.keys(f.presets)[0];
    const full = V.buildDeck(fid, firstPreset);
    // Take an 18-card balanced core slice (sorted by cost, taking low/mid cards)
    const core = full.slice().sort((a, b) => CARDS[a].cost - CARDS[b].cost).slice(0, 18);
    const others = Object.keys(FACTIONS).filter((id) => id !== fid);
    const oppOrder = pickN(others, 5);
    const biomes = ['tau_ceti', 'monsoon', 'rift', 'debris', 'tau_ceti'];
    const run = {
      fid,
      doctrine: doctrine || f.presets[firstPreset].doctrine || 'standard',
      stage: 0, // 0..4 (5 battles)
      wins: 0,
      losses: 0,
      deck: core,
      opps: oppOrder,
      biomes,
      pendingDraft: Decks.rollDraftOptions(fid, core, 0),
    };
    Decks.saveDraft(run);
    return run;
  };

  Decks.rollDraftOptions = function (fid, currentDeck, stage) {
    const f = FACTIONS[fid];
    const counts = Decks.countsFromList(currentDeck);
    const avail = (id) => {
      const c = CARDS[id];
      if (!c || c.token) return false;
      const max = c.unique ? 1 : 2;
      return (counts[id] || 0) < max;
    };
    const facPool = f.cards.filter((id) => !CARDS[id].project && avail(id));
    const neuPool = V.NEUTRAL_CARDS.filter((id) => !CARDS[id].project && avail(id));
    const projPool = f.cards.concat(V.NEUTRAL_CARDS).filter((id) => CARDS[id].project && avail(id));
    const foreignPool = Object.keys(CARDS).filter((id) => {
      const c = CARDS[id];
      return !c.token && !c.project && c.faction !== 'neutral' && c.faction !== fid && avail(id);
    });

    const bundles = [
      {
        title: `${f.name.replace(/^The /, '')} Reinforcements`,
        tag: 'Faction Pack',
        cards: pickN(facPool.length >= 3 ? facPool : facPool.concat(neuPool), 3),
      },
      {
        title: stage >= 1 && projPool.length ? 'Secret Project Blueprint' : 'Colony Tech & Terrain',
        tag: stage >= 1 && projPool.length ? 'Project Bundle' : 'Support Pack',
        cards: stage >= 1 && projPool.length
          ? pickN(projPool, 1).concat(pickN(neuPool.concat(facPool), 2))
          : pickN(neuPool, 2).concat(pickN(facPool, 1)),
      },
      {
        title: 'Smuggled Mercenaries',
        tag: 'Cross-Faction',
        cards: pickN(foreignPool, 2).concat(pickN(facPool.concat(neuPool), 1)),
      },
    ];
    return bundles;
  };

  V.Decks = Decks;
})(typeof globalThis !== 'undefined' ? globalThis : this);
