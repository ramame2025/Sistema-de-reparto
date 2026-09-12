import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { LoadingRow } from '../components/LoadingRow';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeading } from '../components/ScreenHeading';
import { useCatalog } from '../context/CatalogContext';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';
import { formatClock } from '../utils/jornada';

/**
 * La lista de precios que la app tiene EN LA MANO, no la que el servidor
 * tiene ahora. Es la distincion que importa: el chofer cotiza con esta tabla
 * aunque no haya senal, asi que la pantalla la fecha y avisa cuando salio del
 * cache en vez de mostrarla como si fuera fresca.
 *
 * No hace fetch propio: lee de `CatalogContext`, que es la misma fuente con la
 * que Nueva Venta calcula el total. Dos fuentes distintas serian dos precios
 * distintos para el mismo producto.
 */
export function PriceListScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { products, prices, categories, status, stale, fetchedAt, error, reload } = useCatalog();

  const loading = status === 'loading' && products.length === 0;
  const updatedAt = fetchedAt ? formatClock(fetchedAt) : null;

  return (
    <ScreenContainer
      testID="price-list-screen"
      onRefresh={() => void reload()}
      refreshing={status === 'loading'}
    >
      <View style={styles.wrap}>
        <ScreenHeading
          title="Lista de precios"
          {...(updatedAt ? { eyebrow: `ACTUALIZADA ${updatedAt}` } : {})}
        />

        {stale ? (
          <FeedbackBanner
            testID="price-list-stale"
            tone="warning"
            message="Estos precios salieron del teléfono, no del servidor. Pueden estar viejos."
          />
        ) : null}

        {error ? <FeedbackBanner message={error} tone="error" /> : null}

        {loading ? (
          <LoadingRow label="Cargando precios..." testID="price-list-loading" />
        ) : products.length === 0 ? (
          <EmptyState
            title="Todavía no hay precios"
            description="Cuando el administrador cargue la lista va a aparecer acá."
          />
        ) : (
          <FlatList
            testID="price-list"
            data={products}
            keyExtractor={(product) => product.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item: product }) => (
              <View style={styles.row} testID={`price-list-row-${product.code}`}>
                <Text style={styles.product}>{product.name}</Text>

                {categories.map((category) => {
                  const price = prices?.[category.code]?.[product.code];

                  return (
                    <View key={category.id} style={styles.priceLine}>
                      <Text style={styles.category}>{category.name}</Text>
                      {/* Un agujero en la tabla se dice: ese producto no se
                          le puede vender a esa categoria, y es mejor que el
                          chofer lo sepa aca que al cerrar la venta. */}
                      <Text style={price === undefined ? styles.missing : styles.price}>
                        {price === undefined ? 'Sin precio' : formatArs(price)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  // Sin `scroll`: el FlatList es el unico contenedor scrolleable.
  wrap: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.md,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  product: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  category: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  price: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  missing: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.warning,
  },
});
