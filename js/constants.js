// --------------------------------------------------------
//  TILE CONSTANTS
// --------------------------------------------------------
export const T = {
  WALL: '#', ROAD_MAIN: '=', ROAD_SIDE: '-', GROUND: '.', WATER: '~', TREE: 'T', PARK: 'P', SAND: 's',
  BRIDGE: 'b', DOCK: 'k', INDUSTRIAL: 'I', HIGHWAY: 'H',
  POI_AMMO: 'A', POI_HOSPITAL: '+', POI_HOOKER: 'K', POI_GAMBLING: 'B',
  POI_DRUG: 'D', POI_SHOP: '$', POI_VEHICLE: 'V', POI_WORK: 'W', POI_GANG: 'G',
  POI_STRIP: 'X',
  PLAZA: 'Z', PARKING: 'L'
};

export const POI_DEFS = {
  [T.POI_AMMO]:     { name: 'Ammu-Nation',    color: '#ff3333', colorHex: 0xff3333, icon: 'A', menu: 'menuGuns' },
  [T.POI_HOSPITAL]: { name: 'Hospital',       color: '#ffffff', colorHex: 0xffffff, icon: '+', menu: 'menuHospital' },
  [T.POI_HOOKER]:   { name: 'Street Corner',  color: '#ff44ff', colorHex: 0xff44ff, icon: 'K', menu: 'menuHookers' },
  [T.POI_GAMBLING]: { name: 'Gambling Den',    color: '#ffd700', colorHex: 0xffd700, icon: 'B', menu: 'menuGambling' },
  [T.POI_DRUG]:     { name: 'Drug Dealer',     color: '#44ffff', colorHex: 0x44ffff, icon: 'D', menu: 'menuDrugs' },
  [T.POI_SHOP]:     { name: 'Convenience Store',color: '#4488ff', colorHex: 0x4488ff, icon: '$', menu: 'menuShops' },
  [T.POI_VEHICLE]:  { name: 'Vehicle Dealer',  color: '#ff8800', colorHex: 0xff8800, icon: 'V', menu: 'menuVehicles' },
  [T.POI_WORK]:     { name: 'Job Center',      color: '#44ff44', colorHex: 0x44ff44, icon: 'W', menu: 'menuJobs' },
  [T.POI_GANG]:     { name: 'Gang HQ',         color: '#aa44ff', colorHex: 0xaa44ff, icon: 'G', menu: 'menuGang' },
  [T.POI_STRIP]:    { name: 'Strip Club',      color: '#ff66aa', colorHex: 0xff66aa, icon: 'X', menu: 'menuStripClub' }
};

export const TILE_COLORS = {
  [T.WALL]:       '#2a2a3a',
  [T.ROAD_MAIN]:  '#3a3a3a',
  [T.ROAD_SIDE]:  '#333333',
  [T.GROUND]:     '#1a2a1a',
  [T.WATER]:      '#1a3a5a',
  [T.TREE]:       '#1a4a1a',
  [T.PARK]:       '#1a3a1a',
  [T.SAND]:       '#4a3a1a',
  [T.BRIDGE]:     '#5a5040',
  [T.DOCK]:       '#3a3028',
  [T.INDUSTRIAL]: '#2a2a30',
  [T.HIGHWAY]:    '#4a4a4a',
  [T.PLAZA]:      '#3a3a2a',
  [T.PARKING]:    '#2a2a2a'
};

// --------------------------------------------------------
//  CONSTANTS
// --------------------------------------------------------
export const MAP_SIZE = 200;
export const CELL = 1; // world units per cell

export const CITIES = {
  'Los Santos':   { districts: ['Grove Street','Idlewood','Ganton','Vinewood','Santa Maria Beach','Downtown LS','East LS','Verona Beach','Playa del Seville','Temple','Rodeo','Richman','El Corona','Willowfield','Jefferson','Market','Commerce'], color: '#44ff44', groundTint: [26, 42, 26], waterSide: 'south' },
  'San Fierro':   { districts: ['Chinatown','Doherty','Garcia','Hashbury','Queens','Esplanade North','Juniper Hill','Calton Heights','Financial','Ocean Flats','Avispa Country Club','Foster Valley','Missionary Hill','Kings','Battery Point','Paradiso','Santa Flora'], color: '#4488ff', groundTint: [26, 36, 42], waterSide: 'west' },
  'Las Venturas': { districts: ['The Strip','Old Venturas','Creek','Redsands West','Redsands East','Camel Toe','Pilson Intersection','Whitewood Estates','Roca Escalante','Royal Casino','Come-a-Lot','Pirates in Mens Pants','Starfish Casino','Emerald Isle','LV Airport','Randolph Industrial','The Clown Pocket'], color: '#ff44ff', groundTint: [50, 40, 26], waterSide: null },
  'Vice City':    { districts: ['Ocean Beach','Washington Beach','Starfish Island','Prawn Island','Little Havana','Little Haiti','Downtown Vice','Vice Point','Escobar International','Hyman Memorial','Coral Gables','Leaf Links','Viceport','North Point Mall','Sunshine Autos','Junkyard','Links View'], color: '#ff8844', groundTint: [42, 36, 26], waterSide: 'surround' },
  'Liberty City': { districts: ['Portland','Staunton Island','Shoreside Vale','Chinatown LC','Saint Marks','Trenton','Aspatria','Bedford Point','Pike Creek','Cedar Grove','Cochrane Dam','Francis International','Fort Staunton','Belleville Park','Wichita Gardens','Callahan Point','Harwood'], color: '#ffff44', groundTint: [34, 34, 38], waterSide: 'east' }
};

export const JOBS = [
  { name: 'Taxi Driver',     skill: 'driving',  min: 20, max: 70,  hours: 2 },
  { name: 'Delivery Driver', skill: 'driving',  min: 25, max: 80,  hours: 3 },
  { name: 'Mechanic',        skill: 'strength', min: 30, max: 75,  hours: 3 },
  { name: 'Security Guard',  skill: 'strength', min: 35, max: 85,  hours: 4 },
  { name: 'Street Performer',skill: 'charisma', min: 25, max: 80,  hours: 2 },
  { name: 'Bus Driver',      skill: 'driving',  min: 20, max: 70,  hours: 4 },
  { name: 'Bartender',       skill: 'charisma', min: 30, max: 85,  hours: 3 },
  { name: 'Dock Worker',     skill: 'strength', min: 25, max: 75,  hours: 4 },
  { name: 'Construction',    skill: 'strength', min: 35, max: 90,  hours: 4 },
  { name: 'Chef',            skill: 'charisma', min: 40, max: 100, hours: 3 },
  { name: 'Pizza Delivery',  skill: 'driving',  min: 25, max: 70,  hours: 2 },
  { name: 'Street Vendor',   skill: 'charisma', min: 30, max: 75,  hours: 3 }
];

export const CRIMES = [
  { name: 'Rob Store',         skill: 'stealth',  baseMin: 15, baseMax: 35, lootMin: 50,  lootMax: 250,  lootMul: 10, dmgMin: 5,  dmgMax: 20, respectMin: 5,   respectMax: 15,  heat: 2,  hours: 2, failWanted: 1, failFineMin: 50,  failFineMax: 225, failDmgMin: 10, failDmgMax: 45 },
  { name: 'Burglary',          skill: 'stealth',  baseMin: 5,  baseMax: 55, lootMin: 75,  lootMax: 400,  lootMul: 15, dmgMin: 0,  dmgMax: 10, respectMin: 10,  respectMax: 30,  heat: 5,  hours: 3, failWanted: 1, failFineMin: 75,  failFineMax: 350, failDmgMin: 15, failDmgMax: 55 },
  { name: 'Heist',             skill: 'stealth',  baseMin: 10, baseMax: 55, lootMin: 250, lootMax: 1000, lootMul: 25, dmgMin: 15, dmgMax: 45, respectMin: 50,  respectMax: 150, heat: 15, hours: 5, failWanted: 2, failFineMin: 100, failFineMax: 500, failDmgMin: 20, failDmgMax: 75 },
  { name: 'Carjack',           skill: 'driving',  baseMin: 20, baseMax: 35, lootMin: 20,  lootMax: 70,   lootMul: 5,  dmgMin: 0,  dmgMax: 15, respectMin: 1,   respectMax: 6,   heat: 1,  hours: 1, failWanted: 1, failFineMin: 25,  failFineMax: 150, failDmgMin: 10, failDmgMax: 45 },
  { name: 'Pickpocket',        skill: 'stealth',  baseMin: 30, baseMax: 90, lootMin: 20,  lootMax: 100,  lootMul: 5,  dmgMin: 0,  dmgMax: 0,  respectMin: 1,   respectMax: 3,   heat: 0,  hours: 1, failWanted: 1, failFineMin: 25,  failFineMax: 100, failDmgMin: 5,  failDmgMax: 15 },
  { name: 'Mug Someone',       skill: 'strength', baseMin: 35, baseMax: 65, lootMin: 30,  lootMax: 200,  lootMul: 8,  dmgMin: 10, dmgMax: 30, respectMin: 3,   respectMax: 10,  heat: 2,  hours: 2, failWanted: 1, failFineMin: 50,  failFineMax: 200, failDmgMin: 15, failDmgMax: 50 },
  { name: 'Arson',             skill: 'stealth',  baseMin: 25, baseMax: 60, lootMin: 100, lootMax: 300,  lootMul: 0,  dmgMin: 20, dmgMax: 40, respectMin: 20,  respectMax: 40,  heat: 8,  hours: 3, failWanted: 1, failFineMin: 100, failFineMax: 400, failDmgMin: 25, failDmgMax: 60 },
  { name: 'Kidnap for Ransom', skill: 'charisma', baseMin: 10, baseMax: 50, lootMin: 200, lootMax: 700,  lootMul: 20, dmgMin: 15, dmgMax: 35, respectMin: 30,  respectMax: 75,  heat: 10, hours: 3, failWanted: 1, failFineMin: 200, failFineMax: 600, failDmgMin: 25, failDmgMax: 65 },
  { name: 'Bank Robbery',     skill: 'stealth',  baseMin: 5,  baseMax: 35, lootMin: 500, lootMax: 2000, lootMul: 30, dmgMin: 20, dmgMax: 50, respectMin: 80,  respectMax: 200, heat: 20, hours: 4, failWanted: 3, failFineMin: 500, failFineMax: 1500, failDmgMin: 30, failDmgMax: 80 },
  { name: 'Cop Car Ambush',   skill: 'strength', baseMin: 5,  baseMax: 30, lootMin: 300, lootMax: 900,  lootMul: 20, dmgMin: 25, dmgMax: 55, respectMin: 60,  respectMax: 120, heat: 25, hours: 2, failWanted: 3, failFineMin: 400, failFineMax: 1000, failDmgMin: 35, failDmgMax: 70 },
  { name: 'Armored Truck Hit', skill: 'driving', baseMin: 8,  baseMax: 40, lootMin: 800, lootMax: 3000, lootMul: 40, dmgMin: 15, dmgMax: 45, respectMin: 100, respectMax: 250, heat: 30, hours: 5, failWanted: 3, failFineMin: 600, failFineMax: 2000, failDmgMin: 40, failDmgMax: 90 }
];

export const GUNS = [
  { name: 'Hawk 9',          cat: 'Pistol',  price: 100,  bonus: 5 },
  { name: 'Rex 38',          cat: 'Pistol',  price: 150,  bonus: 7 },
  { name: 'Bulldog 45',      cat: 'Pistol',  price: 200,  bonus: 10 },
  { name: 'Hawk 9 Silencer', cat: 'Pistol',  price: 120,  bonus: 20 },
  { name: 'Striker 12',      cat: 'Shotgun', price: 250,  bonus: 12 },
  { name: 'Undertaker Sawn-off', cat: 'Shotgun', price: 300, bonus: 14 },
  { name: 'Viper SMG',       cat: 'SMG',     price: 500,  bonus: 16 },
  { name: 'Spectre PDW',     cat: 'SMG',     price: 600,  bonus: 18 },
  { name: 'Phantom Carbine', cat: 'Rifle',   price: 700,  bonus: 20 },
  { name: 'AR-7 Assault',    cat: 'Rifle',   price: 750,  bonus: 22 },
  { name: 'Ravager LMG',     cat: 'Heavy',   price: 900,  bonus: 25 },
  { name: 'Diamondback MG',  cat: 'Heavy',   price: 1100, bonus: 28 },
  { name: 'Ghost Sniper',    cat: 'Sniper',  price: 1000, bonus: 25 },
  // Premium weapons
  { name: 'Rocket Launcher', cat: 'Heavy',   price: 5000,  bonus: 45 },
  { name: 'Minigun',         cat: 'Heavy',   price: 8000,  bonus: 50 },
  { name: 'Katana',          cat: 'Melee',   price: 2000,  bonus: 18 },
  { name: 'Chainsaw',        cat: 'Melee',   price: 3000,  bonus: 22 },
  { name: 'Golden Desert Eagle', cat: 'Pistol', price: 4000, bonus: 30 },
  { name: 'Plasma Rifle',    cat: 'Rifle',   price: 15000, bonus: 60 },
  { name: 'Flamethrower',    cat: 'Heavy',   price: 10000, bonus: 40 }
];

export const VEHICLES = [
  { name: 'Rusty Sedan',    price: 2000,  speed: 2 },
  { name: 'Motorcycle',     price: 1500,  speed: 2 },
  { name: 'Pickup Truck',   price: 2500,  speed: 2 },
  { name: 'Sports Car',     price: 5000,  speed: 3 },
  { name: 'Lowrider',       price: 3000,  speed: 2 },
  { name: 'SUV',            price: 3500,  speed: 2 },
  { name: 'Muscle Car',     price: 4000,  speed: 3 },
  { name: 'Convertible',    price: 4500,  speed: 2 },
  { name: 'Delivery Van',   price: 2000,  speed: 1 },
  { name: 'Dirt Bike',      price: 1200,  speed: 2 },
  { name: 'Luxury Sedan',   price: 7000,  speed: 3 },
  { name: 'Taxi Cab',       price: 2500,  speed: 2 },
  // Premium rides
  { name: 'Race Car',       price: 10000, speed: 4 },
  { name: 'Lamborduckni',   price: 25000, speed: 5 },
  { name: 'Monster Truck',  price: 15000, speed: 2 },
  { name: 'Armored Limo',   price: 20000, speed: 3 },
  { name: 'Jet Ski',        price: 8000,  speed: 3 },
  { name: 'Gold Plated SUV',price: 30000, speed: 3 },
  { name: 'Helicopter',     price: 50000, speed: 6 },
  { name: 'Tank',           price: 75000, speed: 1 }
];

export const DRUGS = [
  { name: 'Weed',    basePrice: 50 },
  { name: 'Cocaine', basePrice: 200 },
  { name: 'Heroin',  basePrice: 250 },
  { name: 'Meth',    basePrice: 150 },
  { name: 'Ecstasy', basePrice: 100 },
  { name: 'LSD',     basePrice: 175 },
  { name: 'Adderall',basePrice: 80 }
];

export const GANGS = {
  'Los Santos':   ['Grove Street Families', 'Ballas', 'Los Santos Vagos'],
  'San Fierro':   ['Triads', 'San Fierro Rifa', 'Da Nang Boys'],
  'Las Venturas': ['Leone Family', 'Sindacco Family', 'Forelli Family'],
  'Vice City':    ['Vercetti Gang', 'Diaz Cartel', 'Cubans'],
  'Liberty City': ['Portland Triads', 'Yakuza', 'Southside Hoods']
};

export const RANK_THRESHOLDS = [
  { rank: 'Outsider',   respect: 0 },
  { rank: 'Associate',  respect: 100 },
  { rank: 'Soldier',    respect: 500 },
  { rank: 'Enforcer',   respect: 1500 },
  { rank: 'Lieutenant', respect: 4000 },
  { rank: 'Underboss',  respect: 10000 },
  { rank: 'Boss',       respect: 25000 }
];

export const PERKS = [
  { name: 'Street Negotiator',  tier: 1, cost: 1, desc: '10% cheaper bribes' },
  { name: 'Back Alley Surgeon', tier: 1, cost: 1, desc: 'Health packs heal +10 more' },
  { name: 'Grease Monkey',      tier: 1, cost: 1, desc: 'Vehicle repairs are free' },
  { name: 'Master of Disguise', tier: 2, cost: 2, desc: 'Wanted gain reduced by 1' },
  { name: 'Pro Driver',         tier: 2, cost: 2, desc: '+15% escape chance from police' },
  { name: 'Charismatic Leader', tier: 3, cost: 3, desc: '25% cheaper recruiting' }
];

export const ITEMS = {
  'Health Pack': { price: 50, heal: 40, desc: 'Restores 40 HP' },
  'Molotov Cocktail': { price: 75, desc: 'Crime success +5%' },
  'Fake ID': { price: 150, desc: 'Reduces wanted by 1' },
  'Adrenaline Shot': { price: 100, desc: '+20% crime success for 1 crime' },
  'Body Armor': { price: 200, desc: 'Restores 50 armor' },
  'Lockpick Kit': { price: 120, desc: 'Burglary success +10%' },
  'Police Scanner': { price: 300, desc: 'Warns of nearby police' },
  'Brass Knuckles': { price: 60, desc: 'Mugging success +10%' },
  'Bulletproof Vest': { price: 500, desc: 'Restores 100 armor' },
  'Night Vision Goggles': { price: 1500, desc: 'See NPCs through walls at night' },
  'Jetpack Fuel': { price: 5000, desc: 'Instant travel to any district' },
  'Gold Watch': { price: 3000, desc: '+50 Respect' },
  'Duffle Bag': { price: 800, desc: 'Crime loot +25%' },
  'Smoke Grenade': { price: 200, desc: 'Escape police instantly once' }
};

// --------------------------------------------------------
//  HEISTS — 52 multi-step missions across 5 tiers
// --------------------------------------------------------
export const HEISTS = [
  // TIER 1: Petty (no crew needed, low risk) — $500-$3K
  { id: 1, name: 'Corner Store Stickup', city: 'Los Santos', tier: 1, crew: 0, setupCost: 0, payout: [800, 1500], wanted: 1, steps: ['Scout the store', 'Wait for closing time', 'Rob the register'], skill: 'stealth', skillReq: 1 },
  { id: 2, name: 'ATM Smash & Grab', city: 'Los Santos', tier: 1, crew: 0, setupCost: 100, payout: [600, 2000], wanted: 1, steps: ['Find isolated ATM', 'Disable camera', 'Crack it open'], skill: 'strength', skillReq: 1 },
  { id: 3, name: 'Purse Snatcher Ring', city: 'San Fierro', tier: 1, crew: 0, setupCost: 0, payout: [500, 1200], wanted: 1, steps: ['Stake out tourist area', 'Pick your mark', 'Grab and run'], skill: 'stealth', skillReq: 1 },
  { id: 4, name: 'Parking Meter Raid', city: 'Las Venturas', tier: 1, crew: 0, setupCost: 50, payout: [400, 900], wanted: 1, steps: ['Get a crowbar', 'Hit meters at night', 'Collect coins'], skill: 'strength', skillReq: 1 },
  { id: 5, name: 'Pizza Delivery Hijack', city: 'Vice City', tier: 1, crew: 0, setupCost: 0, payout: [500, 1000], wanted: 1, steps: ['Follow delivery driver', 'Block the road', 'Take the cash'], skill: 'driving', skillReq: 1 },
  { id: 6, name: 'Tip Jar Heist', city: 'Liberty City', tier: 1, crew: 0, setupCost: 0, payout: [300, 800], wanted: 1, steps: ['Find busy cafe', 'Create distraction', 'Swipe the jar'], skill: 'charisma', skillReq: 1 },
  { id: 7, name: 'Bike Chop Shop', city: 'Los Santos', tier: 1, crew: 0, setupCost: 200, payout: [1000, 2500], wanted: 1, steps: ['Steal bikes from campus', 'Bring to chop shop', 'Collect payment'], skill: 'stealth', skillReq: 2 },
  { id: 8, name: 'Valet Scam', city: 'Vice City', tier: 1, crew: 0, setupCost: 100, payout: [800, 2000], wanted: 1, steps: ['Get a valet uniform', 'Park at fancy restaurant', 'Drive off with a car'], skill: 'charisma', skillReq: 2 },
  { id: 9, name: 'Copper Wire Strip', city: 'Liberty City', tier: 1, crew: 0, setupCost: 50, payout: [600, 1500], wanted: 1, steps: ['Find construction site', 'Cut the wire', 'Sell to scrapyard'], skill: 'strength', skillReq: 1 },
  { id: 10, name: 'Food Truck Robbery', city: 'San Fierro', tier: 1, crew: 0, setupCost: 0, payout: [700, 1800], wanted: 1, steps: ['Wait for lunch rush', 'Threaten the cook', 'Empty the register'], skill: 'strength', skillReq: 1 },

  // TIER 2: Small Jobs (solo or 1 crew, medium risk) — $3K-$10K
  { id: 11, name: 'Liquor Store Chain Hit', city: 'Los Santos', tier: 2, crew: 0, setupCost: 500, payout: [3000, 6000], wanted: 2, steps: ['Case three stores', 'Plan the route', 'Hit all three in one night', 'Ditch the car'], skill: 'driving', skillReq: 3 },
  { id: 12, name: 'Warehouse Burglary', city: 'San Fierro', tier: 2, crew: 1, setupCost: 800, payout: [4000, 8000], wanted: 2, steps: ['Get warehouse layout', 'Cut the fence', 'Load the truck', 'Escape before dawn'], skill: 'stealth', skillReq: 3 },
  { id: 13, name: 'Jewelry Store Smash', city: 'Las Venturas', tier: 2, crew: 0, setupCost: 1000, payout: [5000, 10000], wanted: 2, steps: ['Buy a hammer', 'Disable the alarm', 'Smash display cases', 'Flee through back alley'], skill: 'strength', skillReq: 3 },
  { id: 14, name: 'Drug Stash Raid', city: 'Vice City', tier: 2, crew: 1, setupCost: 500, payout: [4000, 9000], wanted: 2, steps: ['Get intel on stash house', 'Watch guard patterns', 'Break in during shift change', 'Grab the product'], skill: 'stealth', skillReq: 3 },
  { id: 15, name: 'Armored Car Tail', city: 'Liberty City', tier: 2, crew: 1, setupCost: 1500, payout: [6000, 10000], wanted: 3, steps: ['Track the armored car route', 'Set up roadblock', 'Ambush the guards', 'Crack the back doors'], skill: 'driving', skillReq: 4 },
  { id: 16, name: 'Pawn Shop Heist', city: 'Los Santos', tier: 2, crew: 0, setupCost: 300, payout: [3000, 7000], wanted: 2, steps: ['Scout the pawn shop', 'Wait for owner to step out', 'Clean out the safe', 'Fence the goods'], skill: 'stealth', skillReq: 2 },
  { id: 17, name: 'Gas Station Spree', city: 'Las Venturas', tier: 2, crew: 0, setupCost: 200, payout: [3500, 6000], wanted: 2, steps: ['Map desert gas stations', 'Hit them one by one', 'Stay ahead of the cops', 'Lay low in the desert'], skill: 'driving', skillReq: 3 },
  { id: 18, name: 'Boat Theft', city: 'Vice City', tier: 2, crew: 1, setupCost: 800, payout: [5000, 9000], wanted: 2, steps: ['Find marina target', 'Neutralize dock guard', 'Hotwire the yacht', 'Deliver to buyer'], skill: 'driving', skillReq: 3 },
  { id: 19, name: 'Art Gallery Break-in', city: 'San Fierro', tier: 2, crew: 1, setupCost: 1200, payout: [6000, 10000], wanted: 2, steps: ['Visit gallery as tourist', 'Map the security system', 'Enter through skylight', 'Swap paintings with fakes'], skill: 'stealth', skillReq: 4 },
  { id: 20, name: 'Chop Shop Operation', city: 'Liberty City', tier: 2, crew: 1, setupCost: 2000, payout: [5000, 8000], wanted: 2, steps: ['Steal 3 luxury cars', 'Bring to chop shop', 'Strip and sell parts', 'Clean the trail'], skill: 'driving', skillReq: 3 },

  // TIER 3: Professional (1-2 crew, high risk) — $10K-$50K
  { id: 21, name: 'Bank Truck Ambush', city: 'Los Santos', tier: 3, crew: 2, setupCost: 5000, payout: [15000, 30000], wanted: 3, steps: ['Get inside info on route', 'Steal a police car', 'Pull over the truck', 'Blow the back doors', 'Escape via highway'], skill: 'strength', skillReq: 5 },
  { id: 22, name: 'Casino Chip Swap', city: 'Las Venturas', tier: 3, crew: 2, setupCost: 8000, payout: [20000, 40000], wanted: 3, steps: ['Get dealer uniforms', 'Plant counterfeit chips', 'Cash out at multiple windows', 'Exit through kitchen', 'Split the take'], skill: 'charisma', skillReq: 5 },
  { id: 23, name: 'Yacht Heist', city: 'Vice City', tier: 3, crew: 2, setupCost: 6000, payout: [18000, 35000], wanted: 3, steps: ['Get invite to yacht party', 'Scope the safe location', 'Drug the champagne', 'Crack the safe', 'Escape by speedboat'], skill: 'charisma', skillReq: 5 },
  { id: 24, name: 'Tech Startup Robbery', city: 'San Fierro', tier: 3, crew: 1, setupCost: 4000, payout: [12000, 25000], wanted: 2, steps: ['Hack security cameras', 'Clone access badges', 'Enter server room', 'Steal prototype hardware', 'Wipe the logs'], skill: 'stealth', skillReq: 5 },
  { id: 25, name: 'Triad Warehouse Hit', city: 'Liberty City', tier: 3, crew: 2, setupCost: 7000, payout: [20000, 45000], wanted: 3, steps: ['Gather intel on Triads', 'Bribe a guard', 'Infiltrate at night', 'Fight through security', 'Grab the contraband', 'Escape via tunnel'], skill: 'strength', skillReq: 6 },
  { id: 26, name: 'Train Robbery', city: 'Las Venturas', tier: 3, crew: 2, setupCost: 5000, payout: [15000, 35000], wanted: 3, steps: ['Study the train schedule', 'Board at desert stop', 'Neutralize guards', 'Blow the cargo door', 'Offload before next station'], skill: 'strength', skillReq: 5 },
  { id: 27, name: 'Museum After Hours', city: 'San Fierro', tier: 3, crew: 1, setupCost: 6000, payout: [20000, 40000], wanted: 2, steps: ['Study exhibit layout', 'Disable laser grid', 'Replace gems with fakes', 'Exit through ventilation', 'Fence through black market'], skill: 'stealth', skillReq: 6 },
  { id: 28, name: 'Drug Lab Takeover', city: 'Los Santos', tier: 3, crew: 2, setupCost: 8000, payout: [25000, 50000], wanted: 3, steps: ['Locate the lab', 'Cut the power', 'Storm the entrance', 'Secure the product', 'Set up your own crew'], skill: 'strength', skillReq: 5 },
  { id: 29, name: 'Luxury Car Ring', city: 'Vice City', tier: 3, crew: 1, setupCost: 5000, payout: [15000, 30000], wanted: 2, steps: ['Get a list of targets', 'Steal 5 exotic cars', 'Avoid LoJack tracking', 'Deliver to cargo ship', 'Collect payment'], skill: 'driving', skillReq: 6 },
  { id: 30, name: 'Nightclub Safe Crack', city: 'Liberty City', tier: 3, crew: 1, setupCost: 4000, payout: [12000, 28000], wanted: 2, steps: ['Get VIP access', 'Plant bug in office', 'Learn safe combo', 'Hit during peak hours', 'Blend into crowd'], skill: 'charisma', skillReq: 5 },

  // TIER 4: Major (2-3 crew, very high risk) — $50K-$200K
  { id: 31, name: 'Pacific Standard Bank', city: 'Los Santos', tier: 4, crew: 3, setupCost: 20000, payout: [80000, 150000], wanted: 4, steps: ['Steal getaway bikes', 'Get thermal charges', 'Hack the vault timer', 'Enter through sewers', 'Blow the vault', 'Fight through SWAT', 'Escape on bikes'], skill: 'strength', skillReq: 7 },
  { id: 32, name: 'The Diamond Casino', city: 'Las Venturas', tier: 4, crew: 3, setupCost: 25000, payout: [100000, 200000], wanted: 4, steps: ['Scope all entrances', 'Get security uniforms', 'Plant EMP device', 'Access vault corridor', 'Drill the vault', 'Load cash carts', 'Exit via roof helicopter'], skill: 'stealth', skillReq: 7 },
  { id: 33, name: 'Federal Reserve Raid', city: 'Liberty City', tier: 4, crew: 3, setupCost: 30000, payout: [120000, 200000], wanted: 5, steps: ['Get building blueprints', 'Tunnel from nearby shop', 'Bypass vault sensors', 'Crack the time lock', 'Load gold bars', 'Collapse the tunnel', 'Switch getaway cars 3 times'], skill: 'stealth', skillReq: 8 },
  { id: 34, name: 'Cartel Compound Raid', city: 'Vice City', tier: 4, crew: 3, setupCost: 20000, payout: [80000, 180000], wanted: 4, steps: ['Aerial surveillance', 'Recruit ex-military', 'Cut the perimeter', 'Neutralize guards', 'Secure the vault', 'Destroy evidence', 'Escape by helicopter'], skill: 'strength', skillReq: 7 },
  { id: 35, name: 'Silicon Valley Hack', city: 'San Fierro', tier: 4, crew: 2, setupCost: 15000, payout: [60000, 120000], wanted: 3, steps: ['Social engineer credentials', 'Plant USB in server room', 'Transfer crypto remotely', 'Cover digital tracks', 'Launder through shell companies', 'Collect clean cash'], skill: 'charisma', skillReq: 7 },
  { id: 36, name: 'Prison Break', city: 'Los Santos', tier: 4, crew: 3, setupCost: 25000, payout: [50000, 100000], wanted: 5, steps: ['Get contact inside', 'Smuggle in tools', 'Bribe a guard', 'Stage a riot', 'Extract the target', 'Helicopter extraction', 'Collect bounty'], skill: 'charisma', skillReq: 7 },
  { id: 37, name: 'Doomsday Prep', city: 'Las Venturas', tier: 4, crew: 2, setupCost: 18000, payout: [70000, 150000], wanted: 4, steps: ['Infiltrate military base', 'Steal access codes', 'Hack defense network', 'Download classified data', 'Sell to highest bidder', 'Eliminate witnesses'], skill: 'stealth', skillReq: 8 },
  { id: 38, name: 'Submarine Heist', city: 'Vice City', tier: 4, crew: 2, setupCost: 22000, payout: [90000, 180000], wanted: 4, steps: ['Locate sunken cargo', 'Hire dive team', 'Recover waterproof cases', 'Evade coast guard', 'Open at safehouse', 'Sell contents'], skill: 'driving', skillReq: 7 },
  { id: 39, name: 'Airport Cargo Heist', city: 'Liberty City', tier: 4, crew: 3, setupCost: 20000, payout: [75000, 160000], wanted: 4, steps: ['Get tarmac access badge', 'Identify target cargo', 'Swap truck during shift', 'Drive through fence', 'Outrun airport security', 'Deliver to warehouse'], skill: 'driving', skillReq: 7 },
  { id: 40, name: 'Mansion Invasion', city: 'San Fierro', tier: 4, crew: 2, setupCost: 15000, payout: [60000, 130000], wanted: 3, steps: ['Attend charity gala', 'Map the estate', 'Return at 3 AM', 'Disable alarms', 'Crack bedroom safe', 'Steal art collection', 'Vanish into fog'], skill: 'stealth', skillReq: 7 },

  // TIER 5: Legendary (3+ crew, extreme risk) — $200K-$1M+
  { id: 41, name: 'The Union Depository', city: 'Los Santos', tier: 5, crew: 3, setupCost: 50000, payout: [400000, 800000], wanted: 5, steps: ['Months of planning', 'Acquire military hardware', 'Tunnel under building', 'Disable seismic sensors', 'Breach the vault', 'Load gold into trucks', 'Decoy convoy strategy', 'Final escape'], skill: 'strength', skillReq: 9 },
  { id: 42, name: 'The Big Score', city: 'Las Venturas', tier: 5, crew: 3, setupCost: 60000, payout: [500000, 1000000], wanted: 5, steps: ['Hit 3 casinos in one night', 'EMP the entire Strip', 'Simultaneous vault breaches', 'Helicopter relay extraction', 'Evade military response', 'Split at desert airfield'], skill: 'stealth', skillReq: 9 },
  { id: 43, name: 'The Island Job', city: 'Vice City', tier: 5, crew: 3, setupCost: 40000, payout: [350000, 700000], wanted: 5, steps: ['Scope private island', 'Approach by submarine', 'Infiltrate compound', 'Neutralize mercenaries', 'Crack panic room safe', 'Steal bearer bonds', 'Escape before reinforcements', 'Launder internationally'], skill: 'stealth', skillReq: 9 },
  { id: 44, name: 'Mint Heist', city: 'Liberty City', tier: 5, crew: 3, setupCost: 55000, payout: [450000, 900000], wanted: 5, steps: ['Inside man recruitment', 'Get printing plates', 'Infiltrate through subway', 'Override security grid', 'Access plate storage', 'Print your own money', 'Destroy evidence', 'Multiple extraction routes'], skill: 'charisma', skillReq: 9 },
  { id: 45, name: 'The Cyber Heist', city: 'San Fierro', tier: 5, crew: 2, setupCost: 35000, payout: [300000, 600000], wanted: 3, steps: ['Hack banking network', 'Create ghost accounts', 'Transfer during maintenance', 'Reroute through 12 countries', 'Convert to crypto', 'Cash out through mixers', 'Eliminate digital trail'], skill: 'charisma', skillReq: 10 },
  { id: 46, name: 'Fort Zancudo Raid', city: 'Los Santos', tier: 5, crew: 3, setupCost: 45000, payout: [300000, 650000], wanted: 5, steps: ['Get military intel', 'Acquire EMP device', 'Disable radar', 'Breach perimeter', 'Fight to hangar', 'Steal fighter jet', 'Dogfight escape', 'Sell to arms dealer'], skill: 'strength', skillReq: 10 },
  { id: 47, name: 'Royal Flush', city: 'Las Venturas', tier: 5, crew: 3, setupCost: 50000, payout: [400000, 850000], wanted: 5, steps: ['Rig poker tournament', 'Plant dealers', 'Control the final table', 'Win $500K pot', 'Rob the cage simultaneously', 'Escape through underground', 'Meet at airstrip'], skill: 'charisma', skillReq: 9 },
  { id: 48, name: 'Hurricane Heist', city: 'Vice City', tier: 5, crew: 3, setupCost: 30000, payout: [250000, 500000], wanted: 4, steps: ['Wait for hurricane warning', 'Hit during evacuation', 'No cops on streets', 'Rob 5 banks in sequence', 'Use storm as cover', 'Rendezvous at warehouse'], skill: 'driving', skillReq: 8 },
  { id: 49, name: 'Alcatraz Break', city: 'San Fierro', tier: 5, crew: 3, setupCost: 40000, payout: [200000, 500000], wanted: 5, steps: ['Get imprisoned on purpose', 'Map the facility', 'Recruit inside crew', 'Build raft in workshop', 'Stage power outage', 'Cross the bay', 'Disappear forever'], skill: 'strength', skillReq: 9 },
  { id: 50, name: 'The Grand Finale', city: 'Liberty City', tier: 5, crew: 3, setupCost: 75000, payout: [750000, 1500000], wanted: 5, steps: ['Unite all crews', 'Simultaneous hits across city', 'Federal Reserve + 2 banks', 'Coordinate via encrypted radio', 'Military-grade extraction', 'Private jet escape', 'New identities abroad'], skill: 'charisma', skillReq: 10 },
  { id: 51, name: 'Area 69 Infiltration', city: 'Las Venturas', tier: 5, crew: 3, setupCost: 60000, payout: [500000, 1000000], wanted: 5, steps: ['Find secret entrance', 'Steal hazmat suits', 'Navigate underground', 'Bypass biometric locks', 'Access classified lab', 'Steal alien tech', 'Fight military response', 'Vanish into desert'], skill: 'stealth', skillReq: 10 },
  { id: 52, name: 'The One Last Job', city: 'Los Santos', tier: 5, crew: 3, setupCost: 100000, payout: [1000000, 2000000], wanted: 5, steps: ['Call in every favor', 'Assemble dream team', 'Three-pronged assault', 'Land, sea, and air', 'Breach the mega-vault', 'Fight off private army', 'Helicopter to submarine', 'Sail into the sunset'], skill: 'strength', skillReq: 10 }
];
