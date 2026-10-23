import assert from "node:assert/strict";
import test from "node:test";
import { beerRecords, liquorRecords, wineRecords } from "./import-alcoholcontents.mjs";
import { parseAbvRange } from "./alcohol-abv.mjs";

test("parses explicit alcohol-by-volume values and ranges", () => {
  assert.deepEqual(parseAbvRange("5.2 % vol"), {
    kind: "available",
    min: 5.2,
    max: 5.2,
    value: 5.2,
  });
  assert.deepEqual(parseAbvRange("4–7%"), {
    kind: "available",
    min: 4,
    max: 7,
    value: 5.5,
  });
  assert.equal(parseAbvRange("40% ABV").value, 40);
});

test("does not interpret mass-based, missing, or malformed values as ABV", () => {
  assert.deepEqual(parseAbvRange("12 g/100 ml"), { kind: "unavailable" });
  assert.deepEqual(parseAbvRange("12% m/m"), { kind: "unavailable" });
  assert.deepEqual(parseAbvRange(""), { kind: "unavailable" });
  assert.deepEqual(parseAbvRange("varies"), { kind: "unavailable" });
});

test("rejects below-threshold and out-of-range values", () => {
  assert.deepEqual(parseAbvRange("0.4%"), { kind: "below-threshold" });
  assert.deepEqual(parseAbvRange("< 0.1%"), { kind: "below-threshold" });
  assert.deepEqual(parseAbvRange("trace"), { kind: "below-threshold" });
  assert.deepEqual(parseAbvRange("101 % vol"), { kind: "unavailable" });
  assert.deepEqual(parseAbvRange("40–101%"), { kind: "unavailable" });
});

test("catalogue import keeps searchable records but leaves unusable ABV blank", () => {
  const beer = beerRecords([
    ["Beer", "Brewery", "%"],
    ["Known beer", "Brew Co.", "5 % vol"],
    ["Ambiguous beer", "Brew Co.", "12 g/100 ml"],
    ["Missing beer", "Brew Co.", ""],
    ["Invalid beer", "Brew Co.", "101%"],
  ]);
  const liquor = liquorRecords([
    ["Liquor / Cocktail / Liqueur", "% Alc (ABV)", "Cal"],
    ["Known spirit", "40", ""],
  ]);
  const wine = wineRecords([
    ["Type", "Grams/100ml", "% Alc by Vol"],
    ["Known wine", "10 g/100 ml", "12 % vol"],
    ["Ambiguous wine", "12 g/100 ml", "varies"],
  ]);

  assert.equal(beer[0].alcoholPercent, 5);
  assert.equal(beer[1].alcoholPercent, null);
  assert.equal(beer[1].abvMin, null);
  assert.equal(beer[2].alcoholPercent, null);
  assert.equal(beer[3].alcoholPercent, null);
  assert.equal(liquor[0].alcoholPercent, 40);
  assert.equal(wine[0].alcoholPercent, 12);
  assert.equal(wine[1].alcoholPercent, null);
});
