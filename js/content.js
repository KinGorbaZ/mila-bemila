// Stages, opponents and interface text in both languages.

export const STAGES = 24;
export const PER_TIER = 6;

export const stage = i => ({
  index: i,
  tier: Math.floor(i / PER_TIER),
  skill: 0.22 + 0.78 * Math.pow(i / (STAGES - 1), 0.9),
  bag: i < 6 ? 60 : i < 12 ? 80 : 100,
  hints: i < 6 ? 5 : i < 12 ? 4 : 3,
});

export const starsFor = margin => margin <= 0 ? 0 : margin >= 90 ? 3 : margin >= 40 ? 2 : 1;

const he = {
  dir: 'rtl',
  title: 'מילה במילה',
  tagline: 'משחק מילים מול יריבים שהולכים ומתחזקים',
  switchTo: 'Français',
  tiers: [
    ['השכונה', 'משחק קצר מול יריבים נינוחים'],
    ['בית הקפה', 'משחק בינוני, היריבים כבר מכירים מילים'],
    ['הספרייה', 'משחק מלא מול קוראים ותיקים'],
    ['האקדמיה', 'משחק מלא מול מי שלא מפספס מילה'],
  ],
  opponents: ['נועה', 'יוסי', 'תמר', 'דני', 'מיכל', 'אבי', 'רונית', 'שאול', 'יעל', 'גדי', 'אורנה', 'עמוס',
    'דבורה', 'אליעזר', 'חנה', 'נתן', 'רחל', 'צבי', 'פנינה', 'ברוך', 'עדה', 'שמואל', 'המילונאית', 'נשיא האקדמיה'],
  resume: n => `להמשיך את המשחק בשלב ${n}`,
  locked: 'ננעל עד ניצחון בשלב הקודם',
  you: 'את',
  bag: n => `${n} אותיות בשקית`,
  play: 'הנחה', playScore: s => `הנחה, ${s} נק׳`,
  recall: 'החזרה', shuffle: 'ערבוב', swap: 'החלפה', pass: 'דילוג', hint: n => `רמז (${n})`,
  back: 'חזרה לשלבים',
  yourTurn: 'תורך. הניחי אותיות על הלוח',
  thinking: name => `${name} חושב/ת…`,
  played: (name, words, s) => `${name}: ${words}, ${s} נק׳`,
  youPlayed: (words, s) => `${words}, ${s} נק׳`,
  passed: name => `${name} דילג/ה על התור`,
  swapped: name => `${name} החליף/ה אותיות`,
  err: {
    empty: 'הניחי אותיות על הלוח לפני ההנחה',
    line: 'האותיות צריכות להיות בשורה אחת או בטור אחד',
    gap: 'יש רווח בין האותיות',
    center: 'המילה הראשונה עוברת דרך הכוכב שבמרכז',
    connect: 'המילה צריכה לגעת באות שכבר על הלוח',
    short: 'מילה צריכה לפחות שתי אותיות',
    word: w => `${w} לא במילון`,
    occupied: 'המשבצת תפוסה',
  },
  noHints: 'לא נשארו רמזים במשחק הזה',
  noMove: 'לא נמצאה מילה אפשרית. אפשר להחליף אותיות או לדלג',
  swapTitle: 'אילו אותיות להחליף?', swapDo: 'החלפה', cancel: 'ביטול',
  swapFew: 'נשארו פחות מ-7 אותיות בשקית, אי אפשר להחליף',
  jokerTitle: 'איזו אות יהיה הג׳וקר?',
  passAsk: 'לדלג על התור?', passDo: 'דילוג',
  quitAsk: 'המשחק נשמר. אפשר לחזור אליו מרשימת השלבים.',
  win: 'ניצחת!', lose: 'הפעם לא', tie: 'תיקו',
  finalScore: (a, name, b) => `את ${a}, ${name} ${b}`,
  next: 'לשלב הבא', again: 'לשחק שוב', toStages: 'לרשימת השלבים',
  close: 'סגירה', wordsBtn: 'מילים', wordsTitle: 'המילים במשחק', lookup: 'פירוש המילה',
  loading: 'טוען את המילון…',
  bonus: ['', 'אות ×2', 'אות ×3', 'מילה ×2', 'מילה ×3'],
  bonusShort: ['', 'א2', 'א3', 'מ2', 'מ3'],
  credits: 'מילון עברי: פרויקט Hspell (רישיון AGPL). מילון צרפתי: an-array-of-french-words (MIT).',
  lookupUrl: w => `https://he.wiktionary.org/w/index.php?search=${encodeURIComponent(w)}`,
};

const fr = {
  dir: 'ltr',
  title: 'MOT A MOT',
  tagline: 'Un jeu de lettres contre des adversaires de plus en plus forts',
  switchTo: 'עברית',
  tiers: [
    ['Le quartier', 'Partie courte, adversaires détendus'],
    ['Le café', 'Partie moyenne, ils connaissent déjà leurs mots'],
    ['La bibliothèque', 'Partie complète contre de grands lecteurs'],
    ['L’Académie', 'Partie complète, aucun mot ne leur échappe'],
  ],
  opponents: ['Léa', 'Hugo', 'Camille', 'Jules', 'Manon', 'Louis', 'Chloé', 'Antoine', 'Inès', 'Théo', 'Margaux', 'Émile',
    'Colette', 'Marcel', 'Simone', 'Victor', 'Marguerite', 'Gustave', 'Françoise', 'Honoré', 'George', 'Alexandre', 'La Lexicographe', 'L’Académicien'],
  resume: n => `Reprendre la partie du niveau ${n}`,
  locked: 'Se débloque en gagnant le niveau précédent',
  you: 'Vous',
  bag: n => `${n} lettres dans le sac`,
  play: 'Jouer', playScore: s => `Jouer, ${s} pts`,
  recall: 'Reprendre', shuffle: 'Mélanger', swap: 'Échanger', pass: 'Passer', hint: n => `Indice (${n})`,
  back: 'Retour aux niveaux',
  yourTurn: 'À vous. Posez des lettres sur le plateau',
  thinking: name => `${name} réfléchit…`,
  played: (name, words, s) => `${name} : ${words}, ${s} pts`,
  youPlayed: (words, s) => `${words}, ${s} pts`,
  passed: name => `${name} passe son tour`,
  swapped: name => `${name} échange des lettres`,
  err: {
    empty: 'Posez des lettres sur le plateau avant de jouer',
    line: 'Les lettres doivent être sur une seule ligne ou colonne',
    gap: 'Il y a un trou entre les lettres',
    center: 'Le premier mot passe par l’étoile au centre',
    connect: 'Le mot doit toucher une lettre déjà posée',
    short: 'Un mot compte au moins deux lettres',
    word: w => `${w} n’est pas dans le dictionnaire`,
    occupied: 'Cette case est prise',
  },
  noHints: 'Plus d’indices pour cette partie',
  noMove: 'Aucun mot possible. Échangez des lettres ou passez',
  swapTitle: 'Quelles lettres échanger ?', swapDo: 'Échanger', cancel: 'Annuler',
  swapFew: 'Moins de 7 lettres dans le sac, échange impossible',
  jokerTitle: 'Quelle lettre pour le joker ?',
  passAsk: 'Passer votre tour ?', passDo: 'Passer',
  quitAsk: 'La partie est enregistrée. Vous la retrouverez dans la liste des niveaux.',
  win: 'Gagné !', lose: 'Pas cette fois', tie: 'Égalité',
  finalScore: (a, name, b) => `Vous ${a}, ${name} ${b}`,
  next: 'Niveau suivant', again: 'Rejouer', toStages: 'Liste des niveaux',
  close: 'Fermer', wordsBtn: 'Mots', wordsTitle: 'Les mots de la partie', lookup: 'Définition',
  loading: 'Chargement du dictionnaire…',
  bonus: ['', 'Lettre ×2', 'Lettre ×3', 'Mot ×2', 'Mot ×3'],
  bonusShort: ['', 'L2', 'L3', 'M2', 'M3'],
  credits: 'Dictionnaire hébreu : projet Hspell (licence AGPL). Dictionnaire français : an-array-of-french-words (MIT).',
  lookupUrl: w => `https://fr.wiktionary.org/w/index.php?search=${encodeURIComponent(w.toLowerCase())}`,
};

export const TEXT = { he, fr };

// Hebrew tiles carry no final forms; restore them when a word is shown as text.
const FINALS = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };
export const pretty = (lang, w) =>
  lang === 'he' && FINALS[w[w.length - 1]] ? w.slice(0, -1) + FINALS[w[w.length - 1]] : w;
