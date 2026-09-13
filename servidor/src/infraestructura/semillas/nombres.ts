/** Vocabulario para generar personas, direcciones y fallas verosimiles de Managua. */

export const NOMBRES_PILA = [
  'Maria', 'Jose', 'Ana', 'Carlos', 'Rosa', 'Juan', 'Martha', 'Luis', 'Karla', 'Denis',
  'Yelba', 'Marvin', 'Xiomara', 'Byron', 'Scarleth', 'Alvaro', 'Heyling', 'Norlan',
  'Ileana', 'Freddy', 'Massiel', 'Elvin', 'Auxiliadora', 'Wilfredo', 'Gioconda',
  'Ramon', 'Jazmina', 'Erick', 'Nubia', 'Salvador', 'Indiana', 'Bismarck', 'Thelma',
] as const;

export const APELLIDOS = [
  'Lopez', 'Martinez', 'Gonzalez', 'Rodriguez', 'Hernandez', 'Perez', 'Sanchez',
  'Ramirez', 'Flores', 'Gomez', 'Diaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz',
  'Gutierrez', 'Chavarria', 'Membreno', 'Zeledon', 'Baltodano', 'Silva', 'Mairena',
  'Aguirre', 'Sequeira', 'Traña', 'Bermudez', 'Urbina', 'Palacios', 'Obando', 'Narvaez',
] as const;

/** Barrios y repartos del distrito VI de Managua. */
export const ZONAS = [
  ['Villa Venezuela', 380], ['Villa Libertad', 380], ['Bello Amanecer', 420],
  ['Villa Reconciliacion', 420], ['Barrio Georgino Andrade', 450], ['Villa Flor Sur', 400],
  ['Waspan Norte', 450], ['Waspan Sur', 450], ['Laureles Norte', 480],
  ['Colonia Primero de Mayo', 350], ['Villa Miguel Gutierrez', 500], ['Barrio Camilo Chamorro', 400],
  ['Reparto Schick', 350], ['Villa Progreso', 470], ['Barrio Domitila Lugo', 430],
] as const satisfies readonly (readonly [string, number])[];

export const REFERENCIAS_UBICACION = [
  'De la iglesia catolica 2 cuadras al lago',
  'Del porton negro 1 cuadra abajo, casa verde',
  'Frente a la pulperia La Esperanza',
  'De donde fue el arbolito 3 cuadras al sur',
  'Contiguo al colegio publico, porton blanco',
  'De la parada de buses 50 varas arriba',
  'Del puente peatonal 1 c. al norte, 2 c. al este',
  'Ultima casa del callejon, verja de tubos',
] as const;

/** Falla tal como la dicta el cliente por telefono. */
export const FALLAS_REPORTADAS = [
  'No enfria', 'Hace mucho ruido', 'No enciende', 'Bota agua', 'No calienta',
  'Se apaga sola', 'No centrifuga', 'No desagua', 'La puerta no cierra',
  'Huele a quemado', 'Enfria poco', 'No da imagen', 'No tiene sonido',
  'El tambor no gira', 'Marca error en la pantalla', 'Bota el breaker',
] as const;

/** Falla real que escribe el tecnico tras el diagnostico. */
export const FALLAS_REALES = [
  'Compresor en corto', 'Termostato danado', 'Fuga de gas en evaporador',
  'Bomba de desague obstruida', 'Banda de transmision rota', 'Tarjeta electronica quemada',
  'Motor de agitacion trabado', 'Resistencia abierta', 'Capacitor de arranque agotado',
  'Sensor de temperatura fuera de rango', 'Empaque de puerta vencido',
  'Ventilador del condensador trabado', 'Filtro secador saturado',
] as const;

/** Fallas que las reglas de cobertura suelen excluir. */
export const FALLAS_EXCLUIDAS = [
  'golpe', 'humedad', 'sobrecarga_electrica', 'uso_indebido', 'plaga',
  'instalacion_incorrecta', 'falta_mantenimiento',
] as const;

export const COMPONENTES = [
  'compresor', 'tarjeta_electronica', 'motor', 'termostato', 'bomba',
  'resistencia', 'sensor', 'banda', 'capacitor', 'valvula',
] as const;
