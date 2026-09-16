# Change: Container Swap — Delivery With No Money

Status: **fases 1, 2, 2b y 3 implementadas. Migraciones NO aplicadas.**

Decisiones de negocio cerradas con el dueño el 2026-09-15. La pregunta A
quedó resuelta al implementar la fase 3: un cambio y una devolución NO cuentan
como venta, se cuentan aparte como visitas atendidas. `countsAsSale` en
`apps/dashboard/src/lib/kpis.ts` es la línea que lo revierte.

## PENDIENTE — las tres migraciones no están aplicadas

```bash
pnpm --filter api exec prisma migrate deploy
```

Aplica `20260915100000_sale_kind_swap`, `20260915100100_sale_return_items` y
`20260915100200_sale_item_is_replacement`. La primera va sola en su archivo
porque Postgres no deja usar un valor de enum recién agregado en la misma
transacción que lo agrega.

**Fase 2b, no prevista en este plan**: `SaleItem.isReplacement`. Sin esa
bandera una visita mixta no se podía editar desde el teléfono — peor, se
editaba mal: mandaba el reemplazo como vendido y le cobraba al cliente la
unidad que se le había cambiado sin cargo.

## No, this does not exist yet

The model has a `churn` row that looks close and is not the same thing:

| | Entregamos | Recibimos | Cobramos |
|---|---|---|---|
| `sale` | sí | opcional: vacíos y/o falladas | sí |
| `churn` (hoy) | **no** | envases vacíos | no |
| `swap` (esto) | **sí**, sólo reemplazos | **unidades falladas** | **no** |

Y las filas no son excluyentes en la calle: una misma visita puede vender dos
garrafas, recibir un envase vacío y cambiar una fallada. Eso es **una** fila de
`kind: 'sale'` que se cobra por las dos vendidas. Ver D1.

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

**B. ¿Hay que verificar que sea 1:1?** — **RESPONDIDA: sí, obligatorio**, y
resuelto por construcción en D6b: no hace falta verificarlo porque no se puede
romper. Ver D6b y la nota de D8. El costo aceptado está anotado en Risks: si la fallada es de un
producto que el camión ya no tiene, el chofer no puede registrar la operación.

## Design Decisions

**D1 — Una visita es UNA fila, y el `kind` se deriva de lo que pasó.**
`SALE_KINDS` pasa a `['sale', 'churn', 'swap']`.

Una visita puede mezclar las tres cosas a la vez: el cliente compra dos
garrafas, devuelve un envase vacío y cambia una fallada. Eso es **un** hecho
comercial y **una** fila. Obligar a abrir dos ventas al mismo cliente para el
mismo momento parte en dos algo que pasó junto, y deja al chofer decidiendo
cómo repartir una visita entre filas.

El `kind` no se elige: sale del contenido.

| Qué pasó en la visita | `kind` | ¿Cobra? |
|---|---|---|
| Se vendió algo (con o sin cambios ni devoluciones) | `sale` | **sí** |
| Sólo se cambiaron falladas | `swap` | no |
| Sólo volvieron envases vacíos | `churn` | no |

Es el mismo criterio que la pantalla ya aplica hoy, sin llamarlo así: el pie
decide que es una devolución cuando hay envase marcado y cero items
(`NewSaleScreen.tsx:567` — *"Envase marcado y nada vendido es exactamente una
visita sin venta. Fila churn, no una venta en cero."*). Derivar el `kind` es
generalizar esa regla, no inventar una nueva.

**Esto conserva la garantía que importa.** `paymentMethod` sigue siendo
obligatorio para `kind: 'sale'`: una fila que vendió algo no se puede grabar
sin cobro. Lo que se evita es tener que volver el medio de pago opcional para
todas las ventas, que es lo que costaría una bandera "es un cambio" sobre una
venta cualquiera.

**D2 — `SaleKind` sigue siendo un enum de Prisma, no una tabla.** A
diferencia de los medios de pago, sus valores los entiende el código: un
cuarto `kind` es una funcionalidad nueva que hay que programar, no
configuración del dueño. Mismo criterio que `ProofPolicy` en
`payment-methods-table.md`.

**D3 — Un solo camino de escritura, y el servidor deriva y fuerza.**

La versión anterior de este plan proponía `recordSwap`, su propio método y su
propio endpoint, con un `RecordSwapInput` que directamente **no tenía**
`paymentMethod`. Era un buen bloqueo estructural y se cae con D1: si una misma
visita puede vender, devolver y cambiar a la vez, no hay forma de elegir a qué
endpoint mandarla sin que el teléfono decida el `kind` — y ahí la derivación
deja de ser del servidor.

`createSale` pasa a ser el único camino. Deriva el `kind` de lo que trae el
payload y **fuerza** lo que corresponda, sin importar lo que le manden:

```
vendió algo  →  kind: 'sale'   · paymentMethod obligatorio
sólo cambios →  kind: 'swap'   · paymentMethod: null, total: 0  (forzados)
sólo vacíos  →  kind: 'churn'  · paymentMethod: null, total: 0  (forzados)
```

El bloqueo sigue siendo real y sigue siendo del servidor: un payload de swap
que traiga `paymentMethod: 'efectivo'` no graba un cobro, se lo ignora. Lo que
cambia es que la garantía la da la derivación y no la forma del tipo.

La contrapartida honesta: `paymentMethod` en `CreateSaleInput` pasa a ser
**condicionalmente** obligatorio — exigido cuando se vendió algo. Es más débil
que un campo que no existe, y es el precio de que una visita sea una fila.
La garantía que sobrevive, que es la que importa, es que **una fila que vendió
algo no se puede grabar sin cobro**.

`recordEmptyVisit` y `POST /sales/visit` **se quedan tal como están**: hay
teléfonos con visitas encoladas que los van a seguir usando, y romperlos
perdería ventas que ya ocurrieron. Pasan a ser un atajo del camino general, no
un camino paralelo.

**D4 — Sólo se tarifa lo que se vende.**

`createSale` valoriza con `priceItemsOrReject`, que rechaza la operación
cuando al tipo de cliente le falta un precio (`sales.service.ts:131`). Eso
tiene que seguir pasando con lo vendido, y **no** puede pasar con los
reemplazos: un cambio no se cobra, así que un precio faltante no puede
bloquearlo — el chofer ya hizo el cambio en la calle y volver sin registrarlo
es peor que registrarlo sin precio.

O sea que `priceItemsOrReject` se aplica a las líneas vendidas y los
reemplazos entran directo con `unitPrice: 0`, sin consultar la tabla de
precios. Una visita que **sólo** cambió falladas no toca la tarifación en
absoluto.

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

**D6 — No hay un toggle de modo: hay una sección más para cargar cantidades.**

La primera versión de este plan proponía un toggle "Cambio de envase (sin
cobro)" que ponía la pantalla en modo swap. Se cayó con D1: si una visita puede
mezclar venta, devolución y cambio, no hay un modo que prender — hay tres
cosas que contar.

La sección **"Devoluciones y cambios"** vive debajo de PRODUCTOS, colapsada por
defecto (la mayoría de las visitas no tienen nada que devolver, y una sección
siempre abierta es ruido). Adentro, dos sub-secciones con el mismo
`ProductRow` y el mismo `− 0 +` que el chofer ya usa para vender:

```
DEVOLUCIONES Y CAMBIOS                      [ mostrar ]
  Envases vacíos que vuelven
    Garrafa 10kg               −  1  +
    Garrafa 15kg               −  0  +

  Cambios por falla
    Garrafa 10kg               −  1  +
    ↳ sale 1 Garrafa 10kg del camión, sin cargo
```

**Dos sub-secciones y no un selector de motivo por línea**: un mismo producto
puede tener las dos cosas a la vez — te devuelven un vacío de 10kg *y* te
cambian otro de 10kg fallado. Con un motivo por fila eso no se expresa sin
duplicar filas y explicar por qué hay dos.

El pie sigue siendo la máquina de estados que ya es (`:555-595`), con la
acción según el `kind` derivado: **"Guardar venta"**, **"Registrar cambio"** o
**"Registrar devolución"**.

**D6b — El 1:1 no se valida: se vuelve imposible de romper.**

El número de "Cambios por falla" dice dos cosas al mismo tiempo:

- entra 1 fallada → `SaleReturnItem` con `reason: 'faulty'`
- sale 1 de reemplazo del camión → `SaleItem` con `unitPrice: 0`

Es **el mismo número**. No hay dos campos que puedan discrepar, así que el
chofer no puede equivocarse aunque quiera. La validación de D8 queda como red
de seguridad contra un payload armado a mano, no como algo que alguien pueda
fallar cargando la pantalla.

Prevenir un error siempre le gana a detectarlo.

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

**D8 — MUERTA. La reemplazó D6b, y no se puede tener las dos.**

Lo que decía esta decisión queda abajo tachado, porque entender por qué no se
puede implementar vale más que borrarla.

Con D6b el reemplazo se **deriva** de `swappedItems`: no existe una segunda
lista que pueda discrepar, ni en el servidor ni en el teléfono. No hay nada
que comparar.

Y peor: un payload armado a mano con `items: [X]` y `swappedItems: [Y]` **no
es un swap roto**. Bajo D1 es una visita mixta perfectamente legítima — vendió
X y cambió Y — y su `kind` es `'sale'`. Un validador de espejo rechazaría
operaciones válidas.

Las dos decisiones no pueden convivir. Ganó D6b porque es la garantía más
fuerte: D8 detectaba un error, D6b lo vuelve imposible.

~~**D8 (original) — El 1:1 se valida por producto, no por total.**~~

Para un `swap`, cada línea de `SaleItem` tiene que tener su espejo en
`SaleReturnItem` con `reason: 'faulty'`: mismo `productCode` y misma
`quantity`. No alcanza con que los totales coincidan — entregar dos de 10kg y
recibir una de 10kg y una de 15kg no es un cambio, son dos operaciones
distintas mal anotadas.

Se valida en `packages/shared`, que es donde corre tanto el servidor como el
teléfono sin señal.

Pero ojo con para qué sirve: la pantalla ya lo garantiza por construcción
(D6b), así que este validador **no** existe para avisarle al chofer. Existe
para un payload que no vino de la pantalla — una entrada vieja de la cola, un
cliente futuro, alguien probando la API a mano. Es la red, no el piso.

**D9 — `containerReturned` se queda, y no se migra.**

El booleano sobrevive tal cual para las filas históricas. **No hay backfill
posible**: hay filas que dicen "sí, devolvió envase" y nunca se guardó cuántos
ni de qué producto. Ese dato no se puede recuperar porque nunca se recolectó.

Para las filas nuevas pasa a derivarse, pero **sólo de los envases vacíos**,
no de todo lo que vuelve. El booleano significa "volvió un envase vacío y no le
dimos nada a cambio": en un cambio por falla también vuelve una unidad, pero se
entregó un reemplazo, y marcarlo mentiría sobre lo que pasó en esa visita.

```
returnedItems.length > 0  →  containerReturned: true
sólo swappedItems         →  containerReturned: null
```

Así todo lo que hoy lee el booleano sigue funcionando sin tocarse. Historia vieja y datos
nuevos conviviendo: feo, y honesto. Borrarlo inventaría una precisión que el
pasado nunca tuvo.

**D10 — El cobro se bloquea cuando el total es cero. Punto.**

Con el `kind` derivado (D1), la regla se cae de madura: se cobra si hay algo
que cobrar.

```
total === 0  →  cobro bloqueado
total  >  0  →  cobro obligatorio
```

Y esto **no** es lo mismo que bloquear por "hay envase devuelto", que es el
error obvio y hay que nombrarlo para no caer: el caso más común del negocio es
una venta normal CON envase devuelto, y esa se cobra. Bloquear al marcar el
envase trabaría el flujo más frecuente del día.

Tampoco alcanza con "hay un cambio en la visita". **Una visita mixta se
cobra**: si vendió dos garrafas y además cambió una fallada, hay plata que
cobrar por las dos vendidas. Bloquear ahí es la versión sutil del mismo bug.

El total ya sabe todo esto sin que nadie se lo explique: los reemplazos entran
con `unitPrice: 0` y no suman (D5), así que una visita que sólo cambió falladas
da cero sola.

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
- `CreateSaleInput` suma dos listas opcionales: `returnedItems` (envases
  vacíos que vuelven) y `swappedItems` (falladas que vuelven, con su reemplazo
  implícito — D6b). Nada de `faultyItems` por separado: es el mismo número.
- `deriveSaleKind(input)` en `packages/shared`, la función que decide el
  `kind` de D1. Pura, testeable, y usada por el servidor **y** por la pantalla
  para saber qué rótulo poner en el pie.
- `validateCreateSaleInput`: `paymentMethod` pasa a ser obligatorio sólo
  cuando `deriveSaleKind` da `'sale'` (D3). Las cantidades de las dos listas
  nuevas, enteras > 0. El espejo de D8 se verifica igual, aunque la pantalla
  no pueda romperlo.
- `RecordEmptyVisitInput` suma `returnedItems`, para que el atajo de
  devolución también registre cantidades.

**`apps/api`:**
- `createSale` deriva el `kind` con `deriveSaleKind` y **fuerza** server-side
  `paymentMethod: null` y `total: 0` cuando no es `'sale'` (D3), sin importar
  lo que traiga el payload.
- Verifica existencia de productos (`assertProductCodesExist`) en las tres
  listas, no sólo en la vendida.
- Tarifa **sólo** las líneas vendidas; los reemplazos entran con
  `unitPrice: 0` sin consultar precios (D4).
- Graba los vacíos y las falladas como `SaleReturnItem` con su `reason`.
- `SaleRecord` expone `returnItems`, para que el dashboard y el historial
  puedan mostrarlos.
- `getTruckStockForDay` **no se toca**: `SaleReturnItem` es otra tabla y su
  consulta no la ve. Ése es el punto de D7. Sí conviene un test que lo fije —
  una visita mixta tiene que descontar lo vendido **más** el reemplazo, y ni
  una unidad más.
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
- `NewSaleScreen`: la sección "Devoluciones y cambios" de D6, colapsada por
  defecto, con las dos sub-secciones de `ProductRow`.
- El pie usa `deriveSaleKind` para su rótulo: "Guardar venta" / "Registrar
  cambio" / "Registrar devolución".
- `SegmentedPills` suma `disabled` (hoy no la tiene): es lo que hace visible
  el bloqueo de cobro de D10.
- El toggle "Envase devuelto" de hoy se queda como atajo: prendido, carga 1
  vacío del producto vendido. Un envase suelto es el caso común y no merece
  abrir una sección; el selector es para cuando no cierra con eso. Ojo con
  mantener los dos sincronizados — si el chofer abre la sección y cambia la
  cantidad, el toggle tiene que reflejarlo y no contradecirlo.
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
| El toggle "Envase devuelto" y la sección de cantidades se contradicen | Una sola fuente de verdad: el toggle escribe en la misma lista que la sección y se muestra prendido si esa lista tiene algo. Dos estados paralelos garantizan que algún día digan cosas distintas. |
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
