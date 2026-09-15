/**
 * Base local del dispositivo.
 *
 * Guarda dos cosas: las colas de salida —lo que el tecnico hizo y todavia
 * no llego al servidor— y un espejo de lo que necesita para trabajar sin
 * senal: sus ordenes, el catalogo de repuestos y lo que lleva en su bodega
 * movil.
 *
 * El espejo es descartable: si se pierde, se vuelve a bajar. Las colas NO:
 * son la unica copia del trabajo del dia hasta que el servidor confirme.
 */
export const ESQUEMA_LOCAL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── primera cola: las operaciones ──
CREATE TABLE IF NOT EXISTS operacion_pendiente (
  id_operacion        TEXT PRIMARY KEY,
  orden_en_cola       INTEGER NOT NULL,
  tipo_operacion      TEXT NOT NULL,
  momento_dispositivo TEXT NOT NULL,
  carga               TEXT NOT NULL,
  estado              TEXT NOT NULL,
  intentos            INTEGER NOT NULL DEFAULT 0,
  ultimo_mensaje      TEXT
);
CREATE INDEX IF NOT EXISTS ix_operacion_estado
  ON operacion_pendiente (estado, orden_en_cola);

-- ── segunda cola: las evidencias ──
CREATE TABLE IF NOT EXISTS evidencia_pendiente (
  id_local            TEXT PRIMARY KEY,
  id_orden            TEXT NOT NULL,
  clave               TEXT NOT NULL,
  tipo                TEXT NOT NULL,
  ruta_local          TEXT NOT NULL,
  bytes               INTEGER NOT NULL,
  huella_digital      TEXT NOT NULL,
  momento_dispositivo TEXT NOT NULL,
  latitud             REAL,
  longitud            REAL,
  id_carga            TEXT,
  id_evidencia        TEXT,
  bytes_enviados      INTEGER NOT NULL DEFAULT 0,
  estado              TEXT NOT NULL,
  intentos            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_evidencia_estado ON evidencia_pendiente (estado);

-- ── espejo de trabajo, descartable ──
CREATE TABLE IF NOT EXISTS orden_local (
  id                 TEXT PRIMARY KEY,
  numero             INTEGER NOT NULL,
  estado             TEXT NOT NULL,
  modalidad          TEXT NOT NULL,
  tipo_garantia      TEXT NOT NULL,
  cliente            TEXT NOT NULL,
  articulo           TEXT NOT NULL,
  falla_reportada    TEXT NOT NULL,
  telefono_contacto  TEXT NOT NULL,
  direccion_servicio TEXT,
  zona               TEXT,
  plazo_vence_en     TEXT,
  descargada_en      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repuesto_local (
  id          TEXT PRIMARY KEY,
  codigo      TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  precio      REAL NOT NULL
);

-- Lo que el tecnico lleva en su bodega movil segun la ultima descarga.
CREATE TABLE IF NOT EXISTS existencia_local (
  id_repuesto TEXT PRIMARY KEY,
  cantidad    INTEGER NOT NULL
);

-- Evidencia obligatoria por tipo de garantia y momento, para poder avisar
-- sin conexion de que falta antes de que el tecnico se vaya del domicilio.
CREATE TABLE IF NOT EXISTS regla_evidencia_local (
  clave          TEXT NOT NULL,
  etiqueta       TEXT NOT NULL,
  -- tipo de garantia al que aplica la regla
  tipo           TEXT NOT NULL,
  momento        TEXT NOT NULL,
  -- que hay que capturar: foto, firma, documento o medicion
  tipo_archivo   TEXT NOT NULL,
  bloquea_avance INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (clave, tipo, momento)
);
`;
