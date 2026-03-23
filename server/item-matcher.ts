import type { InventoryItem } from "@shared/schema";

type MatchResult = {
  item: InventoryItem;
  confidence: number;
  method: string;
};

const NOISE_WORDS = new Set([
  "the", "a", "an", "of", "for", "and", "or", "in", "with", "to",
  "non", "aop", "ao", "no", "na", "n/a", "per", "each", "case",
  "cs", "ea", "bx", "bg", "pk", "dz", "lb", "oz", "gal", "ct",
  "pc", "pt", "qt", "fl", "bag", "box", "pack", "pcs", "cnt",
  "sys", "usda", "grade", "choice", "select", "prime", "premium",
  "classic", "imperial", "supreme", "signature", "house", "brand",
]);

const SIZE_PATTERN = /\b(\d+[\.\d]*\s*(?:oz|lb|lbs|kg|g|gal|qt|pt|ml|l|ct|pk|pc|pcs|count|dz|dozen|each))\b/gi;
const PACK_PATTERN = /\b(\d+)\s*[\/x×]\s*(\d+[\.\d]*)\s*(?:oz|lb|lbs|kg|g|gal|qt|pt|ml|l|ct|pk|pc|pcs|count|each)?\b/gi;
const PARENS_PATTERN = /\([^)]*\)/g;
const ITEM_CODE_PATTERN = /^\s*\d{4,}\s+/;
const TRAILING_DOTS = /\.{2,}$/;
const MULTI_SPACES = /\s+/g;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(ITEM_CODE_PATTERN, "")
    .replace(PARENS_PATTERN, " ")
    .replace(TRAILING_DOTS, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(MULTI_SPACES, " ")
    .trim();
}

function extractKeywords(text: string): string[] {
  const normalized = normalize(text);
  return normalized
    .split(/\s+/)
    .filter(w => w.length > 1 && !NOISE_WORDS.has(w))
    .filter(w => !/^\d+$/.test(w));
}

function extractCoreName(text: string): string {
  let core = text
    .toLowerCase()
    .replace(ITEM_CODE_PATTERN, "")
    .replace(SIZE_PATTERN, " ")
    .replace(PACK_PATTERN, " ")
    .replace(PARENS_PATTERN, " ")
    .replace(TRAILING_DOTS, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(MULTI_SPACES, " ")
    .trim();

  const words = core.split(/\s+/).filter(w => w.length > 1 && !NOISE_WORDS.has(w));
  return words.join(" ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > Math.max(m, n) * 0.5) return Math.max(m, n);

  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) {
      dp[i][j] = i === 0 ? j : 0;
    }
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function keywordOverlap(kw1: string[], kw2: string[]): number {
  if (kw1.length === 0 || kw2.length === 0) return 0;
  const set2 = new Set(kw2);
  let matches = 0;
  for (const w of kw1) {
    if (set2.has(w)) {
      matches++;
    } else {
      for (const w2 of set2) {
        if (stringSimilarity(w, w2) > 0.8) {
          matches += 0.8;
          break;
        }
      }
    }
  }
  return matches / Math.max(kw1.length, kw2.length);
}

function containsMatch(haystack: string, needle: string): boolean {
  const h = normalize(haystack);
  const n = normalize(needle);
  return h.includes(n) || n.includes(h);
}

export function findBestMatch(
  invoiceDescription: string,
  items: InventoryItem[],
  threshold: number = 0.35,
): MatchResult | null {
  const desc = invoiceDescription.trim();
  if (!desc) return null;

  const descNorm = normalize(desc);
  const descKeywords = extractKeywords(desc);
  const descCore = extractCoreName(desc);

  let best: MatchResult | null = null;

  for (const item of items) {
    const candidates = [item.name, ...(item.aliases || [])];

    for (const candidate of candidates) {
      const candNorm = normalize(candidate);
      const candKeywords = extractKeywords(candidate);
      const candCore = extractCoreName(candidate);

      if (descNorm === candNorm) {
        return { item, confidence: 1.0, method: "exact" };
      }

      if (containsMatch(descNorm, candNorm) && candNorm.length > 3) {
        const conf = 0.92;
        if (!best || conf > best.confidence) {
          best = { item, confidence: conf, method: "contains" };
        }
        continue;
      }

      if (descCore && candCore && descCore === candCore) {
        const conf = 0.9;
        if (!best || conf > best.confidence) {
          best = { item, confidence: conf, method: "core-exact" };
        }
        continue;
      }

      if (descCore && candCore) {
        const coreSim = stringSimilarity(descCore, candCore);
        if (coreSim > 0.75) {
          const conf = coreSim * 0.88;
          if (!best || conf > best.confidence) {
            best = { item, confidence: conf, method: "core-fuzzy" };
          }
          continue;
        }
      }

      const kwOverlap = keywordOverlap(descKeywords, candKeywords);
      if (kwOverlap > 0.5) {
        const conf = kwOverlap * 0.85;
        if (!best || conf > best.confidence) {
          best = { item, confidence: conf, method: "keyword" };
        }
        continue;
      }

      const fullSim = stringSimilarity(descNorm, candNorm);
      if (fullSim > 0.6) {
        const conf = fullSim * 0.8;
        if (!best || conf > best.confidence) {
          best = { item, confidence: conf, method: "fuzzy" };
        }
      }
    }
  }

  if (best && best.confidence >= threshold) {
    return best;
  }

  return null;
}

export function matchAllLines(
  lines: { itemDescription: string; [key: string]: any }[],
  items: InventoryItem[],
): { line: typeof lines[0]; match: MatchResult | null }[] {
  return lines.map(line => ({
    line,
    match: findBestMatch(line.itemDescription, items),
  }));
}

export function buildAIMatchingContext(items: InventoryItem[]): string {
  return items.map(i => {
    const aliases = i.aliases?.length ? ` (aliases: ${i.aliases.join(", ")})` : "";
    return `ID:${i.id} "${i.name}"${aliases} [${i.unit}]`;
  }).join("\n");
}
