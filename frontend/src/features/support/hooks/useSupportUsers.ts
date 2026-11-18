import { useState } from 'react';

import { useOnOpen } from '@/shared/hooks/useOnOpen';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import {
  supportApi,
  type DirectoryPayload,
  type DirectoryKind,
  type UserMove,
} from '@/shared/lib/api/support';
import type { SupportDepartment, SupportUser } from '@/features/support/types';

/** Una fila en edición. Sin `id` es un alta. */
export type UserDraft = {
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
  departmentEditable: boolean;
  /**
   * La última fecha de ingreso posible: el día antes del primer cambio de
   * departamento, o el egreso. Nula si nada la limita.
   */
  maxIngreso: string | null;
};

export type DepartmentDraft = { id?: number; nombre: string };

/** El formulario de «Cambiar departamento»: a cuál, y desde cuándo. */
export type ChangeDraft = { usuario: SupportUser; departamento_id: number | null; fecha: string };

/** El formulario de baja: solo la fecha de egreso. */
export type DeactivateDraft = { usuario: SupportUser; fecha: string };

export type DirectoryView = 'pendientes' | 'trasBaja' | 'usuarios' | 'departamentos';

interface Args {
  departamentos: SupportDepartment[];
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
export function useSupportUsers({ departamentos, nuevoUsuario }: Args) {
  const [vista, setVista] = useState<DirectoryView>(() => (nuevoUsuario ? 'usuarios' : 'pendientes'));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `?nuevo_usuario=` viene de la pestaña de pendientes: el formulario abre con
  // el literal ya escrito para no obligar a copiar a mano una cadena que tiene
  // que coincidir carácter por carácter. Estado inicial y no efecto: el valor
  // llega con la primera pintada y no vuelve a cambiar mientras la página viva.
  const [usuarioDraft, setUsuarioDraft] = useState<UserDraft | null>(
    () => (nuevoUsuario ? { ...emptyUser(departamentos), nombre_odoo: nuevoUsuario } : null),
  );
  const [departamentoDraft, setDepartamentoDraft] = useState<DepartmentDraft | null>(null);
  const [borrando, setBorrando] = useState<{ tipo: DirectoryKind; id: number; nombre: string } | null>(null);

  const nuevoUsuarioVacio = () => setUsuarioDraft(emptyUser(departamentos));
  const crearUsuarioDesde = (nombre_odoo: string) =>
    setUsuarioDraft({ ...emptyUser(departamentos), nombre_odoo });
  const editarUsuario = (row: SupportUser) =>
    setUsuarioDraft({
      id: row.id,
      nombre_odoo: row.nombre_odoo,
      nombre: row.nombre,
      apellido: row.apellido,
      departamento_id: row.departamento_id,
      fecha_ingreso: row.fecha_ingreso ?? '',
      departmentEditable: row.historial.length <= 1,
      maxIngreso: limiteIngreso(row),
    });

  const [cambioDraft, setCambioDraft] = useState<ChangeDraft | null>(null);
  const [bajaDraft, setBajaDraft] = useState<DeactivateDraft | null>(null);
  // Abrir un formulario empieza de cero: el error que hubiera es de la acción anterior.
  const formOpen = Boolean(usuarioDraft || departamentoDraft || cambioDraft || bajaDraft || borrando);
  useOnOpen(formOpen, () => setError(null));

  // Sin fecha de partida: hoy puede caer antes del último cambio, y un valor
  // ya puesto que el servidor rechaza confunde más que un campo vacío. El
  // calendario ofrece «Hoy» a un clic cuando es válido.
  const abrirCambio = (usuario: SupportUser) => setCambioDraft({ usuario, departamento_id: null, fecha: '' });
  const abrirBaja = (usuario: SupportUser) => setBajaDraft({ usuario, fecha: '' });

  const nuevoDepartamento = () => setDepartamentoDraft({ nombre: '' });
  // `usuarios` se queda fuera a propósito: es un conteo que calcula el
  // servidor, no un campo del formulario.
  const editarDepartamento = (row: SupportDepartment) =>
    setDepartamentoDraft({ id: row.id, nombre: row.nombre });

  const cerrarFormularios = () => {
    setUsuarioDraft(null);
    setDepartamentoDraft(null);
    setCambioDraft(null);
    setBajaDraft(null);
  };

  const guardar = async (tipo: DirectoryKind, payload: DirectoryPayload) => {
    setGuardando(true);
    setError(null);
    try {
      await supportApi.saveDirectorio(tipo, payload);
      cerrarFormularios();
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
    accion: UserMove,
    id: number,
    extra: { departamento_id?: number | null; fecha?: string } = {},
  ) => {
    setGuardando(true);
    setError(null);
    try {
      await supportApi.moverUsuario(accion, id, extra);
      cerrarFormularios();
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
function emptyUser(departamentos: SupportDepartment[]): UserDraft {
  return {
    nombre_odoo: '',
    nombre: '',
    apellido: '',
    departamento_id: departamentos[0]?.id ?? null,
    fecha_ingreso: '',
    departmentEditable: true,
    maxIngreso: null,
  };
}

/** El tope de `fecha_ingreso` que aplica el servidor, para no ofrecer días que rechazaría. */
function limiteIngreso(row: SupportUser): string | null {
  const firstChange = row.historial.find((p) => p.desde)?.desde;
  if (firstChange) {
    const [a, m, d] = firstChange.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
  }
  return row.fecha_egreso;
}
