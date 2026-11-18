/** Tipos del registro de auditoría (`/auditoria/`). */

export type AuditResult = 'ok' | 'rechazado' | 'denegado' | 'limitado' | 'error';

/** Una fila del registro, sin su `detalle`. */
export interface AuditEntry {
  id: number;
  fecha: string;
  username: string;
  ip: string;
  modulo: string;
  modulo_display: string;
  accion: string;
  accion_display: string;
  resultado: AuditResult;
  resultado_display: string;
  estado_http: number | null;
  objeto: string;
  descripcion: string;
}

/** Un registro abierto: con lo enviado, y el antes y el después si los hay. */
export interface AuditEntryDetail extends AuditEntry {
  metodo: string;
  ruta: string;
  detalle: unknown;
}

export interface AuditFilters {
  desde: string;
  hasta: string;
  modulo: string;
  usuario: string;
  resultado: string;
  q: string;
}

export interface AuditLogPageProps {
  registros: AuditEntry[];
  /** Cuántos cumplen los filtros: puede ser más que los `limite` que se envían. */
  total: number;
  limite: number;
  filtros: AuditFilters;
  opciones: {
    modulos: { value: string; label: string }[];
    usuarios: string[];
    resultados: { value: string; label: string }[];
  };
}
