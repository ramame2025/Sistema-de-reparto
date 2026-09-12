import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type SyncHeaderProps = {
  /** Ventas que siguen en el telefono, sin llegar al servidor. */
  pendingCount: number;
  /** Omitido mientras el chofer no tiene camion asignado hoy. */
  truckCode?: string;
  /** Hora ya formateada de la ultima sincronizacion, p. ej. "09:38". */
  lastSyncAt?: string;
  testID?: string;
};

/**
 * Barra oscura de Sincronizacion. Contesta de un vistazo las dos preguntas de
 * la pantalla: cuanto quedo trabado en el telefono, y hace cuanto que la app
 * no habla con el servidor.
 *
 * La cola manda sobre la hora a proposito. Una cola en cero con una hora vieja
 * es simplemente un rato sin senal; una cola con ventas adentro es plata que
 * todavia no existe para nadie mas que este telefono.
 */
export function SyncHeader({ pendingCount, truckCode, lastSyncAt, testID }: SyncHeaderProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const clean = pendingCount === 0;
  const eyebrow = truckCode ? `SINCRONIZACIÓN · ${truckCode}` : 'SINCRONIZACIÓN';
  const title = clean
    ? 'Todo sincronizado'
    : `${pendingCount} ${pendingCount === 1 ? 'venta' : 'ventas'} en cola`;

  return (
    <View testID={testID} style={styles.bar}>
      <View style={styles.text}>
        <Text style={styles.eyebrow} testID="sync-header-eyebrow">
          {eyebrow}
        </Text>
        <Text style={styles.title} testID="sync-header-title">
          {title}
        </Text>
        <Text style={styles.subtitle} testID="sync-header-last">
          {lastSyncAt ? `Última sincronización ${lastSyncAt}` : 'Todavía no sincronizó'}
        </Text>
      </View>

      <Ionicons
        name={clean ? 'cloud-done-outline' : 'cloud-upload-outline'}
        size={28}
        color={colors.onPrimary}
        testID={clean ? 'sync-header-icon-clean' : 'sync-header-icon-pending'}
      />
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    text: {
      flexShrink: 1,
      gap: 2,
    },
    eyebrow: {
      color: colors.onPrimary,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.bold,
      letterSpacing: 0.7,
      opacity: 0.85,
    },
    title: {
      color: colors.onPrimary,
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
    },
    subtitle: {
      color: colors.onPrimary,
      fontSize: typography.sizes.xs,
      opacity: 0.8,
    },
  });
