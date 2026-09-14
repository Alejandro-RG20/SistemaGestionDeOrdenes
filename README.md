# ServiTotal · Sistema de gestión de órdenes de servicio

Taller ServiTotal del distrito VI de Managua, centro de servicio postventa de
Grupo Unicomer (La Curacao, Almacenes Tropigas, RadioShack).

**Estado del proyecto: etapas 1, 2 y 3 construidas.** Migraciones, datos de
prueba, seguridad, clientes, artículos y el motor de garantías. Las etapas 4
a 9 (órdenes, inventario, sincronización, móvil, cobros y portal) todavía no
existen.

## Puesta en marcha

Requiere Node 20 o superior y PostgreSQL 14 o superior.

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
| `npm run prueba` | Todas las pruebas (las de integración necesitan PostgreSQL) |
| `npm run prueba:unidad` | Solo las pruebas que no necesitan base de datos |
| `npm run verificar-tipos` | Compila `compartido/` y `servidor/` |

Las pruebas de integración crean y destruyen la base `servitotal_pruebas`
(configurable con `BD_NOMBRE_PRUEBAS`). Nunca tocan la base de desarrollo.

## Estructura

```
base-datos/migraciones/       14 archivos .sql, aplicados en orden alfabético
compartido/                   vocabulario del dominio y contratos de la API
servidor/src/comun/           errores, transacciones, autorización, bitácora,
                              paginación, tokens, respuesta uniforme
servidor/src/infraestructura/ conexión, ejecutor de migraciones, siembra
servidor/src/modulos/         seguridad · clientes · articulos · garantias
                              cada uno: controlador · servicio · repositorio · dto · esquemas
servidor/src/dominio/garantias/  motor de garantías (Especificación y Estrategia)
panel/  movil/                (etapas 7 y 9)
```

## La API

Raíz `/api/v1`. Toda respuesta tiene la misma forma: `datos` y, en los
listados, `paginacion`; en caso de fallo, `error` con código, mensaje
legible e identificador de correlación. El detalle técnico nunca sale hacia
el cliente: se queda en la bitácora del servidor, localizable por ese
identificador.

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

No hay ruta `DELETE` para ningún registro del negocio: nada se elimina, se
desactiva con motivo escrito.

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

Fuera de eso, las migraciones reproducen el esquema entregado sin cambios:
mismas tablas, mismos tipos, mismos índices, mismas restricciones.

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
| `expediente_cobro` | ~8 900 | ~750 bloqueados por evidencia faltante |
| `usuario` | 37 | las personas del centro; ninguna cuenta sin dueño |

El reparto imita un año real: 28 500 órdenes cerradas y unas 1 500 vivas,
que a 80–150 órdenes diarias son unos doce días de trabajo en curso. Unas
180 de las activas están vencidas, para que el panel de jefaturas tenga qué
mostrar, y ~14 000 órdenes tienen alguna evidencia obligatoria faltante,
para que el bloqueo de expedientes tenga casos reales que detectar.

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
- **La reevaluación escribe en `orden_servicio`** porque el módulo de órdenes
  es de la etapa 4. Está marcado en el código: cuando ese módulo exista, la
  escritura debe pasar por su servicio y el de garantías quedarse solo con el
  cálculo.
