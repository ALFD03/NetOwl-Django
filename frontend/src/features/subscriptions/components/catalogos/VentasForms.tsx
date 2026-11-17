/**
 * Los formularios del grupo Ventas: la persona de un equipo con su papel, los
 * sites y las unidades de negocio con sus zonas y equipos, y el objetivo de
 * ventas de las coordinadoras de oficina. Las condiciones de pago de cada rol
 * tienen el suyo en `CondicionesRol.tsx`.
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
  MembresiaDraft, ObjetivoOficinaDraft, SiteDraft, UnidadDraft,
} from '@/features/subscriptions/hooks/useCatalogos';
import type {
  CatalogoEquipoVentas,
  CatalogoMembresia,
  CatalogoPersonaVentas,
  CatalogoRolEquipo,
  CatalogoUnidadNegocio,
  CatalogoZona,
  RolVentas,
} from '@/features/subscriptions/types';

interface Acciones {
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

/** Cómo se presenta cada rol. Las etiquetas las manda el servidor (`equipos.ROLES`). */
export const ROL_UI: Record<RolVentas, { icon: ReactNode; corto: string; description: string; tone: FormTone }> = {
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
function OtrosNombres({
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
export function CasillasLista({
  label,
  hint,
  opciones,
  seleccion,
  onChange,
  buscable = true,
}: {
  label: string;
  hint?: string;
  opciones: { id: number; nombre: string; detalle?: string }[];
  seleccion: number[];
  onChange: (ids: number[]) => void;
  buscable?: boolean;
}) {
  const [busqueda, setBusqueda] = useState('');
  const visibles = opciones.filter((o) => `${o.nombre} ${o.detalle ?? ''}`.toLowerCase().includes(busqueda.toLowerCase()));
  const alternar = (id: number) =>
    onChange(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id]);

  return (
    <Field label={`${label} (${seleccion.length})`} hint={hint}>
      {buscable && opciones.length > 6 && (
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
        {visibles.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">
            <input type="checkbox" checked={seleccion.includes(o.id)} onChange={() => alternar(o.id)} />
            <span className="flex-1">{o.nombre}</span>
            {o.detalle && <span className="text-[10px] text-slate-500">{o.detalle}</span>}
          </label>
        ))}
      </div>
    </Field>
  );
}

/** Alta o edición del papel de una persona en un equipo. Lo que pide depende del rol. */
export function MembresiaForm({
  value,
  equipos,
  equipo,
  rol,
  personas,
  membresias,
  sites,
  unidades,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: MembresiaDraft;
  /** Todos los equipos, para poder pasar a la persona de uno a otro. */
  equipos: CatalogoEquipoVentas[];
  equipo: CatalogoEquipoVentas;
  rol: CatalogoRolEquipo;
  /** Las personas ya registradas, para dar un papel nuevo a quien ya existe (p. ej. el gerente de operaciones). */
  personas: CatalogoPersonaVentas[];
  /** Todas las membresías: de ahí salen los posibles superiores de un supervisor. */
  membresias: CatalogoMembresia[];
  sites: { id: number; nombre: string }[];
  unidades: CatalogoUnidadNegocio[];
  onChange: (patch: Partial<MembresiaDraft>) => void;
}) {
  const ui = ROL_UI[rol.rol];
  const superiores = rol.superior
    ? membresias.filter((m) => m.equipo === equipo.slug && m.rol === rol.superior)
    : [];
  // Quien ya está en este equipo no se ofrece: tendría dos papeles en el mismo.
  const yaEnEquipo = new Set(membresias.filter((m) => m.equipo === equipo.slug).map((m) => m.persona_id));
  const disponibles = personas.filter((p) => !yaEnEquipo.has(p.id));

  const elegirPersona = (id: string) => {
    const persona = personas.find((p) => String(p.id) === id);
    onChange(persona
      ? {
        persona_id: persona.id,
        nombre: persona.nombre,
        apellido: persona.apellido,
        medio: persona.medio,
        medio_supervisor: persona.medio_supervisor,
        usuario_odoo: persona.usuario_odoo,
        alias_medio: persona.alias_medio,
        alias_supervisor: persona.alias_supervisor,
        alias_usuario: persona.alias_usuario,
      }
      : { persona_id: null });
  };

  // Cambiar de equipo o de puesto: el rol se conserva si el equipo nuevo lo tiene, y si no se
  // toma el primero. El superior no se lleva: era de otro equipo u otro rol.
  const cambiarPuesto = (slug: string, rolNuevo: RolVentas | null) => {
    const destino = equipos.find((e) => e.slug === slug);
    if (!destino) return;
    const elegido = rolNuevo ?? (destino.roles.some((r) => r.rol === value.rol) ? value.rol : destino.roles[0]?.rol);
    if (!elegido) return;
    onChange({ equipo_id: destino.id, equipo: destino.slug, rol: elegido, superior_id: null });
  };

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={`${rol.etiqueta} · ${equipo.nombre}`}
        description={`${ui.description} Los literales se comparan contra el export sin distinguir mayúsculas: cópialos tal cual aparecen en las suscripciones.`}
        action={<Briefcase className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <FormColumns>
        <Field label="Equipo de ventas">
          <SelectMenu
            aria-label="Equipo de ventas"
            className={modalInputClass}
            value={equipo.slug}
            options={equipos.map((e) => ({ value: e.slug, label: e.nombre }))}
            onChange={(slug) => cambiarPuesto(slug, null)}
          />
        </Field>
        <Field label="Puesto">
          <SelectMenu
            aria-label="Puesto"
            className={modalInputClass}
            value={rol.rol}
            options={equipo.roles.map((r) => ({ value: r.rol, label: r.etiqueta }))}
            onChange={(r) => cambiarPuesto(equipo.slug, r as RolVentas)}
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
            value={String(value.persona_id ?? NINGUNO)}
            options={[
              { value: NINGUNO, label: 'Persona nueva' },
              ...disponibles.map((p) => ({ value: String(p.id), label: `${p.nombre} ${p.apellido}` })),
            ]}
            onChange={elegirPersona}
          />
        </Field>
      )}

      <FormColumns>
        <Field label="Nombre">
          <input type="text" required className={modalInputClass} value={value.nombre} onChange={(e) => onChange({ nombre: e.target.value })} />
        </Field>
        <Field label="Apellido">
          <input type="text" required className={modalInputClass} value={value.apellido} onChange={(e) => onChange({ apellido: e.target.value })} />
        </Field>
      </FormColumns>

      {rol.medio && (
        <Field label="Medio (Odoo)" hint="Tal y como aparece en «Medio»: normalmente nombre y apellido, p. ej. «Ahiam Aguilar».">
          <input type="text" required className={modalInputClass} value={value.medio} onChange={(e) => onChange({ medio: e.target.value })} />
          <OtrosNombres nombres={value.alias_medio} placeholder="Otra forma de escribirlo (p. ej. con tilde)" onChange={(alias_medio) => onChange({ alias_medio })} />
        </Field>
      )}

      {rol.supervisor && (
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
          <OtrosNombres nombres={value.alias_supervisor} placeholder="Otra forma de escribirlo como supervisor" onChange={(alias_supervisor) => onChange({ alias_supervisor })} />
        </Field>
      )}

      {rol.usuario && (
        <Field label="Usuario de Odoo" hint="Tal y como aparece en «Vendedor»: el nombre completo con el sufijo «(User)», que se añade solo si falta.">
          <input type="text" required className={modalInputClass} value={value.usuario_odoo} onChange={(e) => onChange({ usuario_odoo: e.target.value })} />
          <OtrosNombres nombres={value.alias_usuario} placeholder="Otro usuario de Odoo de la misma persona" onChange={(alias_usuario) => onChange({ alias_usuario })} />
        </Field>
      )}

      {rol.site && (
        <CasillasLista
          label="Sites"
          hint="Los sites del Sales Report bajo los que se la muestra, y de donde sale su % de cumplimiento de ventas (el promedio si son varios)."
          opciones={sites.map((s) => ({ id: s.id, nombre: s.nombre }))}
          seleccion={value.site_ids}
          onChange={(ids) => onChange({ site_ids: ids })}
          buscable={false}
        />
      )}

      {rol.superior && (
        <Field label="Responde a" hint={`El ${rol.superior === 'coord_un' ? 'coordinador' : 'gerente'} de unidad de negocio de su equipo: de él salen las unidades de sus ventas.`}>
          <SelectMenu
            aria-label="Responde a"
            className={modalInputClass}
            value={String(value.superior_id ?? NINGUNO)}
            options={[
              { value: NINGUNO, label: 'Sin asignar' },
              ...superiores.map((m) => ({ value: String(m.id), label: `${m.nombre} ${m.apellido}` })),
            ]}
            onChange={(id) => onChange({ superior_id: id ? Number(id) : null })}
          />
        </Field>
      )}

      {rol.unidades && (
        <CasillasLista
          label="Unidades de negocio"
          hint={rol.unidades === 'una' ? 'Lleva exactamente una.' : 'Las que lleva: cobra por sus ventas.'}
          opciones={unidades.map((u) => ({ id: u.id, nombre: u.nombre, detalle: u.equipos.join(', ') }))}
          seleccion={value.unidad_ids}
          onChange={(ids) => onChange({ unidad_ids: rol.unidades === 'una' ? ids.slice(-1) : ids })}
        />
      )}

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Registrar'} />
    </ModalForm>
  );
}

/** Alta o edición de un site: sus zonas y los equipos de ventas que lo trabajan. */
export function SiteForm({
  value,
  zonas,
  equipos,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: SiteDraft;
  zonas: CatalogoZona[];
  equipos: CatalogoEquipoVentas[];
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
          <input type="text" required className={modalInputClass} value={value.nombre} onChange={(e) => onChange({ nombre: e.target.value })} />
        </Field>
        <Field label="Orden de presentación" hint="Menor número, más arriba. Los reportes ordenan los sites por relevancia comercial.">
          <input type="number" min="0" className={modalInputClass} value={value.orden} onChange={(e) => onChange({ orden: Number(e.target.value) })} />
        </Field>
      </FormColumns>

      <CasillasLista
        label="Equipos de ventas"
        opciones={equipos.map((e) => ({ id: e.id, nombre: e.nombre }))}
        seleccion={value.equipo_ids}
        onChange={(ids) => onChange({ equipo_ids: ids })}
        buscable={false}
      />
      <CasillasLista
        label="Zonas relacionadas"
        opciones={zonas.map((z) => ({ id: z.id, nombre: z.nombre, detalle: z.site }))}
        seleccion={value.zona_ids}
        onChange={(ids) => onChange({ zona_ids: ids })}
      />

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear site'} />
    </ModalForm>
  );
}

/** Alta o edición de una unidad de negocio: sus zonas y los equipos que la trabajan. */
export function UnidadForm({
  value,
  zonas,
  equipos,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: UnidadDraft;
  zonas: CatalogoZona[];
  equipos: CatalogoEquipoVentas[];
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
        <input type="text" required className={modalInputClass} value={value.nombre} onChange={(e) => onChange({ nombre: e.target.value })} />
      </Field>

      <CasillasLista
        label="Equipos de ventas"
        opciones={equipos.map((e) => ({ id: e.id, nombre: e.nombre }))}
        seleccion={value.equipo_ids}
        onChange={(ids) => onChange({ equipo_ids: ids })}
        buscable={false}
      />
      <CasillasLista
        label="Zonas relacionadas"
        hint="Una zona pertenece a una sola unidad: elegirla aquí se la quita a la que tenga hoy."
        opciones={zonas.map((z) => ({ id: z.id, nombre: z.nombre, detalle: z.coordinador || 'sin unidad' }))}
        seleccion={value.zona_ids}
        onChange={(ids) => onChange({ zona_ids: ids })}
      />

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear'} />
    </ModalForm>
  );
}

/** Valor del desplegable para el objetivo general (sin persona). */
const GENERAL = '';

/** Alta o edición de un tramo del objetivo de ventas de las coordinadoras de oficina. */
export function ObjetivoOficinaForm({
  value,
  coordinadoras,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: ObjetivoOficinaDraft;
  /** Las coordinadoras de oficina del directorio: de quien puede ser uno individual. */
  coordinadoras: CatalogoPersonaVentas[];
  onChange: (patch: Partial<ObjetivoOficinaDraft>) => void;
}) {
  const desdeSiempre = !value.desde;
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Objetivo de ventas de oficina"
        description="Cuántas ventas al mes se esperan de una coordinadora. Se mide contra él lo que vendió ella misma («Medio»). El individual manda sobre el general."
        action={<Target className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      {value.id ? (
        <Field label="Para">
          <div className="py-2 text-sm font-semibold text-white">{value.etiqueta}</div>
        </Field>
      ) : (
        <Field label="Para" hint="General: el de todas las que no tengan uno propio.">
          <SelectMenu
            aria-label="Para quién es el objetivo"
            className={modalInputClass}
            value={String(value.persona_id ?? GENERAL)}
            options={[
              { value: GENERAL, label: 'General (todas las coordinadoras)' },
              ...coordinadoras.map((p) => ({ value: String(p.id), label: `${p.nombre} ${p.apellido}` })),
            ]}
            onChange={(id) => onChange({ persona_id: id ? Number(id) : null })}
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
            desdeSiempre ? undefined : (
              <button type="button" onClick={() => onChange({ desde: '' })} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white">
                <X className="h-3 w-3" /> Quitar fecha
              </button>
            )
          }
        >
          <MonthPicker value={value.desde} onChange={(desde) => onChange({ desde })} placeholder="Desde siempre" />
        </Field>
      </FormColumns>

      <Field label="Nota" hint="Opcional: por qué se fijó.">
        <input type="text" className={modalInputClass} value={value.nota} onChange={(e) => onChange({ nota: e.target.value })} />
      </Field>

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear'} />
    </ModalForm>
  );
}
