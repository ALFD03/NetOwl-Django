/**
 * Los formularios de la pestaña de objetivos: un tramo, la excepción de un mes
 * y el semáforo.
 *
 * Van aparte de `CatalogoForms` porque no editan una fila del catálogo sino lo
 * que se espera de ella, y porque comparten piezas propias —el par de campos
 * crecimiento/churn con su "vacío = hereda"—.
 */

import { Target, TrafficCone, X } from 'lucide-react';

import { MonthPicker, SelectMenu } from '@/shared/ui';
import {
  FormActions, Field, FormBanner, FormColumns, FormFooter, ModalForm, OptionCard, OptionCardGroup,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import { TrafficLightScale, type TrafficLightMetric } from './TrafficLightScale';
import { formatTarget, type TargetSpec } from '@/features/subscriptions/lib/targets';
import type { TargetDraft, MonthTargetDraft, TrafficLightDraft } from '@/features/subscriptions/lib/catalogDrafts';
import type { KnownNode } from '@/features/subscriptions/types';
import { ENTITY_LEVELS, TARGET_LEVEL_UI } from '../targets/levels';


/** Una entidad elegible para un objetivo: zona, site, estado o coordinador. */
export interface TargetEntity {
  id: number;
  name: string;
}

// Los metadatos de cada nivel viven en `objetivos/niveles`, compartidos con los
// reportes; se reexportan aquí para quien ya los importaba de este módulo.
export { TARGET_LEVEL_UI };

/** Crecimiento y churn: vacío significa "se hereda" (salvo en el general de base). */
function TargetValues({
  growth,
  churn,
  inherited,
  required: required = false,
  onChange,
}: {
  growth: string;
  churn: string;
  /**
   * El general de hoy, como referencia en el placeholder. No es necesariamente
   * lo que se heredaría: una zona hereda antes de su coordinador, site o estado.
   */
  inherited?: TargetSpec;
  required?: boolean;
  onChange: (patch: { growth_pct?: string; churn_pct?: string }) => void;
}) {
  const hint = required
    ? 'Obligatorio: no hay nivel superior del que heredar.'
    : 'Vacío: se hereda del nivel de arriba.';
  return (
    <FormColumns>
      <Field label="Objetivo de crecimiento (%)" hint={hint}>
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          required={required}
          className={modalInputClass}
          value={growth}
          placeholder={inherited ? `Vacío: hereda (general hoy ${formatTarget(inherited.growth)})` : ''}
          onChange={(e) => onChange({ growth_pct: e.target.value })}
        />
      </Field>
      <Field label="Churn máximo (%)" hint={hint}>
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          required={required}
          className={modalInputClass}
          value={churn}
          placeholder={inherited ? `Vacío: hereda (general hoy ${formatTarget(inherited.churn)})` : ''}
          onChange={(e) => onChange({ churn_pct: e.target.value })}
        />
      </Field>
    </FormColumns>
  );
}

type CatalogLevel = 'estado' | 'site' | 'coordinador' | 'zona';

/** Quién tiene el objetivo, para enseñarlo al editar (nivel y entidad no se cambian). */
function entityLabel(value: TargetDraft, entities: Record<CatalogLevel, TargetEntity[]>): string {
  if (value.role_label) return value.role_label;
  if (value.level === 'sucursal') return value.sucursal;
  if (value.level === 'general' || value.level === 'zona_sucursal') return value.role_label ?? '—';
  return entities[value.level].find((row) => row.id === value.entity_id)?.name ?? '—';
}

export function TargetForm({
  value,
  entities,
  nodes,
  general,
  saving,
  onChange,
  onSubmit,
  onClose,
}: FormActions & {
  value: TargetDraft;
  /** Las filas elegibles de cada nivel del catálogo. */
  entities: Record<CatalogLevel, TargetEntity[]>;
  /** Los nodos de los datos, cuya zona está en el catálogo: de ellos salen sucursales y nodos. */
  nodes: KnownNode[];
  /** El general vigente hoy, para decir qué se hereda si se deja un valor vacío. */
  general: TargetSpec;
  onChange: (patch: Partial<TargetDraft>) => void;
}) {
  const isNew = !value.id;
  const isGeneral = value.level === 'general';
  const ui = TARGET_LEVEL_UI[value.level];
  const sinceAlways = !value.since;
  const branches = [...new Set(nodes.map((n) => n.sucursal))].sort();

  /** El selector de a quién va el objetivo, según el nivel. */
  const entitySelector = () => {
    if (value.level === 'sucursal') {
      return (
        <SelectMenu
          aria-label="Sucursal"
          className={modalInputClass}
          value={value.sucursal}
          placeholder="Elegir sucursal..."
          options={branches.map((s) => ({ value: s, label: s }))}
          onChange={(branch) => onChange({ sucursal: branch })}
        />
      );
    }
    if (value.level === 'zona_sucursal') {
      const current = value.entity_name && value.sucursal ? `${value.entity_name} - ${value.sucursal}` : '';
      return (
        <SelectMenu
          aria-label="Nodo"
          className={modalInputClass}
          value={current}
          placeholder="Elegir nodo (zona - sucursal)..."
          options={nodes.map((n) => ({ value: n.node, label: n.node }))}
          onChange={(inputValue) => {
            const node = nodes.find((n) => n.node === inputValue);
            if (node) onChange({ entity_id: null, entity_name: node.zona, sucursal: node.sucursal });
          }}
        />
      );
    }
    if (value.level === 'general') return null;
    return (
      <SelectMenu
        aria-label={ui.label}
        className={modalInputClass}
        value={value.entity_id === null ? '' : String(value.entity_id)}
        placeholder={`Elegir ${ui.label.toLowerCase()}...`}
        options={entities[value.level].map((row) => ({ value: String(row.id), label: row.name }))}
        onChange={(id) => onChange({ entity_id: Number(id) })}
      />
    );
  };

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={isGeneral ? 'Objetivo general' : `Objetivo por ${ui.label.toLowerCase()}`}
        description={
          isGeneral
            ? 'Rige en todo lo que no tenga un objetivo propio. Para cambiar solo un mes, usa una excepción de ese mes.'
            : `${ui.description} Manda siempre el nivel más alto que tenga objetivo: sucursal, estado, site, coordinador, zona y, por último, el nodo.`
        }
        action={<Target className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      {isNew && !isGeneral && (
        <OptionCardGroup label="Nivel" columns="md:grid-cols-3">
          {ENTITY_LEVELS.map((level) => {
            const levelUi = TARGET_LEVEL_UI[level];
            return (
              <OptionCard
                key={level}
                icon={levelUi.icon}
                title={levelUi.label}
                description={levelUi.description}
                tone={levelUi.tone}
                selected={value.level === level}
                onSelect={() => onChange({ level, entity_id: null, entity_name: '', sucursal: '' })}
              />
            );
          })}
        </OptionCardGroup>
      )}

      <FormColumns>
        {!isGeneral && (
          <Field
            label={ui.label}
            hint={isNew ? undefined : 'Para mover el objetivo a otra entidad, elimínalo y crea uno nuevo.'}
          >
            {isNew ? (
              entitySelector()
            ) : (
              <p className="rounded-xl border border-slate-800 bg-surface-tertiary/40 p-2.5 text-xs font-bold text-white">
                {entityLabel(value, entities)}
              </p>
            )}
          </Field>
        )}

        {isGeneral ? (
          <div className="rounded-2xl border border-slate-800 bg-surface-tertiary/30 p-4 md:col-span-2">
            <p className="text-[10px] leading-relaxed text-slate-400">
              El objetivo general es uno solo y no lleva fecha: vale para todos los meses que no
              tengan una excepción. Cambiarlo cambia la meta de esos meses, también los pasados.
            </p>
          </div>
        ) : (
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
        )}
      </FormColumns>

      <TargetValues
        growth={value.growth_pct}
        churn={value.churn_pct}
        inherited={isGeneral ? undefined : general}
        required={isGeneral}
        onChange={onChange}
      />

      <Field label="Nota" hint="Por qué este objetivo: ayuda a entenderlo meses después.">
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
        submitLabel={value.id ? 'Guardar cambios' : 'Crear objetivo'}
      />
    </ModalForm>
  );
}

export function MonthTargetForm({
  value,
  periods,
  general,
  saving,
  onChange,
  onSubmit,
  onClose,
}: FormActions & {
  value: MonthTargetDraft;
  /** Meses con cierre calculado, para elegir sin teclear. */
  periods: string[];
  /** El general que rige ese mes sin la excepción. */
  general: TargetSpec;
  onChange: (patch: Partial<MonthTargetDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Excepción de un mes"
        description="Sustituye al objetivo general solo en ese mes. Las zonas, sites, estados y coordinadores con objetivo propio siguen usando el suyo."
        action={<Target className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <Field label="Mes" hint={periods.length ? undefined : 'Todavía no hay meses calculados; puede fijarse uno futuro.'}>
        <MonthPicker
          value={value.period}
          onChange={(period) => onChange({ period })}
          disabled={Boolean(value.id)}
        />
      </Field>

      <TargetValues
        growth={value.growth_pct}
        churn={value.churn_pct}
        inherited={general}
        onChange={onChange}
      />

      <Field label="Nota">
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
        submitLabel={value.id ? 'Guardar cambios' : 'Crear excepción'}
      />
    </ModalForm>
  );
}

/** Un campo numérico del semáforo. */
function Threshold({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  /** El crecimiento admite umbrales negativos; churn y cumplimiento no. */
  min?: number;
  onChange: (inputValue: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step="0.01"
        min={min}
        required
        className={modalInputClass}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
    </Field>
  );
}

/** Una métrica del semáforo: su barra en vivo y sus dos umbrales. */
function TrafficLightBlock({
  title,
  explanation,
  metric,
  green,
  yellow,
  greenLabel,
  yellowLabel,
  min,
  onGreen,
  onYellow,
}: {
  title: string;
  explanation: string;
  metric: TrafficLightMetric;
  green: number;
  yellow: number;
  greenLabel: string;
  yellowLabel: string;
  min?: number;
  onGreen: (value: number) => void;
  onYellow: (value: number) => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-surface-tertiary/30 p-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-wider text-white">{title}</p>
        <p className="text-[10px] text-slate-400">{explanation}</p>
      </div>
      <TrafficLightScale metric={metric} green={green} yellow={yellow} />
      {/* Los campos en el mismo orden que los colores de la barra: en churn el
          verde va a la izquierda; en crecimiento y cumplimiento, a la derecha. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {metric === 'churn' ? (
          <>
            <Threshold label={greenLabel} value={green} min={min} onChange={onGreen} />
            <Threshold label={yellowLabel} value={yellow} min={min} onChange={onYellow} />
          </>
        ) : (
          <>
            <Threshold label={yellowLabel} value={yellow} min={min} onChange={onYellow} />
            <Threshold label={greenLabel} value={green} min={min} onChange={onGreen} />
          </>
        )}
      </div>
    </div>
  );
}

export function TrafficLightForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: FormActions & {
  value: TrafficLightDraft;
  onChange: (patch: Partial<TrafficLightDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Semáforo de objetivos"
        description="Umbrales fijos, iguales para todo el módulo: el mismo churn o crecimiento se pinta igual en cualquier zona y en cualquier página."
        action={<TrafficCone className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <TrafficLightBlock
        title="Crecimiento"
        explanation="Más es mejor. Rojo por debajo del amarillo; verde a partir del umbral verde."
        metric="crecimiento"
        green={value.growth_green}
        yellow={value.growth_yellow}
        greenLabel="Verde desde (%)"
        yellowLabel="Amarillo desde (%)"
        onGreen={(crec_verde) => onChange({ growth_green: crec_verde })}
        onYellow={(crec_amarillo) => onChange({ growth_yellow: crec_amarillo })}
      />

      <TrafficLightBlock
        title="Churn"
        explanation="Menos es mejor. Verde hasta el umbral verde; rojo por encima del amarillo."
        metric="churn"
        green={value.churn_green}
        yellow={value.churn_yellow}
        greenLabel="Verde hasta (%)"
        yellowLabel="Amarillo hasta (%)"
        min={0}
        onGreen={(churn_verde) => onChange({ churn_green: churn_verde })}
        onYellow={(churn_amarillo) => onChange({ churn_yellow: churn_amarillo })}
      />

      <TrafficLightBlock
        title="Cumplimiento de la meta"
        explanation="Porcentaje de la meta alcanzado. Es lo único que depende del objetivo de cada fila."
        metric="cumplimiento"
        green={value.compliance_green}
        yellow={value.compliance_yellow}
        greenLabel="Verde desde (% de la meta)"
        yellowLabel="Amarillo desde (% de la meta)"
        min={0}
        onGreen={(cumpl_verde) => onChange({ compliance_green: cumpl_verde })}
        onYellow={(cumpl_amarillo) => onChange({ compliance_yellow: cumpl_amarillo })}
      />

      <FormFooter saving={saving} onClose={onClose} submitLabel="Guardar semáforo" />
    </ModalForm>
  );
}
