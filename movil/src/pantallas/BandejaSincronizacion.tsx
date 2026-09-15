/**
 * Bandeja de sincronizacion: que queda sin subir y por que.
 *
 * Es la pantalla que le da al tecnico una razon para confiar en la tableta.
 * Sin ella, "guardado" es una promesa que nadie puede verificar, y el
 * primer dia que algo se pierda —o que alguien CREA que se perdio— la gente
 * vuelve a la libreta de papel.
 *
 * Por eso dice cuantas quedan, cuando fue el ultimo intento y que contesto
 * el servidor, y por eso no ofrece ningun boton para borrar la cola.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { Coordinador } from '../app/coordinador.js';
import type { EstadoDeLaApp } from '../app/coordinador.js';
import type { ResumenDeSincronizacion } from '../sincronizacion/motor.js';
import { COLOR, estilos } from './estilos.js';

export function BandejaSincronizacion(
  { coordinador, alVolver, alSalir }:
  { coordinador: Coordinador; alVolver: () => void; alSalir: () => void },
): JSX.Element {
  const [estado, setEstado] = useState<EstadoDeLaApp | null>(null);
  const [resumen, setResumen] = useState<ResumenDeSincronizacion | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const recargar = useCallback(async () => {
    setEstado(await coordinador.estado());
  }, [coordinador]);

  useEffect(() => { void recargar(); }, [recargar]);

  async function sincronizar(): Promise<void> {
    setSincronizando(true);
    try {
      setResumen(await coordinador.sincronizarYDescargar());
    } finally {
      await recargar();
      setSincronizando(false);
    }
  }

  const pendientes = (estado?.operacionesPendientes ?? 0) + (estado?.evidenciasPendientes ?? 0);

  return (
    <ScrollView style={estilos.pantalla}>
      <TouchableOpacity onPress={alVolver} style={{ paddingVertical: 8 }}>
        <Text style={{ color: COLOR.acento, fontSize: 16 }}>‹ Mis ordenes</Text>
      </TouchableOpacity>

      <Text style={estilos.titulo}>Sincronizacion</Text>
      <Text style={estilos.subtitulo}>
        {estado?.usuario?.nombres ?? ''} · jornada bajada{' '}
        {estado?.descargadaEn === null || estado?.descargadaEn === undefined
          ? 'nunca'
          : new Date(estado.descargadaEn).toLocaleString()}
      </Text>

      <View style={estilos.tarjeta}>
        <View style={estilos.fila}>
          <Text style={estilos.texto}>Operaciones sin subir</Text>
          <Text style={[estilos.numero, { color: (estado?.operacionesPendientes ?? 0) > 0 ? COLOR.alerta : COLOR.exito }]}>
            {estado?.operacionesPendientes ?? 0}
          </Text>
        </View>
        <View style={[estilos.fila, { marginTop: 10 }]}>
          <Text style={estilos.texto}>Evidencias sin subir</Text>
          <Text style={[estilos.numero, { color: (estado?.evidenciasPendientes ?? 0) > 0 ? COLOR.alerta : COLOR.exito }]}>
            {estado?.evidenciasPendientes ?? 0}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[estilos.boton, sincronizando ? estilos.botonInhabilitado : null]}
        disabled={sincronizando}
        onPress={sincronizar}
      >
        {sincronizando
          ? <ActivityIndicator color="#082f49" />
          : <Text style={estilos.botonTexto}>Sincronizar ahora</Text>}
      </TouchableOpacity>

      {resumen === null ? null : (
        <View style={estilos.tarjeta}>
          <Text style={estilos.texto}>
            {resumen.interrumpidaPorConexion
              ? 'Se corto por falta de senal. Lo que falta sigue guardado aqui.'
              : 'Sincronizado.'}
          </Text>
          <Text style={[estilos.textoTenue, { marginTop: 8 }]}>
            Enviadas {resumen.operacionesEnviadas} · aplicadas {resumen.operacionesAplicadas} ·
            repetidas {resumen.operacionesRepetidas} · en revision {resumen.operacionesEnExcepcion}
          </Text>
          <Text style={estilos.textoTenue}>
            Evidencias subidas {resumen.evidenciasSubidas} · quedan {resumen.quedanPendientes}
          </Text>
          {resumen.mensajes.map((mensaje, indice) => (
            <Text key={indice} style={[estilos.textoTenue, { marginTop: 8, color: COLOR.alerta }]}>
              {mensaje}
            </Text>
          ))}
        </View>
      )}

      {resumen !== null && resumen.operacionesEnExcepcion > 0 ? (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTexto}>
            Hay trabajo que el servidor no pudo aplicar. NO se perdio: quedo integro en la
            bandeja de excepciones del taller y la jefatura de tecnicos lo concilia.
          </Text>
        </View>
      ) : null}

      <Text style={[estilos.etiqueta, { marginTop: 24 }]}>Sesion</Text>
      {pendientes > 0 ? (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTexto}>
            Quedan {pendientes} cosas sin subir. Si cierra sesion NO se borran —siguen en
            esta tableta— pero nadie en el taller las va a ver hasta que vuelva a entrar y
            sincronice.
          </Text>
        </View>
      ) : null}
      <TouchableOpacity
        style={[estilos.boton, estilos.botonSecundario]}
        onPress={() => void coordinador.cerrarSesion().then(alSalir)}
      >
        <Text style={[estilos.botonTexto, estilos.botonSecundarioTexto]}>Cerrar sesion</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
