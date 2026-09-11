import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MenuRow } from './MenuRow';
import { SectionLabel } from './SectionLabel';
import { useColors, useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { radii } from '../theme/radii';
import { typography } from '../theme/typography';

/**
 * Cuanto del ancho del telefono ocupa el panel. El resto queda a la vista a
 * proposito: el chofer no pierde de vista la jornada que hay detras, y tiene
 * una zona grande para cerrar sin apuntar a un boton chico.
 */
const PANEL_RATIO = 0.7;

const OPEN_MS = 220;
/** Cerrar va mas rapido que abrir: ya se sabe a donde se vuelve. */
const CLOSE_MS = 180;

export type DriverMenuProps = {
  visible: boolean;
  onClose: () => void;
  driverName: string;
  truckCode?: string;
  truckPlate?: string;
  onPressManifest: () => void;
  onPressPriceList: () => void;
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
 * Entra como panel desde la derecha y tapa el 70% del ancho, no la pantalla
 * entera: el pulgar de la mano que sostiene el telefono llega a todo, y lo que
 * queda del Inicio detras recuerda de donde se vino y da una zona grande para
 * cerrar sin apuntar.
 */
export function DriverMenu({
  visible,
  onClose,
  driverName,
  truckCode,
  truckPlate,
  onPressManifest,
  onPressPriceList,
  onPressLogout,
  priceListUpdatedAt,
  appVersion,
  lastSyncAt,
  testID,
}: DriverMenuProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { scheme, setScheme } = useTheme();
  const { width } = useWindowDimensions();
  const panelWidth = width * PANEL_RATIO;

  // El Modal sobrevive al cierre hasta que el panel termina de salir: si
  // siguiera el `visible` del padre al pie de la letra, desapareceria de golpe
  // y la animacion no se veria nunca.
  const [mounted, setMounted] = useState(visible);
  const slide = useRef(new Animated.Value(panelWidth)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(slide, {
        toValue: 0,
        duration: OPEN_MS,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(slide, {
      toValue: panelWidth,
      duration: CLOSE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [visible, panelWidth, slide]);

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
      visible={mounted}
      transparent
      // La animacion la maneja el panel, no el Modal: el "slide" nativo entra
      // desde abajo y lo que se quiere es de derecha a izquierda.
      animationType="none"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: slide.interpolate({
                inputRange: [0, panelWidth || 1],
                outputRange: [1, 0],
              }) },
          ]}
        >
          {/* Tocar afuera cierra: es el gesto que el chofer ya espera, y es
              mucho mas facil de acertar que la X con una sola mano. */}
          <Pressable
            style={styles.backdropPress}
            onPress={onClose}
            testID="driver-menu-backdrop"
          />
        </Animated.View>

        <Animated.View
          testID="driver-menu-panel"
          style={[styles.panel, { transform: [{ translateX: slide }] }]}
        >
        <SafeAreaView edges={['top', 'right']} style={styles.header}>
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
              <Ionicons name="close" size={22} color={colors.onPrimary} />
            </Pressable>
          </View>
        </SafeAreaView>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.themeBlock}>
            <SectionLabel>PANTALLA</SectionLabel>

            <View style={styles.themeChoices}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: scheme === 'light' }}
                onPress={() => setScheme('light')}
                style={[
                  styles.themeOption,
                  scheme === 'light' ? styles.themeOptionActive : styles.themeOptionIdle,
                ]}
                testID="driver-menu-theme-light"
              >
                <Ionicons
                  name="sunny-outline"
                  size={18}
                  color={scheme === 'light' ? colors.onPrimary : colors.textSecondary}
                />
                <Text
                  style={scheme === 'light' ? styles.themeLabelActive : styles.themeLabelIdle}
                >
                  Claro
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: scheme === 'dark' }}
                onPress={() => setScheme('dark')}
                style={[
                  styles.themeOption,
                  scheme === 'dark' ? styles.themeOptionActive : styles.themeOptionIdle,
                ]}
                testID="driver-menu-theme-dark"
              >
                <Ionicons
                  name="moon-outline"
                  size={18}
                  color={scheme === 'dark' ? colors.onPrimary : colors.textSecondary}
                />
                <Text style={scheme === 'dark' ? styles.themeLabelActive : styles.themeLabelIdle}>
                  Oscuro
                </Text>
              </Pressable>
            </View>

            <Text style={styles.themeHint} testID="driver-menu-theme-hint">
              Oscuro ayuda de noche; con sol, dejalo en claro
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
            onPress={onPressPriceList}
            testID="driver-menu-prices"
          />
        </ScrollView>

        <SafeAreaView edges={['bottom', 'right']} style={styles.footer}>
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
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  // Se come el ancho que el panel no usa, y oscurece lo que quedo detras.
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdropPress: {
    flex: 1,
  },
  panel: {
    width: `${PANEL_RATIO * 100}%`,
    backgroundColor: colors.surface,
    // La sombra cae hacia la izquierda: el panel se lee como una hoja apoyada
    // sobre la pantalla, no como otra pantalla.
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: -2, height: 0 },
    elevation: 16,
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
    color: colors.onPrimary,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
  },
  truck: {
    color: colors.onPrimary,
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
  themeOptionIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  themeLabelActive: {
    color: colors.onPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  themeLabelIdle: {
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
