/**
 * Un eje del grupo en gráfico: dónde se concentra el trabajo y quién tarda.
 *
 * Es la lectura de Analytics del mismo eje que en Results es una tabla. Dos
 * vistas:
 *
 * - **Volumen**: cada valor partido por su desenlace (resueltos, cancelados,
 *   escalados, sin cerrar), ordenado por tickets. Dice dónde está la carga y
 *   cómo termina.
 * - **Tiempos**: una vela por valor con la distribución del cierre total —
 *   mínimo a máximo, la mitad central y el promedio—. Dice quién es lento
 *   siempre y quién sólo tiene casos largos.
 *
 * Pulsar un valor abre su desglose por tipo, razón y solución, como la fila de
 * la tabla. En los ejes de persona, «Por departamento» suma a la gente por su
 * área del directorio; un departamento no tiene desglose propio.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Building2, CandlestickChart, MousePointerClick, Table, Users } from 'lucide-react';

import { BarChart } from '@/shared/charts';
import { EmptyState, NeonContainer, ToggleGroup } from '@/shared/ui';
import { formatInteger } from '@/shared/utils';
import {
  VALUES_CAP,
  barsHeight,
  valuesWithCandles,
  candlesData,
  candlesOptions,
  volumeByValueData,
  volumeByValueOptions,
} from '../../lib/supportCharts';
import {
  CLOSE_TOTAL,
  SUPPORT_DIMENSION_CAPTIONS,
  SUPPORT_DIMENSION_LABELS,
  groupByDepartment,
} from '../../lib/supportMetrics';
import { isPersonDimension, type SupportDimension, type SupportDimensionRow } from '../../types';

type View = 'volumen' | 'tiempos';
type Reading = 'persona' | 'departamento';

interface Props {
  dimension: SupportDimension;
  rows: SupportDimensionRow[];
  groupName: string;
  /** Abre el desglose de un valor; no se ofrece en la vista por departamento. */
  onSelect: (value: string) => void;
  /** Adónde lleva «Tabla completa»: Results con el mismo mes. */
  resultsHref?: string;
}

export function SupportDimensionChart({ dimension, rows, groupName, onSelect, resultsHref }: Props) {
  const label = SUPPORT_DIMENSION_LABELS[dimension];
  const isPerson = isPersonDimension(dimension);
  const [view, setView] = useState<View>('volumen');
  const [reading, setReading] = useState<Reading>('persona');

  const byDepartment = isPerson && reading === 'departamento';
  const groupTotal = useMemo(() => rows.reduce((acc, r) => acc + Number(r.total_tickets ?? 0), 0), [rows]);
  const chartRows = useMemo(
    () => (byDepartment ? groupByDepartment(rows, groupTotal) : rows),
    [byDepartment, rows, groupTotal],
  );
  const select = byDepartment ? undefined : onSelect;

  // Los departamentos no tienen distribución: sus medianas no se pueden sumar.
  const activeView: View = byDepartment ? 'volumen' : view;
  const withCandles = valuesWithCandles(chartRows, CLOSE_TOTAL);
  const drawn = activeView === 'volumen' ? Math.min(chartRows.length, VALUES_CAP) : withCandles;
  const rest = chartRows.length - Math.min(chartRows.length, VALUES_CAP);

  const chart = useMemo(() => {
    if (activeView === 'volumen') {
      return {
        data: volumeByValueData(chartRows),
        options: volumeByValueOptions(chartRows, select ? (i) => select(chartRows[i].name) : undefined),
      };
    }
    return { data: candlesData(chartRows, CLOSE_TOTAL), options: candlesOptions(chartRows, CLOSE_TOTAL, select) };
  }, [activeView, chartRows, select]);

  const subtitle =
    activeView === 'volumen'
      ? `${SUPPORT_DIMENSION_CAPTIONS[dimension]} · cada barra partida por cómo terminó`
      : `${SUPPORT_DIMENSION_CAPTIONS[dimension]} · cierre total: mecha de mínimo a máximo, caja de la mitad central, marca en el promedio`;

  return (
    <NeonContainer
      theme="purple"
      title={byDepartment ? `${label} por departamento` : `${groupName} por ${label.toLowerCase()}`}
      subtitle={subtitle}
      icon={activeView === 'volumen' ? <BarChart3 className="h-5 w-5" /> : <CandlestickChart className="h-5 w-5" />}
      headerAction={
        <div className="flex flex-wrap items-center gap-3">
          {isPerson && (
            <ToggleGroup
              activeKey={reading}
              onChange={(key) => setReading(key as Reading)}
              options={[
                { key: 'persona', label: 'Por persona', icon: Users },
                { key: 'departamento', label: 'Por departamento', icon: Building2 },
              ]}
            />
          )}
          {!byDepartment && (
            <ToggleGroup
              activeKey={view}
              onChange={(key) => setView(key as View)}
              options={[
                { key: 'volumen', label: 'Volumen', icon: BarChart3 },
                { key: 'tiempos', label: 'Tiempos', icon: CandlestickChart },
              ]}
            />
          )}
        </div>
      }
    >
      {drawn === 0 ? (
        <EmptyState
          title={
            activeView === 'tiempos'
              ? `Ningún valor de ${label.toLowerCase()} tiene cierres medibles en el corte.`
              : `El grupo no registra ninguna ${label.toLowerCase()} en el corte.`
          }
          icon={<BarChart3 />}
        />
      ) : (
        <>
          <div style={{ height: barsHeight(drawn) }}>
            <BarChart data={chart.data} options={chart.options} className="h-full w-full" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-2">
              {select && (
                <>
                  <MousePointerClick className="h-3.5 w-3.5 text-brand" />
                  Pulsa un valor para ver su tipo, razón y solución.
                </>
              )}
              {rest > 0 && (
                <span>
                  Se ven los {VALUES_CAP} con más tickets; quedan {formatInteger(rest)} más.
                </span>
              )}
            </span>
            {resultsHref && (
              <Link
                to={resultsHref}
                className="flex items-center gap-1.5 rounded-full border border-brand/40 px-3 py-1 font-semibold text-brand hover:bg-brand/10"
              >
                <Table className="h-3.5 w-3.5" /> Tabla completa en Results
              </Link>
            )}
          </div>
        </>
      )}
    </NeonContainer>
  );
}
