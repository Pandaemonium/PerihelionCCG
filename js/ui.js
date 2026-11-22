/* TAU CETI — browser UI: title screen, deckbuilder, campaign, expedition draft, battlefield, inspector, FX. */
(function () {
  'use strict';
  const V = window.TauCeti;
  const E = V.Engine, AI = V.AI, CARDS = V.CARDS, FACTIONS = V.FACTIONS, KW = V.KEYWORDS;
  const TERRAIN = V.TERRAIN, BIOMES = V.BIOMES, DOCTRINES = V.DOCTRINES, CAMPAIGN = V.CAMPAIGN;
  const Decks = V.Decks, SFX = V.SFX;
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
  let myPreset = 'swarm'; // preset key or 'custom'
  let myDoctrine = 'green';
  let oppChoice = 'random';
  let myBiome = 'tau_ceti';
  let myDiff = 'commander';
  let activeMode = { kind: 'skirmish' }; // { kind: 'skirmish' | 'campaign' | 'draft', mission?, draft? }
  let speed = 1;

  // Deckbuilder working state
  let builder = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * speed));
  const locked = () => busy || !g || g.over || g.active !== HUMAN;
  const facName = (id) => (id === 'neutral' ? 'Colonist' : FACTIONS[id].name.replace(/^The /, ''));
  const laneName = (lane) => 'lane ' + (lane + 1);

  const POD_TEXT = {
    cells: 'Energy Cache (+2 Reserve Cells)',
    research: 'Black-Box Core (+2 Research)',
    medkit: 'Med-Kit Pod (+4 HP / +3 Armor)',
    upgrade: 'Field Upgrade (+1/+1 & Shielded)',
    worm: 'Dormant Brood (2/2 Psi Mind Worm)',
  };

  function getActiveDeckList(fid, presetKey) {
    if (presetKey === 'custom') {
      const saved = Decks.getCustom(fid);
      if (saved) return saved.cards.slice();
    }
    return V.buildDeck(fid, presetKey);
  }

  function syncFactionDefaults(fid) {
    myFaction = fid;
    const custom = Decks.getCustom(fid);
    const f = FACTIONS[fid];
    const firstKey = Object.keys(f.presets)[0];
    if (custom) {
      myPreset = 'custom';
      myDoctrine = custom.doctrine || 'standard';
    } else {
      myPreset = firstKey;
      myDoctrine = f.presets[firstKey].doctrine || 'standard';
    }
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
      <div class="c-type">${kind} · ${facName(d.faction)}</div>
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
      <div class="u-kw">${kws.join('')}</div>
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
      ticks += `<span class="r-tick ascent ${p.research >= E.ASCENT_RESEARCH ? 'on' : ''}" style="left:100%" title="Ascent Victory (${E.ASCENT_RESEARCH})">★</span>`;
    }

    const usable = pid === HUMAN && !locked() && E.canUsePower(g, pid);
    const pcls = ['power'];
    if (usable) pcls.push('usable');
    if (p.powerUsed) pcls.push('used');
    if (sel && sel.kind === 'power' && pid === HUMAN) pcls.push('selected');
    const tcls = isTarget({ k: 'l', pid }) ? 'targetable ' + (pid === HUMAN ? 'friendly' : 'hostile') : '';
    const docTag = p.doctrine !== 'standard' ? ` · ${doc.icon} ${doc.name}` : '';

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
            <div class="l-fac">${f.name}${docTag}</div>
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

      html += `<div class="${lcls.join(' ')}" data-lane="${lane}">
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
    [/Ascent:/, 'Ascent', `Win the game immediately upon reaching ${E.ASCENT_RESEARCH} Research while The Voice of Tau Ceti stands.`],
    [/stationed|staffed/, 'Stationed', 'A unit is stationed at a location while standing in the same lane.'],
    [/Reserve Cell/, 'Reserve Cell', 'A free Order that gives 1 Energy this turn.'],
    [/Supply Pod/, 'Supply Pod', 'First unit to deploy or move into the lane claims a random orbital reward.'],
    [/Armor/, 'Armor', 'Absorbs non-Psi damage to your colony before its integrity.'],
    [/Xenofungus/, 'Xenofungus', 'Cycle End: Non-native units take 1 damage; Rootbound/Native units heal 1.'],
    [/High Ridge/, 'High Ridge', 'Units in this lane gain +1 Reach.'],
    [/Thermal Borehole/, 'Thermal Borehole', 'Cycle Start: +1 Energy if a unit is here; your Location here takes 1 damage.'],
    [/Sensor Array/, 'Sensor Array', 'Units in this lane gain Interceptor (blocks Aerial).'],
    [/neighbouring/, 'Neighbouring lanes', 'The lanes directly left and right.'],
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
      return `<div style="border-left:2px solid #ff6b6b;background:rgba(255,107,107,0.12)"><b>⚔️ Combat Preview</b><br>Deals: <b>${dealTxt}</b> · Takes: <b>${takeTxt}</b></div>`;
    }
    if (ref.k === 's') {
      const sf = E.findSite(g, ref.uid);
      const hp = sf ? sf.site.hp : 0;
      return `<div style="border-left:2px solid #ff6b6b;background:rgba(255,107,107,0.12)"><b>⚔️ Raid Preview</b><br>Deals <b>${aAtk}</b> to location${aAtk >= hp ? ' — RAZES!' : ''}.</div>`;
    }
    return `<div style="border-left:2px solid #ff6b6b;background:rgba(255,107,107,0.12)"><b>⚔️ Strike Preview</b><br>Deals <b>${aAtk}${aPsi ? ' Psi' : ''}</b> to enemy colony.</div>`;
  }

  function inspectCard(id, o) {
    const d = CARDS[id];
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
    $('#inspector').innerHTML = cardHTML(d, opt) + `<div class="insp-notes">${[...new Set(notes)].join('')}</div>`;
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
          <div><b>${E.ASCENT_RESEARCH} Research + Voice of Tau Ceti</b> — Instant Ascent Victory!</div>
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
        <div class="insp-notes">${prev}<div><b>${doc.icon} ${doc.name}</b> — ${doc.benefit} ${doc.drawback !== 'None.' ? '<i>(' + doc.drawback + ')</i>' : ''}</div></div>`;
    }
    $('#inspector').innerHTML = `<div class="insp-leader f-${p.faction}">${html}</div>`;
  }

  document.addEventListener('mouseover', (e) => {
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
  function refName(ref) {
    if (ref.k === 'l') return ref.pid === HUMAN ? 'your colony' : 'the enemy colony';
    if (ref.k === 'c') return laneName(ref.lane);
    if (ref.k === 's') {
      const f = E.findSite(g, ref.uid);
      return f ? (f.pid === HUMAN ? 'your ' : 'the enemy ') + CARDS[f.site.id].name : 'a location';
    }
    const f = E.find(g, ref.uid);
    return f ? (f.pid === HUMAN ? 'your ' : 'the enemy ') + CARDS[f.unit.id].name : 'a unit';
  }

  function floater(rect, e, i) {
    const d = document.createElement('div');
    d.className = 'floater ' + (e.psi ? 'psi' : e.t);
    d.textContent = e.t === 'dmg' ? (e.psi ? '✦-' + e.n : '-' + e.n)
      : e.t === 'heal' ? '+' + e.n
      : e.t === 'armor' ? '🛡+' + e.n
      : e.t === 'jam' ? '⊘ JAM'
      : e.t === 'promote' ? '★ VETERAN'
      : 'BLOCKED';
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
    evs.forEach((e) => {
      const foe = e.pid === BOT ? 'foe' : '';
      if (e.t === 'dmg' || e.t === 'heal' || e.t === 'block' || e.t === 'armor' || e.t === 'jam' || e.t === 'promote') {
        const el = elFor(e.ref);
        pend.push({ e, rect: el ? el.getBoundingClientRect() : null });
        if (e.t === 'dmg') (e.psi ? SFX.psi() : SFX.dmg());
        else if (e.t === 'heal') SFX.heal();
        else if (e.t === 'block') SFX.block();
        else if (e.t === 'promote') { SFX.milestone(); logLine(`${whose(e.pid)} <b>${CARDS[e.id].name}</b> promoted to Veteran!`, 'gold'); }
      } else if (e.t === 'death') {
        const el = elFor(e.ref);
        if (el) ghost(el);
        logLine(`${whose(e.pid)} ${CARDS[e.id].name} is destroyed.`, foe);
      } else if (e.t === 'raze') {
        const el = elFor(e.ref);
        if (el) ghost(el);
        SFX.raze();
        logLine(`${whose(e.pid)} ${CARDS[e.id].name} is razed — the colony takes ${e.dmg || E.RAZE_DAMAGE} damage.`, foe);
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
        logLine(`${who(e.pid)} completed Secret Project: <b>${c.name}</b>!`, 'gold');
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
        logLine(`${e.pid === HUMAN ? 'Your' : "The enemy's"} hand is full — ${e.pid === HUMAN ? CARDS[e.id].name : 'a card'} is lost.`, 'sys');
      } else if (e.t === 'gain' && e.pid === HUMAN) {
        logLine(`You receive <b>${CARDS[e.id].name}</b>.`);
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
      logLine(`${whose(pid)} ${CARDS[f.unit.id].name} attacks ${refName(a.target)}.`, foe);
      await lunge(elFor({ k: 'u', uid: a.uid }), elFor(a.target));
      E.attack(g, pid, a.uid, a.target);
    } else if (a.type === 'move') {
      const f = E.find(g, a.uid);
      logLine(`${whose(pid)} ${CARDS[f.unit.id].name} moves to ${laneName(a.lane)}.`, foe);
      E.move(g, pid, a.uid, a.lane);
    } else if (a.type === 'play') {
      const hc = g.players[pid].hand.find((h) => h.uid === a.hand);
      const d = CARDS[hc.id];
      const verb = d.type === 'unit' ? ['deploy', 'deploys'] : d.type === 'site' ? ['build', 'builds'] : ['play', 'plays'];
      const where = a.lane != null ? ' in ' + laneName(a.lane) : '';
      logLine(`${who(pid)} ${verb[pid === HUMAN ? 0 : 1]} <b>${d.name}</b>${where}${a.target ? (where ? ', targeting ' : ' on ') + refName(a.target) : ''}.`, foe);
      if (d.type === 'site') SFX.build(); else SFX.play();
      if (pid === BOT) await flash(cardHTML(d, { cost: E.cost(g, pid, hc) }), a.target || (a.lane != null ? { k: 'c', lane: a.lane } : null), 'Enemy plays');
      E.playCard(g, pid, a.hand, a.target, a.lane);
    } else if (a.type === 'power') {
      const f = FACTIONS[g.players[pid].faction];
      SFX.play();
      logLine(`${who(pid)} ${pid === HUMAN ? 'use' : 'uses'} <b>${f.power.name}</b>${a.target ? ' on ' + refName(a.target) : ''}.`, foe);
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
    if (E.hasKw(g, u, 'aerial') && front.some((x) => E.hasKw(g, x, 'interceptor'))) {
      return warn('An enemy Interceptor is opposite or adjacent — it screens locations and the colony against Aerial units.');
    }
    if (front.length && !E.hasKw(g, u, 'aerial')) return warn('An enemy unit is opposite or adjacent — it screens the locations and colony behind it.');
    return warn('That location is out of reach.');
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
  function openModal(html, closable) {
    modalClosable = closable !== false;
    $('#modal-box').innerHTML = html;
    $('#modal').classList.remove('hidden');
    $('#modal-box').scrollTop = 0;
  }
  function closeModal() { $('#modal').classList.add('hidden'); }

  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal' && modalClosable) return closeModal();

    // Deckbuilder interactions
    const addCard = e.target.closest('[data-badd]');
    if (addCard && builder) return builderAdd(addCard.dataset.badd);
    const remCard = e.target.closest('[data-brem]');
    if (remCard && builder) return builderRemove(remCard.dataset.brem);
    const bfil = e.target.closest('[data-bfil]');
    if (bfil && builder) { builder.filter = bfil.dataset.bfil; return renderBuilder(); }
    const bpre = e.target.closest('[data-bpre]');
    if (bpre && builder) {
      const f = FACTIONS[builder.fid];
      builder.counts = Decks.countsFromList(V.buildDeck(builder.fid, bpre.dataset.bpre));
      builder.doctrine = f.presets[bpre.dataset.bpre].doctrine || 'standard';
      builder.msg = `Loaded preset: ${f.presets[bpre.dataset.bpre].name}.`;
      return renderBuilder();
    }
    const bdoc = e.target.closest('[data-bdoc]');
    if (bdoc && builder) { builder.doctrine = bdoc.dataset.bdoc; return renderBuilder(); }

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
    if (what === 'bsave' && builder) {
      const list = Decks.listFromCounts(builder.counts);
      const val = Decks.validate(builder.fid, list);
      if (!val.ok) { builder.msg = val.errors[0]; return renderBuilder(); }
      Decks.saveCustom(builder.fid, list, builder.doctrine);
      myFaction = builder.fid;
      myPreset = 'custom';
      myDoctrine = builder.doctrine;
      builder = null;
      closeModal();
      renderTitle();
      return;
    }
    if (what === 'bclear' && builder) { builder.counts = {}; builder.msg = 'Deck cleared.'; return renderBuilder(); }
    if (what === 'bexport' && builder) {
      const code = Decks.encode(builder.fid, builder.doctrine, Decks.listFromCounts(builder.counts));
      const inp = $('#b-code');
      if (inp) { inp.value = code; inp.select(); }
      try { navigator.clipboard.writeText(code); builder.msg = 'Deck code copied to clipboard!'; }
      catch (err) { builder.msg = 'Deck code generated below.'; }
      renderBuilder(code);
      return;
    }
    if (what === 'bimport' && builder) {
      const inp = $('#b-code');
      const res = Decks.decode(inp ? inp.value : '');
      if (res.error) { builder.msg = res.error; return renderBuilder(); }
      builder.fid = res.fid;
      builder.doctrine = res.doctrine;
      builder.counts = Decks.countsFromList(res.cards);
      builder.msg = `Imported ${FACTIONS[res.fid].name} deck!`;
      return renderBuilder();
    }
    if (what === 'draft-new') { Decks.startDraft(myFaction, myDoctrine); return showDraftModal(); }
    if (what === 'draft-fight') { closeModal(); return launchDraftBattle(); }
    if (what === 'draft-abandon') { Decks.clearDraft(); return showDraftModal(); }

    closeModal();
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
          <p>Reduce the enemy colony’s integrity from ${E.START_HP} to 0 — OR complete <b>The Voice of Tau Ceti</b> and reach <b>${E.ASCENT_RESEARCH} Research</b> for an instant <b>Ascent Victory</b>.</p>
          <h3>The 7-Lane Planet</h3>
          <ul>
            <li>Each lane holds one <b>unit</b> in front, one <b>location</b> behind, and a shared <b>Planetary Terrain</b> tile in the center.</li>
            <li>Units reach their own lane and neighbouring lanes (+1 Reach on a <b>High Ridge</b> or with <b>Artillery</b>).</li>
            <li>Ground units must fight enemy units in reach first (<b>Guard</b> first). <b>Aerial</b> units fly over ground units—only <b>Interceptors</b> screen them.</li>
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
          <h3>Research & Colony Doctrines</h3>
          <p>Every Order and every staffed Landing Site grants Research. Milestones grant permanent Breakthroughs, and <b>Colony Doctrines</b> let you trade one planetary advantage against a sharp drawback—classic Alpha Centauri social engineering.</p>
        </div>
      </div>
      <div class="modal-actions"><button class="btn primary" data-do="close">Got it</button></div>
    </div>`);
  }

  function showDeck(fid) {
    const f = FACTIONS[fid];
    const presetKey = fid === myFaction ? myPreset : Object.keys(f.presets)[0];
    const list = getActiveDeckList(fid, presetKey);
    const counts = Decks.countsFromList(list);
    const sorted = Object.keys(counts).sort((a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name));
    const one = (id, qty) => cardHTML(CARDS[id], { extra: `<div class="qty">${qty}</div>` });
    const label = presetKey === 'custom' ? 'Custom Deck' : f.presets[presetKey].name;
    openModal(`<div class="f-${fid}">
      <h2 style="color:var(--fc)">${f.art} ${f.name} — ${label}</h2>
      <p>${f.style} Every deck is 30 cards (max 2 copies; max 1 copy of unique Secret Projects). Both sides begin with a Landing Site in lane 4.</p>
      <div class="gallery">${sorted.map((id) => one(id, '×' + counts[id])).join('')}${one('landing', 'start')}</div>
      <div class="modal-actions">
        <button class="btn ghost" data-do="close">Close</button>
      </div>
    </div>`);
  }

  /* ============================================================ Deckbuilder */
  function openBuilder(fid) {
    const f = FACTIONS[fid];
    const custom = Decks.getCustom(fid);
    const baseList = custom ? custom.cards : V.buildDeck(fid, myPreset === 'custom' ? Object.keys(f.presets)[0] : myPreset);
    builder = {
      fid,
      doctrine: custom ? custom.doctrine : myDoctrine,
      counts: Decks.countsFromList(baseList),
      filter: 'all',
      msg: 'Click cards on the left to add them; click rows on the right to remove.',
    };
    renderBuilder();
  }

  function builderAdd(id) {
    const c = CARDS[id];
    if (!c) return;
    const total = Object.values(builder.counts).reduce((a, b) => a + b, 0);
    const cur = builder.counts[id] || 0;
    const max = c.unique ? 1 : 2;
    if (total >= Decks.DECK_SIZE) { builder.msg = `Deck is already at ${Decks.DECK_SIZE} cards.`; return renderBuilder(); }
    if (cur >= max) { builder.msg = `Max ${max} copy(s) of ${c.name}.`; return renderBuilder(); }
    builder.counts[id] = cur + 1;
    SFX.click();
    renderBuilder();
  }

  function builderRemove(id) {
    if (!builder.counts[id]) return;
    builder.counts[id]--;
    if (builder.counts[id] <= 0) delete builder.counts[id];
    SFX.click();
    renderBuilder();
  }

  function renderBuilder(codeVal) {
    const f = FACTIONS[builder.fid];
    const pool = Decks.poolFor(builder.fid).filter((id) => {
      const c = CARDS[id];
      if (builder.filter === 'faction') return c.faction === builder.fid;
      if (builder.filter === 'neutral') return c.faction === 'neutral';
      if (builder.filter === 'project') return !!c.project;
      if (builder.filter === 'unit' || builder.filter === 'site' || builder.filter === 'order') return c.type === builder.filter;
      return true;
    }).sort((a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name));

    const list = Decks.listFromCounts(builder.counts);
    const total = list.length;
    const val = Decks.validate(builder.fid, list);

    // Cost curve buckets 0..7+
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
    list.forEach((id) => { buckets[Math.min(7, CARDS[id].cost)]++; });
    const maxB = Math.max(1, ...buckets);
    const curveHTML = buckets.map((n, i) => `
      <div class="curve-col">
        <div class="curve-n">${n || ''}</div>
        <div class="curve-bar" style="height:${Math.round((n / maxB) * 100)}%"></div>
        <div class="curve-n">${i === 7 ? '7+' : i}</div>
      </div>`).join('');

    const sortedDeck = Object.keys(builder.counts).sort((a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name));
    const filterTabs = [['all', 'All'], ['faction', facName(builder.fid)], ['neutral', 'Colonist'], ['project', 'Projects'], ['unit', 'Units'], ['site', 'Locations'], ['order', 'Orders']];
    const presetBtns = Object.keys(f.presets).map((pk) => `<button class="chip f-${f.id}" data-bpre="${pk}">Load: ${f.presets[pk].name}</button>`).join('');
    const docChips = Object.values(DOCTRINES).map((d) =>
      `<span class="chip f-${f.id} ${builder.doctrine === d.id ? 'on' : ''}" data-bdoc="${d.id}" title="${d.benefit}">${d.icon} ${d.name}</span>`).join('');

    openModal(`<div class="builder f-${f.id}">
      <div class="builder-head">
        <h2 style="margin:0;color:var(--fc)">${f.art} ${f.name} Deckbuilder</h2>
        <div class="chips">${presetBtns}</div>
      </div>
      <div class="builder-filters">
        <span class="label">Filter</span>
        ${filterTabs.map(([k, lbl]) => `<span class="chip f-${f.id} ${builder.filter === k ? 'on' : ''}" data-bfil="${k}">${lbl}</span>`).join('')}
      </div>
      <div class="builder-filters">
        <span class="label">Doctrine</span>
        <div class="chips">${docChips}</div>
      </div>
      <div class="builder-body">
        <div class="builder-grid">
          ${pool.map((id) => {
            const c = CARDS[id];
            const cur = builder.counts[id] || 0;
            const max = c.unique ? 1 : 2;
            return `<div class="b-card-wrap ${cur >= max ? 'maxed' : ''}" data-badd="${id}">
              <div class="b-count ${cur ? 'has' : ''}">${cur}/${max}</div>
              ${cardHTML(c)}
            </div>`;
          }).join('')}
        </div>
        <div class="b-side">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong style="color:${total === Decks.DECK_SIZE ? 'var(--good)' : 'var(--gold)'}">${total} / ${Decks.DECK_SIZE} Cards</strong>
            <button class="btn ghost small" data-do="bclear">Clear</button>
          </div>
          <div class="curve">${curveHTML}</div>
          <div class="b-list">
            ${sortedDeck.map((id) => {
              const c = CARDS[id];
              return `<div class="b-row f-${c.faction}" data-brem="${id}">
                <span class="br-cost">${c.cost}</span>
                <span class="br-name">${c.art} ${c.name}</span>
                <span class="br-qty">×${builder.counts[id]}</span>
              </div>`;
            }).join('') || '<p style="color:var(--muted);text-align:center;margin-top:4rem">Empty deck</p>'}
          </div>
          <div class="code-row">
            <input id="b-code" type="text" placeholder="Paste deck code…" value="${codeVal || ''}">
            <button class="btn ghost small" data-do="bexport">Export</button>
            <button class="btn ghost small" data-do="bimport">Import</button>
          </div>
          <div style="font-size:1.22rem;color:${val.ok ? 'var(--good)' : '#ffb0a0'}">${builder.msg || ''}</div>
          <div style="display:flex;gap:0.8rem">
            <button class="btn ghost" style="flex:1" data-do="close">Cancel</button>
            <button class="btn primary" style="flex:1" data-do="bsave" ${val.ok ? '' : 'disabled'}>Save Deck</button>
          </div>
        </div>
      </div>
    </div>`);
  }

  /* ============================================================ Planetary Conquest Campaign */
  function showCampaignModal() {
    const prog = Decks.getCampaignProgress();
    const f = FACTIONS[myFaction];
    openModal(`<div class="camp-wrap">
      <h2>🪐 Planetary Conquest</h2>
      <p>Lead <b>${f.name}</b> across all seven regions of Tau Ceti. Each rival holds a fortified biome with a signature Doctrine and deck. (${prog.cleared.length} / ${CAMPAIGN.length} sectors conquered)</p>
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
    const myDeck = getActiveDeckList(myFaction, myPreset);
    const oppDeck = V.buildDeck(m.opp, m.oppPreset);
    startGame({
      opp: m.opp,
      biome: m.biome,
      deck0: myDeck,
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
    const title = tie ? 'Mutual Ruin' : win ? (ascent ? 'Transcendence' : 'Victory') : (ascent ? 'Enemy Ascent' : 'Defeat');
    let text = tie
      ? 'Both colonies fall silent in the same hour. Tau Ceti keeps what is left.'
      : win
        ? (ascent ? 'The Voice of Tau Ceti harmonizes with your archives. Humanity transcends the dust.' : `${f.name} will decide what Tau Ceti becomes. The other survivors can only watch.`)
        : (ascent ? 'The enemy achieved Transcendence through The Voice of Tau Ceti.' : `The enemy banner rises over your last habitat. ${f.leader} is led away in silence.`);

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
    const hasCustom = !!Decks.getCustom(myFaction);
    const deckOpts = Object.keys(f.presets).map((pk) => ({ id: pk, name: f.presets[pk].name }));
    if (hasCustom) deckOpts.push({ id: 'custom', name: '★ Custom' });
    if (!deckOpts.some((o) => o.id === myPreset)) myPreset = deckOpts[0].id;
    $('#deck-chips').innerHTML = deckOpts.map((o) =>
      `<span class="chip f-${myFaction} ${o.id === myPreset ? 'on' : ''}" data-preset="${o.id}">${o.name}</span>`).join('');

    $('#doc-chips').innerHTML = Object.values(DOCTRINES).map((d) =>
      `<span class="chip f-${myFaction} ${d.id === myDoctrine ? 'on' : ''}" data-doc="${d.id}">${d.icon} ${d.name}</span>`).join('');

    const oppOpts = [{ id: 'random', name: 'Random' }].concat(Object.values(FACTIONS).map((x) => ({ id: x.id, name: facName(x.id) })));
    $('#opp-chips').innerHTML = oppOpts.map((o) =>
      `<span class="chip f-${o.id === 'random' ? 'neutral' : o.id} ${o.id === oppChoice ? 'on' : ''}" data-opp="${o.id}">${o.name}</span>`).join('');

    $('#biome-chips').innerHTML = Object.values(BIOMES).map((b) =>
      `<span class="chip f-neutral ${b.id === myBiome ? 'on' : ''}" data-biome="${b.id}">${b.icon} ${b.name}</span>`).join('');

    const diffs = [['colonist', 'Colonist'], ['commander', 'Commander'], ['transcend', 'Transcend']];
    $('#diff-chips').innerHTML = diffs.map(([id, name]) =>
      `<span class="chip f-neutral ${id === myDiff ? 'on' : ''}" data-diff="${id}">${name}</span>`).join('');

    const doc = DOCTRINES[myDoctrine] || DOCTRINES.standard;
    const biome = BIOMES[myBiome] || BIOMES.tau_ceti;
    const deckDesc = myPreset === 'custom' ? 'Your custom 30-card colony manifest.' : f.presets[myPreset].desc;
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
      myPreset = pre.dataset.preset;
      if (myPreset === 'custom') { const c = Decks.getCustom(myFaction); if (c) myDoctrine = c.doctrine; }
      else myDoctrine = FACTIONS[myFaction].presets[myPreset].doctrine || 'standard';
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

  $('#btn-builder').addEventListener('click', () => { SFX.click(); openBuilder(myFaction); });
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

    const deck0 = o.deck0 || getActiveDeckList(p0Fac, myPreset);
    const doc0 = o.doctrine0 || myDoctrine;
    const doc1 = o.doctrine1 || FACTIONS[opp].presets[oppPre].doctrine || 'standard';
    const biome = o.biome || myBiome;

    g = E.newGame(p0Fac, opp, seed, first, {
      biome,
      deck0,
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
    if (g.active === BOT) logLine('The enemy moves first. You start with an extra card and a Reserve Cell.', 'sys');
    else logLine('You move first. The enemy starts with an extra card and a Reserve Cell.', 'sys');

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
  syncFactionDefaults(myFaction);
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
  if (q.get('modal') === 'builder') openBuilder(myFaction);
  if (q.get('modal') === 'campaign') showCampaignModal();
  if (q.get('modal') === 'draft') showDraftModal();
  window.TauCetiUI = { get game() { return g; }, startGame, showTitle };
})();
