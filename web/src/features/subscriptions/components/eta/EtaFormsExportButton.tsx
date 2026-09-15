/** Descarga las tres hojas del formulario que se declara a la reguladora. */

import { useState } from 'react';
import { AlertTriangle, FileSpreadsheet, FileX2 } from 'lucide-react';

import { downloadSheetsAsExcel } from '@/shared/lib/excel';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { Button, StatusMessage } from '@/shared/ui';
import {
  formularioEtaFileName,
  hojasFormularioEta,
  totalFilasFormulario,
} from '../../lib/etaFormsExport';
import type { EtaFormularios } from '@/shared/types/subscriptions';

interface EtaFormsExportButtonProps {
  /** Las tres hojas ya calculadas. Ausentes hasta que el periodo se recalcule. */
  formularios?: EtaFormularios;
  period: string;
  /** Tasa del BCV del periodo. `0` = sin fijar: las rentas salen vacías. */
  tasa: number;
  /** Planes que cuentan en el reporte pero no tienen plan regulador asignado. */
  sinRegulador?: string[];
  className?: string;
}

type Estado = 'idle' | 'busy' | 'error' | 'empty';

/**
 * Escribe el libro en el navegador, con lo que el reporte ya trae.
 *
 * No pide nada al servidor: las filas viajan dentro del reporte del periodo,
 * que es lo que hace que un mes bloqueado exporte lo que se declaró y no lo
 * que saldría hoy.
 *
 * Se avisa de dos cosas sin bloquear la descarga, porque el formulario sigue
 * siendo útil a medias y quien lo declara necesita verlo:
 *
 * - **Sin tasa fijada**, las columnas de renta salen vacías.
 * - **Planes sin plan regulador**, que cuentan en las matrices del reporte
 *   pero no tienen fila con la que declararse.
 */
export function EtaFormsExportButton({
  formularios,
  period,
  tasa,
  sinRegulador = [],
  className,
}: EtaFormsExportButtonProps) {
  const [estado, setEstado] = useState<Estado>('idle');
  const [error, setError] = useState<string | null>(null);

  const filas = totalFilasFormulario(formularios);
  // Un periodo bloqueado antes de que existieran los formularios sirve el JSON
  // que se guardó entonces, y ese no los trae: hay que recalcularlo.
  const sinCalcular = !formularios;

  const handleClick = async () => {
    if (!formularios || filas === 0) {
      setEstado('empty');
      return;
    }
    setEstado('busy');
    setError(null);
    try {
      await downloadSheetsAsExcel(
        hojasFormularioEta(formularios, tasa),
        formularioEtaFileName(period),
      );
      setEstado('idle');
    } catch (err) {
      // El motivo se enseña, no solo se registra. «No se pudo exportar» a secas
      // obliga a abrir la consola para saber si el libro está mal formado o si
      // el navegador bloqueó la descarga, y son dos problemas de quien lo
      // arregla distintos. La traza sigue yendo a la consola.
      console.error('Fallo al generar los formularios de la reguladora:', err);
      setError(getApiErrorMessage(err, 'El navegador no pudo escribir el libro.'));
      setEstado('error');
    }
  };

  const avisos = [
    sinCalcular
      ? 'Este periodo se calculó antes de que existieran los formularios: recalcúlalo para poder exportarlos.'
      : '',
    tasa > 0 ? '' : 'Sin tasa del BCV fijada: las columnas de renta básica saldrán vacías.',
    sinRegulador.length
      ? `${sinRegulador.length} plan(es) sin plan regulador asignado quedan fuera del formulario: ${sinRegulador.slice(0, 5).join(', ')}${sinRegulador.length > 5 ? '…' : ''}`
      : '',
  ].filter(Boolean);

  const icono = estado === 'error'
    ? <AlertTriangle className="h-3.5 w-3.5" />
    : estado === 'empty'
      ? <FileX2 className="h-3.5 w-3.5" />
      : <FileSpreadsheet className="h-3.5 w-3.5" />;

  const etiqueta = estado === 'error'
    ? 'No se pudo exportar'
    : estado === 'empty'
      ? 'Nada que declarar'
      : 'Exportar formularios';

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="secondary"
        size="sm"
        className={className}
        onClick={handleClick}
        isLoading={estado === 'busy'}
        disabled={!period || sinCalcular || filas === 0}
        icon={icono}
        title={[
          `Descargar las tres hojas del formulario de ${period} (internet, transporte y televisión).`,
          ...avisos,
        ].join(' ')}
      >
        {etiqueta}
      </Button>

      {/* Los avisos no impiden exportar pero cambian lo que sale en el libro,
          así que se leen antes de pulsar y no en el `title`. El error se lee
          después, y por eso van los dos aquí. */}
      <StatusMessage
        status={
          error
            ? { type: 'error', text: error }
            : avisos.length
              ? { type: 'warning', text: avisos.join(' ') }
              : null
        }
        icon={<AlertTriangle />}
        className="max-w-lg"
      />
    </div>
  );
}
