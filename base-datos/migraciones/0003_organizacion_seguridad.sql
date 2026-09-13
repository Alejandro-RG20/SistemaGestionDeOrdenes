-- =====================================================================
-- 0003 · Organizacion y seguridad
-- =====================================================================

-- H11: prevision de mas de un centro de servicio
CREATE TABLE centro (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        text NOT NULL,
  distrito      text,
  activo        boolean NOT NULL DEFAULT true,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rol (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo        text NOT NULL UNIQUE,   -- tecnico_ruta, agente, bodeguero, ...
  nombre        text NOT NULL,
  descripcion   text,
  activo        boolean NOT NULL DEFAULT true
);

-- H12: los permisos son datos, no condicionales repartidos en el codigo
CREATE TABLE permiso (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo        text NOT NULL UNIQUE,   -- orden.crear, orden.asignar, cobro.enviar...
  modulo        text NOT NULL,
  descripcion   text NOT NULL
);

CREATE TABLE rol_permiso (
  id_rol        uuid NOT NULL REFERENCES rol(id),
  id_permiso    uuid NOT NULL REFERENCES permiso(id),
  PRIMARY KEY (id_rol, id_permiso)
);

CREATE TABLE usuario (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_centro         uuid NOT NULL REFERENCES centro(id),
  id_rol            uuid NOT NULL REFERENCES rol(id),
  nombre_usuario    text NOT NULL UNIQUE,
  nombres           text NOT NULL,
  contrasena_hash   text NOT NULL,
  correo            text,
  intentos_fallidos smallint NOT NULL DEFAULT 0,
  bloqueado         boolean NOT NULL DEFAULT false,
  activo            boolean NOT NULL DEFAULT true,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid,
  modificado_en     timestamptz,
  modificado_por    uuid
);

-- RF-05: vinculacion y revocacion remota del dispositivo
CREATE TABLE dispositivo (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_usuario        uuid NOT NULL REFERENCES usuario(id),
  identificador     text NOT NULL UNIQUE,
  modelo            text,
  vinculado_en      timestamptz NOT NULL DEFAULT now(),
  revocado_en       timestamptz,
  ultima_sincronizacion timestamptz
);

CREATE TABLE tecnico (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_usuario    uuid NOT NULL UNIQUE REFERENCES usuario(id),
  id_centro     uuid NOT NULL REFERENCES centro(id),
  tipo          text NOT NULL CHECK (tipo IN ('ruta','planta')),
  especialidad  text NOT NULL,
  disponible    boolean NOT NULL DEFAULT true,
  activo        boolean NOT NULL DEFAULT true
);

CREATE INDEX ix_tecnico_tipo_disp ON tecnico (tipo, especialidad) WHERE disponible AND activo;
