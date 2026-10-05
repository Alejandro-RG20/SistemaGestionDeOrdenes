-- =====================================================================
-- 0022 · La solicitud de repuesto deja de ser un boolean (pliego §26)
-- =====================================================================
--
-- El pliego describe seis pasos: el tecnico solicita, bodega revisa,
-- aprueba o rechaza, prepara, entrega, y el tecnico recibe. La tabla tenia
-- una columna `liberada boolean`. Dos estados para un recorrido de seis
-- pasos, y por tanto ninguna respuesta a las preguntas que la operacion
-- hace todos los dias: quien aprobo esto, desde cuando esta preparado,
-- entrego bodega y el tecnico no lo recogio, o nadie lo entrego.
--
-- LO QUE NO SE PIERDE
--
-- `liberada` no se borra en esta migracion. Se mantiene y se sincroniza:
-- hay codigo vivo que la lee —la vista de ordenes esperando repuesto, el
-- contador que la maquina de estados consulta antes de dejar pasar una
-- orden de 'esperando_repuesto' a 'en_reparacion'— y cambiar las dos cosas
-- a la vez convierte un cambio verificable en una apuesta. El estado es
-- desde hoy la fuente de verdad; `liberada` queda como lo que siempre fue:
-- «¿ya llego el repuesto a manos del tecnico?», que ahora se deriva.
--
-- Las filas existentes se traducen sin adivinar nada: una solicitud
-- liberada recorrio los seis pasos y queda 'recibida'; una no liberada esta
-- al principio y queda 'solicitada'. No se inventan aprobaciones ni fechas
-- que nadie registro: las columnas de quien y cuando quedan nulas para las
-- filas viejas, que es la verdad.

CREATE TYPE estado_solicitud_repuesto AS ENUM (
  'solicitada',   -- el tecnico la pidio
  'en_revision',  -- bodega la esta viendo
  'aprobada',     -- bodega dijo que si
  'rechazada',    -- bodega dijo que no, con motivo
  'preparada',    -- esta apartado y listo en el mostrador de bodega
  'entregada',    -- bodega lo entrego
  'recibida',     -- el tecnico confirmo que lo tiene
  'anulada'       -- la orden se anulo o la solicitud se dejo sin efecto
);

ALTER TABLE solicitud_repuesto
  ADD COLUMN estado        estado_solicitud_repuesto NOT NULL DEFAULT 'solicitada',
  ADD COLUMN motivo        text,
  ADD COLUMN revisada_por  uuid REFERENCES usuario(id),
  ADD COLUMN revisada_en   timestamptz,
  ADD COLUMN preparada_por uuid REFERENCES usuario(id),
  ADD COLUMN preparada_en  timestamptz,
  ADD COLUMN entregada_por uuid REFERENCES usuario(id),
  ADD COLUMN entregada_en  timestamptz,
  ADD COLUMN recibida_en   timestamptz;

-- Traduccion de lo que ya habia. Sin inventar pasos intermedios.
UPDATE solicitud_repuesto SET estado = 'recibida' WHERE liberada;

-- Un rechazo sin motivo escrito no sirve para nada: el tecnico necesita
-- saber si fue por existencia, por precio o porque pidio la pieza
-- equivocada.
ALTER TABLE solicitud_repuesto
  ADD CONSTRAINT ck_solicitud_rechazo_con_motivo
  CHECK (estado <> 'rechazada' OR (motivo IS NOT NULL AND length(btrim(motivo)) > 0));

-- POR QUE `liberada` NO SE DERIVA DEL ESTADO
--
-- El primer intento fue un disparador que pusiera `liberada := (estado =
-- 'recibida')`. Habria roto la liberacion automatica de ordenes (RF-53):
-- cuando entra un repuesto, `liberarSolicitudes` marca `liberada = true`
-- para destrabar las ordenes que lo esperaban, y el disparador se la habria
-- vuelto a poner en falso porque el estado todavia era 'solicitada'. Las
-- ordenes se habrian quedado esperando para siempre un repuesto que ya
-- estaba en bodega.
--
-- Las dos columnas contestan preguntas distintas y por eso conviven:
--
--   liberada  ->  ¿ya hay existencia para esta solicitud? Es lo que destraba
--                 la orden, y lo decide la entrada del repuesto al centro.
--   estado    ->  ¿por donde va el tramite con el tecnico? Es el recorrido
--                 del §26, y lo mueven bodega y el tecnico.
--
-- Son casi independientes, y el «casi» importa. Una entrada libera la orden
-- aunque el tecnico tarde dos dias en pasar a recogerla: ahi `liberada` va
-- por delante del recorrido. Y una pieza que ya estaba en existencia se
-- aprueba, se prepara y se entrega sin que ninguna entrada la libere: ahi el
-- recorrido va por delante.
--
-- Coinciden en UN punto, que es el que esta restringido abajo: si el tecnico
-- la tiene en la mano, la orden dejo de esperarla. Por eso el paso 'recibida'
-- pone `liberada` en verdadero —lo hace `registrarPaso`— y el CHECK impide
-- la combinacion contraria. Sin eso, una solicitud recibida con `liberada` en
-- falso dejaba la orden detenida para siempre en 'esperando_repuesto' por una
-- pieza que ya se estaba instalando.

ALTER TABLE solicitud_repuesto
  ADD CONSTRAINT ck_solicitud_recibida_con_existencia
  CHECK (estado <> 'recibida' OR liberada);

CREATE INDEX ix_solicitud_estado ON solicitud_repuesto (estado, fecha_solicitud);

COMMENT ON COLUMN solicitud_repuesto.liberada IS
  'Hay existencia para esta solicitud: es lo que destraba la orden (RF-53). No es el estado del tramite.';
COMMENT ON COLUMN solicitud_repuesto.estado IS
  'El recorrido del pliego §26: solicitada, en_revision, aprobada/rechazada, preparada, entregada, recibida.';
