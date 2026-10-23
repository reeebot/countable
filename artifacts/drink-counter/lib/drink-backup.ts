import {
  DEFAULT_DRINK_CONTEXT_TAGS,
  normalizeDailyGoalOverrides,
  normalizeDailyStandardDrinkGoal,
  normalizeDrinkContextTagDefinitions,
  normalizeDrinkEntries,
  parseSavedDrinkList,
  type DailyGoalOverrides,
  type DrinkContextTagDefinition,
  type DrinkEntry,
  type SavedDrink,
} from './drink-data.ts';
import {
  normalizeStockPurchaseList,
  type StockPurchase,
} from './spending-data.ts';

export const DRINK_BACKUP_FORMAT = 'countable-drink-counter-backup';
export const DRINK_BACKUP_VERSION = 1;

export type DrinkBackupData = {
  entries: DrinkEntry[];
  savedDrinks: SavedDrink[];
  stockPurchases: StockPurchase[];
  dailyStandardDrinkGoal: number | null;
  dailyGoalOverrides: DailyGoalOverrides;
  contextTagDefinitions: DrinkContextTagDefinition[];
};

export type DrinkBackupMergeResult = {
  data: DrinkBackupData;
  added: {
    entries: number;
    savedDrinks: number;
    stockPurchases: number;
    dailyGoalOverrides: number;
    contextTagDefinitions: number;
    dailyStandardDrinkGoal: number;
  };
};

type DrinkBackupFile = {
  format: typeof DRINK_BACKUP_FORMAT;
  version: typeof DRINK_BACKUP_VERSION;
  exportedAt: string;
  data: DrinkBackupData;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createDrinkBackupFile(
  data: DrinkBackupData,
  exportedAt = new Date().toISOString(),
): DrinkBackupFile {
  return {
    format: DRINK_BACKUP_FORMAT,
    version: DRINK_BACKUP_VERSION,
    exportedAt,
    data: {
      entries: data.entries,
      savedDrinks: data.savedDrinks,
      stockPurchases: data.stockPurchases,
      dailyStandardDrinkGoal: data.dailyStandardDrinkGoal,
      dailyGoalOverrides: data.dailyGoalOverrides,
      contextTagDefinitions: data.contextTagDefinitions,
    },
  };
}

export function parseDrinkBackupFile(value: unknown): DrinkBackupData {
  if (!isObject(value) || value.format !== DRINK_BACKUP_FORMAT) {
    throw new Error('This file is not a Countable backup.');
  }
  if (value.version !== DRINK_BACKUP_VERSION) {
    throw new Error('This Countable backup version is not supported.');
  }
  if (
    typeof value.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.exportedAt)) ||
    !isObject(value.data)
  ) {
    throw new Error('The backup file is missing required information.');
  }

  const rawData = value.data;
  const normalizedEntries = normalizeDrinkEntries(rawData.entries);
  if (!normalizedEntries) {
    throw new Error('The backup contains drink records in an unexpected format.');
  }

  if (!Array.isArray(rawData.savedDrinks)) {
    throw new Error('The backup contains saved drinks in an unexpected format.');
  }
  let savedDrinks: SavedDrink[];
  try {
    savedDrinks = parseSavedDrinkList(JSON.stringify(rawData.savedDrinks));
  } catch {
    throw new Error('The backup contains saved drinks in an unexpected format.');
  }

  const stockPurchases = normalizeStockPurchaseList(
    rawData.stockPurchases === undefined ? [] : rawData.stockPurchases,
  );
  if (!stockPurchases) {
    throw new Error('The backup contains stock purchases in an unexpected format.');
  }

  if (
    rawData.dailyStandardDrinkGoal !== null &&
    typeof rawData.dailyStandardDrinkGoal !== 'number'
  ) {
    throw new Error('The backup contains a daily goal in an unexpected format.');
  }
  const dailyStandardDrinkGoal =
    rawData.dailyStandardDrinkGoal === null
      ? null
      : normalizeDailyStandardDrinkGoal(rawData.dailyStandardDrinkGoal);
  if (
    rawData.dailyStandardDrinkGoal !== null &&
    dailyStandardDrinkGoal === null
  ) {
    throw new Error('The backup contains a daily goal in an unexpected format.');
  }

  const dailyGoalOverrides = normalizeDailyGoalOverrides(
    rawData.dailyGoalOverrides,
  );
  if (!dailyGoalOverrides) {
    throw new Error('The backup contains date-specific goals in an unexpected format.');
  }

  const contextTagDefinitions = normalizeDrinkContextTagDefinitions(
    rawData.contextTagDefinitions,
  );
  if (!contextTagDefinitions) {
    throw new Error('The backup contains context labels in an unexpected format.');
  }

  return {
    entries: normalizedEntries.entries,
    savedDrinks,
    stockPurchases,
    dailyStandardDrinkGoal,
    dailyGoalOverrides,
    contextTagDefinitions,
  };
}

function isUnchangedDefaultTag(
  definition: DrinkContextTagDefinition,
): boolean {
  const defaultDefinition = DEFAULT_DRINK_CONTEXT_TAGS.find(
    (tag) => tag.value === definition.value,
  );
  return (
    defaultDefinition !== undefined &&
    definition.label === defaultDefinition.label &&
    definition.isActive === defaultDefinition.isActive
  );
}

function mergeContextTagDefinitions(
  current: DrinkContextTagDefinition[],
  incoming: DrinkContextTagDefinition[],
): { definitions: DrinkContextTagDefinition[]; changedCount: number } {
  const definitions = current.map((definition) => ({ ...definition }));
  let changedCount = 0;

  for (const imported of incoming) {
    const existingIndex = definitions.findIndex(
      (definition) => definition.value === imported.value,
    );

    if (existingIndex >= 0) {
      const existing = definitions[existingIndex];
      if (!isUnchangedDefaultTag(existing)) continue;
      const createsActiveLabelConflict =
        imported.isActive &&
        definitions.some(
          (definition, index) =>
            index !== existingIndex &&
            definition.isActive &&
            definition.label.toLocaleLowerCase() ===
              imported.label.toLocaleLowerCase(),
        );
      if (createsActiveLabelConflict) continue;
      if (
        existing.label !== imported.label ||
        existing.isActive !== imported.isActive
      ) {
        definitions[existingIndex] = { ...imported };
        changedCount += 1;
      }
      continue;
    }

    const createsActiveLabelConflict =
      imported.isActive &&
      definitions.some(
        (definition) =>
          definition.isActive &&
          definition.label.toLocaleLowerCase() ===
            imported.label.toLocaleLowerCase(),
      );
    if (createsActiveLabelConflict) continue;

    definitions.push({ ...imported });
    changedCount += 1;
  }

  return { definitions, changedCount };
}

export function mergeDrinkBackupData(
  current: DrinkBackupData,
  incoming: DrinkBackupData,
): DrinkBackupMergeResult {
  const existingEntryIds = new Set(current.entries.map((entry) => entry.id));
  const newEntries = incoming.entries.filter((entry) => {
    if (existingEntryIds.has(entry.id)) return false;
    existingEntryIds.add(entry.id);
    return true;
  });
  const entries = [...current.entries, ...newEntries].sort(
    (first, second) => first.timestamp - second.timestamp,
  );

  const savedDrinks = current.savedDrinks.map((drink) => ({ ...drink }));
  const savedDrinkIds = new Set(savedDrinks.map((drink) => drink.id));
  const savedDrinkNames = new Set(
    savedDrinks.map((drink) => drink.name.trim().toLocaleLowerCase()),
  );
  let addedSavedDrinks = 0;
  for (const drink of incoming.savedDrinks) {
    const normalizedName = drink.name.trim().toLocaleLowerCase();
    if (
      savedDrinkIds.has(drink.id) ||
      savedDrinkNames.has(normalizedName)
    ) {
      continue;
    }
    savedDrinks.push({ ...drink });
    savedDrinkIds.add(drink.id);
    savedDrinkNames.add(normalizedName);
    addedSavedDrinks += 1;
  }

  const stockPurchases = current.stockPurchases.map((purchase) => ({
    ...purchase,
  }));
  const stockPurchaseIds = new Set(
    stockPurchases.map((purchase) => purchase.id),
  );
  const newStockPurchases = incoming.stockPurchases.filter((purchase) => {
    if (stockPurchaseIds.has(purchase.id)) return false;
    stockPurchaseIds.add(purchase.id);
    return true;
  });
  stockPurchases.push(...newStockPurchases.map((purchase) => ({ ...purchase })));

  const { definitions: contextTagDefinitions, changedCount } =
    mergeContextTagDefinitions(
      current.contextTagDefinitions,
      incoming.contextTagDefinitions,
    );

  const dailyGoalOverrides: DailyGoalOverrides = {
    ...incoming.dailyGoalOverrides,
    ...current.dailyGoalOverrides,
  };
  const addedGoalOverrides = Object.keys(dailyGoalOverrides).length -
    Object.keys(current.dailyGoalOverrides).length;
  const importedDailyGoal =
    current.dailyStandardDrinkGoal === null &&
    incoming.dailyStandardDrinkGoal !== null;

  return {
    data: {
      entries,
      savedDrinks,
      stockPurchases,
      dailyStandardDrinkGoal: importedDailyGoal
        ? incoming.dailyStandardDrinkGoal
        : current.dailyStandardDrinkGoal,
      dailyGoalOverrides,
      contextTagDefinitions,
    },
    added: {
      entries: newEntries.length,
      savedDrinks: addedSavedDrinks,
      stockPurchases: newStockPurchases.length,
      dailyGoalOverrides: addedGoalOverrides,
      contextTagDefinitions: changedCount,
      dailyStandardDrinkGoal: importedDailyGoal ? 1 : 0,
    },
  };
}
