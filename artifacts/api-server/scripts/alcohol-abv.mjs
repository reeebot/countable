export const EXCLUDED_LOW_ABV_THRESHOLD = 0.5;

export function parseAbvRange(value) {
  if (typeof value !== "string") return { kind: "unavailable" };

  const normalized = value.trim().replace(/[–—]/g, "-");
  if (!normalized) return { kind: "unavailable" };
  if (/^trace$/i.test(normalized)) return { kind: "below-threshold" };
  const belowThreshold = normalized.match(
    /^<\s*(\d+(?:[.,]\d+)?)\s*(?:%|percent)?\s*$/i,
  );
  if (
    belowThreshold &&
    Number(belowThreshold[1].replace(",", ".")) <= EXCLUDED_LOW_ABV_THRESHOLD
  ) {
    return { kind: "below-threshold" };
  }

  const range = normalized.match(
    /^\s*(\d+(?:[.,]\d+)?)\s*(?:%|percent)?\s*(?:(?:abv)|(?:alc(?:ohol)?\s+by\s+vol(?:ume)?)|vol(?:ume)?)?\s*-\s*(\d+(?:[.,]\d+)?)\s*(?:%|percent)?\s*(?:(?:abv)|(?:alc(?:ohol)?\s+by\s+vol(?:ume)?)|vol(?:ume)?)?\s*$/i,
  );
  const exact = normalized.match(
    /^\s*(\d+(?:[.,]\d+)?)\s*(?:%|percent)?\s*(?:(?:abv)|(?:alc(?:ohol)?\s+by\s+vol(?:ume)?)|vol(?:ume)?)?\s*$/i,
  );
  if (!range && !exact) return { kind: "unavailable" };

  const min = Number((range?.[1] ?? exact?.[1]).replace(",", "."));
  const max = Number((range?.[2] ?? exact?.[1]).replace(",", "."));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    return { kind: "unavailable" };
  }
  if (max <= EXCLUDED_LOW_ABV_THRESHOLD) return { kind: "below-threshold" };
  if (min <= EXCLUDED_LOW_ABV_THRESHOLD || max > 100) {
    return { kind: "unavailable" };
  }

  return {
    kind: "available",
    min,
    max,
    value: Math.round(((min + max) / 2) * 10) / 10,
  };
}
