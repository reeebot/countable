import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ContextTagSettings } from '@/components/ContextTagSettings';
import { SpendingTracker } from '@/components/SpendingTracker';
import {
  createDrinkBackupFile,
  mergeDrinkBackupData,
  parseDrinkBackupFile,
  type DrinkBackupData,
} from '@/lib/drink-backup';
import { DrinkEditor } from '@/components/DrinkEditor';
import { DrinkPatterns } from '@/components/DrinkPatterns';
import { GoalCalendar } from '@/components/GoalCalendar';
import {
  createDrinkId,
  caloriesForDrink,
  confirmSavedDrinkRemoval,
  createReliableStorageWriter,
  DEFAULT_DRINK_CONTEXT_TAGS,
  DAILY_GOAL_OVERRIDES_STORAGE_KEY,
  DRINK_CONTEXT_TAGS_STORAGE_KEY,
  drinkContextTagLabel,
  drinkEntriesToCsv,
  filterDrinkEntriesByLocalDateRange,
  ENTRIES_STORAGE_KEY,
  getDrinkEntryRestoreIndex,
  confirmSavedDrinkNameConflict,
  findSavedDrinkNameConflict,
  formatStandardDrinkCount,
  formatVolume,
  isValidLocalDateRange,
  localDayKey,
  normalizeDailyGoalOverrides,
  DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY,
  normalizeDailyStandardDrinkGoal,
  normalizeDrinkEntries,
  parseDailyGoalOverrides,
  parseDrinkContextTagDefinitions,
  parseDailyStandardDrinkGoal,
  parseSavedDrinkList,
  persistDailyGoalOverrides,
  persistDrinkContextTagDefinitions,
  persistDailyStandardDrinkGoal,
  persistDrinkEntries,
  persistSavedDrinkList,
  removeDrinkEntry,
  replaceSavedDrinkAfterNameConflict,
  restoreRemovedDrinkEntry,
  removeSavedDrinkDefinition,
  scheduleDrinkRemovalUndoExpiry,
  SAVED_DRINKS_STORAGE_KEY,
  sortSavedDrinksForQuickAccess,
  shiftLocalWeek,
  standardDrinkEquivalent,
  summarizeDrinkEntriesForLocalWeek,
  summarizeDailyGoalsForLocalWeek,
  summarizeDrinkEntriesByLocalDay,
  summarizeDrinkEntriesByLocalWeek,
  updateSavedDrinkDefinition,
  toggleSavedDrinkFavorite,
  type DrinkDetails,
  type DrinkContextTag,
  type DrinkContextTagDefinition,
  type DrinkEntry,
  type RemovedDrinkEntry,
  type DailyGoalOverrides,
  type ReliableStorageWriter,
  type SavedDrink,
} from '@/lib/drink-data';
import { useColors } from '@/hooks/useColors';
import { syncCountableWidget } from '@/lib/countable-widget-sync';
import {
  assignStockDeductions,
  costCentsForEntry,
  formatCurrency,
  parseStockPurchaseList,
  persistStockPurchaseList,
  STOCK_PURCHASES_STORAGE_KEY,
  type StockPurchase,
} from '@/lib/spending-data';

function displayDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function localDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function displayHistoryDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function displayWeekRange(
  startTimestamp: number,
  endExclusiveTimestamp: number,
): string {
  const start = new Date(startTimestamp);
  const end = new Date(endExclusiveTimestamp);
  end.setDate(end.getDate() - 1);
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  return `${start.toLocaleDateString(undefined, options)} – ${end.toLocaleDateString(undefined, options)}`;
}

function displayTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const NAV_TABS = [
  { id: 'log', label: 'Log', icon: 'plus-circle' },
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'goals', label: 'Goals', icon: 'target' },
  { id: 'patterns', label: 'Patterns', icon: 'bar-chart-2' },
  { id: 'money', label: 'Money', icon: 'dollar-sign' },
] as const;

type NavigationTab = (typeof NAV_TABS)[number]['id'];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { widgetAdd } = useLocalSearchParams<{
    widgetAdd?: string | string[];
  }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<NavigationTab>('log');
  const scrollRef = useRef<ScrollView | null>(null);
  const [entries, setEntries] = useState<DrinkEntry[]>([]);
  const entriesRef = useRef<DrinkEntry[]>([]);
  const entriesWriter = useRef<ReliableStorageWriter<DrinkEntry[]> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const handledWidgetAddRef = useRef<string | null>(null);
  const [pendingRemovals, setPendingRemovals] = useState<RemovedDrinkEntry[]>([]);
  const pendingRemovalsRef = useRef<RemovedDrinkEntry[]>([]);
  const removalOrderRef = useRef<string[]>([]);
  const undoTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [savedDrinks, setSavedDrinks] = useState<SavedDrink[]>([]);
  const savedDrinksRef = useRef<SavedDrink[]>([]);
  const savedDrinksWriter = useRef<ReliableStorageWriter<SavedDrink[]> | null>(null);
  const [stockPurchases, setStockPurchases] = useState<StockPurchase[]>([]);
  const stockPurchasesRef = useRef<StockPurchase[]>([]);
  const stockPurchasesWriter =
    useRef<ReliableStorageWriter<StockPurchase[]> | null>(null);
  const pendingSavedDrinkReplacementRef = useRef<SavedDrink[] | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedSaves, setFailedSaves] = useState({
    entries: false,
    savedDrinks: false,
    stockPurchases: false,
  });
  const [now, setNow] = useState(Date.now());
  const [dailyStandardDrinkGoal, setDailyStandardDrinkGoal] =
    useState<number | null>(null);
  const [dailyGoalOverrides, setDailyGoalOverrides] =
    useState<DailyGoalOverrides>({});
  const [contextTagDefinitions, setContextTagDefinitions] =
    useState<DrinkContextTagDefinition[]>(DEFAULT_DRINK_CONTEXT_TAGS);
  const [dailyGoalInput, setDailyGoalInput] = useState('');
  const [isEditingDailyGoal, setIsEditingDailyGoal] = useState(false);
  const [isSavingDailyGoal, setIsSavingDailyGoal] = useState(false);
  const [dailyGoalError, setDailyGoalError] = useState<string | null>(null);
  const [isManagingGoals, setIsManagingGoals] = useState(false);
  const [isManagingContextTags, setIsManagingContextTags] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addingDrinkTimestamp, setAddingDrinkTimestamp] = useState<number | null>(
    null,
  );
  const [editingDrink, setEditingDrink] = useState<SavedDrink | null>(null);
  const [editingLoggedEntry, setEditingLoggedEntry] = useState<DrinkEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedHistoryDay, setExpandedHistoryDay] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<number | null>(null);
  const [isDateRangeExportOpen, setIsDateRangeExportOpen] = useState(false);
  const [exportStartDay, setExportStartDay] = useState('');
  const [exportEndDay, setExportEndDay] = useState('');
  const [exportDateError, setExportDateError] = useState<string | null>(null);
  const [backupAction, setBackupAction] = useState<'export' | 'import' | null>(
    null,
  );
  const activeTabLabel =
    NAV_TABS.find((tab) => tab.id === activeTab)?.label ?? 'Log';

  function navigateToTab(tab: NavigationTab) {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setActiveTab(tab);
  }

  function createEntriesStorageWriter(initialEntries: DrinkEntry[]) {
    return createReliableStorageWriter(
      initialEntries,
      (nextEntries) => persistDrinkEntries(AsyncStorage, nextEntries),
      (nextEntries) => {
        entriesRef.current = nextEntries;
        setEntries(nextEntries);
      },
      () => setFailedSaves((current) => ({ ...current, entries: true })),
      () => setFailedSaves((current) => ({ ...current, entries: false })),
    );
  }

  async function refreshEntriesAfterWidgetAction() {
    if (failedSaves.entries) return;
    try {
      const storedEntries = await AsyncStorage.getItem(ENTRIES_STORAGE_KEY);
      const parsedEntries =
        storedEntries === null ? [] : (JSON.parse(storedEntries) as unknown);
      const normalized = normalizeDrinkEntries(parsedEntries);
      if (!normalized) {
        throw new Error('Saved drink history has an unexpected format.');
      }

      const priorOrder = new Map(
        removalOrderRef.current.map((id, index) => [id, index]),
      );
      entriesRef.current = normalized.entries;
      setEntries(normalized.entries);
      removalOrderRef.current = [
        ...normalized.entries,
        ...pendingRemovalsRef.current.map((removed) => removed.entry),
      ]
        .sort(
          (first, second) =>
            first.timestamp - second.timestamp ||
            (priorOrder.get(first.id) ?? Number.MAX_SAFE_INTEGER) -
              (priorOrder.get(second.id) ?? Number.MAX_SAFE_INTEGER),
        )
        .map((entry) => entry.id);
      entriesWriter.current = createEntriesStorageWriter(normalized.entries);
      setFailedSaves((current) => ({ ...current, entries: false }));
    } catch {
      setErrorMessage(
        "Couldn't refresh your drink history after a home-screen update. Reopen Countable and try again.",
      );
    }
  }

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (
        (previousState === 'background' || previousState === 'inactive') &&
        nextState === 'active'
      ) {
        void refreshEntriesAfterWidgetAction();
      }
    });

    return () => subscription.remove();
  }, [failedSaves.entries]);

  function createSavedDrinksStorageWriter(initialDrinks: SavedDrink[]) {
    return createReliableStorageWriter(
      initialDrinks,
      (nextDrinks) => persistSavedDrinkList(AsyncStorage, nextDrinks),
      (nextDrinks) => {
        savedDrinksRef.current = nextDrinks;
        setSavedDrinks(nextDrinks);
      },
      () => setFailedSaves((current) => ({ ...current, savedDrinks: true })),
      (nextDrinks) => {
        setFailedSaves((current) => ({ ...current, savedDrinks: false }));
        if (pendingSavedDrinkReplacementRef.current === nextDrinks) {
          pendingSavedDrinkReplacementRef.current = null;
          setEditingDrink(null);
        }
      },
    );
  }

  function createStockPurchasesStorageWriter(initialPurchases: StockPurchase[]) {
    return createReliableStorageWriter(
      initialPurchases,
      (nextPurchases) => persistStockPurchaseList(AsyncStorage, nextPurchases),
      (nextPurchases) => {
        stockPurchasesRef.current = nextPurchases;
        setStockPurchases(nextPurchases);
      },
      () =>
        setFailedSaves((current) => ({ ...current, stockPurchases: true })),
      () =>
        setFailedSaves((current) => ({ ...current, stockPurchases: false })),
    );
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(ENTRIES_STORAGE_KEY),
      AsyncStorage.getItem(SAVED_DRINKS_STORAGE_KEY),
      AsyncStorage.getItem(STOCK_PURCHASES_STORAGE_KEY),
      AsyncStorage.getItem(DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY),
      AsyncStorage.getItem(DAILY_GOAL_OVERRIDES_STORAGE_KEY),
      AsyncStorage.getItem(DRINK_CONTEXT_TAGS_STORAGE_KEY),
    ])
      .then(
        async ([
          storedEntries,
          storedSavedDrinks,
          storedStockPurchases,
          storedDailyGoal,
          storedGoalOverrides,
          storedContextTags,
        ]) => {
        if (!active) return;
        let loadedEntries: DrinkEntry[] = [];
        if (storedEntries) {
          const parsed: unknown = JSON.parse(storedEntries);
          const normalized = normalizeDrinkEntries(parsed);
          if (!normalized) {
            throw new Error('Saved drink history has an unexpected format.');
          }
          loadedEntries = normalized.entries;
          if (normalized.migrated) {
            await AsyncStorage.setItem(
              ENTRIES_STORAGE_KEY,
              JSON.stringify(loadedEntries),
            );
          }
        }
        const loadedSavedDrinks = storedSavedDrinks
          ? parseSavedDrinkList(storedSavedDrinks)
          : [];
        const loadedStockPurchases =
          parseStockPurchaseList(storedStockPurchases);
        const loadedDailyGoal = parseDailyStandardDrinkGoal(storedDailyGoal);
        const loadedGoalOverrides = parseDailyGoalOverrides(
          storedGoalOverrides,
        );
        const loadedContextTags =
          parseDrinkContextTagDefinitions(storedContextTags);
        if (!active) return;

        entriesRef.current = loadedEntries;
        removalOrderRef.current = loadedEntries.map((entry) => entry.id);
        setEntries(loadedEntries);
        savedDrinksRef.current = loadedSavedDrinks;
        setSavedDrinks(loadedSavedDrinks);
        stockPurchasesRef.current = loadedStockPurchases;
        setStockPurchases(loadedStockPurchases);
        setDailyStandardDrinkGoal(loadedDailyGoal);
        setDailyGoalOverrides(loadedGoalOverrides);
        setContextTagDefinitions(loadedContextTags);
        entriesWriter.current = createEntriesStorageWriter(loadedEntries);
        savedDrinksWriter.current =
          createSavedDrinksStorageWriter(loadedSavedDrinks);
        stockPurchasesWriter.current =
          createStockPurchasesStorageWriter(loadedStockPurchases);
        },
      )
      .catch(() => {
        if (active) {
          setErrorMessage("Couldn't load your saved drinks and settings.");
        }
      })
      .finally(() => {
        if (active) setIsReady(true);
      });

    const minuteTimer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      active = false;
      clearInterval(minuteTimer);
    };
  }, []);

  useEffect(
    () => () => {
      for (const timer of undoTimers.current.values()) clearTimeout(timer);
      undoTimers.current.clear();
    },
    [],
  );

  const todayKey = localDayKey(now);
  const hasTodayGoalOverride = Object.prototype.hasOwnProperty.call(
    dailyGoalOverrides,
    todayKey,
  );
  const effectiveDailyGoal = hasTodayGoalOverride
    ? dailyGoalOverrides[todayKey]
    : dailyStandardDrinkGoal;
  const todayEntries = entries.filter(
    (entry) => localDayKey(entry.timestamp) === todayKey,
  );
  const recentEntries = todayEntries.slice().reverse();
  const standardDrinksToday = todayEntries.reduce(
    (total, entry) => total + standardDrinkEquivalent(entry),
    0,
  );
  const editingEntryDayTotal = editingLoggedEntry
    ? entries
        .filter(
          (entry) =>
            localDayKey(entry.timestamp) ===
            localDayKey(editingLoggedEntry.timestamp),
        )
        .reduce((total, entry) => total + standardDrinkEquivalent(entry), 0)
    : undefined;
  const dailyGoalProgress =
    effectiveDailyGoal === null
      ? 0
      : effectiveDailyGoal === 0
        ? standardDrinksToday === 0
          ? 1
          : 0
        : Math.min(standardDrinksToday / effectiveDailyGoal, 1);
  const isOverDailyGoal =
    effectiveDailyGoal !== null && standardDrinksToday > effectiveDailyGoal;
  const dailyGoalPercentComplete =
    effectiveDailyGoal === null
      ? null
      : effectiveDailyGoal === 0
        ? standardDrinksToday === 0
          ? 100
          : null
        : Math.round((standardDrinksToday / effectiveDailyGoal) * 100);
  const counterBackgroundColor = isOverDailyGoal
    ? colors.goalExceeded
    : colors.primary;
  const counterForegroundColor = isOverDailyGoal
    ? colors.goalExceededForeground
    : colors.primaryForeground;
  const counterGoalFillPercent = isOverDailyGoal
    ? 100
    : Math.round(dailyGoalProgress * 100);
  const dailyGoalRemaining =
    effectiveDailyGoal === null
      ? null
      : Math.max(effectiveDailyGoal - standardDrinksToday, 0);
  const pastDaySummaries = summarizeDrinkEntriesByLocalDay(
    entries.filter((entry) => localDayKey(entry.timestamp) !== todayKey),
  );
  const currentWeekSummary = summarizeDrinkEntriesForLocalWeek(entries, now);
  const weeklySummary =
    selectedWeekStart === null
      ? currentWeekSummary
      : summarizeDrinkEntriesForLocalWeek(entries, selectedWeekStart);
  const weeklyDaySummaries = summarizeDrinkEntriesByLocalWeek(
    entries,
    weeklySummary.startTimestamp,
  );
  const weeklyGoalSummary = summarizeDailyGoalsForLocalWeek(
    weeklySummary.startTimestamp,
    dailyStandardDrinkGoal,
    dailyGoalOverrides,
  );
  const weeklyDaysWithoutGoals = weeklyGoalSummary.daysWithoutGoals;
  const plannedWeeklyStandardDrinks =
    weeklyGoalSummary.plannedStandardDrinks;
  const isCurrentWeek =
    weeklySummary.startTimestamp === currentWeekSummary.startTimestamp;
  const matchingSavedDrinks = sortSavedDrinksForQuickAccess(
    savedDrinks.filter((drink) =>
      drink.name
        .toLocaleLowerCase()
        .includes(searchQuery.trim().toLocaleLowerCase()),
    ),
  );
  const favoriteSavedDrinks = matchingSavedDrinks.filter(
    (drink) => drink.isFavorite === true,
  );
  const otherSavedDrinks = matchingSavedDrinks.filter(
    (drink) => drink.isFavorite !== true,
  );
  const lastLoggedDrink = entries
    .slice()
    .reverse()
    .find(
      (entry) =>
        entry.alcoholPercent !== null &&
        entry.volume !== null &&
        entry.unit !== null,
    );
  const initialDrinkDetails: DrinkDetails | null =
    lastLoggedDrink &&
    lastLoggedDrink.alcoholPercent !== null &&
    lastLoggedDrink.volume !== null &&
    lastLoggedDrink.unit !== null
      ? {
          name: lastLoggedDrink.name,
          alcoholPercent: lastLoggedDrink.alcoholPercent,
          volume: lastLoggedDrink.volume,
          unit: lastLoggedDrink.unit,
          caloriesPer100Ml: lastLoggedDrink.caloriesPer100Ml,
        }
      : null;

  const normalizedWidgetAdd = Array.isArray(widgetAdd)
    ? widgetAdd[0]
    : widgetAdd;

  useEffect(() => {
    if (
      !normalizedWidgetAdd ||
      !isReady ||
      handledWidgetAddRef.current === normalizedWidgetAdd
    ) {
      return;
    }

    handledWidgetAddRef.current = normalizedWidgetAdd;
    if (initialDrinkDetails) {
      logDrink(initialDrinkDetails);
    } else {
      setAddingDrinkTimestamp(null);
      setSearchQuery('');
      setIsAdding(true);
    }
    router.replace('/');
  }, [normalizedWidgetAdd, isReady, initialDrinkDetails, router]);

  useEffect(() => {
    if (!isReady) return;
    syncCountableWidget({
      drinkCount: todayEntries.length,
      standardDrinks: standardDrinksToday,
      dailyGoal: effectiveDailyGoal,
      percentComplete: dailyGoalPercentComplete,
      isOverGoal: isOverDailyGoal,
      hasLastDrink: initialDrinkDetails !== null,
    });
  }, [
    isReady,
    todayKey,
    todayEntries.length,
    standardDrinksToday,
    effectiveDailyGoal,
    dailyGoalPercentComplete,
    isOverDailyGoal,
    initialDrinkDetails !== null,
  ]);

  function saveEntries(nextEntries: DrinkEntry[]) {
    setFailedSaves((current) => ({ ...current, entries: false }));
    entriesWriter.current?.save(nextEntries);
  }

  async function exportDrinkHistory() {
    if (!isReady || entries.length === 0) return;
    try {
      await Share.share({
        title: 'Drink history',
        message: drinkEntriesToCsv(entries, contextTagDefinitions),
      });
    } catch {
      Alert.alert(
        "Couldn't share your drink history",
        'Please try exporting again.',
      );
    }
  }

  function openDateRangeExport() {
    const timestamps = entries.map((entry) => entry.timestamp);
    setExportStartDay(localDayKey(Math.min(...timestamps)));
    setExportEndDay(localDayKey(Math.max(...timestamps)));
    setExportDateError(null);
    setIsDateRangeExportOpen(true);
  }

  async function exportDrinkHistoryForDateRange() {
    if (!isValidLocalDateRange(exportStartDay, exportEndDay)) {
      setExportDateError('Enter valid dates in YYYY-MM-DD format, with the start on or before the end.');
      return;
    }

    const selectedEntries = filterDrinkEntriesByLocalDateRange(
      entries,
      exportStartDay,
      exportEndDay,
    );
    if (selectedEntries.length === 0) {
      setExportDateError('No drinks were logged within those dates.');
      return;
    }

    try {
      await Share.share({
        title: 'Drink history',
        message: drinkEntriesToCsv(selectedEntries, contextTagDefinitions),
      });
      setIsDateRangeExportOpen(false);
    } catch {
      Alert.alert(
        "Couldn't share your drink history",
        'Please try exporting again.',
      );
    }
  }

  function saveSavedDrinks(nextSavedDrinks: SavedDrink[]) {
    setFailedSaves((current) => ({ ...current, savedDrinks: false }));
    savedDrinksWriter.current?.save(nextSavedDrinks);
  }

  function saveStockPurchases(nextPurchases: StockPurchase[]) {
    setFailedSaves((current) => ({ ...current, stockPurchases: false }));
    stockPurchasesWriter.current?.save(nextPurchases);
  }

  async function exportFullBackup() {
    if (!isReady || backupAction) return;
    setBackupAction('export');
    try {
      await Promise.all([
        entriesWriter.current?.flush() ?? Promise.resolve(),
        savedDrinksWriter.current?.flush() ?? Promise.resolve(),
        stockPurchasesWriter.current?.flush() ?? Promise.resolve(),
      ]);
      const backupData: DrinkBackupData = {
        entries: entriesRef.current,
        savedDrinks: savedDrinksRef.current,
        stockPurchases: stockPurchasesRef.current,
        dailyStandardDrinkGoal,
        dailyGoalOverrides,
        contextTagDefinitions,
      };
      const backupContents = JSON.stringify(
        createDrinkBackupFile(backupData),
        null,
        2,
      );
      const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `countable-backup-${fileTimestamp}.json`;

      if (Platform.OS === 'web') {
        const objectUrl = URL.createObjectURL(
          new Blob([backupContents], { type: 'application/json' }),
        );
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        return;
      }

      if (!FileSystem.cacheDirectory) {
        throw new Error('This device does not have a temporary folder available.');
      }
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, backupContents);
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('File sharing is unavailable on this device.');
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Save Countable backup',
      });
    } catch (error) {
      Alert.alert(
        "Couldn't export backup",
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setBackupAction(null);
    }
  }

  async function importFullBackup() {
    if (!isReady || backupAction) return;
    setBackupAction('import');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'public.json'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) {
        throw new Error('Choose a Countable JSON backup file to import.');
      }

      const browserFile = (asset as typeof asset & { file?: Blob }).file;
      let contents: string;
      if (Platform.OS === 'web') {
        if (browserFile) {
          contents = await browserFile.text();
        } else {
          const response = await fetch(asset.uri);
          if (!response.ok) {
            throw new Error('The selected backup file could not be read.');
          }
          contents = await response.text();
        }
      } else {
        contents = await FileSystem.readAsStringAsync(asset.uri);
      }

      let parsedFile: unknown;
      try {
        parsedFile = JSON.parse(contents);
      } catch {
        throw new Error('The selected file is not valid JSON.');
      }
      const incoming = parseDrinkBackupFile(parsedFile);

      if (pendingRemovalsRef.current.length > 0) {
        throw new Error(
          'Wait for recent drink removals to finish before importing a backup.',
        );
      }

      await Promise.all([
        entriesWriter.current?.flush() ?? Promise.resolve(),
        savedDrinksWriter.current?.flush() ?? Promise.resolve(),
        stockPurchasesWriter.current?.flush() ?? Promise.resolve(),
      ]);
      const storedSettings = new Map(
        await AsyncStorage.multiGet([
          DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY,
          DAILY_GOAL_OVERRIDES_STORAGE_KEY,
          DRINK_CONTEXT_TAGS_STORAGE_KEY,
          STOCK_PURCHASES_STORAGE_KEY,
        ]),
      );
      const current: DrinkBackupData = {
        entries: entriesRef.current,
        savedDrinks: savedDrinksRef.current,
        stockPurchases: parseStockPurchaseList(
          storedSettings.get(STOCK_PURCHASES_STORAGE_KEY) ?? null,
        ),
        dailyStandardDrinkGoal: parseDailyStandardDrinkGoal(
          storedSettings.get(DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY) ?? null,
        ),
        dailyGoalOverrides: parseDailyGoalOverrides(
          storedSettings.get(DAILY_GOAL_OVERRIDES_STORAGE_KEY) ?? null,
        ),
        contextTagDefinitions: parseDrinkContextTagDefinitions(
          storedSettings.get(DRINK_CONTEXT_TAGS_STORAGE_KEY) ?? null,
        ),
      };
      const merged = mergeDrinkBackupData(current, incoming);
      const addedCount = Object.values(merged.added).reduce(
        (total, count) => total + count,
        0,
      );
      if (addedCount === 0) {
        Alert.alert(
          'Backup already up to date',
          'Everything in this backup is already present. Existing records and settings were kept.',
        );
        return;
      }

      const currentWrites: [string, string][] = [
        [ENTRIES_STORAGE_KEY, JSON.stringify(current.entries)],
        [SAVED_DRINKS_STORAGE_KEY, JSON.stringify(current.savedDrinks)],
        [
          STOCK_PURCHASES_STORAGE_KEY,
          JSON.stringify(current.stockPurchases),
        ],
        [
          DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY,
          current.dailyStandardDrinkGoal === null
            ? ''
            : String(current.dailyStandardDrinkGoal),
        ],
        [
          DAILY_GOAL_OVERRIDES_STORAGE_KEY,
          JSON.stringify(current.dailyGoalOverrides),
        ],
        [
          DRINK_CONTEXT_TAGS_STORAGE_KEY,
          JSON.stringify(current.contextTagDefinitions),
        ],
      ];
      const mergedWrites: [string, string][] = [
        [ENTRIES_STORAGE_KEY, JSON.stringify(merged.data.entries)],
        [SAVED_DRINKS_STORAGE_KEY, JSON.stringify(merged.data.savedDrinks)],
        [
          STOCK_PURCHASES_STORAGE_KEY,
          JSON.stringify(merged.data.stockPurchases),
        ],
        [
          DAILY_STANDARD_DRINK_GOAL_STORAGE_KEY,
          merged.data.dailyStandardDrinkGoal === null
            ? ''
            : String(merged.data.dailyStandardDrinkGoal),
        ],
        [
          DAILY_GOAL_OVERRIDES_STORAGE_KEY,
          JSON.stringify(merged.data.dailyGoalOverrides),
        ],
        [
          DRINK_CONTEXT_TAGS_STORAGE_KEY,
          JSON.stringify(merged.data.contextTagDefinitions),
        ],
      ];
      try {
        await AsyncStorage.multiSet(mergedWrites);
      } catch (error) {
        try {
          await AsyncStorage.multiSet(currentWrites);
        } catch {
          throw new Error(
            'Storage failed during import, and the previous data could not be restored. Check your records before continuing.',
          );
        }
        throw error;
      }

      entriesRef.current = merged.data.entries;
      removalOrderRef.current = merged.data.entries.map((entry) => entry.id);
      savedDrinksRef.current = merged.data.savedDrinks;
      stockPurchasesRef.current = merged.data.stockPurchases;
      setEntries(merged.data.entries);
      setSavedDrinks(merged.data.savedDrinks);
      setStockPurchases(merged.data.stockPurchases);
      setDailyStandardDrinkGoal(merged.data.dailyStandardDrinkGoal);
      setDailyGoalOverrides(merged.data.dailyGoalOverrides);
      setContextTagDefinitions(merged.data.contextTagDefinitions);
      setFailedSaves({
        entries: false,
        savedDrinks: false,
        stockPurchases: false,
      });
      entriesWriter.current = createEntriesStorageWriter(merged.data.entries);
      savedDrinksWriter.current = createSavedDrinksStorageWriter(
        merged.data.savedDrinks,
      );
      stockPurchasesWriter.current = createStockPurchasesStorageWriter(
        merged.data.stockPurchases,
      );

      const addedItems: string[] = [];
      if (merged.added.entries > 0) {
        addedItems.push(
          `${merged.added.entries} drink ${
            merged.added.entries === 1 ? 'record' : 'records'
          }`,
        );
      }
      if (merged.added.savedDrinks > 0) {
        addedItems.push(
          `${merged.added.savedDrinks} saved ${
            merged.added.savedDrinks === 1 ? 'drink' : 'drinks'
          }`,
        );
      }
      if (merged.added.stockPurchases > 0) {
        addedItems.push(
          `${merged.added.stockPurchases} stock ${
            merged.added.stockPurchases === 1 ? 'purchase' : 'purchases'
          }`,
        );
      }
      if (merged.added.dailyStandardDrinkGoal > 0) {
        addedItems.push('the daily goal');
      }
      if (merged.added.dailyGoalOverrides > 0) {
        addedItems.push(
          `${merged.added.dailyGoalOverrides} date-specific ${
            merged.added.dailyGoalOverrides === 1 ? 'goal' : 'goals'
          }`,
        );
      }
      if (merged.added.contextTagDefinitions > 0) {
        addedItems.push(
          `${merged.added.contextTagDefinitions} context ${
            merged.added.contextTagDefinitions === 1 ? 'label' : 'labels'
          }`,
        );
      }
      Alert.alert(
        'Backup imported',
        `Added ${addedItems.join(
          ', ',
        )}. Existing records and settings were kept where they conflicted.`,
      );
    } catch (error) {
      Alert.alert(
        "Couldn't import backup",
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setBackupAction(null);
    }
  }

  function openGoalCalendar() {
    setDailyGoalError(null);
    setIsEditingDailyGoal(false);
    setIsManagingGoals(true);
  }

  async function saveGoalOverrides(nextOverrides: DailyGoalOverrides) {
    const normalized = normalizeDailyGoalOverrides(nextOverrides);
    if (!normalized) {
      throw new Error('Date-specific goals have an unexpected format.');
    }
    await persistDailyGoalOverrides(AsyncStorage, normalized);
    setDailyGoalOverrides(normalized);
  }

  async function saveContextTagDefinitions(
    nextDefinitions: DrinkContextTagDefinition[],
  ) {
    await persistDrinkContextTagDefinitions(AsyncStorage, nextDefinitions);
    setContextTagDefinitions(nextDefinitions);
  }

  async function saveCalendarDayGoal(dayKey: string, goal: number | null) {
    const nextOverrides = { ...dailyGoalOverrides };
    if (goal === null) {
      delete nextOverrides[dayKey];
    } else {
      nextOverrides[dayKey] = goal;
    }
    await saveGoalOverrides(nextOverrides);
  }

  function openDailyGoalEditor() {
    setDailyGoalInput(
      dailyStandardDrinkGoal === null
        ? ''
        : formatStandardDrinkCount(dailyStandardDrinkGoal),
    );
    setDailyGoalError(null);
    setIsEditingDailyGoal(true);
  }

  function cancelDailyGoalEdit() {
    setDailyGoalError(null);
    setIsEditingDailyGoal(false);
  }

  async function saveDailyGoal() {
    const goal = normalizeDailyStandardDrinkGoal(dailyGoalInput);
    if (goal === null) {
      setDailyGoalError('Enter a daily goal greater than zero.');
      return;
    }

    setIsSavingDailyGoal(true);
    setDailyGoalError(null);
    try {
      await persistDailyStandardDrinkGoal(AsyncStorage, goal);
      setDailyStandardDrinkGoal(goal);
      setIsEditingDailyGoal(false);
    } catch {
      setDailyGoalError("Couldn't save your daily goal. Try again.");
    } finally {
      setIsSavingDailyGoal(false);
    }
  }

  async function removeDailyGoal() {
    setIsSavingDailyGoal(true);
    setDailyGoalError(null);
    try {
      await persistDailyStandardDrinkGoal(AsyncStorage, null);
      setDailyStandardDrinkGoal(null);
      setDailyGoalInput('');
      setIsEditingDailyGoal(false);
    } catch {
      setDailyGoalError("Couldn't remove your daily goal. Try again.");
    } finally {
      setIsSavingDailyGoal(false);
    }
  }

  function logDrink(
    details: DrinkDetails,
    contextTags: DrinkContextTag[] = [],
    timestampOverride?: number,
  ) {
    if (!isReady) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentTimestamp = Date.now();
    const timestamp = timestampOverride ?? currentTimestamp;
    const newEntry: DrinkEntry = {
      id: createDrinkId(),
      timestamp,
      ...details,
      caloriesPer100Ml: details.caloriesPer100Ml ?? null,
      contextTags,
    };
    const entry = assignStockDeductions(
      newEntry,
      stockPurchasesRef.current,
      [
        ...entriesRef.current,
        ...pendingRemovalsRef.current.map((removed) => removed.entry),
      ],
    );
    const nextEntries = [...entriesRef.current, entry].sort(
      (first, second) => first.timestamp - second.timestamp,
    );
    const priorOrder = new Map(
      removalOrderRef.current.map((id, index) => [id, index]),
    );
    removalOrderRef.current = [
      ...nextEntries,
      ...pendingRemovalsRef.current.map((removed) => removed.entry),
    ]
      .sort(
        (first, second) =>
          first.timestamp - second.timestamp ||
          (priorOrder.get(first.id) ?? Number.MAX_SAFE_INTEGER) -
            (priorOrder.get(second.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .map((loggedEntry) => loggedEntry.id);
    saveEntries(nextEntries);
    setNow(currentTimestamp);
    setIsAdding(false);
    setAddingDrinkTimestamp(null);
    setSearchQuery('');
  }

  function startAddingDrinkForDay(dayStartTimestamp: number) {
    const selectedDay = new Date(dayStartTimestamp);
    selectedDay.setHours(0, 0, 0, 0);
    const currentTime = new Date(now);
    selectedDay.setHours(
      currentTime.getHours(),
      currentTime.getMinutes(),
      0,
      0,
    );
    setAddingDrinkTimestamp(selectedDay.getTime());
    setSearchQuery('');
    setIsAdding(true);
  }

  function saveDrinkForLater(details: DrinkDetails) {
    const existing = savedDrinksRef.current.find(
      (saved) => saved.name.trim().toLocaleLowerCase() === details.name.toLocaleLowerCase(),
    );
    const savedDrink: SavedDrink = {
      ...details,
      id: existing?.id ?? createDrinkId(),
      savedAt: Date.now(),
      isFavorite: existing?.isFavorite ?? false,
    };
    const nextSavedDrinks = [
      savedDrink,
      ...savedDrinksRef.current.filter((saved) => saved.id !== savedDrink.id),
    ];
    saveSavedDrinks(nextSavedDrinks);
    setIsAdding(false);
    setAddingDrinkTimestamp(null);
    setSearchQuery('');
  }

  function updateSavedDrink(details: DrinkDetails) {
    if (!editingDrink) return;
    const currentSavedDrinks = savedDrinksRef.current;
    const conflictingDrink = findSavedDrinkNameConflict(
      currentSavedDrinks,
      details.name,
      editingDrink.id,
    );

    if (conflictingDrink) {
      const replaceConflictingDrink = () => {
        const nextSavedDrinks = replaceSavedDrinkAfterNameConflict(
          currentSavedDrinks,
          editingDrink.id,
          conflictingDrink.id,
          details,
          Date.now(),
        );
        pendingSavedDrinkReplacementRef.current = nextSavedDrinks;
        saveSavedDrinks(nextSavedDrinks);
      };
      confirmSavedDrinkNameConflict(
        conflictingDrink.name,
        editingDrink.name,
        Platform.OS === 'web',
        (message) => globalThis.confirm(message),
        (title, message, buttons) => Alert.alert(title, message, buttons),
        replaceConflictingDrink,
      );
      return;
    }

    const nextSavedDrinks = updateSavedDrinkDefinition(
      currentSavedDrinks,
      editingDrink.id,
      details,
    );
    saveSavedDrinks(nextSavedDrinks);
    setEditingDrink(null);
  }

  function removeSavedDrink(drink: SavedDrink) {
    void Haptics.selectionAsync();
    saveSavedDrinks(
      removeSavedDrinkDefinition(savedDrinksRef.current, drink.id),
    );
  }

  function toggleFavorite(drink: SavedDrink) {
    saveSavedDrinks(
      toggleSavedDrinkFavorite(savedDrinksRef.current, drink.id),
    );
  }

  function confirmRemoveSavedDrink(drink: SavedDrink) {
    confirmSavedDrinkRemoval(
      drink.name,
      Platform.OS === 'web',
      (message) => globalThis.confirm(message),
      (title, message, buttons) => Alert.alert(title, message, buttons),
      () => removeSavedDrink(drink),
    );
  }

  function undoLastDrink() {
    if (!isReady || todayEntries.length === 0) return;
    const lastToday = todayEntries[todayEntries.length - 1];
    removeLoggedDrink(lastToday);
  }

  function removeLoggedDrink(entry: DrinkEntry) {
    if (!isReady) return;
    const currentEntries = entriesRef.current;
    const removal = removeDrinkEntry(currentEntries, entry.id);
    if (!removal) return;

    void Haptics.selectionAsync();
    const orderIndex = removalOrderRef.current.indexOf(entry.id);
    const undoRemoval = {
      ...removal.removed,
      index: orderIndex === -1 ? removal.removed.index : orderIndex,
    };
    const nextPendingRemovals = [...pendingRemovalsRef.current, undoRemoval];
    pendingRemovalsRef.current = nextPendingRemovals;
    setPendingRemovals(nextPendingRemovals);
    const timer = scheduleDrinkRemovalUndoExpiry(() => {
      undoTimers.current.delete(entry.id);
      const remaining = pendingRemovalsRef.current.filter(
        (pending) => pending.entry.id !== entry.id,
      );
      pendingRemovalsRef.current = remaining;
      setPendingRemovals(remaining);
      removalOrderRef.current = removalOrderRef.current.filter(
        (id) => id !== entry.id,
      );
    });
    undoTimers.current.set(entry.id, timer);
    saveEntries(removal.entries);
  }

  function undoRemovedDrink(removed: RemovedDrinkEntry) {
    const pending = pendingRemovalsRef.current.find(
      (candidate) => candidate.entry.id === removed.entry.id,
    );
    if (!pending) return;
    const timer = undoTimers.current.get(removed.entry.id);
    if (timer) clearTimeout(timer);
    undoTimers.current.delete(removed.entry.id);
    const currentEntries = entriesRef.current;

    const restoreIndex = getDrinkEntryRestoreIndex(
      currentEntries,
      removalOrderRef.current,
      pending.entry.id,
    );
    const nextEntries = restoreRemovedDrinkEntry(currentEntries, {
      ...pending,
      index: restoreIndex ?? pending.index,
    });
    const remaining = pendingRemovalsRef.current.filter(
      (candidate) => candidate.entry.id !== removed.entry.id,
    );
    pendingRemovalsRef.current = remaining;
    setPendingRemovals(remaining);
    if (!nextEntries) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    saveEntries(nextEntries);
  }

  function updateLoggedDrink(
    details: DrinkDetails,
    contextTags: DrinkContextTag[],
  ) {
    if (!isReady || !editingLoggedEntry) return;
    void Haptics.selectionAsync();
    const priorEntries = [
      ...entriesRef.current.filter(
        (entry) => entry.id !== editingLoggedEntry.id,
      ),
      ...pendingRemovalsRef.current
        .map((removed) => removed.entry)
        .filter((entry) => entry.id !== editingLoggedEntry.id),
    ];
    saveEntries(
      entriesRef.current.map((entry) =>
        entry.id === editingLoggedEntry.id
          ? assignStockDeductions(
              {
                ...entry,
                ...details,
                caloriesPer100Ml: details.caloriesPer100Ml ?? null,
                contextTags,
              },
              stockPurchasesRef.current,
              priorEntries,
            )
          : entry,
      ),
    );
    setEditingLoggedEntry(null);
  }

  function confirmRemoveStockPurchase(purchaseId: string) {
    const purchase = stockPurchasesRef.current.find(
      (candidate) => candidate.id === purchaseId,
    );
    if (!purchase) return;

    const linkedEntryIds = new Set([
      ...entriesRef.current
        .filter((entry) =>
          entry.stockDeductions?.some(
            (deduction) => deduction.purchaseId === purchaseId,
          ),
        )
        .map((entry) => entry.id),
      ...pendingRemovalsRef.current
        .filter((removed) =>
          removed.entry.stockDeductions?.some(
            (deduction) => deduction.purchaseId === purchaseId,
          ),
        )
        .map((removed) => removed.entry.id),
    ]);
    const message =
      linkedEntryIds.size > 0
        ? `This also removes the purchase cost from ${linkedEntryIds.size} linked drink ${
            linkedEntryIds.size === 1 ? 'record' : 'records'
          }.`
        : 'This removes the purchase from your stock and spending totals.';

    const removePurchase = () => {
      const removePurchaseLink = (entry: DrinkEntry) => {
        if (
          !entry.stockDeductions?.some(
            (deduction) => deduction.purchaseId === purchaseId,
          )
        ) {
          return entry;
        }
        return {
          ...entry,
          stockDeductions: entry.stockDeductions.filter(
            (deduction) => deduction.purchaseId !== purchaseId,
          ),
        };
      };
      const nextEntries = entriesRef.current.map(removePurchaseLink);
      const nextPending = pendingRemovalsRef.current.map((removed) => ({
        ...removed,
        entry: removePurchaseLink(removed.entry),
      }));
      if (nextEntries.some((entry, index) => entry !== entriesRef.current[index])) {
        saveEntries(nextEntries);
      }
      pendingRemovalsRef.current = nextPending;
      setPendingRemovals(nextPending);
      saveStockPurchases(
        stockPurchasesRef.current.filter(
          (candidate) => candidate.id !== purchaseId,
        ),
      );
    };

    const title = `Remove ${purchase.productName}?`;
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`${title}\n\n${message}`)) removePurchase();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: removePurchase },
    ]);
  }

  function confirmRemoveLoggedDrink(entry: DrinkEntry) {
    const drinkName = entry.name.trim() || 'this drink';
    const message =
      `Remove “${drinkName}” from your drink log? ` +
      'Your daily count and total will be updated.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm(message)) {
        removeLoggedDrink(entry);
      }
      return;
    }

    Alert.alert('Remove this drink?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeLoggedDrink(entry),
      },
    ]);
  }

  function renderLoggedDrinkRow(
    entry: DrinkEntry,
    index: number,
    entryCount: number,
    testIdPrefix: string,
    editTestIdPrefix: string,
  ) {
    const drinkName = entry.name.trim() || `Drink ${index + 1}`;
    const drinkDetails =
      entry.alcoholPercent === null ||
      entry.volume === null ||
      entry.unit === null
        ? 'Details not entered'
        : `${formatVolume(entry.volume, entry.unit)} · ${entry.alcoholPercent}% ABV`;
    const calories = caloriesForDrink(entry);
    const detailLine =
      calories === null
        ? drinkDetails
        : `${drinkDetails} · ${Math.round(calories).toLocaleString()} kcal`;
    const stockCostCents = costCentsForEntry(entry, stockPurchases);
    const completeDetailLine =
      stockCostCents === null
        ? detailLine
        : `${detailLine} · ${formatCurrency(stockCostCents)}`;
    return (
      <View
        key={entry.id}
        style={[
          styles.entryRow,
          index < entryCount - 1 && {
            borderBottomColor: colors.border,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={[styles.entryDot, { backgroundColor: colors.accent }]} />
        <View style={styles.entryCopy}>
          <Text
            numberOfLines={1}
            style={[styles.entryName, { color: colors.foreground }]}
          >
            {drinkName}
          </Text>
          <Text
            style={[
              styles.savedDrinkDetails,
              { color: colors.mutedForeground },
            ]}
          >
            {completeDetailLine}
          </Text>
          {entry.contextTags && entry.contextTags.length > 0 && (
            <Text
              numberOfLines={1}
              style={[styles.entryContextTags, { color: colors.primary }]}
            >
              {entry.contextTags
                .map((tag) => drinkContextTagLabel(tag, contextTagDefinitions))
                .join(' · ')}
            </Text>
          )}
        </View>
        <Text style={[styles.entryTime, { color: colors.mutedForeground }]}>
          {displayTime(entry.timestamp)}
        </Text>
        <View style={styles.entryActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${drinkName}`}
            testID={`${editTestIdPrefix}-${entry.id}`}
            onPress={() => setEditingLoggedEntry(entry)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.savedDrinkAction,
              { opacity: pressed ? 0.55 : 1 },
            ]}
          >
            <Feather name="edit-2" size={15} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${drinkName} from your drink log`}
            testID={`${testIdPrefix}-${entry.id}`}
            onPress={() => confirmRemoveLoggedDrink(entry)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.savedDrinkAction,
              { opacity: pressed ? 0.55 : 1 },
            ]}
          >
            <Feather name="trash-2" size={15} color={colors.destructive} />
          </Pressable>
        </View>
      </View>
    );
  }

  function renderSavedDrinkRows(
    drinks: SavedDrink[],
    hasRowsAfter = false,
  ) {
    return drinks.map((drink, index) => {
      const isFavorite = drink.isFavorite === true;
      const hasDivider =
        index < drinks.length - 1 || hasRowsAfter;

      return (
        <View
          key={drink.id}
          style={[
            styles.savedDrinkRow,
            hasDivider && {
              borderBottomColor: colors.border,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Log ${drink.name}, ${formatVolume(drink.volume, drink.unit)}, ${drink.alcoholPercent}% alcohol`}
            testID={`log-saved-drink-${drink.id}`}
            onPress={() => logDrink(drink)}
            style={({ pressed }) => [
              styles.savedDrinkCopy,
              { opacity: pressed ? 0.58 : 1 },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.entryName, { color: colors.foreground }]}
            >
              {drink.name}
            </Text>
            <Text
              style={[
                styles.savedDrinkDetails,
                { color: colors.mutedForeground },
              ]}
            >
              {formatVolume(drink.volume, drink.unit)} · {drink.alcoholPercent}% ABV
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isFavorite
                ? `Remove ${drink.name} from favorites`
                : `Add ${drink.name} to favorites`
            }
            accessibilityState={{ selected: isFavorite }}
            testID={`favorite-saved-drink-${drink.id}`}
            onPress={() => toggleFavorite(drink)}
            style={({ pressed }) => [
              styles.savedDrinkAction,
              { opacity: pressed ? 0.55 : 1 },
            ]}
          >
            <Feather
              name="star"
              size={16}
              color={isFavorite ? colors.accent : colors.mutedForeground}
              fill={isFavorite ? colors.accent : 'transparent'}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Log ${drink.name}`}
            testID={`quick-log-saved-drink-${drink.id}`}
            onPress={() => logDrink(drink)}
            style={({ pressed }) => [
              styles.savedDrinkAction,
              {
                backgroundColor: colors.secondary,
                opacity: pressed ? 0.55 : 1,
              },
            ]}
          >
            <Feather name="plus" size={16} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${drink.name}`}
            testID={`edit-saved-drink-${drink.id}`}
            onPress={() => setEditingDrink(drink)}
            style={({ pressed }) => [
              styles.savedDrinkAction,
              { opacity: pressed ? 0.55 : 1 },
            ]}
          >
            <Feather name="edit-2" size={15} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${drink.name}`}
            testID={`remove-saved-drink-${drink.id}`}
            onPress={() => confirmRemoveSavedDrink(drink)}
            style={({ pressed }) => [
              styles.savedDrinkAction,
              { opacity: pressed ? 0.55 : 1 },
            ]}
          >
            <Feather name="trash-2" size={15} color={colors.destructive} />
          </Pressable>
        </View>
      );
    });
  }

  const webInsets = Platform.OS === 'web';

  if (isManagingContextTags) {
    return (
      <ContextTagSettings
        definitions={contextTagDefinitions}
        onSave={saveContextTagDefinitions}
        onClose={() => setIsManagingContextTags(false)}
      />
    );
  }

  if (isAdding || editingDrink || editingLoggedEntry) {
    return (
      <DrinkEditor
        colors={colors}
        onCancel={() => {
          pendingSavedDrinkReplacementRef.current = null;
          setIsAdding(false);
          setAddingDrinkTimestamp(null);
          setEditingDrink(null);
          setEditingLoggedEntry(null);
        }}
        onLog={logDrink}
        onSave={saveDrinkForLater}
        initialDetails={initialDrinkDetails}
        savedDrinks={savedDrinks}
        contextTagDefinitions={contextTagDefinitions}
        initialDrink={editingDrink ?? undefined}
        initialEntry={editingLoggedEntry ?? undefined}
        initialLogTimestamp={addingDrinkTimestamp ?? undefined}
        currentDayTotal={editingEntryDayTotal}
        onUpdate={updateSavedDrink}
        onUpdateEntry={updateLoggedDrink}
        savedDrinkSaveFailed={
          failedSaves.savedDrinks &&
          pendingSavedDrinkReplacementRef.current !== null
        }
        onRetrySavedDrinkSave={() => savedDrinksWriter.current?.retry()}
      />
    );
  }

  if (isManagingGoals) {
    return (
      <GoalCalendar
        colors={colors}
        entries={entries}
        now={now}
        defaultGoal={dailyStandardDrinkGoal}
        goalOverrides={dailyGoalOverrides}
        onSaveDayGoal={saveCalendarDayGoal}
        onApplyGoals={saveGoalOverrides}
        onClose={() => setIsManagingGoals(false)}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background },
        webInsets && { paddingTop: 67 },
      ]}
    >
      <ScrollView
        ref={scrollRef}
        pointerEvents={backupAction ? 'none' : 'auto'}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: webInsets ? 18 : insets.top + 18,
            paddingBottom: 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
              {activeTab === 'log' ? 'YOUR DAILY LOG' : 'COUNTABLE'}
            </Text>
            <Text style={[styles.date, { color: colors.foreground }]}>
              {activeTab === 'log' ? displayDate(now) : activeTabLabel}
            </Text>
          </View>
          {activeTab === 'patterns' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage context labels"
              testID="open-context-tag-settings"
              onPress={() => setIsManagingContextTags(true)}
              style={[
                styles.headerIcon,
                { backgroundColor: colors.secondary },
              ]}
            >
              <Feather name="tag" size={19} color={colors.primary} />
            </Pressable>
          )}
        </View>

        <View style={activeTab === 'log' ? undefined : styles.hiddenTabSection}>
        <View
          style={[
            styles.counterCard,
            { backgroundColor: counterBackgroundColor },
            isReady && styles.counterCardWithGoal,
          ]}
        >
          <View style={styles.cardTopLine}>
            <Text
              style={[
                styles.cardLabel,
                { color: counterForegroundColor, opacity: 0.75 },
              ]}
            >
              TODAY&apos;S COUNT
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                initialDrinkDetails
                  ? `Add one more ${initialDrinkDetails.name}, ${formatVolume(initialDrinkDetails.volume, initialDrinkDetails.unit)}, ${initialDrinkDetails.alcoholPercent}% ABV`
                  : 'Add your first drink'
              }
              accessibilityHint={
                initialDrinkDetails
                  ? 'Logs another of your most recent drinks.'
                  : 'Opens drink search.'
              }
              testID="quick-add-last-drink"
              disabled={!isReady}
              onPress={() => {
                if (initialDrinkDetails) {
                  logDrink(initialDrinkDetails);
                } else {
                  setAddingDrinkTimestamp(null);
                  setIsAdding(true);
                }
              }}
              hitSlop={8}
              style={({ pressed }) => [
                styles.counterQuickAddButton,
                {
                  backgroundColor: counterForegroundColor,
                  opacity: !isReady ? 0.5 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather name="plus" size={22} color={counterBackgroundColor} />
            </Pressable>
          </View>
          <View style={styles.numberRow}>
            <Text style={[styles.count, { color: counterForegroundColor }]}>
              {isReady ? todayEntries.length : '—'}
            </Text>
            <Text
              style={[
                styles.countLabel,
                { color: counterForegroundColor, opacity: 0.75 },
              ]}
            >
              {todayEntries.length === 1 ? 'drink' : 'drinks'}
            </Text>
          </View>
          <View
            style={[
              styles.totalDivider,
              { backgroundColor: counterForegroundColor },
            ]}
          />
          <View style={styles.cardFooter}>
            <View style={styles.cardTotals}>
              <View>
                <Text
                  style={[
                    styles.standardTotal,
                    { color: counterForegroundColor },
                  ]}
                >
                  {isReady ? formatStandardDrinkCount(standardDrinksToday) : '—'}
                </Text>
                <Text
                  style={[
                    styles.standardLabel,
                    { color: counterForegroundColor, opacity: 0.75 },
                  ]}
                >
                  U.S. standard drinks
                </Text>
              </View>
            </View>
          </View>
          {isReady && effectiveDailyGoal !== null ? (
            <View
              style={styles.counterGoalProgress}
              testID="main-daily-goal-progress"
            >
              <View style={styles.counterGoalTopRow}>
                <Text
                  style={[
                    styles.counterGoalLabel,
                    { color: counterForegroundColor, opacity: 0.78 },
                  ]}
                >
                  TODAY&apos;S GOAL
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.counterGoalAmount,
                    { color: counterForegroundColor },
                  ]}
                >
                  {formatStandardDrinkCount(standardDrinksToday)} /{' '}
                  {formatStandardDrinkCount(effectiveDailyGoal)} standard drinks
                </Text>
              </View>
              <View
                style={[
                  styles.goalProgressTrack,
                  {
                    backgroundColor: isOverDailyGoal
                      ? colors.goalExceededTrack
                      : colors.counterProgressTrack,
                  },
                ]}
                testID="main-daily-goal-progress-line"
                accessibilityRole="progressbar"
                accessibilityLabel="Today's standard-drink goal progress"
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: Math.min(counterGoalFillPercent, 100),
                }}
              >
                <View
                  style={[
                    styles.goalProgressFill,
                    {
                      width: `${counterGoalFillPercent}%`,
                      backgroundColor: counterForegroundColor,
                    },
                  ]}
                />
              </View>
              <View style={styles.goalProgressLabels}>
                <Text
                  style={[
                    styles.goalProgressText,
                    { color: counterForegroundColor, opacity: 0.82 },
                  ]}
                >
                  {isOverDailyGoal
                    ? `Over by ${formatStandardDrinkCount(standardDrinksToday - effectiveDailyGoal)}`
                    : dailyGoalRemaining !== null && dailyGoalRemaining > 0
                      ? `${formatStandardDrinkCount(dailyGoalRemaining)} left today`
                      : 'Goal reached'}
                </Text>
                <Text
                  testID="main-daily-goal-percent"
                  style={[
                    styles.goalProgressText,
                    styles.counterGoalPercent,
                    { color: counterForegroundColor },
                  ]}
                >
                  {dailyGoalPercentComplete === null
                    ? '—'
                    : `${dailyGoalPercentComplete}%`}
                </Text>
              </View>
            </View>
          ) : isReady ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set today's standard-drink goal"
              testID="set-goal-from-counter"
              onPress={() => navigateToTab('goals')}
              style={styles.counterGoalPrompt}
            >
              <View style={styles.counterGoalPromptCopy}>
                <Text
                  style={[
                    styles.counterGoalLabel,
                    { color: counterForegroundColor, opacity: 0.78 },
                  ]}
                >
                  TODAY&apos;S GOAL
                </Text>
                <Text
                  style={[
                    styles.counterGoalPromptText,
                    { color: counterForegroundColor },
                  ]}
                >
                  Set a daily target
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={counterForegroundColor}
              />
            </Pressable>
          ) : null}
        </View>
        </View>

        <View style={activeTab === 'goals' ? undefined : styles.hiddenTabSection}>
        <View
          style={[
            styles.goalCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.goalHeader}>
            <View style={styles.goalCopy}>
              <Text
                style={[
                  styles.goalEyebrow,
                  { color: colors.mutedForeground },
                ]}
              >
                DAILY STANDARD-DRINK GOAL
              </Text>
              <Text
                style={[styles.goalValue, { color: colors.foreground }]}
                testID="daily-drink-goal-progress"
              >
                {!isReady
                  ? 'Loading your goal…'
                  : effectiveDailyGoal === null
                    ? 'Set a personal target'
                    : `${formatStandardDrinkCount(standardDrinksToday)} / ${formatStandardDrinkCount(effectiveDailyGoal)} standard drinks`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                dailyStandardDrinkGoal === null
                  ? 'Set usual daily standard-drink goal'
                  : 'Edit usual daily standard-drink goal'
              }
              testID={
                dailyStandardDrinkGoal === null
                  ? 'set-daily-drink-goal'
                  : 'edit-daily-drink-goal'
              }
              disabled={!isReady || isSavingDailyGoal}
              onPress={openDailyGoalEditor}
              style={({ pressed }) => [
                styles.goalButton,
                {
                  backgroundColor: colors.secondary,
                  opacity:
                    !isReady || isSavingDailyGoal ? 0.5 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.goalButtonText, { color: colors.primary }]}>
                {dailyStandardDrinkGoal === null ? 'Set goal' : 'Edit default'}
              </Text>
            </Pressable>
          </View>

          {isReady && effectiveDailyGoal !== null ? (
            <View style={styles.goalProgress}>
              <View
                style={[
                  styles.goalProgressTrack,
                  { backgroundColor: colors.secondary },
                ]}
                accessibilityRole="progressbar"
                accessibilityLabel="Daily standard-drink goal progress"
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: Math.round(dailyGoalProgress * 100),
                }}
              >
                <View
                  style={[
                    styles.goalProgressFill,
                    {
                      width: `${dailyGoalProgress * 100}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
              <View style={styles.goalProgressLabels}>
                <Text
                  style={[
                    styles.goalProgressText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {standardDrinksToday > effectiveDailyGoal
                    ? `Over by ${formatStandardDrinkCount(standardDrinksToday - effectiveDailyGoal)}`
                    : dailyGoalRemaining !== null && dailyGoalRemaining > 0
                      ? `${formatStandardDrinkCount(dailyGoalRemaining)} left today`
                      : 'Daily goal reached'}
                </Text>
                <Text
                  style={[
                    styles.goalProgressText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {Math.round(dailyGoalProgress * 100)}%
                </Text>
              </View>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set daily goals on a calendar and suggest a taper plan"
            testID="open-goal-calendar"
            disabled={!isReady}
            onPress={openGoalCalendar}
            style={({ pressed }) => [
              styles.calendarGoalLink,
              {
                borderTopColor: colors.border,
                opacity: !isReady ? 0.45 : pressed ? 0.6 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.calendarGoalIcon,
                { backgroundColor: colors.secondary },
              ]}
            >
              <Feather name="calendar" size={15} color={colors.primary} />
            </View>
            <Text
              style={[
                styles.calendarGoalLinkText,
                { color: colors.primary },
              ]}
            >
              Plan goals by date
            </Text>
            <Feather name="chevron-right" size={16} color={colors.primary} />
          </Pressable>

          {isEditingDailyGoal ? (
            <View
              style={[
                styles.goalEditor,
                { borderTopColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.goalInputLabel,
                  { color: colors.foreground },
                ]}
              >
                Standard drinks per day
              </Text>
              <TextInput
                accessibilityLabel="Daily standard-drink goal"
                testID="daily-drink-goal-input"
                value={dailyGoalInput}
                onChangeText={(value) => {
                  setDailyGoalInput(value);
                  setDailyGoalError(null);
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="For example, 2"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.goalInput,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
              <View style={styles.goalActions}>
                <Pressable
                  accessibilityRole="button"
                  testID="cancel-daily-drink-goal"
                  disabled={isSavingDailyGoal}
                  onPress={cancelDailyGoalEdit}
                  style={({ pressed }) => [
                    styles.goalAction,
                    { opacity: pressed || isSavingDailyGoal ? 0.55 : 1 },
                  ]}
                >
                  <Text
                    style={[
                      styles.goalActionText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Cancel
                  </Text>
                </Pressable>
                {dailyStandardDrinkGoal !== null ? (
                  <Pressable
                    accessibilityRole="button"
                    testID="remove-daily-drink-goal"
                    disabled={isSavingDailyGoal}
                    onPress={() => void removeDailyGoal()}
                    style={({ pressed }) => [
                      styles.goalAction,
                      {
                        opacity: pressed || isSavingDailyGoal ? 0.55 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.goalActionText,
                        { color: colors.destructive },
                      ]}
                    >
                      Remove
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  testID="save-daily-drink-goal"
                  disabled={isSavingDailyGoal}
                  onPress={() => void saveDailyGoal()}
                  style={({ pressed }) => [
                    styles.goalSaveButton,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed || isSavingDailyGoal ? 0.65 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.goalSaveButtonText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {isSavingDailyGoal ? 'Saving…' : 'Save goal'}
                  </Text>
                </Pressable>
              </View>
              {dailyGoalError ? (
                <Text
                  accessibilityRole="alert"
                  style={[
                    styles.goalError,
                    { color: colors.destructive },
                  ]}
                >
                  {dailyGoalError}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        </View>

        <View style={activeTab === 'log' ? undefined : styles.hiddenTabSection}>
        <View style={styles.recentHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Saved drinks
          </Text>
          <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
            {savedDrinks.length} SAVED
          </Text>
        </View>

        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={17} color={colors.mutedForeground} />
          <TextInput
            accessibilityLabel="Search saved drinks"
            testID="search-saved-drinks"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search your saved drinks"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {searchQuery.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear drink search"
              testID="clear-drink-search"
              onPress={() => setSearchQuery('')}
              hitSlop={8}
            >
              <Feather name="x-circle" size={17} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        <View
          style={[
            styles.recentCard,
            styles.savedDrinksCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {!isReady ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Loading saved drinks…
              </Text>
            </View>
          ) : matchingSavedDrinks.length === 0 ? (
            <View style={styles.savedEmptyState}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {savedDrinks.length === 0
                  ? 'No saved drinks'
                  : 'No matching drinks'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {savedDrinks.length === 0
                  ? 'Save favorites for one-tap logging.'
                  : 'Try another name.'}
              </Text>
            </View>
          ) : (
            <>
              {favoriteSavedDrinks.length > 0 && (
                <>
                  <Text
                    style={[
                      styles.savedGroupLabel,
                      { color: colors.primary },
                    ]}
                  >
                    FAVORITES
                  </Text>
                  {renderSavedDrinkRows(
                    favoriteSavedDrinks,
                    otherSavedDrinks.length > 0,
                  )}
                </>
              )}
              {otherSavedDrinks.length > 0 && (
                <>
                  {favoriteSavedDrinks.length > 0 && (
                    <Text
                      style={[
                        styles.savedGroupLabel,
                        styles.savedGroupSecondaryLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      OTHER SAVED DRINKS
                    </Text>
                  )}
                  {renderSavedDrinkRows(otherSavedDrinks)}
                </>
              )}
            </>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a new drink"
          testID="add-drink-button"
          disabled={!isReady}
          onPress={() => {
            setAddingDrinkTimestamp(null);
            setIsAdding(true);
          }}
          style={({ pressed }) => [
            styles.secondaryAddButton,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: !isReady ? 0.55 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather name="plus" size={18} color={colors.primary} />
          <Text
            style={[
              styles.secondaryAddButtonText,
              { color: colors.primary },
            ]}
          >
            Add a new drink
          </Text>
        </Pressable>

        {todayEntries.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo last drink"
            testID="undo-drink-button"
            disabled={!isReady}
            onPress={undoLastDrink}
            style={({ pressed }) => [
              styles.undoButton,
              { opacity: !isReady ? 0.35 : pressed ? 0.55 : 1 },
            ]}
          >
            <Feather
              name="rotate-ccw"
              size={15}
              color={colors.mutedForeground}
            />
            <Text style={[styles.undoText, { color: colors.mutedForeground }]}>
              Undo last
            </Text>
          </Pressable>
        )}

        <View style={styles.recentHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Recent
          </Text>
          {todayEntries.length > 0 && (
            <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
              TODAY
            </Text>
          )}
        </View>

        <View
          style={[
            styles.recentCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {!isReady ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Getting your count…
              </Text>
            </View>
          ) : recentEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <View
                style={[
                  styles.emptyIcon,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <Feather name="clock" size={18} color={colors.primary} />
              </View>
              <View style={styles.emptyCopy}>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  Nothing logged yet
                </Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Your drinks will show up here.
                </Text>
              </View>
            </View>
          ) : (
            recentEntries.map((entry, index) =>
              renderLoggedDrinkRow(
                entry,
                index,
                recentEntries.length,
                'remove-drink',
                'edit-drink',
              ),
            )
          )}
        </View>

        </View>

        <View style={activeTab === 'history' ? undefined : styles.hiddenTabSection}>
        <View style={styles.recentHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {isCurrentWeek ? 'This week' : 'Earlier week'}
          </Text>
          {!isCurrentWeek && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Return to this week"
              testID="return-to-current-week"
              onPress={() => setSelectedWeekStart(null)}
              hitSlop={8}
            >
              <Text style={[styles.weekReturnText, { color: colors.primary }]}>
                This week
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.weekNavigation}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show previous week"
            testID="previous-week"
            onPress={() =>
              setSelectedWeekStart(
                shiftLocalWeek(weeklySummary.startTimestamp, -1),
              )
            }
            hitSlop={8}
            style={styles.weekNavigationButton}
          >
            <Feather name="chevron-left" size={20} color={colors.foreground} />
          </Pressable>
          <Text
            style={[styles.weekRange, { color: colors.mutedForeground }]}
            accessibilityLabel={`Week of ${displayWeekRange(
              weeklySummary.startTimestamp,
              weeklySummary.endExclusiveTimestamp,
            )}`}
          >
            {displayWeekRange(
              weeklySummary.startTimestamp,
              weeklySummary.endExclusiveTimestamp,
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show next week"
            accessibilityState={{ disabled: isCurrentWeek }}
            testID="next-week"
            disabled={isCurrentWeek}
            onPress={() => {
              const nextWeekStart = shiftLocalWeek(
                weeklySummary.startTimestamp,
                1,
              );
              setSelectedWeekStart(
                nextWeekStart >= currentWeekSummary.startTimestamp
                  ? null
                  : nextWeekStart,
              );
            }}
            hitSlop={8}
            style={styles.weekNavigationButton}
          >
            <Feather
              name="chevron-right"
              size={20}
              color={isCurrentWeek ? colors.mutedForeground : colors.foreground}
            />
          </Pressable>
        </View>

        <View
          style={[
            styles.weeklySummaryCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
          accessibilityLabel={`${weeklySummary.entries.length} drinks logged ${isCurrentWeek ? 'this week' : `during the week of ${displayWeekRange(
            weeklySummary.startTimestamp,
            weeklySummary.endExclusiveTimestamp,
          )}`}, standard drinks ${weeklySummary.entriesWithoutDetails > 0 ? 'unavailable because some drinks need details' : formatStandardDrinkCount(weeklySummary.standardDrinks)}, planned standard drinks ${plannedWeeklyStandardDrinks === null ? 'not set for all days' : formatStandardDrinkCount(plannedWeeklyStandardDrinks)}`}
        >
          <View style={styles.weeklySummaryMetrics}>
            <View style={styles.weeklyMetric}>
              <Text
                testID="week-logged-drink-total"
                style={[styles.weeklyCount, { color: colors.foreground }]}
              >
                {isReady ? weeklySummary.entries.length : '—'}
              </Text>
              <Text style={[styles.weeklyMetricLabel, { color: colors.mutedForeground }]}>
                {weeklySummary.entries.length === 1 ? 'drink logged' : 'drinks logged'}
              </Text>
            </View>
            <View
              style={[
                styles.weeklyDivider,
                { backgroundColor: colors.border },
              ]}
            />
            <View style={styles.weeklyMetric}>
              <Text
                testID="week-standard-drink-total"
                style={[styles.weeklyStandardTotal, { color: colors.primary }]}
              >
                {!isReady
                  ? '—'
                  : weeklySummary.entriesWithoutDetails > 0
                    ? 'Unavailable'
                    : formatStandardDrinkCount(weeklySummary.standardDrinks)}
              </Text>
              <Text style={[styles.weeklyMetricLabel, { color: colors.mutedForeground }]}>
                Standard drinks logged
              </Text>
            </View>
          </View>
          <View style={[styles.weeklyPlanRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.weeklyPlanLabel, { color: colors.mutedForeground }]}>
              Planned standard drinks
            </Text>
            <Text
              testID="week-planned-standard-drink-total"
              style={[styles.weeklyPlanTotal, { color: colors.foreground }]}
            >
              {!isReady
                ? '—'
                : plannedWeeklyStandardDrinks === null
                  ? 'Not set'
                  : formatStandardDrinkCount(plannedWeeklyStandardDrinks)}
            </Text>
          </View>
          {isReady && weeklyDaysWithoutGoals > 0 ? (
            <Text style={[styles.weeklySummaryNote, { color: colors.mutedForeground }]}>
              A daily goal is missing for {weeklyDaysWithoutGoals}{' '}
              {weeklyDaysWithoutGoals === 1 ? 'day' : 'days'}.
            </Text>
          ) : null}
          {isReady && weeklySummary.entriesWithoutDetails > 0 ? (
            <Text style={[styles.weeklySummaryNote, { color: colors.mutedForeground }]}>
              {weeklySummary.entriesWithoutDetails} logged{' '}
              {weeklySummary.entriesWithoutDetails === 1 ? 'drink needs' : 'drinks need'} details; total unavailable.
            </Text>
          ) : null}
        </View>

        <View style={styles.weeklyDaysSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Daily breakdown
          </Text>
          <View
            style={[
              styles.weeklyDaysCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            testID="week-daily-breakdown"
          >
            {weeklyDaySummaries.map((summary, index) => {
              const date = new Date(summary.startTimestamp);
              const dayLabel = date.toLocaleDateString(undefined, {
                weekday: 'short',
              });
              const dateLabel = date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
              const drinkCount = summary.entries.length;
              const standardDrinks =
                summary.entriesWithoutDetails > 0
                  ? null
                  : formatStandardDrinkCount(summary.standardDrinks);

              return (
                <View
                  key={summary.dayKey}
                  testID={`week-day-${summary.dayKey}`}
                  style={[
                    styles.weeklyDayRow,
                    index < weeklyDaySummaries.length - 1 && {
                      borderBottomColor: colors.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View style={styles.weeklyDayDate}>
                    <Text style={[styles.weeklyDayName, { color: colors.foreground }]}>
                      {dayLabel}
                      {summary.dayKey === todayKey ? ' · Today' : ''}
                    </Text>
                    <Text style={[styles.weeklyDayDateLabel, { color: colors.mutedForeground }]}>
                      {dateLabel}
                    </Text>
                  </View>
                  <View style={styles.weeklyDayTotals}>
                    <Text style={[styles.weeklyDayCount, { color: colors.foreground }]}>
                      {isReady
                        ? `${drinkCount} ${drinkCount === 1 ? 'drink' : 'drinks'}`
                        : '—'}
                    </Text>
                    <Text style={[styles.weeklyDayEquivalent, { color: colors.mutedForeground }]}>
                      {isReady
                        ? standardDrinks === null
                          ? 'Standard-drink total unavailable'
                          : `${standardDrinks} standard drinks`
                        : '—'}
                    </Text>
                    {isReady && drinkCount === 0 && (
                      <Text style={[styles.weeklyDayEmpty, { color: colors.mutedForeground }]}>
                        No drinks
                      </Text>
                    )}
                    {isReady && summary.entriesWithoutDetails > 0 ? (
                      <Text style={[styles.weeklyDayEmpty, { color: colors.mutedForeground }]}>
                        {summary.entriesWithoutDetails} need details
                      </Text>
                    ) : null}
                    {isReady && summary.dayKey < todayKey && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Add a drink to ${date.toLocaleDateString(undefined, {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        })}`}
                        testID={`add-drink-to-day-${summary.dayKey}`}
                        onPress={() =>
                          startAddingDrinkForDay(summary.startTimestamp)
                        }
                        style={({ pressed }) => [
                          styles.historicalAddButton,
                          {
                            backgroundColor: colors.secondary,
                            borderColor: colors.border,
                            opacity: pressed ? 0.65 : 1,
                          },
                        ]}
                      >
                        <Feather name="plus" size={13} color={colors.primary} />
                        <Text style={[styles.historicalAddText, { color: colors.primary }]}>
                          Add drink
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        </View>

        <View style={activeTab === 'money' ? undefined : styles.hiddenTabSection}>
        <SpendingTracker
          isReady={isReady}
          purchases={stockPurchases}
          entries={[
            ...entries,
            ...pendingRemovals.map((removed) => removed.entry),
          ]}
          savedDrinks={savedDrinks}
          dailyStandardDrinkGoal={dailyStandardDrinkGoal}
          dailyGoalOverrides={dailyGoalOverrides}
          referenceTimestamp={now}
          saveFailed={failedSaves.stockPurchases}
          onRetrySave={() => stockPurchasesWriter.current?.retry()}
          onAddPurchase={(purchase) =>
            saveStockPurchases([...stockPurchasesRef.current, purchase])
          }
          onRemovePurchase={confirmRemoveStockPurchase}
        />
        </View>

        <View style={activeTab === 'patterns' ? undefined : styles.hiddenTabSection}>
        <DrinkPatterns
          entries={entries}
          contextTagDefinitions={contextTagDefinitions}
          referenceTimestamp={now}
          isReady={isReady}
          onPlanGoals={() => setIsManagingGoals(true)}
        />
        </View>

        <View style={activeTab === 'history' ? undefined : styles.hiddenTabSection}>
        <View style={styles.recentHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Past days
          </Text>
          <View style={styles.historyHeaderActions}>
            {pastDaySummaries.length > 0 && (
              <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
                {pastDaySummaries.length} {pastDaySummaries.length === 1 ? 'DAY' : 'DAYS'}
              </Text>
            )}
            {isReady && entries.length > 0 && (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Export full drink history as CSV"
                  testID="export-drink-history"
                  onPress={exportDrinkHistory}
                  style={[
                    styles.historyExportButton,
                    { borderColor: colors.border },
                  ]}
                >
                  <Feather name="share" size={14} color={colors.primary} />
                  <Text style={[styles.historyExportText, { color: colors.primary }]}>
                    Full history
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose dates for drink history export"
                  testID="export-drink-history-range"
                  onPress={openDateRangeExport}
                  style={[
                    styles.historyExportButton,
                    { borderColor: colors.border },
                  ]}
                >
                  <Feather name="calendar" size={14} color={colors.primary} />
                  <Text style={[styles.historyExportText, { color: colors.primary }]}>
                    Dates
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {isDateRangeExportOpen && (
          <View
            style={[
              styles.exportRangeCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.exportRangeTitle, { color: colors.foreground }]}>
              Choose export dates
            </Text>
            <Text style={[styles.exportRangeHint, { color: colors.mutedForeground }]}>
              Dates use your local calendar. Format: YYYY-MM-DD.
            </Text>
            <View style={styles.exportRangeFields}>
              <View style={styles.exportRangeField}>
                <Text style={[styles.exportRangeLabel, { color: colors.mutedForeground }]}>
                  Start date
                </Text>
                <TextInput
                  accessibilityLabel="Export start date"
                  testID="export-start-date"
                  value={exportStartDay}
                  onChangeText={(value) => {
                    setExportStartDay(value);
                    setExportDateError(null);
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.exportRangeInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                />
              </View>
              <View style={styles.exportRangeField}>
                <Text style={[styles.exportRangeLabel, { color: colors.mutedForeground }]}>
                  End date
                </Text>
                <TextInput
                  accessibilityLabel="Export end date"
                  testID="export-end-date"
                  value={exportEndDay}
                  onChangeText={(value) => {
                    setExportEndDay(value);
                    setExportDateError(null);
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.exportRangeInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                />
              </View>
            </View>
            {exportDateError && (
              <Text
                accessibilityRole="alert"
                testID="export-date-error"
                style={[styles.exportRangeError, { color: colors.destructive }]}
              >
                {exportDateError}
              </Text>
            )}
            <View style={styles.exportRangeActions}>
              <Pressable
                accessibilityRole="button"
                testID="cancel-date-range-export"
                onPress={() => setIsDateRangeExportOpen(false)}
                style={styles.exportRangeCancel}
              >
                <Text style={[styles.exportRangeCancelText, { color: colors.mutedForeground }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="share-date-range-export"
                onPress={exportDrinkHistoryForDateRange}
                style={[styles.exportRangeShare, { backgroundColor: colors.primary }]}
              >
                <Feather name="share" size={14} color={colors.primaryForeground} />
                <Text style={[styles.exportRangeShareText, { color: colors.primaryForeground }]}>
                  Share selected dates
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        <View
          style={[
            styles.backupCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.backupCopy}>
            <Text style={[styles.backupTitle, { color: colors.foreground }]}>
              Backup &amp; restore
            </Text>
            <Text style={[styles.backupHint, { color: colors.mutedForeground }]}>
              Save drink history, saved drinks, and goals to one JSON file.
              Imports merge with your current data.
            </Text>
          </View>
          <View style={styles.backupActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export full JSON backup"
              testID="export-full-backup"
              onPress={exportFullBackup}
              disabled={!isReady || backupAction !== null}
              style={[
                styles.backupButton,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                  opacity: !isReady || backupAction !== null ? 0.6 : 1,
                },
              ]}
            >
              {backupAction === 'export' ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Feather
                  name="download"
                  size={15}
                  color={colors.primaryForeground}
                />
              )}
              <Text
                style={[
                  styles.backupButtonText,
                  { color: colors.primaryForeground },
                ]}
              >
                Export backup
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Import and merge a JSON backup"
              testID="import-full-backup"
              onPress={importFullBackup}
              disabled={!isReady || backupAction !== null}
              style={[
                styles.backupButton,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  opacity: !isReady || backupAction !== null ? 0.6 : 1,
                },
              ]}
            >
              {backupAction === 'import' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="upload" size={15} color={colors.primary} />
              )}
              <Text
                style={[styles.backupButtonText, { color: colors.foreground }]}
              >
                Import backup
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.recentCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {!isReady ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Loading history…
              </Text>
            </View>
          ) : pastDaySummaries.length === 0 ? (
            <View style={styles.historyEmptyState}>
              <Feather name="calendar" size={18} color={colors.primary} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Previous days will show up here.
              </Text>
            </View>
          ) : (
            pastDaySummaries.map((summary, index) => (
              <View
                key={summary.dayKey}
                style={[
                  styles.historyDayGroup,
                  index < pastDaySummaries.length - 1 && {
                    borderBottomColor: colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${expandedHistoryDay === summary.dayKey ? 'Hide' : 'Show'} drinks for ${displayHistoryDate(summary.entries[0].timestamp)}`}
                  accessibilityHint="Open this day to edit, remove, or add drinks."
                  accessibilityState={{ expanded: expandedHistoryDay === summary.dayKey }}
                  testID={`toggle-history-day-${summary.dayKey}`}
                  onPress={() =>
                    setExpandedHistoryDay((current) =>
                      current === summary.dayKey ? null : summary.dayKey,
                    )
                  }
                  style={({ pressed }) => [
                    styles.historyDayRow,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <View style={styles.historyDayCopy}>
                    <Text style={[styles.historyDate, { color: colors.foreground }]}>
                      {displayHistoryDate(summary.entries[0].timestamp)}
                    </Text>
                    <Text style={[styles.savedDrinkDetails, { color: colors.mutedForeground }]}>
                      {summary.entries.length} {summary.entries.length === 1 ? 'drink' : 'drinks'}
                      {summary.entriesWithoutDetails > 0
                        ? ` · ${summary.entriesWithoutDetails} not calculated`
                        : ''}
                    </Text>
                  </View>
                  <View style={styles.historyTotalBlock}>
                    <Text style={[styles.historyTotal, { color: colors.primary }]}>
                      {formatStandardDrinkCount(summary.standardDrinks)}
                    </Text>
                    <Text style={[styles.historyTotalLabel, { color: colors.mutedForeground }]}>
                      standard drinks
                    </Text>
                    {summary.entriesWithCalories > 0 && (
                      <Text style={[styles.historyTotalLabel, { color: colors.mutedForeground }]}>
                        {Math.round(summary.calories).toLocaleString()} kcal listed
                      </Text>
                    )}
                  </View>
                  <Feather
                    name={expandedHistoryDay === summary.dayKey ? 'chevron-up' : 'chevron-down'}
                    size={17}
                    color={colors.mutedForeground}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add a drink to ${displayHistoryDate(
                    summary.entries[0].timestamp,
                  )}`}
                  accessibilityHint="Opens the drink picker for this date."
                  testID={`add-drink-to-history-day-${summary.dayKey}`}
                  onPress={() =>
                    startAddingDrinkForDay(
                      localDayStart(summary.entries[0].timestamp),
                    )
                  }
                  style={({ pressed }) => [
                    styles.historicalHistoryAddButton,
                    {
                      backgroundColor: colors.secondary,
                      borderColor: colors.border,
                      opacity: pressed ? 0.65 : 1,
                    },
                  ]}
                >
                  <Feather name="plus" size={15} color={colors.primary} />
                  <Text style={[styles.historicalAddText, { color: colors.primary }]}>
                    Add drink to this day
                  </Text>
                </Pressable>
                {expandedHistoryDay === summary.dayKey && (
                  <View
                    style={[
                      styles.historyEntryList,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    {summary.entries
                      .slice()
                      .reverse()
                      .map((entry, entryIndex) =>
                        renderLoggedDrinkRow(
                          entry,
                          entryIndex,
                          summary.entries.length,
                          'remove-history-drink',
                          'edit-history-drink',
                        ),
                      )}
                  </View>
                )}
              </View>
            ))
          )}
        </View>
        </View>

        {errorMessage && (
          <Text
            accessibilityRole="alert"
            style={[styles.errorText, { color: colors.destructive }]}
          >
            {errorMessage}
          </Text>
        )}
        {failedSaves.entries && (
          <View style={styles.saveErrorRow}>
            <Text
              accessibilityRole="alert"
              style={[styles.errorText, { color: colors.destructive }]}
            >
              Couldn&apos;t save your count. Your last saved history is shown.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry saving drink history"
              testID="retry-save-history"
              onPress={() => entriesWriter.current?.retry()}
              hitSlop={8}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}
        {failedSaves.savedDrinks && (
          <View style={styles.saveErrorRow}>
            <Text
              accessibilityRole="alert"
              style={[styles.errorText, { color: colors.destructive }]}
            >
              Couldn&apos;t save your drink library. Your last saved drinks are shown.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry saving your drink library"
              testID="retry-save-saved-drinks"
              onPress={() => savedDrinksWriter.current?.retry()}
              hitSlop={8}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            height: webInsets
              ? 84
              : 64 + Math.max(insets.bottom, 8),
            paddingBottom: webInsets ? 34 : Math.max(insets.bottom, 8),
          },
        ]}
      >
        {NAV_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label} tab`}
              accessibilityState={{ selected }}
              testID={`navigation-tab-${tab.id}`}
              onPress={() => navigateToTab(tab.id)}
              style={({ pressed }) => [
                styles.tabButton,
                { opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <Feather
                name={tab.icon}
                size={19}
                color={selected ? colors.primary : colors.mutedForeground}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  {
                    color: selected ? colors.primary : colors.mutedForeground,
                    fontFamily: selected
                      ? 'Inter_600SemiBold'
                      : 'Inter_500Medium',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {pendingRemovals.length > 0 && (
        <ScrollView
          pointerEvents={backupAction ? 'none' : 'auto'}
          accessibilityLiveRegion="polite"
          style={[
            styles.undoNoticeList,
            {
              bottom:
                (webInsets ? 84 : 64 + Math.max(insets.bottom, 8)) + 12,
            },
          ]}
          contentContainerStyle={styles.undoNoticeListContent}
          showsVerticalScrollIndicator={pendingRemovals.length > 3}
        >
          {pendingRemovals
            .slice()
            .reverse()
            .map((removed, index) => (
              <View
                key={removed.entry.id}
                style={[
                  styles.undoNotice,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    shadowColor: colors.border,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.undoNoticeText, { color: colors.foreground }]}
                >
                  {removed.entry.name.trim() || 'Drink'} removed
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Undo removing ${removed.entry.name.trim() || 'drink'}`}
                  testID={
                    index === 0
                      ? 'undo-removed-drink'
                      : `undo-removed-drink-${removed.entry.id}`
                  }
                  onPress={() => undoRemovedDrink(removed)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.undoNoticeAction,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={[styles.undoNoticeActionText, { color: colors.primary }]}>
                    Undo
                  </Text>
                </Pressable>
              </View>
            ))}
        </ScrollView>
      )}
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  hiddenTabSection: {
    display: 'none',
  },
  tabBar: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 6,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 12,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 24,
    gap: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  eyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  date: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
  },
  headerIcon: {
    height: 44,
    width: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterCard: {
    minHeight: 258,
    borderRadius: 28,
    paddingHorizontal: 25,
    paddingVertical: 23,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  counterCardWithGoal: {
    minHeight: 312,
  },
  counterGoalProgress: {
    gap: 7,
    marginTop: 5,
  },
  counterGoalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  counterGoalLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1,
  },
  counterGoalAmount: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  counterGoalPercent: {
    fontFamily: 'Inter_700Bold',
  },
  counterGoalPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginTop: 5,
  },
  counterGoalPromptCopy: {
    flex: 1,
    gap: 4,
  },
  counterGoalPromptText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  goalCard: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  goalCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  goalEyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1,
  },
  goalValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
  },
  goalButton: {
    minHeight: 36,
    borderRadius: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  goalProgress: {
    gap: 7,
  },
  goalProgressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  goalProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  goalProgressText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  goalEditor: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 9,
  },
  goalInputLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  goalInput: {
    minHeight: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 13,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  goalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  goalAction: {
    minHeight: 38,
    paddingHorizontal: 9,
    justifyContent: 'center',
  },
  goalActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  goalSaveButton: {
    minHeight: 38,
    borderRadius: 11,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalSaveButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  calendarGoalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 1,
  },
  calendarGoalIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarGoalLinkText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  goalError: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  cardTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterQuickAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.4,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 5,
  },
  count: {
    fontFamily: 'Inter_700Bold',
    fontSize: 78,
    lineHeight: 88,
    letterSpacing: -4,
  },
  countLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
  },
  cardFooter: {
    alignItems: 'stretch',
    gap: 12,
  },
  cardTotals: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  totalDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.25,
    marginTop: 2,
    marginBottom: 10,
  },
  standardTotal: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 19,
    lineHeight: 23,
    letterSpacing: -0.3,
  },
  standardLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  secondaryAddButton: {
    minHeight: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    marginTop: 11,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  secondaryAddButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  undoButton: {
    height: 44,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    marginTop: 2,
  },
  undoText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  undoNotice: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 472,
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  undoNoticeList: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignSelf: 'center',
    maxWidth: 472,
    maxHeight: 288,
  },
  undoNoticeListContent: {
    gap: 8,
    paddingVertical: 2,
  },
  undoNoticeText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  undoNoticeAction: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  undoNoticeActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 19,
    letterSpacing: -0.3,
  },
  sectionMeta: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  historyHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyExportButton: {
    minHeight: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  historyExportText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  backupCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  backupCopy: {
    gap: 4,
  },
  backupTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  backupHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  backupActions: {
    flexDirection: 'row',
    gap: 10,
  },
  backupButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  backupButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  exportRangeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  exportRangeTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  exportRangeHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  exportRangeFields: {
    flexDirection: 'row',
    gap: 10,
  },
  exportRangeField: {
    flex: 1,
    gap: 6,
  },
  exportRangeLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  exportRangeInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  exportRangeError: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
  exportRangeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 2,
  },
  exportRangeCancel: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  exportRangeCancelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  exportRangeShare: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  exportRangeShareText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  weekRange: {
    flex: 1,
    flexShrink: 1,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  weekNavigationButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekReturnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  weeklySummaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 17,
    gap: 10,
  },
  weeklySummaryMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weeklyPlanRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  weeklyPlanLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  weeklyPlanTotal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  weeklySummaryNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 14,
  },
  weeklyDaysSection: {
    marginTop: 24,
  },
  weeklyDaysCard: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
  },
  weeklyDayRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  weeklyDayDate: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  weeklyDayName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  weeklyDayDateLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  weeklyDayTotals: {
    alignItems: 'flex-end',
    gap: 2,
  },
  weeklyDayCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  weeklyDayEquivalent: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  weeklyDayEmpty: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  historicalAddButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  historicalAddText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  weeklyMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  weeklyCount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.5,
  },
  weeklyStandardTotal: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 25,
    lineHeight: 32,
    letterSpacing: -0.8,
  },
  weeklyMetricLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    textAlign: 'center',
  },
  weeklyDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 13,
  },
  recentCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 17,
    minHeight: 94,
    justifyContent: 'center',
  },
  savedDrinksCard: {
    justifyContent: 'flex-start',
    paddingVertical: 8,
  },
  savedGroupLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.1,
    marginTop: 7,
    marginBottom: 1,
  },
  savedGroupSecondaryLabel: {
    marginTop: 11,
  },
  searchBox: {
    minHeight: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  loadingRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyState: {
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  savedEmptyState: {
    minHeight: 76,
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 14,
  },
  historyEmptyState: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  historyDayRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  historyDayGroup: {
    width: '100%',
  },
  historyEntryList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingLeft: 5,
  },
  historicalHistoryAddButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginHorizontal: 6,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  historyDayCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  historyDate: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  historyTotalBlock: {
    alignItems: 'flex-end',
    gap: 3,
  },
  historyTotal: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
  },
  historyTotalLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  emptyIcon: {
    height: 38,
    width: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCopy: {
    flex: 1,
    gap: 4,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  entryRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
  },
  savedDrinkRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  savedDrinkCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  savedDrinkDetails: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  savedDrinkAction: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  entryName: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  entryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  entryContextTags: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    lineHeight: 14,
  },
  entryTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  entryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  errorText: {
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  saveErrorRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
});
