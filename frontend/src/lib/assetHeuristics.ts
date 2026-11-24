// Stand-in benchmarks ported from the HTML prototype. They are rough rules of
// thumb, not sourced data: the UI labels them "Suggested" and the user decides.
// Replace with parish history / a real cost source when available.

export const BENCHMARKS: Record<string, { life: number; cost: number; source: string }> = {
  "HVAC unit":         { life: 15, cost: 10000, source: "parish HVAC history" },
  "Roofing":           { life: 25, cost: 60000, source: "commercial membrane roofs" },
  "Parking lot":       { life: 7,  cost: 25000, source: "seal/stripe cycle" },
  "AV / Sound":        { life: 12, cost: 15000, source: "mixing boards and projectors" },
  "Computer / IT":     { life: 5,  cost: 800,   source: "standard device refresh cycle" },
  "Flooring / Carpet": { life: 18, cost: 20000, source: "moderate-traffic commercial carpet" },
  "Paint / Finish":    { life: 18, cost: 5000,  source: "interior repaint interval" },
  "Windows":           { life: 10, cost: 3000,  source: "caulk / reseal interval" },
};

// lifeAdd: years added to base life; costMult: price multiplier vs. base
const MANUFACTURERS: Record<string, { lifeAdd: number; costMult: number }> = {
  "trane": { lifeAdd: 2, costMult: 1.15 }, "carrier": { lifeAdd: 1, costMult: 1.1 },
  "lennox": { lifeAdd: 1, costMult: 1.1 }, "goodman": { lifeAdd: -2, costMult: 0.85 },
  "allen & heath": { lifeAdd: 2, costMult: 1.2 }, "epson": { lifeAdd: 0, costMult: 1 },
  "dell": { lifeAdd: 0, costMult: 1 }, "hp": { lifeAdd: -1, costMult: 0.9 },
  "shaw": { lifeAdd: 2, costMult: 1.1 }, "sherwin-williams": { lifeAdd: 2, costMult: 1.1 },
};

const INFLATION = 0.03; // yearly price drift used to restate cost to the install year

export const ASSET_TYPES = Object.keys(BENCHMARKS);

export interface Suggestion { value: number; basis: string }

export function computeSuggestions(type: string, manufacturer: string, year: number, thisYear: number): { life: Suggestion; cost: Suggestion } | null {
  const base = BENCHMARKS[type];
  if (!base) return null;
  const mfr = MANUFACTURERS[manufacturer.trim().toLowerCase()];
  const yearsAgo = year ? Math.max(0, thisYear - year) : 0;
  const life = Math.max(1, base.life + (mfr ? mfr.lifeAdd : 0));
  const cost = Math.round((base.cost * (mfr ? mfr.costMult : 1)) / Math.pow(1 + INFLATION, yearsAgo) / 50) * 50;
  const bits = [`${type} base (${base.source})`];
  if (mfr) bits.push(`${manufacturer.trim()} adjustment`);
  if (yearsAgo) bits.push(`${year} install-year pricing`);
  const end = year ? ` Projected end of life: ${year + life}.` : "";
  return {
    life: { value: life, basis: `Based on ${bits.slice(0, mfr ? 2 : 1).join(" + ")}.${end}` },
    cost: { value: cost, basis: `Based on ${bits.join(" + ")}.` },
  };
}

export const WORTH_MIN_COST = 2500;
export const WORTH_MIN_LIFE = 3;

/** Score out of 6: two automatic factors (cost, life) plus the four ticked ones. */
export function worthVerdict(life: number, cost: number, ticked: number): { score: number; level: "yes" | "maybe" | "no" } {
  const score = (cost >= WORTH_MIN_COST ? 1 : 0) + (life >= WORTH_MIN_LIFE ? 1 : 0) + ticked;
  return { score, level: score >= 4 ? "yes" : score >= 2 ? "maybe" : "no" };
}
