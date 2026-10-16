/** Los formularios del grupo Ventas: personas del directorio y unidades de negocio. */

import type { FormEvent, ReactNode } from 'react';
import { Briefcase, Building, Crown, UserCheck, Users } from 'lucide-react';

import { SelectMenu } from '@/shared/ui';
import {
  Field, FormBanner, FormColumns, FormFooter, ModalForm, OptionCard, OptionCardGroup, type FormTone,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import type { PersonaDraft, UnidadDraft } from '@/features/subscriptions/hooks/useCatalogos';
import type { CargoVentas, CatalogoOption, CatalogoPersonaVentas } from '@/features/subscriptions/types';

interface Acciones {
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

/** Cómo se presenta cada cargo como tarjeta. Las etiquetas las manda el servidor. */
export const CARGO_UI: Record<CargoVentas, { icon: ReactNode; corto: string; description: string; tone: FormTone }> = {
  asesor: { icon: <Users />, corto: 'Asesores', description: 'Vende. Aparece en «Medio».', tone: 'blue' },
  supervisor: { icon: <UserCheck />, corto: 'Supervisores', description: 'Lleva un equipo de asesores. Aparece en «Oportunidad/Administrador».', tone: 'emerald' },
  coord_oficina: { icon: <Building />, corto: 'Coord. de oficina', description: 'Lleva una oficina. Aparece en «Vendedor», como usuario de Odoo.', tone: 'purple' },
  coord_un: { icon: <Crown />, corto: 'Coord. de UN', description: 'Lleva una o varias unidades de negocio. Cobra por su crecimiento.', tone: 'amber' },
};

/** Alta o edición de una persona del directorio de ventas. */
export function PersonaForm({
  value,
  cargos,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: PersonaDraft;
  cargos: CatalogoOption[];
  onChange: (patch: Partial<PersonaDraft>) => void;
}) {
  const conUsuario = value.cargo === 'coord_oficina';
  // Quien puede aparecer en «Oportunidad/Administrador»: el asesor no.
  const supervisa = value.cargo !== 'asesor';

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Como la escribe Odoo"
        description="El medio y el usuario se comparan contra el export sin distinguir mayúsculas: cópialos tal cual aparecen en las suscripciones."
        action={<Briefcase className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <FormColumns>
        <Field label="Nombre">
          <input
            type="text"
            required
            className={modalInputClass}
            value={value.nombre}
            onChange={(e) => onChange({ nombre: e.target.value })}
          />
        </Field>
        <Field label="Apellido">
          <input
            type="text"
            required
            className={modalInputClass}
            value={value.apellido}
            onChange={(e) => onChange({ apellido: e.target.value })}
          />
        </Field>
      </FormColumns>

      <OptionCardGroup label="Cargo" columns="md:grid-cols-2">
          {cargos.map((cargo) => {
            const ui = CARGO_UI[cargo.value as CargoVentas];
            return (
              <OptionCard
                key={cargo.value}
                selected={value.cargo === cargo.value}
                onSelect={() => onChange({ cargo: cargo.value as CargoVentas })}
                icon={ui.icon}
                title={cargo.label}
                description={ui.description}
                tone={ui.tone}
              />
            );
          })}
      </OptionCardGroup>

      <Field
        label="Medio (Odoo)"
        hint="Tal y como aparece en «Medio»: normalmente nombre y apellido, p. ej. «Ahiam Aguilar»."
      >
        <input
          type="text"
          required
          className={modalInputClass}
          value={value.medio}
          onChange={(e) => onChange({ medio: e.target.value })}
        />
      </Field>

      {supervisa && (
        <Field
          label="Como supervisor (Odoo)"
          hint="Tal y como aparece en «Oportunidad/Administrador», si Odoo lo escribe distinto que en «Medio». Vacío: el mismo que el medio."
        >
          <input
            type="text"
            className={modalInputClass}
            placeholder={value.medio || 'El mismo que el medio'}
            value={value.medio_supervisor}
            onChange={(e) => onChange({ medio_supervisor: e.target.value })}
          />
        </Field>
      )}

      {conUsuario && (
        <Field
          label="Usuario de Odoo"
          hint="Tal y como aparece en «Vendedor»: el nombre completo con el sufijo «(User)», que se añade solo si falta."
        >
          <input
            type="text"
            required
            className={modalInputClass}
            value={value.usuario_odoo}
            onChange={(e) => onChange({ usuario_odoo: e.target.value })}
          />
        </Field>
      )}

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Registrar'} />
    </ModalForm>
  );
}

/** Valor del desplegable para una unidad sin coordinador. */
const SIN_PERSONA = '';

/** Alta o edición de una unidad de negocio (el coordinador de las zonas). */
export function UnidadForm({
  value,
  personas,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: UnidadDraft;
  /** Los coordinadores de UN del directorio: los únicos que pueden llevarla. */
  personas: CatalogoPersonaVentas[];
  onChange: (patch: Partial<UnidadDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Unidad de negocio"
        description="Unidades de negocio agrupa por aquí las zonas que se le asignen en Estructura. Una persona puede llevar varias."
        action={<Crown className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <Field label="Nombre" hint="Como se presenta en Unidades de negocio.">
        <input
          type="text"
          required
          className={modalInputClass}
          value={value.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
        />
      </Field>

      <Field label="Coordinador" hint="A quien Comisiones le paga por el crecimiento de esta unidad.">
        <SelectMenu
          aria-label="Coordinador"
          className={modalInputClass}
          value={String(value.persona_id ?? SIN_PERSONA)}
          options={[
            { value: SIN_PERSONA, label: 'Sin asignar' },
            ...personas.map((p) => ({ value: String(p.id), label: `${p.nombre} ${p.apellido}` })),
          ]}
          onChange={(id) => onChange({ persona_id: id ? Number(id) : null })}
        />
      </Field>

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear'} />
    </ModalForm>
  );
}
