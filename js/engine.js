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

  const E = {};
  E.LANES = 7;
  E.CENTER = 3;
  E.MAX_HAND = 9;
  E.START_HP = 30;
  E.MAX_ENERGY = 10;
  E.RAZE_DAMAGE = 3;
  E.PROJECT_RAZE_DAMAGE = 5;
  E.ASCENT_RESEARCH = 22;
  // Opening hands: the player who moves second is compensated with extra cards and Reserve Cells.
  E.START_CARDS = 3;
  E.SECOND_EXTRA_CARDS = 2;
  E.SECOND_CELLS = 1;
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

  E.milestones = (g, pid) => (g.players[pid].doctrine === 'power' ? [6, 10, 15] : E.MILESTONES);
  E.maxHand = (g, pid) => (g.players[pid].doctrine === 'police' ? 8 : E.MAX_HAND);

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

  E.maxEnergyCap = (g, pid) => (siteSum(g, pid, 'energyCap') > 0 ? 12 : E.MAX_ENERGY);

  /** Numeric value for stackable keywords (zeal, flank). */
  E.kwVal = function (g, u, k) {
    let v = typeof u.kw[k] === 'number' ? u.kw[k] : (u.kw[k] ? 1 : 0);
    const s = E.siteBehind(g, u);
    const grant = s && CARDS[s.id].grant;
    if (grant && grant[k]) v += typeof grant[k] === 'number' ? grant[k] : 1;
    if (k === 'zeal') {
      if (g.players[u.owner].doctrine === 'power') v += 1;
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
      }
      if (attacking && tLane != null && tLane !== u.lane) a += E.kwVal(g, u, 'flank');
      if (attacking && target.k === 's' && CARDS[u.id].doubleSiteDmg) a *= 2;
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
    const fac = CARDS[cardId].faction;
    return fac !== 'neutral' && fac !== p.faction && fac !== p.pact;
  };

  E.randomForeignCard = function (g, pid) {
    const pool = Object.keys(CARDS).filter((id) => !CARDS[id].token && !CARDS[id].project && E.isForeign(g, pid, id));
    return E.pick(g, pool);
  };

  /* ------------------------------------------------------------ setup */
  function mkPlayer(id, faction, doctrine, hpOverride, pact) {
    const doc = doctrine || 'standard';
    const startHp = hpOverride != null ? hpOverride : (doc === 'green' ? 28 : E.START_HP);
    return {
      id, faction, pact: pact && pact !== faction && FACTIONS[pact] ? pact : null,
      doctrine: doc, hp: startHp, maxHp: startHp,
      armor: doc === 'police' ? 5 : 0,
      energy: 0, maxEnergy: 0,
      research: doc === 'knowledge' ? 2 : 0,
      powerUsed: false, fatigue: 0, cardsPlayedThisTurn: 0, diedThisTurn: 0,
      razed: 0,     // enemy locations razed this game
      blackBox: 0,  // Black Box cards played this game
      deck: [], hand: [], board: [], sites: [],
    };
  }

  /**
   * Create a new game.
   * Backwards compatible with E.newGame(f0, f1, seed, first) plus optional opts:
   *   { biome, deck0, deck1, preset0, preset1, pact0, pact1, doctrine0, doctrine1, hp0, hp1, bossName, bossArt }
   * pact0 / pact1 name each side's Pact partner faction, if its deck has one.
   */
  E.newGame = function (f0, f1, seed, first, opts) {
    opts = opts || {};
    const biomeId = opts.biome || 'tau_ceti';
    const g = {
      seed: (seed | 0) || 1,
      biome: biomeId,
      players: [
        mkPlayer(0, f0, opts.doctrine0, opts.hp0, opts.pact0),
        mkPlayer(1, f1, opts.doctrine1, opts.hp1, opts.pact1),
      ],
      lanes: [],
      active: first ? 1 : 0, turn: 0, over: false, winner: null, winReason: null,
      bossName: opts.bossName || null, bossArt: opts.bossArt || null,
      events: [], nextUid: 1, silent: false,
    };

    const biome = BIOMES[biomeId] || BIOMES.classic;
    g.lanes = biome ? biome.generate((n) => E.rand(g, n)) : Array.from({ length: E.LANES }, () => ({ terrain: null, pod: false }));

    // Green Pact seeds Xenofungus on lanes 1 & 5 if clear
    if (g.players[0].doctrine === 'green' || g.players[1].doctrine === 'green') {
      [1, 5].forEach((ln) => { if (!g.lanes[ln].terrain) g.lanes[ln].terrain = 'fungus'; });
    }

    g.players.forEach((p, idx) => {
      const customDeck = idx === 0 ? opts.deck0 : opts.deck1;
      const preset = idx === 0 ? opts.preset0 : opts.preset1;
      const list = customDeck ? customDeck.slice() : V.buildDeck(p.faction, preset);
      p.deck = shuffle(g, list);
      E.build(g, p.id, 'landing', E.CENTER, true);
      if (p.doctrine === 'market') {
        E.addToHand(g, p.id, 'cell');
        E.addToHand(g, p.id, 'cell');
      }
    });

    const a = g.active;
    E.draw(g, a, E.START_CARDS);
    E.draw(g, 1 - a, E.START_CARDS + E.SECOND_EXTRA_CARDS);
    for (let i = 0; i < E.SECOND_CELLS; i++) E.addToHand(g, 1 - a, 'cell');
    g.events = [];
    startTurn(g);
    return g;
  };

  E.clone = function (g) {
    const c = JSON.parse(JSON.stringify(g));
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
      if (targetOwner != null && targetOwner !== opts.pid && g.players[targetOwner].doctrine === 'knowledge') {
        n += 1;
      }
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
      if (f && alive(f.site)) { f.site.jammed = Math.max(f.site.jammed || 0, t); ev(g, { t: 'jam', ref }); }
    } else if (ref.k === 'u') {
      const f = E.find(g, ref.uid);
      if (f && alive(f.unit)) { f.unit.jammed = Math.max(f.unit.jammed || 0, t); ev(g, { t: 'jam', ref }); }
    }
  };

  E.destroy = function (g, ref) {
    const f = ref.k === 's' ? E.findSite(g, ref.uid) : E.find(g, ref.uid);
    if (f) (f.unit || f.site).doomed = true;
  };

  E.gainArmor = function (g, pid, n) {
    g.players[pid].armor += n;
    ev(g, { t: 'armor', ref: leaderRef(pid), n });
  };

  E.gainEnergy = function (g, pid, n) { g.players[pid].energy += n; };

  E.setTerrain = function (g, lane, terrainId) {
    if (lane < 0 || lane >= E.LANES) return;
    if (g.lanes[lane].terrain === terrainId) return;
    g.lanes[lane].terrain = terrainId;
    ev(g, { t: 'terrain', lane, terrain: terrainId });
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
    return Math.max(0, c);
  };

  E.addToHand = function (g, pid, id, costMod) {
    const p = g.players[pid];
    if (p.hand.length >= E.maxHand(g, pid)) { ev(g, { t: 'burn', pid, id }); return null; }
    const hc = { uid: g.nextUid++, id, cost: Math.max(0, CARDS[id].cost + (costMod || 0)) };
    p.hand.push(hc);
    ev(g, { t: 'gain', pid, id });
    return hc;
  };

  E.draw = function (g, pid, n) {
    const p = g.players[pid];
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
    const d = CARDS[id];
    const u = {
      uid: g.nextUid++, id, owner: pid, lane: ln, atk: d.atk, hp: d.hp, maxHp: d.hp,
      kw: Object.assign({}, d.kw || {}), immobile: !!d.immobile,
      ready: !!(d.kw && d.kw.blitz), attacked: false, moved: false, summonedTurn: g.turn,
      tempAtk: 0, jammed: 0, promoted: false, monolithUsed: false,
    };
    p.board.push(u);
    ev(g, { t: 'summon', pid, uid: u.uid, id, lane: ln });
    if (p.doctrine === 'police' && E.hasKw(g, u, 'guard')) E.buff(g, u, 0, 1);
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
      hp += siteSum(g, pid, 'siteBuildHp');
      if (g.players[pid].doctrine === 'market') hp = Math.max(1, hp - 1);
    }
    const s = { uid: g.nextUid++, id, owner: pid, lane, hp, maxHp: hp, jammed: 0 };
    g.players[pid].sites.push(s);
    ev(g, { t: 'build', pid, uid: s.uid, id, lane });
    if (d.project && !isInitial) ev(g, { t: 'project_built', pid, id });
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
   * Card triggers fired here: turnStart, turnEnd, onOrder, onEnemyOrder, onBuild, onAllyDeath, onMilestone,
   * onPlay ({cardId, count, made}), onEnemyRaze ({site}). Fired directly on one card: deploy, lastStand,
   * onAttack, onKill, onMove, onPromote, onArrive / onMoveArrive / onRaze (locations). */
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
        ev(g, { t: 'death', ref: unitRef(u), id: u.id, pid: u.owner });
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
        if (d.lastStand) d.lastStand(g, { pid: u.owner, self: u, target: null });
        fire(g, u.owner, 'onAllyDeath', { dead: u });
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
    p.diedThisTurn = 0;
    p.board.forEach((u) => { u.ready = true; u.attacked = false; u.moved = false; u.tempAtk = 0; });
    ev(g, { t: 'turn', pid: g.active, turn: g.turn });
    E.draw(g, g.active, 1);

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

  E.deployLanes = function (g, pid, d) {
    if (d.type === 'unit') return E.emptyLanes(g, pid);
    if (d.type === 'site') return E.emptyPlots(g, pid);
    return null;
  };

  E.canPlay = function (g, pid, hc) {
    if (g.over || g.active !== pid) return false;
    const p = g.players[pid];
    const d = CARDS[hc.id];
    if (E.cost(g, pid, hc) > p.energy) return false;
    if (d.project && p.sites.some((s) => s.id === hc.id)) return false;
    if (d.type !== 'order') return E.deployLanes(g, pid, d).length > 0;
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
    return !g.over && g.active === u.owner && !(u.jammed > 0) && E.effectiveAtk(g, u, null) > 0 && u.ready && !u.attacked && alive(u);
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
    if (g.over || g.active !== u.owner || u.immobile || u.jammed > 0 || !u.ready || u.moved || !alive(u)) return false;
    if (u.summonedTurn === g.turn) return false;
    return !u.attacked || E.hasKw(g, u, 'mobile');
  };

  E.moveTargets = function (g, u) {
    if (!E.canMove(g, u)) return [];
    return [u.lane - 1, u.lane + 1].filter((x) => x >= 0 && x < E.LANES && !E.unitAt(g, u.owner, x));
  };

  E.canUsePower = function (g, pid) {
    if (g.over || g.active !== pid) return false;
    const p = g.players[pid];
    const pw = FACTIONS[p.faction].power;
    if (p.noPower) return false; // test hook: lets the balance tool price a leader power
    if (p.powerUsed || p.energy < E.powerCost(g, pid)) return false;
    if (pw.canUse && !pw.canUse(g, pid)) return false;
    if (pw.target && !E.targets(g, pid, pw.target).length) return false;
    return true;
  };

  /* ------------------------------------------------------------ player actions */
  E.playCard = function (g, pid, handUid, target, lane) {
    const p = g.players[pid];
    const i = p.hand.findIndex((h) => h.uid === handUid);
    if (i < 0) return false;
    const hc = p.hand[i];
    const d = CARDS[hc.id];
    if (!E.canPlay(g, pid, hc)) return false;
    const lanes = E.deployLanes(g, pid, d);
    if (lanes && !lanes.includes(lane)) return false;

    const baseCost = E.cost(g, pid, hc);
    const willOvercharge = !!(d.overcharge && p.energy >= baseCost + d.overcharge);
    const needTgt = E.needsTarget(g, pid, hc);
    let tg = null;
    if (needTgt) {
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
    p.hand.splice(i, 1);
    ev(g, { t: 'play', pid, id: hc.id, target: tg, lane: lanes ? lane : null, overcharged });

    let made = null;
    if (d.type === 'unit') {
      const u = E.summon(g, pid, hc.id, lane);
      if (u) made = u.uid;
      if (u && d.deploy) d.deploy(g, { pid, self: u, target: tg, overcharged });
    } else if (d.type === 'site') {
      const st = E.build(g, pid, hc.id, lane);
      if (st) made = st.uid;
    } else {
      d.play(g, { pid, target: tg, overcharged });
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
      E.damage(g, target, aAtk, a);
      if (!artillery) E.damage(g, unitRef(a), dAtk, d);
      else ev(g, { t: 'noreturn', ref: target, from: unitRef(a), pid }); // Artillery strikes from range: the defender (ref) cannot hit back
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
    if (g.over || g.active !== pid) return false;
    fire(g, pid, 'turnEnd');

    // Lane terrain end-of-turn effects for active player's units
    const p = g.players[pid];
    p.board.slice().forEach((u) => {
      if (!alive(u)) return;
      const terrain = g.lanes[u.lane] ? g.lanes[u.lane].terrain : null;
      if (terrain === 'fungus') {
        const immune = CARDS[u.id].native || CARDS[u.id].faction === 'rootbound' || p.doctrine === 'green';
        if (immune) E.heal(g, unitRef(u), 1);
        else E.damage(g, unitRef(u), 1, null);
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
