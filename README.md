# ServiTotal · Sistema de gestión de órdenes de servicio

Taller ServiTotal del distrito VI de Managua, centro de servicio postventa de
Grupo Unicomer (La Curacao, Almacenes Tropigas, RadioShack).

**Estado del proyecto: etapa 1 construida.** Migraciones y datos de prueba.
Las etapas 2 a 9 (seguridad, garantías, órdenes, inventario, sincronización,
móvil, cobros y portal) todavía no existen.

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
base-datos/migraciones/      14 archivos .sql, aplicados en orden alfabético
compartido/                  vocabulario del dominio y contratos de la API
servidor/src/comun/          configuración, errores, bitácora, contraseñas
servidor/src/infraestructura/ conexión, ejecutor de migraciones, siembra
servidor/src/dominio/        (etapa 3 en adelante)
servidor/src/modulos/        (etapa 2 en adelante)
panel/  movil/               (etapas 7 y 9)
```

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
| `usuario` | 38 | las 37 personas del centro y una cuenta de sistema |

El reparto imita un año real: 28 500 órdenes cerradas y unas 1 500 vivas,
que a 80–150 órdenes diarias son unos doce días de trabajo en curso. Unas
180 de las activas están vencidas, para que el panel de jefaturas tenga qué
mostrar, y ~14 000 órdenes tienen alguna evidencia obligatoria faltante,
para que el bloqueo de expedientes tenga casos reales que detectar.

Todos los usuarios sembrados comparten la contraseña `ServiTotal.2026`,
derivada con scrypt. **Son datos de prueba: no deben salir de un entorno de
desarrollo.**

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
