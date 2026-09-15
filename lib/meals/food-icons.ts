/**
 * Maps the food names returned by the analyzer (free French text) to one of
 * a small set of drawable kinds, for the feeding animation (spec § 4.6).
 */
export const FOOD_KINDS = [
  "salad",
  "vegetables",
  "apple",
  "banana",
  "fruit",
  "bread",
  "pasta",
  "rice",
  "pizza",
  "burger",
  "fries",
  "sandwich",
  "meat",
  "chicken",
  "fish",
  "egg",
  "soup",
  "cheese",
  "yogurt",
  "cereal",
  "cake",
  "cookie",
  "chocolate",
  "candy",
  "icecream",
  "soda",
  "coffee",
  "plate",
] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];

const normalise = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae");

/** Ordered: the first matching rule wins, so specific words come before generic ones. */
const RULES: ReadonlyArray<[FoodKind, RegExp]> = [
  ["fries", /\bfrites?\b|potatoes?\s*frites|chips|french fries/],
  ["burger", /burger|hamburger|cheeseburger/],
  ["pizza", /pizza|calzone/],
  ["sandwich", /sandwich|panini|wrap|kebab|tacos?|burrito|croque|hot[- ]?dog|bagel|tartine/],
  ["icecream", /glace|sorbet|ice ?cream|esquimau|cornet/],
  ["chocolate", /chocolat|brownie|nutella|cacao/],
  ["candy", /bonbon|sucette|confiserie|guimauve|reglisse|caramel|candy|sweets?\b/],
  ["cookie", /cookie|biscuit|sable|galette|gaufre|crepe|pancake|madeleine|speculoos/],
  ["cake", /gateau|cake|tarte|patisserie|muffin|donut|beignet|croissant|pain au chocolat|brioche|viennoiserie|mousse|tiramisu|flan|eclair|macaron|dessert|cheesecake/],
  ["soda", /soda|cola|coca|limonade|jus\b|jus de|smoothie|boisson|sirop|energy|biere|vin\b|cocktail|the glace|ice ?tea/],
  ["coffee", /cafe|espresso|cappuccino|latte|the\b|infusion|chocolat chaud|cafe au lait/],
  ["yogurt", /yaourt|yogourt|fromage blanc|skyr|petit[- ]suisse|compote|creme dessert/],
  ["cheese", /fromage|cheddar|comte|camembert|emmental|mozzarella|parmesan|feta|chevre|brie|raclette|fondue|gruyere|roquefort|tofu/],
  ["egg", /\boeufs?\b|omelette|egg/],
  ["soup", /soupe|veloute|potage|bouillon|ramen|pho\b|chili|curry|dahl|dal\b|minestrone|gaspacho|ragout|blanquette|bourguignon|couscous|tajine|tagine/],
  ["fish", /poisson|saumon|thon|cabillaud|truite|sardine|maquereau|crevette|gambas|moule|huitre|calamar|fruits? de mer|sushi|maki|dorade|bar\b|colin|lieu\b|hareng|anchois|surimi|sole\b|merlu|lotte|homard|crabe|langoustine|saint-jacques|coquille/],
  ["chicken", /poulet|volaille|dinde|canard|chicken|nuggets?|cordon bleu|pintade|caille|escalope/],
  ["meat", /viande|boeuf|steak|porc|jambon|saucisse|saucisson|lardon|bacon|agneau|mouton|veau|charcuterie|merguez|chorizo|cotelette|entrecote|roti|brochette|kefta|boulette|hache|lapin|foie|pate\b|rillette|andouille|boudin|gigot|filet mignon|magret|bavette|carpaccio|tartare/],
  ["pasta", /pates?\b|spaghetti|penne|tagliatelle|lasagne|ravioli|gnocchi|nouilles?|macaroni|fusilli|linguine|noodles?|tortellini|cannelloni|farfalle|vermicelle|udon|soba/],
  ["rice", /\briz\b|risotto|paella|quinoa|boulgour|bulgur|semoule|lentille|pois chiche|haricots? (rouge|blanc|noir)|feves?|epeautre|orge|sarrasin|millet|legumineuse|poke/],
  ["bread", /\bpain\b|baguette|toast|biscotte|naan|pita|tortilla|focaccia|crouton|ciabatta|bun\b|pain de mie|pomme de terre|puree|patate|gratin|pommes? de terre|polenta|galette de/],
  ["cereal", /cereales?|muesli|granola|flocons? d'avoine|porridge|avoine|corn ?flakes|barre de cereales/],
  ["apple", /\bpommes?\b|poire/],
  ["banana", /banane|banana/],
  ["fruit", /fruit|orange|clementine|mandarine|fraise|framboise|myrtille|cerise|raisin|kiwi|mangue|ananas|peche|abricot|prune|melon|pasteque|citron|figue|grenade|nectarine|mure|cassis|groseille|litchi|papaye|fruit de la passion|avocat|dattes?|noix|amande|noisette|cacahuete|pistache/],
  ["salad", /salade|laitue|roquette|mache|mesclun|crudites?|coleslaw|taboule|epinards?|chou kale|kale|cresson|endive/],
  ["vegetables", /legume|tomate|carotte|brocoli|courgette|aubergine|poivron|haricots? verts?|petits? pois|chou|champignon|oignon|poireau|concombre|betterave|radis|asperge|artichaut|fenouil|celeri|navet|potiron|courge|butternut|patate douce|mais|edamame|ratatouille|wok|poelee|ail\b|persil|herbes?/],
];

/** Kind of drawing for one food name; `plate` when nothing matches. */
export function classifyFood(name: string): FoodKind {
  const n = normalise(name);
  for (const [kind, rule] of RULES) if (rule.test(n)) return kind;
  return "plate";
}

/**
 * Distinct kinds to draw for a meal, in the analyzer's order (the main
 * ingredients come first), at most `max`. An empty list gives one plate.
 */
export function foodKindsFor(foods: readonly string[], max = 3): FoodKind[] {
  const kinds: FoodKind[] = [];
  for (const food of foods) {
    const kind = classifyFood(food);
    if (!kinds.includes(kind)) kinds.push(kind);
    if (kinds.length >= max) break;
  }
  if (kinds.length === 0) kinds.push("plate");
  return kinds;
}

export const FOOD_KIND_LABELS: Record<FoodKind, string> = {
  salad: "salade",
  vegetables: "légumes",
  apple: "pomme",
  banana: "banane",
  fruit: "fruits",
  bread: "pain",
  pasta: "pâtes",
  rice: "riz",
  pizza: "pizza",
  burger: "burger",
  fries: "frites",
  sandwich: "sandwich",
  meat: "viande",
  chicken: "volaille",
  fish: "poisson",
  egg: "œuf",
  soup: "plat mijoté",
  cheese: "fromage",
  yogurt: "yaourt",
  cereal: "céréales",
  cake: "gâteau",
  cookie: "biscuit",
  chocolate: "chocolat",
  candy: "bonbon",
  icecream: "glace",
  soda: "boisson",
  coffee: "café",
  plate: "assiette",
};
