import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { File, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import {
  EXPENSE_CATEGORIES,
  type CreateExpenseInput,
  type ExpenseCategory,
  type ExpenseRecord,
} from '@distribuidor/shared';
import type { ExpensesStackParamList } from '../navigation/ExpensesStack';
import { AmountField } from '../components/AmountField';
import { EXPENSE_CATEGORY_LABELS } from '../components/ExpenseRow';
import { ExpenseHeader } from '../components/ExpenseHeader';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { ReceiptCard } from '../components/ReceiptCard';
import { SaleFooterBar } from '../components/SaleFooterBar';
import { ScreenContainer } from '../components/ScreenContainer';
import { SegmentedPills } from '../components/SegmentedPills';
import { useTruck } from '../context/TruckContext';
import { summarizeExpenses } from '../services/expenseTotals';
import { formatJornadaTitle } from '../utils/jornada';
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
type ExpensesScreenNavigationProp = NativeStackNavigationProp<
  ExpensesStackParamList,
  'Expenses'
>;

export function ExpensesScreen() {
  const { api, username, requireAuthToken } = useAuth();
  const navigation = useNavigation<ExpensesScreenNavigationProp>();

  const { truck } = useTruck();

  const [category, setCategory] = useState<ExpenseCategory>('combustible');
  // Numero, no texto: el campo grande ya normaliza lo que el chofer tipea, y
  // guardar el string obligaba a reparsearlo en cada lectura.
  const [amount, setAmount] = useState(0);
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

  // Lo gastado hoy encabeza la pantalla mientras se carga el gasto siguiente:
  // el chofer decide distinto sabiendo si lleva $5.000 o $57.000 en el dia.
  const [spentToday, setSpentToday] = useState(0);

  const refreshSpentToday = useCallback(async () => {
    try {
      const response = await api.get<ExpenseRecord[]>('/expenses/mine', { cache: 'no-store' });
      setSpentToday(summarizeExpenses(response).todayTotal);
    } catch {
      // Silencio deliberado, al reves que el resto de la app: este numero es
      // contexto, no el trabajo. Que no cargue no puede tapar el formulario ni
      // impedir registrar el gasto.
    }
  }, [api]);

  useEffect(() => {
    void refreshSpentToday();
  }, [refreshSpentToday]);

  const saveExpense = async () => {
    const payload: CreateExpenseInput = {
      driverName: username,
      category,
      amount,
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
      const hadReceipt = receiptRef.length > 0;
      setAmount(0);
      setNote('');
      setReceiptRef('');
      setMessage(null);
      await refreshSpentToday();
      navigation.navigate('ExpenseResult', { category, amount, hasReceipt: hadReceipt });
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

  const canSave = amount > 0 && !saving;

  return (
    <ScreenContainer
      testID="expenses-screen"
      scroll
      footer={
        <SaleFooterBar
          total={amount}
          totalLabel="GASTO"
          actionLabel={saving ? 'Guardando...' : amount > 0 ? 'Guardar gasto' : 'Poné el monto'}
          onPress={() => void saveExpense()}
          disabled={!canSave}
        />
      }
    >
      <ExpenseHeader
        testID="expenses-header"
        eyebrow={truck ? `NUEVO GASTO · ${truck.code}` : 'NUEVO GASTO'}
        title={formatJornadaTitle(new Date())}
        amount={spentToday}
        amountLabel="gastado hoy"
      />

      <Text style={styles.sectionLabel}>CATEGORÍA</Text>
      <SegmentedPills
        options={EXPENSE_CATEGORIES.map((item) => ({
          value: item,
          label: EXPENSE_CATEGORY_LABELS[item],
        }))}
        value={category}
        onChange={setCategory}
        wrap
        testID="expense-category"
      />

      <Text style={styles.sectionLabel}>MONTO</Text>
      <AmountField value={amount} onChange={setAmount} testID="expense-amount" />

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>COMPROBANTE</Text>
        <Text style={styles.sectionHint}>recomendado</Text>
      </View>
      <ReceiptCard
        receiptRef={receiptRef}
        uploading={uploadingReceipt}
        onCapture={() => void captureReceiptImage()}
        onPickFromGallery={() => void pickReceiptImage()}
        onRemove={() => setReceiptRef('')}
        testID="expense-receipt"
      />

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>DÓNDE FUE</Text>
        <Text style={styles.sectionHint}>opcional</Text>
      </View>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="YPF Ruta 8"
        testID="expense-note"
      />

      <FeedbackBanner message={message} tone={messageTone} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.7,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionHint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
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
