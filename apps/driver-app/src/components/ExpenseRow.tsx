import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExpenseCategory } from '@distribuidor/shared';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';

export type ExpenseRowProps = {
  category: ExpenseCategory;
  amount: number;
  createdAt: string;
  note?: string;
  receiptRef?: string;
  testID?: string;
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  combustible: 'Combustible',
  peaje: 'Peaje',
  comida: 'Comida',
  mantenimiento: 'Mantenimiento',
  varios: 'Varios',
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** Hora local, mismo criterio que el resto de las pantallas del chofer. */
const formatTime = (iso: string): string => {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Un gasto del dia. Cuando le falta el ticket lo dice con palabras y se marca
 * en ambar: la ausencia de un tilde es facil de no ver, y el chofer necesita
 * enterarse ahora, no cuando administracion le reclame el respaldo.
 */
export function ExpenseRow({
  category,
  amount,
  createdAt,
  note,
  receiptRef,
  testID,
}: ExpenseRowProps) {
  const hasReceipt = Boolean(receiptRef);
  const detail = note ? `${formatTime(createdAt)} · ${note}` : formatTime(createdAt);

  return (
    <View style={[styles.row, !hasReceipt && styles.rowMissing]} testID={testID}>
      <View style={styles.text}>
        <Text style={styles.title}>
          {EXPENSE_CATEGORY_LABELS[category]} · {formatArs(amount)}
        </Text>
        <Text style={styles.detail} testID={testID ? `${testID}-detail` : undefined}>
          {detail}
        </Text>
        {!hasReceipt && <Text style={styles.missing}>Falta el comprobante</Text>}
      </View>

      {hasReceipt && (
        <Ionicons
          name="checkmark"
          size={18}
          color={colors.success}
          testID={testID ? `${testID}-has-receipt` : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowMissing: {
    borderLeftColor: colors.warning,
    borderLeftWidth: 4,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  detail: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  missing: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.warning,
    marginTop: 2,
  },
});
