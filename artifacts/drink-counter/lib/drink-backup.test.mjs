import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDrinkBackupFile,
  mergeDrinkBackupData,
  parseDrinkBackupFile,
} from './drink-backup.ts';
import {
  DEFAULT_DRINK_CONTEXT_TAGS,
  createReliableStorageWriter,
} from './drink-data.ts';

const loggedEntry = {
  id: 'entry-1',
  timestamp: new Date(2026, 0, 2, 20, 30).getTime(),
  name: 'Pale Ale',
  alcoholPercent: 5.2,
  volume: 12,
  unit: 'fl oz',
  caloriesPer100Ml: 40,
  contextTags: ['social'],
  stockDeductions: [{ purchaseId: 'purchase-1', volumeMl: 100 }],
};

const stockPurchase = {
  id: 'purchase-1',
  purchasedAt: new Date(2026, 0, 1).getTime(),
  productName: 'Pale Ale',
  alcoholPercent: 5.2,
  containerCount: 6,
  containerVolumeMl: 355,
  totalCostCents: 1200,
};

const savedDrink = {
  id: 'saved-1',
  name: 'Pale Ale',
  alcoholPercent: 5.2,
  volume: 12,
  unit: 'fl oz',
  caloriesPer100Ml: 40,
  savedAt: 100,
  isFavorite: true,
};

function data(overrides = {}) {
  return {
    entries: [loggedEntry],
    savedDrinks: [savedDrink],
    stockPurchases: [stockPurchase],
    dailyStandardDrinkGoal: 2,
    dailyGoalOverrides: { '2026-01-02': 1.5 },
    contextTagDefinitions: DEFAULT_DRINK_CONTEXT_TAGS.map((tag) => ({ ...tag })),
    ...overrides,
  };
}

test('backup JSON round-trips all locally stored drink data', () => {
  const source = data({
    contextTagDefinitions: [
      ...DEFAULT_DRINK_CONTEXT_TAGS.map((tag) => ({ ...tag })),
      { value: 'family', label: 'Family', isActive: true },
    ],
  });

  const backup = createDrinkBackupFile(source, '2026-01-03T12:00:00.000Z');
  const parsed = parseDrinkBackupFile(JSON.parse(JSON.stringify(backup)));

  assert.deepEqual(parsed, source);
});

test('backup import rejects unrelated, unsupported, and malformed files', () => {
  assert.throws(
    () => parseDrinkBackupFile({ format: 'another-app', version: 1 }),
    /not a Countable backup/,
  );
  assert.throws(
    () =>
      parseDrinkBackupFile({
        format: 'countable-drink-counter-backup',
        version: 2,
        exportedAt: '2026-01-03T12:00:00.000Z',
        data: {},
      }),
    /version is not supported/,
  );
  assert.throws(
    () =>
      parseDrinkBackupFile(
        createDrinkBackupFile(data({ dailyGoalOverrides: { 'not-a-date': 2 } })),
      ),
    /date-specific goals/,
  );
});

test('older backups without stock data still import', () => {
  const oldBackup = createDrinkBackupFile(data());
  delete oldBackup.data.stockPurchases;

  const parsed = parseDrinkBackupFile(oldBackup);

  assert.deepEqual(parsed.stockPurchases, []);
  assert.deepEqual(parsed.entries[0].stockDeductions, loggedEntry.stockDeductions);
});

test('backup merge adds missing records while preserving current data on conflicts', () => {
  const current = data({
    entries: [{ ...loggedEntry, name: 'Current name' }],
    savedDrinks: [{ ...savedDrink, name: 'Pale Ale', isFavorite: false }],
    dailyStandardDrinkGoal: 3,
    dailyGoalOverrides: {
      '2026-01-02': 2,
      '2026-01-04': 1,
    },
    contextTagDefinitions: DEFAULT_DRINK_CONTEXT_TAGS.map((tag) =>
      tag.value === 'social'
        ? { ...tag, label: 'My current label' }
        : { ...tag },
    ),
  });
  const incoming = data({
    entries: [
      { ...loggedEntry, name: 'Backup name' },
      { ...loggedEntry, id: 'entry-2', timestamp: loggedEntry.timestamp + 1000 },
      { ...loggedEntry, id: 'entry-2', timestamp: loggedEntry.timestamp + 2000 },
    ],
    savedDrinks: [
      { ...savedDrink, name: 'Changed duplicate' },
      { ...savedDrink, id: 'saved-2', name: 'Lager', isFavorite: true },
    ],
    stockPurchases: [
      stockPurchase,
      {
        ...stockPurchase,
        id: 'purchase-2',
        productName: 'Lager',
      },
    ],
    dailyStandardDrinkGoal: 1,
    dailyGoalOverrides: {
      '2026-01-02': 0.5,
      '2026-01-03': 1,
    },
    contextTagDefinitions: [
      ...DEFAULT_DRINK_CONTEXT_TAGS.map((tag) =>
        tag.value === 'social'
          ? { ...tag, label: 'Backup label' }
          : { ...tag },
      ),
      { value: 'family', label: 'Family', isActive: true },
    ],
  });

  const merged = mergeDrinkBackupData(current, incoming);

  assert.equal(merged.data.entries.length, 2);
  assert.equal(merged.data.entries[0].name, 'Current name');
  assert.equal(merged.data.savedDrinks.length, 2);
  assert.equal(merged.data.stockPurchases.length, 2);
  assert.equal(merged.data.savedDrinks[0].isFavorite, false);
  assert.equal(merged.data.dailyStandardDrinkGoal, 3);
  assert.deepEqual(merged.data.dailyGoalOverrides, {
    '2026-01-02': 2,
    '2026-01-03': 1,
    '2026-01-04': 1,
  });
  assert.equal(
    merged.data.contextTagDefinitions.find((tag) => tag.value === 'social')
      ?.label,
    'My current label',
  );
  assert.ok(
    merged.data.contextTagDefinitions.some((tag) => tag.value === 'family'),
  );
  assert.deepEqual(merged.added, {
    entries: 1,
    savedDrinks: 1,
    stockPurchases: 1,
    dailyGoalOverrides: 1,
    contextTagDefinitions: 1,
    dailyStandardDrinkGoal: 0,
  });

  const importedAgain = mergeDrinkBackupData(merged.data, incoming);
  assert.equal(importedAgain.added.entries, 0);
  assert.equal(importedAgain.added.savedDrinks, 0);
  assert.equal(importedAgain.added.stockPurchases, 0);
  assert.equal(importedAgain.data.entries.length, 2);
});

test('a fresh install restores customized built-in context labels from backup', () => {
  const incoming = data({
    contextTagDefinitions: DEFAULT_DRINK_CONTEXT_TAGS.map((tag) =>
      tag.value === 'social' ? { ...tag, label: 'With friends' } : { ...tag },
    ),
  });

  const merged = mergeDrinkBackupData(
    data({
      entries: [],
      savedDrinks: [],
      dailyStandardDrinkGoal: null,
      dailyGoalOverrides: {},
    }),
    incoming,
  );

  assert.equal(
    merged.data.contextTagDefinitions.find((tag) => tag.value === 'social')
      ?.label,
    'With friends',
  );
  assert.equal(merged.added.contextTagDefinitions, 1);
});

test('reliable storage writer flush waits for a write and reports failures', async () => {
  let finishWrite;
  const writer = createReliableStorageWriter(
    'before',
    () =>
      new Promise((resolve) => {
        finishWrite = resolve;
      }),
    () => {},
    () => {},
    () => {},
  );

  writer.save('after');
  let flushed = false;
  const flush = writer.flush().then(() => {
    flushed = true;
  });
  await Promise.resolve();
  assert.equal(flushed, false);
  finishWrite();
  await flush;
  assert.equal(flushed, true);

  const failedWriter = createReliableStorageWriter(
    'before',
    async () => {
      throw new Error('write failed');
    },
    () => {},
    () => {},
    () => {},
  );
  failedWriter.save('after');
  await assert.rejects(failedWriter.flush(), /save failed/);
});
