/**
 * Los formularios de la pestaña de objetivos: un tramo, la excepción de un mes
 * y el semáforo.
 *
 * Van aparte de `CatalogoForms` porque no editan una fila del catálogo sino lo
 * que se espera de ella, y porque comparten piezas propias —el par de campos
 * crecimiento/churn con su "vacío = hereda"—.
 */

import type { FormEvent } from 'react';
import { Target, TrafficCone, X } from 'lucide-react';

import { MonthPicker, SelectMenu } from '@/shared/ui';
import {
  Field, FormBanner, FormColumns, FormFooter, ModalForm, OptionCard, OptionCardGroup,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import { EscalaSemaforo, type MetricaSemaforo } from './EscalaSemaforo';
import { formatObjetivo, type Objetivo } from '@/features/subscriptions/lib/objetivos';
import type {
  ObjetivoDraft, ObjetivoMesDraft, SemaforoDraft,
} from '@/features/subscriptions/hooks/useCatalogos';
import type { NodoConocido } from '@/features/subscriptions/types';
import { NIVELES_ENTIDAD, NIVEL_OBJETIVO_UI } from '../objetivos/niveles';

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

// Los metadatos de cada nivel viven en `objetivos/niveles`, compartidos con los
// reportes; se reexportan aquí para quien ya los importaba de este módulo.
export { NIVEL_OBJETIVO_UI };

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

type NivelCatalogo = 'estado' | 'site' | 'coordinador' | 'zona';

/** Quién tiene el objetivo, para enseñarlo al editar (nivel y entidad no se cambian). */
function etiquetaEntidad(value: ObjetivoDraft, entidades: Record<NivelCatalogo, EntidadObjetivo[]>): string {
  if (value.etiqueta) return value.etiqueta;
  if (value.nivel === 'sucursal') return value.sucursal;
  if (value.nivel === 'general' || value.nivel === 'zona_sucursal') return value.etiqueta ?? '—';
  return entidades[value.nivel].find((fila) => fila.id === value.entidad_id)?.nombre ?? '—';
}

export function ObjetivoForm({
  value,
  entidades,
  nodos,
  general,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: ObjetivoDraft;
  /** Las filas elegibles de cada nivel del catálogo. */
  entidades: Record<NivelCatalogo, EntidadObjetivo[]>;
  /** Los nodos de los datos, cuya zona está en el catálogo: de ellos salen sucursales y nodos. */
  nodos: NodoConocido[];
  /** El general vigente hoy, para decir qué se hereda si se deja un valor vacío. */
  general: Objetivo;
  onChange: (patch: Partial<ObjetivoDraft>) => void;
}) {
  const esNuevo = !value.id;
  const esGeneral = value.nivel === 'general';
  const ui = NIVEL_OBJETIVO_UI[value.nivel];
  const desdeSiempre = !value.desde;
  const sucursales = [...new Set(nodos.map((n) => n.sucursal))].sort();

  /** El selector de a quién va el objetivo, según el nivel. */
  const selectorEntidad = () => {
    if (value.nivel === 'sucursal') {
      return (
        <SelectMenu
          aria-label="Sucursal"
          className={modalInputClass}
          value={value.sucursal}
          placeholder="Elegir sucursal..."
          options={sucursales.map((s) => ({ value: s, label: s }))}
          onChange={(sucursal) => onChange({ sucursal })}
        />
      );
    }
    if (value.nivel === 'zona_sucursal') {
      const actual = value.entidad_nombre && value.sucursal ? `${value.entidad_nombre} - ${value.sucursal}` : '';
      return (
        <SelectMenu
          aria-label="Nodo"
          className={modalInputClass}
          value={actual}
          placeholder="Elegir nodo (zona - sucursal)..."
          options={nodos.map((n) => ({ value: n.nodo, label: n.nodo }))}
          onChange={(valor) => {
            const nodo = nodos.find((n) => n.nodo === valor);
            if (nodo) onChange({ entidad_id: null, entidad_nombre: nodo.zona, sucursal: nodo.sucursal });
          }}
        />
      );
    }
    if (value.nivel === 'general') return null;
    return (
      <SelectMenu
        aria-label={ui.label}
        className={modalInputClass}
        value={value.entidad_id === null ? '' : String(value.entidad_id)}
        placeholder={`Elegir ${ui.label.toLowerCase()}...`}
        options={entidades[value.nivel].map((fila) => ({ value: String(fila.id), label: fila.nombre }))}
        onChange={(id) => onChange({ entidad_id: Number(id) })}
      />
    );
  };

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={esGeneral ? 'Objetivo general' : `Objetivo por ${ui.label.toLowerCase()}`}
        description={
          esGeneral
            ? 'Rige en todo lo que no tenga un objetivo propio. Para cambiar solo un mes, usa una excepción de ese mes.'
            : `${ui.description} Manda siempre el nivel más alto que tenga objetivo: sucursal, estado, site, coordinador, zona y, por último, el nodo.`
        }
        action={<Target className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      {esNuevo && !esGeneral && (
        <OptionCardGroup label="Nivel" columns="md:grid-cols-3">
          {NIVELES_ENTIDAD.map((nivel) => {
            const nivelUi = NIVEL_OBJETIVO_UI[nivel];
            return (
              <OptionCard
                key={nivel}
                icon={nivelUi.icon}
                title={nivelUi.label}
                description={nivelUi.description}
                tone={nivelUi.tone}
                selected={value.nivel === nivel}
                onSelect={() => onChange({ nivel, entidad_id: null, entidad_nombre: '', sucursal: '' })}
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
              selectorEntidad()
            ) : (
              <p className="rounded-xl border border-slate-800 bg-surface-tertiary/40 p-2.5 text-xs font-bold text-white">
                {etiquetaEntidad(value, entidades)}
              </p>
            )}
          </Field>
        )}

        {esGeneral ? (
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
        obligatorio={esGeneral}
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
  valor,
  min,
  onChange,
}: {
  label: string;
  valor: number;
  /** El crecimiento admite umbrales negativos; churn y cumplimiento no. */
  min?: number;
  onChange: (valor: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step="0.01"
        min={min}
        required
        className={modalInputClass}
        value={Number.isFinite(valor) ? valor : ''}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
    </Field>
  );
}

/** Una métrica del semáforo: su barra en vivo y sus dos umbrales. */
function BloqueSemaforo({
  titulo,
  explicacion,
  metrica,
  verde,
  amarillo,
  etiquetaVerde,
  etiquetaAmarillo,
  min,
  onVerde,
  onAmarillo,
}: {
  titulo: string;
  explicacion: string;
  metrica: MetricaSemaforo;
  verde: number;
  amarillo: number;
  etiquetaVerde: string;
  etiquetaAmarillo: string;
  min?: number;
  onVerde: (valor: number) => void;
  onAmarillo: (valor: number) => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-surface-tertiary/30 p-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-wider text-white">{titulo}</p>
        <p className="text-[10px] text-slate-400">{explicacion}</p>
      </div>
      <EscalaSemaforo metrica={metrica} verde={verde} amarillo={amarillo} />
      {/* Los campos en el mismo orden que los colores de la barra: en churn el
          verde va a la izquierda; en crecimiento y cumplimiento, a la derecha. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {metrica === 'churn' ? (
          <>
            <Umbral label={etiquetaVerde} valor={verde} min={min} onChange={onVerde} />
            <Umbral label={etiquetaAmarillo} valor={amarillo} min={min} onChange={onAmarillo} />
          </>
        ) : (
          <>
            <Umbral label={etiquetaAmarillo} valor={amarillo} min={min} onChange={onAmarillo} />
            <Umbral label={etiquetaVerde} valor={verde} min={min} onChange={onVerde} />
          </>
        )}
      </div>
    </div>
  );
}

export function SemaforoForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: SemaforoDraft;
  onChange: (patch: Partial<SemaforoDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Semáforo de objetivos"
        description="Umbrales fijos, iguales para todo el módulo: el mismo churn o crecimiento se pinta igual en cualquier zona y en cualquier página."
        action={<TrafficCone className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <BloqueSemaforo
        titulo="Crecimiento"
        explicacion="Más es mejor. Rojo por debajo del amarillo; verde a partir del umbral verde."
        metrica="crecimiento"
        verde={value.crec_verde}
        amarillo={value.crec_amarillo}
        etiquetaVerde="Verde desde (%)"
        etiquetaAmarillo="Amarillo desde (%)"
        onVerde={(crec_verde) => onChange({ crec_verde })}
        onAmarillo={(crec_amarillo) => onChange({ crec_amarillo })}
      />

      <BloqueSemaforo
        titulo="Churn"
        explicacion="Menos es mejor. Verde hasta el umbral verde; rojo por encima del amarillo."
        metrica="churn"
        verde={value.churn_verde}
        amarillo={value.churn_amarillo}
        etiquetaVerde="Verde hasta (%)"
        etiquetaAmarillo="Amarillo hasta (%)"
        min={0}
        onVerde={(churn_verde) => onChange({ churn_verde })}
        onAmarillo={(churn_amarillo) => onChange({ churn_amarillo })}
      />

      <BloqueSemaforo
        titulo="Cumplimiento de la meta"
        explicacion="Porcentaje de la meta alcanzado. Es lo único que depende del objetivo de cada fila."
        metrica="cumplimiento"
        verde={value.cumpl_verde}
        amarillo={value.cumpl_amarillo}
        etiquetaVerde="Verde desde (% de la meta)"
        etiquetaAmarillo="Amarillo desde (% de la meta)"
        min={0}
        onVerde={(cumpl_verde) => onChange({ cumpl_verde })}
        onAmarillo={(cumpl_amarillo) => onChange({ cumpl_amarillo })}
      />

      <FormFooter saving={saving} onClose={onClose} submitLabel="Guardar semáforo" />
    </ModalForm>
  );
}
