/** Los formularios de alta y edición del directorio de soporte. */

import type { FormEvent } from 'react';
import { AtSign, Building2, Save, User } from 'lucide-react';

import { Button, SelectMenu, TextField } from '@/shared/ui';
import type {
  DepartamentoDraft,
  UsuarioDraft,
} from '@/features/support/hooks/useSupportUsuarios';
import type { DepartamentoSoporte } from '@/features/support/types';

interface Acciones {
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

/** Pie común: cancelar y guardar, separados por un borde. */
function Pie({ saving, onClose, submitLabel }: Omit<Acciones, 'onSubmit'> & { submitLabel: string }) {
  return (
    <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
      <Button type="button" variant="outline" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" isLoading={saving} icon={<Save className="h-4 w-4" />}>
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

      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase text-slate-400">Departamento</label>
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

      <Pie saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Registrar usuario'} />
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
