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
  altoBarras,
  valuesWithCandles,
  velasData,
  velasOptions,
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
type Lectura = 'persona' | 'departamento';

interface Props {
  dimension: SupportDimension;
  rows: SupportDimensionRow[];
  groupName: string;
  /** Abre el desglose de un valor; no se ofrece en la vista por departamento. */
  onSelect: (valor: string) => void;
  /** Adónde lleva «Tabla completa»: Results con el mismo mes. */
  resultsHref?: string;
}

export function SupportDimensionChart({ dimension, rows, groupName, onSelect, resultsHref }: Props) {
  const label = SUPPORT_DIMENSION_LABELS[dimension];
  const isPerson = isPersonDimension(dimension);
  const [vista, setVista] = useState<View>('volumen');
  const [lectura, setLectura] = useState<Lectura>('persona');

  const byDepartment = isPerson && lectura === 'departamento';
  const groupTotal = useMemo(() => rows.reduce((acc, r) => acc + Number(r.total_tickets ?? 0), 0), [rows]);
  const filas = useMemo(
    () => (byDepartment ? groupByDepartment(rows, groupTotal) : rows),
    [byDepartment, rows, groupTotal],
  );
  const seleccionar = byDepartment ? undefined : onSelect;

  // Los departamentos no tienen distribución: sus medianas no se pueden sumar.
  const activeView: View = byDepartment ? 'volumen' : vista;
  const withCandles = valuesWithCandles(filas, CLOSE_TOTAL);
  const dibujadas = activeView === 'volumen' ? Math.min(filas.length, VALUES_CAP) : withCandles;
  const resto = filas.length - Math.min(filas.length, VALUES_CAP);

  const chart = useMemo(() => {
    if (activeView === 'volumen') {
      return {
        data: volumeByValueData(filas),
        options: volumeByValueOptions(filas, seleccionar ? (i) => seleccionar(filas[i].nombre) : undefined),
      };
    }
    return { data: velasData(filas, CLOSE_TOTAL), options: velasOptions(filas, CLOSE_TOTAL, seleccionar) };
  }, [activeView, filas, seleccionar]);

  const subtitulo =
    activeView === 'volumen'
      ? `${SUPPORT_DIMENSION_CAPTIONS[dimension]} · cada barra partida por cómo terminó`
      : `${SUPPORT_DIMENSION_CAPTIONS[dimension]} · cierre total: mecha de mínimo a máximo, caja de la mitad central, marca en el promedio`;

  return (
    <NeonContainer
      theme="purple"
      title={byDepartment ? `${label} por departamento` : `${groupName} por ${label.toLowerCase()}`}
      subtitle={subtitulo}
      icon={activeView === 'volumen' ? <BarChart3 className="h-5 w-5" /> : <CandlestickChart className="h-5 w-5" />}
      headerAction={
        <div className="flex flex-wrap items-center gap-3">
          {isPerson && (
            <ToggleGroup
              activeKey={lectura}
              onChange={(key) => setLectura(key as Lectura)}
              options={[
                { key: 'persona', label: 'Por persona', icon: Users },
                { key: 'departamento', label: 'Por departamento', icon: Building2 },
              ]}
            />
          )}
          {!byDepartment && (
            <ToggleGroup
              activeKey={vista}
              onChange={(key) => setVista(key as View)}
              options={[
                { key: 'volumen', label: 'Volumen', icon: BarChart3 },
                { key: 'tiempos', label: 'Tiempos', icon: CandlestickChart },
              ]}
            />
          )}
        </div>
      }
    >
      {dibujadas === 0 ? (
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
          <div style={{ height: altoBarras(dibujadas) }}>
            <BarChart data={chart.data} options={chart.options} className="h-full w-full" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-2">
              {seleccionar && (
                <>
                  <MousePointerClick className="h-3.5 w-3.5 text-brand" />
                  Pulsa un valor para ver su tipo, razón y solución.
                </>
              )}
              {resto > 0 && (
                <span>
                  Se ven los {VALUES_CAP} con más tickets; quedan {formatInteger(resto)} más.
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
