/* TAU CETI — Planet Mode AI (prototype, phase A). Simple heuristics, no look-ahead: guard threatened
 * cities, expand with pods, attack the enemy city that's cheapest to take, then spend energy on the
 * card in hand that scores best for its cost. Each faction leans a little differently (PERSONALITY).
 * It never reads other players' orders or hands, so it plays fair. Its own randomness comes from a
 * generator seeded by game seed, player and turn; it never advances g.seed.
 */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const P = V.Planet;
  const PC = V.PCARDS;

  // aggression: willingness to attack; expand: how many cities it wants; science: how much it values research.
  const PERSONALITY = {
    rootbound: { aggression: 0.35, expand: 0.8, science: 0.8 },
    ironwake:  { aggression: 0.6,  expand: 0.5, science: 0.4 },
    synod:     { aggression: 0.25, expand: 0.6, science: 1.0 },
    tide:      { aggression: 0.7,  expand: 0.5, science: 0.4 },
    cinder:    { aggression: 0.8,  expand: 0.4, science: 0.5 },
    auric:     { aggression: 0.4,  expand: 0.7, science: 0.5 },
    redline:   { aggression: 0.9,  expand: 0.35, science: 0.3 },
  };
  const DEFAULT = { aggression: 0.5, expand: 0.5, science: 0.5 };

  const PA = {};
  PA.personality = (g, pid) => PERSONALITY[g.players[pid].faction] || DEFAULT;

  const rngFor = (g, pid, salt) => P.rngFrom((g.seed ^ Math.imul(pid + 1, 7919) ^ Math.imul(g.turn + 1, 104729) ^ (salt || 0)) | 0);

  function siteValue(g, sid, pers) {
    const t = P.TERRAIN[g.sectors[sid].terrain];
    let v = t.energy + t.research * pers.science - (t.water ? 1.5 : 0);
    g.sectors[sid].adj.forEach((a) => {
      const n = P.TERRAIN[g.sectors[a].terrain];
      if (!n.water) v += 0.25 * (n.energy + n.research * pers.science);
    });
    if (t.high) v += 0.8;
    return v;
  }
  const cardPower = (d, hp) => d.atk + (hp == null ? d.hp : hp) * 0.5;
  const power = (u) => cardPower(P.def(u), u.hp);
  const distFor = (g, u) => P.dist(g, !!(P.def(u).air || P.def(u).naval));

  /** Turn 0: pick a landing sector. Better land is likelier, but greed varies, so crowding happens. */
  PA.landfall = function (g, pid) {
    const pers = PA.personality(g, pid);
    const r = rngFor(g, pid, 0x1a4d);
    const opts = g.sectors.filter((s) => P.canLand(g, s.id)).map((s) => {
      let v = siteValue(g, s.id, pers);
      if (s.ring === 0) v += 1.2 - pers.aggression; // the cautious like the quiet edge
      return { id: s.id, v };
    });
    const temp = 0.9 + r() * 0.8;
    const w = opts.map((o) => Math.exp(o.v * temp));
    let pick = r() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < opts.length; i++) if ((pick -= w[i]) <= 0) return opts[i].id;
    return opts[opts.length - 1].id;
  };

  /** One step toward `target` for unit u, or null if nothing gets closer. */
  function stepToward(g, u, target, legal) {
    const D = distFor(g, u);
    let best = null, bestD = D[u.sector][target];
    legal.forEach((s) => {
      if (D[s][target] < bestD) { best = s; bestD = D[s][target]; }
    });
    return best;
  }

  PA.orders = function (g, pid) {
    const pers = PA.personality(g, pid);
    const r = rngFor(g, pid, 0x0dd5);
    const me = g.players[pid];
    const out = { moves: {}, plays: [], found: [], scrap: [] };
    const myCols = P.coloniesOf(g, pid);
    const myUnits = P.unitsOf(g, pid);
    const enemies = g.units.filter((u) => u.owner !== pid);
    const DG = P.dist(g, false), DA = P.dist(g, true);
    const assigned = new Set();
    const legal = {};
    myUnits.forEach((u) => { legal[u.uid] = P.legalMoves(g, u); });
    const move = (u, dest) => { if (dest != null && dest !== u.sector) out.moves[u.uid] = dest; assigned.add(u.uid); };

    // Threat to each city: the strongest single rival's nearby force. Rivals don't coordinate, and
    // adding them all up made cities between two neighbours hold everything at home forever.
    // Enemy units sitting on their own cities count half, since they have homes to guard too.
    const threatAt = (sid) => {
      const by = {};
      enemies.forEach((e) => {
        const d = distFor(g, e)[e.sector][sid];
        const reach = P.def(e).move;
        if (d > reach + 1) return;
        const home = P.colonyAt(g, e.sector);
        const w = (d <= reach ? 1 : 0.5) * (home && home.owner === e.owner ? 0.5 : 1);
        by[e.owner] = (by[e.owner] || 0) + power(e) * w;
      });
      return Math.max(0, ...Object.values(by));
    };
    const defenseAt = (sid) => myUnits.filter((u) => u.sector === sid).reduce((a, u) => a + power(u), 0);
    const cols = myCols.map((c) => ({ c, threat: threatAt(c.sector), def: defenseAt(c.sector) + c.hp * 0.25 }))
      .map((x) => Object.assign(x, { need: x.threat * 1.1 - x.def }))
      .sort((a, b) => b.need - a.need);
    const needOf = {};
    cols.forEach((x) => { needOf[x.c.uid] = x.need; });

    // ---- pods: found here if it's decent and safe, else walk to the best free site nearby
    myUnits.filter((u) => P.def(u).settler).forEach((u) => {
      const D = distFor(g, u);
      const spacing = (sid) => myCols.some((c) => DG[c.sector][sid] <= 1);
      const danger = (sid) => enemies.some((e) => DG[e.sector][sid] <= 1);
      const score = (sid) => siteValue(g, sid, pers) - (danger(sid) ? 3 : 0) - (spacing(sid) ? 2.5 : 0) - 0.6 * D[u.sector][sid];
      const sites = g.sectors.filter((s) => P.canFoundAt(g, s.id, u) && D[u.sector][s.id] <= 4).map((s) => ({ id: s.id, v: score(s.id) }));
      sites.sort((a, b) => b.v - a.v);
      const goal = sites[0];
      if (!goal) { move(u, null); return; }
      if (goal.id === u.sector || (P.canFoundAt(g, u.sector, u) && score(u.sector) >= goal.v - 0.5 && !spacing(u.sector))) {
        out.found.push(u.uid);
        move(u, null);
        return;
      }
      const step = stepToward(g, u, goal.id, legal[u.uid]);
      move(u, step);
      if (step === goal.id) out.found.push(u.uid);
    });

    // ---- terraformers: work the nearest poor sector you hold; spies: head for the nearest enemy city
    myUnits.filter((u) => P.def(u).former).forEach((u) => {
      const poor = (sid) => ['desert', 'fungus', 'plains'].includes(g.sectors[sid].terrain) && !P.hostileTo(g, pid, sid);
      if (poor(u.sector) && P.colonyAt(g, u.sector) && P.colonyAt(g, u.sector).owner === pid) return move(u, null);
      if (poor(u.sector) && myCols.some((c) => DG[c.sector][u.sector] <= 1)) return move(u, null);
      const goal = g.sectors.filter((s) => poor(s.id) && myCols.some((c) => DG[c.sector][s.id] <= 1))
        .sort((a, b) => DG[u.sector][a.id] - DG[u.sector][b.id])[0];
      move(u, goal ? stepToward(g, u, goal.id, legal[u.uid]) : null);
    });
    myUnits.filter((u) => P.def(u).probe).forEach((u) => {
      const here = P.colonyAt(g, u.sector);
      if (here && here.owner !== pid) return move(u, null);
      const goal = g.colonies.filter((c) => c.owner !== pid && c.attached.length)
        .sort((a, b) => DG[u.sector][a.sector] - DG[u.sector][b.sector])[0];
      move(u, goal ? (legal[u.uid].includes(goal.sector) ? goal.sector : stepToward(g, u, goal.sector, legal[u.uid])) : null);
    });

    // ---- defence: hold at threatened cities, pull in nearby help
    const fighters = myUnits.filter((u) => !assigned.has(u.uid) && P.def(u).atk > 0);
    cols.forEach((x) => {
      if (x.need <= 0) return;
      // Keep only as many defenders at home as the threat calls for; the rest stay free.
      let need = x.threat * 1.1 - x.c.hp * 0.25;
      fighters.filter((u) => u.sector === x.c.sector && !assigned.has(u.uid))
        .sort((a, b) => power(b) - power(a))
        .forEach((u) => { if (need > 0) { move(u, null); need -= power(u); } });
      fighters.filter((u) => !assigned.has(u.uid) && P.def(u).move)
        .sort((a, b) => distFor(g, a)[a.sector][x.c.sector] - distFor(g, b)[b.sector][x.c.sector])
        .forEach((u) => {
          if (need <= 0) return;
          if (distFor(g, u)[u.sector][x.c.sector] > 2) return;
          const step = legal[u.uid].includes(x.c.sector) ? x.c.sector : stepToward(g, u, x.c.sector, legal[u.uid]);
          if (step == null) return;
          move(u, step);
          need -= power(u);
        });
    });

    // ---- offence: pick the enemy city that's cheapest to take for its value
    const free = fighters.filter((u) => !assigned.has(u.uid) && P.def(u).move);
    const army = free.reduce((a, u) => a + power(u), 0);
    const targets = g.colonies.filter((c) => c.owner !== pid).map((c) => {
      const def = g.units.filter((u) => u.sector === c.sector && u.owner !== pid).reduce((a, u) => a + power(u), 0) + c.hp * 0.3;
      const dist = free.length ? free.reduce((a, u) => a + distFor(g, u)[u.sector][c.sector], 0) / free.length : 99;
      const value = (c.capital ? 2 : 1) * (1 + 0.1 * c.attached.length);
      return { c, def, dist, v: value / (def + 2) / (1 + dist * 0.6) };
    }).filter((t) => t.dist < 8).sort((a, b) => b.v - a.v);
    const goal = targets[0];
    const ready = goal && g.turn >= 3 && army >= goal.def * (1.4 - pers.aggression);
    if (ready) {
      const sid = goal.c.sector;
      // Strike only if what can arrive this turn is enough; otherwise gather one step out.
      const arriving = free.filter((u) => legal[u.uid].includes(sid));
      const strike = arriving.reduce((a, u) => a + power(u), 0) >= goal.def * (1.25 - pers.aggression * 0.4);
      free.forEach((u) => {
        if (strike && legal[u.uid].includes(sid)) return move(u, sid);
        const D = distFor(g, u);
        if (D[u.sector][sid] <= 1) return move(u, null);
        const staging = legal[u.uid].filter((s) => D[s][sid] >= 1 && D[s][sid] < D[u.sector][sid] && !P.hostileTo(g, pid, s));
        staging.sort((a, b) => D[a][sid] - D[b][sid]);
        move(u, staging[0] != null ? staging[0] : null);
      });
    }

    // ---- leftovers: pick off weak neighbours, claim empty ground, or clear room at home
    const core = g.sectors.length - 1;
    myUnits.filter((u) => !assigned.has(u.uid)).forEach((u) => {
      if (!P.def(u).move) return move(u, null);
      const prey = legal[u.uid].filter((s) => {
        const foes = g.units.filter((e) => e.sector === s && e.owner !== pid);
        const col = P.colonyAt(g, s);
        if (col && col.owner !== pid) return false;
        return foes.length && foes.reduce((a, e) => a + power(e), 0) < power(u) * 0.7;
      });
      if (prey.length) return move(u, prey[0]);
      // A full home sector can't take new cards, so step out to make room.
      const home = P.colonyAt(g, u.sector);
      if (home && home.owner === pid && P.cardsIn(g, u.sector) >= P.CAPACITY - 1 && (needOf[home.uid] || 0) <= 0) {
        const room = legal[u.uid].filter((s) => !P.hostileTo(g, pid, s) && P.cardsIn(g, s) < P.CAPACITY - 1);
        if (room.length) return move(u, room[Math.floor(r() * room.length)]);
      }
      const unclaimed = legal[u.uid].filter((s) => P.controller(g, s) === -1 && !P.TERRAIN[g.sectors[s].terrain].water);
      if (unclaimed.length && r() < 0.5) return move(u, unclaimed[Math.floor(r() * unclaimed.length)]);
      if (army > 12 && r() < pers.aggression * 0.4) return move(u, stepToward(g, u, core, legal[u.uid]));
      move(u, null);
    });

    // ---- cards: spend energy on whatever scores best for its cost
    const leaving = {}, arriving = {};
    Object.keys(out.moves).forEach((uid) => {
      const u = P.findUnit(g, +uid);
      leaving[u.sector] = (leaving[u.sector] || 0) + 1;
      arriving[out.moves[uid]] = (arriving[out.moves[uid]] || 0) + 1;
    });
    const deploying = {}, reserved = {};
    const room = (sid) => P.CAPACITY - P.cardsIn(g, sid) + (leaving[sid] || 0) - (arriving[sid] || 0) - (deploying[sid] || 0);
    let energy = me.energy;
    const turnsLeft = Math.max(1, P.CLOCK - g.turn);
    const wantCols = 2 + Math.round(pers.expand * 3);
    let podsOut = myUnits.filter((u) => P.def(u).settler).length;
    const handLeft = me.hand.slice();

    function value(id, sid) {
      const d = PC[id];
      const col = sid != null ? P.colonyAt(g, sid) : null;
      const need = col ? (needOf[col.uid] || 0) : 0;
      switch (d.type) {
        case 'unit':
          if (room(sid) < 1) return -1;
          if (d.settler) return myCols.length + podsOut < wantCols && podsOut < 1 && g.turn <= P.CLOCK - 5 ? 9 : -1;
          if (d.former) return myUnits.some((u) => P.def(u).former) ? 0.3 : 2.5;
          if (d.probe) return 1.5 + pers.aggression;
          return cardPower(d) * (need > 0 ? 1.6 : 0.7 + pers.aggression * 0.5) + (d.init >= 4 ? 1 : 0);
        case 'structure':
          if (room(sid) < 1) return -1;
          return need > 0 ? 6 : 1;
        case 'building':
        case 'populace': {
          if (!d.slots && P.freeSlots(col) - (reserved[col.uid] || 0) < 1) return -1;
          let v = ((d.energy || 0) * 1.2 + (d.research || 0) * (0.6 + pers.science)) * Math.min(1, turnsLeft / 8) * 2.5;
          if (d.slots) v = P.freeSlots(col) <= 1 ? 4 : 0.5;
          if (d.hp) v = need > 0 ? 6 : 1.5 + (col.capital ? 1 : 0);
          if (d.heals) v = col.attached.includes('drone') ? 3 : 1;
          return v + (col.capital ? 0.3 : 0);
        }
        case 'event':
          if (id === 'requisition') return handLeft.length <= 3 ? 3.5 : 1;
          if (id === 'orbital_strike') {
            return P.unitsAt(g, sid).filter((u) => u.owner !== pid).reduce((a, u) => a + Math.min(3, u.hp) / P.def(u).hp * P.def(u).cost, 0) * 1.2;
          }
          if (id === 'incite_riots') return col && P.freeSlots(col) > 0 && !col.attached.some((x) => PC[x].noDrones) ? 3 : -1;
          if (id === 'hostile_takeover') return col && !col.capital && !P.unitsAt(g, sid).some((u) => u.owner === col.owner) ? 14 : -1;
          if (id === 'fungal_bloom') {
            const foes = P.unitsAt(g, sid).filter((u) => u.owner !== pid).length;
            return g.sectors[sid].terrain !== 'fungus' && foes && !P.colonyAt(g, sid) ? 1 + foes : -1;
          }
          return -1;
        default:
          return -1;
      }
    }

    for (let guard = 0; guard < 10; guard++) {
      let best = null;
      handLeft.forEach((h) => {
        const d = PC[h.id];
        if (d.cost > energy) return;
        const targets = P.playTargets(g, pid, h.id);
        (targets === null ? [null] : targets).forEach((sid) => {
          const v = value(h.id, sid);
          if (v <= 0) return;
          const score = (v + r() * 0.5) / (d.cost + 1.5);
          if (!best || score > best.score) best = { h, sid, score };
        });
      });
      if (!best || best.score < 0.35) break;
      const d = PC[best.h.id];
      out.plays.push({ hand: best.h.uid, sector: best.sid });
      handLeft.splice(handLeft.indexOf(best.h), 1);
      energy -= d.cost;
      if (d.type === 'unit' || d.type === 'structure') deploying[best.sid] = (deploying[best.sid] || 0) + 1;
      if (d.type === 'building' || d.type === 'populace') {
        const c = P.colonyAt(g, best.sid);
        reserved[c.uid] = (reserved[c.uid] || 0) + 1;
      }
      if (d.settler) podsOut++;
    }

    // ---- scrap cards that are dead weight when the hand is about to overflow
    const bestValue = (h) => {
      const targets = P.playTargets(g, pid, h.id);
      return Math.max(-1, ...(targets === null ? [null] : targets).map((sid) => value(h.id, sid)));
    };
    const spare = handLeft.map((h) => ({ h, v: bestValue(h) })).sort((a, b) => a.v - b.v);
    while (spare.length && handLeft.length > P.HAND_MAX - P.DRAW && spare[0].v <= 0.5) {
      const { h } = spare.shift();
      out.scrap.push(h.uid);
      handLeft.splice(handLeft.indexOf(h), 1);
    }
    return out;
  };

  V.PlanetAI = PA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
