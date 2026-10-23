import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Pressable,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import {
  calculateRecentDrinkPattern,
  compareDailyDrinkSummaryToGoal,
  formatStandardDrinkCount,
  localDayKey,
  normalizeDailyGoalOverride,
  shiftLocalWeek,
  summarizeDrinkEntriesByLocalDay,
  summarizeDailyGoalsForLocalWeek,
  summarizeDrinkEntriesForLocalWeek,
  suggestTaperGoalOverrides,
  type DailyGoalOverrides,
  type DrinkEntry,
  type SuggestedTaperGoals,
} from '@/lib/drink-data';

type AppColors = ReturnType<typeof useColors>;

type GoalCalendarProps = {
  colors: AppColors;
  entries: DrinkEntry[];
  now: number;
  defaultGoal: number | null;
  goalOverrides: DailyGoalOverrides;
  onSaveDayGoal: (dayKey: string, goal: number | null) => Promise<void>;
  onApplyGoals: (goals: DailyGoalOverrides) => Promise<void>;
  onClose: () => void;
};

type GoalDraft = {
  dayKey: string;
  value: string;
};

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function dateFromDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function monthDays(month: Date): Date[] {
  const first = firstOfMonth(month);
  const firstCell = new Date(first);
  firstCell.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstCell);
    day.setDate(firstCell.getDate() + index);
    return day;
  });
}

function goalText(goal: number | null | undefined): string {
  if (goal === null || goal === undefined) return '—';
  return formatStandardDrinkCount(goal);
}

function dateLabel(dayKey: string): string {
  return dateFromDayKey(dayKey).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function isBefore(first: Date, second: Date): boolean {
  return first.getTime() < second.getTime();
}

export function GoalCalendar({
  colors,
  entries,
  now,
  defaultGoal,
  goalOverrides,
  onSaveDayGoal,
  onApplyGoals,
  onClose,
}: GoalCalendarProps) {
  const insets = useSafeAreaInsets();
  const [visibleMonth, setVisibleMonth] = useState(() =>
    firstOfMonth(new Date(now)),
  );
  const [selectedDayKey, setSelectedDayKey] = useState(() => localDayKey(now));
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(() => ({
    dayKey: localDayKey(now),
    value:
      (goalOverrides[localDayKey(now)] === undefined
        ? undefined
        : formatStandardDrinkCount(goalOverrides[localDayKey(now)])) ??
      (defaultGoal === null ? undefined : formatStandardDrinkCount(defaultGoal)) ??
      '',
  }));
  const [goalError, setGoalError] = useState<string | null>(null);
  const [isSavingDay, setIsSavingDay] = useState(false);
  const [startingWeeklyInput, setStartingWeeklyInput] = useState(() => {
    const recent = calculateRecentDrinkPattern(entries, now);
    return recent.averageWeeklyStandardDrinks > 0
      ? formatStandardDrinkCount(recent.averageWeeklyStandardDrinks)
      : '';
  });
  const [targetWeeklyInput, setTargetWeeklyInput] = useState('');
  const [weeksInput, setWeeksInput] = useState('4');
  const [planError, setPlanError] = useState<string | null>(null);
  const [previewPlan, setPreviewPlan] =
    useState<SuggestedTaperGoals | null>(null);
  const [isApplyingPlan, setIsApplyingPlan] = useState(false);

  const recentPattern = useMemo(
    () => calculateRecentDrinkPattern(entries, now),
    [entries, now],
  );
  const summariesByDay = useMemo(
    () =>
      new Map(
        summarizeDrinkEntriesByLocalDay(entries).map((summary) => [
          summary.dayKey,
          summary,
        ]),
      ),
    [entries],
  );
  function goalForDayKey(dayKey: string): number | null | undefined {
    if (
      previewPlan !== null &&
      Object.prototype.hasOwnProperty.call(previewPlan.goals, dayKey)
    ) {
      return previewPlan.goals[dayKey];
    }
    if (Object.prototype.hasOwnProperty.call(goalOverrides, dayKey)) {
      return goalOverrides[dayKey];
    }
    return defaultGoal;
  }

  const todayKey = localDayKey(now);
  const calendarDays = monthDays(visibleMonth);
  const selectedOverrideExists = Object.prototype.hasOwnProperty.call(
    goalOverrides,
    selectedDayKey,
  );
  const selectedPreviewExists =
    previewPlan !== null &&
    Object.prototype.hasOwnProperty.call(previewPlan.goals, selectedDayKey);
  const selectedPreviewGoal = selectedPreviewExists
    ? previewPlan?.goals[selectedDayKey]
    : undefined;
  const selectedSavedGoal = selectedOverrideExists
    ? goalOverrides[selectedDayKey]
    : defaultGoal;
  const selectedGoal = selectedPreviewExists
    ? selectedPreviewGoal
    : selectedSavedGoal;
  const selectedDayStatus = compareDailyDrinkSummaryToGoal(
    summariesByDay.get(selectedDayKey),
    selectedGoal,
  );
  const selectedInputValue =
    goalDraft.dayKey === selectedDayKey
      ? goalDraft.value
        : (selectedSavedGoal === null
            ? ''
            : formatStandardDrinkCount(selectedSavedGoal));
  const selectedSummary = summariesByDay.get(selectedDayKey);
  const selectedWeekStart = shiftLocalWeek(
    dateFromDayKey(selectedDayKey).getTime(),
    0,
  );
  const selectedWeekSummary = summarizeDrinkEntriesForLocalWeek(
    entries,
    selectedWeekStart,
  );
  const plannedWeekSummary = summarizeDailyGoalsForLocalWeek(
    selectedWeekStart,
    defaultGoal,
    { ...goalOverrides, ...(previewPlan?.goals ?? {}) },
  );
  const plannedWeekTotal = plannedWeekSummary.plannedStandardDrinks;
  const daysWithoutGoals = plannedWeekSummary.daysWithoutGoals;
  const summaryByWeekday = recentPattern.weekdayAverages;
  const weekdaysAverage =
    summaryByWeekday.slice(0, 5).reduce((total, amount) => total + amount, 0) /
    5;
  const fridaySaturdayAverage =
    (summaryByWeekday[5] + summaryByWeekday[6]) / 2;

  function moveMonth(offset: number) {
    const nextMonth = new Date(visibleMonth);
    nextMonth.setMonth(nextMonth.getMonth() + offset, 1);
    setVisibleMonth(firstOfMonth(nextMonth));
    setSelectedDayKey(localDayKey(nextMonth.getTime()));
    setGoalError(null);
  }

  function selectDate(date: Date) {
    const nextKey = localDayKey(date.getTime());
    setSelectedDayKey(nextKey);
    setGoalError(null);
    if (date.getMonth() !== visibleMonth.getMonth()) {
      setVisibleMonth(firstOfMonth(date));
    }
  }

  async function saveSelectedGoal() {
    const goal = normalizeDailyGoalOverride(selectedInputValue);
    if (goal === null) {
      setGoalError('Enter a goal of 0 or more standard drinks.');
      return;
    }

    setIsSavingDay(true);
    setGoalError(null);
    try {
      await onSaveDayGoal(selectedDayKey, goal);
      setGoalDraft({
        dayKey: selectedDayKey,
        value: formatStandardDrinkCount(goal),
      });
    } catch {
      setGoalError("Couldn't save that date's goal. Try again.");
    } finally {
      setIsSavingDay(false);
    }
  }

  async function clearSelectedGoal() {
    setIsSavingDay(true);
    setGoalError(null);
    try {
      await onSaveDayGoal(selectedDayKey, null);
      setGoalDraft({
        dayKey: selectedDayKey,
        value:
          defaultGoal === null ? '' : formatStandardDrinkCount(defaultGoal),
      });
    } catch {
      setGoalError("Couldn't remove that date's goal. Try again.");
    } finally {
      setIsSavingDay(false);
    }
  }

  function createPlanPreview() {
    const startingWeekly = normalizeDailyGoalOverride(startingWeeklyInput);
    const targetWeekly = normalizeDailyGoalOverride(targetWeeklyInput);
    const weeks = Number(weeksInput.trim());
    if (startingWeekly === null || startingWeekly <= 0) {
      setPlanError('Enter your starting weekly total.');
      return;
    }
    if (targetWeekly === null || targetWeekly >= startingWeekly) {
      setPlanError('Choose a target below your starting weekly total.');
      return;
    }
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
      setPlanError('Choose a plan length from 1 to 52 weeks.');
      return;
    }

    const planStart = new Date(
      new Date(now).getFullYear(),
      new Date(now).getMonth(),
      new Date(now).getDate(),
      12,
    );
    planStart.setDate(planStart.getDate() - planStart.getDay() + 7);

    try {
      const plan = suggestTaperGoalOverrides(
        entries,
        planStart.getTime(),
        startingWeekly,
        targetWeekly,
        weeks,
        now,
      );
      setPreviewPlan(plan);
      setVisibleMonth(firstOfMonth(planStart));
      setSelectedDayKey(plan.startDayKey);
      setPlanError(null);
      setGoalError(null);
    } catch (error) {
      setPlanError(
        error instanceof Error
          ? error.message
          : "Couldn't create a plan. Check the values and try again.",
      );
    }
  }

  async function applyPlan() {
    if (!previewPlan) return;
    setIsApplyingPlan(true);
    setPlanError(null);
    try {
      const combinedGoals = { ...goalOverrides, ...previewPlan.goals };
      await onApplyGoals(combinedGoals);
      const currentGoal = combinedGoals[selectedDayKey];
      setGoalDraft({
        dayKey: selectedDayKey,
        value:
          currentGoal !== undefined
            ? formatStandardDrinkCount(currentGoal)
            : defaultGoal === null
              ? ''
              : formatStandardDrinkCount(defaultGoal),
      });
      setPreviewPlan(null);
    } catch {
      setPlanError("Couldn't save the plan. Your current goals are unchanged.");
    } finally {
      setIsApplyingPlan(false);
    }
  }

  function discardPlan() {
    setPreviewPlan(null);
    setPlanError(null);
    setGoalError(null);
  }

  const webInsets = Platform.OS === 'web';
  const contentTop = webInsets ? 18 : insets.top + 14;
  const contentBottom = Math.max(insets.bottom, webInsets ? 34 : 0) + 26;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: contentTop, paddingBottom: contentBottom },
        ]}
        bottomOffset={28}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to drink counter"
            testID="close-goal-calendar"
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.card, opacity: pressed ? 0.65 : 1 },
            ]}
          >
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
              PERSONAL GOALS
            </Text>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Goal calendar
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.calendarCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.monthHeader}>
            <Text style={[styles.monthTitle, { color: colors.foreground }]}>
              {visibleMonth.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <View style={styles.monthActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                testID="goal-calendar-previous-month"
                onPress={() => moveMonth(-1)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.monthButton,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <Feather
                  name="chevron-left"
                  size={20}
                  color={colors.foreground}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                testID="goal-calendar-next-month"
                onPress={() => moveMonth(1)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.monthButton,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <Feather
                  name="chevron-right"
                  size={20}
                  color={colors.foreground}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.weekdayRow}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((weekday, index) => (
              <Text
                key={`${weekday}-${index}`}
                style={[styles.weekdayLabel, { color: colors.mutedForeground }]}
              >
                {weekday}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((date) => {
              const dayKey = localDayKey(date.getTime());
              const isSelected = dayKey === selectedDayKey;
              const isToday = dayKey === todayKey;
              const isInMonth = date.getMonth() === visibleMonth.getMonth();
              const goal = goalForDayKey(dayKey);
              const summary = summariesByDay.get(dayKey);
              const goalStatus = compareDailyDrinkSummaryToGoal(summary, goal);
              const dayHasIncompleteEntries =
                summary !== undefined && summary.entriesWithoutDetails > 0;
              const statusColor =
                goalStatus === 'under'
                  ? isSelected
                    ? colors.primaryForeground
                    : colors.primary
                  : goalStatus === 'met'
                    ? colors.accent
                    : goalStatus === 'over'
                      ? colors.destructive
                      : colors.mutedForeground;
              const statusLabel =
                goalStatus === 'under'
                  ? 'under goal'
                  : goalStatus === 'met'
                    ? 'met goal'
                    : goalStatus === 'over'
                      ? 'over goal'
                      : dayHasIncompleteEntries
                        ? 'standard-drink total unavailable'
                        : summary && (goal === null || goal === undefined)
                          ? 'no daily goal set'
                          : null;

              return (
                <View key={dayKey} style={styles.calendarCell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${dateLabel(dayKey)}. Goal ${goalText(goal)} standard drinks${summary ? dayHasIncompleteEntries ? `, standard-drink total unavailable because ${summary.entriesWithoutDetails} ${summary.entriesWithoutDetails === 1 ? 'drink needs' : 'drinks need'} details` : `, ${formatStandardDrinkCount(summary.standardDrinks)} standard drinks logged` : ', no drinks logged'}${statusLabel ? `, ${statusLabel}` : ''}`}
                    accessibilityState={{ selected: isSelected }}
                    testID={`goal-calendar-day-${dayKey}`}
                    onPress={() => selectDate(date)}
                    style={({ pressed }) => [
                      styles.dayButton,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : 'transparent',
                        borderColor:
                          isToday && !isSelected
                            ? colors.primary
                            : 'transparent',
                        opacity: pressed ? 0.72 : isInMonth ? 1 : 0.44,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        {
                          color: isSelected
                            ? colors.primaryForeground
                            : colors.foreground,
                          fontFamily:
                            isToday || isSelected
                              ? 'Inter_700Bold'
                              : 'Inter_500Medium',
                        },
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.dayGoal,
                        {
                          color: isSelected
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      {goalText(goal)}
                    </Text>
                    {summary ? (
                      <View
                        style={[
                          styles.loggedDot,
                          {
                            backgroundColor: statusColor,
                            borderWidth: goalStatus === 'met' ? 1 : 0,
                            borderColor: isSelected
                              ? colors.primaryForeground
                              : colors.foreground,
                          },
                        ]}
                      />
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={styles.legendRow}>
            {[
              { status: 'under', label: 'Under', color: colors.primary },
              { status: 'met', label: 'Met', color: colors.accent },
              { status: 'over', label: 'Over', color: colors.destructive },
              { status: 'unknown', label: 'No comparison', color: colors.mutedForeground },
            ].map(({ status, label, color }) => (
              <View key={status} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                  {label}
                </Text>
              </View>
            ))}
            <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
              goal
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.weekSummaryCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          accessibilityLabel={`Selected week summary. Planned ${plannedWeekTotal === null ? 'unavailable' : `${formatStandardDrinkCount(plannedWeekTotal)} standard drinks`}. Logged ${selectedWeekSummary.entriesWithoutDetails > 0 ? 'unavailable' : `${formatStandardDrinkCount(selectedWeekSummary.standardDrinks)} standard drinks`}.`}
          testID="goal-calendar-week-summary"
        >
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
            SELECTED WEEK
          </Text>
          <View style={styles.weekSummaryValues}>
            <View style={styles.weekSummaryValue}>
              <Text style={[styles.weekSummaryLabel, { color: colors.mutedForeground }]}>
                Planned
              </Text>
              <Text style={[styles.weekSummaryAmount, { color: colors.foreground }]}>
                {plannedWeekTotal === null
                  ? 'Not set'
                  : `${formatStandardDrinkCount(plannedWeekTotal)} standard drinks`}
              </Text>
            </View>
            <View style={styles.weekSummaryValue}>
              <Text style={[styles.weekSummaryLabel, { color: colors.mutedForeground }]}>
                Logged
              </Text>
              <Text style={[styles.weekSummaryAmount, { color: colors.foreground }]}>
                {selectedWeekSummary.entriesWithoutDetails > 0
                  ? 'Unavailable'
                  : `${formatStandardDrinkCount(selectedWeekSummary.standardDrinks)} standard drinks`}
              </Text>
            </View>
          </View>
          {daysWithoutGoals > 0 ? (
            <Text style={[styles.weekSummaryNote, { color: colors.mutedForeground }]}>
              Set a daily goal for all 7 days to see the planned total.
            </Text>
          ) : null}
          {selectedWeekSummary.entriesWithoutDetails > 0 ? (
            <Text style={[styles.weekSummaryNote, { color: colors.mutedForeground }]}>
              {selectedWeekSummary.entriesWithoutDetails} logged{' '}
              {selectedWeekSummary.entriesWithoutDetails === 1 ? 'drink needs' : 'drinks need'}{' '}
              details before the total can be calculated.
            </Text>
          ) : null}
        </View>

        <View
          style={[
            styles.selectedCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
            SELECTED DAY
          </Text>
          <Text style={[styles.selectedTitle, { color: colors.foreground }]}>
            {dateFromDayKey(selectedDayKey).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
          <Text style={[styles.selectedMeta, { color: colors.mutedForeground }]}>
            {selectedSummary
              ? selectedSummary.entriesWithoutDetails > 0
                ? `${selectedSummary.entries.length} ${selectedSummary.entries.length === 1 ? 'drink' : 'drinks'} logged · standard-drink total unavailable (${selectedSummary.entriesWithoutDetails} need details)`
                : `${selectedSummary.entries.length} ${selectedSummary.entries.length === 1 ? 'drink' : 'drinks'} logged · ${formatStandardDrinkCount(selectedSummary.standardDrinks)} standard drinks`
              : 'No drinks logged'}
          </Text>
          {selectedDayStatus ? (
            <Text
              style={[
                styles.dayStatusText,
                {
                  color:
                    selectedDayStatus === 'under'
                      ? colors.primary
                      : selectedDayStatus === 'met'
                        ? colors.accent
                        : colors.destructive,
                },
              ]}
              testID="goal-calendar-selected-day-status"
            >
              {selectedDayStatus === 'under'
                ? 'Under goal'
                : selectedDayStatus === 'met'
                  ? 'Goal met'
                  : 'Over goal'}
            </Text>
          ) : null}
          <View style={[styles.currentGoalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.currentGoalLabel, { color: colors.mutedForeground }]}>
              {selectedPreviewExists
                ? 'Suggested goal'
                : selectedOverrideExists
                  ? 'Date-specific goal'
                  : 'Usual daily goal'}
            </Text>
            <Text style={[styles.currentGoalValue, { color: colors.foreground }]}>
              {selectedGoal === null || selectedGoal === undefined
                ? 'Not set'
                : `${formatStandardDrinkCount(selectedGoal)} standard drinks`}
            </Text>
          </View>

          {previewPlan ? (
            <Text
              style={[styles.helperText, { color: colors.mutedForeground }]}
            >
              Apply or discard the plan preview before editing saved goals.
            </Text>
          ) : (
            <>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                Set a goal for this date
              </Text>
              <TextInput
                accessibilityLabel={`Goal for ${dateLabel(selectedDayKey)}`}
                testID="goal-calendar-day-input"
                value={selectedInputValue}
                onChangeText={(value) => {
                  setGoalDraft({ dayKey: selectedDayKey, value });
                  setGoalError(null);
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="For example, 2"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
              <View style={styles.dayActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Use usual daily goal for this date"
                  testID="clear-calendar-day-goal"
                  disabled={!selectedOverrideExists || isSavingDay}
                  onPress={() => void clearSelectedGoal()}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    {
                      borderColor: colors.border,
                      opacity:
                        !selectedOverrideExists || isSavingDay
                          ? 0.45
                          : pressed
                            ? 0.6
                            : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.secondaryActionText,
                      { color: colors.foreground },
                    ]}
                  >
                    Use usual goal
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID="save-calendar-day-goal"
                  disabled={isSavingDay}
                  onPress={() => void saveSelectedGoal()}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    {
                      backgroundColor: colors.primary,
                      opacity: isSavingDay ? 0.55 : pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryActionText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {isSavingDay ? 'Saving…' : 'Save date goal'}
                  </Text>
                </Pressable>
              </View>
              {goalError ? (
                <Text
                  accessibilityRole="alert"
                  style={[styles.errorText, { color: colors.destructive }]}
                >
                  {goalError}
                </Text>
              ) : null}
            </>
          )}
        </View>

        <View
          style={[
            styles.planCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.planHeading}>
            <View
              style={[
                styles.planIcon,
                { backgroundColor: colors.secondary },
              ]}
            >
              <Feather name="trending-down" size={18} color={colors.primary} />
            </View>
            <View style={styles.planHeadingCopy}>
              <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
                TAPER PLAN
              </Text>
              <Text style={[styles.planTitle, { color: colors.foreground }]}>
                Suggest daily goals
              </Text>
            </View>
          </View>

          <Text style={[styles.planCopy, { color: colors.mutedForeground }]}>
            Your starting point uses the previous 28 complete days of logged
            drinks. Choose a lower weekly target and the number of weeks; the
            daily goals follow your logged weekday and weekend pattern.
          </Text>

          <View
            style={[
              styles.patternSummary,
              { backgroundColor: colors.secondary },
            ]}
          >
            <Text style={[styles.patternValue, { color: colors.primary }]}>
              {formatStandardDrinkCount(recentPattern.totalStandardDrinks)}
            </Text>
            <Text style={[styles.patternCopy, { color: colors.secondaryForeground }]}>
              standard drinks logged in 28 complete days ·{' '}
              {formatStandardDrinkCount(recentPattern.averageWeeklyStandardDrinks)} per week
            </Text>
          </View>
          <Text style={[styles.weekendCopy, { color: colors.mutedForeground }]}>
            {recentPattern.usesWeekendFallback
              ? 'No standard-drink pattern in those logs yet. The starter split gives Friday and Saturday a little more weight.'
              : `Recent average: ${formatStandardDrinkCount(fridaySaturdayAverage)} on Friday/Saturday and ${formatStandardDrinkCount(weekdaysAverage)} on Sunday–Thursday.`}
          </Text>

          <View style={styles.planInputRow}>
            <View style={styles.planInputCell}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                Starting / week
              </Text>
              <TextInput
                accessibilityLabel="Starting standard drinks per week"
                testID="taper-starting-weekly-goal"
                value={startingWeeklyInput}
                onChangeText={(value) => {
                  setStartingWeeklyInput(value);
                  setPlanError(null);
                }}
                keyboardType="decimal-pad"
                placeholder={formatStandardDrinkCount(recentPattern.averageWeeklyStandardDrinks)}
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
            </View>
            <View style={styles.planInputCell}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                Target / week
              </Text>
              <TextInput
                accessibilityLabel="Target standard drinks per week"
                testID="taper-target-weekly-goal"
                value={targetWeeklyInput}
                onChangeText={(value) => {
                  setTargetWeeklyInput(value);
                  setPlanError(null);
                }}
                keyboardType="decimal-pad"
                placeholder="For example, 8"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
            </View>
            <View style={[styles.planInputCell, styles.weeksInputCell]}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                Weeks
              </Text>
              <TextInput
                accessibilityLabel="Number of weeks for the taper plan"
                testID="taper-plan-weeks"
                value={weeksInput}
                onChangeText={(value) => {
                  setWeeksInput(value.replace(/\D/g, '').slice(0, 2));
                  setPlanError(null);
                }}
                keyboardType="number-pad"
                placeholder="4"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
            </View>
          </View>

          <Text style={[styles.safetyNote, { color: colors.mutedForeground }]}>
            This is a planning tool, not medical guidance. If you may be
            physically dependent or feel unwell when drinking less, talk with a
            clinician before changing your intake.
          </Text>

          {previewPlan ? (
            <View
              style={[
                styles.previewPanel,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}
              testID="taper-plan-preview"
            >
              <Text style={[styles.previewTitle, { color: colors.foreground }]}>
                Review before saving
              </Text>
              <Text style={[styles.previewDates, { color: colors.mutedForeground }]}>
                {dateFromDayKey(previewPlan.startDayKey).toLocaleDateString(
                  undefined,
                  { month: 'short', day: 'numeric' },
                )}{' '}
                –{' '}
                {dateFromDayKey(previewPlan.endDayKey).toLocaleDateString(
                  undefined,
                  { month: 'short', day: 'numeric', year: 'numeric' },
                )}
              </Text>
              <View style={styles.weekTargetList}>
                {previewPlan.weeklyTargets.map((target, index) => (
                  <View
                    key={`${previewPlan.startDayKey}-week-${index + 1}`}
                    style={styles.weekTargetRow}
                  >
                    <Text
                      style={[
                        styles.weekTargetLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Week {index + 1}
                    </Text>
                    <Text
                      style={[
                        styles.weekTargetValue,
                        { color: colors.foreground },
                      ]}
                    >
                      {formatStandardDrinkCount(target)} standard drinks
                    </Text>
                  </View>
                ))}
              </View>
              {previewPlan.usesWeekendFallback ? (
                <Text
                  style={[
                    styles.previewHint,
                    { color: colors.mutedForeground },
                  ]}
                >
                  The daily split uses a small Friday/Saturday weighting until
                  there is enough logged history.
                </Text>
              ) : null}
              <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>
                Applying replaces saved date goals within these plan dates.
              </Text>
              <View style={styles.dayActions}>
                <Pressable
                  accessibilityRole="button"
                  testID="discard-taper-plan"
                  disabled={isApplyingPlan}
                  onPress={discardPlan}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    {
                      borderColor: colors.border,
                      opacity: isApplyingPlan ? 0.45 : pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.secondaryActionText,
                      { color: colors.foreground },
                    ]}
                  >
                    Discard
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID="apply-taper-plan"
                  disabled={isApplyingPlan}
                  onPress={() => void applyPlan()}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    {
                      backgroundColor: colors.primary,
                      opacity: isApplyingPlan ? 0.55 : pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryActionText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {isApplyingPlan ? 'Saving…' : 'Apply plan'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              testID="suggest-taper-plan"
              onPress={createPlanPreview}
              style={({ pressed }) => [
                styles.generateButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Feather name="trending-down" size={17} color={colors.primaryForeground} />
              <Text
                style={[
                  styles.primaryActionText,
                  { color: colors.primaryForeground },
                ]}
              >
                Suggest a plan
              </Text>
            </Pressable>
          )}
          {planError ? (
            <Text
              accessibilityRole="alert"
              style={[styles.errorText, { color: colors.destructive }]}
            >
              {planError}
            </Text>
          ) : null}
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 2,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    gap: 2,
  },
  eyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    lineHeight: 28,
  },
  calendarCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 14,
    gap: 12,
  },
  monthHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  monthActions: {
    flexDirection: 'row',
    gap: 4,
  },
  monthButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekdayLabel: {
    width: '14.285%',
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.285%',
    padding: 1,
  },
  dayButton: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    position: 'relative',
  },
  dayNumber: {
    fontSize: 12,
    lineHeight: 16,
  },
  dayGoal: {
    maxWidth: '100%',
    fontFamily: 'Inter_500Medium',
    fontSize: 8,
    lineHeight: 11,
  },
  loggedDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  selectedCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  weekSummaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  weekSummaryValues: {
    flexDirection: 'row',
    gap: 12,
  },
  weekSummaryValue: {
    flex: 1,
    gap: 3,
  },
  weekSummaryLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  weekSummaryAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  weekSummaryNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 14,
  },
  selectedTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  selectedMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  dayStatusText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  currentGoalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
    paddingTop: 10,
    gap: 4,
  },
  currentGoalLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  currentGoalValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  helperText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
  inputLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    marginTop: 4,
  },
  input: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingHorizontal: 12,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  dayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  secondaryAction: {
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  primaryAction: {
    minHeight: 40,
    borderRadius: 11,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  planCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 16,
    gap: 11,
  },
  planHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  planIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planHeadingCopy: {
    flex: 1,
    gap: 2,
  },
  planTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  planCopy: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  patternSummary: {
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  patternValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  patternCopy: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
  },
  weekendCopy: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
  },
  planInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  planInputCell: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  weeksInputCell: {
    flexGrow: 0,
    flexBasis: 64,
  },
  safetyNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  generateButton: {
    minHeight: 46,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  previewPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  previewTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  previewDates: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  weekTargetList: {
    gap: 7,
  },
  weekTargetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  weekTargetLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  weekTargetValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  previewHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
});
