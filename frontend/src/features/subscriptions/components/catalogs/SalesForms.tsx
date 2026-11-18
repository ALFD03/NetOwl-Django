/**
 * Los formularios del grupo Ventas: la persona de un equipo con su papel, los
 * sites y las unidades de negocio con sus zonas y equipos, y el objetivo de
 * ventas de las coordinadoras de oficina. Las condiciones de pago de cada rol
 * tienen el suyo en `RoleConditions.tsx`.
 */

import { type ReactNode } from 'react';
import {
  Banknote, Briefcase, Building, Crown, Landmark, MapPin, Network, Phone, Plus, ShieldCheck, Trash2, UserCheck, Users } from 'lucide-react';

import { SelectMenu } from '@/shared/ui';
import {
  FormActions, Field, FormBanner, FormColumns, FormFooter, ModalForm, type FormTone,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import type { MembershipDraft, SiteDraft, UnitDraft } from '@/features/subscriptions/lib/catalogDrafts';
import type {
  CatalogSalesTeam,
  CatalogMembership,
  CatalogSalesPerson,
  CatalogTeamRole,
  CatalogBusinessUnit,
  CatalogZone,
  SalesRole,
} from '@/features/subscriptions/types';
import { CheckboxList } from './CheckboxList';


/** Cómo se presenta cada rol. Las etiquetas las manda el servidor (`equipos.ROLES`). */
export const ROLE_UI: Record<SalesRole, { icon: ReactNode; short: string; description: string; tone: FormTone }> = {
  jefe: { icon: <ShieldCheck />, short: 'Jefe', description: 'Lleva el equipo entero. Aparece en «Medio» y «Oportunidad/Administrador».', tone: 'amber' },
  jefe_un: { icon: <Crown />, short: 'Jefe de UN', description: 'Lleva varias unidades de negocio. Cobra por todas sus ventas y por su cumplimiento de ingresos.', tone: 'amber' },
  coord_un: { icon: <Crown />, short: 'Coord. de UN', description: 'Lleva una unidad de negocio. Cobra por su crecimiento y su churn.', tone: 'amber' },
  gerente_un: { icon: <Crown />, short: 'Gerente de UN', description: 'Lleva varias unidades de negocio.', tone: 'amber' },
  gerente_ops: { icon: <Landmark />, short: 'Gerente de operaciones', description: 'Cobra por las ventas de las unidades de negocio que tiene. No aparece en las suscripciones.', tone: 'sky' },
  coord_oficina: { icon: <Building />, short: 'Coord. de oficina', description: 'Lleva una oficina de un site. Aparece en «Vendedor», como usuario de Odoo.', tone: 'purple' },
  supervisor: { icon: <UserCheck />, short: 'Supervisores', description: 'Lleva un equipo de asesores. Aparece en «Oportunidad/Administrador».', tone: 'emerald' },
  asesor: { icon: <Users />, short: 'Asesores', description: 'Vende. Aparece en «Medio».', tone: 'blue' },
  administradora: { icon: <Banknote />, short: 'Administradora', description: 'No cobra comisión por ventas: cobra un bono por el cumplimiento de la empresa.', tone: 'slate' },
  telemarketing: { icon: <Phone />, short: 'Telemarketing', description: 'Vende por teléfono. Aparece en «Medio».', tone: 'blue' },
};

/** Valor de un desplegable sin elección. */
const NONE = '';

/**
 * Otros nombres con los que Odoo escribe a la misma persona en una columna
 * (con y sin tilde, abreviado...). Cada uno se cruza con el export igual que el
 * principal, así que sus ventas son todas de ella.
 */
function OtherNames({
  names: nameList,
  placeholder,
  onChange,
}: {
  names: string[];
  placeholder: string;
  onChange: (names: string[]) => void;
}) {
  return (
    <div className="mt-2 space-y-2">
      {nameList.map((name, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            className={modalInputClass}
            placeholder={placeholder}
            aria-label="Otro nombre"
            value={name}
            onChange={(e) => onChange(nameList.map((n, k) => (k === i ? e.target.value : n)))}
          />
          <button
            type="button"
            onClick={() => onChange(nameList.filter((_, k) => k !== i))}
            className="text-rose-400 hover:text-rose-300"
            title="Quitar este nombre"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...nameList, ''])}
        className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300"
      >
        <Plus className="h-3 w-3" /> Añadir otro nombre
      </button>
    </div>
  );
}

/** Alta o edición del papel de una persona en un equipo. Lo que pide depende del rol. */
export function MembershipForm({
  value,
  teams,
  team,
  role,
  people,
  memberships,
  sites,
  units,
  saving,
  onChange,
  onSubmit,
  onClose,
}: FormActions & {
  value: MembershipDraft;
  /** Todos los equipos, para poder pasar a la persona de uno a otro. */
  teams: CatalogSalesTeam[];
  team: CatalogSalesTeam;
  role: CatalogTeamRole;
  /** Las personas ya registradas, para dar un papel nuevo a quien ya existe (p. ej. el gerente de operaciones). */
  people: CatalogSalesPerson[];
  /** Todas las membresías: de ahí salen los posibles superiores de un supervisor. */
  memberships: CatalogMembership[];
  sites: { id: number; name: string }[];
  units: CatalogBusinessUnit[];
  onChange: (patch: Partial<MembershipDraft>) => void;
}) {
  const ui = ROLE_UI[role.role];
  const superiors = role.manager
    ? memberships.filter((m) => m.equipo === team.slug && m.role === role.manager)
    : [];
  // Quien ya está en este equipo no se ofrece: tendría dos papeles en el mismo.
  const alreadyInTeam = new Set(memberships.filter((m) => m.equipo === team.slug).map((m) => m.person_id));
  const available = people.filter((p) => !alreadyInTeam.has(p.id));

  const pickPerson = (id: string) => {
    const person = people.find((p) => String(p.id) === id);
    onChange(person
      ? {
        person_id: person.id,
        name: person.name,
        last_name: person.last_name,
        channel: person.channel,
        supervisor_channel: person.supervisor_channel,
        odoo_user: person.odoo_user,
        channel_alias: person.channel_alias,
        supervisor_alias: person.supervisor_alias,
        user_alias: person.user_alias,
      }
      : { person_id: null });
  };

  // Cambiar de equipo o de puesto: el rol se conserva si el equipo nuevo lo tiene, y si no se
  // toma el primero. El superior no se lleva: era de otro equipo u otro rol.
  const changeTitle = (slug: string, newRole: SalesRole | null) => {
    const target = teams.find((e) => e.slug === slug);
    if (!target) return;
    const chosen = newRole ?? (target.roles.some((r) => r.role === value.role) ? value.role : target.roles[0]?.role);
    if (!chosen) return;
    onChange({ team_id: target.id, equipo: target.slug, role: chosen, manager_id: null });
  };

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={`${role.role_label} · ${team.name}`}
        description={`${ui.description} Los literales se comparan contra el export sin distinguir mayúsculas: cópialos tal cual aparecen en las suscripciones.`}
        action={<Briefcase className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <FormColumns>
        <Field label="Equipo de ventas">
          <SelectMenu
            aria-label="Equipo de ventas"
            className={modalInputClass}
            value={team.slug}
            options={teams.map((e) => ({ value: e.slug, label: e.name }))}
            onChange={(slug) => changeTitle(slug, null)}
          />
        </Field>
        <Field label="Puesto">
          <SelectMenu
            aria-label="Puesto"
            className={modalInputClass}
            value={role.role}
            options={team.roles.map((r) => ({ value: r.role, label: r.role_label }))}
            onChange={(r) => changeTitle(team.slug, r as SalesRole)}
          />
        </Field>
      </FormColumns>
      {value.id && (
        <p className="-mt-2 text-[11px] text-slate-500">
          Al cambiar de equipo o de puesto se sueltan los sites, las unidades y el superior que el nuevo puesto no lleva;
          los supervisores que respondían a esta persona quedan sin asignar.
        </p>
      )}

      {!value.id && available.length > 0 && (
        <Field label="Persona" hint="Elige una ya registrada (en otro equipo, por ejemplo) o escribe una nueva.">
          <SelectMenu
            aria-label="Persona"
            className={modalInputClass}
            value={String(value.person_id ?? NONE)}
            options={[
              { value: NONE, label: 'Persona nueva' },
              ...available.map((p) => ({ value: String(p.id), label: `${p.name} ${p.last_name}` })),
            ]}
            onChange={pickPerson}
          />
        </Field>
      )}

      <FormColumns>
        <Field label="Nombre">
          <input type="text" required className={modalInputClass} value={value.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="Apellido">
          <input type="text" required className={modalInputClass} value={value.last_name} onChange={(e) => onChange({ last_name: e.target.value })} />
        </Field>
      </FormColumns>

      {role.channel && (
        <Field label="Medio (Odoo)" hint="Tal y como aparece en «Medio»: normalmente nombre y apellido, p. ej. «Ahiam Aguilar».">
          <input type="text" required className={modalInputClass} value={value.channel} onChange={(e) => onChange({ channel: e.target.value })} />
          <OtherNames names={value.channel_alias} placeholder="Otra forma de escribirlo (p. ej. con tilde)" onChange={(channel_alias) => onChange({ channel_alias })} />
        </Field>
      )}

      {role.supervisor && (
        <Field
          label="Como supervisor (Odoo)"
          hint="Tal y como aparece en «Oportunidad/Administrador», si Odoo lo escribe distinto que en «Medio». Vacío: el mismo que el medio."
        >
          <input
            type="text"
            className={modalInputClass}
            placeholder={value.channel || 'El mismo que el medio'}
            value={value.supervisor_channel}
            onChange={(e) => onChange({ supervisor_channel: e.target.value })}
          />
          <OtherNames names={value.supervisor_alias} placeholder="Otra forma de escribirlo como supervisor" onChange={(alias_supervisor) => onChange({ supervisor_alias: alias_supervisor })} />
        </Field>
      )}

      {role.user && (
        <Field label="Usuario de Odoo" hint="Tal y como aparece en «Vendedor»: el nombre completo con el sufijo «(User)», que se añade solo si falta.">
          <input type="text" required className={modalInputClass} value={value.odoo_user} onChange={(e) => onChange({ odoo_user: e.target.value })} />
          <OtherNames names={value.user_alias} placeholder="Otro usuario de Odoo de la misma persona" onChange={(user_alias) => onChange({ user_alias })} />
        </Field>
      )}

      {role.site && (
        <CheckboxList
          label="Sites"
          hint="Los sites del Sales Report bajo los que se la muestra, y de donde sale su % de cumplimiento de ventas (el promedio si son varios)."
          options={sites.map((s) => ({ id: s.id, name: s.name }))}
          selection={value.site_ids}
          onChange={(ids) => onChange({ site_ids: ids })}
          searchable={false}
        />
      )}

      {role.manager && (
        <Field label="Responde a" hint={`El ${role.manager === 'coord_un' ? 'coordinador' : 'gerente'} de unidad de negocio de su equipo: de él salen las unidades de sus ventas.`}>
          <SelectMenu
            aria-label="Responde a"
            className={modalInputClass}
            value={String(value.manager_id ?? NONE)}
            options={[
              { value: NONE, label: 'Sin asignar' },
              ...superiors.map((m) => ({ value: String(m.id), label: `${m.name} ${m.last_name}` })),
            ]}
            onChange={(id) => onChange({ manager_id: id ? Number(id) : null })}
          />
        </Field>
      )}

      {role.units && (
        <CheckboxList
          label="Unidades de negocio"
          hint={role.units === 'una' ? 'Lleva exactamente una.' : 'Las que lleva: cobra por sus ventas.'}
          options={units.map((u) => ({ id: u.id, name: u.name, detail: u.teams.join(', ') }))}
          selection={value.unit_ids}
          onChange={(ids) => onChange({ unit_ids: role.units === 'una' ? ids.slice(-1) : ids })}
        />
      )}

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Registrar'} />
    </ModalForm>
  );
}

/** Alta o edición de un site: sus zonas y los equipos de ventas que lo trabajan. */
export function SiteForm({
  value,
  zones,
  teams,
  saving,
  onChange,
  onSubmit,
  onClose,
}: FormActions & {
  value: SiteDraft;
  zones: CatalogZone[];
  teams: CatalogSalesTeam[];
  onChange: (patch: Partial<SiteDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Sede regional"
        description="Agrupa zonas en el Sales Report. Una zona pertenece siempre a un site: elegirla aquí la mueve a este; para sacarla, cámbiala de site desde su propia fila en Estructura."
        action={<MapPin className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <FormColumns>
        <Field label="Nombre del site">
          <input type="text" required className={modalInputClass} value={value.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="Orden de presentación" hint="Menor número, más arriba. Los reportes ordenan los sites por relevancia comercial.">
          <input type="number" min="0" className={modalInputClass} value={value.order} onChange={(e) => onChange({ order: Number(e.target.value) })} />
        </Field>
      </FormColumns>

      <CheckboxList
        label="Equipos de ventas"
        options={teams.map((e) => ({ id: e.id, name: e.name }))}
        selection={value.team_ids}
        onChange={(ids) => onChange({ team_ids: ids })}
        searchable={false}
      />
      <CheckboxList
        label="Zonas relacionadas"
        options={zones.map((z) => ({ id: z.id, name: z.name, detail: z.site }))}
        selection={value.zone_ids}
        onChange={(ids) => onChange({ zone_ids: ids })}
      />

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear site'} />
    </ModalForm>
  );
}

/** Alta o edición de una unidad de negocio: sus zonas y los equipos que la trabajan. */
export function UnitForm({
  value,
  zones,
  teams,
  saving,
  onChange,
  onSubmit,
  onClose,
}: FormActions & {
  value: UnitDraft;
  zones: CatalogZone[];
  teams: CatalogSalesTeam[];
  onChange: (patch: Partial<UnitDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Unidad de negocio"
        description="Unidades de negocio agrupa por aquí sus zonas. Quién la lleva se elige en la persona (coordinador, jefe o gerente) de cada equipo."
        action={<Network className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <Field label="Nombre" hint="Como se presenta en Unidades de negocio.">
        <input type="text" required className={modalInputClass} value={value.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>

      <CheckboxList
        label="Equipos de ventas"
        options={teams.map((e) => ({ id: e.id, name: e.name }))}
        selection={value.team_ids}
        onChange={(ids) => onChange({ team_ids: ids })}
        searchable={false}
      />
      <CheckboxList
        label="Zonas relacionadas"
        hint="Una zona pertenece a una sola unidad: elegirla aquí se la quita a la que tenga hoy."
        options={zones.map((z) => ({ id: z.id, name: z.name, detail: z.coordinator || 'sin unidad' }))}
        selection={value.zone_ids}
        onChange={(ids) => onChange({ zone_ids: ids })}
      />

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear'} />
    </ModalForm>
  );
}
