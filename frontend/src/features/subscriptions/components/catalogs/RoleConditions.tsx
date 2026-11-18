/**
 * Las condiciones de pago de cada rol de un equipo (Catálogos › Ventas › <equipo> › <rol>, a la derecha de su gente).
 *
 * El servidor manda, por rol, las piezas que admite y sus valores vigentes; aquí
 * se leen en una tarjeta y se editan en un formulario construido con esas piezas.
 * Qué hace cada pieza lo decide `comisiones/analytics/pagos.py`, no esta pantalla.
 */

import type { FormEvent } from 'react';
import { Banknote, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { Button, EmptyState, SelectMenu } from '@/shared/ui';
import { Field, FormBanner, FormFooter, ModalForm } from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import type { ConditionDraft } from '@/features/subscriptions/lib/catalogDrafts';
import type {
  TeamScope,
  CatalogRoleCondition,
  ComplianceFactor,
  PaymentParameters,
  TeamPiece,
  AmountPiece,
  PaymentTier,
} from '@/features/subscriptions/types';

const SCOPES: Record<TeamScope, string> = {
  supervisados: 'las ventas de sus asesores (es el supervisor)',
  oficina: 'las ventas de su oficina (es el «Vendedor»)',
  unidades: 'las ventas de sus unidades de negocio',
  equipo_completo: 'todas las ventas del equipo',
};

const FACTORS: Record<ComplianceFactor, string> = {
  ninguno: 'Sin factor',
  site: '% de ventas de su site',
  unidad: '% de ventas de su unidad (promedio si son varias)',
};

const dollars = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} $`;
const amount = (p: AmountPiece) => (p.kind === 'pct_plan' ? `${p.value} % del precio del plan` : `${dollars(p.value)} por venta`);

/** Las condiciones de un rol, en una línea por pieza, para la tabla. */
export function describePieces(p: PaymentParameters): string[] {
  const lines: string[] = [];
  if (p.tramos_asesor) {
    lines.push(`Por ventas propias: ${p.tramos_asesor
      .map((t) => `desde ${t.since} → ${dollars(t.amount)}${t.deduct ? ` (−${t.deduct})` : ''}`)
      .join(' · ')}`);
  }
  if (p.propia) lines.push(`Venta propia: ${amount(p.propia)}`);
  if (p.equipo) {
    lines.push(`Por ${SCOPES[p.equipo.scope]}: ${p.escalon_crecimiento ? 'según crecimiento' : amount(p.equipo)}${p.equipo.exclude_office ? ' · sin las ventas de oficina' : ''}`);
  }
  if (p.escalon_crecimiento) {
    const e = p.escalon_crecimiento;
    lines.push(`Crecimiento de su unidad ≥ ${e.threshold_pct} %: ${dollars(e.high)} por venta; si no, ${dollars(e.low)}`);
  }
  if (p.factor && p.factor !== 'ninguno') lines.push(`Total × ${FACTORS[p.factor]} (máx. 100 %)`);
  if (p.bono_tramos) lines.push(`Bono por ventas: ${p.bono_tramos.map((t) => `≥ ${t.since} → ${dollars(t.amount)}`).join(' · ')}`);
  if (p.bono_por_asesor) lines.push(`Bono por cada asesor: ${p.bono_por_asesor.map((t) => `≥ ${t.since} → ${dollars(t.amount)}`).join(' · ')}`);
  if (p.bono_por_unidad) lines.push(`Bono de ${dollars(p.bono_por_unidad.amount)} por unidad, proporcional a su % de ingresos (máx. 100 %)`);
  if (p.bono_churn) lines.push(`Bono por churn bruto: ${p.bono_churn.map((t) => `≤ ${t.max} % → ${dollars(t.amount)}`).join(' · ')}`);
  if (p.bono_empresa) {
    lines.push(`Bono por ventas de la empresa: ${dollars(p.bono_empresa.amount)} al 100 % (proporcional por debajo), ${dollars(p.bono_empresa.surplus)} por encima`);
  }
  return lines;
}

/** Las condiciones del rol abierto, junto a su gente: qué piezas paga, de dónde vienen y cómo editarlas. */
export function RoleConditionsCard({
  condition,
  onEdit,
  onReset,
}: {
  condition: CatalogRoleCondition | undefined;
  onEdit: (row: CatalogRoleCondition) => void;
  onReset: (row: CatalogRoleCondition) => void;
}) {
  if (!condition) {
    return <EmptyState title="Sin condiciones" description="Este rol no tiene condiciones de pago." icon={<Banknote />} />;
  }
  const lines = describePieces(condition.params);
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
            condition.custom ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-700/40 text-slate-400'
          }`}
        >
          {condition.custom ? 'Editadas' : 'De la política'}
        </span>
        <div className="flex items-center gap-2">
          {condition.custom && (
            <Button type="button" variant="outline" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => onReset(condition)}>
              Política
            </Button>
          )}
          <Button type="button" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(condition)}>
            Editar
          </Button>
        </div>
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-500">Este rol no cobra nada por sí mismo.</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line} className="rounded-lg border border-slate-800 bg-surface-primary/60 px-3 py-2 text-xs leading-relaxed text-slate-300">
              {line}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">
        Solo afecta a lo que se calcule después: un periodo cerrado conserva las condiciones con que se pagó.
      </p>
    </div>
  );
}

const number = (e: { target: { value: string } }) => (e.target.value === '' ? 0 : Number(e.target.value));

/** Filas editables de tramos `desde → monto` (con `descontar` en los del asesor). */
function Tiers({
  title,
  hint,
  buckets,
  withDiscount: withDiscount = false,
  onChange,
}: {
  title: string;
  hint?: string;
  buckets: PaymentTier[];
  withDiscount?: boolean;
  onChange: (tiers: PaymentTier[]) => void;
}) {
  const change = (i: number, patch: Partial<PaymentTier>) =>
    onChange(buckets.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  return (
    <Field
      label={title}
      hint={hint}
      action={
        <button
          type="button"
          onClick={() => onChange([...buckets, { since: 0, amount: 0, ...(withDiscount ? { deduct: 0 } : {}) }])}
          className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300"
        >
          <Plus className="h-3 w-3" /> Añadir tramo
        </button>
      }
    >
      <div className="space-y-2">
        {buckets.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">desde</span>
            <input type="number" min={0} className={modalInputClass} value={t.since} onChange={(e) => change(i, { since: number(e) })} />
            <span className="text-[10px] text-slate-400">ventas →</span>
            <input type="number" min={0} step="0.01" className={modalInputClass} value={t.amount} onChange={(e) => change(i, { amount: number(e) })} />
            <span className="text-[10px] text-slate-400">$</span>
            {withDiscount && (
              <>
                <span className="text-[10px] text-slate-400">descuenta</span>
                <input type="number" min={0} className={modalInputClass} value={t.deduct ?? 0} onChange={(e) => change(i, { deduct: number(e) })} />
              </>
            )}
            <button type="button" onClick={() => onChange(buckets.filter((_, k) => k !== i))} className="text-rose-400 hover:text-rose-300" title="Quitar tramo">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Field>
  );
}

/** Un monto por venta: dólares fijos o un % del precio del plan. */
function AmountEditor({ title, hint, value, onChange }: {
  title: string; hint?: string; value: AmountPiece; onChange: (p: AmountPiece) => void;
}) {
  return (
    <Field label={title} hint={hint}>
      <div className="flex items-center gap-2">
        <SelectMenu
          aria-label={title}
          className={modalInputClass}
          value={value.kind}
          options={[{ value: 'monto', label: 'Dólares por venta' }, { value: 'pct_plan', label: '% del precio del plan' }]}
          onChange={(kind) => onChange({ ...value, kind: kind as AmountPiece['kind'] })}
        />
        <input type="number" min={0} step="0.01" className={modalInputClass} value={value.value} onChange={(e) => onChange({ ...value, value: number(e) })} />
      </div>
    </Field>
  );
}

/** Edición de las condiciones de un rol: solo se pintan las piezas que su rol admite. */
export function ConditionsForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  value: ConditionDraft;
  saving: boolean;
  onChange: (patch: Partial<ConditionDraft>) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const p = value.params;
  const put = (patch: Partial<PaymentParameters>) => onChange({ params: { ...p, ...patch } });
  const has = (piece: ConditionDraft['pieces'][number]) => value.pieces.includes(piece);

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={`${value.role_label} · cómo cobra`}
        description="Solo afecta a lo que se calcule después: un periodo cerrado conserva las condiciones con que se pagó."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => onChange({ params: structuredClone(value.policy) })}
          >
            Política
          </Button>
        }
      />

      {has('tramos_asesor') && p.tramos_asesor && (
        <Tiers
          title="Por ventas propias"
          hint="Cada tramo vale desde esa cantidad de ventas hasta el siguiente. «Descuenta»: ventas que no se pagan en ese tramo."
          buckets={p.tramos_asesor}
          withDiscount
          onChange={(t) => put({ tramos_asesor: t })}
        />
      )}
      {has('propia') && p.propia && (
        <AmountEditor title="Venta propia" hint="Lo que cobra por cada venta que hizo él mismo («Medio»)." value={p.propia} onChange={(v) => put({ propia: v })} />
      )}
      {has('equipo') && p.equipo && (
        <>
          <AmountEditor
            title="Venta de equipo"
            hint={has('escalon_crecimiento') ? 'Con el escalón de crecimiento de abajo este monto no se usa.' : undefined}
            value={p.equipo}
            onChange={(v) => put({ equipo: { ...p.equipo!, ...v } })}
          />
          <Field label="¿De qué ventas?">
            <SelectMenu
              aria-label="Alcance de la venta de equipo"
              className={modalInputClass}
              value={p.equipo.scope}
              options={(Object.keys(SCOPES) as TeamScope[]).map((a) => ({ value: a, label: SCOPES[a] }))}
              onChange={(a) => put({ equipo: { ...p.equipo!, scope: a as TeamScope } as TeamPiece })}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={p.equipo.exclude_office} onChange={(e) => put({ equipo: { ...p.equipo!, exclude_office: e.target.checked } })} />
              No contar las ventas de oficina (las que hizo una coordinadora de oficina)
            </label>
          </Field>
        </>
      )}
      {has('escalon_crecimiento') && p.escalon_crecimiento && (
        <Field label="Escalón de crecimiento" hint="Por venta de equipo: cobra el monto alto si el crecimiento de su unidad llega al umbral, y el bajo si no.">
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            umbral
            <input type="number" step="0.1" className={modalInputClass} value={p.escalon_crecimiento.threshold_pct} onChange={(e) => put({ escalon_crecimiento: { ...p.escalon_crecimiento!, threshold_pct: number(e) } })} />
            % · alto
            <input type="number" min={0} step="0.01" className={modalInputClass} value={p.escalon_crecimiento.high} onChange={(e) => put({ escalon_crecimiento: { ...p.escalon_crecimiento!, high: number(e) } })} />
            $ · bajo
            <input type="number" min={0} step="0.01" className={modalInputClass} value={p.escalon_crecimiento.low} onChange={(e) => put({ escalon_crecimiento: { ...p.escalon_crecimiento!, low: number(e) } })} />
            $
          </div>
        </Field>
      )}
      {has('factor') && (
        <Field label="Factor de cumplimiento" hint="Multiplica lo que cobra por ventas (propias + equipo), con tope del 100 %. El bono no se multiplica.">
          <SelectMenu
            aria-label="Factor de cumplimiento"
            className={modalInputClass}
            value={p.factor ?? 'ninguno'}
            options={(Object.keys(FACTORS) as ComplianceFactor[]).map((f) => ({ value: f, label: FACTORS[f] }))}
            onChange={(f) => put({ factor: f as ComplianceFactor })}
          />
        </Field>
      )}
      {has('bono_tramos') && p.bono_tramos && (
        <Tiers title="Bono por ventas propias" hint="Un monto único según cuántas ventas hizo en el mes; vale el último tramo alcanzado." buckets={p.bono_tramos} onChange={(t) => put({ bono_tramos: t })} />
      )}
      {has('bono_por_asesor') && p.bono_por_asesor && (
        <Tiers title="Bono por cada asesor de su equipo" hint="Se paga por cada asesor suyo que llega al tramo (el que más vende con él)." buckets={p.bono_por_asesor} onChange={(t) => put({ bono_por_asesor: t })} />
      )}
      {has('bono_por_unidad') && p.bono_por_unidad && (
        <Field label="Bono por unidad de negocio" hint="Por cada unidad que lleva: este monto × su % de ingresos, con tope del 100 %.">
          <input type="number" min={0} step="0.01" className={modalInputClass} value={p.bono_por_unidad.amount} onChange={(e) => put({ bono_por_unidad: { amount: number(e) } })} />
        </Field>
      )}
      {has('bono_churn') && p.bono_churn && (
        <Field
          label="Bono por churn bruto"
          hint="Cobra el del tramo más exigente que cumple (churn bruto de su unidad ≤ máximo)."
          action={
            <button type="button" onClick={() => put({ bono_churn: [...p.bono_churn!, { max: 0, amount: 0 }] })} className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300">
              <Plus className="h-3 w-3" /> Añadir tramo
            </button>
          }
        >
          <div className="space-y-2">
            {p.bono_churn.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] text-slate-400">
                ≤
                <input type="number" step="0.1" className={modalInputClass} value={t.max} onChange={(e) => put({ bono_churn: p.bono_churn!.map((x, k) => (k === i ? { ...x, max: number(e) } : x)) })} />
                % →
                <input type="number" min={0} step="0.01" className={modalInputClass} value={t.amount} onChange={(e) => put({ bono_churn: p.bono_churn!.map((x, k) => (k === i ? { ...x, amount: number(e) } : x)) })} />
                $
                <button type="button" onClick={() => put({ bono_churn: p.bono_churn!.filter((_, k) => k !== i) })} className="text-rose-400 hover:text-rose-300" title="Quitar tramo">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Field>
      )}
      {has('bono_empresa') && p.bono_empresa && (
        <Field label="Bono por las ventas de la empresa" hint="Por debajo del 100 % cobra el monto proporcional (80 % → 80 $ si el monto es 100); al 100 %, el monto; por encima, el excedente.">
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            al 100 %
            <input type="number" min={0} step="0.01" className={modalInputClass} value={p.bono_empresa.amount} onChange={(e) => put({ bono_empresa: { ...p.bono_empresa!, amount: number(e) } })} />
            $ · por encima
            <input type="number" min={0} step="0.01" className={modalInputClass} value={p.bono_empresa.surplus} onChange={(e) => put({ bono_empresa: { ...p.bono_empresa!, surplus: number(e) } })} />
            $
          </div>
        </Field>
      )}

      <FormFooter saving={saving} onClose={onClose} submitLabel="Guardar condiciones" />
    </ModalForm>
  );
}
