/* TAU CETI — rules engine. No DOM access; game state is plain JSON so it can be cloned for the AI.
 *
 * The board: each player has LANES lanes. A lane holds one unit (front), one location (back),
 * and a shared planetary terrain / Supply Pod in the centre strip.
 */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const CARDS = V.CARDS;
  const FACTIONS = V.FACTIONS;
  const BIOMES = V.BIOMES || {};
  const DOCTRINES = V.DOCTRINES || {};

  const E = {};
  E.LANES = 7;
  E.CENTER = 3;
  E.MAX_HAND = 9;
  E.START_HP = 30;
  E.MAX_ENERGY = 10;
  E.RAZE_DAMAGE = 3;
  E.PROJECT_RAZE_DAMAGE = 5;
  E.ASCENT_RESEARCH = 22;
  E.ARCHIVE_COST = 1;
  // Opening hands: the player who moves second is compensated with extra cards and Reserve Cells. With the
  // opening mulligan those extra cards are worth more (more cards to swap), and the first player won only 46%,
  // so the first player's colony starts with a little more Integrity: 4 measured 49.7% (test/meta.js, 2026-11-25).
  E.START_CARDS = 3;
  E.SECOND_EXTRA_CARDS = 2;
  E.SECOND_CELLS = 1;
  E.FIRST_HP = 4;
  E.MILESTONES = [4, 8, 13];
  E.MILESTONE_TEXT = [
    'Breakthrough I — draw a card.',
    'Breakthrough II — your leader power costs 1.',
    'Breakthrough III — draw 2 cards and give your units +1/+1.',
  ];

  /* ------------------------------------------------------------ refs */
  const unitRef = (u) => ({ k: 'u', uid: u.uid });
  const siteRef = (s) => ({ k: 's', uid: s.uid });
  const leaderRef = (pid) => ({ k: 'l', pid });
  const laneRef = (lane) => ({ k: 'c', lane });
  function sameRef(a, b) {
    if (!a || !b || a.k !== b.k) return false;
    if (a.k === 'l') return a.pid === b.pid;
    if (a.k === 'c') return a.lane === b.lane;
    return a.uid === b.uid;
  }
  E.unitRef = unitRef;
  E.siteRef = siteRef;
  E.leaderRef = leaderRef;
  E.laneRef = laneRef;
  E.sameRef = sameRef;

  function ev(g, e) { if (!g.silent) g.events.push(e); }

  /* ------------------------------------------------------------ rng */
  function rnd(g) {
    g.seed = (g.seed + 0x6d2b79f5) | 0;
    let t = g.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  E.rand = (g, n) => Math.floor(rnd(g) * n);
  E.pick = (g, arr) => (arr.length ? arr[E.rand(g, arr.length)] : null);

  function shuffle(g, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = E.rand(g, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ------------------------------------------------------------ board queries */
  const alive = (x) => x.hp > 0 && !x.doomed;
  E.alive = alive;
  E.siteActive = (g, s) => !!(s && alive(s) && !(s.jammed > 0));

  /** The numbers a doctrine applies (see DOCTRINES in world.js); an empty object for Frontier. */
  const docRules = (id) => (DOCTRINES[id] && DOCTRINES[id].rules) || {};
  E.doctrine = (g, pid) => docRules(g.players[pid].doctrine);
  E.milestones = (g, pid) => { const d = E.doctrine(g, pid).milestones || 0; return d ? E.MILESTONES.map((m) => m + d) : E.MILESTONES; };
  E.maxHand = (g, pid) => E.MAX_HAND + (E.doctrine(g, pid).hand || 0);

  E.find = function (g, uid) {
    for (const p of g.players) {
      const idx = p.board.findIndex((u) => u.uid === uid);
      if (idx >= 0) return { unit: p.board[idx], pid: p.id, idx };
    }
    return null;
  };
  E.findSite = function (g, uid) {
    for (const p of g.players) {
      const idx = p.sites.findIndex((s) => s.uid === uid);
      if (idx >= 0) return { site: p.sites[idx], pid: p.id, idx };
    }
    return null;
  };

  E.unitAt = (g, pid, lane) => g.players[pid].board.find((u) => u.lane === lane) || null;
  E.siteAt = (g, pid, lane) => g.players[pid].sites.find((s) => s.lane === lane) || null;

  E.stationed = function (g, site) {
    const u = E.unitAt(g, site.owner, site.lane);
    return u && alive(u) ? u : null;
  };
  E.siteBehind = function (g, u) {
    const s = E.siteAt(g, u.owner, u.lane);
    return E.siteActive(g, s) ? s : null;
  };

  function siteSum(g, pid, prop, needStaff) {
    let total = 0;
    g.players[pid].sites.forEach((s) => {
      if (!E.siteActive(g, s)) return;
      const d = CARDS[s.id];
      if (!d[prop]) return;
      // needStaff: true = always, 'card' = only if the location itself says it needs a unit stationed
      if ((needStaff === 'card' ? d.needsStaff : needStaff) && !E.stationed(g, s)) return;
      total += d[prop];
    });
    return total;
  }

  E.maxEnergyCap = (g, pid) => Math.max(1, (siteSum(g, pid, 'energyCap') > 0 ? 12 : E.MAX_ENERGY) + (E.doctrine(g, pid).maxEnergy || 0));

  /** Numeric value for stackable keywords (zeal, flank). */
  E.kwVal = function (g, u, k) {
    let v = typeof u.kw[k] === 'number' ? u.kw[k] : (u.kw[k] ? 1 : 0);
    const s = E.siteBehind(g, u);
    const grant = s && CARDS[s.id].grant;
    if (grant && grant[k]) v += typeof grant[k] === 'number' ? grant[k] : 1;
    if (k === 'zeal') {
      v += E.doctrine(g, u.owner).zeal || 0;
      v += siteSum(g, u.owner, 'zealAura');
    }
    if (k === 'flank') {
      v += siteSum(g, u.owner, 'globalFlank', true);
    }
    return v;
  };

  /** Keyword check including site grants, lane terrain, doctrines, and global Secret Projects. */
  E.hasKw = function (g, u, k) {
    if (k === 'zeal' || k === 'flank') return E.kwVal(g, u, k) > 0;
    if (u.kw[k]) return true;
    const s = E.siteBehind(g, u);
    const grant = s && CARDS[s.id].grant;
    if (grant && grant[k]) return true;
    const terrain = g.lanes && g.lanes[u.lane] ? g.lanes[u.lane].terrain : null;
    if (k === 'interceptor' && terrain === 'sensor') return true;
    if (k === 'guard' && terrain === 'wreck') return true;
    if (k === 'mobile' && siteSum(g, u.owner, 'globalMobile', true) > 0) return true;
    return false;
  };

  E.reach = function (g, u) {
    let r = E.hasKw(g, u, 'artillery') ? 2 : 1;
    if (g.lanes && g.lanes[u.lane] && g.lanes[u.lane].terrain === 'ridge') r += 1;
    return r;
  };

  /** Effective attack of unit `u` (optionally against `target`; pass `isAttacking=false` for defender retaliation). */
  E.effectiveAtk = function (g, u, target, isAttacking) {
    const attacking = isAttacking !== false;
    let a = u.atk + (u.tempAtk || 0);
    if (CARDS[u.id].woundAtk) a += CARDS[u.id].woundAtk * Math.max(0, u.maxHp - u.hp);
    if (g.active === u.owner) a += E.kwVal(g, u, 'zeal');
    if (siteSum(g, u.owner, 'raiderBuff') > 0 && (E.hasKw(g, u, 'blitz') || E.hasKw(g, u, 'aerial'))) a += 1;
    if (target) {
      let tLane = null;
      if (target.k === 'u') {
        const f = E.find(g, target.uid);
        if (f) {
          tLane = f.unit.lane;
          if (E.hasKw(g, u, 'interceptor') && E.hasKw(g, f.unit, 'aerial')) a += 1;
        }
      } else if (target.k === 's') {
        const f = E.findSite(g, target.uid);
        if (f) tLane = f.site.lane;
        const cd = CARDS[u.id];
        if (attacking && cd.siteBonusTech && E.tech(g, u.owner, cd.siteBonusTech)) a += 2;
        if (attacking && cd.siteBonus) a += cd.siteBonus;
      }
      if (attacking && tLane != null && tLane !== u.lane) a += E.kwVal(g, u, 'flank');
    }
    return Math.max(0, a);
  };

  function lanesWhere(test) {
    const out = [];
    for (let i = 0; i < E.LANES; i++) if (test(i)) out.push(i);
    return out;
  }
  E.emptyLanes = (g, pid) => lanesWhere((i) => !E.unitAt(g, pid, i));
  E.emptyPlots = (g, pid) => lanesWhere((i) => !E.siteAt(g, pid, i));

  E.nearestEmpty = function (g, pid, lane) {
    for (let d = 0; d < E.LANES; d++) {
      const opts = [lane - d, lane + d].filter((x, i, a) => x >= 0 && x < E.LANES && a.indexOf(x) === i && !E.unitAt(g, pid, x));
      if (opts.length) return opts.sort((a, b) => Math.abs(a - E.CENTER) - Math.abs(b - E.CENTER) || a - b)[0];
    }
    return null;
  };

  /** Terrain id of a lane's centre strip, or null. */
  E.terrainAt = (g, lane) => (g.lanes && g.lanes[lane] ? g.lanes[lane].terrain : null);

  E.allUnits = (g) => g.players[g.active].board.concat(g.players[1 - g.active].board).filter(alive);

  E.tech = function (g, pid, n) {
    const red = siteSum(g, pid, 'techReduction');
    return g.players[pid].research >= Math.max(0, n - red);
  };

  E.inReach = function (g, u) {
    const r = E.reach(g, u);
    return g.players[1 - u.owner].board.filter((x) => alive(x) && Math.abs(x.lane - u.lane) <= r);
  };

  /** Enemy units in the opposite or immediately adjacent (diagonal) lanes (distance <= 1). */
  E.frontEnemies = function (g, u) {
    return g.players[1 - u.owner].board.filter((x) => alive(x) && Math.abs(x.lane - u.lane) <= 1);
  };

  /** Can unit u strike the enemy colony, going by position and keywords alone? Any enemy unit opposite or beside it screens the colony. */
  E.unscreened = function (g, u) {
    const front = E.frontEnemies(g, u);
    if (E.hasKw(g, u, 'aerial')) return !front.some((x) => E.hasKw(g, x, 'interceptor'));
    return front.length === 0;
  };

  /**
   * Can unit u strike enemy location s, going by position and keywords alone (not whether it has acted)?
   * A ground unit is stopped by an enemy Guard opposite or beside it, and by any enemy unit standing in the
   * lanes from its own lane to the location's lane inclusive. Units further along do not protect the location.
   * An Aerial unit is stopped only by an Interceptor opposite or beside it.
   */
  E.siteOpen = function (g, u, s) {
    if (!alive(s) || Math.abs(s.lane - u.lane) > E.reach(g, u)) return false;
    const front = E.frontEnemies(g, u);
    if (E.hasKw(g, u, 'aerial')) return !front.some((x) => E.hasKw(g, x, 'interceptor'));
    if (front.some((x) => E.hasKw(g, x, 'guard'))) return false;
    const lo = Math.min(u.lane, s.lane), hi = Math.max(u.lane, s.lane);
    return !g.players[1 - u.owner].board.some((x) => alive(x) && x.lane >= lo && x.lane <= hi);
  };

  E.randomEnemy = function (g, pid) {
    const foe = g.players[1 - pid];
    const pool = foe.board.filter(alive).map(unitRef);
    if (foe.hp > 0) pool.push(leaderRef(foe.id));
    return E.pick(g, pool);
  };

  /** A card is foreign to a player if it belongs to neither their faction, their Pact partner, nor the colonists. */
  E.isForeign = function (g, pid, cardId) {
    const p = g.players[pid];
    const fac = known(cardId).faction;
    return fac !== 'neutral' && fac !== p.faction && fac !== p.pact;
  };

  E.randomForeignCard = function (g, pid) {
    const pool = Object.keys(CARDS).filter((id) => !CARDS[id].token && !CARDS[id].project && E.isForeign(g, pid, id));
    return E.pick(g, pool);
  };

  /* ------------------------------------------------------------ setup */
  function mkPlayer(id, faction, doctrine, hpOverride, pact) {
    const doc = doctrine || 'standard';
    const rules = docRules(doc);
    const startHp = hpOverride != null ? hpOverride : E.START_HP + (rules.hp || 0);
    return {
      id, faction, pact: pact && pact !== faction && FACTIONS[pact] ? pact : null,
      doctrine: doc, hp: startHp, maxHp: startHp,
      armor: 0,
      energy: 0, maxEnergy: 0,
      research: rules.research || 0,
      powerUsed: false, fatigue: 0, cardsPlayedThisTurn: 0, unitsDeployedThisTurn: 0, diedThisTurn: 0,
      razed: 0,     // enemy locations razed this game
      blackBox: 0,  // Black Box cards played this game
      grave: [],    // card ids of my non-token units destroyed this game and not yet brought back
      lost: 0,      // how many of my non-token units have been destroyed this game
      deck: [], hand: [], board: [], sites: [],
    };
  }

  /** A preset deck brings its Pact partner with it, unless the caller names one or supplies its own card list. */
  function presetPact(f, customDeck, preset, pact) {
    if (pact !== undefined || customDeck) return pact || null;
    const presets = (FACTIONS[f] && FACTIONS[f].presets) || {};
    const pre = presets[preset] || presets[Object.keys(presets)[0]];
    return (pre && pre.pact) || null;
  }

  /**
   * Create a new game.
   * Backwards compatible with E.newGame(f0, f1, seed, first) plus optional opts:
   *   { biome, deck0, deck1, preset0, preset1, pact0, pact1, doctrine0, doctrine1, plan0, plan1, hp0, hp1, bossName, bossArt, mulligan }
   * mulligan: true deals the opening hands and then waits for each player's E.mulligan before the first turn.
   * pact0 / pact1 name each side's Pact partner faction, if its deck has one. A preset that has a Pact supplies it.
   * plan0 / plan1 give a custom deck a game plan for the AI to pilot it by (see the presets in cards.js).
   */
  E.newGame = function (f0, f1, seed, first, opts) {
    opts = opts || {};
    const biomeId = opts.biome || 'tau_ceti';
    const decreeId = opts.decree || 'none';
    const g = {
      seed: (seed | 0) || 1,
      biome: biomeId,
      decree: decreeId,
      humanPid: opts.human != null ? opts.human : null,
      forecast: null,
      players: [
        mkPlayer(0, f0, opts.doctrine0, opts.hp0, presetPact(f0, opts.deck0, opts.preset0, opts.pact0)),
        mkPlayer(1, f1, opts.doctrine1, opts.hp1, presetPact(f1, opts.deck1, opts.preset1, opts.pact1)),
      ],
      lanes: [],
      active: first ? 1 : 0, turn: 0, over: false, winner: null, winReason: null,
      bossName: opts.bossName || null, bossArt: opts.bossArt || null,
      events: [], nextUid: 1, silent: false,
    };

    const biome = BIOMES[biomeId] || BIOMES.classic;
    g.lanes = biome ? biome.generate((n) => E.rand(g, n)) : Array.from({ length: E.LANES }, () => ({ terrain: null, pod: false }));

    if (decreeId === 'solar_shade') {
      g.lanes.forEach((l) => { l.terrain = null; });
    } else if (decreeId === 'fungal_bloom') {
      [0, 3, 6].forEach((ln) => { g.lanes[ln].terrain = 'fungus'; });
    }

    // a doctrine may turn lanes into Xenofungus, replacing whatever terrain the map put there
    g.players.forEach((p) => {
      (docRules(p.doctrine).fungusLanes || []).forEach((ln) => { g.lanes[ln].terrain = 'fungus'; });
    });

    g.players.forEach((p, idx) => {
      const customDeck = idx === 0 ? opts.deck0 : opts.deck1;
      const preset = idx === 0 ? opts.preset0 : opts.preset1;
      const list = customDeck ? customDeck.slice() : V.buildDeck(p.faction, preset);
      if (decreeId === 'repeal_charter') {
        list.push('planet_buster');
        if ((idx === 0 ? opts.hp0 : opts.hp1) == null) { p.hp += 5; p.maxHp += 5; }
      }
      // The AI looks up a preset's game plan by its key; a custom deck may bring a plan of its own (plain data).
      const presets = FACTIONS[p.faction].presets || {};
      p.preset = customDeck ? null : (presets[preset] ? preset : Object.keys(presets)[0] || null);
      const plan = idx === 0 ? opts.plan0 : opts.plan1;
      if (plan) p.plan = plan;
      p.deck = shuffle(g, list);
      E.build(g, p.id, 'landing', E.CENTER, true);
      for (let i = 0; i < (docRules(p.doctrine).cells || 0); i++) E.addToHand(g, p.id, 'cell');
    });

    const a = g.active;
    // the first player's extra Integrity, unless the caller fixed that colony's Integrity (a campaign boss, a test)
    if ((a === 0 ? opts.hp0 : opts.hp1) == null) { g.players[a].hp += E.FIRST_HP; g.players[a].maxHp += E.FIRST_HP; }
    const extra = (pid) => docRules(g.players[pid].doctrine).cards || 0;
    E.draw(g, a, E.START_CARDS + extra(a));
    E.draw(g, 1 - a, E.START_CARDS + E.SECOND_EXTRA_CARDS + extra(1 - a));
    for (let i = 0; i < E.SECOND_CELLS; i++) E.addToHand(g, 1 - a, 'cell');
    g.events = [];
    // With opts.mulligan the game waits here: each player calls E.mulligan once, and the first turn starts
    // after the second of them. Without it the game starts at once, which is what the unit tests want.
    if (opts.mulligan) g.mulligan = [true, true];
    else startTurn(g);
    return g;
  };

  /* ------------------------------------------------------------ opening mulligan */
  /** The cards of pid's opening hand that may be swapped: everything but tokens such as Energy Cells. */
  E.mulliganOptions = function (g, pid) {
    if (!g.mulligan || !g.mulligan[pid]) return [];
    return g.players[pid].hand.filter((hc) => !CARDS[hc.id].token);
  };

  /**
   * Swap cards of the opening hand, once: `uids` are the hand cards to send back (an empty list keeps the hand).
   * The replacements are drawn first and the returned cards are then shuffled into the deck, so a card sent back
   * cannot come straight back. The first turn starts when both players have had their mulligan.
   */
  E.mulligan = function (g, pid, uids) {
    if (!g.mulligan || !g.mulligan[pid]) return false;
    const p = g.players[pid];
    const can = E.mulliganOptions(g, pid);
    const back = can.filter((hc) => (uids || []).includes(hc.uid));
    if (back.length !== new Set(uids || []).size || back.length > p.deck.length) return false;
    back.forEach((hc) => {
      const id = p.deck.pop();
      p.hand[p.hand.indexOf(hc)] = { uid: g.nextUid++, id, cost: CARDS[id].cost };
    });
    if (back.length) {
      back.forEach((hc) => p.deck.push(hc.id));
      shuffle(g, p.deck);
    }
    p.mulliganed = back.length;
    g.mulligan[pid] = false;
    ev(g, { t: 'mulligan', pid, n: back.length });
    if (!g.mulligan[0] && !g.mulligan[1]) {
      g.mulligan = null;
      startTurn(g);
    }
    return true;
  };

  // The state is plain JSON, so a field-by-field copy is the same as a JSON round trip and several times faster.
  function copy(x) {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) {
      const a = new Array(x.length);
      for (let i = 0; i < x.length; i++) a[i] = copy(x[i]);
      return a;
    }
    const o = {};
    for (const k in x) o[k] = copy(x[k]);
    return o;
  }

  E.clone = function (g) {
    const c = {};
    for (const k in g) if (k !== 'events') c[k] = copy(g[k]);
    c.events = [];
    c.silent = true;
    c.seed = (Math.random() * 0x7fffffff) | 0;
    c.players.forEach((p) => shuffle(c, p.deck));
    return c;
  };

  /* ------------------------------------------------------------ primitive effects */
  E.damage = function (g, ref, n, src, opts) {
    if (n <= 0 || !ref) return 0;
    opts = opts || {};
    const psi = !!opts.psi || !!(src && E.hasKw(g, src, 'psi'));

    // Knowledge Directive vulnerability to enemy Orders
    if (opts.order && opts.pid != null) {
      let targetOwner = null;
      if (ref.k === 'l') targetOwner = ref.pid;
      else if (ref.k === 's') { const f = E.findSite(g, ref.uid); if (f) targetOwner = f.pid; }
      else { const f = E.find(g, ref.uid); if (f) targetOwner = f.pid; }
      if (targetOwner != null && targetOwner !== opts.pid) n += E.doctrine(g, targetOwner).orderVuln || 0;
    }

    if (ref.k === 'l') {
      const p = g.players[ref.pid];
      let rem = n;
      if (!psi && p.armor > 0) { const a = Math.min(p.armor, rem); p.armor -= a; rem -= a; }
      p.hp -= rem;
      ev(g, { t: 'dmg', ref, n, psi });
    } else if (ref.k === 's') {
      const f = E.findSite(g, ref.uid);
      if (!f || !alive(f.site)) return 0;
      let dealt = n;
      if (!psi) {
        let arm = siteSum(g, f.pid, 'siteArmor');
        if (g.lanes[f.site.lane] && g.lanes[f.site.lane].terrain === 'wreck') arm += 1;
        if (arm > 0) dealt = Math.max(1, dealt - arm);
      }
      f.site.hp -= dealt;
      ev(g, { t: 'dmg', ref, n: dealt, psi });
      n = dealt;
    } else {
      const f = E.find(g, ref.uid);
      if (!f || !alive(f.unit)) return 0;
      const u = f.unit;
      if (!psi && u.kw.shield) { u.kw.shield = false; ev(g, { t: 'block', ref, id: u.id, pid: f.pid }); return 0; } // pid = the shielded unit's owner
      u.hp -= n;
      ev(g, { t: 'dmg', ref, n, psi });
      if (alive(u) && CARDS[u.id].onHurt) CARDS[u.id].onHurt(g, { pid: f.pid, self: u, n });
    }
    if (src && E.hasKw(g, src, 'siphon')) E.heal(g, leaderRef(src.owner), n);
    return n;
  };

  E.heal = function (g, ref, n) {
    if (!ref || n <= 0) return;
    let t;
    if (ref.k === 'l') t = g.players[ref.pid];
    else if (ref.k === 's') { const f = E.findSite(g, ref.uid); if (!f) return; t = f.site; }
    else { const f = E.find(g, ref.uid); if (!f) return; t = f.unit; }
    const amt = Math.min(n, t.maxHp - t.hp);
    if (amt <= 0) return;
    t.hp += amt;
    ev(g, { t: 'heal', ref, n: amt });
  };

  E.buff = function (g, u, a, h) {
    u.atk = Math.max(0, u.atk + a);
    u.hp += h;
    u.maxHp += h;
    ev(g, { t: 'buff', ref: unitRef(u), a, h });
  };

  E.jam = function (g, ref, turns) {
    if (!ref) return;
    const t = turns || 1;
    if (ref.k === 's') {
      const f = E.findSite(g, ref.uid);
      if (f && alive(f.site)) { f.site.jammed = Math.max(f.site.jammed || 0, t); ev(g, { t: 'jam', ref }); fire(g, 1 - f.pid, 'onEnemyJam', { ref }); }
    } else if (ref.k === 'u') {
      const f = E.find(g, ref.uid);
      if (f && alive(f.unit)) { f.unit.jammed = Math.max(f.unit.jammed || 0, t); ev(g, { t: 'jam', ref }); fire(g, 1 - f.pid, 'onEnemyJam', { ref }); }
    }
  };

  /**
   * Return a unit to its owner's hand as a fresh card (costMod changes what it costs there). It is not destroyed:
   * no Last Stand, and it does not count as lost. A token simply leaves play, and so does a card that finds the
   * hand full. Returns the new hand card, or null.
   */
  E.bounce = function (g, ref, costMod) {
    const f = ref && ref.k === 'u' ? E.find(g, ref.uid) : null;
    if (!f || !alive(f.unit)) return null;
    const u = f.unit, p = g.players[f.pid];
    p.board.splice(f.idx, 1);
    ev(g, { t: 'bounce', ref, id: u.id, pid: f.pid });
    let hc = null;
    if (!CARDS[u.id].token) {
      if (p.hand.length >= E.maxHand(g, f.pid)) ev(g, { t: 'burn', pid: f.pid, id: u.id });
      else {
        hc = { uid: g.nextUid++, id: u.id, cost: Math.max(0, CARDS[u.id].cost + (costMod || 0)) };
        p.hand.push(hc);
      }
    }
    fire(g, f.pid, 'onAllyBounce', { id: u.id });
    return hc;
  };

  /**
   * Take one of pid's destroyed units out of the record of the fallen: the costliest that passes `test(cardDef)`,
   * or a random one that does if `random` is set. Returns its card id, or null if there is none.
   */
  E.salvage = function (g, pid, test, random) {
    const p = g.players[pid];
    const at = [];
    p.grave.forEach((id, i) => { if (!test || test(known(id))) at.push(i); });
    if (!at.length) return null;
    let i;
    if (random) i = E.pick(g, at);
    else i = at.reduce((best, x) => (CARDS[p.grave[x]].cost > CARDS[p.grave[best]].cost ? x : best), at[0]);
    return p.grave.splice(i, 1)[0];
  };

  E.destroy = function (g, ref) {
    const f = ref.k === 's' ? E.findSite(g, ref.uid) : E.find(g, ref.uid);
    if (f) (f.unit || f.site).doomed = true;
  };

  /** Mark a unit as purged (no Last Stand, does not enter the fallen pile). Works whether alive or freshly at <=0 HP. */
  E.purgeUnit = function (g, ref) {
    if (!ref || ref.k !== 'u') return;
    const f = E.find(g, ref.uid);
    if (f) { f.unit.purged = true; f.unit.doomed = true; }
  };

  /** Remove the costliest unit from pid's fallen pile. Returns its card id, or null if empty. */
  E.purgeGrave = function (g, pid) {
    const id = E.salvage(g, pid);
    if (id) ev(g, { t: 'purge_grave', pid, id });
    return id;
  };

  E.gainArmor = function (g, pid, n) {
    if (n <= 0) return;
    g.players[pid].armor += n;
    ev(g, { t: 'armor', ref: leaderRef(pid), n });
    fire(g, pid, 'onArmor', { n });
  };

  E.gainEnergy = function (g, pid, n) { g.players[pid].energy += n; };

  E.setTerrain = function (g, lane, terrainId) {
    if (lane < 0 || lane >= E.LANES) return;
    if (g.lanes[lane].terrain === terrainId) return;
    g.lanes[lane].terrain = terrainId;
    ev(g, { t: 'terrain', lane, terrain: terrainId });
  };

  E.swapTerrain = function (g, a, b) {
    if (a < 0 || a >= E.LANES || b < 0 || b >= E.LANES || a === b) return false;
    const ta = g.lanes[a].terrain, tb = g.lanes[b].terrain;
    if (ta === tb) return false;
    g.lanes[a].terrain = tb;
    g.lanes[b].terrain = ta;
    ev(g, { t: 'terrain', lane: a, terrain: tb });
    ev(g, { t: 'terrain', lane: b, terrain: ta });
    return true;
  };

  E.dropPod = function (g, lane) {
    if (lane < 0 || lane >= E.LANES || g.lanes[lane].pod) return;
    g.lanes[lane].pod = true;
    ev(g, { t: 'pod_drop', lane });
  };

  E.claimPod = function (g, pid, u) {
    if (!u || !alive(u) || !g.lanes[u.lane] || !g.lanes[u.lane].pod) return;
    g.lanes[u.lane].pod = false;
    const roll = E.rand(g, 5);
    const names = ['cells', 'research', 'medkit', 'upgrade', 'worm'];
    const outcome = names[roll];
    ev(g, { t: 'pod_claim', pid, lane: u.lane, outcome });
    if (outcome === 'cells') {
      E.addToHand(g, pid, 'cell');
      E.addToHand(g, pid, 'cell');
    } else if (outcome === 'research') {
      E.gainResearch(g, pid, 2);
    } else if (outcome === 'medkit') {
      const p = g.players[pid];
      if (p.hp < p.maxHp) E.heal(g, leaderRef(pid), 4);
      else E.gainArmor(g, pid, 3);
    } else if (outcome === 'upgrade') {
      E.buff(g, u, 1, 1);
      u.kw.shield = true;
    } else if (outcome === 'worm') {
      E.summon(g, pid, 'mind_worm', u.lane);
    }
    fire(g, pid, 'onPod', { claimer: u, outcome });
  };

  E.pushUnit = function (g, u) {
    if (!u || !alive(u) || u.immobile) return false;
    const opts = [u.lane - 1, u.lane + 1].filter((x) => x >= 0 && x < E.LANES && !E.unitAt(g, u.owner, x));
    if (!opts.length) return false;
    // Prefer moving away from center (or off a staffed site)
    opts.sort((a, b) => Math.abs(b - E.CENTER) - Math.abs(a - E.CENTER));
    const from = u.lane;
    const to = opts[0];
    u.lane = to;
    ev(g, { t: 'move', pid: u.owner, ref: unitRef(u), id: u.id, from, to });
    E.claimPod(g, u.owner, u);
    const s = E.siteBehind(g, u);
    if (s && CARDS[s.id].onMoveArrive) CARDS[s.id].onMoveArrive(g, { pid: u.owner, self: s, unit: u });
    if (alive(u) && CARDS[u.id].onMove) CARDS[u.id].onMove(g, { pid: u.owner, self: u, from });
    return true;
  };

  E.pullUnit = function (g, u) {
    if (!u || !alive(u) || u.immobile) return false;
    const opts = [u.lane - 1, u.lane + 1].filter((x) => x >= 0 && x < E.LANES && !E.unitAt(g, u.owner, x));
    if (!opts.length) return false;
    // only ever toward the centre lane: a unit already there, or with the inward lane taken, stays put
    const from = u.lane;
    const to = opts.find((x) => Math.abs(x - E.CENTER) < Math.abs(from - E.CENTER));
    if (to == null) return false;
    u.lane = to;
    ev(g, { t: 'move', pid: u.owner, ref: unitRef(u), id: u.id, from, to });
    E.claimPod(g, u.owner, u);
    const s = E.siteBehind(g, u);
    if (s && CARDS[s.id].onMoveArrive) CARDS[s.id].onMoveArrive(g, { pid: u.owner, self: s, unit: u });
    if (alive(u) && CARDS[u.id].onMove) CARDS[u.id].onMove(g, { pid: u.owner, self: u, from });
    return true;
  };

  /* ------------------------------------------------------------ Forecast (look-ahead) & Archive (tradeable) */
  /**
   * Look at the top `n` cards of pid's deck; choose one to put on top (or draw if opts.draw) and bottom the rest.
   * The AI, a clone and a headless game pick and finish at once. The human seat of a game on the page
   * (`g.humanPid`) waits in `g.forecast` for E.resolveForecast, and until then:
   *   - the cards being looked at are held in `g.forecast.options`, out of the deck, so nothing else can move them;
   *   - any card that player is due to draw is counted in `g.forecast.owed` and drawn after the pick, which is
   *     the order the AI's Forecast gets (pick, then draw);
   *   - a second Forecast for that player waits in `g.forecast.queue` and opens when this one is done.
   */
  E.forecast = function (g, pid, n, opts) {
    opts = opts || {};
    const p = g.players[pid];
    const req = { pid, n: n || 3, draw: !!opts.draw, nativeBuffUid: opts.nativeBuffUid || null };
    if (g.forecast && opts.pickIdx == null) {
      g.forecast.queue.push(req);
      return null;
    }
    const count = Math.min(req.n, p.deck.length);
    if (count <= 0) return null;
    const options = p.deck.splice(p.deck.length - count, count).reverse();
    const state = { pid, options, draw: req.draw, nativeBuffUid: req.nativeBuffUid, owed: 0, queue: [] };
    if (!g.silent && g.humanPid === pid && opts.pickIdx == null) {
      g.forecast = state;
      return null;
    }
    const idx = opts.pickIdx != null ? opts.pickIdx : (V.AI && V.AI.pickForecast ? V.AI.pickForecast(g, pid, options, state) : 0);
    const picked = settleForecast(g, state, idx);
    resolve(g);
    return picked;
  };

  /** Put a Forecast's cards back: the rest on the bottom, the pick on top (or into hand). */
  function settleForecast(g, f, pickIdx) {
    const p = g.players[f.pid];
    const idx = Math.max(0, Math.min(f.options.length - 1, pickIdx | 0));
    const picked = f.options[idx];
    const rest = f.options.filter((_, i) => i !== idx);
    for (let i = rest.length - 1; i >= 0; i--) p.deck.unshift(rest[i]);
    p.deck.push(picked);
    if (f.draw) E.draw(g, f.pid, 1);
    if (f.nativeBuffUid && CARDS[picked] && CARDS[picked].native) {
      const u = E.find(g, f.nativeBuffUid);
      if (u && alive(u.unit)) E.buff(g, u.unit, 1, 1);
    }
    ev(g, { t: 'forecast', pid: f.pid, n: f.options.length, draw: f.draw, picked: f.pid === g.humanPid ? picked : null });
    return picked;
  }

  E.resolveForecast = function (g, pid, pickIdx) {
    const f = g.forecast;
    if (!f || f.pid !== pid) return null;
    g.forecast = null;
    const picked = settleForecast(g, f, pickIdx);
    if (f.owed) E.draw(g, pid, f.owed);
    resolve(g);
    // the Forecasts that were waiting behind this one: the first that has cards to show opens, the rest wait on it
    const queue = f.queue;
    while (queue.length && !g.over && !g.forecast) {
      const q = queue.shift();
      E.forecast(g, q.pid, q.n, q);
    }
    if (g.forecast) g.forecast.queue.push(...queue);
    return picked;
  };

  E.isArchivable = (d) => !!(d && (d.project || d.archive));

  E.canArchive = function (g, pid, hc) {
    if (g.over || g.mulligan || g.forecast || g.active !== pid || !hc) return false;
    const p = g.players[pid];
    return E.isArchivable(CARDS[hc.id]) && p.energy >= E.ARCHIVE_COST && p.deck.length > 0;
  };

  /** Spend 1 Energy to draw a replacement card and shuffle this card back into your deck. */
  E.archiveCard = function (g, pid, handUid) {
    const p = g.players[pid];
    const i = p.hand.findIndex((h) => h.uid === handUid);
    if (i < 0) return false;
    const hc = p.hand[i];
    if (!E.canArchive(g, pid, hc)) return false;
    p.energy -= E.ARCHIVE_COST;
    p.hand.splice(i, 1);
    E.draw(g, pid, 1);
    p.deck.push(hc.id);
    shuffle(g, p.deck);
    ev(g, { t: 'archive', pid, id: hc.id });
    resolve(g);
    return true;
  };

  E.gainResearch = function (g, pid, n) {
    const p = g.players[pid];
    const before = p.research;
    p.research += n;
    ev(g, { t: 'research', pid, n });
    const ms = E.milestones(g, pid);
    ms.forEach((m, i) => {
      if (before < m && p.research >= m) {
        ev(g, { t: 'milestone', pid, level: i });
        if (i === 0) E.draw(g, pid, 1);
        if (i === 2) {
          E.draw(g, pid, 2);
          p.board.filter(alive).forEach((u) => E.buff(g, u, 1, 1));
        }
        fire(g, pid, 'onMilestone');
      }
    });
  };

  E.powerCost = function (g, pid) {
    const ms = E.milestones(g, pid);
    return g.players[pid].research >= ms[1] ? 1 : FACTIONS[g.players[pid].faction].power.cost;
  };

  E.cost = function (g, pid, hc) {
    let c = hc.cost;
    const d = CARDS[hc.id];
    if (d.type === 'order') {
      c -= siteSum(g, pid, 'orderDiscount', 'card');
    }
    if (g.players[pid].cardsPlayedThisTurn === 0) {
      c -= siteSum(g, pid, 'firstCardDiscount', true);
    }
    // firstCardTax: an enemy location makes my first card of the turn dearer. Energy Cells and other tokens are exempt.
    if (!d.token && !g.players[pid].taxPaid) c += siteSum(g, 1 - pid, 'firstCardTax');
    if (V.Design && V.Design.isDesign(hc.id)) c -= siteSum(g, pid, 'designDiscount');
    // handDiscount: the card costs this much less for each other card in its owner's hand
    if (d.handDiscount) c -= d.handDiscount * Math.max(0, g.players[pid].hand.length - 1);
    if (g.decree === 'fungal_bloom' && d.native) c = Math.max(1, c - 1);
    return Math.max(0, c);
  };

  /** Workshop designs are not in the card table until someone builds one; their id alone is enough to rebuild them. */
  function known(id) { return CARDS[id] || (V.Design ? V.Design.ensure(id) : null); }

  /**
   * Build a unit card from a choice of parts { chassis, weapon, armor, abilities } and add it to pid's hand.
   * Returns the hand card, or null if the design is not legal for that player or the hand is full.
   */
  E.designUnit = function (g, pid, choice, costMod) {
    const D = V.Design;
    if (D.why(g, pid, choice)) return null;
    const id = D.idOf(choice);
    D.ensure(id);
    ev(g, { t: 'design', pid, id });
    return E.addToHand(g, pid, id, costMod);
  };

  /**
   * Draw one card from the deck that passes `test(cardDef)`, chosen at random among those that do.
   * Returns the card id, or null if the deck holds none (or the hand is full, in which case the card is burned).
   */
  E.tutor = function (g, pid, test) {
    const p = g.players[pid];
    const at = [];
    p.deck.forEach((id, i) => { if (test(CARDS[id])) at.push(i); });
    if (!at.length) return null;
    const id = p.deck.splice(E.pick(g, at), 1)[0];
    if (p.hand.length >= E.maxHand(g, pid)) { ev(g, { t: 'burn', pid, id }); return null; }
    p.hand.push({ uid: g.nextUid++, id, cost: CARDS[id].cost });
    ev(g, { t: 'draw', pid });
    return id;
  };

  E.addToHand = function (g, pid, id, costMod) {
    known(id);
    const p = g.players[pid];
    if (p.hand.length >= E.maxHand(g, pid)) { ev(g, { t: 'burn', pid, id }); return null; }
    const hc = { uid: g.nextUid++, id, cost: Math.max(0, CARDS[id].cost + (costMod || 0)) };
    p.hand.push(hc);
    ev(g, { t: 'gain', pid, id });
    return hc;
  };

  E.draw = function (g, pid, n) {
    const p = g.players[pid];
    // while this player's Forecast is open, the draw waits for the pick (see E.forecast)
    if (g.forecast && g.forecast.pid === pid) { g.forecast.owed += n; return; }
    const cap = E.maxHand(g, pid);
    for (let i = 0; i < n; i++) {
      if (!p.deck.length) {
        p.fatigue++;
        ev(g, { t: 'fatigue', pid, n: p.fatigue });
        E.damage(g, leaderRef(pid), p.fatigue, null);
        continue;
      }
      const id = p.deck.pop();
      if (p.hand.length >= cap) { ev(g, { t: 'burn', pid, id }); continue; }
      p.hand.push({ uid: g.nextUid++, id, cost: CARDS[id].cost });
      ev(g, { t: 'draw', pid });
    }
  };

  E.summon = function (g, pid, id, lane) {
    const p = g.players[pid];
    const want = lane == null ? E.CENTER : lane;
    const ln = !E.unitAt(g, pid, want) ? want : E.nearestEmpty(g, pid, want);
    if (ln == null) return null;
    const d = known(id);
    const u = {
      uid: g.nextUid++, id, owner: pid, lane: ln, atk: d.atk, hp: d.hp, maxHp: d.hp,
      kw: Object.assign({}, d.kw || {}), immobile: !!d.immobile,
      ready: !!(d.kw && d.kw.blitz), attacked: false, moved: false, summonedTurn: g.turn,
      tempAtk: 0, jammed: 0, promoted: false, monolithUsed: false,
    };
    p.board.push(u);
    ev(g, { t: 'summon', pid, uid: u.uid, id, lane: ln });
    const guardAtk = E.doctrine(g, pid).guardAtk || 0;
    if (guardAtk && E.hasKw(g, u, 'guard')) E.buff(g, u, guardAtk, 0);
    const airBuff = siteSum(g, pid, 'aerialBuff');
    if (airBuff > 0 && E.hasKw(g, u, 'aerial')) E.buff(g, u, airBuff, airBuff);
    const s = E.siteBehind(g, u);
    if (s && CARDS[s.id].onArrive) CARDS[s.id].onArrive(g, { pid, self: s, unit: u });
    E.claimPod(g, pid, u);
    return u;
  };

  E.build = function (g, pid, id, lane, isInitial) {
    if (lane == null || E.siteAt(g, pid, lane)) return null;
    const d = CARDS[id];
    let hp = d.hp;
    if (!isInitial) {
      hp += siteSum(g, pid, 'siteBuildHp') + (E.doctrine(g, pid).siteHp || 0);
    }
    const s = { uid: g.nextUid++, id, owner: pid, lane, hp, maxHp: hp, jammed: 0 };
    g.players[pid].sites.push(s);
    ev(g, { t: 'build', pid, uid: s.uid, id, lane });
    if (d.project && !isInitial) ev(g, { t: 'project_built', pid, id });
    if (!isInitial && d.onBuildSelf) d.onBuildSelf(g, { pid, self: s, unit: E.stationed(g, s) });
    if (!isInitial) fire(g, pid, 'onBuild', { site: s });
    return s;
  };

  E.steal = function (g, ref, pid) {
    const f = E.find(g, ref.uid);
    if (!f || f.pid === pid) return;
    const u = f.unit;
    const ln = !E.unitAt(g, pid, u.lane) ? u.lane : E.nearestEmpty(g, pid, u.lane);
    if (ln == null) { u.doomed = true; return; }
    g.players[f.pid].board.splice(f.idx, 1);
    u.owner = pid;
    u.lane = ln;
    u.summonedTurn = g.turn;
    u.ready = !!u.kw.blitz;
    u.attacked = false;
    u.moved = false;
    g.players[pid].board.push(u);
    ev(g, { t: 'steal', ref, pid });
    E.claimPod(g, pid, u);
  };

  /* ------------------------------------------------------------ triggers / cleanup
   * Card triggers fired here: turnStart, turnEnd, onOrder, onEnemyOrder, onBuild, onAllyDeath, onAllyPromote, onArmor, onMilestone,
   * onPlay ({cardId, count, made}), onEnemyRaze ({site}), onEnemyJam ({ref}), onAllyBounce ({id}), onPod ({claimer, outcome}).
   * Fired directly on one card: deploy, lastStand, onAttack, onKill, onMove, onPromote, onHurt ({n}: it survived damage),
   * onBoon (its owner targeted it with an Order or the leader power), onArrive / onMoveArrive / onRaze (locations). */
  function fire(g, pid, name, extra) {
    const p = g.players[pid];
    p.board.slice().forEach((u) => {
      if (g.over) return;
      const d = CARDS[u.id];
      if (d[name] && alive(u) && p.board.includes(u) && !(u.jammed > 0 && (name === 'turnStart' || name === 'turnEnd'))) {
        d[name](g, Object.assign({ pid, self: u, target: null }, extra || {}));
      }
    });
    p.sites.slice().forEach((s) => {
      if (g.over) return;
      const d = CARDS[s.id];
      if (d[name] && E.siteActive(g, s) && p.sites.includes(s)) {
        d[name](g, Object.assign({ pid, self: s, unit: E.stationed(g, s), target: null }, extra || {}));
      }
    });
  }

  function resolve(g) {
    for (let pass = 0; pass < 60; pass++) {
      const dead = [];
      const razed = [];
      [g.active, 1 - g.active].forEach((pid) => {
        g.players[pid].board.forEach((u) => { if (!alive(u)) dead.push(u); });
        g.players[pid].sites.forEach((s) => { if (!alive(s)) razed.push(s); });
      });
      if (!dead.length && !razed.length) break;
      dead.forEach((u) => {
        const b = g.players[u.owner].board;
        b.splice(b.indexOf(u), 1);
        g.players[u.owner].diedThisTurn++;
        if (!u.purged && !CARDS[u.id].token) { g.players[u.owner].grave.push(u.id); g.players[u.owner].lost++; }
        ev(g, { t: u.purged ? 'purge' : 'death', ref: unitRef(u), id: u.id, pid: u.owner });
      });
      razed.forEach((s) => {
        const b = g.players[s.owner].sites;
        b.splice(b.indexOf(s), 1);
        const isProj = !!CARDS[s.id].project;
        const baseRaze = isProj ? E.PROJECT_RAZE_DAMAGE : E.RAZE_DAMAGE;
        const bonusRaze = siteSum(g, 1 - s.owner, 'razeBonus');
        const totalRaze = baseRaze + bonusRaze;
        ev(g, { t: 'raze', ref: siteRef(s), id: s.id, pid: s.owner, dmg: totalRaze });
        E.damage(g, leaderRef(s.owner), totalRaze, null);
        if (CARDS[s.id].onRaze) CARDS[s.id].onRaze(g, { pid: s.owner, self: s });
        g.players[1 - s.owner].razed = (g.players[1 - s.owner].razed || 0) + 1;
        fire(g, 1 - s.owner, 'onEnemyRaze', { site: s });
      });
      dead.forEach((u) => {
        const d = CARDS[u.id];
        if (!u.purged && d.lastStand) d.lastStand(g, { pid: u.owner, self: u, target: null });
        if (!u.purged) fire(g, u.owner, 'onAllyDeath', { dead: u });
      });
    }
    const d0 = g.players[0].hp <= 0;
    const d1 = g.players[1].hp <= 0;
    if ((d0 || d1) && !g.over) {
      g.over = true;
      g.winner = d0 && d1 ? -1 : d0 ? 1 : 0;
      g.winReason = 'conquest';
      ev(g, { t: 'over', winner: g.winner, reason: 'conquest' });
      return;
    }
    // Check Ascent Victory (The Voice of Tau Ceti + 22 Research)
    if (!g.over) {
      for (const pid of [g.active, 1 - g.active]) {
        if (g.players[pid].research >= E.ASCENT_RESEARCH && siteSum(g, pid, 'ascentProject') > 0) {
          g.over = true;
          g.winner = pid;
          g.winReason = 'ascent';
          ev(g, { t: 'over', winner: pid, reason: 'ascent' });
          return;
        }
      }
    }
  }

  function startTurn(g) {
    g.turn++;
    const p = g.players[g.active];
    p.maxEnergy = Math.min(E.maxEnergyCap(g, g.active), p.maxEnergy + 1);
    p.energy = p.maxEnergy;
    p.powerUsed = false;
    p.cardsPlayedThisTurn = 0;
    p.unitsDeployedThisTurn = 0;
    p.taxPaid = false;
    p.diedThisTurn = 0;
    p.board.forEach((u) => { u.ready = true; u.attacked = false; u.moved = false; u.tempAtk = 0; });
    ev(g, { t: 'turn', pid: g.active, turn: g.turn });
    E.draw(g, g.active, 1);

    // Planetary Council Decree turn-start effects
    if (g.decree === 'solar_shade') E.gainResearch(g, g.active, 1);
    if (g.decree === 'orbital_salvage' && (g.turn === 5 || g.turn === 9 || g.turn === 13)) {
      const open = lanesWhere((ln) => !g.lanes[ln].pod && !E.unitAt(g, 0, ln) && !E.unitAt(g, 1, ln));
      const drop = E.pick(g, open);
      if (drop != null) E.dropPod(g, drop);
    }

    // Mid-game Orbital Supply Pod drop (Cycle 5, non-classic biomes)
    if (g.turn === 9 && g.biome !== 'classic' && !g.lanes.some((l) => l.pod)) {
      const candidates = [0, 1, 5, 6].filter((ln) => !E.unitAt(g, 0, ln) && !E.unitAt(g, 1, ln));
      const dropLane = E.pick(g, candidates);
      if (dropLane != null) E.dropPod(g, dropLane);
    }

    // Thermal Borehole start-of-turn trigger
    for (let ln = 0; ln < E.LANES; ln++) {
      if (g.lanes[ln].terrain === 'borehole') {
        const u = E.unitAt(g, g.active, ln);
        if (u && alive(u)) {
          E.gainEnergy(g, g.active, 1);
          const s = E.siteAt(g, g.active, ln);
          if (s && alive(s)) E.damage(g, siteRef(s), 1, null, { psi: true });
        }
      }
    }

    fire(g, g.active, 'turnStart');
    resolve(g);
  }

  /* ------------------------------------------------------------ targeting */
  E.targets = function (g, pid, spec, filter) {
    if (!spec) return null;
    const me = g.players[pid];
    const foe = g.players[1 - pid];
    if (spec === 'column') {
      return lanesWhere((ln) => !filter || filter(g, ln, pid)).map(laneRef);
    }
    if (spec === 'emptyLane') return E.emptyLanes(g, pid).map(laneRef);

    const aegis = siteSum(g, 1 - pid, 'aegisShield') > 0;
    const mine = spec === 'unit' || spec === 'any' || spec === 'unitOrSite' || spec === 'allyUnit' || spec === 'ally' || spec === 'allySite' || spec === 'site';
    const theirs = spec === 'unit' || spec === 'any' || spec === 'unitOrSite' || spec === 'enemyUnit' || spec === 'enemy' || spec === 'enemyUnitOrSite' || spec === 'enemySite' || spec === 'site';
    const units = spec !== 'allySite' && spec !== 'enemySite' && spec !== 'site';
    const sites = spec === 'any' || spec === 'unitOrSite' || spec === 'ally' || spec === 'enemy' || spec === 'enemyUnitOrSite' || spec === 'allySite' || spec === 'enemySite' || spec === 'site';
    const leaders = spec === 'any' || spec === 'ally' || spec === 'enemy';

    const out = [];
    const sides = [];
    if (mine) sides.push(me);
    if (theirs) sides.push(foe);
    if (units) {
      sides.forEach((p) => {
        if (p.id !== pid && aegis) return;
        p.board.filter(alive).forEach((u) => { if (!filter || filter(g, u, pid)) out.push(unitRef(u)); });
      });
    }
    if (sites) {
      sides.forEach((p) => p.sites.filter(alive).forEach((s) => {
        if (p.id !== pid && aegis && !CARDS[s.id].aegisShield) return;
        if (!filter || filter(g, s, pid)) out.push(siteRef(s));
      }));
    }
    if (leaders) sides.forEach((p) => out.push(leaderRef(p.id)));
    return out;
  };

  E.cardTargets = (g, pid, d) => E.targets(g, pid, d.target, d.targetFilter);

  /** Look up a modal Order's mode by 0-based index or mode id. Returns { idx, mode } or null. */
  E.modeOf = function (d, choice) {
    if (!d || !d.modes || !d.modes.length) return null;
    if (typeof choice === 'number' && choice >= 0 && choice < d.modes.length) return { idx: choice, mode: d.modes[choice] };
    if (typeof choice === 'string') {
      const idx = d.modes.findIndex((m) => m.id === choice);
      if (idx >= 0) return { idx, mode: d.modes[idx] };
    }
    return null;
  };

  E.modeTargets = function (g, pid, d, choice) {
    const mo = E.modeOf(d, choice);
    if (!mo || !mo.mode.target) return null;
    return E.targets(g, pid, mo.mode.target, mo.mode.targetFilter);
  };

  E.deployLanes = function (g, pid, d) {
    if (d.type === 'unit') return E.emptyLanes(g, pid);
    if (d.type === 'site') return E.emptyPlots(g, pid);
    return null;
  };

  E.canPlay = function (g, pid, hc) {
    if (g.over || g.mulligan || g.forecast || g.active !== pid) return false;
    const p = g.players[pid];
    const d = CARDS[hc.id];
    if (E.cost(g, pid, hc) > p.energy) return false;
    if (d.project && p.sites.some((s) => s.id === hc.id)) return false;
    if (d.type !== 'order') return E.deployLanes(g, pid, d).length > 0;
    if (d.modes) return d.modes.some((m) => !m.target || E.targets(g, pid, m.target, m.targetFilter).length > 0);
    if (d.target) return E.cardTargets(g, pid, d).length > 0;
    return true;
  };

  E.needsTarget = function (g, pid, hc) {
    const d = CARDS[hc.id];
    if (!d.target) return false;
    // Overcharge-only targeted units (e.g. Guild Enforcer) only ask for a target if Overcharge will fire
    if (d.overcharge && d.type === 'unit') {
      const p = g.players[pid];
      if (p.energy < E.cost(g, pid, hc) + d.overcharge) return false;
    }
    return E.cardTargets(g, pid, d).length > 0;
  };

  E.canAttack = function (g, u) {
    // an immobile unit (a Barricade) never attacks, whatever Attack it has been given; it still strikes back when hit
    return !g.over && !g.mulligan && !g.forecast && g.active === u.owner && !u.immobile && !(u.jammed > 0) && E.effectiveAtk(g, u, null) > 0 && u.ready && !u.attacked && alive(u);
  };

  E.attackTargets = function (g, u) {
    if (!E.canAttack(g, u)) return [];
    const foe = g.players[1 - u.owner];
    const near = E.inReach(g, u);
    const front = E.frontEnemies(g, u);
    const aerial = E.hasKw(g, u, 'aerial');

    if (aerial) {
      const interceptors = front.filter((x) => E.hasKw(g, x, 'interceptor'));
      if (interceptors.length) return interceptors.map(unitRef);
      const out = near.map(unitRef);
      if (u.summonedTurn === g.turn) return out;
      const sr = E.reach(g, u);
      foe.sites.forEach((s) => { if (alive(s) && Math.abs(s.lane - u.lane) <= sr) out.push(siteRef(s)); });
      out.push(leaderRef(foe.id));
      return out;
    }

    const guards = front.filter((x) => E.hasKw(g, x, 'guard'));
    if (guards.length) return guards.map(unitRef);
    const out = near.map(unitRef);
    if (u.summonedTurn === g.turn) return out; // Blitz arrivals may only strike units
    foe.sites.forEach((s) => { if (E.siteOpen(g, u, s)) out.push(siteRef(s)); });
    if (front.length === 0) out.push(leaderRef(foe.id));
    return out;
  };

  E.canMove = function (g, u) {
    if (g.over || g.mulligan || g.forecast || g.active !== u.owner || u.immobile || u.jammed > 0 || !u.ready || u.moved || !alive(u)) return false;
    if (u.summonedTurn === g.turn) return false;
    return !u.attacked || E.hasKw(g, u, 'mobile');
  };

  E.moveTargets = function (g, u) {
    if (!E.canMove(g, u)) return [];
    return [u.lane - 1, u.lane + 1].filter((x) => x >= 0 && x < E.LANES && !E.unitAt(g, u.owner, x));
  };

  E.canUsePower = function (g, pid) {
    if (g.over || g.mulligan || g.forecast || g.active !== pid) return false;
    const p = g.players[pid];
    const pw = FACTIONS[p.faction].power;
    if (p.noPower) return false; // test hook: lets the balance tool price a leader power
    if (p.powerUsed || p.energy < E.powerCost(g, pid)) return false;
    if (pw.canUse && !pw.canUse(g, pid)) return false;
    if (pw.target && !E.targets(g, pid, pw.target).length) return false;
    return true;
  };

  /* ------------------------------------------------------------ player actions */
  /** `choice` is for a `design` Order ({ chassis, weapon, armor, abilities }) or a modal Order (mode index or id). */
  E.playCard = function (g, pid, handUid, target, lane, choice) {
    const p = g.players[pid];
    const i = p.hand.findIndex((h) => h.uid === handUid);
    if (i < 0) return false;
    const hc = p.hand[i];
    const d = CARDS[hc.id];
    if (!E.canPlay(g, pid, hc)) return false;
    if (d.design && V.Design.why(g, pid, choice)) return false;
    const modal = d.modes ? E.modeOf(d, choice) : null;
    if (d.modes && !modal) return false;
    const lanes = E.deployLanes(g, pid, d);
    if (lanes && !lanes.includes(lane)) return false;

    const baseCost = E.cost(g, pid, hc);
    const willOvercharge = !!(d.overcharge && p.energy >= baseCost + d.overcharge);
    let tg = null;
    if (modal) {
      if (modal.mode.target) {
        const ts = E.targets(g, pid, modal.mode.target, modal.mode.targetFilter);
        if (!ts.length || !ts.some((t) => sameRef(t, target))) return false;
        tg = target;
      }
    } else if (E.needsTarget(g, pid, hc)) {
      const ts = E.cardTargets(g, pid, d);
      if (ts.length) {
        if (!ts.some((t) => sameRef(t, target))) return false;
        tg = target;
      }
    }

    p.energy -= baseCost;
    let overcharged = false;
    if (willOvercharge) {
      p.energy -= d.overcharge;
      overcharged = true;
    }
    p.cardsPlayedThisTurn++;
    if (!d.token) p.taxPaid = true;
    p.hand.splice(i, 1);
    ev(g, { t: 'play', pid, id: hc.id, target: tg, lane: lanes ? lane : null, overcharged, mode: modal ? modal.idx : null });

    let made = null;
    if (d.type === 'unit') {
      const u = E.summon(g, pid, hc.id, lane);
      if (u) {
        made = u.uid;
        const firstHp = E.doctrine(g, pid).firstUnitHp || 0;
        if (firstHp && p.unitsDeployedThisTurn === 0) E.buff(g, u, 0, firstHp);
        p.unitsDeployedThisTurn++;
      }
      if (u && d.deploy) d.deploy(g, { pid, self: u, target: tg, overcharged });
    } else if (d.type === 'site') {
      const st = E.build(g, pid, hc.id, lane);
      if (st) made = st.uid;
    } else {
      if (modal) modal.mode.play(g, { pid, target: tg, overcharged, choice: modal.idx });
      else d.play(g, { pid, target: tg, overcharged, choice });
      boon(g, pid, tg);
      resolve(g);
      if (!g.over && !d.noResearch) {
        E.gainResearch(g, pid, 1);
        fire(g, pid, 'onOrder');
        fire(g, 1 - pid, 'onEnemyOrder');
      }
    }
    if (d.blackBox) p.blackBox = (p.blackBox || 0) + 1;
    if (!g.over) fire(g, pid, 'onPlay', { cardId: hc.id, count: p.cardsPlayedThisTurn, made });
    resolve(g);
    return true;
  };

  /** onBoon: a unit's own trigger for when its owner targets it with an Order or the leader power. */
  function boon(g, pid, tg) {
    if (!tg || tg.k !== 'u') return;
    const f = E.find(g, tg.uid);
    if (f && f.pid === pid && alive(f.unit) && CARDS[f.unit.id].onBoon) CARDS[f.unit.id].onBoon(g, { pid, self: f.unit });
  }

  E.usePower = function (g, pid, target) {
    if (!E.canUsePower(g, pid)) return false;
    const p = g.players[pid];
    const pw = FACTIONS[p.faction].power;
    let tg = null;
    if (pw.target) {
      const ts = E.targets(g, pid, pw.target);
      if (!ts.some((t) => sameRef(t, target))) return false;
      tg = target;
    }
    p.energy -= E.powerCost(g, pid);
    p.powerUsed = true;
    p.powerUses = (p.powerUses || 0) + 1;
    ev(g, { t: 'power', pid, target: tg });
    pw.run(g, { pid, target: tg });
    boon(g, pid, tg);
    resolve(g);
    return true;
  };

  function tryPromote(g, u) {
    if (!u || !alive(u) || u.promoted || !E.hasKw(g, u, 'veteran')) return;
    u.promoted = true;
    const d = CARDS[u.id];
    if (d.onPromote) d.onPromote(g, { pid: u.owner, self: u });
    else E.buff(g, u, 1, 1);
    ev(g, { t: 'promote', ref: unitRef(u), id: u.id, pid: u.owner });
    fire(g, u.owner, 'onAllyPromote', { promoted: u });
  }

  function creditKill(g, killer, victim) {
    tryPromote(g, killer);
    if (alive(killer) && CARDS[killer.id].onKill) CARDS[killer.id].onKill(g, { pid: killer.owner, self: killer, victim });
  }

  E.attack = function (g, pid, uid, target) {
    const f = E.find(g, uid);
    if (!f || f.pid !== pid) return false;
    const a = f.unit;
    if (!E.attackTargets(g, a).some((t) => sameRef(t, target))) return false;
    const mobile = E.hasKw(g, a, 'mobile');
    const artillery = E.hasKw(g, a, 'artillery');
    a.attacked = true;
    if (!mobile) a.moved = true;

    const aAtk = E.effectiveAtk(g, a, target);
    let targetLane = null;
    if (target.k === 'u') { const df = E.find(g, target.uid); if (df) targetLane = df.unit.lane; }
    else if (target.k === 's') { const sf = E.findSite(g, target.uid); if (sf) targetLane = sf.site.lane; }

    ev(g, { t: 'attack', pid, from: unitRef(a), to: target, id: a.id });
    if (CARDS[a.id].onAttack) CARDS[a.id].onAttack(g, { pid, self: a, target, targetLane });

    if (target.k !== 'u') {
      E.damage(g, target, aAtk, a);
    } else {
      const d = E.find(g, target.uid).unit;
      const dAtk = E.effectiveAtk(g, d, unitRef(a), false);
      const before = d.hp;
      const dealt = E.damage(g, target, aAtk, a);
      // Overrun: what is left over after destroying the unit carries on into the enemy colony
      if (dealt > before && E.hasKw(g, a, 'overrun')) E.damage(g, leaderRef(1 - pid), dealt - before, a);
      // Artillery strikes from range and an `ambush` card strikes first: the defender (ref) cannot hit back
      if (!artillery && !CARDS[a.id].ambush) E.damage(g, unitRef(a), dAtk, d);
      else ev(g, { t: 'noreturn', ref: target, from: unitRef(a), pid });
      if (d.hp <= 0 || d.doomed) creditKill(g, a, d);
      if (a.hp <= 0 || a.doomed) creditKill(g, d, a);
    }
    resolve(g);
    return true;
  };

  E.move = function (g, pid, uid, lane) {
    const f = E.find(g, uid);
    if (!f || f.pid !== pid) return false;
    const u = f.unit;
    if (!E.moveTargets(g, u).includes(lane)) return false;
    const from = u.lane;
    const mobile = E.hasKw(g, u, 'mobile');
    u.lane = lane;
    u.moved = true;
    if (!mobile) u.attacked = true;
    ev(g, { t: 'move', pid, ref: unitRef(u), id: u.id, from, to: lane });
    E.claimPod(g, pid, u);
    const s = E.siteBehind(g, u);
    if (s && CARDS[s.id].onMoveArrive) CARDS[s.id].onMoveArrive(g, { pid, self: s, unit: u });
    if (alive(u) && CARDS[u.id].onMove) CARDS[u.id].onMove(g, { pid, self: u, from });
    resolve(g);
    return true;
  };

  E.endTurn = function (g, pid) {
    if (g.over || g.mulligan || g.forecast || g.active !== pid) return false;
    fire(g, pid, 'turnEnd');

    // Lane terrain end-of-turn effects for active player's units
    const p = g.players[pid];
    p.board.slice().forEach((u) => {
      if (!alive(u)) return;
      const terrain = g.lanes[u.lane] ? g.lanes[u.lane].terrain : null;
      if (terrain === 'fungus') {
        const immune = CARDS[u.id].native || CARDS[u.id].faction === 'rootbound';
        if (immune) E.heal(g, unitRef(u), 1);
        else if (!E.doctrine(g, pid).fungusSafe) E.damage(g, unitRef(u), 1, null);
      } else if (terrain === 'monolith' && !u.monolithUsed) {
        u.monolithUsed = true;
        E.buff(g, u, 1, 1);
        E.heal(g, unitRef(u), 2);
      }
    });

    // Clear temporary attack buffs and tick down Jam timers
    p.board.forEach((u) => {
      u.tempAtk = 0;
      if (u.jammed > 0) u.jammed--;
    });
    p.sites.forEach((s) => {
      if (s.jammed > 0) s.jammed--;
    });

    resolve(g);
    if (g.over) return true;
    g.active = 1 - pid;
    startTurn(g);
    return true;
  };

  V.Engine = E;
})(typeof globalThis !== 'undefined' ? globalThis : this);
