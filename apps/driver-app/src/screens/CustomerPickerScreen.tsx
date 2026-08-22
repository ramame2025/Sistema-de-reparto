import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CustomerRecord } from '@distribuidor/shared';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/apiClient';
import type { NewSaleStackParamList } from '../navigation/NewSaleStack';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type CustomerPickerNavigationProp = NativeStackNavigationProp<
  NewSaleStackParamList,
  'CustomerPicker'
>;

/**
 * v1 (Phase 6 PR2, docs/plans/customer-picker-proximity.md): search + manual
 * selection over the full customer registry. NO proximity sort and NO
 * quick-create yet — those are PR3 (design decisions #10-#12), layered onto
 * this already-shippable screen without touching this file's core shape.
 *
 * Fetches the customer list once on mount via useAuth().api.get, same
 * "fetch once, no polling" pattern HomeScreen uses for
 * /load-manifests/mine. Search is a plain client-side substring filter over
 * the already-fetched list (no server-side search param exists — see
 * customers.controller.ts). Uses useNavigation() rather than a `navigation`
 * prop, matching HomeScreen.tsx's established convention for a screen that
 * needs to navigate but isn't passed props directly (it's wired via
 * NewSaleStack's `component=` prop, same as HomeScreen is wired via
 * HomeStack).
 */
export function CustomerPickerScreen() {
  const { api } = useAuth();
  const navigation = useNavigation<CustomerPickerNavigationProp>();

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const fetched = await api.get<CustomerRecord[]>('/customers');
        if (!cancelled) {
          setCustomers(fetched);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof ApiError ? err.message : 'No se pudo cargar la lista de clientes.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on mount only
  }, []);

  const visibleCustomers = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    if (!normalized) {
      return customers;
    }
    return customers.filter((customer) => customer.name.toLowerCase().includes(normalized));
  }, [customers, searchText]);

  const pickCustomer = (customer: CustomerRecord) => {
    navigation.navigate('Sale', {
      pickedCustomer: {
        id: customer.id,
        name: customer.name,
        customerType: customer.customerType,
      },
    });
  };

  return (
    <ScreenContainer testID="customer-picker-screen">
      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Buscar cliente</Text>
        <TextInput
          style={styles.input}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Nombre del cliente"
          testID="customer-picker-search"
        />
      </Card>

      {error && <FeedbackBanner message={error} tone="error" />}

      {loading ? (
        <Text style={styles.apiHint} testID="customer-picker-loading">
          Cargando clientes...
        </Text>
      ) : visibleCustomers.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="No encontramos clientes con ese nombre."
        />
      ) : (
        <FlatList
          testID="customer-picker-list"
          data={visibleCustomers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.customerRow}
              onPress={() => pickCustomer(item)}
              testID={`customer-picker-item-${item.id}`}
            >
              <Text style={styles.customerName}>{item.name}</Text>
              <Text style={styles.customerType}>{item.customerType}</Text>
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  apiHint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    padding: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  customerName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  customerType: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
});
