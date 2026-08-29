import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';

export type ExpenseHeaderProps = {
  /** Renglon chico de arriba: que pantalla es y en que camion. */
  eyebrow: string;
  amount: number;
  /**
   * Cuando viene, el titulo ocupa el lugar principal y el importe pasa a la
   * derecha en chico. Es la diferencia entre "estoy cargando un gasto y de
   * paso veo cuanto llevo" y "esto es lo que gaste hoy".
   */
  title?: string;
  amountLabel?: string;
  subtitle?: string;
  testID?: string;
};

/** Barra oscura de las pantallas de gasto, en sus dos disposiciones. */
export function ExpenseHeader({
  eyebrow,
  amount,
  title,
  amountLabel,
  subtitle,
  testID,
}: ExpenseHeaderProps) {
  const amountLeads = !title;

  return (
    <View style={styles.bar} testID={testID}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>

      <View style={amountLeads ? styles.stacked : styles.side}>
        {title ? <Text style={styles.title}>{title}</Text> : null}

        <View style={amountLeads ? undefined : styles.amountBlock}>
          <Text
            style={amountLeads ? styles.amountLead : styles.amountTrailing}
            testID={testID ? `${testID}-amount` : undefined}
          >
            {formatArs(amount)}
          </Text>
          {amountLabel ? <Text style={styles.amountLabel}>{amountLabel}</Text> : null}
        </View>
      </View>

      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.surface,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.7,
    opacity: 0.85,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  stacked: {
    flexDirection: 'row',
  },
  amountBlock: {
    alignItems: 'flex-end',
  },
  title: {
    color: colors.surface,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  amountLead: {
    color: colors.surface,
    fontSize: 32,
    fontWeight: typography.weights.bold,
  },
  amountTrailing: {
    color: colors.surface,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  amountLabel: {
    color: colors.surface,
    fontSize: typography.sizes.xs,
    opacity: 0.8,
  },
  subtitle: {
    color: colors.surface,
    fontSize: typography.sizes.xs,
    opacity: 0.85,
  },
});
