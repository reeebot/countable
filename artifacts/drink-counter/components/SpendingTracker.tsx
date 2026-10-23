import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  createDrinkId,
  type DailyGoalOverrides,
  type DrinkEntry,
  type SavedDrink,
} from '@/lib/drink-data';
import {
  calculateSpendingSummary,
  createStockPurchase,
  formatCurrency,
  millilitersToFluidOunces,
  stockPurchaseBalances,
  type StockPurchase,
} from '@/lib/spending-data';

type SpendingTrackerProps = {
  isReady: boolean;
  purchases: StockPurchase[];
  entries: DrinkEntry[];
  savedDrinks: SavedDrink[];
  dailyStandardDrinkGoal: number | null;
  dailyGoalOverrides: DailyGoalOverrides;
  referenceTimestamp: number;
  saveFailed: boolean;
  onRetrySave: () => void;
  onAddPurchase: (purchase: StockPurchase) => void;
  onRemovePurchase: (purchaseId: string) => void;
};

type PurchaseForm = {
  productName: string;
  alcoholPercent: string;
  containerCount: string;
  containerVolume: string;
  totalCost: string;
};

const EMPTY_FORM: PurchaseForm = {
  productName: '',
  alcoholPercent: '',
  containerCount: '',
  containerVolume: '12',
  totalCost: '',
};

function metricValue(value: string, label: string, colors: ReturnType<typeof useColors>) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>
        {value}
      </Text>
    </View>
  );
}

function formNumber(value: string, label: string): number {
  if (!value.trim()) throw new Error(`Enter ${label.toLocaleLowerCase()}.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Enter a valid ${label.toLocaleLowerCase()}.`);
  }
  return parsed;
}

export function SpendingTracker({
  isReady,
  purchases,
  entries,
  savedDrinks,
  dailyStandardDrinkGoal,
  dailyGoalOverrides,
  referenceTimestamp,
  saveFailed,
  onRetrySave,
  onAddPurchase,
  onRemovePurchase,
}: SpendingTrackerProps) {
  const colors = useColors();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<PurchaseForm>({ ...EMPTY_FORM });
  const [formError, setFormError] = useState<string | null>(null);
  const summary = calculateSpendingSummary(
    purchases,
    entries,
    dailyStandardDrinkGoal,
    dailyGoalOverrides,
    referenceTimestamp,
  );
  const balances = stockPurchaseBalances(purchases, entries).sort(
    (a, b) => b.purchasedAt - a.purchasedAt,
  );

  function updateForm(field: keyof PurchaseForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
  }

  function fillFromSavedDrink(drink: SavedDrink) {
    const volumeInFluidOunces =
      drink.unit === 'fl oz'
        ? drink.volume
        : millilitersToFluidOunces(drink.volume);
    setForm((current) => ({
      ...current,
      productName: drink.name,
      alcoholPercent: String(drink.alcoholPercent),
      containerVolume: volumeInFluidOunces.toFixed(1),
    }));
    setFormError(null);
  }

  function addPurchase() {
    try {
      const purchase = createStockPurchase(
        {
          productName: form.productName,
          alcoholPercent: formNumber(form.alcoholPercent, 'alcohol percentage'),
          containerCount: formNumber(form.containerCount, 'container count'),
          containerVolume: formNumber(form.containerVolume, 'container volume'),
          unit: 'fl oz',
          totalCost: formNumber(form.totalCost, 'total price'),
        },
        createDrinkId(),
        Date.now(),
      );
      onAddPurchase(purchase);
      setForm({ ...EMPTY_FORM });
      setFormError(null);
      setIsFormOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Check the purchase details and try again.',
      );
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.titleGroup}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Money &amp; stock
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
            Purchases, drink costs, and goal-based savings
          </Text>
        </View>
        <Feather name="dollar-sign" size={18} color={colors.primary} />
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.metricsGrid}>
          {metricValue(formatCurrency(summary.totalPaidCents), 'Purchased', colors)}
          {metricValue(formatCurrency(summary.consumedCostCents), 'Logged drinks', colors)}
          {metricValue(formatCurrency(summary.remainingValueCents), 'Stock value left', colors)}
          {metricValue(
            summary.projectedSavingsCents === null
              ? '—'
              : formatCurrency(summary.projectedSavingsCents),
            'Potential 4-week savings',
            colors,
          )}
        </View>

        {summary.projectedSavingsCents === null && (
          <Text style={[styles.estimateNote, { color: colors.mutedForeground }]}>
            {summary.trackedDays < 6
              ? 'Log drinks from purchased stock on 6 days to build a savings estimate.'
              : 'Set daily goals to estimate savings.'}
          </Text>
        )}
        {summary.projectedSavingsCents !== null && (
          <Text style={[styles.estimateNote, { color: colors.mutedForeground }]}>
            Based on {summary.trackedDays} tracked days and {summary.projectionDays}{' '}
            planned days.
          </Text>
        )}

        {saveFailed && (
          <View style={styles.saveError}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              Stock changes could not be saved.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry saving stock"
              onPress={onRetrySave}
              hitSlop={8}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.stockHeading}>
          <Text style={[styles.stockTitle, { color: colors.foreground }]}>
            Purchased stock
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFormOpen ? 'Close purchase form' : 'Add a purchase'}
            testID="toggle-purchase-form"
            disabled={!isReady}
            onPress={() => {
              setFormError(null);
              setIsFormOpen((open) => !open);
            }}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: colors.primary,
                opacity: !isReady ? 0.45 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <Feather
              name={isFormOpen ? 'x' : 'plus'}
              size={15}
              color={colors.primaryForeground}
            />
            <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>
              {isFormOpen ? 'Close' : 'Add purchase'}
            </Text>
          </Pressable>
        </View>

        {isFormOpen && (
          <View style={styles.form} testID="purchase-form">
            {savedDrinks.length > 0 && (
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  Fill from a saved drink
                </Text>
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.savedDrinkChoices}
                >
                  {savedDrinks.map((drink) => (
                    <Pressable
                      key={drink.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${drink.name} for this purchase`}
                      onPress={() => fillFromSavedDrink(drink)}
                      style={({ pressed }) => [
                        styles.savedDrinkChip,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                          opacity: pressed ? 0.65 : 1,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.savedDrinkChipText, { color: colors.foreground }]}
                      >
                        {drink.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Product
              </Text>
              <TextInput
                accessibilityLabel="Product name"
                testID="purchase-product-name"
                value={form.productName}
                onChangeText={(value) => updateForm('productName', value)}
                placeholder="Coors Light"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  Alcohol %
                </Text>
                <TextInput
                  accessibilityLabel="Alcohol percentage"
                  testID="purchase-abv"
                  value={form.alcoholPercent}
                  onChangeText={(value) => updateForm('alcoholPercent', value)}
                  placeholder="4.2"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  Containers in pack
                </Text>
                <TextInput
                  accessibilityLabel="Number of containers in pack"
                  testID="purchase-container-count"
                  value={form.containerCount}
                  onChangeText={(value) => updateForm('containerCount', value)}
                  placeholder="24"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                />
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  Each container (fl oz)
                </Text>
                <TextInput
                  accessibilityLabel="Volume of each container in fluid ounces"
                  testID="purchase-container-volume"
                  value={form.containerVolume}
                  onChangeText={(value) => updateForm('containerVolume', value)}
                  placeholder="12"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  Total paid ($)
                </Text>
                <TextInput
                  accessibilityLabel="Total purchase price in dollars"
                  testID="purchase-total-cost"
                  value={form.totalCost}
                  onChangeText={(value) => updateForm('totalCost', value)}
                  placeholder="29.99"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                />
              </View>
            </View>

            {formError && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {formError}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              testID="save-purchase"
              onPress={addPurchase}
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>
                Save purchase
              </Text>
            </Pressable>
          </View>
        )}

        {balances.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Add a purchase to start tracking stock and drink costs.
          </Text>
        ) : (
          <View style={styles.purchaseList}>
            {balances.map((balance, index) => (
              <View
                key={balance.id}
                style={[
                  styles.purchaseRow,
                  index < balances.length - 1 && {
                    borderBottomColor: colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <View style={styles.purchaseCopy}>
                  <Text
                    numberOfLines={1}
                    style={[styles.purchaseName, { color: colors.foreground }]}
                  >
                    {balance.productName}
                  </Text>
                  <Text style={[styles.purchaseDetails, { color: colors.mutedForeground }]}>
                    {balance.remainingContainers.toFixed(1)} of{' '}
                    {balance.containerCount} left · {balance.alcoholPercent}% ABV ·{' '}
                    {millilitersToFluidOunces(balance.containerVolumeMl).toFixed(1)} fl oz
                  </Text>
                  <Text style={[styles.purchaseCost, { color: colors.mutedForeground }]}>
                    {formatCurrency(balance.consumedCostCents)} used ·{' '}
                    {formatCurrency(balance.remainingCostCents)} in stock
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${balance.productName} purchase`}
                  testID={`remove-purchase-${balance.id}`}
                  onPress={() => onRemovePurchase(balance.id)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.removeButton,
                    { opacity: pressed ? 0.55 : 1 },
                  ]}
                >
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
          Matching product name and ABV draws each logged volume from stock automatically.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  titleGroup: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
  },
  metric: {
    width: '50%',
    gap: 4,
    paddingRight: 8,
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 15,
  },
  metricValue: {
    fontSize: 19,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  estimateNote: {
    fontSize: 11,
    lineHeight: 16,
  },
  saveError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 17,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  stockHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stockTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  addButton: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  form: {
    gap: 11,
    paddingVertical: 2,
  },
  savedDrinkChoices: {
    gap: 7,
    paddingVertical: 2,
  },
  savedDrinkChip: {
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 14,
  },
  savedDrinkChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 9,
  },
  fieldHalf: {
    flex: 1,
    gap: 5,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 14,
  },
  saveButton: {
    minHeight: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 17,
  },
  purchaseList: {
    marginTop: -4,
  },
  purchaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  purchaseCopy: {
    flex: 1,
    gap: 3,
  },
  purchaseName: {
    fontSize: 13,
    fontWeight: '700',
  },
  purchaseDetails: {
    fontSize: 11,
    lineHeight: 15,
  },
  purchaseCost: {
    fontSize: 11,
    lineHeight: 15,
  },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footnote: {
    fontSize: 10,
    lineHeight: 14,
  },
});
