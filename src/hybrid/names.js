/**
 * Comprehensive Pakistani + South Asian Name Database
 * Used for gender detection (sir/madam honorific)
 *
 * Categories: Muslim, Christian, Hindu, Sikh names common in Pakistan
 */

// ============= FEMALE NAMES (~600) =============
const FEMALE_NAMES = new Set([
  // === Pakistani Muslim Female — Common ===
  'fatima','sara','ayesha','aisha','farheen','sana','hira','amna','zainab','nadia',
  'kiran','sadia','bushra','rabia','mehwish','sidra','alina','maham','iqra','nimra',
  'areeba','maryam','kashaf','laiba','nida','rimsha','hina','komal','farah','rubina',
  'samina','nazia','tahira','saba','shazia','rashida','nasreen','asma','uzma','lubna',
  'fariha','zubaida','saima','shabana','razia','salma','naila','parveen','rukhsana',
  'bibi','begum','anum','sundas','maria','mariam','noor','sahar','tayyaba','hamna',
  'minahil','jannat','muskan','mehak','kinza','zoya','anaya','hoorain','dua','eman',
  'ifra','mahnoor','nawal','ramsha','tooba','urwa','wardah','yumna','zahra','zara',
  'shumaila','shaista','samreen','sumera','sumaira','noreen','fouzia','tanveer','tehmina',
  'riffat','sajida','shahida','naseem','ghazala','farida','zareena','shagufta','shabnam',
  'nagina','faiza','nafeesa','raheela','safia','sameera','sawera','tania','urooj','wajeeha',

  // === Pakistani Muslim Female — Extended ===
  'abida','afreen','afshan','afsheen','aimen','aiza','aleena','aleeza','alia','alishba',
  'alvina','amber','amara','ambreen','amreen','aneela','aneesa','aneeqa','aniqa','anjum',
  'anmol','arooj','aroosa','arwa','asifa','asmara','atia','ayat','ayeeza','azra',
  'bano','basma','benish','bilqees','bisma','dania','deeba','erum','ezza','faiqa',
  'fakhira','falak','faria','farwa','farzana','fauzia','fehmida','fiza','fozia','ghanwa',
  'gul','gulnar','gulshan','habiba','hafsa','hafsah','hadia','hajra','halima','haleema',
  'hamida','hania','haris','hasna','humaira','humera','husna','ibtisam','ilma','inaaya',
  'insha','irsa','isma','isra','jahanara','jamila','javeria','kainat','kalsoom','kanza',
  'kausar','khadija','khalida','khansa','khizra','kubra','laila','lareeb','latifa','madeeha',
  'maheen','maheera','mahira','maira','majida','malaika','maliha','malika','manaal','manha',
  'marwa','mawra','meena','mehreen','mehrunisa','mehtab','mishal','moona','mubeena','muneeba',
  'muniba','muqaddas','nabeeha','nabeela','nabiha','nabila','naeema','nafisa','naghmah',
  'naheeda','nahida','naima','najma','nargis','nasima','nausheen','nawab','nazish','neelam',
  'neha','nighat','nisha','nishat','nousheen','nudrat','nusrat','pakeeza','qamar','raabia',
  'raana','rabel','rahat','rahila','raisa','rakhshanda','rana','rashda','rauha','rida',
  'rifat','robina','romisa','roshni','rozeena','ruba','ruhi','ruqayya','saadia','sabeen',
  'sabiha','sabina','sabira','safiya','safoora','sahar','sahiba','sajal','sakeena','sakina',
  'samra','sania','saniya','sanam','saqiba','seema','seemab','shafia','shaheena','shahla',
  'shahnaz','shakeela','shameem','shamim','shamsa','shanza','shareefa','sharmeen','shazia',
  'sheeba','sheen','shereen','shehla','shehrbano','shifa','shireen','sobia','somia','sonia',
  'subhana','sughra','suha','sujata','sukaina','sultana','summaya','surayya','tabinda',
  'tahseen','talat','tatheer','tauba','tayyiba','tehreem','umama','umme','ummul','unsa',
  'waheeda','wajiha','warda','waseema','yasmeen','yasmin','yusra','zafreen','zahida','zahira',
  'zaib','zakia','zanib','zarqa','zehra','zimal','zinnia','zobaria','zoha','zunaira',
  'zunairah','zunaisha','zunnurain',

  // === Spelling Variations ===
  'aysha','aesha','aishah','aiysha','ameena','aminah','aqsa','arisha','aroush','barirah',
  'eshal','esma','fareeha','fatimah','fatma','fatemah','ghania','hadiqa','haniya','hareem',
  'harmain','haseen','hurain','huriya','husn','inaya','izza','jaweriya','khadijah','khadeeja',
  'kishwar','kulsum','maha','mahwish','manahil','minha','mirha','momina','nafeesah','nayab',
  'nazia','nazli','neelma','rahma','rahmah','saaliha','saaniya','saarah','sadaf','sehrish',
  'shumailla','syeda','tabassum','tahseen','taimia','ummaima','uroosa','yashfa','zeb','zeenat',

  // === Christian Female Names (Pakistani Christians) ===
  'angel','angela','anita','annie','carol','catherine','christina','daisy','diana','elizabeth',
  'esther','eva','florence','gloria','grace','helen','irene','janet','jennifer','jessica',
  'joan','josephine','julia','julie','karen','lily','linda','lisa','lucy','margaret',
  'martha','mary','monica','nancy','natasha','patricia','pauline','priscilla','rachel','rebecca',
  'rita','rosemary','ruth','sandra','sarah','sharon','stella','susan','sylvia','teresa',
  'theresa','veronica','victoria','virginia','alice','anna','bella','clara','dina','edith',
  'elaine','emma','fiona','gina','hannah','iris','ivy','jane','joyce','kate',
  'laura','leah','lena','marie','naomi','nina','olivia','pamela','queenie','rosa',
  'rosie','ruby','sadie','sophia','tina','ursula','vivian','wendy','zoe','saba',
  'shamim','shirin','shama','dolly','pinky','sunita','meena','sheela','neelam','rani',
  'parvati','savita','rekha','rupa','suman','sushma','seema','geeta',

  // === Hindu Female Names (Pakistani Hindus — Sindh/Thar) ===
  'anita','asha','deepa','devi','geeta','gita','indira','jyoti','kamla','kavita',
  'lata','laxmi','leela','madhu','mala','maya','meera','neelu','nirmala','padma',
  'pooja','poonam','priya','radha','rajni','rani','renu','ritu','sangeeta','sarla',
  'sarita','savitri','shakuntala','shanti','shobha','sita','sudha','sunita','sushila','tulsi',
  'uma','usha','vandana','vidya','vijaya','vinita','pushpa','durga','lachmi','parvati',
  'bhavna','chanda','darsha','ganga','hema','janki','krishna','lakshmi','mamta','naina',
  'prabha','rama','roshni','sapna','sharda','sneha','swati','tara','urmila','veena',
]);

// ============= MALE NAMES ENDING IN 'A' — Exceptions =============
// These would wrongly be flagged as female by the 'a' ending pattern
const MALE_NAMES_ENDING_A = new Set([
  // === Muslim Male — ending in 'a' ===
  'hamza','musa','moosa','isa','eisa','mustafa','huzaifa','hudhaifa','osama','usama',
  'talha','yahya','zakaria','zakariya','zakariyya','ata','raza','mirza','agha',
  'maulana','shifa','taha','haseeba','mujtaba','murtaza','rida','mujahida',
  'mustapha','kufa','safa','marwa','arfa','mushfiqua','uqba','muawiya','aqsa',
  'eesa','moosa','hazifa','isa','hudaifa','khuzaima','owaisa','usaama',
  'dua','jumma','baba','chacha','mela','abba','nana','dada','mama',
  'zia','reza','nawaza','fida','ghulama','liaqua','baqa','raja',

  // === Christian Male — ending in 'a' ===
  'joshua','ezra','luca','nicola','andrea','alpha','costa','korina',
  'elisha','mika','joshua','barnaaba','nova',

  // === Hindu Male — ending in 'a' ===
  'krishna','rama','shiva','indra','rudra','surya','arjuna','karna','yuva',
  'nakula','bhima','dharma','yoga','prana','raja','mahendra','narendra',
  'birla','varma','gupta','mehra','vohra','khanna','arora','mehra','verma',
  'mehta','sinha','mishra','taneja','batra','kalra','chawla','dua','handa',
]);

// ============= KNOWN MALE NAMES (~500) =============
// For accurate detection — if name is here, definitely "sir"
const MALE_NAMES = new Set([
  // === Pakistani Muslim Male — Common ===
  'ahmed','ahmad','ali','muhammad','mohammed','mohd','usman','umar','omar','hassan',
  'hussain','hasan','bilal','imran','kamran','faisal','nadeem','naveed','shahid','tariq',
  'khalid','rashid','arif','amir','aamir','asim','aasim','waqar','wasim','waseem',
  'danish','junaid','adil','adeel','fahad','fahd','farhan','irfan','kashif','majid',
  'nasir','naeem','qadir','qasim','rafiq','rauf','saad','saadat','sajid','saleem',
  'salman','sami','sameer','shafiq','shakeel','shoaib','sohail','tahir','talib','tanvir',
  'wajid','waleed','walid','yousuf','yusuf','zafar','zahid','zaheer','zain','zeeshan',
  'zohaib','aariz','aayan','abaan','abbas','abdur','abdullah','abid','afzal','ahsan',
  'ajmal','akbar','akram','amjad','anees','anique','ansar','aqeel','arshad','asad',
  'ashfaq','ashraf','atif','athar','awais','owais','ayaan','ayaz','azhar','aziz',
  'babar','basit','daniyal','ehsan','ejaz','faaiq','faraz','farid','farooq','fasih',
  'ghalib','ghani','habib','haider','hammad','hameed','haris','haroon','hashim','hasnain',
  'ikram','ilyas','imad','inaam','iqbal','ishaq','ismail','jabbar','jaffar','jameel',
  'javed','jawad','kabir','kamil','kareem','latif','luqman','maalik','maaz','maqsood',
  'masood','mazhar','mehmood','moazzam','mubarak','mudassar','mufti','muneeb','munir','murad',
  'murtaza','musab','musaddiq','mushahid','mustaqeem','muzaffar','muzammil','nabeel','nadir',
  'naseer','noman','nouman','pervaiz','pervez','qaiser','rameez','ramzan','rehan','riaz',
  'rizwan','rohail','saadiq','sabir','sadiq','safdar','sajjad','saqlain','sarfraz','sarwar',
  'shabbir','shadab','shafaat','shamim','sharjeel','shehzad','sikandar','sohaib','subhan',
  'sufyan','suleman','sultan','sumayr','syed','taaha','taimur','talat','tauqeer','tauseef',
  'toqeer','ubaid','umer','wali','yasin','yasir','younus','zubair','zulfiqar',
  'zolfeqar','zulfeqar','zulifqar','alam','aalam','ghulam','anwaar','ikhlaq','inam',

  // === Pakistani Muslim Male — Extended ===
  'aaban','aahil','aariz','aatif','abaan','abbad','abdaal','abdi','afaq','ahad',
  'akhtar','akif','aleem','amaan','aman','ammar','anaas','anas','anwar','areeb',
  'arham','arsalan','arsal','ashar','aswad','ayaan','azan','azaan','badr','baqir',
  'burhan','daanish','daud','dawud','fahim','fakhir','fareed','fayyaz','ghaffar','ghufran',
  'haafiz','hadeed','hafiz','hamdan','hanzala','harun','hayat','humaid','husnain','husain',
  'ibrahim','idrees','ihsan','ihtisham','imtiaz','inayat','intizar','irtaza','irtiza','israr',
  'izzat','jalal','jaleel','jamil','jawwad','jibreel','kaif','kaleem','kameel','khurram',
  'khursheed','laal','maarij','mahad','mahin','mahir','maimoon','maisam','mansoor','manzar',
  'manzoor','maroof','mashal','mehboob','mehran','mian','mikael','moeen','mohsin','muaz',
  'mudassir','mufeed','mughees','muhib','mujtaba','mukhtiar','mulazim','mumtaz','munawar',
  'murshid','musawwir','musheer','naail','naaji','nabhan','nafees','najeeb','najm','naqeeb',
  'naqi','nasrullah','nawaz','niaz','nizam','nooruddin','obaid','osaid','pasha','qayyum',
  'qutub','raees','rafay','rahim','rahmatullah','rais','rajab','rameez','rasheed','rauf',
  'rayyan','roshan','saahir','saajid','saarim','saboor','saeed','safeer','sahil','samad',
  'sarim','shaan','shahrukh','shakir','shameel','shariq','shayan','shehroz','sheraz','siddiq',
  'siraj','sohrab','sufiyan','taaha','tabish','taha','taqi','tarif','tayyab','tufail',
  'turab','ubayd','umair','usaid','uzair','wahab','wahaj','waheed','waqas','wisam',
  'yaqoob','yawar','zaeem','zafer','zayd','zia','zishan','zubair','zuhair',

  // === Christian Male Names (Pakistani Christians) ===
  'albert','alex','alfred','andrew','anthony','arthur','benjamin','brian','charles','christopher',
  'daniel','david','dennis','donald','edward','eric','francis','frank','frederick','george',
  'gerald','gregory','henry','howard','jack','james','jason','john','jonathan','joseph',
  'kenneth','kevin','lawrence','leonard','lewis','louis','mark','martin','matthew','michael',
  'nelson','nicholas','oscar','patrick','paul','peter','philip','raymond','richard','robert',
  'roger','ronald','samuel','simon','stephen','steven','thomas','timothy','victor','vincent',
  'william','wilson','clarence','clyde','cyril','dominic','edgar','edmund','ernest','eugene',
  'felix','gabriel','gordon','harold','herbert','hubert','isaac','ivan','jerome','joel',
  'julian','keith','kurt','lambert','leon','leslie','lloyd','marshall','maxwell','melvin',
  'mervin','noel','norman','oliver','owen','percy','ralph','rex','robin','roderick',
  'roy','rupert','russell','stanley','stuart','terrence','theodore','travis','trevor','vernon',
  'walter','warren','wayne','wesley','winston','yousaf','masih','patras','younas','barkat',
  'boota','saddiq','amanat','ashknaz','emmanuel','raphael','nathaniel',

  // === Hindu Male Names (Pakistani Hindus) ===
  'aakash','ajay','anil','anup','ashok','bharat','chandra','deepak','dinesh','ganesh',
  'gopal','hari','hemant','jagdish','kamal','kishore','lalit','mahesh','manoj','mohan',
  'mukesh','naresh','pankaj','pramod','rajesh','rakesh','ramesh','ravi','sachin','sanjay',
  'satish','shyam','sunil','suresh','vijay','vinod','vishal','yogesh','arun','baldev',
  'bhagwan','bishnu','devi','dharam','dilip','govind','gulshan','jagmohan','kailash','kundan',
  'lal','madan','nand','om','parkash','prem','pyare','rattan','rohan','sahdev',
  'shankar','sher','sohan','tek','trilok','varun','vikram','yash',
]);

module.exports = { FEMALE_NAMES, MALE_NAMES_ENDING_A, MALE_NAMES };
