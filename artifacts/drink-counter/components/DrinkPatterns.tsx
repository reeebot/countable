import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  calculateDrinkPatternInsights,
  calculateRecentDrinkPatternComparison,
  drinkContextTagLabel,
  DRINK_CONTEXT_COMPARISON_MIN_DAYS,
  DRINK_PATTERN_MIN_ENTRIES,
  DRINK_PATTERN_MIN_LOGGED_DAYS,
  DRINK_TIME_PERIODS,
  type DrinkEntry,
  type DrinkContextTagDefinition,
} from '@/lib/drink-data';
import { useColors } from '@/hooks/useColors';

type Props = {
  entries: DrinkEntry[];
  contextTagDefinitions: DrinkContextTagDefinition[];
  referenceTimestamp: number;
  isReady: boolean;
  onPlanGoals: () => void;
};

export function DrinkPatterns({
  entries,
  contextTagDefinitions,
  referenceTimestamp,
  isReady,
  onPlanGoals,
}: Props) {
  const colors = useColors();
  const insights = calculateDrinkPatternInsights(
    entries,
    referenceTimestamp,
    contextTagDefinitions,
  );
  const periodComparison = calculateRecentDrinkPatternComparison(
    entries,
    referenceTimestamp,
  );
  const maxTimePeriodCount = Math.max(
    ...Object.values(insights.timePeriodCounts),
    1,
  );

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.headingCopy}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Patterns
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
            Last 28 complete days
          </Text>
        </View>
        <Feather name="activity" size={17} color={colors.primary} />
      </View>

      <View
        testID="drink-patterns-card"
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {!isReady ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
              Loading your log…
            </Text>
          </View>
        ) : !insights.hasEnoughData ? (
          <View style={styles.emptyContent}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Your patterns will appear here
            </Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
              Log at least {DRINK_PATTERN_MIN_ENTRIES} drinks across{' '}
              {DRINK_PATTERN_MIN_LOGGED_DAYS} different days in this period to
              see timing and day-of-week patterns.
            </Text>
            <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
              So far: {insights.loggedEntryCount} entries across{' '}
              {insights.loggedDayCount} {insights.loggedDayCount === 1 ? 'day' : 'days'}.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.insightBlock}>
              <Text style={[styles.overline, { color: colors.mutedForeground }]}>
                TIME OF DAY
              </Text>
              {DRINK_TIME_PERIODS.map((period) => {
                const count = insights.timePeriodCounts[period.value];
                const widthPercent = Math.round(
                  (count / maxTimePeriodCount) * 100,
                );
                return (
                  <View key={period.value} style={styles.timePeriod}>
                    <View style={styles.timePeriodLabelRow}>
                      <Text style={[styles.bodyText, { color: colors.foreground }]}>
                        {period.label}
                      </Text>
                      <Text
                        style={[
                          styles.timeCount,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {count} {count === 1 ? 'entry' : 'entries'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.barTrack,
                        { backgroundColor: colors.secondary },
                      ]}
                    >
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${widthPercent}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            <View
              style={[
                styles.insightBlock,
                styles.dividedBlock,
                { borderTopColor: colors.border },
              ]}
            >
              <Text style={[styles.overline, { color: colors.mutedForeground }]}>
                CHANGE FROM THE PREVIOUS 28 DAYS
              </Text>
              {periodComparison ? (
                <>
                  <View style={styles.periodSummary}>
                    <Text
                      style={[
                        styles.comparisonLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Previous · {formatPeriodDates(periodComparison.previous)}
                    </Text>
                    <Text
                      style={[
                        styles.comparisonNote,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {formatPeriodSample(periodComparison.previous)}
                    </Text>
                    <Text
                      style={[
                        styles.comparisonLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Recent · {formatPeriodDates(periodComparison.recent)}
                    </Text>
                    <Text
                      style={[
                        styles.comparisonNote,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {formatPeriodSample(periodComparison.recent)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.trendAmount,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.bodyText,
                        { color: colors.foreground, flex: 1 },
                      ]}
                    >
                      Logged standard drinks
                    </Text>
                    <Text
                      style={[
                        styles.trendValue,
                        { color: colors.foreground },
                      ]}
                    >
                      {periodComparison.recent.totalStandardDrinks.toFixed(1)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.comparisonNote,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {periodComparison.previous.totalStandardDrinks.toFixed(1)}{' '}
                    previously · Change:{' '}
                    {formatSignedChange(periodComparison.standardDrinkChange)}{' '}
                    standard drinks
                  </Text>

                  <View
                    style={[
                      styles.trendDistribution,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.comparisonLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Time of day · share of entries
                    </Text>
                    {DRINK_TIME_PERIODS.map((period) => {
                      const previousShare =
                        (periodComparison.previous.timePeriodCounts[
                          period.value
                        ] /
                          periodComparison.previous.loggedEntryCount) *
                        100;
                      const recentShare =
                        (periodComparison.recent.timePeriodCounts[
                          period.value
                        ] /
                          periodComparison.recent.loggedEntryCount) *
                        100;
                      return (
                        <View key={period.value} style={styles.trendRow}>
                          <Text
                            style={[
                              styles.trendLabel,
                              { color: colors.foreground },
                            ]}
                          >
                            {period.label}
                          </Text>
                          <Text
                            style={[
                              styles.trendDistributionValue,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {previousShare.toFixed(1)}% →{' '}
                            {recentShare.toFixed(1)}%
                          </Text>
                          <Text
                            style={[
                              styles.trendChange,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {formatPercentagePointChange(
                              periodComparison.timePeriodShareChanges[
                                period.value
                              ],
                            )}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  <View
                    style={[
                      styles.dayTypeComparison,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.comparisonLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Average standard drinks per logged day
                    </Text>
                    <View style={styles.dayTypeHeader}>
                      <Text
                        style={[
                          styles.dayTypeHeading,
                          styles.dayTypeFirstHeading,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Day type
                      </Text>
                      <Text style={[styles.dayTypeHeading, { color: colors.mutedForeground }]}>
                        Previous
                      </Text>
                      <Text style={[styles.dayTypeHeading, { color: colors.mutedForeground }]}>
                        Recent
                      </Text>
                    </View>
                    <DayTypeAverageRow
                      label="Weekdays"
                      previousAverage={periodComparison.previous.averageStandardDrinksOnWeekdays}
                      previousDays={periodComparison.previous.weekdayLoggedDayCount}
                      recentAverage={periodComparison.recent.averageStandardDrinksOnWeekdays}
                      recentDays={periodComparison.recent.weekdayLoggedDayCount}
                      foregroundColor={colors.foreground}
                    />
                    <DayTypeAverageRow
                      label="Weekends"
                      previousAverage={periodComparison.previous.averageStandardDrinksOnWeekends}
                      previousDays={periodComparison.previous.weekendLoggedDayCount}
                      recentAverage={periodComparison.recent.averageStandardDrinksOnWeekends}
                      recentDays={periodComparison.recent.weekendLoggedDayCount}
                      foregroundColor={colors.foreground}
                    />
                    <Text
                      style={[
                        styles.comparisonNote,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Entries without drink details count as logged days but add
                      no amount.
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.disclaimer,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    These are changes in your logged history; they do not
                    explain why patterns changed.
                  </Text>
                </>
              ) : (
                <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                  A comparison appears when both 28-day periods have at least{' '}
                  {DRINK_PATTERN_MIN_ENTRIES} entries across{' '}
                  {DRINK_PATTERN_MIN_LOGGED_DAYS} logged days.
                </Text>
              )}
            </View>

            <View
              style={[
                styles.insightBlock,
                styles.dividedBlock,
                { borderTopColor: colors.border },
              ]}
            >
              <Text style={[styles.overline, { color: colors.mutedForeground }]}>
                POSSIBLE INFLUENCES
              </Text>
              {insights.contextComparisons.length > 0 ? (
                insights.contextComparisons.map((comparison) => (
                  <View
                    key={comparison.tag}
                    style={[
                      styles.contextComparison,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.contextTitle, { color: colors.foreground }]}>
                      {drinkContextTagLabel(
                        comparison.tag,
                        contextTagDefinitions,
                      )}
                    </Text>
                    <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                      {comparison.averageStandardDrinksOnTaggedDays.toFixed(1)}{' '}
                      standard drinks per tagged day · {comparison.taggedDayCount}{' '}
                      days
                    </Text>
                    <Text style={[styles.comparisonNote, { color: colors.mutedForeground }]}>
                      Other tagged days: {comparison.averageStandardDrinksOnOtherTaggedDays.toFixed(1)}{' '}
                      · {comparison.otherTaggedDayCount} days
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                  Choose optional context tags when logging. Comparisons appear
                  after a tag is recorded on at least{' '}
                  {DRINK_CONTEXT_COMPARISON_MIN_DAYS} days and there are at
                  least {DRINK_CONTEXT_COMPARISON_MIN_DAYS} other tagged
                  days.
                </Text>
              )}
              <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
                These are patterns in the entries you logged, not proof of cause.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Plan daily goals by date"
              testID="patterns-plan-goals"
              onPress={onPlanGoals}
              style={({ pressed }) => [
                styles.planButton,
                { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <Feather name="calendar" size={15} color={colors.primary} />
              <Text style={[styles.planButtonText, { color: colors.primary }]}>
                Plan goals by date
              </Text>
              <Feather name="arrow-right" size={14} color={colors.primary} />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function DayTypeAverageRow({
  label,
  previousAverage,
  previousDays,
  recentAverage,
  recentDays,
  foregroundColor,
}: {
  label: string;
  previousAverage: number | null;
  previousDays: number;
  recentAverage: number | null;
  recentDays: number;
  foregroundColor: string;
}) {
  return (
    <View style={styles.dayTypeRow}>
      <Text style={[styles.dayTypeLabel, { color: foregroundColor }]}>
        {label}
      </Text>
      <Text style={[styles.dayTypeValue, { color: foregroundColor }]}>
        {formatDayTypeAverage(previousAverage, previousDays)}
      </Text>
      <Text style={[styles.dayTypeValue, { color: foregroundColor }]}>
        {formatDayTypeAverage(recentAverage, recentDays)}
      </Text>
    </View>
  );
}

function formatDayTypeAverage(
  average: number | null,
  loggedDayCount: number,
): string {
  const sample = `${loggedDayCount} ${loggedDayCount === 1 ? 'day' : 'days'}`;
  return average === null
    ? `— · ${sample}`
    : `${average.toFixed(1)} · ${sample}`;
}

function formatPeriodDates(period: {
  startTimestamp: number;
  endExclusiveTimestamp: number;
}): string {
  const start = new Date(period.startTimestamp);
  const end = new Date(period.endExclusiveTimestamp);
  end.setDate(end.getDate() - 1);
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  const formatDate = (date: Date) => date.toLocaleDateString(undefined, options);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatPeriodSample(period: {
  loggedEntryCount: number;
  loggedDayCount: number;
  entriesWithoutDetails: number;
}): string {
  const missingDetails =
    period.entriesWithoutDetails > 0
      ? ` · ${period.entriesWithoutDetails} without drink details`
      : '';
  return `${period.loggedEntryCount} entries · ${period.loggedDayCount} logged days${missingDetails}`;
}

function formatSignedChange(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return 'No change';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
}

function formatPercentagePointChange(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return 'No change';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)} pp`;
}

const styles = StyleSheet.create({
  section: {
    marginTop: 27,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  headingCopy: {
    gap: 3,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    letterSpacing: -0.35,
  },
  sectionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 16,
  },
  loadingRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyContent: {
    gap: 9,
    paddingVertical: 4,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  bodyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  progressText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 1,
  },
  insightBlock: {
    gap: 10,
  },
  dividedBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 15,
  },
  overline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 1.1,
  },
  timePeriod: {
    gap: 5,
  },
  timePeriodLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  comparisonItem: {
    flex: 1,
    gap: 3,
  },
  comparisonLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  comparisonValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  comparisonNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  comparisonDivider: {
    width: StyleSheet.hairlineWidth,
  },
  periodSummary: {
    gap: 4,
  },
  trendAmount: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  trendDistribution: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 4,
    gap: 8,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trendLabel: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  trendDistributionValue: {
    minWidth: 94,
    textAlign: 'right',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  trendChange: {
    minWidth: 51,
    textAlign: 'right',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  dayTypeComparison: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 4,
    gap: 8,
  },
  dayTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayTypeHeading: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  dayTypeFirstHeading: {
    textAlign: 'left',
  },
  dayTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayTypeLabel: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  dayTypeValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  contextComparison: {
    gap: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contextTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  disclaimer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  planButton: {
    minHeight: 43,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  planButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
});
