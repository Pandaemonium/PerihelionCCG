/* TAU CETI — Generates tools/art_prompts.json with bespoke photorealistic Alpha Centauri prompts for all 164 assets. */
const fs = require('fs');
const path = require('path');

require('../js/world.js');
require('../js/cards.js');

const { CARDS, FACTIONS } = globalThis.TauCeti;

const STYLE_CARD =
  'Photorealistic 35mm anamorphic sci-fi film still, Denis Villeneuve and Neill Blomkamp hard-sci-fi production design, realistic practical textures, volumetric atmosphere, natural lens optics and subtle film grain, Sid Meier Alpha Centauri exoplanet frontier aesthetic, no text, no borders, no UI, no painting brushstrokes';

const STYLE_LEADER =
  'Photorealistic 35mm cinema portrait still, 85mm anamorphic lens, shallow depth of field, natural skin texture, weathered practical sci-fi attire, atmospheric exoplanet colony background, subtle film grain, centered bust framing for circular portrait, Sid Meier Alpha Centauri aesthetic, no text, no borders, no UI, no painting brushstrokes';

const FACTION_PALETTE = {
  rootbound: 'lush rain-drenched emerald exoplanet jungle, misty teal canopy, faintly glowing violet xenofungus spores, organic biotech lighting',
  ironwake: 'dark volcanic basalt industrial yard, weathered riveted starship steel, warm amber forge floodlights, swirling ash and diesel steam',
  synod: 'sleek brutalist obsidian-and-glass research archive, cold cerulean holographic telemetry light, crisp volumetric blue beams, dark starry dome',
  tide: 'storm-swept alien archipelago coastline, wet rusted salvage docks, bioluminescent magenta sea spray, dramatic cyan-pink storm clouds',
  cinder: 'scorched volcanic rift canyon, burning oil braziers and crimson ember glow against dark basalt ruins, dramatic stark shadows',
  auric: 'gleaming glass-and-gold orbital exchange spire, warm golden solar reflections, clean brushed titanium, high-tech energy conduits',
  redline: 'windswept high rocky exoplanet ridge at dawn, tactical steel-cyan HUD reflections, crisp mountain mist, disciplined military bivouac',
  neutral: 'dusty alien frontier outpost built from salvaged colony ship modules, moody twilight horizon, practical NASA-punk realism',
};

const LEADERS = {
  leader_rootbound: 'Matriarch Suvi Aldane, calm intensely intelligent woman in her late 40s with silver-streaked dark hair tied back, weathered dark olive bio-surveyor jacket with metallic clasps and translucent HUD earpiece, standing inside a humid rain-streaked geodesic botanical dome with glowing violet xenofungus outside',
  leader_ironwake: 'Foreman Dax Ortega, broad-shouldered weathered industrial engineer in his 50s with short grizzled beard and burn scar on jaw, heavy charcoal and rust-orange reinforced welding exo-vest with utility harness, standing inside a dimly lit starship-salvage foundry with glowing amber molten furnaces behind him',
  leader_synod: 'Archivist Thessaly Vane, composed sharp-featured scholar in her 40s with silver-white bob hair and minimalist cybernetic optic monocle, dark navy high-collared research coat with subtle illuminated data filaments, standing inside a towering obsidian data archive bathed in cool blue holographic star charts',
  leader_tide: 'Captain Maro Quill, charismatic weather-beaten privateer captain in his late 30s with tousled salt-sprayed hair, scarred brow, worn dark marine flight jacket with brass-and-composite collar and radio mic, standing on a wet metallic skiff deck at dusk with storm-lit magenta ocean waves behind him',
  leader_cinder: 'Confessor Mara Solis, austere commanding woman in her 50s with piercing intense eyes and dark hood-draped ash-grey and crimson flame-retardant mantle, standing before burning salvage pyres and towering charred starship ribs in a smoky volcanic canyon at dusk',
  leader_auric: 'Director Kofi Vance, impeccably groomed sharp-eyed executive in his late 40s wearing a tailored obsidian-and-brushed-gold armored business tunic with subtle lapel holo-ledger, standing before floor-to-ceiling armored glass overlooking sunlit golden solar arrays and gleaming colony spires',
  leader_redline: 'Marshal Soren Kade, lean battle-hardened tactical commander in his 40s with close-cropped hair, weathered jaw, matte slate-grey tactical composite armor with cyan rank chevrons and throat mic, standing in a windswept ridge command bunker overlooking misty alien mountain passes',
  leader_boss: 'The Chiron Echo, eerie transcendent biomechanical neural nexus formed from intertwined bioluminescent violet xenofungus tendrils, crystalline mineral veins, and a faintly glowing humanoid silhouette of refracted light emerging inside a vast subterranean fungal cathedral',
};

const SCENES = {
  // Tokens
  sprout: 'Cluster of emerging alien bioluminescent emerald and violet xenofungus shoots bursting through wet dark volcanic soil, tiny glowing spores drifting in morning mist, macro cinematic shot',
  scrapbot: 'Small rugged utilitarian quadruped salvage robot welded from scarred starship bulkhead scrap, single glowing amber optical lens, welding torch arm sparking on dusty basalt ground',
  barricade: 'Heavy modular ferrocrete and salvaged starship hull blast wall braced with hydraulic struts across a dusty frontier lane, amber warning strobes glowing through swirling ash',
  pilgrim: 'Determined frontier zealot colonist in tattered ash-grey cloak and respirator carrying a blazing plasma-fuel torch across dark volcanic shale, fiery crimson backlight',
  mind_worm: 'Terrifying glistening alien violet-purple segmented neural worm emerging from wet xenofungus mats, translucent bioluminescent tendrils pulsing with pale lavender psychic glow, macro cinema realism',
  clone_shell: 'Translucent cylindrical cryo-gestation vat filled with pale teal amniotic fluid containing a silhouetted human figure suspended in cables inside a sterile dimly lit biotech lab',
  cell: 'Weathered metallic hexagonal Perihelion starship energy capacitor cell resting on a workbench, glowing bright cyan plasma charge gauge humming with faint electric arcs',
  landing: 'Iconic scorched triangular colony landing pod anchored in alien red-grey dust, deployed solar wings, glowing warm interior airlock and tall communications mast under twin moons',

  // Neutral Colonists & Planet
  survey_drone: 'Sleek matte-white orbital reconnaissance quad-thruster drone hovering low over alien rocky ridges, projecting a crisp cyan laser terrain-scanning grid onto the ground below',
  perimeter_sentry: 'Armored human colony guard in bulky matte-grey exo-suit holding a heavy riot energy shield and carbine behind a steel sandbag checkpoint at alien twilight',
  rover_scout: 'Rugged six-wheeled all-terrain NASA-punk colony rover kicking up dust as it races across an alien plateau toward a glowing horizon, halogen headlights piercing mist',
  aaa_sentry: 'Automated twin-barrel anti-aircraft flak turret mounted on a tripod bunker, tracking beams of pale blue radar light sweeping upward into stormy twilight clouds',
  colony_former: 'Massive tracked yellow-and-gunmetal planetary terraforming tractor with hydraulic earth-shaping blades and laser drill clearing alien purple fungus along a muddy ridge',
  clean_retrofit: 'Close-up of a sleek compact fusion micro-reactor core being installed into a mech chassis inside a clean brightly lit colony garage, calm turquoise plasma glow',
  supply_drop: 'Weathered metallic orbital supply pod descending on billowing retro-thruster fire and drogue chutes over alien dunes, trailing white smoke against a dark twilight sky',
  bunker: 'Low-profile reinforced ferrocrete and steel defensive pillbox bunker sunk into an alien hillside, slit gunports glowing softly from within under heavy rain',
  field_medic: 'Colony combat medic in white-and-red-marked armored enviro-suit kneeling beside a wounded trooper, applying a glowing green nano-suture med-gel projector in misty dust',
  probe_team: 'Two stealthy covert operatives in matte-black optic-camo stealth suits crouching beside an enemy relay tower at night, one splicing glowing fiber-optic cables into a wrist deck',
  native_mind_worm: 'Giant writhing alien brood mind-worm bursting from a dense purple xenofungus mat at night, eerie lavender bioluminescent aura illuminating terrified scouts nearby',
  debris_rain: 'Blazing chunks of shattered starship hull streaking down from orbit as fiery meteors across a twilight alien sky, impacting a rocky plain in dramatic pillars of dust and fire',
  hab_dome: 'Warm glowing translucent geodesic colony habitat dome nestled in an alien crater at dusk, lush green hydroponic gardens visible through illuminated hexagonal glass panels',
  colony_pod: 'Heavy mobile tracked colony-founder rig unfolding its modular geodesic dome and communications mast on a newly claimed alien valley floor at sunrise',
  storm_skiff: 'Angular VTOL twin-ducted-fan armored patrol gunship banking sharply through dark storm clouds and rain above alien jagged cliffs, glowing wingtip strobes',
  planet_buster: 'Cataclysmic thermonuclear orbital warhead detonation over an alien plateau seen from high altitude, colossal blinding mushroom cloud shockwave flattening terrain and lighting the clouds',

  // Neutral Secret Projects
  planetary_datalinks: 'Colossal array of gleaming black-titanium parabolic orbital dishes and glowing blue fiber-optic data pylons arrayed across a high dark alien mesa beneath the Milky Way',
  aegis_algorithm: 'Cavernous high-security quantum supercomputer core encased in concentric rings of rotating gold-and-cyan optical firewalls and mirrored glass, stark symmetrical architecture',
  manifold_former: 'Monumental planetary weather-control atmospheric processor tower venting vast swirling clouds of emerald-lit terraforming vapor into an alien sky above terraced green valleys',
  chrysalis_vats: 'Awe-inspiring cavernous biotech chamber lined with hundreds of towering illuminated turquoise genetic chrysalis pods rising into darkness, misty catwalks with tiny technicians',
  orbital_tether: 'Impossibly tall carbon-nanotube space elevator cable anchored to a monumental steel sea-platform, climbing straight up through glowing clouds into a starry orbital ring',
  voice_of_tau_ceti: 'Colossal faceted crystal and black titanium resonance spire rising from wet bioluminescent violet xenofungus tendrils beneath golden-cyan plasma aurora rings and a ringed gas giant',

  // 1. Rootbound
  seedcaster: 'Rootbound bio-ranger in olive-moss environmental cloak scattering glowing emerald spore pods across dark wet alien soil, tiny bioluminescent sprouts already unfurling behind her',
  symbiotic_bond: 'Close-up of translucent bioluminescent emerald vines gently weaving over cracked ceramic armor plating, healing golden-green light knitting organic tissue and metal together',
  creeping_vine: 'Massive undulating alien ironwood vines coiled aggressively around a ruined steel outpost tower, glowing emerald sap pulsing beneath wet bark in heavy rainforest mist',
  overgrowth: 'Sudden explosive burst of towering alien ferns, glowing emerald moss, and thick knotted roots engulfing an armored bio-mech in a luminous green aura',
  spawning_grove: 'Misty hollow of colossal glowing alien bioluminescent mushrooms and translucent spore sacs pulsing softly in a shadowy emerald rainforest clearing',
  mycelial_weaver: 'Hooded ecologist kneeling on dark rocky ground with a glowing biotech staff, spreading luminous purple-violet xenofungus mycelium tendrils rapidly across barren gravel',
  podling_carrier: 'Bulbous four-legged biomechanical alien pack-beetle lumbering through misty ferns, translucent glowing green brood-pods clustered across its armored shell',
  symbiote_swarm: 'Dozens of agile bioluminescent green-and-violet alien spore-creatures surging like a living tide across a wet canyon floor beneath dark jungle canopies',
  heartwood_bower: 'Cathedral-like living shelter woven from colossal arched alien banyan trees with warm amber bioluminescent lantern-bulbs illuminating an outpost camp inside the roots',
  mind_root: 'Sinister glowing violet-and-emerald tendril-beast rising out of thick xenofungus, crackling with pale psychic distortion waves warping the mist around it',
  bloomcaller: 'Rootbound matriarchal scout standing atop a mossy ridge blowing a resonant spiral alien horn, sending waves of glowing emerald pollen sweeping over allied creatures below',
  spore_launcher: 'Towering bulbous organic alien artillery plant anchored on a hillside, launching a glowing violet bioluminescent spore-mortar shell trailing misty light across the sky',
  fungal_bloom: 'Sweeping aerial view of a vast wave of luminous violet-purple xenofungus erupting overnight across rocky trenches and swallowing steel perimeter fences',
  brood_matron: 'Enormous six-limbed alien arachnid-plant matriarch crouched inside a rusted starship reactor casing, glowing emerald brood eggs nestled among her mossy carapace',
  canopy_beast: 'Colossal horned six-legged alien megafauna herbivore covered in thick emerald moss and hanging vines striding through misty alien redwoods, tiny scout beside it',
  locust_swarm: 'Dark terrifying cloud of thousands of iridescent violet-and-emerald winged alien locusts descending from stormy skies over illuminated colony domes',
  living_canopy: 'Monumental mile-wide ancient alien world-tree canopy arching over an entire illuminated biodome city nestled harmoniously among colossal glowing roots and waterfalls',
  worldroot_titan: 'Towering organic-biomechanical alien forest colossus of dark bark, emerald moss, glowing amber sap veins, and absorbed starship hull plating standing over a tiny colony rover',

  // 2. Ironwake
  scrap_welder: 'Gritty armored industrial mechanic in heavy welding visor firing a shower of bright orange plasma-arc sparks while reinforcing a damaged battle-walker leg',
  hull_plating: 'Massive hydraulic crane hoisting a thick scarred titanium starship hull plate onto a fortified colony bunker wall amid sparks and floodlights',
  bulwark_drone: 'Heavy tracked robotic shield-tank with an angled blast plow and shimmering translucent blue directional energy barrier blocking incoming fire in volcanic dust',
  turret_nest: 'Fortified octagonal steel automated twin-autocannon bunker firing bright amber tracer rounds across a dark ash valley at dusk',
  riot_plating: 'Close-up of interlocking dark gunmetal ceramic-steel exo-armor plates bolting onto a heavy trooper, rugged hazard stripes and glowing amber power seams',
  field_engineer: 'Armored Ironwake structural engineer with hydraulic wrench-exo-arm and glowing diagnostic tablet repairing a smoking turret emplacement under floodlights',
  flak_emplacement: 'Heavy quad-barrel rotary anti-aircraft flak battery mounted on a concrete bunker roof firing glowing flak bursts into a dark stormy sky',
  reactor_core: 'Massive salvaged starship fusion reactor housing humming inside an armored concrete bunker, intense amber-blue plasma containment core glowing behind steel blast ribs',
  salvage_hauler: 'Colossal multi-wheeled armored industrial haul truck dragging a giant salvaged starship hull girder across a dark volcanic plain under powerful amber headlamps',
  mortar_team: 'Two rugged armored Ironwake artillery troopers operating a heavy hydraulic siege mortar tube dug into basalt rock, muzzle flash illuminating swirling ash',
  demolition_charge: 'Massive shaped industrial thermite breach charge detonating against a steel fortification wall in a blinding burst of orange fire, shockwave dust, and flying rivets',
  automated_crane: 'Towering industrial gantry assembly crane lowering a freshly welded chassis of a combat scrap-bot onto a steel deck amid glowing furnace sparks',
  foundry: 'Immense dark-steel industrial smelter complex belching steam and amber furnace light into a twilight alien sky, conveyor lines rolling out armored drones',
  railgun_battery: 'Long sleek twin-rail electromagnetic siege cannon mounted on heavy stabilized legs, bright electric blue-amber plasma trail igniting down the barrel as it fires',
  siege_walker: 'Bulky bipedal industrial combat mech with heavy hydraulic piston legs, riveted torso armor, heavy forearm cannons, and a faint shimmering blue shield halo',
  orbital_bombardment: 'Multiple brilliant white-orange kinetic orbital bombardment beams slamming vertically from high clouds into an alien canyon, erupting in massive fiery craters',
  bulwark_citadel: 'Monumental terraced brutalist fortress-citadel welded from colossal starship bulkheads, encircled by layered energy-shield pylons, flak towers, and warm amber foundry lights',
  dreadnought: 'Colossal riveted gunmetal quadrupedal siege walker with twin heavy barrels, halogen floodlights, and a shimmering translucent blue plasma dome over dark basalt ash',

  // 3. Lumen Synod
  acolyte: 'Focused Synod researcher in sleek dark navy hooded coat holding a glowing holographic polyhedron data-core inside a dimly lit crystalline laboratory',
  data_spike: 'Razor-sharp lance of blinding cerulean-blue directed energy and holographic telemetry arcs striking down onto an armored chassis, shattering sparks',
  archive_scribe: 'Dedicated scholar seated at a curved transparent holographic console inside a vast star-lit data vault, cold blue light illuminating pages of digital starship logs',
  archive_vault: 'Sleek geometric obsidian-and-glass underground data archive building with vertical columns of glowing cerulean memory crystals visible through armored windows',
  probe_tech: 'Sleek hovering chrome-and-navy Synod cyber-warfare drone projecting concentric rings of pale cyan EMP interference waves over a disabled mech',
  neural_siphon: 'Translucent streams of violet-blue synaptic light being extracted from a staggered armored figure toward a hovering crystalline Synod resonator node',
  prism_adept: 'Synod specialist in matte-blue armored vestments directing a floating faceted crystal prism that refracts a beam of blinding cyan laser light across a dark battlefield',
  deep_query: 'Massive spherical holographic planetary map floating inside a darkened Synod observatory chamber, thousands of luminous blue data filaments orbiting a lone figure',
  relay_spire: 'Slender needle-tall obsidian-and-glass microwave transmission spire topped with glowing blue crystalline rings beaming coherent light beams across misty mountains',
  resonance_weaver: 'Levitation-assisted Synod psionic researcher surrounded by shimmering geometric rings of pale violet and cerulean light inside a sleek research chamber',
  stasis_field: 'Crystalline blue-white temporal stasis dome freezing enemy walkers and flying shrapnel motionless in mid-air across a misty alien valley',
  arc_lattice: 'Geometric web of crackling cerulean lightning arcs jumping rapidly across three rocky lanes between hovering crystalline Synod relay pylons',
  thinkers_node: 'Overclocked cylindrical supercomputer tower venting superheated white steam while its exposed sapphire optical cores blaze intensely at night',
  oracle_engine: 'Hovering monumental metallic-and-crystal spherical AI automaton with a single luminous sapphire optical aperture surveying an alien horizon from above',
  quantum_cascade: 'Breathtaking wave of shimmering geometric cyan-and-violet quantum interference ripples sweeping across an entire dark battlefield',
  singularity_lance: 'Blinding focused gravitational distortion beam tearing through stormy dark clouds, warping starlight and pulverizing rock where it strikes',
  virtual_archive: 'Colossal translucent domed library-cathedral of towering glowing blue holographic stacks and floating orbital rings rising above a dark reflective lake at night',
  voice: 'Awe-inspiring colossal holographic projection of the fallen starship Perihelion AI manifesting as an ethereal blue-gold geometric constellation in the clouds above a battlefield',

  // 4. Free Tide
  deckhand: 'Wiry weather-beaten privateer sailor in damp dark neoprene flight gear and utility belt tossing a glowing cyan Reserve Cell across a wet rusted barge deck',
  shiv: 'Close-up of a sleek composite vibro-blade glowing faintly along its serrated edge held in a gloved raider hand amid dark dockyard rain and neon magenta reflections',
  fence_runner: 'Agile masked smuggler sprinting across wet catwalks between stacked cargo containers at night, clutching a glowing stolen data-case under magenta dock lights',
  leech_diver: 'Armored amphibious salvage diver in matte-black pressurized suit with glowing visor emerging from dark misty ocean surf carrying a glowing energy-siphon grapple',
  sabotage: 'Dramatic close-up of a blinking magnetic breach-charge detonating inside the coolant pipes of an enemy industrial tower in a burst of sparks and magenta-orange smoke',
  smugglers_dock: 'Hidden steel floating dockyard tucked inside a misty rocky sea-cave, sleek fast assault skiffs moored beneath glowing magenta-and-amber loading beacons',
  grapple_line: 'High-tension braided titanium winch cable firing from an off-screen skiff and clamping onto a heavy enemy sentry mech, yanking it sideways across muddy terrain',
  smuggled_cache: 'Half-submerged waterproof armored titanium cargo crates hidden among dark tidal rocks, one cracked open revealing glowing cyan energy cells and contraband tech',
  skyjack: 'Armored Free Tide airborne raider descending through dark storm clouds on a sleek twin-turbine jet-wing harness with carbine raised',
  skiff_hangar: 'Rugged cantilevered cliffside corrugated-steel hangar bay open to stormy skies, glowing maintenance lights illuminating an armored VTOL raid skiff ready for launch',
  privateer_cutter: 'Sleek low-slung armored hover-cutter skimming furiously over dark choppy alien waves, throwing up bioluminescent magenta spray as its nose cannon fires',
  corsair_captain: 'Daring Free Tide squad captain leaping from a hovering gunship ramp into battle, weathered trench-armor billowing in rotor wash and storm rain',
  corsair_interceptor: 'Fast swept-wing dark-chrome twin-jet interceptor fighter screaming through stormy twilight clouds, twin autocannons flashing against distant aerial targets',
  hostile_salvage: 'Heavy Free Tide cargo-lifter crane airlifting an entire torn-loose enemy turret module upward into dark storm clouds amid snapping cables and sparks',
  hijack: 'Covert raider operative perched atop an enemy combat walker hatch cracking the override panel with a glowing purple bypass rig as its optical visor shifts magenta',
  gunship: 'Menacing armored twin-rotor VTOL assault gunship hovering low through storm rain, glowing violet energy-siphon beams draining shields from targets below',
  sovereign_reef: 'Sprawling fortified floating pirate fortress-city lashed together from salvaged ship hulls and oil-rig platforms amid stormy glowing magenta waves and searchlights',
  kingpin: 'Charismatic richly outfitted Free Tide crime-lord standing on a rain-slicked command bridge overlooking glowing contraband vaults and moored raid gunships',

  // 5. Cinder Choir
  ash_initiate: 'Young resolute Cinder Choir zealot in scorched ash-grey cloak and soot-streaked face marching forward with a glowing ember-tipped pike through dark volcanic smoke',
  zealot_scout: 'Lean fanatical scout sprinting across jagged black volcanic shale carrying a flaming plasma flare and light carbine, dramatic crimson rim light',
  anathema: 'Cinder Choir confessor raising a steel censer as a jagged pillar of searing crimson flame erupts beneath a gleaming high-tech enemy relay console',
  pyre_bearer: 'Armored Cinder Choir vanguard soldier wielding a massive heavy industrial flamethrower projecting a roaring cone of incandescent orange-crimson fire into twilight fog',
  penitent_shield: 'Stoic armored zealot planting a towering scorched starship-bulkhead tower shield etched with ash marks into volcanic rock, deflecting enemy sparks',
  chapel_of_embers: 'Stark austere cathedral-bunker built from angled blackened starship ribs, glowing warmly from within by rows of burning oil braziers against dark stormy skies',
  vow_of_ruin: 'Close-up of a weathered zealot soldier smearing glowing volcanic ash across his armored visor before a wall of crimson firelight, fierce determination',
  inquisitor_cell: 'Three hooded Cinder Choir inquisitors in dark crimson-lined armor monitoring intercepted enemy radio consoles beside a roaring furnace incinerator',
  witch_hunter: 'Sinister armored Cinder Choir psionic hunter striding through purple xenofungus with a glowing crimson-and-violet nullifier blade burning away spores',
  belfry_spire: 'Tall blackened riveted iron bell-tower rising out of a volcanic ridge, huge cast-steel bell swinging amid drifting red embers and moody twilight clouds',
  cinder_sermon: 'Confessor Mara Solis standing atop a wrecked starship engine addressing hundreds of torch-bearing zealot colonists across a smoky volcanic amphitheater',
  reliquary_vault: 'Solemn subterranean stone-and-steel vault lined with softly lit glass reliquaries holding salvaged dog-tags and melted circuit boards, warm candlelight',
  iconoclast: 'Fierce heavily armored shock-trooper charging through smoke swinging a glowing thermal plasma-breacher axe into the side of a crumbling steel bunker',
  purge_archive: 'Roaring crimson firestorm engulfing a shattered high-tech glass-and-obsidian data tower at night, burning papers and sparks spiraling into dark clouds',
  martyr_engine: 'Massive scarred industrial iron walker strapped with glowing unstable thermal fuel drums and heavy blast shields marching relentlessly through enemy fire',
  fanatic_charger: 'Armored Cinder Choir cavalry trooper riding a rugged all-terrain turbo-trike blazing through swirling ash and fire with a glowing thermal lance',
  eternal_pyre: 'Monumental volcanic caldera sanctuary built around a colossal perpetual pillar of roaring golden-crimson plasma flame lighting up dark storm clouds for miles',
  seraph_wreck: 'Awe-inspiring towering winged exo-frame forged from blackened ceramic heat-shield tiles descending on roaring crimson-gold thrusters through stormy ash clouds',

  // 6. Auric Charter
  courier_broker: 'Sharp-dressed Auric field broker in sleek charcoal-and-gold armored jacket carrying a locked titanium briefcase glowing with cyan Reserve Cells on a busy landing pad',
  ledger_bot: 'Polished white-and-gold bipedal commercial security android holding a holographic energy ledger, subtle golden trim and precision optical sensors',
  bribe: 'Close-up of a sleek black-and-gold armored credit-chit case opening to reveal glowing premium Reserve Cells handed across a shadowed alloy table',
  solar_array: 'Vast gleaming field of geometric golden photovoltaic solar collector panels angled toward a bright alien sun across arid red hills, sleek power pylons',
  contract_guard: 'Crisply outfitted private-security mercenary in matte-black and brushed-gold composite plate armor standing watch with a sleek pulse rifle and riot shield',
  dividend: 'Sleek glass-and-gold financial trading floor inside an alien colony dome, luminous golden market graphs and energy flow charts reflecting in panoramic windows',
  mercenary_lancer: 'Elite high-tech mercenary riding a sleek matte-black and gold armored hover-bike enveloped in a shimmering cyan shield, streaking across rocky flats',
  collector_skiff: 'Sleek luxury-industrial white-and-gold twin-engine VTOL collector craft gliding over thermal vents with glowing golden energy-harvesting fins',
  gold_barricade: 'Imposing heavy security exo-mech finished in matte obsidian and brushed gold titanium plating holding a massive glowing reinforced vault-shield',
  exchange_spire: 'Elegant towering spire of mirrored bronze glass and titanium ribs rising above an alien plateau at golden hour, warm interior offices glowing brilliantly',
  hostile_takeover: 'Precision golden-white orbital laser strike vaporizing an enemy turret while sleek Auric salvage drones swoop in immediately to claim the power cores',
  thermal_lease: 'High-tech gleaming gold-and-steel geothermal drilling rig boring straight into a glowing volcanic magma fissure, venting pressurized white steam and golden light',
  vault_drone: 'Heavy cylindrical armored hover-vault drone covered in interlocking gold-trimmed blast plates and glowing defensive shield emitters patrolling a depot',
  guild_enforcer: 'Imposing cybernetically augmented Auric corporate enforcer in tailored armored trench coat with glowing amber visor aiming a heavy high-caliber rail-pistol',
  syndicate_titan: 'Sleek cutting-edge corporate super-heavy bipedal exo-rig clad in polished obsidian and gold composite armor with gleaming shoulder rail-pods',
  orbital_brokerage: 'Panoramic view of sleek white-and-gold automated cargo shuttles docking with an illuminated orbital trade ring high above a cloud-wrapped exoplanet',
  meridian_exchange: 'Breathtaking colossal domed golden-glass planetary trade citadel ringed by cascading solar mirrors, docking pads, and luminous energy conduits at sunset',
  gilded_leviathan: 'Monumental luxury-industrial floating armored dreadnought barge plated in black titanium and gold trim, discharging cascading golden-blue capacitor arcs across a valley',

  // 7. Redline Cadre
  outrider_recon: 'Armored Redline tactical recon soldier speeding along a rocky ridge crest on a sleek matte-slate off-road recon motorcycle, cyan visor glowing in mountain mist',
  field_spotter: 'Camouflaged Redline forward observer lying prone on a high rocky crag peering through advanced laser rangefinding binoculars with faint cyan target telemetry',
  flanking_maneuver: 'Squad of agile matte-slate armored troopers vaulting rapidly across rocky cover along a misty cliff flank under drifting tactical smoke grenades',
  flak_battery: 'Sleek wheeled Redline mobile twin-barrel anti-aircraft autocannon truck parked on a rocky ridge firing crisp tracers into overcast skies',
  forward_outpost: 'Tactical modular camouflage-draped titanium field command tent and radar dish perched securely on a high rocky mountain ledge overlooking misty valleys',
  shock_trooper: 'Disciplined Redline elite infantryman in scarred matte-grey composite armor with cyan shoulder chevron advancing steadily through smoke with heavy assault rifle',
  ridge_engineers: 'Two Redline combat engineers in tactical gear using hydraulic plasma-cutters and blast-barriers to rapidly fortify a jagged high mountain ridge at dawn',
  suppressive_salvo: 'Heavy hail of bright cyan-white autocannon tracers ripping across rocky terrain, forcing an enemy walker sideways in clouds of kicked-up stone dust',
  command_post: 'Reinforced mobile armored tactical command bunker built into a mountain pass, glowing cyan holographic battlefield map visible through its blast window',
  ambush_squad: 'Three elite Redline troopers emerging suddenly from rocky ridge mist in a coordinated flanking crossfire, cyan laser sights cutting through fog',
  valkyrie_drop: 'Sleek angular titanium orbital drop-pod slamming down on retro-thruster fire onto a rocky flank, explosive doors blowing open as armored troopers charge out',
  sniper_nest: 'Two camouflaged Redline long-range rail-snipers concealed on a high rocky cliff ledge overlooking a misty valley miles wide, subtle cyan scope glint',
  aa_cruiser: 'Heavy tracked matte-slate armored walker-tank bristling with radar dishes, heavy frontal glacis armor, and elevated quad anti-air autocannons',
  artillery_barrage: 'Distant line of mobile Redline rocket-artillery batteries firing a dramatic salvo of white-cyan smoke trails arcing across a mountain twilight sky',
  tactical_airlift: 'Rugged twin-tiltrotor matte-grey military dropship hovering low over a rocky ridge with rear ramp down as elite armored troopers fast-rope into position',
  elite_commando: 'Battle-scarred veteran Redline special-ops commando in matte-black and slate stealth exo-armor with cyan HUD visor and shimmering personal shield in driving rain',
  command_nexus: 'Monumental hilltop military radar-and-command fortress carved into a granite mountain peak, towering phased-array antennas sweeping cyan tactical beams over the frontier',
  marshals_vanguard: 'Imposing heavy armored command walker striding at the crest of a misty mountain ridge flanked by elite troopers and flying a weathered cyan-and-steel banner',

  // Expansion: Neutral Colonists & Black Boxes
  colony_militia: 'Two determined volunteer colonists in mismatched hydroponics coveralls and borrowed chest armor gripping rugged carbines beside an illuminated steel colony airlock bulkhead at night',
  geo_survey: 'Pair of exoplanet geologists in dusty environmental parkas crouching on a rocky ridge with a glowing seismic tripod scanner and core drill overlooking volcanic steam vents',
  freight_crawler: 'Heavy slow six-tracked weathered industrial cargo crawler hauling stacked glowing cyan Reserve Cell containers along a dusty rutted colony road under twin amber headlamps',
  reclamation_vats: 'Moody dimly lit industrial recycling chamber lined with heavy steel salvage reclamation tanks, conveyor chutes, glowing turquoise reclamation fluid gauges, and drifting steam',
  blackbox_gunnery: 'Dramatic close-up of a scorched titanium starship black-box flight recorder cracked open on a console, projecting glowing crimson-amber holographic orbital gunnery targeting arcs',
  blackbox_medical: 'Scorched armored starship cryo-medical data core resting on a field medic table, projecting serene turquoise holographic vital signs and rows of cryo-sleeper telemetry waveforms',
  blackbox_flight: 'Weathered blackened starship navigation black-box module wired to a diagnostic terminal, casting an eerie pale blue holographic star-chart trajectory bending unexpectedly toward an alien planet',
  landshaper: 'Three rugged planetary terraforming engineers in heavy dust-caked utility suits operating a tripod-mounted fusion earth-shaping beam melting basalt rock along a misty canyon rim',
  field_theorist: 'Sharp-eyed frontier scientist in reinforced practical field coat with glowing wrist holo-projector standing boldly amid swirling alien dust while testing an experimental energy emitter',
  wayfarer: 'Lone weathered nomad scout in dust-cloaked desert enviro-gear striding alongside a compact pack-skiff across sweeping red-grey alien dunes with a towering dust storm behind',
  dreamcaster_pylon: 'Ancient-meets-colonial slender basalt-and-titanium psi-amplifier obelisk pulsing with shimmering violet-crimson psychic waves on a misty hilltop, warping dust motes around its spire',
  logistics_hub: 'Bustling illuminated modular frontier cargo-and-dispatch depot at twilight with overhead gantry cranes, stacked shipping pods, glowing manifest boards, and rovers rolling out',
  excavation_team: 'Colony drilling crew in headlamps and dust suits standing in awe at the bottom of a deep excavated trench where a massive smooth glowing teal Alien Monolith emerges from ancient bedrock',

  // Expansion: Rootbound (purely organic photography — no tech/robot triggers)
  spore_tender: 'Quiet Rootbound botanist in damp olive moss-woven cloak kneeling on a rocky misty ledge, gently tending tiny glowing emerald-and-violet alien sprouts rooting into cracked stone',
  mulch_bed: 'Rich shadowed rainforest clearing of dark steaming alien compost, fallen giant ferns, and glowing emerald-violet bioluminescent mycelium veins nourishing lush towering saplings',
  brood_whisperer: 'Serene hooded Rootbound empath woman crouching calmly in misty purple xenofungus with outstretched bare palm as a translucent glowing violet alien mind-worm rises curiously before her',
  rootquake: 'Colossal gnarled ancient jungle tree roots erupting violently up through cracked ferrocrete bunker foundations, shattering concrete slabs amid swirling emerald moss and glowing spores',

  // Expansion: Ironwake
  killing_ground: 'Volcanic ravine approach lit by harsh amber searchlights and crisscrossing red targeting lasers from fortified bunker firing slits as explosive shell bursts erupt in dark ash',
  bastion_gunner: 'Heavily armored Ironwake heavy-weapons trooper braced behind a thick riveted turret shield firing a smoking rotary autocannon, glowing amber muzzle flash and ejected brass casings',
  line_captain: 'Steely-eyed female Ironwake veteran officer in scarred charcoal plate armor gesturing forward beside a wall of towering heavy shield troopers holding a smoky perimeter line',
  works_foreman: 'Broad-shouldered industrial construction chief in weathered high-visibility welding harness and hard-visor standing on a steel catwalk overlooking a glowing skyline of turrets and foundries',

  // Expansion: Lumen Synod
  field_researcher: 'Focused female Synod scientist seated inside a glass-walled field outpost dome surrounded by glowing blue telemetry screens, sample vials, and a humming compact fusion desk lamp',
  theorem_guard: 'Sleek disciplined Synod security sentinel in matte-navy articulated composite armor holding a crisp glowing geometric cyan hexagonal energy barrier inside a dark archive corridor',
  reverse_engineer: 'Two Synod engineers in dark laboratory coats examining a partially disassembled enemy combat mech arm suspended under bright cold blue laser-scanning beams on a holographic blueprint table',
  feedback_pylon: 'Slender obsidian-and-glass Synod microwave relay pylon crackling with focused electric blue side-lobe energy arcs discharging directly across a dark valley toward distant fortifications',

  // Expansion: Free Tide
  limpet_charge: 'Close-up of a gloved amphibious raider clamping a blinking waterproof magnetic demolition charge onto the wet rusted steel pilings of an enemy coastal outpost beneath dark splashing surf',
  cell_runner: 'Agile grinning Free Tide courier woman in damp dark leather-and-neoprene flight vest clutching glowing cyan Reserve Cells while sprinting down a rain-slicked neon-magenta pier',
  salvage_boss: 'Tough swaggering privateer salvage chief in salt-stained armored trench coat standing on a scrap barge deck directing floodlit cargo cranes looting a smoldering enemy bunker behind him',
  tide_quartermaster: 'Weathered shrewd Free Tide supply officer leaning over open waterproof titanium cargo crates filled with glowing contraband gear inside a dimly lit ship hold',

  // Expansion: Cinder Choir
  fervor: 'Dramatic close-up of a resolute Cinder Choir zealot raising a blazing oil-and-plasma torch skyward amid billowing dark smoke and swirling crimson sparks, face fiercely lit by firelight',
  heresy_hunter: 'Fierce hooded female Cinder Choir inquisitor in ash-grey and crimson flame-retardant armor striding out of a burning glass-and-steel laboratory holding a heavy thermal carbine',
  ash_mourner: 'Solemn weathered Cinder Choir warrior woman standing in falling volcanic ash beside a line of makeshift steel grave markers, gripping a soot-blackened rifle with fierce crimson firelight behind her',
  doomsayer: 'Gaunt commanding Cinder Choir prophet in tattered dark crimson-trimmed mantle standing atop a rocky crag pointing down toward burning enemy colony towers across a smoky canyon',

  // Expansion: Auric Charter
  venture_agent: 'Sharp impeccably dressed Auric field financier in tailored charcoal-and-gold armored coat checking a glowing golden holographic tablet beside newly rising steel building foundations at sunset',
  underwriter: 'Composed Auric risk assessor in sleek obsidian-and-gold armored vest standing before panoramic armored dome windows overlooking gleaming reinforced colony domes bathed in warm amber light',
  asset_seizure: 'Two slick black-and-gold armored Auric corporate repo troopers clamping a glowing golden containment lock onto a disabled enemy walker amid swirling dust and holographic seizure notices',
  arbitrageur: 'Shrewd well-dressed Auric information broker seated inside a glass orbital lounge surrounded by glowing golden market curves and blue archival data streams reflected in his glasses',

  // Expansion: Redline Cadre
  combined_arms: 'Dramatic wide cinematic shot of disciplined slate-armored Redline infantry advancing across a misty rocky ridge in tight formation while twin tilt-rotor gunships roar low overhead with cyan strobes',
  drill_instructor: 'Grizzled hard-bitten Redline sergeant in scarred matte-grey tactical gear barking orders on a foggy highland training plateau as armored recruits run live-fire drills at dawn',
  ridge_battery: 'Compact rugged Redline mobile field artillery piece dug into a windswept rocky highland crest, elevation gears locked and barrel smoking after firing across a misty mountain valley',
  headhunter: 'Keen-eyed female Redline sharpshooter in hooded matte-slate camo cloak crouching on a dark rocky flank checking her compact precision carbine with a subtle cyan optic lens glint',

  // Expansion: Workshop & Archetypes (44 new cards)
  design_workshop: 'Busy alien colony engineering hangar bay with rugged technicians bolting an electromagnetic rail-lance turret onto a six-wheeled survey rover chassis beside glowing cyan holographic schematics and orange welding sparks',
  site_planner: 'Confident female colony civil architect in practical weathered slate field jacket and hard hat holding a glowing topographic holo-tablet while gesturing across a windswept rocky crater with survey beacons and a rising dome',
  heavy_requisition: 'Massive armored heavy combat walker chassis rolling out of an illuminated steel foundry hangar bay onto a foggy dawn tarmac while a logistics officer checks a luminous manifest pad',
  grav_harness: 'Colony trooper strapping on a compact twin-vectored anti-gravity flight harness backpack with glowing pale-cyan hover-thruster plumes lifting heavy boots off a dusty rocky landing pad',
  evac_shuttle: 'Rugged twin-engine armored VTOL evacuation dropship hovering low amid swirling red-grey dust with rear ramp lowered and bright amber boarding floodlights as two armored troopers sprint aboard',

  sapwell_tender: 'Serene hooded female forest botanist in damp olive-moss woven cloak kneeling beside a steaming rocky geothermal vent where luminous emerald-violet sap wells up through ancient mossy roots, collecting glowing resin in a glass vial',
  verdant_surge: 'Sweeping wide nature documentary shot of a misty alien mountain valley erupting in lush towering emerald ferns, giant glowing broadleaf canopies, and warm golden sunbeams piercing a passing tropical rainstorm',
  graft_champion: 'Powerful scarred female forest warrior in layered dark-bark and living emerald vine armor, bioluminescent moss and knotted ironwood tendrils fused organically along her shoulders and forearm, standing alert in misty rainforest',
  ironbark_graft: 'Macro botanical close-up of thick dark gnarled ancient ironwood bark and luminous emerald tendrils seamlessly growing and hardening like living layered armor over a scarred wooden shield in heavy rainforest rain',
  thunderback: 'Wildlife documentary 35mm cinema still of a colossal charging six-ton alien horned forest beast with massive ridged dark-olive bony crest, mossy thick hide, and heavy hooves smashing straight through a splintered perimeter fence in jungle mist',
  stampede_pheromone: 'Dramatic low-angle wildlife documentary shot of a thundering herd of giant horned mossy alien forest beasts charging headlong through billowing luminous golden-violet pollen mist and splintering barriers',

  bulkhead_slam: 'Colossal nine-tonne riveted starship steel blast bulkhead door slamming violently forward on heavy hydraulic rams, sending a shockwave of sparks, ash, and shattered debris across a dark volcanic industrial yard',
  ironclad_behemoth: 'Gargantuan heavily layered tracked siege walker welded with overlapping thick slabs of scarred dark-steel starship armor plating, glowing amber furnace vents, and massive hydraulic battering arms squeezing past a steel foundry gate',
  recovery_crawler: 'Heavy multi-tracked armored salvage recovery crawler with massive hydraulic winch boom dragging a battered combat walker hull back across a smoky volcanic basalt battlefield under amber floodlights',
  reassembly_bay: 'Vast dim industrial Hive repair gantry bay illuminated by showers of orange welding sparks, overhead cranes lowering freshly forged riveted armor plates onto a partially reconstructed combat walker frame',
  wreck_marshal: 'Grizzled broad-shouldered Hive veteran commander wearing heavy patchwork scavenged armor plates bolted from dozens of fallen combat hulls, standing defiantly atop a smoking tank wreck in warm amber foundry glow',

  critical_mass: 'Blinding cerulean-and-violet spherical psychic-quantum energy shockwave detonating outward from an overloaded crystal resonance core inside a dark obsidian observatory dome, warping light and shattering glass rings',
  datalinks_search: 'Focused University scholar standing amid towering curved walls of luminous cerulean floating holographic flight-log archives and orbital telemetry streams inside a darkened obsidian data chamber',
  systems_engineer: 'Sharp-eyed female University prototype engineer in sleek dark navy lab coat holding a glowing holographic blueprint stylus beside a half-built experimental modular rover frame inside a clean glass workshop',
  skunkworks: 'Secretive cluttered high-tech underground University prototype lab bathed in cool blue holographic light, housing three experimental modular combat chassis rigs suspended on articulated gantry arms',
  proving_ground: 'Wide windswept dark basalt weapons testing range under starry twilight skies, illuminated by crisp cyan laser telemetry grids as an experimental prototype combat rig fires a bright blue test beam downrange',

  squadron_leader: 'Daring privateer ace pilot in salt-worn dark leather-and-composite flight jacket and tinted visor standing on a rain-slicked carrier deck as sleek swept-wing needlejet raiders bank overhead through stormy magenta-cyan clouds',
  smugglers_run: 'Two heavy waterproof titanium crates glowing faintly cyan being winched over the dark gunwale of a sleek stealth hover-skiff into foaming misty dark-teal surf at low tide under storm twilight',
  reef_skirmisher: 'Agile amphibious pirate commando in wet matte-black pressurized dive-weave stealth gear bursting upward out of dark foaming alien surf wielding a gleaming composite vibro-blade in storm mist',
  undertow: 'Massive surging bioluminescent magenta-and-teal alien tidal wave crashing violently over a rocky coastal outpost and sweeping an armored combat unit back out into the dark foaming sea',
  hidden_cove: 'Secret sheltered sea-cave pirate harbour carved inside towering black volcanic sea-cliffs, lit by warm lanterns and glowing blue fuel cells stacked along wet steel piers beside sleek docked hover-skiffs',

  rite_of_ash: 'Solemn circle of hooded Cinder Believers kneeling in swirling volcanic ash around a blazing tall crimson ritual pyre rising beneath charred fallen starship ribs at dusk',
  pyre_keeper: 'Austere bearded Believer zealot priest in soot-darkened crimson-trimmed heavy mantle tending a roaring iron brazier tower as glowing embers stream across a dark stormy battlefield',
  ember_flagellant: 'Fierce bare-armed Believer zealot warrior with glowing ritual burn scars and charred ash-cloth wraps striding fearlessly through roaring crimson flames raising a heavy iron brazier flail',
  trial_by_fire: 'Blinding wall of roaring crimson-gold flame sweeping across a dark basalt battlefield while resolute armored Believer soldiers march calmly forward through the firestorm untouched',
  cinder_scourge: 'Unyielding female Believer zealot warrior in scorched blackened plate armor with glowing red-hot chains wrapped around her gauntlets, sparks and fire exploding outward around her on a volcanic ridge',
  scarred_penitent: 'Towering battle-scarred Believer veteran in cracked soot-blackened armor plates and tattered crimson hood standing unbowed amid volcanic smoke, wielding a blazing plasma-tipped war-halberd',

  claims_adjuster: 'Composed sharp-eyed corporate inspector in tailored obsidian-and-gold armored trench coat examining a thick reinforced titanium colony dome plate with a glowing golden holographic caliper scanner',
  holdings_magnate: 'Commanding impeccably dressed female corporate executive in sleek charcoal-and-gold armored coat seated at a panoramic glass penthouse table surrounded by glowing golden holographic asset portfolios and gleaming orbital spires',
  consortium_titan: 'Colossal gleaming obsidian-and-brushed-gold multi-turreted corporate super-heavy dreadnought mech striding across an alien trade plaza beneath sunlit glass exchange towers',
  trade_embargo: 'Fortified golden-glass orbital customs blockade checkpoint with towering illuminated holographic barrier gates halting a long convoy of heavy cargo crawlers on a dusty alien highway at dusk',
  hostile_audit: 'Intense focused golden-cyan corporate EMP disruption beam descending onto an enemy armored combat mech, freezing its systems inside a bright geometric holographic quarantine cage',
  repo_agent: 'Slick black-and-gold armored corporate recovery operative unhooking a glowing cyan energy cell pack from a disabled jammed enemy combat unit amid swirling frontier dust',
  liquidator: 'Cold menacing corporate specialist in matte-obsidian and brushed-gold tactical armor leveling a heavy high-energy disassembly plasma cutter at a paralyzed enemy combat walker in dramatic sunset glare',

  war_college: 'Imposing brutalist concrete-and-steel Federation military academy compound perched on a high misty mountain plateau with holographic tactical war-tables glowing cyan behind armored panoramic windows',
  task_force_commander: 'Seasoned female Federation field commander in crisp matte-slate tactical composite armor and headset standing on a rocky highland overlook directing advancing armor, infantry, and overhead VTOL gunships',
  airdrop_beacon: 'Rugged titanium orbital drop-zone transponder tripod planted on a windy rocky ridge venting thick luminous amber-orange signal smoke straight up into stormy skies as a supply pod streaks down from orbit',
  logistics_officer: 'Sharp disciplined Federation quartermaster officer in weathered matte-slate tactical vest checking a luminous manifest tablet beside an open newly landed orbital supply pod on a windy highland trail',
  supply_convoy: 'Column of three rugged six-wheeled matte-slate armored military supply trucks rumbling in dust across a high alien mountain pass while twin orbital supply pods descend on parachutes beside them',

  // Expansion: Planetary Telemetry & Counterplay (20 new cards)
  telemetry_drone: 'Compact weathered NASA-punk colony reconnaissance quad-rotor drone hovering low over rocky alien valleys at twilight, deploying a folded parabolic radar dish projecting soft cyan telemetry scan rings ahead',
  seismic_ping: 'Close-up of a heavy titanium ground-thumper seismic charge staked into dark cracked alien basalt, releasing concentric glowing amber-blue subsurface sonar shockwave rings across dusty terrain',
  containment_purge: 'Hazmat-armored colony quarantine squad inside a smoky perimeter deploying glowing cyan-amber plasma sterilization containment barriers sealing off shattered smoking wreckage in mist',
  suppressive_scatter: 'Wide cinematic battle shot of a twin-barrel colony flak-scatter launcher sweeping dense overlapping bursts of glowing amber-white airburst flechettes across three rocky frontier lanes, shattering shimmering blue shields',
  tectonic_shaper: 'Massive heavy tracked planetary terraforming rig with twin glowing orange plasma-cutter plows and seismic hydraulic rams shifting glowing basalt strata and purple fungus across a fractured valley',
  field_refit: 'Rugged frontier combat mechanics working under bright halogen portable floodlights beside an open armored utility truck at dusk, rapidly welding an upgraded coilgun turret onto a dusty infantry walker frame amid flying sparks',
  prescient_empath: 'Serene hooded Stepdaughter empath woman standing barefoot in luminous misty violet-and-emerald alien rainforest, eyes gently closed as bioluminescent fungal spores swirl around her outstretched palms in quiet prophetic focus',
  condenser_array: 'Towering elegant living-steel atmospheric moisture condenser tower wrapped in climbing emerald vines and glowing violet moss, harvesting swirling mountain mist into cascading luminous water channels over a mossy forest outpost',
  bio_scrubber: 'Heavy tracked industrial Iron Hive decontamination rig mounted with twin high-pressure superheated steam-and-plasma flame lances clearing dense glowing purple xenofungus from basalt rock under harsh amber floodlights',
  grav_pull_winch: 'Armored industrial Iron Hive grav-winch tractor braced on hydraulic anchor spades firing a glowing amber electromagnetic tow beam dragging a staggering enemy walker sideways across volcanic gravel',
  salvage_blueprint: 'Weathered armored Iron Hive recovery technician kneeling beside a smoking wrecked combat walker hull in volcanic ash, capturing glowing cyan-amber holographic structural blueprints onto a rugged field tablet',
  datalinks_index: 'Sleek University of Tau Ceti subterranean glass-and-obsidian holographic library chamber lined with towering crystalline index columns projecting crisp floating blue orbital star-charts and predictive probability graphs',
  squall_chart: 'Dramatic shot on a rain-lashed Tidewater privateer navigation bridge at night, weathered navigator plotting glowing magenta-and-cyan barometric storm-front vectors across a wet glass chart table as lightning flashes outside',
  omen_seer: 'Austere hooded Cinder Believers prophetess standing on a charred volcanic crag at dusk, gazing intently into rising crimson embers and swirling black smoke trails as distant burning artillery streaks cross the sky',
  market_forecast: 'Sharp Vance Industries financial strategist inside a sleek sunlit obsidian-and-gold orbital observatory studying sweeping golden holographic probability curves and energy-commodity projections overlooking arid solar plains',
  breach_protocol: 'Dramatic action still of three rapid precision golden-blue plasma pulse bolts striking in rapid sequence against a heavy enemy mech energy shield, shattering the translucent barrier into bright sparks on dark rock',
  salvage_impound: 'Imposing Vance Industries armored corporate enforcement walker clamping glowing violet-gold stasis-impound cuffs onto a disabled enemy mech inside a floodlit titanium containment yard',
  thermal_venting: 'Spectacular wide shot of a Vance Industries gleaming gold-and-steel geothermal borehole station opening massive pressure relief valves, blasting towering illuminated columns of incandescent steam and golden energy across rocky vents',
  mercenary_contractor: 'Sharp-eyed elite Vance Industries field arms-dealer in obsidian-and-brushed-gold armored trench coat standing beside an open titanium weapons crate displaying modular rail-lances and glowing blueprint slates on a landing pad',
  frontier_surveyor: 'Battle-hardened Redline Federation scout sergeant in dusty matte-slate tactical armor perched on an outcrop overlooking diverse alien ridges, purple fungus valleys, and a distant glowing teal monolith, holding a cyan rangefinder',
};

const ORGANIC_ONLY = new Set([
  'spore_tender', 'mulch_bed', 'brood_whisperer', 'rootquake',
  'sapwell_tender', 'verdant_surge', 'graft_champion', 'ironbark_graft', 'thunderback', 'stampede_pheromone',
  'prescient_empath',
]);
const STYLE_ORGANIC =
  'Photorealistic 35mm cinema still, natural wildlife and botanical documentary photography, wet tactile bark and foliage textures, volumetric rainforest mist, natural lens optics and subtle film grain, cinematic lighting';

const out = [];

// Leaders
Object.keys(LEADERS).forEach((id) => {
  out.push({
    id,
    kind: 'leader',
    width: 1024,
    height: 1024,
    prompt: `${LEADERS[id]}. ${STYLE_LEADER}.`,
  });
});

// Cards
Object.keys(CARDS).forEach((id) => {
  const c = CARDS[id];
  const palette = FACTION_PALETTE[c.faction] || FACTION_PALETTE.neutral;
  const scene = SCENES[id] || `${c.name} — sci-fi ${c.type} on an alien frontier planet`;
  const style = ORGANIC_ONLY.has(id) ? STYLE_ORGANIC : STYLE_CARD;
  out.push({
    id,
    name: c.name,
    faction: c.faction,
    type: c.project ? 'project' : c.type,
    width: 1024,
    height: 768,
    prompt: `${scene}. Atmosphere: ${palette}. ${style}.`,
  });
});

const dst = path.join(__dirname, 'art_prompts.json');
const existingMap = {};
if (fs.existsSync(dst)) {
  try {
    const prev = JSON.parse(fs.readFileSync(dst, 'utf8'));
    prev.forEach((p) => { existingMap[p.id] = p; });
  } catch (e) { /* start fresh if corrupted */ }
}

const merged = out.map((entry) => {
  if (existingMap[entry.id]) {
    // Preserve user-edited prompts and custom negative prompts, while updating card metadata
    return Object.assign({}, entry, {
      prompt: existingMap[entry.id].prompt || entry.prompt,
      negative: existingMap[entry.id].negative || entry.negative,
    });
  }
  return entry;
});

const addedCount = merged.filter((e) => !existingMap[e.id]).length;
const preservedCount = merged.length - addedCount;
fs.writeFileSync(dst, JSON.stringify(merged, null, 2), 'utf8');
const dstJs = path.join(__dirname, 'art_prompts.js');
fs.writeFileSync(dstJs, `/* Auto-generated from art_prompts.json */\nwindow.TauCetiPrompts = ${JSON.stringify(merged)};\n`, 'utf8');
console.log(`Synced ${merged.length} prompts (${preservedCount} existing preserved, ${addedCount} new added) -> ${dst}`);
