/** Los formularios de alta y edición del directorio de soporte. */

import type { FormEvent } from 'react';
import { ArrowRightLeft, AtSign, Building2, Save, Undo2, User, UserX } from 'lucide-react';

import { Button, DatePicker, SelectMenu, TextField } from '@/shared/ui';
import type {
  BajaDraft,
  CambioDraft,
  DepartamentoDraft,
  UsuarioDraft,
} from '@/features/support/hooks/useSupportUsuarios';
import type { DepartamentoSoporte, UsuarioSoporte } from '@/features/support/types';

/** `YYYY-MM-DD` → `DD/MM/YYYY`, sin pasar por `Date` para no moverla de día. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** `YYYY-MM-DD` más `n` días. En UTC, para que ningún cambio de hora lo mueva. */
function sumarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * La última fecha que ya ocupa la historia del usuario: su último cambio de
 * departamento o, si no tiene, su ingreso. Un cambio nuevo o una baja no
 * pueden caer antes; es la misma regla que aplica el modelo.
 */
function ultimaFechaOcupada(usuario: UsuarioSoporte): string | undefined {
  const fechas = [usuario.fecha_ingreso, ...usuario.historial.map((p) => p.desde)].filter(
    (f): f is string => Boolean(f),
  );
  return fechas.sort().at(-1);
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

export function UsuarioForm({
  value,
  departamentos,
  sufijo,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: UsuarioDraft;
  departamentos: DepartamentoSoporte[];
  sufijo: string;
  onChange: (patch: Partial<UsuarioDraft>) => void;
}) {
  const sinDepartamentos = departamentos.length === 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <TextField
        label="Nombre exacto en Odoo"
        icon={<AtSign />}
        value={value.nombre_odoo}
        onChange={(e) => onChange({ nombre_odoo: e.target.value })}
        placeholder={`Juan Pérez ${sufijo}`}
        autoFocus
      />
      {/* El sufijo lo pone el servidor, así que avisarlo aquí evita que alguien
          lo escriba a mano mal y crea que el registro no casó por otra razón. */}
      <p className="-mt-4 text-[10px] leading-tight text-slate-500">
        Tiene que coincidir carácter por carácter con las columnas «Asignado a» y «Creado por» del
        export. Si no escribes <strong className="text-slate-400">{sufijo}</strong>, se añade solo.
      </p>

      <div className="grid grid-cols-1 gap-6 border-t border-slate-800 pt-6 md:grid-cols-2">
        <TextField
          label="Nombre"
          icon={<User />}
          value={value.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder="Juan"
        />
        <TextField
          label="Apellido"
          icon={<User />}
          value={value.apellido}
          onChange={(e) => onChange({ apellido: e.target.value })}
          placeholder="Pérez"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <DatePicker
          label="Fecha de ingreso"
          value={value.fecha_ingreso}
          onChange={(fecha_ingreso) => onChange({ fecha_ingreso })}
          max={value.maxIngreso ?? undefined}
          // Borrarla solo tiene sentido al editar: en el alta es obligatoria.
          clearable={Boolean(value.id)}
          hint="Desde aquí cuenta su primer departamento."
        />
      </div>

      {value.departamentoEditable ? (
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">
            {value.id ? 'Departamento de ingreso' : 'Departamento'}
          </label>
          <SelectMenu
            value={value.departamento_id ? String(value.departamento_id) : ''}
            options={departamentos.map((d) => ({ value: String(d.id), label: d.nombre }))}
            onChange={(v) => onChange({ departamento_id: v ? Number(v) : null })}
            placeholder={sinDepartamentos ? 'No hay departamentos todavía' : 'Seleccionar...'}
            disabled={sinDepartamentos}
            aria-label="Departamento"
          />
          <p className="text-[10px] leading-tight text-slate-500">
            {sinDepartamentos
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
        disabled={!value.id && !value.fecha_ingreso}
      />
    </form>
  );
}

export function DepartamentoForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: DepartamentoDraft;
  onChange: (patch: Partial<DepartamentoDraft>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <TextField
        label="Departamento"
        icon={<Building2 />}
        value={value.nombre}
        onChange={(e) => onChange({ nombre: e.target.value })}
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
export function CambioDepartamentoForm({
  value,
  departamentos,
  saving,
  onChange,
  onSubmit,
  onClose,
  onDeshacer,
}: Acciones & {
  value: CambioDraft;
  departamentos: DepartamentoSoporte[];
  onChange: (patch: Partial<CambioDraft>) => void;
  onDeshacer: () => void;
}) {
  const { usuario } = value;
  const ocupada = ultimaFechaOcupada(usuario);
  const opciones = departamentos.filter((d) => d.id !== usuario.departamento_id);
  const ultimo = usuario.historial.length - 1;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase text-slate-400">Historial</label>
        <ol className="space-y-2">
          {usuario.historial.map((paso, i) => (
            <li
              key={paso.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-surface-tertiary/50 px-3 py-2 text-xs"
            >
              <span className="text-slate-300">
                <strong className="text-white">{paso.departamento}</strong>
                <span className="ml-2 text-slate-500">
                  desde {paso.desde ? fechaCorta(paso.desde) : `el ingreso (${fechaCorta(usuario.fecha_ingreso)})`}
                </span>
                {i === ultimo && <span className="ml-2 text-emerald-400">· vigente</span>}
              </span>
              {i === ultimo && i > 0 && (
                <button
                  type="button"
                  onClick={onDeshacer}
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
            value={value.departamento_id ? String(value.departamento_id) : ''}
            options={opciones.map((d) => ({ value: String(d.id), label: d.nombre }))}
            onChange={(v) => onChange({ departamento_id: v ? Number(v) : null })}
            placeholder={opciones.length ? 'Seleccionar...' : 'No hay otro departamento'}
            disabled={opciones.length === 0}
            aria-label="Nuevo departamento"
          />
        </div>
        <DatePicker
          label="Fecha del cambio (ascenso)"
          value={value.fecha}
          onChange={(fecha) => onChange({ fecha })}
          min={ocupada ? sumarDias(ocupada, 1) : undefined}
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
          disabled={!value.departamento_id || !value.fecha}
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
export function BajaForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: BajaDraft;
  onChange: (patch: Partial<BajaDraft>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-slate-300">
        <UserX className="mr-2 inline h-4 w-4 text-rose-400" />
        <strong className="text-white">{value.usuario.nombre_odoo}</strong> se conserva en el directorio
        con sus tickets y su historial, pero queda marcado como dado de baja. Los tickets que entren a su
        nombre después de esta fecha aparecerán en la pestaña «Tras la baja».
      </p>
      <DatePicker
        label="Fecha de egreso"
        value={value.fecha}
        onChange={(fecha) => onChange({ fecha })}
        min={ultimaFechaOcupada(value.usuario)}
      />
      <Pie saving={saving} onClose={onClose} submitLabel="Dar de baja" variant="danger" disabled={!value.fecha} />
    </form>
  );
}
