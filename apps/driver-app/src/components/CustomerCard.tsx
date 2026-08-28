import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type CustomerCardProps = {
  /** Absent until the driver picks someone from the customer picker. */
  name?: string;
  /** The customer's type, resolved from the directory — never driver input. */
  subtitle?: string;
  onPress: () => void;
  testID?: string;
};

/**
 * The customer slot at the top of the New Sale screen. It is a single
 * pressable target that opens the picker: the driver never types a name and
 * never chooses a customer type by hand, because the type is what selects the
 * price list. Both values are owned by the admin-side directory.
 */
export function CustomerCard({ name, subtitle, onPress, testID }: CustomerCardProps) {
  const picked = Boolean(name);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={styles.card}
    >
      <Ionicons name="person-outline" size={22} color={colors.surface} />

      <View style={styles.text}>
        <Text style={styles.name}>{picked ? name : 'Elegí un cliente'}</Text>
        <Text style={styles.subtitle}>{picked ? subtitle : 'Tocá para buscarlo'}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={colors.surface} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.primaryLight,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  text: {
    flex: 1,
  },
  name: {
    color: colors.surface,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  subtitle: {
    color: colors.surface,
    fontSize: typography.sizes.xs,
    opacity: 0.8,
    marginTop: 2,
  },
});
