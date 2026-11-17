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
import type { CondicionDraft } from '@/features/subscriptions/hooks/useCatalogos';
import type {
  AlcanceEquipo,
  CatalogoCondicionRol,
  FactorCumplimiento,
  ParametrosPago,
  PiezaEquipo,
  PiezaMonto,
  TramoPago,
} from '@/features/subscriptions/types';

const ALCANCES: Record<AlcanceEquipo, string> = {
  supervisados: 'las ventas de sus asesores (es el supervisor)',
  oficina: 'las ventas de su oficina (es el «Vendedor»)',
  unidades: 'las ventas de sus unidades de negocio',
  equipo_completo: 'todas las ventas del equipo',
};

const FACTORES: Record<FactorCumplimiento, string> = {
  ninguno: 'Sin factor',
  site: '% de ventas de su site',
  unidad: '% de ventas de su unidad (promedio si son varias)',
};

const dolares = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} $`;
const monto = (p: PiezaMonto) => (p.tipo === 'pct_plan' ? `${p.valor} % del precio del plan` : `${dolares(p.valor)} por venta`);

/** Las condiciones de un rol, en una línea por pieza, para la tabla. */
export function describirPiezas(p: ParametrosPago): string[] {
  const lineas: string[] = [];
  if (p.tramos_asesor) {
    lineas.push(`Por ventas propias: ${p.tramos_asesor
      .map((t) => `desde ${t.desde} → ${dolares(t.monto)}${t.descontar ? ` (−${t.descontar})` : ''}`)
      .join(' · ')}`);
  }
  if (p.propia) lineas.push(`Venta propia: ${monto(p.propia)}`);
  if (p.equipo) {
    lineas.push(`Por ${ALCANCES[p.equipo.alcance]}: ${p.escalon_crecimiento ? 'según crecimiento' : monto(p.equipo)}${p.equipo.excluir_oficina ? ' · sin las ventas de oficina' : ''}`);
  }
  if (p.escalon_crecimiento) {
    const e = p.escalon_crecimiento;
    lineas.push(`Crecimiento de su unidad ≥ ${e.umbral_pct} %: ${dolares(e.alto)} por venta; si no, ${dolares(e.bajo)}`);
  }
  if (p.factor && p.factor !== 'ninguno') lineas.push(`Total × ${FACTORES[p.factor]} (máx. 100 %)`);
  if (p.bono_tramos) lineas.push(`Bono por ventas: ${p.bono_tramos.map((t) => `≥ ${t.desde} → ${dolares(t.monto)}`).join(' · ')}`);
  if (p.bono_por_asesor) lineas.push(`Bono por cada asesor: ${p.bono_por_asesor.map((t) => `≥ ${t.desde} → ${dolares(t.monto)}`).join(' · ')}`);
  if (p.bono_por_unidad) lineas.push(`Bono de ${dolares(p.bono_por_unidad.monto)} por unidad, proporcional a su % de ingresos (máx. 100 %)`);
  if (p.bono_churn) lineas.push(`Bono por churn bruto: ${p.bono_churn.map((t) => `≤ ${t.max} % → ${dolares(t.monto)}`).join(' · ')}`);
  if (p.bono_empresa) {
    lineas.push(`Bono por ventas de la empresa: ${dolares(p.bono_empresa.monto)} al 100 % (proporcional por debajo), ${dolares(p.bono_empresa.excedente)} por encima`);
  }
  return lineas;
}

/** Las condiciones del rol abierto, junto a su gente: qué piezas paga, de dónde vienen y cómo editarlas. */
export function CondicionesRolCard({
  condicion,
  onEditar,
  onRestablecer,
}: {
  condicion: CatalogoCondicionRol | undefined;
  onEditar: (fila: CatalogoCondicionRol) => void;
  onRestablecer: (fila: CatalogoCondicionRol) => void;
}) {
  if (!condicion) {
    return <EmptyState title="Sin condiciones" description="Este rol no tiene condiciones de pago." icon={<Banknote />} />;
  }
  const lineas = describirPiezas(condicion.parametros);
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
            condicion.personalizado ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-700/40 text-slate-400'
          }`}
        >
          {condicion.personalizado ? 'Editadas' : 'De la política'}
        </span>
        <div className="flex items-center gap-2">
          {condicion.personalizado && (
            <Button type="button" variant="outline" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => onRestablecer(condicion)}>
              Política
            </Button>
          )}
          <Button type="button" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => onEditar(condicion)}>
            Editar
          </Button>
        </div>
      </div>
      {lineas.length === 0 ? (
        <p className="text-sm text-slate-500">Este rol no cobra nada por sí mismo.</p>
      ) : (
        <ul className="space-y-2">
          {lineas.map((linea) => (
            <li key={linea} className="rounded-lg border border-slate-800 bg-surface-primary/60 px-3 py-2 text-xs leading-relaxed text-slate-300">
              {linea}
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

const numero = (e: { target: { value: string } }) => (e.target.value === '' ? 0 : Number(e.target.value));

/** Filas editables de tramos `desde → monto` (con `descontar` en los del asesor). */
function Tramos({
  titulo,
  hint,
  tramos,
  conDescuento = false,
  onChange,
}: {
  titulo: string;
  hint?: string;
  tramos: TramoPago[];
  conDescuento?: boolean;
  onChange: (tramos: TramoPago[]) => void;
}) {
  const cambiar = (i: number, patch: Partial<TramoPago>) =>
    onChange(tramos.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  return (
    <Field
      label={titulo}
      hint={hint}
      action={
        <button
          type="button"
          onClick={() => onChange([...tramos, { desde: 0, monto: 0, ...(conDescuento ? { descontar: 0 } : {}) }])}
          className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300"
        >
          <Plus className="h-3 w-3" /> Añadir tramo
        </button>
      }
    >
      <div className="space-y-2">
        {tramos.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">desde</span>
            <input type="number" min={0} className={modalInputClass} value={t.desde} onChange={(e) => cambiar(i, { desde: numero(e) })} />
            <span className="text-[10px] text-slate-400">ventas →</span>
            <input type="number" min={0} step="0.01" className={modalInputClass} value={t.monto} onChange={(e) => cambiar(i, { monto: numero(e) })} />
            <span className="text-[10px] text-slate-400">$</span>
            {conDescuento && (
              <>
                <span className="text-[10px] text-slate-400">descuenta</span>
                <input type="number" min={0} className={modalInputClass} value={t.descontar ?? 0} onChange={(e) => cambiar(i, { descontar: numero(e) })} />
              </>
            )}
            <button type="button" onClick={() => onChange(tramos.filter((_, k) => k !== i))} className="text-rose-400 hover:text-rose-300" title="Quitar tramo">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Field>
  );
}

/** Un monto por venta: dólares fijos o un % del precio del plan. */
function EditorMonto({ titulo, hint, valor, onChange }: {
  titulo: string; hint?: string; valor: PiezaMonto; onChange: (p: PiezaMonto) => void;
}) {
  return (
    <Field label={titulo} hint={hint}>
      <div className="flex items-center gap-2">
        <SelectMenu
          aria-label={titulo}
          className={modalInputClass}
          value={valor.tipo}
          options={[{ value: 'monto', label: 'Dólares por venta' }, { value: 'pct_plan', label: '% del precio del plan' }]}
          onChange={(tipo) => onChange({ ...valor, tipo: tipo as PiezaMonto['tipo'] })}
        />
        <input type="number" min={0} step="0.01" className={modalInputClass} value={valor.valor} onChange={(e) => onChange({ ...valor, valor: numero(e) })} />
      </div>
    </Field>
  );
}

/** Edición de las condiciones de un rol: solo se pintan las piezas que su rol admite. */
export function CondicionesForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  value: CondicionDraft;
  saving: boolean;
  onChange: (patch: Partial<CondicionDraft>) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const p = value.parametros;
  const poner = (patch: Partial<ParametrosPago>) => onChange({ parametros: { ...p, ...patch } });
  const tiene = (pieza: CondicionDraft['piezas'][number]) => value.piezas.includes(pieza);

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={`${value.etiqueta} · cómo cobra`}
        description="Solo afecta a lo que se calcule después: un periodo cerrado conserva las condiciones con que se pagó."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => onChange({ parametros: structuredClone(value.defecto) })}
          >
            Política
          </Button>
        }
      />

      {tiene('tramos_asesor') && p.tramos_asesor && (
        <Tramos
          titulo="Por ventas propias"
          hint="Cada tramo vale desde esa cantidad de ventas hasta el siguiente. «Descuenta»: ventas que no se pagan en ese tramo."
          tramos={p.tramos_asesor}
          conDescuento
          onChange={(t) => poner({ tramos_asesor: t })}
        />
      )}
      {tiene('propia') && p.propia && (
        <EditorMonto titulo="Venta propia" hint="Lo que cobra por cada venta que hizo él mismo («Medio»)." valor={p.propia} onChange={(v) => poner({ propia: v })} />
      )}
      {tiene('equipo') && p.equipo && (
        <>
          <EditorMonto
            titulo="Venta de equipo"
            hint={tiene('escalon_crecimiento') ? 'Con el escalón de crecimiento de abajo este monto no se usa.' : undefined}
            valor={p.equipo}
            onChange={(v) => poner({ equipo: { ...p.equipo!, ...v } })}
          />
          <Field label="¿De qué ventas?">
            <SelectMenu
              aria-label="Alcance de la venta de equipo"
              className={modalInputClass}
              value={p.equipo.alcance}
              options={(Object.keys(ALCANCES) as AlcanceEquipo[]).map((a) => ({ value: a, label: ALCANCES[a] }))}
              onChange={(a) => poner({ equipo: { ...p.equipo!, alcance: a as AlcanceEquipo } as PiezaEquipo })}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={p.equipo.excluir_oficina} onChange={(e) => poner({ equipo: { ...p.equipo!, excluir_oficina: e.target.checked } })} />
              No contar las ventas de oficina (las que hizo una coordinadora de oficina)
            </label>
          </Field>
        </>
      )}
      {tiene('escalon_crecimiento') && p.escalon_crecimiento && (
        <Field label="Escalón de crecimiento" hint="Por venta de equipo: cobra el monto alto si el crecimiento de su unidad llega al umbral, y el bajo si no.">
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            umbral
            <input type="number" step="0.1" className={modalInputClass} value={p.escalon_crecimiento.umbral_pct} onChange={(e) => poner({ escalon_crecimiento: { ...p.escalon_crecimiento!, umbral_pct: numero(e) } })} />
            % · alto
            <input type="number" min={0} step="0.01" className={modalInputClass} value={p.escalon_crecimiento.alto} onChange={(e) => poner({ escalon_crecimiento: { ...p.escalon_crecimiento!, alto: numero(e) } })} />
            $ · bajo
            <input type="number" min={0} step="0.01" className={modalInputClass} value={p.escalon_crecimiento.bajo} onChange={(e) => poner({ escalon_crecimiento: { ...p.escalon_crecimiento!, bajo: numero(e) } })} />
            $
          </div>
        </Field>
      )}
      {tiene('factor') && (
        <Field label="Factor de cumplimiento" hint="Multiplica lo que cobra por ventas (propias + equipo), con tope del 100 %. El bono no se multiplica.">
          <SelectMenu
            aria-label="Factor de cumplimiento"
            className={modalInputClass}
            value={p.factor ?? 'ninguno'}
            options={(Object.keys(FACTORES) as FactorCumplimiento[]).map((f) => ({ value: f, label: FACTORES[f] }))}
            onChange={(f) => poner({ factor: f as FactorCumplimiento })}
          />
        </Field>
      )}
      {tiene('bono_tramos') && p.bono_tramos && (
        <Tramos titulo="Bono por ventas propias" hint="Un monto único según cuántas ventas hizo en el mes; vale el último tramo alcanzado." tramos={p.bono_tramos} onChange={(t) => poner({ bono_tramos: t })} />
      )}
      {tiene('bono_por_asesor') && p.bono_por_asesor && (
        <Tramos titulo="Bono por cada asesor de su equipo" hint="Se paga por cada asesor suyo que llega al tramo (el que más vende con él)." tramos={p.bono_por_asesor} onChange={(t) => poner({ bono_por_asesor: t })} />
      )}
      {tiene('bono_por_unidad') && p.bono_por_unidad && (
        <Field label="Bono por unidad de negocio" hint="Por cada unidad que lleva: este monto × su % de ingresos, con tope del 100 %.">
          <input type="number" min={0} step="0.01" className={modalInputClass} value={p.bono_por_unidad.monto} onChange={(e) => poner({ bono_por_unidad: { monto: numero(e) } })} />
        </Field>
      )}
      {tiene('bono_churn') && p.bono_churn && (
        <Field
          label="Bono por churn bruto"
          hint="Cobra el del tramo más exigente que cumple (churn bruto de su unidad ≤ máximo)."
          action={
            <button type="button" onClick={() => poner({ bono_churn: [...p.bono_churn!, { max: 0, monto: 0 }] })} className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300">
              <Plus className="h-3 w-3" /> Añadir tramo
            </button>
          }
        >
          <div className="space-y-2">
            {p.bono_churn.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] text-slate-400">
                ≤
                <input type="number" step="0.1" className={modalInputClass} value={t.max} onChange={(e) => poner({ bono_churn: p.bono_churn!.map((x, k) => (k === i ? { ...x, max: numero(e) } : x)) })} />
                % →
                <input type="number" min={0} step="0.01" className={modalInputClass} value={t.monto} onChange={(e) => poner({ bono_churn: p.bono_churn!.map((x, k) => (k === i ? { ...x, monto: numero(e) } : x)) })} />
                $
                <button type="button" onClick={() => poner({ bono_churn: p.bono_churn!.filter((_, k) => k !== i) })} className="text-rose-400 hover:text-rose-300" title="Quitar tramo">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Field>
      )}
      {tiene('bono_empresa') && p.bono_empresa && (
        <Field label="Bono por las ventas de la empresa" hint="Por debajo del 100 % cobra el monto proporcional (80 % → 80 $ si el monto es 100); al 100 %, el monto; por encima, el excedente.">
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            al 100 %
            <input type="number" min={0} step="0.01" className={modalInputClass} value={p.bono_empresa.monto} onChange={(e) => poner({ bono_empresa: { ...p.bono_empresa!, monto: numero(e) } })} />
            $ · por encima
            <input type="number" min={0} step="0.01" className={modalInputClass} value={p.bono_empresa.excedente} onChange={(e) => poner({ bono_empresa: { ...p.bono_empresa!, excedente: numero(e) } })} />
            $
          </div>
        </Field>
      )}

      <FormFooter saving={saving} onClose={onClose} submitLabel="Guardar condiciones" />
    </ModalForm>
  );
}
