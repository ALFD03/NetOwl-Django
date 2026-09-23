/**
 * Los formularios de la pestaña de objetivos: un tramo, la excepción de un mes
 * y el semáforo.
 *
 * Van aparte de `CatalogoForms` porque no editan una fila del catálogo sino lo
 * que se espera de ella, y porque comparten piezas propias —el par de campos
 * crecimiento/churn con su "vacío = hereda"—.
 */

import type { FormEvent, ReactNode } from 'react';
import { Building2, Globe2, MapPin, Network, Target, TrafficCone, UserCheck, X } from 'lucide-react';

import { MonthPicker, SelectMenu } from '@/shared/ui';
import {
  Field, FormBanner, FormColumns, FormFooter, ModalForm, OptionCard, OptionCardGroup,
  type FormTone,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import { formatObjetivo, type Objetivo } from '@/features/subscriptions/lib/objetivos';
import type {
  ObjetivoDraft, ObjetivoMesDraft, SemaforoDraft,
} from '@/features/subscriptions/hooks/useCatalogos';
import type { NivelObjetivoCatalogo } from '@/features/subscriptions/types';

interface Acciones {
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

/** Una entidad elegible para un objetivo: zona, site, estado o coordinador. */
export interface EntidadObjetivo {
  id: number;
  nombre: string;
}

/** Cómo se presenta cada nivel, de más alto a más bajo. */
export const NIVEL_OBJETIVO_UI: Record<
  NivelObjetivoCatalogo,
  { label: string; icon: ReactNode; tone: FormTone; description: string }
> = {
  general: {
    label: 'General',
    icon: <Globe2 />,
    tone: 'slate',
    description: 'Lo que rige cuando nadie más fija un objetivo.',
  },
  estado: {
    label: 'Estado',
    icon: <MapPin />,
    tone: 'purple',
    description: 'Todas sus zonas, sites y coordinadores sin objetivo propio.',
  },
  site: {
    label: 'Site',
    icon: <Building2 />,
    tone: 'blue',
    description: 'Sus zonas y el total de los coordinadores de esas zonas. No el estado.',
  },
  coordinador: {
    label: 'Coordinador',
    icon: <UserCheck />,
    tone: 'emerald',
    description: 'Sus zonas y su total en Business Units. No el site.',
  },
  zona: {
    label: 'Zona',
    icon: <Network />,
    tone: 'amber',
    description: 'Solo esa zona. Los totales de su site y su coordinador no cambian.',
  },
};

const NIVELES_CON_ENTIDAD: NivelObjetivoCatalogo[] = ['estado', 'site', 'coordinador', 'zona'];

/** Crecimiento y churn: vacío significa "se hereda" (salvo en el general de base). */
function ValoresObjetivo({
  crecimiento,
  churn,
  heredado,
  obligatorio = false,
  onChange,
}: {
  crecimiento: string;
  churn: string;
  /**
   * El general de hoy, como referencia en el placeholder. No es necesariamente
   * lo que se heredaría: una zona hereda antes de su coordinador, site o estado.
   */
  heredado?: Objetivo;
  obligatorio?: boolean;
  onChange: (patch: { crecimiento_pct?: string; churn_pct?: string }) => void;
}) {
  const pista = obligatorio
    ? 'Obligatorio: no hay nivel superior del que heredar.'
    : 'Vacío: se hereda del nivel de arriba.';
  return (
    <FormColumns>
      <Field label="Objetivo de crecimiento (%)" hint={pista}>
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          required={obligatorio}
          className={modalInputClass}
          value={crecimiento}
          placeholder={heredado ? `Vacío: hereda (general hoy ${formatObjetivo(heredado.crecimiento)})` : ''}
          onChange={(e) => onChange({ crecimiento_pct: e.target.value })}
        />
      </Field>
      <Field label="Churn máximo (%)" hint={pista}>
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          required={obligatorio}
          className={modalInputClass}
          value={churn}
          placeholder={heredado ? `Vacío: hereda (general hoy ${formatObjetivo(heredado.churn)})` : ''}
          onChange={(e) => onChange({ churn_pct: e.target.value })}
        />
      </Field>
    </FormColumns>
  );
}

export function ObjetivoForm({
  value,
  entidades,
  general,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: ObjetivoDraft;
  /** Las filas elegibles de cada nivel. */
  entidades: Record<Exclude<NivelObjetivoCatalogo, 'general'>, EntidadObjetivo[]>;
  /** El general vigente hoy, para decir qué se hereda si se deja un valor vacío. */
  general: Objetivo;
  onChange: (patch: Partial<ObjetivoDraft>) => void;
}) {
  const esNuevo = !value.id;
  const esGeneral = value.nivel === 'general';
  const ui = NIVEL_OBJETIVO_UI[value.nivel];
  const opciones: EntidadObjetivo[] = value.nivel === 'general' ? [] : entidades[value.nivel];
  const desdeSiempre = !value.desde;

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={esGeneral ? 'Objetivo general' : `Objetivo por ${ui.label.toLowerCase()}`}
        description={
          esGeneral
            ? 'Rige en todo lo que no tenga un objetivo propio. Un tramo con fecha lo cambia desde ese mes sin tocar los anteriores.'
            : `${ui.description} Cada nivel hereda del de arriba y nunca del de abajo.`
        }
        action={<Target className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      {esNuevo && !esGeneral && (
        <OptionCardGroup label="Nivel" columns="md:grid-cols-2">
          {NIVELES_CON_ENTIDAD.map((nivel) => {
            const nivelUi = NIVEL_OBJETIVO_UI[nivel];
            return (
              <OptionCard
                key={nivel}
                icon={nivelUi.icon}
                title={nivelUi.label}
                description={nivelUi.description}
                tone={nivelUi.tone}
                selected={value.nivel === nivel}
                onSelect={() => onChange({ nivel, entidad_id: null })}
              />
            );
          })}
        </OptionCardGroup>
      )}

      <FormColumns>
        {!esGeneral && (
          <Field
            label={ui.label}
            hint={esNuevo ? undefined : 'Para mover el objetivo a otra entidad, elimínalo y crea uno nuevo.'}
          >
            {esNuevo ? (
              <SelectMenu
                aria-label={ui.label}
                className={modalInputClass}
                value={value.entidad_id === null ? '' : String(value.entidad_id)}
                placeholder={`Elegir ${ui.label.toLowerCase()}...`}
                options={opciones.map((fila) => ({ value: String(fila.id), label: fila.nombre }))}
                onChange={(id) => onChange({ entidad_id: Number(id) })}
              />
            ) : (
              <p className="rounded-xl border border-slate-800 bg-surface-tertiary/40 p-2.5 text-xs font-bold text-white">
                {opciones.find((fila) => fila.id === value.entidad_id)?.nombre ?? '—'}
              </p>
            )}
          </Field>
        )}

        {value.esBase ? (
          <div className="rounded-2xl border border-slate-800 bg-surface-tertiary/30 p-4">
            <p className="text-[10px] leading-relaxed text-slate-400">
              Es el objetivo general de base: vale desde siempre y no admite fecha. Para cambiarlo
              desde un mes concreto, crea un tramo general nuevo con esa fecha.
            </p>
          </div>
        ) : (
          <Field
            label="Vigente desde"
            hint={
              esGeneral && esNuevo
                ? 'Obligatorio: el general desde siempre ya existe. Los meses anteriores conservan el suyo.'
                : 'Vacío: desde siempre. Los meses anteriores conservan el objetivo que tenían.'
            }
            action={
              desdeSiempre ? undefined : (
                <button
                  type="button"
                  onClick={() => onChange({ desde: '' })}
                  className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white"
                >
                  <X className="h-3 w-3" /> Quitar fecha
                </button>
              )
            }
          >
            <MonthPicker
              value={value.desde}
              onChange={(desde) => onChange({ desde })}
              placeholder="Desde siempre"
            />
          </Field>
        )}
      </FormColumns>

      <ValoresObjetivo
        crecimiento={value.crecimiento_pct}
        churn={value.churn_pct}
        heredado={esGeneral ? undefined : general}
        obligatorio={Boolean(value.esBase)}
        onChange={onChange}
      />

      <Field label="Nota" hint="Por qué este objetivo: ayuda a entenderlo meses después.">
        <input
          type="text"
          className={modalInputClass}
          value={value.nota}
          onChange={(e) => onChange({ nota: e.target.value })}
        />
      </Field>

      <FormFooter
        saving={saving}
        onClose={onClose}
        submitLabel={value.id ? 'Guardar cambios' : 'Crear objetivo'}
      />
    </ModalForm>
  );
}

export function ObjetivoMesForm({
  value,
  periodos,
  general,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: ObjetivoMesDraft;
  /** Meses con cierre calculado, para elegir sin teclear. */
  periodos: string[];
  /** El general que rige ese mes sin la excepción. */
  general: Objetivo;
  onChange: (patch: Partial<ObjetivoMesDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Excepción de un mes"
        description="Sustituye al objetivo general solo en ese mes. Las zonas, sites, estados y coordinadores con objetivo propio siguen usando el suyo."
        action={<Target className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <Field label="Mes" hint={periodos.length ? undefined : 'Todavía no hay meses calculados; puede fijarse uno futuro.'}>
        <MonthPicker
          value={value.periodo}
          onChange={(periodo) => onChange({ periodo })}
          disabled={Boolean(value.id)}
        />
      </Field>

      <ValoresObjetivo
        crecimiento={value.crecimiento_pct}
        churn={value.churn_pct}
        heredado={general}
        onChange={onChange}
      />

      <Field label="Nota">
        <input
          type="text"
          className={modalInputClass}
          value={value.nota}
          onChange={(e) => onChange({ nota: e.target.value })}
        />
      </Field>

      <FormFooter
        saving={saving}
        onClose={onClose}
        submitLabel={value.id ? 'Guardar cambios' : 'Crear excepción'}
      />
    </ModalForm>
  );
}

/** Un campo numérico del semáforo. */
function Umbral({
  label,
  hint,
  valor,
  onChange,
}: {
  label: string;
  hint: string;
  valor: number;
  onChange: (valor: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        step="0.01"
        min="0"
        required
        className={modalInputClass}
        value={Number.isFinite(valor) ? valor : ''}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
    </Field>
  );
}

export function SemaforoForm({
  value,
  general,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: SemaforoDraft;
  /** El general vigente hoy: la vista previa se calcula sobre él. */
  general: Objetivo;
  onChange: (patch: Partial<SemaforoDraft>) => void;
}) {
  const f = (n: number) => formatObjetivo(Number.isFinite(n) ? n : 0);
  const crecVerde = general.crecimiento - value.crec_verde_margen;
  const crecAmarillo = general.crecimiento - value.crec_amarillo_margen;
  const churnVerde = general.churn + value.churn_verde_margen;
  const churnAmarillo = general.churn + value.churn_amarillo_margen;

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Semáforo de objetivos"
        description="Los umbrales son relativos al objetivo: si el objetivo de una zona cambia, sus colores se mueven con él."
        action={<TrafficCone className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cumplimiento (% de la meta)</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Umbral
            label="Verde desde"
            hint="Cumplimiento a partir del cual se pinta verde."
            valor={value.cumpl_verde}
            onChange={(cumpl_verde) => onChange({ cumpl_verde })}
          />
          <Umbral
            label="Amarillo desde"
            hint="Por debajo, rojo."
            valor={value.cumpl_amarillo}
            onChange={(cumpl_amarillo) => onChange({ cumpl_amarillo })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Crecimiento (puntos por debajo del objetivo)</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Umbral
            label="Verde hasta"
            hint={`Con el ${f(general.crecimiento)} de hoy: verde desde ${f(crecVerde)}.`}
            valor={value.crec_verde_margen}
            onChange={(crec_verde_margen) => onChange({ crec_verde_margen })}
          />
          <Umbral
            label="Amarillo hasta"
            hint={`Amarillo desde ${f(crecAmarillo)}; por debajo, rojo.`}
            valor={value.crec_amarillo_margen}
            onChange={(crec_amarillo_margen) => onChange({ crec_amarillo_margen })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Churn (puntos por encima del objetivo)</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Umbral
            label="Verde hasta"
            hint={`Con el ${f(general.churn)} de hoy: verde hasta ${f(churnVerde)}.`}
            valor={value.churn_verde_margen}
            onChange={(churn_verde_margen) => onChange({ churn_verde_margen })}
          />
          <Umbral
            label="Amarillo hasta"
            hint={`Amarillo hasta ${f(churnAmarillo)}; por encima, rojo.`}
            valor={value.churn_amarillo_margen}
            onChange={(churn_amarillo_margen) => onChange({ churn_amarillo_margen })}
          />
        </div>
      </div>

      <FormFooter saving={saving} onClose={onClose} submitLabel="Guardar semáforo" />
    </ModalForm>
  );
}
