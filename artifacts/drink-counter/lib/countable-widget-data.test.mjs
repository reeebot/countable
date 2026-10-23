import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DAILY_GOAL_OVERRIDES_STORAGE_KEY,
  DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY,
  ENTRIES_STORAGE_KEY,
  standardDrinkEquivalent,
} from './drink-data.ts';
import {
  STOCK_PURCHASES_STORAGE_KEY,
} from './spending-data.ts';
import {
  addLastDrinkFromWidget,
  readCountableWidgetSnapshot,
} from './countable-widget-data.ts';

function createEntry(id, timestamp, overrides = {}) {
  return {
    id,
    timestamp,
    name: 'Coors Light tall',
    alcoholPercent: 4.2,
    volume: 16,
    unit: 'fl oz',
    caloriesPer100Ml: null,
    contextTags: [],
    ...overrides,
  };
}

function memoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    read: (key) => values.get(key) ?? null,
  };
}

test('widget counts only today and shows goal progress above 100 percent', async () => {
  const now = new Date(2026, 9, 22, 12).getTime();
  const entries = [
    createEntry('yesterday', new Date(2026, 9, 21, 20).getTime()),
    createEntry('today', now),
  ];
  const storage = memoryStorage({
    [ENTRIES_STORAGE_KEY]: JSON.stringify(entries),
    [DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY]: '1',
    [DAILY_GOAL_OVERRIDES_STORAGE_KEY]: '{}',
    [STOCK_PURCHASES_STORAGE_KEY]: '[]',
  });

  const snapshot = await readCountableWidgetSnapshot(storage, now);

  assert.equal(snapshot.drinkCount, 1);
  assert.equal(snapshot.dailyGoal, 1);
  assert.equal(snapshot.isOverGoal, true);
  assert.equal(
    snapshot.percentComplete,
    Math.round(standardDrinkEquivalent(entries[1]) * 100),
  );
});

test('widget plus copies the last drink and deducts it from matching stock', async () => {
  const previousTimestamp = new Date(2026, 9, 21, 20).getTime();
  const addedTimestamp = new Date(2026, 9, 22, 12).getTime();
  const existingEntry = createEntry('last-drink', previousTimestamp, {
    caloriesPer100Ml: 43,
    contextTags: ['social'],
  });
  const purchase = {
    id: 'coors-pack',
    purchasedAt: previousTimestamp - 1000,
    productName: 'Coors Light tall',
    alcoholPercent: 4.2,
    containerCount: 24,
    containerVolumeMl: 500,
    totalCostCents: 3000,
  };
  const storage = memoryStorage({
    [ENTRIES_STORAGE_KEY]: JSON.stringify([existingEntry]),
    [DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY]: '',
    [DAILY_GOAL_OVERRIDES_STORAGE_KEY]: '{}',
    [STOCK_PURCHASES_STORAGE_KEY]: JSON.stringify([purchase]),
  });

  assert.equal(
    await addLastDrinkFromWidget(storage, addedTimestamp),
    true,
  );
  const savedEntries = JSON.parse(storage.read(ENTRIES_STORAGE_KEY));
  const addedEntry = savedEntries.find((entry) => entry.id !== 'last-drink');

  assert.equal(savedEntries.length, 2);
  assert.equal(addedEntry.timestamp, addedTimestamp);
  assert.equal(addedEntry.name, existingEntry.name);
  assert.equal(addedEntry.alcoholPercent, existingEntry.alcoholPercent);
  assert.equal(addedEntry.volume, existingEntry.volume);
  assert.equal(addedEntry.unit, existingEntry.unit);
  assert.deepEqual(addedEntry.contextTags, []);
  assert.equal(addedEntry.stockDeductions.length, 1);

  const updatedSnapshot = await readCountableWidgetSnapshot(
    storage,
    addedTimestamp,
  );
  assert.equal(updatedSnapshot.drinkCount, 1);
  assert.equal(updatedSnapshot.hasLastDrink, true);
});
