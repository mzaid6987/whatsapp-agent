/**
 * Pakistan City Areas Database — COMPREHENSIVE
 * Sourced from pakistan-data/ (14,251 lines) + Address X analysis (12,587 real orders)
 *
 * Each city has:
 *   popular: Top 5 areas (shown as suggestions when asking for address)
 *   areas:   Full list of known areas (used for extraction/matching)
 *
 * Coverage: 70+ cities, 1500+ areas
 * Top cities by order volume: Karachi > Lahore > Islamabad > Rawalpindi > Faisalabad
 */

const CITY_AREAS = {

  // ==========================================
  // KARACHI (~1800 orders — 7 districts)
  // ==========================================
  karachi: {
    popular: ['Gulshan-e-Iqbal', 'DHA/Defence', 'North Nazimabad', 'Nazimabad', 'Clifton'],
    areas: [
      // === Gulshan-e-Iqbal (Block 1-19) ===
      'gulshan e iqbal','gulshan-e-iqbal','gulshan','gulshan block 1','gulshan block 2',
      'gulshan block 3','gulshan block 4','gulshan block 5','gulshan block 6','gulshan block 7',
      'gulshan block 8','gulshan block 9','gulshan block 10','gulshan block 10-a','gulshan block 11',
      'gulshan block 12','gulshan block 13','gulshan block 13-d','gulshan block 14','gulshan block 15',
      'gulshan block 16','gulshan block 17','gulshan block 18','gulshan block 19',
      'ancholi','safoora','safoora goth','hazara goth','kamran chowrangi','perfume chowk','power house chowrangi',
      'abul hassan isphahani road',
      // === PECHS / Jamshed Town ===
      'pechs','pechs block 1','pechs block 2','pechs block 3','pechs block 4','pechs block 5','pechs block 6',
      'bahadurabad','tariq road','nursery','jail chowrangi','shaheed e millat','miran muhammad shah road',
      'karachi university',
      // === Ferozabad ===
      'pib colony','soldier bazaar','ferozabad','martin quarters','rizvia society','garden east',
      'guru mandir','jahangir road',
      // === Shah Faisal (Phase 1-4) ===
      'shah faisal colony','shah faisal','shah faisal town','shah faisal phase 1','shah faisal phase 2',
      'shah faisal phase 3','shah faisal phase 4','drigh colony','drigh road','kala board','dalmia',
      'model colony','faisal cantonment','paf base masroor',
      // === North Nazimabad (Block A-N) ===
      'north nazimabad','north nazimabad block a','north nazimabad block b','north nazimabad block c',
      'north nazimabad block d','north nazimabad block e','north nazimabad block f','north nazimabad block g',
      'north nazimabad block h','north nazimabad block i','north nazimabad block j','north nazimabad block k',
      'north nazimabad block l','north nazimabad block m','north nazimabad block n',
      'sakhi hassan','hyderi','power house','buffer zone','nagan chowrangi','kda scheme 33',
      // === Nazimabad (Block 1-4) ===
      'nazimabad','nazimabad block 1','nazimabad block 2','nazimabad block 3','nazimabad block 4',
      'paposh nagar','usmanabad','lalo khait','rizvia',
      // === Gulberg (Karachi, Block 1-19) ===
      'gulberg','gulberg block 1','gulberg block 2','gulberg block 3','gulberg block 4','gulberg block 5',
      'gulberg block 6','gulberg block 7','gulberg block 8','gulberg block 9','gulberg block 10',
      'gulberg block 11','gulberg block 12','gulberg block 13','gulberg block 14','gulberg block 15',
      'gulberg block 16','gulberg block 17','gulberg block 18','gulberg block 19',
      'pehlwan goth','samanabad','naseerabad',
      // === Liaquatabad (Block 1-10) / FB Area (Block 1-16) ===
      'liaquatabad','liaquatabad block 1','liaquatabad block 2','liaquatabad block 3','liaquatabad block 4',
      'liaquatabad block 5','liaquatabad block 6','liaquatabad block 7','liaquatabad block 8',
      'liaquatabad block 9','liaquatabad block 10',
      'federal b area','fb area','fb area block 1','fb area block 2','fb area block 3','fb area block 4',
      'fb area block 5','fb area block 6','fb area block 7','fb area block 8','fb area block 9',
      'fb area block 10','fb area block 11','fb area block 12','fb area block 13','fb area block 14',
      'fb area block 15','fb area block 16',
      'karimabad','super market','lasbela','teen hatti','up more',
      'mujahid colony','aisha manzil','water pump','kmc ground',
      // === New Karachi (Sector 1-5) / North Karachi (Sector 1-16) / Surjani ===
      'new karachi','new karachi sector 1','new karachi sector 2','new karachi sector 3',
      'new karachi sector 4','new karachi sector 5',
      'north karachi','north karachi sector 1','north karachi sector 2','north karachi sector 3',
      'north karachi sector 4','north karachi sector 5','north karachi sector 6','north karachi sector 7',
      'north karachi sector 8','north karachi sector 9','north karachi sector 10','north karachi sector 11',
      'north karachi sector 12','north karachi sector 13','north karachi sector 14','north karachi sector 15',
      'north karachi sector 16',
      'surjani town','surjani','surjani sector 1','surjani sector 2','surjani sector 3','surjani sector 4',
      'surjani sector 5','surjani sector 6','surjani sector 7','surjani sector 8',
      '5 star chowrangi','4k chowrangi','khawaja ajmer nagri','bhens colony','shafiq mor',
      'frontier colony','taimuria','khamiso goth',
      // === DHA (Phase 1-8) / Clifton (Block 1-9) ===
      'dha','defence','dha phase 1','dha phase 2','dha phase 3','dha phase 4','dha phase 5',
      'dha phase 6','dha phase 7','dha phase 8',
      'khayaban e ittehad','khayaban e shahbaz','khayaban e tanzeem','khayaban e badar',
      'khayaban e rahat','khayaban e bukhari','khayaban e muhafiz','khayaban e hafiz','khayaban e mujahid',
      'clifton','clifton block 1','clifton block 2','clifton block 3','clifton block 4','clifton block 5',
      'clifton block 6','clifton block 7','clifton block 8','clifton block 9',
      'boat basin','bath island','teen talwar','do talwar','creek vista','emaar crescent bay',
      'dha city','bahria town karachi','baheria town karachi','bahria town','baheria town',
      // === Saddar ===
      'saddar','zaibunnisa street','preedy street','regal chowk','bohri bazaar','light house',
      'abdullah haroon road','dr daud pota road','sindh secretariat','civil lines','burns garden',
      'ii chundrigar road','cantt station','artillary maidan',
      // === Lyari ===
      'lyari','chakiwara','kalakot','kalri','agra taj colony','bihar colony','baghdadi','nawab mohalla',
      'moosa lane','lea market','shah baig lane','khadda market','maripur road','daryabad',
      'singo lane','nayabad','raghi goth',
      // === Orangi (Sector 1-14) ===
      'orangi','orangi town','orangi sector 1','orangi sector 2','orangi sector 3','orangi sector 4',
      'orangi sector 5','orangi sector 6','orangi sector 7','orangi sector 8','orangi sector 9',
      'orangi sector 10','orangi sector 11','orangi sector 12','orangi sector 13','orangi sector 14',
      'qasba colony','banaras','zia ul haq colony','muslim mujahid colony','ghaziabad',
      'haryana colony','madina colony','gulshan e bihar','mominabad',
      // === SITE / Baldia / Kemari ===
      'site area','site','metroville','metroville 1','metroville 2','metroville 3',
      'golimar','patel para','manghopir','baba e urdu road','lasbela industrial',
      'baldia town','baldia','baldia sector 1','baldia sector 2','baldia sector 3','baldia sector 4',
      'baldia sector 5','baldia sector 6','baldia sector 7',
      'saeedabad','ittehad town','islam nagar','rasheedabad',
      'kemari','manora','shershah','machar colony','jackson','west wharf','maripur','hawks bay',
      'mominabad','moosa colony','haroonabad','ghousia colony',
      // === Malir ===
      'malir','malir city','malir cantt','malir kala board','saudabad','ghazi town','malir extension',
      'malir halt','quaidabad','sherpao colony','jinnah garden','jinnah square','dar us salam','naval colony malir',
      'khokhrapar','airport',
      // === Korangi (No 1-6) / Landhi (No 1-6) ===
      'korangi','korangi no 1','korangi no 2','korangi no 2.5','korangi no 3','korangi no 3.5',
      'korangi no 4','korangi no 5','korangi no 5.5','korangi no 6',
      'zaman town','bilal colony','nasir colony','mehran town','36 b area','chakra goth',
      'gulzar colony','zia colony','100 quarters','awami colony',
      'landhi','landhi no 1','landhi no 2','landhi no 3','landhi no 3.5','landhi no 4',
      'landhi no 5','landhi no 6','dawood chowrangi','sherabad','muzaffarabad colony','cattle colony',
      // === Bin Qasim / Gadap ===
      'bin qasim','ibrahim hyderi','rehri goth','steel town','pakistan steel','pipri',
      'gadap town','yousuf goth','taiser town','murad memon goth','kathore','schon circle',
      'mochko','maymarabad',
      // === Gulistan-e-Johar ===
      'gulistan e johar','gulistan-e-johar','gulistan e jauhar',
      // === Other Gulshan variants ===
      'gulshan e hadeed','gulshan-e-hadeed','gulshan e maymar','gulshan-e-maymar',
      'gulshan e shamim','gulshan e faisal','gulshan e rafi','gulshan e ghazi',
      // === Other ===
      'scheme 33','pakistan chowk','tower area','mehmoodabad','shah latif town',
    ],
  },

  // ==========================================
  // LAHORE (~1660 orders — 6 tehsils)
  // ==========================================
  lahore: {
    popular: ['DHA/Defence', 'Gulberg', 'Johar Town', 'Model Town', 'Bahria Town'],
    areas: [
      // === DHA (Phase 1-9) ===
      'dha','defence','dha phase 1','dha phase 2','dha phase 3','dha phase 4','dha phase 5',
      'dha phase 6','dha phase 7','dha phase 8','dha phase 9',
      'cavalry ground','fortress stadium','walton','eme society',
      // === Gulberg / Garden Town / Shadman ===
      'gulberg','gulberg 1','gulberg 2','gulberg 3','garden town','muslim town','shadman',
      'dharampura','firdous market','barkat market','main boulevard','liberty','mall road',
      // === Model Town / Faisal Town / Johar Town ===
      'model town','faisal town','iqbal town','johar town','samanabad','sabzazar','township',
      // === Cantt ===
      'cantt','lahore cantt','sarwar colony','paf colony','askari','bedian road','ghazi road',
      'thokar niaz baig',
      // === Bahria Town / Raiwind / Lake City ===
      'bahria town','baheria town','lake city','lda city','raiwind','jati umra','halloki','manga mandi',
      'sundar','kahna nau','kahna','kala shah kaku','kot radha kishan',
      // === Inner City / Walled City ===
      'anarkali','mozang','garhi shahu','krishan nagar','islampura','bilal gunj',
      'shahdara','mughalpura','baghbanpura','misri shah','badami bagh',
      'lakshmi chowk','shah alam','lorry adda','begumpura',
      'delhi gate','bhati gate','lohari gate','mochi gate','kashmiri gate','roshnai gate',
      'food street','heera mandi','chowk yadgar',
      // === Shalimar / Daroghawala ===
      'shalimar','harbancepura','batapur','daroghawala','ring road',
      // === Main Roads ===
      'multan road','ferozpur road','jail road','gt road','canal road','davis road',
      // === Other Colonies / Towns ===
      'wapda town','valencia','ichhra','sanda','sant nagar','chauburji','kalma chowk',
      'wagah','gulshan e ravi','allama iqbal town','ghulam muhammad abad',
      'expo centre','emporium mall','packages mall',
      'peoples colony','green town','nawab town',
      // === Al Rehman Garden / Housing Schemes ===
      'al rehman garden','alrehman garden','al-rehman garden','al rehman garden phase 1','al rehman garden phase 2',
      'alrehman garden phase 1','alrehman garden phase 2','eden garden','eden city','paragon city',
      'citi housing','central park housing','al kabir town','al jalil garden',
      // === Saddar area ===
      'saddar','jail road','civil lines',
    ],
  },

  // ==========================================
  // ISLAMABAD (~580 orders — ICT sectors + suburban)
  // ==========================================
  islamabad: {
    popular: ['G-10/G-11', 'F-8/F-10', 'I-8/I-10', 'Bahria Town', 'DHA'],
    areas: [
      // === F-sectors (F-5 to F-11) ===
      'f-5','f-6','f-7','f-8','f-9','f-10','f-11',
      'melody market','super market','jinnah super','kohsar market','f-7 food street',
      // === G-sectors (G-5 to G-16) ===
      'g-5','g-6','g-7','g-8','g-9','g-10','g-11','g-12','g-13','g-14','g-15','g-16',
      'aabpara','aabpara market','sitara market','karachi company','polyclinic',
      'g-8 markaz','g-9 markaz','g-10 markaz','g-11 markaz','g-13 markaz',
      // === E-sectors ===
      'e-7','e-8','e-9','e-10','e-11','faisal mosque',
      // === H-sectors ===
      'h-8','h-9','h-10','h-11','h-12','h-13',
      // === I-sectors ===
      'i-8','i-9','i-10','i-11','i-14','i-15','i-16',
      'i-8 markaz','i-9 markaz','i-10 markaz','i-8 industrial','i-9 industrial',
      // === D-sectors ===
      'd-11','d-12','d-13','d-14','d-17',
      // === B/C sectors (newer) ===
      'b-17','c-15','c-16',
      // === Major areas ===
      'blue area','faisal avenue','jinnah avenue','centaurus mall',
      'shakarparian','pakistan monument','margalla hills','daman e koh','pir sohawa','monal',
      'diplomatic enclave','saidpur village',
      // === Sub-urban ===
      'bhara kahu','tarnol','rawat','golra sharif','golra mor','humak','tramri',
      'shah allah ditta','rawal dam','rawal lake','simly dam','chattar park','lake view park',
      // === Housing societies ===
      'bahria town','baheria town','bahria enclave','dha phase 1','dha phase 2',
      'pwd','pwd housing','cda','mpchs e-11',
      // === Universities/Hospitals ===
      'pims','nust','quaid e azam university','comsats','pieas',
      // === Parks ===
      'fatima jinnah park','ayub park','kachnar park',
    ],
  },

  // ==========================================
  // RAWALPINDI (~530 orders — 7 tehsils)
  // ==========================================
  rawalpindi: {
    popular: ['Satellite Town', 'Saddar', 'Chaklala', 'Bahria Town', 'Cantt'],
    areas: [
      // === Main urban ===
      'satellite town','saddar','chaklala','cantt','rawalpindi cantt',
      'westridge','tench bhatta','morgah','scheme 3','shamsabad',
      'khayaban e sir syed','committee chowk','liaquat bagh','arya mohalla','banni',
      'raja bazaar','mall road','murree road','peshawar road','misrial road',
      // === All Dhoke neighborhoods ===
      'dhoke hassu','dhoke mangtal','dhoke ratta','dhoke kashmirian','dhoke kala khan',
      'dhoke syedan','dhoke jumma','dhoke mustaqeem',
      // === Housing ===
      'bahria town','baheria town','dha','askari','pwd','gulraiz','gulzar e quaid','media town',
      // === Roads ===
      'adiala road','chakra','pirwadhai','6th road','dhamial road','airport',
      // === Gujar Khan tehsil ===
      'gujar khan','rawat','mandra','jatli','daultala','bewal',
      // === Taxila tehsil ===
      'wah cantt','taxila','hasan abdal',
      // === Kahuta tehsil ===
      'kahuta',
      // === Murree tehsil ===
      'murree','ghora gali','jhika gali','nathia gali','changla gali','dunga gali',
      'lower topa','upper topa','bhurban','sunny bank',
      // === Kalar Syedan ===
      'kalar syedan',
    ],
  },

  // ==========================================
  // FAISALABAD (~450 orders — 6 tehsils, Chak system)
  // ==========================================
  faisalabad: {
    popular: ['Peoples Colony', 'Madina Town', 'Gulberg', 'D-Ground', 'Sargodha Road'],
    areas: [
      // === Main colonies ===
      'peoples colony','peoples colony no 1','peoples colony no 2',
      'madina town','gulberg','jinnah colony','batala colony',
      'ghulam muhammad abad','samanabad','millat town','eden valley',
      'sitara colony','d ground','d-ground','susan road',
      'civil lines',
      // === 8 Bazaars from Clock Tower ===
      'clock tower','bhawana bazaar','karkhana bazaar','rail bazaar','chiniot bazaar',
      'katchery bazaar','jhang bazaar','montgomery bazaar','aminpur bazaar',
      // === Main roads ===
      'jaranwala road','sargodha road','canal road','satiana road','millat road',
      // === Tehsils / Towns ===
      'chak jhumra','khurrianwala','dijkot','sammundri','tandlianwala','jaranwala',
      'sukheke','manawala','nawan lahore','lundianwala','buchiana','salarwala',
      'tarkhani','satiana','rodala road',
      // === Chak system (common ones from real orders) ===
      'chak 4 jb','chak 6 jb','chak 8 jb','chak 9 jb','chak 10 jb',
      'chak 55 jb','chak 77 gb','chak 115 jb','chak 117 jb',
      'chak 203 rb','chak 204 rb','chak 207 rb','chak 208 rb','chak 209 rb',
      'chak 219 rb','chak 220 rb','chak 225 rb','chak 239 rb','chak 242 rb',
    ],
  },

  // ==========================================
  // MULTAN (~300 orders — 4 tehsils)
  // ==========================================
  multan: {
    popular: ['Bosan Road', 'Cantt', 'Gulgasht Colony', 'Shah Rukn-e-Alam Colony', 'New Multan'],
    areas: [
      'bosan road','cantt','multan cantt','gulgasht colony','gulgasht',
      'shah rukn e alam colony','shah rukne alam','mumtazabad','new multan',
      'hussain agahi','chowk bazaar','model town','officers colony',
      'northern bypass','vehari road',
      // === Chungi system ===
      'chungi no 1','chungi no 6','chungi no 8','chungi no 14','chungi no 23',
      // === Gates ===
      'daulat gate','pak gate','haram gate','bohar gate','lohari gate',
      // === Shujabad tehsil ===
      'sher shah','shujabad','basti maluk','makhdoom rashid',
      // === Jalalpur Pirwala ===
      'jalalpur pirwala',
    ],
  },

  // ==========================================
  // GUJRANWALA (~320 orders — 5 tehsils)
  // ==========================================
  gujranwala: {
    popular: ['Satellite Town', 'Peoples Colony', 'Civil Lines', 'Model Town', 'DC Road'],
    areas: [
      'satellite town','peoples colony','civil lines','dc road','model town',
      'ferozewala road','baghbanpura','rahwali','lohianwala','eminabad road',
      'gondlanwala road','trust plaza','gt road','main gt road',
      'rahwali cantonment',
      // === Commercial/urban ===
      'clock tower','sheranwala gate','khiyali gate','sialkot road',
      'pasrur road','sheikhupura road','cantt area','railway road',
      'gift university','uet gujranwala','dhaunkal','tatlay aali','aroop',
      'jinnah stadium road','gujranwala bypass',
      // === Tehsils ===
      'kamoke','wazirabad','ghakhar mandi','alipur chattha','eminabad',
      'nowshera virkan','sohdra','akalgarh','qila didar singh',
    ],
  },

  // ==========================================
  // PESHAWAR (~210 orders — 5 tehsils)
  // ==========================================
  peshawar: {
    popular: ['Hayatabad', 'University Town', 'Saddar', 'Gulberg', 'Ring Road'],
    areas: [
      // === Hayatabad (Phase 1-7) ===
      'hayatabad','hayatabad phase 1','hayatabad phase 2','hayatabad phase 3',
      'hayatabad phase 4','hayatabad phase 5','hayatabad phase 6','hayatabad phase 7',
      // === University Town (Sector A-F) ===
      'university town','university town sector a','university town sector b',
      'university town sector c','university town sector d','university town sector e',
      'university town sector f',
      // === Saddar ===
      'saddar','saddar road','mall road','shami road','fakhr e alam road',
      // === Main areas ===
      'gulberg','board bazaar','hashtnagri','faqirabad','dalazak road','tehkal','pishtakhara',
      'regi model town','regi','regi lalma','danish abad','defence colony','wapda town',
      'pda colony','gor colony','tatara park',
      // === Walled City / Inner ===
      'andar shehr','kohati gate','lahori gate','kabuli gate','ganj gate',
      'khyber bazaar','meena bazaar','dabgari gardens','namak mandi','ghanta ghar',
      'shahi bagh','nothia','karimpura','shah qabool colony','yakatoot',
      // === Main roads ===
      'warsak road','kohat road','ring road','gt road','charsadda road','jamrud road',
      'old bara road','new bara road',
      // === Shah Alam / Mattani / Badhber tehsils ===
      'chamkani','badaber','sheikh muhammadi','landi arbab','achini','palosai','sarband',
      'mattani','adezai','masho khel','khazana',
    ],
  },

  // ==========================================
  // SIALKOT (~280 orders — 4 tehsils)
  // ==========================================
  sialkot: {
    popular: ['Cantt', 'Ugoki', 'Hajipura', 'Muradpur', 'Rang Pura'],
    areas: [
      'cantt','sialkot cantt','ugoki','hajipura','muradpur','rang pura',
      'bhopalwala','kotli loharan','badiana','chowinda','defence road',
      // === Commercial/urban ===
      'clock tower','iqbal manzil','sialkot fort','export processing zone',
      'dry port','paris road','kashmir road','jammu road','wazirabad road',
      'allama iqbal road','stadium road','cantt bazaar','trunk bazaar',
      // === Daska sub-areas ===
      'alipur syedan','ghordour','ghumman',
      // === Tehsils ===
      'daska','sambrial','pasrur','marala','phuklian','zafarwal','chawinda',
    ],
  },

  // ==========================================
  // HYDERABAD (~155 orders — 4 tehsils)
  // ==========================================
  hyderabad: {
    popular: ['Latifabad', 'Qasimabad', 'Saddar', 'Hirabad', 'Auto Bhan Road'],
    areas: [
      // === Latifabad (Unit 1-12) ===
      'latifabad','latifabad unit 1','latifabad unit 2','latifabad unit 3','latifabad unit 4',
      'latifabad unit 5','latifabad unit 6','latifabad unit 7','latifabad unit 8',
      'latifabad unit 9','latifabad unit 10','latifabad unit 11','latifabad unit 12',
      'wahdat colony','liaquat university',
      // === Qasimabad (Phase 1-2) ===
      'qasimabad','qasimabad phase 1','qasimabad phase 2',
      'naseem nagar','gulistan e sajjad','paretabad','hda scheme','shah latif town',
      'abdullah housing','al rehman housing',
      // === Hyderabad City ===
      'saddar','hirabad','heerabad','auto bhan road','market','gari khata',
      'tilak incline','phuleli canal','hyderabad cantt',
      // === Rural ===
      'tando jam','tando qaiser','husri','kohsar','hatri','gujjo','jhando mari',
      'citizen colony','gor colony',
    ],
  },

  // ==========================================
  // QUETTA (~125 orders — Killi system)
  // ==========================================
  quetta: {
    popular: ['Satellite Town', 'Jinnah Town', 'Cantt', 'Alamdar Road', 'Zarghoon Road'],
    areas: [
      // === Main urban ===
      'satellite town','jinnah town','pashtoonabad','nawan killi','hazara town',
      'marriabad','model town','shahbaz town','gulistan town',
      // === Main roads ===
      'alamdar road','joint road','sirki road','double road','quarry road','toghi road',
      'jinnah road','mission road','zarghoon road','brewery road','sariab road',
      'staff college road','samungli road','airport road','sabzal road',
      'kirani road','hali road','circular road','prince road','adalat road',
      // === Cantt ===
      'cantt','gpo chowk','liaquat bazaar','meezan chowk','shahrah e iqbal',
      'railway housing','chiltan housing',
      // === Killi names (common) ===
      'killi ismail','killi shahoo','killi qambrani','killi kirani','killi deba',
      'killi malik akhtar','killi shabo','killi almas','killi alozai','killi ahmadzai',
      'killi mengal','killi durrani','killi sarangzai','killi tareen',
      'chasma achozai','baleli','eastern bypass','western bypass','kuchlak road',
      // === Panjpai / Kuchlak tehsils ===
      'panjpai','spin karez','kuchlak',
    ],
  },

  // ==========================================
  // SARGODHA (~115 orders)
  // ==========================================
  sargodha: {
    popular: ['Satellite Town', 'Cantt', 'Lahore Road', 'Faisalabad Road', 'University Road'],
    areas: [
      'satellite town','cantt','lahore road','faisalabad road','university road',
      'block a','block b','block c','phularwan','mateela',
      // === Tehsils ===
      'bhalwal','shahpur','sillanwali','kot momin','sahiwal',
    ],
  },

  // ==========================================
  // GUJRAT (~175 orders)
  // ==========================================
  gujrat: {
    popular: ['Satellite Town', 'Civil Lines', 'GT Road', 'Cantt', 'Bhimber Road'],
    areas: [
      'satellite town','civil lines','gt road','cantt','bhimber road',
      'model town','circular road','railway road','gulberg','kashmir road',
      'shah farid colony','bilal colony','madina colony','shahbaz colony',
      'gole chowk','fawara chowk','purani mandi','dinga road','jalalpur road',
      'sara-e-alamgir road','rehman shaheed road',
      // Tehsils — people may say "Gujrat" but mean a nearby town
      'jalalpur jattan','kunjah','lalamusa','lala musa','kharian',
      'dinga','sarai alamgir','kalra','mangowal','kotla arab ali khan','bhagowal',
    ],
  },

  // ==========================================
  // BAHAWALPUR
  // ==========================================
  bahawalpur: {
    popular: ['Model Town', 'Satellite Town', 'Farid Gate', 'University Road', 'Yazman Road'],
    areas: [
      'model town','satellite town','farid gate','university road','yazman road',
      'circular road','ahmad pur road','baghdad ul jadeed','cantt',
      'khanqah sharif',
      // === Tehsils ===
      'hasilpur','khairpur tamewali','ahmedpur east','yazman',
    ],
  },

  // ==========================================
  // SAHIWAL (District)
  // ==========================================
  sahiwal: {
    popular: ['Farid Town', 'Model Town', 'Civil Lines', 'High Court Road', 'GT Road'],
    areas: [
      'farid town','model town','civil lines','high court road','gt road',
      'satellite town','harappa','noor shah','qadirabad',
    ],
  },

  // ==========================================
  // MURREE
  // ==========================================
  murree: {
    popular: ['Mall Road', 'GPO Chowk', 'Pindi Point', 'Kashmir Point', 'Jhika Gali'],
    areas: [
      'mall road','gpo chowk','pindi point','kashmir point','jhika gali',
      'sunny bank','cecil chowk','kuldana','ghora gali','nathia gali',
      'bhurban','changla gali','dunga gali','lower topa','upper topa',
      'barian','patriata','new murree','bar gali','Lawrence College road',
    ],
  },

  // ==========================================
  // ABBOTTABAD (detailed)
  // ==========================================
  abbottabad: {
    popular: ['Mandian', 'Jinnahabad', 'Supply Bazaar', 'Cantt', 'Mansehra Road'],
    areas: [
      'mandian','jinnahabad','supply bazaar','cantt','mansehra road',
      'link road','malikpura','kunj','fawara chowk','jinnah road',
      'kakul','salhad','bagnotar','dhamtour','nawan shehr','mirpur',
      'habibullah colony','comsats road','sarban','thandiani road',
      'bilal town','muslim abad','township','pma colony',
      'nawakille','kehal','banda ali khan','jhangi','kalapani',
      // === Havelian tehsil ===
      'havelian','sajikot','sultanpur',
    ],
  },

  // ==========================================
  // MARDAN (detailed)
  // ==========================================
  mardan: {
    popular: ['Bank Road', 'Baghdada', 'Par Hoti', 'Shamsi Road', 'Columbia Chowk'],
    areas: [
      'bank road','baghdada','par hoti','shamsi road','columbia chowk',
      'nowshera road','sheikh maltoon town','erum colony','hoti',
      'shaheedano bazaar','guju khan road','charsadda chowk',
      'gujar garhi','lund khwar','garhi kapura','bicket gunj',
    ],
  },

  // ==========================================
  // MINGORA / SWAT (detailed)
  // ==========================================
  mingora: {
    popular: ['Nishat Chowk', 'Green Chowk', 'GT Road', 'Saidu Sharif', 'Kanju'],
    areas: [
      'nishat chowk','green chowk','gt road','mingora bazaar','haji baba road',
      'grassy ground','swat serena',
      'saidu sharif','museum road','jahan zeb college','university of swat',
      'saidu hospital','saidu baba',
      'manglawar','islampur','rahimabad','gulkada','qambar','kanju',
      'kokarai','zarif abad','khan abad','gogdara','odigram','panr',
      // === Other tehsils ===
      'kabal','matta','khwazakhela','bahrain','madyan','kalam','utror',
      'charbagh','malam jabba','barikot','fazal abad',
    ],
  },

  // ==========================================
  // SUKKUR (detailed)
  // ==========================================
  sukkur: {
    popular: ['New Sukkur', 'Barrage Colony', 'Military Road', 'Airport Road', 'Clock Tower'],
    areas: [
      'new sukkur','barrage colony','military road','airport road',
      'sukkur cantt','clock tower','shahi bazaar','iba university',
      'station road','civil lines','grain market',
    ],
  },

  // ==========================================
  // LARKANA (detailed)
  // ==========================================
  larkana: {
    popular: ['VIP Road', 'Station Road', 'Sachal Colony', 'Civil Lines', 'Bhutto Colony'],
    areas: [
      'vip road','station road','sachal colony','civil lines','bhutto colony',
      'new dhamrah','bakhshapur','main bazaar','railway road','grain market',
    ],
  },

  // ==========================================
  // JHELUM
  // ==========================================
  jhelum: {
    popular: ['Cantt', 'Civil Lines', 'GT Road', 'Railway Road', 'Saddar Bazaar'],
    areas: [
      'cantt','civil lines','gt road','railway road','saddar bazaar',
      'model town','grain market','kutchery road','circular road','city chowk',
    ],
  },

  // ==========================================
  // KASUR
  // ==========================================
  kasur: {
    popular: ['GT Road', 'Allahabad', 'Railway Road', 'Grain Market', 'Civil Lines'],
    areas: [
      'gt road','allahabad','railway road','grain market','civil lines',
      'mustafa abad','kutchery road','circular road','model town',
      'saddar bazaar','lahore road','city chowk',
    ],
  },

  // ==========================================
  // SHEIKHUPURA
  // ==========================================
  sheikhupura: {
    popular: ['GT Road', 'Cantt', 'Farooqabad', 'Railway Road', 'Grain Market'],
    areas: [
      'gt road','cantt','farooqabad','railway road','grain market',
      'civil lines','model town','kutchery road','circular road',
      'saddar bazaar','city chowk',
    ],
  },

  // ==========================================
  // OKARA
  // ==========================================
  okara: {
    popular: ['GT Road', 'Railway Road', 'Grain Market', 'Civil Lines', 'Satellite Town'],
    areas: [
      'gt road','railway road','grain market','civil lines','satellite town',
      'depalpur road','renala khurd road','college road','circular road',
      'mohalla araian','mohalla jattan','anarkali bazaar','city chowk',
    ],
  },

  // ==========================================
  // JHANG
  // ==========================================
  jhang: {
    popular: ['Satellite Town', 'Civil Lines', 'Gol Bazaar', 'Mohalla Shah Jewna', 'Chiniot Road'],
    areas: [
      'satellite town','civil lines','gol bazaar','mohalla shah jewna','chiniot road',
      'faisalabad road','railway road','mohalla qureshi','mohalla warraich',
      'mohalla mughlan','grain market','kutchery road',
    ],
  },

  // ==========================================
  // CHINIOT
  // ==========================================
  chiniot: {
    popular: ['Mohalla Mian Wali', 'Shahi Bazaar', 'Faisalabad Road', 'Railway Road', 'Mohalla Muhammadiya'],
    areas: [
      'mohalla mian wali','shahi bazaar','faisalabad road','railway road',
      'mohalla muhammadiya','mohalla warraichaan','mohalla lodhran',
      'grain market','jhang road','kutchery road','civil lines',
    ],
  },

  // ==========================================
  // KHANEWAL
  // ==========================================
  khanewal: {
    popular: ['GT Road', 'Railway Road', 'Grain Market', 'Civil Lines', 'Model Town'],
    areas: [
      'gt road','railway road','grain market','civil lines','model town',
      'multan road','kutchery road','circular road','saddar bazaar',
      'mohalla muslim','city chowk',
    ],
  },

  // ==========================================
  // VEHARI
  // ==========================================
  vehari: {
    popular: ['GT Road', 'Railway Road', 'Grain Market', 'Model Town', 'Civil Lines'],
    areas: [
      'gt road','railway road','grain market','model town','civil lines',
      'multan road','sahiwal road','kutchery road','circular road',
      'saddar bazaar','mohalla araian',
    ],
  },

  // ==========================================
  // MUZAFFARGARH
  // ==========================================
  muzaffargarh: {
    popular: ['GT Road', 'Railway Road', 'Grain Market', 'Civil Lines', 'Saddar Bazaar'],
    areas: [
      'gt road','railway road','grain market','civil lines','saddar bazaar',
      'multan road','dg khan road','kutchery road','circular road',
      'model town','mohalla qureshi',
    ],
  },

  // ==========================================
  // DERA GHAZI KHAN
  // ==========================================
  'dera ghazi khan': {
    popular: ['Block A', 'Block B', 'Cantt', 'City Chowk', 'GT Road'],
    areas: [
      'block a','block b','block c','cantt','city chowk','gt road',
      'civil lines','railway road','multan road','kutchery road',
      'grain market','mohalla khar','college road',
    ],
  },

  // ==========================================
  // RAHIM YAR KHAN
  // ==========================================
  'rahim yar khan': {
    popular: ['Khanpur Road', 'Sheikh Zayed Road', 'Cantt', 'Model Town', 'Satellite Town'],
    areas: [
      'khanpur road','sheikh zayed road','cantt','model town','satellite town',
      'civil lines','gt road','railway road','grain market','kutchery road',
      'circular road','city chowk',
    ],
  },

  // ==========================================
  // CHAKWAL
  // ==========================================
  chakwal: {
    popular: ['Talagang Road', 'GT Road', 'Civil Lines', 'Railway Road', 'Saddar Bazaar'],
    areas: [
      'talagang road','gt road','civil lines','railway road','saddar bazaar',
      'model town','grain market','kutchery road','circular road',
      'rawalpindi road','jhelum road',
    ],
  },

  // ==========================================
  // ATTOCK
  // ==========================================
  attock: {
    popular: ['Cantt', 'Civil Lines', 'GT Road', 'Railway Road', 'Saddar Bazaar'],
    areas: [
      'cantt','civil lines','gt road','railway road','saddar bazaar',
      'model town','grain market','rawalpindi road','kohat road',
      'mohalla dhok hassu','city chowk',
    ],
  },

  // ==========================================
  // MIANWALI
  // ==========================================
  mianwali: {
    popular: ['Sargodha Road', 'Railway Road', 'Grain Market', 'Civil Lines', 'Saddar Bazaar'],
    areas: [
      'sargodha road','railway road','grain market','civil lines','saddar bazaar',
      'gt road','kutchery road','circular road','model town','city chowk',
    ],
  },

  // ==========================================
  // BHAKKAR
  // ==========================================
  bhakkar: {
    popular: ['Jhang Road', 'Railway Road', 'Grain Market', 'Civil Lines', 'Saddar Bazaar'],
    areas: [
      'jhang road','railway road','grain market','civil lines','saddar bazaar',
      'circular road','kutchery road','model town','city chowk',
    ],
  },

  // ==========================================
  // LAYYAH
  // ==========================================
  layyah: {
    popular: ['DG Khan Road', 'Railway Road', 'Grain Market', 'Civil Lines', 'Main Bazaar'],
    areas: [
      'dg khan road','railway road','grain market','civil lines','main bazaar',
      'circular road','kutchery road','model town','city chowk',
    ],
  },

  // ==========================================
  // LODHRAN
  // ==========================================
  lodhran: {
    popular: ['Bahawalpur Road', 'Multan Road', 'Railway Road', 'Grain Market', 'Main Bazaar'],
    areas: [
      'bahawalpur road','multan road','railway road','grain market','main bazaar',
      'circular road','kutchery road','model town','city chowk',
    ],
  },

  // ==========================================
  // PAKPATTAN
  // ==========================================
  pakpattan: {
    popular: ['Data Darbar Road', 'Sahiwal Road', 'Railway Road', 'Grain Market', 'Main Bazaar'],
    areas: [
      'data darbar road','sahiwal road','railway road','grain market','main bazaar',
      'circular road','kutchery road','model town','city chowk','shrine area',
    ],
  },

  // ==========================================
  // RAJANPUR
  // ==========================================
  rajanpur: {
    popular: ['DG Khan Road', 'Indus Highway', 'Railway Road', 'Main Bazaar', 'Grain Market'],
    areas: [
      'dg khan road','indus highway','railway road','main bazaar','grain market',
      'circular road','kutchery road','city chowk',
    ],
  },

  // ==========================================
  // MANDI BAHAUDDIN
  // ==========================================
  'mandi bahauddin': {
    popular: ['GT Road', 'Sargodha Road', 'Railway Road', 'Grain Market', 'Civil Lines'],
    areas: [
      'gt road','sargodha road','railway road','grain market','civil lines',
      'model town','kutchery road','circular road','city chowk',
    ],
  },

  // ==========================================
  // HAFIZABAD
  // ==========================================
  hafizabad: {
    popular: ['GT Road', 'Faisalabad Road', 'Railway Road', 'Grain Market', 'Main Bazaar'],
    areas: [
      'gt road','faisalabad road','railway road','grain market','main bazaar',
      'circular road','kutchery road','model town','city chowk',
    ],
  },

  // ==========================================
  // TOBA TEK SINGH
  // ==========================================
  'toba tek singh': {
    popular: ['Faisalabad Road', 'Railway Road', 'Grain Market', 'Main Bazaar', 'Civil Lines'],
    areas: [
      'faisalabad road','railway road','grain market','main bazaar','civil lines',
      'circular road','kutchery road','model town','city chowk',
    ],
  },

  // ==========================================
  // NAWABSHAH (Shaheed Benazirabad)
  // ==========================================
  nawabshah: {
    popular: ['Station Road', 'Noor Muhammad Colony', 'Bhutto Nagar', 'Civil Lines', 'Main Bazaar'],
    areas: [
      'station road','noor muhammad colony','bhutto nagar','civil lines','main bazaar',
      'hattar road','railway road','grain market','peoples colony','model town',
    ],
  },

  // ==========================================
  // MIRPURKHAS
  // ==========================================
  mirpurkhas: {
    popular: ['Satellite Town', 'Shahi Bazaar', 'Station Road', 'Civil Lines', 'Main Bazaar'],
    areas: [
      'satellite town','shahi bazaar','station road','civil lines','main bazaar',
      'sindhri road','model town','railway road','grain market','peoples colony',
    ],
  },

  // ==========================================
  // KHAIRPUR
  // ==========================================
  khairpur: {
    popular: ['Civil Lines', 'Faiz Ganj', 'Main Bazaar', 'Station Road', 'Khuda Ki Basti'],
    areas: [
      'civil lines','faiz ganj','main bazaar','station road','khuda ki basti',
      'railway road','model town','grain market','peoples colony',
    ],
  },

  // ==========================================
  // JACOBABAD
  // ==========================================
  jacobabad: {
    popular: ['Cantt', 'Main Bazaar', 'Abdullah Shah Ghazi Colony', 'Old City', 'Sukkur Road'],
    areas: [
      'cantt','main bazaar','abdullah shah ghazi colony','old city','sukkur road',
      'railway road','civil lines','grain market','station road',
    ],
  },

  // ==========================================
  // TANDO ADAM
  // ==========================================
  'tando adam': {
    popular: ['City Area', 'Station Road', 'Nasarpur Road', 'Hyderabad Road', 'Main Bazaar'],
    areas: [
      'city area','station road','nasarpur road','hyderabad road','main bazaar',
    ],
  },

  // ==========================================
  // NOWSHERA (KPK)
  // ==========================================
  nowshera: {
    popular: ['Nowshera Cantt', 'Amangarh', 'Saddar Bazaar', 'GT Road', 'Khushal Colony'],
    areas: [
      'nowshera cantt','amangarh','saddar bazaar','gt road','khushal colony',
      'rehman baba colony','shadman colony','naya mohallah','azakhel',
      'armour colony','shoba bazaar','nowshera kalan','nowshera khurd',
    ],
  },

  // ==========================================
  // SWABI
  // ==========================================
  swabi: {
    popular: ['Swabi Chowk', 'Main Bazaar', 'Jehangira Road', 'Panjpir', 'Guli Bagh'],
    areas: [
      'swabi chowk','main bazaar','jehangira road','panjpir','guli bagh',
      'maneri','yar hussain road','shahmansoor','nawan shehr',
      'dara','kaddi',
    ],
  },

  // ==========================================
  // CHARSADDA
  // ==========================================
  charsadda: {
    popular: ['Tehsil Bazaar', 'Hashtnagar Road', 'Prang Road', 'Peshawar Road', 'Main Bazaar'],
    areas: [
      'tehsil bazaar','hashtnagar road','prang road','peshawar road','main bazaar',
      'khushal khan khattak road','ghani khan road','doaba area','nisatta road',
    ],
  },

  // ==========================================
  // KOHAT
  // ==========================================
  kohat: {
    popular: ['Kohat Cantt', 'Main Bazaar', 'Mohalla Rangarh', 'Garden Colony', 'Pindi Road'],
    areas: [
      'kohat cantt','main bazaar','mohalla rangarh','garden colony','pindi road',
      'mohalla niazi','mohalla miankhel','mohalla shahzadgan','mohalla parachgan',
      'hangu road','tirah bazaar',
    ],
  },

  // ==========================================
  // BANNU
  // ==========================================
  bannu: {
    popular: ['Bannu Cantt', 'Chowk Bazaar', 'Lakki Gate', 'Domel', 'Nizam Bazaar'],
    areas: [
      'bannu cantt','chowk bazaar','lakki gate','domel','nizam bazaar',
      'tanchi bazaar','tehsil bazaar','railway bazaar','miryan gate',
      'qasabaan gate','mandan gate','hanjal gate',
    ],
  },

  // ==========================================
  // DERA ISMAIL KHAN
  // ==========================================
  'dera ismail khan': {
    popular: ['Chowgalla', 'Topanwala Bazaar', 'Cantt', 'Civil Lines', 'Circular Road'],
    areas: [
      'chowgalla','topanwala bazaar','cantt','civil lines','circular road',
      'kalan bazaar','muslim bazaar','bhatiya bazaar','bakhiri bazaar',
      'sheikh yousaf road','gomal market',
    ],
  },

  // ==========================================
  // MANSEHRA
  // ==========================================
  mansehra: {
    popular: ['KKH Road', 'Main Bazaar', 'Madina Colony', 'Abbottabad Road', 'Kashmir Road'],
    areas: [
      'kkh road','main bazaar','madina colony','abbottabad road','kashmir road',
      'pano dheri','shellpump mohallah','dangari','sarai khola',
    ],
  },

  // ==========================================
  // HARIPUR
  // ==========================================
  haripur: {
    popular: ['Mohalla Qadeem', 'Mohalla Asifabad', 'Mohalla Ferozpura', 'Awan Colony', 'Main Bazaar'],
    areas: [
      'mohalla qadeem','mohalla asifabad','mohalla ferozpura','awan colony','main bazaar',
      'darvesh','mohalla khoo','pandak','mohalla malikpura','gt road',
      'mohalla nai abadi','sheranwala gate',
    ],
  },

  // ==========================================
  // CHITRAL
  // ==========================================
  chitral: {
    popular: ['Chitral Town', 'Drosh', 'Mastuj', 'Booni', 'Garam Chashma'],
    areas: [
      'chitral town','drosh','mastuj','booni','garam chashma',
      'ayun','bumburet','rumbur','birir','singoor',
    ],
  },

  // ==========================================
  // DIR (Lower + Upper)
  // ==========================================
  dir: {
    popular: ['Timergara', 'Chakdara', 'Dir Town', 'Sheringal', 'Wari'],
    areas: [
      'timergara','chakdara','balambat','adenzai','talash','munda','samarbagh',
      'dir town','sheringal','kumrat','wari','barawal bandi','kalkot',
    ],
  },

  // ==========================================
  // BUNER
  // ==========================================
  buner: {
    popular: ['Daggar', 'Pir Baba', 'Nawagai', 'Gagra', 'Chamla'],
    areas: [
      'daggar','pir baba','nawagai','gagra','chamla','totalai',
    ],
  },

  // ==========================================
  // MUZAFFARABAD (AJK — detailed)
  // ==========================================
  muzaffarabad: {
    popular: ['Domel Chowk', 'Upper Chattar', 'Lower Chattar', 'Naluchi', 'Madina Market'],
    areas: [
      'domel','domel chowk','upper chattar','lower chattar','naluchi',
      'garhi dupatta','chatter kalas','dhanni','sangam','chelabandi','dulai',
      'ambore','chinari','kohala','chakothi','lachrat','madina market','gojra',
      'nauseri','panjkot','barsala','chilhana','dakhan','langarpura','makri',
      'tariqabad','shaheed gali','neem bala','ghari habibullah',
      // === Patika tehsil ===
      'patika','saran','sangar',
      // === Chehla Bandi tehsil ===
      'chehla bandi','bandi kamala','chamankot',
    ],
  },

  // ==========================================
  // MIRPUR (AJK — detailed)
  // ==========================================
  mirpur: {
    popular: ['Sector F', 'Allama Iqbal Road', 'New Mirpur City', 'Sector D', 'Sector B'],
    areas: [
      'sector a','sector b','sector c','sector d','sector e','sector f','sector g',
      'allama iqbal road','new mirpur city','kotli road',
      'peer ghaib','ramkot','islamgarh','sahnsarali','chakswari',
      'pind khurd','ratta',
      'pind bainsa','saranda','afzalpur',
      // === Dadyal tehsil ===
      'dadyal',
    ],
  },

  // ==========================================
  // RAWALAKOT (AJK)
  // ==========================================
  rawalakot: {
    popular: ['City Area', 'Banjosa', 'Toli Pir', 'Hussainabad', 'Paniola'],
    areas: [
      'city area','banjosa','khaigala','toli pir','hussainabad','singola','tain',
      'rehara','paniola','mujahid abad','pachiot','seher','danna','tella',
    ],
  },

  // ==========================================
  // KOTLI (AJK)
  // ==========================================
  kotli: {
    popular: ['City Area', 'Tatta Pani', 'Gulpur', 'Sehnsa', 'Khoiratta'],
    areas: [
      'city area','tatta pani','gulpur','sarsawa','seri',
      'khoiratta','sehnsa','barali',
    ],
  },

  // ==========================================
  // BAGH (AJK)
  // ==========================================
  bagh: {
    popular: ['City Area', 'Dhirkot', 'Lass Danna', 'Sudhan Gali', 'Mallot'],
    areas: [
      'city area','dhirkot','lass danna','sudhan gali','mallot',
      'sundla','kharick','birpani',
    ],
  },

  // ==========================================
  // BHIMBER (AJK)
  // ==========================================
  bhimber: {
    popular: ['City Area', 'Jandala', 'Barnala', 'Samahni', 'Chowki'],
    areas: [
      'city area','jandala','barnala','samahni','chowki',
    ],
  },

  // ==========================================
  // GILGIT (detailed)
  // ==========================================
  gilgit: {
    popular: ['Jutial', 'Basin', 'Kashrote', 'Sultanabad', 'Airport Road'],
    areas: [
      'jutial','khomer','basin','sonikot','barmas','kashrote','napur',
      'sultanabad','jalalabad','ampheri','sakwar','guard','babar',
      'majini mahalla','konodas','zulfiqarabad','river view',
      'airport road','shaheed e millat road','yadgar chowk',
      // === Danyore tehsil ===
      'danyore','alam bridge','rahimabad','khaltaro',
      // === Juglot / Oshikhandas ===
      'juglot','nomal','sikandarabad','oshikhandas','naltar',
    ],
  },

  // ==========================================
  // SKARDU (detailed)
  // ==========================================
  skardu: {
    popular: ['Naya Bazar', 'Old Bazar', 'Yadgar Chowk', 'Hussain Chowk', 'Airport Road'],
    areas: [
      'naya bazar','old bazar','yadgar chowk','hussain chowk','airport road',
      'olding','khargrong','sakmaidan','yultar','haji gam',
      'hassan colony','manthal','chumik','alamdar chowk','kazmi bazar',
    ],
  },

  // ==========================================
  // HUNZA
  // ==========================================
  hunza: {
    popular: ['Karimabad', 'Aliabad', 'Gulmit', 'Passu', 'Sost'],
    areas: [
      'karimabad','aliabad','altit','ganish','baltit','duiker',
      'murtazabad','hasanabad','hyderabad','dorkhan','ahmedabad','nasirabad',
      // === Upper Hunza / Gojal ===
      'gulmit','hussaini','passu','zarabad','shishkat','ghulkin','misgar',
      'sost','afiyatabad','khunjerab','shimshal',
    ],
  },

  // ==========================================
  // GHIZER
  // ==========================================
  ghizer: {
    popular: ['Gahkuch', 'Sherqila', 'Singal', 'Gulapur', 'Taus'],
    areas: [
      'gahkuch','sherqila','singal','gulapur','bubur','hatoon','damas',
      'taus','shamran',
    ],
  },

  // ==========================================
  // ASTORE
  // ==========================================
  astore: {
    popular: ['Astore Town', 'Rama', 'Rupal', 'Gorikot', 'Bunji'],
    areas: [
      'astore','rama','rupal','tarashing','churit','gorikot','dashkin',
      'bubin','eidgah','bunji','mushkin','sadbar',
    ],
  },

  // ==========================================
  // GWADAR (detailed)
  // ==========================================
  gwadar: {
    popular: ['Old Town', 'New Town', 'Marine Drive', 'Sangar Housing', 'Mulla Band'],
    areas: [
      'old town','new town','marine drive','sangar housing','mulla band',
      'shahi bazaar','airport road','padi zirr','gwadar port',
      'east bay','west bay','pishukan','surbanden',
    ],
  },

  // ==========================================
  // TURBAT (Kech)
  // ==========================================
  turbat: {
    popular: ['Main Bazaar', 'Absar', 'Naseerabad', 'City Center', 'Tump Road'],
    areas: [
      'main bazaar','absar','naseerabad','city center','tump road',
      'bayan','bahman','phullan karez','degari',
    ],
  },

  // ==========================================
  // KHUZDAR
  // ==========================================
  khuzdar: {
    popular: ['Main Bazaar', 'City Center', 'Wadh Road', 'Quetta Road', 'Zehri Road'],
    areas: [
      'main bazaar','city center','wadh road','quetta road','zehri road',
      'nal road','hospital road',
    ],
  },

  // ==========================================
  // HUB (Lasbela)
  // ==========================================
  hub: {
    popular: ['Hub Chowki', 'SITE Industrial Area', 'RCD Highway', 'Main Bazaar', 'Labour Colony'],
    areas: [
      'hub chowki','site industrial area','rcd highway','main bazaar','labour colony',
      'hite phase 1','gaddani road','windar road',
    ],
  },

  // ==========================================
  // SIBI
  // ==========================================
  sibi: {
    popular: ['Main Bazaar', 'Marghazani', 'Railway Station Area', 'Sandeman Road', 'Dehpal'],
    areas: [
      'main bazaar','marghazani','railway station area','sandeman road','dehpal',
      'luni','gullu shaher','talli',
    ],
  },

  // ==========================================
  // ZHOB
  // ==========================================
  zhob: {
    popular: ['Ganj Mohallah', 'Mina Bazar', 'Sheikhan', 'Main Bazaar', 'Apozai'],
    areas: [
      'ganj mohallah','mina bazar','sheikhan','main bazaar','apozai',
      'babar','qamardin','shaghalo','mughalkot','fort sandeman area',
    ],
  },

  // ==========================================
  // LORALAI
  // ==========================================
  loralai: {
    popular: ['Main Bazaar', 'Bori Valley', 'City Center', 'Cantt', 'Civil Lines'],
    areas: [
      'main bazaar','bori valley','city center','cantt','civil lines',
      'makhter road',
    ],
  },

  // ==========================================
  // CHAMAN
  // ==========================================
  chaman: {
    popular: ['Main Bazaar', 'Satellite Town', 'Mall Road', 'Kali Abdur Rehman', 'Friendship Gate'],
    areas: [
      'main bazaar','satellite town','mall road','kali abdur rehman','friendship gate area',
      'railway station area','border road','cantt',
    ],
  },

  // ==========================================
  // ZIARAT
  // ==========================================
  ziarat: {
    popular: ['City Area', 'Kach', 'Warchoom', 'Zandra', 'Juniper Forest'],
    areas: [
      'city area','kach','warchoom','baghao','kawas','zandra',
    ],
  },

  // ==========================================
  // MISSING PUNJAB CITIES
  // ==========================================
  'nankana sahib': {
    popular: ['City Center', 'Main Bazaar', 'Railway Road', 'Gurdwara Janam Asthan'],
    areas: [
      'city center','main bazaar','railway road','government colony','new market','saddar bazaar',
      'gurdwara janam asthan','shah kot','sangla hill','bucheki','warburton',
    ],
  },
  narowal: {
    popular: ['City Center', 'Mall Road', 'Main Bazaar', 'Shakargarh'],
    areas: [
      'city center','mall road','main bazaar','akbari gate','shahi gate','sher kot',
      'shakargarh','zafarwal','darya ke','dera baba nanak road',
    ],
  },
  khushab: {
    popular: ['City Center', 'Main Bazaar', 'Fort Road', 'Jauharabad'],
    areas: [
      'city center','main bazaar','fort road','saddar bazaar','railway road','government colony',
      'jauharabad','noorpur thal','nowshera','quaidabad',
    ],
  },
  bahawalnagar: {
    popular: ['City Center', 'Main Bazaar', 'Harappa Road', 'Fort Abbas'],
    areas: [
      'city center','main bazaar','harappa road','saddar bazaar','fort road','railway colony',
      'fort abbas','chishtian','minchinabad','haroonabad',
    ],
  },

  // ==========================================
  // PUNJAB TEHSILS/TOWNS (from 200-cities list)
  // ==========================================
  muridke: {
    popular: ['GT Road', 'Model Town', 'Sheikhupura Road', 'Narowal Road'],
    areas: ['gt road','model town','sheikhupura road','narowal road','railway road'],
  },
  taxila: {
    popular: ['Cantt', 'Wah Village', 'Heavy Industries', 'Faisal Hills', 'GT Road'],
    areas: ['cantt','wah village','heavy industries area','faisal hills','gt road','taxila museum road'],
  },
  'wah cantt': {
    popular: ['Cantt', 'POF Area', 'Taxila Road', 'GT Road', 'Lala Rukh'],
    areas: ['cantt','pof area','taxila road','gt road','lala rukh','wah village','wah model town'],
  },
  'hasan abdal': {
    popular: ['GT Road', 'Gurdwara Area', 'Attock Road', 'Taxila Road'],
    areas: ['gt road','gurdwara area','attock road','taxila road','city centre'],
  },
  'gujar khan': {
    popular: ['GT Road', 'Rawalpindi Road', 'Jhelum Road', 'Model Town'],
    areas: ['gt road','rawalpindi road','jhelum road','model town','city centre','daultala'],
  },
  talagang: {
    popular: ['Chakwal Road', 'Mianwali Road', 'City Centre', 'Civil Lines'],
    areas: ['chakwal road','mianwali road','city centre','civil lines','bazaar area'],
  },
  'pind dadan khan': {
    popular: ['Jhelum Road', 'Salt Range Road', 'City Centre', 'Railway Road'],
    areas: ['jhelum road','salt range road','city centre','railway road','gt road'],
  },
  'kot addu': {
    popular: ['City Centre', 'Muzaffargarh Road', 'DG Khan Road', 'Taunsa Road'],
    areas: ['city centre','muzaffargarh road','dg khan road','taunsa road','railway road'],
  },
  kabirwala: {
    popular: ['City Centre', 'Multan Road', 'Khanewal Road', 'Model Town'],
    areas: ['city centre','multan road','khanewal road','model town','railway road'],
  },
  arifwala: {
    popular: ['City Centre', 'Sahiwal Road', 'Pakpattan Road', 'Model Town'],
    areas: ['city centre','sahiwal road','pakpattan road','model town','railway road'],
  },
  burewala: {
    popular: ['City Centre', 'Vehari Road', 'Arifwala Road', 'Model Town'],
    areas: ['city centre','vehari road','arifwala road','model town','railway road'],
  },
  dunyapur: {
    popular: ['City Centre', 'Lodhran Road', 'Multan Road', 'Railway Road'],
    areas: ['city centre','lodhran road','multan road','kehror pacca road','railway road'],
  },
  haroonabad: {
    popular: ['City Centre', 'Bahawalnagar Road', 'Fort Abbas Road', 'Model Town'],
    areas: ['city centre','bahawalnagar road','fort abbas road','model town','railway road'],
  },
  chishtian: {
    popular: ['City Centre', 'Bahawalnagar Road', 'Hasilpur Road', 'Model Town'],
    areas: ['city centre','bahawalnagar road','hasilpur road','model town','railway road'],
  },
  'fort abbas': {
    popular: ['City Centre', 'Bahawalnagar Road', 'Yazman Road', 'Model Town'],
    areas: ['city centre','bahawalnagar road','yazman road','haroonabad road','model town'],
  },
  yazman: {
    popular: ['City Centre', 'Bahawalpur Road', 'Fort Abbas Road', 'Model Town'],
    areas: ['city centre','bahawalpur road','fort abbas road','model town','railway road'],
  },
  sadiqabad: {
    popular: ['City Centre', 'Rahim Yar Khan Road', 'Model Town', 'Cantt Area'],
    areas: ['city centre','rahim yar khan road','model town','cantt area','railway road'],
  },
  khanpur: {
    popular: ['City Centre', 'Rahim Yar Khan Road', 'Sadiqabad Road', 'Model Town'],
    areas: ['city centre','rahim yar khan road','sadiqabad road','model town','railway road'],
  },
  liaqatpur: {
    popular: ['City Centre', 'Rahim Yar Khan Road', 'Khanpur Road', 'Model Town'],
    areas: ['city centre','rahim yar khan road','khanpur road','railway road','model town'],
  },
  jaranwala: {
    popular: ['City Centre', 'Faisalabad Road', 'Sheikhupura Road', 'Model Town'],
    areas: ['city centre','faisalabad road','sheikhupura road','model town','railway road'],
  },
  tandlianwala: {
    popular: ['City Centre', 'Faisalabad Road', 'Jaranwala Road', 'Bazaar Area'],
    areas: ['city centre','faisalabad road','jaranwala road','railway road','bazaar area'],
  },
  gojra: {
    popular: ['City Centre', 'Faisalabad Road', 'Toba Road', 'Model Town'],
    areas: ['city centre','faisalabad road','toba road','model town','railway road'],
  },
  kamalia: {
    popular: ['City Centre', 'Toba Road', 'Faisalabad Road', 'Model Town'],
    areas: ['city centre','toba road','faisalabad road','model town','railway road'],
  },
  'pir mahal': {
    popular: ['City Centre', 'Toba Road', 'Kamalia Road', 'Bazaar Area'],
    areas: ['city centre','toba road','kamalia road','railway road','bazaar area'],
  },
  'ahmedpur east': {
    popular: ['City Centre', 'Bahawalpur Road', 'Uch Road', 'Model Town'],
    areas: ['city centre','bahawalpur road','uch road','model town','railway road'],
  },
  hasilpur: {
    popular: ['City Centre', 'Bahawalpur Road', 'Vehari Road', 'Model Town'],
    areas: ['city centre','bahawalpur road','vehari road','model town','railway road'],
  },
  phalia: {
    popular: ['City Centre', 'Mandi Bahauddin Road', 'GT Road', 'Model Town'],
    areas: ['city centre','mandi bahauddin road','gt road','model town','railway road'],
  },
  shahkot: {
    popular: ['City Centre', 'Nankana Road', 'Faisalabad Road', 'Bazaar Area'],
    areas: ['city centre','nankana road','faisalabad road','railway road','bazaar area'],
  },
  'sangla hill': {
    popular: ['City Centre', 'Nankana Road', 'Sheikhupura Road', 'GT Road'],
    areas: ['city centre','nankana road','sheikhupura road','railway road','gt road'],
  },
  pattoki: {
    popular: ['City Centre', 'GT Road', 'Kasur Road', 'Okara Road'],
    areas: ['city centre','gt road','kasur road','okara road','railway road'],
  },
  kamoke: {
    popular: ['GT Road', 'Model Town', 'Railway Road', 'Lahore Road', 'Muridke Road'],
    areas: ['gt road','model town','railway road','lahore road','muridke road'],
  },
  wazirabad: {
    popular: ['GT Road', 'Kutchery Road', 'Sialkot Road', 'Railway Road'],
    areas: ['gt road','kutchery road','sialkot road','railway road','gulshan colony','grain market road'],
  },
  daska: {
    popular: ['Sialkot Road', 'GT Road', 'City Centre', 'Sambrial Road'],
    areas: ['sialkot road','gt road','city centre','sambrial road','railway road'],
  },
  sambrial: {
    popular: ['Sialkot Road', 'Wazirabad Road', 'City Centre', 'GT Road'],
    areas: ['sialkot road','wazirabad road','city centre','gt road','railway road'],
  },
  pasrur: {
    popular: ['Sialkot Road', 'Narowal Road', 'City Centre', 'Zafarwal Road'],
    areas: ['sialkot road','narowal road','city centre','zafarwal road','railway road'],
  },
  ferozewala: {
    popular: ['GT Road', 'Sharaqpur Road', 'Lahore Road', 'Model Town'],
    areas: ['gt road','sharaqpur road','lahore road','city centre','model town'],
  },
  sharaqpur: {
    popular: ['GT Road', 'Sheikhupura Road', 'Lahore Road', 'Railway Road'],
    areas: ['gt road','sheikhupura road','lahore road','city centre','railway road'],
  },
  dinga: {
    popular: ['City Centre', 'Gujrat Road', 'Kharian Road', 'Model Town'],
    areas: ['city centre','gujrat road','kharian road','model town','bazaar area'],
  },
  'lala musa': {
    popular: ['GT Road', 'City Centre', 'Kharian Road', 'Industrial Area'],
    areas: ['gt road','city centre','kharian road','railway road','industrial area'],
  },
  'renala khurd': {
    popular: ['City Centre', 'Okara Road', 'Montgomery Road', 'Model Town'],
    areas: ['city centre','okara road','montgomery road','railway road','model town'],
  },
  depalpur: {
    popular: ['City Centre', 'Okara Road', 'Kasur Road', 'Bazaar Area'],
    areas: ['city centre','okara road','kasur road','bazaar area','railway road'],
  },
  mailsi: {
    popular: ['City Centre', 'Vehari Road', 'Lodhran Road', 'Model Town'],
    areas: ['city centre','vehari road','lodhran road','model town','railway road'],
  },
  'jalalpur jattan': {
    popular: ['City Centre', 'Gujrat Road', 'GT Road', 'Bazaar Area'],
    areas: ['city centre','gujrat road','gt road','bazaar area','model town'],
  },

  // ==========================================
  // MISSING SINDH CITIES
  // ==========================================
  jamshoro: {
    popular: ['Jamshoro Town', 'University Colony', 'Mehran University Area', 'Main Road', 'Railway Colony'],
    areas: [
      'jamshoro town','university colony','mehran university area','main road',
      'railway colony','industrial area',
    ],
  },
  matiari: {
    popular: ['Main Bazaar', 'Station Road', 'Railway Road', 'City Center'],
    areas: [
      'main bazaar','station road','railway road','city center',
      'hyderabad road','national highway',
    ],
  },
  'tando allahyar': {
    popular: ['Main Bazaar', 'City Center', 'Hyderabad Road', 'Station Road'],
    areas: [
      'main bazaar','city center','hyderabad road','station road',
      'railway road','national highway',
    ],
  },
  'tando muhammad khan': {
    popular: ['Main Bazaar', 'City Center', 'Hyderabad Road', 'Station Road'],
    areas: [
      'main bazaar','city center','hyderabad road','station road','railway road',
    ],
  },
  badin: {
    popular: ['Main Bazaar', 'Station Road', 'Civil Lines', 'City Center', 'Railway Road'],
    areas: [
      'main bazaar','station road','civil lines','city center','railway road',
      'hyderabad road','model town',
    ],
  },
  ghotki: {
    popular: ['Main Bazaar', 'Station Road', 'City Center', 'Sukkur Road', 'Railway Road'],
    areas: [
      'main bazaar','station road','city center','sukkur road','railway road',
    ],
  },
  'kambar shahdadkot': {
    popular: ['Main Bazaar', 'City Center', 'Station Road', 'Larkana Road', 'Railway Road'],
    areas: [
      'main bazaar','city center','station road','larkana road','railway road',
    ],
  },
  shikarpur: {
    popular: ['Shikarpur Bazaar', 'Main Bazaar', 'Station Road', 'City Center', 'Railway Road'],
    areas: [
      'shikarpur bazaar','main bazaar','station road','city center','railway road',
      'larkana road','sukkur road',
    ],
  },
  kashmore: {
    popular: ['Main Bazaar', 'City Center', 'Station Road', 'Sukkur Road'],
    areas: [
      'main bazaar','city center','station road','sukkur road','railway road',
    ],
  },
  sanghar: {
    popular: ['Main Bazaar', 'Station Road', 'City Center', 'Railway Road', 'Civil Lines'],
    areas: [
      'main bazaar','station road','city center','railway road','civil lines',
      'nawabshah road','model town',
    ],
  },
  'naushahro feroze': {
    popular: ['Main Bazaar', 'City Center', 'Station Road', 'Railway Road', 'Dadu Road'],
    areas: [
      'main bazaar','city center','station road','railway road','dadu road',
    ],
  },
  umerkot: {
    popular: ['Main Bazaar', 'City Center', 'Umerkot Fort Area', 'Station Road', 'Mirpur Khas Road'],
    areas: [
      'main bazaar','city center','umerkot fort area','station road','mirpur khas road',
      'railway road',
    ],
  },
  tharparkar: {
    popular: ['Mithi Main Bazaar', 'City Center', 'Station Road', 'Umerkot Road'],
    areas: [
      'mithi main bazaar','city center','station road','umerkot road',
      'railway road',
    ],
  },
  thatta: {
    popular: ['Main Bazaar', 'Makli Area', 'City Center', 'Station Road', 'National Highway'],
    areas: [
      'main bazaar','makli area','city center','station road','national highway',
      'railway road',
    ],
  },
  sujawal: {
    popular: ['Main Bazaar', 'City Center', 'National Highway', 'Station Road'],
    areas: [
      'main bazaar','city center','national highway','station road','railway road',
    ],
  },

  dadu: {
    popular: ['Main Bazaar', 'City Center', 'Station Road', 'Railway Road', 'Larkana Road'],
    areas: [
      'main bazaar','city center','station road','railway road','larkana road',
      'sehwan road','national highway',
    ],
  },

  // ==========================================
  // SINDH TOWNS (from 200-cities list)
  // ==========================================
  kandhkot: {
    popular: ['City Centre', 'Kashmore Road', 'Ghotki Road', 'Sukkur Road'],
    areas: ['city centre','kashmore road','ghotki road','sukkur road','bazaar area'],
  },
  hala: {
    popular: ['City Centre', 'Hyderabad Road', 'Matiari Road', 'Handicraft Bazaar'],
    areas: ['city centre','hyderabad road','matiari road','handicraft bazaar','railway road'],
  },
  kotri: {
    popular: ['City Centre', 'Hyderabad Road', 'National Highway', 'Industrial Area'],
    areas: ['city centre','hyderabad road','national highway','jamshoro road','industrial area'],
  },
  'sehwan sharif': {
    popular: ['Shrine Area', 'Dadu Road', 'Jamshoro Road', 'City Centre'],
    areas: ['shrine area','dadu road','jamshoro road','city centre','railway road'],
  },
  moro: {
    popular: ['City Centre', 'Naushahro Feroze Road', 'Dadu Road', 'Railway Road'],
    areas: ['city centre','naushahro feroze road','dadu road','railway road','bazaar area'],
  },
  daharki: {
    popular: ['City Centre', 'Ghotki Road', 'Sukkur Road', 'Industrial Area'],
    areas: ['city centre','ghotki road','sukkur road','railway road','industrial area'],
  },
  'mirpur mathelo': {
    popular: ['City Centre', 'Ghotki Road', 'Daharki Road', 'Bazaar Area'],
    areas: ['city centre','ghotki road','daharki road','railway road','bazaar area'],
  },
  ratodero: {
    popular: ['City Centre', 'Larkana Road', 'Sukkur Road', 'Railway Road'],
    areas: ['city centre','larkana road','sukkur road','railway road','bazaar area'],
  },
  gambat: {
    popular: ['City Centre', 'Khairpur Road', 'Sukkur Road', 'Railway Road'],
    areas: ['city centre','khairpur road','sukkur road','railway road','bazaar area'],
  },
  digri: {
    popular: ['City Centre', 'Mirpur Khas Road', 'Badin Road', 'Railway Road'],
    areas: ['city centre','mirpur khas road','badin road','railway road','bazaar area'],
  },
  sakrand: {
    popular: ['City Centre', 'Nawabshah Road', 'Sehwan Road', 'Railway Road'],
    areas: ['city centre','nawabshah road','sehwan road','railway road','bazaar area'],
  },
  rohri: {
    popular: ['City Centre', 'Sukkur Road', 'National Highway', 'Railway Road'],
    areas: ['city centre','sukkur road','national highway','railway road','bazaar area'],
  },
  'pano aqil': {
    popular: ['Cantt', 'City Centre', 'Sukkur Road', 'Ghotki Road'],
    areas: ['cantt','city centre','sukkur road','ghotki road','railway road'],
  },
  dokri: {
    popular: ['City Centre', 'Larkana Road', 'Ratodero Road', 'Railway Road'],
    areas: ['city centre','larkana road','ratodero road','railway road','bazaar area'],
  },
  naudero: {
    popular: ['City Centre', 'Larkana Road', 'Bhutto House Area', 'Railway Road'],
    areas: ['city centre','larkana road','bhutto house area','railway road','bazaar area'],
  },
  chhor: {
    popular: ['City Centre', 'Umerkot Road', 'Mithi Road', 'Railway Road'],
    areas: ['city centre','umerkot road','mithi road','railway road','bazaar area'],
  },

  // ==========================================
  // MISSING PUNJAB CITIES (HIGH ORDER VOLUME)
  // ==========================================
  chichawatni: {
    popular: ['Chichawatni City', 'Main Bazaar', 'Railway Road', 'Kamalia Road'],
    areas: [
      'chichawatni city','main bazaar','railway road','kamalia road',
      'sahiwal road','gt road','grain market','cantt area',
    ],
  },
  chunian: {
    popular: ['Chunian City', 'Main Bazaar', 'Kasur Road', 'GT Road'],
    areas: [
      'chunian city','main bazaar','kasur road','gt road','chunian mandi',
    ],
  },
  bhera: {
    popular: ['Bhera City', 'Main Bazaar', 'River Jhelum Side', 'GT Road'],
    areas: [
      'bhera city','main bazaar','gt road','river side','railway road',
      'shahpur road','bhalwal road',
    ],
  },
  'chenab nagar': {
    popular: ['Chenab Nagar City', 'Main Bazaar', 'Chiniot Road'],
    areas: [
      'chenab nagar','main bazaar','chiniot road','rabwah',
    ],
  },
  'pindi gheb': {
    popular: ['Pindi Gheb City', 'Main Bazaar', 'Attock Road'],
    areas: [
      'pindi gheb city','main bazaar','attock road','jand road',
      'fateh jang road','makhad road',
    ],
  },
  'taunsa sharif': {
    popular: ['Taunsa Sharif City', 'Main Bazaar', 'DG Khan Road'],
    areas: [
      'taunsa sharif','main bazaar','dg khan road','taunsa barrage',
      'koh e sulaiman road',
    ],
  },

  // ==========================================
  // MISSING KPK CITIES
  // ==========================================
  parachinar: {
    popular: ['Parachinar City', 'Main Bazaar', 'Shia Colony', 'Turi Bazaar'],
    areas: [
      'parachinar city','main bazaar','turi bazaar','upper kurram',
      'lower kurram','sadda','alizai','para chamkani',
    ],
  },
  bajaur: {
    popular: ['Khar', 'Nawagai', 'Mamund', 'Inayat Kilay'],
    areas: [
      'khar','nawagai','mamund','inayat kilay','pashat',
      'salarzai','utmankhel','barang',
    ],
  },
  mohmand: {
    popular: ['Ghalanai', 'Ekka Ghund', 'Pandyali', 'Ambar'],
    areas: [
      'ghalanai','ekka ghund','pandyali','ambar','lakaro','yaka ghund',
    ],
  },
  khyber: {
    popular: ['Landi Kotal', 'Jamrud', 'Bara', 'Torkham Border', 'Ali Masjid'],
    areas: [
      'landi kotal','torkham','jamrud','bara','ali masjid','shagai',
      'tirah maidan','tirah valley','rajgal','karkhano','shinpokh',
      'malagori','sipah','kukikhel','akakhel',
    ],
  },
  battagram: {
    popular: ['Battagram Town', 'Thakot', 'Allai Valley', 'KKH'],
    areas: [
      'battagram town','thakot','ajmera','shamlai','hilkot','banna',
      'kund','pachkhol','biari','pokal','karg',
    ],
  },
  torghar: {
    popular: ['Judbah', 'Kundal', 'Black Mountains', 'Hassanzai'],
    areas: [
      'judbah','kundal','hassanzai','gantar','nusrat khel','darmai','deshwal',
    ],
  },
  'upper kohistan': {
    popular: ['Kandia Valley', 'Dasu', 'Dubair', 'Karakoram Highway'],
    areas: [
      'kandia','dubair','dasu','bankad','harban','seo','sazin','ranolia','gowaar',
    ],
  },
  'lower kohistan': {
    popular: ['Pattan', 'Dasu Dam', 'Palas Valley', 'Karakoram Highway'],
    areas: [
      'pattan','komila','keyal','shatial','palas','shumal bandi','kuz palas','bar palas',
    ],
  },
  'kolai palas': {
    popular: ['Kolai', 'Palas Valley', 'Bankad'],
    areas: [
      'kolai','bankad','sharakot','palas','thalang',
    ],
  },
  hangu: {
    popular: ['Hangu Town', 'Togh Sarai', 'Doaba', 'Tall', 'Samana Range'],
    areas: [
      'hangu town','togh sarai','doaba','tall','ibrahimzai','kharmatu',
      'gharbaz','sarbandha','tora warai','zarghun khel','raisan',
    ],
  },
  karak: {
    popular: ['Karak Town', 'Banda Daud Shah', 'Takht-e-Nasratti', 'Teri', 'Pezu'],
    areas: [
      'karak town','banda daud shah','takht e nasratti','teri','pezu',
      'sabir abad','ambiri kala','tappi','chokara','wadana','latambar',
      'bahram khel','nari panoos','gambilosar',
    ],
  },
  orakzai: {
    popular: ['Kalaya', 'Dabori', 'Mishti', 'Samana Range'],
    areas: [
      'kalaya','dabori','stori khel','mamozai','ghiljo','mishti',
      'ismailzai','sheikhan','babar mela','ali khel','rabia khel','utman khel',
    ],
  },
  'lakki marwat': {
    popular: ['Lakki Marwat City', 'Serai Naurang', 'Pezu', 'Draband'],
    areas: [
      'lakki marwat city','serai naurang','pezu','draband','gambila',
      'naurang','shaheed banda','gandi chashma','tajazai',
      'titar khel','zarwam','ghazni khel','sarki','paindi',
    ],
  },
  'north waziristan': {
    popular: ['Miranshah', 'Mirali', 'Razmak', 'Dattakhel', 'Ghulam Khan'],
    areas: [
      'miranshah','mirali','razmak','dattakhel','ghulam khan','spinwam',
      'epi','hasokhel','degan','khajuri','boya','dosali','shewa','shawal',
    ],
  },
  'south waziristan': {
    popular: ['Wana', 'Ladha', 'Makeen', 'Sararogha', 'Angoor Adda'],
    areas: [
      'wana','ladha','makeen','sararogha','angoor adda','kaniguram',
      'azam warsak','sarwekai','tiarza','shakai','birmil','spin kot',
    ],
  },
  tank: {
    popular: ['Tank City', 'Jandola', 'Gomal River', 'Gul Imam'],
    areas: [
      'tank city','jandola','gul imam','mullazai','kirri shamozai','kot kai',
    ],
  },
  shangla: {
    popular: ['Alpuri', 'Bisham', 'Shangla Pass', 'Puran', 'Martung'],
    areas: [
      'alpuri','bisham','puran','martung','lilownai','chakesar','shangla top',
      'shahpur','pirkhana','karora','damorai','shang','ranial',
    ],
  },
  malakand: {
    popular: ['Bat Khela', 'Dargai', 'Malakand Pass', 'Sakhakot', 'Thana'],
    areas: [
      'bat khela','dargai','malakand pass','sakhakot','thana','khar',
      'palai','heroshah','totakan','jalala',
    ],
  },
  'dir lower': {
    popular: ['Timergara', 'Balambat', 'Talash', 'Munda', 'Samarbagh'],
    areas: [
      'timergara','balambat','talash','munda','samarbagh','adenzai','khall',
    ],
  },
  'dir upper': {
    popular: ['Dir Town', 'Sheringal', 'Wari', 'Barawal Bandi', 'Kalkot'],
    areas: [
      'dir town','sheringal','wari','barawal bandi','larkhani','khal','kalkot',
    ],
  },

  // ==========================================
  // KPK TOWNS (from 200-cities list)
  // ==========================================
  risalpur: {
    popular: ['Cantt', 'Nowshera Road', 'PAF Base Area', 'GT Road'],
    areas: ['cantt','nowshera road','paf base area','gt road','bazaar area'],
  },
  besham: {
    popular: ['City Centre', 'Karakoram Highway', 'Shangla Road', 'Bazaar Area'],
    areas: ['city centre','karakoram highway','shangla road','bazaar area','civil lines'],
  },
  chakdara: {
    popular: ['City Centre', 'Malakand Road', 'Dir Road', 'Cantt'],
    areas: ['city centre','malakand road','dir road','cantt','bazaar area'],
  },
  balakot: {
    popular: ['City Centre', 'Mansehra Road', 'Kaghan Road', 'River Side'],
    areas: ['city centre','mansehra road','kaghan road','bazaar area','river side'],
  },
  topi: {
    popular: ['City Centre', 'Swabi Road', 'KKH', 'Industrial Area'],
    areas: ['city centre','swabi road','kkh','bazaar area','industrial area'],
  },
  'saidu sharif': {
    popular: ['Hospital Area', 'Mingora Road', 'University Area', 'Cantt'],
    areas: ['hospital area','mingora road','university area','bazaar area','cantt'],
  },
  madyan: {
    popular: ['City Centre', 'Bahrain Road', 'Mingora Road', 'River Side'],
    areas: ['city centre','bahrain road','mingora road','bazaar area','river side'],
  },
  bahrain: {
    popular: ['City Centre', 'Kalam Road', 'Madyan Road', 'River Side'],
    areas: ['city centre','kalam road','madyan road','bazaar area','river side'],
  },
  shabqadar: {
    popular: ['City Centre', 'Charsadda Road', 'Mohmand Road', 'Bazaar Area'],
    areas: ['city centre','charsadda road','mohmand road','bazaar area','civil lines'],
  },
  jehangira: {
    popular: ['City Centre', 'GT Road', 'Swabi Road', 'Bridge Area'],
    areas: ['city centre','gt road','swabi road','bazaar area','bridge area'],
  },
  'takht i bahi': {
    popular: ['City Centre', 'Mardan Road', 'Archaeological Area', 'Railway Road'],
    areas: ['city centre','mardan road','archaeological area','bazaar area','railway road'],
  },

  // ==========================================
  // MISSING BALOCHISTAN CITIES
  // ==========================================
  pishin: {
    popular: ['Main Bazaar', 'Killi Shadezai', 'Killi Hekalzai', 'Khushdil Khan Lake'],
    areas: [
      'pishin city','khanozai','saranan','khushdil khan','barshore',
      'hurramzai','surkhab','karezat',
      'killi malezai','killi tareen','killi bazai','killi achakzai','killi muhammad zai',
      'killi lewan','killi mian ghundi','killi syed ahmad shah','killi kakar',
      'killi mandokhel','killi badinzai','killi ashezai','killi panezai',
      'killi alizai','killi jogizai','killi shahwani','killi manzaki',
      'killi barozai','killi hassanzai','killi ibrahim zai',
    ],
  },
  'killa abdullah': {
    popular: ['Killa Abdullah', 'Khojak Pass', 'Shelabagh', 'Gulistan', 'Dobandi'],
    areas: [
      'killa abdullah','gulistan','dobandi','roghani','loe manda',
      'killi paind khan','killi achakzai','killi hassanzai','killi natozai',
      'killi baloch','killi karezat','killi babozai','killi kadozai',
      'killi mengal','killi akazai','killi mulla khel','killi landi','killi isa khel',
    ],
  },
  nushki: {
    popular: ['Nushki City', 'Sultan Abad', 'Anam Bostan', 'Dal Bandin'],
    areas: [
      'nushki city','sultan abad','anam bostan','dal bandin','grang',
      'killi padag','killi tamboo','killi bangulzai','killi shahwani',
      'killi raisani','killi mengal','killi ahmad khanzai','killi notezai','killi badini',
    ],
  },
  mastung: {
    popular: ['Mastung City', 'Spezand', 'Dasht', 'Kirdgap'],
    areas: [
      'mastung city','spezand','dasht','kirdgap',
      'killi mengal','killi bangulzai','killi lehri','killi raisani',
      'killi ghilzai','killi shahwani','killi langove','killi badinzai',
      'killi sarangzai','killi mirwani','killi zehri','killi lango',
      'killi paringabad','killi rind','killi jamaldini',
    ],
  },
  kalat: {
    popular: ['Kalat City', 'Surab', 'Mangochar', 'Johan', 'Gazg'],
    areas: [
      'kalat city','surab','mangochar','johan','gazg','isplinji','baghbana',
      'killi mengal','killi shahwani','killi raisani','killi bangulzai',
      'killi lehri','killi zehri','killi langove','killi bizenjo',
      'killi badini','killi rodeni','killi jhalawan','killi sasoli',
      'killi zagar','killi gurgnari','killi lango','killi pirkani',
    ],
  },
  lasbela: {
    popular: ['Uthal', 'Bela', 'Sonmiani Beach', 'Gadani', 'Winder'],
    areas: [
      'uthal','bela','sonmiani','gadani','winder','lakhra','dureji','kanraj',
      'wayaro','gondrani','sakran','balgatar','surbandar','aliani',
      'damb','phor','liari',
    ],
  },
  awaran: {
    popular: ['Awaran Town', 'Jhal Jhao', 'Mashkay', 'Hingol National Park'],
    areas: [
      'awaran town','jhal jhao','mashkay',
      'killi naal','killi baloch','killi mengal','killi bizenjo','killi rind',
      'killi bezanjho','killi hooth','killi nokjo','killi mullahzai','killi shahani',
    ],
  },
  washuk: {
    popular: ['Washuk Town', 'Shahgori', 'Besima', 'Mashkel'],
    areas: [
      'washuk town','shahgori','besima','mashkel road','palantak',
      'killi badini','killi mengal','killi shahwani','killi nusherwani',
      'killi nausherwani','killi baloch','killi rind','killi jamaldini',
    ],
  },
  harnai: {
    popular: ['Harnai Town', 'Shahrig', 'Khosat', 'Coal Mines'],
    areas: [
      'harnai town','shahrig','khosat',
      'killi marri','killi zehri','killi lehri','killi raisani','killi rind',
    ],
  },
  kohlu: {
    popular: ['Kohlu Town', 'Kahan', 'Tamboo', 'Mawand'],
    areas: [
      'kohlu town','kahan','tamboo','mawand','bambore',
      'killi marri','killi ghaibwal','killi bijrani','killi mondrani',
      'killi mazarani','killi lehri','killi rind',
    ],
  },
  'dera bugti': {
    popular: ['Dera Bugti Town', 'Sui', 'Pir Koh', 'Phelawagh'],
    areas: [
      'dera bugti town','sui','pir koh','phelawagh','sangsilla','notal','loti',
      'baiker','bambore',
      'killi bugti','killi kalpar','killi mundrani','killi marri',
    ],
  },
  bolan: {
    popular: ['Mach', 'Dhadar', 'Bolan Pass', 'Bhag', 'Mehrgarh'],
    areas: [
      'mach','dhadar','bhag','bolan pass','mehrgarh','ab e gum',
      'dozan','kirta','panir','nari','sani shoran',
      'killi rind','killi jamali','killi marri','killi raisani','killi lehri',
    ],
  },
  sherani: {
    popular: ['Sherani Town', 'Sharan', 'Takht-e-Sulaiman'],
    areas: [
      'sherani town','sharan',
      'killi sherani','killi mandokhel','killi usmani','killi jogezai','killi kakar',
    ],
  },
  'killa saifullah': {
    popular: ['Killa Saifullah Town', 'Muslim Bagh', 'Loi Band', 'Badini'],
    areas: [
      'killa saifullah town','muslim bagh','loi band','badini','nisai','kanmetharzai',
      'killi kakar','killi mandokhel','killi tareen','killi achakzai',
      'killi jogezai','killi badini',
    ],
  },
  musakhel: {
    popular: ['Musakhel Town', 'Drug', 'Toisar', 'Kingri'],
    areas: [
      'musakhel town','drug','toisar','kingri',
      'killi musakhel','killi kakar','killi mandokhel','killi tareen',
    ],
  },
  barkhan: {
    popular: ['Barkhan Town', 'Rakhni', 'Bahlol'],
    areas: [
      'barkhan town','rakhni','bahlol',
      'killi marri','killi lehri','killi rind','killi bugti','killi lund',
    ],
  },
  panjgur: {
    popular: ['Panjgur City', 'Parom', 'Gichk', 'Tasp'],
    areas: [
      'panjgur city','parom','gichk','tasp',
      'killi nausherwani','killi baloch','killi rind','killi mengal','killi dashti',
    ],
  },
  nasirabad: {
    popular: ['Dera Murad Jamali', 'Tamboo', 'Chattar', 'Muhammadpur'],
    areas: [
      'dera murad jamali','tamboo','chattar','muhammadpur',
      'killi jamali','killi rind','killi bugti','killi marri','killi lehri',
    ],
  },
  jaffarabad: {
    popular: ['Dera Allahyar', 'Gandakha', 'Hattar', 'Usta Muhammad'],
    areas: [
      'dera allahyar','gandakha','hattar','usta muhammad',
      'killi magsi','killi jamali','killi rind','killi lehri','killi bugti',
    ],
  },
  'jhal magsi': {
    popular: ['Jhal Magsi Town', 'Gandawah', 'Mula River'],
    areas: [
      'jhal magsi town','gandawah',
      'killi magsi','killi rind','killi jamali','killi lehri','killi bugti',
    ],
  },
  sohbatpur: {
    popular: ['Sohbatpur City', 'Usta Muhammad', 'Faridabad', 'Bijapur'],
    areas: [
      'sohbatpur city','usta muhammad','faridabad','bijapur','goth machi',
      'killi jamali','killi rind','killi magsi','killi bugti','killi lehri',
    ],
  },
  chagai: {
    popular: ['Dalbandin', 'Nokkundi', 'Taftan Border', 'Chagai Hills'],
    areas: [
      'dalbandin','nokkundi','taftan','chagai town','padag','yakmach',
      'killi badini','killi nausherwani','killi mengal','killi shahwani',
    ],
  },
  kharan: {
    popular: ['Kharan City', 'Basima', 'Nag', 'Ladgasht'],
    areas: [
      'kharan city','basima','nag','ladgasht',
      'killi nausherwani','killi badini','killi mengal','killi shahwani','killi baloch',
    ],
  },

  // ==========================================
  // MISSING AJK CITIES
  // ==========================================
  'hattian bala': {
    popular: ['Hattian Bala Town', 'Leepa Valley', 'Chakothi', 'Chikkar', 'Reshian'],
    areas: [
      'hattian bala','leepa valley','chakothi','chikkar','reshian',
      'lamnian','langrial','dhanni','panjal','salmia','kamsar',
      'bandi','kundalshahi','channar','gowri','lohar gali','shahkot',
      'noonbandi','surgam','bana','dandakhel','garhi',
    ],
  },
  neelum: {
    popular: ['Athmuqam', 'Kel', 'Arang Kel', 'Sharda', 'Keran', 'Tao Butt'],
    areas: [
      'athmuqam','kel','arang kel','sharda','keran','tao butt',
      'kutton jagran','salkhala','dowarian','dudnial','ratti gali',
      'upper kel','lower kel','jabri','surgam','minimarg',
      'machiara','shounter','bugna','gorian','halmat','tilail',
    ],
  },
  haveli: {
    popular: ['Kahuta Town', 'Forward Kahuta', 'Chamb'],
    areas: [
      'kahuta town','forward kahuta','chamb','mujahid abad',
      'dhanni','barrian','bandi','kala bagh','mohra','langrial',
    ],
  },
  sudhnoti: {
    popular: ['Pallandri', 'Trarkhal', 'Ganga Choti', 'Mang'],
    areas: [
      'pallandri','trarkhal','mang','bandi','rehara','chamb',
      'mohra','langrial','kacheli','mallot','tella','sarbala',
      'bharri','kakrali','padhana','sohawa','baloch town',
    ],
  },

  // ==========================================
  // MISSING GB CITIES
  // ==========================================
  nagar: {
    popular: ['Nagar Valley', 'Minapin', 'Chalt', 'Hopar', 'Rakaposhi View'],
    areas: [
      'nagar proper','minapin','chalt','hopar','hisper','nilt',
      'pissan','jaffarabad','ghulmet','sumayar','askurdas',
      'bualtar','shayar','hakuchar','sikandarabad','thol',
    ],
  },
  shigar: {
    popular: ['Shigar Fort', 'Shigar Valley', 'Askole', 'Basho Valley'],
    areas: [
      'shigar town','hashupi','markunja','tissar','alchori','baha',
      'thorko','dasso','chutran','braldu valley','askole',
      'basho','upper basho','lower basho','amburiq','paiju',
    ],
  },
  kharmang: {
    popular: ['Manthoka Waterfall', 'Olding', 'Tolti', 'Chorbat Valley'],
    areas: [
      'tolti','olding','karmang','parkutta','mehdiabad',
      'dogoro','barah','sildi','thang','chorbat',
    ],
  },
  ghanche: {
    popular: ['Khaplu Palace', 'Khaplu Town', 'Hushe Valley', 'Machulo'],
    areas: [
      'khaplu','saling','machulo','balghar','hushe','kuru',
      'ghowari','doghoni','kondus valley','kande','saicho',
      'aling','kanday','dansam','brolmo','thalle','lado',
    ],
  },
  diamer: {
    popular: ['Chilas', 'Fairy Meadows', 'Nanga Parbat', 'Babusar Pass', 'Raikot Bridge'],
    areas: [
      'chilas','fairy meadows','raikot','thalichi','bunar','gonar',
      'babusar','thalpan','darel','tangir','juglot','jaglot',
      'shatial','sazin','komila','hudur','gutumsar','barseen','khiner',
    ],
  },

  // ==========================================
  // TIER 1 — MISSING CITIES (Pop > 80K)
  // ==========================================

  // PUNJAB — Tehsil HQs
  'mian channu': {
    popular: ['City Centre', 'Multan Road', 'Khanewal Road', 'Railway Road', 'Model Town'],
    areas: [
      'city centre','multan road','khanewal road','railway road','model town',
      'grain market','civil lines','mohalla qureshi','mohalla rajput',
      'mohalla syed','mohalla arain','bypass road','sahiwal road',
      'college road','hospital road','bus stand area','eid gah road',
    ],
  },
  kharian: {
    popular: ['Kharian Cantt', 'City Centre', 'GT Road', 'Jhelum Road', 'Railway Road'],
    areas: [
      'kharian cantt','city centre','gt road','jhelum road','railway road',
      'civil lines','mall road','college road','hospital road',
      'mohalla dhok','sadar bazaar','bus stand area','lala musa road',
      'dinga road','army area','cantt bazaar',
    ],
  },
  shujabad: {
    popular: ['City Centre', 'Multan Road', 'Bahawalpur Road', 'Railway Road'],
    areas: [
      'city centre','multan road','bahawalpur road','railway road',
      'model town','civil lines','grain market','college road',
      'hospital road','mohalla qureshi','bus stand area','bypass road',
    ],
  },
  shakargarh: {
    popular: ['City Centre', 'Narowal Road', 'Sialkot Road', 'Railway Road'],
    areas: [
      'city centre','narowal road','sialkot road','railway road',
      'model town','civil lines','grain market','college road',
      'hospital road','bus stand area','mohalla rajput','bypass road',
    ],
  },
  jampur: {
    popular: ['City Centre', 'DG Khan Road', 'Rajanpur Road', 'Canal Road'],
    areas: [
      'city centre','dg khan road','rajanpur road','canal road',
      'railway road','model town','civil lines','college road',
      'hospital road','grain market','bus stand area','bypass road',
    ],
  },
  shorkot: {
    popular: ['Shorkot City', 'Shorkot Cantt', 'Jhang Road', 'Faisalabad Road'],
    areas: [
      'shorkot city','shorkot cantt','jhang road','faisalabad road',
      'railway road','civil lines','grain market','college road',
      'bus stand area','model town','bypass road','hospital road',
    ],
  },
  'fateh jang': {
    popular: ['City Centre', 'Attock Road', 'Rawalpindi Road', 'Talagang Road'],
    areas: [
      'city centre','attock road','rawalpindi road','talagang road',
      'railway road','civil lines','college road','hospital road',
      'bus stand area','model town','bazaar area','bypass road',
    ],
  },
  'naushera virkan': {
    popular: ['City Centre', 'Gujranwala Road', 'Hafizabad Road', 'Railway Road'],
    areas: [
      'city centre','gujranwala road','hafizabad road','railway road',
      'civil lines','grain market','college road','hospital road',
      'bus stand area','model town','bypass road',
    ],
  },
  bhalwal: {
    popular: ['City Centre', 'Sargodha Road', 'Shahpur Road', 'Railway Road'],
    areas: [
      'city centre','sargodha road','shahpur road','railway road',
      'civil lines','grain market','college road','hospital road',
      'bus stand area','model town','bypass road','bazaar area',
    ],
  },
  'chak jhumra': {
    popular: ['City Centre', 'Faisalabad Road', 'Chiniot Road', 'Railway Road'],
    areas: [
      'city centre','faisalabad road','chiniot road','railway road',
      'civil lines','college road','hospital road','bus stand area',
      'model town','bypass road','grain market',
    ],
  },
  dina: {
    popular: ['City Centre', 'GT Road', 'Jhelum Road', 'Mangla Road'],
    areas: [
      'city centre','gt road','jhelum road','mangla road',
      'railway road','civil lines','college road','hospital road',
      'bus stand area','model town','bypass road','bazaar area',
    ],
  },
  'kahror pacca': {
    popular: ['City Centre', 'Lodhran Road', 'Multan Road', 'Railway Road'],
    areas: [
      'city centre','lodhran road','multan road','railway road',
      'civil lines','grain market','college road','hospital road',
      'bus stand area','model town','bypass road',
    ],
  },
  'kot radha kishan': {
    popular: ['City Centre', 'Kasur Road', 'Lahore Road', 'Pattoki Road'],
    areas: [
      'city centre','kasur road','lahore road','pattoki road',
      'railway road','civil lines','grain market','college road',
      'bus stand area','model town','bypass road',
    ],
  },
  alipur: {
    popular: ['City Centre', 'Muzaffargarh Road', 'Multan Road', 'Railway Road'],
    areas: [
      'city centre','muzaffargarh road','multan road','railway road',
      'civil lines','grain market','college road','hospital road',
      'bus stand area','model town','bypass road',
    ],
  },

  // KPK
  timergara: {
    popular: ['City Centre', 'Main Bazaar', 'Peshawar Road', 'Chitral Road'],
    areas: [
      'city centre','main bazaar','peshawar road','chitral road',
      'college road','hospital road','bus stand area','model town',
      'civil lines','bypass road','army area',
    ],
  },

  // SINDH
  shahdadpur: {
    popular: ['City Centre', 'Main Bazaar', 'Sanghar Road', 'Nawabshah Road'],
    areas: [
      'city centre','main bazaar','sanghar road','nawabshah road',
      'railway road','civil lines','college road','hospital road',
      'bus stand area','bypass road',
    ],
  },

  // ==========================================
  // TIER 2 — MISSING CITIES (Pop 50K-80K)
  // ==========================================

  // PUNJAB
  jahanian: {
    popular: ['City Centre', 'Khanewal Road', 'Multan Road', 'Railway Road'],
    areas: [
      'city centre','khanewal road','multan road','railway road',
      'civil lines','grain market','college road','bus stand area',
      'model town','bypass road',
    ],
  },
  'jalalpur pirwala': {
    popular: ['City Centre', 'Multan Road', 'Shujabad Road', 'Canal Road'],
    areas: [
      'city centre','multan road','shujabad road','canal road',
      'railway road','civil lines','college road','bus stand area',
      'model town','bypass road',
    ],
  },
  raiwind: {
    popular: ['Raiwind City', 'Tablighi Markaz', 'Lahore Road', 'Railway Road'],
    areas: [
      'raiwind city','tablighi markaz area','lahore road','railway road',
      'civil lines','college road','hospital road','bus stand area',
      'model town','bypass road','main bazaar',
    ],
  },
  'sarai alamgir': {
    popular: ['City Centre', 'GT Road', 'Jhelum Road', 'Gujrat Road'],
    areas: [
      'city centre','gt road','jhelum road','gujrat road',
      'railway road','civil lines','college road','bus stand area',
      'model town','bypass road','bazaar area',
    ],
  },
  malakwal: {
    popular: ['City Centre', 'Mandi Bahauddin Road', 'Sargodha Road', 'Railway Road'],
    areas: [
      'city centre','mandi bahauddin road','sargodha road','railway road',
      'civil lines','grain market','college road','bus stand area',
      'model town','bypass road',
    ],
  },
  minchinabad: {
    popular: ['City Centre', 'Bahawalnagar Road', 'Fort Abbas Road', 'Railway Road'],
    areas: [
      'city centre','bahawalnagar road','fort abbas road','railway road',
      'civil lines','grain market','college road','bus stand area',
      'model town','bypass road',
    ],
  },
  'ahmad pur sial': {
    popular: ['City Centre', 'Jhang Road', 'Faisalabad Road', 'Railway Road'],
    areas: [
      'city centre','jhang road','faisalabad road','railway road',
      'civil lines','grain market','college road','bus stand area',
      'model town','bypass road',
    ],
  },
  'darya khan': {
    popular: ['City Centre', 'Bhakkar Road', 'Layyah Road', 'Railway Road'],
    areas: [
      'city centre','bhakkar road','layyah road','railway road',
      'civil lines','grain market','college road','bus stand area',
      'model town','bypass road',
    ],
  },
  rojhan: {
    popular: ['City Centre', 'Rajanpur Road', 'DG Khan Road'],
    areas: [
      'city centre','rajanpur road','dg khan road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  'kot chutta': {
    popular: ['City Centre', 'DG Khan Road', 'Multan Road'],
    areas: [
      'city centre','dg khan road','multan road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  'isa khel': {
    popular: ['City Centre', 'Mianwali Road', 'Indus Highway'],
    areas: [
      'city centre','mianwali road','indus highway',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  sohawa: {
    popular: ['City Centre', 'GT Road', 'Jhelum Road', 'Gujar Khan Road'],
    areas: [
      'city centre','gt road','jhelum road','gujar khan road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  hazro: {
    popular: ['City Centre', 'Attock Road', 'Kamra Road', 'Railway Road'],
    areas: [
      'city centre','attock road','kamra road','railway road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  'pindi bhattian': {
    popular: ['City Centre', 'Hafizabad Road', 'Faisalabad Road', 'Railway Road'],
    areas: [
      'city centre','hafizabad road','faisalabad road','railway road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  bhowana: {
    popular: ['City Centre', 'Chiniot Road', 'Jhang Road'],
    areas: [
      'city centre','chiniot road','jhang road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  lalian: {
    popular: ['City Centre', 'Chiniot Road', 'Sargodha Road'],
    areas: [
      'city centre','chiniot road','sargodha road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  'karor lal esan': {
    popular: ['City Centre', 'Layyah Road', 'DG Khan Road'],
    areas: [
      'city centre','layyah road','dg khan road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  'khairpur tamewali': {
    popular: ['City Centre', 'Bahawalpur Road', 'Yazman Road'],
    areas: [
      'city centre','bahawalpur road','yazman road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  jatoi: {
    popular: ['City Centre', 'Muzaffargarh Road', 'Multan Road'],
    areas: [
      'city centre','muzaffargarh road','multan road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  kunjah: {
    popular: ['City Centre', 'Gujrat Road', 'GT Road'],
    areas: [
      'city centre','gujrat road','gt road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  zafarwal: {
    popular: ['City Centre', 'Narowal Road', 'Sialkot Road'],
    areas: [
      'city centre','narowal road','sialkot road',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },

  // SINDH — Tier 2
  mehar: {
    popular: ['City Centre', 'Dadu Road', 'Indus Highway'],
    areas: [
      'city centre','dadu road','indus highway',
      'civil lines','college road','bus stand area','bypass road',
    ],
  },
  kunri: {
    popular: ['City Centre', 'Umerkot Road', 'Mirpurkhas Road'],
    areas: [
      'city centre','umerkot road','mirpurkhas road',
      'civil lines','college road','bus stand area','bypass road','chili market',
    ],
  },

  // KPK — Tier 2
  batkhela: {
    popular: ['City Centre', 'Main Bazaar', 'Malakand Road', 'Chakdara Road'],
    areas: [
      'city centre','main bazaar','malakand road','chakdara road',
      'college road','hospital road','bus stand area','bypass road',
    ],
  },
  khar: {
    popular: ['City Centre', 'Main Bazaar', 'Nawagai Road'],
    areas: [
      'city centre','main bazaar','nawagai road',
      'college road','hospital road','bus stand area',
    ],
  },
  'landi kotal': {
    popular: ['City Centre', 'Main Bazaar', 'Torkham Road'],
    areas: [
      'city centre','main bazaar','torkham road',
      'college road','bus stand area','khyber pass area',
    ],
  },

  // BALOCHISTAN — Tier 2
  pasni: {
    popular: ['City Centre', 'Coastal Area', 'Gwadar Road'],
    areas: [
      'city centre','coastal area','gwadar road',
      'fish harbour','college road','bus stand area',
    ],
  },
  ormara: {
    popular: ['City Centre', 'Coastal Area', 'Navy Area'],
    areas: [
      'city centre','coastal area','navy area',
      'bus stand area','main bazaar',
    ],
  },

  // AJK — Tier 2
  dadyal: {
    popular: ['City Centre', 'Mirpur Road', 'Mangla Road', 'Main Bazaar'],
    areas: [
      'city centre','mirpur road','mangla road','main bazaar',
      'college road','hospital road','bus stand area',
    ],
  },
  mangla: {
    popular: ['Mangla Cantt', 'Mangla Dam', 'Mirpur Road', 'Jhelum Road'],
    areas: [
      'mangla cantt','mangla dam area','mirpur road','jhelum road',
      'army area','bazaar area','college road',
    ],
  },
};

// ============= CITY NAME NORMALIZATION =============
// Maps common misspellings/abbreviations to canonical city name keys
const CITY_ALIASES = {
  // Major cities
  'khi': 'karachi', 'krachi': 'karachi', 'karchi': 'karachi', 'karachil': 'karachi',
  'karach': 'karachi', 'karaachi': 'karachi', 'karaci': 'karachi',
  'lhr': 'lahore', 'lahor': 'lahore', 'lahire': 'lahore', 'lahora': 'lahore',
  'lshore': 'lahore', 'lohore': 'lahore',
  'isb': 'islamabad', 'islambad': 'islamabad', 'islambd': 'islamabad',
  'islmabad': 'islamabad', 'isalambad': 'islamabad',
  'rwp': 'rawalpindi', 'pindi': 'rawalpindi', 'rawlpindi': 'rawalpindi',
  'rawapidi': 'rawalpindi', 'rawalpandi': 'rawalpindi',
  'fsd': 'faisalabad', 'faislabad': 'faisalabad', 'faisal abad': 'faisalabad',
  'fasalabad': 'faisalabad', 'faslabad': 'faisalabad', 'fasialabad': 'faisalabad',
  'mtn': 'multan', 'mul': 'multan',
  'psh': 'peshawar', 'peshawr': 'peshawar', 'peshawer': 'peshawar', 'peshwar': 'peshawar',
  'pehsawar': 'peshawar',
  'qta': 'quetta', 'queta': 'quetta',
  'hyd': 'hyderabad', 'hydrabad': 'hyderabad', 'hydetabad': 'hyderabad', 'hydreabad': 'hyderabad', 'hyderabd': 'hyderabad', 'haiderabad': 'hyderabad',
  'jamsoro': 'jamshoro', 'jamshro': 'jamshoro',
  'grw': 'gujranwala', 'gujrawala': 'gujranwala', 'gujarnwala': 'gujranwala',
  'gojranwala': 'gujranwala', 'gujarwala': 'gujranwala',
  'skt': 'sialkot', 'sialcot': 'sialkot',
  // Swat → Mingora
  'swat': 'mingora',
  // Abbreviations
  'dgk': 'dera ghazi khan', 'd.g. khan': 'dera ghazi khan', 'dg khan': 'dera ghazi khan',
  'dg': 'dera ghazi khan',
  'ryk': 'rahim yar khan', 'r.y. khan': 'rahim yar khan', 'ry khan': 'rahim yar khan',
  'di khan': 'dera ismail khan', 'd.i. khan': 'dera ismail khan', 'dik': 'dera ismail khan',
  // AJK
  'muzaffarabd': 'muzaffarabad',
  // Others
  'bwp': 'bahawalpur', 'sgd': 'sargodha', 'grt': 'gujrat',
  'mbd': 'mandi bahauddin', 'm.b.din': 'mandi bahauddin', 'mandibahauddin': 'mandi bahauddin',
  'tts': 'toba tek singh', 'toba': 'toba tek singh',
  'nwb': 'nawabshah', 'nawab shah': 'nawabshah',
  'mkhas': 'mirpurkhas', 'mirpur khas': 'mirpurkhas',
  // New Sindh cities
  'tando allahyar': 'tando allahyar', 'tando allah yar': 'tando allahyar',
  'tando mk': 'tando muhammad khan', 'tando m khan': 'tando muhammad khan',
  'tmk': 'tando muhammad khan',
  'kambar': 'kambar shahdadkot', 'shahdadkot': 'kambar shahdadkot',
  'naushero feroze': 'naushahro feroze', 'naushero feroz': 'naushahro feroze',
  'n.feroze': 'naushahro feroze', 'nferoze': 'naushahro feroze',
  'mithi': 'tharparkar',
  // New KPK cities
  'waziristan': 'north waziristan', 'miranshah': 'north waziristan',
  'wana': 'south waziristan',
  'lakki': 'lakki marwat', 'lakkimarwat': 'lakki marwat',
  'dir lower': 'dir lower', 'lower dir': 'dir lower',
  'dir upper': 'dir upper', 'upper dir': 'dir upper',
  'bat khela': 'malakand', 'batkhela': 'malakand', 'dargai': 'malakand',
  // New Balochistan cities
  'killa abdulla': 'killa abdullah', 'chaman border': 'chaman',
  'dmj': 'nasirabad', 'dera murad jamali': 'nasirabad',
  'dera allahyar': 'jaffarabad',
  'dalbandin': 'chagai', 'taftan': 'chagai', 'nokkundi': 'chagai',
  'muslim bagh': 'killa saifullah',
  'uthal': 'lasbela', 'bela': 'lasbela', 'gadani': 'lasbela',
  'mach': 'bolan', 'dhadar': 'bolan',
  // New AJK cities
  'hattian': 'hattian bala', 'leepa': 'hattian bala', 'leepa valley': 'hattian bala',
  'neelum valley': 'neelum', 'athmuqam': 'neelum', 'kel': 'neelum',
  'pallandri': 'sudhnoti', 'plandri': 'sudhnoti',
  'kahuta': 'haveli', 'forward kahuta': 'haveli',
  // New GB cities
  'khaplu': 'ghanche', 'hushe': 'ghanche',
  'chilas': 'diamer', 'fairy meadows': 'diamer',
  'nagar valley': 'nagar',
  'shigar fort': 'shigar', 'shigar valley': 'shigar',
  'manthoka': 'kharmang', 'tolti': 'kharmang',
  // === Address X analysis — high-frequency misspellings ===
  'faislabad': 'faisalabad', // 56+ orders use this spelling
  'gujarat': 'gujrat', // common confusion with country
  'sailkot': 'sialkot', 'sialkot': 'sialkot',
  'jehlum': 'jhelum', 'jahlum': 'jhelum', 'jehlam': 'jhelum',
  'shekhupura': 'sheikhupura', 'sheikhpura': 'sheikhupura', 'shekipura': 'sheikhupura',
  'abbotabad': 'abbottabad', 'abbattabad': 'abbottabad', 'abbottbad': 'abbottabad',
  'nowshehra': 'nowshera', 'naushehra': 'nowshera', 'noshehra': 'nowshera', 'noshera': 'nowshera',
  'kamoki': 'gujranwala', 'kamonki': 'gujranwala', // kamoke tehsil
  'bahwalpur': 'bahawalpur', 'bhawalpur': 'bahawalpur', 'bahawapur': 'bahawalpur',
  'rawlakot': 'rawalakot', 'rawalkot': 'rawalakot',
  'mandibahuddin': 'mandi bahauddin', 'mandibahaudin': 'mandi bahauddin',
  'sarghoda': 'sargodha', 'sargodah': 'sargodha', 'srgoodha': 'sargodha',
  'muzaffrabad': 'muzaffarabad', 'mazafarabd': 'muzaffarabad', 'muzafrabad': 'muzaffarabad',
  'narrowal': 'narowal', 'naronwal': 'narowal',
  'bahawalnagr': 'bahawalnagar', 'bawalnagar': 'bahawalnagar',
  'renala khurd': 'okara', 'renala khud': 'okara', 'renal khud': 'okara',
  // New missing cities aliases
  'chichwatni': 'chichawatni', 'chichawtni': 'chichawatni',
  'rabwah': 'chenab nagar',
  'pindigheb': 'pindi gheb', 'pinde ghab': 'pindi gheb',
  'taunsa': 'taunsa sharif', 'thunsa': 'taunsa sharif', 'thunsa sharif': 'taunsa sharif',
  'kurram': 'parachinar',
  'samundri': 'faisalabad', 'sammundri': 'faisalabad', 'samandri': 'faisalabad',
  // === Punjab tehsils aliases ===
  'wah': 'wah cantt', 'wahcantt': 'wah cantt', 'wah cant': 'wah cantt',
  'hasanabdal': 'hasan abdal', 'hassan abdal': 'hasan abdal',
  'gujarkhan': 'gujar khan', 'gujer khan': 'gujar khan',
  'kotaddu': 'kot addu', 'kot adu': 'kot addu',
  'sadiqabd': 'sadiqabad', 'sadiq abad': 'sadiqabad',
  'ahmedpureast': 'ahmedpur east', 'ahmed pur east': 'ahmedpur east',
  'pinddadankhan': 'pind dadan khan', 'pind dadan': 'pind dadan khan',
  'lalamusa': 'lala musa', 'lala moosa': 'lala musa',
  'sanglahil': 'sangla hill', 'sangla': 'sangla hill',
  'renalakhurd': 'renala khurd',
  'jalalpurjattan': 'jalalpur jattan', 'jalalpur': 'jalalpur jattan',
  'fortabbas': 'fort abbas',
  'pirmahal': 'pir mahal',
  'ahmedpureast': 'ahmedpur east',
  // === Sindh towns aliases ===
  'panoaqil': 'pano aqil', 'pano akil': 'pano aqil',
  'sukkar': 'sukkur', 'suker': 'sukkur', 'sukker': 'sukkur', 'sukkr': 'sukkur',
  'saidusharif': 'saidu sharif',
  'sehwan': 'sehwan sharif',
  'mirpurmathelo': 'mirpur mathelo',
  'takhtibahi': 'takht i bahi', 'takht bhai': 'takht i bahi',
  // === KPK towns aliases ===
  'bahrain swat': 'bahrain', 'swat bahrain': 'bahrain',
  'kalam': 'bahrain', // kalam is beyond bahrain in swat valley
  // === NEW MISSING CITY ALIASES ===
  // Mian Channu variants
  'mian chanu': 'mian channu', 'mian chunu': 'mian channu', 'mianchannu': 'mian channu',
  'mian channo': 'mian channu', 'mianchanu': 'mian channu', 'mian chanu': 'mian channu',
  // Tier 1 cities aliases
  'khariyan': 'kharian', 'kharyan': 'kharian', 'kherian': 'kharian', 'karyana': 'kharian', 'khariana': 'kharian', 'khariaan': 'kharian',
  'shujabadh': 'shujabad', 'shujabat': 'shujabad',
  'shakargharh': 'shakargarh', 'shakergarh': 'shakargarh', 'shakar garh': 'shakargarh',
  'jaampur': 'jampur', 'jam pur': 'jampur',
  'shorkot cantt': 'shorkot', 'shorkot city': 'shorkot',
  'fateh jung': 'fateh jang', 'fatehjang': 'fateh jang', 'fatehjan': 'fateh jang',
  'fath pur': 'fatehpur', 'fateh pur': 'fatehpur', 'fathpur': 'fatehpur', 'fateh pure': 'fatehpur', 'fathehpur': 'fatehpur', 'fatehpure': 'fatehpur',
  'mian chanu': 'mian channu', 'mian chunu': 'mian channu', 'mian channo': 'mian channu', 'mianchanu': 'mian channu', 'mianchannu': 'mian channu',
  'naushera virkan': 'naushera virkan', 'naushehra virkan': 'naushera virkan',
  'bhalwal': 'bhalwal', 'bhelwal': 'bhalwal',
  'chak jhumra': 'chak jhumra', 'chakjhumra': 'chak jhumra', 'chak jumra': 'chak jhumra',
  'deena': 'dina',
  'kahror paca': 'kahror pacca', 'kahroor pacca': 'kahror pacca',
  'kot radha kishan': 'kot radha kishan', 'kotradhakishan': 'kot radha kishan',
  'ali pur': 'alipur', 'alipurchattha': 'alipur',
  'timergra': 'timergara', 'temargarah': 'timergara', 'timergarah': 'timergara',
  'shahdadpur': 'shahdadpur', 'shahadadpur': 'shahdadpur',
  // Tier 2 aliases
  'jahaniya': 'jahanian', 'jahaniyan': 'jahanian', 'jehanian': 'jahanian',
  'jalalpurpirwala': 'jalalpur pirwala', 'jalalpur pirwalla': 'jalalpur pirwala',
  'rai wind': 'raiwind',
  'sarai alamgeer': 'sarai alamgir', 'srai alamgir': 'sarai alamgir', 'srai alamgeer': 'sarai alamgir',
  'malakwall': 'malakwal',
  'minchanbad': 'minchinabad', 'manchinabad': 'minchinabad',
  'ahmadpursial': 'ahmad pur sial', 'ahmed pur sial': 'ahmad pur sial',
  'daryakhan': 'darya khan',
  'rojhaan': 'rojhan',
  'kot chuta': 'kot chutta', 'kotchutta': 'kot chutta',
  'isakhal': 'isa khel', 'isa khal': 'isa khel',
  'sohava': 'sohawa',
  'hazru': 'hazro',
  'pindibhattian': 'pindi bhattian', 'pindi bhatian': 'pindi bhattian',
  'bhawana': 'bhowana',
  'laliyan': 'lalian',
  'karorlalesan': 'karor lal esan', 'karor lalesan': 'karor lal esan',
  'khairpurtamewali': 'khairpur tamewali',
  'jatoe': 'jatoi',
  'konjah': 'kunjah',
  'zafarwaal': 'zafarwal',
  'meher': 'mehar',
  'konri': 'kunri',
  'bat khela': 'batkhela',
  'landikotal': 'landi kotal', 'landi kotal': 'landi kotal',
  'paasni': 'pasni',
  'ormarra': 'ormara',
  'dadyaal': 'dadyal', 'dadial': 'dadyal',
  'mangla cantt': 'mangla', 'mangla dam': 'mangla',
  // District name aliases
  'shaheed benazirabad': 'nawabshah', 'shaheed benazir abad': 'nawabshah',
  'kech': 'turbat',
  'kachhi': 'bolan',
  'poonch': 'rawalakot',
};

/**
 * Get area data for a city
 * @param {string} city - City name (any case, can be alias)
 * @returns {{ popular: string[], areas: string[] } | null}
 */
function getCityAreas(city) {
  if (!city) return null;
  const key = city.toLowerCase().trim();
  // Direct match
  if (CITY_AREAS[key]) return CITY_AREAS[key];
  // Alias match
  const alias = CITY_ALIASES[key];
  if (alias && CITY_AREAS[alias]) return CITY_AREAS[alias];
  return null;
}

/**
 * Get popular area suggestions as a formatted string
 * @param {string} city - City name
 * @returns {string} e.g. "Jaise Gulshan-e-Iqbal, DHA, North Nazimabad, Nazimabad, Clifton"
 */
function getAreaSuggestions(city) {
  const data = getCityAreas(city);
  if (!data || !data.popular.length) return '';
  return 'Jaise ' + data.popular.join(', ');
}

/**
 * Get all known area names (for matching/extraction)
 * Returns a flat array of all area strings across all cities
 */
function getAllAreas() {
  const all = new Set();
  for (const city of Object.values(CITY_AREAS)) {
    for (const area of city.areas) {
      all.add(area);
    }
  }
  return [...all];
}

/**
 * Match customer's area input against known areas for a city
 * Returns the best match or null
 * @param {string} input - Customer's area text
 * @param {string} city - City name
 * @returns {string|null} Matched area name or null
 */
function matchArea(input, city) {
  if (!input || !city) return null;
  const data = getCityAreas(city);
  if (!data) return null;

  const l = input.toLowerCase().trim();

  // Exact match
  if (data.areas.includes(l)) {
    return l.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Partial match — input contains area name (word-boundary to avoid "chorangi" → "orangi")
  for (const area of data.areas) {
    const areaRe = new RegExp('\\b' + area.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (areaRe.test(l) || (l.length <= area.length + 3 && area.includes(l))) {
      return area.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  // Fuzzy: remove hyphens/spaces and compare
  const normalize = s => s.replace(/[-\s]/g, '').toLowerCase();
  const normalInput = normalize(l);
  for (const area of data.areas) {
    if (normalize(area) === normalInput) {
      return area.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  // Fuzzy spelling tolerance: collapse common variations
  // chorangi/chowrangi, chowrangii/chowrangi, nazimabad/nazimabadh, etc.
  const fuzzy = s => s.replace(/[-\s]/g, '').toLowerCase()
    .replace(/ch?ow?/g, 'cho')      // chow/cho/cow → cho
    .replace(/ii+/g, 'i')           // double i → i
    .replace(/ee+/g, 'e')           // double e → e
    .replace(/aa+/g, 'a')           // double a → a
    .replace(/dh?/g, 'd')           // dh → d
    .replace(/th/g, 't')            // th → t
    .replace(/(.)\1+/g, '$1');      // any repeated char → single
  const fuzzyInput = fuzzy(l);
  for (const area of data.areas) {
    if (fuzzy(area) === fuzzyInput) {
      return area.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  // Keyword match: key word of multi-word area found as standalone word in input
  // E.g., "johar" in input → matches "johar town", "gulberg" → "gulberg"
  // Skip generic words (town, colony, etc.) and city name to avoid false matches
  const GENERIC_AREA_WORDS = new Set(['town','city','nagar','abad','pura','ganj','gunj','road','scheme','phase','sector','block','colony','society','housing','extension','ext','north','south','east','west','new','old','chak','village','gaon','goth','killi','dhoke','mauza','main','gate','market','bazar','bazaar','chowk','mohalla','mohallah','naya','purana','pakistan','india','afghanistan','iran','china','bangladesh']);
  const cityWord = city.toLowerCase().replace(/[-\s]/g, '');
  const inputWords = l.split(/\s+/);
  for (const area of data.areas) {
    if (area.includes(' ')) {
      const areaWords = area.split(' ');
      for (const aw of areaWords) {
        if (aw.length >= 4 && !GENERIC_AREA_WORDS.has(aw) && aw !== cityWord && inputWords.includes(aw)) {
          // Skip if keyword is followed by "road/rd" in input — it's a road name, not area
          const awIdx = inputWords.indexOf(aw);
          const nextWord = awIdx < inputWords.length - 1 ? inputWords[awIdx + 1] : '';
          if (/^(road|rd|highway|motorway)$/i.test(nextWord)) continue;
          return area.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
      }
    }
  }

  // Fuzzy substring: try sliding window of 2-3 consecutive words from input
  // For longer input like "flat nomber 230 maria appartmint bloc one gate nom 2 nagan chorangi"
  const words = l.split(/\s+/);
  if (words.length > 2) {
    for (let i = 0; i < words.length; i++) {
      for (let len = 2; len <= Math.min(3, words.length - i); len++) {
        const chunk = words.slice(i, i + len).join(' ');
        const fuzzyChunk = fuzzy(chunk);
        for (const area of data.areas) {
          if (fuzzy(area) === fuzzyChunk) {
            return area.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        }
      }
    }
  }

  return null;
}

module.exports = { CITY_AREAS, CITY_ALIASES, getCityAreas, getAreaSuggestions, getAllAreas, matchArea };
