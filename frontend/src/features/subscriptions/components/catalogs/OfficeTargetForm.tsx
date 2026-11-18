/** El formulario del objetivo de ventas de las coordinadoras de oficina. */

import { Target, X } from 'lucide-react';

import { MonthPicker, SelectMenu } from '@/shared/ui';
import {
  FormActions,
  Field,
  FormBanner,
  FormColumns,
  FormFooter,
  ModalForm,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import type { OfficeTargetDraft } from '@/features/subscriptions/lib/catalogDrafts';
import type { CatalogSalesPerson } from '@/features/subscriptions/types';

/** Valor del desplegable para el objetivo general (sin persona). */
const GENERAL = '';

/** Alta o edición de un tramo del objetivo de ventas de las coordinadoras de oficina. */
export function OfficeTargetForm({
  value,
  coordinatorOffices,
  saving,
  onChange,
  onSubmit,
  onClose,
}: FormActions & {
  value: OfficeTargetDraft;
  /** Las coordinadoras de oficina del directorio: de quien puede ser uno individual. */
  coordinatorOffices: CatalogSalesPerson[];
  onChange: (patch: Partial<OfficeTargetDraft>) => void;
}) {
  const sinceAlways = !value.since;
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Objetivo de ventas de oficina"
        description="Cuántas ventas al mes se esperan de una coordinadora. Se mide contra él lo que vendió ella misma («Medio»). El individual manda sobre el general."
        action={<Target className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      {value.id ? (
        <Field label="Para">
          <div className="py-2 text-sm font-semibold text-white">{value.role_label}</div>
        </Field>
      ) : (
        <Field label="Para" hint="General: el de todas las que no tengan uno propio.">
          <SelectMenu
            aria-label="Para quién es el objetivo"
            className={modalInputClass}
            value={String(value.person_id ?? GENERAL)}
            options={[
              { value: GENERAL, label: 'General (todas las coordinadoras)' },
              ...coordinatorOffices.map((p) => ({
                value: String(p.id),
                label: `${p.name} ${p.last_name}`,
              })),
            ]}
            onChange={(id) => onChange({ person_id: id ? Number(id) : null })}
          />
        </Field>
      )}

      <FormColumns>
        <Field label="Ventas al mes">
          <input
            type="number"
            required
            min={1}
            step={1}
            className={modalInputClass}
            value={value.ventas}
            onChange={(e) => onChange({ ventas: e.target.value })}
          />
        </Field>
        <Field
          label="Vigente desde"
          hint="Vacío: desde siempre. Los meses anteriores conservan el objetivo que tenían."
          action={
            sinceAlways ? undefined : (
              <button
                type="button"
                onClick={() => onChange({ since: '' })}
                className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white"
              >
                <X className="h-3 w-3" /> Quitar fecha
              </button>
            )
          }
        >
          <MonthPicker
            value={value.since}
            onChange={(since) => onChange({ since })}
            placeholder="Desde siempre"
          />
        </Field>
      </FormColumns>

      <Field label="Nota" hint="Opcional: por qué se fijó.">
        <input
          type="text"
          className={modalInputClass}
          value={value.note}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </Field>

      <FormFooter
        saving={saving}
        onClose={onClose}
        submitLabel={value.id ? 'Guardar cambios' : 'Crear'}
      />
    </ModalForm>
  );
}
