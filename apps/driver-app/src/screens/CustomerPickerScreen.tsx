import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  CUSTOMER_TYPES,
  sortByProximity,
  type CustomerRecord,
  type CustomerType,
} from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/apiClient';
import { captureDeviceLocation, type CapturedLocation } from '../services/location';
import type { NewSaleStackParamList } from '../navigation/NewSaleStack';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type CustomerPickerNavigationProp = NativeStackNavigationProp<
  NewSaleStackParamList,
  'CustomerPicker'
>;

// How many nearest, coordinate-bearing customers get the "cerca tuyo"
// marker (Open Question 2 / Design decision #10: sort, never filter --
// the full list stays reachable below regardless of this number).
const NEARBY_HIGHLIGHT_COUNT = 5;

/**
 * v2 (Phase 6 PR3, docs/plans/customer-picker-proximity.md): adds proximity
 * suggestion and quick creation on top of PR2's search + manual selection.
 *
 * On mount, captures a fresh, independent GPS reading (design decision #11
 * -- never reuses a previously-captured sale location) via the extracted
 * services/location.ts helper (design decision #5), in parallel with the
 * customer-list fetch. When the reading succeeds, the already
 * search-filtered list is passed through packages/shared's sortByProximity
 * (design decision #10 -- sorts, never filters: customers without
 * coordinates stay in the list, just not marked "cerca tuyo"). When the
 * reading fails/denies/times out, the list renders and is searchable
 * exactly as PR2 already did -- the picker is never blocked (Open Question
 * 5 / design decision #14).
 *
 * Quick creation (design decisions #12/#13) is a small inline form: only
 * name + customerType are required inputs (no manual coordinate entry --
 * the same GPS reading captured above is attached best-effort). It is
 * online-only -- a failed POST /customers (including offline) shows an
 * error banner and never navigates away, so the driver can still fall back
 * to NewSaleScreen's free-text customerName field.
 */
export function CustomerPickerScreen() {
  const { api } = useAuth();
  const navigation = useNavigation<CustomerPickerNavigationProp>();

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(null);

  const [quickCreateName, setQuickCreateName] = useState('');
  const [quickCreateType, setQuickCreateType] = useState<CustomerType>('final');
  const [creating, setCreating] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    const readLocation = async () => {
      const reading = await captureDeviceLocation();
      if (!cancelled) {
        setLocation(reading);
      }
    };

    void readLocation();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fresh read once on mount only
  }, []);

  const searchFilteredCustomers = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    if (!normalized) {
      return customers;
    }
    return customers.filter((customer) => customer.name.toLowerCase().includes(normalized));
  }, [customers, searchText]);

  const visibleCustomers = useMemo(() => {
    if (!location) {
      return searchFilteredCustomers;
    }
    return sortByProximity(location, searchFilteredCustomers);
  }, [searchFilteredCustomers, location]);

  const nearbyCustomerIds = useMemo(() => {
    if (!location) {
      return new Set<string>();
    }
    return new Set(
      visibleCustomers
        .filter((customer) => customer.latitude !== undefined && customer.longitude !== undefined)
        .slice(0, NEARBY_HIGHLIGHT_COUNT)
        .map((customer) => customer.id),
    );
  }, [visibleCustomers, location]);

  const pickCustomer = (customer: CustomerRecord) => {
    navigation.navigate('Sale', {
      pickedCustomer: {
        id: customer.id,
        name: customer.name,
        customerType: customer.customerType,
      },
    });
  };

  const submitQuickCreate = async () => {
    setQuickCreateError(null);

    try {
      setCreating(true);
      const created = await api.post<CustomerRecord>('/customers', {
        name: quickCreateName,
        customerType: quickCreateType,
        // Omitido (no las keys) si no hubo lectura de ubicacion exitosa --
        // mismo criterio "best-effort" que saveSale usa para
        // latitude/longitude en NewSaleScreen (Open Question 4).
        ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
      });

      pickCustomer(created);
    } catch (err) {
      // Alta rapida es solo online (Open Question 13, design decision #13):
      // un fallo -- incluida la falta de conexion -- muestra error y no
      // navega. El chofer puede seguir con el nombre libre en NewSaleScreen.
      const message =
        err instanceof ApiError
          ? err.message
          : 'No se pudo crear el cliente. Revisa la conexion e intenta de nuevo.';
      setQuickCreateError(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScreenContainer testID="customer-picker-screen" scroll>
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
        <View style={styles.loadingRow} testID="customer-picker-loading">
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Cargando clientes...</Text>
        </View>
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
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>{item.name}</Text>
                <Text style={styles.customerType}>{item.customerType}</Text>
              </View>
              {nearbyCustomerIds.has(item.id) && (
                <StatusBadge
                  label="Cerca tuyo"
                  status="info"
                  testID={`customer-picker-near-badge-${item.id}`}
                />
              )}
            </Pressable>
          )}
        />
      )}

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Crear cliente rapido</Text>
        <TextInput
          style={styles.input}
          value={quickCreateName}
          onChangeText={setQuickCreateName}
          placeholder="Nombre del cliente nuevo"
          testID="customer-picker-quick-create-name"
        />
        <View style={styles.segmentRow}>
          {CUSTOMER_TYPES.map((type) => (
            <Button
              key={type}
              label={type}
              variant={quickCreateType === type ? 'primary' : 'secondary'}
              onPress={() => setQuickCreateType(type)}
              testID={`customer-picker-quick-create-type-${type}`}
            />
          ))}
        </View>
        <Button
          label={creating ? 'Creando...' : 'Crear cliente'}
          onPress={() => void submitQuickCreate()}
          disabled={creating || quickCreateName.trim().length === 0}
          testID="customer-picker-quick-create-submit"
        />
        <FeedbackBanner message={quickCreateError} tone="error" />
      </Card>
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
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
    minHeight: MIN_TOUCH_TARGET,
  },
  customerInfo: {
    flexShrink: 1,
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
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
