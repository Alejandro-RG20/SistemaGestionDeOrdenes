/**
 * Rutas del panel.
 *
 * Cada ruta lleva el codigo de pantalla del prototipo (W-02, W-03…) y su
 * miga de pan. No es decoracion: es lo que permite señalar una pantalla
 * concreta en la defensa del proyecto sin describirla.
 *
 * `/consulta` queda FUERA de la sesion: es el portal del cliente y vive en
 * la misma aplicacion para no desplegar dos sitios por una sola pantalla.
 *
 * Ocultar una ruta no protege nada —el servidor comprueba el permiso en
 * cada peticion, que es la unica puerta que cuenta— pero evita que alguien
 * navegue a una pantalla que solo le va a devolver 403.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProveedorDeSesion, useSesion } from './sesion/contexto.js';
import { Armazon, type DatosDePantalla } from './componentes/Armazon.js';
import { Ingreso } from './pantallas/Ingreso.js';
import { PanelPrincipal } from './pantallas/PanelPrincipal.js';
import { Ordenes } from './pantallas/Ordenes.js';
import { NuevaOrden } from './pantallas/NuevaOrden.js';
import { DetalleOrden } from './pantallas/DetalleOrden.js';
import { Clientes } from './pantallas/Clientes.js';
import { FichaCliente } from './pantallas/FichaCliente.js';
import { Articulo } from './pantallas/Articulo.js';
import { Agenda } from './pantallas/Agenda.js';
import { Taller } from './pantallas/Taller.js';
import { Inventario, SolicitudesDeRepuesto } from './pantallas/Inventario.js';
import { Coberturas } from './pantallas/Coberturas.js';
import { Excepciones } from './pantallas/Excepciones.js';
import { Cobros, DetalleExpediente } from './pantallas/Cobros.js';
import { Indicadores } from './pantallas/Indicadores.js';
import { Administracion } from './pantallas/Administracion.js';
import { ConsultaPublica } from './pantallas/ConsultaPublica.js';
import { ProveedorDeCampo } from './campo/contexto.js';
import { ArmazonCampo, type DatosDePantallaDeCampo } from './componentes/ArmazonCampo.js';
import { MiRuta } from './pantallas/campo/MiRuta.js';
import { OrdenDeCampo } from './pantallas/campo/OrdenDeCampo.js';
import { Diagnostico } from './pantallas/campo/Diagnostico.js';
import { Evidencia } from './pantallas/campo/Evidencia.js';
import { MiBodega, Repuestos } from './pantallas/campo/Repuestos.js';
import { Cierre, Envios } from './pantallas/campo/Cierre.js';
import { tienePermiso } from './sesion/navegacion.js';

/** Envuelve una pantalla en el armazon, con su codigo del prototipo. */
function Pantalla(
  { codigo, miga, children }: DatosDePantalla & { children: JSX.Element },
): JSX.Element {
  return <Armazon pantalla={{ codigo, miga }}>{children}</Armazon>;
}

/** Envuelve una pantalla del tecnico en el armazon movil. */
function PantallaDeCampo(
  { codigo, miga, children }: DatosDePantallaDeCampo & { children: JSX.Element },
): JSX.Element {
  return <ArmazonCampo pantalla={{ codigo, miga }}>{children}</ArmazonCampo>;
}

/**
 * La aplicacion del tecnico: la misma web, sin instalar nada.
 *
 * Vive DENTRO del panel y no en otro despliegue. Eso no es comodidad de
 * empaquetado: es que el tecnico y la jefatura comparten sesion, permisos y
 * servidor, asi que un tecnico de planta que un dia atiende mostrador entra
 * por la misma puerta y ve lo que su rol le permite, sin una segunda
 * contraseña ni una segunda instalacion.
 */
function Campo(): JSX.Element {
  return (
    <ProveedorDeCampo>
      <Routes>
        <Route path="/" element={
          <PantallaDeCampo codigo="M-01" miga="Mi ruta"><MiRuta /></PantallaDeCampo>
        } />
        <Route path="/bodega" element={
          <PantallaDeCampo codigo="M-05" miga="Mi bodega movil"><MiBodega /></PantallaDeCampo>
        } />
        <Route path="/envios" element={
          <PantallaDeCampo codigo="M-07" miga="Cola de envio"><Envios /></PantallaDeCampo>
        } />
        <Route path="/ordenes/:id" element={
          <PantallaDeCampo codigo="M-02" miga="Ruta › Orden"><OrdenDeCampo /></PantallaDeCampo>
        } />
        <Route path="/ordenes/:id/diagnostico" element={
          <PantallaDeCampo codigo="M-03" miga="Orden › paso 2 de 6"><Diagnostico /></PantallaDeCampo>
        } />
        <Route path="/ordenes/:id/evidencia" element={
          <PantallaDeCampo codigo="M-04" miga="Orden › paso 3 de 6"><Evidencia /></PantallaDeCampo>
        } />
        <Route path="/ordenes/:id/repuestos" element={
          <PantallaDeCampo codigo="M-05" miga="Orden › paso 4 de 6"><Repuestos /></PantallaDeCampo>
        } />
        <Route path="/ordenes/:id/cierre" element={
          <PantallaDeCampo codigo="M-07" miga="Orden › paso 6 de 6"><Cierre /></PantallaDeCampo>
        } />
        <Route path="*" element={<Navigate to="/campo" replace />} />
      </Routes>
    </ProveedorDeCampo>
  );
}

function Privado(): JSX.Element {
  const { usuario } = useSesion();
  if (usuario === null) return <Ingreso />;

  // Quien sincroniza desde un dispositivo es quien trabaja en campo o en
  // planta. Ocultar la ruta no protege nada —el servidor comprueba el
  // permiso en cada peticion— pero evita que a un bodeguero le aparezca una
  // pantalla que no le va a servir de nada.
  const deCampo = tienePermiso(usuario, 'campo.sincronizar');

  return (
    <Routes>
      {deCampo
        ? <Route path="/campo/*" element={<Campo />} />
        : null}

      <Route path="/" element={
        <Pantalla codigo="W-02" miga="Inicio"><PanelPrincipal /></Pantalla>
      } />

      <Route path="/clientes" element={
        <Pantalla codigo="W-12" miga="Clientes"><Clientes /></Pantalla>
      } />
      <Route path="/clientes/:id" element={
        <Pantalla codigo="W-13" miga="Clientes › Ficha"><FichaCliente /></Pantalla>
      } />
      <Route path="/articulos/:id" element={
        <Pantalla codigo="W-14" miga="Clientes › Articulo"><Articulo /></Pantalla>
      } />

      {/* La ruta de alta va ANTES que la de detalle: si no, "nueva" se
          interpretaria como el identificador de una orden. */}
      <Route path="/ordenes/nueva" element={
        <Pantalla codigo="W-03" miga="Ordenes › Nueva"><NuevaOrden /></Pantalla>
      } />
      <Route path="/ordenes" element={
        <Pantalla codigo="W-04" miga="Ordenes de servicio"><Ordenes /></Pantalla>
      } />
      <Route path="/ordenes/:id" element={
        <Pantalla codigo="W-05" miga="Ordenes › Detalle"><DetalleOrden /></Pantalla>
      } />

      <Route path="/agenda" element={
        <Pantalla codigo="W-06" miga="Agenda y rutas"><Agenda /></Pantalla>
      } />
      <Route path="/taller" element={
        <Pantalla codigo="W-07" miga="Cola de taller"><Taller /></Pantalla>
      } />

      <Route path="/inventario" element={
        <Pantalla codigo="W-08" miga="Inventario y bodegas"><Inventario /></Pantalla>
      } />
      <Route path="/inventario/solicitudes" element={
        <Pantalla codigo="W-08" miga="Inventario › Solicitudes"><SolicitudesDeRepuesto /></Pantalla>
      } />
      <Route path="/coberturas" element={
        <Pantalla codigo="W-15" miga="Garantias › Reglas de cobertura"><Coberturas /></Pantalla>
      } />
      <Route path="/cobros" element={
        <Pantalla codigo="W-09" miga="Expedientes de cobro"><Cobros /></Pantalla>
      } />
      <Route path="/cobros/:id" element={
        <Pantalla codigo="W-09" miga="Cobros › Expediente"><DetalleExpediente /></Pantalla>
      } />
      <Route path="/excepciones" element={
        <Pantalla codigo="W-10" miga="Excepciones de sincronizacion"><Excepciones /></Pantalla>
      } />
      <Route path="/excepciones/:id" element={
        <Pantalla codigo="W-10" miga="Excepciones de sincronizacion"><Excepciones /></Pantalla>
      } />
      <Route path="/indicadores" element={
        <Pantalla codigo="W-11" miga="Indicadores"><Indicadores /></Pantalla>
      } />
      <Route path="/administracion" element={
        <Pantalla codigo="W-16" miga="Administracion"><Administracion /></Pantalla>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ProveedorDeSesion>
        <Routes>
          <Route path="/consulta" element={<ConsultaPublica />} />
          <Route path="*" element={<Privado />} />
        </Routes>
      </ProveedorDeSesion>
    </BrowserRouter>
  );
}
