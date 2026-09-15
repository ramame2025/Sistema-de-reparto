# Change: Container Swap — Delivery With No Money

Status: **planned — not implemented**. Decisiones de negocio cerradas con el
dueño el 2026-09-15; queda abierta sólo la pregunta A.

## No, this does not exist yet

The model has a `churn` row that looks close and is not the same thing:

| | Entregamos | Recibimos | Cobramos |
|---|---|---|---|
| `sale` | sí | opcional: envases vacíos | sí |
| `churn` (hoy) | **no** | envases vacíos | no |
| `swap` (esto) | **sí** | **la unidad fallada** | **no** |

Lo que vuelve en un swap **no es un envase vacío**: es una unidad fallada que
no se puede revender y que probablemente haya que reclamarle al proveedor.
Meter las dos cosas en la misma bolsa perdería justamente el dato por el que
se registra el cambio.

`churn` es "pasé, me devolvieron el envase, no compró" — el chofer llega con
el camión igual de lleno que salió (`recordEmptyVisit` fuerza `items: []`,
`total: 0`, `sales.service.ts:262`). Un cambio de envase descarga mercadería
del camión sin que entre plata, y hoy la única forma de registrarlo es como
una venta normal: obliga a elegir medio de pago y le suma plata al día del
chofer, que es exactamente lo que no queremos.

## Lo que el modelo ya resuelve solo

Dos de los tres requisitos salen gratis, y conviene saberlo antes de diseñar
de más:

**El descuento del camión ya funcionaría.** `getTruckStockForDay` suma los
`SaleItem` de toda venta activa **sin filtrar por `kind`**
(`load-manifests.service.ts:146`). Una fila de swap que lleve sus `items`
descuenta del camión sin tocar una línea de esa consulta. Lo mismo del lado
del teléfono: `queuedUnitsByProduct` saltea sólo `kind === 'churn'`
(`truckStock.ts:23`), así que un swap encolado también descuenta — hay que
revisar ese guard igual, porque está escrito como "churn" y no como "lo que
no descarga".

**La plata del chofer tampoco se toca.** `SyncContext` suma `sale.total`
(`:109`) y el dashboard hace lo mismo en `summarize` (`kpis.ts`). Con
`total: 0` el swap no suma un peso a ninguno de los dos.

Lo que **no** sale gratis es todo lo demás: el medio de pago obligatorio, el
precio, que un swap no se cuente como una venta más, y registrar lo que
vuelve.

**Y hay una trampa en ese mismo lugar.** Que `getTruckStockForDay` sume TODA
línea de `SaleItem` sin filtrar es lo que hace gratis el descuento del camión,
y es exactamente lo que prohíbe guardar ahí lo que vuelve:

```ts
this.prisma.saleItem.findMany({
  where: { sale: { truckId, status: 'active', createdAt } },
}),
```

Una unidad que **entra** al camión anotada como `SaleItem` se contaría como
mercadería que **salió**. Los números del chofer dejarían de cerrar contra su
remito de la mañana y nadie sabría por qué. Ver D7.

## Business Decisions To Confirm

1. **Un swap es 1:1 y sin plata**: se entregan N unidades de reemplazo y se
   reciben N falladas del mismo producto, no hay cobro de ninguna clase.
2. **El medio de pago queda bloqueado**, no en un valor "ninguno": no hay pago
   que elegir.
3. **Descuenta del camión** exactamente como una venta.
4. **No suma plata** al día del chofer ni a la facturación.

5. **Se registra qué y cuánto vuelve**, por producto: cuántos envases vacíos
   y cuántas unidades falladas. El booleano `containerReturned` no alcanza.
6. **El cambio es 1 a 1, obligatorio.** Tantas unidades de reemplazo como
   falladas, y del mismo producto.

**Una pregunta abierta** — cambia el diseño:

**A. ¿El swap se cuenta como "venta" en los números?** Hoy `activeCount` /
`ventasActivas` cuentan filas, no plata, así que un swap se contaría como una
venta de $0 y bajaría el ticket promedio de cualquier lectura futura. Mi
recomendación: contarlo aparte, como visita atendida y no como venta. Es la
misma decisión que ya se tomó con `churn`.

**B. ¿Hay que verificar que sea 1:1?** — **RESPONDIDA: sí, obligatorio.** Ver
D7 y D8. El costo aceptado está anotado en Risks: si la fallada es de un
producto que el camión ya no tiene, el chofer no puede registrar la operación.

## Design Decisions

**D1 — `swap` es un tercer `SaleKind`, no una bandera sobre una venta.**
`SALE_KINDS` pasa a `['sale', 'churn', 'swap']`.

Es el precedente que ya fijó el propio código: cuando una visita no mueve
plata, es su propia clase de fila y no una venta en cero. El comentario está
escrito en `NewSaleScreen.tsx:567` — *"Envase marcado y nada vendido es
exactamente una visita sin venta. Fila churn, no una venta en cero."* Un swap
es el mismo argumento con mercadería adentro.

Una bandera sobre `sale` obligaría a dejar `paymentMethod` opcional para todas
las ventas — justo la garantía que hace que hoy una venta no pueda grabarse
sin cobro.

**D2 — `SaleKind` sigue siendo un enum de Prisma, no una tabla.** A
diferencia de los medios de pago, sus valores los entiende el código: un
cuarto `kind` es una funcionalidad nueva que hay que programar, no
configuración del dueño. Mismo criterio que `ProofPolicy` en
`payment-methods-table.md`.

**D3 — `recordSwap` es su propio método de servicio.** Igual que
`recordEmptyVisit` (decisión #1 del `visit-container-model`): fuerza
server-side `kind: 'swap'`, `paymentMethod: null`, `total: 0`,
`containerReturned: true`, sin importar lo que traiga el payload. `RecordSwapInput`
directamente **no tiene** el campo `paymentMethod`, así que no hay nada que
colar: es el bloqueo real, y la pantalla que lo deshabilita es sólo la parte
visible.

**D4 — Un swap NO pasa por la tarifación.** `createSale` valoriza con
`priceItemsOrReject`, que rechaza la operación cuando al tipo de cliente le
falta un precio (`sales.service.ts:131`). Un swap no se cobra, así que un
precio faltante no puede bloquearlo — el chofer ya hizo el cambio en la calle.
Sigue la misma lógica que el pie de la pantalla ya aplica al churn: *"una
devolución no tiene nada que cotizar, así que la falta de precios no puede
bloquearla"* (`NewSaleScreen.tsx:579`).

**D5 — `SaleItem.unitPrice` va en 0, y eso es la verdad, no un agujero.**
La columna es `Int` no-nulo (`schema.prisma`). Acá el cero no es el `?? 0` que
el roadmap persiguió como bug: ahí el cero mentía sobre una venta que sí se
cobraba, y acá es el importe real de una línea que efectivamente no cobró
nada. La diferencia la sostiene el `kind`, no el número: cualquier lector que
quiera valorizar mercadería movida tiene que filtrar por `kind`, y este plan
deja los dos sitios que lo hacen ya resueltos.

**D6 — El botón es un modo, no un botón más.** El pie de `NewSaleScreen` ya es
una máquina de estados sobre `containerReturned` + cantidad de items
(`:555-595`). El swap entra como un toggle **"Cambio de envase (sin cobro)"**
que, prendido:
- deshabilita el selector de cobro y la sección de comprobante,
- fuerza `containerReturned = true` (no hay swap sin envase que entre),
- cambia la acción del pie a **"Registrar cambio"**,
- deja de mostrar el total (no hay importe que mostrar; mostrar `$0` invita a
  pensar que se regaló mercadería).

**D7 — Lo que vuelve va en su propia tabla, no en `SaleItem`.**

```prisma
model SaleReturnItem {
  id          String       @id @default(cuid())
  saleId      String
  productCode String
  quantity    Int
  reason      ReturnReason
  sale        Sale    @relation(fields: [saleId], references: [id], onDelete: Cascade)
  /// Restrict, igual que en `SaleItem`: un producto que alguna vez volvió no
  /// se puede borrar del catálogo sin perder el registro de por qué volvió.
  product     Product @relation(fields: [productCode], references: [code], onDelete: Restrict)

  @@index([saleId])
}

enum ReturnReason {
  /// Envase vacío que el cliente devuelve.
  empty
  /// Unidad fallada que se cambió por una nueva.
  faulty
}
```

Tabla aparte y no una columna `kind` sobre `SaleItem`, por la razón de arriba:
**una tabla nueva no puede ser sumada por accidente por una consulta que ya
existe.** Con una bandera sobre `SaleItem`, cada consulta de stock presente y
futura tendría que acordarse de filtrarla, y la que se olvide no va a fallar
— va a dar un número equivocado en silencio. La garantía estructural vale más
que la disciplina.

`ReturnReason` es enum y no tabla por el mismo criterio que `SaleKind` (D2):
sus valores los entiende el código. Un tercer motivo es funcionalidad nueva,
no configuración del dueño.

Con esa única pieza cierran los cuatro casos:

| Caso | `SaleItem` (sale del camión) | `SaleReturnItem` (entra) |
|---|---|---|
| Venta normal | productos, con precio | — |
| Venta + envase devuelto | productos, con precio | `empty` × N |
| **Cambio por falla** | la de reemplazo, **precio 0** | `faulty` × N |
| Envase devuelto (`churn`) | — | `empty` × N |

La unidad de reemplazo **sí** es un `SaleItem`: salió del camión y tiene que
descontar. La fallada que vuelve es un `SaleReturnItem`: queda registrada y no
toca el stock.

**D8 — El 1:1 se valida por producto, no por total.**

Para un `swap`, cada línea de `SaleItem` tiene que tener su espejo en
`SaleReturnItem` con `reason: 'faulty'`: mismo `productCode` y misma
`quantity`. No alcanza con que los totales coincidan — entregar dos de 10kg y
recibir una de 10kg y una de 15kg no es un cambio, son dos operaciones
distintas mal anotadas.

Se valida en `packages/shared`, que es donde corre tanto el servidor como el
teléfono sin señal. El chofer se entera **antes** de encolar.

**D9 — `containerReturned` se queda, y no se migra.**

El booleano sobrevive tal cual para las filas históricas. **No hay backfill
posible**: hay filas que dicen "sí, devolvió envase" y nunca se guardó cuántos
ni de qué producto. Ese dato no se puede recuperar porque nunca se recolectó.

Para las filas nuevas pasa a derivarse (`returnItems.length > 0`), así todo lo
que hoy lee el booleano sigue funcionando sin tocarse. Historia vieja y datos
nuevos conviviendo: feo, y honesto. Borrarlo inventaría una precisión que el
pasado nunca tuvo.

**D10 — El cobro se bloquea por "no hay nada que cobrar", no por "hay envase
devuelto".**

La tentación es deshabilitar el selector de cobro apenas se marca envase
devuelto. Sería un error: **el caso más común del negocio es una venta normal
CON envase devuelto**, y se cobra. La tabla del principio lo dice — en `sale`
el envase que vuelve es opcional.

La regla correcta tiene dos ramas:
- toggle de Cambio prendido → bloquear (es una elección del chofer),
- envase devuelto **y cero productos** → bloquear (es un estado derivado: eso
  ya es un `churn`, y así lo decide hoy el pie de la pantalla).

`SegmentedPills` no tiene prop `disabled` todavía; hay que agregarla.

## Phases

### Phase 1 — Shared + API

**Migración `2026xxxxxxxxxx_sale_kind_swap`:**
```sql
ALTER TYPE "SaleKind" ADD VALUE 'swap';
```
Una línea, sin backfill: ninguna fila existente es un swap. **Ojo con el
orden**: Postgres no deja *usar* un valor de enum recién agregado en la misma
transacción que lo agrega. Como esta migración sólo agrega el valor y no
inserta filas que lo usen, pasa; pero no se le puede sumar un `INSERT` con
`'swap'` adentro.

**Migración `2026xxxxxxxxxx_sale_return_items`** (separada de la anterior,
justamente por esa regla): `CREATE TYPE "ReturnReason"`, `CREATE TABLE
"SaleReturnItem"` y su índice. Sin backfill — ver D9, el dato histórico no
existe. `containerReturned` no se toca.

**Ojo con el nombre del tipo**: `ReturnReason` no colisiona con ninguna tabla,
así que no aplica la trampa del `CREATE TABLE` sobre un enum homónimo que hizo
fallar `20260913120000_payment_methods_table`. Vale releer su encabezado antes
de escribir esta migración igual.

**`packages/shared`:**
- `SALE_KINDS` suma `'swap'`.
- `RecordSwapInput`: como `RecordEmptyVisitInput` **más `items`** y **más
  `faultyItems`**, y sin `paymentMethod` (D3).
- `RecordEmptyVisitInput` suma `returnedItems` (qué envases vacíos entraron).
- `CreateSaleInput` suma `returnedItems` opcional: una venta normal también
  puede recibir envases vacíos, y hoy eso sólo se sabe por un booleano.
- `validateRecordSwapInput`: exige al menos un item, cantidades enteras > 0, y
  **el espejo exacto por producto** entre `items` y `faultyItems` (D8). No
  valida precio ni medio de pago.

**`apps/api`:**
- `recordSwap` en `SalesService`, modelado sobre `recordEmptyVisit`: verifica
  existencia de productos (`assertProductCodesExist`) **de los dos lados**,
  **no** llama a `getPriceTableAt` ni a `priceItemsOrReject`, graba los items
  con `unitPrice: 0` y las falladas como `SaleReturnItem` con
  `reason: 'faulty'`. Revalida el 1:1 server-side: el validador compartido es
  para que el chofer se entere antes, no la garantía.
- `SaleRecord` expone `returnItems`, para que el dashboard y el historial
  puedan mostrarlos.
- `getTruckStockForDay` **no se toca**: `SaleReturnItem` es otra tabla y su
  consulta no la ve. Ése es el punto de D7. Sí conviene un test que lo fije.
- `POST /sales/swap`, junto al endpoint de visita sin venta.
- `updateSale`: el guard de consistencia de `kind` (`:325-335`) ya rechaza
  cambiar la clase de una fila; hay que extender la rama `isChurn` para que
  un swap tampoco reciba `paymentMethod` ni sea tarifado. **Un swap sí puede
  editar cantidades** — es su diferencia con el churn, que no tiene items.

### Phase 2 — Driver app

- `offlineQueue`: `enqueueSwap`, con `kind: 'swap'`. El tipo ya es
  `kind?: SaleKind` y los consumidores tratan la ausencia como `'sale'`
  (`offlineQueue.ts:10-18`), así que las entradas viejas siguen funcionando.
- `truckStock.queuedUnitsByProduct`: el guard `entry.kind === 'churn'` pasa a
  ser "no descarga si no tiene items" — un swap encolado **sí** tiene que
  descontar. Escribirlo sobre los items y no sobre el `kind` evita tener que
  volver acá con el próximo `kind`.
- `NewSaleScreen`: el toggle y el modo de D6, más el bloqueo de cobro de D10.
- **Un selector de cantidades para lo que vuelve**, con la misma mecánica que
  el de productos que ya existe. En modo cambio se rotula "Falladas que
  vuelven"; fuera de él, "Envases devueltos". Es el mismo componente con dos
  rótulos, no dos pantallas.
- `SegmentedPills` suma `disabled` (hoy no la tiene): es lo que hace visible
  el bloqueo de cobro.
- El toggle "Envase devuelto" de hoy queda como el atajo rápido de siempre, y
  marca cantidad 1 del producto vendido. El caso de un envase suelto es el
  común; el selector es para cuando no cierra con eso.
- `dayProblems`: un swap no puede reclamar comprobante nunca — cae bajo la
  misma regla que ya existe, porque `paymentMethod` es `null` y
  `proofPolicyOf` devuelve `'none'` para eso. No hay nada que tocar, pero sí
  un test que lo fije.
- `SaleDetailScreen`: mostrar un swap como tal, sin selector de cobro, con
  cantidades editables **de los dos lados** — y el 1:1 revalidado al editar,
  o se puede romper por la puerta de atrás.

### Phase 3 — Dashboard

- Que un swap se lea como swap en la tabla de ventas y en el CSV, no como una
  venta de $0 sin explicación.
- Filtro por tipo de fila (venta / visita / cambio).
- **Reporte de lo que volvió**, por producto y por motivo: cuántos envases
  vacíos y cuántas unidades falladas, en un rango de fechas. Es el informe que
  justifica todo este cambio — sin él, la data se junta y nadie la mira.
- Los KPIs, según la respuesta a la pregunta A.

## Risks

| Riesgo | Mitigación |
|---|---|
| Un swap entra como venta en cero y regala mercadería | `RecordSwapInput` no tiene `paymentMethod` y el servicio fuerza `kind`/`total` server-side (D3). El pie de la pantalla no ofrece "Guardar venta" en modo swap. |
| El chofer usa el swap para tapar una venta que sí cobró | El riesgo real de esta función, y es humano, no técnico. Queda auditable: `SaleAudit` graba la creación, y el dashboard tiene que poder listar los swaps por chofer y por día (fase 3). |
| Se vuelve a agregar un `kind` y hay que revisar todos los `=== 'churn'` | Se corrigen en fase 2 los dos que deciden por `kind` cuando en realidad deciden por "tiene items". |
| Una venta vieja encolada llega sin `kind` | Ya contemplado: se trata como `'sale'` (`offlineQueue.ts:10-18`). |
| **El 1:1 obligatorio traba al chofer en la calle.** Si la fallada es de un producto que el camión ya no tiene, no puede registrar el cambio — y va a terminar anotándolo mal de otra forma, que es peor que no anotarlo. | Costo aceptado a cambio del cuadre perfecto (decisión 6). Conviene que el mensaje de la pantalla diga exactamente qué falta, y mirar en los primeros meses si aparece. Si aparece seguido, la salida es permitir el cambio entre productos distintos dejándolo marcado, no aflojar el 1:1 en silencio. |
| Alguien suma `SaleReturnItem` a una consulta de stock y las entradas pasan a descontar | La tabla separada lo hace improbable, no imposible. Un test sobre `getTruckStockForDay` con una fila de swap fija el número esperado. |
| Se registran falladas que nunca volvieron, para tapar faltante | Mismo riesgo humano que el swap en sí. Queda auditable y el reporte de fase 3 lo hace visible por chofer. |

## Deferred

- **Stock de envases vacíos y de falladas en el camión.** Este plan registra
  QUÉ volvió, no dónde está. Una fallada que vuelve ocupa lugar en el camión y
  hay que devolvérsela al proveedor; hoy el sistema sólo modela lo cargado y lo
  vendido. Con `SaleReturnItem` el dato ya queda guardado, así que ese modelo
  se puede construir después sin volver a tocar la captura.
- **Reclamo al proveedor.** El motivo `faulty` existe para eso, pero este plan
  no construye el circuito.
- **Stock de envases vacíos en el camión.** El swap los hace entrar al camión,
  y hoy el sistema no modela envases vacíos como stock — sólo lo cargado y lo
  vendido. Es un modelo aparte, y es la continuación natural de esto.
