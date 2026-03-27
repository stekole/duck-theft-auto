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
