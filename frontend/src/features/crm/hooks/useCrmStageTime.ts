import { useMemo, useState } from 'react';

import { CRM_KEY_STAGES } from '@/shared/constants/labels';
import {
  buildStageTimeCards,
  buildStageTimeDimensionRows,
  measurementCutoff,
  findStageTime,
  stageTimeLeaders,
  stageTime,
} from '../lib/crmStageTime';
import type { CrmDimensionValue, CrmHistoricoRow, CrmStageTimeRow } from '../types';

/** Una sola lista vacía: un `[]` nuevo en cada render invalidaría todos los memos de abajo. */
const NO_STAGES: CrmStageTimeRow[] = [];

/**
 * Everything the stage-time section draws.
 *
 * The cards are the period's own figures — the baseline every dimension value
 * is measured against — so they deliberately do not depend on the selected
 * dimension. The breakdown below them does: it answers "who is slow in this
 * stage", which only means something inside one axis at a time.
 */
export function useCrmStageTime(globalData: CrmHistoricoRow, rows: CrmDimensionValue[]) {
  const [pickedStage, setPickedStage] = useState<string>(CRM_KEY_STAGES[0]);
  const [showAll, setShowAll] = useState(false);

  const timeByStage = globalData.time_by_stage ?? NO_STAGES;

  /**
   * Which stages to show. `is_key` comes from the analysis, so the full list
   * follows the order the backend produced (the funnel's own order) instead of
   * re-deriving it here.
   */
  const stages = useMemo<string[]>(() => {
    if (!showAll) return [...CRM_KEY_STAGES];

    const ofPeriod = timeByStage
      .map((row) => row.stage)
      .filter((stage): stage is string => Boolean(stage));

    // The key stages stay listed even with no movement in the period: their
    // absence is itself the reading.
    const missing = CRM_KEY_STAGES.filter((stage) => !ofPeriod.includes(stage));
    return [...ofPeriod, ...missing];
  }, [timeByStage, showAll]);

  const cards = useMemo(
    () => buildStageTimeCards(timeByStage, stages),
    [timeByStage, stages],
  );

  /**
   * Collapsing the list back to the key stages can strand the selection on a
   * stage no longer offered, so the active one is derived rather than synced.
   */
  const selectedStage = stages.includes(pickedStage) ? pickedStage : stages[0] ?? CRM_KEY_STAGES[0];

  /** The period's time in the selected stage — the 100 % of the variations. */
  const baseline = useMemo(
    () => stageTime(findStageTime(timeByStage, selectedStage)),
    [timeByStage, selectedStage],
  );

  const dimensionRows = useMemo(
    () => buildStageTimeDimensionRows(rows, selectedStage, baseline),
    [rows, selectedStage, baseline],
  );

  const leaders = useMemo(() => stageTimeLeaders(dimensionRows), [dimensionRows]);

  /**
   * Instant the open stays were measured against. Worth showing: the stays with
   * no closing date are measured against the clock, so the figure moves between
   * runs and the reader needs to know which clock it was.
   */
  const cut = useMemo(() => measurementCutoff(timeByStage), [timeByStage]);

  /** No stage of the period carries a measurement — the section has nothing to say. */
  const isEmpty = timeByStage.length === 0;

  return {
    cards,
    cut,
    stages,
    isEmpty,
    selectedStage,
    setSelectedStage: setPickedStage,
    showAll,
    setShowAll,
    baseline,
    dimensionRows,
    leaders,
  };
}
