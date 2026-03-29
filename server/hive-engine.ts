import { db } from "./db";
import { hivePuzzles, hiveFoundWords } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const COMMON_WORDS = [
  "able","about","above","accept","account","acid","across","action","active","actual","added",
  "admit","adult","after","again","agent","agree","ahead","aide","alarm","album","alert",
  "alien","align","alive","allow","alone","along","alter","among","ample","angel","anger",
  "angle","angry","ankle","annex","apart","apple","apply","arena","argue","arise","armor",
  "array","aside","atlas","avoid","awake","award","aware","awful","baked","baker","banks",
  "baron","basic","basin","basis","batch","beach","beard","began","begin","being","below",
  "bench","berry","bible","bikes","birth","black","blade","blame","bland","blank","blast",
  "blaze","bleed","blend","bless","blind","blink","block","blown","blues","blunt","board",
  "boast","bonus","booth","bound","brain","brand","brave","bread","break","breed","brick",
  "bride","brief","bring","broad","broke","brown","brush","build","built","bunch","burns",
  "burst","cabin","cable","calls","candy","cards","cargo","carry","catch","cause","cedar",
  "chain","chair","chalk","champ","chaos","charm","chart","chase","cheap","check","cheek",
  "cheer","chess","chest","chief","child","china","chips","chose","chunk","circa","civil",
  "claim","clash","class","clean","clear","clerk","click","cliff","climb","cling","clock",
  "clone","close","cloth","cloud","coach","coast","color","comet","comic","coral","cores",
  "costs","couch","could","count","court","cover","crack","craft","crane","crash","crawl",
  "crazy","cream","crime","crisp","crops","cross","crowd","crown","crude","crush","curve",
  "cycle","daily","dance","dealt","death","debut","decay","decor","delay","delta","dense",
  "depot","depth","derby","desks","devil","diary","digit","dirty","disco","ditch","dodge",
  "doing","donor","doubt","dough","draft","drain","drama","drank","drawn","dream","dress",
  "dried","drift","drill","drink","drive","drums","drunk","dying","eager","eagle","early",
  "earth","eased","eaten","edges","eight","elder","elect","elite","email","empty","ended",
  "enemy","enjoy","enter","equal","equip","error","essay","event","every","exact","exams",
  "exile","extra","fable","faces","facts","fairy","faith","false","fancy","fatal","fault",
  "feast","fiber","field","fifth","fifty","fight","filed","films","final","finds","fired",
  "firms","first","fixed","flags","flame","flash","fleet","flesh","flies","climb","float",
  "flock","flood","floor","flour","fluid","flush","focal","focus","foggy","force","forge",
  "forms","forth","forum","found","frame","frank","fraud","freed","fresh","front","frost",
  "froze","fruit","fuels","fully","funds","fungi","gauge","ghost","giant","girls","given",
  "gives","gland","glass","globe","gloom","glory","gloss","glove","going","grace","grade",
  "grain","grand","grant","graph","grasp","grass","grave","great","green","greet","grief",
  "grill","grind","grips","gross","group","grown","grows","guard","guess","guest","guide",
  "guilt","habit","handy","happy","harsh","haven","heard","heart","heavy","heels","hence",
  "herbs","highs","hired","hobby","holds","holes","honor","hoped","hopes","horse","hosts",
  "hotel","hours","house","human","humor","hurry","icing","ideal","image","imply","inbox",
  "index","indie","infer","inner","input","intro","irony","issue","ivory","jewel","joint",
  "joker","judge","juice","jumps","keeps","kings","knack","kneel","knife","knock","known",
  "label","labor","lacks","lakes","lanes","large","laser","later","laugh","layer","leads",
  "learn","least","leave","legal","lemon","level","lever","light","liked","likes","linen",
  "liner","lines","links","lions","lists","lived","liver","lives","loads","loans","local",
  "lodge","logic","lofty","login","looks","loops","loose","lords","lover","lower","loyal",
  "lucky","lunch","lying","macro","magic","major","maker","manga","manor","maple","march",
  "marks","marsh","masks","match","mayor","meals","media","melon","merge","merit","merry",
  "metal","meter","might","mills","minds","mines","minor","minus","mixed","model","modem",
  "money","month","moral","mount","mouth","moved","movie","music","myths","naive","named",
  "nerve","never","newly","night","noble","nodes","noise","norms","north","noted","notes",
  "novel","nurse","occur","ocean","offer","often","olive","onset","opens","opera","orbit",
  "order","organ","other","ought","outer","owned","owner","oxide","paced","packs","paint",
  "pairs","panel","panic","pants","paper","parks","parts","party","pasta","paste","patch",
  "paths","pause","peace","peach","pearl","penny","phase","phone","photo","piano","picks",
  "piece","pilot","pitch","pixel","pizza","place","plain","plane","plans","plant","plate",
  "plays","plaza","plead","pleas","plots","pluck","plumb","plums","plush","poems","poets",
  "point","poker","polls","pools","porch","ports","posed","pound","power","press","price",
  "pride","prime","print","prior","prize","probe","prone","proof","proud","prove","psalm",
  "pulls","pulse","pumps","punch","pupil","purse","queen","query","quest","queue","quick",
  "quiet","quota","quote","radar","radio","raids","rails","rains","raise","rally","ranch",
  "range","ranks","rapid","ratio","reach","reads","ready","realm","rebel","refer","reign",
  "relax","relay","renew","reply","resin","rider","rifle","right","rigid","rings","risen",
  "risks","risky","rival","river","roads","robot","rocks","rocky","roles","roman","rooms",
  "roots","ropes","roses","rough","round","route","royal","rugby","ruins","ruled","ruler",
  "rules","rural","sadly","safer","saint","salad","sales","sauce","saved","scale","scene",
  "scent","scope","score","scout","seeds","seize","sense","serve","seven","shade","shaft",
  "shake","shall","shame","shape","share","shark","sharp","sheep","sheer","sheet","shelf",
  "shell","shift","shiny","shirt","shock","shoes","shore","short","shown","sight","sigma",
  "signs","silly","since","sixth","sized","skill","skull","slate","sleep","slice","slide",
  "slope","slots","smart","smell","smile","smoke","snack","snake","solar","solid","solve",
  "sonic","sorry","souls","sound","south","space","spare","spark","speak","speed","spell",
  "spend","spent","spice","spine","spoke","sport","spots","spray","squad","stack","staff",
  "stage","stain","stake","stale","stalk","stamp","stand","stare","stark","stars","start",
  "state","stays","steal","steam","steel","steep","steer","stems","steps","stern","stick",
  "stiff","still","stock","stole","stone","stood","stops","store","storm","story","stove",
  "strip","stuck","stuff","style","sugar","suite","sunny","super","surge","swamp","swear",
  "sweep","sweet","swept","swift","swing","sword","table","tales","tanks","tapes","taste",
  "teach","teams","tears","tempo","tends","terms","tests","texts","theft","theme","thick",
  "thief","thing","think","third","those","three","threw","throw","thumb","tidal","tiger",
  "tight","tiles","timer","times","tired","title","toast","token","tools","tooth","topic",
  "torch","total","touch","tough","tours","tower","towns","trace","track","trade","trail",
  "train","trait","trans","traps","trash","treat","trees","trend","trial","tribe","trick",
  "tried","tries","trips","troop","truck","truly","trump","trunk","trust","truth","tubes",
  "tumor","tunes","turns","tutor","twice","twist","ultra","uncle","under","unify","union",
  "unite","unity","until","upper","upset","urban","usage","usual","valid","value","valve",
  "vault","venue","verse","vigor","viral","virus","visit","vital","vivid","vocal","voice",
  "voter","wages","walks","walls","waste","watch","water","waves","wheat","wheel","where",
  "which","while","white","whole","whose","wider","widow","width","wings","witch","woman",
  "women","woods","words","works","world","worry","worse","worst","worth","would","wound",
  "wrath","write","wrong","wrote","yacht","yards","years","yield","young","yours","youth",
  "zones","abide","afire","agile","aging","align","allow","alloy","aloft","amaze","amend",
  "ample","anger","anime","annoy","antic","anvil","aorta","attic","audio","audit","avian",
  "bacon","badge","bagel","barge","bathe","beads","beams","beans","bears","beats","beech",
  "bells","belts","berth","bikes","bills","birch","birds","blade","bloom","blown","bluff",
  "blunt","boats","bolts","bonds","bones","books","boost","bored","bowls","brace","brain",
  "brand","brass","bravo","brawl","bream","bride","brine","brink","brisk","broil","brood",
  "brook","broom","broth","brows","budge","bulge","bulky","bully","bumps","bunch","bunny",
  "buyer","cable","calms","camps","canes","carat","cards","cargo","carol","caves","cedar",
  "cells","cents","chafe","chair","chalk","chant","charm","check","cheer","chime","chirp",
  "choir","choke","chord","chunk","cider","cigar","cinch","cited","clamp","clang","clank",
  "claps","clash","clasp","claw","clean","cliff","climb","cling","cloak","clone","cloth",
  "clown","clubs","clues","clung","coach","coals","coast","cobra","coded","coils","coins",
  "comic","comet","coral","cords","corns","costs","couch","could","count","court","cover",
  "crack","crane","craps","crash","crawl","craze","crazy","creek","crews","crisp","cross",
  "crowd","crown","crush","curbs","curve","cycle","darts","deals","decay","decks","decoy",
  "decor","decoy","defer","deity","delay","delve","demon","denim","depot","derby","desks",
  "deter","devil","diary","digit","dimly","diner","disco","ditch","dizzy","dodge","doing",
  "dolls","donor","doors","doubt","dough","downs","dozen","draft","drain","drape","drawl",
  "dream","dried","drift","drill","drink","drive","droit","drone","drool","drops","drugs",
  "drums","drunk","dryer","dryly","duels","dulls","dumps","dunce","dunes","duped","dusty",
  "dwarf","dwell","dying","eager","earns","earth","eased","easel","eaten","eaves","edges",
  "edict","eight","elbow","elder","elect","email","ember","empty","ended","enemy","enjoy",
  "enter","equal","equip","erase","erode","error","essay","ethic","evade","event","every",
  "exile","exits","extra","exude","fable","faced","facts","faded","fails","faint","fairy",
  "faith","falls","false","fancy","fangs","farms","fatal","favor","feast","feats","fence",
  "fends","ferry","fetch","fever","fiber","field","fiend","fifty","fight","filed","films",
  "final","finds","fined","finer","fires","firms","first","flame","flank","flaps","flare",
  "flash","flask","flats","flair","flaws","flesh","flick","flies","fling","flint","float",
  "flock","flood","flora","flour","flows","fluid","fluke","flung","flunk","flush","flute",
  "focal","focus","foggy","foils","folds","folly","fonts","force","forge","forms","forth",
  "forty","forum","found","foxes","foyer","frail","frame","frank","fraud","freak","freed",
  "fresh","friar","fried","frisk","front","frost","froze","frugal","fruit","fuels","fully",
  "funds","funky","funny","fuzzy","gains","gamma","gangs","gases","gauge","gavel","gazer",
  "gears","genes","ghost","giant","gifts","girls","given","gives","gland","glare","glass",
  "glaze","gleam","glide","globe","gloom","glory","gloss","glove","glyph","gnome","goals",
  "going","golem","gorge","grace","grade","grain","grand","grant","grape","graph","grasp",
  "grass","grate","grave","graze","great","greed","green","greet","grief","grill","grime",
  "grind","gripe","grips","groan","groom","grope","gross","group","grove","growl","grown",
  "gruel","gruff","grunt","guard","guava","guess","guest","guide","guild","guilt","guise",
  "gulch","gulls","gummy","gusts","gusty","habit","haiku","hairs","halls","halve","hands",
  "handy","hangs","happy","hardy","harem","harps","harsh","haste","hasty","hatch","haven",
  "hazel","heads","heals","heard","heart","heave","heavy","hedge","heels","heist","hello",
  "hence","herbs","herds","herbs","highs","hikes","hills","hilly","hinge","hints","hired",
  "hitch","hobby","holds","holes","holly","homes","honey","honor","hoods","hooks","hoped",
  "hopes","horns","horse","hosts","hotel","hound","hours","house","hover","human","humid",
  "humor","humps","hurry","hurts","hyena","icing","ideal","idiom","idiot","image","imply",
  "incur","index","indie","inept","infer","ingle","inlet","inner","input","inter","intro",
  "irony","issue","ivory","jacks","jaunts","jelly","jerky","jewel","joker","jolly","joust",
  "judge","juice","juicy","jumbo","jumps","juror","keeps","kicks","kills","kinds","kings",
  "knack","knead","kneel","knelt","knife","knobs","knock","knots","known","knows","label",
  "labor","laced","lacks","laden","lakes","lambs","lamps","lance","lands","lanes","lapse",
  "large","laser","latch","later","laugh","layer","leads","leaks","leapt","learn","lease",
  "least","leave","ledge","legal","lemon","lever","light","liked","likes","lilac","limbs",
  "limit","linen","liner","lines","links","lions","lists","liter","lived","liven","liver",
  "lives","loads","loafs","loams","loans","lobby","local","locks","lodge","lofty","logic",
  "looks","looms","loops","loose","lords","lorry","losers","loved","lover","lower","loyal",
  "lucky","lumps","lunch","lured","lying","lyric","magic","major","maker","males","malls",
  "manga","manor","maple","march","marks","marsh","masks","match","mates","mayor","meals",
  "means","media","melon","melts","memos","menus","mercy","merge","merit","merry","metal",
  "meter","micro","might","mills","mince","minds","mines","minor","minus","mirth","miser",
  "misty","mixed","mixer","moans","model","moist","molds","money","monks","month","moods",
  "moral","motel","moths","motor","mound","mount","mourn","mouse","mouth","moved","mover",
  "moves","movie","mulch","mules","mural","music","myths","nails","naive","named","names",
  "nanny","naval","necks","nerve","never","newly","niche","night","noble","nodes","noise",
  "norms","north","notch","noted","notes","novel","nudge","nurse","nutty","nylon","oasis",
  "occur","ocean","offer","often","olive","onset","opens","opera","orbit","order","organ",
  "other","ought","ounce","outer","owned","owner","oxide","ozone","paced","packs","pages",
  "pains","paint","pairs","palms","panda","panel","panic","pants","paper","parks","parts",
  "party","pasta","paste","patch","paths","patio","pause","paved","paver","peace","peach",
  "peaks","pearl","pedal","penny","perch","perks","petty","phase","phone","photo","piano",
  "picks","piece","pilot","pinch","pines","pitch","pixel","pizza","place","plaid","plain",
  "plane","plans","plant","plate","plays","plaza","plead","pleas","pleat","plied","plods",
  "plots","plows","pluck","plugs","plumb","plume","plums","plump","plums","plush","pluto",
  "poems","poets","point","poise","poker","polar","polls","ponds","pools","porch","pores",
  "ports","posed","poses","posts","pouch","pound","pours","power","prank","prawn","prays",
  "press","price","pride","prime","print","prior","prism","prize","probe","prone","proof",
  "prose","proud","prove","proxy","prune","psalm","pulls","pulse","pumps","punch","pupil",
  "purge","purse","quake","qualm","quart","queen","query","quest","queue","quick","quiet",
  "quilt","quirk","quota","quote","radar","radio","raids","rails","rains","raise","rally",
  "ranch","range","ranks","rapid","ratio","raven","reach","react","reads","ready","realm",
  "reaps","rebel","recap","refer","reign","relax","relay","relic","remit","renew","reply",
  "resin","rider","ridge","rifle","right","rigid","riled","rings","rinse","risen","risks",
  "risky","ritzy","rival","river","rivet","roads","roams","roars","roast","robes","robot",
  "rocks","rocky","rogue","roles","rolls","roman","rooms","roots","ropes","roses","rough",
  "round","route","rover","royal","rugby","ruins","ruled","ruler","rules","rumor","rural",
  "sadly","safer","sails","saint","salad","sales","salts","sands","sandy","satin","sauce",
  "saved","savor","scale","scald","scalp","scams","scant","scare","scarf","scene","scent",
  "scope","score","scout","scram","scrap","seams","seats","seeds","seize","sense","serve",
  "seven","sever","shade","shaft","shake","shall","shame","shape","share","shark","sharp",
  "shave","shawl","sheds","sheen","sheep","sheer","sheet","shelf","shell","shift","shims",
  "shine","shiny","ships","shirt","shock","shoes","shone","shook","shore","short","shots",
  "shout","shown","shows","shred","shrub","shrug","shunt","sieve","sight","sigma","signs",
  "silly","since","sixth","sixty","sized","sizes","skate","skill","skull","slabs","slack",
  "slain","slang","slant","slash","slate","slave","sleep","sleet","slept","slice","slide",
  "slime","sling","slope","slots","slows","slung","slunk","smart","smash","smell","smile",
  "smith","smoke","snack","snags","snail","snake","snaps","snare","snarl","sneak","snore",
  "solar","solemn","solid","solve","sonic","sorry","souls","sound","south","space","spade",
  "spare","spark","spawn","speak","spear","speed","spell","spend","spent","spice","spied",
  "spike","spill","spine","spoke","spoon","sport","spots","spray","squid","squad","stack",
  "staff","stage","stain","stair","stake","stale","stalk","stall","stamp","stand","stare",
  "stark","stars","start","stash","state","stays","steak","steal","steam","steel","steep",
  "steer","stems","steps","stern","stick","stiff","still","sting","stint","stock","stoic",
  "stoke","stole","stone","stood","stool","stoop","stops","store","stork","storm","story",
  "stout","stove","stray","strip","strut","stuck","study","stuff","stump","stung","stunk",
  "style","sugar","suits","suite","sulky","sunny","super","surge","sushi","swamp","swaps",
  "swarm","swear","sweat","sweep","sweet","swept","swift","swing","swirl","sword","swore",
  "sworn","swung","syrup","table","tacit","tails","taken","tales","talks","tanks","tapes",
  "tardy","taste","taunt","teach","teams","tears","teeth","tempo","tends","tenor","tense",
  "tenth","terms","tests","texts","thank","theft","theme","thick","thief","thigh","thing",
  "think","third","thorn","those","three","threw","throw","thump","tidal","tides","tiger",
  "tight","tiles","timer","times","timid","tints","tired","title","toast","today","token",
  "tolls","tonic","tools","tooth","topic","torch","total","touch","tough","tours","tower",
  "towns","toxic","trace","track","trade","trail","train","trait","tramp","traps","trash",
  "treat","trees","trend","trial","tribe","trick","tried","tries","trims","trips","trite",
  "troll","troop","trout","truck","truly","trump","trunk","trust","truth","tubes","tulip",
  "tumor","tunes","turns","tutor","tweed","twice","twins","twist","typed","types","ultra",
  "uncle","under","undue","unfit","unify","union","unite","unity","until","upper","upset",
  "urban","urged","usage","usher","usual","utter","vague","valid","value","valve","vault",
  "veins","venue","verge","verse","vigor","vines","vinyl","viral","virus","visit","visor",
  "visit","vital","vivid","vocal","vodka","voice","voila","voter","vouch","vowed","vowel",
  "wages","wagon","waist","walks","walls","waltz","wands","wants","wards","warns","waste",
  "watch","water","watts","waves","waver","waxed","weary","weave","weeds","weigh","weird",
  "wells","whale","wheat","wheel","where","which","while","whims","whine","whirl","white",
  "whole","whose","wider","widen","width","wield","winds","wines","wings","wires","witch",
  "woman","women","woods","words","works","world","worms","worry","worse","worst","worth",
  "would","wound","wrath","wreck","wring","write","wrong","wrote","yacht","yards","yearn",
  "years","yeast","yield","young","yours","youth","zones",
];

const BAKERY_WORDS = [
  "bake","baked","baker","batch","blend","bread","broil","broth","brown","burns",
  "candy","churn","cider","cocoa","cream","crest","crisp","crush","crust","dairy",
  "decor","dough","feast","fiber","fills","flair","flaky","flour","froze","fruit",
  "fudge","glaze","grain","grind","herbs","honey","icing","knead","layer","leaven",
  "lemon","loafs","maple","meals","melon","milks","mince","mixer","molds","mocha",
  "moist","nutty","ovals","ovens","paste","peach","pearl","pecan","petal","pound",
  "press","proof","prune","pulse","punch","purge","raise","rinse","rolls","roast",
  "salts","sauce","scald","scalp","scone","seeds","shape","shelf","slice","slime",
  "smoke","snack","spice","spoon","steam","steep","stove","sugar","suite","sweet",
  "syrup","taste","tarts","timer","toast","tongs","torte","treat","trims","twist",
  "wafer","wheat","whisk","yeast","yield","zests",
  "cafe","cake","chip","chop","cook","corn","cups","date","dice","dish",
  "eggs","feed","fill","fold","fork","flan","form","heat","herb","ice",
  "ices","jams","lard","lime","loaf","malt","meal","melt","milk","mint",
  "miso","mold","oats","oils","oven","pans","pear","peel","pies","plum",
  "pour","rind","rise","sage","salt","sift","soda","stem","stew","tart",
  "thaw","tofu","tray","trim","turn","vine","warm","wort","wrap","zest",
];

function getAllWords(): string[] {
  const set = new Set<string>();
  for (const w of COMMON_WORDS) {
    const cleaned = w.toLowerCase().trim();
    if (cleaned.length >= 4 && /^[a-z]+$/.test(cleaned)) set.add(cleaned);
  }
  for (const w of BAKERY_WORDS) {
    const cleaned = w.toLowerCase().trim();
    if (cleaned.length >= 4 && /^[a-z]+$/.test(cleaned)) set.add(cleaned);
  }
  return Array.from(set);
}

function getUniqueLetters(word: string): Set<string> {
  return new Set(word.split(""));
}

function isPangram(word: string, allLetters: Set<string>): boolean {
  const wLetters = getUniqueLetters(word);
  for (const l of allLetters) {
    if (!wLetters.has(l)) return false;
  }
  return true;
}

function scoreWord(word: string, allLetters: Set<string>): number {
  if (word.length === 4) return 1;
  let pts = word.length;
  if (isPangram(word, allLetters)) pts += 7;
  return pts;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function generatePuzzle(dateStr: string): {
  centerLetter: string;
  outerLetters: string[];
  validWords: string[];
  pangrams: string[];
  maxScore: number;
} {
  const seed = dateStr.split("-").map(Number).reduce((a, b) => a * 31 + b, 0);
  const rng = seededRandom(seed);
  const allWords = getAllWords();

  const pangramCandidates = allWords.filter(w => getUniqueLetters(w).size === 7);

  if (pangramCandidates.length === 0) {
    throw new Error("No pangram candidates in word list");
  }

  const shuffled = [...pangramCandidates].sort(() => rng() - 0.5);
  let bestPangram = shuffled[0];
  let bestValid: string[] = [];
  let bestLetterSet = new Set<string>();

  for (let attempt = 0; attempt < Math.min(shuffled.length, 50); attempt++) {
    const pg = shuffled[attempt];
    const letters = getUniqueLetters(pg);
    const letterArr = Array.from(letters);

    const centerIdx = Math.floor(rng() * letterArr.length);
    const center = letterArr[centerIdx];

    const valid = allWords.filter(w => {
      if (!w.includes(center)) return false;
      for (const ch of w) {
        if (!letters.has(ch)) return false;
      }
      return true;
    });

    if (valid.length > bestValid.length && valid.length >= 15) {
      bestPangram = pg;
      bestValid = valid;
      bestLetterSet = letters;
      if (valid.length >= 25) break;
    }
  }

  const letterArr = Array.from(bestLetterSet);
  const centerIdx = Math.floor(rng() * letterArr.length);
  const center = letterArr[centerIdx];
  const outer = letterArr.filter((_, i) => i !== centerIdx).sort(() => rng() - 0.5);

  const validWords = allWords.filter(w => {
    if (!w.includes(center)) return false;
    for (const ch of w) {
      if (!bestLetterSet.has(ch)) return false;
    }
    return true;
  });

  const pangrams = validWords.filter(w => isPangram(w, bestLetterSet));

  let maxScore = 0;
  for (const w of validWords) {
    maxScore += scoreWord(w, bestLetterSet);
  }

  return {
    centerLetter: center,
    outerLetters: outer,
    validWords,
    pangrams,
    maxScore,
  };
}

export async function getOrCreateTodayPuzzle(): Promise<{
  puzzle: typeof hivePuzzles.$inferSelect;
  isNew: boolean;
}> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const [existing] = await db.select().from(hivePuzzles).where(eq(hivePuzzles.date, today));
  if (existing) return { puzzle: existing, isNew: false };

  const generated = generatePuzzle(today);

  const [created] = await db.insert(hivePuzzles).values({
    date: today,
    centerLetter: generated.centerLetter,
    outerLetters: generated.outerLetters,
    validWords: generated.validWords,
    pangrams: generated.pangrams,
    maxScore: generated.maxScore,
  }).returning();

  return { puzzle: created, isNew: true };
}

export async function submitWord(
  puzzleId: number,
  userId: string,
  userName: string,
  word: string
): Promise<{ success: boolean; points: number; isPangram: boolean; message: string; alreadyFound?: boolean }> {
  const [puzzle] = await db.select().from(hivePuzzles).where(eq(hivePuzzles.id, puzzleId));
  if (!puzzle) return { success: false, points: 0, isPangram: false, message: "Puzzle not found" };

  const w = word.toLowerCase().trim();

  if (w.length < 4) return { success: false, points: 0, isPangram: false, message: "Too short — need at least 4 letters" };
  if (!w.includes(puzzle.centerLetter)) return { success: false, points: 0, isPangram: false, message: `Must include center letter "${puzzle.centerLetter.toUpperCase()}"` };

  const allLetters = new Set([puzzle.centerLetter, ...puzzle.outerLetters]);
  for (const ch of w) {
    if (!allLetters.has(ch)) return { success: false, points: 0, isPangram: false, message: `Letter "${ch.toUpperCase()}" is not in today's hive` };
  }

  if (!puzzle.validWords.includes(w)) return { success: false, points: 0, isPangram: false, message: "Not in word list" };

  const [alreadyByAnyone] = await db.select().from(hiveFoundWords).where(
    and(eq(hiveFoundWords.puzzleId, puzzleId), eq(hiveFoundWords.word, w))
  );

  if (alreadyByAnyone) {
    if (alreadyByAnyone.userId === userId) {
      return { success: false, points: 0, isPangram: false, message: "You already found this word", alreadyFound: true };
    }
    return { success: false, points: 0, isPangram: false, message: `Already found by ${alreadyByAnyone.userName}`, alreadyFound: true };
  }

  const pg = puzzle.pangrams.includes(w);
  const pts = scoreWord(w, allLetters);

  await db.insert(hiveFoundWords).values({
    puzzleId,
    userId,
    userName,
    word: w,
    points: pts,
    isPangram: pg,
  });

  return { success: true, points: pts, isPangram: pg, message: pg ? "PANGRAM! 🐝" : `+${pts} point${pts > 1 ? "s" : ""}` };
}

export async function getLeaderboard(puzzleId: number): Promise<{
  userId: string;
  userName: string;
  totalPoints: number;
  wordCount: number;
  pangramCount: number;
}[]> {
  const words = await db.select().from(hiveFoundWords).where(eq(hiveFoundWords.puzzleId, puzzleId));

  const map = new Map<string, { userName: string; totalPoints: number; wordCount: number; pangramCount: number }>();

  for (const w of words) {
    const entry = map.get(w.userId) || { userName: w.userName, totalPoints: 0, wordCount: 0, pangramCount: 0 };
    entry.totalPoints += w.points;
    entry.wordCount += 1;
    if (w.isPangram) entry.pangramCount += 1;
    map.set(w.userId, entry);
  }

  return Array.from(map.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

export function getRankTitle(score: number, maxScore: number): string {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  if (pct >= 100) return "Queen Bee 👑";
  if (pct >= 70) return "Genius";
  if (pct >= 50) return "Amazing";
  if (pct >= 40) return "Great";
  if (pct >= 25) return "Nice";
  if (pct >= 15) return "Solid";
  if (pct >= 8) return "Good";
  if (pct >= 2) return "Beginner";
  return "New Bee";
}
