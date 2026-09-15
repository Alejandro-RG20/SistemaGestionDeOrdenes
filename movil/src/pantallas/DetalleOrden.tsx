/**
 * Ficha de la orden y acciones del tecnico.
 *
 * Los botones de avance salen de `flujo-campo`, no de una lista escrita
 * aqui: lo que se ofrece tiene que ser lo que el servidor va a aceptar. Un
 * boton de mas no da un error en pantalla, da una excepcion de
 * sincronizacion que alguien reconcilia a mano al dia siguiente.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { RESULTADO_VISITA, type EstadoOrden } from '@servitotal/compartido';
import type { Coordinador } from '../app/coordinador.js';
import type { OrdenEnEspejo } from '../datos/espejo.js';
import {
  admiteConsumo, admiteDiagnostico, admiteVisita, avancesDisponibles, porQueNoSePuedeMover,
} from '../dominio/flujo-campo.js';
import { COLOR, estilos } from './estilos.js';

export interface AccionesDeDetalle {
  alDiagnosticar: (idOrden: string) => void;
  alConsumir: (idOrden: string) => void;
  alCapturarEvidencia: (idOrden: string) => void;
  alVolver: () => void;
}

export function DetalleOrden(
  { coordinador, idOrden, acciones }:
  { coordinador: Coordinador; idOrden: string; acciones: AccionesDeDetalle },
): JSX.Element {
  const [orden, setOrden] = useState<OrdenEnEspejo | null>(null);
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const ficha = await coordinador.orden(idOrden);
    setOrden(ficha);
    if (ficha !== null) {
      const reglas = await coordinador.evidenciaRequerida(ficha);
      setFaltantes(reglas.filter((regla) => regla.bloqueaAvance).map((regla) => regla.etiqueta));
    }
  }, [coordinador, idOrden]);

  useEffect(() => { void recargar(); }, [recargar]);

  if (orden === null) {
    return (
      <View style={estilos.pantalla}>
        <Text style={estilos.vacio}>Esta orden ya no esta en la tableta.</Text>
        <TouchableOpacity style={[estilos.boton, estilos.botonSecundario]} onPress={acciones.alVolver}>
          <Text style={[estilos.botonTexto, estilos.botonSecundarioTexto]}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ficha = orden;

  async function mover(hacia: EstadoOrden, advertencia?: string): Promise<void> {
    const confirmar = (): void => {
      void (async () => {
        try {
          await coordinador.moverOrden(ficha.id, hacia);
          await recargar();
        } catch (fallo) {
          setError(fallo instanceof Error ? fallo.message : String(fallo));
        }
      })();
    };

    if (advertencia === undefined) { confirmar(); return; }
    Alert.alert('Antes de continuar', advertencia, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Continuar', onPress: confirmar },
    ]);
  }

  async function registrarVisita(resultado: typeof RESULTADO_VISITA[keyof typeof RESULTADO_VISITA]): Promise<void> {
    try {
      await coordinador.registrarVisita(ficha.id, resultado, new Date().toISOString());
      Alert.alert('Registrado', 'La visita quedo en la cola. Se subira cuando haya senal.');
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : String(fallo));
    }
  }

  const avances = avancesDisponibles(ficha.estado);
  const bloqueo = porQueNoSePuedeMover(ficha.estado);

  return (
    <ScrollView style={estilos.pantalla}>
      <TouchableOpacity onPress={acciones.alVolver} style={{ paddingVertical: 8 }}>
        <Text style={{ color: COLOR.acento, fontSize: 16 }}>‹ Mis ordenes</Text>
      </TouchableOpacity>

      <Text style={estilos.titulo}>Orden {ficha.numero}</Text>
      <Text style={estilos.subtitulo}>
        {ficha.estado.replace(/_/g, ' ')} · {ficha.tipoGarantia.replace(/_/g, ' ')}
      </Text>

      <View style={estilos.tarjeta}>
        <Text style={estilos.texto}>{ficha.cliente}</Text>
        <Text style={estilos.textoTenue}>{ficha.articulo}</Text>
        <Text style={[estilos.etiqueta, { marginTop: 10 }]}>Falla reportada</Text>
        <Text style={estilos.texto}>{ficha.fallaReportada}</Text>
        <Text style={estilos.etiqueta}>Contacto</Text>
        <Text style={estilos.texto}>{ficha.telefonoContacto}</Text>
        {ficha.direccionServicio === null ? null : (
          <>
            <Text style={estilos.etiqueta}>Direccion</Text>
            <Text style={estilos.texto}>{ficha.direccionServicio}</Text>
            {ficha.referenciaUbicacion === null
              ? null
              : <Text style={estilos.textoTenue}>{ficha.referenciaUbicacion}</Text>}
          </>
        )}
      </View>

      {faltantes.length === 0 ? null : (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTexto}>
            Evidencia que exige esta garantia: {faltantes.join(', ')}.
          </Text>
          <Text style={[estilos.avisoTexto, { marginTop: 6 }]}>
            La tableta no sabe cual ya tiene el servidor. Si duda, tomela: sobra una foto,
            no falta una orden trabada.
          </Text>
        </View>
      )}

      <Text style={estilos.etiqueta}>Registrar</Text>
      {admiteDiagnostico(ficha.estado) ? (
        <TouchableOpacity style={estilos.boton} onPress={() => acciones.alDiagnosticar(ficha.id)}>
          <Text style={estilos.botonTexto}>Diagnostico</Text>
        </TouchableOpacity>
      ) : null}
      {admiteConsumo(ficha.estado) ? (
        <TouchableOpacity style={estilos.boton} onPress={() => acciones.alConsumir(ficha.id)}>
          <Text style={estilos.botonTexto}>Repuesto usado</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={estilos.boton} onPress={() => acciones.alCapturarEvidencia(ficha.id)}>
        <Text style={estilos.botonTexto}>Tomar evidencia</Text>
      </TouchableOpacity>

      {admiteVisita(ficha.estado) ? (
        <>
          <Text style={estilos.etiqueta}>Resultado de la visita</Text>
          <TouchableOpacity
            style={[estilos.boton, estilos.botonSecundario]}
            onPress={() => void registrarVisita(RESULTADO_VISITA.RESUELTA_EN_SITIO)}
          >
            <Text style={[estilos.botonTexto, estilos.botonSecundarioTexto]}>Resuelta en el sitio</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[estilos.boton, estilos.botonSecundario]}
            onPress={() => void registrarVisita(RESULTADO_VISITA.CLIENTE_AUSENTE)}
          >
            <Text style={[estilos.botonTexto, estilos.botonSecundarioTexto]}>Cliente ausente</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[estilos.boton, estilos.botonSecundario]}
            onPress={() => void registrarVisita(RESULTADO_VISITA.NO_AUTORIZADA)}
          >
            <Text style={[estilos.botonTexto, estilos.botonSecundarioTexto]}>Cliente no autorizo</Text>
          </TouchableOpacity>
        </>
      ) : null}

      <Text style={estilos.etiqueta}>Avanzar la orden</Text>
      {avances.map((opcion) => (
        <TouchableOpacity
          key={opcion.hacia}
          style={estilos.boton}
          onPress={() => void mover(opcion.hacia, opcion.advertencia)}
        >
          <Text style={estilos.botonTexto}>{opcion.etiqueta}</Text>
        </TouchableOpacity>
      ))}
      {bloqueo === null ? null : <Text style={estilos.textoTenue}>{bloqueo}</Text>}

      {error === null ? null : <Text style={estilos.error}>{error}</Text>}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
