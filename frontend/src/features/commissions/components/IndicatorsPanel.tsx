/** Comisiones › Informe › Indicadores: los % que mueven el pago, calculados o escritos a mano, antes de leer la nómina. */

import type { ReactNode } from 'react';
import { Network, Target, Users } from 'lucide-react';

import { Paginacion, usePaginacion } from '@/shared/ui';
import { formatPctValue } from '../lib/format';
import type { IndicatorGrowth, IndicatorFactor, CommissionReport } from '../types';
import { ROL_CHIP } from './pieces';
import { EditableValue } from './EditableValue';

interface IndicatorsPanelProps {
  report: CommissionReport;
  editable: boolean;
  onCompliance: (personId: number, valor: number | null) => void;
  onGrowth: (personId: number, valor: number | null) => void;
}

/**
 * Filas por página de cada lista. Las tres muestran siempre las mismas —las que
 * faltan se rellenan con huecos— y las que tienen más se paginan: así las tres
 * columnas miden lo mismo y una fila de una queda a la altura de la de al lado.
 */
const ROWS = 8;

/** Lo que mide una fila (`h-14`): nombre, nota y el valor editable. */
const ROW_HEIGHT = 'h-14';

/** El pie de la lista, con o sin botones: la misma altura en las tres columnas. */
const ALTO_PIE = 'min-h-[2.875rem]';

function Column({
  titulo, icono, tono, pendientes, children, vacio,
}: { titulo: string; icono: ReactNode; tono: string; pendientes: number; children: ReactNode[]; vacio: string }) {
  const paginas = usePaginacion(children, ROWS);
  const huecos = ROWS - paginas.visibles.length;
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-surface-primary/50">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <span className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-wider ${tono}`}>{icono}{titulo}</span>
        {pendientes > 0
          ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">{pendientes} sin definir</span>
          : <span className="text-[10px] text-slate-500">completo</span>}
      </div>
      <div className="relative divide-y divide-slate-800/60">
        {paginas.visibles}
        {Array.from({ length: huecos }, (_, i) => (
          <div key={`hueco-${i}`} aria-hidden className={`${ROW_HEIGHT} !border-transparent`} />
        ))}
        {!children.length && (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-500">{vacio}</p>
        )}
      </div>
      {paginas.totalPaginas > 1 ? (
        <Paginacion estado={paginas} className={`mt-auto ${ALTO_PIE}`} />
      ) : (
        <div className={`mt-auto flex items-center border-t border-slate-800 bg-surface-secondary/50 px-3 py-2 ${ALTO_PIE}`}>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            {children.length === 1 ? '1 persona' : `${children.length} personas`}
          </span>
        </div>
      )}
    </div>
  );
}

function Row({ name, note, titulo, children }: { name: string; note?: ReactNode; titulo?: string; children: ReactNode }) {
  return (
    <div className={`flex ${ROW_HEIGHT} items-center justify-between gap-3 px-4`} title={titulo}>
      <span className="min-w-0">
        <span className="block truncate text-sm text-white">{name}</span>
        {note && <span className="block truncate text-[11px] text-slate-500">{note}</span>}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{children}</span>
    </div>
  );
}

const teamOf = (informe: CommissionReport, slug: string) =>
  informe.payments.find((p) => p.equipo === slug)?.team_name ?? slug;

/**
 * Los % que mueven el pago, en una sola pantalla.
 *
 * - **Cumplimiento**: el % que multiplica lo que cobra quien lo lleva (supervisores,
 *   coordinadoras de oficina, gerentes de UN), calculado del % Ventas de su site o
 *   de sus unidades —promediadas si son varias—. Nada se deduce de las ventas:
 *   quien no tenga site o superior asignado se escribe a mano.
 * - **Crecimiento** de la unidad de cada coordinador de UN, con su churn bruto.
 * - **Ingresos** de cada unidad (bono del jefe de UN) y **ventas de la empresa**
 *   (bono de la administradora): solo salen del análisis del mes.
 *
 * Lo calculado es el valor por defecto de cada fila; escribir uno lo sustituye
 * para esa persona, y borrarlo vuelve al calculado. Tope en 100 %.
 */
export function IndicatorsPanel({ report, editable, onCompliance: onCumplimiento, onGrowth: onCrecimiento }: IndicatorsPanelProps) {
  const ind = report.indicators;
  const pago = (f: { person_id: number; equipo: string }) =>
    report.payments.find((p) => p.person_id === f.person_id && p.equipo === f.equipo);

  const cumplimiento = (f: IndicatorFactor) => {
    const p = pago(f);
    const fallback = f.computed !== null
      ? `${formatPctValue(f.computed)} · ${f.factor === 'unidad' && f.sources.length > 1 ? 'promedio' : f.factor}`
      : 'sin definir';
    const detalle = f.sources.map((s) => `${s.name} ${s.pct === null ? 'sin %' : formatPctValue(s.pct)}`).join(' · ')
      + (f.personal ? ` · Personal: ${f.personal.sales}${f.personal.target ? ` de ${f.personal.target} ventas (${formatPctValue(f.personal.pct)})` : ' ventas, sin objetivo'}` : '');
    return (
      <Row
        key={`${f.person_id}:${f.equipo}`}
        name={f.name}
        note={`${ROL_CHIP[f.role].label} · ${teamOf(report, f.equipo)}${p ? ` · ${p.own_sales + p.team_sales} ventas` : ''}`}
        titulo={detalle || undefined}
      >
        <EditableValue
          key={`cump-${f.person_id}-${f.manual}`}
          value={f.manual}
          vacio={fallback}
          pendingEmpty={f.computed === null}
          editable={editable}
          onSave={(v) => onCumplimiento(f.person_id, v)}
        />
      </Row>
    );
  };
  // Lo mismo que impide cerrar: quien cobra algo sin ningún % que aplicarle.
  const withoutCompliance = ind.factors.filter((f) => f.value === null && (pago(f)?.gross ?? 0) > 0).length;

  const crecimiento = (c: IndicatorGrowth) => {
    const p = pago(c);
    return (
      <Row
        key={`${c.person_id}:${c.equipo}`}
        name={c.name}
        note={
          c.source === 'manual'
            ? `escrito a mano${c.computed !== null ? ` · calculado ${formatPctValue(c.computed)}` : ''}`
            : c.source === 'unidades de negocio'
              ? `${c.units.join(', ')}${c.gross_churn !== null ? ` · churn bruto ${formatPctValue(c.gross_churn)}` : ''}`
              : 'el mes no está analizado: escríbelo'
        }
        titulo={p ? `${teamOf(report, c.equipo)}` : undefined}
      >
        <EditableValue
          key={`crec-${c.person_id}-${c.manual}`}
          value={c.manual}
          vacio={c.computed !== null ? `${formatPctValue(c.computed)} · calculado` : 'desconocido'}
          pendingEmpty={c.computed === null}
          editable={editable}
          onSave={(v) => onCrecimiento(c.person_id, v)}
        />
      </Row>
    );
  };
  const withoutGrowth = ind.growths.filter((c) => c.value === null && (pago(c)?.team_sales ?? 0) > 0).length;

  const ingresos = [
    ...ind.unit_inflows.map((u) => (
      <Row key={`u-${u.unit_id}`} name={u.unit} note={`ventas ${formatPctValue(u.sales_pct)}`}>
        <span className="font-mono">{formatPctValue(u.inflows_pct)}</span>
      </Row>
    )),
    ...(ind.company
      ? [(
        <Row key="empresa" name="Toda la empresa" note={`ingresos ${formatPctValue(ind.company.inflows_pct)} · bono de la administradora`}>
          <span className="font-mono">{formatPctValue(ind.company.sales_pct)}</span>
        </Row>
      )]
      : []),
  ];

  return (
    <div className="space-y-5">
      {!ind.analyzed && (
        <p className="max-w-4xl rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-xs text-amber-200">
          El mes no está analizado en Subscriptions: ningún % se calcula. Lo que admite valor a mano se escribe aquí; el
          churn, los ingresos y el cumplimiento de la empresa solo salen del análisis, y sin ellos los bonos que dependen
          de ellos no se pagan y el cierre queda pendiente.
        </p>
      )}
      <p className="max-w-4xl rounded-2xl border border-slate-800 bg-surface-primary/50 px-5 py-4 text-xs text-slate-400">
        Cada rol toma el % Ventas de su site o de sus unidades (promediadas si son varias), según sus condiciones; nada se deduce
        de las ventas. Quien no tenga site o superior asignado se escribe a mano en su fila; lo escrito manda sobre lo
        calculado, y borrarlo vuelve al calculado. Pasa el ratón por una fila para ver el cálculo. Tope en 100 %.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Column
          titulo="Cumplimiento"
          icono={<Users className="h-4 w-4" />}
          tono="text-emerald-300"
          pendientes={withoutCompliance}
          vacio="Nadie cobra con un % de cumplimiento este periodo."
        >
          {ind.factors.map(cumplimiento)}
        </Column>
        <Column
          titulo="Crecimiento · coord. de UN"
          icono={<Network className="h-4 w-4" />}
          tono="text-violet-300"
          pendientes={withoutGrowth}
          vacio="Ningún coordinador de UN cobra este periodo."
        >
          {ind.growths.map(crecimiento)}
        </Column>
        <Column
          titulo="Ingresos y empresa"
          icono={<Target className="h-4 w-4" />}
          tono="text-sky-300"
          pendientes={0}
          vacio="El mes no está analizado."
        >
          {ingresos}
        </Column>
      </div>
    </div>
  );
}
