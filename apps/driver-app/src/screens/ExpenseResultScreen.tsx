import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { ExpenseRecord } from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EXPENSE_CATEGORY_LABELS, ExpenseRow } from '../components/ExpenseRow';
import { ExpenseHeader } from '../components/ExpenseHeader';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { LoadingRow } from '../components/LoadingRow';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionLabel } from '../components/SectionLabel';
import { SummaryRow } from '../components/SummaryRow';
import { useAuth } from '../context/AuthContext';
import type { ExpensesStackParamList } from '../navigation/ExpensesStack';
import { summarizeExpenses, todayExpensesOf } from '../services/expenseTotals';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';
import { formatJornada } from '../utils/jornada';

type ExpenseResultNavigationProp = NativeStackNavigationProp<
  ExpensesStackParamList,
  'ExpenseResult'
>;

/**
 * Lo que paso con el gasto recien cargado, y como viene el dia.
 *
 * A diferencia de la venta, un gasto no tiene cola offline: si `POST /expenses`
 * falla, el chofer se queda en el formulario con el error. Por eso esta
 * pantalla solo existe en su version exitosa -- llegar aca ya significa que el
 * servidor lo tiene.
 */
export function ExpenseResultScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<RouteProp<ExpensesStackParamList, 'ExpenseResult'>>();
  const navigation = useNavigation<ExpenseResultNavigationProp>();
  const { api } = useAuth();

  const saved = route.params;

  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get<ExpenseRecord[]>('/expenses/mine', { cache: 'no-store' });
      setExpenses(response);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudieron cargar tus gastos de hoy.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Se recarga cada vez que la pantalla vuelve al frente, no solo al montarse:
  // el chofer llega aca despues de cada gasto que carga, y una lista vieja le
  // haria dudar de si el ultimo se guardo.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  const summary = summarizeExpenses(expenses);
  const today = todayExpensesOf(expenses, new Date().toISOString().slice(0, 10));

  const countLine = [
    `${summary.todayCount} ${summary.todayCount === 1 ? 'gasto' : 'gastos'}`,
    ...(summary.missingReceiptCount > 0
      ? [
          `${summary.missingReceiptCount} sin comprobante`,
        ]
      : []),
  ].join(' · ');

  return (
    <ScreenContainer
      testID="expense-result-screen"
      scroll
      onRefresh={() => void load()}
      refreshing={loading}
      header={
        <ExpenseHeader
          testID="expense-result-header"
          eyebrow={`GASTOS · ${formatJornada(new Date())}`}
          amount={summary.todayTotal}
          subtitle={countLine}
        />
      }
    >
      <View style={styles.savedCard} testID="expense-result-saved">
        <View style={styles.savedBadge}>
          <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
        </View>
        <View style={styles.savedText}>
          <Text style={styles.savedTitle}>Gasto guardado</Text>
          <Text style={styles.savedDetail} testID="expense-result-saved-detail">
            {EXPENSE_CATEGORY_LABELS[saved.category]} · {formatArs(saved.amount)} ·{' '}
            {saved.hasReceipt ? 'con ticket' : 'sin ticket'}
          </Text>
        </View>
      </View>

      <Button
        label="Cargar otro gasto"
        onPress={() => navigation.navigate('Expenses')}
        testID="expense-result-new"
      />

      {error ? (
        <View style={styles.section}>
          <FeedbackBanner message={error} tone="error" />
        </View>
      ) : loading && expenses.length === 0 ? (
        <LoadingRow label="Cargando tus gastos..." testID="expense-result-loading" />
      ) : (
        <View style={styles.section}>
          <SectionLabel>HOY</SectionLabel>
          {today.map((expense) => (
            <ExpenseRow
              key={expense.id}
              category={expense.category}
              amount={expense.amount}
              createdAt={expense.createdAt}
              note={expense.note}
              receiptRef={expense.receiptRef}
              testID={`expense-result-row-${expense.id}`}
            />
          ))}
        </View>
      )}

      <Card style={styles.weekCard}>
        <View style={styles.weekRow}>
          <Text style={styles.weekTitle}>Esta semana</Text>
          <Text style={styles.weekTotal} testID="expense-result-week">
            {formatArs(summary.weekTotal)}
          </Text>
        </View>
        <SummaryRow
          title="Ver historial completo"
          onPress={() => navigation.navigate('ExpensesHistory')}
          testID="expense-result-history-cta"
        />
      </Card>
    </ScreenContainer>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderLeftColor: colors.success,
    borderLeftWidth: 4,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  savedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  savedText: {
    flex: 1,
  },
  savedTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  savedDetail: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  section: {
    gap: spacing.sm,
  },
  weekCard: {
    gap: spacing.sm,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  weekTotal: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
});
