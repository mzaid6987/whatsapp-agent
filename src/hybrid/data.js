/**
 * Static data: cities, products, gender detection, regions, delivery times
 */

// ============= PRODUCT CATALOG =============
const PRODUCTS = [
  { id:1, name:'T9 Vintage Professional Trimmer', short:'T9 Trimmer', price:1399,
    kw:['t9','trimmer','trimer','shaver','hair cut','baal','bal','machine','mchine','mshine','bal katny','baal katny','bal katne','baal katne','baal machine','bal machine','hair cutting','shaving','hair trimmer','hair removal','beard','razor','clipper','daadhi','dadhi','shaving machine'],
    f1:'Metal body trimmer hai — 3 guide combs aati hain different lengths ke liye',
    f2:'Sharp T-blade hai clean lines ke liye, quiet motor, USB rechargeable',
    desc:'Daadhi aur baal dono ke liye use hota hai. Zero gapping blade hai precise trimming ke liye. Lightweight aur portable hai.' },

  { id:2, name:'5-in-1 Blackhead Remover', short:'Blackhead Remover', price:1799,
    kw:['blackhead','pore','acne','face clean','black head','pimple','skin','facial cleaner','derma suction','derma','suction','pore vacuum','vacuum'],
    f1:'Deep pore vacuum suction — 5 interchangeable heads hain (har skin type ke liye)',
    f2:'5 adjustable suction levels hain, USB rechargeable, gentle hai skin pe',
    desc:'Blackheads, whiteheads aur dead skin nikalta hai bina dard ke. Nose, chin, forehead — sab jagah use ho sakta hai. Regular use se pores tight hote hain.' },

  { id:3, name:'Stainless Steel Cutting Board Large Size', short:'Cutting Board', price:1799,
    kw:['cutting board','chopping','steel board','steel sheet','sheet','chopping board','stainless steel','stainless'],
    f1:'Food grade stainless steel — 39cm x 48cm large size',
    f2:'Non-porous hai bacteria nahi lagta, scratch-proof, easy to clean — paani se dho lo bas',
    desc:'Wooden boards ki tarah bacteria nahi absorb karta. Easy to clean — paani se dho lo bas. Kitchen mein sabzi, gosht sab kaat sakte ho safely.' },

  { id:4, name:'2 in 1 Glass Oil Spray Dispenser', short:'Oil Spray', price:1399,
    kw:['oil spray','spray bottle','cooking spray','oil dispenser','glass spray','oil bottle'],
    f1:'Glass body hai — fine mist spray karta hai, cooking mein oil 80% tak kam lagta hai',
    f2:'2-in-1 design: spray bhi aur pour bhi kar sakte ho. Eco friendly, reusable',
    desc:'Air fryer, salad, grilling — har jagah use hota hai. Oil waste kam karta hai. Glass hai to taste ya smell nahi absorb karta.' },

  { id:5, name:'Ear Wax Cleaning Kit', short:'Ear Wax Kit', price:599,
    kw:['ear','wax','ear clean','kaan','ear pick','ear cleaning','kaan ki safai','kaan clean'],
    f1:'Stainless steel ke 6 tools hain — har type ka wax nikalne ke liye',
    f2:'Buy 1 Get 1 Free — 2 complete sets milein ge. Portable leather case mein aata hai',
    desc:'Cotton buds se wax andar jaata hai, yeh safely bahar nikalta hai. Spring coil tool bhi hai deep cleaning ke liye. Safe hai kaan ke liye.' },

  { id:6, name:'Electric Vegetable Cutter 4-in-1', short:'Vegetable Cutter', price:2099,
    kw:['vegetable','veg','cutter','chopper','slicer','sabzi','onion','pyaaz','garlic','electric cutter','veg cutter'],
    f1:'One button operation — sabzi, pyaaz, garlic, lehsun sab kaat ta hai seconds mein',
    f2:'Self-cleaning function hai, USB rechargeable, 4 blades included',
    desc:'Haath se kaatne ki zaroorat nahi — button press karo aur done. Aankh mein aansoo nahi aate pyaaz kaatne pe. Waterproof hai, paani mein dho sakte ho.' },

  { id:7, name:'2-in-1 Facial Hair Remover and Eyebrow Trimmer', short:'Facial Hair Remover', price:1399,
    kw:['facial','eyebrow','face hair','hair remover','hair removr','hair removar','removr','removar','brow','face remover','lip hair','peach fuzz','machine','mchine','mshine','threading','lady trimmer','ladies trimmer','abru','aabru','trimmer','trimer'],
    f1:'Gentle aur painless — chehre ke baal aur eyebrow trimming dono ke liye',
    f2:'Precision eyebrow trimmer head included, USB rechargeable, compact design',
    desc:'Upper lip, chin, cheeks — sab jagah ka peach fuzz nikalta hai bina irritation ke. Built-in LED light hai. Purse mein rakh ke kahin bhi le jao.' },

  { id:8, name:'Compact Portable Nebulizer', short:'Nebulizer', price:1699,
    kw:['nebulizer','inhaler','breathing','saans','asthma','respiratory','khansi','nazla','zukaam','steam','cough','phephre','phephra','nakseer'],
    f1:'Silent operation — bachy bhi use kar sakte hain bina darr ke',
    f2:'Adult + child dono masks aati hain, 10ml medicine cup, USB rechargeable, portable',
    desc:'Ghar pe hi nebulization ho jati hai — hospital jaane ki zaroorat nahi. Asthma, cough, saans ki taklif ke liye. Chota hai, travel mein bhi le ja sakte ho.' },

  { id:9, name:'Knee Support Sleeve', short:'Knee Sleeve', price:1499,
    kw:['knee','sleeve','support','joint','ghutna','ghutnay','pain','joron ka dard','arthritis','ghutne'],
    f1:'Non-slip silicone strips hain — exercise ya walk mein nahi khiskata',
    f2:'Breathable lycra material, Buy 1 Get 1 Free — dono knees cover',
    desc:'Joron ke dard, sports, gym, walking — sab ke liye. Compression support deta hai jo pain reduce karta hai. Kapdon ke andar bhi pehen sakte ho — dikhta nahi.' },

  { id:10, name:'Grey Duster Cleaning Kit', short:'Duster Kit', price:1250,
    kw:['duster','cleaning kit','dust','safai','cleaning','jhaadu'],
    f1:'8 feet tak extend hota hai — fan, ceiling, corners sab reach hote hain',
    f2:'Bendable head hai angled cleaning ke liye, washable microfiber — baar baar use karo',
    desc:'Ceiling fan, AC vents, almari ke upar — sab jagah pohonch jaata hai. Microfiber dust pakad ke rakhta hai, udaata nahi. Dho ke phir se use karo.' },

  { id:11, name:'Mini Pain Relief EMS Butterfly Massager', short:'EMS Massager', price:1099,
    kw:['massager','massage','ems','butterfly','pain relief','dard','muscle','body massager','kamar dard','back pain','shoulder','gardan','body pain','electric massager','mini massager','titli','pain','relief','relaxation','masajr','masajer'],
    f1:'EMS technology se muscles ko direct stimulation milti hai — dard mein fori rahat',
    f2:'Compact butterfly design, multiple intensity levels, portable — kahin bhi use karo',
    desc:'Kamar, gardan, kandhe, tange — jahan bhi dard ho chipka do. Electric pulses se muscles relax hoti hain. Chota hai pocket mein aa jata hai.' },
];

const UPSELL_MAP = { 1:[2,5], 2:[7,1], 3:[6,4], 4:[3,6], 5:[1,7], 6:[3,4], 7:[2], 10:[3,6], 11:[9,8] };

// ============= CITIES =============
const CITIES_FAST = ['karachi','lahore','islamabad','rawalpindi'];
const CITIES_MED = ['faisalabad','multan','peshawar','sialkot','gujranwala','hyderabad','sahiwal','gujrat'];

// Only top 5 cities abbreviations accepted — baqi sab ke liye proper name required
const CITY_ABBR = {
  khi:'Karachi', lhr:'Lahore', isb:'Islamabad', rwp:'Rawalpindi', fsd:'Faisalabad',
  pindi:'Rawalpindi', pidni:'Rawalpindi', pndi:'Rawalpindi', rawpindi:'Rawalpindi', rawalpndi:'Rawalpindi', rwalpindi:'Rawalpindi'
};

const ALL_CITIES = [
  'karachi','lahore','islamabad','rawalpindi','faisalabad','multan','peshawar','quetta',
  'sialkot','gujranwala','hyderabad','bahawalpur','sargodha','sukkur','larkana','sheikhupura',
  'jhang','rahim yar khan','mardan','gujrat','kasur','dera ghazi khan','sahiwal','wah',
  'mingora','okara','mirpur','chiniot','nawabshah','kamoke','hafizabad','sadiqabad','burewala',
  'jhelum','khanewal','muzaffargarh','abbottabad','swat','gilgit','gwadar','vehari','chakwal',
  'layyah','attock','battagram','mansehra','kohat','dera ismail khan','turbat','khuzdar',
  'jacobabad','shikarpur','tando adam','mirpurkhas','kotri','taxila','wazirabad','mandi bahauddin',
  'shahkot','toba tek singh','pakpattan','lodhran','rajanpur','bhakkar','mianwali','khairpur',
  'nowshera','charsadda','swabi','bannu','tank','hangu','karak','lakki marwat',
  'muzaffarabad','rawalakot','bhimber','kotli','bagh','hattian bala',
  'chitral','dir','malakand','buner','shangla','kohistan',
  'zhob','loralai','pishin','chaman','sibi','kalat','mastung','nushki',
  'skardu','hunza','ghizer','astore','diamer',
  'murree','nathia gali','bhurban','haripur','hassan abdal',
  'fatehpur','mian channu','kamalia','jaranwala','samundri','tandlianwala','fateh jang','pattoki','arifwala','chishtian','duniya pur','alipur','jatoi','kot addu','kabirwala'
];

const REGIONS = ['kashmir','ajk','punjab','sindh','kpk','balochistan','fata','gilgit baltistan','khyber pakhtunkhwa'];

const REGION_EXAMPLES = {
  kashmir: 'Muzaffarabad, Mirpur, Rawalakot',
  ajk: 'Muzaffarabad, Mirpur, Rawalakot, Bhimber',
  punjab: 'Lahore, Faisalabad, Multan, Rawalpindi',
  sindh: 'Karachi, Hyderabad, Sukkur, Larkana',
  kpk: 'Peshawar, Mardan, Abbottabad, Mingora',
  'khyber pakhtunkhwa': 'Peshawar, Mardan, Abbottabad, Mingora',
  balochistan: 'Quetta, Gwadar, Turbat, Khuzdar',
  fata: 'Wana, Miranshah, Parachinar',
  'gilgit baltistan': 'Gilgit, Skardu, Hunza'
};

// ============= GENDER DETECTION =============
// Comprehensive name database: ~600 female, ~500 male, ~80 male-ending-in-a
const { FEMALE_NAMES, MALE_NAMES_ENDING_A, MALE_NAMES } = require('./names');

function getHonorific(name, genderOverride) {
  // Gender override from feminine verb detection (e.g., "krlungi", "deti hon")
  if (genderOverride === 'female') return 'madam';
  if (!name) return 'sir';
  const firstName = name.trim().split(/\s+/)[0].toLowerCase();

  // 1. Check male exceptions FIRST (names ending in 'a' but male — Hamza, Mustafa, Krishna etc.)
  if (MALE_NAMES_ENDING_A.has(firstName)) return 'sir';

  // 2. Check known female names (570+ Pakistani Muslim + Christian + Hindu)
  const isFirstFemale = FEMALE_NAMES.has(firstName);

  // 3. Check known male names (570+ Pakistani Muslim + Christian + Hindu)
  if (MALE_NAMES.has(firstName)) return 'sir';

  // 4. Male pattern exceptions — check BEFORE female patterns
  // Names ending in "ullah" or "allah" are ALWAYS male (Fazalullah, Abdullah, Ataullah, Saifullah, etc.)
  if (/(?:ullah?|allah?|uddin|ulhaq|ulmulk|ulislam|urrasheed|urrehman|urrahim)$/i.test(firstName)) return 'sir';

  // 4b. Secondary name check — check remaining parts for gender clues
  // e.g. "Lala Riaz Khan" — "Lala" unknown but "Riaz"/"Khan" = male
  // e.g. "Gul Khan" — "Gul" is female name but "Khan" = male indicator
  const nameParts = name.trim().split(/\s+/).map(p => p.toLowerCase());
  if (nameParts.length >= 2) {
    const MALE_INDICATORS = new Set(['khan','muhammad','mohammad','mohd','md','hussain','nawaz','iqbal','ashraf','akbar','aslam','anwar','arshad','baig','beg','chaudhry','chaudhary','mian','syed']);
    for (let i = 1; i < nameParts.length; i++) {
      if (MALE_NAMES.has(nameParts[i]) || MALE_NAMES_ENDING_A.has(nameParts[i]) || MALE_INDICATORS.has(nameParts[i])) return 'sir';
      if (FEMALE_NAMES.has(nameParts[i])) return 'madam';
    }
  }

  // 4c. If first name is known female and no secondary override, return madam
  if (isFirstFemale) return 'madam';

  // 5. Pattern-based: Pakistani female names commonly end in these
  if (/(?:een|ina|ish|esha|iza|ila|iya|eena|eema|ima|iba|ira|iha|ija|ika|ita|iza|uja|uma|uha|uka|ula|ura|uza)$/i.test(firstName)) return 'madam';
  if (/(?:ksh|msh|nsh)$/i.test(firstName)) return 'madam'; // mehwish, etc
  if (firstName.length >= 4 && /a$/i.test(firstName)) return 'madam'; // 4+ chars ending in 'a' → likely female
  if (/(?:ah|at)$/i.test(firstName) && firstName.length >= 4) return 'madam'; // wardah, riffat

  // 5. Default: sir
  return 'sir';
}

// ============= DELIVERY TIME =============
function deliveryTime(city) {
  if (!city) return '3-5 din';
  const l = city.toLowerCase();
  if (CITIES_FAST.includes(l)) return '2-3 din';
  if (CITIES_MED.includes(l)) return '3-4 din';
  return '4-6 din';
}

// ============= HELPERS =============
function fmtPrice(n) { return 'Rs.' + n.toLocaleString(); }

const PRODUCT_EMOJIS = ['💇', '✨', '🔪', '🫒', '👂', '🥬', '💆', '💨', '🦵', '🧹'];

function productList() {
  return PRODUCTS.map((p, i) => {
    const num = `${i + 1}.`;
    return `${num} ${p.name} — ${fmtPrice(p.price)}`;
  }).join('\n');
}

function productListWithFeatures() {
  return PRODUCTS.map((p, i) => {
    const num = `${i + 1}.`;
    return `${num} ${p.short} — ${fmtPrice(p.price)} | ${p.f1}`;
  }).join('\n');
}

module.exports = {
  PRODUCTS, UPSELL_MAP, CITIES_FAST, CITIES_MED, CITY_ABBR, ALL_CITIES,
  REGIONS, REGION_EXAMPLES, FEMALE_NAMES, MALE_NAMES, MALE_NAMES_ENDING_A,
  getHonorific, deliveryTime, fmtPrice, productList, productListWithFeatures
};
