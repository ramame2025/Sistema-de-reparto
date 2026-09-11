import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ProductCode } from '@distribuidor/shared';
import { Button } from './Button';
import { CardHeader } from './CardHeader';
import { ProgressBar, type ProgressBarTone } from './ProgressBar';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

/**
 * Una fila ya lista para pintar: el nombre visible lo resuelve el que arma la
 * tarjeta (el catalogo), no la tarjeta. Asi el componente no necesita saber que
 * `G15_AUTO` se muestra "G15 auto".
 */
export type TruckStockCardLine = {
  productCode: ProductCode;
  label: string;
  loaded: number;
  remaining: number;
};

export type TruckStockCardProps = {
  lines: TruckStockCardLine[];
  /** Instante del remito de hoy. `null` = todavia no se cargo nada. */
  manifestAt: string | null;
  onLoadManifest: () => void;
  onPress?: () => void;
  testID?: string;
};

/**
 * A partir de aca el chofer tiene que mirar antes de prometerle envases a un
 * cliente. Tres o menos ya es "fijate", no "tenes".
 */
const LOW_STOCK_THRESHOLD = 3;

const pad = (value: number): string => String(value).padStart(2, '0');

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const sumOf = (lines: TruckStockCardLine[], field: 'loaded' | 'remaining'): number =>
  lines.reduce((total, entry) => total + entry[field], 0);

/**
 * Un producto que no viajo hoy no tiene un numero que mostrar: `0 /0` se lee
 * como "se vendio todo", que es exactamente lo contrario. El guion dice "no
 * corresponde". Un remanente negativo NUNCA cae aca: ese si es un numero real
 * (se vendio mas de lo cargado) y tiene que verse.
 */
const hasNumbers = (line: TruckStockCardLine): boolean =>
  line.loaded !== 0 || line.remaining !== 0;

const toneOf = (remaining: number): ProgressBarTone => {
  if (remaining < 0) {
    return 'error';
  }

  return remaining <= LOW_STOCK_THRESHOLD ? 'warning' : 'primary';
};

const toneColor = (colors: Colors, tone: ProgressBarTone): string =>
  ({
    success: colors.success,
    primary: colors.accent,
    warning: colors.warning,
    error: colors.error,
  })[tone];

function StockTile({ line, testID }: { line: TruckStockCardLine; testID: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const known = hasNumbers(line);
  const tone = toneOf(line.remaining);

  return (
    <View style={styles.tile} testID={testID}>
      <View style={styles.tileHeader}>
        <Text style={styles.tileLabel}>{line.label}</Text>
        <View style={styles.tileNumbers}>
          <Text
            style={[styles.tileValue, { color: known ? toneColor(colors, tone) : colors.textSecondary }]}
            testID={`${testID}-value`}
          >
            {known ? line.remaining : '—'}
          </Text>
          {known ? (
            <Text style={styles.tileLoaded} testID={`${testID}-loaded`}>
              /{line.loaded}
            </Text>
          ) : null}
        </View>
      </View>
      {known ? (
        <ProgressBar
          current={line.remaining}
          total={line.loaded}
          tone={tone}
          testID={`${testID}-bar`}
        />
      ) : null}
    </View>
  );
}

/**
 * Que le queda arriba del camion, producto por producto.
 *
 * La barra se VACIA a lo largo del dia en vez de llenarse: mide lo que todavia
 * hay para vender, no lo que ya se vendio. Sin remito la tarjeta no inventa
 * ceros -- dice que no puede saberlo y ofrece la unica accion que lo arregla,
 * porque un "0" ahi se leeria como "vendiste todo".
 */
export function TruckStockCard({
  lines,
  manifestAt,
  onLoadManifest,
  onPress,
  testID,
}: TruckStockCardProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tiles = (
    <View style={styles.tiles}>
      {lines.map((line) => (
        <StockTile
          key={line.productCode}
          line={line}
          testID={testID ? `${testID}-tile-${line.productCode}` : `tile-${line.productCode}`}
        />
      ))}
    </View>
  );

  if (!manifestAt) {
    return (
      <View style={[styles.card, styles.cardEmpty]} testID={testID}>
        <CardHeader
          title="En el camión"
          subtitle="Sin remito no sabemos qué te queda"
          trailing={
            <Button
              label="Cargar remito"
              variant="secondary"
              onPress={onLoadManifest}
              testID={testID ? `${testID}-load-cta` : undefined}
            />
          }
          testID={testID ? `${testID}-header` : undefined}
        />
        {tiles}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={styles.card}
      testID={testID}
    >
      <CardHeader
        title="En el camión"
        subtitle={`Remito ${formatTime(manifestAt)} · ${sumOf(lines, 'loaded')} cargados`}
        trailing={
          <Text style={styles.total} testID={testID ? `${testID}-remaining-total` : undefined}>
            quedan {sumOf(lines, 'remaining')}
          </Text>
        }
        testID={testID ? `${testID}-header` : undefined}
      />
      {tiles}
    </Pressable>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: spacing.sm,
    padding: spacing.md,
    gap: spacing.md,
  },
  // Mismo codigo visual que DayStatusCard: el borde ambar marca lo que falta
  // hacer, no un error.
  cardEmpty: {
    borderLeftColor: colors.warning,
    borderLeftWidth: 4,
  },
  total: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // Dos por fila: la base va por debajo del 50% para dejarle lugar al `gap`,
  // si no la segunda columna se cae de linea. `flexGrow` recupera el sobrante.
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 130,
    gap: spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: spacing.sm,
    padding: spacing.sm,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  tileLabel: {
    flexShrink: 1,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
  },
  tileNumbers: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tileValue: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
  },
  tileLoaded: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginLeft: 2,
  },
});
