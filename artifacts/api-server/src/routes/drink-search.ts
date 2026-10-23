import { Router, type IRouter } from "express";
import {
  GetDrinkProductNutritionParams,
  GetDrinkProductNutritionResponse,
  SearchDrinkProductsQueryParams,
  SearchDrinkProductsResponse,
} from "@workspace/api-zod";
import { ALCOHOL_PRODUCTS } from "../data/alcohol-products.generated";

const router: IRouter = Router();
const MAX_SEARCH_RESULTS = 30;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function searchScore(
  product: (typeof ALCOHOL_PRODUCTS)[number],
  tokens: string[],
): number | null {
  const name = normalizeSearchText(product.name);
  const brand = normalizeSearchText(product.brand ?? "");
  const category = normalizeSearchText(product.category);
  let score = 0;

  for (const token of tokens) {
    if (name === token) score += 0;
    else if (name.startsWith(token)) score += 1;
    else if (brand.startsWith(token)) score += 2;
    else if (name.includes(token)) score += 3;
    else if (brand.includes(token)) score += 4;
    else if (category.includes(token)) score += 5;
    else return null;
  }

  return score;
}

router.get("/drinks/search", (req, res) => {
  const parsedQuery = SearchDrinkProductsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: "Enter at least 2 characters to search." });
    return;
  }

  const query = normalizeSearchText(parsedQuery.data.q);
  const tokens = query.split(/\s+/).filter(Boolean);
  if (query.length < 2 || tokens.length === 0) {
    res.status(400).json({ error: "Enter at least 2 letters or numbers to search." });
    return;
  }

  const products = ALCOHOL_PRODUCTS
    .map((product) => ({ product, score: searchScore(product, tokens) }))
    .filter(
      (
        match,
      ): match is {
        product: (typeof ALCOHOL_PRODUCTS)[number];
        score: number;
      } => match.score !== null,
    )
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.product.name.localeCompare(right.product.name),
    )
    .slice(0, MAX_SEARCH_RESULTS)
    .map(({ product }) => product);

  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(SearchDrinkProductsResponse.parse({ products }));
});

router.get("/drinks/products/:code/nutrition", (req, res) => {
  const parsedParams = GetDrinkProductNutritionParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "Invalid local catalogue identifier." });
    return;
  }

  const product = ALCOHOL_PRODUCTS.find(
    (candidate) => candidate.code === parsedParams.data.code,
  );
  if (!product) {
    res.status(404).json({ error: "Product was not found in the local catalogue." });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(
    GetDrinkProductNutritionResponse.parse({
      // The source does not provide a compatible per-volume calorie basis.
      // Do not use the liquor table's unqualified "Cal" column as a serving value.
      caloriesPer100Ml: null,
      alcoholPercent: product.alcoholPercent,
      volumeMl: product.volumeMl,
    }),
  );
});

export default router;
