import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseAbvRange, EXCLUDED_LOW_ABV_THRESHOLD } from "./alcohol-abv.mjs";

const artifactDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputPath = path.join(
  artifactDir,
  "src",
  "data",
  "alcohol-products.generated.ts",
);
const sources = {
  beer: "https://www.alcoholcontents.com/beer/",
  wine: "https://www.alcoholcontents.com/wine/",
  liquor: "https://www.alcoholcontents.com/liquor/",
};
const headers = {
  "User-Agent": "DailyDrinkCounter/1.0 (local catalogue import)",
  Accept: "text/html",
};
const minimumRows = { beer: 1000, wine: 10, liquor: 75 };
const namedEntities = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  eacute: "é",
  Eacute: "É",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
};

function decodeHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number(decimal)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, hexadecimal) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name) => namedEntities[name] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

function extractRows(html) {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      decodeHtml(cell[1]),
    ),
  );
}

function makeCode(category, name, brand, min, max) {
  const prefix = category === "beer" ? "b" : category === "liquor" ? "l" : "w";
  const source = `${category}|${name.toLocaleLowerCase()}|${brand ?? ""}|${min}|${max}`;
  return `${prefix}${createHash("sha1").update(source).digest("hex").slice(0, 12)}`;
}

function makeRecord(category, name, brand, abv, isEstimate, sourceUrl) {
  const cleanName = name.replace(/\s+/g, " ").trim();
  if (!cleanName || abv.kind === "below-threshold") return null;

  return {
    code: makeCode(
      category,
      cleanName,
      brand,
      abv.kind === "available" ? abv.min : "unknown",
      abv.kind === "available" ? abv.max : "unknown",
    ),
    name: cleanName,
    brand: brand?.trim() || null,
    category,
    volumeMl: null,
    alcoholPercent: abv.kind === "available" ? abv.value : null,
    abvMin: abv.kind === "available" ? abv.min : null,
    abvMax: abv.kind === "available" ? abv.max : null,
    abvIsEstimate: isEstimate,
    sourceUrl,
  };
}

async function fetchRows(url) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  const html = await response.text();
  if (html.length < 10_000) {
    throw new Error(`Unexpectedly short source page: ${url}`);
  }
  return extractRows(html);
}

function beerRecords(rows) {
  const records = [];
  for (const row of rows) {
    if (row.length < 3 || row[0].toLocaleLowerCase() === "beer") continue;
    const abv = parseAbvRange(row[2]);
    const product = makeRecord("beer", row[0], row[1], abv, false, sources.beer);
    if (product) records.push(product);
  }
  return records;
}

function liquorRecords(rows) {
  const records = [];
  for (const row of rows) {
    if (
      row.length < 2 ||
      row[0].toLocaleLowerCase().startsWith("liquor /")
    ) {
      continue;
    }
    const abv = parseAbvRange(row[1]);
    const product = makeRecord("liquor", row[0], null, abv, false, sources.liquor);
    if (product) records.push(product);
  }
  return records;
}

function wineRecords(rows) {
  const records = [];
  for (const row of rows) {
    if (row.length < 3 || row[0].toLocaleLowerCase() === "type") continue;
    // This table is for generic wine styles, not branded products. Barley wine
    // is a beer style and already belongs in the beer table.
    if (row[0].toLocaleLowerCase() === "barley wine") continue;
    const abv = parseAbvRange(row[2]);
    const product = makeRecord("wine", row[0], null, abv, true, sources.wine);
    if (product) records.push(product);
  }
  return records;
}

function deduplicate(records) {
  const seen = new Set();
  return records.filter((product) => {
    if (seen.has(product.code)) return false;
    seen.add(product.code);
    return true;
  });
}

export { beerRecords, liquorRecords, makeRecord, wineRecords };

async function importCatalogue() {
  const [beerRows, wineRows, liquorRows] = await Promise.all([
    fetchRows(sources.beer),
    fetchRows(sources.wine),
    fetchRows(sources.liquor),
  ]);
  const categorized = {
    beer: deduplicate(beerRecords(beerRows)),
    wine: deduplicate(wineRecords(wineRows)),
    liquor: deduplicate(liquorRecords(liquorRows)),
  };
  for (const [category, products] of Object.entries(categorized)) {
    if (products.length < minimumRows[category]) {
      throw new Error(
        `Only imported ${products.length} ${category} records; expected at least ${minimumRows[category]}.`,
      );
    }
  }
  const products = [...categorized.beer, ...categorized.liquor, ...categorized.wine];
  const output = `// Generated from AlcoholContents.com on ${new Date().toISOString()}.\n// Wine rows are broad style estimates, not branded product ABVs.\nexport type AlcoholCatalogueRecord = {\n  code: string;\n  name: string;\n  brand: string | null;\n  category: "beer" | "liquor" | "wine";\n  volumeMl: number | null;\n  alcoholPercent: number | null;\n  abvMin: number | null;\n  abvMax: number | null;\n  abvIsEstimate: boolean;\n  sourceUrl: string;\n};\n\nexport const ALCOHOL_PRODUCTS: AlcoholCatalogueRecord[] = JSON.parse(${JSON.stringify(JSON.stringify(products))}) as AlcoholCatalogueRecord[];\n`;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
  console.info(
    `Imported ${categorized.beer.length} beers, ${categorized.liquor.length} liquor entries, and ${categorized.wine.length} typical wine styles; excluded entries at or below ${EXCLUDED_LOW_ABV_THRESHOLD}% ABV.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importCatalogue();
}
