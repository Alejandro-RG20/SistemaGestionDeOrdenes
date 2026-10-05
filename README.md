# ServiTotal · Sistema de gestión de órdenes de servicio

Taller ServiTotal del distrito VI de Managua, centro de servicio postventa de
Grupo Unicomer (La Curacao, Almacenes Tropigas, RadioShack).

**Sistema completo: las nueve etapas construidas.** Cuatro piezas —la API, el
panel web, la aplicación móvil de los técnicos y el portal público del
cliente— sobre una base de datos con doce meses de operación sembrados.

**441 pruebas en verde:** 373 del servidor (unidad e integración contra
PostgreSQL real), 46 de la aplicación móvil y 22 del panel.

El panel implementa el **prototipo de presentación aprobado**: sus 21
pantallas, su lenguaje visual y sus códigos (`W-03`, `P-01`…).

| Módulo | Qué resuelve |
|---|---|
| Seguridad | 9 roles, 44 permisos, JWT, dispositivos vinculados |
| Clientes y artículos | fichas históricas, fusión de duplicados, datos sensibles auditados |
| Garantías | motor con Especificación y Estrategia sobre reglas versionadas |
| Órdenes | máquina de 13 estados, responsable único, plazos en horas laborables |
| Agenda | visitas sin doble programación |
| Inventario | movimientos como fuente de verdad, bodegas móviles, liberación automática |
| Sincronización | cola idempotente, dos colas, nada se descarta |
| Cobros | expedientes contra marca y póliza, bloqueo por evidencia (RF-57) |
| Panel y portal | bandeja de avisos, indicadores y consulta pública del cliente |

## Puesta en marcha

Requiere **Node 20.12 o superior** y PostgreSQL 14 o superior.

> Para correrlo en su máquina paso a paso —incluidas las cuentas con las que
> entrar y qué hacer si algo falla— hay una guía aparte: **[GUIA_LOCAL.md](GUIA_LOCAL.md)**.

```bash
npm install
cp .env.ejemplo .env          # y ajustar los valores
createdb servitotal
npm run migrar                # aplica base-datos/migraciones en orden
npm run sembrar               # genera el juego de datos de prueba
```

| Orden | Qué hace |
|---|---|
| `npm run iniciar` | Arranca la API (requiere `npm run construir` antes) |
| `npm run desarrollo` | Arranca la API recargando al guardar |
| `npm run migrar` | Aplica las migraciones pendientes, cada una en su transacción |
| `npm run migrar:estado` | Muestra qué migraciones están aplicadas, pendientes o alteradas |
| `npm run sembrar` | Vacía y regenera los datos de prueba |
| `npm run prueba` | Pruebas del servidor (las de integración necesitan PostgreSQL) |
| `npm run prueba:panel` | Pruebas de la web, incluida la capa sin conexión |
| `npm run panel` | Arranca el panel en `localhost:5173`, con proxy a la API |
| `npm run construir` | Recompila `compartido/` y `servidor/` (`npm install` ya lo hace) |
| `npm run verificar-tipos` | Compila `compartido/` y `servidor/`, y comprueba tipos de pruebas y panel |

Las pruebas de integración crean y destruyen la base `servitotal_pruebas`
(configurable con `BD_NOMBRE_PRUEBAS`). Nunca tocan la base de desarrollo.

El sistema son **tres piezas**: la **API**, la **web** (`npm run panel`) y el
**portal público del cliente**, que vive dentro de la misma web en `/consulta`
y no pide cuenta.

### Una excepción deliberada al pliego, y por qué

El pliego maestro de SERVITOTAL prohíbe explícitamente el modo sin conexión,
las colas de sincronización y los dispositivos. **Este sistema los conserva**, y
conviene decir por qué antes de que alguien lo lea como un descuido.

Los técnicos de ruta atienden en casas del Distrito VI **donde no hay cobertura
de datos**. Quitar el trabajo sin conexión no elimina ese hecho: lo traslada al
papel. El técnico anotaría el diagnóstico en una libreta y lo transcribiría al
volver al taller, que es exactamente el proceso que el sistema viene a
reemplazar —con su pérdida de información, su doble digitación y su día de
atraso—.

Lo que **sí** se cumple del pliego es lo esencial de esa regla: no hay
aplicación móvil, no hay React Native y no hay nada que instalar. El técnico
entra por el navegador, como todos los demás. La arquitectura es la que el
pliego fija: React → Node/Express/TypeScript → PostgreSQL.

Esta decisión se consultó y se tomó explícitamente. Si el centro confirma que
hay cobertura en toda la zona, quitar `panel/src/campo/`, el *service worker* y
las tablas `dispositivo`, `operacion_sincronizada` y `excepcion_sincronizacion`
deja el sistema conforme al pliego al pie de la letra.

### No hay aplicación que instalar

El técnico **no descarga nada**. Abre la misma dirección del sistema desde el
navegador del celular que ya carga —o desde una laptop, si ese día anda con
ella— e inicia sesión con su usuario de siempre. Si tiene permiso de campo, el
menú le ofrece **Mi ruta (celular)** y entra a una interfaz pensada para el
pulgar: lo tocable mide 46 px, la navegación va abajo y el estado del envío
está siempre a la vista.

Eso no debilita nada de lo que el pliego pedía:

- **Sigue funcionando sin señal.** La jornada se baja entera antes de salir y
  vive en IndexedDB; el trabajo se encola en el dispositivo y sube solo cuando
  vuelve la cobertura. Un *service worker* guarda el armazón de la página, de
  modo que la aplicación **abre** aunque no haya red.
- **Sigue habiendo dispositivos que se revocan** (RF-05). El «dispositivo» pasa
  a ser el navegador: se identifica con un código estable que la jefatura
  autoriza una sola vez desde Administración. Sin autorizar, el trabajo se
  guarda pero no sube, y la pantalla del técnico se lo dice con el código que
  tiene que dictar.
- **Sigue exigiendo HTTPS** para cargar evidencia: la huella SHA-256 se calcula
  con `crypto.subtle`, que el navegador solo ofrece en contexto seguro.

## Estructura

```
base-datos/migraciones/       14 archivos .sql, aplicados en orden alfabético
compartido/                   vocabulario del dominio y contratos de la API
servidor/src/comun/           errores, transacciones, autorización, bitácora,
                              paginación, tokens, respuesta uniforme
servidor/src/infraestructura/ conexión, ejecutor de migraciones, siembra
servidor/src/modulos/         seguridad · clientes · articulos · garantias · ordenes
                              agenda · inventario · sincronizacion · campo · cobros
                              validaciones · entregas · compras · tiendas · reportes
                              cada uno: controlador · servicio · repositorio · dto · esquemas
servidor/src/dominio/garantias/  motor de garantías (Especificación y Estrategia)
servidor/src/dominio/ordenes/    máquina de estados (patrón Estado)
servidor/src/dominio/plazos/     cálculo en horas laborables
servidor/src/dominio/inventario/ reglas de los movimientos
servidor/src/dominio/sincronizacion/ resolución de conflictos
servidor/src/dominio/cobros/     expediente, destinatario y monto reclamable
servidor/src/modulos/reportes/catalogo.ts  los 17 reportes, cada uno con su consulta
panel/src/api/                cliente de la API
panel/src/sesion/             tokens, contexto, identidad del navegador como
                              dispositivo, y que ve cada rol en el menu
panel/src/campo/              la capa sin conexion: puertos, las dos colas, el
                              motor, el espejo, los adaptadores de IndexedDB,
                              la captura de evidencia y el coordinador
panel/src/pantallas/          bandeja, ordenes, clientes, inventario,
                              excepciones, cobros, indicadores, administracion
                              y el portal publico del cliente
panel/src/pantallas/campo/    las pantallas del tecnico (M-01 a M-07)
panel/public/sw.js            service worker: la web abre sin red
```

## La API

Raíz `/api/v1`, y **`/api` responde igual** como alias permanente hacia la
versión vigente. El pliego escribe las rutas sin versión; la versión se
conserva porque es lo que permite cambiar un contrato sin romper a quien ya lo
usa, y quitarla para parecerse al ejemplo sería perder algo real a cambio de
nada.

Toda respuesta tiene la misma forma: `datos` y, en los listados, `paginacion`;
en caso de fallo, `error` con `codigo`, `mensaje` legible y `correlationId`. El
detalle técnico nunca sale hacia el cliente: se queda en la bitácora del
servidor, localizable por ese identificador.

> `correlationId` es la única clave del sistema que no está en español, y es
> deliberado: la fija el contrato de la API en el pliego. El nombre de una clave
> de protocolo no es una decisión de estilo. Dentro del código se sigue
> llamando `idCorrelacion`; la traducción ocurre al serializar.

| Método y ruta | Permiso que exige |
|---|---|
| `POST /autenticacion/sesion` | público |
| `POST /autenticacion/refresco` | público |
| `DELETE /autenticacion/sesion` | sesión válida |
| `GET /autenticacion/yo` | sesión válida |
| `GET POST /usuarios`, `GET PATCH /usuarios/:id` | `seguridad.usuario.gestionar` |
| `PUT /usuarios/:id/contrasena` | `seguridad.usuario.gestionar` |
| `POST /usuarios/:id/desbloquear`, `/desactivar` | `seguridad.usuario.gestionar` |
| `GET /roles`, `GET PUT /roles/:id/permisos`, `GET /permisos` | `seguridad.rol.gestionar` |
| `GET POST /dispositivos` | `seguridad.dispositivo.vincular` |
| `POST /dispositivos/:id/revocar` | `seguridad.dispositivo.revocar` |
| `GET /bitacora` | `seguridad.bitacora.consultar` |
| `GET /clientes`, `GET /clientes/:id` | `clientes.consultar` |
| `POST /clientes` | `clientes.crear` |
| `PATCH /clientes/:id`, `POST /clientes/:id/telefonos`, `/direcciones` | `clientes.editar` |
| `POST /clientes/:id/fusionar` | `clientes.fusionar` |
| `GET /articulos`, `/articulos/:id`, `/articulos/serie/:serie` | `articulos.consultar` |
| `POST /articulos` | `articulos.crear` |
| `PATCH /articulos/:id` | `articulos.editar` |
| `PUT /articulos/:id/datos-sensibles` | `articulos.editar_datos_sensibles` |
| `POST /articulos/:id/transferir`, `/coberturas` | `articulos.editar_datos_sensibles` |
| `GET /coberturas/reglas`, `POST /coberturas/evaluar` | `garantias.evaluar` |
| `POST /coberturas/reglas` | `garantias.regla.gestionar` |
| `GET /ordenes`, `/ordenes/alertas`, `/ordenes/:id` | `ordenes.consultar` |
| `POST /ordenes` | `ordenes.crear` |
| `PUT /ordenes/:id/tecnico` | `ordenes.asignar` |
| `POST /ordenes/:id/estado` | `ordenes.consultar` + ser el responsable del estado |
| `POST /ordenes/:id/notas` | `ordenes.nota_correccion` |
| `GET /agenda`, `/agenda/calendario`, `/ordenes/:id/visitas` | `agenda.consultar` |
| `POST PUT /ordenes/:id/visitas` | `agenda.programar` |
| `GET /bodegas`, `/repuestos`, `/existencias`, `/movimientos` | `inventario.consultar` |
| `GET /solicitudes-repuesto`, `POST /movimientos` | `inventario.consultar` |
| `POST /ordenes/:id/consumos` | `inventario.consumo.registrar` |
| `POST /ordenes/:id/solicitudes-repuesto` | `inventario.solicitud.gestionar` |
| `POST /sincronizacion/cola` | `campo.sincronizar` + sesión con dispositivo |
| `GET /sincronizacion/excepciones`, `POST .../resolver` | `campo.excepcion.resolver` |
| `POST /evidencias/cargas`, `PATCH`/`GET .../:idCarga` | `campo.evidencia.cargar` |
| `POST /evidencias/cargas/:idCarga/cerrar` | `campo.evidencia.cargar` |
| `GET /ordenes/:id/evidencias` | `ordenes.consultar` |
| `GET /campo/jornada` | `campo.sincronizar` |
| `GET /expedientes`, `/expedientes/:id` | `cobros.expediente.conformar` |
| `POST /ordenes/:id/expediente`, `POST /expedientes/:id/verificar` | `cobros.expediente.conformar` |
| `POST /expedientes/:id/estado` | `cobros.expediente.enviar` |
| `GET /pagos`, `POST /ordenes/:id/pagos` | `cobros.pago.registrar` |
| `GET /cobros/indicadores` | `cobros.indicadores.consultar` |
| `GET /avisos` | sesión válida; el contenido lo deciden sus permisos |
| `GET /indicadores/operacion` | `ordenes.consultar` |
| `GET /portal/ordenes/:numero?telefono=` | **público**, con límite de peticiones |
| `GET /catalogos` | `ordenes.consultar` |
| `GET /validaciones/pendientes`, `/ordenes/:id/revision` | `taller.validacion.registrar` |
| `POST /ordenes/:id/validaciones` | `taller.validacion.registrar` |
| `GET /ordenes/:id/validaciones` | `ordenes.consultar` |
| `GET POST /ordenes/:id/entrega` | `ordenes.entregar` |
| `POST /pagos/:id/estado` | `cobros.pago.confirmar` |
| `GET /compras`, `/compras/:id`, `/proveedores` | `compras.consultar` |
| `POST /compras`, `POST /compras/:id/estado` | `compras.gestionar` |
| `POST /compras/:id/recepcion` | `compras.recibir` |
| `POST PUT /proveedores`, `/proveedores/:id/activar`, `/desactivar` | `compras.proveedor.gestionar` |
| `GET /tiendas`, `/tiendas/:id` | sesión válida |
| `POST PUT /tiendas`, `/tiendas/:id/activar`, `/desactivar` | `tiendas.gestionar` |
| `GET /reportes`, `/reportes/:clave` | `reportes.consultar` |

No hay ruta `DELETE` para ningún registro del negocio: nada se elimina, se
desactiva con motivo escrito.

### Quien hace una cosa no hace la contraria

Tres separaciones de permiso que son el control interno del sistema, no
burocracia:

- **Pedir** una compra (`compras.gestionar`) y **recibirla**
  (`compras.recibir`) son permisos distintos. El jefe de compras arma el
  pedido; bodega cuenta lo que llegó. Una sola persona haciendo las dos cosas
  es como se pierde inventario sin que nadie lo note.
- **Registrar** un pago (`cobros.pago.registrar`) y **confirmarlo**
  (`cobros.pago.confirmar`) también. Quien anota el pago en el mostrador no
  debería ser quien declara que el banco lo acreditó.
- **Nadie valida su propio trabajo.** Lo impide el servicio, con un mensaje
  que lo explica, y además un disparador en la base por si alguien llega por
  otra vía.

### El número de orden

`OS-2026-000123`. Lo asigna la base con un disparador, un correlativo por año,
y no cambia nunca. La columna `numero` sigue existiendo como secuencia interna
—la usan los índices y el orden de la bandeja— pero el número que ve la gente
es el código.

La bandeja y el portal público aceptan **las dos formas**: quien atiende teclea
lo que el cliente le dicta y no tiene por qué saber cuál de los dos es.

## El motor de garantías

Vive en `servidor/src/dominio/garantias/`, es código puro —no consulta la
base ni conoce el HTTP— y no tiene un solo condicional fijo: las condiciones
son **especificaciones** con nombre y los tipos de cobertura son
**estrategias** ordenadas por prioridad. Los números (meses, exclusiones,
exigencia de tienda) se leen de `regla_cobertura`.

```
1. póliza extendida vigente            → adicional
2. tienda del grupo y dentro de plazo  → proveedor
3. en cualquier otro caso              → particular
4. tras el diagnóstico, falla excluida → particular, y la orden se detiene
```

**La cobertura depende del artículo, nunca de los datos de contacto del
cliente.** En `ContextoCobertura` no hay teléfono, ni correo, ni dirección:
solo tienda de origen, fecha de compra, marca y póliza. El único dato de
cliente que interviene es su identidad, y para una cosa concreta:

**Ni la garantía del fabricante ni la póliza extendida se trasladan al
revenderse el artículo.** Las tiendas del grupo venden a cliente final y la
garantía es de esa persona. Se implementa comparando quién pide el servicio
contra el cliente a cuyo nombre está registrado el artículo: si no
coinciden, la reparación la paga quien la pide.

Esto significa que `articulo.id_cliente` **es el comprador**, y cambiarlo es
una operación sensible, no una corrección de ficha: exige jefatura, motivo
escrito, queda en la bitácora y reevalúa las órdenes abiertas. La alternativa
—una columna `id_cliente_comprador` aparte— habría exigido tocar el esquema y
no se hizo.

Cada evaluación devuelve además un **desglose condición por condición**, para
poder explicarle al taller por qué una orden salió clasificada como salió, en
lugar de discutir con un `if`.

### Datos sensibles del artículo

Cambiar fecha de compra, tienda de origen, marca o dueño reevalúa **las
órdenes abiertas** de ese artículo, todo en una sola transacción. Las órdenes
ya entregadas o cerradas no se tocan: lo que se cobró, cobrado está. Una
orden abierta que cae a `particular` queda marcada como detenida hasta que el
cliente acepte la cotización.

## La máquina de estados

Vive en `servidor/src/dominio/ordenes/`, es código puro y es **el único lugar
donde se declara qué transiciones existen**. Si una transición no aparece en
`estados.ts`, no ocurre: no hay ningún `if` en un servicio que la deje pasar
por la puerta de atrás.

Cada estado declara tres cosas: su **responsable único**, el **momento de
evidencia** que hay que tener completo para salir de él, y los destinos que
admite con sus requisitos. Una transición inválida falla con un error de
dominio que dice a dónde **sí** se puede ir:

```
Una orden en registrada no puede pasar a entregada.
Desde aqui solo se puede ir a: asignada, anulada.
```

**De ruta a taller sí; de taller a ruta nunca.** No es una comprobación: es
que `en_cola_taller` no declara ninguna transición hacia `en_ruta`, ni
ningún estado posterior. La conversión cambia la modalidad y conserva número
e historial.

**Ninguna orden avanza sin su evidencia obligatoria**, y el mensaje nombra lo
que falta, una por una. La matriz sale de `regla_evidencia`, no del código.

**Una orden cerrada no se edita.** Los tres estados finales no admiten
ninguna salida; lo que se le puede adjuntar es una nota de corrección, y sólo
a una orden ya cerrada: si sigue abierta, se corrige.

## Plazos en horas laborables

`servidor/src/dominio/plazos/` cuenta contra `calendario_laboral` y
`dia_no_laborable`, no en horas corridas. La diferencia es la que separa un
panel que el taller usa de uno que ignora:

> Una orden recibida el **sábado a las 16:00** con plazo de 8 horas vence el
> **lunes a las 14:00**, no el domingo de madrugada. El lunes por la mañana
> no aparece en rojo, porque nadie llegó tarde.

Hay una prueba con ese nombre exacto. El horario del centro es lunes a
viernes 07:00–20:00 y sábado 07:00–17:00; el domingo no figura en la tabla.
Managua no cambia de hora, así que el desfase es fijo (UTC−6); si alguna vez
hubiera un centro en otro huso, el desfase tendría que salir de `centro`.

Las **alertas son consulta, no notificación**, y eso quedó así por decisión
del negocio: `GET /ordenes/alertas` devuelve lo vencido y lo que está dentro
de su ventana de aviso, y desde la etapa 9 todo eso desemboca en la bandeja
del panel. **No se manda ni un correo ni un mensaje**: el responsable entra al
sistema y ve cómo va la cosa. La consecuencia de esa decisión —y lo que hubo
que hacer para que fuera fiable— está en «El panel web».

## Inventario

**Los movimientos son la fuente de verdad.** `existencia` es una proyección
que se actualiza en la misma transacción y que tiene que poder reconstruirse
desde cero; hay una prueba que la recalcula desde `movimiento_repuesto` y
exige cero diferencias.

**Un movimiento no se edita**: se corrige con un ajuste justificado, que es
otro movimiento. No hay ruta `PATCH` ni `DELETE` para movimientos.

**La bodega central es concurrente; la móvil no.** Descontar de la central
bloquea la fila de existencia (`SELECT … FOR UPDATE`), de modo que dos
bodegueros descontando el mismo repuesto a la vez se serializan en lugar de
leer ambos la misma cantidad. La móvil pertenece a un solo técnico, y por eso
—y sólo por eso— puede descontarse sin conexión: la central sólo se descuenta
en línea, y el servidor lo rechaza explícitamente.

**Todo consumo va atado a su orden**, y consumir varios repuestos es todo o
nada: si al tercero no alcanza, los dos primeros tampoco se descuentan.

**Al ingresar un repuesto, las órdenes que lo esperaban se liberan solas** y
queda constancia en la bitácora de cada una. Se liberan por orden de llegada
mientras la cantidad ingresada alcance: el pliego dice «todas las órdenes que
lo esperaban», pero liberar cinco porque entraron dos unidades sería mentirle
al taller.

### El catálogo de repuestos

`servidor/src/infraestructura/semillas/catalogo-repuestos.ts` **no es ruido
generado**: declara las familias de pieza que un taller de línea blanca, aire
y electrónica repone de verdad, y qué categorías fabrica cada marca. De ahí
salen 309 SKU.

Los códigos se leen sin manual — `REF-CMP-003` es *refrigeración, compresor,
tercero* — y eso no es estética: un bodeguero que busca «todos los compresores
de refrigeración» filtra por `REF-CMP`, mientras que un correlativo plano como
`RPT-10284` obliga a consultar la pantalla para saber qué se tiene en la mano.

Tres dimensiones del catálogo son decisiones de negocio, no adornos:

- **Vía de abastecimiento.** Una pieza de compra local se consigue en Managua
  el mismo día; una de pedido a proveedor se importa y tarda semanas. Eso
  decide si la orden pasa a `en_reparacion` o se queda en
  `esperando_repuesto`, y con ello el plazo que se le prometió al cliente.
- **Pieza universal o de marca.** Un capacitor sirva la marca que sirva y se
  cataloga una vez, sin marca; una tarjeta de LG no entra en una Mabe y se
  cataloga una vez por marca. La distinción también importa al cobrar: un
  repuesto de marca identifica al fabricante en el expediente; uno universal
  no, y ahí la marca la pone el artículo.
- **Stock mínimo.** El de una tarjeta importada de C$7 000 no puede ser el de
  un empaque de C$300. Una prueba falla si alguien pone mínimo alto a algo
  caro o importado.

El catálogo tampoco inventa un compresor Sony ni una televisión Oster:
`CATEGORIAS_POR_MARCA` dice qué hace cada fabricante, y pedir una pieza que la
marca no produce es una orden parada dos semanas por nada.

**Cuando el corporativo entregue su propia codificación de SKU, este archivo
es lo único que cambia**: el código que genera viaja a `repuesto.codigo` y
nada más lo interpreta.

### Una trampa de PostgreSQL que costó encontrar

Mover la existencia con un upsert parece lo natural:

```sql
INSERT INTO existencia (id_bodega, id_repuesto, cantidad) VALUES ($1, $2, -4)
ON CONFLICT (id_bodega, id_repuesto) DO UPDATE SET cantidad = existencia.cantidad + EXCLUDED.cantidad
```

**No funciona.** PostgreSQL evalúa el `CHECK (cantidad >= 0)` sobre la fila
*propuesta* del `INSERT` antes de resolver el conflicto, así que falla siempre
que el delta sea negativo, aunque la existencia final fuera 6. Por eso
`aplicarDelta` intenta primero el `UPDATE` y sólo inserta cuando no había
renglón. Está comentado en el código para que nadie lo «simplifique» de vuelta.

## El protocolo de sincronización

Es el componente de mayor riesgo del proyecto, y descansa en tres
invariantes.

**1. Reenviar no duplica.** El UUID que genera el dispositivo es la clave de
idempotencia contra `operacion_sincronizada`. Si la operación ya llegó, se
devuelve el resultado de entonces sin volver a ejecutar nada:

```
primer envio:   aplicadas=1 repetidas=0  estado=aplicada  -> Orden 40000 registrada.
mismo envio:    aplicadas=0 repetidas=1  estado=repetida  -> Orden 40000 registrada.
en la base:     1 orden, numero 40000
```

Dos envíos simultáneos de la misma operación tampoco duplican: uno gana y el
otro choca con la clave primaria, lo que el motor trata como repetición, no
como fallo.

**2. Nada de lo registrado en campo se descarta.** Lo que el servidor no
puede aplicar va a `excepcion_sincronizacion` con la carga original íntegra
—la operación tal como llegó, sin recortar ni normalizar—. La bandeja se
resuelve o se descarta con una explicación escrita; nunca se borra.

**3. El dispositivo no borra sin confirmación.** Toda operación procesada
vuelve con `confirmada: true`, **incluso si quedó en excepción**: el servidor
ya tiene el trabajo íntegro y el móvil no debe volver a enviarlo. Sólo un
fallo inesperado vuelve sin confirmar, para que se reintente.

La operación y su clave de idempotencia se anotan **en la misma
transacción**. Si se anotaran aparte, una caída entre ambas dejaría la
operación aplicada y sin registrar, y el reintento la duplicaría: justo lo
que el protocolo existe para impedir.

### Los tres conflictos

El criterio que los ordena: **ante la duda, prevalece lo que ocurrió
físicamente en el domicilio del cliente.** La discrepancia administrativa se
resuelve después, en una bandeja, con una persona mirándola.

| Caso | Qué hace el servidor |
|---|---|
| Orden anulada mientras el técnico trabajaba | Conserva el trabajo íntegro en la bandeja. No se descarta nada |
| Repuesto consumido que no figuraba en la bodega móvil | **Acepta el consumo** y genera un `ajuste` justificado que documenta la diferencia |
| Precio cambiado entre la descarga y el consumo | Prevalece el precio que el cliente firmó; la diferencia queda anotada |

El caso del repuesto es el que resuelve el choque con `existencia.cantidad >=
0` que venía arrastrándose desde la etapa 1: el ajuste va **primero** y repone
lo que faltaba, de modo que el consumo puede descontarse sin dejar la
existencia negativa. El `CHECK` sigue en pie, los movimientos siguen siendo la
fuente de verdad, y la diferencia queda registrada como lo que es. Negar el
consumo dejaría la base «cuadrada» y la realidad sin registrar.

### La segunda cola: las evidencias

El binario no viaja con la operación. Primero se registra la evidencia
—clave, momento, ubicación— y después el archivo sube **por partes, con
reanudación**: el dispositivo pregunta `GET /evidencias/cargas/:id` desde qué
byte continuar y sigue desde ahí. Al cerrar se verifica tamaño y SHA-256; una
evidencia que no casa con su huella se rechaza, porque no sirve para
reclamarle nada a un fabricante.

Reanudar desde el byte equivocado se rechaza en lugar de escribir: producir un
archivo corrupto que sólo se descubre al comparar la huella es peor que no
reanudar.

El estado de cada carga vive **junto al archivo, no en memoria**, para que
sobreviva a un reinicio del servidor. Si viviera en memoria, «reanudable»
sería mentira en cuanto el proceso reiniciara.

## El tramo final: validar, cobrar, entregar

Las tres cosas que el pliego pide antes de que un artículo salga del centro, y
que estaban implícitas en el estado de la orden.

### Validación técnica

Una jefatura revisa el trabajo antes de que el centro responda por él. No es
una lista con un botón de aprobar: el expediente de revisión pone delante el
diagnóstico, qué evidencia hay y cuál falta, y qué repuestos se declararon.

**Dos reglas que se aplican en el servidor, no en la pantalla:**

- Nadie aprueba su propio trabajo.
- No se aprueba con evidencia obligatoria faltante — pero **solo la que ya se
  podía haber tomado**.

Ese «solo la que ya se podía» arregla un bloqueo circular que dejaba el módulo
inservible. `firma_cliente` se recoge en la **entrega**. Si se exigiera siempre,
una orden terminada nunca podría aprobarse (falta la firma), sin aprobación no
se puede entregar, y sin entregar no hay firma: **ninguna orden pasaba jamás**.
El criterio de qué momentos son exigibles según el estado vive en
`compartido/src/dominio/evidencia.ts` (`momentosExigiblesEn`) y lo usan los dos
lados —el servidor al bloquear y la web del técnico al pintar su lista—, porque
dos copias del mismo criterio es como se llega a que el celular diga que está
completo y el servidor responda que no.

### Entrega

`entrega` es un acto, no un estado. «Entregada» decía que alguien movió la
orden; la tabla dice **a quién se le puso el equipo en las manos** y quién se lo
dio. Uno de cada cuatro equipos lo retira alguien que no es el titular, y es
justo lo que después se reclama.

Los requisitos se **calculan** contra los datos y cada uno dice *qué hacer* si
no se cumple: quien atiende el mostrador tiene al cliente delante y necesita
saber a dónde mandarlo, no que se le niegue la entrega sin explicación. Y
dependen de la orden: una garantía de proveedor no necesita cotización ni pago,
y pedírselos sería inventar un trámite que el negocio no tiene.

El registro de la entrega y el movimiento de la orden a «entregada» van en
**una sola transacción**. Separadas, una podría quedar sin la otra: un acta de
entrega de una orden que sigue apareciendo como terminada, o una orden
entregada sin constancia de a quién.

### Pagos

Registrado no es cobrado. Un depósito que el cliente dice haber hecho se anota,
pero el artículo no sale hasta que alguien de cobros lo vea en la cuenta. El
efectivo y la tarjeta nacen confirmados —el billete se cuenta en la mano y el
datáfono aprueba en el momento—; exigir que alguien vuelva después a confirmar
un pago que ya vio entrar es un trámite vacío, y los trámites vacíos se llenan
a ciegas.

Un pago no se borra: se anula, con motivo escrito. Borrarlo dejaría una orden
entregada sin rastro de por qué se dio por pagada.

## Compras: un pedido no es mercadería

Crear una compra **no suma ni una pieza** a la existencia. La existencia la
mueve bodega cuando abre las cajas y cuenta, y ese movimiento pasa por el mismo
`registrarMovimiento` que cualquier otro ingreso — no por una vía paralela.

Si la compra sumara al crearse, el sistema diría que hay compresores
disponibles mientras siguen en un camión, y un técnico saldría a una casa
confiando en una pieza que no existe.

La recepción es **todo o nada**: si la tercera línea trae más de lo pedido, las
dos primeras tampoco ingresan. Recibir a medias y dejar la compra en un estado
que nadie sabe interpretar es peor que rechazar la operación completa y que
bodega vuelva a contar.

Y el estado final lo decide el sistema comparando lo contado con lo pedido, **no
la persona**: una compra que alguien marca «recibida» teniendo la mitad en el
camión es un agujero de inventario.

## Reportes: un endpoint, diecisiete consultas

Todos devuelven lo mismo —columnas tipadas y filas— así que el panel tiene UNA
pantalla que los dibuja todos y agregar un reporte es agregar una entrada a
`servidor/src/modulos/reportes/catalogo.ts`. Diecisiete endpoints y diecisiete
pantallas para diecisiete `SELECT` es trabajo que nadie mantiene.

Las columnas viajan **con su tipo** porque el panel no puede adivinar si 4850
son córdobas, días u órdenes, y formatear mal un número en un reporte que
alguien va a defender ante la jefatura es peor que no mostrarlo.

Varios llevan `advertencia`: dicen cómo leer el resultado. Un promedio calculado
sobre cuatro órdenes no significa lo mismo que sobre cuatrocientas, y callarlo
produce decisiones equivocadas con cara de dato duro. El de revisiones técnicas
avisa de que un cero por ciento de rechazos casi siempre significa que nadie
está revisando de verdad.

La prueba que importa de este módulo **ejecuta los diecisiete contra la base**.
Un reporte es SQL escrita a mano: no hay tipos que la protejan, y un nombre de
columna mal escrito no se ve hasta que alguien abre esa pantalla. Así apareció
el desajuste de parámetros en `inventario_critico`, que no declara `$1` ni `$2`
y recibía dos.

## Tiendas y el alcance del usuario de tienda

`tienda_origen` contesta dos preguntas que en Unicomer son la misma: dónde se
compró el artículo —lo que decide si la garantía del proveedor aplica— y desde
qué sucursal entró la solicitud. Partirlas en dos tablas obligaría a mantener
dos catálogos de lo mismo y a decidir cuál manda cuando el motor de garantías
pregunte.

El **usuario de tienda** sólo ve las órdenes de su sucursal, y el filtro se
aplica en el servicio, no en la pantalla: ocultar filas no es control de acceso
—cualquiera puede pedirle la lista a la API— pero sacarlas de la consulta sí lo
es. Y una orden de otra tienda responde **«no existe»**, no «no es suya»: decir
que existe le confirma a quien prueba identificadores que acertó.

El personal del centro de servicio no tiene tienda y ve todo, que es lo
correcto: el taller repara lo que entra por cualquier sucursal.

## Sesiones y permisos

Dos tokens JWT firmados con HS256:

- **acceso**, 15 minutos, acompaña cada petición en `Authorization: Bearer`;
- **refresco**, 12 horas en el panel y 30 días en un dispositivo móvil
  vinculado, y sólo sirve para pedir un token de acceso nuevo.

**El token dice quién es el usuario, nunca qué puede hacer.** Los permisos
se leen de `rol_permiso` en cada petición. Quitarle un permiso a un rol
surte efecto en la petición siguiente, sin esperar a que caduque nada;
desactivar a alguien le cierra la puerta de inmediato. Hay una prueba que lo
comprueba exactamente así.

Cinco intentos fallidos consecutivos bloquean la cuenta
(`SEGURIDAD_INTENTOS_PARA_BLOQUEO`). El contador se escribe en su propia
transacción, que se confirma antes de que el inicio de sesión falle: si se
anotara dentro de la transacción de la operación fallida, el `ROLLBACK` lo
borraría y el bloqueo no ocurriría jamás.

Un usuario o contraseña incorrectos devuelven el mismo mensaje y el mismo
código, y tardan lo mismo, para no revelar qué nombres de usuario existen.

### Revocación: lo que se puede y lo que no

| Situación | Efecto |
|---|---|
| Usuario desactivado o bloqueado | Inmediato: no pasa ninguna petición ni refresca |
| Permiso retirado de un rol | Inmediato, en la siguiente petición |
| Dispositivo móvil revocado | Inmediato: no abre ni refresca sesión (RF-05) |
| Cerrar sesión en el panel | El token de acceso sigue valiendo hasta caducar (15 min) |

**Limitación conocida, y es una decisión, no un olvido:** no hay revocación
individual de una sesión de panel antes de que caduque, porque el esquema no
tiene tabla de sesiones y no lo añadí sin consultarlo. Si el centro necesita
«cerrar la sesión de esa computadora ahora mismo», hace falta una tabla
`sesion` y es un cambio de esquema que hay que acordar. Mientras tanto, la
vía es desactivar al usuario, que sí corta al instante.

## Desviación respecto del esquema entregado

El esquema `servitotal_esquema.sql` **no se ejecuta tal cual en PostgreSQL**.
Falla en la tabla `cliente` con `generation expression is not immutable`.

La causa: `unaccent(text)` está declarada `STABLE`, no `IMMUTABLE`, porque
resuelve el diccionario de texto a través del `search_path` en tiempo de
ejecución. PostgreSQL exige expresiones `IMMUTABLE` en dos sitios donde el
esquema la usa:

- la columna generada `cliente.nombre_busqueda`
- el índice `ix_repuesto_desc_trgm` sobre `repuesto`

Se aplicó la solución estándar documentada por PostgreSQL: una envoltura que
fija el diccionario y por eso sí puede declararse `IMMUTABLE`.

```sql
CREATE FUNCTION inmutable_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
```

Está en `base-datos/migraciones/0001_extensiones.sql`, comentada en el
propio archivo. **Consecuencia a tener presente:** si algún día se altera el
diccionario `public.unaccent`, hay que reconstruir el índice trigram de
`repuesto` y la columna generada de `cliente`.

Fuera de eso, las migraciones `0001`–`0014` reproducen el esquema entregado sin
cambios: mismas tablas, mismos tipos, mismos índices, mismas restricciones.

### Lo que se agregó después, y por qué

Las migraciones `0015`–`0020` **añaden**; ninguna altera ni borra lo entregado.
Cada una responde a un requisito del pliego que el esquema original no cubría:

| Migración | Qué agrega | Por qué |
|---|---|---|
| `0015` | `tienda_origen` con código, dirección y teléfono; `usuario.id_tienda`; `orden_servicio.id_tienda` | §8, §11 y §17: los usuarios pertenecen a una tienda y la orden guarda de cuál entró |
| `0016` | `validacion_tecnica` + disparador «nadie valida lo suyo» | §30, §41, §42 |
| `0017` | `proveedor`, `compra`, `compra_detalle` | §36 y §37 |
| `0018` | `entrega`; estado y anulación en `pago` | §40 y §41 |
| `0019` | `orden_servicio.codigo` (`OS-2026-000123`) con su disparador | §17 |
| `0020` | `bodega.surte_repuestos` | corrige un aviso falso, abajo |

**El caso de `0020` merece explicación.** «Bodega de piezas sustituidas» es de
tipo `central` —no pertenece a ningún técnico— pero no surte nada: ahí van las
piezas que se **retiran** de los aparatos, guardadas como respaldo del reclamo
al proveedor. El aviso de «repuesto bajo el mínimo» miraba todas las centrales y
por eso alertaba de que faltaban piezas dañadas. Dos consecuencias:

1. Avisos sin sentido: nadie repone un compresor quemado.
2. El mismo repuesto aparecía **dos veces** en el panel, una por bodega, sin
   decir de cuál hablaba.

Un panel de avisos con ruido se deja de leer, y entonces tampoco se ven los
avisos que sí importan. Eran 93 alertas; quedaron **68 reales**, cada una
diciendo en qué bodega.

Se corrigió en el modelo y no filtrando por el nombre de la bodega, que se rompe
el día que alguien la renombra.

## Sobre el número de estados

El pliego habla de «14 estados» pero tanto su propia tabla como el tipo
`estado_orden` del esquema enumeran **13**. Se construyó con 13, que es lo
que dice el esquema, y el enumerado quedó intacto. La prueba
`distribucion-estados.prueba.ts` verifica que sean exactamente esos 13.

## El juego de datos

Reproducible: con la misma `SEMILLA_DATOS` genera exactamente los mismos
datos. El generador es un mulberry32 propio; no se usa `Math.random` ni
`crypto.randomUUID` en ninguna parte de la siembra.

Cubre los últimos doce meses de operación.

| Tabla | Filas | Nota |
|---|---:|---|
| `cliente` | 3 000 | con teléfonos y direcciones históricos |
| `articulo` | 5 000 | 16 % con póliza extendida |
| `orden_servicio` | 30 000 | repartidas en los 13 estados |
| `evento_orden` | ~239 000 | bitácora completa de cada orden |
| `evidencia` | ~167 000 | ruta y huella, nunca el binario |
| `diagnostico_item` | ~76 000 | mediciones tipificadas, con fuera de rango |
| `movimiento_repuesto` | ~36 000 | fuente de verdad del inventario |
| `visita` | ~9 400 | sin dos vigentes en la misma franja |
| `repuesto` | 309 | catálogo declarado, no generado al azar; 24 piezas universales |
| `expediente_cobro` | ~8 330 | ~670 bloqueados por evidencia faltante |
| `usuario` | 37 | las personas del centro; ninguna cuenta sin dueño |

Las órdenes cerradas conservan el plazo que estaba vigente al cerrarse, de
modo que el cumplimiento se puede medir: da **71,4 %**.

El reparto imita un año real: 28 500 órdenes cerradas y unas 1 500 vivas,
que a 80–150 órdenes diarias son unos doce días de trabajo en curso. Unas
180 de las activas están vencidas, para que el panel de jefaturas tenga qué
mostrar, y ~14 000 órdenes tienen alguna evidencia obligatoria faltante,
para que el bloqueo de expedientes tenga casos reales que detectar.

Otras ~710 órdenes cobrables quedan **sin expediente conformado**: es la cola
de trabajo del gestor de cobros el primer día.

Todos los usuarios sembrados comparten la contraseña `ServiTotal.2026`,
derivada con scrypt. **Son datos de prueba: no deben salir de un entorno de
desarrollo.**

No hay rol de administrador: **la jefatura de atención al cliente administra
el sistema**. Son 37 personas y ninguna cuenta sin dueño.

## Decisiones de la etapa 1

- **El correlativo lo asigna el servidor.** La columna `numero` se omite del
  `COPY`; la secuencia `orden_numero_seq` la rellena. La siembra no conoce
  los números que genera.
- **Bodega separada para piezas sustituidas.** Las devoluciones de pieza
  retirada (H7) van a una bodega central propia, no a la de repuesto útil:
  lo retirado está dañado y no se vuelve a instalar. El esquema lo permite
  sin cambios; son varias bodegas de tipo `central`.
- **`existencia` se reconstruye, no se inventa.** El último paso de la
  siembra la proyecta desde `movimiento_repuesto` con la misma consulta que
  usará el módulo de inventario para auditarla.
- **La evaluación de cobertura de la siembra es provisional.** Está en
  `semillas/garantia-provisional.ts`, aislada y rotulada. El motor real, con
  los patrones Especificación y Estrategia, es de la etapa 3.

## Decisiones de la etapa 2

- **Un solo lugar traduce errores a HTTP:** `comun/manejador-errores.ts`.
  Los servicios lanzan errores de dominio y no saben que el HTTP existe; los
  controladores los dejan subir.
- **Los permisos son datos, no condicionales.** El catálogo vive en
  `compartido/dominio/seguridad.ts` y la matriz por rol en
  `matriz-permisos.ts`; la siembra los materializa en `rol_permiso`. Una
  prueba de unidad verifica que la matriz no cite permisos inexistentes y
  que ningún rol operativo administre usuarios por descuido.
- **La autorización se inyecta, no se acopla.** El middleware de sesión
  recibe la función que carga al usuario; así `comun/` no depende de
  `modulos/seguridad/` y la comunicación entre módulos sigue pasando por la
  capa de servicios.
- **Un viaje, no uno por permiso.** El usuario y sus permisos se cargan con
  una sola consulta agregada; asignar permisos a un rol resuelve todos los
  códigos de una vez. No hay consultas dentro de bucles.

## Decisiones de la etapa 3

- **El horario laboral real:** lunes a viernes 07:00–20:00 y sábado
  07:00–17:00, confirmado por el taller. El domingo no figura en
  `calendario_laboral`; si algún día se abre, basta agregar la fila, porque
  el cálculo lo lee de la tabla y no del código.
- **Los datos del cliente son vivos; los de la orden, congelados.** Corregir
  un teléfono o una dirección los corrige en la ficha y en todo lo que la
  consulte, pero no toca `direccion_servicio`, `telefono_contacto`, `id_zona`
  ni `cargo_visita` de las órdenes ya creadas. Hay una prueba que lo verifica
  sobre una orden real de la siembra.
- **La fusión de duplicados no borra nada.** Traslada artículos, órdenes y
  pólizas al cliente principal y deja la ficha absorbida desactivada,
  apuntando a la buena, para que quien busque el registro viejo llegue al
  correcto.
- **Las reglas de cobertura se versionan, no se editan.** Crear una cierra la
  vigente con fecha y abre la siguiente. Las órdenes ya abiertas conservan la
  versión que congelaron.
- **Las reglas de cobertura las versionan ambas jefaturas**, la de técnicos y
  la de atención al cliente: son un parámetro comercial que se negocia con
  las marcas.
- **La reevaluación de coberturas** vive ahora en el módulo de órdenes
  (`servicio-reevaluacion.ts`), que es quien escribe sobre órdenes, y le pide
  el cálculo al servicio de garantías. La dependencia va en un solo sentido:
  artículos → órdenes → garantías.

## Decisiones de la etapa 4

- **Una sola puerta para mover una orden:** `POST /ordenes/:id/estado`. No hay
  un endpoint por transición, porque eso repartiría la máquina de estados en
  diez sitios.
- **El responsable único del estado es quien mueve la orden.** Se admiten tres
  formas de serlo: figurar como responsable actual, tener el rol que el estado
  designa, o —sólo para anular y cerrar— tener el permiso de jefatura. Lo
  último no es una puerta trasera: es que la jefatura pueda destrabar una
  orden cuando quien la tenía no está.
- **El UUID puede venir del móvil; el correlativo lo asigna el servidor.**
  Reenviar la misma orden no la duplica: responde que ya llegó.
- **Una orden en `esperando_repuesto` sigue consumiendo plazo**, con las 120
  horas laborables que trae `regla_plazo`. Si el centro prefiere congelar el
  reloj mientras se espera al proveedor, es un cambio de regla, no de código.
- **La agenda se adelantó a su etapa.** El pliego no la sitúa en la 4, pero el
  flujo de ruta es incoherente sin ella: una orden no sale a domicilio sin
  visita programada. Se construyó lo mínimo — programar, reprogramar y
  consultar — y la doble programación es imposible, no improbable: la prohíbe
  el índice `ux_visita_tecnico_franja` y aquí sólo se traduce el choque a un
  mensaje legible.

## La aplicación del técnico

Sirve a los **16 técnicos**, de ruta y de planta: los de planta usan lo mismo,
sólo que no salen del taller. **No es una aplicación móvil**: es la misma web,
abierta desde el navegador del celular, sin instalar nada (ver *No hay
aplicación que instalar*, arriba).

Su premisa es que *el técnico trabaja en casas sin cobertura*, de modo que
**todo funciona sin red y la red es el caso excepcional**, no al revés. Las
pantallas están en `panel/src/pantallas/campo/` y la capa sin conexión en
`panel/src/campo/`.

### Lo que se baja antes de salir

`GET /campo/jornada` devuelve, en **una sola petición**, todo lo que el técnico
va a necesitar: sus órdenes vivas, el catálogo de repuestos, lo que lleva en su
bodega móvil y las reglas de evidencia obligatoria. Podría haber sido cinco
llamadas a endpoints que ya existían; con mala señal, cinco viajes son cinco
oportunidades de quedarse a medias.

Eso alimenta el **espejo local**, que es *descartable*: si se pierde, se vuelve
a bajar y no pasa nada. Las **colas** no lo son — son la única copia del
trabajo del día hasta que el servidor confirme — y esa diferencia gobierna todo
el diseño. En el coordinador se traduce en una regla de orden:

> **Primero la cola, después el espejo.**

Si se escribiera el espejo primero y se cerrara la pestaña en medio, el celular
mostraría una orden «en reparación» que el servidor nunca va a conocer: trabajo
perdido que además parece hecho. Al revés, lo peor que pasa es que la lista
muestre el estado viejo un rato.

Por lo mismo, al volver al taller se **sube antes de bajar**: descargar primero
pisaría el espejo con estados viejos —el servidor todavía no sabría de los
cambios— y el técnico vería retroceder órdenes que él mismo movió.

### Los botones que la aplicación se atreve a ofrecer

`panel/src/campo/flujo-campo.ts` **no es una segunda máquina de estados**. La
máquina vive en el servidor y es la única que decide; esto es el subconjunto
que la aplicación ofrece, y existe porque un botón que el servidor va a
rechazar no se convierte en un mensaje de error: se convierte en una excepción
de sincronización que alguien reconcilia a mano al día siguiente, con el
técnico ya en otra casa.

El criterio es el del servidor: sólo se ofrecen transiciones cuyo estado de
origen tiene al técnico asignado como responsable — `en_ruta`,
`en_diagnostico`, `en_reparacion`. Quedan fuera a propósito la cola del taller
(la reparte la jefatura), el paso a autorización (exige una cotización que no
se levanta desde el celular) y **anular y cerrar sin reparar**: son decisiones
de cierre, y tomarlas solo, sin señal y en el domicilio es justo lo que no debe
pasar. El técnico registra el resultado de la visita; la jefatura cierra.

Una prueba mantiene esto honesto: `flujo-campo.prueba.ts` lleva una copia
escrita a mano del grafo del servidor y falla si la app llega a ofrecer algo
que el servidor no permite.

### Lo que sube, y en qué orden

Al recuperar señal el motor vacía las dos colas: **primero las operaciones, en
orden**, y después las evidencias. Una evidencia pertenece a una orden que
quizá todavía no existe en el servidor.

Las **evidencias** viajan aparte porque una foto de cuatro megas con mala señal
no puede bloquear el resto de la jornada. Se comprimen **al capturarlas** (1600
px, calidad 0,6) y no en cada reintento, suben por partes de 256 KB y se
reanudan desde el byte que el **servidor** dice tener, no desde la cuenta
local: si difieren, manda el servidor. El archivo del dispositivo se borra
*después* de que el servidor cierre la carga.

La huella SHA-256 se calcula sobre el **archivo ya comprimido y sobre sus bytes
crudos**, que es exactamente lo que el servidor rehashea al cerrar
(`infraestructura/almacenamiento-objetos.ts`). Hashear el original, o la cadena
base64, daría un valor que nunca casa — y el síntoma no sería un error visible
sino un bucle: el servidor rechaza por huella, el motor reinicia la carga, y la
evidencia no sube jamás.

### La bandeja de sincronización

Dice cuántas operaciones y cuántas evidencias quedan sin subir, qué contestó el
servidor y cuándo se bajó la jornada. **No ofrece ningún botón para borrar la
cola.** Es la pantalla que le da al técnico una razón para confiar en la
pantalla: sin ella, «guardado» es una promesa que nadie puede verificar, y el
primer día que algo se pierda —o que alguien *crea* que se perdió— la gente
vuelve a la libreta de papel.

Cerrar sesión tampoco toca la cola. Si queda trabajo sin subir, la app lo avisa
con todas las letras: sigue en el dispositivo, pero nadie en el taller lo verá
hasta que esa persona vuelva a entrar y sincronice.

### Qué se prueba y qué no

Las pruebas de `panel/pruebas/` corren sobre la capa sin conexión, que es
código puro: las colas, el motor, los constructores de acciones, el flujo de
campo y el coordinador. **Las pantallas no se prueban aquí**: lo que puede
perder el trabajo del técnico es la cola, no un botón mal alineado.

## Decisiones de la etapa 7

- **El técnico de planta recibió `campo.sincronizar`.** Usa la misma web
  que el de ruta y la aplicación no tiene otra vía para registrar nada; sin ese
  permiso, la app le funcionaría hasta el momento de subir. No recibió
  `campo.visita.registrar` ni `ordenes.crear`: no sale del taller.
- **Un endpoint nuevo, `GET /campo/jornada`,** en lugar de cinco llamadas a
  endpoints existentes. Ver arriba.
- **Las reglas de evidencia bajan sin distinguir categoría ni marca.** Lo que
  el dispositivo necesita es poder avisar «le falta la foto del artículo» antes
  de que el técnico se despida del cliente. La verificación que *bloquea* de
  verdad la sigue haciendo el servidor con `v_evidencia_faltante`, que sí
  conoce la categoría exacta.
- **Se puede consumir un repuesto que la bodega móvil no registraba.** Pasa —se
  lo prestó un compañero, lo trae de otra orden— y negarlo no lo evita: sólo
  hace que no quede anotado. El servidor ya sabe compensarlo con un ajuste; la
  aplicación lo registra, avisa, y **nunca muestra un saldo negativo**, que no
  significa nada para quien la usa.
- **El precio que viaja es el que el cliente firmó**, no el del catálogo. Si
  para cuando la operación llega el catálogo cambió, el servidor respeta el
  firmado y anota la diferencia: lo que se pactó en la casa del cliente no se
  corrige a sus espaldas.
- **El identificador de una orden levantada en campo es también su clave de
  idempotencia.** No es una economía: es lo que impide que un reenvío cree dos
  órdenes, y lo que permite consumir repuestos y tomar fotos contra esa orden
  antes de que exista en el servidor.
- **La navegación es un `switch`, no un enrutador.** Son siete pantallas y
  ninguna necesita enlaces profundos ni historial persistente.
- **Los tokens viven en el almacén seguro del sistema, no en el SQLite.** Si
  alguien saca la base local de un celular perdido, no debe sacar con ella la llave
  para entrar al sistema. Y si el refresco falla —dispositivo revocado a
  distancia— se cierra la sesión pero **la cola no se toca**.
- **«Hay wifi» no es «hay internet».** El detector exige además
  `isInternetReachable` y ante la duda responde que no hay: un falso «no hay
  conexión» retrasa el envío unos minutos; un falso «sí hay» hace que el motor
  falle con el técnico mirando la pantalla.
- **La ubicación se adjunta sólo si el GPS la da rápido** (4 segundos). Bajo un
  techo de zinc puede tardar un minuto, y detener al técnico por una coordenada
  sería cambiar algo útil por algo accesorio.

## Cobros: recuperarle a la marca lo que el cliente no pagó

Es la etapa 8. El taller repara miles de artículos al año que el cliente no
paga; lo que decide si eso es un servicio o una sangría es cuánto se le
recupera al fabricante y a la aseguradora. Un **expediente de cobro** es la
carpeta con la que se le reclama a ese tercero.

### A quién se le cobra

Tres tipos de garantía, tres bolsillos, y el sistema no puede confundirlos:

| Garantía | Responde | Qué se abre |
|---|---|---|
| `proveedor` | la marca | expediente contra el fabricante |
| `adicional` | la póliza | expediente contra la aseguradora |
| `particular` | el cliente | ningún expediente: se registra un pago |
| `por_validar` | nadie todavía | se resuelve la garantía primero |

### La regla que existe todo el módulo para hacer cumplir

> **RF-57: un expediente con evidencia incompleta no se envía.**

No es burocracia. Un expediente que sale sin la foto de la placa de serie
vuelve rechazado semanas después, con el artículo ya entregado y la evidencia
imposible de conseguir; ahí el costo del repuesto se lo come el taller.
Bloquear antes de enviar es más barato que reclamar dos veces.

Y **no se consulta una bandera guardada** para saberlo: se vuelve a preguntar
a `v_evidencia_faltante` en cada movimiento, porque entre que se conformó y
que se envía pudo subir una foto — o caerse una. Cuando bloquea, el error no
se limita a negarse: **enumera qué falta**, para que alguien pueda ir a
buscarlo.

### El monto sale de los datos, no de un supuesto

```
monto reclamado = repuestos consumidos + mano de obra + cargo de visita
```

Los repuestos, **al precio congelado del movimiento** (RN-22) y no al de hoy:
si el compresor subió de C$6 000 a C$7 000 después de instalarlo, se reclama
lo que costó entonces, que es lo que la factura respalda. El cargo de visita,
sólo si el servicio fue a domicilio — cobrarle al fabricante un viaje que no
se hizo es como una marca deja de pagar los que sí.

**Límite conocido, y no disimulado.** No existe una tarifa de mano de obra
parametrizada en el sistema, y en una orden de garantía de proveedor rara vez
hay cotización — el cliente no autoriza lo que no paga. El módulo devuelve
`manoObra: 0` y una advertencia visible en la ficha en lugar de inventar un
valor.

Tampoco se admite **teclearla** al conformar. Es tentador y estuvo escrito,
pero el expediente se recalcula solo en cada paso y ninguna tabla guarda ese
número: el primer recálculo lo borraba. Una casilla que borra lo que uno
escribe es peor que no tenerla. Para reclamar mano de obra hay dos caminos, y
los dos son decisiones del negocio: registrar la cotización también en las
órdenes de garantía, o parametrizar una tarifa — lo segundo exige una tabla
nueva y por tanto tocar el esquema.

### El ciclo

```
en_conformacion ⇄ bloqueado_por_evidencia
       ↓
listo_para_enviar → enviado → aceptado → pagado
                        ↓
                    rechazado → en_conformacion
```

Un rechazo **no es el final**: se corrige lo que señaló el tercero y se vuelve
a presentar. Eso es plata que de otro modo se pierde. Sólo `pagado` es final.

Rechazar exige escribir el motivo — sin él nadie sabe qué corregir — y marcar
pagado exige decir cuánto pagaron, porque la diferencia entre lo reclamado y
lo cobrado es el indicador que mide si al taller le conviene reclamarle a esa
marca.

Hay **una sola puerta** para mover un expediente, `POST
/expedientes/:id/estado`, igual que con las órdenes. Y no hay ruta para editar
el monto a mano: se recalcula desde los datos con `/verificar`; si está mal,
lo que está mal son los consumos o la cotización, y se corrigen allí.

### Indicadores

`GET /cobros/indicadores` da lo reclamado, lo cobrado, la tasa de
recuperación, cuántos expedientes están bloqueados por evidencia, cuántos
llevan días enviados sin respuesta, y **lo expuesto**: lo reclamado que
todavía no entró y tampoco fue rechazado.

El desglose por marca es el que importa para negociar: una marca que paga el
40 % de lo que se le reclama está trasladando su garantía al taller, y esa
conversación se tiene con el número delante.

## Decisiones de la etapa 8

- **El expediente se conforma sobre una orden entregada, no antes.** Mientras
  el artículo sigue en el taller la reparación puede cambiar, y reclamar sobre
  un costo que después se mueve es como se pierde credibilidad ante una marca.
- **Una orden, un expediente.** Se le reclama a un solo tercero; intentar
  conformar dos veces responde 409.
- **El monto que sale es el de hoy, no el del día en que se conformó.** Cada
  movimiento de estado recalcula antes. Un expediente conformado en enero y
  enviado en marzo con el monto de enero es una diferencia que el fabricante
  devuelve.
- **Mover el expediente exige `cobros.expediente.enviar`; conformarlo y
  consultarlo, `cobros.expediente.conformar`.** Lo que saca la carpeta del
  centro y lo que anota el resultado no es la misma responsabilidad que
  armarla.
- **Se admite registrar un pago del cliente aunque la garantía la cubra la
  marca.** El cliente puede pagar el cargo de visita o un repuesto excluido de
  la cobertura; negarlo obligaría a cobrar por fuera del sistema, que es justo
  lo que no se quiere.
- **La siembra deja ~8 % de las órdenes cobrables sin expediente.** Es la cola
  de trabajo del gestor de cobros. Sembrarlas todas conformadas pintaría un
  taller donde nadie se atrasa nunca, y el módulo no tendría sobre qué
  trabajar el primer día.
- **Rechazar sin motivo lo rechaza el dominio, no el esquema de validación.**
  La regla vive en la máquina de estados, que es donde se puede razonar sobre
  ella junto con las demás.
- **No hay casilla para teclear la mano de obra.** Ver arriba: se escribió, no
  se persistía en ninguna tabla y el primer recálculo la borraba. Se quitó.

### Una corrección que salió de esta etapa

Al correr la suite apareció que `plazo_vence_en` no era exactamente las horas
prometidas desde `fecha_estado_desde`: el plazo se calculaba con el reloj de
la aplicación y el inicio lo sellaba `DEFAULT now()` de PostgreSQL medio
segundo más tarde. Encima, la aritmética de horas laborables descartaba los
milisegundos del instante de partida.

Son décimas de segundo y nadie las habría notado — hasta que alguien
reconciliara el informe de cumplimiento y encontrara que ninguna orden llega
nunca a su plazo exacto. Ahora el mismo instante sella el estado y calcula el
vencimiento, en la creación y en cada transición, y `minutosDelDia` cuenta
hasta el milisegundo.

## El panel web

Es la etapa 9. React con Vite, una hoja de estilos y `react-router`; sin
framework de componentes. El panel lo usan nueve roles en computadoras del
centro, muchas veces viejas, y cargar 300 KB de CSS para dibujar tablas y
formularios sería cobrarle al navegador un peaje por nada. Compilado pesa
**257 KB de JavaScript y 11 KB de CSS**.

### Sigue el prototipo aprobado

El panel implementa el **prototipo de presentación** con sus 21 pantallas y su
lenguaje visual: Archivo e IBM Plex, barra lateral oscura con acento ámbar,
etiquetas de formulario en monoespaciada y versalitas, tablas densas. Cada
pantalla lleva en la miga de pan **su código del prototipo** — `W-03`, `W-05`,
`P-01` — para poder señalarla en la defensa sin describirla.

| Código | Pantalla | Qué demuestra |
|---|---|---|
| `W-01` | Acceso | |
| `W-02` | Panel principal | Cifras del día y la bandeja de avisos |
| `W-03` | **Nueva orden** | La garantía se evalúa **al crear la orden**, no al facturar |
| `W-04` | Órdenes de servicio | Filtros en la URL, compartibles |
| `W-05` | Detalle de la orden | El plazo comprometido, visible siempre (RN-16) |
| `W-06` | Agenda y rutas | Sin dos visitas en la misma franja (RN-14) |
| `W-07` | Cola de taller | Asignación con la carga de cada técnico delante |
| `W-08` | Inventario y bodegas | |
| `W-09` | Expedientes de cobro | El sistema **impide enviar** uno incompleto (RF-57) |
| `W-10` | Excepciones | Nada de lo registrado en campo se descarta (RN-19) |
| `W-11` | Indicadores | |
| `W-12` | Clientes | Búsqueda incremental |
| `W-13` | Ficha del cliente | **Datos vivos frente a datos congelados** |
| `W-14` | Artículo | Los tres campos que cambian quién paga |
| `W-15` | Reglas de cobertura | El motor es dirigido por datos, no por código |
| `W-16` | Administración | No hay rol de administrador |
| `P-01` | Consulta pública | El cliente ve el mismo estado que ve el técnico |

Las cinco pantallas móviles del prototipo (`M-01` a `M-07`) son la aplicación
de los técnicos, que es su propio proyecto y está descrita más arriba.

### Crear una orden: los cuatro pasos

Es la pantalla que el prototipo pone primero, y con razón. El paso 3 **no es
un formulario**: es el veredicto del motor de garantías, consultado al
servidor con el artículo real antes de guardar nada.

1. **Cliente** — búsqueda incremental; al elegirlo, su teléfono se copia al
   formulario y quedará congelado en la orden.
2. **Artículo** — uno de los suyos, o registrar uno nuevo sin salir de la
   pantalla. Al registrarlo, la tienda de origen y la fecha de compra llevan
   el aviso de que son los campos que deciden quién paga.
3. **Cobertura** — el servidor responde `proveedor`, `adicional` o
   `particular`, **con el desglose de las siete condiciones evaluadas**: no
   dice sólo el veredicto, dice qué condición falló. Ese desglose es lo que
   hace auditable la decisión frente a un cliente que pregunta por qué le
   cobran.
4. **Falla y modalidad** — y, si es de ruta, la dirección y la zona, con el
   aviso de que se congelan.

El veredicto lo emite **el mismo motor que decidirá el expediente de cobro**.
Calcularlo en el navegador habría sido más rápido y habría creado dos motores:
el número que se le promete al cliente por teléfono y el que sale en el
reclamo al proveedor tres semanas después dejarían de coincidir, y la
diferencia aparecería cuando ya no se puede corregir.

El número correlativo lo asigna el servidor al guardar. El panel no inventa
ninguno.

### La bandeja: cómo se resolvió «se notifica al responsable»

El negocio decidió que **el sistema no empuja nada** — ni correo ni mensaje.
Notificar significa que cuando la persona entra al panel, lo que le toca está
ahí esperándola.

Eso tiene una consecuencia técnica que conviene entender: **la bandeja no es
una tabla de notificaciones**, se calcula en el momento contra el estado vivo.
Una tabla obligaría a marcar leído, a purgar, y sobre todo a mantenerla
sincronizada con la realidad: una orden que dejó de estar vencida porque
alguien la movió seguiría gritando hasta que un proceso la limpiara.
Calculándola, eso no puede pasar — **si el aviso sigue ahí es porque el
problema sigue ahí**.

Y pone toda la carga en una cosa: que la bandeja sea creíble. Si le muestra a
cada quien los problemas de los demás se vuelve ruido, se deja de mirar, y
siendo el único canal, dejar de mirarla es quedarse sin aviso. De ahí dos
reglas:

1. **Cada grupo se muestra sólo a quien puede hacer algo con él.** El permiso
   decide, no el rol: quien no puede resolver excepciones no las ve.
2. **Las órdenes son las suyas.** Quien no tiene mando sobre el taller ve las
   que tiene a su cargo o asignadas; las jefaturas ven todas, porque destrabar
   lo de otros es justamente su trabajo.

Cada grupo dice además **por qué** le aparece a esa persona, y cada renglón
lleva al sitio donde se resuelve. El contador de críticos vive en el menú y se
refresca cada tres minutos: un aviso que llega cuatro minutos tarde no cambia
nada, y una conexión abierta todo el día por cada puesto del centro, sí.

Nueve tipos de aviso: órdenes vencidas y por vencer, trabajo de campo sin
conciliar, expedientes bloqueados, expedientes sin respuesta, órdenes
cobrables sin expediente, repuestos bajo mínimo y solicitudes pendientes.

### El portal público

`/consulta` queda **fuera de la sesión**: el cliente no tiene cuenta y pedirle
una para saber si su refrigeradora está lista es la forma más segura de que
llame por teléfono, que es el trabajo que el portal viene a quitarle al centro.
Se identifica con **número de orden y teléfono**, y vale el teléfono vigente o
el que quedó congelado en la orden (RF-66) — la gente cambia de número y no
tiene por qué recordar cuál dio hace tres semanas. Se compara por dígitos, así
que el formato con que se escriba no decide si alguien puede ver su orden.

Lo que importa de este endpoint es **lo que no devuelve**: ni teléfono, ni
dirección, ni nombre completo, ni la falla diagnosticada, ni montos, ni quién
es el técnico. El nombre va en iniciales para que reconozca su orden sin
exponerlo, y hay una prueba que recorre la respuesta buscando esos campos.

Los trece estados internos se cuentan como **cinco etapas** — recibido, en
revisión, en espera, en reparación, listo — porque `en_cola_taller` no le dice
nada a quien dejó su refrigeradora. Y cuando la orden espera autorización, el
texto dice claramente que **la pelota la tiene el cliente**.

Dos decisiones de seguridad:

- **No se distingue «no existe» de «no es suya».** El mismo mensaje para los
  dos casos; si dijeran cosas distintas, probando números con un teléfono
  cualquiera se sabría qué órdenes existen.
- **Veinte consultas por minuto por origen.** Más que suficiente para una
  persona, y suficiente freno para que la consulta no se convierta en un
  raspador de datos ajenos.

### Indicadores

Sin gráficos, a propósito. Estos números se leen para decidir y para
discutirlos con una marca; una tabla se compara, se ordena y se copia a un
correo, y una barra de colores no.

Cumplimiento de plazo, órdenes abiertas por estado, **dónde se atasca el
trabajo** (horas promedio por estado), productividad por técnico,
**artículos que vuelven** (RF-72, contados por artículo y no por cliente: es
el aparato el que falla otra vez) y la recuperación por marca.

**El cumplimiento obligó a un cambio.** Hasta ahora, al cerrarse una orden se
borraba su `plazo_vence_en`. Eso perdía el único registro de lo que se le
había prometido al cliente, y el indicador salía invariablemente *0 de 0*: no
había contra qué comparar la fecha de entrega. Ahora **al cerrar se conserva
el último plazo vigente**. Es inocuo porque todo lo que pregunta «¿está
vencida?» ya excluye los estados finales, y a cambio la promesa queda
registrada, que es justo lo que este sistema hace con todo lo demás (RN-22).

Mide una cosa concreta y conviene saber cuál: **si la entrega ocurrió dentro
del plazo del último estado vivo**. Una orden que se atrasó en diagnóstico y
recuperó después cuenta como cumplida. Medir «¿incumplió algún plazo en todo
su recorrido?» exigiría recorrer la bitácora estado por estado contra el
calendario laboral de cada uno, y eso es un informe, no una pantalla.

### Detalles que no son estéticos

- **Los filtros viven en la URL.** Quien atiende teléfono puede mandarle a la
  jefatura el enlace de «las vencidas» sin explicar qué botones apretar, y
  volver atrás devuelve la búsqueda anterior.
- **Los filtros son los que el servidor admite de verdad**, ni uno más. Una
  caja de búsqueda libre que el backend ignora es peor que no tenerla: la
  gente teclea, no pasa nada, y deja de confiar en la pantalla.
- **El estado nunca se comunica sólo por color.** Siempre lleva texto: el
  daltonismo no es raro y el taller no tiene luz de oficina.
- **Los mensajes de error del servidor se muestran tal cual.** Del otro lado
  ya se redactaron para que los lea una persona; convertirlos en «Error 422»
  sería deshacer ese trabajo. Se nota sobre todo al ingresar: cuando una
  cuenta se bloquea por intentos fallidos, el servidor lo dice con todas las
  letras.
- **Los tokens van en `sessionStorage`, no en `localStorage`.** Las máquinas
  del centro las comparten varias personas por turno; una sesión que sobrevive
  a cerrar el navegador es una sesión que el siguiente turno hereda sin
  saberlo.
- **La renovación de sesión es transparente.** Aquí el usuario está mirando:
  si el token vence a media tarde no puede perder lo que tenía en pantalla.
  Sólo se cierra sesión cuando el refresco tampoco vale.

## Decisiones de la etapa 9

- **La bandeja no exige un permiso propio.** Cualquiera con sesión la tiene, y
  lo que ve dentro lo deciden sus permisos grupo por grupo. Un permiso de
  entrada sólo lograría que a quien no lo tuviera se le ocultara también lo
  suyo.
- **Los indicadores exigen `ordenes.consultar` y no un permiso nuevo.** Son
  agregados de lo que quien entra ya puede ver orden por orden; inventar un
  permiso aparte sólo lograría que la jefatura tuviera que pedírselo a sí
  misma.
- **El portal vive en la misma aplicación que el panel.** Es una sola pantalla:
  desplegar un segundo sitio por ella sería más infraestructura que producto.
- **Ocultar una sección no es control de acceso**, y el código lo dice donde se
  decide el menú. El servidor comprueba el permiso en cada petición; esto sólo
  evita que a alguien se le llene la pantalla de secciones que le van a
  responder 403.
- **El limitador de peticiones es en memoria del proceso.** Con un solo
  servidor —que es el caso del centro— alcanza. Si algún día hay varios detrás
  de un balanceador hay que moverlo a un almacén compartido, y por eso está
  aparte y no incrustado en la ruta.
- **Un solo endpoint de catálogos, `GET /catalogos`**, en vez de cinco. El
  formulario de una orden nueva necesita marcas, categorías, tiendas, zonas y
  técnicos a la vez; pedirlos por separado son cinco viajes para dibujar una
  pantalla y cinco maneras de que se quede a medias. Cada técnico viene con la
  **carga que ya lleva encima**: sin ese número, la asignación se hace por
  costumbre y siempre recae en el mismo.
- **Las pruebas del panel cubren el cliente de la API y las reglas del menú**,
  no los componentes. Lo que rompe el trabajo del centro es pedirle algo mal al
  servidor o enseñarle a alguien lo que no le toca, no un margen de diez
  píxeles.

### Cuatro cosas que aparecieron al levantar el sistema completo

Arrancar la API, sembrar y recorrer el sistema de punta a punta destapó lo que
ninguna prueba unitaria iba a destapar:

1. **El `.env` no lo leía nadie.** El README mandaba copiar `.env.ejemplo` a
   `.env` y ningún proceso lo cargaba: la puesta en marcha documentada
   sencillamente no funcionaba. Ahora se carga con `process.loadEnvFile`, que
   trae Node desde la 20.12, sin sumar una dependencia para parsear cuatro
   líneas. Lo que ya está en el entorno sigue ganando sobre el archivo.
2. **El cumplimiento de plazo salía 0 de 0**, por lo del plazo borrado al
   cerrar. Explicado arriba.
3. **Y después salía 100 % de 24 000.** El mecanismo ya funcionaba, pero la
   siembra construía las órdenes cerradas de modo que ninguna llegaba tarde
   jamás: la duración salía en horas corridas y el plazo estaba en horas
   laborables, que en corrido se estiran casi al doble. Un taller que nunca
   falla no sirve para probar nada, así que el último tramo de una orden
   cerrada ahora se estira o se acorta contra su plazo igual que ya se hacía
   con las vivas. El juego de datos da **71,4 % de cumplimiento**, que es una
   cifra con la que se puede trabajar.
4. **Y conservar el plazo dejó un borde suelto:** una orden entregada hacía un
   año pasaba a figurar como `vencida: true` en su ficha, porque la bandera se
   calculaba sólo con las horas restantes. Ahora `vencida` y `enAlerta` son
   falsas en los estados finales, igual que ya lo asumían todas las consultas
   SQL. Se cerró antes de que llegara a ninguna pantalla.

## El alcance por datos: dos agujeros que había y ya no

Hasta esta etapa el sistema contestaba bien una pregunta y a medias la otra.
La primera —**qué** puede hacer cada quien— estaba resuelta con permisos
comprobados en cada petición. La segunda —**sobre qué** puede hacerlo— solo
estaba resuelta para el usuario de tienda.

Las dos cosas que faltaban se encontraron corriendo el sistema, no leyéndolo,
y las dos eran el mismo error: mirar el permiso y no mirar de quién es el
dato.

### Un usuario de solo consulta podía inventar existencias

`POST /movimientos` es una sola puerta para los seis tipos de movimiento, y
estaba protegida con `inventario.consultar` —el permiso de **leer**—. El tipo
viene en el cuerpo, así que la ruta no podía saber qué permiso exigir, y el
servicio tampoco lo comprobaba.

Resultado, verificado contra el sistema con 30 000 órdenes:

```
arodriguez · rol usuario_consulta · 8 permisos, ninguno de escritura
antes:    4 unidades de REF-TER-011 en Bodega central
POST /api/v1/movimientos  {"tipo":"ingreso","cantidad":99,…}  →  HTTP 200
después: 103 unidades
```

La comprobación vive ahora en el **servicio**, no en la ruta, porque el
servicio es el primer punto del sistema que ya sabe de qué tipo se trata. La
tabla que decide es `PERMISO_DEL_MOVIMIENTO`, en `compartido`, y la usan los
dos lados: el servidor para rechazar con 403, y el panel para no ofrecerle un
formulario a quien no puede usarlo. Toda vía que mueva existencia pasa por
ahí, incluida la recepción de compras.

Hizo falta un permiso nuevo, `inventario.devolucion.registrar`: el técnico
devuelve lo que no usó y entrega la pieza sustituida, y ninguno de los
permisos que ya existían nombraba eso.

### Un técnico veía las 30 000 órdenes y abría la de cualquier compañero

```
robando · rol tecnico_ruta
GET /api/v1/ordenes            →  total visible: 30000
GET /api/v1/ordenes/17929fd6…  →  HTTP 200
   OS-2025-000024, asignada a OTRO técnico
   cliente: Jazmina Gomez Palacios · teléfono 81680176
   dirección: Villa Progreso, casa 50
```

No era un listado de más: era el teléfono y la dirección de casa de un
cliente que ese técnico no tenía por qué visitar.

El cerco está en `modulos/ordenes/alcance.ts`, en un solo archivo y no
repartido por cada consulta, porque la tentación es ponerlo en nueve sitios y
olvidarlo en el décimo. Dos reglas:

- **usuario de tienda** → solo las órdenes de su sucursal.
- **técnico** → solo las que tiene asignadas, **o las que él levantó**.

Ese «o las que él levantó» no es una concesión: una orden que el técnico
acaba de abrir en la casa del cliente todavía no está asignada a nadie, y sin
esa cláusula el cerco se la bloqueaba a él mismo. Lo descubrió la prueba de
sincronización, que dejó de pasar.

El cerco se aplica en cinco puertas, no en una: la lista, la ficha, la
bandeja de alertas, las evidencias y las transiciones de estado. La bandeja
de alertas no lo tenía y era la vía para enumerar lo que la lista ya
escondía.

En el filtro de la consulta el cerco va en un campo **aparte** del filtro
`idTecnico` que usa un jefe para mirar la carga de alguien. Si fueran el
mismo campo, un técnico que pidiera `?idTecnico=<otro>` lo sobrescribiría y
se saldría del cerco. Separados, los dos se cumplen a la vez.

### La puerta de escritura era peor que la de lectura

Al cercar las evidencias quedó a la vista que un técnico **no podía listar**
las evidencias de una orden ajena pero **sí subirle fotos**. Una foto colgada
de la orden de otro acaba en el expediente de cobro de ese otro, y nadie la
encuentra buscando donde se tomó. También se cercó la carga.

### 403 y no 404, a propósito

El sistema respondía «no existe» a la orden de otra sucursal, con el
argumento de que decir «existe pero no le toca» le confirma a quien prueba
identificadores que acertó. El pliego pide 403 (§13) y se sigue el pliego,
por dos razones concretas:

- Los identificadores son UUID. No se adivinan contando, así que lo que el
  403 revela no habilita un ataque: ya hacía falta tener el identificador
  para preguntar.
- El 403 le dice la verdad a quien abrió un enlace que le pasaron. «Esta
  orden no es suya» se entiende; «no existe» lo manda a buscar un error que
  no hay.

## El kardex: el saldo se calcula, no se guarda

La pantalla de existencias contesta «cuánto hay». El kardex contesta «cómo
llegamos a eso», que es la pregunta de quien tiene que explicar un faltante.

No hay columna de saldo en ninguna tabla y no debe haberla. El saldo es la
suma de los movimientos anteriores; una columna que lo guardara sería un
segundo lugar donde la verdad puede quedar desfasada. Se calcula con una
función de ventana en la base, que es donde están los datos, y la paginación
lo respeta: la ventana se calcula antes del `LIMIT`, así que la página dos no
vuelve a empezar en cero.

**El signo depende de la bodega que se consulta.** El mismo movimiento es una
salida para la bodega central y una entrada para la móvil, así que el signo no
se deduce del tipo de movimiento sino de comparar las bodegas del movimiento
con la que se está mirando. Una sola regla que vale para los seis tipos,
incluido el ajuste, que lleva la bodega en origen si falta y en destino si
sobra.

Sin bodega, el kardex es del centro completo: entra lo que vino de afuera,
sale lo que se consumió, y los traslados internos no mueven el saldo porque
no mueven nada hacia afuera.

Comprobado contra los datos reales: de los **2 860** pares bodega-repuesto de
la base, **ninguno** descuadra entre el saldo derivado de los movimientos y la
existencia proyectada.

## La solicitud de repuesto deja de ser un booleano

El pliego §26 describe seis pasos: el técnico solicita, bodega revisa,
aprueba o rechaza con motivo, prepara, entrega, y el técnico confirma que la
tiene. La tabla tenía una columna `liberada boolean`. Dos estados para un
recorrido de seis pasos, y por tanto ninguna respuesta a lo que la operación
pregunta todos los días: quién aprobó esto, desde cuándo está preparado,
entregó bodega y el técnico no pasó a recogerlo.

Cada paso exige **su** permiso, no uno general. El técnico no se aprueba su
propia solicitud, y bodega no declara que el técnico la recibió: eso es la
separación de funciones del §65 aplicada a un trámite pequeño. Verificado
contra el sistema vivo:

```
el técnico intenta preparar            → 403  no es quien da este paso
bodega intenta declararla recibida     → 403  no es de una orden asignada a usted
otro técnico intenta recibirla         → 403
el técnico de la orden la recibe       → 200  recibida
```

### Dos correcciones que salieron de probarlo, no de leerlo

**El disparador que iba a romper la liberación automática.** La primera
versión de la migración derivaba `liberada` del estado con un disparador.
Habría roto el RF-53: cuando entra un repuesto, `liberarSolicitudes` marca
`liberada = true` para destrabar las órdenes que lo esperaban, y el disparador
se la habría vuelto a poner en falso porque el estado seguía siendo
`solicitada`. Las órdenes se habrían quedado esperando para siempre un
repuesto que ya estaba en bodega.

Las dos columnas contestan preguntas distintas y por eso conviven:

| columna | pregunta |
| --- | --- |
| `liberada` | ¿hay existencia para esta solicitud? Es lo que destraba la orden. |
| `estado` | ¿por dónde va el trámite con el técnico? Es el recorrido del §26. |

Coinciden en **un** punto, y ese está restringido en la base: si el técnico
tiene la pieza en la mano, la orden dejó de esperarla. Por eso el paso
`recibida` pone `liberada` en verdadero, y un CHECK impide la combinación
contraria.

**La entrega exigía bodega móvil siempre.** Al técnico de ruta la pieza se le
despacha a su bodega móvil: se la lleva en el vehículo y hace falta saber qué
lleva encima. Al de planta no: trabaja en el taller, la pieza no sale de la
bodega del centro y se descuenta cuando la instala. La primera versión
respondía `SIN_BODEGA_DEL_TECNICO` para todos, lo que dejaba el recorrido
bloqueado para las órdenes de planta, que son la mayoría del taller. Una
regla correcta para la mitad del negocio, aplicada a la otra mitad.

## El menú del técnico es otro menú, no el general recortado

El pliego §11 pide un menú de técnico con sus seis cosas. Filtrar el menú
general por permisos no bastaba: le dejaba «Inventario y bodegas» —el
catálogo completo del centro— porque tiene `inventario.consultar`, y lo
necesita para ver lo que lleva encima, pero no es lo que va a abrir.

`SECCIONES_DEL_TECNICO` es una lista aparte. Las rutas son las mismas del
sistema: no hay pantallas duplicadas para el técnico, solo otra puerta de
entrada.

## El expediente de cobro: observado y cerrado

El pliego §39 enumera ocho estados y el sistema tenía siete. Faltaban dos, y
los dos nombran situaciones reales que se estaban forzando dentro de otro
estado:

**Observado.** El proveedor no rechazó el reclamo: pidió algo. Una foto más
nítida, la factura, el número de serie legible. Eso se anotaba como
`rechazado`, y era una mentira con consecuencias: el indicador de recuperación
contaba como perdido un expediente que solo esperaba un documento, y nadie
distinguía al proveedor que pide aclaraciones del que se niega a pagar.

**Cerrado.** El expediente terminó y ya no se toca, se haya cobrado o no.
Antes el único final era `pagado`, así que los rechazos definitivos se
quedaban en `rechazado` para siempre, mezclados con los que todavía se
estaban rehaciendo.

No se renombró nada. Los nombres del sistema dicen lo mismo que los del
pliego con más precisión —`bloqueado_por_evidencia` explica **por qué** está
detenido, que es lo que el gestor necesita leer— y renombrarlos obligaría a
reescribir filas de expedientes vivos sin que nadie gane nada.
