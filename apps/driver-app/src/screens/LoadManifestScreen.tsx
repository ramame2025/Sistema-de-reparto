import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  PRODUCT_CODES,
  validateCreateLoadManifestInput,
  type CreateLoadManifestInput,
  type ProductCode,
} from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useTruck } from '../context/TruckContext';
import { ApiError } from '../services/apiClient';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

const EMPTY_QUANTITIES: Record<ProductCode, number> = {
  G10: 0,
  G15: 0,
  G45: 0,
  G15_AUTO: 0,
};

/**
 * New screen for Phase 3 PR4 (docs/plans/load-manifest.md). No prior
 * App.tsx history to relocate from — the stepper is copy-adapted from
 * NewSaleScreen (per-product +/- over PRODUCT_CODES, filter quantity>0
 * before building items) and the optional photo pick/capture is
 * copy-adapted from ExpensesScreen (same permission/cancel/upload-failure
 * handling, same `POST /uploads/receipt` endpoint reused per design
 * decision 8 — no dedicated manifest upload route). No new Context: reads
 * `useAuth()`/`useTruck()` directly, same consumer contract as those two
 * screens (design decision 6). No offline queue for the manifest (design
 * decision 8) — a failed POST shows an error, it is never enqueued.
 */
export function LoadManifestScreen() {
  const { api, username } = useAuth();
  const { truck, status: truckStatus, error: truckError } = useTruck();

  const [quantities, setQuantities] = useState<Record<ProductCode, number>>(EMPTY_QUANTITIES);
  const [note, setNote] = useState('');
  const [photoRef, setPhotoRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');

  const currentItems = useMemo(
    () =>
      PRODUCT_CODES.filter((code) => quantities[code] > 0).map((code) => ({
        productCode: code,
        quantity: quantities[code],
      })),
    [quantities],
  );

  const changeQty = (productCode: ProductCode, delta: number) => {
    setQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, previous[productCode] + delta),
    }));
  };

  const showMessage = (text: string, tone: FeedbackTone) => {
    setMessage(text);
    setMessageTone(tone);
  };

  const uploadManifestPhoto = async (uri: string) => {
    const form = new FormData();
    form.append('file', {
      uri,
      name: `manifest_${Date.now()}.jpg`,
      type: 'image/jpeg',
    } as never);

    const uploaded = await api.postForm<{ url: string }>('/uploads/receipt', form);
    return uploaded.url;
  };

  const pickManifestPhoto = async () => {
    try {
      setUploadingPhoto(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permiso de galeria requerido para adjuntar la foto del remito.', 'error');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const uploadedUrl = await uploadManifestPhoto(result.assets[0].uri);
      setPhotoRef(uploadedUrl);
      showMessage('Foto del remito cargada correctamente.', 'success');
    } catch {
      showMessage('No se pudo subir la foto del remito.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const captureManifestPhoto = async () => {
    try {
      setUploadingPhoto(true);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permiso de camara requerido para sacar la foto del remito.', 'error');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const uploadedUrl = await uploadManifestPhoto(result.assets[0].uri);
      setPhotoRef(uploadedUrl);
      showMessage('Foto del remito capturada y cargada correctamente.', 'success');
    } catch {
      showMessage('No se pudo capturar/subir la foto del remito.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const saveManifest = async () => {
    setMessage(null);

    // Sin camion asignado el remito quedaria sin unidad: se corta antes de
    // mandarlo, igual que el guard de NewSaleScreen.
    if (!truck) {
      showMessage('No podes cargar el remito sin un camion asignado para hoy.', 'error');
      return;
    }

    const payload: CreateLoadManifestInput = {
      driverName: username,
      truckId: truck.truckId,
      truckCode: truck.code,
      items: currentItems,
      photoRef: photoRef || undefined,
      note: note || undefined,
    };

    const errors = validateCreateLoadManifestInput(payload);
    if (errors.length > 0) {
      showMessage(errors[0], 'error');
      return;
    }

    try {
      setSaving(true);
      await api.post('/load-manifests', payload);
      showMessage('Remito guardado correctamente.', 'success');
      setQuantities(EMPTY_QUANTITIES);
    } catch (error) {
      const cause = error instanceof ApiError ? error.message : 'No se pudo guardar el remito.';
      showMessage(cause, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer testID="load-manifest-screen" scroll>
      <Text style={styles.tag}>Distribuidor · App chofer</Text>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Cargar camion</Text>
        <Text style={styles.apiHint}>Chofer: {username}</Text>
        {truck && (
          <Text style={styles.assignedTruck} testID="load-manifest-assigned-truck">
            Camion: {truck.code} · {truck.plate} · {truck.capacity} u.
            {truck.kind === 'cobertura' ? ' (cobertura)' : ''}
          </Text>
        )}
        {!truck && truckStatus === 'error' && (
          <Text style={styles.truckProblem} testID="load-manifest-truck-error">
            {truckError} Revisa la conexion y volve a intentar.
          </Text>
        )}
        {!truck && truckStatus !== 'error' && truckStatus !== 'loading' && (
          <Text style={styles.truckProblem} testID="load-manifest-no-truck">
            Hoy no tenes un camion asignado. Hablá con el administrador antes de
            cargar el remito.
          </Text>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Productos</Text>
        {PRODUCT_CODES.map((code) => (
          <View key={code} style={styles.productRow}>
            <Text style={styles.productName}>{code}</Text>
            <View style={styles.qtyRow}>
              <Button
                label="-"
                variant="secondary"
                onPress={() => changeQty(code, -1)}
                testID={`load-manifest-qty-decrement-${code}`}
              />
              <Text style={styles.qtyValue} testID={`load-manifest-qty-value-${code}`}>
                {quantities[code]}
              </Text>
              <Button
                label="+"
                variant="secondary"
                onPress={() => changeQty(code, 1)}
                testID={`load-manifest-qty-increment-${code}`}
              />
            </View>
          </View>
        ))}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Foto del remito (opcional)</Text>
        <Button
          label={uploadingPhoto ? 'Subiendo foto...' : 'Adjuntar desde galeria'}
          variant="secondary"
          onPress={() => void pickManifestPhoto()}
          disabled={uploadingPhoto}
          testID="load-manifest-pick-gallery"
        />
        <Button
          label={uploadingPhoto ? 'Subiendo foto...' : 'Sacar foto del remito'}
          variant="secondary"
          onPress={() => void captureManifestPhoto()}
          disabled={uploadingPhoto}
          testID="load-manifest-capture-camera"
        />
        {photoRef.length > 0 && (
          <View style={styles.photoPreviewWrap}>
            <Text style={styles.apiHint}>Foto adjunta:</Text>
            <Image
              source={{ uri: photoRef }}
              style={styles.photoPreview}
              resizeMode="cover"
              testID="load-manifest-photo-preview"
            />
          </View>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Nota (opcional)</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="Nota (opcional)"
          testID="load-manifest-note"
        />
      </Card>

      <Card style={styles.card}>
        <Button
          label={saving ? 'Guardando...' : 'Guardar remito'}
          onPress={() => void saveManifest()}
          disabled={saving || !truck}
          testID="load-manifest-save-button"
        />
        <FeedbackBanner message={message} tone={messageTone} />
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tag: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: spacing.sm,
  },
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
  assignedTruck: {
    fontWeight: '600',
    marginBottom: 8,
  },
  truckProblem: {
    marginBottom: 8,
  },
  apiHint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  photoPreviewWrap: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  photoPreview: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginTop: spacing.xs,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  productName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
});
