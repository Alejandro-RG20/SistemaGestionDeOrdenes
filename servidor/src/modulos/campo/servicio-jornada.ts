/**
 * Descarga de jornada: lo que el tecnico se lleva a la calle.
 *
 * El pliego dice que el tecnico de ruta trabaja en casas SIN COBERTURA. La
 * consecuencia de disenio es esta: todo lo que va a necesitar en el dia
 * tiene que estar en la tableta ANTES de salir, en una sola peticion, y
 * tiene que caber. Por eso bajan sus ordenes vivas, el catalogo de
 * repuestos, lo que lleva en su bodega movil y las reglas de evidencia; no
 * baja el historico ni las ordenes de nadie mas.
 */
import type { JornadaDelDispositivo } from '@servitotal/compartido';
import type { Actor } from '../../comun/contexto-peticion.js';
import { ErrorDominio } from '../../comun/errores.js';
import * as repositorio from './repositorio-jornada.js';

export async function descargar(actor: Actor): Promise<JornadaDelDispositivo> {
  const tecnico = await repositorio.tecnicoDelUsuario(actor.id);
  if (tecnico === null) {
    throw new ErrorDominio(
      'USUARIO_NO_ES_TECNICO',
      'Esta cuenta no esta registrada como tecnico, asi que no tiene jornada que descargar. ' +
        'La aplicacion movil es para los tecnicos; el resto trabaja desde el panel.',
    );
  }

  // Cinco consultas, una peticion. No se paralelizan: van sobre la misma
  // conexion del pool y el cliente de pg no admite consultas simultaneas.
  const ordenes = await repositorio.ordenesDelTecnico(tecnico.id_tecnico);
  const repuestos = await repositorio.catalogoDeRepuestos();
  const existencias = tecnico.id_bodega === null
    ? []
    : await repositorio.existenciasDeBodega(tecnico.id_bodega);
  const reglas = await repositorio.reglasDeEvidencia();

  return {
    descargadaEn: new Date().toISOString(),
    idTecnico: tecnico.id_tecnico,
    tecnico: tecnico.tecnico,
    bodega: tecnico.id_bodega === null || tecnico.bodega === null
      ? null
      : { id: tecnico.id_bodega, nombre: tecnico.bodega },
    ordenes: ordenes.map((fila) => ({
      id: fila.id,
      numero: Number(fila.numero),
      estado: fila.estado as never,
      modalidad: fila.modalidad as never,
      tipoGarantia: fila.tipo_garantia as never,
      idCliente: fila.id_cliente,
      cliente: fila.cliente,
      idArticulo: fila.id_articulo,
      articulo: fila.articulo,
      fallaReportada: fila.falla_reportada,
      telefonoContacto: fila.telefono_contacto,
      direccionServicio: fila.direccion_servicio,
      referenciaUbicacion: fila.referencia_ubicacion,
      zona: fila.zona,
      plazoVenceEn: fila.plazo_vence_en?.toISOString() ?? null,
      evidenciasRegistradas: fila.evidencias,
    })),
    repuestos: repuestos.map((fila) => ({
      id: fila.id,
      codigo: fila.codigo,
      descripcion: fila.descripcion,
      precio: Number(fila.precio),
    })),
    existencias: existencias.map((fila) => ({
      idRepuesto: fila.id_repuesto,
      cantidad: fila.cantidad,
    })),
    reglasEvidencia: reglas.map((fila) => ({
      clave: fila.clave,
      etiqueta: fila.etiqueta,
      tipo: fila.tipo as never,
      momento: fila.momento,
      tipoArchivo: fila.tipo_archivo,
      bloqueaAvance: fila.bloquea_avance,
    })),
  };
}
