import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PaymentMethod } from '@distribuidor/shared';
import { Button } from './Button';
import type { SaleProblem } from '../services/dayProblems';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';

export type DayStatusCardProps = {
  problems: SaleProblem[];
  /** Ventas activas de hoy que el servidor ya recibio. */
  sentCount: number;
  onPressProblem: (problem: SaleProblem) => void;
  onResolve: () => void;
  testID?: string;
};

const PAYMENT_NAMES: Record<PaymentMethod, string> = {
  efectivo: 'efectivo',
  transferencia: 'transferencia',
  qr: 'QR',
  tarjeta: 'tarjeta',
};

const reasonFor = (problem: SaleProblem): string => {
  if (problem.kind === 'not-sent') {
    const attempts = problem.attempts ?? 0;
    return `No se pudo enviar · ${attempts} ${attempts === 1 ? 'intento' : 'intentos'}`;
  }

  const method = problem.paymentMethod ? PAYMENT_NAMES[problem.paymentMethod] : 'la venta';
  return `Falta el comprobante de la ${method}`;
};

/**
 * El estado de la jornada en una sola tarjeta, en una de sus dos caras.
 *
 * En verde no basta con decir "todo bien": lleva el detalle que respalda la
 * afirmacion (cuantas se enviaron, cuantas quedan en cola), porque un chofer
 * que no puede verificar el resumen termina revisando la lista igual.
 */
export function DayStatusCard({
  problems,
  sentCount,
  onPressProblem,
  onResolve,
  testID,
}: DayStatusCardProps) {
  const hasProblems = problems.length > 0;

  if (!hasProblems) {
    return (
      <View style={[styles.card, styles.cardOk]} testID={testID}>
        <View style={styles.headline}>
          <View style={[styles.badge, styles.badgeOk]}>
            <Ionicons name="checkmark" size={18} color={colors.surface} />
          </View>
          <View style={styles.headlineText}>
            <Text style={styles.title}>Todo en orden</Text>
            <Text style={styles.subtitle} testID="day-status-detail">
              {sentCount} {sentCount === 1 ? 'venta enviada' : 'ventas enviadas'} · nada en cola
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.cardProblem]} testID={testID}>
      <View style={styles.headline}>
        <View style={[styles.badge, styles.badgeProblem]}>
          <Ionicons name="alert" size={18} color={colors.surface} />
        </View>
        <View style={styles.headlineText}>
          <Text style={styles.title}>
            {problems.length} {problems.length === 1 ? 'venta con problema' : 'ventas con problema'}
          </Text>
          <Text style={styles.subtitle}>Resolvelas antes de cerrar el día</Text>
        </View>
      </View>

      {problems.map((problem) => (
        <Pressable
          key={`${problem.kind}-${problem.id}`}
          accessibilityRole="button"
          onPress={() => onPressProblem(problem)}
          style={styles.problemRow}
          testID={`day-status-problem-${problem.id}`}
        >
          <View style={styles.problemText}>
            <Text style={styles.problemTitle}>
              {problem.customerName}
              {problem.total !== undefined ? ` · ${formatArs(problem.total)}` : ''}
            </Text>
            <Text
              style={styles.problemReason}
              testID={`day-status-problem-${problem.id}-reason`}
            >
              {reasonFor(problem)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.error} />
        </Pressable>
      ))}

      <Button label="Resolver ahora" onPress={onResolve} testID="day-status-resolve" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: spacing.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardOk: {
    borderLeftColor: colors.success,
    borderLeftWidth: 4,
  },
  cardProblem: {
    borderLeftColor: colors.error,
    borderLeftWidth: 4,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headlineText: {
    flex: 1,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOk: {
    backgroundColor: colors.success,
  },
  badgeProblem: {
    backgroundColor: colors.error,
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  problemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: '#FDF2F2',
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  problemText: {
    flex: 1,
  },
  problemTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  problemReason: {
    fontSize: typography.sizes.xs,
    color: colors.error,
    marginTop: 2,
  },
});
