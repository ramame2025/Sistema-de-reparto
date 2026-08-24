import { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { File, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import {
  EXPENSE_CATEGORIES,
  type CreateExpenseInput,
  type ExpenseCategory,
} from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/apiClient';
import { API_URL } from '../services/config';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

/**
 * Relocated verbatim from the pre-PR5 App.tsx "Registrar gasto" card.
 * `saveExpense()` has NO offline-queue fallback on failure — unlike
 * NewSaleScreen's sale flow, expenses were never part of the offline-sync
 * scope (design's SyncContext consumer contract lists only NewSaleScreen
 * for `trySendSale`/`enqueueSale`; confirmed against the original App.tsx,
 * whose `saveExpense` catch block only sets an error message, no
 * `enqueueSale`-equivalent branch). Receipt upload goes through
 * expo-file-system's `File.upload()` (a native multipart task) rather than
 * `AuthContext.api.postForm` -- see `uploadReceipt` below for why.
 */
export function ExpensesScreen() {
  const { api, username, requireAuthToken } = useAuth();

  const [category, setCategory] = useState<ExpenseCategory>('combustible');
  const [amount, setAmount] = useState('0');
  const [note, setNote] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');

  const showMessage = (text: string, tone: FeedbackTone) => {
    setMessage(text);
    setMessageTone(tone);
  };

  const saveExpense = async () => {
    const payload: CreateExpenseInput = {
      driverName: username,
      category,
      amount: Number(amount),
      note: note || undefined,
      receiptRef: receiptRef || undefined,
    };

    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      showMessage('El monto del gasto debe ser mayor a 0.', 'error');
      return;
    }

    try {
      setSaving(true);
      await api.post('/expenses', payload);
      setAmount('0');
      setNote('');
      setReceiptRef('');
      showMessage('Gasto guardado correctamente.', 'success');
    } catch (error) {
      const cause = error instanceof ApiError ? error.message : 'No se pudo guardar el gasto.';
      showMessage(cause, 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadReceipt = async (uri: string) => {
    // Uses expo-file-system's File.upload() (native multipart task) instead
    // of building a JS FormData -- the RN {uri,name,type} FormData shorthand
    // throws "Unsupported FormDataPart implementation", and reconstructing a
    // Blob from the file's bytes throws "Creating blobs from 'ArrayBuffer'
    // ... are not supported" on this RN/Expo version. File.upload() bypasses
    // both by handling the multipart encoding natively.
    const localFile = new File(uri);
    const token = requireAuthToken();
    const result = await localFile.upload(`${API_URL}/uploads/receipt`, {
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'image/jpeg',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (result.status < 200 || result.status >= 300) {
      throw new ApiError(result.status, result.body || `API ${result.status}`);
    }

    const uploaded = JSON.parse(result.body) as { url: string };
    return uploaded.url;
  };

  const pickReceiptImage = async () => {
    try {
      setUploadingReceipt(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permiso de galeria requerido para adjuntar comprobante.', 'error');
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

      const uploadedUrl = await uploadReceipt(result.assets[0].uri);
      setReceiptRef(uploadedUrl);
      showMessage('Comprobante cargado correctamente.', 'success');
    } catch {
      showMessage('No se pudo subir el comprobante.', 'error');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const captureReceiptImage = async () => {
    try {
      setUploadingReceipt(true);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permiso de camara requerido para sacar comprobante.', 'error');
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

      const uploadedUrl = await uploadReceipt(result.assets[0].uri);
      setReceiptRef(uploadedUrl);
      showMessage('Comprobante capturado y cargado correctamente.', 'success');
    } catch {
      showMessage('No se pudo capturar/subir el comprobante.', 'error');
    } finally {
      setUploadingReceipt(false);
    }
  };

  return (
    <ScreenContainer testID="expenses-screen" scroll>
      <Text style={styles.tag}>Distribuidor · App chofer</Text>

      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Registrar gasto</Text>
        <Text style={styles.apiHint}>Chofer: {username}</Text>

        <Text style={styles.fieldLabel}>Categoria</Text>
        <View style={styles.segmentRow}>
          {EXPENSE_CATEGORIES.map((item) => (
            <Button
              key={item}
              label={item}
              variant={category === item ? 'primary' : 'secondary'}
              onPress={() => setCategory(item)}
            />
          ))}
        </View>

        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="Monto"
          keyboardType="numeric"
          testID="expense-amount"
        />
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="Descripcion (opcional)"
        />
        <Button
          label={uploadingReceipt ? 'Subiendo comprobante...' : 'Adjuntar desde galeria'}
          variant="secondary"
          onPress={() => void pickReceiptImage()}
          disabled={uploadingReceipt}
          testID="expense-pick-gallery"
        />

        <Button
          label={uploadingReceipt ? 'Subiendo comprobante...' : 'Sacar foto comprobante'}
          variant="secondary"
          onPress={() => void captureReceiptImage()}
          disabled={uploadingReceipt}
          testID="expense-capture-camera"
        />

        {receiptRef.length > 0 && (
          <View style={styles.receiptPreviewWrap}>
            <Text style={styles.apiHint}>Comprobante adjunto:</Text>
            <Image
              source={{ uri: receiptRef }}
              style={styles.receiptPreview}
              resizeMode="cover"
              testID="expense-receipt-preview"
            />
          </View>
        )}

        <Button
          label={saving ? 'Guardando gasto...' : 'Guardar gasto'}
          onPress={() => void saveExpense()}
          disabled={saving}
          testID="expense-save-button"
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
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  receiptPreviewWrap: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  receiptPreview: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginTop: spacing.xs,
  },
});
