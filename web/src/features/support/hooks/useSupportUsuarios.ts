import { useState } from 'react';
import { router } from '@inertiajs/react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import {
  supportApi,
  type DirectorioPayload,
  type DirectorioTipo,
  type MovimientoUsuario,
} from '@/shared/lib/api/support';
import type { DepartamentoSoporte, UsuarioSoporte } from '@/features/support/types';

/** Una fila en edición. Sin `id` es un alta. */
export type UsuarioDraft = {
  id?: number;
  nombre_odoo: string;
  nombre: string;
  apellido: string;
  departamento_id: number | null;
  fecha_ingreso: string;
  /**
   * Si el departamento todavía se puede elegir aquí: en el alta, o mientras el
   * usuario no haya cambiado nunca. Con cambios encima se usa «Cambiar
   * departamento», que es lo que deja la historia bien fechada.
   */
  departamentoEditable: boolean;
  /**
   * La última fecha de ingreso posible: el día antes del primer cambio de
   * departamento, o el egreso. Nula si nada la limita.
   */
  maxIngreso: string | null;
};

export type DepartamentoDraft = { id?: number; nombre: string };

/** El formulario de «Cambiar departamento»: a cuál, y desde cuándo. */
export type CambioDraft = { usuario: UsuarioSoporte; departamento_id: number | null; fecha: string };

/** El formulario de baja: solo la fecha de egreso. */
export type BajaDraft = { usuario: UsuarioSoporte; fecha: string };

export type DirectorioVista = 'pendientes' | 'trasBaja' | 'usuarios' | 'departamentos';

interface Args {
  departamentos: DepartamentoSoporte[];
  /** Nombre que llega en `?nuevo_usuario=`: abre el alta ya rellena. */
  nuevoUsuario: string;
}

/**
 * Estado de la pantalla del directorio de soporte.
 *
 * Mismo reparto que en los catálogos de suscripciones: un borrador por
 * catálogo en vez de uno genérico, y una recarga de la página tras cada
 * escritura, porque los dos listados dependen uno del otro —dar de alta un
 * departamento cambia lo que puede elegir un usuario— y el servidor ya
 * devuelve todo junto.
 */
export function useSupportUsuarios({ departamentos, nuevoUsuario }: Args) {
  const [vista, setVista] = useState<DirectorioVista>(() => (nuevoUsuario ? 'usuarios' : 'pendientes'));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `?nuevo_usuario=` viene de la pestaña de pendientes: el formulario abre con
  // el literal ya escrito para no obligar a copiar a mano una cadena que tiene
  // que coincidir carácter por carácter. Estado inicial y no efecto: el valor
  // llega con la primera pintada y no vuelve a cambiar mientras la página viva.
  const [usuarioDraft, setUsuarioDraft] = useState<UsuarioDraft | null>(
    () => (nuevoUsuario ? { ...usuarioVacio(departamentos), nombre_odoo: nuevoUsuario } : null),
  );
  const [departamentoDraft, setDepartamentoDraft] = useState<DepartamentoDraft | null>(null);
  const [borrando, setBorrando] = useState<{ tipo: DirectorioTipo; id: number; nombre: string } | null>(null);

  const nuevoUsuarioVacio = () => setUsuarioDraft(usuarioVacio(departamentos));
  const crearUsuarioDesde = (nombre_odoo: string) =>
    setUsuarioDraft({ ...usuarioVacio(departamentos), nombre_odoo });
  const editarUsuario = (fila: UsuarioSoporte) =>
    setUsuarioDraft({
      id: fila.id,
      nombre_odoo: fila.nombre_odoo,
      nombre: fila.nombre,
      apellido: fila.apellido,
      departamento_id: fila.departamento_id,
      fecha_ingreso: fila.fecha_ingreso ?? '',
      departamentoEditable: fila.historial.length <= 1,
      maxIngreso: limiteIngreso(fila),
    });

  const [cambioDraft, setCambioDraft] = useState<CambioDraft | null>(null);
  const [bajaDraft, setBajaDraft] = useState<BajaDraft | null>(null);

  // Sin fecha de partida: hoy puede caer antes del último cambio, y un valor
  // ya puesto que el servidor rechaza confunde más que un campo vacío. El
  // calendario ofrece «Hoy» a un clic cuando es válido.
  const abrirCambio = (usuario: UsuarioSoporte) => setCambioDraft({ usuario, departamento_id: null, fecha: '' });
  const abrirBaja = (usuario: UsuarioSoporte) => setBajaDraft({ usuario, fecha: '' });

  const nuevoDepartamento = () => setDepartamentoDraft({ nombre: '' });
  // `usuarios` se queda fuera a propósito: es un conteo que calcula el
  // servidor, no un campo del formulario.
  const editarDepartamento = (fila: DepartamentoSoporte) =>
    setDepartamentoDraft({ id: fila.id, nombre: fila.nombre });

  const cerrarFormularios = () => {
    setUsuarioDraft(null);
    setDepartamentoDraft(null);
    setCambioDraft(null);
    setBajaDraft(null);
  };

  const guardar = async (tipo: DirectorioTipo, payload: DirectorioPayload) => {
    setGuardando(true);
    setError(null);
    try {
      await supportApi.saveDirectorio(tipo, payload);
      cerrarFormularios();
      router.reload();
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo guardar el registro.'));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  /** Un cambio de departamento, su deshacer, una baja o una reactivación. */
  const mover = async (
    accion: MovimientoUsuario,
    id: number,
    extra: { departamento_id?: number | null; fecha?: string } = {},
  ) => {
    setGuardando(true);
    setError(null);
    try {
      await supportApi.moverUsuario(accion, id, extra);
      cerrarFormularios();
      router.reload();
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo registrar el movimiento.'));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const confirmarBorrado = async () => {
    if (!borrando) return;
    setGuardando(true);
    setError(null);
    try {
      await supportApi.deleteDirectorio(borrando.tipo, borrando.id);
      setBorrando(null);
      router.reload();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo eliminar el registro.'));
    } finally {
      setGuardando(false);
    }
  };

  return {
    vista, setVista, guardando, error, setError,
    usuarioDraft, setUsuarioDraft, nuevoUsuarioVacio, editarUsuario, crearUsuarioDesde,
    departamentoDraft, setDepartamentoDraft, nuevoDepartamento, editarDepartamento,
    cambioDraft, setCambioDraft, abrirCambio, bajaDraft, setBajaDraft, abrirBaja, mover,
    borrando, setBorrando, confirmarBorrado,
    cerrarFormularios, guardar,
  };
}

/**
 * El alta vacía, con el primer departamento ya elegido.
 *
 * El departamento es obligatorio en el servidor, así que abrir el formulario
 * sin ninguno seleccionado solo consigue que el primer intento falle.
 */
function usuarioVacio(departamentos: DepartamentoSoporte[]): UsuarioDraft {
  return {
    nombre_odoo: '',
    nombre: '',
    apellido: '',
    departamento_id: departamentos[0]?.id ?? null,
    fecha_ingreso: '',
    departamentoEditable: true,
    maxIngreso: null,
  };
}

/** El tope de `fecha_ingreso` que aplica el servidor, para no ofrecer días que rechazaría. */
function limiteIngreso(fila: UsuarioSoporte): string | null {
  const primerCambio = fila.historial.find((p) => p.desde)?.desde;
  if (primerCambio) {
    const [a, m, d] = primerCambio.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
  }
  return fila.fecha_egreso;
}
