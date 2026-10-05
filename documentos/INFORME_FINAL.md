# ServiTotal · Informe final

Los veintiún puntos que pide el §67 del pliego, en su orden y con sus
nombres. Lo que aquí se afirma se comprobó corriendo el sistema contra
PostgreSQL con 30 000 órdenes, 43 usuarios y 13 roles; donde algo no está
hecho, lo dice el punto 21 y no está disimulado en ninguno de los otros
veinte.

---

## 1. Diagnóstico inicial

Lo que encontré fue un sistema que **funcionaba y estaba incompleto en un eje
concreto**: contestaba bien «qué puede hacer cada quien» y a medias «sobre qué
puede hacerlo».

Lo que ya estaba y no había que tocar: 47 tablas con los invariantes en
disparadores de la base, JWT con scrypt y bloqueo por intentos, la máquina de
estados de la orden con responsable único por estado, el inventario con el
movimiento como fuente de verdad y la existencia como proyección en la misma
transacción, la capa PWA con IndexedDB y cola de operaciones idempotentes, el
portal público sin datos sensibles, la bitácora de auditoría, y 445 pruebas
verdes.

Lo que faltaba está en el punto 2. El diagnóstico completo, escrito **antes**
de tocar código como pide el §2, está en `documentos/DIAGNOSTICO.md`.

## 2. Problemas encontrados

**Dos vulnerabilidades reales**, las dos reproducidas contra el sistema
corriendo, las dos del mismo tipo: mirar el permiso y no mirar de quién es el
dato.

1. **Un usuario de solo consulta podía inventar existencias.**
   `POST /movimientos` estaba protegido con `inventario.consultar` —el permiso
   de **leer**— y el tipo de movimiento viaja en el cuerpo, así que la ruta no
   podía saber qué exigir y el servicio no lo comprobaba.

   ```
   arodriguez · rol usuario_consulta · 8 permisos, ninguno de escritura
   antes:    4 unidades de REF-TER-011 en Bodega central
   POST /api/v1/movimientos {"tipo":"ingreso","cantidad":99,…} → HTTP 200
   después: 103 unidades
   ```

2. **Un técnico veía las 30 000 órdenes y abría la de cualquier compañero.**

   ```
   robando · rol tecnico_ruta
   GET /api/v1/ordenes            → total visible: 30000
   GET /api/v1/ordenes/17929fd6…  → HTTP 200
      OS-2025-000024, asignada a OTRO técnico
      cliente: Jazmina Gomez Palacios · teléfono 81680176
      dirección: Villa Progreso, casa 50
   ```

   No era un listado de más: era el teléfono y la dirección de casa de un
   cliente que ese técnico no tenía por qué visitar.

**Incompleto o en otro formato:** el formato de respuesta no era el del §50;
no había kardex; la solicitud de repuesto era un booleano donde el §26 pide
seis pasos; faltaban dos estados del expediente de cobro; el menú del técnico
era el general filtrado; los reportes no se exportaban; el tablero mostraba 5
cifras donde el §42 pide 12; faltaban tres de las diez alertas del §55.

## 3. Correcciones realizadas

| Qué | Dónde |
| --- | --- |
| Permiso por tipo de movimiento | `compartido/src/dominio/inventario.ts` → `PERMISO_DEL_MOVIMIENTO`; comprobado en `inventario/servicio.ts` |
| Alcance por datos | `servidor/src/modulos/ordenes/alcance.ts`, aplicado en once puertas |
| Formato de respuesta §50 | `compartido/src/api/respuesta.ts`, `comun/respuesta.ts`, `comun/manejador-errores.ts` |
| 403 en vez de 404 en el cerco | `alcance.ts`, siguiendo el §13 |
| Estados del expediente | migración `0021`, `dominio/cobros/maquina-expediente.ts` |
| Alertas de bodega que no surte | ya corregido antes con `bodega.surte_repuestos` |

**Tres correcciones que sólo aparecieron al probarlo, no al leerlo:**

- La orden que el técnico levanta en campo todavía no está asignada a nadie, y
  el cerco se la bloqueaba **a él mismo**. Lo encontró la prueba de
  sincronización al dejar de pasar. El cerco admite ahora las órdenes que él
  creó.
- El técnico no podía **listar** las evidencias de una orden ajena pero sí
  **subirle** fotos. La puerta de escritura era la peor de las dos: una foto
  colgada de la orden de otro acaba en el expediente de cobro de ese otro.
- La primera versión de la migración `0022` derivaba `liberada` del estado con
  un disparador. Habría roto la liberación automática de órdenes (RF-53):
  las habría dejado esperando para siempre un repuesto que ya estaba en bodega.
- El aviso de cotizaciones pendientes devolvía cero. `aceptada` es **NULL**
  mientras el cliente no contesta, no `false`, y `NOT aceptada` con NULL da
  NULL, que no pasa el WHERE. Descartaba exactamente las 135 que tenía que
  encontrar.

## 4. Nuevas funcionalidades

- **Kardex por repuesto** (`GET /repuestos/:id/kardex`), con saldo corrido.
- **Recorrido de la solicitud de repuesto**, seis pasos con autoría.
- **Pantalla de movimientos**: un formulario, cinco tipos, sólo los que el
  perfil puede registrar.
- **Exportación de reportes a CSV** (`GET /reportes/:clave/exportar`).
- **Tablero de inicio** con once cifras más la actividad reciente (§42).
- **Tres alertas nuevas** (§55): repuesto agotado, cotización sin respuesta,
  compra pendiente.
- **Menú del técnico** como lista propia (§11).
- Permiso nuevo `inventario.devolucion.registrar`.

## 5. Roles

Trece roles, todos con gente sembrada y todos probados:

| Rol | Qué hace |
| --- | --- |
| `agente_telefonia` | Levanta órdenes por teléfono, programa visitas, cobra |
| `jefe_atencion_cliente` | Administra el sistema: usuarios, roles, dispositivos, bitácora |
| `tecnico_ruta` | Sale a domicilio. Cercado a sus órdenes |
| `tecnico_planta` | Misma tableta, sólo en el taller. Cercado a sus órdenes |
| `gestor_tecnicos` | Asigna y programa |
| `jefe_tecnicos` | Valida el trabajo técnico, ajusta inventario, anula |
| `bodeguero` | Mueve existencia y recibe mercadería |
| `jefe_compras` | Pide al proveedor. **No** recibe |
| `gestor_cobros` | Conforma y envía expedientes, registra pagos |
| `jefe_cobros` | Además **confirma** que el dinero entró |
| `usuario_tienda` | Mostrador de una sucursal. Cercado a su tienda |
| `administrador` | Todos los permisos del catálogo, construido **desde** el catálogo |
| `usuario_consulta` | Lee y nada más. Ni un permiso que escriba |

## 6. Permisos

**54 permisos** en `CATALOGO_PERMISOS`, materializados en `rol_permiso` y
consultados en cada petición. La matriz completa está en
`compartido/src/dominio/matriz-permisos.ts`; el administrador se construye con
`CATALOGO_PERMISOS.map(...)` y no a mano, para que no se quede corto el día
que alguien agregue un permiso.

Los del inventario, que son los que cambiaron:

| Permiso | Operación |
| --- | --- |
| `inventario.consultar` | Ver existencias, movimientos y kardex |
| `inventario.ingreso.registrar` | Entrada al centro |
| `inventario.despacho.registrar` | Transferencia a bodega móvil |
| `inventario.devolucion.registrar` | Devolución a central y pieza sustituida |
| `inventario.consumo.registrar` | Consumo contra una orden |
| `inventario.ajuste.registrar` | Corrección justificada |
| `inventario.solicitud.gestionar` | Revisar, aprobar y preparar solicitudes |

La diferencia de nombres con la lista del §14 está explicada en el punto 21.

## 7. Pantallas

26 pantallas. El menú se arma por permisos —y para el técnico, por su propia
lista— pero **eso no es control de acceso**: el servidor comprueba el permiso
en cada petición y esa es la única puerta que cuenta.

| Rol | Lo que ve en el menú |
| --- | --- |
| Técnico de ruta y de planta | Mi ruta de hoy · Mis repuestos · Mis solicitudes · Mis órdenes · Mi agenda · Sincronización |
| Agente de teléfono | Panel · Clientes · Órdenes · Agenda |
| Jefatura de atención | Todo, incluida Administración y Tiendas |
| Bodeguero | Panel · Órdenes · Inventario · Movimientos · Solicitudes · Kardex · Compras |
| Jefe de compras | Panel · Inventario · Movimientos · Kardex · Compras · Reportes |
| Gestor y jefe de cobros | Panel · Órdenes · Cobros · Pagos · Indicadores |
| Jefe de técnicos | Panel · Órdenes · Taller · Validación · Agenda · Inventario · Coberturas · Reportes |
| Usuario de tienda | Panel · Clientes · Órdenes (de su tienda) |
| Usuario de consulta | Panel · Clientes · Órdenes · Agenda · Inventario · Kardex · Reportes. **Sin** Movimientos |

## 8. Alcance de datos

Dos cercos, en un solo archivo (`modulos/ordenes/alcance.ts`) para que no haya
que acordarse de él en cada consulta:

- **Usuario de tienda** → sólo las órdenes de su sucursal.
- **Técnico** → sólo las que tiene asignadas, **o las que él levantó**.
- Todos los demás → sin cerco. El taller repara lo que entra por cualquier
  sucursal y la jefatura necesita ver el conjunto para repartir el trabajo.

Se aplica en **once puertas**: la lista, la ficha, la bandeja de alertas, las
evidencias (leer y subir), las visitas, las transiciones de estado, los
consumos, las solicitudes, el expediente de cobro, el pago, la entrega y el
tablero.

En el filtro de la consulta el cerco va en un campo **aparte** del filtro
`idTecnico` que usa un jefe para mirar la carga de alguien. Si fueran el mismo
campo, un técnico que pidiera `?idTecnico=<otro>` lo sobrescribiría.

Verificado en el tablero: 1 500 órdenes abiertas para el administrador, 478
para el usuario de tienda, 56 para el técnico. Las mismas cifras, tres
cercos.

## 9. Base de datos

47 tablas, 3 vistas, 17 enumerados, 2 disparadores con funciones PL/pgSQL, 22
migraciones. Dos migraciones nuevas en esta etapa, **ninguna destructiva**:

| Migración | Qué hace |
| --- | --- |
| `0021_expediente_observado_cerrado.sql` | Agrega `observado` y `cerrado` al enumerado `estado_expediente`. Agregar valores a un enumerado no reescribe ninguna fila. |
| `0022_solicitud_repuesto_flujo.sql` | Agrega a `solicitud_repuesto` el estado del §26 y la autoría de cada paso. |

La traducción de `0022` no inventa nada: una solicitud liberada recorrió los
seis pasos y queda `recibida`; una no liberada queda `solicitada`. Las
columnas de quién y cuándo quedan **nulas** para las filas viejas, que es la
verdad. Aplicada sobre 11 406 solicitudes: 11 139 `recibida`, 267
`solicitada`, **cero** filas con el estado y `liberada` en contradicción.

`liberada` **no** se borró y **no** se deriva del estado. Contestan preguntas
distintas y conviven; coinciden en un solo punto, que está restringido con un
CHECK. La razón está escrita en la propia migración.

## 10. API

**109 rutas.** Formato uniforme del §50 en todas:

```
éxito  →  { "success": true,  "data": …, "pagination": {…} }
fallo  →  { "success": false, "error": { "code", "message", "correlationId" } }
```

Las claves del cable están en inglés porque son el **contrato**, no
vocabulario interno; la traducción ocurre en dos archivos —`comun/respuesta.ts`
y `comun/manejador-errores.ts`— y en ningún otro.

Rutas nuevas:

| Ruta | Para qué |
| --- | --- |
| `GET /repuestos/:id/kardex` | El libro del repuesto con saldo corrido |
| `GET /solicitudes-repuesto/recorrido` | Las solicitudes con su recorrido, cercadas |
| `POST /solicitudes-repuesto/:id/pasos` | Dar un paso del §26 |
| `GET /reportes/:clave/exportar` | El mismo reporte, como archivo CSV |
| `GET /tablero` | Las cifras del inicio, cercadas |

El detalle técnico **nunca** sale hacia el cliente: se queda en la bitácora
del servidor, localizable por el `correlationId` que sí viaja.

## 11. Inventario

| Operación | Tipo de movimiento | Permiso |
| --- | --- | --- |
| Entrada | `ingreso` | `inventario.ingreso.registrar` |
| Transferencia a móvil | `despacho_a_movil` | `inventario.despacho.registrar` |
| Devolución a central | `devolucion_a_central` | `inventario.devolucion.registrar` |
| Consumo en orden | `consumo` | `inventario.consumo.registrar` |
| Pieza sustituida | `devolucion_pieza_sustituida` | `inventario.devolucion.registrar` |
| Ajuste | `ajuste` | `inventario.ajuste.registrar` |

Un movimiento **no se edita ni se borra**: se corrige con un ajuste, que es
otro movimiento con motivo escrito.

**Kardex.** El saldo se calcula con una función de ventana en la base y no se
guarda en ninguna columna: una columna de saldo sería un segundo lugar donde
la verdad puede quedar desfasada. El signo depende de la **bodega que se
consulta**, no del tipo de movimiento, y con eso una sola regla vale para los
seis tipos.

La aritmética, probada de punta a punta:

```
entran 10 a la central            →  central 10, móvil 0
se despachan 3 al técnico         →  central  7, móvil 3
el técnico consume 1 en la orden  →  central  7, móvil 2
devuelve 1 a la central           →  central  8, móvil 1
```

Y en cada paso el kardex dice lo mismo que la existencia. Sobre los datos
completos: de los **2 860** pares bodega-repuesto, **ninguno** descuadra entre
el saldo derivado de los movimientos y la existencia proyectada.

## 12. Órdenes

Flujo completo: registrada → asignada → en ruta / en cola de taller → en
diagnóstico → cotizada → esperando autorización → esperando repuesto → en
reparación → finalizada → entregada. Más `anulada` y `cerrada_sin_reparar`.

En cada estado la orden tiene un **responsable único** y sólo él la mueve. La
máquina de estados dice si el paso vale; el cerco dice si la orden es suya.
Son dos preguntas y se hacen las dos.

Cada orden lleva su código `OS-AAAA-NNNNNN`, con el correlativo por año
resuelto con `pg_advisory_xact_lock` para que dos recepciones simultáneas no
se peleen el número.

No hay ruta `DELETE`. Una orden no se elimina: se anula, con motivo, y eso es
una transición como cualquier otra.

## 13. Compras

borrador → enviada → confirmada → recibida_parcial → recibida, más cancelada.

**Pedir ≠ recibir.** El jefe de compras pide y administra el catálogo de
proveedores; **no** recibe la mercadería. Eso lo cuenta bodega. Separar las
dos manos es lo que evita que quien pide sea también quien declara que llegó.

La recepción es **todo o nada** y pasa por `inventario.registrarMovimiento`:
una compra nunca mueve existencia por su cuenta. El estado final se **calcula**
comparando lo recibido con lo pedido, no se elige.

## 14. Cobros

en_conformacion → bloqueado_por_evidencia → listo_para_enviar → enviado →
observado → aceptado / rechazado → pagado → cerrado.

**Registrar ≠ confirmar.** El efectivo y la tarjeta nacen confirmados —el
billete se cuenta en la mano y el datáfono aprueba en el momento—; un depósito
o una transferencia quedan registrados y esperan a que cobros confirme que el
dinero entró.

El monto reclamado sale del desglose de la orden, no de un supuesto. Un
expediente no sale sin evidencia completa, y ahí es donde
`bloqueado_por_evidencia` gana su nombre: dice **por qué** está detenido.

## 15. Evidencias

Cinco momentos: recepción, validación de garantía, diagnóstico, reparación,
entrega. Lo que se exige en cada momento se calcula contra los datos, nunca
contra una casilla de «todo revisado».

La evidencia sube en **dos colas**: primero la ficha —clave, momento,
ubicación, huella—, después el archivo por partes con reanudación. Así una
foto de cuatro megas con mala señal no bloquea el resto. La huella se verifica
al cerrar la carga.

Y lleva el cerco por datos en las dos direcciones: un técnico no lista ni sube
evidencia de una orden ajena.

## 16. Offline

El técnico, sin conexión, puede: ver su jornada bajada antes de salir,
registrar llegada y salida de la visita, levantar una orden nueva en el
domicilio, registrar el diagnóstico, tomar fotos y la firma del cliente, y
consumir repuestos de su bodega móvil.

Todo se guarda en IndexedDB con `navigator.storage.persist()`, y la aplicación
sólo ofrece los botones de las acciones que de verdad puede encolar: un botón
que falla al volver la señal es peor que un botón que no está.

## 17. Sincronización

Cada operación lleva un **UUID generado en el dispositivo**. El servidor lo
busca antes de aplicar: si ya llegó, responde con el resultado anterior y no
duplica nada. Es lo que permite reenviar la cola entera sin miedo cuando la
señal se corta a medio envío.

Las operaciones se procesan **en el orden en que se encolaron**, porque la
segunda suele depender de la primera: un diagnóstico sobre una orden que la
misma cola acaba de crear.

Lo que el servidor no puede aplicar —la orden se anuló mientras el técnico
trabajaba— **no se descarta**: queda en una excepción, con la carga original
completa, y se confirma al dispositivo para que pueda borrarla de su cola. El
trabajo del técnico no se pierde nunca; alguien lo concilia desde la bandeja
de excepciones.

## 18. Seguridad

- Contraseñas con **scrypt**. Nunca en texto plano, en ninguna tabla ni en
  ningún registro.
- JWT HS256 con acceso corto y refresco; bloqueo por intentos fallidos.
- **Permiso comprobado en cada petición** contra `rol_permiso`, releído en la
  petición y no cacheado en el token. Ocultar un botón no es control de acceso.
- **Alcance por datos** en once puertas (punto 8).
- Un usuario **no puede** cambiar su propio rol, asignarse permisos, ni crear
  usuarios con privilegios que él no tiene.
- **Separación de funciones** en cuatro sitios: pedir ≠ recibir (compras),
  registrar ≠ confirmar (pagos), nadie valida su propio trabajo (disparador en
  la base), y aprobar ≠ recibir (solicitudes de repuesto).
- Toda consulta con parámetros. Nada se concatena en SQL.
- El detalle técnico de un error no sale al cliente; va a la bitácora con un
  identificador de correlación.
- Límite de peticiones y límite de tamaño del cuerpo.
- La exportación CSV neutraliza la **inyección de fórmulas**: una celda que
  empiece por `=`, `+`, `-` o `@` se prefija, porque Excel la ejecutaría.

## 19. Auditoría

La tabla `bitacora` registra, por operación: la tabla, el registro, la acción,
el campo, el valor anterior, el valor nuevo, el motivo cuando se exige, el
usuario y el momento.

**Nada se elimina físicamente**: ni órdenes, ni movimientos, ni pagos, ni
compras, ni evidencias, ni expedientes. Lo que se corrige se corrige con otro
registro —un ajuste, una nota de corrección, una anulación con motivo— y queda
la historia de las dos cosas.

Una corrección **no borra** el rechazo anterior: cada validación técnica es una
fila nueva, porque saber que una reparación se rechazó dos veces antes de
aprobarse es justo lo que sirve para detectar reincidencia.

La actividad reciente del tablero sale de esta misma bitácora y no de una
tabla aparte: dos tablas con lo mismo se desincronizan.

## 20. Pruebas

Se completará con el resultado de la corrida final, más abajo.

Lo que cubren, por si sirve más que el número:

- **Permisos por rol**, atacando la API directamente por HTTP: acceso por URL
  directa, llamadas a la API, cambio de identificadores, intentos de modificar
  registros ajenos e intentos de escalar privilegios.
- **El cerco por datos**, en una tabla de puertas, para que agregar una ruta
  nueva y olvidarse de cercarla se note al leer la lista.
- **La aritmética del inventario** del §59, con el kardex comparado contra la
  existencia en cada paso.
- **El recorrido de la solicitud** completo, incluida la separación de
  funciones.
- **Idempotencia y orden** de la cola de sincronización, y que nada de lo
  registrado en campo se descarte.
- **Los 17 reportes** ejecutados contra la base, para que ninguno quede con un
  desajuste de parámetros.
- **El serializador CSV**, incluida la inyección de fórmulas.
- **Las migraciones**, aplicadas desde cero.

## 21. Pendientes

Sin maquillarlo.

### Los nombres de los permisos (§14) no son los del pliego

El pliego nombra `orden.ver`, `inventario.entrada`, `compra.aprobar`. El
sistema usa `ordenes.consultar`, `inventario.ingreso.registrar`,
`compras.gestionar`. **No los renombré**, y la diferencia va en las dos
direcciones:

- Donde el sistema es **más fino**: `inventario.salida` del pliego sería un
  permiso para tres operaciones que aquí las hacen personas distintas
  —despachar, consumir, ajustar—. Fundirlas le daría al técnico la capacidad
  de ajustar el inventario, que es exactamente lo que el §65 pide separar.
- Donde el sistema es **más grueso**, y es una deuda real:
  `seguridad.usuario.gestionar` es un solo permiso para lo que el pliego separa
  en `usuario.ver`, `usuario.crear`, `usuario.editar`, `usuario.activar` y
  `usuario.desactivar`. Lo mismo con `rol.*`. Y **no existe `compra.aprobar`**:
  hoy crear y enviar un pedido es el mismo permiso, cuando el pliego —con
  razón— separa crear de aprobar.

Renombrar es un mapa en `CATALOGO_PERMISOS` más una migración de
`rol_permiso`. Se puede hacer; hay que decidir primero qué pasa con la
granularidad que se pierde, y por eso lo traigo como decisión y no como hecho.

### Lo que falta de los flujos

- **§37, cotizaciones.** El ciclo existe en el modelo, en la máquina de estados
  y ahora también en la bandeja —el aviso de cotizaciones sin respuesta
  encuentra 135 reales—. Lo que falta es la pantalla que lo haga evidente de
  punta a punta: hoy se opera desde el detalle de la orden.
- **§55, notificaciones.** De las diez alertas que enumera, ocho se generan.
  Las dos que quedan son derivadas de lo que ya hay: una solicitud entregada
  que el técnico no confirmó, y un expediente observado sin respuesta.
- **§42, tablero.** Las once cifras y la actividad reciente están. El pliego no
  pide más, pero vale decir que «técnicos activos» no lleva enlace porque no
  hay una pantalla de técnicos todavía.

### Una cosa que no es deuda sino decisión

La capa offline se conservó en su momento como excepción justificada a un
pliego anterior que la prohibía. El pliego definitivo la **exige** (§5, §44,
§45, §46), así que ya no es una excepción: es lo pedido. No hay nada que
deshacer.

### Sobre el §68

El pliego dice que no declare el sistema terminado porque la aplicación inicia
y las pantallas se ven bien. No lo declaro. Lo que puedo afirmar, con la
comprobación detrás, está en los puntos 1 a 20; lo que falta está arriba, en
este punto 21, y es lo que hay que cerrar antes de que la frase «sistema
terminado» signifique algo.
