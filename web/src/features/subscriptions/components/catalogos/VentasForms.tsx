/** Los formularios del grupo Ventas: personas del directorio, equipos de ventas y unidades de negocio. */

import type { FormEvent, ReactNode } from 'react';
import { Briefcase, Building, Crown, Globe, Tag, UserCheck, Users } from 'lucide-react';

import { SelectMenu } from '@/shared/ui';
import {
  Field, FormBanner, FormColumns, FormFooter, ModalForm, OptionCard, OptionCardGroup, type FormTone,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import type {
  EquipoDraft, NombreEquipoDraft, PersonaDraft, UnidadDraft,
} from '@/features/subscriptions/hooks/useCatalogos';
import type {
  CargoVentas, CatalogoNombreEquipo, CatalogoOption, CatalogoPersonaVentas, TipoEquipo,
} from '@/features/subscriptions/types';

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
/** Valor del desplegable para el estado que sale de los clientes del asesor. */
const ESTADO_AUTOMATICO = '';

export function PersonaForm({
  value,
  cargos,
  estados = [],
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: PersonaDraft;
  cargos: CatalogoOption[];
  /** Los del catálogo, para fijar el del bono por meta de un asesor. Sin ellos no se ofrece. */
  estados?: { id: number; nombre: string }[];
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

      {value.cargo === 'asesor' && estados.length > 0 && (
        <Field
          label="Estado del bono por meta"
          hint="Automático: el de la zona donde tiene más clientes. Fíjalo solo si ese no es el estado en que vende."
        >
          <SelectMenu
            aria-label="Estado del bono por meta"
            className={modalInputClass}
            value={String(value.estado_fijo_id ?? ESTADO_AUTOMATICO)}
            options={[
              { value: ESTADO_AUTOMATICO, label: 'Automático (zona con más clientes)' },
              ...estados.map((e) => ({ value: String(e.id), label: e.nombre })),
            ]}
            onChange={(id) => onChange({ estado_fijo_id: id ? Number(id) : null })}
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

/** Cómo se presenta cada tipo de equipo como tarjeta. Las etiquetas las manda el servidor. */
export const TIPO_EQUIPO_UI: Record<TipoEquipo, { icon: ReactNode; description: string; tone: FormTone }> = {
  oficina: { icon: <Building />, description: 'De la oficina y nada más.', tone: 'purple' },
  externa: { icon: <Globe />, description: 'Responde además a un coordinador de unidad de negocio.', tone: 'amber' },
};

const SIN_ELEGIR = '';

const opcionesPersona = (personas: CatalogoPersonaVentas[], vacia: string) => [
  { value: SIN_ELEGIR, label: vacia },
  ...personas.map((p) => ({ value: String(p.id), label: `${p.nombre} ${p.apellido}` })),
];

/** Alta o edición de un equipo de ventas. */
export function EquipoForm({
  value,
  nombres,
  tipos,
  coordinadoresOficina,
  coordinadoresUn,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: EquipoDraft;
  /** La lista de la que se elige cómo se presenta (Catálogos › Ventas › Nombres de equipo). */
  nombres: CatalogoNombreEquipo[];
  tipos: CatalogoOption[];
  coordinadoresOficina: CatalogoPersonaVentas[];
  coordinadoresUn: CatalogoPersonaVentas[];
  onChange: (patch: Partial<EquipoDraft>) => void;
}) {
  const externo = value.tipo_equipo === 'externa';

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Equipo de ventas"
        description="El nombre en Odoo se compara contra «Equipo de ventas» sin distinguir mayúsculas: cópialo tal cual aparece en las suscripciones."
        action={<Users className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <Field label="Nombre en Odoo" hint="Tal y como aparece en «Equipo de ventas».">
        <input
          type="text"
          required
          className={modalInputClass}
          value={value.nombre_odoo}
          onChange={(e) => onChange({ nombre_odoo: e.target.value })}
        />
      </Field>

      <Field
        label="Nombre de visualización"
        hint={nombres.length
          ? 'Cómo se presenta. Varios equipos de Odoo pueden presentarse con el mismo nombre.'
          : 'Todavía no hay nombres: créalos en Catálogos › Ventas › Nombres de equipo.'}
      >
        <SelectMenu
          aria-label="Nombre de visualización"
          className={modalInputClass}
          value={String(value.nombre_visualizacion_id ?? SIN_ELEGIR)}
          options={[
            { value: SIN_ELEGIR, label: 'Elige un nombre' },
            ...nombres.map((n) => ({ value: String(n.id), label: n.nombre })),
          ]}
          onChange={(id) => onChange({ nombre_visualizacion_id: id ? Number(id) : null })}
        />
      </Field>

      <OptionCardGroup label="Tipo" columns="md:grid-cols-2">
        {tipos.map((tipo) => {
          const ui = TIPO_EQUIPO_UI[tipo.value as TipoEquipo];
          return (
            <OptionCard
              key={tipo.value}
              selected={value.tipo_equipo === tipo.value}
              onSelect={() => onChange({ tipo_equipo: tipo.value as TipoEquipo })}
              icon={ui.icon}
              title={tipo.label}
              description={ui.description}
              tone={ui.tone}
            />
          );
        })}
      </OptionCardGroup>

      <Field label="Coordinadora de oficina" hint="La oficina a la que pertenece el equipo.">
        <SelectMenu
          aria-label="Coordinadora de oficina"
          className={modalInputClass}
          value={String(value.coord_oficina_id ?? SIN_ELEGIR)}
          options={opcionesPersona(coordinadoresOficina, 'Elige una coordinadora')}
          onChange={(id) => onChange({ coord_oficina_id: id ? Number(id) : null })}
        />
      </Field>

      {externo && (
        <Field label="Coordinador de unidad de negocio" hint="Opcional: puede quedar vacío.">
          <SelectMenu
            aria-label="Coordinador de unidad de negocio"
            className={modalInputClass}
            value={String(value.coord_un_id ?? SIN_ELEGIR)}
            options={opcionesPersona(coordinadoresUn, 'Sin coordinador de UN')}
            onChange={(id) => onChange({ coord_un_id: id ? Number(id) : null })}
          />
        </Field>
      )}

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Registrar'} />
    </ModalForm>
  );
}

/** Alta o edición de un nombre de equipo. */
export function NombreEquipoForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: NombreEquipoDraft;
  onChange: (patch: Partial<NombreEquipoDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Nombre de equipo"
        description="La lista de nombres con los que se presentan los equipos de ventas. Renombrarlo aquí lo cambia en todos los equipos que lo usan."
        action={<Tag className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />
      <Field label="Nombre">
        <input
          type="text"
          required
          className={modalInputClass}
          value={value.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
        />
      </Field>
      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear'} />
    </ModalForm>
  );
}
