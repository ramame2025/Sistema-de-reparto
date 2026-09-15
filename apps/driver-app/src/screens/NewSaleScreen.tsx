import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { File, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import {
  deriveSaleKind,
  findUnitPrice,
  priceSaleItems,
  type CreateSaleInput,
  type CustomerType,
  type PaymentMethod,
  type ProductCode,
  type RecordEmptyVisitInput,
  type SaleReturnItemInput,
  validateCreateSaleInput,
  validateRecordEmptyVisitInput,
} from '@distribuidor/shared';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CustomerCard } from '../components/CustomerCard';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { ProductRow } from '../components/ProductRow';
import { SaleFooterBar } from '../components/SaleFooterBar';
import { SaleHeader } from '../components/SaleHeader';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionLabel } from '../components/SectionLabel';
import { SegmentedPills } from '../components/SegmentedPills';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useTruck } from '../context/TruckContext';
import { useCatalog } from '../context/CatalogContext';
import type { NewSaleStackParamList } from '../navigation/NewSaleStack';
import { ApiError } from '../services/apiClient';
import { API_URL } from '../services/config';
import { captureDeviceLocation } from '../services/location';
import { createsDebtOf, driverErrorMessage } from '../services/paymentMethods';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';

type NewSaleScreenNavigationProp = NativeStackNavigationProp<NewSaleStackParamList, 'Sale'>;

/**
 * Ya no puede ser una constante con las cuatro claves fijas: el catalogo lo
 * define el admin en runtime. Una cantidad ausente se lee como 0.
 */
const EMPTY_QUANTITIES: Record<ProductCode, number> = {};

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  final: 'Final',
  comercio: 'Comercio',
  distribuidor: 'Distribuidor',
};

const buildClientGeneratedId = () =>
  `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * Carga de una venta, en una sola pantalla con una sola accion.
 *
 * Dos cosas que antes eran campos de este formulario ya no lo son. El nombre
 * del cliente y su tipo salen del padron que administra el admin, nunca de lo
 * que el chofer tipee: el tipo es lo que elige la lista de precios, asi que
 * dejarlo a mano ponia el precio en manos del chofer. Y editar/anular se
 * fueron al historial, donde aplican a la venta que el chofer elige y no a la
 * ultima que quedo en memoria de esta pantalla.
 *
 * La visita sin venta (churn) sobrevive, pero como estado del boton del pie en
 * lugar de una tarjeta aparte: sin productos y con el envase marcado, la unica
 * accion de la pantalla pasa a ser "Registrar devolucion". Sigue siendo el
 * endpoint distinto que siempre fue.
 */
export function NewSaleScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    trySendSale,
    enqueueSale,
    trySendEmptyVisit,
    enqueueEmptyVisit,
    refreshDaySummary,
    daySummary,
    pendingSales,
  } = useSync();
  const { username, requireAuthToken } = useAuth();
  const { truck, status: truckStatus, error: truckError } = useTruck();
  const navigation = useNavigation<NewSaleScreenNavigationProp>();
  const route = useRoute<RouteProp<NewSaleStackParamList, 'Sale'>>();

  // `undefined` hasta que el chofer elige un cliente del padron. Sin tipo no
  // hay lista de precios, y por eso tampoco hay total ni venta que guardar.
  const [customerType, setCustomerType] = useState<CustomerType | undefined>(undefined);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  // Lo que el chofer ELIGIO, que no es lo mismo que lo que esta seleccionado:
  // `undefined` mientras no toco nada. El medio efectivo se deriva mas abajo.
  const [chosenPaymentMethod, setChosenPaymentMethod] = useState<
    PaymentMethod | undefined
  >(undefined);
  const {
    products,
    prices,
    paymentMethods,
    stale: pricesAreStale,
    canSell,
  } = useCatalog();
  const [quantities, setQuantities] = useState<Record<ProductCode, number>>(EMPTY_QUANTITIES);
  // Lo que VUELVE de la calle, en dos listas separadas y por producto.
  //
  // Dos listas y no un motivo por fila: un mismo producto puede tener las dos
  // cosas a la vez -- te devuelven un vacio de 10kg Y te cambian otro de 10kg
  // fallado -- y con un motivo por linea eso no se expresa sin duplicar filas.
  const [returnedQuantities, setReturnedQuantities] =
    useState<Record<ProductCode, number>>(EMPTY_QUANTITIES);
  // El numero de un cambio por falla dice DOS cosas al mismo tiempo: la unidad
  // que entra y la de reemplazo que sale del camion. Es un solo estado para
  // que el 1 a 1 no se pueda romper (D6b).
  const [swappedQuantities, setSwappedQuantities] =
    useState<Record<ProductCode, number>>(EMPTY_QUANTITIES);
  // La seccion arranca cerrada: la mayoria de las visitas no devuelven nada.
  const [returnsOpen, setReturnsOpen] = useState(false);
  // '' = nunca tocado (se omite del payload, igual criterio que
  // containerReturned). Solo se completa cuando la foto termina de subirse.
  const [paymentProofRef, setPaymentProofRef] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordingVisit, setRecordingVisit] = useState(false);
  // Candado SINCRONICO contra el doble-tap. `saving`/`recordingVisit` son
  // estado de React (asincrono): entre el tap y el re-render que pinta el
  // boton gris caben varios taps mas, y cada uno dispara otra venta con su
  // propio clientGeneratedId. Un ref se setea en el acto, sin esperar render,
  // asi que corta la reentrancy antes de que empiece el await del GPS.
  const submittingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');
  const [lastSale, setLastSale] = useState<{ customerName: string; total: number } | null>(null);

  // Syncs a customer picked in CustomerPickerScreen back into local state
  // (Phase 6 PR2, docs/plans/customer-picker-proximity.md, "Data Flow"):
  // fires whenever navigation returns to this screen with a new
  // pickedCustomer param.
  useEffect(() => {
    const pickedCustomer = route.params?.pickedCustomer;
    if (!pickedCustomer) {
      return;
    }

    setCustomerId(pickedCustomer.id);
    setCustomerName(pickedCustomer.name);
    setCustomerType(pickedCustomer.customerType);
  }, [route.params?.pickedCustomer]);

  const paymentOptions = useMemo(
    () =>
      paymentMethods.map((method) => ({
        value: method.code,
        label: method.name,
      })),
    [paymentMethods],
  );

  /**
   * Deja elegido el primer medio de pago activo en cuanto el catalogo llega, y
   * corrige la eleccion si el medio seleccionado deja de estar disponible (una
   * baja que entra en la sincronizacion del medio del turno).
   *
   * Antes esto era `useState('efectivo')`: la pantalla asumia que el efectivo
   * existia y estaba activo. Ahora eso lo decide la tabla.
   */
  /**
   * El medio de pago efectivamente seleccionado: lo que el chofer eligio, o el
   * primero del catalogo si todavia no eligio nada -- o si lo que habia
   * elegido dejo de estar disponible (una baja que entra en la sincronizacion
   * del medio del turno).
   *
   * Se DERIVA en el render en vez de sincronizarse con un efecto. Un efecto
   * aca significaba una actualizacion de estado extra despues de cada montaje,
   * y eso rompia el test de geolocalizacion con timers falsos: React
   * reagendaba trabajo mientras `advanceTimersByTimeAsync` adelantaba el
   * reloj, y los dos giraban para siempre. Derivarlo no tiene ese problema
   * porque no hay nada que sincronizar.
   */
  const selectedPaymentMethod = useMemo(() => {
    const chosen = paymentMethods.find(
      (method) => method.code === chosenPaymentMethod,
    );
    return chosen ?? paymentMethods[0];
  }, [paymentMethods, chosenPaymentMethod]);

  const paymentMethod = selectedPaymentMethod?.code;

  // La regla de comprobante sale del medio de pago, no de comparar el codigo
  // contra el string 'efectivo' como se hacia hasta ahora.
  const proofPolicy = selectedPaymentMethod?.proofPolicy ?? 'none';
  const proofRequired = proofPolicy === 'required';

  // Si el medio elegido deja al cliente debiendo. Se pregunta por la bandera
  // del catalogo, nunca comparando el codigo contra 'cuenta_corriente': el dia
  // que el duenio agregue otro medio a cuenta, esta pantalla ya lo entiende.
  const paymentCreatesDebt = createsDebtOf(paymentMethods, paymentMethod);

  // Una deuda tiene que tener un deudor, y el deudor tiene que ser una ficha
  // del padron. Un nombre suelto -- el que queda cuando un alta rapida no
  // llego a grabarse -- alcanza para una venta al contado, pero no para una a
  // cuenta: despues no hay a quien cobrarle.
  const debtNeedsDirectoryCustomer = paymentCreatesDebt && !customerId;

  const paymentMethodName = selectedPaymentMethod?.name ?? 'Este medio de pago';

  const currentItems = useMemo(
    () =>
      products
        .filter((product) => (quantities[product.code] ?? 0) > 0)
        .map((product) => ({
          productCode: product.code,
          quantity: quantities[product.code],
        })),
    [products, quantities],
  );

  /**
   * Las dos listas de lo que vuelve, en la forma que viaja en el payload.
   * Misma construccion que `currentItems`, para que las tres se lean igual.
   */
  const buildReturnLines = (source: Record<ProductCode, number>): SaleReturnItemInput[] =>
    products
      .filter((product) => (source[product.code] ?? 0) > 0)
      .map((product) => ({ productCode: product.code, quantity: source[product.code] }));

  const returnedItems = useMemo(
    () => buildReturnLines(returnedQuantities),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildReturnLines es puro sobre products
    [products, returnedQuantities],
  );
  const swappedItems = useMemo(
    () => buildReturnLines(swappedQuantities),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildReturnLines es puro sobre products
    [products, swappedQuantities],
  );

  /**
   * Que fue esta visita, derivado de lo que quedo cargado y no de un control
   * que el chofer prenda: la misma funcion pura que usa el servidor al grabar.
   * Sin esto la pantalla tendria su propia opinion sobre el `kind`, y esa
   * divergencia es la que hace que el pie prometa una cosa y se grabe otra.
   */
  const saleKind = useMemo(
    () => deriveSaleKind({ items: currentItems, returnedItems, swappedItems }),
    [currentItems, returnedItems, swappedItems],
  );

  // Con los precios que vinieron de la API, no con una tabla compilada dentro
  // de la app, y por la MISMA funcion que usa el servidor al grabar: esta
  // pantalla cotizaba con su propia cuenta, y esa divergencia es plata.
  //
  // `null` = todavia no hay nada que cotizar (sin catalogo o sin cliente
  // elegido), que es distinto de "no se puede cotizar".
  const pricedSale = useMemo(() => {
    if (!prices || !customerType) {
      return null;
    }
    return priceSaleItems(customerType, currentItems, prices);
  }, [customerType, currentItems, prices]);

  // Al tipo de cliente elegido le faltan precios para lo que hay cargado. Es
  // un estado legitimo -- un tipo de cliente se crea antes de tener todos sus
  // precios -- pero esta venta no se puede cobrar hasta que se completen.
  const cannotQuoteCustomer = pricedSale !== null && !pricedSale.ok;

  // `undefined` (no cero) cuando falta un precio: el pie muestra un guion en
  // vez de un importe que miente por defecto.
  const total = pricedSale === null ? 0 : pricedSale.ok ? pricedSale.total : undefined;

  const unitPriceOf = (productCode: ProductCode): number | undefined => {
    if (!prices || !customerType) {
      return undefined;
    }
    const result = findUnitPrice(prices, customerType, productCode);
    return result.ok ? result.unitPrice : undefined;
  };

  const changeQty = (productCode: ProductCode, delta: number) => {
    setQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, (previous[productCode] ?? 0) + delta),
    }));
  };

  const changeReturnedQty = (productCode: ProductCode, delta: number) => {
    setReturnedQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, (previous[productCode] ?? 0) + delta),
    }));
  };

  const changeSwappedQty = (productCode: ProductCode, delta: number) => {
    setSwappedQuantities((previous) => ({
      ...previous,
      [productCode]: Math.max(0, (previous[productCode] ?? 0) + delta),
    }));
  };

  const showMessage = (text: string, tone: FeedbackTone) => {
    setMessage(text);
    setMessageTone(tone);
  };

  /**
   * Adaptado de ExpensesScreen.pickReceiptImage/captureReceiptImage/
   * uploadReceipt: mismo mecanismo (`/uploads/receipt`, reusado sin cambios
   * por decision del roadmap), mismo patron de estado local. Solo se
   * renderiza cuando la `proofPolicy` del medio elegido no es `none`.
   */
  const uploadPaymentProof = async (uri: string) => {
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

  const pickPaymentProofImage = async () => {
    try {
      setUploadingProof(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permiso de galeria requerido para adjuntar el comprobante.', 'error');
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

      const uploadedUrl = await uploadPaymentProof(result.assets[0].uri);
      setPaymentProofRef(uploadedUrl);
      showMessage('Comprobante de pago cargado correctamente.', 'success');
    } catch {
      showMessage('No se pudo subir el comprobante de pago.', 'error');
    } finally {
      setUploadingProof(false);
    }
  };

  const capturePaymentProofImage = async () => {
    try {
      setUploadingProof(true);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permiso de camara requerido para sacar el comprobante.', 'error');
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

      const uploadedUrl = await uploadPaymentProof(result.assets[0].uri);
      setPaymentProofRef(uploadedUrl);
      showMessage('Comprobante de pago capturado y cargado correctamente.', 'success');
    } catch {
      showMessage('No se pudo capturar/subir el comprobante de pago.', 'error');
    } finally {
      setUploadingProof(false);
    }
  };

  /** Deja la pantalla lista para la proxima venta sin perder el cliente. */
  const resetAfterSale = () => {
    setQuantities(EMPTY_QUANTITIES);
    setReturnedQuantities(EMPTY_QUANTITIES);
    setSwappedQuantities(EMPTY_QUANTITIES);
    setPaymentProofRef('');
  };

  const saveSale = async () => {
    // Lo que esta visita fue, derivado del contenido. El mismo valor decide el
    // rotulo del pie, que barreras corren y como se cuenta el desenlace.
    const isSale = saleKind === 'sale';
    // Primera linea: si ya hay una venta en vuelo, este tap no existe. Corta
    // antes de generar un clientGeneratedId nuevo y antes del await del GPS,
    // que es la ventana de ~8s donde el chofer alcanzaba a apretar 3 o 4
    // veces mas y grababa la venta una vez por tap.
    if (submittingRef.current) {
      return;
    }
    setMessage(null);

    // Sin camion asignado la venta quedaria sin unidad: se corta antes de
    // mandarla o encolarla (y antes de pedir el permiso de ubicacion, que no
    // tendria sentido pedir si la venta ni siquiera va a intentarse).
    if (!truck) {
      showMessage('No podes cargar ventas sin un camion asignado para hoy.', 'error');
      return;
    }

    if (!customerType) {
      showMessage('Elegi un cliente antes de guardar la venta.', 'error');
      return;
    }

    // Las tres barreras de abajo son del COBRO, y por eso valen solo cuando la
    // visita vendio algo. Un cambio por falla no cobra: ni el medio de pago ni
    // el comprobante ni la falta de precios pueden trabarlo, porque el chofer
    // ya hizo el cambio en la calle y volver sin registrarlo es peor que
    // registrarlo sin precio (D4).
    if (isSale) {
      if (currentItems.length === 0) {
        showMessage('Agrega al menos un producto antes de guardar.', 'error');
        return;
      }

      // Sin medio de pago no hay venta que grabar. En la practica solo pasa con
      // el catalogo sin cargar todavia, que es justamente cuando `canSell` ya
      // bloquea la pantalla; es el cinturon ademas de los tiradores.
      if (!paymentMethod) {
        showMessage('Todavia no se cargaron los medios de pago.', 'error');
        return;
      }

      // La unica barrera nueva que trae la tabla: un medio en `required` no se
      // guarda sin comprobante. Ninguno de los cuatro medios semilla nace asi,
      // asi que esto no cambia nada hasta que el duenio lo active.
      if (proofRequired && !paymentProofRef) {
        showMessage(
          `Adjunta el comprobante: ${selectedPaymentMethod?.name ?? 'este medio de pago'} lo exige.`,
          'error',
        );
        return;
      }

      // Ultima barrera antes de armar el payload: sin precio no hay importe que
      // cobrar, y grabar la venta igual la congelaria en cero. Va antes de tomar
      // el candado porque una venta rechazada aca no llego a intentarse.
      if (!pricedSale?.ok) {
        showMessage(
          'A este cliente todavia no se le puede cotizar: faltan precios de su tipo.',
          'error',
        );
        return;
      }
    }

    // A partir de aca la venta va a intentarse de verdad. Tomamos el candado
    // sincronico y pintamos el boton ANTES del await del GPS, no despues: ese
    // era el bug -- setSaving(true) vivia recien despues de captureDeviceLocation.
    submittingRef.current = true;
    setSaving(true);

    // Punto en el tiempo (point-in-time-geolocation): se captura aca, justo
    // antes de armar el payload final, no al montar la pantalla -- ver el
    // comentario de captureDeviceLocation (services/location.ts).
    const location = await captureDeviceLocation();

    const payload: CreateSaleInput = {
      clientGeneratedId: buildClientGeneratedId(),
      // Cuando ocurre la venta, que es lo unico que este telefono sabe y el
      // servidor no: si la venta se encola, va a llegar horas o dias despues.
      // De esta fecha depende a que precio se graba y en que dia se cuenta.
      occurredAt: new Date().toISOString(),
      driverName: username,
      truckId: truck.truckId,
      truckCode: truck.code,
      customerName,
      customerType,
      // Va siempre porque el tipo lo exige, y el servidor lo ignora cuando la
      // visita no vendio nada: un payload de cambio con un medio de pago
      // adentro no graba un cobro, se lo descarta server-side (D3).
      paymentMethod,
      items: currentItems,
      // Las dos listas de lo que volvio. Se omiten (no la clave) cuando no
      // volvio nada, con el mismo criterio que el resto del payload.
      ...(returnedItems.length > 0 ? { returnedItems } : {}),
      ...(swappedItems.length > 0 ? { swappedItems } : {}),
      // Omitido (no la key) si nunca se subio una foto -- mismo criterio que
      // containerReturned, no un string vacio.
      ...(paymentProofRef ? { paymentProofRef } : {}),
      // Omitido (no las keys) si no hubo lectura exitosa -- permiso denegado,
      // sin fix de GPS, o timeout, mismo criterio que arriba.
      ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
      // Omitido (no la key) si no hay cliente del padron detras.
      ...(customerId ? { customerId } : {}),
    };

    // Reuses the shared validator instead of hand-rolling a customerName
    // check: catches a blank/whitespace-only name client-side, before it
    // either hits the API (400) or, worse, gets stuck forever in the
    // offline sync queue with no remediation UI.
    //
    // El catalogo va como segundo argumento porque la regla del deudor no se
    // puede contestar sin el: `createsDebt` vive en la tabla de medios de
    // pago, no en el payload. Sin pasarlo, una venta a cuenta sin cliente se
    // encolaria sin senal y recien el servidor la rechazaria -- horas o dias
    // despues, con el chofer lejos del cliente.
    const validationErrors = validateCreateSaleInput(payload, paymentMethods);
    if (validationErrors.length > 0) {
      // El motivo, en el idioma del chofer: el string crudo del validador
      // habla en ingles y nombra un campo que esta pantalla no muestra.
      showMessage(
        driverErrorMessage(
          validationErrors[0],
          paymentMethodName,
          'elegí un cliente del padrón antes de guardar.',
        ),
        'error',
      );
      submittingRef.current = false;
      setSaving(false);
      return;
    }

    // Un cambio no cobro nada: su importe es cero y eso es la verdad, no un
    // precio que falto.
    const soldTotal = isSale && pricedSale?.ok ? pricedSale.total : 0;

    try {
      await trySendSale(payload);
      if (!isSale) {
        // Copia deliberadamente distinta de la de una venta: el chofer no
        // tiene que confundir un cambio con haber vendido.
        showMessage('Cambio registrado. No se cobro nada.', 'success');
        resetAfterSale();
        await refreshDaySummary();
        return;
      }
      setLastSale({ customerName, total: soldTotal });
      resetAfterSale();
      await refreshDaySummary();
      // El resultado se cuenta en su propia pantalla, no en una linea de
      // banner: "el servidor la tiene" y "sigue en el telefono" son dos
      // desenlaces distintos, y confundirlos hace que el chofer cargue la
      // misma venta dos veces.
      navigation.navigate('SaleResult', {
        outcome: 'sent',
        customerName,
        total: soldTotal,
        paymentMethod,
      });
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'No se pudo guardar en API';
      const queueLength = await enqueueSale(payload, cause);
      if (!isSale) {
        showMessage(
          `Sin conexion. Cambio en cola offline (${queueLength} pendientes).`,
          'warning',
        );
        resetAfterSale();
        return;
      }
      setLastSale({ customerName, total: soldTotal });
      resetAfterSale();
      navigation.navigate('SaleResult', {
        outcome: 'queued',
        customerName,
        total: soldTotal,
        paymentMethod,
      });
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  /**
   * Accion deliberadamente separada de saveSale: registra una visita sin
   * venta (envase devuelto, nada entregado). NO requiere items ni forma de
   * pago -- RecordEmptyVisitInput ni siquiera tiene esos campos. Reusa el
   * mismo mecanismo online-primero-despues-cola que saveSale
   * (trySendEmptyVisit/enqueueEmptyVisit, gemelos de trySendSale/enqueueSale
   * en SyncContext) para que tambien funcione sin señal.
   */
  const recordVisit = async () => {
    // Mismo candado que saveSale: es el mismo boton del pie, y un doble-tap
    // aca encolaba/mandaba la visita sin venta dos veces.
    if (submittingRef.current) {
      return;
    }
    setMessage(null);

    if (!truck) {
      showMessage('No podes registrar visitas sin un camion asignado para hoy.', 'error');
      return;
    }

    if (!customerType) {
      showMessage('Elegi un cliente antes de registrar la visita.', 'error');
      return;
    }

    const payload: RecordEmptyVisitInput = {
      clientGeneratedId: buildClientGeneratedId(),
      occurredAt: new Date().toISOString(),
      driverName: username,
      truckId: truck.truckId,
      truckCode: truck.code,
      customerName,
      customerType,
      // El atajo ahora tambien dice CUANTOS vacios volvieron y de que
      // producto, en vez de dejar solo el booleano historico.
      ...(returnedItems.length > 0 ? { returnedItems } : {}),
      ...(customerId ? { customerId } : {}),
    };

    const validationErrors = validateRecordEmptyVisitInput(payload);
    if (validationErrors.length > 0) {
      showMessage(validationErrors[0], 'error');
      return;
    }

    submittingRef.current = true;

    try {
      setRecordingVisit(true);
      const visitId = await trySendEmptyVisit(payload);
      // Copia deliberadamente distinta de la de una venta normal: el chofer
      // no debe confundir esto con "vendi algo".
      showMessage(`Visita sin venta registrada. ID: ${visitId}`, 'success');
      resetAfterSale();
      await refreshDaySummary();
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'No se pudo registrar la visita';
      const queueLength = await enqueueEmptyVisit(payload, cause);
      showMessage(
        `Sin conexion. Visita sin venta en cola offline (${queueLength} pendientes).`,
        'warning',
      );
      resetAfterSale();
    } finally {
      submittingRef.current = false;
      setRecordingVisit(false);
    }
  };

  /**
   * La pantalla tiene una sola accion, y su texto es lo que explica por que
   * no esta disponible. Un boton gris sin motivo deja al chofer sin saber que
   * le falta; cada rama de aca nombra exactamente lo que hay que resolver.
   */
  const footerAction = useMemo(() => {
    if (saving) {
      return { label: 'Guardando...', disabled: true, run: () => {} };
    }
    if (recordingVisit) {
      return { label: 'Registrando...', disabled: true, run: () => {} };
    }
    if (!canSell) {
      return { label: 'Sin precios — sincronizá', disabled: true, run: () => {} };
    }
    if (!truck) {
      return { label: 'Sin camión asignado', disabled: true, run: () => {} };
    }
    if (!customerName) {
      return { label: 'Elegí un cliente', disabled: true, run: () => {} };
    }
    if (currentItems.length === 0) {
      // Nada vendido: la accion la decide lo que volvio. Solo falladas es un
      // cambio y va por el camino general; solo vacios es la visita sin venta
      // de siempre, por su endpoint de siempre. Es el `kind` derivado el que
      // manda, la misma respuesta que va a dar el servidor al grabar.
      if (saleKind === 'swap') {
        return {
          label: 'Registrar cambio',
          disabled: false,
          run: () => void saveSale(),
        };
      }
      if (returnedItems.length > 0) {
        return {
          label: 'Registrar devolución',
          disabled: false,
          run: () => void recordVisit(),
        };
      }
      return { label: 'Agregá productos', disabled: true, run: () => {} };
    }
    // Despues de las dos ramas sin venta a proposito: ni una devolucion ni un
    // cambio tienen nada que cotizar, asi que la falta de precios no puede
    // bloquearlos.
    if (cannotQuoteCustomer) {
      return { label: 'Sin precios para este cliente', disabled: true, run: () => {} };
    }
    return { label: 'Guardar venta', disabled: false, run: () => void saveSale() };
  }, [
    saving,
    recordingVisit,
    canSell,
    truck,
    customerName,
    currentItems.length,
    saleKind,
    returnedItems.length,
    cannotQuoteCustomer,
    saveSale,
    recordVisit,
  ]);

  /**
   * D10: el cobro se bloquea cuando no hay nada que cobrar, y eso lo contesta
   * el total y nada mas.
   *
   * NO se bloquea por "hay envase devuelto" ni por "hay un cambio": el caso
   * mas comun del dia es una venta normal CON envase devuelto, y una visita
   * mixta -- vendio dos y ademas cambio una fallada -- tiene plata que cobrar
   * por las dos vendidas. Los reemplazos entran con precio cero y no suman,
   * asi que una visita que solo cambio falladas da cero sola.
   *
   * `undefined` (falta un precio) no es cero: ahi el bloqueo no lo pone esta
   * regla sino el pie, que ya dice que a este cliente no se le puede cotizar.
   */
  const chargeBlocked = total === 0;

  return (
    <ScreenContainer
      testID="new-sale-screen"
      scroll
      footer={
        <SaleFooterBar
          total={total}
          actionLabel={footerAction.label}
          onPress={footerAction.run}
          disabled={footerAction.disabled}
        />
      }
      header={
        <SaleHeader
          testID="new-sale-header"
          saleNumber={daySummary.activeCount + 1}
          truckCode={truck?.code}
          queuedCount={pendingSales.length}
        />
      }
    >
      {!truck && truckStatus === 'error' && (
        <FeedbackBanner
          testID="new-sale-truck-error"
          message={`${truckError} Revisa la conexion y volve a intentar.`}
          tone="error"
        />
      )}
      {!truck && truckStatus !== 'error' && truckStatus !== 'loading' && (
        <FeedbackBanner
          testID="new-sale-no-truck"
          message="Hoy no tenes un camion asignado. Hablá con el administrador antes de cargar ventas."
          tone="error"
        />
      )}
      {pricesAreStale && (
        <FeedbackBanner
          testID="new-sale-stale-prices"
          message="Sin conexion: precios de la ultima vez que sincronizaste. Pueden estar desactualizados."
          tone="warning"
        />
      )}
      {cannotQuoteCustomer && (
        <FeedbackBanner
          testID="new-sale-unpriced-customer"
          message="A este cliente todavia no se le puede cotizar: faltan precios de su tipo. Hablá con el administrador."
          tone="error"
        />
      )}

      {/*
        El aviso aparece en cuanto el chofer elige el medio, no recien al
        apretar Guardar: un nombre suelto con un medio a cuenta es un estado
        ambiguo, y dejarlo sin nombrar hasta el final le hace cargar la venta
        entera para enterarse despues. Va pegado a la tarjeta del cliente, que
        es la salida: un toque y elige del padron.
      */}
      {debtNeedsDirectoryCustomer && (
        <FeedbackBanner
          testID="new-sale-debt-needs-customer"
          message={`${paymentMethodName} queda como deuda del cliente. Elegí un cliente del padrón para poder guardar esta venta.`}
          tone="warning"
        />
      )}

      <CustomerCard
        testID="new-sale-customer-card"
        name={customerName || undefined}
        subtitle={customerType ? CUSTOMER_TYPE_LABELS[customerType] : undefined}
        onPress={() => navigation.navigate('CustomerPicker')}
      />

      <View style={styles.products}>
        {products.map((product) => (
          <ProductRow
            key={product.code}
            code={product.code}
            name={product.name}
            unitPrice={unitPriceOf(product.code)}
            quantity={quantities[product.code] ?? 0}
            onIncrement={() => changeQty(product.code, 1)}
            onDecrement={() => changeQty(product.code, -1)}
          />
        ))}
      </View>

      {/*
        D6: no hay un modo que prender, hay una seccion mas para cargar
        cantidades. Colapsada por defecto porque la mayoria de las visitas no
        devuelven nada, y una seccion siempre abierta es ruido en la pantalla
        que mas se usa del dia.
      */}
      
      <View style={styles.field}>
        <SectionLabel>COBRO</SectionLabel>
        {chargeBlocked && (
          <Text style={styles.hint} testID="new-sale-charge-blocked">
            Esta visita no cobra: no hay nada vendido.
          </Text>
        )}
        <SegmentedPills
          options={paymentOptions}
          // D10: sin nada que cobrar, la fila se bloquea en vez de esconderse.
          // Un control que desaparece deja al chofer sin saber que habia ahi.
          disabled={chargeBlocked}
          // '' mientras el catalogo no llego: ninguna pastilla queda marcada,
          // que es la verdad. El efecto de arriba elige la primera apenas hay
          // medios, y `canSell` ya bloquea la venta hasta entonces.
          value={paymentMethod ?? ''}
          onChange={setChosenPaymentMethod}
          // Tres por fila: estirados en un solo renglon, "Cuenta corriente" y
          // "Transferencia" quedan ilegibles, y el catalogo puede crecer.
          maxPerRow={3}
          testID="new-sale-payment"
        />
      </View>

      <View style={styles.returnsBlock}>
        {/*
          El encabezado va con banda propia. Sin ella la seccion tenia el
          mismo fondo y el mismo tipo de titulo que PRODUCTOS y COBRO, y se
          perdia justo cuando el chofer la busca apurado con el cliente
          adelante.
        */}
        <View style={styles.returnsHeader} testID="new-sale-returns-header">
          <SectionLabel>DEVOLUCIONES Y CAMBIOS</SectionLabel>
          <Button
            label={returnsOpen ? 'Ocultar' : 'Mostrar'}
            variant="secondary"
            onPress={() => setReturnsOpen((open) => !open)}
            testID="new-sale-returns-toggle"
          />
        </View>

        {returnsOpen && (
          <View style={styles.returns}>
            <Text style={styles.hint}>Envases vacíos que vuelven</Text>
            <View style={styles.products}>
              {products.map((product) => (
                <ProductRow
                  key={`returned-${product.code}`}
                  code={product.code}
                  name={product.name}
                  quantity={returnedQuantities[product.code] ?? 0}
                  testIDPrefix="returned-row"
                  onIncrement={() => changeReturnedQty(product.code, 1)}
                  onDecrement={() => changeReturnedQty(product.code, -1)}
                />
              ))}
            </View>

            <Text style={styles.hint}>Cambios por falla</Text>
            <View style={styles.products}>
              {products.map((product) => (
                <ProductRow
                  key={`swapped-${product.code}`}
                  code={product.code}
                  name={product.name}
                  quantity={swappedQuantities[product.code] ?? 0}
                  testIDPrefix="swapped-row"
                  onIncrement={() => changeSwappedQty(product.code, 1)}
                  onDecrement={() => changeSwappedQty(product.code, -1)}
                />
              ))}
            </View>
            {/*
              El numero de arriba dice las dos cosas a la vez, y el chofer
              tiene que verlo escrito: entra la fallada y sale el reemplazo,
              sin cargo. Un solo numero es lo que hace que el 1 a 1 no se
              pueda romper (D6b).
            */}
            <Text style={styles.hint} testID="new-sale-swap-hint">
              Sale del camión un reemplazo por cada unidad fallada, sin cargo.
            </Text>
          </View>
        )}
      </View>

      {proofPolicy !== 'none' && (
        <View style={styles.proof}>
          <View style={styles.sectionRow}>
            <SectionLabel>COMPROBANTE</SectionLabel>
            <Text style={styles.optional}>
              {proofRequired ? 'obligatorio' : 'opcional'}
            </Text>
          </View>
          <View style={styles.proofButtons}>
            <View style={styles.proofButton}>
              <Button
                label={uploadingProof ? 'Subiendo...' : 'Sacar foto'}
                variant="secondary"
                onPress={() => void capturePaymentProofImage()}
                disabled={uploadingProof}
                testID="new-sale-payment-proof-capture-camera"
              />
            </View>
            <View style={styles.proofButton}>
              <Button
                label={uploadingProof ? 'Subiendo...' : 'Galería'}
                variant="secondary"
                onPress={() => void pickPaymentProofImage()}
                disabled={uploadingProof}
                testID="new-sale-payment-proof-pick-gallery"
              />
            </View>
          </View>
          {paymentProofRef.length > 0 && (
            <Card>
              <Text style={styles.hint}>Comprobante adjunto:</Text>
              <Image
                source={{ uri: paymentProofRef }}
                style={styles.receiptPreview}
                resizeMode="cover"
              />
            </Card>
          )}
        </View>
      )}

      {/*
        El atajo del caso comun. Escribe en la MISMA lista que la seccion y se
        muestra prendido si esa lista tiene algo: dos estados paralelos sobre
        el mismo hecho garantizan que algun dia digan cosas distintas.
      */}
      
      {lastSale && (
        <Text style={styles.lastSale} testID="new-sale-last-sale">
          Última: {lastSale.customerName} · {formatArs(lastSale.total)}
        </Text>
      )}

      <FeedbackBanner message={message} tone={messageTone} />
    </ScreenContainer>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  products: {
    gap: spacing.sm,
  },
  // Un bloque "label + control": el label pega con su control (gap chico), y
  // la separacion con el bloque siguiente la pone el `gap` de ScreenContainer.
  field: {
    gap: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  optional: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  proof: {
    gap: spacing.sm,
  },
  returns: {
    gap: spacing.sm,
  },
  // El bloque entero lleva el fondo, no solo el titulo: asi el encabezado, el
  // atajo y el detalle se leen como una sola cosa y no como tres sueltas.
  returnsBlock: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.sm,
  },
  returnsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  proofButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  proofButton: {
    flex: 1,
  },
  hint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  receiptPreview: {
    width: '100%',
    height: 160,
    borderRadius: radii.md,
    marginTop: spacing.xs,
  },
  lastSale: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
});
