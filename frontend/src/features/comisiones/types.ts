/** Tipos del módulo de Comisiones: lo que mandan `services/comisiones/views.py` y `analytics/`. */

import type { ParametrosPago, RolVentas } from '@/shared/types/subscriptions';

export type { RolVentas };

/** `diferida`: instalada en los días promocionales del mes sin adelantar el pago; cuenta en el periodo siguiente. */
export type Clasificacion = 'valida' | 'no_pagada' | 'revision' | 'excluida' | 'diferida';

/**
 * En qué parte de la ventana se instaló (`reglas.tramo`): los días promocionales
 * del mes anterior, del día 1 a los del mes, los del mes, o fuera de la ventana
 * (agregada a mano).
 */
export type TramoVenta = 'promo_anterior' | 'regular' | 'promo' | 'manual';

/**
 * Las decisiones a mano: `contar`/`no_contar` resuelven una venta en revisión;
 * `ya_pagada`/`normal`, en el primer periodo, si lo instalado en los días
 * promocionales del mes anterior ya se cobró en él.
 */
export type DecisionRevision = 'contar' | 'no_contar' | 'ya_pagada' | 'normal';

/** Un periodo creado, con su ventana de instalación. */
export interface PeriodoComision {
  periodo: string;
  estado: 'borrador' | 'cerrado';
  inicio: string;
  /** Último día de instalación que puede contar: el fin del mes. */
  fin: string;
  /** Desde aquí, lo instalado solo cuenta si se adelantó el pago hasta `corte_adelantos`. */
  inicio_promo: string;
  corte_adelantos: string;
}

/** Un bono de un pago, con el concepto que lo explica. */
export interface BonoPago {
  concepto: string;
  monto: number;
  /** Solo en el bono por unidad del jefe de UN. */
  unidad_id?: number;
}

/**
 * El desglose de un pago (`pagos.Pago.detalle`): lo que aplica a su rol.
 * Asesor y telemarketing: `tramo_desde`, `monto_por_venta`, `ventas_pagadas`, `bono_desde`. Coord. de UN:
 * `crecimiento_pct`, `monto_por_venta_equipo` y `churn_bruto_pct`. Supervisor: `asesores`.
 */
export interface DetallePago {
  tramo_desde?: number;
  monto_por_venta?: number;
  ventas_pagadas?: number;
  bono_desde?: number | null;
  crecimiento_pct?: number | null;
  monto_por_venta_equipo?: number;
  churn_bruto_pct?: number | null;
  pct_empresa?: number | null;
  asesores?: number;
  /** `site` o `unidad`: de dónde sale el % que multiplica. */
  factor?: 'site' | 'unidad';
  bonos: BonoPago[];
}

/** Lo que cobra una persona en un equipo en el periodo (`pagos.Pago` más su ficha). */
export interface PagoComision {
  persona_id: number;
  nombre: string;
  medio: string;
  /** El slug del equipo y su nombre; el rol que cumple en él. */
  equipo: string;
  equipo_nombre: string;
  rol: RolVentas;
  site: string;
  ventas_propias: number;
  ventas_equipo: number;
  ventas_pyme: number;
  monto_pyme: number;
  pyme_sin_porcentaje: number;
  monto_propias: number;
  monto_equipo: number;
  bruto: number;
  /** % de cumplimiento aplicado (tope 100); nulo en quien no lo usa. */
  factor_pct: number | null;
  /** Los bonos sumados al neto; cada uno con su concepto en `detalle.bonos`. */
  bono: number;
  neto: number;
  /** El que se aplica: el escrito a mano si lo tiene, si no el calculado; nulo es "sin definir". */
  cumplimiento_pct: number | null;
  /** El escrito a mano solo para esta persona; nulo es que vale el calculado. */
  cumplimiento_propio: number | null;
  /** De dónde sale el % aplicado (`calculo._indicadores`). */
  cumplimiento?: FactorIndicador | null;
  crecimiento_pct: number | null;
  crecimiento_calculado: number | null;
  crecimiento_fuente: 'manual' | 'unidades de negocio' | null;
  unidades: string[];
  detalle: DetallePago;
  avisos: string[];
}

/** Un site o una unidad y su % Ventas del mes; `pct` nulo si el mes no está analizado o no tiene meta. */
export interface FuenteCumplimiento {
  nombre: string;
  pct: number | null;
}

/**
 * El % de cumplimiento que multiplica el pago de una persona y de dónde sale.
 *
 * Manda el escrito a mano; si no, el calculado: el % Ventas de su site, o el
 * promedio simple de las unidades de negocio que le tocan (`fuentes`). Sin
 * ninguno queda sin definir, y el cierre lo pide.
 */
export interface FactorIndicador {
  persona_id: number;
  equipo: string;
  rol: RolVentas;
  nombre: string;
  factor: 'site' | 'unidad';
  fuentes: FuenteCumplimiento[];
  calculado: number | null;
  manual: number | null;
  valor: number | null;
  fuente: 'manual' | 'site' | 'unidad' | null;
  /** Coordinadora: sus ventas como «Medio» contra su objetivo de ventas. Solo informa. */
  personal: { ventas: number; objetivo: number | null; pct: number | null } | null;
}

/** El crecimiento y el churn bruto de la unidad de un coordinador de UN. */
export interface CrecimientoIndicador {
  persona_id: number;
  equipo: string;
  rol: RolVentas;
  nombre: string;
  unidades: string[];
  calculado: number | null;
  manual: number | null;
  valor: number | null;
  fuente: 'manual' | 'unidades de negocio' | null;
  churn_bruto: number | null;
}

/** Los indicadores del mes que condicionan el pago (`calculo._indicadores`). */
export interface IndicadoresInforme {
  /** Falso si el mes no está analizado: nada se calcula y todo cae a lo escrito. */
  analizado: boolean;
  factores: FactorIndicador[];
  crecimientos: CrecimientoIndicador[];
  /** El % de ingresos de cada unidad: lo que mide el bono del jefe de UN. */
  ingresos_unidad: { unidad_id: number; unidad: string; pct_ingresos: number | null; pct_ventas: number | null }[];
  /** Toda la empresa: el bono de la administradora. */
  empresa: { pct_ventas: number | null; pct_ingresos: number | null } | null;
}

/** Una venta candidata del periodo, clasificada y con sus personas. */
export interface VentaComision {
  orden: string;
  cliente: string;
  fecha_inicio: string;
  sucursal: string;
  zona: string;
  producto: string;
  pyme: boolean;
  precio: number;
  pct_pyme: number | null;
  estado: string;
  estado_factura: string;
  clasificacion: Clasificacion;
  motivo: string;
  /** Lo que dicen las facturas, sin la decisión manual: por qué fue a revisión. */
  motivo_analisis: string;
  decision: DecisionRevision | null;
  nota_revision: string;
  /** Falta en periodos cerrados antes de existir los días promocionales adelantados. */
  tramo?: TramoVenta;
  manual?: boolean;
  nota_manual?: string;
  /** Días promocionales del mes con la primera mensualidad pagada hasta el corte: cuenta en este periodo. */
  adelantada?: boolean;
  /**
   * Primer periodo, días promocionales del mes anterior: pagó la mensualidad antes
   * del corte de ese mes (pudo cobrarse allí), pagaría aquí y nadie confirmó todavía.
   */
  por_confirmar?: boolean;
  /**
   * Se ve en «Días promocionales del mes anterior»: por confirmar, ya confirmada
   * allí, o (con el anterior cerrado) cobrada en él. Lo que otra regla resolvió no.
   */
  revisar_promo?: boolean;
  /** Hoy es gratuita (archivada, tarifa «Gratis» o archivada en los logs): no paga comisión. */
  gratuita: boolean;
  /** Día en que se canceló, si hoy está «Cancelado» y los logs lo fechan; vacío si no. */
  cancelada_el: string;
  /** Cuántas facturas tiene la orden en el export de facturas. */
  facturas: number;
  /** La primera mensualidad: la que decide si se pagó. Vacíos si no tiene ninguna. */
  factura_numero: string;
  factura_fecha: string;
  factura_estado: string;
  factura_pago: string;
  factura_plan: string;
  /**
   * Hasta cuándo se sabe que estaba pagada: la «Fecha del último pago», si no la
   * «Última actualización el» y si no el «Creado el» (aproximado). Vacío sin pagar.
   */
  pago_fecha?: string;
  pago_fuente?: 'pago' | 'actualizacion' | 'creacion' | '';
  medio: string;
  medio_supervisor: string;
  vendedor: string;
  medio_id: number | null;
  supervisor_id: number | null;
  coord_oficina_id: number | null;
  /** El slug del equipo de la venta: el del `Medio`. Vacío si no se pudo saber. */
  equipo: string;
  /** Las unidades de negocio de la venta, por la cadena supervisor → su superior. */
  unidad_ids: number[];
  unidades: string[];
  /** Quien vendió es una coordinadora de oficina. */
  es_oficina: boolean;
  avisos: string[];
}

export interface InformeComision {
  periodo: string;
  inicio: string;
  fin: string;
  inicio_promo: string;
  /** Hasta qué día un pago adelantado de los días promocionales cuenta aquí. */
  corte_adelantos?: string;
  /** El corte del mes anterior: con él se sugiere qué se cobró ya allí. */
  corte_anterior?: string;
  /** El periodo del mes anterior; `estado` nulo si no existe (y entonces se confirma a mano). */
  anterior?: { periodo: string; estado: 'borrador' | 'cerrado' | null };
  /** Si el export de facturas trae «Fecha del último pago». */
  facturas_con_fecha_pago?: boolean;
  estado: 'borrador' | 'cerrado';
  /** Desde cuándo tiene sentido calcular: las primeras facturas ya deberían estar pagadas. */
  calculo_desde: string;
  antes_de_tiempo: boolean;
  /** Cuándo se cargó el export de facturas con que se clasificó (falta en periodos cerrados antes de existir). */
  facturas_importadas_el?: string;
  /**
   * La tasa en bolívares con que se paga: la de CONATEL del mes siguiente (`mes`),
   * la misma del reporte ETA. Nula si aún no se publicó o el servicio falló (`aviso`).
   */
  tasa_conatel: TasaBolivares & { mes: string; aviso: string };
  resumen: {
    candidatas: number;
    validas: number;
    no_pagadas: number;
    revision: number;
    excluidas: number;
    validas_pyme: number;
    /** Por facturar con la primera mensualidad pagada de otro plan: valen sin revisión. */
    validas_cambio_plan: number;
    validas_sin_medio: number;
    validas_sin_equipo?: number;
    /** Lo que sigue faltando en los periodos cerrados antes de los adelantos. */
    diferidas?: number;
    promo?: number;
    adelantadas?: number;
    promo_anterior?: number;
    promo_anterior_cobradas?: number;
    promo_por_confirmar?: number;
    promo_anterior_revisar?: number;
    manuales?: number;
    /** Lo que suman todos los bonos (incluido en `total`). */
    bonos?: number;
    total: number;
  };
  pagos: PagoComision[];
  /** Los indicadores del mes que condicionan el pago. */
  indicadores: IndicadoresInforme;
  /** Quién vendió con quién en las ventas válidas. */
  equipos: FilaEquipo[];
  /** Nombre y papeles (equipo, rol, superior, unidades, site) de cada id de `equipos` y de `pagos`, cobre o no. */
  personas: Record<string, { nombre: string; papeles: PapelPersona[] }>;
  revision: VentaComision[];
  manuales?: VentaManual[];
  /** Lo que impide cerrar. Vacío: se puede cerrar. */
  pendientes_cierre: string[];
}

/** Una venta agregada a mano al periodo. */
export interface VentaManual {
  orden: string;
  nota: string;
  agregado_por: string;
  agregado_en: string;
  /** Nula si la orden ya no está en suscripciones. */
  venta: VentaComision | null;
}

/** El papel de una persona en un equipo, con lo que la nómina necesita para ordenarla. */
export interface PapelPersona {
  equipo: string;
  rol: RolVentas;
  /** La persona a la que responde un supervisor (coordinador o gerente de UN). */
  superior_id: number | null;
  unidades: string[];
  site: string;
}

/** Una combinación de equipo, oficina, supervisor y quien vendió, con sus ventas válidas. */
export interface FilaEquipo {
  equipo: string;
  coord_oficina_id: number | null;
  supervisor_id: number | null;
  medio_id: number | null;
  /** Válidas residenciales. */
  ventas: number;
  /** Válidas PYME. */
  pyme: number;
}

/** Una tasa del BCV en bolívares por dólar y de dónde salió. */
export interface TasaBolivares {
  tasa: number | null;
  fuente: string;
}

/** Lo que propone el formulario del periodo. */
export interface PropuestaPeriodo {
  periodo: string;
  inicio: string;
  /** Falso si el mes anterior tiene periodo: el inicio sale de él. */
  preguntar_inicio: boolean;
  inicio_promo: string;
  corte_adelantos: string;
}

export interface ComisionesInformeProps {
  periodo: string;
  periodos: PeriodoComision[];
  /** Nulo si el periodo todavía no existe (o si su cálculo falló: ver `error`). */
  informe: InformeComision | null;
  error: string | null;
  propuesta: PropuestaPeriodo;
  /** Las del cierre si el periodo está cerrado; si no, las vigentes, con las que se calculó. */
  condiciones: CondicionesComision;
  /** Los equipos y sus roles, para nombrar y ordenar la nómina. */
  equipos: { slug: string; nombre: string; roles: { rol: RolVentas; etiqueta: string }[] }[];
  puedeGestionar: boolean;
  /** `can_reopen_comisiones`: reabrir va aparte de gestionar. */
  puedeReabrir: boolean;
  /** `can_delete_comisiones`: borrar un informe en borrador, con su propio permiso. */
  puedeBorrar: boolean;
  /** Las versiones archivadas de los cierres anteriores del periodo, la más reciente primero. */
  archivos: CierreArchivado[];
}

/** Un cierre guardado al reabrir el periodo (sin la copia, que se pide al descargarlo). */
export interface CierreArchivado {
  id: number;
  version: number;
  cerrado_por: string;
  cerrado_en: string | null;
  reabierto_por: string;
  reabierto_en: string;
  motivo: string;
  total_neto: number;
  pagos: number;
  ventas: number;
}

/** La copia completa de un cierre archivado: lo que había congelado al reabrirlo. */
export interface CopiaCierre {
  periodo: { periodo: string; tasa_conatel: string | null; cerrado_por: string | null; cerrado_en: string | null };
  condiciones: CondicionesComision;
  resumen: InformeComision;
  ventas: { orden: string; clasificacion: string; datos: VentaComision }[];
}

/**
 * Las condiciones con que se calcula: la ventana de pago y, por equipo y rol, los
 * valores de cada pieza (`catalogos.equipos`). Las de un cierre son la copia que se congeló.
 */
export interface CondicionesComision {
  dia_promocional: number;
  dias_espera: number;
  /** Día del mes siguiente hasta el que un pago adelantado cuenta en el periodo. */
  dia_corte: number;
  equipos?: Record<string, Record<string, ParametrosPago>>;
  /** El nombre de cada equipo por su slug. */
  nombres?: Record<string, string>;
}

export interface PlanPyme {
  id: number;
  nombre: string;
  tarifa: string;
  precio: number;
  comision_pyme_pct: number | null;
}

/** La última vez que se guardaron las condiciones; nulos si nunca se guardaron desde la página. */
export interface ActualizacionCondiciones {
  en: string | null;
  por: string | null;
}

export interface ComisionesCondicionesProps {
  condiciones: CondicionesComision;
  actualizacion: ActualizacionCondiciones;
  planesPyme: PlanPyme[];
  puedeEditarPlanes: boolean;
}
