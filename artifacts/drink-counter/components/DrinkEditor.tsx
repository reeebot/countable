import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getSearchDrinkProductsQueryKey,
  useSearchDrinkProducts,
  type DrinkSearchProduct,
} from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  formatStandardDrinkCount,
  isDrinkDetails,
  localDayKey,
  standardDrinkEquivalent,
  standardDrinkEquivalentFromDetails,
  timestampForLocalDayAtTime,
  type DrinkDetails,
  type DrinkContextTag,
  type DrinkContextTagDefinition,
  type DrinkEntry,
  type SavedDrink,
  type VolumeUnit,
} from '@/lib/drink-data';
import { useColors } from '@/hooks/useColors';

type AppColors = ReturnType<typeof useColors>;

function catalogueCategoryLabel(product: DrinkSearchProduct): string {
  if (product.category === 'wine') return 'Typical wine style';
  return product.category === 'beer' ? 'Beer' : 'Liquor';
}

function catalogueAbvLabel(product: DrinkSearchProduct): string {
  if (product.alcoholPercent === null) return 'ABV not listed';
  const percent = product.alcoholPercent.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
  if (!product.abvIsEstimate) return `${percent}% ABV`;

  const range =
    product.abvMin === product.abvMax
      ? ''
      : ` · ${product.abvMin}–${product.abvMax}% range`;
  return `${percent}% typical ABV${range}`;
}

function formatLocalTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function formatHistoricalDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

type Props = {
  colors: AppColors;
  onCancel: () => void;
  onLog: (
    drink: DrinkDetails,
    contextTags: DrinkContextTag[],
    timestamp?: number,
  ) => void;
  onSave: (drink: DrinkDetails) => void;
  initialDetails: DrinkDetails | null;
  savedDrinks: SavedDrink[];
  contextTagDefinitions: DrinkContextTagDefinition[];
  initialDrink?: SavedDrink;
  initialEntry?: DrinkEntry;
  initialLogTimestamp?: number;
  currentDayTotal?: number;
  onUpdate?: (drink: DrinkDetails) => void;
  savedDrinkSaveFailed?: boolean;
  onRetrySavedDrinkSave?: () => void;
  onUpdateEntry?: (
    drink: DrinkDetails,
    contextTags: DrinkContextTag[],
  ) => void;
};

export function DrinkEditor({
  colors,
  onCancel,
  onLog,
  onSave,
  initialDetails,
  savedDrinks,
  contextTagDefinitions,
  initialDrink,
  initialEntry,
  initialLogTimestamp,
  currentDayTotal,
  onUpdate,
  savedDrinkSaveFailed = false,
  onRetrySavedDrinkSave,
  onUpdateEntry,
}: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(
    initialDrink?.name ?? initialEntry?.name ?? initialDetails?.name ?? '',
  );
  const [alcoholPercent, setAlcoholPercent] = useState(
    initialDrink
      ? String(initialDrink.alcoholPercent)
      : initialEntry?.alcoholPercent !== null && initialEntry?.alcoholPercent !== undefined
        ? String(initialEntry.alcoholPercent)
        : initialDetails?.alcoholPercent.toString() ?? '',
  );
  const [volume, setVolume] = useState(
    initialDrink
      ? String(initialDrink.volume)
      : initialEntry?.volume !== null && initialEntry?.volume !== undefined
        ? String(initialEntry.volume)
        : initialDetails?.volume.toString() ?? '',
  );
  const [unit, setUnit] = useState<VolumeUnit>(
    initialDrink?.unit ??
      initialEntry?.unit ??
      initialDetails?.unit ??
      'fl oz',
  );
  const [showSavedDrinks, setShowSavedDrinks] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [historicalTime, setHistoricalTime] = useState(
    initialLogTimestamp === undefined
      ? ''
      : formatLocalTime(initialLogTimestamp),
  );
  const [historicalTimeError, setHistoricalTimeError] = useState<string | null>(
    null,
  );
  const [catalogueAbvUnavailable, setCatalogueAbvUnavailable] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [activeProductSearch, setActiveProductSearch] = useState('');
  const [caloriesPer100Ml, setCaloriesPer100Ml] = useState<number | null>(
    initialDrink?.caloriesPer100Ml ??
      initialEntry?.caloriesPer100Ml ??
      initialDetails?.caloriesPer100Ml ??
      null,
  );
  const [nutritionSourceName, setNutritionSourceName] = useState<string | null>(
    initialDrink?.caloriesPer100Ml != null
      ? initialDrink.name
      : initialEntry?.caloriesPer100Ml != null
        ? initialEntry.name
      : initialDetails?.caloriesPer100Ml != null
        ? initialDetails.name
        : null,
  );
  const [contextTags, setContextTags] = useState<DrinkContextTag[]>(
    initialEntry?.contextTags ?? [],
  );
  const [showContextTags, setShowContextTags] = useState(
    Boolean(initialEntry?.contextTags?.length),
  );
  const normalizedProductSearch = productSearch.trim().replace(/\s+/g, ' ');
  const hasCurrentSearch =
    normalizedProductSearch.length >= 2 &&
    normalizedProductSearch === activeProductSearch;
  useEffect(() => {
    const timeout = setTimeout(() => {
      setActiveProductSearch(normalizedProductSearch);
    }, 300);
    return () => clearTimeout(timeout);
  }, [normalizedProductSearch]);
  const onlineSearch = useSearchDrinkProducts(
    { q: activeProductSearch },
    {
      query: {
        queryKey: getSearchDrinkProductsQueryKey({ q: activeProductSearch }),
        enabled: activeProductSearch.length >= 2,
        staleTime: 5 * 60 * 1000,
        retry: false,
      },
    },
  );
  const isSearchPending =
    normalizedProductSearch.length >= 2 &&
    (!hasCurrentSearch || onlineSearch.isFetching);
  const selectedCaloriesPer100Ml = caloriesPer100Ml;
  const isEditingSavedDrink = Boolean(initialDrink);
  const isEditingLoggedEntry = Boolean(initialEntry);
  const isEditing = isEditingSavedDrink || isEditingLoggedEntry;
  const previewCandidate = {
    name: name.trim(),
    alcoholPercent: Number(alcoholPercent.trim().replace(',', '.') || 'NaN'),
    volume: Number(volume.trim().replace(',', '.') || 'NaN'),
    unit,
  };
  const hasValidLoggedEntryPreview =
    isEditingLoggedEntry && isDrinkDetails(previewCandidate);
  const editedDrinkContribution = hasValidLoggedEntryPreview
    ? standardDrinkEquivalentFromDetails(previewCandidate)
    : null;
  const currentDrinkContribution = initialEntry
    ? standardDrinkEquivalent(initialEntry)
    : null;
  const projectedDayTotal =
    currentDayTotal !== undefined &&
    currentDrinkContribution !== null &&
    editedDrinkContribution !== null
      ? Math.max(
          0,
          currentDayTotal - currentDrinkContribution + editedDrinkContribution,
        )
      : null;
  const availableContextTags = contextTagDefinitions.filter(
    (tag) => tag.isActive || contextTags.includes(tag.value),
  );

  function selectSavedDrink(drink: SavedDrink) {
    setName(drink.name);
    setAlcoholPercent(drink.alcoholPercent.toString());
    setVolume(drink.volume.toString());
    setUnit(drink.unit);
    setCaloriesPer100Ml(drink.caloriesPer100Ml ?? null);
    setNutritionSourceName(
      drink.caloriesPer100Ml != null ? drink.name : null,
    );
    setFormError(null);
    setShowSavedDrinks(false);
  }

  function selectCatalogueProduct(product: DrinkSearchProduct) {
    const brand = product.brand?.trim();
    const productName =
      product.abvIsEstimate
        ? `${product.name} (typical)`
        : brand &&
            !product.name.toLocaleLowerCase().includes(brand.toLocaleLowerCase())
          ? `${brand} ${product.name}`
          : product.name;
    setName(productName);
    setAlcoholPercent(product.alcoholPercent?.toString() ?? '');
    setCatalogueAbvUnavailable(product.alcoholPercent === null);
    setVolume(product.volumeMl === null ? '' : product.volumeMl.toString());
    setUnit(product.volumeMl === null ? 'fl oz' : 'ml');
    setCaloriesPer100Ml(null);
    setNutritionSourceName(null);
    setFormError(null);
    setProductSearch('');
    setActiveProductSearch('');
  }

  function updateDrinkName(nextName: string) {
    setName(nextName);
    if (
      nutritionSourceName &&
      nextName.trim().toLocaleLowerCase() !==
        nutritionSourceName.trim().toLocaleLowerCase()
    ) {
      setCaloriesPer100Ml(null);
      setNutritionSourceName(null);
    }
  }

  function readDetails(): DrinkDetails | null {
    if (!alcoholPercent.trim() || !volume.trim()) {
      setFormError('Enter a name, an ABV from 0 to 100%, and a size greater than zero.');
      return null;
    }
    const drink = {
      name: name.trim(),
      alcoholPercent: Number(alcoholPercent.replace(',', '.')),
      volume: Number(volume.replace(',', '.')),
      unit,
      caloriesPer100Ml: selectedCaloriesPer100Ml,
    };
    if (!isDrinkDetails(drink)) {
      setFormError('Enter a name, an ABV from 0 to 100%, and a size greater than zero.');
      return null;
    }
    setFormError(null);
    return drink;
  }

  function readHistoricalTimestamp(): number | undefined | null {
    if (initialLogTimestamp === undefined) return undefined;
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(historicalTime.trim());
    if (!match) {
      setHistoricalTimeError('Enter a time in 24-hour format, such as 20:30.');
      return null;
    }
    const timestamp = timestampForLocalDayAtTime(
      initialLogTimestamp,
      Number(match[1]),
      Number(match[2]),
    );
    if (timestamp === null) {
      setHistoricalTimeError('That time could not be added to the selected day.');
      return null;
    }
    setHistoricalTimeError(null);
    return timestamp;
  }

  const webInsets = Platform.OS === 'web';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: webInsets ? 85 : insets.top + 18,
            paddingBottom: Math.max(insets.bottom, webInsets ? 34 : 0) + 28,
          },
        ]}
        bottomOffset={96}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isEditing ? 'Cancel editing drink' : 'Cancel adding a drink'}
          testID={isEditing ? 'cancel-edit-drink' : 'cancel-add-drink'}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.55 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={19} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>
            Back
          </Text>
        </Pressable>

        <Text style={[styles.kicker, { color: colors.mutedForeground }]}>
          {isEditingSavedDrink
            ? 'SAVED DRINK'
            : isEditingLoggedEntry
              ? 'LOGGED DRINK'
              : 'YOUR DRINK'}
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {isEditing ? 'Edit the details.' : 'Add the details.'}
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {isEditingSavedDrink
            ? 'Update the name, alcohol percentage, or serving size. Drinks already logged keep their original details.'
            : isEditingLoggedEntry
              ? 'Correct this entry’s name, alcohol percentage, or serving size. Its original date and time will stay the same.'
              : 'Include the name, alcohol percentage, and serving size. You can save it to find and log again later.'}
        </Text>

        {initialLogTimestamp !== undefined && !isEditing && (
          <View
            style={[
              styles.historicalLogCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            testID="historical-log-date"
          >
            <View style={styles.historicalLogCopy}>
              <Text style={[styles.label, { color: colors.foreground }]}>
                Add to previous day
              </Text>
              <Text style={[styles.historicalLogDate, { color: colors.primary }]}>
                {formatHistoricalDate(initialLogTimestamp)}
              </Text>
              <Text style={[styles.historicalLogHint, { color: colors.mutedForeground }]}>
                Enter the local time for this drink.
              </Text>
            </View>
            <View style={styles.historicalTimeField}>
              <Text style={[styles.historicalTimeLabel, { color: colors.mutedForeground }]}>
                Time
              </Text>
              <TextInput
                accessibilityLabel="Drink time in 24-hour local time"
                testID="historical-drink-time"
                value={historicalTime}
                onChangeText={(value) => {
                  const digits = value.replace(/\D/g, '').slice(0, 4);
                  setHistoricalTime(
                    digits.length > 2
                      ? `${digits.slice(0, 2)}:${digits.slice(2)}`
                      : digits,
                  );
                  setHistoricalTimeError(null);
                }}
                placeholder="20:30"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                maxLength={5}
                style={[
                  styles.historicalTimeInput,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
              <Text style={[styles.historicalTimeHint, { color: colors.mutedForeground }]}>
                24-hour
              </Text>
            </View>
            {historicalTimeError && (
              <Text style={[styles.error, { color: colors.destructive }]}>
                {historicalTimeError}
              </Text>
            )}
          </View>
        )}

        <View style={styles.productSearchSection}>
          <View style={styles.productSearchHeading}>
            <View style={styles.productSearchHeadingCopy}>
              <Text style={[styles.label, { color: colors.foreground }]}>
                Search alcoholic drinks
              </Text>
              <Text style={[styles.productSearchCaption, { color: colors.mutedForeground }]}>
                Search local beer, liquor, and typical wine styles as you type.
              </Text>
            </View>
            <Feather name="database" size={17} color={colors.primary} />
          </View>
          <View style={styles.productSearchRow}>
            <View
              style={[
                styles.productSearchInputWrap,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                accessibilityLabel="Search the local alcohol catalogue as you type"
                testID="search-online-drinks-input"
                value={productSearch}
                onChangeText={(value) => {
                  setProductSearch(value);
                }}
                placeholder="Beer, liquor, or wine style"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                blurOnSubmit
                autoCapitalize="words"
                style={[styles.productSearchInput, { color: colors.foreground }]}
              />
            </View>
          </View>
          {isSearchPending && (
            <View style={styles.productSearchStatus}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.productSearchMessage, { color: colors.mutedForeground }]}>
                Searching local alcohol catalogue…
              </Text>
            </View>
          )}
          {hasCurrentSearch && onlineSearch.isError && (
            <Text accessibilityRole="alert" style={[styles.productSearchMessage, { color: colors.destructive }]}>
              The local alcohol catalogue could not be searched.
            </Text>
          )}
          {hasCurrentSearch && onlineSearch.isSuccess && (
            <View
              style={[
                styles.onlineResults,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {onlineSearch.data.products.length === 0 ? (
                <Text style={[styles.productSearchMessage, { color: colors.mutedForeground }]}>
                  No alcoholic drinks found for “{activeProductSearch}”.
                </Text>
              ) : (
                <>
                  <Text style={[styles.resultsFor, { color: colors.mutedForeground }]}>
                    RESULTS FOR “{activeProductSearch.toLocaleUpperCase()}”
                  </Text>
                  <ScrollView
                    testID="online-drink-search-results"
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={onlineSearch.data.products.length > 4}
                    style={styles.onlineResultsScroll}
                  >
                    {onlineSearch.data.products.map((product, index) => (
                      <Pressable
                        key={product.code}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${product.name}${product.brand ? ` by ${product.brand}` : ''}, ${catalogueAbvLabel(product)}`}
                        testID={`select-online-drink-${product.code}`}
                        onPress={() => selectCatalogueProduct(product)}
                        style={({ pressed }) => [
                          styles.onlineProductRow,
                          index < onlineSearch.data.products.length - 1 && {
                            borderBottomColor: colors.border,
                            borderBottomWidth: StyleSheet.hairlineWidth,
                          },
                          { opacity: pressed ? 0.6 : 1 },
                        ]}
                      >
                        <View style={styles.onlineProductCopy}>
                          <Text
                            numberOfLines={1}
                            style={[styles.savedPickerText, { color: colors.foreground }]}
                          >
                            {product.name}
                          </Text>
                          <Text style={[styles.productSearchCaption, { color: colors.mutedForeground }]}>
                            {[
                              product.brand,
                              catalogueCategoryLabel(product),
                              catalogueAbvLabel(product),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                        <Feather name="arrow-down-left" size={15} color={colors.primary} />
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>
          )}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open AlcoholContents product data"
            onPress={() => {
              void Linking.openURL('https://www.alcoholcontents.com/');
            }}
            style={styles.attribution}
          >
            <Text style={[styles.attributionText, { color: colors.mutedForeground }]}>
              AlcoholContents.com
            </Text>
            <Feather name="external-link" size={12} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {!isEditing && savedDrinks.length > 0 && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Saved drinks
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose a saved drink"
              accessibilityState={{ expanded: showSavedDrinks }}
              testID="saved-drink-picker-toggle"
              onPress={() => setShowSavedDrinks((isOpen) => !isOpen)}
              style={({ pressed }) => [
                styles.savedPickerButton,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.savedPickerText, { color: colors.foreground }]}>
                Choose a saved drink
              </Text>
              <Feather
                name={showSavedDrinks ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
            {showSavedDrinks && (
              <View
                style={[
                  styles.savedPickerMenu,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <ScrollView
                  testID="saved-drink-picker-list"
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={savedDrinks.length > 4}
                  style={styles.savedPickerScroll}
                >
                  {savedDrinks.map((drink, index) => (
                    <Pressable
                      key={drink.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${drink.name}, ${drink.alcoholPercent}% ABV`}
                      testID={`select-saved-drink-${drink.id}`}
                      onPress={() => selectSavedDrink(drink)}
                      style={({ pressed }) => [
                        styles.savedPickerOption,
                        index < savedDrinks.length - 1 && {
                          borderBottomColor: colors.border,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                        },
                        { opacity: pressed ? 0.6 : 1 },
                      ]}
                    >
                      <View style={styles.savedPickerCopy}>
                        <Text
                          numberOfLines={1}
                          style={[styles.savedPickerText, { color: colors.foreground }]}
                        >
                          {drink.name}
                        </Text>
                        <Text
                          style={[
                            styles.savedPickerDetails,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {drink.volume} {drink.unit} · {drink.alcoholPercent}% ABV
                        </Text>
                      </View>
                      <Feather name="arrow-down-left" size={15} color={colors.primary} />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            Drink name
          </Text>
          <TextInput
            accessibilityLabel="Drink name"
            testID="drink-name-input"
            value={name}
            onChangeText={updateDrinkName}
            placeholder="e.g. Pale ale"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            returnKeyType="next"
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />
        </View>

        <View style={styles.fieldsRow}>
          <View style={[styles.field, styles.halfField]}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Alcohol
            </Text>
            <View
              style={[
                styles.inputWithSuffix,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <TextInput
                accessibilityLabel="Alcohol percentage"
                testID="drink-abv-input"
                value={alcoholPercent}
                onChangeText={(value) => {
                  setAlcoholPercent(value);
                  if (value.trim()) setCatalogueAbvUnavailable(false);
                }}
                placeholder="5"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                style={[styles.numericInput, { color: colors.foreground }]}
              />
              <Text style={[styles.suffix, { color: colors.mutedForeground }]}>
                % ABV
              </Text>
            </View>
            {catalogueAbvUnavailable && !alcoholPercent.trim() && (
              <Text
                accessibilityRole="text"
                testID="catalogue-abv-unavailable"
                style={[styles.productSearchCaption, { color: colors.mutedForeground }]}
              >
                This catalogue entry has no usable alcohol-by-volume value. Enter an ABV to calculate drink totals.
              </Text>
            )}
          </View>
          <View style={[styles.field, styles.halfField]}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Serving size
            </Text>
            <View
              style={[
                styles.inputWithSuffix,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <TextInput
                accessibilityLabel="Serving size"
                testID="drink-volume-input"
                value={volume}
                onChangeText={setVolume}
                placeholder={unit === 'fl oz' ? '12' : '355'}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                style={[styles.numericInput, { color: colors.foreground }]}
              />
            </View>
          </View>
        </View>

        <View style={styles.unitRow}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            Size unit
          </Text>
          <View
            style={[
              styles.unitPicker,
              { backgroundColor: colors.secondary },
            ]}
          >
            {(['fl oz', 'ml'] as const).map((option) => {
              const selected = option === unit;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option === 'fl oz' ? 'Fluid ounces' : 'Milliliters'}
                  testID={`unit-${option}`}
                  onPress={() => {
                    if (option === unit) return;
                    const currentVolume = Number(volume.replace(',', '.'));
                    if (Number.isFinite(currentVolume) && currentVolume > 0) {
                      const converted =
                        unit === 'fl oz'
                          ? currentVolume * 29.5735
                          : currentVolume / 29.5735;
                      setVolume(converted.toFixed(1));
                    }
                    setUnit(option);
                  }}
                  style={[
                    styles.unitOption,
                    selected && { backgroundColor: colors.card },
                  ]}
                >
                  <Text
                    style={[
                      styles.unitOptionText,
                      {
                        color: selected
                          ? colors.foreground
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {!isEditingSavedDrink && (
          <View
            style={[
              styles.contextSection,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Optional context, ${contextTags.length} selected`}
              accessibilityState={{ expanded: showContextTags }}
              testID="context-tags-toggle"
              onPress={() => setShowContextTags((open) => !open)}
              style={styles.contextToggle}
            >
              <View style={styles.contextToggleCopy}>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  Context <Text style={{ color: colors.mutedForeground }}>(optional)</Text>
                </Text>
                <Text style={[styles.contextCaption, { color: colors.mutedForeground }]}>
                  {contextTags.length > 0
                    ? `${contextTags.length} selected`
                    : 'Note a setting or reason'}
                </Text>
              </View>
              <Feather
                name={showContextTags ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
            {showContextTags && (
              <View style={styles.contextTagList}>
                {availableContextTags.map((option) => {
                  const selected = contextTags.includes(option.value);
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${option.label}${option.isActive ? '' : ', retired label'}`}
                      accessibilityState={{ checked: selected }}
                      testID={`context-tag-${option.value}`}
                      onPress={() =>
                        setContextTags((current) =>
                          selected
                            ? current.filter((tag) => tag !== option.value)
                            : [...current, option.value],
                        )
                      }
                      style={[
                        styles.contextTagChip,
                        {
                          backgroundColor: selected
                            ? colors.primary
                            : colors.secondary,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.contextTagText,
                          {
                            color: selected
                              ? colors.primaryForeground
                              : colors.foreground,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {isEditingLoggedEntry && currentDayTotal !== undefined && (
          <View
            testID="logged-drink-total-preview"
            style={[
              styles.totalPreview,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.totalPreviewTitle, { color: colors.foreground }]}>
              DAILY STANDARD DRINKS
            </Text>
            <View style={styles.totalPreviewRow}>
              <Text style={[styles.totalPreviewLabel, { color: colors.mutedForeground }]}>
                This drink
              </Text>
              <Text
                testID="edited-drink-equivalent"
                style={[styles.totalPreviewValue, { color: colors.foreground }]}
              >
                {editedDrinkContribution === null
                  ? '—'
                  : formatStandardDrinkCount(editedDrinkContribution)}
              </Text>
            </View>
            <View style={styles.totalPreviewRow}>
              <Text style={[styles.totalPreviewLabel, { color: colors.mutedForeground }]}>
                Current day total
              </Text>
              <Text
                testID="current-day-total"
                style={[styles.totalPreviewValue, { color: colors.foreground }]}
              >
                {formatStandardDrinkCount(currentDayTotal)}
              </Text>
            </View>
            <View
              style={[
                styles.totalPreviewRow,
                styles.projectedTotalRow,
                { borderTopColor: colors.border },
              ]}
            >
              <Text style={[styles.totalPreviewLabel, { color: colors.primary }]}>
                After saving
              </Text>
              <Text
                testID="projected-day-total"
                style={[styles.totalPreviewValue, { color: colors.primary }]}
              >
                {projectedDayTotal === null
                  ? '—'
                  : formatStandardDrinkCount(projectedDayTotal)}
              </Text>
            </View>
            {editedDrinkContribution === null && (
              <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>
                Enter a valid name, ABV, and serving size to preview the change.
              </Text>
            )}
          </View>
        )}

        {formError && (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
            {formError}
          </Text>
        )}

        {savedDrinkSaveFailed && (
          <View
            style={[
              styles.saveErrorRow,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              accessibilityRole="alert"
              style={[styles.saveErrorText, { color: colors.destructive }]}
            >
              Couldn&apos;t replace the saved drink. Your edits are still here.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry replacing the saved drink"
              testID="retry-replace-saved-drink"
              onPress={onRetrySavedDrinkSave}
              hitSlop={8}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {isEditing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isEditingLoggedEntry
                ? 'Save changes to logged drink'
                : 'Save changes to saved drink'
            }
            testID={isEditingLoggedEntry ? 'update-logged-drink' : 'update-saved-drink'}
            onPress={() => {
              const drink = readDetails();
              if (drink) {
                if (isEditingLoggedEntry) onUpdateEntry?.(drink, contextTags);
                else onUpdate?.(drink);
              }
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.84 : 1,
              },
            ]}
          >
            <Feather name="check" size={19} color={colors.primaryForeground} />
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              Save changes
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                initialLogTimestamp === undefined
                  ? 'Log drink today'
                  : `Log drink on ${localDayKey(initialLogTimestamp)}`
              }
              testID="save-drink-entry"
              onPress={() => {
                const drink = readDetails();
                if (!drink) return;
                const timestamp = readHistoricalTimestamp();
                if (timestamp !== null) onLog(drink, contextTags, timestamp);
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
            >
              <Feather name="plus" size={19} color={colors.primaryForeground} />
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                Log drink
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save drink for later"
              testID="save-drink-preset"
              onPress={() => {
                const drink = readDetails();
                if (drink) onSave(drink);
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="bookmark" size={16} color={colors.primary} />
              <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                Save for later
              </Text>
            </Pressable>
          </>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  backButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginBottom: 25,
  },
  backText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  kicker: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    letterSpacing: -0.8,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 26,
  },
  historicalLogCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    padding: 13,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 22,
  },
  historicalLogCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  historicalLogDate: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  historicalLogHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 15,
  },
  historicalTimeField: {
    width: 88,
    gap: 3,
  },
  historicalTimeLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  historicalTimeInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 9,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    textAlign: 'center',
  },
  historicalTimeHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    textAlign: 'center',
  },
  productSearchSection: {
    gap: 10,
    marginBottom: 22,
  },
  productSearchHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productSearchHeadingCopy: {
    gap: 3,
  },
  productSearchCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  productSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  productSearchInputWrap: {
    minHeight: 50,
    flex: 1,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  productSearchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  productSearchMessage: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  productSearchStatus: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineResults: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingTop: 12,
  },
  onlineResultsScroll: {
    maxHeight: 236,
  },
  resultsFor: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 2,
  },
  onlineProductRow: {
    minHeight: 58,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  onlineProductCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  attribution: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
  },
  attributionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 14,
  },
  savedPickerButton: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedPickerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  savedPickerMenu: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    overflow: 'hidden',
  },
  savedPickerScroll: {
    maxHeight: 220,
  },
  savedPickerOption: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 10,
  },
  savedPickerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  savedPickerDetails: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  field: {
    gap: 8,
    marginBottom: 18,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  input: {
    height: 54,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 15,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  inputWithSuffix: {
    height: 54,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  numericInput: {
    flex: 1,
    padding: 0,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    minWidth: 0,
  },
  suffix: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 1,
    marginBottom: 20,
  },
  unitPicker: {
    borderRadius: 14,
    padding: 4,
    flexDirection: 'row',
    gap: 3,
  },
  unitOption: {
    minWidth: 56,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  unitOptionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  contextSection: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 18,
  },
  contextToggle: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  contextToggleCopy: {
    flex: 1,
    gap: 3,
  },
  contextCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 15,
  },
  contextTagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  contextTagChip: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextTagText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  totalPreview: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    gap: 11,
    marginBottom: 18,
  },
  totalPreviewTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.1,
  },
  totalPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  projectedTotalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  totalPreviewLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  totalPreviewValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  previewHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  error: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  saveErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  saveErrorText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 52,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
