import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type SaleHeaderProps = {
  /** Position of the sale being loaded within today's run, 1-based. */
  saleNumber: number;
  /** Omitted while the driver has no truck assigned for today. */
  truckCode?: string;
  /** Sales still waiting in the offline queue. Hidden when zero. */
  queuedCount: number;
  testID?: string;
};

/**
 * Dark bar at the top of the New Sale screen: which sale of the day this is,
 * on which truck, and how many are still stuck on the phone. All three come
 * from state the app already holds (day summary, truck context, offline
 * queue) — this component only shows them.
 */
export function SaleHeader({ saleNumber, truckCode, queuedCount, testID }: SaleHeaderProps) {
  const title = truckCode ? `VENTA ${saleNumber} · ${truckCode}` : `VENTA ${saleNumber}`;

  return (
    <View testID={testID} style={styles.bar}>
      <Text style={styles.title}>{title}</Text>

      {queuedCount > 0 && (
        <View testID="sale-header-queued" style={styles.queued}>
          <Ionicons name="cloud-upload-outline" size={14} color={colors.surface} />
          <Text style={styles.queuedLabel}>{queuedCount} EN COLA</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    color: colors.surface,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.7,
  },
  queued: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  queuedLabel: {
    color: colors.surface,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    letterSpacing: 0.5,
  },
});
