import {
  DAILY_GOAL_OVERRIDES_STORAGE_KEY,
  DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY,
  ENTRIES_STORAGE_KEY,
  createDrinkId,
  localDayKey,
  normalizeDrinkEntries,
  parseDailyGoalOverrides,
  parseDailyStandardDrinkGoal,
  persistDrinkEntries,
  standardDrinkEquivalent,
  type DrinkDetails,
  type DrinkEntry,
  type DrinkStorage,
} from './drink-data.ts';
import {
  STOCK_PURCHASES_STORAGE_KEY,
  assignStockDeductions,
  parseStockPurchaseList,
  type StockPurchase,
} from './spending-data.ts';

export const COUNTABLE_WIDGET_NAME = 'Countable';
export const COUNTABLE_COMPACT_WIDGET_NAME = 'CountableCompact';

export type CountableWidgetSnapshot = {
  drinkCount: number;
  standardDrinks: number;
  dailyGoal: number | null;
  percentComplete: number | null;
  isOverGoal: boolean;
  hasLastDrink: boolean;
  error?: boolean;
};

type WidgetStorageData = {
  entries: DrinkEntry[];
  dailyStandardDrinkGoal: number | null;
  dailyGoalOverrides: Record<string, number>;
  stockPurchases: StockPurchase[];
};

function parseEntries(storedValue: string | null): DrinkEntry[] {
  if (storedValue === null) return [];
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(storedValue);
  } catch {
    throw new Error('Saved drink history is not valid JSON.');
  }

  const normalized = normalizeDrinkEntries(parsedValue);
  if (!normalized) {
    throw new Error('Saved drink history has an unexpected format.');
  }
  return normalized.entries;
}

async function readWidgetStorageData(
  storage: Pick<DrinkStorage, 'getItem' | 'setItem'>,
): Promise<WidgetStorageData> {
  const [
    storedEntries,
    storedGoal,
    storedGoalOverrides,
    storedStockPurchases,
  ] = await Promise.all([
    storage.getItem(ENTRIES_STORAGE_KEY),
    storage.getItem(DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY),
    storage.getItem(DAILY_GOAL_OVERRIDES_STORAGE_KEY),
    storage.getItem(STOCK_PURCHASES_STORAGE_KEY),
  ]);

  return {
    entries: parseEntries(storedEntries),
    dailyStandardDrinkGoal: parseDailyStandardDrinkGoal(storedGoal),
    dailyGoalOverrides: parseDailyGoalOverrides(storedGoalOverrides),
    stockPurchases: parseStockPurchaseList(storedStockPurchases),
  };
}

function lastDrinkDetails(entries: DrinkEntry[]): DrinkDetails | null {
  const lastEntry = entries
    .slice()
    .reverse()
    .find(
      (entry) =>
        entry.alcoholPercent !== null &&
        entry.volume !== null &&
        entry.unit !== null,
    );

  if (
    !lastEntry ||
    lastEntry.alcoholPercent === null ||
    lastEntry.volume === null ||
    lastEntry.unit === null
  ) {
    return null;
  }

  return {
    name: lastEntry.name,
    alcoholPercent: lastEntry.alcoholPercent,
    volume: lastEntry.volume,
    unit: lastEntry.unit,
    caloriesPer100Ml: lastEntry.caloriesPer100Ml ?? null,
  };
}

export async function readCountableWidgetSnapshot(
  storage: Pick<DrinkStorage, 'getItem' | 'setItem'>,
  now = Date.now(),
): Promise<CountableWidgetSnapshot> {
  const data = await readWidgetStorageData(storage);
  const todayKey = localDayKey(now);
  const hasGoalOverride = Object.prototype.hasOwnProperty.call(
    data.dailyGoalOverrides,
    todayKey,
  );
  const dailyGoal = hasGoalOverride
    ? data.dailyGoalOverrides[todayKey]
    : data.dailyStandardDrinkGoal;
  const todayEntries = data.entries.filter(
    (entry) => localDayKey(entry.timestamp) === todayKey,
  );
  const standardDrinks = todayEntries.reduce(
    (total, entry) => total + standardDrinkEquivalent(entry),
    0,
  );
  const percentComplete =
    dailyGoal === null
      ? null
      : dailyGoal === 0
        ? standardDrinks === 0
          ? 100
          : null
        : Math.round((standardDrinks / dailyGoal) * 100);

  return {
    drinkCount: todayEntries.length,
    standardDrinks,
    dailyGoal,
    percentComplete,
    isOverGoal: dailyGoal !== null && standardDrinks > dailyGoal,
    hasLastDrink: lastDrinkDetails(data.entries) !== null,
  };
}

export async function addLastDrinkFromWidget(
  storage: Pick<DrinkStorage, 'getItem' | 'setItem'>,
  timestamp = Date.now(),
): Promise<boolean> {
  const { entries, stockPurchases } = await readWidgetStorageData(storage);
  const details = lastDrinkDetails(entries);
  if (!details) return false;

  const newEntry: DrinkEntry = {
    id: createDrinkId(),
    timestamp,
    ...details,
    caloriesPer100Ml: details.caloriesPer100Ml ?? null,
    contextTags: [],
  };
  const entryWithStock = assignStockDeductions(
    newEntry,
    stockPurchases,
    entries,
  );
  const nextEntries = [...entries, entryWithStock].sort(
    (first, second) => first.timestamp - second.timestamp,
  );
  await persistDrinkEntries(storage, nextEntries);
  return true;
}
