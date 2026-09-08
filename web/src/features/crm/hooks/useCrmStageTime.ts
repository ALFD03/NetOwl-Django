import { useMemo, useState } from 'react';

import { CRM_ETAPAS_CLAVE } from '@/shared/constants/labels';
import {
  buildStageTimeCards,
  buildStageTimeDimensionRows,
  corteMedicion,
  findEtapaTiempo,
  stageTimeLeaders,
  tiempoEtapa,
} from '../lib/crmTiempoEtapa';
import type { CrmDimensionValue, CrmHistoricoRow } from '../types';

/**
 * Everything the stage-time section draws.
 *
 * The cards are the period's own figures — the baseline every dimension value
 * is measured against — so they deliberately do not depend on the selected
 * dimension. The breakdown below them does: it answers "who is slow in this
 * stage", which only means something inside one axis at a time.
 */
export function useCrmStageTime(globalData: CrmHistoricoRow, rows: CrmDimensionValue[]) {
  const [etapaElegida, setSelectedEtapa] = useState<string>(CRM_ETAPAS_CLAVE[0]);
  const [verTodas, setVerTodas] = useState(false);

  const tiempoPorEtapa = globalData.tiempo_por_etapa ?? [];

  /**
   * Which stages to show. `es_clave` comes from the analysis, so the full list
   * follows the order the backend produced (the funnel's own order) instead of
   * re-deriving it here.
   */
  const etapas = useMemo<string[]>(() => {
    if (!verTodas) return [...CRM_ETAPAS_CLAVE];

    const delPeriodo = tiempoPorEtapa
      .map((row) => row.etapa)
      .filter((etapa): etapa is string => Boolean(etapa));

    // The key stages stay listed even with no movement in the period: their
    // absence is itself the reading.
    const faltantes = CRM_ETAPAS_CLAVE.filter((etapa) => !delPeriodo.includes(etapa));
    return [...delPeriodo, ...faltantes];
  }, [tiempoPorEtapa, verTodas]);

  const cards = useMemo(
    () => buildStageTimeCards(tiempoPorEtapa, etapas),
    [tiempoPorEtapa, etapas],
  );

  /**
   * Collapsing the list back to the key stages can strand the selection on a
   * stage no longer offered, so the active one is derived rather than synced.
   */
  const selectedEtapa = etapas.includes(etapaElegida) ? etapaElegida : etapas[0] ?? CRM_ETAPAS_CLAVE[0];

  /** The period's time in the selected stage — the 100 % of the variations. */
  const baseline = useMemo(
    () => tiempoEtapa(findEtapaTiempo(tiempoPorEtapa, selectedEtapa)),
    [tiempoPorEtapa, selectedEtapa],
  );

  const dimensionRows = useMemo(
    () => buildStageTimeDimensionRows(rows, selectedEtapa, baseline),
    [rows, selectedEtapa, baseline],
  );

  const leaders = useMemo(() => stageTimeLeaders(dimensionRows), [dimensionRows]);

  /**
   * Instant the open stays were measured against. Worth showing: the stays with
   * no closing date are measured against the clock, so the figure moves between
   * runs and the reader needs to know which clock it was.
   */
  const corte = useMemo(() => corteMedicion(tiempoPorEtapa), [tiempoPorEtapa]);

  /** No stage of the period carries a measurement — the section has nothing to say. */
  const isEmpty = tiempoPorEtapa.length === 0;

  return {
    cards,
    corte,
    etapas,
    isEmpty,
    selectedEtapa,
    setSelectedEtapa,
    verTodas,
    setVerTodas,
    baseline,
    dimensionRows,
    leaders,
  };
}
