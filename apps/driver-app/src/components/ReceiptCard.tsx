import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type ReceiptCardProps = {
  /** Vacio mientras no se adjunto nada. */
  receiptRef: string;
  uploading: boolean;
  onCapture: () => void;
  onPickFromGallery: () => void;
  onRemove: () => void;
  testID?: string;
};

/**
 * El ticket del gasto: su estado actual y las dos formas de adjuntarlo.
 *
 * "Quitar" existe porque una foto movida o del ticket equivocado no se podia
 * deshacer: habia que guardar el gasto mal o salir de la pantalla y perder lo
 * cargado.
 */
export function ReceiptCard({
  receiptRef,
  uploading,
  onCapture,
  onPickFromGallery,
  onRemove,
  testID,
}: ReceiptCardProps) {
  const attached = receiptRef.length > 0;

  return (
    <View style={styles.wrap} testID={testID}>
      {attached && (
        <View style={styles.attached}>
          <Image
            source={{ uri: receiptRef }}
            style={styles.thumb}
            resizeMode="cover"
            testID={testID ? `${testID}-thumb` : undefined}
          />
          <View style={styles.attachedText}>
            <View style={styles.attachedTitleRow}>
              <Ionicons name="checkmark" size={14} color={colors.success} />
              <Text style={styles.attachedTitle}>Ticket adjunto</Text>
            </View>
            <Text style={styles.attachedHint}>Foto subida</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onRemove}
            testID={testID ? `${testID}-remove` : undefined}
          >
            <Text style={styles.remove}>Quitar</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.buttons}>
        <View style={styles.button}>
          <Button
            label={uploading ? 'Subiendo...' : 'Sacar foto'}
            variant="secondary"
            onPress={onCapture}
            disabled={uploading}
            testID={testID ? `${testID}-capture` : undefined}
          />
        </View>
        <View style={styles.button}>
          <Button
            label={uploading ? 'Subiendo...' : 'Galería'}
            variant="primary"
            onPress={onPickFromGallery}
            disabled={uploading}
            testID={testID ? `${testID}-gallery` : undefined}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  attached: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: spacing.sm,
    padding: spacing.sm,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: spacing.xs,
    backgroundColor: colors.background,
  },
  attachedText: {
    flex: 1,
  },
  attachedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  attachedTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  attachedHint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  remove: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.error,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
  },
});
