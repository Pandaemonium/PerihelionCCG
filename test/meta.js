/* Meta report: every preset deck against every other, with the AI playing both sides.
 * This is the check for the targets in design/content-approach.md.
 *
 *   node test/meta.js [gamesPerPairing=40] [seed=1]     round robin of all presets
 *   …  --only synod,auric.overcharge                    only decks whose key (faction.preset) contains one of these
 *   …  --focus cinder.crusade,ironwake                  every deck is in the run, but only the pairings that involve
 *                                                       one of these are played: a quick read on one deck
 *   …  --cards                                          list every card of every deck, not just the extremes
 *   …  --tune key=value[,key=value]                     both sides play with these AI.TUNE values
 *   …  --ab key=value[,key=value]                       A/B: an AI with these values pilots each deck against the
 *                                                       baseline AI piloting each deck (mirror matches included)
 *   …  --plan faction.preset:path=n[,path=n]            trial of a change to one deck's game plan: that deck plays
 *                                                       every other deck, half the games with the changed plan.
 *                                                       Paths are weights.<AI.TUNE key>, hold.<card id>, value.<card id>,
 *                                                       e.g. --plan synod.transcend:weights.research=0.8
 *   …  --doctrines all | power,market                   price doctrines: each deck plays every deck with each of
 *                                                       these doctrines in turn, against opponents on Frontier,
 *                                                       and the report shows what each adds over Frontier
 *   …  --json out.json                                  save the raw counts instead of printing
 *   node test/meta.js --merge a.json b.json …           combine saved runs into one report
 *   …  --jobs n                                         worker threads (default: all cores but two)
 *   PATCH=trial.js node test/meta.js …                  try a change without editing the game: trial.js exports a
 *                                                       function (TauCeti) that alters cards, presets or rule
 *                                                       constants, and is applied before any game is played
 *   NO_MULLIGAN=1 node test/meta.js …                   play without the opening mulligan, to measure what it does
 *
 * Every game opens with the mulligan, each side choosing by the AI's rule (AI.mulligan). In an --ab run the
 * variant's mulligan setting applies to its own seat, so `--ab mulligan=0` prices the keep rule itself.
 *
 * What it prints
 *   decks      overall win rate of each preset (target 45–55%), how its games end and how long they run
 *   matchups   the full deck-against-deck table, and every pairing past 65/35
 *   keystones  for cards named in a preset's plan: how often the deck has seen one by its fifth turn
 *   cards      "drawn gap": a deck's win rate in games where it had seen the card by its fifth turn, minus its
 *              win rate in games where it had not. A big gap means the game turns on drawing that card.
 *              Cheap cards read high and dear ones low, because a cheap card can be played by turn five and a
 *              dear one sits in hand, so the report also prints the average gap at each cost to compare with.
 *
 * Limits: the AI plays both sides, so decks it pilots badly read weaker than they are. A matchup needs a few
 * hundred games before its figure means much: at 40 games a pairing the margin is ±15 points.
 */
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const fs = require('fs');
require('../js/world.js');
require('../js/cards.js');
require('../js/design.js');
require('../js/engine.js');
require('../js/ai.js');
const V = globalThis.TauCeti;
const { Engine: E, AI, FACTIONS, CARDS, DOCTRINES } = V;
const { checkState } = require('./invariants.js');
// a trial change to cards, presets or rules; the worker threads load this file too, so they apply it as well
if (process.env.PATCH) require(require('path').resolve(process.env.PATCH))(V);

const TARGET = { lo: 0.45, hi: 0.55, matchup: 0.65, cardGap: 0.10, keystone: 0.75, turn: 5 };
const BIOME = process.env.BIOME || 'tau_ceti';

/* ------------------------------------------------------------ decks */
function allDecks(only) {
  const out = [];
  Object.keys(FACTIONS).forEach((f) => Object.keys(FACTIONS[f].presets).forEach((k) => {
    const p = FACTIONS[f].presets[k];
    const count = {};
    V.expandPreset(p.cards).forEach((id) => { count[id] = (count[id] || 0) + 1; });
    out.push({
      key: f + '.' + k, faction: f, preset: k, name: p.name, doctrine: p.doctrine || 'standard', pact: p.pact || null,
      count, keystones: (p.plan && p.plan.keystones) || [],
    });
  }));
  return only && only.length ? out.filter((d) => only.some((s) => d.key.includes(s))) : out;
}

function parseTune(str) {
  const T = Object.assign({}, AI.TUNE);
  (str || '').split(',').filter(Boolean).forEach((kv) => {
    const [k, v] = kv.split('=');
    if (!(k in T)) throw new Error('unknown AI.TUNE key: ' + k);
    T[k] = parseFloat(v);
  });
  return T;
}

/* ------------------------------------------------------------ one game */
/** Copies of each card of its starting deck that player p has drawn so far. */
function seenSoFar(deck, p) {
  const left = {};
  p.deck.forEach((id) => { left[id] = (left[id] || 0) + 1; });
  const seen = {};
  Object.keys(deck.count).forEach((id) => { seen[id] = Math.max(0, deck.count[id] - (left[id] || 0)); });
  return seen;
}

/**
 * A trial plan for one deck, written as "faction.preset:path=number,path=number", for example
 * "synod.transcend:weights.research=0.8,value.voice_of_tau_ceti=4". The changes go on top of the preset's own plan.
 */
function parsePlan(str) {
  const cut = str.indexOf(':');
  const key = str.slice(0, cut), [f, k] = key.split('.');
  const pre = FACTIONS[f] && FACTIONS[f].presets[k];
  if (cut < 0 || !pre) throw new Error('--plan wants faction.preset:path=number[,path=number], got ' + str);
  const plan = JSON.parse(JSON.stringify(pre.plan || {}));
  str.slice(cut + 1).split(',').filter(Boolean).forEach((kv) => {
    const [path, v] = kv.split('='), [field, name] = path.split('.');
    if (!['weights', 'hold', 'value'].includes(field) || !name || Number.isNaN(parseFloat(v))) throw new Error('bad plan change: ' + kv);
    if (field === 'weights' ? !(name in AI.TUNE) : !CARDS[name]) throw new Error('unknown name in plan change: ' + kv);
    (plan[field] = plan[field] || {})[name] = parseFloat(v);
  });
  return { key, plan };
}

function playGame(d0, d1, seed, first, tunes, problems, plans) {
  const decks = [d0, d1];
  const g = E.newGame(d0.faction, d1.faction, seed, first, {
    biome: BIOME, preset0: d0.preset, preset1: d1.preset, pact0: d0.pact, pact1: d1.pact, doctrine0: d0.doctrine, doctrine1: d1.doctrine,
    plan0: plans && plans[0], plan1: plans && plans[1], mulligan: !process.env.NO_MULLIGAN,
  });
  AI.mulligan(g, tunes);
  const report = (m) => { if (problems.length < 20) problems.push(m); };
  const own = [0, 0], seen = [null, null];
  let steps = 0;
  while (!g.over && g.turn < 160) {
    const pid = g.active;
    own[pid]++;
    let acts = 0;
    for (;;) {
      const act = AI.choose(g, pid, tunes[pid]);
      if (!act || acts++ > 80) break;
      if (!AI.apply(g, pid, act)) { report('AI chose an illegal action ' + JSON.stringify(act)); break; }
      if (g.over || ++steps > 8000) break;
    }
    if (own[pid] === TARGET.turn) seen[pid] = seenSoFar(decks[pid], g.players[pid]);
    if (!g.over) E.endTurn(g, pid);
    g.events.length = 0;
  }
  [0, 1].forEach((pid) => { if (!seen[pid]) seen[pid] = seenSoFar(decks[pid], g.players[pid]); });
  checkState(g, 'end of game', report);
  if (!g.over) report(`game did not finish: ${d0.key} v ${d1.key} seed ${seed}`);
  return { g, seen };
}

/* ------------------------------------------------------------ one pairing */
const emptySide = () => ({ ascent: 0, conquest: 0, wonTurns: 0, razed: 0, research: 0, cards: {} });
function runPair(job, decks, opts, problems) {
  const d = [decks[job.i], decks[job.j]];
  const base = parseTune(opts.tune), variant = opts.ab ? parseTune((opts.tune ? opts.tune + ',' : '') + opts.ab) : null;
  const r = { i: job.i, j: job.j, n: 0, w: [0, 0], first: 0, decided: 0, turns: 0, side: [emptySide(), emptySide()], vg: [0, 0], vw: [0, 0] };
  // --plan: the trial plan's deck plays half its games with the trial plan and half with its own, the opponent
  // unchanged. In its mirror match one seat has the trial plan and the other does not.
  if (opts.doctrines) {
    // --doctrines: deck i with each doctrine in turn against deck j on Frontier, the same seeds for each doctrine
    r.doc = {};
    opts.doctrines.forEach((id) => {
      const t = r.doc[id] = [0, 0]; // games, wins for deck i
      const mine = Object.assign({}, d[0], { doctrine: id }), theirs = Object.assign({}, d[1], { doctrine: 'standard' });
      for (let n = 0; n < opts.games; n++) {
        const seed = (Math.imul(opts.seed, 1000003) + job.i * 7919 + job.j * 104729 + n * 1299709) | 0 || 1;
        const { g } = playGame(mine, theirs, seed, n % 2, [base, base], problems, null);
        if (!g.over) continue;
        t[0]++; t[1] += g.winner === 0 ? 1 : g.winner === -1 ? 0.5 : 0;
      }
    });
    return r;
  }
  const trial = opts.plan ? parsePlan(opts.plan) : null;
  const mirror = job.i === job.j;
  const tSeat = trial ? (d[0].key === trial.key ? 0 : 1) : -1;
  if (trial) r.trial = { on: [0, 0], off: [0, 0], mirror: [0, 0] }; // [games, wins]
  for (let n = 0; n < opts.games; n++) {
    const seed = (Math.imul(opts.seed, 1000003) + job.i * 7919 + job.j * 104729 + n * 1299709) | 0 || 1;
    const first = variant || trial ? (n >> 1) % 2 : n % 2;
    const vSide = variant ? n % 2 : -1; // which seat the variant AI takes
    const seat = trial ? (mirror ? n % 2 : tSeat) : -1; // which seat the trial plan's deck is in
    const useTrial = trial && (mirror || n % 2 === 0);
    const plans = useTrial ? [seat === 0 ? trial.plan : null, seat === 1 ? trial.plan : null] : null;
    const { g, seen } = playGame(d[0], d[1], seed, first, [vSide === 0 ? variant : base, vSide === 1 ? variant : base], problems, plans);
    if (!g.over) continue;
    r.n++;
    r.turns += g.turn;
    const won = [0, 1].map((s) => (g.winner === s ? 1 : g.winner === -1 ? 0.5 : 0));
    if (g.winner !== -1) { r.decided++; if (g.winner === first) r.first++; }
    if (variant) { r.vg[vSide]++; r.vw[vSide] += won[vSide]; }
    if (trial) { const t = r.trial[mirror ? 'mirror' : useTrial ? 'on' : 'off']; t[0]++; t[1] += won[seat]; }
    [0, 1].forEach((s) => {
      r.w[s] += won[s];
      const x = r.side[s], p = g.players[s];
      if (g.winner === s) { x[g.winReason === 'ascent' ? 'ascent' : 'conquest']++; x.wonTurns += Math.ceil(g.turn / 2); }
      x.razed += p.razed;
      x.research += p.research;
      Object.keys(d[s].count).forEach((id) => {
        const c = x.cards[id] || (x.cards[id] = [0, 0, 0, 0]); // seen games, seen wins, unseen games, unseen wins
        if (seen[s][id] > 0) { c[0]++; c[1] += won[s]; } else { c[2]++; c[3] += won[s]; }
      });
      // a deck's keystones count as found if it has seen any one of them
      if (d[s].keystones.length) {
        const c = x.cards['*keystone'] || (x.cards['*keystone'] = [0, 0, 0, 0]);
        if (d[s].keystones.some((id) => seen[s][id] > 0)) { c[0]++; c[1] += won[s]; } else { c[2]++; c[3] += won[s]; }
      }
    });
  }
  return r;
}

/* ------------------------------------------------------------ worker */
if (!isMainThread) {
  const { jobs, opts } = workerData;
  const decks = allDecks(opts.only);
  const problems = [];
  jobs.forEach((job) => parentPort.postMessage({ result: runPair(job, decks, opts, problems) }));
  parentPort.postMessage({ done: true, problems });
  return;
}

/* ------------------------------------------------------------ reports */
const pct = (x, d) => (100 * x).toFixed(d == null ? 1 : d);
const signed = (x, d) => (x >= 0 ? '+' : '') + pct(x, d);
const margin = (p, n) => (n ? 1.96 * Math.sqrt(Math.max(p * (1 - p), 0.01) / n) : 1);

function mergeRuns(list) {
  const out = { decks: list[0].decks, opts: Object.assign({}, list[0].opts, { games: 0 }), pairs: [], problems: [] };
  const at = {};
  list.forEach((run) => {
    if (run.decks.join() !== out.decks.join() || run.opts.ab !== out.opts.ab || run.opts.plan !== out.opts.plan || !!run.opts.doctrines !== !!out.opts.doctrines) throw new Error('cannot merge runs over different decks or modes');
    out.opts.games += run.opts.games;
    out.problems = out.problems.concat(run.problems || []);
    run.pairs.forEach((r) => {
      const k = r.i + ':' + r.j;
      if (!at[k]) { at[k] = JSON.parse(JSON.stringify(r)); out.pairs.push(at[k]); return; }
      const t = at[k];
      ['n', 'first', 'decided', 'turns'].forEach((f) => { t[f] += r[f]; });
      if (r.trial) Object.keys(r.trial).forEach((k) => { t.trial[k][0] += r.trial[k][0]; t.trial[k][1] += r.trial[k][1]; });
      if (r.doc) Object.keys(r.doc).forEach((k) => { t.doc[k][0] += r.doc[k][0]; t.doc[k][1] += r.doc[k][1]; });
      [0, 1].forEach((s) => {
        t.w[s] += r.w[s]; t.vg[s] += r.vg[s]; t.vw[s] += r.vw[s];
        ['ascent', 'conquest', 'wonTurns', 'razed', 'research'].forEach((f) => { t.side[s][f] += r.side[s][f]; });
        Object.keys(r.side[s].cards).forEach((id) => {
          const c = t.side[s].cards[id] || (t.side[s].cards[id] = [0, 0, 0, 0]);
          r.side[s].cards[id].forEach((v, x) => { c[x] += v; });
        });
      });
    });
  });
  return out;
}

/** Fold the pairings into one record per deck. */
function perDeck(run, decks) {
  const D = decks.map((d) => ({ d, g: 0, w: 0, ascent: 0, conquest: 0, wonTurns: 0, razed: 0, research: 0, cards: {}, vs: {}, vg: 0, vw: 0, bg: 0, bw: 0 }));
  run.pairs.forEach((r) => {
    [0, 1].forEach((s) => {
      const me = D[s ? r.j : r.i], other = s ? r.i : r.j, x = r.side[s];
      me.g += r.n; me.w += r.w[s];
      ['ascent', 'conquest', 'wonTurns', 'razed', 'research'].forEach((f) => { me[f] += x[f]; });
      me.vs[other] = { n: r.n, w: r.w[s] };
      Object.keys(x.cards).forEach((id) => {
        const c = me.cards[id] || (me.cards[id] = [0, 0, 0, 0]);
        x.cards[id].forEach((v, k) => { c[k] += v; });
      });
      // A/B: games this deck was piloted by the variant, and games it was piloted by the baseline against the variant
      me.vg += r.vg[s]; me.vw += r.vw[s];
      me.bg += r.vg[1 - s]; me.bw += r.vg[1 - s] - r.vw[1 - s];
    });
  });
  return D;
}

const gapOf = (c) => {
  if (!c[0] || !c[2]) return null;
  return { gap: c[1] / c[0] - c[3] / c[2], se: Math.sqrt(0.25 / c[0] + 0.25 / c[2]), seen: c[0] / (c[0] + c[2]), n: c[0] + c[2] };
};

function printRoundRobin(run, decks) {
  const D = perDeck(run, decks).sort((a, b) => b.w / b.g - a.w / a.g);
  const games = run.pairs.reduce((n, r) => n + r.n, 0);
  const decided = run.pairs.reduce((n, r) => n + r.decided, 0), firstWins = run.pairs.reduce((n, r) => n + r.first, 0);
  const turns = run.pairs.reduce((n, r) => n + r.turns, 0);
  console.log(`${games} games on ${BIOME}: ${decks.length} decks, ${run.opts.games} games a pairing${run.opts.tune ? ', AI ' + run.opts.tune : ''}`);
  console.log(`first player won ${pct(firstWins / Math.max(1, decided))}% (±${pct(margin(0.5, decided))}); a game lasts ${(turns / games / 2).toFixed(1)} turns a side`);

  console.log(`\nDecks (target ${pct(TARGET.lo, 0)}–${pct(TARGET.hi, 0)}%)`);
  console.log('   win%    ±   deck                               doctrine    wins by Ascent  turns to win  razed  research');
  let outside = 0;
  const focus = run.opts.focus;
  // with --focus the other decks have only played the focus decks, so their overall figure means nothing
  const shown = focus ? D.filter((x) => focus.some((s) => x.d.key.includes(s))) : D;
  shown.forEach((x) => {
    const p = x.w / x.g, m = margin(p, x.g), wins = x.ascent + x.conquest;
    const flag = p > TARGET.hi ? 'HIGH' : p < TARGET.lo ? 'LOW ' : '    ';
    if (flag.trim()) outside++;
    console.log(`  ${pct(p).padStart(5)}  ${pct(m).padStart(4)}  ${flag} ${(x.d.name + ' (' + x.d.key + ')').padEnd(46).slice(0, 46)} ${x.d.doctrine.padEnd(10)}`
      + ` ${(wins ? pct(x.ascent / wins, 0) : '-').padStart(8)}%  ${(wins ? (x.wonTurns / wins).toFixed(1) : '-').padStart(12)}  ${(x.razed / x.g).toFixed(1).padStart(5)}  ${(x.research / x.g).toFixed(1).padStart(8)}`);
  });
  console.log(focus ? `  only pairings with ${focus.join(', ')} were played` : `  ${outside} of ${D.length} decks outside the target range`);

  // matchup table, rows and columns in the order above
  const idx = D.map((x) => decks.indexOf(x.d));
  console.log('\nMatchups: row deck\'s win % against column deck (! = past ' + pct(TARGET.matchup, 0) + '/' + pct(1 - TARGET.matchup, 0) + ')');
  console.log('      ' + D.map((_, k) => String(k + 1).padStart(4)).join(''));
  D.forEach((x, r) => {
    const cells = idx.map((o, c) => {
      if (c === r) return '   ·';
      const v = x.vs[o];
      if (!v || !v.n) return '    ';
      const p = v.w / v.n;
      return (pct(p, 0) + (Math.abs(p - 0.5) > TARGET.matchup - 0.5 ? '!' : ' ')).padStart(4);
    });
    console.log(`  ${String(r + 1).padStart(2)}  ${cells.join('')}   ${x.d.name}`);
  });
  const lop = [];
  run.pairs.forEach((r) => {
    if (!r.n) return;
    const p = r.w[0] / r.n;
    if (Math.abs(p - 0.5) <= TARGET.matchup - 0.5) return;
    const [a, b, q] = p > 0.5 ? [decks[r.i], decks[r.j], p] : [decks[r.j], decks[r.i], 1 - p];
    lop.push({ a, b, q, m: margin(q, r.n), n: r.n });
  });
  lop.sort((x, y) => y.q - x.q);
  console.log(`\n${lop.length} of ${run.pairs.length} matchups past ${pct(TARGET.matchup, 0)}/${pct(1 - TARGET.matchup, 0)}` + (lop.length ? ' ("sure" = still past it at the low end of the margin)' : ''));
  lop.forEach((x) => console.log(`  ${pct(x.q).padStart(5)}% ±${pct(x.m).padStart(4)}  ${x.q - x.m > TARGET.matchup ? 'sure ' : '     '} ${x.a.name} beats ${x.b.name}`));

  // keystones
  const withKeys = D.filter((x) => x.d.keystones.length);
  if (withKeys.length) {
    console.log(`\nKeystones (target: seen by turn ${TARGET.turn} in ${pct(TARGET.keystone, 0)}% of games)`);
    withKeys.forEach((x) => {
      const k = gapOf(x.cards['*keystone'] || [0, 0, 0, 0]);
      const each = x.d.keystones.map((id) => { const c = x.cards[id]; return CARDS[id].name + ' ' + (c ? pct(c[0] / (c[0] + c[2]), 0) : '?') + '%'; }).join(', ');
      console.log(`  ${x.d.name.padEnd(24)} any seen ${k ? pct(k.seen, 0).padStart(3) : '  ?'}%   win rate ${k ? signed(k.gap) : '?'} when seen (±${k ? pct(1.96 * k.se) : '?'})   ${each}`);
    });
  }

  // cards: per deck, then pooled across the decks that run the card
  const rows = [];
  D.forEach((x) => Object.keys(x.cards).forEach((id) => {
    if (id[0] === '*') return;
    const k = gapOf(x.cards[id]);
    if (k) rows.push(Object.assign({ id, deck: x.d, key: x.d.keystones.includes(id) }, k));
  }));
  const line = (r) => `  ${signed(r.gap).padStart(6)} ±${pct(1.96 * r.se).padStart(4)}  ${(CARDS[r.id].name + ' (' + CARDS[r.id].cost + ')').padEnd(30)} ${r.deck.name.padEnd(24)} seen in ${pct(r.seen, 0).padStart(3)}%${r.key ? '  keystone' : ''}`;
  const big = rows.filter((r) => Math.abs(r.gap) > TARGET.cardGap && Math.abs(r.gap) > 1.96 * r.se && !r.key).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  console.log(`\nCards: win rate when the deck has seen the card by turn ${TARGET.turn}, minus when it has not`);
  // a cheap card is playable by then and a dear one is not, so read a card's gap against others of its cost
  const byCost = {};
  rows.forEach((r) => { const c = Math.min(7, CARDS[r.id].cost); (byCost[c] = byCost[c] || []).push(r.gap); });
  console.log('average gap by Energy cost: ' + Object.keys(byCost).map((c) => `${c}${c === '7' ? '+' : ''}: ${signed(byCost[c].reduce((a, b) => a + b, 0) / byCost[c].length)}`).join('   '));
  console.log(`${big.length} non-keystone cards with a gap over ${pct(TARGET.cardGap, 0)} points and outside the margin`);
  big.forEach((r) => console.log(line(r)));
  if (run.optsCards) {
    D.forEach((x) => {
      console.log(`\n${x.d.name}`);
      rows.filter((r) => r.deck === x.d).sort((a, b) => b.gap - a.gap).forEach((r) => console.log(line(r)));
    });
  } else if (!big.length) {
    const sorted = rows.slice().sort((a, b) => b.gap - a.gap);
    console.log('Largest gaps'); sorted.slice(0, 8).forEach((r) => console.log(line(r)));
    console.log('Smallest gaps'); sorted.slice(-8).reverse().forEach((r) => console.log(line(r)));
  }
}

function printAB(run, decks) {
  const D = perDeck(run, decks);
  const vg = D.reduce((n, x) => n + x.vg, 0), vw = D.reduce((n, x) => n + x.vw, 0);
  const p = vw / vg;
  console.log(`A/B on ${BIOME}: AI with ${run.opts.ab} against ${run.opts.tune ? 'AI with ' + run.opts.tune : 'the baseline AI'}, ${decks.length} decks, ${run.opts.games} games a pairing`);
  console.log(`variant won ${pct(p)}% of ${vg} games (±${pct(margin(p, vg))})`);
  console.log('\n  variant   baseline   pilot                                  mirror');
  console.log('  piloting  piloting   gain   deck                            match');
  D.map((x) => ({ x, v: x.vw / x.vg, b: x.bw / x.bg })).sort((a, b) => (b.v - b.b) - (a.v - a.b)).forEach(({ x, v, b }) => {
    const mir = run.pairs.find((r) => r.i === r.j && decks[r.i] === x.d);
    const mp = mir && mir.vg[0] + mir.vg[1] ? (mir.vw[0] + mir.vw[1]) / (mir.vg[0] + mir.vg[1]) : null;
    console.log(`  ${pct(v).padStart(6)}%  ${pct(b).padStart(7)}%  ${signed(v - b).padStart(6)}   ${x.d.name.padEnd(30)}  ${mp == null ? '' : pct(mp, 0) + '%'}`);
  });
  console.log(`  (each figure ±${pct(margin(0.5, D[0].vg))}; pilot gain = how much better the deck does with the variant AI at the controls)`);
}

function printPlan(run) {
  const t = { on: [0, 0], off: [0, 0], mirror: [0, 0] };
  run.pairs.forEach((r) => Object.keys(t).forEach((k) => { t[k][0] += r.trial[k][0]; t[k][1] += r.trial[k][1]; }));
  const on = t.on[1] / t.on[0], off = t.off[1] / t.off[0];
  const m = 1.96 * Math.sqrt(0.25 / t.on[0] + 0.25 / t.off[0]);
  const { key, plan } = parsePlan(run.opts.plan);
  console.log(`Plan trial for ${key} on ${BIOME}: ${JSON.stringify(plan)}`);
  console.log(`  with the trial plan   ${pct(on)}% of ${t.on[0]} games against the other decks`);
  console.log(`  with its own plan     ${pct(off)}% of ${t.off[0]} games`);
  console.log(`  gain ${signed(on - off)} points (±${pct(m)})`);
  if (t.mirror[0]) console.log(`  mirror match: the trial plan won ${pct(t.mirror[1] / t.mirror[0])}% of ${t.mirror[0]} (±${pct(margin(0.5, t.mirror[0]))})`);
}

function printDoctrines(run, decks) {
  const ids = run.opts.doctrines.filter((id) => id !== 'standard');
  const sum = () => { const o = {}; run.opts.doctrines.forEach((id) => { o[id] = [0, 0]; }); return o; };
  const per = decks.map(sum), all = sum();
  run.pairs.forEach((r) => Object.keys(r.doc).forEach((id) => {
    [per[r.i][id], all[id]].forEach((t) => { t[0] += r.doc[id][0]; t[1] += r.doc[id][1]; });
  }));
  const rate = (t) => t[1] / Math.max(1, t[0]);
  const n1 = per[0].standard[0];
  console.log(`Doctrine values on ${BIOME}: ${decks.length} decks, ${run.opts.games} games a pairing and doctrine`);
  console.log('Each figure is the win rate of the deck with that doctrine minus its win rate on Frontier, both against every deck on Frontier.');
  console.log(`A deck's figure is good to about ±${pct(1.96 * Math.sqrt(0.5 / n1))} points and the average to ±${pct(1.96 * Math.sqrt(0.5 / all.standard[0]))}. * marks the doctrine the preset uses.`);
  console.log();
  console.log('  ' + 'deck'.padEnd(26) + 'Frontier' + ids.map((id) => DOCTRINES[id].name.padStart(14)).join(''));
  decks.forEach((d, i) => {
    const base = rate(per[i].standard);
    console.log('  ' + d.name.padEnd(26) + (pct(base) + '%').padStart(8) + ids.map((id) => (signed(rate(per[i][id]) - base) + (d.doctrine === id ? '*' : ' ')).padStart(14)).join(''));
  });
  console.log('  ' + 'average'.padEnd(26) + (pct(rate(all.standard)) + '%').padStart(8) + ids.map((id) => (signed(rate(all[id]) - rate(all.standard)) + ' ').padStart(14)).join(''));
}

/* ------------------------------------------------------------ main */
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const valued = ['--only', '--focus', '--doctrines', '--tune', '--ab', '--plan', '--json', '--jobs'];
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && valued.includes(args[i - 1])) && !a.endsWith('.json'));

function finish(run) {
  const decks = allDecks(run.opts.only);
  if (decks.map((d) => d.key).join() !== run.decks.join()) throw new Error('the saved run was made with a different set of decks');
  run.optsCards = flag('--cards');
  if (run.opts.doctrines) printDoctrines(run, decks); else if (run.opts.plan) printPlan(run); else if (run.opts.ab) printAB(run, decks); else printRoundRobin(run, decks);
  if (run.problems.length) { console.log(`\n${run.problems.length} PROBLEMS`); run.problems.slice(0, 20).forEach((m) => console.log('  ' + m)); }
  process.exit(run.problems.length ? 1 : 0);
}

if (flag('--merge')) {
  finish(mergeRuns(args.filter((a) => a.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))));
} else {
  const opts = {
    games: parseInt(positional[0] || '40', 10), seed: parseInt(positional[1] || '1', 10),
    only: opt('--only') ? opt('--only').split(',') : null, focus: opt('--focus') ? opt('--focus').split(',') : null, tune: opt('--tune') || '', ab: opt('--ab') || '', plan: opt('--plan') || '',
    doctrines: opt('--doctrines') ? (opt('--doctrines') === 'all' ? Object.keys(DOCTRINES) : ['standard'].concat(opt('--doctrines').split(',').filter((id) => id !== 'standard'))) : null,
  };
  const badDoc = (opts.doctrines || []).find((id) => !DOCTRINES[id]);
  if (badDoc) { console.error('unknown doctrine: ' + badDoc); process.exit(1); }
  try { parseTune(opts.tune); parseTune(opts.ab); if (opts.plan) parsePlan(opts.plan); } catch (e) { console.error(e.message); process.exit(1); } // fail early on a bad key
  const decks = allDecks(opts.only);
  if (decks.length < 2) { console.error('need at least two decks'); process.exit(1); }
  const trialAt = opts.plan ? decks.findIndex((d) => d.key === parsePlan(opts.plan).key) : -1;
  if (opts.plan && (trialAt < 0 || opts.ab)) { console.error('--plan needs a deck that is in the run, and cannot be combined with --ab'); process.exit(1); }
  if (opts.doctrines && (opts.plan || opts.ab)) { console.error('--doctrines cannot be combined with --plan or --ab'); process.exit(1); }
  const inFocus = (d) => !opts.focus || opts.focus.some((s) => d.key.includes(s));
  const jobs = [];
  decks.forEach((_, i) => decks.forEach((__, j) => {
    if (!inFocus(decks[i]) && !inFocus(decks[j])) return;
    if (opts.doctrines) { if (inFocus(decks[i])) jobs.push({ i, j }); return; } // every ordered pairing, mirrors included
    if (opts.plan ? (i === trialAt || j === trialAt) && j >= i : j > i || (opts.ab && j === i)) jobs.push({ i, j });
  }));
  if (!jobs.length) { console.error('--focus matched no deck'); process.exit(1); }
  const nWorkers = Math.max(1, Math.min(jobs.length, parseInt(opt('--jobs') || String(Math.max(1, os.cpus().length - 2)), 10)));
  const run = { decks: decks.map((d) => d.key), opts, pairs: [], problems: [] };
  let live = nWorkers;
  for (let k = 0; k < nWorkers; k++) {
    const w = new Worker(__filename, { workerData: { jobs: jobs.filter((_, n) => n % nWorkers === k), opts } });
    w.on('message', (m) => {
      if (m.result) run.pairs.push(m.result);
      if (m.done) {
        run.problems = run.problems.concat(m.problems);
        if (--live) return;
        run.pairs.sort((a, b) => a.i - b.i || a.j - b.j);
        if (opt('--json')) { fs.writeFileSync(opt('--json'), JSON.stringify(run)); console.log(`saved ${run.pairs.length} pairings to ${opt('--json')}`); process.exit(run.problems.length ? 1 : 0); }
        finish(run);
      }
    });
    w.on('error', (e) => { console.error(e); process.exit(1); });
  }
}
