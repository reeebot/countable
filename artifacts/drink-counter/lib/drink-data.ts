export type VolumeUnit = 'fl oz' | 'ml';

export const DRINK_CONTEXT_TAGS = [
  { value: 'social', label: 'Social' },
  { value: 'stress', label: 'Stress' },
  { value: 'celebration', label: 'Celebration' },
  { value: 'relaxing', label: 'Relaxing' },
  { value: 'routine', label: 'Routine' },
  { value: 'craving', label: 'Craving' },
  { value: 'other', label: 'Other' },
] as const;

export type DrinkContextTag = string;

export type DrinkContextTagDefinition = {
  value: DrinkContextTag;
  label: string;
  isActive: boolean;
};

export const DEFAULT_DRINK_CONTEXT_TAGS: DrinkContextTagDefinition[] =
  DRINK_CONTEXT_TAGS.map(({ value, label }) => ({
    value,
    label,
    isActive: true,
  }));

export const DRINK_TIME_PERIODS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'lateNight', label: 'Late night' },
] as const;

export type DrinkTimePeriod =
  (typeof DRINK_TIME_PERIODS)[number]['value'];

export function isDrinkContextTag(value: unknown): value is DrinkContextTag {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
}

export function drinkContextTagLabel(
  tag: DrinkContextTag,
  definitions: readonly DrinkContextTagDefinition[] = DEFAULT_DRINK_CONTEXT_TAGS,
): string {
  return definitions.find((option) => option.value === tag)?.label ??
    DRINK_CONTEXT_TAGS.find((option) => option.value === tag)?.label ??
    tag;
}

export type DrinkDetails = {
  name: string;
  alcoholPercent: number;
  volume: number;
  unit: VolumeUnit;
  caloriesPer100Ml?: number | null;
};

export type DrinkEntry = {
  id: string;
  timestamp: number;
  name: string;
  alcoholPercent: number | null;
  volume: number | null;
  unit: VolumeUnit | null;
  caloriesPer100Ml: number | null;
  contextTags?: DrinkContextTag[];
  stockDeductions?: StockDeduction[];
};

export type StockDeduction = {
  purchaseId: string;
  volumeMl: number;
};

export type RemovedDrinkEntry = {
  entry: DrinkEntry;
  index: number;
};

export const DRINK_REMOVAL_UNDO_WINDOW_MS = 5000;

export type DailyDrinkSummary = {
  dayKey: string;
  entries: DrinkEntry[];
  standardDrinks: number;
  entriesWithoutDetails: number;
  calories: number;
  entriesWithCalories: number;
};

export type WeeklyDrinkSummary = {
  startTimestamp: number;
  endExclusiveTimestamp: number;
  entries: DrinkEntry[];
  standardDrinks: number;
  entriesWithoutDetails: number;
};

export type WeeklyDailyGoalSummary = {
  daysWithoutGoals: number;
  plannedStandardDrinks: number | null;
};
export type WeeklyDrinkDaySummary = {
  dayKey: string;
  startTimestamp: number;
  entries: DrinkEntry[];
  standardDrinks: number;
  entriesWithoutDetails: number;
};

export type SavedDrink = DrinkDetails & {
  id: string;
  savedAt: number;
  isFavorite?: boolean;
};

export type DailyGoalOverrides = Record<string, number>;

export type RecentDrinkPattern = {
  startTimestamp: number;
  endExclusiveTimestamp: number;
  totalStandardDrinks: number;
  averageWeeklyStandardDrinks: number;
  weekdayAverages: number[];
  dayShares: number[];
  loggedEntryCount: number;
  usesWeekendFallback: boolean;
};

export type DrinkContextComparison = {
  tag: DrinkContextTag;
  taggedDayCount: number;
  otherTaggedDayCount: number;
  averageStandardDrinksOnTaggedDays: number;
  averageStandardDrinksOnOtherTaggedDays: number;
};

export type DrinkPatternInsights = {
  startTimestamp: number;
  endExclusiveTimestamp: number;
  loggedEntryCount: number;
  loggedDayCount: number;
  hasEnoughData: boolean;
  totalStandardDrinks: number;
  entriesWithoutDetails: number;
  timePeriodCounts: Record<DrinkTimePeriod, number>;
  weekdayLoggedDayCount: number;
  weekendLoggedDayCount: number;
  averageStandardDrinksOnWeekdays: number | null;
  averageStandardDrinksOnWeekends: number | null;
  contextComparisons: DrinkContextComparison[];
};

export type DrinkPatternPeriod = Pick<
  DrinkPatternInsights,
  | 'startTimestamp'
  | 'endExclusiveTimestamp'
  | 'loggedEntryCount'
  | 'loggedDayCount'
  | 'totalStandardDrinks'
  | 'entriesWithoutDetails'
  | 'timePeriodCounts'
  | 'weekdayLoggedDayCount'
  | 'weekendLoggedDayCount'
  | 'averageStandardDrinksOnWeekdays'
  | 'averageStandardDrinksOnWeekends'
>;

export type DrinkPatternPeriodComparison = {
  previous: DrinkPatternPeriod;
  recent: DrinkPatternPeriod;
  standardDrinkChange: number;
  timePeriodShareChanges: Record<DrinkTimePeriod, number>;
};

export const DRINK_PATTERN_WINDOW_DAYS = 28;
export const DRINK_PATTERN_MIN_ENTRIES = 12;
export const DRINK_PATTERN_MIN_LOGGED_DAYS = 6;
export const DRINK_CONTEXT_COMPARISON_MIN_DAYS = 4;

export type SuggestedTaperGoals = {
  goals: DailyGoalOverrides;
  weeklyTargets: number[];
  startDayKey: string;
  endDayKey: string;
  usesWeekendFallback: boolean;
};

export const ENTRIES_STORAGE_KEY = '@daily-drink-counter/entries';
export const SAVED_DRINKS_STORAGE_KEY = '@daily-drink-counter/saved-drinks';
export const DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY =
  '@daily-drink-counter/daily-standard-drink-goal';
export const DAILY_GOAL_OVERRIDES_STORAGE_KEY =
  '@daily-drink-counter/daily-goal-overrides';
export const DRINK_CONTEXT_TAGS_STORAGE_KEY =
  '@daily-drink-counter/context-tags';
export const MAX_SAVED_ENTRIES = 1000;

export type DrinkStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type ReliableStorageWriter<T> = {
  save: (value: T) => void;
  retry: () => void;
  flush: () => Promise<void>;
};

export function createReliableStorageWriter<T>(
  initialValue: T,
  persist: (value: T) => Promise<void>,
  onChange: (value: T) => void,
  onFailure: () => void,
  onSuccess: (value: T) => void,
): ReliableStorageWriter<T> {
  let persistedValue = initialValue;
  let requestedValue = initialValue;
  let revision = 0;
  let completedRevision = 0;
  let isWriting = false;
  let hasFailedValue = false;
  let failedValue: T | undefined;
  const flushWaiters: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  const settleFlushWaiters = () => {
    if (isWriting || flushWaiters.length === 0) return;
    const waiters = flushWaiters.splice(0);
    for (const waiter of waiters) {
      if (hasFailedValue) {
        waiter.reject(new Error('Storage save failed.'));
      } else {
        waiter.resolve();
      }
    }
  };

  const writePendingValues = async () => {
    if (isWriting) return;
    isWriting = true;

    while (completedRevision < revision) {
      const attemptedRevision = revision;
      const attemptedValue = requestedValue;
      try {
        await persist(attemptedValue);
        persistedValue = attemptedValue;
        completedRevision = attemptedRevision;
        onChange(persistedValue);
        onSuccess(persistedValue);
      } catch {
        failedValue = requestedValue;
        hasFailedValue = true;
        requestedValue = persistedValue;
        completedRevision = revision;
        onChange(persistedValue);
        onFailure();
        break;
      }
    }

    isWriting = false;
    settleFlushWaiters();
  };

  const save = (value: T) => {
    requestedValue = value;
    hasFailedValue = false;
    revision += 1;
    onChange(value);
    void writePendingValues();
  };

  return {
    save,
    flush() {
      if (!isWriting) {
        return hasFailedValue
          ? Promise.reject(new Error('Storage save failed.'))
          : Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        flushWaiters.push({ resolve, reject });
      });
    },
    retry() {
      if (!hasFailedValue) return;
      const valueToRetry = failedValue as T;
      hasFailedValue = false;
      save(valueToRetry);
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeDrinkEntries(value: unknown): {
  entries: DrinkEntry[];
  migrated: boolean;
} | null {
  if (!Array.isArray(value)) return null;

  const entries: DrinkEntry[] = [];
  let migrated = false;

  for (const item of value) {
    if (
      !isObject(item) ||
      typeof item.id !== 'string' ||
      typeof item.timestamp !== 'number' ||
      !Number.isFinite(item.timestamp)
    ) {
      return null;
    }

    const rawContextTags = item.contextTags;
    let contextTags: DrinkContextTag[] | undefined;
    if (rawContextTags !== undefined) {
      contextTags = Array.isArray(rawContextTags)
        ? Array.from(new Set(rawContextTags.filter(isDrinkContextTag)))
        : [];
      if (
        !Array.isArray(rawContextTags) ||
        rawContextTags.length !== contextTags.length ||
        rawContextTags.some((tag, index) => tag !== contextTags?.[index])
      ) {
        migrated = true;
      }
    }
    const optionalContextTags =
      contextTags === undefined ? {} : { contextTags };
    const rawStockDeductions = item.stockDeductions;
    let stockDeductions: StockDeduction[] | undefined;
    if (rawStockDeductions !== undefined) {
      const validDeductions = Array.isArray(rawStockDeductions)
        ? rawStockDeductions.filter(
            (deduction) =>
              isObject(deduction) &&
              typeof deduction.purchaseId === 'string' &&
              deduction.purchaseId.trim().length > 0 &&
              deduction.purchaseId.length <= 120 &&
              typeof deduction.volumeMl === 'number' &&
              Number.isFinite(deduction.volumeMl) &&
              deduction.volumeMl > 0,
          )
        : [];
      stockDeductions = validDeductions.map((deduction) => ({
        purchaseId: (deduction as Record<string, unknown>)
          .purchaseId as string,
        volumeMl: (deduction as Record<string, unknown>).volumeMl as number,
      }));
      if (
        !Array.isArray(rawStockDeductions) ||
        validDeductions.length !== rawStockDeductions.length
      ) {
        migrated = true;
      }
    }
    const optionalStockDeductions =
      stockDeductions === undefined ? {} : { stockDeductions };

    const hasDrinkDetails =
      'name' in item ||
      'alcoholPercent' in item ||
      'volume' in item ||
      'unit' in item;
    const rawCaloriesPer100Ml = item.caloriesPer100Ml;
    if (
      rawCaloriesPer100Ml !== undefined &&
      rawCaloriesPer100Ml !== null &&
      (typeof rawCaloriesPer100Ml !== 'number' ||
        !Number.isFinite(rawCaloriesPer100Ml) ||
        rawCaloriesPer100Ml < 0 ||
        rawCaloriesPer100Ml > 2000)
    ) {
      return null;
    }
    if (rawCaloriesPer100Ml === undefined) migrated = true;
    const caloriesPer100Ml =
      typeof rawCaloriesPer100Ml === 'number' ? rawCaloriesPer100Ml : null;

    if (!hasDrinkDetails) {
      entries.push({
        id: item.id,
        timestamp: item.timestamp,
        name: 'Drink',
        alcoholPercent: null,
        volume: null,
        unit: null,
        caloriesPer100Ml,
        ...optionalContextTags,
        ...optionalStockDeductions,
      });
      migrated = true;
      continue;
    }

    const isLegacyDetails =
      item.alcoholPercent === null &&
      item.volume === null &&
      item.unit === null;

    const hasValidDetails =
      typeof item.alcoholPercent === 'number' &&
      Number.isFinite(item.alcoholPercent) &&
      item.alcoholPercent >= 0 &&
      item.alcoholPercent <= 100 &&
      typeof item.volume === 'number' &&
      Number.isFinite(item.volume) &&
      item.volume > 0 &&
      (item.unit === 'fl oz' || item.unit === 'ml');

    if (
      typeof item.name !== 'string' ||
      (!isLegacyDetails && !hasValidDetails)
    ) {
      return null;
    }

    entries.push({
      id: item.id,
      timestamp: item.timestamp,
      name: item.name,
      alcoholPercent: isLegacyDetails ? null : item.alcoholPercent as number,
      volume: isLegacyDetails ? null : item.volume as number,
      unit: isLegacyDetails ? null : item.unit as VolumeUnit,
      caloriesPer100Ml,
      ...optionalContextTags,
      ...optionalStockDeductions,
    });
  }

  return { entries, migrated };
}

export function normalizeDrinkContextTagDefinitions(
  value: unknown,
): DrinkContextTagDefinition[] | null {
  if (!Array.isArray(value)) return null;

  const definitions: DrinkContextTagDefinition[] = [];
  const ids = new Set<string>();
  const activeLabels = new Set<string>();
  for (const item of value) {
    if (
      !isObject(item) ||
      !isDrinkContextTag(item.value) ||
      typeof item.label !== 'string' ||
      item.label.trim().length === 0 ||
      item.label.trim().length > 60 ||
      typeof item.isActive !== 'boolean' ||
      ids.has(item.value)
    ) {
      return null;
    }
    const normalizedLabel = item.label.trim();
    const normalizedKey = normalizedLabel.toLocaleLowerCase();
    if (item.isActive && activeLabels.has(normalizedKey)) return null;
    ids.add(item.value);
    if (item.isActive) activeLabels.add(normalizedKey);
    definitions.push({
      value: item.value,
      label: normalizedLabel,
      isActive: item.isActive,
    });
  }
  return definitions;
}

export function parseDrinkContextTagDefinitions(
  storedValue: string | null,
): DrinkContextTagDefinition[] {
  if (!storedValue) return DEFAULT_DRINK_CONTEXT_TAGS.map((tag) => ({ ...tag }));

  const parsed: unknown = JSON.parse(storedValue);
  const definitions = normalizeDrinkContextTagDefinitions(parsed);
  if (!definitions) {
    throw new Error('Saved context labels have an unexpected format.');
  }
  return definitions;
}

export async function persistDrinkContextTagDefinitions(
  storage: Pick<DrinkStorage, 'setItem'>,
  definitions: DrinkContextTagDefinition[],
): Promise<void> {
  const normalized = normalizeDrinkContextTagDefinitions(definitions);
  if (!normalized) {
    throw new Error('Context labels have an unexpected format.');
  }
  await storage.setItem(DRINK_CONTEXT_TAGS_STORAGE_KEY, JSON.stringify(normalized));
}

export function addDrinkContextTag(
  definitions: DrinkContextTagDefinition[],
  label: string,
  value: string,
): DrinkContextTagDefinition[] {
  const normalizedLabel = label.trim();
  if (!normalizedLabel || normalizedLabel.length > 60) {
    throw new Error('Enter a label between 1 and 60 characters.');
  }
  const existing = definitions.find(
    (tag) => tag.label.toLocaleLowerCase() === normalizedLabel.toLocaleLowerCase(),
  );
  if (existing) {
    if (existing.isActive) throw new Error('That label is already in use.');
    return definitions.map((tag) =>
      tag.value === existing.value ? { ...tag, isActive: true } : tag,
    );
  }
  if (!isDrinkContextTag(value) || definitions.some((tag) => tag.value === value)) {
    throw new Error('A unique context label ID is required.');
  }
  return [...definitions, { value, label: normalizedLabel, isActive: true }];
}

export function renameDrinkContextTag(
  definitions: DrinkContextTagDefinition[],
  tagValue: DrinkContextTag,
  label: string,
  newValue: string,
): DrinkContextTagDefinition[] {
  const current = definitions.find((tag) => tag.value === tagValue);
  if (!current || !current.isActive) {
    throw new Error('That context label is no longer active.');
  }
  const normalizedLabel = label.trim();
  if (
    !normalizedLabel ||
    normalizedLabel.length > 60 ||
    normalizedLabel.toLocaleLowerCase() === current.label.toLocaleLowerCase()
  ) {
    throw new Error('Choose a different label between 1 and 60 characters.');
  }
  const matchingLabel = definitions.find(
    (tag) =>
      tag.value !== tagValue &&
      tag.label.toLocaleLowerCase() === normalizedLabel.toLocaleLowerCase(),
  );
  if (matchingLabel?.isActive) {
    throw new Error('That label is already in use.');
  }
  if (
    !matchingLabel &&
    (!isDrinkContextTag(newValue) ||
      definitions.some((tag) => tag.value === newValue))
  ) {
    throw new Error('A unique context label ID is required.');
  }

  const updated = definitions.map((tag) => {
    if (tag.value === tagValue) return { ...tag, isActive: false };
    if (matchingLabel && tag.value === matchingLabel.value) {
      return { ...tag, isActive: true };
    }
    return tag;
  });
  return matchingLabel
    ? updated
    : [...updated, { value: newValue, label: normalizedLabel, isActive: true }];
}

export function retireDrinkContextTag(
  definitions: DrinkContextTagDefinition[],
  value: DrinkContextTag,
): DrinkContextTagDefinition[] {
  return definitions.map((tag) =>
    tag.value === value ? { ...tag, isActive: false } : tag,
  );
}

export function restoreDrinkContextTag(
  definitions: DrinkContextTagDefinition[],
  value: DrinkContextTag,
): DrinkContextTagDefinition[] {
  const target = definitions.find((tag) => tag.value === value);
  if (!target) return definitions;
  if (
    definitions.some(
      (tag) =>
        tag.isActive &&
        tag.value !== value &&
        tag.label.toLocaleLowerCase() === target.label.toLocaleLowerCase(),
    )
  ) {
    throw new Error('A context label with that name is already active.');
  }
  return definitions.map((tag) =>
    tag.value === value ? { ...tag, isActive: true } : tag,
  );
}

export function isSavedDrinkList(value: unknown): value is SavedDrink[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isObject(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        item.name.trim().length > 0 &&
        typeof item.savedAt === 'number' &&
        Number.isFinite(item.savedAt) &&
        typeof item.alcoholPercent === 'number' &&
        Number.isFinite(item.alcoholPercent) &&
        item.alcoholPercent >= 0 &&
        item.alcoholPercent <= 100 &&
        typeof item.volume === 'number' &&
        Number.isFinite(item.volume) &&
        item.volume > 0 &&
        (item.unit === 'fl oz' || item.unit === 'ml') &&
        (item.caloriesPer100Ml === undefined ||
          item.caloriesPer100Ml === null ||
          (typeof item.caloriesPer100Ml === 'number' &&
            Number.isFinite(item.caloriesPer100Ml) &&
            item.caloriesPer100Ml >= 0 &&
            item.caloriesPer100Ml <= 2000)) &&
        (item.isFavorite === undefined || typeof item.isFavorite === 'boolean'),
    )
  );
}

export function findSavedDrinkNameConflict(
  drinks: SavedDrink[],
  name: string,
  excludingId?: string,
): SavedDrink | undefined {
  const normalizedName = name.trim().toLocaleLowerCase();
  if (!normalizedName) return undefined;

  return drinks.find(
    (drink) =>
      drink.id !== excludingId &&
      drink.name.trim().toLocaleLowerCase() === normalizedName,
  );
}

export function isDrinkDetails(value: unknown): value is DrinkDetails {
  if (!isObject(value)) return false;
  return (
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    typeof value.alcoholPercent === 'number' &&
    Number.isFinite(value.alcoholPercent) &&
    value.alcoholPercent >= 0 &&
    value.alcoholPercent <= 100 &&
    typeof value.volume === 'number' &&
    Number.isFinite(value.volume) &&
    value.volume > 0 &&
    (value.unit === 'fl oz' || value.unit === 'ml') &&
    (value.caloriesPer100Ml === undefined ||
      value.caloriesPer100Ml === null ||
      (typeof value.caloriesPer100Ml === 'number' &&
        Number.isFinite(value.caloriesPer100Ml) &&
        value.caloriesPer100Ml >= 0 &&
        value.caloriesPer100Ml <= 2000))
  );
}

export function caloriesForDrink(
  entry: Pick<DrinkEntry, 'caloriesPer100Ml' | 'volume' | 'unit'>,
): number | null {
  if (
    entry.caloriesPer100Ml === null ||
    entry.volume === null ||
    entry.unit === null
  ) {
    return null;
  }

  const volumeMl = entry.unit === 'fl oz' ? entry.volume * 29.5735 : entry.volume;
  return entry.caloriesPer100Ml * volumeMl / 100;
}

function calculateStandardDrinkEquivalent(
  alcoholPercent: number | null,
  volume: number | null,
  unit: VolumeUnit | null,
): number {
  if (alcoholPercent === null || volume === null || unit === null) {
    return 0;
  }

  const volumeMl = unit === 'fl oz' ? volume * 29.5735 : volume;
  const ethanolGrams = volumeMl * (alcoholPercent / 100) * 0.789;
  return ethanolGrams / 14;
}

export function standardDrinkEquivalent(entry: DrinkEntry): number {
  return calculateStandardDrinkEquivalent(
    entry.alcoholPercent,
    entry.volume,
    entry.unit,
  );
}

export function formatStandardDrinkCount(value: number): string {
  return value.toFixed(1);
}

export function standardDrinkEquivalentFromDetails(
  drink: DrinkDetails,
): number {
  return calculateStandardDrinkEquivalent(
    drink.alcoholPercent,
    drink.volume,
    drink.unit,
  );
}

function csvCell(value: string): string {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function drinkEntriesToCsv(
  entries: DrinkEntry[],
  contextTags: readonly DrinkContextTagDefinition[] = DEFAULT_DRINK_CONTEXT_TAGS,
): string {
  const headers = [
    'Date (local)',
    'Time (local)',
    'Drink',
    'Alcohol by volume (% ABV)',
    'Volume',
    'Volume unit',
    'U.S. standard-drink equivalents',
    'Context tags',
  ];
  const rows = entries.map((entry) => {
    const timestamp = new Date(entry.timestamp);
    const time = [
      String(timestamp.getHours()).padStart(2, '0'),
      String(timestamp.getMinutes()).padStart(2, '0'),
    ].join(':');
    const hasAlcoholDetails =
      entry.alcoholPercent !== null &&
      entry.volume !== null &&
      entry.unit !== null;

    return [
      localDayKey(entry.timestamp),
      time,
      entry.name,
      entry.alcoholPercent === null ? '' : String(entry.alcoholPercent),
      entry.volume === null ? '' : String(entry.volume),
      entry.unit ?? '',
      hasAlcoholDetails
        ? formatStandardDrinkCount(standardDrinkEquivalent(entry))
        : '',
      (entry.contextTags ?? [])
        .map((tag) => drinkContextTagLabel(tag, contextTags))
        .join('; '),
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map((value) => csvCell(String(value))).join(','))
    .join('\r\n');
}

export function formatVolume(volume: number, unit: VolumeUnit): string {
  return `${volume.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

export function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function timestampForLocalDayAtTime(
  dayTimestamp: number,
  hour: number,
  minute: number,
): number | null {
  if (
    !Number.isFinite(dayTimestamp) ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const date = new Date(dayTimestamp);
  date.setHours(0, 0, 0, 0);
  date.setHours(hour, minute, 0, 0);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function drinkTimePeriod(timestamp: number): DrinkTimePeriod {
  const hour = new Date(timestamp).getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'lateNight';
}

export function calculateDrinkPatternInsights(
  entries: DrinkEntry[],
  referenceTimestamp: number,
  contextTags: readonly DrinkContextTagDefinition[] = DEFAULT_DRINK_CONTEXT_TAGS,
): DrinkPatternInsights {
  if (!Number.isFinite(referenceTimestamp)) {
    throw new Error('A valid reference date is required.');
  }

  const end = new Date(referenceTimestamp);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - DRINK_PATTERN_WINDOW_DAYS);

  const timePeriodCounts: Record<DrinkTimePeriod, number> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    lateNight: 0,
  };
  const days = new Map<
    string,
    {
      weekday: number;
      standardDrinks: number;
      contextTags: Set<DrinkContextTag>;
    }
  >();
  let loggedEntryCount = 0;
  let totalStandardDrinks = 0;
  let entriesWithoutDetails = 0;

  for (const entry of entries) {
    if (
      entry.timestamp < start.getTime() ||
      entry.timestamp >= end.getTime()
    ) {
      continue;
    }

    loggedEntryCount += 1;
    timePeriodCounts[drinkTimePeriod(entry.timestamp)] += 1;
    if (
      entry.alcoholPercent === null ||
      entry.volume === null ||
      entry.unit === null
    ) {
      entriesWithoutDetails += 1;
    } else {
      totalStandardDrinks += standardDrinkEquivalent(entry);
    }
    const dayKey = localDayKey(entry.timestamp);
    let day = days.get(dayKey);
    if (!day) {
      day = {
        weekday: new Date(entry.timestamp).getDay(),
        standardDrinks: 0,
        contextTags: new Set<DrinkContextTag>(),
      };
      days.set(dayKey, day);
    }
    if (
      entry.alcoholPercent !== null &&
      entry.volume !== null &&
      entry.unit !== null
    ) {
      day.standardDrinks += standardDrinkEquivalent(entry);
    }
    for (const tag of entry.contextTags ?? []) {
      if (isDrinkContextTag(tag)) day.contextTags.add(tag);
    }
  }

  const loggedDays = Array.from(days.values());
  const weekdayDays = loggedDays.filter(
    (day) => day.weekday !== 0 && day.weekday !== 6,
  );
  const weekendDays = loggedDays.filter(
    (day) => day.weekday === 0 || day.weekday === 6,
  );
  const averageStandardDrinks = (
    selectedDays: typeof loggedDays,
  ): number | null =>
    selectedDays.length === 0
      ? null
      : selectedDays.reduce((total, day) => total + day.standardDrinks, 0) /
        selectedDays.length;
  const hasEnoughData =
    loggedEntryCount >= DRINK_PATTERN_MIN_ENTRIES &&
    loggedDays.length >= DRINK_PATTERN_MIN_LOGGED_DAYS;

  const contextComparisons = hasEnoughData
    ? contextTags.map(({ value: tag }) => {
        const taggedDays = loggedDays.filter((day) =>
          day.contextTags.has(tag),
        );
        const otherTaggedDays = loggedDays.filter(
          (day) => day.contextTags.size > 0 && !day.contextTags.has(tag),
        );
        if (
          taggedDays.length < DRINK_CONTEXT_COMPARISON_MIN_DAYS ||
          otherTaggedDays.length < DRINK_CONTEXT_COMPARISON_MIN_DAYS
        ) {
          return null;
        }
        return {
          tag,
          taggedDayCount: taggedDays.length,
          otherTaggedDayCount: otherTaggedDays.length,
          averageStandardDrinksOnTaggedDays:
            averageStandardDrinks(taggedDays) ?? 0,
          averageStandardDrinksOnOtherTaggedDays:
            averageStandardDrinks(otherTaggedDays) ?? 0,
        };
      })
        .filter(
          (comparison): comparison is DrinkContextComparison =>
            comparison !== null,
        )
        .sort(
          (first, second) =>
            second.taggedDayCount - first.taggedDayCount,
        )
    : [];

  return {
    startTimestamp: start.getTime(),
    endExclusiveTimestamp: end.getTime(),
    loggedEntryCount,
    loggedDayCount: loggedDays.length,
    hasEnoughData,
    totalStandardDrinks,
    entriesWithoutDetails,
    timePeriodCounts,
    weekdayLoggedDayCount: weekdayDays.length,
    weekendLoggedDayCount: weekendDays.length,
    averageStandardDrinksOnWeekdays:
      weekdayDays.length > 0 ? averageStandardDrinks(weekdayDays) : null,
    averageStandardDrinksOnWeekends:
      weekendDays.length > 0 ? averageStandardDrinks(weekendDays) : null,
    contextComparisons,
  };
}

export function calculateRecentDrinkPatternComparison(
  entries: DrinkEntry[],
  referenceTimestamp: number,
): DrinkPatternPeriodComparison | null {
  const recent = calculateDrinkPatternInsights(entries, referenceTimestamp);
  const previous = calculateDrinkPatternInsights(
    entries,
    recent.startTimestamp,
  );

  if (!recent.hasEnoughData || !previous.hasEnoughData) return null;

  const toPeriod = (insights: DrinkPatternInsights): DrinkPatternPeriod => ({
    startTimestamp: insights.startTimestamp,
    endExclusiveTimestamp: insights.endExclusiveTimestamp,
    loggedEntryCount: insights.loggedEntryCount,
    loggedDayCount: insights.loggedDayCount,
    totalStandardDrinks: insights.totalStandardDrinks,
    entriesWithoutDetails: insights.entriesWithoutDetails,
    timePeriodCounts: insights.timePeriodCounts,
    weekdayLoggedDayCount: insights.weekdayLoggedDayCount,
    weekendLoggedDayCount: insights.weekendLoggedDayCount,
    averageStandardDrinksOnWeekdays:
      insights.averageStandardDrinksOnWeekdays,
    averageStandardDrinksOnWeekends:
      insights.averageStandardDrinksOnWeekends,
  });
  const timePeriodShareChanges = Object.fromEntries(
    DRINK_TIME_PERIODS.map(({ value }) => [
      value,
      (recent.timePeriodCounts[value] / recent.loggedEntryCount) * 100 -
        (previous.timePeriodCounts[value] / previous.loggedEntryCount) * 100,
    ]),
  ) as Record<DrinkTimePeriod, number>;

  return {
    previous: toPeriod(previous),
    recent: toPeriod(recent),
    standardDrinkChange:
      recent.totalStandardDrinks - previous.totalStandardDrinks,
    timePeriodShareChanges,
  };
}

export function isValidLocalDateRange(
  startDayKey: string,
  endDayKey: string,
): boolean {
  return (
    isValidLocalDayKey(startDayKey) &&
    isValidLocalDayKey(endDayKey) &&
    startDayKey <= endDayKey
  );
}

export function filterDrinkEntriesByLocalDateRange(
  entries: DrinkEntry[],
  startDayKey: string,
  endDayKey: string,
): DrinkEntry[] {
  if (!isValidLocalDateRange(startDayKey, endDayKey)) {
    throw new Error('Choose a valid start and end date.');
  }

  return entries.filter((entry) => {
    const dayKey = localDayKey(entry.timestamp);
    return dayKey >= startDayKey && dayKey <= endDayKey;
  });
}

export function removeDrinkEntry(
  entries: DrinkEntry[],
  entryId: string,
): { entries: DrinkEntry[]; removed: RemovedDrinkEntry } | null {
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (index === -1) return null;

  return {
    entries: entries.filter((entry) => entry.id !== entryId),
    removed: { entry: entries[index], index },
  };
}

export function restoreRemovedDrinkEntry(
  entries: DrinkEntry[],
  removed: RemovedDrinkEntry,
): DrinkEntry[] | null {
  if (entries.some((entry) => entry.id === removed.entry.id)) return null;

  const restoreIndex = Math.min(removed.index, entries.length);
  return [
    ...entries.slice(0, restoreIndex),
    removed.entry,
    ...entries.slice(restoreIndex),
  ];
}

export function getDrinkEntryRestoreIndex(
  entries: DrinkEntry[],
  originalOrder: string[],
  entryId: string,
): number | null {
  const targetOrderIndex = originalOrder.indexOf(entryId);
  if (targetOrderIndex === -1) return null;

  return entries.reduce((restoreIndex, entry) => {
    const entryOrderIndex = originalOrder.indexOf(entry.id);
    return restoreIndex + (entryOrderIndex !== -1 && entryOrderIndex < targetOrderIndex ? 1 : 0);
  }, 0);
}

export function scheduleDrinkRemovalUndoExpiry(
  onExpire: () => void,
  schedule: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout> = setTimeout,
): ReturnType<typeof setTimeout> {
  return schedule(onExpire, DRINK_REMOVAL_UNDO_WINDOW_MS);
}

export function summarizeDrinkEntriesByLocalDay(
  entries: DrinkEntry[],
): DailyDrinkSummary[] {
  const summaries = new Map<string, DailyDrinkSummary>();

  for (const entry of entries) {
    const dayKey = localDayKey(entry.timestamp);
    let summary = summaries.get(dayKey);
    if (!summary) {
      summary = {
        dayKey,
        entries: [],
        standardDrinks: 0,
        entriesWithoutDetails: 0,
        calories: 0,
        entriesWithCalories: 0,
      };
      summaries.set(dayKey, summary);
    }

    summary.entries.push(entry);
    summary.standardDrinks += standardDrinkEquivalent(entry);
    const calories = caloriesForDrink(entry);
    if (calories !== null) {
      summary.calories += calories;
      summary.entriesWithCalories += 1;
    }
    if (
      entry.alcoholPercent === null ||
      entry.volume === null ||
      entry.unit === null
    ) {
      summary.entriesWithoutDetails += 1;
    }
  }

  return Array.from(summaries.values()).sort((first, second) =>
    second.dayKey.localeCompare(first.dayKey),
  );
}

export function compareDailyDrinkSummaryToGoal(
  summary: Pick<DailyDrinkSummary, 'standardDrinks' | 'entries' | 'entriesWithoutDetails'> | undefined,
  goal: number | null | undefined,
): DailyGoalComparison | null {
  if (
    !summary ||
    summary.entries.length === 0 ||
    summary.entriesWithoutDetails > 0 ||
    goal === null ||
    goal === undefined
  ) {
    return null;
  }

  const actualHundredths = Math.round(summary.standardDrinks * 100);
  const goalHundredths = Math.round(goal * 100);
  if (actualHundredths < goalHundredths) return 'under';
  if (actualHundredths > goalHundredths) return 'over';
  return 'met';
}
export function summarizeDrinkEntriesForLocalWeek(
  entries: DrinkEntry[],
  referenceTimestamp: number,
): WeeklyDrinkSummary {
  const weekStart = new Date(shiftLocalWeek(referenceTimestamp, 0));

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekEntries = entries.filter(
    (entry) =>
      entry.timestamp >= weekStart.getTime() &&
      entry.timestamp < weekEnd.getTime(),
  );

  return {
    startTimestamp: weekStart.getTime(),
    endExclusiveTimestamp: weekEnd.getTime(),
    entries: weekEntries,
    standardDrinks: weekEntries.reduce(
      (total, entry) => total + standardDrinkEquivalent(entry),
      0,
    ),
    entriesWithoutDetails: weekEntries.filter(
      (entry) =>
        entry.alcoholPercent === null ||
        entry.volume === null ||
        entry.unit === null,
    ).length,
  };
}

export function summarizeDrinkEntriesByLocalWeek(
  entries: DrinkEntry[],
  referenceTimestamp: number,
): WeeklyDrinkDaySummary[] {
  const weekStart = new Date(shiftLocalWeek(referenceTimestamp, 0));

  return Array.from({ length: 7 }, (_, dayOffset) => {
    const dayStart = new Date(weekStart);
    dayStart.setDate(dayStart.getDate() + dayOffset);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dayEntries = entries.filter(
      (entry) =>
        entry.timestamp >= dayStart.getTime() &&
        entry.timestamp < dayEnd.getTime(),
    );

    return {
      dayKey: localDayKey(dayStart.getTime()),
      startTimestamp: dayStart.getTime(),
      entries: dayEntries,
      standardDrinks: dayEntries.reduce(
        (total, entry) => total + standardDrinkEquivalent(entry),
        0,
      ),
      entriesWithoutDetails: dayEntries.filter(
        (entry) =>
          entry.alcoholPercent === null ||
          entry.volume === null ||
          entry.unit === null,
      ).length,
    };
  });
}

export function shiftLocalWeek(
  referenceTimestamp: number,
  weekOffset: number,
): number {
  const weekStart = new Date(referenceTimestamp);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + weekOffset * 7);
  return weekStart.getTime();
}
export function createDrinkId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function confirmSavedDrinkRemoval(
  drinkName: string,
  isWeb: boolean,
  confirmOnWeb: (message: string) => boolean,
  showNativeAlert: (
    title: string,
    message: string,
    buttons: SavedDrinkConfirmationButton[],
  ) => void,
  onConfirm: () => void,
): void {
  const message =
    `Remove “${drinkName}” from your saved drinks? ` +
    'Drinks already logged will keep their original details.';

  if (isWeb) {
    if (confirmOnWeb(`Remove saved drink?\n\n${message}`)) onConfirm();
    return;
  }

  showNativeAlert('Remove saved drink?', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

export function confirmSavedDrinkNameConflict(
  conflictingDrinkName: string,
  editedDrinkName: string,
  isWeb: boolean,
  confirmOnWeb: (message: string) => boolean,
  showNativeAlert: (
    title: string,
    message: string,
    buttons: SavedDrinkConfirmationButton[],
  ) => void,
  onConfirm: () => void,
): void {
  const conflictMessage =
    `“${conflictingDrinkName}” is already in your saved drinks. ` +
    `Replace its saved details with these edits and remove “${editedDrinkName}”? ` +
    'Drinks already logged will keep their original details.';

  if (isWeb) {
    if (
      confirmOnWeb(
        `${conflictMessage}\n\nChoose OK to replace it, or Cancel to change the name.`,
      )
    ) {
      onConfirm();
    }
    return;
  }

  showNativeAlert(
    'A saved drink already uses this name',
    conflictMessage,
    [
      { text: 'Change name', style: 'cancel' },
      {
        text: 'Replace saved drink',
        style: 'destructive',
        onPress: onConfirm,
      },
    ],
  );
}

export function removeSavedDrinkDefinition(
  drinks: SavedDrink[],
  drinkId: string,
): SavedDrink[] {
  return drinks.filter((drink) => drink.id !== drinkId);
}

export function toggleSavedDrinkFavorite(
  drinks: SavedDrink[],
  drinkId: string,
): SavedDrink[] {
  return drinks.map((drink) =>
    drink.id === drinkId
      ? { ...drink, isFavorite: drink.isFavorite !== true }
      : drink,
  );
}

export function sortSavedDrinksForQuickAccess(
  drinks: SavedDrink[],
): SavedDrink[] {
  return drinks.slice().sort(
    (first, second) =>
      Number(second.isFavorite === true) - Number(first.isFavorite === true) ||
      second.savedAt - first.savedAt,
  );
}

export function parseSavedDrinkList(storedValue: string | null): SavedDrink[] {
  if (!storedValue) return [];

  const parsed: unknown = JSON.parse(storedValue);
  if (!isSavedDrinkList(parsed)) {
    throw new Error('Saved drinks have an unexpected format.');
  }
  return parsed;
}

export function persistSavedDrinkList(
  storage: Pick<DrinkStorage, 'setItem'>,
  drinks: SavedDrink[],
): Promise<void> {
  return storage.setItem(SAVED_DRINKS_STORAGE_KEY, JSON.stringify(drinks));
}

export function normalizeDailyStandardDrinkGoal(value: unknown): number | null {
  const normalizedValue =
    typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const goal =
    typeof normalizedValue === 'number'
      ? normalizedValue
      : typeof normalizedValue === 'string' && normalizedValue.length > 0
        ? Number(normalizedValue)
        : Number.NaN;
  if (!Number.isFinite(goal) || goal <= 0) return null;

  const roundedGoal = Math.round(goal * 100) / 100;
  return Number.isFinite(roundedGoal) && roundedGoal > 0 ? roundedGoal : null;
}

export function parseDailyStandardDrinkGoal(
  storedValue: string | null,
): number | null {
  return normalizeDailyStandardDrinkGoal(storedValue);
}

export async function persistDailyStandardDrinkGoal(
  storage: Pick<DrinkStorage, 'setItem'>,
  goal: number | null,
): Promise<void> {
  const normalizedGoal =
    goal === null ? null : normalizeDailyStandardDrinkGoal(goal);
  if (goal !== null && normalizedGoal === null) {
    throw new Error('Daily standard-drink goal must be greater than zero.');
  }
  await storage.setItem(
    DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY,
    normalizedGoal === null ? '' : String(normalizedGoal),
  );
}

export function normalizeDailyGoalOverride(value: unknown): number | null {
  const normalizedValue =
    typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const goal =
    typeof normalizedValue === 'number'
      ? normalizedValue
      : typeof normalizedValue === 'string' && normalizedValue.length > 0
        ? Number(normalizedValue)
        : Number.NaN;
  if (!Number.isFinite(goal) || goal < 0) return null;

  const roundedGoal = Math.round(goal * 100) / 100;
  return Number.isFinite(roundedGoal) ? roundedGoal : null;
}

function isValidLocalDayKey(dayKey: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function normalizeDailyGoalOverrides(
  value: unknown,
): DailyGoalOverrides | null {
  if (!isObject(value)) return null;

  const overrides: DailyGoalOverrides = {};
  for (const [dayKey, rawGoal] of Object.entries(value)) {
    const goal = normalizeDailyGoalOverride(rawGoal);
    if (!isValidLocalDayKey(dayKey) || goal === null) return null;
    overrides[dayKey] = goal;
  }
  return overrides;
}

export function parseDailyGoalOverrides(
  storedValue: string | null,
): DailyGoalOverrides {
  if (!storedValue) return {};

  const parsed: unknown = JSON.parse(storedValue);
  const overrides = normalizeDailyGoalOverrides(parsed);
  if (!overrides) {
    throw new Error('Date-specific goals have an unexpected format.');
  }
  return overrides;
}

export async function persistDailyGoalOverrides(
  storage: Pick<DrinkStorage, 'setItem'>,
  overrides: DailyGoalOverrides,
): Promise<void> {
  const normalized = normalizeDailyGoalOverrides(overrides);
  if (!normalized) {
    throw new Error('Date-specific goals have an unexpected format.');
  }
  await storage.setItem(
    DAILY_GOAL_OVERRIDES_STORAGE_KEY,
    JSON.stringify(normalized),
  );
}

export function calculateRecentDrinkPattern(
  entries: DrinkEntry[],
  referenceTimestamp: number,
): RecentDrinkPattern {
  if (!Number.isFinite(referenceTimestamp)) {
    throw new Error('A valid reference date is required.');
  }

  const end = new Date(referenceTimestamp);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 28);

  const weekdayTotals = Array.from({ length: 7 }, () => 0);
  const weekdayCounts = Array.from({ length: 7 }, () => 0);
  for (let offset = 0; offset < 28; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    weekdayCounts[day.getDay()] += 1;
  }

  let loggedEntryCount = 0;
  for (const entry of entries) {
    if (
      entry.timestamp < start.getTime() ||
      entry.timestamp >= end.getTime()
    ) {
      continue;
    }
    weekdayTotals[new Date(entry.timestamp).getDay()] +=
      standardDrinkEquivalent(entry);
    loggedEntryCount += 1;
  }

  const totalStandardDrinks = weekdayTotals.reduce(
    (total, amount) => total + amount,
    0,
  );
  const weekdayAverages = weekdayTotals.map(
    (amount, weekday) => amount / weekdayCounts[weekday],
  );
  const usesWeekendFallback = totalStandardDrinks <= 0;
  const weekendWeightedShares = [1.05, 1, 1, 1, 1, 1.35, 1.65];
  const fallbackTotal = weekendWeightedShares.reduce(
    (total, weight) => total + weight,
    0,
  );
  const fallbackShares = weekendWeightedShares.map(
    (weight) => weight / fallbackTotal,
  );
  const historicalShares = usesWeekendFallback
    ? fallbackShares
    : weekdayAverages.map((amount) => amount / totalStandardDrinks);
  const dayShares = usesWeekendFallback
    ? fallbackShares
    : historicalShares.map(
        (share, weekday) => share * 0.8 + fallbackShares[weekday] * 0.2,
      );

  return {
    startTimestamp: start.getTime(),
    endExclusiveTimestamp: end.getTime(),
    totalStandardDrinks,
    averageWeeklyStandardDrinks:
      Math.round((totalStandardDrinks / 4) * 100) / 100,
    weekdayAverages,
    dayShares,
    loggedEntryCount,
    usesWeekendFallback,
  };
}

export function suggestTaperGoalOverrides(
  entries: DrinkEntry[],
  startTimestamp: number,
  startingWeeklyTotal: number,
  targetWeeklyTotal: number,
  weeks: number,
  referenceTimestamp: number,
): SuggestedTaperGoals {
  const startGoal = normalizeDailyGoalOverride(startingWeeklyTotal);
  const targetGoal = normalizeDailyGoalOverride(targetWeeklyTotal);
  if (
    startGoal === null ||
    targetGoal === null ||
    startGoal <= 0 ||
    targetGoal >= startGoal
  ) {
    throw new Error('The target must be below a positive starting total.');
  }
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
    throw new Error('Choose a plan length from 1 to 52 weeks.');
  }
  if (!Number.isFinite(startTimestamp)) {
    throw new Error('A valid plan start date is required.');
  }

  const pattern = calculateRecentDrinkPattern(entries, referenceTimestamp);
  const planStart = new Date(startTimestamp);
  planStart.setHours(0, 0, 0, 0);
  const goals: DailyGoalOverrides = {};
  const weeklyTargets: number[] = [];
  const largestShareIndex = pattern.dayShares.reduce(
    (largestIndex, share, index, shares) =>
      share > shares[largestIndex] ? index : largestIndex,
    0,
  );

  for (let week = 0; week < weeks; week += 1) {
    const weeklyTarget =
      Math.round(
        (startGoal + ((targetGoal - startGoal) * (week + 1)) / weeks) * 100,
      ) / 100;
    weeklyTargets.push(weeklyTarget);

    const dailyGoals = pattern.dayShares.map(
      (share) => Math.round(weeklyTarget * share * 100) / 100,
    );
    const assigned = dailyGoals.reduce((total, goal) => total + goal, 0);
    dailyGoals[largestShareIndex] =
      Math.round(
        (dailyGoals[largestShareIndex] + weeklyTarget - assigned) * 100,
      ) / 100;

    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(planStart);
      date.setDate(planStart.getDate() + week * 7 + weekday);
      goals[localDayKey(date.getTime())] = dailyGoals[weekday];
    }
  }

  const planEnd = new Date(planStart);
  planEnd.setDate(planStart.getDate() + weeks * 7 - 1);
  return {
    goals,
    weeklyTargets,
    startDayKey: localDayKey(planStart.getTime()),
    endDayKey: localDayKey(planEnd.getTime()),
    usesWeekendFallback: pattern.usesWeekendFallback,
  };
}

export function persistDrinkEntries(
  storage: Pick<DrinkStorage, 'setItem'>,
  entries: DrinkEntry[],
): Promise<void> {
  return storage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(entries));
}

export function updateSavedDrinkDefinition(
  drinks: SavedDrink[],
  drinkId: string,
  details: DrinkDetails,
): SavedDrink[] {
  return drinks.map((drink) =>
    drink.id === drinkId ? { ...drink, ...details } : drink,
  );
}

export type SavedDrinkConfirmationButton = {
  text: string;
  style?: 'cancel' | 'destructive';
  onPress?: () => void;
};

export function replaceSavedDrinkAfterNameConflict(
  drinks: SavedDrink[],
  editedDrinkId: string,
  conflictingDrinkId: string,
  details: DrinkDetails,
  savedAt: number,
): SavedDrink[] {
  return drinks
    .filter((drink) => drink.id !== editedDrinkId)
    .map((drink) =>
      drink.id === conflictingDrinkId
        ? { ...drink, ...details, savedAt }
        : drink,
    );
}

export function summarizeDailyGoalsForLocalWeek(
  referenceTimestamp: number,
  defaultGoal: number | null,
  goalOverrides: DailyGoalOverrides,
): WeeklyDailyGoalSummary {
  const weekStart = shiftLocalWeek(referenceTimestamp, 0);
  let plannedStandardDrinks = 0;
  let daysWithoutGoals = 0;

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayOffset);
    const dayKey = localDayKey(date.getTime());
    const goal = Object.prototype.hasOwnProperty.call(goalOverrides, dayKey)
      ? goalOverrides[dayKey]
      : defaultGoal;
    if (goal === null || goal === undefined) {
      daysWithoutGoals += 1;
    } else {
      plannedStandardDrinks += goal;
    }
  }

  return {
    daysWithoutGoals,
    plannedStandardDrinks:
      daysWithoutGoals > 0 ? null : plannedStandardDrinks,
  };
}

export type DailyGoalComparison = 'under' | 'met' | 'over';
