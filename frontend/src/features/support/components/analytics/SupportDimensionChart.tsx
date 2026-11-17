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
import { Link } from '@inertiajs/react';
import { BarChart3, Building2, CandlestickChart, MousePointerClick, Table, Users } from 'lucide-react';

import { BarChart } from '@/shared/charts';
import { EmptyState, NeonContainer, ToggleGroup } from '@/shared/ui';
import { formatInteger } from '@/shared/utils';
import {
  TOPE_VALORES,
  altoBarras,
  valoresConVelas,
  velasData,
  velasOptions,
  volumenPorValorData,
  volumenPorValorOptions,
} from '../../lib/supportCharts';
import {
  CIERRE_TOTAL,
  SUPPORT_DIMENSION_CAPTIONS,
  SUPPORT_DIMENSION_LABELS,
  agruparPorDepartamento,
} from '../../lib/supportMetrics';
import { esDimensionPersona, type SupportDimension, type SupportDimensionRow } from '../../types';

type Vista = 'volumen' | 'tiempos';
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
  const esPersona = esDimensionPersona(dimension);
  const [vista, setVista] = useState<Vista>('volumen');
  const [lectura, setLectura] = useState<Lectura>('persona');

  const porDepartamento = esPersona && lectura === 'departamento';
  const totalGrupo = useMemo(() => rows.reduce((acc, r) => acc + Number(r.total_tickets ?? 0), 0), [rows]);
  const filas = useMemo(
    () => (porDepartamento ? agruparPorDepartamento(rows, totalGrupo) : rows),
    [porDepartamento, rows, totalGrupo],
  );
  const seleccionar = porDepartamento ? undefined : onSelect;

  // Los departamentos no tienen distribución: sus medianas no se pueden sumar.
  const vistaActiva: Vista = porDepartamento ? 'volumen' : vista;
  const conVelas = valoresConVelas(filas, CIERRE_TOTAL);
  const dibujadas = vistaActiva === 'volumen' ? Math.min(filas.length, TOPE_VALORES) : conVelas;
  const resto = filas.length - Math.min(filas.length, TOPE_VALORES);

  const chart = useMemo(() => {
    if (vistaActiva === 'volumen') {
      return {
        data: volumenPorValorData(filas),
        options: volumenPorValorOptions(filas, seleccionar ? (i) => seleccionar(filas[i].nombre) : undefined),
      };
    }
    return { data: velasData(filas, CIERRE_TOTAL), options: velasOptions(filas, CIERRE_TOTAL, seleccionar) };
  }, [vistaActiva, filas, seleccionar]);

  const subtitulo =
    vistaActiva === 'volumen'
      ? `${SUPPORT_DIMENSION_CAPTIONS[dimension]} · cada barra partida por cómo terminó`
      : `${SUPPORT_DIMENSION_CAPTIONS[dimension]} · cierre total: mecha de mínimo a máximo, caja de la mitad central, marca en el promedio`;

  return (
    <NeonContainer
      theme="purple"
      title={porDepartamento ? `${label} por departamento` : `${groupName} por ${label.toLowerCase()}`}
      subtitle={subtitulo}
      icon={vistaActiva === 'volumen' ? <BarChart3 className="h-5 w-5" /> : <CandlestickChart className="h-5 w-5" />}
      headerAction={
        <div className="flex flex-wrap items-center gap-3">
          {esPersona && (
            <ToggleGroup
              activeKey={lectura}
              onChange={(key) => setLectura(key as Lectura)}
              options={[
                { key: 'persona', label: 'Por persona', icon: Users },
                { key: 'departamento', label: 'Por departamento', icon: Building2 },
              ]}
            />
          )}
          {!porDepartamento && (
            <ToggleGroup
              activeKey={vista}
              onChange={(key) => setVista(key as Vista)}
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
            vistaActiva === 'tiempos'
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
                  Se ven los {TOPE_VALORES} con más tickets; quedan {formatInteger(resto)} más.
                </span>
              )}
            </span>
            {resultsHref && (
              <Link
                href={resultsHref}
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
