-- =====================================================================
-- 0018 · Entrega del articulo (RF-41) y estado del pago (RF-40)
-- =====================================================================
--
-- LA ENTREGA ES UN ACTO, NO UN ESTADO
--
-- Hasta aqui «entregada» era solo un estado de la orden: se sabia que
-- alguien la movio, pero no a quien se le entrego el equipo ni quien lo
-- recibio. Para un centro de servicio eso no alcanza — cuando un cliente
-- vuelve diciendo que nunca le devolvieron su lavadora, el estado no
-- contesta nada—. La entrega necesita nombre de quien retira, quien
-- entrego y, cuando corresponde, la firma.
--
-- Las condiciones que hay que cumplir ANTES de entregar (reparacion
-- terminada, validacion tecnica aprobada, cotizacion aceptada, pago hecho)
-- se comprueban en el servicio, donde se le puede decir al mostrador cual
-- falta. Aqui abajo solo queda el hecho consumado.

CREATE TABLE entrega (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_orden          uuid NOT NULL UNIQUE REFERENCES orden_servicio(id),
  -- Quien retira puede no ser el cliente: manda a un hijo, a un vecino.
  -- Se escribe tal cual, porque es lo que hay si despues se reclama.
  recibido_por      text NOT NULL,
  documento_receptor text,
  es_el_cliente     boolean NOT NULL DEFAULT true,
  id_evidencia_firma uuid REFERENCES evidencia(id),
  observacion       text,
  id_responsable    uuid NOT NULL REFERENCES usuario(id),
  momento           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_entrega_momento ON entrega (momento DESC);

COMMENT ON TABLE entrega IS
  'Acto de entrega del articulo. Una por orden: si se corrige, va por nota_correccion.';

-- ── estado del pago ──────────────────────────────────────────────────
--
-- Un pago registrado no siempre es un pago cobrado: una transferencia se
-- anota cuando el cliente dice que la hizo y se confirma cuando aparece en
-- la cuenta. Sin estado, el sistema daria por cobrado lo que todavia no
-- llego y dejaria salir el articulo.
CREATE TYPE estado_pago AS ENUM ('registrado', 'confirmado', 'anulado');

ALTER TABLE pago
  ADD COLUMN estado estado_pago NOT NULL DEFAULT 'registrado',
  ADD COLUMN motivo_anulacion text,
  ADD COLUMN confirmado_por uuid REFERENCES usuario(id),
  ADD COLUMN confirmado_en timestamptz;

-- Un pago no se borra nunca: se anula, y con motivo.
ALTER TABLE pago
  ADD CONSTRAINT ck_pago_anulado
    CHECK (estado <> 'anulado' OR motivo_anulacion IS NOT NULL);

-- El efectivo se cobra en el mostrador y ahi mismo queda confirmado; lo
-- demas nace registrado y alguien lo confirma. La siembra y el servicio
-- respetan eso; aqui solo se deja constancia de por que el estado existe.
COMMENT ON COLUMN pago.estado IS
  'Registrado = anotado; confirmado = el dinero entro. Solo lo confirmado habilita la entrega.';
