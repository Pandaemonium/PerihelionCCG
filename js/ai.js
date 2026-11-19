/* VEYRA — AI opponent. Greedy one-step look-ahead: try every legal action on a cloned
 * game, keep the one that improves the board evaluation the most, repeat until nothing helps. */
(function (root) {
  'use strict';
  const V = (root.Veyra = root.Veyra || {});
  const E = V.Engine;
  const CARDS = V.CARDS;
  const FACTIONS = V.FACTIONS;

  const AI = {};

  function unitValue(u) {
    const d = CARDS[u.id];
    let v = u.atk * 1.1 + u.hp * 0.9;
    if (u.structure) v = 1 + u.hp * 0.5;
    if (u.kw.guard) v += 0.6 + u.hp * 0.15;
    if (u.kw.shield) v += 1 + u.atk * 0.25;
    if (u.kw.venom) v += 2;
    if (u.kw.siphon) v += u.atk * 0.3;
    if (u.kw.aerial) v += u.atk * 0.3;
    return v + (d.aiValue || 0);
  }

  function hpValue(p) {
    const h = p.hp + p.armor;
    return h <= 0 ? -1000 : 5.5 * Math.sqrt(h);
  }

  AI.score = function (g, pid) {
    const me = g.players[pid];
    const foe = g.players[1 - pid];
    if (g.over) return g.winner === pid ? 100000 : g.winner === -1 ? -500 : -100000;
    let s = hpValue(me) - hpValue(foe);
    me.board.forEach((u) => { s += unitValue(u); });
    foe.board.forEach((u) => { s -= unitValue(u) * 1.15; });
    s += me.hand.length * 0.7 + me.research * 0.35 + me.energy * 0.05;
    return s;
  };

  AI.legalActions = function (g, pid) {
    const out = [];
    const p = g.players[pid];
    if (g.over || g.active !== pid) return out;
    const seen = {};
    p.hand.forEach((hc) => {
      if (!E.canPlay(g, pid, hc)) return;
      const key = hc.id + ':' + hc.cost;
      if (seen[key]) return;
      seen[key] = true;
      const ts = E.cardTargets(g, pid, CARDS[hc.id]);
      if (ts && ts.length) ts.forEach((t) => out.push({ type: 'play', hand: hc.uid, id: hc.id, target: t }));
      else out.push({ type: 'play', hand: hc.uid, id: hc.id, target: null });
    });
    p.board.forEach((u) => {
      E.attackTargets(g, u).forEach((t) => out.push({ type: 'attack', uid: u.uid, target: t }));
    });
    if (E.canUsePower(g, pid)) {
      const pw = FACTIONS[p.faction].power;
      const ts = E.targets(g, pid, pw.target);
      if (ts) ts.forEach((t) => out.push({ type: 'power', target: t }));
      else out.push({ type: 'power', target: null });
    }
    return out;
  };

  AI.apply = function (g, pid, a) {
    if (a.type === 'play') return E.playCard(g, pid, a.hand, a.target);
    if (a.type === 'attack') return E.attack(g, pid, a.uid, a.target);
    if (a.type === 'power') return E.usePower(g, pid, a.target);
    if (a.type === 'end') return E.endTurn(g, pid);
    return false;
  };

  /** Returns the next action to take, or null when the turn should end. */
  AI.choose = function (g, pid) {
    const actions = AI.legalActions(g, pid);
    if (!actions.length) return null;
    const foe = g.players[1 - pid];

    // Lethal check: if the damage that can reach the enemy colony finishes it, go face.
    const face = actions.filter((a) => a.type === 'attack' && a.target.k === 'l');
    const reach = face.reduce((n, a) => n + E.find(g, a.uid).unit.atk, 0);
    if (face.length && reach >= foe.hp + foe.armor) return face[0];

    const base = AI.score(g, pid);
    let best = null;
    let bestScore = base + 0.15;
    actions.forEach((a) => {
      // Random effects get a few samples so one lucky roll does not decide the play.
      const d = a.type === 'play' ? CARDS[a.id] : null;
      const samples = a.type === 'attack' || (d && d.type === 'unit' && !d.deploy) ? 1 : 3;
      let total = 0;
      for (let i = 0; i < samples; i++) {
        const c = E.clone(g);
        AI.apply(c, pid, a);
        total += AI.score(c, pid);
      }
      const s = total / samples;
      if (s > bestScore) { bestScore = s; best = a; }
    });
    if (best) return best;

    // Reserve Cells look worthless to the evaluator; spend one if it unlocks a play.
    const p = g.players[pid];
    const cell = p.hand.find((h) => h.id === 'cell');
    if (cell) {
      const cells = p.hand.filter((h) => h.id === 'cell').length;
      const unlock = p.hand.some((h) => h.id !== 'cell' && h.cost > p.energy && h.cost <= p.energy + cells);
      if (unlock) return { type: 'play', hand: cell.uid, id: 'cell', target: null };
    }
    return null;
  };

  V.AI = AI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
