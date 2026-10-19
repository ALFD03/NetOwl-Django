/**
 * El libro de Excel del informe de comisiones, pensado para quien paga.
 *
 * - **Resumen**: el total en $ y en Bs, la tasa, y lo que se paga por cargo,
 *   por unidad de negocio y por oficina.
 * - Una hoja por cargo, ordenada como la nómina: los asesores y los
 *   supervisores agrupados por unidad (y los asesores por supervisor), con
 *   subtotales. Cada persona sale una vez, así que las hojas suman el total.
 * - **Ventas**: el detalle venta a venta, para quien quiera comprobar.
 *
 * Los bolívares de cada fila se redondean a céntimos y los totales son la suma
 * de esas filas, como en la página: cada columna cuadra al céntimo.
 */

import {
  downloadStyledWorkbook, type ExcelCell, type ExcelCellObject, type ExcelRow, type ExcelStyledSheet,
} from '@/shared/lib/excel';
import { CLASIFICACION, aBs, formatoFecha, formatoMes, totalBs } from './formato';
import {
  armarNomina, motivoRecorte, rangoTramo, tramoAsesor, ventasPagadas, ventasValidadas, type GrupoSupervisor, type Nomina,
} from './nomina';
import type { CargoVentas, CondicionesComision, InformeComision, PagoComision, VentaComision } from '../types';

// --- Estilo -------------------------------------------------------------------------

const COLOR = {
  tinta: '#0F172A',
  suave: '#64748B',
  linea: '#CBD5E1',
  cabecera: '#1E293B',
  unidad: '#EDE9FE',
  unidadTexto: '#4C1D95',
  oficina: '#E0F2FE',
  oficinaTexto: '#075985',
  supervisor: '#F1F5F9',
  cebra: '#F8FAFC',
  total: '#E2E8F0',
  ambar: '#B45309',
  verde: '#047857',
};
const USD = '"$"#,##0.00';
const BS = '"Bs "#,##0.00';
const ENTERO = '#,##0';
const PCT = '0.00"%"';
const TASA = '#,##0.0000';

type Valor = string | number | null;
// `format` solo lo admiten las celdas numéricas: `celda` lo quita de las demás.
type Estilo = Omit<ExcelCellObject, 'value' | 'type'>;

const celda = (valor: Valor, estilo: Estilo = {}): ExcelCell => {
  if (typeof valor === 'number' && Number.isFinite(valor)) return { type: Number, value: valor, ...estilo };
  // Un formato numérico en una celda de texto o vacía rompe el libro entero.
  const resto = { ...estilo };
  delete resto.format;
  return { type: String, value: valor === null ? undefined : String(valor), ...resto };
};

/** Una fila que ocupa todo el ancho con un solo texto. */
const ancha = (texto: string, columnas: number, estilo: Estilo = {}): ExcelRow => [
  celda(texto, { columnSpan: columnas, ...estilo }),
  ...Array<null>(columnas - 1).fill(null),
];

const vacia = (): ExcelRow => [];

const banda = (texto: string, columnas: number, fondo: string, color: string): ExcelRow =>
  ancha(texto, columnas, {
    fontWeight: 'bold', backgroundColor: fondo, textColor: color, height: 22, alignVertical: 'center', indent: 1,
    topBorderColor: COLOR.linea, topBorderStyle: 'thin',
  });

/** Una columna de una tabla: su cabecera, su valor y cómo se suma en los totales. */
interface Col<T> {
  titulo: string;
  ancho: number;
  valor: (fila: T) => Valor;
  formato?: string;
  /** Color del texto de una fila: el ámbar de lo que se paga de menos. */
  color?: (fila: T) => string | undefined;
  /** Cómo se totaliza; sin él, la celda del total queda vacía. */
  total?: (filas: T[]) => number | null;
}

const cabecera = <T>(cols: Col<T>[]): ExcelRow =>
  cols.map((c, i) => celda(c.titulo, {
    fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: COLOR.cabecera, wrap: true, height: 30,
    align: i === 0 ? 'left' : 'center', alignVertical: 'center',
  }));

const filaDe = <T>(cols: Col<T>[], fila: T, n: number, apagada = false, sangria = 0): ExcelRow =>
  cols.map((c, i) => celda(c.valor(fila), {
    format: c.formato,
    textColor: apagada ? COLOR.suave : c.color?.(fila) ?? COLOR.tinta,
    backgroundColor: n % 2 ? COLOR.cebra : undefined,
    // La última columna es texto libre (observaciones, avisos): una sola línea
    // que sigue hacia la derecha, para que todas las filas tengan el mismo alto.
    indent: i === 0 && sangria ? sangria : i === cols.length - 1 ? 1 : undefined,
    height: 18,
    alignVertical: 'center',
    bottomBorderColor: COLOR.total,
    bottomBorderStyle: 'thin',
  }));

const totalDe = <T>(cols: Col<T>[], filas: T[], etiqueta: string, fuerte = false): ExcelRow =>
  cols.map((c, i) => celda(i === 0 ? etiqueta : c.total?.(filas) ?? null, {
    format: c.formato,
    fontWeight: 'bold',
    backgroundColor: fuerte ? COLOR.total : COLOR.supervisor,
    topBorderColor: COLOR.suave,
    topBorderStyle: fuerte ? 'medium' : 'thin',
    height: fuerte ? 22 : 18,
    alignVertical: 'center',
  }));

const sumar = (filas: PagoComision[], f: (p: PagoComision) => number) => filas.reduce((t, p) => t + f(p), 0);
const sumaUsd = (filas: PagoComision[]) => Math.round(sumar(filas, (p) => p.neto) * 100) / 100;

// --- Columnas comunes -----------------------------------------------------------------

const pagoColumnas = (tasa: number | null): Col<PagoComision>[] => [
  { titulo: 'A pagar $', ancho: 14, valor: (p) => p.neto, formato: USD, total: sumaUsd },
  { titulo: 'A pagar Bs\n(tasa CONATEL)', ancho: 18, valor: (p) => aBs(p.neto, tasa), formato: BS, total: (f) => totalBs(f.map((p) => p.neto), tasa) },
];

const ventasColumnas: Col<PagoComision>[] = [
  { titulo: 'Ventas validadas', ancho: 11, valor: ventasValidadas, formato: ENTERO, total: (f) => sumar(f, ventasValidadas) },
  {
    titulo: 'Ventas pagadas',
    ancho: 11,
    valor: ventasPagadas,
    formato: ENTERO,
    color: (p) => (ventasPagadas(p) < ventasValidadas(p) ? COLOR.ambar : undefined),
    total: (f) => sumar(f, ventasPagadas),
  },
];

/** Lo que explica una fila: el recorte, lo que vendió en otro equipo y los avisos. */
const observaciones = (nomina: Nomina, condiciones: CondicionesComision) => (p: PagoComision): string => {
  const fuera = nomina.fuera.get(p.persona_id);
  return [
    motivoRecorte(p, condiciones),
    fuera ? `+${fuera.ventas} ventas con ${fuera.donde} (incluidas)` : null,
    ...p.avisos,
  ].filter(Boolean).join(' · ');
};

/**
 * Los equipos en el orden de la nómina: las unidades, las oficinas con su
 * equipo sin unidad y, al final, lo que no tiene ninguna de las dos.
 */
function equipos(nomina: Nomina): { titulo: string; grupos: GrupoSupervisor[] }[] {
  const aparte = nomina.unidades.filter((u) => u.id === null);
  return [
    ...nomina.unidades.filter((u) => u.id !== null).map((u) => ({ titulo: `Unidad de negocio · ${u.nombre}`, grupos: u.grupos })),
    ...nomina.oficinas.map((o) => ({ titulo: `Coordinación de oficina · ${o.pago.nombre}`, grupos: o.grupos })),
    ...aparte.map((u) => ({ titulo: u.nombre, grupos: u.grupos })),
  ];
}

// --- Hojas ----------------------------------------------------------------------------

function hojaResumen(informe: InformeComision, nomina: Nomina, tasa: number | null, etiquetaCargo: (c: CargoVentas) => string): ExcelStyledSheet {
  const N = 7;
  const pagos = informe.pagos;
  const etiqueta = { fontWeight: 'bold' as const, textColor: COLOR.tinta, height: 20, alignVertical: 'center' as const };
  const dato = (valor: Valor, formato?: string, color = COLOR.tinta): ExcelCell =>
    celda(valor, { format: formato, textColor: color, fontWeight: 'bold', align: 'right', alignVertical: 'center' });

  const filas: ExcelRow[] = [
    ancha(`Comisiones de ${formatoMes(informe.periodo)}`, N, { fontSize: 16, fontWeight: 'bold', height: 28, textColor: COLOR.tinta }),
    ancha(
      `Periodo ${informe.periodo} · instalaciones del ${formatoFecha(informe.inicio)} al ${formatoFecha(informe.fin)} · ${informe.estado === 'cerrado' ? 'cerrado' : 'borrador, puede cambiar'}`,
      N,
      { textColor: COLOR.suave },
    ),
    vacia(),
    banda('Total a pagar', N, COLOR.cabecera, '#FFFFFF'),
    [celda('Total en dólares', etiqueta), dato(sumaUsd(pagos), USD)],
    [celda('Total en bolívares', etiqueta), dato(totalBs(pagos.map((p) => p.neto), tasa), BS, COLOR.verde)],
    [
      celda(`Tasa CONATEL ${informe.tasa_conatel ? formatoMes(informe.tasa_conatel.mes) : ''}`, etiqueta),
      dato(tasa, TASA),
      celda(tasa !== null ? informe.tasa_conatel.fuente : informe.tasa_conatel?.aviso || 'Sin tasa: los bolívares quedan vacíos', {
        textColor: COLOR.suave, columnSpan: 5,
      }),
      null, null, null, null,
    ],
    [celda('Personas que cobran', etiqueta), dato(pagos.filter((p) => p.neto > 0).length, ENTERO)],
    [celda('Ventas validadas', etiqueta), dato(informe.resumen.validas, ENTERO)],
    [
      celda('Cumplimiento general', etiqueta),
      dato(informe.cumplimiento_general_pct, PCT),
      celda(informe.cumplimiento_general_pct === null ? 'sin definir' : 'para quien no tiene uno propio', { textColor: COLOR.suave, columnSpan: 5 }),
      null, null, null, null,
    ],
    vacia(),
  ];

  // Por cargo
  const porCargo: Col<{ cargo: CargoVentas; personas: PagoComision[] }>[] = [
    { titulo: 'Cargo', ancho: 34, valor: (f) => etiquetaCargo(f.cargo) },
    { titulo: 'Personas', ancho: 14, valor: (f) => f.personas.length, formato: ENTERO, total: (fs) => sumar(fs.flatMap((f) => f.personas), () => 1) },
    { titulo: 'Cobran', ancho: 12, valor: (f) => f.personas.filter((p) => p.neto > 0).length, formato: ENTERO, total: (fs) => fs.flatMap((f) => f.personas).filter((p) => p.neto > 0).length },
    { titulo: 'Ventas validadas', ancho: 14, valor: (f) => sumar(f.personas, ventasValidadas), formato: ENTERO },
    { titulo: 'Ventas pagadas', ancho: 14, valor: (f) => sumar(f.personas, ventasPagadas), formato: ENTERO },
    { titulo: 'A pagar $', ancho: 18, valor: (f) => sumaUsd(f.personas), formato: USD, total: (fs) => sumaUsd(fs.flatMap((f) => f.personas)) },
    { titulo: 'A pagar Bs', ancho: 22, valor: (f) => totalBs(f.personas.map((p) => p.neto), tasa), formato: BS, total: (fs) => totalBs(fs.flatMap((f) => f.personas).map((p) => p.neto), tasa) },
  ];
  const cargos = (['coord_un', 'coord_oficina', 'supervisor', 'asesor'] as const).map((cargo) => ({ cargo, personas: pagos.filter((p) => p.cargo === cargo) }));
  filas.push(banda('Por cargo', N, COLOR.supervisor, COLOR.tinta), cabecera(porCargo));
  cargos.forEach((f, i) => filas.push(filaDe(porCargo, f, i)));
  filas.push(totalDe(porCargo, cargos, 'Total', true), vacia());

  // Por unidad de negocio, cada oficina con su equipo sin unidad, y lo que no
  // tiene ninguna de las dos: entre todos, el total.
  type Bloque = { nombre: string; crecimiento: number | null; personas: PagoComision[]; ventas: number | null };
  const porUnidad: Col<Bloque>[] = [
    { titulo: 'Unidad de negocio u oficina', ancho: 34, valor: (b) => b.nombre },
    { titulo: 'Crecimiento', ancho: 14, valor: (b) => b.crecimiento, formato: PCT },
    { titulo: 'Personas', ancho: 12, valor: (b) => b.personas.length, formato: ENTERO, total: (bs) => sumar(bs.flatMap((b) => b.personas), () => 1) },
    { titulo: 'Ventas de la unidad', ancho: 14, valor: (b) => b.ventas, formato: ENTERO },
    { titulo: '', ancho: 14, valor: () => null },
    { titulo: 'A pagar $', ancho: 18, valor: (b) => sumaUsd(b.personas), formato: USD, total: (bs) => sumaUsd(bs.flatMap((b) => b.personas)) },
    { titulo: 'A pagar Bs', ancho: 22, valor: (b) => totalBs(b.personas.map((p) => p.neto), tasa), formato: BS, total: (bs) => totalBs(bs.flatMap((b) => b.personas).map((p) => p.neto), tasa) },
  ];
  const deUnidad = (u: Nomina['unidades'][number]): Bloque => ({
    nombre: u.nombre, crecimiento: u.coordinador?.crecimiento_pct ?? null, personas: u.personas, ventas: u.ventas,
  });
  const bloques: Bloque[] = [
    ...nomina.unidades.filter((u) => u.id !== null).map(deUnidad),
    ...nomina.oficinas.map((o) => ({ nombre: `Oficina · ${o.pago.nombre}`, crecimiento: null, personas: o.personas, ventas: null })),
    ...nomina.unidades.filter((u) => u.id === null).map(deUnidad),
  ];
  filas.push(banda('Por unidad de negocio', N, COLOR.unidad, COLOR.unidadTexto), cabecera(porUnidad));
  bloques.forEach((b, i) => filas.push(filaDe(porUnidad, b, i)));
  filas.push(totalDe(porUnidad, bloques, 'Total a pagar', true), vacia());

  // Las oficinas
  const porOficina: Col<PagoComision>[] = [
    { titulo: 'Coordinación de oficina', ancho: 34, valor: (p) => p.nombre },
    { titulo: 'Cumplimiento', ancho: 14, valor: (p) => p.factor_pct, formato: PCT },
    { titulo: '', ancho: 12, valor: () => null },
    ...ventasColumnas,
    ...pagoColumnas(tasa),
  ];
  const oficinas = nomina.oficinas.map((o) => o.pago);
  if (oficinas.length) {
    filas.push(banda('Coordinación de oficinas', N, COLOR.oficina, COLOR.oficinaTexto), cabecera(porOficina));
    oficinas.forEach((p, i) => filas.push(filaDe(porOficina, p, i, p.neto === 0)));
    filas.push(totalDe(porOficina, oficinas, 'Total oficinas', true));
  }

  return { sheetName: 'Resumen', rows: filas, widths: porCargo.map((c) => c.ancho) };
}

function hojaAsesores(nomina: Nomina, condiciones: CondicionesComision, tasa: number | null): ExcelStyledSheet {
  const tramos = condiciones.tramos_asesor;
  const obs = observaciones(nomina, condiciones);
  const cols: Col<PagoComision>[] = [
    { titulo: 'Asesor', ancho: 34, valor: (p) => p.nombre },
    { titulo: 'Ventas resid.', ancho: 10, valor: (p) => p.ventas_propias, formato: ENTERO, total: (f) => sumar(f, (p) => p.ventas_propias) },
    { titulo: 'PYME', ancho: 8, valor: (p) => p.ventas_pyme || null, formato: ENTERO, total: (f) => sumar(f, (p) => p.ventas_pyme) || null },
    ...ventasColumnas,
    {
      titulo: 'Tramo',
      ancho: 11,
      valor: (p) => {
        const t = tramoAsesor(p.ventas_propias, tramos);
        return t.monto > 0 ? rangoTramo(t, tramos) : 'Sin tramo';
      },
    },
    { titulo: '$ por venta', ancho: 11, valor: (p) => p.detalle.monto_por_venta ?? null, formato: USD },
    ...pagoColumnas(tasa),
    { titulo: 'Observaciones', ancho: 52, valor: obs },
  ];
  const N = cols.length;
  const filas: ExcelRow[] = [cabecera(cols)];
  const todos: PagoComision[] = [];

  for (const e of equipos(nomina)) {
    const asesores = e.grupos.flatMap((g) => g.asesores);
    if (!asesores.length) continue;
    filas.push(banda(e.titulo, N, COLOR.unidad, COLOR.unidadTexto));
    for (const g of e.grupos) {
      if (!g.asesores.length) continue;
      const quien = g.pago ? `Supervisor · ${g.nombre}` : g.id === null ? 'Sin supervisor en la venta' : `Supervisa ${g.nombre}`;
      filas.push(ancha(quien, N, { fontWeight: 'bold', backgroundColor: COLOR.supervisor, textColor: COLOR.tinta, indent: 1, height: 20, alignVertical: 'center' }));
      g.asesores.forEach((p, i) => filas.push(filaDe(cols, p, i, p.neto === 0, 2)));
    }
    filas.push(totalDe(cols, asesores, `Total ${e.titulo.replace(/^.* · /, '')}`), vacia());
    todos.push(...asesores);
  }
  filas.push(totalDe(cols, todos, 'Total asesores', true));
  return { sheetName: 'Asesores', rows: filas, widths: cols.map((c) => c.ancho), stickyRows: 1 };
}

function hojaSupervisores(nomina: Nomina, condiciones: CondicionesComision, tasa: number | null): ExcelStyledSheet {
  const obs = observaciones(nomina, condiciones);
  const asesoresDe = new Map(equipos(nomina).flatMap((e) => e.grupos).filter((g) => g.pago).map((g) => [g.pago!.persona_id, g.asesores.length]));
  const cols: Col<PagoComision>[] = [
    { titulo: 'Supervisor', ancho: 34, valor: (p) => p.nombre },
    { titulo: 'Asesores', ancho: 9, valor: (p) => asesoresDe.get(p.persona_id) ?? 0, formato: ENTERO },
    { titulo: 'Ventas propias', ancho: 10, valor: (p) => p.ventas_propias, formato: ENTERO, total: (f) => sumar(f, (p) => p.ventas_propias) },
    { titulo: 'Ventas de equipo', ancho: 10, valor: (p) => p.ventas_equipo, formato: ENTERO, total: (f) => sumar(f, (p) => p.ventas_equipo) },
    ...ventasColumnas,
    { titulo: 'Antes del %', ancho: 13, valor: (p) => p.bruto, formato: USD, total: (f) => Math.round(sumar(f, (p) => p.bruto) * 100) / 100 },
    {
      titulo: 'Cumplimiento',
      ancho: 13,
      valor: (p) => p.factor_pct,
      formato: PCT,
      color: (p) => (p.factor_pct !== null && p.factor_pct < 100 ? COLOR.ambar : undefined),
    },
    { titulo: 'Origen', ancho: 10, valor: (p) => (p.cumplimiento_propio === null ? 'general' : 'propio') },
    ...pagoColumnas(tasa),
    { titulo: 'Observaciones', ancho: 44, valor: obs },
  ];
  const N = cols.length;
  const filas: ExcelRow[] = [cabecera(cols)];
  const todos: PagoComision[] = [];
  for (const e of equipos(nomina)) {
    const sup = e.grupos.flatMap((g) => (g.pago ? [g.pago] : []));
    if (!sup.length) continue;
    filas.push(banda(e.titulo, N, COLOR.unidad, COLOR.unidadTexto));
    sup.forEach((p, i) => filas.push(filaDe(cols, p, i, p.neto === 0, 1)));
    filas.push(totalDe(cols, sup, `Total ${e.titulo.replace(/^.* · /, '')}`), vacia());
    todos.push(...sup);
  }
  filas.push(totalDe(cols, todos, 'Total supervisores', true));
  return { sheetName: 'Supervisores', rows: filas, widths: cols.map((c) => c.ancho), stickyRows: 1 };
}

function hojaCoordinadoresUn(nomina: Nomina, condiciones: CondicionesComision, tasa: number | null): ExcelStyledSheet {
  const obs = observaciones(nomina, condiciones);
  const cols: Col<PagoComision>[] = [
    { titulo: 'Coordinador de UN', ancho: 34, valor: (p) => p.nombre },
    { titulo: 'Ventas propias', ancho: 10, valor: (p) => p.ventas_propias, formato: ENTERO, total: (f) => sumar(f, (p) => p.ventas_propias) },
    { titulo: 'Ventas de equipo', ancho: 10, valor: (p) => p.ventas_equipo, formato: ENTERO, total: (f) => sumar(f, (p) => p.ventas_equipo) },
    ...ventasColumnas,
    { titulo: 'Crecimiento', ancho: 13, valor: (p) => p.crecimiento_pct, formato: PCT },
    { titulo: 'Origen', ancho: 14, valor: (p) => (p.crecimiento_fuente === 'manual' ? 'a mano' : p.crecimiento_fuente === null ? 'desconocido' : 'Unidades de negocio') },
    { titulo: '$ por venta de equipo', ancho: 13, valor: (p) => p.detalle.monto_por_venta_equipo ?? null, formato: USD },
    ...pagoColumnas(tasa),
    { titulo: 'Observaciones', ancho: 44, valor: obs },
  ];
  const coords = nomina.unidades.flatMap((u) => (u.coordinador ? [u.coordinador] : []));
  return {
    sheetName: 'Coord. de UN',
    rows: [cabecera(cols), ...coords.map((p, i) => filaDe(cols, p, i, p.neto === 0)), totalDe(cols, coords, 'Total coordinadores de UN', true)],
    widths: cols.map((c) => c.ancho),
    stickyRows: 1,
  };
}

function hojaOficinas(nomina: Nomina, condiciones: CondicionesComision, tasa: number | null): ExcelStyledSheet {
  const obs = observaciones(nomina, condiciones);
  const comparte = new Map(nomina.oficinas.map((o) => [o.pago.persona_id, o.unidades.map((u) => `${u.nombre} (${u.ventas})`).join(', ')]));
  const cols: Col<PagoComision>[] = [
    { titulo: 'Coordinación de oficina', ancho: 34, valor: (p) => p.nombre },
    { titulo: 'Ventas propias', ancho: 10, valor: (p) => p.ventas_propias, formato: ENTERO, total: (f) => sumar(f, (p) => p.ventas_propias) },
    { titulo: 'Con su Vendedor', ancho: 10, valor: (p) => p.ventas_equipo, formato: ENTERO, total: (f) => sumar(f, (p) => p.ventas_equipo) },
    ...ventasColumnas,
    { titulo: 'Antes del %', ancho: 13, valor: (p) => p.bruto, formato: USD, total: (f) => Math.round(sumar(f, (p) => p.bruto) * 100) / 100 },
    {
      titulo: 'Cumplimiento',
      ancho: 13,
      valor: (p) => p.factor_pct,
      formato: PCT,
      color: (p) => (p.factor_pct !== null && p.factor_pct < 100 ? COLOR.ambar : undefined),
    },
    { titulo: 'Origen', ancho: 10, valor: (p) => (p.cumplimiento_propio === null ? 'general' : 'propio') },
    ...pagoColumnas(tasa),
    { titulo: 'Comparte ventas con', ancho: 40, valor: (p) => comparte.get(p.persona_id) ?? '' },
    { titulo: 'Observaciones', ancho: 40, valor: obs },
  ];
  const oficinas = nomina.oficinas.map((o) => o.pago);
  return {
    sheetName: 'Oficinas',
    rows: [cabecera(cols), ...oficinas.map((p, i) => filaDe(cols, p, i, p.neto === 0)), totalDe(cols, oficinas, 'Total oficinas', true)],
    widths: cols.map((c) => c.ancho),
    stickyRows: 1,
  };
}

function hojaVentas(ventas: VentaComision[]): ExcelStyledSheet {
  const cols: Col<VentaComision>[] = [
    { titulo: 'Orden', ancho: 16, valor: (v) => v.orden },
    { titulo: 'Cliente', ancho: 30, valor: (v) => v.cliente },
    { titulo: 'Instalada', ancho: 12, valor: (v) => formatoFecha(v.fecha_inicio) },
    { titulo: 'Sucursal', ancho: 14, valor: (v) => v.sucursal },
    { titulo: 'Zona', ancho: 18, valor: (v) => v.zona },
    { titulo: 'Plan', ancho: 28, valor: (v) => v.producto },
    { titulo: 'Tipo', ancho: 12, valor: (v) => (v.pyme ? 'PYME' : 'Residencial') },
    { titulo: 'Precio', ancho: 11, valor: (v) => v.precio, formato: USD },
    { titulo: 'Estado actual', ancho: 14, valor: (v) => v.estado },
    { titulo: 'Cancelada el', ancho: 12, valor: (v) => (v.cancelada_el ? formatoFecha(v.cancelada_el) : '') },
    { titulo: 'Estado de la factura', ancho: 20, valor: (v) => v.estado_factura },
    { titulo: 'Primera mensualidad', ancho: 18, valor: (v) => v.factura_numero ?? '' },
    { titulo: 'Creada el', ancho: 12, valor: (v) => (v.factura_fecha ? formatoFecha(v.factura_fecha) : '') },
    { titulo: 'Plan facturado', ancho: 28, valor: (v) => v.factura_plan ?? '' },
    { titulo: 'Estado', ancho: 12, valor: (v) => v.factura_estado ?? '' },
    { titulo: 'Estado del pago', ancho: 18, valor: (v) => v.factura_pago ?? '' },
    { titulo: 'Gratuita', ancho: 10, valor: (v) => (v.gratuita ? 'Sí' : '') },
    { titulo: 'Clasificación', ancho: 13, valor: (v) => CLASIFICACION[v.clasificacion].label },
    { titulo: 'Motivo', ancho: 40, valor: (v) => v.motivo },
    { titulo: 'Medio', ancho: 24, valor: (v) => v.medio },
    { titulo: 'Oportunidad/Administrador', ancho: 24, valor: (v) => v.medio_supervisor },
    { titulo: 'Vendedor', ancho: 30, valor: (v) => v.vendedor },
    { titulo: 'Coordinador de UN', ancho: 24, valor: (v) => v.coord_un },
    { titulo: 'Avisos', ancho: 50, valor: (v) => v.avisos.join(' · ') },
  ];
  return {
    sheetName: 'Ventas',
    rows: [cabecera(cols), ...ventas.map((v, i) => filaDe(cols, v, i, v.clasificacion !== 'valida'))],
    widths: cols.map((c) => c.ancho),
    stickyRows: 1,
  };
}

/** Descarga el libro del periodo: resumen, una hoja por cargo y el detalle de ventas. */
export async function exportarInforme(
  informe: InformeComision,
  ventas: VentaComision[],
  condiciones: CondicionesComision,
  tasa: number | null,
  etiquetaCargo: (cargo: CargoVentas) => string,
): Promise<void> {
  const nomina = armarNomina(informe);
  await downloadStyledWorkbook(
    [
      hojaResumen(informe, nomina, tasa, etiquetaCargo),
      hojaCoordinadoresUn(nomina, condiciones, tasa),
      hojaOficinas(nomina, condiciones, tasa),
      hojaSupervisores(nomina, condiciones, tasa),
      hojaAsesores(nomina, condiciones, tasa),
      hojaVentas(ventas),
    ],
    `Comisiones ${informe.periodo}`,
  );
}
