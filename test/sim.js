/* Headless AI-vs-AI simulation: checks the rules engine for crashes, stuck games and broken
 * invariants, and prints balance and board-usage figures across all 7 factions & presets.
 * Usage: node test/sim.js [gamesPerMatchup] [biome]
 */
require('../js/world.js');
require('../js/cards.js');
require('../js/design.js');
require('../js/engine.js');
require('../js/ai.js');
const { Engine: E, AI, FACTIONS, CARDS } = globalThis.TauCeti;
const { checkState } = require('./invariants.js');
// rule experiments: SECONDCELLS=n / SECONDCARDS=n set the Reserve Cells / extra cards the second player starts with
if (process.env.SECONDCELLS) E.SECOND_CELLS = +process.env.SECONDCELLS;
if (process.env.SECONDCARDS) E.SECOND_EXTRA_CARDS = +process.env.SECONDCARDS;

const N = parseInt(process.argv[2] || '12', 10);
const BIOME = process.argv[3] || 'tau_ceti';
const ids = Object.keys(FACTIONS);
const wins = {}, games = {};
ids.forEach((a) => { wins[a] = 0; games[a] = 0; });
let total = 0, draws = 0, turnSum = 0, firstWins = 0, problems = 0, longest = 0, ascentWins = 0;
const played = {};
const matrix = {};
const stat = { moves: 0, attacksUnit: 0, attacksSite: 0, attacksFace: 0, built: 0, razed: 0, research: 0, landingAlive: 0, staffedTurns: 0, siteTurns: 0, fatigue: 0, pods: 0 };

// Verify preset deck integrity first
ids.forEach((fid) => {
  const f = FACTIONS[fid];
  Object.keys(f.presets).forEach((pk) => {
    const deck = globalThis.TauCeti.buildDeck(fid, pk);
    if (deck.length !== 30) {
      problems++;
      console.error(`PRESET SIZE ERROR: ${fid}.${pk} has ${deck.length} cards (expected 30)`);
    }
    const counts = {};
    deck.forEach((id) => {
      if (!CARDS[id]) { problems++; console.error(`PRESET UNKNOWN CARD: ${fid}.${pk} -> ${id}`); return; }
      counts[id] = (counts[id] || 0) + 1;
      const limit = CARDS[id].unique ? 1 : 2;
      if (counts[id] > limit) { problems++; console.error(`PRESET COPY LIMIT: ${fid}.${pk} -> ${id} x${counts[id]}`); }
    });
  });
});

function check(g, where) {
  problems += checkState(g, where, (m) => { if (problems < 30) console.error(m); });
}

for (const a of ids) for (const b of ids) {
  const pa = Object.keys(FACTIONS[a].presets);
  const pb = Object.keys(FACTIONS[b].presets);
  for (let n = 0; n < N; n++) {
    const first = n % 2;
    const preset0 = pa[n % pa.length];
    const preset1 = pb[Math.floor(n / 2) % pb.length];
    const doc0 = FACTIONS[a].presets[preset0].doctrine || 'standard';
    const doc1 = FACTIONS[b].presets[preset1].doctrine || 'standard';
    const g = E.newGame(a, b, 1000 + total * 7919, first, { biome: BIOME, preset0, preset1, doctrine0: doc0, doctrine1: doc1, mulligan: true });
    AI.mulligan(g);
    const starter = g.active;
    let steps = 0;
    while (!g.over && g.turn < 160) {
      const pid = g.active;
      let acts = 0;
      for (;;) {
        const act = AI.choose(g, pid);
        if (!act || acts++ > 80) break;
        const sitesBefore = g.players[1 - pid].sites.length;
        const podsBefore = g.lanes.filter((l) => l.pod).length;
        if (!AI.apply(g, pid, act)) { problems++; console.error('AI chose illegal action', act); break; }
        if (act.type === 'play') { played[act.id] = (played[act.id] || 0) + 1; if (CARDS[act.id].type === 'site') stat.built++; }
        if (act.type === 'move') stat.moves++;
        if (act.type === 'attack') stat[act.target.k === 'u' ? 'attacksUnit' : act.target.k === 's' ? 'attacksSite' : 'attacksFace']++;
        stat.razed += Math.max(0, sitesBefore - g.players[1 - pid].sites.length);
        stat.pods += Math.max(0, podsBefore - g.lanes.filter((l) => l.pod).length);
        check(g, 'after ' + act.type);
        if (g.over) break;
        if (++steps > 8000) break;
      }
      if (!g.over) {
        g.players[pid].sites.forEach((s) => { if (CARDS[s.id].needsStaff) { stat.siteTurns++; if (E.stationed(g, s)) stat.staffedTurns++; } });
        E.endTurn(g, pid);
        check(g, 'end turn');
      }
      g.events.length = 0;
    }
    total++;
    turnSum += g.turn;
    longest = Math.max(longest, g.turn);
    games[a]++; games[b]++;
    g.players.forEach((p) => { stat.research += p.research; stat.fatigue += p.fatigue > 0 ? 1 : 0; if (p.sites.some((s) => s.id === 'landing')) stat.landingAlive++; });
    if (!g.over) { problems++; console.error(`game did not finish: ${a} vs ${b}`); continue; }
    if (g.winReason === 'ascent') ascentWins++;
    if (g.winner === -1) { draws++; continue; }
    wins[g.winner === 0 ? a : b]++;
    if (a !== b) { const k = a + ' vs ' + b; matrix[k] = (matrix[k] || 0) + (g.winner === 0 ? 1 : 0); }
    if (g.winner === starter) firstWins++;
  }
}

const per = (x) => (x / total).toFixed(1);
console.log(`${total} games (${BIOME}), avg ${(turnSum / total).toFixed(1)} turns (longest ${longest}), ${draws} draws, ${ascentWins} Ascent wins, first player won ${(100 * firstWins / total).toFixed(0)}%`);
ids.forEach((a) => console.log(`  ${a.padEnd(10)} ${(100 * wins[a] / games[a]).toFixed(1)}% wins`));
console.log(`per game: ${per(stat.moves)} moves, ${per(stat.pods)} pods claimed, attacks ${per(stat.attacksUnit)} units / ${per(stat.attacksSite)} sites / ${per(stat.attacksFace)} colony`);
console.log(`per game: ${per(stat.built)} sites built, ${per(stat.razed)} razed; landing survived ${(100 * stat.landingAlive / (2 * total)).toFixed(0)}%; staffed ${(100 * stat.staffedTurns / Math.max(1, stat.siteTurns)).toFixed(0)}%`);
console.log(`avg final research ${(stat.research / (2 * total)).toFixed(1)}; fatigue in ${(100 * stat.fatigue / (2 * total)).toFixed(0)}% of player-games`);
const never = Object.keys(CARDS).filter((id) => !CARDS[id].token && !played[id]);
if (never.length) console.log('never played:', never.join(', '));
console.log(problems ? `${problems} PROBLEMS` : 'no problems found');
process.exit(problems ? 1 : 0);
