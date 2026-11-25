/* TAU CETI — browser UI: title screen, deckbuilder, campaign, expedition draft, battlefield, inspector, FX. */
(function () {
  'use strict';
  const V = window.TauCeti;
  const E = V.Engine, AI = V.AI, CARDS = V.CARDS, FACTIONS = V.FACTIONS, KW = V.KEYWORDS;
  const TERRAIN = V.TERRAIN, BIOMES = V.BIOMES, DOCTRINES = V.DOCTRINES, CAMPAIGN = V.CAMPAIGN;
  const Decks = V.Decks, SFX = V.SFX, Design = V.Design;
  const HUMAN = 0, BOT = 1;
  const $ = (s, r) => (r || document).querySelector(s);
  const fx = $('#fx');
  const logEl = $('#log');

  let g = null;
  let sel = null;
  let busy = false;
  let seen = new Set();
  let hintMsg = null;
  let myFaction = 'rootbound';
  let myPreset = 'swarm'; // a preset key of myFaction, or 'deck:<id>' for a saved deck from the library
  let myDoctrine = 'green';
  const prefs = Object.assign({ faction: null, picks: {} }, Decks.getPrefs());
  if (!prefs.picks || typeof prefs.picks !== 'object') prefs.picks = {};
  let oppChoice = 'random';
  let myBiome = 'tau_ceti';
  let myDiff = 'commander';
  let activeMode = { kind: 'skirmish' }; // { kind: 'skirmish' | 'campaign' | 'draft', mission?, draft? }
  let speed = 1;

  // Deckbuilder working state
  let builder = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * speed));
  const locked = () => busy || !g || g.over || g.active !== HUMAN;
  const facName = (id) => (id === 'neutral' ? 'Colonist' : (FACTIONS[id].short || FACTIONS[id].name.replace(/^The /, '')));
  const laneName = (lane) => 'lane ' + (lane + 1);

  const POD_TEXT = {
    cells: 'Energy Cache (+2 Energy Cells)',
    research: 'Black-Box Core (+2 Research)',
    medkit: 'Med-Kit Pod (+4 HP / +3 Armor)',
    upgrade: 'Field Upgrade (+1/+1 & Shielded)',
    worm: 'Dormant Brood (2/2 Psi Mind Worm)',
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const savedId = (pick) => (typeof pick === 'string' && pick.indexOf('deck:') === 0 ? pick.slice(5) : null);

  /**
   * The deck a pick stands for: a faction preset, or a playable saved deck of that faction.
   * Falls back to the faction's first preset if the pick is gone or no longer legal.
   */
  function deckFor(fid, pick) {
    const f = FACTIONS[fid];
    const id = savedId(pick);
    if (id) {
      const d = Decks.getDeck(id);
      if (d && d.faction === fid && Decks.validate(d).ok) {
        const n = Decks.pactCount(d);
        const desc = d.pact
          ? `Your own deck — a Pact with ${facName(d.pact)} (${n} Pact card${n === 1 ? '' : 's'}).`
          : 'Your own single-faction deck.';
        return { pick: 'deck:' + d.id, saved: true, name: d.name, faction: fid, pact: d.pact, doctrine: d.doctrine, cards: d.cards.slice(), desc };
      }
    }
    const key = f.presets[pick] ? pick : Object.keys(f.presets)[0];
    const p = f.presets[key];
    return { pick: key, saved: false, name: p.name, faction: fid, pact: p.pact || null, doctrine: p.doctrine || 'standard', cards: V.buildDeck(fid, key), desc: p.desc };
  }
  const activeDeck = () => deckFor(myFaction, myPreset);

  function savePrefs() {
    prefs.faction = myFaction;
    prefs.picks[myFaction] = myPreset;
    Decks.savePrefs(prefs);
  }

  /** Choose a deck for the current faction; its doctrine comes with it. */
  function pickDeck(pick) {
    const d = deckFor(myFaction, pick);
    myPreset = d.pick;
    myDoctrine = d.doctrine;
    savePrefs();
  }

  /** Switch faction, returning to the deck last used with it (or its first preset). */
  function syncFactionDefaults(fid) {
    myFaction = fid;
    pickDeck(prefs.picks[fid]);
  }

  const hasArt = (id) => !!(V.ART && V.ART[id]);
  const artImg = (id) => `<img class="art-img" src="art/${id}.webp" alt="" loading="lazy">`;

  /* ============================================================ card markup */
  function cardHTML(d, o) {
    o = o || {};
    const cost = o.cost == null ? d.cost : o.cost;
    const isUnit = d.type === 'unit';
    const isSite = d.type === 'site';
    const kind = d.project ? 'Project' : isSite ? 'Location' : isUnit ? 'Unit' : 'Order';
    const kindIcon = d.project ? '★' : isSite ? '🏛' : isUnit ? '⚔' : '⚡';
    const body = d.text || (d.flavor ? `<i>${d.flavor}</i>` : '');
    const hp = o.hp == null ? d.hp : o.hp;
    const stats = isUnit
      ? `<div class="c-atk ${o.atkCls || ''}">${o.atk == null ? d.atk : o.atk}</div><div class="c-hp ${o.hpCls || ''}">${hp}</div>`
      : isSite ? `<div class="c-hp c-int ${o.hpCls || ''}" title="Integrity">${hp}</div>` : '';
    const extraCls = [isUnit ? 'unit-card' : isSite ? 'site-card' : 'order', 'f-' + d.faction];
    if (d.project) extraCls.push('project');
    if (o.cls) extraCls.push(o.cls);
    const artInner = hasArt(d.id) ? artImg(d.id) : `<span>${d.art}</span>`;
    return `<div class="card ${extraCls.join(' ')}" ${o.attrs || ''}>
      <div class="c-cost ${cost < d.cost ? 'cheap' : ''}">${cost}</div>
      <div class="c-art">${artInner}</div>
      <div class="c-name">${d.name}</div>
      <div class="c-type"><span class="c-kind">${kindIcon} ${kind}</span><span class="c-fac">${facName(d.faction)}</span></div>
      <div class="c-text"><div>${body}</div></div>${stats}${o.extra || ''}
    </div>`;
  }

  const statCls = (now, base) => (now > base ? 'buffed' : now < base ? 'hurt' : '');
  const isTarget = (ref) => !!(sel && sel.targets && sel.targets.some((t) => E.sameRef(t, ref)));
  const unitKws = (u) => Object.keys(KW).filter((k) => (k === 'shield' || k === 'blitz' ? u.kw[k] : E.hasKw(g, u, k)));

  function unitHTML(u) {
    const d = CARDS[u.id];
    const cls = ['unit', 'f-' + d.faction];
    if (u.immobile) cls.push('fixed');
    if (E.hasKw(g, u, 'guard')) cls.push('guard');
    if (u.kw.shield) cls.push('shielded');
    if (u.jammed > 0) cls.push('jammed');
    if (!seen.has(u.uid)) cls.push('enter');
    if (g.active === u.owner && !u.immobile && !(u.jammed > 0) && (!u.ready || (u.attacked && u.moved) || (u.attacked && !E.hasKw(g, u, 'mobile')))) cls.push('asleep');
    if (u.owner === HUMAN && !locked()) {
      if (E.attackTargets(g, u).length) cls.push('ready');
      else if (E.moveTargets(g, u).length) cls.push('can-move');
    }
    if (sel && sel.kind === 'unit' && sel.uid === u.uid) cls.push('selected');
    if (isTarget({ k: 'u', uid: u.uid })) cls.push('targetable', u.owner === HUMAN ? 'friendly' : 'hostile');

    const kws = unitKws(u).slice(0, 4).map((k) => {
      const val = (k === 'zeal' || k === 'flank') ? E.kwVal(g, u, k) : '';
      const clsP = k === 'veteran' && u.promoted ? 'promo' : '';
      return `<span class="${clsP}" title="${KW[k].name}${val ? ' ' + val : ''}">${KW[k].icon}${val > 1 ? val : ''}</span>`;
    });
    if (d.lastStand && kws.length < 5) kws.push('<span title="Last Stand">✝</span>');
    if ((d.turnEnd || d.turnStart) && kws.length < 5) kws.push('<span title="Every cycle">⟳</span>');
    if (d.onOrder && kws.length < 5) kws.push('<span title="Triggers on Orders">✦</span>');

    const dispAtk = E.effectiveAtk(g, u, null);
    const hpCls = u.hp < u.maxHp ? 'hurt' : u.maxHp > d.hp ? 'buffed' : '';
    const uArt = hasArt(d.id);
    return `<div class="${cls.join(' ')}" data-uid="${u.uid}" data-card="${u.id}">
      <div class="u-name">${d.name}</div>
      <div class="u-art ${uArt ? 'has-art' : ''}">${uArt ? artImg(d.id) : d.art}</div>
      <div class="u-kw">${kws.join('')}</div>${u.kw.shield ? '<div class="u-shield" title="Shielded — ignores the next non-Psi damage">◈</div>' : ''}
      <div class="c-atk ${statCls(dispAtk, d.atk)}">${dispAtk}</div>
      <div class="c-hp ${hpCls}">${u.hp}</div>
    </div>`;
  }

  function siteHTML(s) {
    const d = CARDS[s.id];
    const cls = ['site', 'f-' + d.faction];
    if (d.project) cls.push('project');
    if (s.jammed > 0) cls.push('jammed');
    const staffed = !!E.stationed(g, s);
    if (d.needsStaff && !(s.jammed > 0)) cls.push(staffed ? 'working' : 'idle');
    if (d.needsEmpty && staffed) cls.push('idle');
    if (!seen.has(s.uid)) cls.push('enter');
    if (isTarget({ k: 's', uid: s.uid })) cls.push('targetable', s.owner === HUMAN ? 'friendly' : 'hostile');
    const sArt = hasArt(d.id);
    return `<div class="${cls.join(' ')}" data-site="${s.uid}" data-card="${s.id}">
      <div class="s-art ${sArt ? 'has-art' : ''}">${sArt ? artImg(d.id) : d.art}</div>
      <div class="s-body"><div class="s-name">${d.name}</div><div class="s-brief">${d.brief || ''}</div></div>
      <div class="c-hp c-int ${s.hp < s.maxHp ? 'hurt' : s.maxHp > d.hp ? 'buffed' : ''}" title="Integrity">${s.hp}</div>
    </div>`;
  }

  /* ============================================================ rendering */
  function elFor(ref) {
    if (!ref) return null;
    if (ref.k === 'u') return $(`#lanes .unit[data-uid="${ref.uid}"]`);
    if (ref.k === 's') return $(`#lanes .site[data-site="${ref.uid}"]`);
    if (ref.k === 'c') return $(`#lanes .lane[data-lane="${ref.lane}"]`);
    return $(`#screen-game .portrait[data-leader="${ref.pid}"]`);
  }

  function renderLeader(pid) {
    const p = g.players[pid];
    const f = FACTIONS[p.faction];
    const pw = f.power;
    const isBoss = pid === BOT && g.bossName;
    const leaderName = isBoss ? g.bossName : f.leader;
    const leaderArt = isBoss ? (g.bossArt || '🧠') : f.art;
    const facCls = isBoss ? 'f-boss' : 'f-' + p.faction;
    const doc = DOCTRINES[p.doctrine] || DOCTRINES.standard;

    const eCap = E.maxEnergyCap(g, pid);
    let pips = '';
    for (let i = 0; i < eCap; i++) pips += `<span class="pip ${i < p.energy ? 'have' : i < p.maxEnergy ? 'spent' : ''}"></span>`;

    const ms = E.milestones(g, pid);
    const hasAscent = p.sites.some((s) => E.siteActive(g, s) && CARDS[s.id].ascentProject);
    const top = hasAscent ? E.ASCENT_RESEARCH : ms[ms.length - 1];
    let ticks = ms.map((m, i) =>
      `<span class="r-tick ${p.research >= m ? 'on' : ''}" style="left:${(100 * m) / top}%">${['I', 'II', 'III'][i]}</span>`).join('');
    if (hasAscent) {
      ticks += `<span class="r-tick ascent ${p.research >= E.ASCENT_RESEARCH ? 'on' : ''}" style="left:100%" title="Transcendence Victory (${E.ASCENT_RESEARCH})">★</span>`;
    }

    const usable = pid === HUMAN && !locked() && E.canUsePower(g, pid);
    const pcls = ['power'];
    if (usable) pcls.push('usable');
    if (p.powerUsed) pcls.push('used');
    if (sel && sel.kind === 'power' && pid === HUMAN) pcls.push('selected');
    const tcls = isTarget({ k: 'l', pid }) ? 'targetable ' + (pid === HUMAN ? 'friendly' : 'hostile') : '';
    const docTag = (p.pact ? ` + ${facName(p.pact)}` : '') + (p.doctrine !== 'standard' ? ` · ${doc.icon} ${doc.name}` : '');

    const lArtId = isBoss ? 'leader_boss' : 'leader_' + p.faction;
    const portraitInner = hasArt(lArtId) ? artImg(lArtId) : `<span>${leaderArt}</span>`;

    $('#leader-' + pid).innerHTML = `
      <div class="leader ${facCls} ${g.active === pid && !g.over ? 'active' : ''}">
        <div class="portrait ${tcls}" data-leader="${pid}" data-insp="leader">
          ${portraitInner}
          ${p.armor > 0 ? `<div class="armor" title="Armor">${p.armor}</div>` : ''}
          <div class="hp ${p.hp < p.maxHp ? 'hurt' : ''}" title="Colony integrity">${Math.max(0, p.hp)}</div>
        </div>
        <div class="l-info">
          <div>
            <div class="l-name">${leaderName}</div>
            <div class="l-fac" title="${f.name}${docTag}">${p.pact ? facName(p.faction) : f.name}${docTag}</div>
          </div>
          <div class="energy" title="Energy">${pips}<span class="num">${p.energy}/${p.maxEnergy}</span></div>
          <div class="research" data-insp="research" data-pid="${pid}">
            <span class="num">🔬 ${p.research}</span>
            <div class="r-bar"><div class="r-fill" style="width:${Math.min(100, (100 * p.research) / top)}%"></div>${ticks}</div>
          </div>
          <div class="counts">Deck ${p.deck.length} · Hand ${p.hand.length}/${E.maxHand(g, pid)}</div>
        </div>
        <button class="${pcls.join(' ')}" data-power="${pid}" data-insp="power">
          <span class="p-cost">${E.powerCost(g, pid)}</span>
          <span class="p-art">${pw.art}</span>
          <span class="p-name">${pw.name}</span>
        </button>
      </div>`;
  }

  function renderField() {
    const selUnit = sel && sel.kind === 'unit' ? E.find(g, sel.uid) : null;
    const reach = selUnit ? E.reach(g, selUnit.unit) : 0;
    let html = '';
    for (let lane = 0; lane < E.LANES; lane++) {
      const eu = E.unitAt(g, BOT, lane), es = E.siteAt(g, BOT, lane);
      const mu = E.unitAt(g, HUMAN, lane), ms = E.siteAt(g, HUMAN, lane);
      const linfo = g.lanes[lane] || { terrain: null, pod: false };
      const terr = linfo.terrain ? TERRAIN[linfo.terrain] : null;

      const lcls = ['lane'];
      if (selUnit && Math.abs(lane - selUnit.unit.lane) <= reach) lcls.push('reach');
      if (sel && sel.cols && sel.cols.includes(lane)) lcls.push('coltarget');
      const slotOpen = (row) => sel && sel.slot && sel.slot.row === row && sel.slot.lanes.includes(lane);
      let slot = '<div class="slot"></div>';
      if (!mu) {
        if (slotOpen('mu')) slot = `<div class="slot slot-target">${sel.kind === 'power' ? 'Place' : 'Deploy'}</div>`;
        else if (sel && sel.kind === 'unit' && sel.moves.includes(lane)) slot = '<div class="slot slot-move">Move</div>';
      }
      const plot = !ms && slotOpen('ms') ? '<div class="plot slot-target">Build</div>' : '<div class="plot"></div>';

      const gapStyle = terr ? `style="--tc:${terr.color}"` : '';
      const gapCls = 'lane-gap' + (terr ? ' has-terrain' : '');
      const gapInner = (terr ? `<span class="terrain-pill">${terr.icon} ${terr.brief}</span>` : (!linfo.pod ? `<span>${lane + 1}</span>` : ''))
        + (linfo.pod ? '<span class="pod-badge">📦 POD</span>' : '');
      if (terr) lcls.push('has-terrain');

      html += `<div class="${lcls.join(' ')}" ${gapStyle} data-lane="${lane}" data-terrain="${linfo.terrain || ''}">
        <div class="cell site-cell enemy" data-row="es">${es ? siteHTML(es) : '<div class="plot"></div>'}</div>
        <div class="cell unit-cell enemy" data-row="eu">${eu ? unitHTML(eu) : '<div class="slot"></div>'}</div>
        <div class="${gapCls}" ${gapStyle} data-insp="lane" data-lane="${lane}">${gapInner}</div>
        <div class="cell unit-cell mine" data-row="mu">${mu ? unitHTML(mu) : slot}</div>
        <div class="cell site-cell mine" data-row="ms">${ms ? siteHTML(ms) : plot}</div>
      </div>`;
    }
    $('#lanes').innerHTML = html;
  }

  function renderHand() {
    const el = $('#hand-0');
    const p = g.players[HUMAN];
    el.innerHTML = p.hand.map((hc) => {
      const cls = [];
      const d = CARDS[hc.id];
      const cost = E.cost(g, HUMAN, hc);
      if (!locked() && E.canPlay(g, HUMAN, hc)) {
        cls.push('playable');
        if (d.overcharge && p.energy >= cost + d.overcharge) cls.push('overcharged');
      }
      if (sel && sel.kind === 'card' && sel.hand === hc.uid) cls.push('selected');
      return cardHTML(d, { cost, cls: cls.join(' '), attrs: `data-hand="${hc.uid}" data-card="${hc.id}"` });
    }).join('');
    const cards = el.children;
    const n = cards.length;
    if (n > 1) {
      const cw = cards[0].offsetWidth;
      const W = el.clientWidth - 16;
      const gap = Math.round(cw * 0.05);
      let ml = gap;
      if (n * cw + (n - 1) * gap > W) ml = (W - n * cw) / (n - 1);
      for (let i = 1; i < n; i++) cards[i].style.marginLeft = ml + 'px';
    }
    $('#hand-1').innerHTML = g.players[BOT].hand.map(() => '<div class="card-back">✦</div>').join('');
  }

  function defaultHint() {
    if (g.over) return '';
    if (g.active !== HUMAN) return 'The enemy is acting…';
    if (busy) return '';
    if (!sel) return 'Your turn. Click a card to play it, or a glowing unit to attack or move.';
    if (sel.kind === 'unit') {
      const name = CARDS[E.find(g, sel.uid).unit.id].name;
      if (sel.targets.length && sel.moves.length) return `${name}: click a red target to attack, or a blue slot to move.`;
      if (sel.targets.length) return `${name}: click a red target to attack.`;
      return `${name}: click a blue slot to move one lane.`;
    }
    const name = sel.kind === 'power'
      ? FACTIONS[g.players[HUMAN].faction].power.name
      : CARDS[g.players[HUMAN].hand.find((h) => h.uid === sel.hand).id].name;
    if (sel.slot) return sel.slot.row === 'ms' ? `Choose a plot to build ${name} on.` : `Choose a lane for ${name}.`;
    if (sel.cols) return `Choose a lane for ${name}.`;
    if (sel.confirm) return `Click the card again to play ${name}.`;
    return `Choose a target for ${name}.`;
  }

  function renderMid() {
    const h = $('#hint');
    h.textContent = hintMsg ? hintMsg.text : defaultHint();
    h.classList.toggle('warn', !!(hintMsg && hintMsg.warn));
    const btn = $('#end-turn');
    btn.disabled = locked();
    btn.textContent = g.active === HUMAN ? 'End Turn' : 'Enemy Turn';
    const p = g.players[HUMAN];
    const idle = !locked() && !p.hand.some((hc) => E.canPlay(g, HUMAN, hc))
      && !p.board.some((u) => E.attackTargets(g, u).length) && !E.canUsePower(g, HUMAN);
    btn.classList.toggle('nudge', idle);
    $('#btn-mute').textContent = SFX.muted ? '🔇' : '🔊';
  }

  function render() {
    if (!g) return;
    renderLeader(0);
    renderLeader(1);
    renderField();
    renderHand();
    renderMid();
    g.players.forEach((p) => { p.board.forEach((u) => seen.add(u.uid)); p.sites.forEach((s) => seen.add(s.uid)); });
  }

  function warn(text) {
    hintMsg = { text, warn: true };
    renderMid();
  }

  /* ============================================================ inspector */
  const GLOSSARY = [
    [/Deploy:/, 'Deploy', 'Happens when the unit is played from your hand.'],
    [/Last Stand:/, 'Last Stand', 'Happens when the unit is destroyed.'],
    [/Cycle End:/, 'Cycle End', 'Happens at the end of each of your turns.'],
    [/Cycle Start:/, 'Cycle Start', 'Happens at the start of each of your turns.'],
    [/Tech \d+:/, 'Tech', 'Active while your Research is at least that number.'],
    [/Overcharge \d+:/, 'Overcharge', 'If you have enough extra Energy left after paying the base cost, spends it to trigger this bonus.'],
    [/Jam/, 'Jam', 'Disables a unit or location until the end of its owner’s next turn.'],
    [/Secret Project/, 'Secret Project', `Unique legendary location (max 1 per deck). If razed, deals ${E.PROJECT_RAZE_DAMAGE} damage to its colony.`],
    [/Transcendence:/, 'Transcendence', `Win the game immediately upon reaching ${E.ASCENT_RESEARCH} Research while The Voice of Planet stands.`],
    [/stationed|staffed/, 'Stationed', 'A unit is stationed at a location while standing in the same lane.'],
    [/Energy Cell/, 'Energy Cell', 'A free Order that gives 1 Energy this turn.'],
    [/Supply Pod/, 'Supply Pod', 'First unit to deploy or move into the lane claims a random orbital reward.'],
    [/Armor/, 'Armor', 'Absorbs non-Psi damage to your colony before its integrity.'],
    [/Xenofungus/, 'Xenofungus', 'Cycle End: Non-native units take 1 damage; Stepdaughter and Native units heal 1.'],
    [/High Ridge/, 'High Ridge', 'Units in this lane gain +1 Reach.'],
    [/Thermal Borehole/, 'Thermal Borehole', 'Cycle Start: +1 Energy if a unit is here; your Location here takes 1 damage.'],
    [/Sensor Array/, 'Sensor Array', 'Units in this lane gain Interceptor (blocks Aerial).'],
    [/neighbouring/, 'Neighbouring lanes', 'The lanes directly left and right.'],
    [/Black Box/, 'Black Box', 'A set of three Colonist Orders. Each one grows stronger for every other Black Box you have already played this game.'],
    [/has terrain|no terrain|lane’s terrain/, 'Terrain', 'The feature in a lane’s centre strip: Xenofungus, High Ridge, Thermal Borehole, Alien Monolith, Sensor Array or Perihelion Wreckage. Both sides share it.'],
    [/Alien Monolith/, 'Alien Monolith', 'The first time each unit ends a cycle here, it gains +1/+1 and restores 2 health.'],
    [/Breakthrough/, 'Breakthrough', 'A Research milestone. There are three; you reach them at 4, 8 and 13 Research (6, 10 and 15 under Power).'],
    [/Mind Worm/, 'Mind Worm', 'A 2/2 unit with Psi.'],
    [/Sprout/, 'Sprout', 'A 1/1 native Stepdaughter unit.'],
  ];

  function combatPreviewNote(ref) {
    if (!g || !sel || sel.kind !== 'unit' || !isTarget(ref)) return '';
    const af = E.find(g, sel.uid);
    if (!af) return '';
    const a = af.unit;
    const aAtk = E.effectiveAtk(g, a, ref, true);
    const aPsi = E.hasKw(g, a, 'psi');
    if (ref.k === 'u') {
      const df = E.find(g, ref.uid);
      if (!df) return '';
      const d = df.unit;
      const dAtk = E.hasKw(g, a, 'artillery') ? 0 : E.effectiveAtk(g, d, E.unitRef(a), false);
      const dPsi = E.hasKw(g, d, 'psi');
      const dealTxt = !aPsi && d.kw.shield ? '0 (Shield popped)' : `${aAtk}${aPsi ? ' Psi' : ''}${aAtk >= d.hp ? ' — LETHAL' : ''}`;
      const takeTxt = dAtk === 0
        ? (E.hasKw(g, a, 'artillery') ? '0 (Artillery)' : '0')
        : (!dPsi && a.kw.shield ? '0 (Shield popped)' : `${dAtk}${dPsi ? ' Psi' : ''}${dAtk >= a.hp ? ' — YOUR UNIT DIES' : ''}`);
      return `<div class="insp-preview"><b>⚔️ Combat Preview</b><br>Deals: <b>${dealTxt}</b> · Takes: <b>${takeTxt}</b></div>`;
    }
    if (ref.k === 's') {
      const sf = E.findSite(g, ref.uid);
      const hp = sf ? sf.site.hp : 0;
      return `<div class="insp-preview"><b>⚔️ Raid Preview</b><br>Deals <b>${aAtk}</b> to location${aAtk >= hp ? ' — RAZES!' : ''}.</div>`;
    }
    return `<div class="insp-preview"><b>⚔️ Strike Preview</b><br>Deals <b>${aAtk}${aPsi ? ' Psi' : ''}</b> to enemy colony.</div>`;
  }

  function inspectCard(id, o, into) {
    const d = CARDS[id];
    o = o || {};
    const opt = {};
    let kws = Object.keys(KW).filter((k) => d.kw && d.kw[k]);
    const notes = [];
    if (o.uid != null && g) {
      const prev = combatPreviewNote({ k: 'u', uid: o.uid });
      if (prev) notes.push(prev);
      const f = E.find(g, o.uid);
      if (f) {
        const u = f.unit;
        const effAtk = E.effectiveAtk(g, u, null);
        opt.atk = effAtk; opt.hp = u.hp;
        opt.atkCls = statCls(effAtk, d.atk);
        opt.hpCls = u.hp < u.maxHp ? 'hurt' : u.maxHp > d.hp ? 'buffed' : '';
        kws = unitKws(u);
        if (u.jammed > 0) notes.push(`<div><b>⊘ Jammed</b> — Disabled for ${u.jammed} turn(s).</div>`);
        if (u.promoted) notes.push('<div><b>★ Promoted Veteran</b> — Already earned its combat promotion.</div>');
      }
    }
    if (o.site != null && g) {
      const prev = combatPreviewNote({ k: 's', uid: o.site });
      if (prev) notes.push(prev);
      const f = E.findSite(g, o.site);
      if (f) {
        opt.hp = f.site.hp;
        opt.hpCls = f.site.hp < f.site.maxHp ? 'hurt' : f.site.maxHp > d.hp ? 'buffed' : '';
        const u = E.stationed(g, f.site);
        notes.push(`<div><b>${u ? 'Staffed' : 'Unstaffed'}</b> — ${u ? CARDS[u.id].name + ' is stationed here.' : 'No unit is stationed in this lane.'}</div>`);
        if (f.site.jammed > 0) notes.push(`<div><b>⊘ Jammed</b> — Effects disabled for ${f.site.jammed} turn(s).</div>`);
      }
    }
    if (o.hand != null && g) {
      const p = g.players[HUMAN];
      const hc = p.hand.find((h) => h.uid === o.hand);
      if (hc) {
        opt.cost = E.cost(g, HUMAN, hc);
        if (d.overcharge && p.energy >= opt.cost + d.overcharge) {
          notes.push(`<div><b>⚡ Overcharge Ready</b> — Playing now spends +${d.overcharge} Energy for the bonus!</div>`);
        }
      }
    }
    if (d.flavor) notes.push(`<div class="insp-flavor">${d.flavor}</div>`);
    kws.forEach((k) => notes.push(`<div><b>${KW[k].name}</b> — ${KW[k].text}</div>`));
    GLOSSARY.forEach(([re, name, text]) => { if (re.test(d.text)) notes.push(`<div><b>${name}</b> — ${text}</div>`); });
    if (d.type === 'site' && !d.project) notes.push(`<div><b>Location</b> — Built behind a lane. Razing deals ${E.RAZE_DAMAGE} damage to its colony.</div>`);
    if (d.type === 'order' && !d.noResearch) notes.push('<div><b>Order</b> — Playing it gives you 1 Research.</div>');
    (into || $('#inspector')).innerHTML = cardHTML(d, opt) + `<div class="insp-notes">${[...new Set(notes)].join('')}</div>`;
  }

  function inspectLane(lane) {
    const l = g.lanes[lane];
    const terr = l.terrain ? TERRAIN[l.terrain] : null;
    const notes = [];
    if (terr) {
      notes.push(`<div><b>${terr.icon} ${terr.name}</b> — ${terr.text}</div>`);
    } else {
      notes.push('<div><b>Open Dust</b> — Standard lane with no terrain modifier.</div>');
    }
    if (l.pod) {
      notes.push('<div><b>📦 Perihelion Supply Pod</b> — Deploy or move a unit into this lane to claim a random orbital reward (+2 Cells, +2 Research, Med-Kit, +1/+1 & Shield, or a 2/2 Psi Mind Worm)!</div>');
    }
    $('#inspector').innerHTML = `<div class="insp-leader f-neutral">
      <div class="big">${l.pod ? '📦' : terr ? terr.icon : '🪐'}</div>
      <div class="nm">Sector ${lane + 1}${terr ? ' · ' + terr.name : ''}</div>
      <div class="insp-notes">${notes.join('')}</div>
    </div>`;
  }

  function inspectLeader(pid, what) {
    const p = g.players[pid];
    const f = FACTIONS[p.faction];
    const doc = DOCTRINES[p.doctrine] || DOCTRINES.standard;
    const ms = E.milestones(g, pid);
    let html;
    if (what === 'power') {
      html = `<div class="big">${f.power.art}</div><div class="nm">${f.power.name}</div>
        <div class="sub">Leader power · costs ${E.powerCost(g, pid)} Energy · once per turn</div>
        <div>${f.power.text}</div>`;
    } else if (what === 'research') {
      html = `<div class="big">🔬</div><div class="nm">Research ${p.research}</div>
        <div class="sub">Every Order gives 1 Research, as does a staffed Landing Site each cycle.</div>
        <div class="insp-notes">${ms.map((m, i) =>
          `<div><b>${m} Research</b> — ${E.MILESTONE_TEXT[i]} ${p.research >= m ? '✔' : ''}</div>`).join('')}
          <div><b>${E.ASCENT_RESEARCH} Research + The Voice of Planet</b> — Instant Transcendence Victory!</div>
        </div>`;
    } else {
      const isBoss = pid === BOT && g.bossName;
      const lArtId = isBoss ? 'leader_boss' : 'leader_' + p.faction;
      const lHasArt = hasArt(lArtId);
      const prev = combatPreviewNote({ k: 'l', pid });
      html = `<div class="big ${lHasArt ? 'has-art' : ''}">${lHasArt ? artImg(lArtId) : (isBoss ? g.bossArt : f.art)}</div>
        <div class="nm">${isBoss ? g.bossName : f.leader}</div>
        <div class="sub">${f.name}<br>“${f.motto}”</div>
        <div>Colony integrity ${Math.max(0, p.hp)} / ${p.maxHp}${p.armor ? ` · Armor ${p.armor}` : ''}</div>
        <div class="insp-notes">${prev}${p.pact ? `<div><b>🤝 Pact with ${facName(p.pact)}</b> — This deck includes up to ${Decks.PACT_LIMIT} ${facName(p.pact)} cards.</div>` : ''}<div><b>${doc.icon} ${doc.name}</b> — ${doc.benefit} ${doc.drawback !== 'None.' ? '<i>(' + doc.drawback + ')</i>' : ''}</div></div>`;
    }
    $('#inspector').innerHTML = `<div class="insp-leader f-${p.faction}">${html}</div>`;
  }

  document.addEventListener('mouseover', (e) => {
    if (e.target.closest('#screen-builder')) {
      const c = e.target.closest('[data-card]');
      if (c && CARDS[c.dataset.card]) inspectCard(c.dataset.card, null, $('#bd-inspector'));
      return;
    }
    if (!g || !e.target.closest('#screen-game')) return;
    const t = e.target.closest('[data-card],[data-insp]');
    if (!t) return;
    if (t.dataset.card) {
      inspectCard(t.dataset.card, {
        uid: t.dataset.uid ? +t.dataset.uid : null,
        site: t.dataset.site ? +t.dataset.site : null,
        hand: t.dataset.hand ? +t.dataset.hand : null,
      });
    } else if (t.dataset.insp === 'lane') {
      inspectLane(+t.dataset.lane);
    } else {
      const holder = t.closest('[data-pid],[data-leader],[data-power]');
      const pid = +(holder.dataset.pid || holder.dataset.leader || holder.dataset.power);
      inspectLeader(pid, t.dataset.insp);
    }
  });

  /* ============================================================ log + effects */
  function logLine(html, cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.innerHTML = html;
    logEl.appendChild(d);
    while (logEl.children.length > 180) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  const who = (pid) => (pid === HUMAN ? 'You' : 'The enemy');
  const whose = (pid) => (pid === HUMAN ? 'Your' : 'Enemy');
  const logCard = (id, bold) => {
    const c = CARDS[id];
    if (!c) return id;
    const tag = bold ? 'b' : 'span';
    return `<${tag} class="log-card" data-card="${id}">${c.name}</${tag}>`;
  };
  function refName(ref) {
    if (ref.k === 'l') return ref.pid === HUMAN ? 'your colony' : 'the enemy colony';
    if (ref.k === 'c') return laneName(ref.lane);
    if (ref.k === 's') {
      const f = E.findSite(g, ref.uid);
      return f ? (f.pid === HUMAN ? 'your ' : 'the enemy ') + logCard(f.site.id) : 'a location';
    }
    const f = E.find(g, ref.uid);
    return f ? (f.pid === HUMAN ? 'your ' : 'the enemy ') + logCard(f.unit.id) : 'a unit';
  }

  function floater(rect, e, i) {
    const d = document.createElement('div');
    d.className = 'floater ' + (e.psi ? 'psi' : e.t);
    d.textContent = e.t === 'dmg' ? (e.psi ? '✦-' + e.n : '-' + e.n)
      : e.t === 'heal' ? '+' + e.n
      : e.t === 'armor' ? '🛡+' + e.n
      : e.t === 'jam' ? '⊘ JAM'
      : e.t === 'promote' ? '★ VETERAN'
      : e.t === 'noreturn' ? '◎ OUT OF RANGE'
      : '◈ SHIELD ABSORBED';
    d.style.left = rect.left + rect.width / 2 + ((i % 3) - 1) * rect.width * 0.22 * Math.min(1, i) + 'px';
    d.style.top = rect.top + rect.height / 2 + 'px';
    d.style.animationDelay = i * 90 * speed + 'ms';
    fx.appendChild(d);
    setTimeout(() => d.remove(), 1300 + i * 90);
  }

  function showQuoteToast(art, kicker, title, quote, artId) {
    const prev = $('.quote-toast', fx);
    if (prev) prev.remove();
    const d = document.createElement('div');
    d.className = 'quote-toast';
    const imgOk = artId && hasArt(artId);
    d.innerHTML = `<div class="qt-art ${imgOk ? 'has-art' : ''}">${imgOk ? artImg(artId) : art}</div><div>
      <div class="qt-kicker">${kicker}</div>
      <div class="qt-title">${title}</div>
      <div class="qt-body">${quote}</div>
    </div>`;
    fx.appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  function ghost(el) {
    const r = el.getBoundingClientRect();
    const c = el.cloneNode(true);
    c.classList.remove('enter', 'selected', 'ready', 'can-move', 'targetable', 'flagged');
    c.classList.add('ghost-unit');
    c.style.left = r.left + 'px';
    c.style.top = r.top + 'px';
    c.style.width = r.width + 'px';
    c.style.height = r.height + 'px';
    c.removeAttribute('data-uid');
    c.removeAttribute('data-site');
    fx.appendChild(c);
    setTimeout(() => c.remove(), 520);
  }

  async function banner(text, foe) {
    const d = document.createElement('div');
    d.className = 'banner' + (foe ? ' foe' : '');
    d.textContent = text;
    fx.appendChild(d);
    setTimeout(() => d.remove(), 1150);
    await sleep(820);
  }

  async function flash(html, target, label) {
    const d = document.createElement('div');
    d.className = 'flash';
    d.innerHTML = `<div class="who">${label}</div>${html}`;
    fx.appendChild(d);
    const t = elFor(target);
    if (t) t.classList.add('flagged');
    await sleep(1100);
    d.remove();
    if (t) t.classList.remove('flagged');
  }

  async function lunge(from, to) {
    if (!from || !to || !from.animate || speed === 0) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    from.style.zIndex = 60;
    try {
      await from.animate([
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${-dx * 0.06}px, ${-dy * 0.14}px) scale(1.1)`, offset: 0.35 },
        { transform: `translate(${dx * 0.8}px, ${dy * 0.8}px) scale(1.05)` },
      ], { duration: 320, easing: 'ease-in', fill: 'forwards' }).finished;
    } catch (err) { /* cancelled */ }
  }

  function flush() {
    const evs = g.events.splice(0);
    const pend = [];
    const slides = [];
    let designed = null;
    evs.forEach((e) => {
      const foe = e.pid === BOT ? 'foe' : '';
      if (e.t === 'dmg' || e.t === 'heal' || e.t === 'block' || e.t === 'armor' || e.t === 'jam' || e.t === 'promote' || e.t === 'noreturn') {
        const el = elFor(e.ref);
        pend.push({ e, rect: el ? el.getBoundingClientRect() : null });
        if (e.t === 'dmg') (e.psi ? SFX.psi() : SFX.dmg());
        else if (e.t === 'heal') SFX.heal();
        // a Shield swallows the whole hit and then it is gone, so without this line the hit just looks like it did nothing
        else if (e.t === 'block') { SFX.block(); logLine(`${whose(e.pid)} ${logCard(e.id)}’s <b>Shield</b> absorbs the hit — no damage. The Shield is now gone.`, foe); }
        else if (e.t === 'promote') { SFX.milestone(); logLine(`${whose(e.pid)} ${logCard(e.id, true)} promoted to Veteran!`, 'gold'); }
      } else if (e.t === 'death') {
        const el = elFor(e.ref);
        if (el) ghost(el);
        logLine(`${whose(e.pid)} ${logCard(e.id)} is destroyed.`, foe);
      } else if (e.t === 'raze') {
        const el = elFor(e.ref);
        if (el) ghost(el);
        SFX.raze();
        logLine(`${whose(e.pid)} ${logCard(e.id)} is razed — the colony takes ${e.dmg || E.RAZE_DAMAGE} damage.`, foe);
      } else if (e.t === 'move') {
        const el = elFor(e.ref);
        if (el) slides.push({ ref: e.ref, rect: el.getBoundingClientRect() });
        SFX.move();
      } else if (e.t === 'turn') {
        logLine(`Cycle ${Math.ceil(e.turn / 2)} — ${e.pid === HUMAN ? 'your turn' : 'enemy turn'}`, 'turn');
      } else if (e.t === 'milestone') {
        SFX.milestone();
        logLine(`${who(e.pid)} reached ${E.MILESTONE_TEXT[e.level]}`, 'sys');
        if (e.pid === HUMAN) {
          const f = FACTIONS[g.players[HUMAN].faction];
          showQuoteToast('🔬', 'Research Breakthrough', E.MILESTONE_TEXT[e.level], `“${f.motto}” — ${f.leader}`);
        }
      } else if (e.t === 'project_built') {
        const c = CARDS[e.id];
        SFX.project();
        logLine(`${who(e.pid)} completed Secret Project: ${logCard(e.id, true)}!`, 'gold');
        showQuoteToast(c.art, `Secret Project Completed · ${who(e.pid)}`, c.name, c.flavor || c.brief, e.id);
      } else if (e.t === 'pod_claim') {
        SFX.pod();
        logLine(`${who(e.pid)} cracked a Supply Pod in ${laneName(e.lane)}: <b>${POD_TEXT[e.outcome]}</b>.`, 'gold');
      } else if (e.t === 'pod_drop') {
        SFX.pod();
        logLine(`An orbital Supply Pod landed in ${laneName(e.lane)}!`, 'sys');
      } else if (e.t === 'terrain') {
        logLine(`${laneName(e.lane)} is now <b>${e.terrain ? TERRAIN[e.terrain].name : 'Clear Dust'}</b>.`, 'sys');
      } else if (e.t === 'fatigue') {
        logLine(`${e.pid === HUMAN ? 'Your' : "The enemy's"} deck is empty — the colony takes ${e.n} damage.`, 'sys');
      } else if (e.t === 'burn') {
        logLine(`${e.pid === HUMAN ? 'Your' : "The enemy's"} hand is full — ${e.pid === HUMAN ? logCard(e.id) : 'a card'} is lost.`, 'sys');
      } else if (e.t === 'design') {
        const c = CARDS[e.id];
        const kws = Object.keys(KW).filter((k) => c.kw[k]).map((k) => KW[k].name + (typeof c.kw[k] === 'number' ? ' ' + c.kw[k] : ''));
        logLine(`${who(e.pid)} ${e.pid === HUMAN ? 'design' : 'designs'} ${logCard(e.id, true)}: ${c.atk}/${c.hp}${kws.length ? ', ' + kws.join(', ') : ''}, costs ${c.cost} Energy.`, foe);
        designed = e.id;
      } else if (e.t === 'gain' && e.pid === HUMAN) {
        if (e.id === designed) { designed = null; return; } // already announced by the design line
        logLine(`You receive ${logCard(e.id, true)}.`);
      } else if (e.t === 'steal') {
        logLine(`${who(e.pid)} seized control of a unit.`, foe);
      }
    });
    render();
    slides.forEach((sl) => {
      const el = elFor(sl.ref);
      if (!el || !el.animate || speed === 0) return;
      const r = el.getBoundingClientRect();
      el.animate([{ transform: `translate(${sl.rect.left - r.left}px, ${sl.rect.top - r.top}px)` }, { transform: 'translate(0,0)' }],
        { duration: 260, easing: 'ease-out' });
    });
    const count = {};
    pend.forEach((p) => {
      let rect = p.rect;
      if (!rect) { const el = elFor(p.e.ref); if (el) rect = el.getBoundingClientRect(); }
      if (!rect) return;
      const key = p.e.ref.k + (p.e.ref.k === 'l' ? p.e.ref.pid : p.e.ref.uid);
      count[key] = (count[key] || 0) + 1;
      floater(rect, p.e, count[key] - 1);
    });
  }

  /* ============================================================ actions */
  async function act(pid, a) {
    const foe = pid === BOT ? 'foe' : '';
    if (a.type === 'attack') {
      const f = E.find(g, a.uid);
      SFX.attack();
      // Artillery takes no damage back from the unit it shells; say so, or the exchange looks like a bug
      const ranged = a.target.k === 'u' && E.hasKw(g, f.unit, 'artillery');
      logLine(`${whose(pid)} ${logCard(f.unit.id)} ${ranged ? 'shells' : 'attacks'} ${refName(a.target)}${ranged ? ' from range — <b>Artillery</b> takes no damage back' : ''}.`, foe);
      await lunge(elFor({ k: 'u', uid: a.uid }), elFor(a.target));
      E.attack(g, pid, a.uid, a.target);
    } else if (a.type === 'move') {
      const f = E.find(g, a.uid);
      logLine(`${whose(pid)} ${logCard(f.unit.id)} moves to ${laneName(a.lane)}.`, foe);
      E.move(g, pid, a.uid, a.lane);
    } else if (a.type === 'play') {
      const hc = g.players[pid].hand.find((h) => h.uid === a.hand);
      const d = CARDS[hc.id];
      const verb = d.type === 'unit' ? ['deploy', 'deploys'] : d.type === 'site' ? ['build', 'builds'] : ['play', 'plays'];
      const where = a.lane != null ? ' in ' + laneName(a.lane) : '';
      logLine(`${who(pid)} ${verb[pid === HUMAN ? 0 : 1]} ${logCard(hc.id, true)}${where}${a.target ? (where ? ', targeting ' : ' on ') + refName(a.target) : ''}.`, foe);
      if (d.type === 'site') SFX.build(); else SFX.play();
      if (pid === BOT) {
        // for a Workshop, show the unit it designed rather than the Order itself
        const made = d.design ? Design.ensure(Design.idOf(a.choice)) : null;
        if (made) await flash(cardHTML(made), null, 'Enemy designs a unit');
        else await flash(cardHTML(d, { cost: E.cost(g, pid, hc) }), a.target || (a.lane != null ? { k: 'c', lane: a.lane } : null), 'Enemy plays');
      }
      E.playCard(g, pid, a.hand, a.target, a.lane, a.choice);
    } else if (a.type === 'power') {
      const f = FACTIONS[g.players[pid].faction];
      SFX.play();
      logLine(`${who(pid)} ${pid === HUMAN ? 'use' : 'uses'} <b class="log-card" data-insp="power" data-pid="${pid}">${f.power.name}</b>${a.target ? ' on ' + refName(a.target) : ''}.`, foe);
      if (pid === BOT) {
        await flash(`<div class="power-card f-${f.id}"><div class="big">${f.power.art}</div><div class="nm">${f.power.name}</div><div>${f.power.text}</div></div>`,
          a.target, 'Enemy leader power');
      }
      E.usePower(g, pid, a.target);
    }
    flush();
  }

  async function humanAct(a) {
    busy = true;
    sel = null;
    hintMsg = null;
    renderMid();
    await act(HUMAN, a);
    busy = false;
    if (g.over) return gameOver();
    render();
  }

  async function botTurn() {
    busy = true;
    render();
    await sleep(420);
    let n = 0;
    while (!g.over && g.active === BOT && n++ < 80) {
      const a = AI.choose(g, BOT, null, myDiff);
      if (!a) break;
      await act(BOT, a);
      await sleep(a.type === 'move' ? 480 : 380);
    }
    if (!g.over) { E.endTurn(g, BOT); flush(); }
    if (g.over) { busy = false; return gameOver(); }
    await banner('Your Turn');
    busy = false;
    render();
  }

  async function endTurn() {
    if (locked()) return;
    SFX.click();
    busy = true;
    sel = null;
    hintMsg = null;
    E.endTurn(g, HUMAN);
    flush();
    if (g.over) { busy = false; return gameOver(); }
    await banner('Enemy Turn', true);
    await botTurn();
  }

  /* ============================================================ input */
  function withTargets(base, spec, ts) {
    if (spec === 'column') base.cols = ts.map((t) => t.lane);
    else if (spec === 'emptyLane') base.slot = { row: 'mu', lanes: ts.map((t) => t.lane) };
    else base.targets = ts;
    return base;
  }

  function clickHand(uid) {
    const p = g.players[HUMAN];
    const hc = p.hand.find((h) => h.uid === uid);
    if (!hc) return;
    const d = CARDS[hc.id];
    if (sel && sel.kind === 'card' && sel.hand === uid) {
      if (sel.confirm) return humanAct({ type: 'play', hand: uid, target: null, lane: null });
      sel = null;
      return render();
    }
    if (!E.canPlay(g, HUMAN, hc)) {
      sel = null;
      render();
      const el = $(`#hand-0 [data-hand="${uid}"]`);
      if (el) el.classList.add('shake');
      const cost = E.cost(g, HUMAN, hc);
      if (cost > p.energy) return warn(`Not enough Energy for ${d.name} (${cost} needed, ${p.energy} available).`);
      if (d.project && p.sites.some((s) => s.id === hc.id)) return warn(`${d.name} is unique and already stands in your colony.`);
      if (d.type === 'unit') return warn('Every lane already holds one of your units.');
      if (d.type === 'site') return warn('Every plot already holds one of your locations.');
      return warn(`${d.name} has no valid target right now.`);
    }
    if (d.design) return openDesigner(uid);
    SFX.click();
    if (d.type === 'unit') sel = { kind: 'card', hand: uid, slot: { row: 'mu', lanes: E.emptyLanes(g, HUMAN) } };
    else if (d.type === 'site') sel = { kind: 'card', hand: uid, slot: { row: 'ms', lanes: E.emptyPlots(g, HUMAN) } };
    else if (d.target) sel = withTargets({ kind: 'card', hand: uid }, d.target, E.cardTargets(g, HUMAN, d));
    else sel = { kind: 'card', hand: uid, confirm: true };
    render();
  }

  function clickPower() {
    if (sel && sel.kind === 'power') { sel = null; return render(); }
    const p = g.players[HUMAN];
    const pw = FACTIONS[p.faction].power;
    if (!E.canUsePower(g, HUMAN)) {
      sel = null;
      render();
      if (p.powerUsed) return warn(`${pw.name} has already been used this turn.`);
      if (p.energy < E.powerCost(g, HUMAN)) return warn(`Not enough Energy for ${pw.name}.`);
      return warn(`${pw.name} cannot be used right now.`);
    }
    SFX.click();
    if (!pw.target) return humanAct({ type: 'power', target: null });
    sel = withTargets({ kind: 'power' }, pw.target, E.targets(g, HUMAN, pw.target));
    render();
  }

  function resolveSelection(ref) {
    if (sel.kind === 'card') return humanAct({ type: 'play', hand: sel.hand, target: ref, lane: sel.lane == null ? null : sel.lane });
    if (sel.kind === 'unit') return humanAct({ type: 'attack', uid: sel.uid, target: ref });
    return humanAct({ type: 'power', target: ref });
  }

  function chooseLane(lane) {
    if (sel.kind === 'power') return resolveSelection({ k: 'c', lane });
    const hc = g.players[HUMAN].hand.find((h) => h.uid === sel.hand);
    const d = CARDS[hc.id];
    if (d.type === 'order') return resolveSelection({ k: 'c', lane });
    if (E.needsTarget(g, HUMAN, hc)) {
      sel = { kind: 'card', hand: sel.hand, lane, targets: E.cardTargets(g, HUMAN, d) };
      return render();
    }
    return humanAct({ type: 'play', hand: sel.hand, target: null, lane });
  }

  function explainBadAttack(ref) {
    const u = E.find(g, sel.uid).unit;
    const front = E.frontEnemies(g, u);
    if (!E.canAttack(g, u)) return warn('That unit can still move, but it cannot attack this turn.');
    if (ref.k === 'u') {
      const t = E.find(g, ref.uid).unit;
      if (Math.abs(t.lane - u.lane) > E.reach(g, u)) return warn('Out of reach — check lane Reach (or move onto a High Ridge).');
      if (E.hasKw(g, u, 'aerial')) return warn('An enemy Interceptor opposite or adjacent must be attacked first!');
      return warn('An enemy Guard opposite or adjacent must be attacked first.');
    }
    if (u.summonedTurn === g.turn) return warn('On the turn it arrives, a Blitz unit can only attack units.');
    const aerial = E.hasKw(g, u, 'aerial');
    if (aerial && front.some((x) => E.hasKw(g, x, 'interceptor'))) {
      return warn('An enemy Interceptor is opposite or adjacent — it screens locations and the colony against Aerial units.');
    }
    if (!aerial && front.some((x) => E.hasKw(g, x, 'guard'))) return warn('An enemy Guard opposite or adjacent must be attacked first.');
    if (ref.k === 'l') return warn('An enemy unit is opposite or adjacent to this unit — it screens the colony.');
    const st = E.findSite(g, ref.uid);
    if (!st || Math.abs(st.site.lane - u.lane) > E.reach(g, u)) return warn('That location is out of reach.');
    const lo = Math.min(u.lane, st.site.lane), hi = Math.max(u.lane, st.site.lane);
    const blocker = g.players[1 - u.owner].board.find((x) => E.alive(x) && x.lane >= lo && x.lane <= hi);
    if (blocker) return warn(`${CARDS[blocker.id].name} in ${laneName(blocker.lane)} stands between this unit and that location.`);
    return warn('That location cannot be attacked right now.');
  }

  function clickRef(ref) {
    if (sel && isTarget(ref)) return resolveSelection(ref);
    const f = ref.k === 'u' ? E.find(g, ref.uid) : null;
    if (f && f.pid === HUMAN) {
      const u = f.unit;
      const ts = E.attackTargets(g, u);
      const mv = E.moveTargets(g, u);
      if (ts.length || mv.length) { SFX.click(); sel = { kind: 'unit', uid: u.uid, targets: ts, moves: mv }; return render(); }
      sel = null;
      render();
      if (u.jammed > 0) return warn(`${CARDS[u.id].name} is Jammed and cannot act this turn.`);
      if (u.immobile) return warn(`${CARDS[u.id].name} holds its lane: it cannot move or attack.`);
      if (u.summonedTurn === g.turn) return warn(u.ready ? 'Nothing is in reach, and units cannot move on the turn they arrive.' : 'Units cannot act on the turn they arrive.');
      if (u.attacked || u.moved) return warn('That unit has already acted this turn.');
      return warn('That unit has nothing in reach and no empty lane beside it.');
    }
    const hostile = f ? true : ref.k === 's' ? E.findSite(g, ref.uid).pid === BOT : ref.pid === BOT;
    if (sel && sel.kind === 'unit' && hostile) return explainBadAttack(ref);
    if (sel && sel.targets) return warn('That is not a valid target.');
    if (sel) { sel = null; render(); }
  }

  $('#screen-game').addEventListener('click', (e) => {
    if (e.target.closest('#side')) return;
    if (e.target.closest('#end-turn')) return endTurn();
    if (locked()) return;
    hintMsg = null;
    const hand = e.target.closest('[data-hand]');
    if (hand) return clickHand(+hand.dataset.hand);
    const power = e.target.closest('[data-power]');
    if (power) { if (+power.dataset.power === HUMAN) clickPower(); return; }

    const laneEl = e.target.closest('.lane');
    const cell = e.target.closest('.cell');
    if (sel && laneEl) {
      const lane = +laneEl.dataset.lane;
      const row = cell ? cell.dataset.row : null;
      if (sel.cols && sel.cols.includes(lane)) return resolveSelection({ k: 'c', lane });
      if (sel.slot && row === sel.slot.row && sel.slot.lanes.includes(lane)) return chooseLane(lane);
      if (sel.kind === 'unit' && row === 'mu' && sel.moves.includes(lane) && !E.unitAt(g, HUMAN, lane)) {
        return humanAct({ type: 'move', uid: sel.uid, lane });
      }
    }
    const unit = e.target.closest('.unit[data-uid]');
    if (unit) return clickRef({ k: 'u', uid: +unit.dataset.uid });
    const site = e.target.closest('.site[data-site]');
    if (site) return clickRef({ k: 's', uid: +site.dataset.site });
    const leader = e.target.closest('[data-leader]');
    if (leader) return clickRef({ k: 'l', pid: +leader.dataset.leader });
    if (sel) sel = null;
    render();
  });

  function cancel() {
    if (!$('#modal').classList.contains('hidden')) { if (modalClosable) closeModal(); return; }
    if (sel || hintMsg) { sel = null; hintMsg = null; render(); }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });
  $('#screen-game').addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); });
  window.addEventListener('resize', () => { if (g && !$('#screen-game').classList.contains('hidden')) render(); });

  /* ============================================================ modals */
  let modalClosable = true;
  let designer = null;   // the Design Workshop picker's state while it is open: { hand, chassis, weapon, armor, abilities }
  let lastDesign = null; // the last unit designed this session, offered again as the starting point
  function openModal(html, closable) {
    modalClosable = closable !== false;
    $('#modal-box').innerHTML = html;
    $('#modal').classList.remove('hidden');
    $('#modal-box').scrollTop = 0;
  }
  function closeModal() { designer = null; $('#modal').classList.add('hidden'); }

  /* ============================================================ Design Workshop picker */
  function openDesigner(uid) {
    const base = { chassis: 'inf', weapon: 'w2', armor: 'a3', abilities: [] };
    const start = lastDesign && !Design.why(g, HUMAN, lastDesign) ? lastDesign : base;
    sel = null;
    hintMsg = null;
    SFX.click();
    render();
    designer = { hand: uid, chassis: start.chassis, weapon: start.weapon, armor: start.armor, abilities: start.abilities.slice() };
    renderDesigner(true);
  }

  const designerChoice = () => ({ chassis: designer.chassis, weapon: designer.weapon, armor: designer.armor, abilities: designer.abilities.slice() });

  function renderDesigner(fresh) {
    const p = g.players[HUMAN];
    const hc = p.hand.find((h) => h.uid === designer.hand);
    if (!hc) return closeModal();
    const keepScroll = fresh ? null : $('#modal-box').scrollTop;
    const choice = designerChoice();
    const b = Design.breakdown(choice);
    const def = Design.build(choice);
    const why = Design.why(g, HUMAN, choice);
    const slots = Design.abilitySlots(g, HUMAN);
    const left = p.energy - E.cost(g, HUMAN, hc);
    const fmt = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + (-n) : '0');

    const column = (slot) => {
      const picked = slot === 'ability' ? designer.abilities : [designer[slot]];
      const rows = Design.PARTS[slot].map((part) => {
        const lock = Design.locked(g, HUMAN, part);
        if (lock && !/^Tech/.test(lock)) return ''; // another faction's signature part: not on offer in this deck
        const on = picked.includes(part.id);
        const tip = part.kw ? KW[part.kw].text : '';
        return `<button class="dz-part ${on ? 'on' : ''} ${lock ? 'locked' : ''} ${part.faction ? 'sig f-' + part.faction : ''}" data-dzpart="${slot}:${part.id}" ${lock ? 'disabled' : ''} title="${esc(tip)}">
          <span class="dz-pn">${part.name}</span>
          <span class="dz-pb">${Design.partBrief(part)}</span>
          <span class="dz-pp">${lock ? '🔒 ' + lock : fmt(Design.partPts(part, b.atk))}</span>
        </button>`;
      }).join('');
      const note = slot !== 'ability' ? '' : slots === 2 ? 'up to two' : `one — a second at Tech ${Design.SECOND_SLOT_TECH}`;
      return `<div class="dz-col"><h3>${Design.SLOT_NAMES[slot]}${note ? ` <small>${note}</small>` : ''}</h3>${rows}</div>`;
    };

    const next = Design.TIERS.find((t) => t > 0 && !E.tech(g, HUMAN, t));
    const tierNote = next ? `More parts unlock at Tech ${next}.` : 'Every part is unlocked.';
    const sum = b.lines.map((l) => `${Design.SLOT_NAMES[l.slot]} ${fmt(l.pts)}`).join(' · ');
    const verdict = why ? `<div class="dz-note bad">${why}</div>`
      : def.cost <= left ? `<div class="dz-note good">You will have ${left} Energy left after the Workshop — enough to deploy it this turn.</div>`
        : `<div class="dz-note">You will have ${left} Energy left after the Workshop, so this unit waits for a later turn.</div>`;
    const kwNotes = Object.keys(KW).filter((k) => def.kw[k]).map((k) => `<span>${KW[k].icon} ${KW[k].name}</span><span>${KW[k].text}</span>`).join('');

    openModal(`<div class="dz f-${g.players[HUMAN].faction}">
      <h2>🛠️ Design Workshop</h2>
      <p class="dz-sub">Pick one part from each column. You have <b>${p.research} Research</b>. ${tierNote} Every 2 points cost 1 Energy.</p>
      <div class="dz-body">
        <div class="dz-cols">${Design.SLOTS.map(column).join('')}</div>
        <div class="dz-side">
          ${cardHTML(def, { cls: 'dz-card' })}
          <div class="dz-sum">${sum}<br><b>${b.points} points → ${def.cost} Energy</b></div>
          ${verdict}
          ${kwNotes ? `<div class="kw-list dz-kw">${kwNotes}</div>` : ''}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" data-dz="cancel">Cancel</button>
        <button class="btn primary" data-dz="build" ${why ? 'disabled' : ''}>Build ${esc(def.name)}</button>
      </div>
    </div>`);
    // re-rendering after a pick must not jump back to the top on a short screen
    if (!fresh && keepScroll != null) $('#modal-box').scrollTop = keepScroll;
  }

  function designerPick(slot, id) {
    const part = Design.part(slot, id);
    if (!part || Design.locked(g, HUMAN, part)) return;
    SFX.click();
    if (slot !== 'ability') designer[slot] = id;
    else if (designer.abilities.includes(id)) designer.abilities = designer.abilities.filter((x) => x !== id);
    else {
      designer.abilities.push(id);
      const slots = Design.abilitySlots(g, HUMAN);
      while (designer.abilities.length > slots) designer.abilities.shift(); // the newest pick replaces the oldest
    }
    renderDesigner();
  }

  function designerBuild() {
    const choice = Design.normalize(designerChoice());
    if (!choice || Design.why(g, HUMAN, choice) || locked()) return;
    const hand = designer.hand;
    lastDesign = choice;
    closeModal();
    humanAct({ type: 'play', hand, target: null, lane: null, choice });
  }

  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal' && modalClosable) return closeModal();

    // Design Workshop picker
    if (designer) {
      const part = e.target.closest('[data-dzpart]');
      if (part) { const [slot, id] = part.dataset.dzpart.split(':'); return designerPick(slot, id); }
      const dz = e.target.closest('[data-dz]');
      if (dz) return dz.dataset.dz === 'build' ? designerBuild() : closeModal();
      return;
    }

    // Campaign launch
    const campGo = e.target.closest('[data-camp]');
    if (campGo) {
      const m = CAMPAIGN.find((x) => x.id === campGo.dataset.camp);
      if (m) { closeModal(); launchCampaignMission(m); }
      return;
    }

    // Expedition Draft picks
    const dpick = e.target.closest('[data-dpick]');
    if (dpick) {
      const idx = +dpick.dataset.dpick;
      const run = Decks.getDraft();
      if (run && run.pendingDraft && run.pendingDraft[idx]) {
        run.deck = run.deck.concat(run.pendingDraft[idx].cards);
        run.pendingDraft = null;
        Decks.saveDraft(run);
        SFX.pod();
        return showDraftModal();
      }
      return;
    }

    const b = e.target.closest('[data-do]');
    if (!b) return;
    const what = b.dataset.do;
    if (what === 'draft-new') { Decks.startDraft(myFaction, myDoctrine); return showDraftModal(); }
    if (what === 'draft-fight') { closeModal(); return launchDraftBattle(); }
    if (what === 'draft-abandon') { Decks.clearDraft(); return showDraftModal(); }

    closeModal();
    if (what === 'confirm-yes') { const fn = confirmYes; confirmYes = null; if (fn) fn(); return; }
    if (what === 'rematch') startCurrentModeAgain();
    if (what === 'next-camp') {
      const nextIdx = CAMPAIGN.findIndex((x) => x.id === activeMode.mission.id) + 1;
      if (CAMPAIGN[nextIdx]) launchCampaignMission(CAMPAIGN[nextIdx]);
      else showCampaignModal();
    }
    if (what === 'draft-continue') showDraftModal();
    if (what === 'title') showTitle();
  });

  function showHelp() {
    const kws = Object.keys(KW).map((k) => `<span>${KW[k].icon} ${KW[k].name}</span><span>${KW[k].text}</span>`).join('');
    const terrs = Object.values(TERRAIN).map((t) => `<span>${t.icon} ${t.name}</span><span>${t.text}</span>`).join('');
    openModal(`<div class="help">
      <h2>How to play Tau Ceti</h2>
      <div class="cols">
        <div>
          <h3>Goal & Victory</h3>
          <p>Reduce the enemy colony’s integrity from ${E.START_HP} to 0 — OR complete <b>The Voice of Planet</b> and reach <b>${E.ASCENT_RESEARCH} Research</b> for an instant <b>Transcendence Victory</b>.</p>
          <h3>The 7-Lane Planet</h3>
          <ul>
            <li>Each lane holds one <b>unit</b> in front, one <b>location</b> behind, and a shared <b>Planetary Terrain</b> tile in the center.</li>
            <li>Units reach their own lane and neighbouring lanes (+1 Reach on a <b>High Ridge</b> or with <b>Artillery</b>).</li>
            <li>An enemy <b>Guard</b> opposite or beside a ground unit must be attacked first. Otherwise it may strike any enemy unit in reach.</li>
            <li>A <b>location</b> is screened by enemy units standing in its own lane or between it and the attacker. The <b>colony</b> is screened by any enemy unit opposite or beside the attacker.</li>
            <li><b>Aerial</b> units fly over ground units—only <b>Interceptors</b> screen them.</li>
            <li>Razing a Location deals ${E.RAZE_DAMAGE} damage to its colony (<b>${E.PROJECT_RAZE_DAMAGE} damage</b> for a Secret Project!).</li>
            <li>Deploy or move a unit into a <b>📦 Supply Pod</b> lane to claim orbital rewards.</li>
          </ul>
          <h3>Planetary Terrain</h3>
          <div class="kw-list">${terrs}</div>
        </div>
        <div>
          <h3>Keywords</h3>
          <div class="kw-list">${kws}
            <span>⚡ Overcharge N</span><span>Automatically spends N leftover Energy when played to trigger a bonus effect.</span>
            <span>⊘ Jam</span><span>Disables a unit or location until the end of its owner’s next turn.</span>
            <span>🏛 Secret Project</span><span>Unique legendary location (max 1 per deck) with global colony effects.</span>
          </div>
          <h3>Decks & Pacts</h3>
          <p>A deck is ${Decks.DECK_SIZE} cards: up to 2 copies of each card, 1 of a Secret Project. Your <b>faction</b> supplies the leader and leader power. You may sign a <b>Pact</b> with one other faction and include up to ${Decks.PACT_LIMIT} of its cards — but not its Secret Project. Build your own in the <b>Deckbuilder</b>.</p>
          <h3>Design Workshop</h3>
          <p>The <b>Design Workshop</b> Order builds a unit card to your own plan: a chassis, a weapon, armor and an ability. Parts unlock with Research at Tech 4, 8 and ${Design.SECOND_SLOT_TECH}, your faction (and Pact partner) each add a signature part, and the unit’s Energy cost is the sum of its parts.</p>
          <h3>Research & Social Engineering</h3>
          <p>Every Order and every staffed Landing Site grants Research. Milestones grant permanent Breakthroughs, and <b>Social Engineering</b> lets you trade one planetary advantage against a sharp drawback.</p>
        </div>
      </div>
      <div class="modal-actions"><button class="btn primary" data-do="close">Got it</button></div>
    </div>`);
  }

  function showDeck(fid) {
    const f = FACTIONS[fid];
    const deck = fid === myFaction ? activeDeck() : deckFor(fid, null);
    const counts = Decks.countsFromList(deck.cards);
    const sorted = Object.keys(counts).sort((a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name));
    const one = (id, qty) => cardHTML(CARDS[id], { extra: `<div class="qty">${qty}</div>` });
    const label = esc(deck.name) + (deck.pact ? ` · Pact with ${facName(deck.pact)}` : '');
    openModal(`<div class="f-${fid}">
      <h2 style="color:var(--fc)">${f.art} ${f.name} — ${label}</h2>
      <p>${f.style} Every deck is ${Decks.DECK_SIZE} cards (max 2 copies; 1 copy of a Secret Project) and may include up to ${Decks.PACT_LIMIT} cards from one Pact partner. Both sides begin with a Landing Site in lane 4.</p>
      <div class="gallery">${sorted.map((id) => one(id, '×' + counts[id])).join('')}${one('landing', 'start')}</div>
      <div class="modal-actions">
        <button class="btn ghost" data-do="close">Close</button>
      </div>
    </div>`);
  }

  /* ============================================================ Deckbuilder (full screen) */
  let confirmYes = null;
  function confirmModal(title, text, yesLabel, onYes, noLabel) {
    confirmYes = onYes;
    openModal(`<div class="result">
      <h2 style="font-size:3.2rem;letter-spacing:0.4rem">${title}</h2>
      <p>${text}</p>
      <div class="modal-actions">
        <button class="btn ghost" data-do="close">${noLabel || 'Cancel'}</button>
        <button class="btn primary" data-do="confirm-yes">${yesLabel}</button>
      </div>
    </div>`);
  }

  const byCost = (a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const builderList = () => Decks.listFromCounts(builder.counts);
  const builderDeck = () => ({
    id: builder.id, name: builder.name, faction: builder.faction, pact: builder.pact,
    doctrine: builder.doctrine, cards: builderList(),
  });
  const blankDeck = (fid) => ({ name: Decks.uniqueName(`New ${facName(fid)} deck`), faction: fid, pact: null, doctrine: 'standard', cards: [] });
  const BUILDER_HINT = 'Click a card to add it. Right-click it, or click its row in the deck list, to remove a copy.';

  function loadIntoBuilder(deck, msg, dirty) {
    builder = {
      id: deck.id || null,
      name: deck.name,
      faction: deck.faction,
      pact: deck.pact || null,
      doctrine: deck.doctrine || 'standard',
      counts: Decks.countsFromList(deck.cards),
      src: 'all', type: 'all', cost: 'all', search: '',
      dirty: !!dirty,
      msg: msg || BUILDER_HINT,
      bad: false,
    };
    $('#bd-name').value = builder.name;
    $('#bd-search').value = '';
    $('#bd-code').value = '';
    $('#bd-inspector').innerHTML = '<div class="insp-empty">Hover a card to read it in full.</div>';
    renderBuilder();
    $('#bd-grid').scrollTop = 0;
  }

  /** Open the builder on the deck picked on the title screen (a preset opens as a new, unsaved variant). */
  function openBuilder() {
    const cur = activeDeck();
    if (cur.saved) loadIntoBuilder(Decks.getDeck(savedId(cur.pick)));
    else {
      loadIntoBuilder({ name: Decks.uniqueName(cur.name + ' variant'), faction: cur.faction, pact: null, doctrine: myDoctrine, cards: cur.cards },
        `Started from the ${cur.name} preset. ${BUILDER_HINT}`);
    }
    $('#screen-title').classList.add('hidden');
    $('#screen-builder').classList.remove('hidden');
  }

  function closeBuilder() {
    builder = null;
    $('#screen-builder').classList.add('hidden');
    pickDeck(myPreset); // the picked deck may have been edited, renamed or deleted
    showTitle();
  }

  /** Run fn, first asking for confirmation if the deck being edited has unsaved changes. */
  function guardDirty(fn) {
    if (!builder || !builder.dirty) return fn();
    confirmModal('Unsaved changes', `<b>${esc(builder.name)}</b> has changes that have not been saved.`, 'Discard changes', fn, 'Keep editing');
  }

  function bdSay(msg, bad) { builder.msg = msg; builder.bad = !!bad; }

  function builderAdd(id) {
    const c = CARDS[id];
    if (!c) return;
    const deck = builderDeck();
    const why = Decks.whyIllegal(deck, id);
    const cur = builder.counts[id] || 0;
    const max = Decks.copyLimit(id);
    if (why) bdSay(why, true);
    else if (deck.cards.length >= Decks.DECK_SIZE) bdSay(`The deck is full (${Decks.DECK_SIZE} cards). Remove a card first.`, true);
    else if (cur >= max) bdSay(max === 1 ? `${c.name} is a Secret Project — one copy only.` : `You already have ${max} copies of ${c.name}.`, true);
    else if (Decks.source(deck, id) === 'pact' && Decks.pactCount(deck) >= Decks.PACT_LIMIT) {
      bdSay(`Pact limit reached: at most ${Decks.PACT_LIMIT} ${facName(builder.pact)} cards.`, true);
    } else {
      builder.counts[id] = cur + 1;
      builder.dirty = true;
      bdSay(`Added ${c.name}.`);
      SFX.click();
    }
    renderBuilderCounts();
  }

  function builderRemove(id) {
    if (!builder.counts[id]) return;
    builder.counts[id]--;
    if (builder.counts[id] <= 0) delete builder.counts[id];
    builder.dirty = true;
    bdSay(`Removed ${CARDS[id].name}.`);
    SFX.click();
    renderBuilderCounts();
  }

  /** Change the main faction and/or Pact partner, dropping cards that no longer fit (after a confirmation). */
  function builderReshape(faction, pact, label) {
    const part = Decks.partition({ faction, pact, cards: builderList() });
    const apply = () => {
      builder.faction = faction;
      builder.pact = pact;
      builder.counts = Decks.countsFromList(part.legal);
      if (builder.src === 'pact' && !builder.pact) builder.src = 'all';
      builder.dirty = true;
      bdSay(part.illegal.length ? `${label} Removed ${plural(part.illegal.length, 'card')} that no longer fit.` : label);
      renderBuilder();
      $('#bd-grid').scrollTop = 0;
    };
    if (!part.illegal.length) return apply();
    confirmModal(faction === builder.faction ? 'Change Pact?' : 'Change faction?',
      `${label} <b>${plural(part.illegal.length, 'card')}</b> in this deck would no longer be allowed and will be removed.`,
      'Change and remove', apply, 'Keep as is');
  }

  function builderSetFaction(fid) {
    if (fid === builder.faction) return;
    // Picking the Pact partner as the main faction swaps the two, so no cards are lost outright.
    const pact = builder.pact === fid ? builder.faction : builder.pact;
    builderReshape(fid, pact, builder.pact === fid
      ? `${facName(fid)} now leads, with ${facName(pact)} as Pact partner.`
      : `${facName(fid)} now leads this deck.`);
  }

  function builderSetPact(pid) {
    const pact = pid === 'none' ? null : pid;
    if (pact === builder.pact || pact === builder.faction) return;
    builderReshape(builder.faction, pact, pact ? `Pact signed with ${facName(pact)}.` : 'Pact dissolved.');
  }

  function builderLoadPreset(key) {
    const f = FACTIONS[builder.faction];
    const p = f.presets[key];
    if (!p) return;
    const apply = () => {
      builder.pact = p.pact || null;
      builder.doctrine = p.doctrine || 'standard';
      builder.counts = Decks.countsFromList(V.buildDeck(f.id, key));
      if (builder.src === 'pact') builder.src = 'all';
      builder.dirty = true;
      bdSay(`Loaded the ${p.name} preset.`);
      renderBuilder();
    };
    const n = builderList().length;
    if (!n) return apply();
    confirmModal('Load preset?', `This replaces the ${plural(n, 'card')} in this deck with the <b>${p.name}</b> preset.`, 'Load preset', apply);
  }

  /** Save the deck being edited (finished or not). Returns the saved deck if it is ready to play, else null. */
  function builderSave(asCopy) {
    const deck = builderDeck();
    deck.name = $('#bd-name').value;
    if (asCopy) { deck.id = null; deck.name = (deck.name.trim() || 'Deck') + ' copy'; }
    deck.name = Decks.uniqueName(Decks.normalize(deck).name, deck.id);
    const saved = Decks.saveDeck(deck);
    builder.id = saved.id;
    builder.name = saved.name;
    builder.dirty = false;
    $('#bd-name').value = saved.name;
    const v = Decks.validate(saved);
    bdSay(v.ok ? `Saved “${saved.name}”. It is ready to play.` : `Saved “${saved.name}” as unfinished — ${v.errors[0]}`, !v.ok);
    renderBuilder();
    return v.ok ? saved : null;
  }

  function builderUse() {
    const saved = builderSave(false);
    if (!saved) return;
    myFaction = saved.faction;
    myPreset = 'deck:' + saved.id;
    closeBuilder();
  }

  function builderDelete() {
    if (!builder.id) return;
    confirmModal('Delete deck?', `<b>${esc(builder.name)}</b> will be removed from your library. This cannot be undone.`, 'Delete deck', () => {
      const fid = builder.faction;
      const pick = 'deck:' + builder.id;
      Decks.deleteDeck(builder.id);
      Object.keys(prefs.picks).forEach((k) => { if (prefs.picks[k] === pick) delete prefs.picks[k]; });
      Decks.savePrefs(prefs);
      loadIntoBuilder(blankDeck(fid), 'Deck deleted. This is a new, empty deck.');
    });
  }

  function builderClear() {
    const n = builderList().length;
    if (!n) return;
    confirmModal('Clear deck?', `Remove all ${plural(n, 'card')} from this deck? (Nothing is saved until you press Save.)`, 'Clear deck', () => {
      builder.counts = {};
      builder.dirty = true;
      bdSay('Deck cleared.');
      renderBuilder();
    });
  }

  function builderExport() {
    const deck = builderDeck();
    const v = Decks.validate(deck);
    if (!v.ok) { bdSay(`Finish the deck before exporting it — ${v.errors[0]}`, true); return renderBuilderDeck(); }
    const code = Decks.encode(deck);
    const inp = $('#bd-code');
    inp.value = code;
    inp.select();
    bdSay('Deck code is in the box below — copy it to share this deck.');
    renderBuilderDeck();
    try {
      navigator.clipboard.writeText(code).then(() => {
        if (!builder) return;
        bdSay('Deck code copied to the clipboard (it is also in the box below).');
        renderBuilderDeck();
      }, () => {});
    } catch (err) { /* clipboard unavailable: the code stays selected in the box */ }
  }

  function builderImport() {
    const res = Decks.decode($('#bd-code').value);
    if (res.error) { bdSay('Import failed — ' + res.error, true); return renderBuilderDeck(); }
    guardDirty(() => loadIntoBuilder(
      { name: Decks.uniqueName(`Imported ${facName(res.faction)} deck`), faction: res.faction, pact: res.pact, doctrine: res.doctrine, cards: res.cards },
      'Deck imported. Press Save to add it to your library.', true));
  }

  /* ---- rendering ---- */
  function renderBuilder() {
    renderBuilderLibrary();
    renderBuilderSetup();
    renderBuilderFilters();
    renderBuilderGrid();
    renderBuilderDeck();
  }

  function renderBuilderLibrary() {
    const row = (d, on, unsaved) => {
      const v = Decks.validate(d);
      const pact = d.pact ? `<span class="bl-pact" title="Pact with ${facName(d.pact)}">+${FACTIONS[d.pact].art}</span>` : '';
      return `<div class="bl-row f-${d.faction} ${on ? 'on' : ''}" ${unsaved ? '' : `data-bdeck="${d.id}"`}
        title="${esc(d.name)} — ${facName(d.faction)}${d.pact ? ' with ' + facName(d.pact) : ''}">
        <span class="bl-art">${FACTIONS[d.faction].art}${pact}</span>
        <span class="bl-name">${esc(d.name)}${on && builder.dirty && !unsaved ? ' <i>· edited</i>' : ''}</span>
        <span class="bl-n ${v.ok ? 'ok' : ''}">${unsaved ? 'not saved' : v.ok ? '✔ ready' : d.cards.length + ' / ' + Decks.DECK_SIZE}</span>
      </div>`;
    };
    let html = Decks.library().map((d) => (d.id === builder.id ? row(builderDeck(), true, false) : row(d, false, false))).join('');
    if (!builder.id) html += row(builderDeck(), true, true);
    $('#bd-lib-list').innerHTML = html;
    const on = $('#bd-lib-list .bl-row.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function renderBuilderSetup() {
    const f = FACTIONS[builder.faction];
    const doc = DOCTRINES[builder.doctrine] || DOCTRINES.standard;
    const facChips = Object.values(FACTIONS).map((x) =>
      `<span class="chip f-${x.id} ${x.id === builder.faction ? 'on' : ''}" data-bfac="${x.id}" title="${x.leader} — ${x.power.name}: ${esc(x.power.text)}">${x.art} ${facName(x.id)}</span>`).join('');
    const pactChips = `<span class="chip f-neutral ${builder.pact ? '' : 'on'}" data-bpact="none">No Pact</span>` +
      Object.values(FACTIONS).filter((x) => x.id !== builder.faction).map((x) =>
        `<span class="chip f-${x.id} ${x.id === builder.pact ? 'on' : ''}" data-bpact="${x.id}">${x.art} ${facName(x.id)}</span>`).join('');
    const docChips = Object.values(DOCTRINES).map((d) =>
      `<span class="chip f-${f.id} ${builder.doctrine === d.id ? 'on' : ''}" data-bdoc="${d.id}" title="${esc(d.benefit)} (${esc(d.drawback)})">${d.icon} ${d.name}</span>`).join('');
    const presets = Object.keys(f.presets).map((pk) =>
      `<span class="chip f-${f.id}" data-bpre="${pk}" title="${esc(f.presets[pk].desc)}">${f.presets[pk].name}</span>`).join('');
    const pactNote = builder.pact
      ? `Up to <b>${Decks.PACT_LIMIT}</b> ${facName(builder.pact)} cards. Its Secret Project stays with its own faction.`
      : `Optional — add up to <b>${Decks.PACT_LIMIT}</b> cards from one other faction.`;
    $('#bd-setup').innerHTML = `
      <span class="label">Faction</span>
      <div class="chips">${facChips}</div>
      <div class="bd-note f-${f.id}">
        <span><b>${f.leader}</b> · ${f.power.art} ${f.power.name} (${f.power.cost}): ${f.power.text}</span>
        <span class="bd-presets"><span class="label">Load preset</span>${presets}</span>
      </div>
      <span class="label">Pact</span>
      <div class="bd-row"><div class="chips">${pactChips}</div><span class="bd-inline">${pactNote}</span></div>
      <span class="label">Social</span>
      <div class="bd-row"><div class="chips">${docChips}</div></div>
      <div class="bd-note"><span><b>${doc.icon} ${doc.name}:</b> ${doc.benefit}${doc.drawback !== 'None.' ? ` <i>(${doc.drawback})</i>` : ''}</span></div>`;
  }

  function renderBuilderFilters() {
    const chip = (attr, val, cur, label, cls) =>
      `<span class="chip ${cls || 'f-neutral'} ${cur === val ? 'on' : ''}" ${attr}="${val}">${label}</span>`;
    const src = [chip('data-bsrc', 'all', builder.src, 'All cards'), chip('data-bsrc', 'main', builder.src, facName(builder.faction), 'f-' + builder.faction)];
    if (builder.pact) src.push(chip('data-bsrc', 'pact', builder.src, 'Pact: ' + facName(builder.pact), 'f-' + builder.pact));
    src.push(chip('data-bsrc', 'neutral', builder.src, 'Colonist'));
    const types = [['all', 'Any type'], ['unit', 'Units'], ['order', 'Orders'], ['site', 'Locations'], ['project', 'Projects']]
      .map(([k, l]) => chip('data-btype', k, builder.type, l));
    const costs = [['all', 'Any cost'], ['1', '0–1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6+']]
      .map(([k, l]) => chip('data-bcost', k, builder.cost, l));
    $('#bd-filter-chips').innerHTML = `<div class="chips">${src.join('')}</div><div class="chips">${types.join('')}</div><div class="chips">${costs.join('')}</div>`;
  }

  function builderMatches(id) {
    const c = CARDS[id];
    if (builder.type === 'project' ? !c.project : builder.type !== 'all' && c.type !== builder.type) return false;
    if (builder.cost !== 'all') {
      const n = +builder.cost;
      if (n === 1 ? c.cost > 1 : n === 6 ? c.cost < 6 : c.cost !== n) return false;
    }
    const q = builder.search.trim().toLowerCase();
    if (!q) return true;
    const kws = Object.keys(c.kw || {}).map((k) => (KW[k] ? KW[k].name : k)).join(' ');
    const kind = c.project ? 'secret project location' : c.type === 'site' ? 'location' : c.type;
    const hay = `${c.name} ${String(c.text || '').replace(/<[^>]+>/g, '')} ${kws} ${kind}`.toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  }

  function renderBuilderGrid() {
    const deck = builderDeck();
    const groups = [['main', builder.faction, facName(builder.faction), '']];
    if (builder.pact) {
      groups.push(['pact', builder.pact, 'Pact · ' + facName(builder.pact),
        `<span id="bd-pact-n"></span> — no more than ${Decks.PACT_LIMIT} of these in the deck`]);
    }
    groups.push(['neutral', 'neutral', 'Colonist', 'open to every faction']);
    const pool = Decks.poolFor(builder.faction, builder.pact);
    let shown = 0;
    const html = groups.filter(([src]) => builder.src === 'all' || builder.src === src).map(([src, fid, label, note]) => {
      const ids = pool.filter((id) => Decks.source(deck, id) === src && builderMatches(id)).sort(byCost);
      shown += ids.length;
      if (!ids.length) return '';
      return `<div class="bd-group f-${fid}"><span class="g-name">${label}</span><span class="g-note">${plural(ids.length, 'card')}${note ? ' · ' + note : ''}</span></div>
        <div class="bd-cards">${ids.map((id) => `<div class="b-card-wrap" data-badd="${id}" data-card="${id}">
          <div class="b-count"></div>${cardHTML(CARDS[id])}</div>`).join('')}</div>`;
    }).join('');
    $('#bd-grid').innerHTML = shown ? html : '<div class="bd-empty">No cards match these filters.</div>';
    updateBuilderGrid();
  }

  /** Refresh the copy badges and dimming in the card pool without rebuilding it. */
  function updateBuilderGrid() {
    const deck = builderDeck();
    const pactN = Decks.pactCount(deck);
    document.querySelectorAll('#bd-grid .b-card-wrap').forEach((w) => {
      const id = w.dataset.badd;
      const cur = builder.counts[id] || 0;
      const max = Decks.copyLimit(id);
      const badge = w.firstElementChild;
      badge.textContent = `${cur}/${max}`;
      badge.classList.toggle('has', cur > 0);
      w.classList.toggle('maxed', cur >= max);
      w.classList.toggle('blocked', cur < max && Decks.source(deck, id) === 'pact' && pactN >= Decks.PACT_LIMIT);
    });
    const pn = $('#bd-pact-n');
    if (pn) pn.textContent = `${pactN} / ${Decks.PACT_LIMIT} in deck`;
  }

  function renderBuilderCounts() {
    updateBuilderGrid();
    renderBuilderDeck();
    renderBuilderLibrary();
  }

  function renderBuilderDeck() {
    const deck = builderDeck();
    const list = deck.cards;
    const total = list.length;
    const v = Decks.validate(deck);
    const pactN = v.pact;

    const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
    list.forEach((id) => { buckets[Math.min(7, CARDS[id].cost)]++; });
    const maxB = Math.max(1, ...buckets);
    const curve = buckets.map((n, i) => `
      <div class="curve-col">
        <div class="curve-n">${n || ''}</div>
        <div class="curve-bar" style="height:${Math.round((n / maxB) * 100)}%"></div>
        <div class="curve-n">${i === 7 ? '7+' : i}</div>
      </div>`).join('');

    const count = (fn) => list.filter((id) => fn(CARDS[id])).length;
    const units = count((c) => c.type === 'unit');
    const orders = count((c) => c.type === 'order');
    const projects = count((c) => c.project);
    const sites = count((c) => c.type === 'site') - projects;
    const heavy = count((c) => c.cost >= 5);

    // Rule problems (block play) and softer advice (does not).
    const issues = v.errors.filter((e) => !/^Deck must have/.test(e)).map((e) => `<div class="bd-issue err">${e}</div>`);
    if (total === Decks.DECK_SIZE && v.ok) {
      if (units < 10) issues.push(`<div class="bd-issue warn">Only ${plural(units, 'unit')} — your locations and colony will be hard to screen.</div>`);
      if (sites + projects === 0) issues.push('<div class="bd-issue warn">No locations besides the Landing Site.</div>');
      if (heavy > 9) issues.push(`<div class="bd-issue warn">${heavy} cards cost 5 or more — expect slow opening turns.</div>`);
    }

    $('#bd-stats').innerHTML = `
      <div class="bd-count">
        <strong class="${total === Decks.DECK_SIZE ? 'ok' : ''}">${total} / ${Decks.DECK_SIZE} cards</strong>
        ${builder.pact ? `<span class="bd-pactn f-${builder.pact} ${pactN > Decks.PACT_LIMIT ? 'over' : ''}">Pact ${pactN} / ${Decks.PACT_LIMIT}</span>` : '<span class="bd-pactn f-neutral">No Pact</span>'}
      </div>
      <div class="curve">${curve}</div>
      <div class="bd-types">${plural(units, 'unit')} · ${plural(orders, 'order')} · ${plural(sites, 'location')}${projects ? ' · ' + plural(projects, 'project') : ''}</div>
      ${issues.join('')}`;

    $('#bd-list').innerHTML = Object.keys(builder.counts).sort(byCost).map((id) => {
      const c = CARDS[id];
      const src = Decks.source(deck, id);
      return `<div class="b-row f-${c.faction} ${src ? '' : 'illegal'}" data-brem="${id}" data-card="${id}" title="Click to remove a copy">
        <span class="br-cost">${c.cost}</span>
        <span class="br-name">${c.art} ${c.name}</span>
        ${src === 'pact' ? '<span class="br-pact">Pact</span>' : ''}
        <span class="br-qty">×${builder.counts[id]}</span>
      </div>`;
    }).join('') || '<div class="bd-empty">Empty deck — click cards in the pool to add them.</div>';

    const msg = $('#bd-msg');
    msg.textContent = builder.msg || '';
    msg.classList.toggle('bad', !!builder.bad);
    $('#bd-play').disabled = !v.ok;
    $('#bd-play').textContent = v.ok ? 'Save & use this deck' : `Needs ${Decks.DECK_SIZE} legal cards to play`;
    $('#bd-export').disabled = !v.ok;
    $('#bd-delete').disabled = !builder.id;
    $('#bd-clear').disabled = !total;
  }

  /* ---- input ---- */
  $('#screen-builder').addEventListener('click', (e) => {
    if (!builder) return;
    const hit = (q) => e.target.closest(q);
    let el;
    if ((el = hit('[data-brem]'))) return builderRemove(el.dataset.brem);
    if ((el = hit('[data-badd]'))) return builderAdd(el.dataset.badd);
    if ((el = hit('[data-bfac]'))) { SFX.click(); return builderSetFaction(el.dataset.bfac); }
    if ((el = hit('[data-bpact]'))) { SFX.click(); return builderSetPact(el.dataset.bpact); }
    if ((el = hit('[data-bdoc]'))) {
      SFX.click();
      if (builder.doctrine !== el.dataset.bdoc) { builder.doctrine = el.dataset.bdoc; builder.dirty = true; }
      renderBuilderSetup();
      return renderBuilderLibrary();
    }
    if ((el = hit('[data-bpre]'))) { SFX.click(); return builderLoadPreset(el.dataset.bpre); }
    if ((el = hit('[data-bsrc]'))) { builder.src = el.dataset.bsrc; renderBuilderFilters(); renderBuilderGrid(); $('#bd-grid').scrollTop = 0; return; }
    if ((el = hit('[data-btype]'))) { builder.type = el.dataset.btype; renderBuilderFilters(); renderBuilderGrid(); $('#bd-grid').scrollTop = 0; return; }
    if ((el = hit('[data-bcost]'))) { builder.cost = el.dataset.bcost; renderBuilderFilters(); renderBuilderGrid(); $('#bd-grid').scrollTop = 0; return; }
    if ((el = hit('[data-bdeck]'))) {
      const id = el.dataset.bdeck;
      if (id === builder.id) return;
      SFX.click();
      return guardDirty(() => { const d = Decks.getDeck(id); if (d) loadIntoBuilder(d); });
    }
    if (hit('#bd-back')) { SFX.click(); return guardDirty(closeBuilder); }
    if (hit('#bd-new')) { SFX.click(); return guardDirty(() => loadIntoBuilder(blankDeck(builder.faction), 'New empty deck. ' + BUILDER_HINT)); }
    if (hit('#bd-save')) { SFX.click(); return builderSave(false); }
    if (hit('#bd-copy')) { SFX.click(); return builderSave(true); }
    if (hit('#bd-clear')) return builderClear();
    if (hit('#bd-delete')) return builderDelete();
    if (hit('#bd-export')) return builderExport();
    if (hit('#bd-import')) return builderImport();
    if (hit('#bd-play')) { SFX.click(); return builderUse(); }
  });

  $('#screen-builder').addEventListener('contextmenu', (e) => {
    const el = e.target.closest('[data-badd],[data-brem]');
    if (!el || !builder) return;
    e.preventDefault();
    builderRemove(el.dataset.badd || el.dataset.brem);
  });

  $('#bd-search').addEventListener('input', (e) => {
    if (!builder) return;
    builder.search = e.target.value;
    renderBuilderGrid();
    $('#bd-grid').scrollTop = 0;
  });

  $('#bd-name').addEventListener('input', (e) => {
    if (!builder) return;
    builder.name = e.target.value.trim() || 'Untitled deck';
    builder.dirty = true;
    renderBuilderLibrary();
  });

  /* ============================================================ Planetary Conquest Campaign */
  function showCampaignModal() {
    const prog = Decks.getCampaignProgress();
    const f = FACTIONS[myFaction];
    openModal(`<div class="camp-wrap">
      <h2>🪐 Planetary Conquest</h2>
      <p>Lead <b>${f.name}</b> across all seven regions of Tau Ceti. Each rival holds a fortified biome with a signature Social Engineering policy and deck. (${prog.cleared.length} / ${CAMPAIGN.length} sectors conquered)</p>
      <div class="camp-grid">
        ${CAMPAIGN.map((m) => {
          const done = prog.cleared.includes(m.id);
          const ofac = FACTIONS[m.opp];
          const biome = BIOMES[m.biome];
          const doc = DOCTRINES[m.oppDoctrine];
          return `<div class="camp-card ${m.bossName ? 'f-boss' : 'f-' + m.opp} ${done ? 'cleared' : ''}">
            <div class="camp-head">
              <div class="camp-title">${m.num}. ${m.title}</div>
              <div class="camp-badge">${done ? '✔ Conquered' : m.region}</div>
            </div>
            <div class="camp-meta">Rival: <b>${m.bossArt || ofac.art} ${m.bossName || ofac.leader}</b> (${m.oppHp} HP) · ${biome.icon} ${biome.name} · ${doc.icon} ${doc.name}</div>
            <div class="camp-brief">${m.brief}</div>
            <button class="btn ${done ? 'ghost' : 'primary'} small" data-camp="${m.id}">${done ? 'Replay Sector' : 'Deploy to Sector'}</button>
          </div>`;
        }).join('')}
      </div>
      <div class="modal-actions"><button class="btn ghost" data-do="close">Back</button></div>
    </div>`);
  }

  function launchCampaignMission(m) {
    activeMode = { kind: 'campaign', mission: m };
    const mine = activeDeck();
    const oppDeck = V.buildDeck(m.opp, m.oppPreset);
    startGame({
      opp: m.opp,
      biome: m.biome,
      deck0: mine.cards,
      pact0: mine.pact,
      deck1: oppDeck,
      doctrine0: myDoctrine,
      doctrine1: m.oppDoctrine,
      hp1: m.oppHp,
      bossName: m.bossName,
      bossArt: m.bossArt,
    });
  }

  /* ============================================================ Expedition Draft Mode */
  function showDraftModal() {
    const run = Decks.getDraft();
    const f = FACTIONS[myFaction];
    if (!run) {
      openModal(`<div class="draft-wrap">
        <h2>🚀 Expedition Draft</h2>
        <p>Start with an 18-card core deck for <b>${f.name}</b> (${DOCTRINES[myDoctrine].name}) and battle 5 escalating rivals across Tau Ceti. Before every battle, draft a 3-card supply bundle—including Secret Projects and cross-faction mercenaries!</p>
        <div class="modal-actions">
          <button class="btn ghost" data-do="close">Cancel</button>
          <button class="btn primary" data-do="draft-new">Begin Expedition (${f.art} ${f.name})</button>
        </div>
      </div>`);
      return;
    }

    const rf = FACTIONS[run.fid];
    if (run.stage >= 5) {
      openModal(`<div class="result win">
        <div class="big">🏆</div>
        <h2>Expedition Complete!</h2>
        <p>${rf.name} conquered all 5 frontier sectors with a ${run.deck.length}-card drafted army.</p>
        <div class="modal-actions">
          <button class="btn ghost" data-do="close">Close</button>
          <button class="btn primary" data-do="draft-abandon">Start New Expedition</button>
        </div>
      </div>`);
      return;
    }

    if (run.pendingDraft) {
      openModal(`<div class="draft-wrap f-${run.fid}">
        <h2 style="color:var(--fc)">🚀 Expedition Draft · Stage ${run.stage + 1} / 5</h2>
        <p>Your expedition deck currently holds <b>${run.deck.length} cards</b>. Choose one 3-card supply bundle to add before facing <b>${FACTIONS[run.opps[run.stage]].name}</b>:</p>
        <div class="draft-packs">
          ${run.pendingDraft.map((pack, idx) => `
            <div class="draft-pack" data-dpick="${idx}">
              <div class="camp-badge">${pack.tag}</div>
              <strong style="font-size:1.7rem;color:var(--gold)">${pack.title}</strong>
              <div class="draft-pack-cards">${pack.cards.map((id) => cardHTML(CARDS[id])).join('')}</div>
              <button class="btn primary small">Draft Bundle</button>
            </div>`).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn ghost" data-do="close">Back</button>
          <button class="btn ghost" data-do="draft-abandon">Abandon Run</button>
        </div>
      </div>`);
      return;
    }

    const opp = FACTIONS[run.opps[run.stage]];
    const biome = BIOMES[run.biomes[run.stage]];
    openModal(`<div class="draft-wrap f-${run.fid}">
      <h2 style="color:var(--fc)">🚀 Expedition Ready · Battle ${run.stage + 1} / 5</h2>
      <p><b>${rf.art} ${rf.name}</b> (${run.deck.length} cards · ${DOCTRINES[run.doctrine].name}) vs <b>${opp.art} ${opp.name}</b> on <b>${biome.icon} ${biome.name}</b>.</p>
      <div class="modal-actions">
        <button class="btn ghost" data-do="draft-abandon">Abandon Run</button>
        <button class="btn ghost" data-do="close">Back</button>
        <button class="btn primary" data-do="draft-fight">Launch Battle ${run.stage + 1}</button>
      </div>
    </div>`);
  }

  function launchDraftBattle() {
    const run = Decks.getDraft();
    if (!run) return;
    activeMode = { kind: 'draft', stage: run.stage };
    const oppFid = run.opps[run.stage];
    const oppPresets = Object.keys(FACTIONS[oppFid].presets);
    const oppPreset = oppPresets[run.stage % oppPresets.length];
    startGame({
      myFac: run.fid,
      opp: oppFid,
      biome: run.biomes[run.stage],
      deck0: run.deck.slice(),
      preset1: oppPreset,
      doctrine0: run.doctrine,
      doctrine1: FACTIONS[oppFid].presets[oppPreset].doctrine || 'standard',
      hp1: 24 + run.stage * 2,
    });
  }

  function startCurrentModeAgain() {
    if (activeMode.kind === 'campaign' && activeMode.mission) return launchCampaignMission(activeMode.mission);
    if (activeMode.kind === 'draft') return launchDraftBattle();
    startGame();
  }

  function gameOver() {
    render();
    const win = g.winner === HUMAN;
    const tie = g.winner === -1;
    if (win) SFX.win(); else SFX.lose();

    const f = FACTIONS[g.players[HUMAN].faction];
    const ascent = g.winReason === 'ascent';
    const title = tie ? 'Mutual Ruin' : win ? (ascent ? 'Transcendence' : 'Victory') : (ascent ? 'Enemy Transcendence' : 'Defeat');
    let text = tie
      ? 'Both colonies fall silent in the same hour. Planet keeps what is left.'
      : win
        ? (ascent ? 'The Voice of Planet harmonizes with your Datalinks. Humanity transcends the dust.' : `${f.name} will decide what Planet becomes. The other survivors can only watch.`)
        : (ascent ? 'The enemy achieved Transcendence through The Voice of Planet.' : `The enemy banner rises over your last habitat. ${f.leader} is led away in silence.`);

    let actions = `<button class="btn ghost" data-do="title">Title screen</button>
      <button class="btn primary" data-do="rematch">Play again</button>`;

    if (activeMode.kind === 'campaign' && activeMode.mission && win) {
      Decks.markMissionCleared(activeMode.mission.id);
      text = activeMode.mission.victory;
      const nextIdx = CAMPAIGN.findIndex((x) => x.id === activeMode.mission.id) + 1;
      actions = `<button class="btn ghost" data-do="title">Title screen</button>
        ${CAMPAIGN[nextIdx] ? '<button class="btn primary" data-do="next-camp">Next Sector →</button>' : '<button class="btn primary" data-do="title">Campaign Complete!</button>'}`;
    } else if (activeMode.kind === 'draft') {
      const run = Decks.getDraft();
      if (run) {
        if (win) {
          run.wins++;
          run.stage++;
          if (run.stage < 5) run.pendingDraft = Decks.rollDraftOptions(run.fid, run.deck, run.stage);
          Decks.saveDraft(run);
          actions = `<button class="btn ghost" data-do="title">Title screen</button>
            <button class="btn primary" data-do="draft-continue">${run.stage < 5 ? 'Draft Next Bundle →' : 'Finish Expedition!'}</button>`;
        } else {
          Decks.clearDraft();
          text = `Your Expedition fell on Battle ${run.stage + 1} of 5. The frontier claims another convoy.`;
          actions = `<button class="btn ghost" data-do="title">Title screen</button>
            <button class="btn primary" data-do="draft-continue">New Expedition</button>`;
        }
      }
    }

    setTimeout(() => openModal(`<div class="result ${win ? 'win' : 'lose'}">
      <div class="big">${tie ? '🌑' : win ? (ascent ? '🌠' : f.art) : '💥'}</div>
      <h2>${title}</h2>
      <p>${text}</p>
      <p style="color:var(--muted)">The duel lasted ${Math.ceil(g.turn / 2)} cycles.</p>
      <div class="modal-actions">${actions}</div>
    </div>`, false), 850 * speed);
  }

  /* ============================================================ title screen */
  function renderTitle() {
    $('#faction-list').innerHTML = Object.values(FACTIONS).map((f) => {
      const lid = 'leader_' + f.id;
      const lArt = hasArt(lid);
      return `
      <div class="faction f-${f.id} ${f.id === myFaction ? 'chosen' : ''}" data-faction="${f.id}">
        <div class="f-glyph ${lArt ? 'has-art' : ''}">${lArt ? artImg(lid) : f.art}</div>
        <div class="f-name">${f.name}</div>
        <div class="f-leader">${f.leader}</div>
        <div class="f-motto">“${f.motto}”</div>
        <div class="f-style">${f.style}</div>
        <div class="f-power"><span>${f.power.art} ${f.power.name} (${f.power.cost})</span>${f.power.text}</div>
        <button class="btn ghost small f-deck" data-deck="${f.id}">View deck</button>
      </div>`;
    }).join('');

    const f = FACTIONS[myFaction];
    const curDeck = activeDeck();
    if (curDeck.pick !== myPreset) pickDeck(curDeck.pick); // the saved deck was deleted or is no longer playable
    const deckOpts = Object.keys(f.presets).map((pk) => ({ id: pk, name: esc(f.presets[pk].name) + (f.presets[pk].pact ? ' +' + FACTIONS[f.presets[pk].pact].art : ''), tip: f.presets[pk].desc }))
      .concat(Decks.playableFor(myFaction).map((d) => ({
        id: 'deck:' + d.id,
        name: '★ ' + esc(d.name) + (d.pact ? ' +' + FACTIONS[d.pact].art : ''),
        tip: d.pact ? 'Your deck — Pact with ' + facName(d.pact) : 'Your deck',
      })));
    $('#deck-chips').innerHTML = deckOpts.map((o) =>
      `<span class="chip f-${myFaction} ${o.id === myPreset ? 'on' : ''}" data-preset="${o.id}" title="${esc(o.tip)}">${o.name}</span>`).join('');

    $('#doc-chips').innerHTML = Object.values(DOCTRINES).map((d) =>
      `<span class="chip f-${myFaction} ${d.id === myDoctrine ? 'on' : ''}" data-doc="${d.id}">${d.icon} ${d.name}</span>`).join('');

    const oppOpts = [{ id: 'random', name: 'Random' }].concat(Object.values(FACTIONS).map((x) => ({ id: x.id, name: facName(x.id) })));
    $('#opp-chips').innerHTML = oppOpts.map((o) =>
      `<span class="chip f-${o.id === 'random' ? 'neutral' : o.id} ${o.id === oppChoice ? 'on' : ''}" data-opp="${o.id}">${o.name}</span>`).join('');

    $('#biome-chips').innerHTML = Object.values(BIOMES).map((b) =>
      `<span class="chip f-neutral ${b.id === myBiome ? 'on' : ''}" data-biome="${b.id}">${b.icon} ${b.name}</span>`).join('');

    const diffs = [
      ['colonist', 'Colonist', 'Takes one action at a time, and makes mistakes.'],
      ['commander', 'Commander', 'Takes the best single action it can see, one at a time.'],
      ['transcend', 'Transcend', 'Plans its whole turn before it moves. Much the strongest.'],
    ];
    $('#diff-chips').innerHTML = diffs.map(([id, name, tip]) =>
      `<span class="chip f-neutral ${id === myDiff ? 'on' : ''}" data-diff="${id}" title="${tip}">${name}</span>`).join('');

    const doc = DOCTRINES[myDoctrine] || DOCTRINES.standard;
    const biome = BIOMES[myBiome] || BIOMES.tau_ceti;
    const deckDesc = curDeck.desc;
    $('#setup-desc').innerHTML = `
      <span><b>Deck:</b> ${deckDesc}</span>
      <span><b>${doc.icon} ${doc.name}:</b> ${doc.benefit} ${doc.drawback !== 'None.' ? '(' + doc.drawback + ')' : ''}</span>
      <span><b>${biome.icon} ${biome.name}:</b> ${biome.desc}</span>`;

    const campProg = Decks.getCampaignProgress();
    $('#btn-campaign').textContent = `Planetary Conquest (${campProg.cleared.length}/${CAMPAIGN.length})`;
    const activeDraft = Decks.getDraft();
    $('#btn-draft').textContent = activeDraft ? `Continue Expedition (${activeDraft.stage + 1}/5)` : 'Expedition Draft';
  }

  function showTitle() {
    g = null;
    activeMode = { kind: 'skirmish' };
    $('#screen-game').classList.add('hidden');
    $('#screen-title').classList.remove('hidden');
    renderTitle();
  }

  $('#screen-title').addEventListener('click', (e) => {
    const deck = e.target.closest('[data-deck]');
    if (deck) { SFX.click(); return showDeck(deck.dataset.deck); }
    const fac = e.target.closest('[data-faction]');
    if (fac) { SFX.click(); syncFactionDefaults(fac.dataset.faction); return renderTitle(); }
    const pre = e.target.closest('[data-preset]');
    if (pre) {
      SFX.click();
      pickDeck(pre.dataset.preset);
      return renderTitle();
    }
    const doc = e.target.closest('[data-doc]');
    if (doc) { SFX.click(); myDoctrine = doc.dataset.doc; return renderTitle(); }
    const opp = e.target.closest('[data-opp]');
    if (opp) { SFX.click(); oppChoice = opp.dataset.opp; return renderTitle(); }
    const bio = e.target.closest('[data-biome]');
    if (bio) { SFX.click(); myBiome = bio.dataset.biome; return renderTitle(); }
    const dif = e.target.closest('[data-diff]');
    if (dif) { SFX.click(); myDiff = dif.dataset.diff; return renderTitle(); }
  });

  $('#btn-builder').addEventListener('click', () => { SFX.click(); openBuilder(); });
  $('#btn-campaign').addEventListener('click', () => { SFX.click(); showCampaignModal(); });
  $('#btn-draft').addEventListener('click', () => { SFX.click(); showDraftModal(); });
  $('#btn-start').addEventListener('click', () => { activeMode = { kind: 'skirmish' }; startGame(); });
  $('#btn-help').addEventListener('click', () => { SFX.click(); showHelp(); });
  $('#btn-help2').addEventListener('click', () => { SFX.click(); showHelp(); });
  $('#btn-mute').addEventListener('click', () => { SFX.toggle(); renderMid(); });
  $('#btn-quit').addEventListener('click', () => {
    openModal(`<div class="result"><h2 style="font-size:3.4rem">Abandon the colony?</h2>
      <p>This duel will be lost.</p>
      <div class="modal-actions">
        <button class="btn ghost" data-do="close">Keep fighting</button>
        <button class="btn primary" data-do="title">Concede</button>
      </div></div>`);
  });

  function startGame(o) {
    o = o || {};
    const ids = Object.keys(FACTIONS);
    const p0Fac = o.myFac || myFaction;
    const opp = o.opp || (oppChoice === 'random' ? ids[Math.floor(Math.random() * ids.length)] : oppChoice);
    const oppPresets = Object.keys(FACTIONS[opp].presets);
    const oppPre = o.preset1 || oppPresets[Math.floor(Math.random() * oppPresets.length)];
    const seed = o.seed || ((Math.random() * 0x7fffffff) | 0) + 1;
    const first = o.first != null ? o.first : Math.random() < 0.5 ? 0 : 1;

    // A deck passed in (campaign, Expedition Draft) brings its own pact; otherwise use the deck picked on the title screen.
    const mine = o.deck0 ? null : deckFor(p0Fac, p0Fac === myFaction ? myPreset : null);
    const deck0 = o.deck0 || mine.cards;
    const pact0 = o.deck0 ? (o.pact0 || null) : mine.pact;
    const doc0 = o.doctrine0 || myDoctrine;
    const doc1 = o.doctrine1 || FACTIONS[opp].presets[oppPre].doctrine || 'standard';
    const biome = o.biome || myBiome;

    g = E.newGame(p0Fac, opp, seed, first, {
      biome,
      deck0,
      pact0,
      deck1: o.deck1,
      preset1: oppPre,
      doctrine0: doc0,
      doctrine1: doc1,
      hp0: o.hp0,
      hp1: o.hp1,
      bossName: o.bossName,
      bossArt: o.bossArt,
    });
    sel = null;
    hintMsg = null;
    seen = new Set();
    logEl.innerHTML = '';
    $('#inspector').innerHTML = '<div class="insp-empty">Hover a card, unit, location, or lane terrain to inspect it.</div>';
    $('#screen-title').classList.add('hidden');
    $('#screen-game').classList.remove('hidden');
    logLine(`${FACTIONS[p0Fac].name} versus ${o.bossName || FACTIONS[opp].name} on ${BIOMES[biome].name}.`, 'sys');
    if (g.active === BOT) logLine('The enemy moves first. You start with two extra cards and an Energy Cell.', 'sys');
    else logLine('You move first. The enemy starts with two extra cards and an Energy Cell.', 'sys');

    if (o.auto) fastForward(o.auto);
    busy = true;
    flush();
    if (g.over) { busy = false; return gameOver(); }
    (async () => {
      if (g.active === HUMAN) {
        await banner('Your Turn');
        busy = false;
        render();
      } else {
        await banner('Enemy Turn', true);
        await botTurn();
      }
    })();
  }

  function fastForward(n) {
    let guard = 0;
    while (!g.over && (g.turn < n || g.active !== HUMAN) && guard++ < 400) {
      const pid = g.active;
      let a, k = 0;
      while (!g.over && (a = AI.choose(g, pid)) && k++ < 80) AI.apply(g, pid, a);
      if (!g.over) E.endTurn(g, pid);
    }
    g.events.length = 0;
  }

  /* ============================================================ boot */
  syncFactionDefaults(FACTIONS[prefs.faction] ? prefs.faction : myFaction);
  renderTitle();
  const q = new URLSearchParams(location.search);
  if (q.get('f') && FACTIONS[q.get('f')]) {
    syncFactionDefaults(q.get('f'));
    if (q.get('o') && FACTIONS[q.get('o')]) oppChoice = q.get('o');
    if (q.get('biome') && BIOMES[q.get('biome')]) myBiome = q.get('biome');
    startGame({
      seed: +q.get('seed') || undefined,
      first: q.get('first') != null ? +q.get('first') : undefined,
      auto: +q.get('auto') || 0,
    });
  }
  if (q.get('modal') === 'help') showHelp();
  if (q.get('modal') === 'deck') showDeck(myFaction);
  if (q.get('modal') === 'builder') openBuilder();
  if (q.get('modal') === 'campaign') showCampaignModal();
  if (q.get('modal') === 'draft') showDraftModal();
  window.TauCetiUI = { get game() { return g; }, startGame, showTitle };
})();
