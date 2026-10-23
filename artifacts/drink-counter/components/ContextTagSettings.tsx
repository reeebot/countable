import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  addDrinkContextTag,
  createDrinkId,
  renameDrinkContextTag,
  restoreDrinkContextTag,
  retireDrinkContextTag,
  type DrinkContextTagDefinition,
} from '@/lib/drink-data';
import { useColors } from '@/hooks/useColors';

type Props = {
  definitions: DrinkContextTagDefinition[];
  onSave: (definitions: DrinkContextTagDefinition[]) => Promise<void>;
  onClose: () => void;
};

export function ContextTagSettings({ definitions, onSave, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [newLabel, setNewLabel] = useState('');
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const activeTags = definitions.filter((tag) => tag.isActive);
  const retiredTags = definitions.filter((tag) => !tag.isActive);
  const webInsets = Platform.OS === 'web';

  async function saveDefinitions(next: DrinkContextTagDefinition[]) {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(next);
    } catch {
      const message = "Couldn't save your context labels. Try again.";
      setError(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function addLabel() {
    try {
      const next = addDrinkContextTag(
        definitions,
        newLabel,
        `custom-${createDrinkId()}`,
      );
      await saveDefinitions(next);
      setNewLabel('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid label.');
    }
  }

  async function renameLabel(value: string) {
    try {
      const next = renameDrinkContextTag(
        definitions,
        value,
        editingLabel,
        `custom-${createDrinkId()}`,
      );
      await saveDefinitions(next);
      setEditingValue(null);
      setEditingLabel('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid label.');
    }
  }

  async function retireLabel(value: string) {
    try {
      await saveDefinitions(retireDrinkContextTag(definitions, value));
    } catch {
      // saveDefinitions shows the persistence error inline.
    }
  }

  async function restoreLabel(value: string) {
    try {
      await saveDefinitions(restoreDrinkContextTag(definitions, value));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not restore label.');
    }
  }

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
        bottomOffset={70}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to drink history"
          testID="close-context-tag-settings"
          onPress={onClose}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.55 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={19} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
        </Pressable>

        <Text style={[styles.kicker, { color: colors.mutedForeground }]}>
          PREFERENCES
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Context labels
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Choose labels that fit your situations. Renaming creates a new label
          for future entries; past entries keep the wording they were saved with.
          Retired labels stay in your history, comparisons, and exports.
        </Text>

        <View
          style={[
            styles.addCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Add a label
          </Text>
          <View style={styles.addRow}>
            <TextInput
              accessibilityLabel="New context label"
              testID="new-context-label-input"
              value={newLabel}
              onChangeText={(value) => {
                setNewLabel(value);
                setError(null);
              }}
              placeholder="e.g. After work"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="sentences"
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={() => void addLabel()}
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add context label"
              testID="add-context-label"
              disabled={isSaving || !newLabel.trim()}
              onPress={() => void addLabel()}
              style={({ pressed }) => [
                styles.addButton,
                {
                  backgroundColor: colors.primary,
                  opacity: isSaving || !newLabel.trim() ? 0.5 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather name="plus" size={17} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View>

        <View style={styles.listSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Available for new entries
          </Text>
          <View
            style={[
              styles.tagCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {activeTags.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No active labels. Add or restore one to record context.
              </Text>
            ) : (
              activeTags.map((tag, index) => (
                <View
                  key={tag.value}
                  style={[
                    styles.tagRow,
                    index < activeTags.length - 1 && {
                      borderBottomColor: colors.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  {editingValue === tag.value ? (
                    <TextInput
                      accessibilityLabel={`Rename ${tag.label}`}
                      testID={`rename-context-label-input-${tag.value}`}
                      value={editingLabel}
                      onChangeText={(value) => {
                        setEditingLabel(value);
                        setError(null);
                      }}
                      autoFocus
                      autoCapitalize="sentences"
                      maxLength={60}
                      returnKeyType="done"
                      onSubmitEditing={() => void renameLabel(tag.value)}
                      style={[
                        styles.input,
                        styles.renameInput,
                        {
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                          color: colors.foreground,
                        },
                      ]}
                    />
                  ) : (
                    <Text style={[styles.tagLabel, { color: colors.foreground }]}>
                      {tag.label}
                    </Text>
                  )}
                  {editingValue === tag.value ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Save ${tag.label} label`}
                        testID={`save-context-label-${tag.value}`}
                        disabled={isSaving}
                        onPress={() => void renameLabel(tag.value)}
                        hitSlop={10}
                        style={styles.iconButton}
                      >
                        <Feather name="check" size={17} color={colors.primary} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Cancel label rename"
                        onPress={() => {
                          setEditingValue(null);
                          setEditingLabel('');
                          setError(null);
                        }}
                        hitSlop={10}
                        style={styles.iconButton}
                      >
                        <Feather name="x" size={17} color={colors.mutedForeground} />
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Rename ${tag.label}`}
                        testID={`edit-context-label-${tag.value}`}
                        onPress={() => {
                          setEditingValue(tag.value);
                          setEditingLabel(tag.label);
                          setError(null);
                        }}
                        hitSlop={10}
                        style={styles.iconButton}
                      >
                        <Feather name="edit-2" size={15} color={colors.mutedForeground} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Retire ${tag.label}`}
                        testID={`retire-context-label-${tag.value}`}
                        disabled={isSaving}
                        onPress={() => void retireLabel(tag.value)}
                        hitSlop={10}
                        style={styles.iconButton}
                      >
                        <Feather name="minus-circle" size={17} color={colors.destructive} />
                      </Pressable>
                    </>
                  )}
                </View>
              ))
            )}
          </View>
        </View>

        {retiredTags.length > 0 && (
          <View style={styles.listSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Retired · kept in history
            </Text>
            <View
              style={[
                styles.tagCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {retiredTags.map((tag, index) => (
                <View
                  key={tag.value}
                  style={[
                    styles.tagRow,
                    index < retiredTags.length - 1 && {
                      borderBottomColor: colors.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View style={styles.retiredCopy}>
                    <Text style={[styles.tagLabel, { color: colors.mutedForeground }]}>
                      {tag.label}
                    </Text>
                    <Text style={[styles.retiredCaption, { color: colors.mutedForeground }]}>
                      Not offered on new entries
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Restore ${tag.label}`}
                    testID={`restore-context-label-${tag.value}`}
                    disabled={isSaving}
                    onPress={() => void restoreLabel(tag.value)}
                    hitSlop={10}
                    style={styles.restoreButton}
                  >
                    <Text style={[styles.restoreText, { color: colors.primary }]}>
                      Restore
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        {error && (
          <Text
            accessibilityRole="alert"
            testID="context-label-error"
            style={[styles.error, { color: colors.destructive }]}
          >
            {error}
          </Text>
        )}
        <Text style={[styles.localNote, { color: colors.mutedForeground }]}>
          These labels are saved on this device.
        </Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 22,
    gap: 14,
  },
  backButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingRight: 12,
  },
  backText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  kicker: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 4,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 29,
    letterSpacing: -0.8,
    marginTop: -8,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
    marginTop: -7,
    marginBottom: 3,
  },
  addCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  input: {
    flex: 1,
    minHeight: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listSection: {
    gap: 9,
  },
  tagCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 13,
  },
  tagRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tagLabel: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  renameInput: {
    minWidth: 0,
  },
  iconButton: {
    width: 28,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 15,
  },
  retiredCopy: {
    flex: 1,
    gap: 3,
  },
  retiredCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  restoreButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  restoreText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  error: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
  },
  localNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});
