/** Comisiones › Informe › Indicadores: los % que mueven el pago, calculados o escritos a mano, antes de leer la nómina. */

import type { ReactNode } from 'react';
import { Network, Target, Users } from 'lucide-react';

import { Paginacion, usePaginacion } from '@/shared/ui';
import { formatoPct } from '../lib/formato';
import type { CrecimientoIndicador, FactorIndicador, InformeComision } from '../types';
import { ROL_CHIP } from './piezas';
import { ValorEditable } from './ValorEditable';

interface IndicadoresPanelProps {
  informe: InformeComision;
  editable: boolean;
  onCumplimiento: (personaId: number, valor: number | null) => void;
  onCrecimiento: (personaId: number, valor: number | null) => void;
}

/**
 * Filas por página de cada lista. Las tres muestran siempre las mismas —las que
 * faltan se rellenan con huecos— y las que tienen más se paginan: así las tres
 * columnas miden lo mismo y una fila de una queda a la altura de la de al lado.
 */
const FILAS = 8;

/** Lo que mide una fila (`h-14`): nombre, nota y el valor editable. */
const ALTO_FILA = 'h-14';

/** El pie de la lista, con o sin botones: la misma altura en las tres columnas. */
const ALTO_PIE = 'min-h-[2.875rem]';

function Columna({
  titulo, icono, tono, pendientes, children, vacio,
}: { titulo: string; icono: ReactNode; tono: string; pendientes: number; children: ReactNode[]; vacio: string }) {
  const paginas = usePaginacion(children, FILAS);
  const huecos = FILAS - paginas.visibles.length;
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
          <div key={`hueco-${i}`} aria-hidden className={`${ALTO_FILA} !border-transparent`} />
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

function Fila({ nombre, nota, titulo, children }: { nombre: string; nota?: ReactNode; titulo?: string; children: ReactNode }) {
  return (
    <div className={`flex ${ALTO_FILA} items-center justify-between gap-3 px-4`} title={titulo}>
      <span className="min-w-0">
        <span className="block truncate text-sm text-white">{nombre}</span>
        {nota && <span className="block truncate text-[11px] text-slate-500">{nota}</span>}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{children}</span>
    </div>
  );
}

const equipoDe = (informe: InformeComision, slug: string) =>
  informe.pagos.find((p) => p.equipo === slug)?.equipo_nombre ?? slug;

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
export function IndicadoresPanel({ informe, editable, onCumplimiento, onCrecimiento }: IndicadoresPanelProps) {
  const ind = informe.indicadores;
  const pago = (f: { persona_id: number; equipo: string }) =>
    informe.pagos.find((p) => p.persona_id === f.persona_id && p.equipo === f.equipo);

  const cumplimiento = (f: FactorIndicador) => {
    const p = pago(f);
    const porDefecto = f.calculado !== null
      ? `${formatoPct(f.calculado)} · ${f.factor === 'unidad' && f.fuentes.length > 1 ? 'promedio' : f.factor}`
      : 'sin definir';
    const detalle = f.fuentes.map((s) => `${s.nombre} ${s.pct === null ? 'sin %' : formatoPct(s.pct)}`).join(' · ')
      + (f.personal ? ` · Personal: ${f.personal.ventas}${f.personal.objetivo ? ` de ${f.personal.objetivo} ventas (${formatoPct(f.personal.pct)})` : ' ventas, sin objetivo'}` : '');
    return (
      <Fila
        key={`${f.persona_id}:${f.equipo}`}
        nombre={f.nombre}
        nota={`${ROL_CHIP[f.rol].label} · ${equipoDe(informe, f.equipo)}${p ? ` · ${p.ventas_propias + p.ventas_equipo} ventas` : ''}`}
        titulo={detalle || undefined}
      >
        <ValorEditable
          key={`cump-${f.persona_id}-${f.manual}`}
          valor={f.manual}
          vacio={porDefecto}
          vacioPendiente={f.calculado === null}
          editable={editable}
          onGuardar={(v) => onCumplimiento(f.persona_id, v)}
        />
      </Fila>
    );
  };
  // Lo mismo que impide cerrar: quien cobra algo sin ningún % que aplicarle.
  const sinCumplimiento = ind.factores.filter((f) => f.valor === null && (pago(f)?.bruto ?? 0) > 0).length;

  const crecimiento = (c: CrecimientoIndicador) => {
    const p = pago(c);
    return (
      <Fila
        key={`${c.persona_id}:${c.equipo}`}
        nombre={c.nombre}
        nota={
          c.fuente === 'manual'
            ? `escrito a mano${c.calculado !== null ? ` · calculado ${formatoPct(c.calculado)}` : ''}`
            : c.fuente === 'unidades de negocio'
              ? `${c.unidades.join(', ')}${c.churn_bruto !== null ? ` · churn bruto ${formatoPct(c.churn_bruto)}` : ''}`
              : 'el mes no está analizado: escríbelo'
        }
        titulo={p ? `${equipoDe(informe, c.equipo)}` : undefined}
      >
        <ValorEditable
          key={`crec-${c.persona_id}-${c.manual}`}
          valor={c.manual}
          vacio={c.calculado !== null ? `${formatoPct(c.calculado)} · calculado` : 'desconocido'}
          vacioPendiente={c.calculado === null}
          editable={editable}
          onGuardar={(v) => onCrecimiento(c.persona_id, v)}
        />
      </Fila>
    );
  };
  const sinCrecimiento = ind.crecimientos.filter((c) => c.valor === null && (pago(c)?.ventas_equipo ?? 0) > 0).length;

  const ingresos = [
    ...ind.ingresos_unidad.map((u) => (
      <Fila key={`u-${u.unidad_id}`} nombre={u.unidad} nota={`ventas ${formatoPct(u.pct_ventas)}`}>
        <span className="font-mono">{formatoPct(u.pct_ingresos)}</span>
      </Fila>
    )),
    ...(ind.empresa
      ? [(
        <Fila key="empresa" nombre="Toda la empresa" nota={`ingresos ${formatoPct(ind.empresa.pct_ingresos)} · bono de la administradora`}>
          <span className="font-mono">{formatoPct(ind.empresa.pct_ventas)}</span>
        </Fila>
      )]
      : []),
  ];

  return (
    <div className="space-y-5">
      {!ind.analizado && (
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
        <Columna
          titulo="Cumplimiento"
          icono={<Users className="h-4 w-4" />}
          tono="text-emerald-300"
          pendientes={sinCumplimiento}
          vacio="Nadie cobra con un % de cumplimiento este periodo."
        >
          {ind.factores.map(cumplimiento)}
        </Columna>
        <Columna
          titulo="Crecimiento · coord. de UN"
          icono={<Network className="h-4 w-4" />}
          tono="text-violet-300"
          pendientes={sinCrecimiento}
          vacio="Ningún coordinador de UN cobra este periodo."
        >
          {ind.crecimientos.map(crecimiento)}
        </Columna>
        <Columna
          titulo="Ingresos y empresa"
          icono={<Target className="h-4 w-4" />}
          tono="text-sky-300"
          pendientes={0}
          vacio="El mes no está analizado."
        >
          {ingresos}
        </Columna>
      </div>
    </div>
  );
}
