import type { CrmDimensionRow, CrmDimensionValue } from '../types';

/** Hoists `metricas` to the top level so charts and tables read one flat row. */
function flatten(row: CrmDimensionRow): CrmDimensionValue {
  return {
    ...(row.metricas ?? {}),
    valor: row.valor,
    efectividad: row.efectividad ?? row.metricas?.efectividad ?? [],
  };
}

/** Flat rows of one dimension (`sucursal`, `campana`, `vendedor`) out of a mixed list. */
export function selectCrmDimension(
  rows: CrmDimensionRow[],
  dimension: string,
): CrmDimensionValue[] {
  return rows.filter((row) => row.dimension === dimension).map(flatten);
}
