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
  odoo_name: string;
  name: string;
  last_name: string;
  department_id: number | null;
  start_date: string;
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
  maxStartDate: string | null;
};

export type DepartmentDraft = { id?: number; name: string };

/** El formulario de «Cambiar departamento»: a cuál, y desde cuándo. */
export type ChangeDraft = { user: SupportUser; department_id: number | null; date: string };

/** El formulario de baja: solo la fecha de egreso. */
export type DeactivateDraft = { user: SupportUser; date: string };

export type DirectoryView = 'pendientes' | 'trasBaja' | 'usuarios' | 'departamentos';

interface Args {
  departments: SupportDepartment[];
  /** Nombre que llega en `?new_user=`: abre el alta ya rellena. */
  newUser: string;
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
export function useSupportUsers({ departments, newUser }: Args) {
  const [vista, setVista] = useState<DirectoryView>(() => (newUser ? 'usuarios' : 'pendientes'));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `?new_user=` viene de la pestaña de pendientes: el formulario abre con
  // el literal ya escrito para no obligar a copiar a mano una cadena que tiene
  // que coincidir carácter por carácter. Estado inicial y no efecto: el valor
  // llega con la primera pintada y no vuelve a cambiar mientras la página viva.
  const [usuarioDraft, setUsuarioDraft] = useState<UserDraft | null>(
    () => (newUser ? { ...emptyUser(departments), odoo_name: newUser } : null),
  );
  const [departamentoDraft, setDepartamentoDraft] = useState<DepartmentDraft | null>(null);
  const [borrando, setBorrando] = useState<{ type: DirectoryKind; id: number; name: string } | null>(null);

  const nuevoUsuarioVacio = () => setUsuarioDraft(emptyUser(departments));
  const crearUsuarioDesde = (odoo_name: string) =>
    setUsuarioDraft({ ...emptyUser(departments), odoo_name });
  const editarUsuario = (row: SupportUser) =>
    setUsuarioDraft({
      id: row.id,
      odoo_name: row.odoo_name,
      name: row.name,
      last_name: row.last_name,
      department_id: row.department_id,
      start_date: row.start_date ?? '',
      departmentEditable: row.timeline.length <= 1,
      maxStartDate: limiteIngreso(row),
    });

  const [cambioDraft, setCambioDraft] = useState<ChangeDraft | null>(null);
  const [bajaDraft, setBajaDraft] = useState<DeactivateDraft | null>(null);
  // Abrir un formulario empieza de cero: el error que hubiera es de la acción anterior.
  const formOpen = Boolean(usuarioDraft || departamentoDraft || cambioDraft || bajaDraft || borrando);
  useOnOpen(formOpen, () => setError(null));

  // Sin fecha de partida: hoy puede caer antes del último cambio, y un valor
  // ya puesto que el servidor rechaza confunde más que un campo vacío. El
  // calendario ofrece «Hoy» a un clic cuando es válido.
  const abrirCambio = (user: SupportUser) => setCambioDraft({ user, department_id: null, date: '' });
  const abrirBaja = (user: SupportUser) => setBajaDraft({ user, date: '' });

  const nuevoDepartamento = () => setDepartamentoDraft({ name: '' });
  // `usuarios` se queda fuera a propósito: es un conteo que calcula el
  // servidor, no un campo del formulario.
  const editarDepartamento = (row: SupportDepartment) =>
    setDepartamentoDraft({ id: row.id, name: row.name });

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
    extra: { department_id?: number | null; date?: string } = {},
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
      await supportApi.deleteDirectorio(borrando.type, borrando.id);
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
    odoo_name: '',
    name: '',
    last_name: '',
    department_id: departamentos[0]?.id ?? null,
    start_date: '',
    departmentEditable: true,
    maxStartDate: null,
  };
}

/** El tope de `fecha_ingreso` que aplica el servidor, para no ofrecer días que rechazaría. */
function limiteIngreso(row: SupportUser): string | null {
  const firstChange = row.timeline.find((p) => p.since)?.since;
  if (firstChange) {
    const [a, m, d] = firstChange.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
  }
  return row.end_date;
}
