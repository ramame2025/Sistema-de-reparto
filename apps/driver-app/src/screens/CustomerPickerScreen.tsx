import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  distanceKm,
  sortByProximity,
  type CustomerRecord,
  type CustomerType,
} from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { LoadingRow } from '../components/LoadingRow';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionLabel } from '../components/SectionLabel';
import { TextField } from '../components/TextField';
import { useKeyboardAwareField } from '../components/KeyboardAwareField';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { ApiError } from '../services/apiClient';
import { captureDeviceLocation, type CapturedLocation } from '../services/location';
import type { NewSaleStackParamList } from '../navigation/NewSaleStack';
import { formatDistance } from '../utils/distance';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { radii } from '../theme/radii';
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

/** El 409 de POST /customers viaja con el cliente que ya existe. */
function conflictingCustomerFrom(error: unknown): CustomerRecord | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }

  const body = error.body as { customer?: CustomerRecord } | undefined;
  return body?.customer ?? null;
}

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
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { api } = useAuth();
  const navigation = useNavigation<CustomerPickerNavigationProp>();

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(null);

  const [quickCreateName, setQuickCreateName] = useState('');
  // Las categorias salen del catalogo cacheado, no de una constante: el alta
  // rapida pasa en la calle, y la lista tiene que sobrevivir sin senal.
  const { categories } = useCatalog();
  // Cadena vacia hasta que el chofer elija: cual es la primera categoria solo
  // se sabe cuando la cache llego.
  const [quickCreateType, setQuickCreateType] = useState<CustomerType>('');
  const selectedQuickCreateType = quickCreateType || categories[0]?.code || '';

  // El nombre para mostrar de cada categoria, por codigo.
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.code, category.name])),
    [categories],
  );
  const [creating, setCreating] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<CustomerRecord | null>(null);

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

  // El alta rapida arranca cerrada: la accion normal es elegir de la lista,
  // y un formulario siempre abierto empujaba la lista fuera de la pantalla.
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  // El alta rapida se abre al pie de la lista, que es justo donde pega el teclado.
  const quickCreateField = useKeyboardAwareField();

  const subtitleFor = (customer: CustomerRecord): string => {
    // Cae al codigo crudo a proposito: el cliente puede arrastrar una
    // categoria que la cache no conoce -- creada despues de la ultima
    // sincronizacion, o dada de baja y ya fuera de la lista -- y mostrar el
    // codigo es mejor que mostrar nada.
    const type = categoryNames.get(customer.customerType) ?? customer.customerType;
    if (!location || customer.latitude === undefined || customer.longitude === undefined) {
      return type;
    }
    return `${type} · ${formatDistance(
      distanceKm(location, { latitude: customer.latitude, longitude: customer.longitude }),
    )}`;
  };

  const pickCustomer = (customer: CustomerRecord) => {
    navigation.navigate('Sale', {
      pickedCustomer: {
        id: customer.id,
        name: customer.name,
        customerType: customer.customerType,
      },
    });
  };

  const submitQuickCreate = async (allowDuplicate = false) => {
    setQuickCreateError(null);

    try {
      setCreating(true);
      const created = await api.post<CustomerRecord>(
        allowDuplicate ? '/customers?allowDuplicate=true' : '/customers',
        {
          name: quickCreateName,
          customerType: selectedQuickCreateType,
          // Omitido (no las keys) si no hubo lectura de ubicacion exitosa --
          // mismo criterio "best-effort" que saveSale usa para
          // latitude/longitude en NewSaleScreen (Open Question 4).
          ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
        },
      );

      setDuplicate(null);
      pickCustomer(created);
    } catch (err) {
      const conflicting = conflictingCustomerFrom(err);
      if (conflicting) {
        // Un nombre parecido no puede dejar al chofer varado frente a un
        // cliente real: se le ofrece el existente de un toque, o crear igual.
        setDuplicate(conflicting);
        return;
      }

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
      <TextField
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Buscar por nombre"
        testID="customer-picker-search"
      />

      {error && <FeedbackBanner message={error} tone="error" />}

      {loading ? (
        <LoadingRow label="Cargando clientes..." testID="customer-picker-loading" />
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
                <Text style={styles.customerType} testID={`customer-picker-subtitle-${item.id}`}>
                  {subtitleFor(item)}
                </Text>
                {item.address && (
                  <Text
                    style={styles.customerAddress}
                    testID={`customer-picker-address-${item.id}`}
                  >
                    {item.address}
                  </Text>
                )}
              </View>
              {nearbyCustomerIds.has(item.id) && (
                <StatusBadge
                  label="Cerca tuyo"
                  status="info"
                  testID={`customer-picker-near-badge-${item.id}`}
                />
              )}
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Pressable>
          )}
        />
      )}

      {!quickCreateOpen && (
        <Button
          label="Cliente nuevo"
          variant="secondary"
          onPress={() => setQuickCreateOpen(true)}
          testID="customer-picker-quick-create-open"
        />
      )}

      {quickCreateOpen && (
      <Card style={styles.card}>
        <SectionLabel variant="field">Cliente nuevo</SectionLabel>
        <TextField
          ref={quickCreateField.ref}
          onFocus={quickCreateField.onFocus}
          value={quickCreateName}
          onChangeText={setQuickCreateName}
          placeholder="Nombre del cliente nuevo"
          testID="customer-picker-quick-create-name"
        />
        <View style={styles.segmentRow}>
          {categories.map((category) => (
            <Button
              key={category.code}
              label={category.name}
              variant={
                selectedQuickCreateType === category.code ? 'primary' : 'secondary'
              }
              onPress={() => setQuickCreateType(category.code)}
              testID={`customer-picker-quick-create-type-${category.code}`}
            />
          ))}
        </View>
        <Button
          label={creating ? 'Creando...' : 'Crear cliente'}
          onPress={() => void submitQuickCreate(false)}
          disabled={
            creating ||
            quickCreateName.trim().length === 0 ||
            selectedQuickCreateType.length === 0
          }
          testID="customer-picker-quick-create-submit"
        />
        {duplicate && (
          <View style={styles.duplicateBox} testID="customer-picker-duplicate">
            <Text style={styles.duplicateText}>
              Ya existe {duplicate.name}
              {duplicate.zone ? ` en ${duplicate.zone}` : ''}. Si es el mismo,
              usalo. Si es otro, crealo igual.
            </Text>
            <View style={styles.duplicateActions}>
              <Button
                label="Usar el existente"
                onPress={() => {
                  setDuplicate(null);
                  pickCustomer(duplicate);
                }}
                testID="customer-picker-duplicate-use"
              />
              <Button
                label="Crear igual"
                variant="secondary"
                onPress={() => void submitQuickCreate(true)}
                testID="customer-picker-duplicate-force"
              />
            </View>
          </View>
        )}

        <FeedbackBanner message={quickCreateError} tone="error" />
      </Card>
      )}
    </ScreenContainer>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  card: {
    gap: spacing.sm,
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
  customerAddress: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  duplicateBox: {
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  duplicateText: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  duplicateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
