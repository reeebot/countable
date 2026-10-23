---
name: Catalogue alcohol data
description: Rules for interpreting alcohol and package-size details from product catalogues.
---

# Rules

Only treat an alcohol value as ABV when the product record explicitly labels it as `% vol` or ABV. Do not convert mass-based alcohol nutrition values into ABV. Leave the field unset when the source is ambiguous.

AlcoholContents.com may be copied and hosted locally for this app's beer and liquor data, as the user confirmed permission. Its wine table is accepted only for generalized typical wine-style input; label those values with a neutral typical-style qualifier.

**Why:** Product catalogues can omit ABV or mix alcohol measurements with different units. The user also explicitly approved local reuse of AlcoholContents beer/liquor tables and the generalized wine-style approach.

**How to apply:** For this app, use local AlcoholContents beer/liquor entries and generic wine estimates only. Do not infer package sizes or calories when the source does not provide a compatible basis; avoid warning or caution copy about nutrition and label verification.

For the Drink Counter entry UI, default serving units to fl oz, keep calories secondary, and omit warning or caution copy about catalogue nutrition or label verification. A neutral “typical” label may remain on generalized wine styles.

**Why:** The user explicitly requested fl oz as the default and asked to remove warning/caution language because calorie tracking is secondary.

**How to apply:** When editing drink entry and search UI, use fl oz for new catalogue selections with no known volume, do not surface calorie or label warnings, and retain only factual wine-style qualifiers.
