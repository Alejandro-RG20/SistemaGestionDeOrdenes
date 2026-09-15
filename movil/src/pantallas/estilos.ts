/**
 * Estilos de la aplicacion.
 *
 * Dos decisiones que no son estetica:
 *
 *  - Todo lo tocable mide al menos 48 puntos. El tecnico opera la tableta de
 *    pie, con guantes y a veces con una mano sosteniendo el articulo.
 *  - El contraste es alto y la tipografia grande. Media jornada de esto se
 *    trabaja bajo sol directo en un patio.
 */
import { StyleSheet } from 'react-native';

export const COLOR = {
  fondo: '#0f172a',
  tarjeta: '#1e293b',
  borde: '#334155',
  texto: '#f8fafc',
  textoTenue: '#94a3b8',
  acento: '#38bdf8',
  peligro: '#f87171',
  alerta: '#fbbf24',
  exito: '#4ade80',
} as const;

/** Alto minimo de cualquier cosa que se pueda tocar. */
export const ALTO_TOCABLE = 48;

export const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLOR.fondo, padding: 16 },
  titulo: { color: COLOR.texto, fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitulo: { color: COLOR.textoTenue, fontSize: 15, marginBottom: 16 },
  etiqueta: { color: COLOR.textoTenue, fontSize: 14, marginBottom: 6, marginTop: 12 },
  texto: { color: COLOR.texto, fontSize: 16 },
  textoTenue: { color: COLOR.textoTenue, fontSize: 14 },

  campo: {
    minHeight: ALTO_TOCABLE,
    backgroundColor: COLOR.tarjeta,
    borderColor: COLOR.borde,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLOR.texto,
    fontSize: 16,
  },
  campoLargo: { minHeight: 110, textAlignVertical: 'top' },

  boton: {
    minHeight: ALTO_TOCABLE,
    backgroundColor: COLOR.acento,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  botonTexto: { color: '#082f49', fontSize: 17, fontWeight: '700' },
  botonSecundario: { backgroundColor: COLOR.tarjeta, borderWidth: 1, borderColor: COLOR.borde },
  botonSecundarioTexto: { color: COLOR.texto },
  botonInhabilitado: { opacity: 0.45 },

  tarjeta: {
    backgroundColor: COLOR.tarjeta,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLOR.borde,
    padding: 14,
    marginBottom: 10,
  },
  tarjetaVencida: { borderColor: COLOR.peligro },
  tarjetaEnAlerta: { borderColor: COLOR.alerta },

  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  numero: { color: COLOR.acento, fontSize: 18, fontWeight: '700' },
  insignia: {
    color: COLOR.fondo,
    backgroundColor: COLOR.textoTenue,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },

  aviso: {
    backgroundColor: '#422006',
    borderColor: COLOR.alerta,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  avisoTexto: { color: COLOR.alerta, fontSize: 14 },
  error: { color: COLOR.peligro, fontSize: 15, marginTop: 10 },
  vacio: { color: COLOR.textoTenue, fontSize: 16, textAlign: 'center', marginTop: 40 },
});
