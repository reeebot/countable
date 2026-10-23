import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignStockDeductions,
  calculateSpendingSummary,
  costCentsForEntry,
  createStockPurchase,
  millilitersToFluidOunces,
  normalizeStockPurchaseList,
  parseStockPurchaseList,
  persistStockPurchaseList,
  STOCK_PURCHASES_STORAGE_KEY,
  stockPurchaseBalances,
} from './spending-data.ts';

function makePurchase(
  id,
  {
    productName = 'Coors Light',
    alcoholPercent = 4.2,
    containerCount = 1,
    containerVolume = 12,
    totalCost = 2,
    purchasedAt = 100,
  } = {},
) {
  return createStockPurchase(
    {
      productName,
      alcoholPercent,
      containerCount,
      containerVolume,
      unit: 'fl oz',
      totalCost,
    },
    id,
    purchasedAt,
  );
}

function makeEntry(id, overrides = {}) {
  return {
    id,
    timestamp: 1000,
    name: 'Coors Light',
    alcoholPercent: 4.2,
    volume: 12,
    unit: 'fl oz',
    caloriesPer100Ml: null,
    ...overrides,
  };
}

test('creates package purchases using milliliters and integer cents', () => {
  const purchase = makePurchase('purchase-1', {
    containerCount: 24,
    totalCost: 29.99,
  });

  assert.equal(purchase.containerCount, 24);
  assert.equal(purchase.totalCostCents, 2999);
  assert.ok(Math.abs(purchase.containerVolumeMl - 354.882) < 0.01);
  assert.ok(Math.abs(millilitersToFluidOunces(purchase.containerVolumeMl) - 12) < 0.001);
});

test('normalizes saved purchase lists and rejects invalid records', () => {
  const purchase = makePurchase('purchase-1');

  assert.deepEqual(normalizeStockPurchaseList([purchase]), [purchase]);
  assert.deepEqual(parseStockPurchaseList(JSON.stringify([purchase])), [purchase]);
  assert.deepEqual(parseStockPurchaseList(null), []);
  assert.equal(normalizeStockPurchaseList([{ ...purchase, totalCostCents: -1 }]), null);
  assert.equal(normalizeStockPurchaseList([purchase, purchase]), null);
  assert.throws(() => parseStockPurchaseList('not json'), /unexpected format/i);
});

test('persists package purchases under the stock storage key', async () => {
  let saved;
  const storage = {
    async setItem(key, value) {
      saved = { key, value };
    },
  };
  const purchases = [makePurchase('purchase-1')];

  await persistStockPurchaseList(storage, purchases);

  assert.equal(saved.key, STOCK_PURCHASES_STORAGE_KEY);
  assert.deepEqual(JSON.parse(saved.value), purchases);
});

test('allocates matching drinks from oldest stock first and calculates cost', () => {
  const purchases = [
    makePurchase('older', { totalCost: 2, purchasedAt: 100 }),
    makePurchase('newer', { totalCost: 4, purchasedAt: 200 }),
  ];
  const entry = assignStockDeductions(
    makeEntry('drink-1', { name: 'Coors-Light', volume: 16 }),
    purchases,
    [],
  );

  assert.equal(entry.stockDeductions.length, 2);
  assert.equal(entry.stockDeductions[0].purchaseId, 'older');
  assert.ok(
    Math.abs(entry.stockDeductions[0].volumeMl - 12 * 29.5735) < 0.01,
  );
  assert.equal(entry.stockDeductions[1].purchaseId, 'newer');
  assert.ok(
    Math.abs(entry.stockDeductions[1].volumeMl - 4 * 29.5735) < 0.01,
  );
  assert.equal(costCentsForEntry(entry, purchases), 333);
});

test('does not deduct unmatched products or drinks with a different ABV', () => {
  const purchases = [makePurchase('purchase-1')];
  const wrongProduct = assignStockDeductions(
    makeEntry('drink-1', { name: 'Different Beer' }),
    purchases,
    [],
  );
  const wrongAbv = assignStockDeductions(
    makeEntry('drink-2', { alcoholPercent: 5 }),
    purchases,
    [],
  );

  assert.deepEqual(wrongProduct.stockDeductions, []);
  assert.deepEqual(wrongAbv.stockDeductions, []);
});

test('available inventory is restored when a drink is removed or undone', () => {
  const purchases = [makePurchase('purchase-1')];
  const logged = assignStockDeductions(makeEntry('drink-1'), purchases, []);
  const afterLogging = stockPurchaseBalances(purchases, [logged])[0];
  const afterRemoval = stockPurchaseBalances(purchases, [])[0];

  assert.equal(afterLogging.remainingContainers, 0);
  assert.equal(afterRemoval.remainingContainers, 1);
});

test('estimates four-week savings from weekday-aware stock-linked history', () => {
  const reference = new Date();
  reference.setHours(0, 0, 0, 0);
  const historyStart = new Date(reference);
  historyStart.setDate(historyStart.getDate() - 28);
  const purchase = makePurchase('purchase-1', {
    containerCount: 28,
    totalCost: 28,
    purchasedAt: historyStart.getTime() - 1000,
  });
  const entries = [];

  for (let dayOffset = 0; dayOffset < 28; dayOffset += 1) {
    const timestamp = new Date(historyStart);
    timestamp.setDate(timestamp.getDate() + dayOffset);
    timestamp.setHours(12, 0, 0, 0);
    const base = makeEntry(`drink-${dayOffset}`, {
      timestamp: timestamp.getTime(),
    });
    entries.push(assignStockDeductions(base, [purchase], entries));
  }

  const summary = calculateSpendingSummary(
    [purchase],
    entries,
    0,
    {},
    reference.getTime(),
  );

  assert.equal(summary.trackedDays, 28);
  assert.equal(summary.projectionDays, 28);
  assert.equal(summary.consumedCostCents, 2800);
  assert.ok(summary.projectedSavingsCents > 0);
});

test('does not estimate savings before enough tracked days exist', () => {
  const reference = new Date();
  reference.setHours(0, 0, 0, 0);
  const purchase = makePurchase('purchase-1', {
    containerCount: 2,
    totalCost: 2,
  });
  const yesterday = new Date(reference);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);
  const entry = assignStockDeductions(
    makeEntry('drink-1', { timestamp: yesterday.getTime() }),
    [purchase],
    [],
  );
  const summary = calculateSpendingSummary(
    [purchase],
    [entry],
    0,
    {},
    reference.getTime(),
  );

  assert.equal(summary.trackedDays, 1);
  assert.equal(summary.projectedSavingsCents, null);
});
