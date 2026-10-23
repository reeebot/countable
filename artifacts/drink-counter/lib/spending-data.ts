import {
  localDayKey,
  standardDrinkEquivalent,
  type DailyGoalOverrides,
  type DrinkEntry,
  type DrinkStorage,
  type VolumeUnit,
} from './drink-data.ts';

export const STOCK_PURCHASES_STORAGE_KEY = '@daily-drink-counter/stock-purchases';

const MILLILITERS_PER_FL_OZ = 29.5735;
const SAVINGS_HISTORY_DAYS = 28;
const MINIMUM_TRACKED_DAYS_FOR_SAVINGS = 6;

export type StockPurchase = {
  id: string;
  purchasedAt: number;
  productName: string;
  alcoholPercent: number;
  containerCount: number;
  containerVolumeMl: number;
  totalCostCents: number;
};

export type StockPurchaseDraft = {
  productName: string;
  alcoholPercent: number;
  containerCount: number;
  containerVolume: number;
  unit: VolumeUnit;
  totalCost: number;
};

export type StockPurchaseBalance = StockPurchase & {
  totalVolumeMl: number;
  usedVolumeMl: number;
  remainingVolumeMl: number;
  remainingContainers: number;
  consumedCostCents: number;
  remainingCostCents: number;
};

export type SpendingSummary = {
  totalPaidCents: number;
  consumedCostCents: number;
  remainingValueCents: number;
  remainingVolumeMl: number;
  remainingContainerCount: number;
  trackedStandardDrinks: number;
  trackedDays: number;
  averageCostPerStandardDrinkCents: number | null;
  projectedSavingsCents: number | null;
  projectionDays: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function volumeToMilliliters(volume: number, unit: VolumeUnit): number {
  return unit === 'fl oz' ? volume * MILLILITERS_PER_FL_OZ : volume;
}

export function millilitersToFluidOunces(volumeMl: number): number {
  return volumeMl / MILLILITERS_PER_FL_OZ;
}

export function normalizeStockPurchase(value: unknown): StockPurchase | null {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    value.id.trim().length === 0 ||
    value.id.length > 120 ||
    !isFiniteNumber(value.purchasedAt) ||
    typeof value.productName !== 'string' ||
    value.productName.trim().length === 0 ||
    value.productName.trim().length > 120 ||
    !isFiniteNumber(value.alcoholPercent) ||
    value.alcoholPercent <= 0 ||
    value.alcoholPercent > 100 ||
    !Number.isInteger(value.containerCount) ||
    (value.containerCount as number) < 1 ||
    (value.containerCount as number) > 10000 ||
    !isFiniteNumber(value.containerVolumeMl) ||
    value.containerVolumeMl <= 0 ||
    value.containerVolumeMl > 100000 ||
    !Number.isInteger(value.totalCostCents) ||
    (value.totalCostCents as number) < 0 ||
    (value.totalCostCents as number) > 1000000000
  ) {
    return null;
  }

  return {
    id: value.id,
    purchasedAt: value.purchasedAt,
    productName: value.productName.trim(),
    alcoholPercent: value.alcoholPercent,
    containerCount: value.containerCount as number,
    containerVolumeMl: value.containerVolumeMl,
    totalCostCents: value.totalCostCents as number,
  };
}

export function normalizeStockPurchaseList(
  value: unknown,
): StockPurchase[] | null {
  if (!Array.isArray(value) || value.length > 10000) return null;
  const purchases: StockPurchase[] = [];
  const ids = new Set<string>();

  for (const item of value) {
    const purchase = normalizeStockPurchase(item);
    if (!purchase || ids.has(purchase.id)) return null;
    ids.add(purchase.id);
    purchases.push(purchase);
  }

  return purchases;
}

export function parseStockPurchaseList(
  storedValue: string | null,
): StockPurchase[] {
  if (storedValue === null) return [];
  try {
    const normalized = normalizeStockPurchaseList(JSON.parse(storedValue));
    if (!normalized) throw new Error('Invalid saved stock purchase data.');
    return normalized;
  } catch {
    throw new Error('Saved stock purchases have an unexpected format.');
  }
}

export function createStockPurchase(
  draft: StockPurchaseDraft,
  id: string,
  purchasedAt: number,
): StockPurchase {
  const productName = draft.productName.trim();
  if (!productName) throw new Error('Enter a product name.');
  if (productName.length > 120) {
    throw new Error('Product names must be 120 characters or fewer.');
  }
  if (
    !Number.isFinite(draft.alcoholPercent) ||
    draft.alcoholPercent <= 0 ||
    draft.alcoholPercent > 100
  ) {
    throw new Error('Enter an alcohol percentage between 0 and 100.');
  }
  if (
    !Number.isInteger(draft.containerCount) ||
    draft.containerCount < 1 ||
    draft.containerCount > 10000
  ) {
    throw new Error('Enter at least one container.');
  }
  if (
    !Number.isFinite(draft.containerVolume) ||
    draft.containerVolume <= 0
  ) {
    throw new Error('Enter the volume of one container.');
  }
  if (!Number.isFinite(draft.totalCost) || draft.totalCost < 0) {
    throw new Error('Enter the total amount paid.');
  }
  if (!id.trim() || !Number.isFinite(purchasedAt)) {
    throw new Error('Could not create this purchase record.');
  }

  const purchase = normalizeStockPurchase({
    id,
    purchasedAt,
    productName,
    alcoholPercent: draft.alcoholPercent,
    containerCount: draft.containerCount,
    containerVolumeMl: volumeToMilliliters(
      draft.containerVolume,
      draft.unit,
    ),
    totalCostCents: Math.round(draft.totalCost * 100),
  });
  if (!purchase) throw new Error('Check the purchase details and try again.');
  return purchase;
}

export async function persistStockPurchaseList(
  storage: DrinkStorage,
  purchases: StockPurchase[],
): Promise<void> {
  await storage.setItem(
    STOCK_PURCHASES_STORAGE_KEY,
    JSON.stringify(purchases),
  );
}

function totalPurchaseVolume(purchase: StockPurchase): number {
  return purchase.containerCount * purchase.containerVolumeMl;
}

function normalizedProductName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function isMatchingProduct(entry: DrinkEntry, purchase: StockPurchase): boolean {
  const entryName = normalizedProductName(entry.name);
  return (
    entryName.length > 0 &&
    entry.alcoholPercent !== null &&
    entryName === normalizedProductName(purchase.productName) &&
    Math.abs(entry.alcoholPercent - purchase.alcoholPercent) <= 0.05
  );
}

function uniqueEntries(entries: DrinkEntry[]): DrinkEntry[] {
  const byId = new Map<string, DrinkEntry>();
  for (const entry of entries) byId.set(entry.id, entry);
  return Array.from(byId.values());
}

export function stockPurchaseBalances(
  purchases: StockPurchase[],
  entries: DrinkEntry[],
): StockPurchaseBalance[] {
  const validPurchaseIds = new Set(purchases.map((purchase) => purchase.id));
  const usedByPurchase = new Map<string, number>();

  for (const entry of uniqueEntries(entries)) {
    for (const deduction of entry.stockDeductions ?? []) {
      if (
        validPurchaseIds.has(deduction.purchaseId) &&
        Number.isFinite(deduction.volumeMl) &&
        deduction.volumeMl > 0
      ) {
        usedByPurchase.set(
          deduction.purchaseId,
          (usedByPurchase.get(deduction.purchaseId) ?? 0) +
            deduction.volumeMl,
        );
      }
    }
  }

  return purchases.map((purchase) => {
    const totalVolumeMl = totalPurchaseVolume(purchase);
    const usedVolumeMl = Math.min(
      totalVolumeMl,
      usedByPurchase.get(purchase.id) ?? 0,
    );
    const remainingVolumeMl = Math.max(0, totalVolumeMl - usedVolumeMl);
    const consumedCostCents =
      totalVolumeMl > 0
        ? Math.min(
            purchase.totalCostCents,
            Math.round(
              (purchase.totalCostCents * usedVolumeMl) / totalVolumeMl,
            ),
          )
        : 0;

    return {
      ...purchase,
      totalVolumeMl,
      usedVolumeMl,
      remainingVolumeMl,
      remainingContainers:
        purchase.containerVolumeMl > 0
          ? remainingVolumeMl / purchase.containerVolumeMl
          : 0,
      consumedCostCents,
      remainingCostCents: purchase.totalCostCents - consumedCostCents,
    };
  });
}

export function assignStockDeductions(
  entry: DrinkEntry,
  purchases: StockPurchase[],
  priorEntries: DrinkEntry[],
): DrinkEntry {
  if (
    entry.alcoholPercent === null ||
    entry.volume === null ||
    entry.unit === null ||
    entry.volume <= 0
  ) {
    return { ...entry, stockDeductions: [] };
  }

  const entryVolumeMl = volumeToMilliliters(entry.volume, entry.unit);
  const balances = stockPurchaseBalances(
    purchases,
    uniqueEntries(priorEntries).filter((prior) => prior.id !== entry.id),
  );
  const remainingByPurchase = new Map(
    balances.map((balance) => [balance.id, balance.remainingVolumeMl]),
  );
  const matchingLots = purchases
    .filter((purchase) => isMatchingProduct(entry, purchase))
    .sort(
      (a, b) =>
        a.purchasedAt - b.purchasedAt || a.id.localeCompare(b.id),
    );

  let remainingVolumeMl = entryVolumeMl;
  const stockDeductions: NonNullable<DrinkEntry['stockDeductions']> = [];
  for (const purchase of matchingLots) {
    if (remainingVolumeMl <= 0.001) break;
    const availableVolumeMl = remainingByPurchase.get(purchase.id) ?? 0;
    if (availableVolumeMl <= 0.001) continue;

    const deductedVolumeMl = Math.min(remainingVolumeMl, availableVolumeMl);
    stockDeductions.push({
      purchaseId: purchase.id,
      volumeMl: Math.round(deductedVolumeMl * 1000) / 1000,
    });
    remainingVolumeMl -= deductedVolumeMl;
  }

  return { ...entry, stockDeductions };
}

function validPurchaseMap(
  purchases: StockPurchase[],
): Map<string, StockPurchase> {
  return new Map(purchases.map((purchase) => [purchase.id, purchase]));
}

function matchedDeductionVolumeMl(
  entry: DrinkEntry,
  purchaseMap: Map<string, StockPurchase>,
): number {
  return (entry.stockDeductions ?? []).reduce((total, deduction) => {
    if (
      !purchaseMap.has(deduction.purchaseId) ||
      !Number.isFinite(deduction.volumeMl) ||
      deduction.volumeMl <= 0
    ) {
      return total;
    }
    return total + deduction.volumeMl;
  }, 0);
}

export function costCentsForEntry(
  entry: DrinkEntry,
  purchases: StockPurchase[],
): number | null {
  const purchaseMap = validPurchaseMap(purchases);
  let hasMatchedDeduction = false;
  let costCents = 0;

  for (const deduction of entry.stockDeductions ?? []) {
    const purchase = purchaseMap.get(deduction.purchaseId);
    if (
      !purchase ||
      !Number.isFinite(deduction.volumeMl) ||
      deduction.volumeMl <= 0
    ) {
      continue;
    }
    const totalVolumeMl = totalPurchaseVolume(purchase);
    if (totalVolumeMl <= 0) continue;
    hasMatchedDeduction = true;
    costCents +=
      (purchase.totalCostCents * deduction.volumeMl) / totalVolumeMl;
  }

  return hasMatchedDeduction ? Math.round(costCents) : null;
}

function stockCoveredStandardDrinks(
  entry: DrinkEntry,
  purchases: StockPurchase[],
): number {
  if (
    entry.volume === null ||
    entry.volume <= 0 ||
    entry.unit === null
  ) {
    return 0;
  }
  const purchaseMap = validPurchaseMap(purchases);
  const totalVolumeMl = volumeToMilliliters(entry.volume, entry.unit);
  if (totalVolumeMl <= 0) return 0;
  const coveredVolumeMl = Math.min(
    totalVolumeMl,
    matchedDeductionVolumeMl(entry, purchaseMap),
  );
  return standardDrinkEquivalent(entry) * (coveredVolumeMl / totalVolumeMl);
}

function localMidnight(timestamp: number): Date {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function calculateSpendingSummary(
  purchases: StockPurchase[],
  entries: DrinkEntry[],
  dailyStandardDrinkGoal: number | null,
  dailyGoalOverrides: DailyGoalOverrides,
  referenceTimestamp: number,
): SpendingSummary {
  const balances = stockPurchaseBalances(purchases, entries);
  const totalPaidCents = purchases.reduce(
    (total, purchase) => total + purchase.totalCostCents,
    0,
  );
  const consumedCostCents = balances.reduce(
    (total, balance) => total + balance.consumedCostCents,
    0,
  );
  const remainingVolumeMl = balances.reduce(
    (total, balance) => total + balance.remainingVolumeMl,
    0,
  );
  const remainingContainerCount = balances.reduce(
    (total, balance) => total + balance.remainingContainers,
    0,
  );
  const remainingValueCents = balances.reduce(
    (total, balance) => total + balance.remainingCostCents,
    0,
  );

  const todayStart = localMidnight(referenceTimestamp);
  const historyEnd = todayStart.getTime();
  const historyStartDate = new Date(todayStart);
  historyStartDate.setDate(historyStartDate.getDate() - SAVINGS_HISTORY_DAYS);
  const historyStart = historyStartDate.getTime();

  const weekdayDrinkTotals = Array<number>(7).fill(0);
  const weekdayDayCounts = Array<number>(7).fill(0);
  const trackedDayKeys = new Set<string>();
  let trackedStandardDrinks = 0;
  let trackedCostCents = 0;

  for (let dayOffset = 0; dayOffset < SAVINGS_HISTORY_DAYS; dayOffset += 1) {
    const day = new Date(historyStartDate);
    day.setDate(day.getDate() + dayOffset);
    weekdayDayCounts[day.getDay()] += 1;
  }

  for (const entry of uniqueEntries(entries)) {
    if (entry.timestamp < historyStart || entry.timestamp >= historyEnd) {
      continue;
    }
    const coveredStandardDrinks = stockCoveredStandardDrinks(entry, purchases);
    const costCents = costCentsForEntry(entry, purchases);
    if (coveredStandardDrinks <= 0 || costCents === null) continue;

    const weekday = new Date(entry.timestamp).getDay();
    weekdayDrinkTotals[weekday] += coveredStandardDrinks;
    trackedStandardDrinks += coveredStandardDrinks;
    trackedCostCents += costCents;
    trackedDayKeys.add(localDayKey(entry.timestamp));
  }

  const trackedDays = trackedDayKeys.size;
  const averageCostPerStandardDrinkCents =
    trackedStandardDrinks > 0
      ? trackedCostCents / trackedStandardDrinks
      : null;

  let projectedSavingsCents: number | null = null;
  let projectionDays = 0;
  if (
    trackedDays >= MINIMUM_TRACKED_DAYS_FOR_SAVINGS &&
    averageCostPerStandardDrinkCents !== null
  ) {
    const futureStart = new Date(todayStart);
    futureStart.setDate(futureStart.getDate() + 1);
    let projectedSavings = 0;

    for (let dayOffset = 0; dayOffset < SAVINGS_HISTORY_DAYS; dayOffset += 1) {
      const day = new Date(futureStart);
      day.setDate(day.getDate() + dayOffset);
      const dayKey = localDayKey(day.getTime());
      const goal = Object.prototype.hasOwnProperty.call(
        dailyGoalOverrides,
        dayKey,
      )
        ? dailyGoalOverrides[dayKey]
        : dailyStandardDrinkGoal;
      if (goal === null || goal === undefined || !Number.isFinite(goal)) {
        continue;
      }

      const weekday = day.getDay();
      const daysForWeekday = weekdayDayCounts[weekday];
      if (daysForWeekday <= 0) continue;
      const baseline = weekdayDrinkTotals[weekday] / daysForWeekday;
      projectedSavings +=
        Math.max(0, baseline - goal) * averageCostPerStandardDrinkCents;
      projectionDays += 1;
    }

    if (projectionDays > 0) {
      projectedSavingsCents = Math.max(0, Math.round(projectedSavings));
    }
  }

  return {
    totalPaidCents,
    consumedCostCents,
    remainingValueCents,
    remainingVolumeMl,
    remainingContainerCount,
    trackedStandardDrinks,
    trackedDays,
    averageCostPerStandardDrinkCents,
    projectedSavingsCents,
    projectionDays,
  };
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}
