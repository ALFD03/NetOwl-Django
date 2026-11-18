/**
 * Los formularios del grupo Ventas: la persona de un equipo con su papel, los
 * sites y las unidades de negocio con sus zonas y equipos, y el objetivo de
 * ventas de las coordinadoras de oficina. Las condiciones de pago de cada rol
 * tienen el suyo en `RoleConditions.tsx`.
 */

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  Banknote, Briefcase, Building, Crown, Landmark, MapPin, Network, Phone, Plus, ShieldCheck, Target, Trash2, UserCheck, Users, X,
} from 'lucide-react';

import { MonthPicker, SelectMenu } from '@/shared/ui';
import {
  Field, FormBanner, FormColumns, FormFooter, ModalForm, type FormTone,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import type {
  MembershipDraft, OfficeTargetDraft, SiteDraft, UnidadDraft,
} from '@/features/subscriptions/hooks/useCatalogs';
import type {
  CatalogSalesTeam,
  CatalogMembership,
  CatalogSalesPerson,
  CatalogTeamRole,
  CatalogBusinessUnit,
  CatalogZone,
  SalesRole,
} from '@/features/subscriptions/types';

interface Acciones {
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

/** Cómo se presenta cada rol. Las etiquetas las manda el servidor (`equipos.ROLES`). */
export const ROL_UI: Record<SalesRole, { icon: ReactNode; corto: string; description: string; tone: FormTone }> = {
  jefe: { icon: <ShieldCheck />, corto: 'Jefe', description: 'Lleva el equipo entero. Aparece en «Medio» y «Oportunidad/Administrador».', tone: 'amber' },
  jefe_un: { icon: <Crown />, corto: 'Jefe de UN', description: 'Lleva varias unidades de negocio. Cobra por todas sus ventas y por su cumplimiento de ingresos.', tone: 'amber' },
  coord_un: { icon: <Crown />, corto: 'Coord. de UN', description: 'Lleva una unidad de negocio. Cobra por su crecimiento y su churn.', tone: 'amber' },
  gerente_un: { icon: <Crown />, corto: 'Gerente de UN', description: 'Lleva varias unidades de negocio.', tone: 'amber' },
  gerente_ops: { icon: <Landmark />, corto: 'Gerente de operaciones', description: 'Cobra por las ventas de las unidades de negocio que tiene. No aparece en las suscripciones.', tone: 'sky' },
  coord_oficina: { icon: <Building />, corto: 'Coord. de oficina', description: 'Lleva una oficina de un site. Aparece en «Vendedor», como usuario de Odoo.', tone: 'purple' },
  supervisor: { icon: <UserCheck />, corto: 'Supervisores', description: 'Lleva un equipo de asesores. Aparece en «Oportunidad/Administrador».', tone: 'emerald' },
  asesor: { icon: <Users />, corto: 'Asesores', description: 'Vende. Aparece en «Medio».', tone: 'blue' },
  administradora: { icon: <Banknote />, corto: 'Administradora', description: 'No cobra comisión por ventas: cobra un bono por el cumplimiento de la empresa.', tone: 'slate' },
  telemarketing: { icon: <Phone />, corto: 'Telemarketing', description: 'Vende por teléfono. Aparece en «Medio».', tone: 'blue' },
};

/** Valor de un desplegable sin elección. */
const NINGUNO = '';

/**
 * Otros nombres con los que Odoo escribe a la misma persona en una columna
 * (con y sin tilde, abreviado...). Cada uno se cruza con el export igual que el
 * principal, así que sus ventas son todas de ella.
 */
function OtherNames({
  nombres,
  placeholder,
  onChange,
}: {
  nombres: string[];
  placeholder: string;
  onChange: (nombres: string[]) => void;
}) {
  return (
    <div className="mt-2 space-y-2">
      {nombres.map((nombre, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            className={modalInputClass}
            placeholder={placeholder}
            aria-label="Otro nombre"
            value={nombre}
            onChange={(e) => onChange(nombres.map((n, k) => (k === i ? e.target.value : n)))}
          />
          <button
            type="button"
            onClick={() => onChange(nombres.filter((_, k) => k !== i))}
            className="text-rose-400 hover:text-rose-300"
            title="Quitar este nombre"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...nombres, ''])}
        className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300"
      >
        <Plus className="h-3 w-3" /> Añadir otro nombre
      </button>
    </div>
  );
}

/**
 * Una lista de casillas con buscador, para elegir varias zonas, equipos o
 * unidades de una vez. `detalle` aclara de qué otro grupo viene hoy cada una.
 */
export function CheckboxList({
  label,
  hint,
  options,
  seleccion,
  onChange,
  buscable = true,
}: {
  label: string;
  hint?: string;
  options: { id: number; name: string; detalle?: string }[];
  seleccion: number[];
  onChange: (ids: number[]) => void;
  buscable?: boolean;
}) {
  const [busqueda, setBusqueda] = useState('');
  const visibles = options.filter((other) => `${other.name} ${other.detalle ?? ''}`.toLowerCase().includes(busqueda.toLowerCase()));
  const alternar = (id: number) =>
    onChange(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id]);

  return (
    <Field label={`${label} (${seleccion.length})`} hint={hint}>
      {buscable && options.length > 6 && (
        <input
          type="text"
          className={`${modalInputClass} mb-2`}
          placeholder="Buscar..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      )}
      <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-700 bg-surface-tertiary p-2">
        {visibles.length === 0 && <p className="p-2 text-xs text-slate-500">Nada que mostrar.</p>}
        {visibles.map((other) => (
          <label key={other.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">
            <input type="checkbox" checked={seleccion.includes(other.id)} onChange={() => alternar(other.id)} />
            <span className="flex-1">{other.name}</span>
            {other.detalle && <span className="text-[10px] text-slate-500">{other.detalle}</span>}
          </label>
        ))}
      </div>
    </Field>
  );
}

/** Alta o edición del papel de una persona en un equipo. Lo que pide depende del rol. */
export function MembershipForm({
  value,
  teams,
  equipo,
  role,
  people,
  memberships,
  sites,
  units,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: MembershipDraft;
  /** Todos los equipos, para poder pasar a la persona de uno a otro. */
  teams: CatalogSalesTeam[];
  equipo: CatalogSalesTeam;
  role: CatalogTeamRole;
  /** Las personas ya registradas, para dar un papel nuevo a quien ya existe (p. ej. el gerente de operaciones). */
  people: CatalogSalesPerson[];
  /** Todas las membresías: de ahí salen los posibles superiores de un supervisor. */
  memberships: CatalogMembership[];
  sites: { id: number; name: string }[];
  units: CatalogBusinessUnit[];
  onChange: (patch: Partial<MembershipDraft>) => void;
}) {
  const ui = ROL_UI[role.role];
  const superiores = role.manager
    ? memberships.filter((m) => m.equipo === equipo.slug && m.role === role.manager)
    : [];
  // Quien ya está en este equipo no se ofrece: tendría dos papeles en el mismo.
  const alreadyInTeam = new Set(memberships.filter((m) => m.equipo === equipo.slug).map((m) => m.person_id));
  const disponibles = people.filter((p) => !alreadyInTeam.has(p.id));

  const pickPerson = (id: string) => {
    const persona = people.find((p) => String(p.id) === id);
    onChange(persona
      ? {
        person_id: persona.id,
        name: persona.name,
        last_name: persona.last_name,
        channel: persona.channel,
        supervisor_channel: persona.supervisor_channel,
        odoo_user: persona.odoo_user,
        channel_alias: persona.channel_alias,
        supervisor_alias: persona.supervisor_alias,
        user_alias: persona.user_alias,
      }
      : { person_id: null });
  };

  // Cambiar de equipo o de puesto: el rol se conserva si el equipo nuevo lo tiene, y si no se
  // toma el primero. El superior no se lleva: era de otro equipo u otro rol.
  const cambiarPuesto = (slug: string, newRole: SalesRole | null) => {
    const destino = teams.find((e) => e.slug === slug);
    if (!destino) return;
    const elegido = newRole ?? (destino.roles.some((r) => r.role === value.role) ? value.role : destino.roles[0]?.role);
    if (!elegido) return;
    onChange({ team_id: destino.id, equipo: destino.slug, role: elegido, manager_id: null });
  };

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={`${role.role_label} · ${equipo.name}`}
        description={`${ui.description} Los literales se comparan contra el export sin distinguir mayúsculas: cópialos tal cual aparecen en las suscripciones.`}
        action={<Briefcase className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <FormColumns>
        <Field label="Equipo de ventas">
          <SelectMenu
            aria-label="Equipo de ventas"
            className={modalInputClass}
            value={equipo.slug}
            options={teams.map((e) => ({ value: e.slug, label: e.name }))}
            onChange={(slug) => cambiarPuesto(slug, null)}
          />
        </Field>
        <Field label="Puesto">
          <SelectMenu
            aria-label="Puesto"
            className={modalInputClass}
            value={role.role}
            options={equipo.roles.map((r) => ({ value: r.role, label: r.role_label }))}
            onChange={(r) => cambiarPuesto(equipo.slug, r as SalesRole)}
          />
        </Field>
      </FormColumns>
      {value.id && (
        <p className="-mt-2 text-[11px] text-slate-500">
          Al cambiar de equipo o de puesto se sueltan los sites, las unidades y el superior que el nuevo puesto no lleva;
          los supervisores que respondían a esta persona quedan sin asignar.
        </p>
      )}

      {!value.id && disponibles.length > 0 && (
        <Field label="Persona" hint="Elige una ya registrada (en otro equipo, por ejemplo) o escribe una nueva.">
          <SelectMenu
            aria-label="Persona"
            className={modalInputClass}
            value={String(value.person_id ?? NINGUNO)}
            options={[
              { value: NINGUNO, label: 'Persona nueva' },
              ...disponibles.map((p) => ({ value: String(p.id), label: `${p.name} ${p.last_name}` })),
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
          <OtherNames nombres={value.channel_alias} placeholder="Otra forma de escribirlo (p. ej. con tilde)" onChange={(alias_medio) => onChange({ channel_alias: alias_medio })} />
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
          <OtherNames nombres={value.supervisor_alias} placeholder="Otra forma de escribirlo como supervisor" onChange={(alias_supervisor) => onChange({ supervisor_alias: alias_supervisor })} />
        </Field>
      )}

      {role.user && (
        <Field label="Usuario de Odoo" hint="Tal y como aparece en «Vendedor»: el nombre completo con el sufijo «(User)», que se añade solo si falta.">
          <input type="text" required className={modalInputClass} value={value.odoo_user} onChange={(e) => onChange({ odoo_user: e.target.value })} />
          <OtherNames nombres={value.user_alias} placeholder="Otro usuario de Odoo de la misma persona" onChange={(alias_usuario) => onChange({ user_alias: alias_usuario })} />
        </Field>
      )}

      {role.site && (
        <CheckboxList
          label="Sites"
          hint="Los sites del Sales Report bajo los que se la muestra, y de donde sale su % de cumplimiento de ventas (el promedio si son varios)."
          options={sites.map((s) => ({ id: s.id, name: s.name }))}
          seleccion={value.site_ids}
          onChange={(ids) => onChange({ site_ids: ids })}
          buscable={false}
        />
      )}

      {role.manager && (
        <Field label="Responde a" hint={`El ${role.manager === 'coord_un' ? 'coordinador' : 'gerente'} de unidad de negocio de su equipo: de él salen las unidades de sus ventas.`}>
          <SelectMenu
            aria-label="Responde a"
            className={modalInputClass}
            value={String(value.manager_id ?? NINGUNO)}
            options={[
              { value: NINGUNO, label: 'Sin asignar' },
              ...superiores.map((m) => ({ value: String(m.id), label: `${m.name} ${m.last_name}` })),
            ]}
            onChange={(id) => onChange({ manager_id: id ? Number(id) : null })}
          />
        </Field>
      )}

      {role.units && (
        <CheckboxList
          label="Unidades de negocio"
          hint={role.units === 'una' ? 'Lleva exactamente una.' : 'Las que lleva: cobra por sus ventas.'}
          options={units.map((u) => ({ id: u.id, name: u.name, detalle: u.teams.join(', ') }))}
          seleccion={value.unit_ids}
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
}: Acciones & {
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
        seleccion={value.team_ids}
        onChange={(ids) => onChange({ team_ids: ids })}
        buscable={false}
      />
      <CheckboxList
        label="Zonas relacionadas"
        options={zones.map((z) => ({ id: z.id, name: z.name, detalle: z.site }))}
        seleccion={value.zone_ids}
        onChange={(ids) => onChange({ zone_ids: ids })}
      />

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear site'} />
    </ModalForm>
  );
}

/** Alta o edición de una unidad de negocio: sus zonas y los equipos que la trabajan. */
export function UnidadForm({
  value,
  zones,
  teams,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: UnidadDraft;
  zones: CatalogZone[];
  teams: CatalogSalesTeam[];
  onChange: (patch: Partial<UnidadDraft>) => void;
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
        seleccion={value.team_ids}
        onChange={(ids) => onChange({ team_ids: ids })}
        buscable={false}
      />
      <CheckboxList
        label="Zonas relacionadas"
        hint="Una zona pertenece a una sola unidad: elegirla aquí se la quita a la que tenga hoy."
        options={zones.map((z) => ({ id: z.id, name: z.name, detalle: z.coordinator || 'sin unidad' }))}
        seleccion={value.zone_ids}
        onChange={(ids) => onChange({ zone_ids: ids })}
      />

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear'} />
    </ModalForm>
  );
}

/** Valor del desplegable para el objetivo general (sin persona). */
const GENERAL = '';

/** Alta o edición de un tramo del objetivo de ventas de las coordinadoras de oficina. */
export function OfficeTargetForm({
  value,
  coordinadoras,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: OfficeTargetDraft;
  /** Las coordinadoras de oficina del directorio: de quien puede ser uno individual. */
  coordinadoras: CatalogSalesPerson[];
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
              ...coordinadoras.map((p) => ({ value: String(p.id), label: `${p.name} ${p.last_name}` })),
            ]}
            onChange={(id) => onChange({ person_id: id ? Number(id) : null })}
          />
        </Field>
      )}

      <FormColumns>
        <Field label="Ventas al mes">
          <input type="number" required min={1} step={1} className={modalInputClass} value={value.ventas} onChange={(e) => onChange({ ventas: e.target.value })} />
        </Field>
        <Field
          label="Vigente desde"
          hint="Vacío: desde siempre. Los meses anteriores conservan el objetivo que tenían."
          action={
            sinceAlways ? undefined : (
              <button type="button" onClick={() => onChange({ since: '' })} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white">
                <X className="h-3 w-3" /> Quitar fecha
              </button>
            )
          }
        >
          <MonthPicker value={value.since} onChange={(desde) => onChange({ since: desde })} placeholder="Desde siempre" />
        </Field>
      </FormColumns>

      <Field label="Nota" hint="Opcional: por qué se fijó.">
        <input type="text" className={modalInputClass} value={value.note} onChange={(e) => onChange({ note: e.target.value })} />
      </Field>

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear'} />
    </ModalForm>
  );
}
