/** Tipos del registro de auditoría (`/auditoria/`). */

export type ResultadoAuditoria = 'ok' | 'rechazado' | 'denegado' | 'limitado' | 'error';

/** Una fila del registro, sin su `detalle`. */
export interface RegistroAuditoria {
  id: number;
  fecha: string;
  username: string;
  ip: string;
  modulo: string;
  modulo_display: string;
  accion: string;
  accion_display: string;
  resultado: ResultadoAuditoria;
  resultado_display: string;
  estado_http: number | null;
  objeto: string;
  descripcion: string;
}

/** Un registro abierto: con lo enviado, y el antes y el después si los hay. */
export interface RegistroAuditoriaDetalle extends RegistroAuditoria {
  metodo: string;
  ruta: string;
  detalle: unknown;
}

export interface FiltrosAuditoria {
  desde: string;
  hasta: string;
  modulo: string;
  usuario: string;
  resultado: string;
  q: string;
}

export interface AuditoriaRegistroProps {
  registros: RegistroAuditoria[];
  /** Cuántos cumplen los filtros: puede ser más que los `limite` que se envían. */
  total: number;
  limite: number;
  filtros: FiltrosAuditoria;
  opciones: {
    modulos: { value: string; label: string }[];
    usuarios: string[];
    resultados: { value: string; label: string }[];
  };
}
