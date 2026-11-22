/* A/B harness for the AI's evaluation weights: a variant plays the baseline over every
 * faction pairing, on both sides and going both first and second.
 * Usage: node test/tune.js key=value[,key=value...] [gamesPerPairing]
 *   e.g. node test/tune.js foeSite=2 20
 */
require('../js/world.js');
require('../js/cards.js');
require('../js/engine.js');
require('../js/ai.js');
const { Engine: E, AI, FACTIONS } = globalThis.TauCeti;

if (process.env.RAZE) E.RAZE_DAMAGE = +process.env.RAZE; // rule experiment
if (process.env.SITEHP) Object.values(globalThis.TauCeti.CARDS).forEach((c) => { if (c.type === 'site') c.hp = Math.max(1, c.hp + +process.env.SITEHP); }); // rule experiment
const variant = Object.assign({}, AI.TUNE);
(process.argv[2] || '').split(',').filter(Boolean).forEach((kv) => {
  const [k, v] = kv.split('=');
  if (!(k in variant)) { console.error('unknown weight: ' + k); process.exit(1); }
  variant[k] = parseFloat(v);
});
const N = parseInt(process.argv[3] || '10', 10);
const ids = Object.keys(FACTIONS);
let wins = 0, games = 0, seed = 1;
for (const a of ids) for (const b of ids) for (let n = 0; n < N; n++) {
  for (const side of [0, 1]) {
    const g = E.newGame(a, b, 31 + seed++ * 104729, n % 2);
    while (!g.over && g.turn < 160) {
      const pid = g.active;
      const T = pid === side ? variant : AI.TUNE;
      let act, k = 0;
      while (!g.over && (act = AI.choose(g, pid, T)) && k++ < 80) AI.apply(g, pid, act);
      if (!g.over) E.endTurn(g, pid);
      g.events.length = 0;
    }
    games++;
    if (g.winner === side) wins++;
  }
}
const p = wins / games;
const se = Math.sqrt(p * (1 - p) / games);
console.log(`${process.argv[2] || '(baseline)'}: variant won ${(100 * p).toFixed(1)}% of ${games} games (±${(196 * se).toFixed(1)})`);
