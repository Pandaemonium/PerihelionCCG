/* VEYRA — rules engine. No DOM access; game state is plain JSON so it can be cloned for the AI. */
(function (root) {
  'use strict';
  const V = (root.Veyra = root.Veyra || {});
  const CARDS = V.CARDS;
  const FACTIONS = V.FACTIONS;

  const E = {};
  E.MAX_BOARD = 6;
  E.MAX_HAND = 9;
  E.START_HP = 30;
  E.MAX_ENERGY = 10;
  E.MILESTONES = [3, 6, 10];
  E.MILESTONE_TEXT = [
    'Breakthrough I — draw a card.',
    'Breakthrough II — your leader power costs 1.',
    'Breakthrough III — draw 2 cards and give your units +1/+1.',
  ];

  /* ------------------------------------------------------------ helpers */
  const unitRef = (u) => ({ k: 'u', uid: u.uid });
  const leaderRef = (pid) => ({ k: 'l', pid });
  const sameRef = (a, b) => !!a && !!b && a.k === b.k && (a.k === 'u' ? a.uid === b.uid : a.pid === b.pid);
  E.unitRef = unitRef;
  E.leaderRef = leaderRef;
  E.sameRef = sameRef;

  function ev(g, e) { if (!g.silent) g.events.push(e); }

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

  const alive = (u) => u.hp > 0 && !u.doomed;

  E.find = function (g, uid) {
    for (const p of g.players) {
      const idx = p.board.findIndex((u) => u.uid === uid);
      if (idx >= 0) return { unit: p.board[idx], pid: p.id, idx };
    }
    return null;
  };
  E.allUnits = (g) => g.players[g.active].board.concat(g.players[1 - g.active].board).filter(alive);
  E.tech = (g, pid, n) => g.players[pid].research >= n;

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
      deck: [], hand: [], board: [],
    };
  }

  E.newGame = function (f0, f1, seed, first) {
    const g = {
      seed: (seed | 0) || 1, players: [mkPlayer(0, f0), mkPlayer(1, f1)],
      active: first ? 1 : 0, turn: 0, over: false, winner: null,
      events: [], nextUid: 1, silent: false,
    };
    g.players.forEach((p) => { p.deck = shuffle(g, V.buildDeck(p.faction)); });
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
    } else {
      const f = E.find(g, ref.uid);
      if (!f || !alive(f.unit)) return 0;
      const u = f.unit;
      if (u.kw.shield) { u.kw.shield = false; ev(g, { t: 'block', ref }); return 0; }
      u.hp -= n;
      if (src && src.kw && src.kw.venom) u.doomed = true;
      ev(g, { t: 'dmg', ref, n });
    }
    if (src && src.kw && src.kw.siphon) E.heal(g, leaderRef(src.owner), n);
    return n;
  };

  E.heal = function (g, ref, n) {
    if (!ref || n <= 0) return;
    let t;
    if (ref.k === 'l') t = g.players[ref.pid];
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
    const f = E.find(g, ref.uid);
    if (f) f.unit.doomed = true;
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

  E.summon = function (g, pid, id) {
    const p = g.players[pid];
    if (p.board.length >= E.MAX_BOARD) return null;
    const d = CARDS[id];
    const u = {
      uid: g.nextUid++, id, owner: pid, atk: d.atk, hp: d.hp, maxHp: d.hp,
      kw: Object.assign({}, d.kw || {}), structure: !!d.structure,
      ready: !!(d.kw && d.kw.blitz), attacked: false, summonedTurn: g.turn,
    };
    p.board.push(u);
    ev(g, { t: 'summon', pid, uid: u.uid, id });
    return u;
  };

  E.bounce = function (g, ref) {
    const f = E.find(g, ref.uid);
    if (!f) return;
    g.players[f.pid].board.splice(f.idx, 1);
    ev(g, { t: 'bounce', ref, id: f.unit.id });
    E.addToHand(g, f.pid, f.unit.id);
  };

  E.steal = function (g, ref, pid) {
    const f = E.find(g, ref.uid);
    if (!f || f.pid === pid) return;
    if (g.players[pid].board.length >= E.MAX_BOARD) { f.unit.doomed = true; return; }
    const u = f.unit;
    g.players[f.pid].board.splice(f.idx, 1);
    u.owner = pid;
    u.summonedTurn = g.turn;
    u.ready = !!u.kw.blitz;
    u.attacked = false;
    g.players[pid].board.push(u);
    ev(g, { t: 'steal', ref, pid });
  };

  /* ------------------------------------------------------------ triggers / cleanup */
  function fire(g, pid, name) {
    g.players[pid].board.slice().forEach((u) => {
      if (g.over) return;
      const d = CARDS[u.id];
      if (d[name] && alive(u) && E.find(g, u.uid)) d[name](g, { pid, self: u, target: null });
    });
  }

  function resolve(g) {
    for (let pass = 0; pass < 60; pass++) {
      const dead = [];
      [g.active, 1 - g.active].forEach((pid) => {
        g.players[pid].board.forEach((u) => { if (!alive(u)) dead.push(u); });
      });
      if (!dead.length) break;
      dead.forEach((u) => {
        const b = g.players[u.owner].board;
        b.splice(b.indexOf(u), 1);
        ev(g, { t: 'death', ref: unitRef(u), id: u.id, pid: u.owner });
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
    p.board.forEach((u) => { u.ready = true; u.attacked = false; });
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
    let units = [];
    const out = [];
    if (spec === 'unit' || spec === 'any') units = me.board.concat(foe.board);
    else if (spec === 'allyUnit' || spec === 'ally') units = me.board.slice();
    else if (spec === 'enemyUnit' || spec === 'enemy') units = foe.board.slice();
    units.filter(alive).forEach((u) => { if (!filter || filter(g, u, pid)) out.push(unitRef(u)); });
    if (spec === 'any') out.push(leaderRef(pid), leaderRef(1 - pid));
    if (spec === 'ally') out.push(leaderRef(pid));
    if (spec === 'enemy') out.push(leaderRef(1 - pid));
    return out;
  };

  /** Targets for a card in hand: null when the card takes no target. */
  E.cardTargets = (g, pid, d) => E.targets(g, pid, d.target, d.targetFilter);

  E.canPlay = function (g, pid, hc) {
    if (g.over || g.active !== pid) return false;
    const p = g.players[pid];
    const d = CARDS[hc.id];
    if (hc.cost > p.energy) return false;
    if (d.type === 'unit') return p.board.length < E.MAX_BOARD;
    if (d.target) return E.cardTargets(g, pid, d).length > 0;
    return true;
  };

  /** True when the player must pick a target before this card can be played. */
  E.needsTarget = function (g, pid, hc) {
    const d = CARDS[hc.id];
    if (!d.target) return false;
    return E.cardTargets(g, pid, d).length > 0;
  };

  E.canAttack = (g, u) => !g.over && g.active === u.owner && !u.structure && u.atk > 0 && u.ready && !u.attacked && alive(u);

  E.attackTargets = function (g, u) {
    if (!E.canAttack(g, u)) return [];
    const foe = g.players[1 - u.owner];
    const foes = foe.board.filter(alive);
    const guards = foes.filter((x) => x.kw.guard);
    const blocked = guards.length > 0 && !u.kw.aerial;
    const out = (blocked ? guards : foes).map(unitRef);
    if (!blocked && u.summonedTurn !== g.turn) out.push(leaderRef(foe.id));
    return out;
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
  E.playCard = function (g, pid, handUid, target) {
    const p = g.players[pid];
    const i = p.hand.findIndex((h) => h.uid === handUid);
    if (i < 0) return false;
    const hc = p.hand[i];
    const d = CARDS[hc.id];
    if (!E.canPlay(g, pid, hc)) return false;
    let tg = null;
    if (d.target) {
      const ts = E.cardTargets(g, pid, d);
      if (ts.length) {
        if (!ts.some((t) => sameRef(t, target))) return false;
        tg = target;
      }
    }
    p.energy -= hc.cost;
    p.hand.splice(i, 1);
    ev(g, { t: 'play', pid, id: hc.id, target: tg });
    if (d.type === 'unit') {
      const u = E.summon(g, pid, hc.id);
      if (u && d.deploy) d.deploy(g, { pid, self: u, target: tg });
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
    a.attacked = true;
    ev(g, { t: 'attack', pid, from: unitRef(a), to: target, id: a.id });
    if (target.k === 'l') {
      E.damage(g, target, a.atk, a);
    } else {
      const d = E.find(g, target.uid).unit;
      const aAtk = a.atk;
      const dAtk = d.atk;
      E.damage(g, target, aAtk, a);
      E.damage(g, unitRef(a), dAtk, d);
    }
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
