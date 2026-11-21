/* VEYRA — rules engine. No DOM access; game state is plain JSON so it can be cloned for the AI.
 *
 * The board: each player has LANES lanes. A lane holds one unit (front) and one location (back).
 * Lane i on one side faces lane i on the other. A unit reaches its own lane and its neighbours;
 * if an enemy unit is in reach it must attack a unit, otherwise it may hit a location in reach
 * or the enemy colony.
 */
(function (root) {
  'use strict';
  const V = (root.Veyra = root.Veyra || {});
  const CARDS = V.CARDS;
  const FACTIONS = V.FACTIONS;

  const E = {};
  E.LANES = 7;
  E.CENTER = 3;
  E.MAX_HAND = 9;
  E.START_HP = 30;
  E.MAX_ENERGY = 10;
  E.RAZE_DAMAGE = 3; // a colony takes this much when one of its locations is destroyed
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

  /** The unit occupying a lane (even one that is about to die), or null. */
  E.unitAt = (g, pid, lane) => g.players[pid].board.find((u) => u.lane === lane) || null;
  E.siteAt = (g, pid, lane) => g.players[pid].sites.find((s) => s.lane === lane) || null;

  /** The living unit standing in a location's lane, or null. */
  E.stationed = function (g, site) {
    const u = E.unitAt(g, site.owner, site.lane);
    return u && alive(u) ? u : null;
  };
  E.siteBehind = function (g, u) {
    const s = E.siteAt(g, u.owner, u.lane);
    return s && alive(s) ? s : null;
  };

  /** Keyword check that includes keywords granted by the location the unit is stationed at. */
  E.hasKw = function (g, u, k) {
    if (u.kw[k]) return true;
    const s = E.siteBehind(g, u);
    const grant = s && CARDS[s.id].grant;
    return !!(grant && grant[k]);
  };
  E.reach = (g, u) => (E.hasKw(g, u, 'artillery') ? 2 : 1);

  function lanesWhere(test) {
    const out = [];
    for (let i = 0; i < E.LANES; i++) if (test(i)) out.push(i);
    return out;
  }
  E.emptyLanes = (g, pid) => lanesWhere((i) => !E.unitAt(g, pid, i));
  E.emptyPlots = (g, pid) => lanesWhere((i) => !E.siteAt(g, pid, i));

  /** Closest lane to `lane` with no unit; ties go to the lane nearer the centre. */
  E.nearestEmpty = function (g, pid, lane) {
    for (let d = 0; d < E.LANES; d++) {
      const opts = [lane - d, lane + d].filter((x, i, a) => x >= 0 && x < E.LANES && a.indexOf(x) === i && !E.unitAt(g, pid, x));
      if (opts.length) return opts.sort((a, b) => Math.abs(a - E.CENTER) - Math.abs(b - E.CENTER) || a - b)[0];
    }
    return null;
  };

  E.allUnits = (g) => g.players[g.active].board.concat(g.players[1 - g.active].board).filter(alive);
  E.tech = (g, pid, n) => g.players[pid].research >= n;

  /** Enemy units within a unit's reach. */
  E.inReach = function (g, u) {
    const r = E.reach(g, u);
    return g.players[1 - u.owner].board.filter((x) => alive(x) && Math.abs(x.lane - u.lane) <= r);
  };
  /** True when no enemy unit holds this unit up, so it can strike locations or the colony. */
  E.unscreened = (g, u) => E.hasKw(g, u, 'aerial') || E.inReach(g, u).length === 0;

  E.randomEnemy = function (g, pid) {
    const foe = g.players[1 - pid];
    const pool = foe.board.filter(alive).map(unitRef);
    if (foe.hp > 0) pool.push(leaderRef(foe.id));
    return E.pick(g, pool);
  };

  E.randomForeignCard = function (g, pid) {
    const mine = g.players[pid].faction;
    const pool = Object.keys(CARDS).filter((id) => {
      const c = CARDS[id];
      return !c.token && c.faction !== 'neutral' && c.faction !== mine;
    });
    return E.pick(g, pool);
  };

  /* ------------------------------------------------------------ setup */
  function mkPlayer(id, faction) {
    return {
      id, faction, hp: E.START_HP, maxHp: E.START_HP, armor: 0,
      energy: 0, maxEnergy: 0, research: 0, powerUsed: false, fatigue: 0,
      deck: [], hand: [], board: [], sites: [],
    };
  }

  E.newGame = function (f0, f1, seed, first) {
    const g = {
      seed: (seed | 0) || 1, players: [mkPlayer(0, f0), mkPlayer(1, f1)],
      active: first ? 1 : 0, turn: 0, over: false, winner: null,
      events: [], nextUid: 1, silent: false,
    };
    g.players.forEach((p) => {
      p.deck = shuffle(g, V.buildDeck(p.faction));
      E.build(g, p.id, 'landing', E.CENTER);
    });
    const a = g.active;
    E.draw(g, a, 3);
    E.draw(g, 1 - a, 4);
    E.addToHand(g, 1 - a, 'cell');
    g.events = [];
    startTurn(g);
    return g;
  };

  /** Deep copy for AI look-ahead. Hidden information is re-randomised so the AI cannot peek. */
  E.clone = function (g) {
    const c = JSON.parse(JSON.stringify(g));
    c.events = [];
    c.silent = true;
    c.seed = (Math.random() * 0x7fffffff) | 0;
    c.players.forEach((p) => shuffle(c, p.deck));
    return c;
  };

  /* ------------------------------------------------------------ primitive effects */
  E.damage = function (g, ref, n, src) {
    if (n <= 0 || !ref) return 0;
    if (ref.k === 'l') {
      const p = g.players[ref.pid];
      let rem = n;
      if (p.armor > 0) { const a = Math.min(p.armor, rem); p.armor -= a; rem -= a; }
      p.hp -= rem;
      ev(g, { t: 'dmg', ref, n });
    } else if (ref.k === 's') {
      const f = E.findSite(g, ref.uid);
      if (!f || !alive(f.site)) return 0;
      f.site.hp -= n;
      ev(g, { t: 'dmg', ref, n });
    } else {
      const f = E.find(g, ref.uid);
      if (!f || !alive(f.unit)) return 0;
      const u = f.unit;
      if (u.kw.shield) { u.kw.shield = false; ev(g, { t: 'block', ref }); return 0; }
      u.hp -= n;
      ev(g, { t: 'dmg', ref, n });
    }
    if (src && src.kw && src.kw.siphon) E.heal(g, leaderRef(src.owner), n);
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

  E.destroy = function (g, ref) {
    const f = ref.k === 's' ? E.findSite(g, ref.uid) : E.find(g, ref.uid);
    if (f) (f.unit || f.site).doomed = true;
  };

  E.gainArmor = function (g, pid, n) {
    g.players[pid].armor += n;
    ev(g, { t: 'armor', ref: leaderRef(pid), n });
  };

  E.gainEnergy = function (g, pid, n) { g.players[pid].energy += n; };

  E.gainResearch = function (g, pid, n) {
    const p = g.players[pid];
    const before = p.research;
    p.research += n;
    ev(g, { t: 'research', pid, n });
    E.MILESTONES.forEach((m, i) => {
      if (before < m && p.research >= m) {
        ev(g, { t: 'milestone', pid, level: i });
        if (i === 0) E.draw(g, pid, 1);
        if (i === 2) {
          E.draw(g, pid, 2);
          p.board.filter(alive).forEach((u) => E.buff(g, u, 1, 1));
        }
      }
    });
  };

  E.powerCost = (g, pid) => (g.players[pid].research >= E.MILESTONES[1] ? 1 : FACTIONS[g.players[pid].faction].power.cost);

  /** What a card in hand costs right now, after discounts from staffed locations. */
  E.cost = function (g, pid, hc) {
    let c = hc.cost;
    if (CARDS[hc.id].type === 'order') {
      g.players[pid].sites.forEach((s) => {
        const d = CARDS[s.id];
        if (d.orderDiscount && alive(s) && E.stationed(g, s)) c -= d.orderDiscount;
      });
    }
    return Math.max(0, c);
  };

  E.addToHand = function (g, pid, id, costMod) {
    const p = g.players[pid];
    if (p.hand.length >= E.MAX_HAND) { ev(g, { t: 'burn', pid, id }); return null; }
    const hc = { uid: g.nextUid++, id, cost: Math.max(0, CARDS[id].cost + (costMod || 0)) };
    p.hand.push(hc);
    ev(g, { t: 'gain', pid, id });
    return hc;
  };

  E.draw = function (g, pid, n) {
    const p = g.players[pid];
    for (let i = 0; i < n; i++) {
      if (!p.deck.length) {
        p.fatigue++;
        ev(g, { t: 'fatigue', pid, n: p.fatigue });
        E.damage(g, leaderRef(pid), p.fatigue, null);
        continue;
      }
      const id = p.deck.pop();
      if (p.hand.length >= E.MAX_HAND) { ev(g, { t: 'burn', pid, id }); continue; }
      p.hand.push({ uid: g.nextUid++, id, cost: CARDS[id].cost });
      ev(g, { t: 'draw', pid });
    }
  };

  /** Put a unit into `lane`, or the nearest empty lane if that one is taken. Null when the side is full. */
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
    };
    p.board.push(u);
    ev(g, { t: 'summon', pid, uid: u.uid, id, lane: ln });
    const s = E.siteBehind(g, u);
    if (s && CARDS[s.id].onArrive) CARDS[s.id].onArrive(g, { pid, self: s, unit: u });
    return u;
  };

  /** Raise a location on an empty plot. */
  E.build = function (g, pid, id, lane) {
    if (lane == null || E.siteAt(g, pid, lane)) return null;
    const d = CARDS[id];
    const s = { uid: g.nextUid++, id, owner: pid, lane, hp: d.hp, maxHp: d.hp };
    g.players[pid].sites.push(s);
    ev(g, { t: 'build', pid, uid: s.uid, id, lane });
    return s;
  };

  /** Take control of an enemy unit: it crosses to the same lane, or the nearest empty one. */
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
  };

  /* ------------------------------------------------------------ triggers / cleanup */
  function fire(g, pid, name) {
    const p = g.players[pid];
    p.board.slice().forEach((u) => {
      if (g.over) return;
      const d = CARDS[u.id];
      if (d[name] && alive(u) && p.board.includes(u)) d[name](g, { pid, self: u, target: null });
    });
    p.sites.slice().forEach((s) => {
      if (g.over) return;
      const d = CARDS[s.id];
      if (d[name] && alive(s) && p.sites.includes(s)) d[name](g, { pid, self: s, unit: E.stationed(g, s), target: null });
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
        ev(g, { t: 'death', ref: unitRef(u), id: u.id, pid: u.owner });
      });
      razed.forEach((s) => {
        const b = g.players[s.owner].sites;
        b.splice(b.indexOf(s), 1);
        ev(g, { t: 'raze', ref: siteRef(s), id: s.id, pid: s.owner });
        E.damage(g, leaderRef(s.owner), E.RAZE_DAMAGE, null);
      });
      dead.forEach((u) => {
        const d = CARDS[u.id];
        if (d.lastStand) d.lastStand(g, { pid: u.owner, self: u, target: null });
      });
    }
    const d0 = g.players[0].hp <= 0;
    const d1 = g.players[1].hp <= 0;
    if ((d0 || d1) && !g.over) {
      g.over = true;
      g.winner = d0 && d1 ? -1 : d0 ? 1 : 0;
      ev(g, { t: 'over', winner: g.winner });
    }
  }

  function startTurn(g) {
    g.turn++;
    const p = g.players[g.active];
    p.maxEnergy = Math.min(E.MAX_ENERGY, p.maxEnergy + 1);
    p.energy = p.maxEnergy;
    p.powerUsed = false;
    p.board.forEach((u) => { u.ready = true; u.attacked = false; u.moved = false; });
    ev(g, { t: 'turn', pid: g.active, turn: g.turn });
    E.draw(g, g.active, 1);
    fire(g, g.active, 'turnStart');
    resolve(g);
  }

  /* ------------------------------------------------------------ targeting */
  E.targets = function (g, pid, spec, filter) {
    if (!spec) return null;
    const me = g.players[pid];
    const foe = g.players[1 - pid];
    if (spec === 'column') return lanesWhere(() => true).map(laneRef);
    if (spec === 'emptyLane') return E.emptyLanes(g, pid).map(laneRef);

    const mine = spec === 'unit' || spec === 'any' || spec === 'unitOrSite' || spec === 'allyUnit' || spec === 'ally';
    const theirs = spec === 'unit' || spec === 'any' || spec === 'unitOrSite' || spec === 'enemyUnit' || spec === 'enemy' || spec === 'enemyUnitOrSite';
    const sites = spec === 'any' || spec === 'unitOrSite' || spec === 'ally' || spec === 'enemy' || spec === 'enemyUnitOrSite';
    const leaders = spec === 'any' || spec === 'ally' || spec === 'enemy';
    const out = [];
    const sides = [];
    if (mine) sides.push(me);
    if (theirs) sides.push(foe);
    sides.forEach((p) => p.board.filter(alive).forEach((u) => { if (!filter || filter(g, u, pid)) out.push(unitRef(u)); }));
    if (sites) sides.forEach((p) => p.sites.filter(alive).forEach((s) => out.push(siteRef(s))));
    if (leaders) sides.forEach((p) => out.push(leaderRef(p.id)));
    return out;
  };

  /** Targets for a card in hand: null when the card takes no target. */
  E.cardTargets = (g, pid, d) => E.targets(g, pid, d.target, d.targetFilter);

  /** Lanes a unit or location card may be placed in: null for orders. */
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
    if (d.type !== 'order') return E.deployLanes(g, pid, d).length > 0;
    if (d.target) return E.cardTargets(g, pid, d).length > 0;
    return true;
  };

  /** True when the player must pick a target before this card can be played. */
  E.needsTarget = function (g, pid, hc) {
    const d = CARDS[hc.id];
    if (!d.target) return false;
    return E.cardTargets(g, pid, d).length > 0;
  };

  E.canAttack = (g, u) => !g.over && g.active === u.owner && u.atk > 0 && u.ready && !u.attacked && alive(u);

  E.attackTargets = function (g, u) {
    if (!E.canAttack(g, u)) return [];
    const foe = g.players[1 - u.owner];
    const near = E.inReach(g, u);
    const aerial = E.hasKw(g, u, 'aerial');
    const guards = near.filter((x) => E.hasKw(g, x, 'guard'));
    const out = (guards.length && !aerial ? guards : near).map(unitRef);
    if (!E.unscreened(g, u)) return out;
    if (u.summonedTurn === g.turn) return out; // Blitz arrivals may only strike units
    const sr = E.reach(g, u);
    foe.sites.forEach((s) => { if (alive(s) && Math.abs(s.lane - u.lane) <= sr) out.push(siteRef(s)); });
    out.push(leaderRef(foe.id));
    return out;
  };

  E.canMove = function (g, u) {
    if (g.over || g.active !== u.owner || u.immobile || !u.ready || u.moved || !alive(u)) return false;
    if (u.summonedTurn === g.turn) return false;
    return !u.attacked || E.hasKw(g, u, 'mobile');
  };

  /** Lanes a unit can step into this turn: the empty lanes directly beside it. */
  E.moveTargets = function (g, u) {
    if (!E.canMove(g, u)) return [];
    return [u.lane - 1, u.lane + 1].filter((x) => x >= 0 && x < E.LANES && !E.unitAt(g, u.owner, x));
  };

  E.canUsePower = function (g, pid) {
    if (g.over || g.active !== pid) return false;
    const p = g.players[pid];
    const pw = FACTIONS[p.faction].power;
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
    let tg = null;
    if (d.target) {
      const ts = E.cardTargets(g, pid, d);
      if (ts.length) {
        if (!ts.some((t) => sameRef(t, target))) return false;
        tg = target;
      }
    }
    p.energy -= E.cost(g, pid, hc);
    p.hand.splice(i, 1);
    ev(g, { t: 'play', pid, id: hc.id, target: tg, lane: lanes ? lane : null });
    if (d.type === 'unit') {
      const u = E.summon(g, pid, hc.id, lane);
      if (u && d.deploy) d.deploy(g, { pid, self: u, target: tg });
    } else if (d.type === 'site') {
      E.build(g, pid, hc.id, lane);
    } else {
      d.play(g, { pid, target: tg });
      resolve(g);
      if (!g.over && !d.noResearch) {
        E.gainResearch(g, pid, 1);
        fire(g, pid, 'onOrder');
      }
    }
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
    ev(g, { t: 'power', pid, target: tg });
    pw.run(g, { pid, target: tg });
    resolve(g);
    return true;
  };

  E.attack = function (g, pid, uid, target) {
    const f = E.find(g, uid);
    if (!f || f.pid !== pid) return false;
    const a = f.unit;
    if (!E.attackTargets(g, a).some((t) => sameRef(t, target))) return false;
    const mobile = E.hasKw(g, a, 'mobile');
    const artillery = E.hasKw(g, a, 'artillery');
    a.attacked = true;
    if (!mobile) a.moved = true;
    ev(g, { t: 'attack', pid, from: unitRef(a), to: target, id: a.id });
    if (target.k !== 'u') {
      E.damage(g, target, a.atk, a);
    } else {
      const d = E.find(g, target.uid).unit;
      const aAtk = a.atk;
      const dAtk = d.atk;
      E.damage(g, target, aAtk, a);
      if (!artillery) E.damage(g, unitRef(a), dAtk, d);
    }
    resolve(g);
    return true;
  };

  /** Step a unit one lane sideways. This uses up its attack unless it is Mobile. */
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
    resolve(g);
    return true;
  };

  E.endTurn = function (g, pid) {
    if (g.over || g.active !== pid) return false;
    fire(g, pid, 'turnEnd');
    resolve(g);
    if (g.over) return true;
    g.active = 1 - pid;
    startTurn(g);
    return true;
  };

  V.Engine = E;
})(typeof globalThis !== 'undefined' ? globalThis : this);
