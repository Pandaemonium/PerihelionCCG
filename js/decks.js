/* TAU CETI — Deck rules, the saved-deck library, share codes, and Expedition Draft generator.
 *
 * A deck is { id?, name, faction, pact, doctrine, cards[] }:
 *   faction  the main faction: supplies the leader, the leader power and the board colours
 *   pact     optional partner faction (or null): up to PACT_LIMIT of its cards may be included,
 *            but never its Secret Project
 */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const CARDS = V.CARDS;
  const FACTIONS = V.FACTIONS;
  const DOCTRINES = V.DOCTRINES || {};

  const LEGACY_KEY = 'tauceti_custom_decks_v1'; // one unnamed deck per faction
  const LIBRARY_KEY = 'tauceti_decks_v2';
  const PREFS_KEY = 'tauceti_prefs_v1';
  const CAMPAIGN_KEY = 'tauceti_campaign_v1';
  const DRAFT_KEY = 'tauceti_expedition_v1';

  const Decks = {};
  Decks.DECK_SIZE = 30;
  Decks.PACT_LIMIT = 10;
  Decks.NAME_MAX = 32;

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

  const facLabel = (fid) => FACTIONS[fid].name.replace(/^The /, '');
  const copyLimit = (c) => (c.unique ? 1 : 2);
  Decks.copyLimit = (id) => copyLimit(CARDS[id]);

  /* ------------------------------------------------------------ deck rules */
  /** Tidy a deck-like object: known factions only, no self-pact, a real doctrine, a clean name. */
  Decks.normalize = function (d) {
    d = d || {};
    const faction = FACTIONS[d.faction] ? d.faction : Object.keys(FACTIONS)[0];
    const pact = d.pact && FACTIONS[d.pact] && d.pact !== faction ? d.pact : null;
    const name = String(d.name == null ? '' : d.name).replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, Decks.NAME_MAX);
    const out = {
      name: name || `${facLabel(faction)} deck`,
      faction, pact,
      doctrine: DOCTRINES[d.doctrine] ? d.doctrine : 'standard',
      cards: Array.isArray(d.cards) ? d.cards.filter((id) => typeof id === 'string') : [],
    };
    if (d.id != null) out.id = String(d.id);
    return out;
  };

  /** Where a card comes from in this deck: 'main' | 'pact' | 'neutral', or null if it is not allowed. */
  Decks.source = function (deck, id) {
    const c = CARDS[id];
    if (!c || c.token) return null;
    if (c.faction === 'neutral') return 'neutral';
    if (c.faction === deck.faction) return 'main';
    if (deck.pact && c.faction === deck.pact && !c.project) return 'pact';
    return null;
  };

  /** Every card id this deck may include: main faction, pact partner (no Secret Project), colonist. */
  Decks.poolFor = function (fid, pact) {
    const deck = { faction: fid, pact: pact && pact !== fid && FACTIONS[pact] ? pact : null };
    let ids = FACTIONS[fid].cards.slice();
    if (deck.pact) ids = ids.concat(FACTIONS[deck.pact].cards);
    return ids.concat(V.NEUTRAL_CARDS).filter((id) => Decks.source(deck, id));
  };

  Decks.pactCount = (deck) => deck.cards.reduce((n, id) => n + (Decks.source(deck, id) === 'pact' ? 1 : 0), 0);

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

  /** Why a card cannot be in this deck at all (ignoring counts), or null if it can. */
  Decks.whyIllegal = function (deck, id) {
    const c = CARDS[id];
    if (!c || c.token) return 'Unknown card: ' + id;
    if (Decks.source(deck, id)) return null;
    if (deck.pact && c.faction === deck.pact && c.project) return `${c.name} is your Pact partner's Secret Project — only its own faction can build it.`;
    return `${c.name} belongs to ${facLabel(c.faction)}, which is neither your faction nor your Pact partner.`;
  };

  /** Split a deck's cards into those the deck may hold and those it may not (after a faction or pact change). */
  Decks.partition = function (deck) {
    const legal = [], illegal = [];
    deck.cards.forEach((id) => (Decks.source(deck, id) ? legal : illegal).push(id));
    return { legal, illegal };
  };

  /**
   * Check a deck against the construction rules.
   * Accepts a deck object, or the older (factionId, cardList) form for single-faction decks.
   */
  Decks.validate = function (deck, list) {
    if (typeof deck === 'string') deck = { faction: deck, pact: null, cards: list || [] };
    const errs = [];
    const cards = deck.cards || [];
    if (!FACTIONS[deck.faction]) return { ok: false, errors: ['Unknown faction: ' + deck.faction], count: cards.length, pact: 0 };
    if (deck.pact && (!FACTIONS[deck.pact] || deck.pact === deck.faction)) errs.push('Invalid Pact partner.');
    const counts = {};
    const flagged = {};
    let pact = 0;
    cards.forEach((id) => {
      const why = Decks.whyIllegal(deck, id);
      if (why) { if (!flagged[id]) errs.push(why); flagged[id] = true; return; }
      const c = CARDS[id];
      if (Decks.source(deck, id) === 'pact') pact++;
      counts[id] = (counts[id] || 0) + 1;
      const max = copyLimit(c);
      if (counts[id] === max + 1) errs.push(`${c.name} exceeds limit (${max}).`);
    });
    if (pact > Decks.PACT_LIMIT) errs.push(`Too many Pact cards: ${pact} (limit ${Decks.PACT_LIMIT}).`);
    if (cards.length !== Decks.DECK_SIZE) errs.push(`Deck must have ${Decks.DECK_SIZE} cards (currently ${cards.length}).`);
    return { ok: errs.length === 0, errors: errs, count: cards.length, pact };
  };

  /* ------------------------------------------------------------ saved-deck library */
  function migrateLegacy() {
    const old = loadJSON(LEGACY_KEY, null);
    const lib = { next: 1, decks: [] };
    if (old && typeof old === 'object') {
      Object.keys(old).forEach((fid) => {
        const d = old[fid];
        if (!FACTIONS[fid] || !d || !Array.isArray(d.cards)) return;
        const deck = Decks.normalize({ name: `${facLabel(fid)} Custom`, faction: fid, pact: null, doctrine: d.doctrine, cards: d.cards });
        deck.cards = deck.cards.filter((id) => CARDS[id] && !CARDS[id].token);
        deck.id = 'd' + lib.next++;
        lib.decks.push(deck);
      });
    }
    return lib;
  }

  function loadLibrary() {
    let lib = loadJSON(LIBRARY_KEY, null);
    if (!lib || !Array.isArray(lib.decks)) {
      lib = migrateLegacy();
      if (lib.decks.length) saveJSON(LIBRARY_KEY, lib);
    }
    lib.decks = lib.decks.filter((d) => d && d.id != null && FACTIONS[d.faction]).map(Decks.normalize);
    lib.next = Math.max(lib.next | 0, 1);
    return lib;
  }

  /** All saved decks, oldest first. Includes unfinished decks; check Decks.validate(d).ok before playing one. */
  Decks.library = () => loadLibrary().decks;
  Decks.getDeck = (id) => loadLibrary().decks.find((d) => d.id === String(id)) || null;
  Decks.decksFor = (fid) => loadLibrary().decks.filter((d) => d.faction === fid);
  Decks.playableFor = (fid) => Decks.decksFor(fid).filter((d) => Decks.validate(d).ok);

  /** Save a deck (finished or not). Without an id — or with an unknown one — it is added as a new deck. */
  Decks.saveDeck = function (deck) {
    const lib = loadLibrary();
    const d = Decks.normalize(deck);
    const at = d.id == null ? -1 : lib.decks.findIndex((x) => x.id === d.id);
    if (at >= 0) lib.decks[at] = d;
    else { d.id = 'd' + lib.next++; lib.decks.push(d); }
    saveJSON(LIBRARY_KEY, lib);
    return d;
  };

  Decks.deleteDeck = function (id) {
    const lib = loadLibrary();
    lib.decks = lib.decks.filter((d) => d.id !== String(id));
    saveJSON(LIBRARY_KEY, lib);
  };

  /** A name not yet used in the library (ignoring the deck with id `exceptId`), e.g. "Canopy Swarm 2". */
  Decks.uniqueName = function (base, exceptId) {
    const taken = new Set(loadLibrary().decks.filter((d) => d.id !== exceptId).map((d) => d.name.toLowerCase()));
    base = String(base || 'New deck').slice(0, Decks.NAME_MAX - 4).trim() || 'New deck';
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; n < 500; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
    return base;
  };

  /* small UI preferences (last faction and deck picked on the title screen) */
  Decks.getPrefs = () => loadJSON(PREFS_KEY, {}) || {};
  Decks.savePrefs = (p) => saveJSON(PREFS_KEY, p);

  /* ------------------------------------------------------------ share codes */
  /** Encode a deck to a compact copy/paste string: TC2:faction:pact:doctrine:card=n,card=n,… */
  Decks.encode = function (deck) {
    const counts = Decks.countsFromList(deck.cards);
    const body = Object.keys(counts).sort().map((id) => `${id}=${counts[id]}`).join(',');
    return `TC2:${deck.faction}:${deck.pact || 'none'}:${deck.doctrine || 'standard'}:${body}`;
  };

  /** Decode a TC2 code (or an older single-faction TC1 / V1 code). Returns a deck, or { error }. */
  Decks.decode = function (str) {
    if (!str || typeof str !== 'string') return { error: 'Empty code.' };
    const parts = str.trim().split(':');
    const ver = parts[0];
    const legacy = ver === 'TC1' || ver === 'V1';
    if ((!legacy && ver !== 'TC2') || parts.length < (legacy ? 4 : 5)) return { error: 'Invalid Tau Ceti deck code.' };
    const fid = parts[1];
    if (!FACTIONS[fid]) return { error: 'Unknown faction: ' + fid };
    let pact = null;
    if (!legacy && parts[2] !== 'none') {
      if (!FACTIONS[parts[2]] || parts[2] === fid) return { error: 'Unknown Pact partner: ' + parts[2] };
      pact = parts[2];
    }
    const docPart = parts[legacy ? 2 : 3];
    const doctrine = DOCTRINES[docPart] ? docPart : 'standard';
    const cards = [];
    parts.slice(legacy ? 3 : 4).join(':').split(',').filter(Boolean).forEach((entry) => {
      const [id, nStr] = entry.split('=');
      const n = Math.min(2, Math.max(0, parseInt(nStr, 10) || 0));
      for (let i = 0; i < n; i++) cards.push(id.trim());
    });
    const v = Decks.validate({ faction: fid, pact, cards });
    if (!v.ok) return { error: v.errors[0] };
    return { faction: fid, fid, pact, doctrine, cards };
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
