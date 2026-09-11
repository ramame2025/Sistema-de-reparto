import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MenuRow } from './MenuRow';
import { SectionLabel } from './SectionLabel';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { radii } from '../theme/radii';
import { typography } from '../theme/typography';

export type DriverMenuProps = {
  visible: boolean;
  onClose: () => void;
  driverName: string;
  truckCode?: string;
  truckPlate?: string;
  onPressManifest: () => void;
  onPressLogout: () => void;
  /**
   * Hora ya formateada del catalogo que la app tiene en la mano, p. ej.
   * "07:05". Sin catalogo todavia, se omite.
   */
  priceListUpdatedAt?: string;
  /** Version instalada, para que un reporte de error diga cual. */
  appVersion?: string;
  /**
   * Hora ya formateada de la ultima vez que la app hablo con el servidor.
   * Se omite mientras no hubo ninguna.
   */
  lastSyncAt?: string;
  testID?: string;
};

/**
 * Menu del chofer, detras del boton de la barra de Inicio.
 *
 * Junta lo que no es la jornada en si: la preferencia de pantalla, los
 * accesos que no merecen una card en la portada, y el cierre de sesion, que
 * hasta ahora vivia al fondo del scroll de Inicio donde nadie lo encontraba.
 *
 * Va como Modal a pantalla completa y no como panel lateral: en un celular
 * sostenido con una mano, media pantalla de menu y media de fondo es peor de
 * leer que una pantalla entera.
 */
export function DriverMenu({
  visible,
  onClose,
  driverName,
  truckCode,
  truckPlate,
  onPressManifest,
  onPressLogout,
  priceListUpdatedAt,
  appVersion,
  lastSyncAt,
  testID,
}: DriverMenuProps) {
  const truckLine = truckCode
    ? `Camión ${truckCode}${truckPlate ? ` · ${truckPlate}` : ''}`
    : 'Sin camión asignado para hoy';

  // Dos datos de soporte en un renglon: se muestra lo que se sabe, y si no se
  // sabe ninguno el renglon no existe en vez de mentir un valor.
  const footnote = [
    appVersion ? `Versión ${appVersion}` : null,
    lastSyncAt ? `sincronizado ${lastSyncAt}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.screen}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.driver}>{driverName}</Text>
              <Text style={styles.truck} testID="driver-menu-truck">
                {truckLine}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar menú"
              onPress={onClose}
              style={styles.closeButton}
              testID="driver-menu-close"
            >
              <Ionicons name="close" size={22} color={colors.surface} />
            </Pressable>
          </View>
        </SafeAreaView>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.themeBlock}>
            <SectionLabel>PANTALLA</SectionLabel>

            {/* Deshabilitado a proposito: el tema oscuro todavia no existe y
                un toggle que no hace nada es peor que no tenerlo. */}
            <View style={styles.themeChoices}>
              <View style={[styles.themeOption, styles.themeOptionActive]}>
                <Ionicons name="sunny-outline" size={18} color={colors.surface} />
                <Text style={styles.themeLabelActive}>Claro</Text>
              </View>
              <View style={[styles.themeOption, styles.themeOptionDisabled]}>
                <Ionicons name="moon-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.themeLabelDisabled}>Oscuro</Text>
              </View>
            </View>

            <Text style={styles.themeHint} testID="driver-menu-theme-hint">
              Oscuro ayuda de noche; con sol, dejalo en claro · Próximamente
            </Text>
          </View>

          <MenuRow
            title="Remito de carga"
            onPress={onPressManifest}
            testID="driver-menu-manifest"
          />
          <MenuRow
            title="Lista de precios"
            value={priceListUpdatedAt ? `Actualizada ${priceListUpdatedAt}` : 'Sin datos'}
            testID="driver-menu-prices"
          />
          <MenuRow title="Ayuda" disabled testID="driver-menu-help" />
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={onPressLogout}
            style={styles.logout}
            testID="driver-menu-logout"
          >
            <Text style={styles.logoutLabel}>Cerrar sesión</Text>
          </Pressable>

          {footnote ? (
            <Text style={styles.footnote} testID="driver-menu-footnote">
              {footnote}
            </Text>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    backgroundColor: colors.primary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerText: {
    flexShrink: 1,
    gap: 2,
  },
  driver: {
    color: colors.surface,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
  },
  truck: {
    color: colors.surface,
    fontSize: typography.sizes.sm,
    opacity: 0.8,
  },
  closeButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: spacing.md,
  },
  themeBlock: {
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  themeChoices: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  themeOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  themeOptionDisabled: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  themeLabelActive: {
    color: colors.surface,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  themeLabelDisabled: {
    color: colors.textSecondary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  themeHint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  logout: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  footnote: {
    textAlign: 'center',
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    paddingBottom: spacing.md,
  },
  logoutLabel: {
    color: colors.error,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
});
