import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confirmSavedDrinkNameConflict,
  confirmSavedDrinkRemoval,
  createReliableStorageWriter,
  addDrinkContextTag,
  calculateDrinkPatternInsights,
  calculateRecentDrinkPatternComparison,
  calculateRecentDrinkPattern,
  compareDailyDrinkSummaryToGoal,
  DAILY_GOAL_OVERRIDES_STORAGE_KEY,
  DEFAULT_DRINK_CONTEXT_TAGS,
  DRINK_CONTEXT_TAGS_STORAGE_KEY,
  DRINK_REMOVAL_UNDO_WINDOW_MS,
  DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY,
  drinkEntriesToCsv,
  ENTRIES_STORAGE_KEY,
  filterDrinkEntriesByLocalDateRange,
  formatStandardDrinkCount,
  getDrinkEntryRestoreIndex,
  isValidLocalDateRange,
  localDayKey,
  normalizeDailyGoalOverride,
  normalizeDailyGoalOverrides,
  normalizeDailyStandardDrinkGoal,
  normalizeDrinkEntries,
  parseDrinkContextTagDefinitions,
  parseDailyGoalOverrides,
  parseDailyStandardDrinkGoal,
  parseSavedDrinkList,
  persistDrinkEntries,
  persistDailyGoalOverrides,
  persistDailyStandardDrinkGoal,
  persistDrinkContextTagDefinitions,
  persistSavedDrinkList,
  removeDrinkEntry,
  removeSavedDrinkDefinition,
  renameDrinkContextTag,
  replaceSavedDrinkAfterNameConflict,
  restoreRemovedDrinkEntry,
  restoreDrinkContextTag,
  retireDrinkContextTag,
  SAVED_DRINKS_STORAGE_KEY,
  scheduleDrinkRemovalUndoExpiry,
  shiftLocalWeek,
  sortSavedDrinksForQuickAccess,
  summarizeDailyGoalsForLocalWeek,
  standardDrinkEquivalent,
  standardDrinkEquivalentFromDetails,
  summarizeDrinkEntriesByLocalDay,
  summarizeDrinkEntriesByLocalWeek,
  summarizeDrinkEntriesForLocalWeek,
  suggestTaperGoalOverrides,
  timestampForLocalDayAtTime,
  toggleSavedDrinkFavorite,
  updateSavedDrinkDefinition,
} from './drink-data.ts';

test('historical log time stays on the selected local calendar day', () => {
  const dayStart = new Date(2026, 9, 14, 0, 0, 0, 0).getTime();
  const timestamp = timestampForLocalDayAtTime(dayStart, 21, 45);

  assert.notEqual(timestamp, null);
  assert.equal(localDayKey(timestamp), localDayKey(dayStart));
  assert.equal(new Date(timestamp).getHours(), 21);
  assert.equal(new Date(timestamp).getMinutes(), 45);
  assert.equal(timestampForLocalDayAtTime(dayStart, 24, 0), null);
});

const originalDrink = {
  id: 'saved-1',
  name: 'Original Pale Ale',
  alcoholPercent: 5.2,
  volume: 12,
  unit: 'fl oz',
  savedAt: 100,
};

const editedDetails = {
  name: 'Updated Pale Ale',
  alcoholPercent: 6.1,
  volume: 16,
  unit: 'fl oz',
};

const loggedEntry = {
  id: 'entry-1',
  timestamp: 200,
  name: 'Original Pale Ale',
  alcoholPercent: 5.2,
  volume: 12,
  unit: 'fl oz',
};

const conflictingDrink = {
  id: 'saved-2',
  name: 'Updated Pale Ale',
  alcoholPercent: 4.8,
  volume: 12,
  unit: 'fl oz',
  savedAt: 150,
};

const unrelatedDrink = {
  id: 'saved-3',
  name: 'Stout',
  alcoholPercent: 7,
  volume: 10,
  unit: 'fl oz',
  savedAt: 175,
};

test('drink correction preview uses the same standard-drink calculation as saved entries', () => {
  const correctedEntry = { ...loggedEntry, ...editedDetails };
  assert.equal(
    standardDrinkEquivalentFromDetails(editedDetails),
    standardDrinkEquivalent(correctedEntry),
  );
  assert.notEqual(
    standardDrinkEquivalentFromDetails(editedDetails),
    standardDrinkEquivalent(loggedEntry),
  );
});

test('drink history CSV includes local dates, drink details, and calculated equivalents', () => {
  const timestamp = new Date(2025, 5, 8, 21, 7).getTime();
  const csv = drinkEntriesToCsv([
    { ...loggedEntry, timestamp, contextTags: ['social', 'stress'] },
    {
      id: 'legacy-entry',
      timestamp,
      name: 'Legacy drink',
      alcoholPercent: null,
      volume: null,
      unit: null,
      caloriesPer100Ml: null,
    },
  ]);

  assert.match(csv, /"Date \(local\)","Time \(local\)","Drink"/);
  assert.match(
    csv,
    /"2025-06-08","21:07","Original Pale Ale","5\.2","12","fl oz","1\.0","Social; Stress"/,
  );
  assert.match(csv, /"2025-06-08","21:07","Legacy drink","","","","",""/);
});

test('standard-drink amounts display to one decimal place', () => {
  assert.equal(formatStandardDrinkCount(1.04), '1.0');
  assert.equal(formatStandardDrinkCount(1.26), '1.3');
  assert.equal(formatStandardDrinkCount(0), '0.0');
});

test('saved-drink favorites load and remain attached when drink details are edited', () => {
  const [favorite] = parseSavedDrinkList(
    JSON.stringify([{ ...originalDrink, isFavorite: true }]),
  );
  const [updated] = updateSavedDrinkDefinition(
    [favorite],
    favorite.id,
    editedDetails,
  );

  assert.equal(favorite.isFavorite, true);
  assert.equal(updated.isFavorite, true);
  assert.throws(() =>
    parseSavedDrinkList(
      JSON.stringify([{ ...originalDrink, isFavorite: 'yes' }]),
    ),
  );
});

test('saved drinks can be favorited and favorites sort before other saved drinks', () => {
  const drinks = [
    { ...originalDrink, savedAt: 300 },
    { ...conflictingDrink, savedAt: 200 },
    { ...unrelatedDrink, savedAt: 100 },
  ];
  const favorited = toggleSavedDrinkFavorite(drinks, conflictingDrink.id);

  assert.equal(favorited[1].isFavorite, true);
  assert.deepEqual(
    sortSavedDrinksForQuickAccess(favorited).map((drink) => drink.id),
    [conflictingDrink.id, originalDrink.id, unrelatedDrink.id],
  );
  assert.equal(
    toggleSavedDrinkFavorite(favorited, conflictingDrink.id)[1].isFavorite,
    false,
  );
});

test('drink entry normalization keeps valid optional context tags and safely removes invalid tags', () => {
  const normalized = normalizeDrinkEntries([
    { ...loggedEntry },
    {
      ...loggedEntry,
      id: 'tagged-entry',
      contextTags: ['social', 'stress', 'social', 'custom-after-work', 3],
    },
    {
      ...loggedEntry,
      id: 'invalid-context-entry',
      contextTags: 'stress',
    },
    {
      ...loggedEntry,
      id: 'blank-context-entry',
      contextTags: ['', 'custom-after-work'],
    },
    {
      ...loggedEntry,
      id: 'stock-deduction-entry',
      stockDeductions: [
        { purchaseId: 'purchase-1', volumeMl: 100 },
        { purchaseId: '', volumeMl: 20 },
        { purchaseId: 'purchase-2', volumeMl: -1 },
      ],
    },
    {
      ...loggedEntry,
      id: 'invalid-stock-deductions-entry',
      stockDeductions: 'purchase-1',
    },
  ]);

  assert.ok(normalized);
  assert.equal(normalized.migrated, true);
  assert.equal(normalized.entries[0].contextTags, undefined);
  assert.deepEqual(normalized.entries[1].contextTags, [
    'social',
    'stress',
    'custom-after-work',
  ]);
  assert.deepEqual(normalized.entries[2].contextTags, []);
  assert.deepEqual(normalized.entries[3].contextTags, ['custom-after-work']);
  assert.deepEqual(normalized.entries[4].stockDeductions, [
    { purchaseId: 'purchase-1', volumeMl: 100 },
  ]);
  assert.deepEqual(normalized.entries[5].stockDeductions, []);
});

test('context labels add, rename, retire, restore, persist locally, and preserve old entry meaning', async () => {
  const { storage, values, writes } = createStorage({});
  const defaults = parseDrinkContextTagDefinitions(null);
  assert.deepEqual(defaults, DEFAULT_DRINK_CONTEXT_TAGS);

  const withCustom = addDrinkContextTag(
    defaults,
    'After work',
    'custom-after-work',
  );
  assert.equal(withCustom.at(-1).label, 'After work');
  assert.equal(withCustom.at(-1).isActive, true);

  const renamed = renameDrinkContextTag(
    withCustom,
    'custom-after-work',
    'Unwinding after work',
    'custom-unwinding',
  );
  assert.deepEqual(
    renamed.slice(-2),
    [
      { value: 'custom-after-work', label: 'After work', isActive: false },
      { value: 'custom-unwinding', label: 'Unwinding after work', isActive: true },
    ],
  );

  const retired = retireDrinkContextTag(renamed, 'social');
  assert.equal(retired.find((tag) => tag.value === 'social').isActive, false);
  const restored = restoreDrinkContextTag(retired, 'social');
  assert.equal(restored.find((tag) => tag.value === 'social').isActive, true);

  await persistDrinkContextTagDefinitions(storage, renamed);
  assert.deepEqual(
    parseDrinkContextTagDefinitions(
      await storage.getItem(DRINK_CONTEXT_TAGS_STORAGE_KEY),
    ),
    renamed,
  );
  assert.deepEqual(writes, [DRINK_CONTEXT_TAGS_STORAGE_KEY]);
  assert.throws(
    () => addDrinkContextTag(renamed, 'unwinding AFTER WORK', 'duplicate-id'),
    /already in use/,
  );
});

test('custom and retired context labels remain readable in CSV and pattern comparisons', () => {
  const referenceTimestamp = new Date(2025, 5, 29, 12).getTime();
  const definitions = [
    ...DEFAULT_DRINK_CONTEXT_TAGS,
    { value: 'custom-after-work', label: 'After work', isActive: false },
    { value: 'custom-outdoors', label: 'Outdoors', isActive: true },
  ];
  const entries = [];
  for (const day of [2, 9, 16, 23]) {
    entries.push({
      ...loggedEntry,
      id: `custom-tagged-${day}`,
      timestamp: new Date(2025, 5, day, 19).getTime(),
      contextTags: ['custom-after-work'],
    });
  }
  for (const day of [7, 14, 21, 28]) {
    entries.push({
      ...loggedEntry,
      id: `other-tagged-${day}`,
      timestamp: new Date(2025, 5, day, 19).getTime(),
      contextTags: ['custom-outdoors'],
    });
    entries.push({
      ...loggedEntry,
      id: `other-extra-${day}`,
      timestamp: new Date(2025, 5, day, 21).getTime(),
      contextTags: ['custom-outdoors'],
    });
  }

  const insights = calculateDrinkPatternInsights(
    entries,
    referenceTimestamp,
    definitions,
  );
  assert.ok(
    insights.contextComparisons.some(
      (comparison) => comparison.tag === 'custom-after-work',
    ),
  );
  const csv = drinkEntriesToCsv(
    [{ ...entries[0], contextTags: ['custom-after-work'] }],
    definitions,
  );
  assert.match(csv, /"After work"/);
});

test('drink history CSV escapes quoted fields and neutralizes spreadsheet formulas in drink names', () => {
  const csv = drinkEntriesToCsv([
    {
      ...loggedEntry,
      name: '  ="danger", "quoted"\nname',
      timestamp: new Date(2025, 0, 2, 3, 4).getTime(),
    },
  ]);

  assert.match(
    csv,
    /"2025-01-02","03:04","'  =""danger"", ""quoted""\nname"/,
  );
});

test('date-range exports include both local calendar dates and exclude surrounding days', () => {
  const entries = [
    { ...loggedEntry, id: 'before-range', timestamp: new Date(2025, 5, 7, 23, 59).getTime() },
    { ...loggedEntry, id: 'start-day', timestamp: new Date(2025, 5, 8, 0, 0).getTime() },
    { ...loggedEntry, id: 'end-day', timestamp: new Date(2025, 5, 9, 23, 59).getTime() },
    { ...loggedEntry, id: 'after-range', timestamp: new Date(2025, 5, 10, 0, 0).getTime() },
  ];

  assert.equal(isValidLocalDateRange('2025-06-08', '2025-06-09'), true);
  assert.deepEqual(
    filterDrinkEntriesByLocalDateRange(entries, '2025-06-08', '2025-06-09')
      .map((entry) => entry.id),
    ['start-day', 'end-day'],
  );
});

test('date-range exports reject invalid dates and reversed ranges', () => {
  assert.equal(isValidLocalDateRange('2025-02-29', '2025-03-01'), false);
  assert.equal(isValidLocalDateRange('2025-06-10', '2025-06-09'), false);
  assert.throws(
    () => filterDrinkEntriesByLocalDateRange([], '2025-06-10', '2025-06-09'),
    /valid start and end date/,
  );
});

test('weekly totals use the local Sunday-to-Saturday calendar week and include both measures', () => {
  const referenceTimestamp = new Date(2025, 11, 31, 12).getTime();
  const weekStart = new Date(2025, 11, 28).getTime();
  const weekEnd = new Date(2026, 0, 4).getTime();
  const entries = [
    { ...loggedEntry, id: 'before-week', timestamp: weekStart - 1 },
    { ...loggedEntry, id: 'week-start', timestamp: weekStart },
    { ...loggedEntry, id: 'week-end-day', timestamp: weekEnd - 1 },
    {
      id: 'legacy',
      timestamp: new Date(2025, 11, 30, 10).getTime(),
      name: 'Older drink',
      alcoholPercent: null,
      volume: null,
      unit: null,
      caloriesPer100Ml: null,
    },
    { ...loggedEntry, id: 'next-week', timestamp: weekEnd },
  ];

  const summary = summarizeDrinkEntriesForLocalWeek(entries, referenceTimestamp);

  assert.equal(summary.startTimestamp, weekStart);
  assert.equal(summary.endExclusiveTimestamp, weekEnd);
  assert.deepEqual(
    summary.entries.map((entry) => entry.id),
    ['week-start', 'week-end-day', 'legacy'],
  );
  assert.equal(summary.entries.length, 3);
  assert.equal(
    summary.standardDrinks,
    summary.entries.reduce((total, entry) => total + standardDrinkEquivalent(entry), 0),
  );
  assert.equal(summary.entriesWithoutDetails, 1);
});

test('daily goal comparisons require logged drinks with complete standard-drink details', () => {
  const completeSummary = {
    entries: [loggedEntry],
    standardDrinks: 1,
    entriesWithoutDetails: 0,
  };
  assert.equal(compareDailyDrinkSummaryToGoal(completeSummary, 1.2), 'under');
  assert.equal(compareDailyDrinkSummaryToGoal(completeSummary, 1), 'met');
  assert.equal(compareDailyDrinkSummaryToGoal(completeSummary, 0.8), 'over');
  assert.equal(compareDailyDrinkSummaryToGoal(completeSummary, null), null);
  assert.equal(compareDailyDrinkSummaryToGoal(undefined, 1), null);
  assert.equal(
    compareDailyDrinkSummaryToGoal(
      { ...completeSummary, entriesWithoutDetails: 1 },
      1,
    ),
    null,
  );
  assert.equal(
    compareDailyDrinkSummaryToGoal(
      { ...completeSummary, entries: [], standardDrinks: 0 },
      1,
    ),
    null,
  );
});

test('weekly planned goals combine date overrides with the default and require all seven days', () => {
  const weekStart = new Date(2025, 2, 9).getTime();
  const startDayKey = localDayKey(weekStart);
  const tuesday = new Date(weekStart);
  tuesday.setDate(tuesday.getDate() + 2);

  assert.deepEqual(
    summarizeDailyGoalsForLocalWeek(weekStart, 1, {
      [startDayKey]: 0,
      [localDayKey(tuesday.getTime())]: 2,
    }),
    { daysWithoutGoals: 0, plannedStandardDrinks: 7 },
  );
  assert.deepEqual(
    summarizeDailyGoalsForLocalWeek(weekStart, null, {
      [startDayKey]: 0,
    }),
    { daysWithoutGoals: 6, plannedStandardDrinks: null },
  );
});

test('weekly daily breakdown includes all seven local days and marks empty days with zero totals', () => {
  const referenceTimestamp = new Date(2025, 2, 12, 12).getTime();
  const weekStart = new Date(2025, 2, 9).getTime();
  const entries = [
    { ...loggedEntry, id: 'before-week', timestamp: weekStart - 1 },
    { ...loggedEntry, id: 'sunday', timestamp: new Date(2025, 2, 9, 13).getTime() },
    { ...loggedEntry, id: 'wednesday-one', timestamp: new Date(2025, 2, 12, 10).getTime() },
    { ...loggedEntry, id: 'wednesday-two', timestamp: new Date(2025, 2, 12, 22).getTime() },
    { ...loggedEntry, id: 'saturday', timestamp: new Date(2025, 2, 15, 23, 59).getTime() },
    { ...loggedEntry, id: 'next-week', timestamp: new Date(2025, 2, 16).getTime() },
  ];

  const dailySummaries = summarizeDrinkEntriesByLocalWeek(
    entries,
    referenceTimestamp,
  );
  const expectedDayKeys = Array.from({ length: 7 }, (_, dayOffset) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayOffset);
    return localDayKey(date.getTime());
  });

  assert.equal(dailySummaries.length, 7);
  assert.deepEqual(
    dailySummaries.map((summary) => summary.dayKey),
    expectedDayKeys,
  );
  assert.deepEqual(
    dailySummaries.map((summary) => summary.entries.map((entry) => entry.id)),
    [
      ['sunday'],
      [],
      [],
      ['wednesday-one', 'wednesday-two'],
      [],
      [],
      ['saturday'],
    ],
  );
  assert.equal(dailySummaries[1].standardDrinks, 0);
  assert.equal(
    dailySummaries[3].standardDrinks,
    2 * standardDrinkEquivalent(loggedEntry),
  );
  assert.equal(dailySummaries[6].dayKey, '2025-03-15');
});

test('undo restores a removed drink with its original timestamp, details, and position', () => {
  const target = {
    ...loggedEntry,
    timestamp: new Date(2025, 5, 8, 21, 7).getTime(),
    caloriesPer100Ml: 42,
    contextTags: ['social', 'relaxing'],
  };
  const entries = [
    { ...loggedEntry, id: 'before', timestamp: target.timestamp - 1000 },
    target,
    { ...loggedEntry, id: 'after', timestamp: target.timestamp + 1000 },
  ];
  const removal = removeDrinkEntry(entries, target.id);

  assert.ok(removal);
  assert.deepEqual(removal.entries.map((entry) => entry.id), ['before', 'after']);

  const restored = restoreRemovedDrinkEntry(removal.entries, removal.removed);
  assert.deepEqual(restored, entries);
  assert.deepEqual(restored[1], target);
  assert.equal(restored[1].timestamp, target.timestamp);
  assert.equal(restored[1].name, target.name);
  assert.equal(restored[1].alcoholPercent, target.alcoholPercent);
  assert.equal(restored[1].volume, target.volume);
  assert.equal(restored[1].unit, target.unit);
  assert.equal(restored[1].caloriesPer100Ml, target.caloriesPer100Ml);
});

test('undoing a past-day removal recalculates that day’s drink summary', () => {
  const pastDayTimestamp = new Date(2025, 5, 8, 21, 7).getTime();
  const removedEntry = {
    ...loggedEntry,
    id: 'past-day-removed',
    timestamp: pastDayTimestamp,
  };
  const otherEntry = {
    ...loggedEntry,
    id: 'past-day-kept',
    timestamp: new Date(2025, 5, 8, 19, 30).getTime(),
  };
  const removal = removeDrinkEntry([otherEntry, removedEntry], removedEntry.id);

  assert.ok(removal);
  const summaryAfterRemoval = summarizeDrinkEntriesByLocalDay(removal.entries);
  assert.equal(summaryAfterRemoval.length, 1);
  assert.equal(summaryAfterRemoval[0].dayKey, localDayKey(pastDayTimestamp));
  assert.deepEqual(
    summaryAfterRemoval[0].entries.map((entry) => entry.id),
    ['past-day-kept'],
  );

  const restoredEntries = restoreRemovedDrinkEntry(removal.entries, removal.removed);
  assert.ok(restoredEntries);
  const summaryAfterUndo = summarizeDrinkEntriesByLocalDay(restoredEntries);
  assert.equal(summaryAfterUndo.length, 1);
  assert.equal(summaryAfterUndo[0].dayKey, localDayKey(pastDayTimestamp));
  assert.deepEqual(
    summaryAfterUndo[0].entries.map((entry) => entry.id),
    ['past-day-kept', 'past-day-removed'],
  );
  assert.equal(
    summaryAfterUndo[0].standardDrinks,
    standardDrinkEquivalent(otherEntry) + standardDrinkEquivalent(removedEntry),
  );
});

test('drink-removal Undo expires after its five-second window', () => {
  let scheduledCallback;
  let scheduledDelay;
  let pendingRemoval = { entry: loggedEntry, index: 0 };
  const timer = scheduleDrinkRemovalUndoExpiry(
    () => {
      pendingRemoval = null;
    },
    (callback, delay) => {
      scheduledCallback = callback;
      scheduledDelay = delay;
      return 1;
    },
  );

  assert.equal(timer, 1);
  assert.equal(scheduledDelay, DRINK_REMOVAL_UNDO_WINDOW_MS);
  assert.equal(DRINK_REMOVAL_UNDO_WINDOW_MS, 5000);
  assert.ok(pendingRemoval);
  scheduledCallback();
  assert.equal(pendingRemoval, null);
});

test('multiple drink removals can be restored in any order without changing order or timestamps', () => {
  const entries = [
    { ...loggedEntry, id: 'ordered-a', timestamp: 100 },
    { ...loggedEntry, id: 'ordered-b', timestamp: 200 },
    { ...loggedEntry, id: 'ordered-c', timestamp: 300 },
    { ...loggedEntry, id: 'ordered-d', timestamp: 400 },
  ];
  const originalOrder = entries.map((entry) => entry.id);

  const removeB = removeDrinkEntry(entries, 'ordered-b');
  assert.ok(removeB);
  const removeC = removeDrinkEntry(removeB.entries, 'ordered-c');
  assert.ok(removeC);

  const cIndex = getDrinkEntryRestoreIndex(
    removeC.entries,
    originalOrder,
    'ordered-c',
  );
  assert.notEqual(cIndex, null);
  const withC = restoreRemovedDrinkEntry(removeC.entries, {
    ...removeC.removed,
    index: cIndex,
  });
  assert.ok(withC);

  const bIndex = getDrinkEntryRestoreIndex(withC, originalOrder, 'ordered-b');
  assert.notEqual(bIndex, null);
  const restored = restoreRemovedDrinkEntry(withC, {
    ...removeB.removed,
    index: bIndex,
  });

  assert.ok(restored);
  assert.deepEqual(restored.map((entry) => entry.id), originalOrder);
  assert.deepEqual(restored.map((entry) => entry.timestamp), [100, 200, 300, 400]);
});

test('week navigation stays on local Sunday boundaries across month and year changes', () => {
  const referenceTimestamp = new Date(2025, 11, 31, 12).getTime();
  const priorWeekStart = shiftLocalWeek(referenceTimestamp, -1);
  const currentWeekStart = shiftLocalWeek(referenceTimestamp, 0);
  const nextWeekStart = shiftLocalWeek(referenceTimestamp, 1);

  assert.equal(localDayKey(priorWeekStart), '2025-12-21');
  assert.equal(localDayKey(currentWeekStart), '2025-12-28');
  assert.equal(localDayKey(nextWeekStart), '2026-01-04');
  assert.equal(shiftLocalWeek(nextWeekStart, -1), currentWeekStart);
});

test('week navigation uses local calendar weeks through daylight-saving changes', () => {
  const springWeekStart = new Date(2025, 2, 9, 12).getTime();
  const fallWeekStart = new Date(2025, 10, 2, 12).getTime();
  const nextSpringWeek = shiftLocalWeek(springWeekStart, 1);
  const nextFallWeek = shiftLocalWeek(fallWeekStart, 1);

  assert.equal(localDayKey(shiftLocalWeek(springWeekStart, 0)), '2025-03-09');
  assert.equal(localDayKey(nextSpringWeek), '2025-03-16');
  assert.equal(nextSpringWeek - shiftLocalWeek(springWeekStart, 0), 167 * 60 * 60 * 1000);

  assert.equal(localDayKey(shiftLocalWeek(fallWeekStart, 0)), '2025-11-02');
  assert.equal(localDayKey(nextFallWeek), '2025-11-09');
  assert.equal(nextFallWeek - shiftLocalWeek(fallWeekStart, 0), 169 * 60 * 60 * 1000);
});

test('weekly totals include the correct drinks on both sides of daylight-saving weeks', () => {
  const boundaries = [
    {
      reference: new Date(2025, 2, 12, 12).getTime(),
      before: new Date(2025, 2, 8, 23, 59).getTime(),
      start: new Date(2025, 2, 9).getTime(),
      lastMinute: new Date(2025, 2, 15, 23, 59).getTime(),
      nextStart: new Date(2025, 2, 16).getTime(),
      startDay: '2025-03-09',
      nextDay: '2025-03-16',
    },
    {
      reference: new Date(2025, 10, 5, 12).getTime(),
      before: new Date(2025, 10, 1, 23, 59).getTime(),
      start: new Date(2025, 10, 2).getTime(),
      lastMinute: new Date(2025, 10, 8, 23, 59).getTime(),
      nextStart: new Date(2025, 10, 9).getTime(),
      startDay: '2025-11-02',
      nextDay: '2025-11-09',
    },
  ];

  for (const boundary of boundaries) {
    const summary = summarizeDrinkEntriesForLocalWeek(
      [
        { ...loggedEntry, id: 'before-week', timestamp: boundary.before },
        { ...loggedEntry, id: 'week-start', timestamp: boundary.start },
        { ...loggedEntry, id: 'last-minute', timestamp: boundary.lastMinute },
        { ...loggedEntry, id: 'next-week', timestamp: boundary.nextStart },
      ],
      boundary.reference,
    );

    assert.equal(localDayKey(summary.startTimestamp), boundary.startDay);
    assert.equal(localDayKey(summary.endExclusiveTimestamp), boundary.nextDay);
    assert.deepEqual(
      summary.entries.map((entry) => entry.id),
      ['week-start', 'last-minute'],
    );
    assert.equal(summary.standardDrinks, 2 * standardDrinkEquivalent(loggedEntry));
    assert.equal(summary.entriesWithoutDetails, 0);
  }
});

function createStorage(initialValues) {
  const values = new Map(Object.entries(initialValues));
  const writes = [];
  const storage = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      writes.push(key);
      values.set(key, value);
    },
  };
  return { storage, values, writes };
}

test('daily standard-drink goals accept positive values and reject invalid values', () => {
  assert.equal(normalizeDailyStandardDrinkGoal('1,25'), 1.25);
  assert.equal(normalizeDailyStandardDrinkGoal('2.345'), 2.35);
  assert.equal(normalizeDailyStandardDrinkGoal(''), null);
  assert.equal(normalizeDailyStandardDrinkGoal('0'), null);
  assert.equal(normalizeDailyStandardDrinkGoal('-1'), null);
  assert.equal(normalizeDailyStandardDrinkGoal('not a number'), null);
  assert.equal(normalizeDailyStandardDrinkGoal(0.001), null);
  assert.equal(normalizeDailyStandardDrinkGoal('1e308'), null);
  assert.equal(parseDailyStandardDrinkGoal('2.5'), 2.5);
  assert.equal(parseDailyStandardDrinkGoal(null), null);
});

test('daily standard-drink goals persist and can be cleared locally', async () => {
  const { storage, values, writes } = createStorage({});

  await persistDailyStandardDrinkGoal(storage, 2.345);
  assert.equal(values.get(DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY), '2.35');
  assert.equal(
    parseDailyStandardDrinkGoal(
      await storage.getItem(DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY),
    ),
    2.35,
  );

  await persistDailyStandardDrinkGoal(storage, null);
  assert.equal(values.get(DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY), '');
  assert.equal(
    parseDailyStandardDrinkGoal(
      await storage.getItem(DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY),
    ),
    null,
  );
  assert.deepEqual(writes, [
    DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY,
    DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY,
  ]);
});

test('date-specific goals preserve zero targets and reject malformed dates or values', () => {
  assert.equal(normalizeDailyGoalOverride('0'), 0);
  assert.equal(normalizeDailyGoalOverride('1,25'), 1.25);
  assert.equal(normalizeDailyGoalOverride('-1'), null);
  assert.equal(normalizeDailyGoalOverride('not a number'), null);
  assert.deepEqual(
    normalizeDailyGoalOverrides({
      '2025-06-01': '1.235',
      '2025-06-02': 0,
    }),
    {
      '2025-06-01': 1.24,
      '2025-06-02': 0,
    },
  );
  assert.equal(
    normalizeDailyGoalOverrides({ '2025-02-30': 1 }),
    null,
  );
  assert.equal(
    normalizeDailyGoalOverrides({ '2025-06-01': Number.NaN }),
    null,
  );
});

test('date-specific goals persist, reload, and clear without changing the default goal', async () => {
  const { storage, values, writes } = createStorage({
    [DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY]: '2',
  });
  const goals = {
    '2025-06-01': 1.25,
    '2025-06-02': 0,
  };

  await persistDailyGoalOverrides(storage, goals);
  assert.deepEqual(
    parseDailyGoalOverrides(
      await storage.getItem(DAILY_GOAL_OVERRIDES_STORAGE_KEY),
    ),
    goals,
  );
  assert.equal(values.get(DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY), '2');

  await persistDailyGoalOverrides(storage, {});
  assert.deepEqual(
    parseDailyGoalOverrides(
      await storage.getItem(DAILY_GOAL_OVERRIDES_STORAGE_KEY),
    ),
    {},
  );
  assert.deepEqual(writes, [
    DAILY_GOAL_OVERRIDES_STORAGE_KEY,
    DAILY_GOAL_OVERRIDES_STORAGE_KEY,
  ]);
  assert.throws(() => parseDailyGoalOverrides('{"2025-02-30":1}'));
});

test('recent drink pattern uses local complete days and weights logged weekends', () => {
  const referenceTimestamp = new Date(2025, 5, 29, 12).getTime();
  const entries = [];
  for (const day of [6, 13, 20, 27]) {
    entries.push({
      ...loggedEntry,
      id: `friday-${day}`,
      timestamp: new Date(2025, 5, day, 20).getTime(),
      alcoholPercent: 5,
      volume: 12,
    });
  }
  for (const day of [7, 14, 21, 28]) {
    for (let count = 0; count < 3; count += 1) {
      entries.push({
        ...loggedEntry,
        id: `saturday-${day}-${count}`,
        timestamp: new Date(2025, 5, day, 20 + count).getTime(),
        alcoholPercent: 5,
        volume: 12,
      });
    }
  }

  const pattern = calculateRecentDrinkPattern(entries, referenceTimestamp);

  assert.equal(localDayKey(pattern.startTimestamp), '2025-06-01');
  assert.equal(localDayKey(pattern.endExclusiveTimestamp), '2025-06-29');
  assert.equal(
    Math.round(pattern.totalStandardDrinks * 100) / 100,
    16,
  );
  assert.equal(pattern.averageWeeklyStandardDrinks, 4);
  assert.equal(Math.round(pattern.weekdayAverages[5] * 100) / 100, 1);
  assert.equal(Math.round(pattern.weekdayAverages[6] * 100) / 100, 3);
  assert.ok(pattern.dayShares[6] > pattern.dayShares[1]);
  assert.equal(pattern.usesWeekendFallback, false);
  assert.equal(pattern.loggedEntryCount, 16);
});

test('drink insights summarize local time, weekday/weekend, and optional context patterns', () => {
  const referenceTimestamp = new Date(2025, 5, 29, 12).getTime();
  const entries = [];
  for (const day of [2, 9, 16, 23]) {
    entries.push({
      ...loggedEntry,
      id: `weekday-${day}`,
      timestamp: new Date(2025, 5, day, 10).getTime(),
      alcoholPercent: 5.2,
      volume: 12,
      contextTags: ['stress'],
    });
  }
  for (const day of [7, 14, 21, 28]) {
    for (const hour of [19, 22]) {
      entries.push({
        ...loggedEntry,
        id: `weekend-${day}-${hour}`,
        timestamp: new Date(2025, 5, day, hour).getTime(),
        alcoholPercent: 5.2,
        volume: 12,
        contextTags: ['social'],
      });
    }
  }
  entries.push({
    ...loggedEntry,
    id: 'current-day-entry',
    timestamp: new Date(2025, 5, 29, 10).getTime(),
    contextTags: ['social'],
  });
  entries.push({
    ...loggedEntry,
    id: 'outside-window-entry',
    timestamp: new Date(2025, 4, 31, 10).getTime(),
    contextTags: ['social'],
  });

  const insights = calculateDrinkPatternInsights(entries, referenceTimestamp);

  assert.equal(localDayKey(insights.startTimestamp), '2025-06-01');
  assert.equal(localDayKey(insights.endExclusiveTimestamp), '2025-06-29');
  assert.equal(insights.loggedEntryCount, 12);
  assert.equal(insights.loggedDayCount, 8);
  assert.equal(insights.hasEnoughData, true);
  assert.equal(insights.timePeriodCounts.morning, 4);
  assert.equal(insights.timePeriodCounts.afternoon, 0);
  assert.equal(insights.timePeriodCounts.evening, 4);
  assert.equal(insights.timePeriodCounts.lateNight, 4);
  assert.equal(insights.weekdayLoggedDayCount, 4);
  assert.equal(insights.weekendLoggedDayCount, 4);
  assert.ok(insights.averageStandardDrinksOnWeekends >
    insights.averageStandardDrinksOnWeekdays);
  assert.deepEqual(
    insights.contextComparisons.map((comparison) => comparison.tag),
    ['social', 'stress'],
  );
  assert.equal(insights.contextComparisons[0].taggedDayCount, 4);
  assert.equal(insights.contextComparisons[0].otherTaggedDayCount, 4);
  assert.ok(
    insights.contextComparisons[0].averageStandardDrinksOnTaggedDays >
      insights.contextComparisons[0].averageStandardDrinksOnOtherTaggedDays,
  );
  assert.equal(
    calculateDrinkPatternInsights(entries.slice(0, 11), referenceTimestamp)
      .hasEnoughData,
    false,
  );
});

test('recent pattern comparison compares adjacent complete local periods and reports neutral changes', () => {
  const referenceTimestamp = new Date(2025, 6, 1, 12).getTime();
  const recentStart = new Date(2025, 5, 3).getTime();
  const previousStart = new Date(2025, 4, 6).getTime();
  const entries = [];

  for (const [periodStart, period, hour, volume] of [
    [previousStart, 'previous', 10, 12],
    [recentStart, 'recent', 19, 24],
  ]) {
    for (let day = 1; day <= 21; day += 4) {
      for (let count = 0; count < 2; count += 1) {
        const timestamp = new Date(periodStart);
        timestamp.setDate(timestamp.getDate() + day);
        timestamp.setHours(hour + count, 0, 0, 0);
        entries.push({
          ...loggedEntry,
          id: `${period}-${day}-${count}`,
          timestamp: timestamp.getTime(),
          alcoholPercent: 5,
          volume,
        });
      }
    }
  }

  const comparison = calculateRecentDrinkPatternComparison(
    entries,
    referenceTimestamp,
  );

  assert.ok(comparison);
  assert.equal(localDayKey(comparison.previous.startTimestamp), '2025-05-06');
  assert.equal(
    localDayKey(comparison.previous.endExclusiveTimestamp),
    '2025-06-03',
  );
  assert.equal(localDayKey(comparison.recent.startTimestamp), '2025-06-03');
  assert.equal(
    localDayKey(comparison.recent.endExclusiveTimestamp),
    '2025-07-01',
  );
  assert.equal(comparison.previous.loggedEntryCount, 12);
  assert.equal(comparison.previous.loggedDayCount, 6);
  assert.equal(comparison.recent.loggedEntryCount, 12);
  assert.equal(comparison.recent.loggedDayCount, 6);
  assert.ok(comparison.standardDrinkChange > 0);
  assert.equal(comparison.timePeriodShareChanges.morning, -100);
  assert.equal(comparison.timePeriodShareChanges.evening, 100);
  assert.equal(comparison.timePeriodShareChanges.afternoon, 0);
  assert.equal(comparison.timePeriodShareChanges.lateNight, 0);
});

test('recent pattern comparison reports weekday and weekend averages per logged day', () => {
  const referenceTimestamp = new Date(2025, 6, 1, 12).getTime();
  const periods = [
    {
      start: new Date(2025, 4, 6).getTime(),
      label: 'previous',
      weekdayDrinks: 1,
      weekendDrinks: 3,
    },
    {
      start: new Date(2025, 5, 3).getTime(),
      label: 'recent',
      weekdayDrinks: 2,
      weekendDrinks: 4,
    },
  ];
  const entries = [];

  for (const period of periods) {
    const start = new Date(period.start);
    let weekdaysAdded = 0;
    let weekendsAdded = 0;
    for (let offset = 0; offset < 28; offset += 1) {
      const day = new Date(start);
      day.setDate(day.getDate() + offset);
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      if (
        (isWeekend && weekendsAdded >= 2) ||
        (!isWeekend && weekdaysAdded >= 6)
      ) {
        continue;
      }

      const drinkCount = isWeekend
        ? period.weekendDrinks
        : period.weekdayDrinks;
      for (let drink = 0; drink < drinkCount; drink += 1) {
        entries.push({
          ...loggedEntry,
          id: `${period.label}-${offset}-${drink}`,
          timestamp: day.getTime() + 12 * 60 * 60 * 1000,
          alcoholPercent: 100,
          volume: 14 / 0.789,
          unit: 'ml',
        });
      }
      if (!isWeekend && weekdaysAdded === 0) {
        entries.push({
          ...loggedEntry,
          id: `${period.label}-without-details`,
          timestamp: day.getTime() + 13 * 60 * 60 * 1000,
          alcoholPercent: null,
          volume: null,
          unit: null,
        });
      }
      if (isWeekend) weekendsAdded += 1;
      else weekdaysAdded += 1;
    }
  }

  const comparison = calculateRecentDrinkPatternComparison(
    entries,
    referenceTimestamp,
  );

  assert.ok(comparison);
  assert.equal(comparison.previous.weekdayLoggedDayCount, 6);
  assert.equal(comparison.previous.weekendLoggedDayCount, 2);
  assert.equal(comparison.recent.weekdayLoggedDayCount, 6);
  assert.equal(comparison.recent.weekendLoggedDayCount, 2);
  assert.equal(
    Math.round(comparison.previous.averageStandardDrinksOnWeekdays * 100) / 100,
    1,
  );
  assert.equal(
    Math.round(comparison.previous.averageStandardDrinksOnWeekends * 100) / 100,
    3,
  );
  assert.equal(
    Math.round(comparison.recent.averageStandardDrinksOnWeekdays * 100) / 100,
    2,
  );
  assert.equal(
    Math.round(comparison.recent.averageStandardDrinksOnWeekends * 100) / 100,
    4,
  );
  assert.equal(comparison.previous.entriesWithoutDetails, 1);
  assert.equal(comparison.recent.entriesWithoutDetails, 1);
});

test('recent pattern comparison is hidden unless both periods meet the data threshold', () => {
  const referenceTimestamp = new Date(2025, 6, 1, 12).getTime();
  const recentStart = new Date(2025, 5, 3).getTime();
  const previousStart = new Date(2025, 4, 6).getTime();
  const entries = [];

  for (const [periodStart, period] of [
    [previousStart, 'previous'],
    [recentStart, 'recent'],
  ]) {
    for (let day = 1; day <= 21; day += 4) {
      for (let count = 0; count < 2; count += 1) {
        const timestamp = new Date(periodStart);
        timestamp.setDate(timestamp.getDate() + day);
        timestamp.setHours(19 + count, 0, 0, 0);
        entries.push({
          ...loggedEntry,
          id: `${period}-${day}-${count}`,
          timestamp: timestamp.getTime(),
          alcoholPercent: 5,
          volume: 12,
        });
      }
    }
  }

  assert.equal(
    calculateRecentDrinkPatternComparison(entries.slice(1), referenceTimestamp),
    null,
  );
  assert.equal(
    calculateRecentDrinkPatternComparison(
      entries.filter((entry) => entry.id.startsWith('recent-')),
      referenceTimestamp,
    ),
    null,
  );
});

test('recent pattern comparison keeps 28-day windows on local dates across daylight saving time', () => {
  const referenceTimestamp = new Date(2025, 2, 21, 12).getTime();
  const recentStart = new Date(2025, 1, 21).getTime();
  const previousStart = new Date(2025, 0, 24).getTime();
  const entries = [];

  for (const [periodStart, period] of [
    [previousStart, 'previous'],
    [recentStart, 'recent'],
  ]) {
    for (let day = 1; day <= 21; day += 4) {
      for (let count = 0; count < 2; count += 1) {
        const timestamp = new Date(periodStart);
        timestamp.setDate(timestamp.getDate() + day);
        timestamp.setHours(19 + count, 0, 0, 0);
        entries.push({
          ...loggedEntry,
          id: `${period}-${day}-${count}`,
          timestamp: timestamp.getTime(),
          alcoholPercent: 5,
          volume: 12,
        });
      }
    }
  }

  const comparison = calculateRecentDrinkPatternComparison(
    entries,
    referenceTimestamp,
  );

  assert.ok(comparison);
  assert.equal(localDayKey(comparison.previous.startTimestamp), '2025-01-24');
  assert.equal(
    localDayKey(comparison.previous.endExclusiveTimestamp),
    '2025-02-21',
  );
  assert.equal(localDayKey(comparison.recent.startTimestamp), '2025-02-21');
  assert.equal(
    localDayKey(comparison.recent.endExclusiveTimestamp),
    '2025-03-21',
  );
  assert.equal(
    comparison.recent.endExclusiveTimestamp -
      comparison.recent.startTimestamp,
    28 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
  );
});

test('period comparisons exclude entries without drink details from standard-drink totals', () => {
  const referenceTimestamp = new Date(2025, 6, 1, 12).getTime();
  const recentStart = new Date(2025, 5, 3).getTime();
  const previousStart = new Date(2025, 4, 6).getTime();
  const entries = [];

  for (const [periodStart, period] of [
    [previousStart, 'previous'],
    [recentStart, 'recent'],
  ]) {
    for (let day = 1; day <= 21; day += 4) {
      for (let count = 0; count < 2; count += 1) {
        const timestamp = new Date(periodStart);
        timestamp.setDate(timestamp.getDate() + day);
        timestamp.setHours(19 + count, 0, 0, 0);
        entries.push({
          ...loggedEntry,
          id: `${period}-${day}-${count}`,
          timestamp: timestamp.getTime(),
          alcoholPercent: 5,
          volume: 12,
        });
      }
    }
  }
  entries.push({
    ...loggedEntry,
    id: 'recent-without-details',
    timestamp: new Date(2025, 5, 28, 15).getTime(),
    alcoholPercent: null,
    volume: null,
    unit: null,
  });

  const comparison = calculateRecentDrinkPatternComparison(
    entries,
    referenceTimestamp,
  );

  assert.ok(comparison);
  assert.equal(comparison.recent.loggedEntryCount, 13);
  assert.equal(comparison.recent.entriesWithoutDetails, 1);
  assert.equal(comparison.previous.entriesWithoutDetails, 0);
  assert.equal(
    comparison.recent.totalStandardDrinks,
    12 *
      standardDrinkEquivalent({
        ...loggedEntry,
        alcoholPercent: 5,
        volume: 12,
      }),
  );
});

test('suggested taper goals preserve each weekly target and use a weekend-weighted fallback', () => {
  const referenceTimestamp = new Date(2025, 5, 29, 12).getTime();
  const startTimestamp = new Date(2025, 5, 29, 12).getTime();
  const entries = [];
  for (const day of [6, 13, 20, 27]) {
    entries.push({
      ...loggedEntry,
      id: `friday-${day}`,
      timestamp: new Date(2025, 5, day, 20).getTime(),
      alcoholPercent: 5,
      volume: 12,
    });
  }
  for (const day of [7, 14, 21, 28]) {
    for (let count = 0; count < 3; count += 1) {
      entries.push({
        ...loggedEntry,
        id: `saturday-${day}-${count}`,
        timestamp: new Date(2025, 5, day, 20 + count).getTime(),
        alcoholPercent: 5,
        volume: 12,
      });
    }
  }

  const plan = suggestTaperGoalOverrides(
    entries,
    startTimestamp,
    20,
    10,
    2,
    referenceTimestamp,
  );

  assert.equal(plan.startDayKey, '2025-06-29');
  assert.equal(plan.endDayKey, '2025-07-12');
  assert.deepEqual(plan.weeklyTargets, [15, 10]);
  assert.equal(Object.keys(plan.goals).length, 14);
  assert.ok(plan.goals['2025-07-05'] > plan.goals['2025-06-30']);
  for (let week = 0; week < 2; week += 1) {
    const firstDay = new Date(2025, 5, 29 + week * 7);
    const weeklyTotal = Array.from({ length: 7 }, (_, offset) => {
      const day = new Date(firstDay);
      day.setDate(firstDay.getDate() + offset);
      return plan.goals[localDayKey(day.getTime())];
    }).reduce((total, goal) => total + goal, 0);
    assert.equal(Math.round(weeklyTotal * 100) / 100, plan.weeklyTargets[week]);
  }

  const fallbackPlan = suggestTaperGoalOverrides(
    [],
    startTimestamp,
    10,
    5,
    1,
    referenceTimestamp,
  );
  assert.equal(fallbackPlan.usesWeekendFallback, true);
  assert.ok(
    fallbackPlan.goals['2025-07-05'] >
      fallbackPlan.goals['2025-06-30'],
  );
  assert.throws(() =>
    suggestTaperGoalOverrides([], startTimestamp, 10, 10, 1, referenceTimestamp),
  );
});

test('edits persist locally while existing history keeps its original details after reload', async () => {
  const originalHistory = JSON.stringify([loggedEntry]);
  const { storage, values, writes } = createStorage({
    [ENTRIES_STORAGE_KEY]: originalHistory,
    [SAVED_DRINKS_STORAGE_KEY]: JSON.stringify([originalDrink]),
  });

  const updated = updateSavedDrinkDefinition(
    parseSavedDrinkList(await storage.getItem(SAVED_DRINKS_STORAGE_KEY)),
    originalDrink.id,
    editedDetails,
  );
  await persistSavedDrinkList(storage, updated);

  const reloadedSavedDrinks = parseSavedDrinkList(
    await storage.getItem(SAVED_DRINKS_STORAGE_KEY),
  );
  const reloadedHistory = JSON.parse(
    (await storage.getItem(ENTRIES_STORAGE_KEY)) ?? 'null',
  );

  assert.deepEqual(reloadedSavedDrinks, [
    { ...originalDrink, ...editedDetails },
  ]);
  assert.deepEqual(reloadedHistory, [loggedEntry]);
  assert.equal(values.get(ENTRIES_STORAGE_KEY), originalHistory);
  assert.deepEqual(writes, [SAVED_DRINKS_STORAGE_KEY]);
});

test('canceling a saved-drink name conflict leaves both definitions and the editor unchanged', async () => {
  const originalHistory = JSON.stringify([loggedEntry]);
  const initialDrinks = [originalDrink, conflictingDrink, unrelatedDrink];
  const { storage, values, writes } = createStorage({
    [ENTRIES_STORAGE_KEY]: originalHistory,
    [SAVED_DRINKS_STORAGE_KEY]: JSON.stringify(initialDrinks),
  });
  let editorOpen = true;
  let alertButtons = [];

  confirmSavedDrinkNameConflict(
    conflictingDrink.name,
    originalDrink.name,
    false,
    () => assert.fail('Native confirmation should not use the web prompt'),
    (title, message, buttons) => {
      assert.equal(title, 'A saved drink already uses this name');
      assert.match(message, /Drinks already logged will keep their original details/);
      alertButtons = buttons;
    },
    () => {
      assert.fail('Canceling must not replace a saved drink');
    },
  );

  assert.deepEqual(
    alertButtons.map(({ text, style }) => ({ text, style })),
    [
      { text: 'Change name', style: 'cancel' },
      { text: 'Replace saved drink', style: 'destructive' },
    ],
  );
  alertButtons[0].onPress?.();

  let webPromptMessage = '';
  confirmSavedDrinkNameConflict(
    conflictingDrink.name,
    originalDrink.name,
    true,
    (message) => {
      webPromptMessage = message;
      return false;
    },
    () => assert.fail('Web confirmation should not open a native alert'),
    () => assert.fail('Canceling the web prompt must not replace a saved drink'),
  );

  assert.equal(editorOpen, true);
  assert.match(webPromptMessage, /Choose OK to replace it, or Cancel to change the name/);
  assert.deepEqual(writes, []);
  assert.deepEqual(
    parseSavedDrinkList(await storage.getItem(SAVED_DRINKS_STORAGE_KEY)),
    initialDrinks,
  );
  assert.deepEqual(JSON.parse(values.get(ENTRIES_STORAGE_KEY)), [loggedEntry]);
  assert.equal(values.get(ENTRIES_STORAGE_KEY), originalHistory);
});

test('confirming a saved-drink name conflict replaces only the matching definition and closes the editor', async () => {
  const originalHistory = JSON.stringify([loggedEntry]);
  const initialDrinks = [originalDrink, conflictingDrink, unrelatedDrink];
  const { storage, values, writes } = createStorage({
    [ENTRIES_STORAGE_KEY]: originalHistory,
    [SAVED_DRINKS_STORAGE_KEY]: JSON.stringify(initialDrinks),
  });
  let editorOpen = true;
  let alertButtons = [];
  let savePromise = Promise.resolve();

  confirmSavedDrinkNameConflict(
    conflictingDrink.name,
    originalDrink.name,
    false,
    () => assert.fail('Native confirmation should not use the web prompt'),
    (_title, _message, buttons) => {
      alertButtons = buttons;
    },
    () => {
      const nextDrinks = replaceSavedDrinkAfterNameConflict(
        parseSavedDrinkList(values.get(SAVED_DRINKS_STORAGE_KEY)),
        originalDrink.id,
        conflictingDrink.id,
        editedDetails,
        300,
      );
      savePromise = persistSavedDrinkList(storage, nextDrinks);
      editorOpen = false;
    },
  );
  alertButtons[1].onPress?.();
  await savePromise;

  assert.equal(editorOpen, false);
  assert.deepEqual(
    parseSavedDrinkList(await storage.getItem(SAVED_DRINKS_STORAGE_KEY)),
    [
      { ...conflictingDrink, ...editedDetails, savedAt: 300 },
      unrelatedDrink,
    ],
  );
  assert.deepEqual(JSON.parse(values.get(ENTRIES_STORAGE_KEY)), [loggedEntry]);
  assert.equal(values.get(ENTRIES_STORAGE_KEY), originalHistory);
  assert.deepEqual(writes, [SAVED_DRINKS_STORAGE_KEY]);
});

test('a failed confirmed replacement keeps the editor open and retry saves only the intended drink', async () => {
  const initialDrinks = [originalDrink, conflictingDrink, unrelatedDrink];
  const { storage, values, writes } = createStorage({
    [SAVED_DRINKS_STORAGE_KEY]: JSON.stringify(initialDrinks),
  });
  let shouldFail = true;
  const failingStorage = {
    ...storage,
    async setItem(key, value) {
      if (shouldFail && key === SAVED_DRINKS_STORAGE_KEY) {
        shouldFail = false;
        throw new Error('storage unavailable');
      }
      await storage.setItem(key, value);
    },
  };
  let visibleDrinks = initialDrinks;
  let editorOpen = true;
  let saveFailed = false;
  let pendingReplacement = null;
  const replacement = replaceSavedDrinkAfterNameConflict(
    initialDrinks,
    originalDrink.id,
    conflictingDrink.id,
    editedDetails,
    300,
  );
  const writer = createReliableStorageWriter(
    initialDrinks,
    (drinks) => persistSavedDrinkList(failingStorage, drinks),
    (drinks) => {
      visibleDrinks = drinks;
    },
    () => {
      saveFailed = true;
    },
    (savedDrinks) => {
      saveFailed = false;
      if (pendingReplacement === savedDrinks) {
        pendingReplacement = null;
        editorOpen = false;
      }
    },
  );

  pendingReplacement = replacement;
  writer.save(replacement);
  await new Promise(setImmediate);

  assert.equal(editorOpen, true);
  assert.equal(saveFailed, true);
  assert.deepEqual(visibleDrinks, initialDrinks);
  assert.equal(pendingReplacement, replacement);
  assert.deepEqual(replacement, [
    { ...conflictingDrink, ...editedDetails, savedAt: 300 },
    unrelatedDrink,
  ]);
  assert.deepEqual(
    parseSavedDrinkList(values.get(SAVED_DRINKS_STORAGE_KEY)),
    initialDrinks,
  );

  writer.retry();
  await new Promise(setImmediate);

  assert.equal(editorOpen, false);
  assert.equal(saveFailed, false);
  assert.deepEqual(
    parseSavedDrinkList(values.get(SAVED_DRINKS_STORAGE_KEY)),
    [
      { ...conflictingDrink, ...editedDetails, savedAt: 300 },
      unrelatedDrink,
    ],
  );
  assert.deepEqual(visibleDrinks, [
    { ...conflictingDrink, ...editedDetails, savedAt: 300 },
    unrelatedDrink,
  ]);
  assert.deepEqual(writes, [SAVED_DRINKS_STORAGE_KEY]);
});

test('saved-drink removal does nothing until confirmed and removes only the saved definition', async () => {
  const originalHistory = JSON.stringify([loggedEntry]);
  const { storage, values, writes } = createStorage({
    [ENTRIES_STORAGE_KEY]: originalHistory,
    [SAVED_DRINKS_STORAGE_KEY]: JSON.stringify([originalDrink]),
  });
  let removed = false;
  let removalPromise = Promise.resolve();
  const removeFromLibrary = () => {
    removed = true;
    removalPromise = persistSavedDrinkList(
      storage,
      removeSavedDrinkDefinition(
        parseSavedDrinkList(values.get(SAVED_DRINKS_STORAGE_KEY)),
        originalDrink.id,
      ),
    );
  };

  confirmSavedDrinkRemoval(
    originalDrink.name,
    true,
    () => false,
    () => assert.fail('Web confirmation should not open a native alert'),
    removeFromLibrary,
  );

  assert.equal(removed, false);
  assert.deepEqual(writes, []);

  confirmSavedDrinkRemoval(
    originalDrink.name,
    true,
    (message) => {
      assert.match(message, /Drinks already logged will keep their original details/);
      return true;
    },
    () => assert.fail('Web confirmation should not open a native alert'),
    removeFromLibrary,
  );
  await removalPromise;

  assert.equal(removed, true);
  assert.deepEqual(
    parseSavedDrinkList(await storage.getItem(SAVED_DRINKS_STORAGE_KEY)),
    [],
  );
  assert.deepEqual(JSON.parse(values.get(ENTRIES_STORAGE_KEY) ?? 'null'), [
    loggedEntry,
  ]);
  assert.deepEqual(writes, [SAVED_DRINKS_STORAGE_KEY]);
});

test('native removal dialog offers cancel and only removes after the destructive action', () => {
  let buttons = [];
  let removed = false;

  confirmSavedDrinkRemoval(
    originalDrink.name,
    false,
    () => assert.fail('Native removal should use the native alert'),
    (title, message, alertButtons) => {
      assert.equal(title, 'Remove saved drink?');
      assert.match(message, /Original Pale Ale/);
      buttons = alertButtons;
    },
    () => {
      removed = true;
    },
  );

  assert.deepEqual(
    buttons.map(({ text, style }) => ({ text, style })),
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive' },
    ],
  );
  assert.equal(removed, false);
  buttons[0].onPress?.();
  assert.equal(removed, false);
  buttons[1].onPress?.();
  assert.equal(removed, true);
});

test('failed saved-drink writes restore the confirmed library and can be retried', async () => {
  const { storage, values } = createStorage({
    [SAVED_DRINKS_STORAGE_KEY]: JSON.stringify([originalDrink]),
  });
  const originalList = [originalDrink];
  const updatedList = [{ ...originalDrink, ...editedDetails }];
  const visibleLists = [];
  let failures = 0;
  let shouldFail = true;
  const failingStorage = {
    ...storage,
    async setItem(key, value) {
      if (shouldFail && key === SAVED_DRINKS_STORAGE_KEY) {
        shouldFail = false;
        throw new Error('storage unavailable');
      }
      await storage.setItem(key, value);
    },
  };
  const writer = createReliableStorageWriter(
    originalList,
    (list) => persistSavedDrinkList(failingStorage, list),
    (list) => visibleLists.push(list),
    () => { failures += 1; },
    () => { failures -= 1; },
  );

  writer.save(updatedList);
  await new Promise(setImmediate);

  assert.deepEqual(visibleLists.at(-1), originalList);
  assert.deepEqual(
    parseSavedDrinkList(values.get(SAVED_DRINKS_STORAGE_KEY)),
    originalList,
  );
  assert.equal(failures, 1);

  writer.retry();
  await new Promise(setImmediate);

  assert.deepEqual(visibleLists.at(-1), updatedList);
  assert.deepEqual(
    parseSavedDrinkList(values.get(SAVED_DRINKS_STORAGE_KEY)),
    updatedList,
  );
  assert.equal(failures, 0);
});

test('failed drink-history writes restore the confirmed history and can be retried', async () => {
  const { storage, values } = createStorage({
    [ENTRIES_STORAGE_KEY]: JSON.stringify([loggedEntry]),
  });
  const originalHistory = [loggedEntry];
  const updatedHistory = [
    loggedEntry,
    { ...loggedEntry, id: 'entry-2', timestamp: 300 },
  ];
  const visibleHistories = [];
  let failures = 0;
  let shouldFail = true;
  const failingStorage = {
    ...storage,
    async setItem(key, value) {
      if (shouldFail && key === ENTRIES_STORAGE_KEY) {
        shouldFail = false;
        throw new Error('storage unavailable');
      }
      await storage.setItem(key, value);
    },
  };
  const writer = createReliableStorageWriter(
    originalHistory,
    (history) => persistDrinkEntries(failingStorage, history),
    (history) => visibleHistories.push(history),
    () => { failures += 1; },
    () => { failures -= 1; },
  );

  writer.save(updatedHistory);
  await new Promise(setImmediate);

  assert.deepEqual(visibleHistories.at(-1), originalHistory);
  assert.deepEqual(
    JSON.parse(values.get(ENTRIES_STORAGE_KEY)),
    originalHistory,
  );
  assert.equal(failures, 1);

  writer.retry();
  await new Promise(setImmediate);

  assert.deepEqual(visibleHistories.at(-1), updatedHistory);
  assert.deepEqual(
    JSON.parse(values.get(ENTRIES_STORAGE_KEY)),
    updatedHistory,
  );
  assert.equal(failures, 0);
});
