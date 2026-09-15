/**
 * Diagnostico: la falla real frente a la reportada.
 *
 * Se escribe con el articulo delante, que es cuando se sabe. Queda en la
 * cola y sube despues; el tecnico no espera a nada.
 */
import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Coordinador } from '../app/coordinador.js';
import { COLOR, estilos } from './estilos.js';

export function RegistrarDiagnostico(
  { coordinador, idOrden, alVolver }:
  { coordinador: Coordinador; idOrden: string; alVolver: () => void },
): JSX.Element {
  const [fallaReal, setFallaReal] = useState('');
  const [componente, setComponente] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(): Promise<void> {
    setGuardando(true);
    setError(null);
    try {
      await coordinador.registrarDiagnostico(
        idOrden,
        fallaReal.trim(),
        componente.trim() === '' ? undefined : componente.trim(),
      );
      Alert.alert('Guardado', 'El diagnostico quedo en la cola de este dispositivo.');
      alVolver();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : String(fallo));
    } finally {
      setGuardando(false);
    }
  }

  const listo = fallaReal.trim().length >= 5 && !guardando;

  return (
    <ScrollView style={estilos.pantalla}>
      <TouchableOpacity onPress={alVolver} style={{ paddingVertical: 8 }}>
        <Text style={{ color: COLOR.acento, fontSize: 16 }}>‹ Volver a la orden</Text>
      </TouchableOpacity>

      <Text style={estilos.titulo}>Diagnostico</Text>
      <Text style={estilos.subtitulo}>
        Que encontro de verdad. Esto es lo que despues sostiene el reclamo a la marca.
      </Text>

      <Text style={estilos.etiqueta}>Falla real</Text>
      <TextInput
        style={[estilos.campo, estilos.campoLargo]}
        value={fallaReal}
        onChangeText={setFallaReal}
        multiline
        placeholder="Compresor con corto a tierra; no arranca."
        placeholderTextColor={COLOR.textoTenue}
      />

      <Text style={estilos.etiqueta}>Componente (opcional)</Text>
      <TextInput
        style={estilos.campo}
        value={componente}
        onChangeText={setComponente}
        placeholder="Compresor"
        placeholderTextColor={COLOR.textoTenue}
      />

      <TouchableOpacity
        style={[estilos.boton, listo ? null : estilos.botonInhabilitado]}
        disabled={!listo}
        onPress={guardar}
      >
        <Text style={estilos.botonTexto}>Guardar diagnostico</Text>
      </TouchableOpacity>

      {error === null ? null : <Text style={estilos.error}>{error}</Text>}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
