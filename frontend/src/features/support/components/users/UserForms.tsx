/** Los formularios de alta y edición del directorio de soporte. */

import type { FormEvent } from 'react';
import { ArrowRightLeft, AtSign, Building2, Save, Undo2, User, UserX } from 'lucide-react';

import { Button, DatePicker, SelectMenu, TextField } from '@/shared/ui';
import type {
  DeactivateDraft,
  ChangeDraft,
  DepartmentDraft,
  UserDraft,
} from '@/features/support/hooks/useSupportUsers';
import type { SupportDepartment, SupportUser } from '@/features/support/types';

/** `YYYY-MM-DD` → `DD/MM/YYYY`, sin pasar por `Date` para no moverla de día. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** `YYYY-MM-DD` más `n` días. En UTC, para que ningún cambio de hora lo mueva. */
function addDays(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * La última fecha que ya ocupa la historia del usuario: su último cambio de
 * departamento o, si no tiene, su ingreso. Un cambio nuevo o una baja no
 * pueden caer antes; es la misma regla que aplica el modelo.
 */
function lastBusyDate(usuario: SupportUser): string | undefined {
  const dates = [usuario.start_date, ...usuario.timeline.map((p) => p.since)].filter(
    (f): f is string => Boolean(f),
  );
  return dates.sort().at(-1);
}

interface Acciones {
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

/** Pie común: cancelar y guardar, separados por un borde. */
function Pie({
  saving,
  onClose,
  submitLabel,
  variant,
  disabled,
}: Omit<Acciones, 'onSubmit'> & { submitLabel: string; variant?: 'primary' | 'danger'; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
      <Button type="button" variant="outline" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" variant={variant} disabled={disabled} isLoading={saving} icon={<Save className="h-4 w-4" />}>
        {submitLabel}
      </Button>
    </div>
  );
}

export function UserForm({
  value,
  departments,
  suffix,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: UserDraft;
  departments: SupportDepartment[];
  suffix: string;
  onChange: (patch: Partial<UserDraft>) => void;
}) {
  const withoutDepartments = departments.length === 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <TextField
        label="Nombre exacto en Odoo"
        icon={<AtSign />}
        value={value.odoo_name}
        onChange={(e) => onChange({ odoo_name: e.target.value })}
        placeholder={`Juan Pérez ${suffix}`}
        autoFocus
      />
      {/* El sufijo lo pone el servidor, así que avisarlo aquí evita que alguien
          lo escriba a mano mal y crea que el registro no casó por otra razón. */}
      <p className="-mt-4 text-[10px] leading-tight text-slate-500">
        Tiene que coincidir carácter por carácter con las columnas «Asignado a» y «Creado por» del
        export. Si no escribes <strong className="text-slate-400">{suffix}</strong>, se añade solo.
      </p>

      <div className="grid grid-cols-1 gap-6 border-t border-slate-800 pt-6 md:grid-cols-2">
        <TextField
          label="Nombre"
          icon={<User />}
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Juan"
        />
        <TextField
          label="Apellido"
          icon={<User />}
          value={value.last_name}
          onChange={(e) => onChange({ last_name: e.target.value })}
          placeholder="Pérez"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <DatePicker
          label="Fecha de ingreso"
          value={value.start_date}
          onChange={(start_date) => onChange({ start_date })}
          max={value.maxStartDate ?? undefined}
          // Borrarla solo tiene sentido al editar: en el alta es obligatoria.
          clearable={Boolean(value.id)}
          hint="Desde aquí cuenta su primer departamento."
        />
      </div>

      {value.departmentEditable ? (
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">
            {value.id ? 'Departamento de ingreso' : 'Departamento'}
          </label>
          <SelectMenu
            value={value.department_id ? String(value.department_id) : ''}
            options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
            onChange={(v) => onChange({ department_id: v ? Number(v) : null })}
            placeholder={withoutDepartments ? 'No hay departamentos todavía' : 'Seleccionar...'}
            disabled={withoutDepartments}
            aria-label="Departamento"
          />
          <p className="text-[10px] leading-tight text-slate-500">
            {withoutDepartments
              ? 'Crea primero un departamento en su pestaña: un usuario sin departamento no agrupa por nada.'
              : 'Se elige de la lista y no se escribe: un departamento tecleado libremente deja de agrupar.'}
          </p>
        </div>
      ) : (
        <p className="rounded-xl border border-slate-800 bg-surface-tertiary/50 p-3 text-[11px] leading-snug text-slate-400">
          Este usuario ya cambió de departamento. Para moverlo usa{' '}
          <strong className="text-slate-300">Cambiar departamento</strong>: así cada mes queda agrupado
          en el departamento en el que estaba entonces.
        </p>
      )}

      <Pie
        saving={saving}
        onClose={onClose}
        submitLabel={value.id ? 'Guardar cambios' : 'Registrar usuario'}
        disabled={!value.id && !value.start_date}
      />
    </form>
  );
}

export function DepartmentForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: DepartmentDraft;
  onChange: (patch: Partial<DepartmentDraft>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <TextField
        label="Departamento"
        icon={<Building2 />}
        value={value.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Soporte Técnico"
        autoFocus
      />
      <Pie saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear departamento'} />
    </form>
  );
}


/**
 * «Cambiar departamento»: la historia hasta hoy y el siguiente tramo.
 *
 * Solo se añade al final, con una fecha posterior al último cambio; corregir
 * un cambio mal puesto es deshacerlo, nunca colar uno en medio.
 */
export function DepartmentChangeForm({
  value,
  departments,
  saving,
  onChange,
  onSubmit,
  onClose,
  onUndo,
}: Acciones & {
  value: ChangeDraft;
  departments: SupportDepartment[];
  onChange: (patch: Partial<ChangeDraft>) => void;
  onUndo: () => void;
}) {
  const { user } = value;
  const ocupada = lastBusyDate(user);
  const opciones = departments.filter((d) => d.id !== user.department_id);
  const ultimo = user.timeline.length - 1;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase text-slate-400">Historial</label>
        <ol className="space-y-2">
          {user.timeline.map((paso, i) => (
            <li
              key={paso.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-surface-tertiary/50 px-3 py-2 text-xs"
            >
              <span className="text-slate-300">
                <strong className="text-white">{paso.department}</strong>
                <span className="ml-2 text-slate-500">
                  desde {paso.since ? shortDate(paso.since) : `el ingreso (${shortDate(user.start_date)})`}
                </span>
                {i === ultimo && <span className="ml-2 text-emerald-400">· vigente</span>}
              </span>
              {i === ultimo && i > 0 && (
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-lg border border-amber-500/30 px-2 py-1 text-[10px] text-amber-400 hover:bg-amber-500/10"
                  title="Borra este cambio y lo devuelve al departamento anterior"
                >
                  <Undo2 className="h-3 w-3" /> Deshacer
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-1 gap-6 border-t border-slate-800 pt-6 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">Nuevo departamento</label>
          <SelectMenu
            value={value.department_id ? String(value.department_id) : ''}
            options={opciones.map((d) => ({ value: String(d.id), label: d.name }))}
            onChange={(v) => onChange({ department_id: v ? Number(v) : null })}
            placeholder={opciones.length ? 'Seleccionar...' : 'No hay otro departamento'}
            disabled={opciones.length === 0}
            aria-label="Nuevo departamento"
          />
        </div>
        <DatePicker
          label="Fecha del cambio (ascenso)"
          value={value.date}
          onChange={(date) => onChange({ date })}
          min={ocupada ? addDays(ocupada, 1) : undefined}
        />
      </div>
      <p className="-mt-3 text-[10px] leading-tight text-slate-500">
        A partir de esa fecha sus tickets se agrupan en el nuevo departamento; los meses anteriores
        siguen en el que tenía entonces.
      </p>

      <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          isLoading={saving}
          disabled={!value.department_id || !value.date}
          icon={<ArrowRightLeft className="h-4 w-4" />}
        >
          Cambiar departamento
        </Button>
      </div>
    </form>
  );
}

/**
 * Baja de un usuario. No lo borra: sus tickets pasados siguen siendo suyos y
 * el directorio lo sigue reconociendo, pero a partir de esa fecha no debería
 * entrarle ninguno más.
 */
export function DeactivateForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: DeactivateDraft;
  onChange: (patch: Partial<DeactivateDraft>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-slate-300">
        <UserX className="mr-2 inline h-4 w-4 text-rose-400" />
        <strong className="text-white">{value.user.odoo_name}</strong> se conserva en el directorio
        con sus tickets y su historial, pero queda marcado como dado de baja. Los tickets que entren a su
        nombre después de esta fecha aparecerán en la pestaña «Tras la baja».
      </p>
      <DatePicker
        label="Fecha de egreso"
        value={value.date}
        onChange={(date) => onChange({ date })}
        min={lastBusyDate(value.user)}
      />
      <Pie saving={saving} onClose={onClose} submitLabel="Dar de baja" variant="danger" disabled={!value.date} />
    </form>
  );
}
