/**
 * El libro de Excel del informe de comisiones, pensado para quien paga.
 *
 * - **Resumen**: el total en $ y en Bs, la tasa, y lo que se paga por equipo y,
 *   dentro de cada uno, por rol.
 * - Una hoja por equipo de ventas, ordenada como la nómina: los roles de
 *   dirección, y los supervisores con sus asesores, con subtotales. Cada
 *   persona sale una vez por equipo, así que las hojas suman el total.
 * - **Ventas**: el detalle venta a venta, para quien quiera comprobar.
 *
 * Los bolívares de cada fila se redondean a céntimos y los totales son la suma
 * de esas filas, como en la página: cada columna cuadra al céntimo.
 */

import {
  downloadStyledWorkbook, type ExcelCell, type ExcelCellObject, type ExcelRow, type ExcelStyledSheet,
} from '@/shared/lib/excel';
import { CLASSIFICATION, TIER, aBs, formatDateValue, formatMonth, complianceSource, totalBs } from './format';
import {
  buildPayroll, paymentKey, trimReason, bonusNotes, paidSales, validatedSales,
  type PayrollTeam, type Payroll,
} from './payroll';
import type { CommissionConditions, CommissionReport, CommissionPayment, SalesRole, CommissionSale } from '../types';

// --- Estilo -------------------------------------------------------------------------

const COLOR = {
  ink: '#0F172A',
  soft: '#64748B',
  line: '#CBD5E1',
  header: '#1E293B',
  unidad: '#EDE9FE',
  unitText: '#4C1D95',
  oficina: '#E0F2FE',
  officeText: '#075985',
  supervisor: '#F1F5F9',
  zebra: '#F8FAFC',
  total: '#E2E8F0',
  amber: '#B45309',
  verde: '#047857',
};
const USD = '"$"#,##0.00';
const BS = '"Bs "#,##0.00';
const INTEGER = '#,##0';
const PCT = '0.00"%"';
const RATE = '#,##0.0000';

type Value = string | number | null;
// `format` solo lo admiten las celdas numéricas: `celda` lo quita de las demás.
type Style = Omit<ExcelCellObject, 'value' | 'type'>;

const cell = (value: Value, style: Style = {}): ExcelCell => {
  if (typeof value === 'number' && Number.isFinite(value)) return { type: Number, value, ...style };
  // Un formato numérico en una celda de texto o vacía rompe el libro entero.
  const rest = { ...style };
  delete rest.format;
  return { type: String, value: value === null ? undefined : String(value), ...rest };
};

/** Una fila que ocupa todo el ancho con un solo texto. */
const wide = (text: string, columns: number, style: Style = {}): ExcelRow => [
  cell(text, { columnSpan: columns, ...style }),
  ...Array<null>(columns - 1).fill(null),
];

const empty = (): ExcelRow => [];

const band = (text: string, columns: number, background: string, color: string): ExcelRow =>
  wide(text, columns, {
    fontWeight: 'bold', backgroundColor: background, textColor: color, height: 22, alignVertical: 'center', indent: 1,
    topBorderColor: COLOR.line, topBorderStyle: 'thin',
  });

/** Una columna de una tabla: su cabecera, su valor y cómo se suma en los totales. */
interface Col<T> {
  title: string;
  width: number;
  value: (row: T) => Value;
  format?: string;
  /** Color del texto de una fila: el ámbar de lo que se paga de menos. */
  color?: (row: T) => string | undefined;
  /** Cómo se totaliza; sin él, la celda del total queda vacía. */
  total?: (rows: T[]) => number | null;
}

const header = <T>(cols: Col<T>[]): ExcelRow =>
  cols.map((c, i) => cell(c.title, {
    fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: COLOR.header, wrap: true, height: 30,
    align: i === 0 ? 'left' : 'center', alignVertical: 'center',
  }));

const rowOf = <T>(cols: Col<T>[], row: T, n: number, muted = false, indent = 0): ExcelRow =>
  cols.map((c, i) => cell(c.value(row), {
    format: c.format,
    textColor: muted ? COLOR.soft : c.color?.(row) ?? COLOR.ink,
    backgroundColor: n % 2 ? COLOR.zebra : undefined,
    // La última columna es texto libre (observaciones, avisos): una sola línea
    // que sigue hacia la derecha, para que todas las filas tengan el mismo alto.
    indent: i === 0 && indent ? indent : i === cols.length - 1 ? 1 : undefined,
    height: 18,
    alignVertical: 'center',
    bottomBorderColor: COLOR.total,
    bottomBorderStyle: 'thin',
  }));

const totalOf = <T>(cols: Col<T>[], rows: T[], label: string, strong = false): ExcelRow =>
  cols.map((c, i) => cell(i === 0 ? label : c.total?.(rows) ?? null, {
    format: c.format,
    fontWeight: 'bold',
    backgroundColor: strong ? COLOR.total : COLOR.supervisor,
    topBorderColor: COLOR.soft,
    topBorderStyle: strong ? 'medium' : 'thin',
    height: strong ? 22 : 18,
    alignVertical: 'center',
  }));

const add = (rows: CommissionPayment[], f: (p: CommissionPayment) => number) => rows.reduce((t, p) => t + f(p), 0);
const usdTotal = (rows: CommissionPayment[]) => Math.round(add(rows, (p) => p.net) * 100) / 100;

// --- Columnas comunes -----------------------------------------------------------------

const paymentColumns = (rate: number | null): Col<CommissionPayment>[] => [
  { title: 'A pagar $', width: 14, value: (p) => p.net, format: USD, total: usdTotal },
  { title: 'A pagar Bs\n(tasa CONATEL)', width: 18, value: (p) => aBs(p.net, rate), format: BS, total: (f) => totalBs(f.map((p) => p.net), rate) },
];

const salesColumnList: Col<CommissionPayment>[] = [
  { title: 'Ventas validadas', width: 11, value: validatedSales, format: INTEGER, total: (f) => add(f, validatedSales) },
  {
    title: 'Ventas pagadas',
    width: 11,
    value: paidSales,
    format: INTEGER,
    color: (p) => (paidSales(p) < validatedSales(p) ? COLOR.amber : undefined),
    total: (f) => add(f, paidSales),
  },
];

/** Lo que explica una fila: el recorte, lo que vendió con otro supervisor, los bonos y los avisos. */
const notes = (payroll: Payroll, conditions: CommissionConditions) => (p: CommissionPayment): string => {
  const outside = payroll.outside.get(paymentKey(p));
  return [
    trimReason(p, conditions.teams?.[p.equipo]?.[p.role]?.tramos_asesor),
    outside ? `+${outside.sales} ventas con ${outside.where} (incluidas)` : null,
    ...bonusNotes(p),
    ...p.warnings,
  ].filter(Boolean).join(' · ');
};

// --- Hojas ----------------------------------------------------------------------------

function summarySheet(report: CommissionReport, payroll: Payroll, rate: number | null, titleLabel: (r: SalesRole) => string): ExcelStyledSheet {
  const N = 7;
  const payments = report.payments;
  const label = { fontWeight: 'bold' as const, textColor: COLOR.ink, height: 20, alignVertical: 'center' as const };
  const datum = (value: Value, numFormat?: string, color = COLOR.ink): ExcelCell =>
    cell(value, { format: numFormat, textColor: color, fontWeight: 'bold', align: 'right', alignVertical: 'center' });

  const rows: ExcelRow[] = [
    wide(`Comisiones de ${formatMonth(report.period)}`, N, { fontSize: 16, fontWeight: 'bold', height: 28, textColor: COLOR.ink }),
    wide(
      `Periodo ${report.period} · instalaciones del ${formatDateValue(report.start)} al ${formatDateValue(report.end)} · ${report.status === 'cerrado' ? 'cerrado' : 'borrador, puede cambiar'}`,
      N,
      { textColor: COLOR.soft },
    ),
    empty(),
    band('Total a pagar', N, COLOR.header, '#FFFFFF'),
    [cell('Total en dólares', label), datum(usdTotal(payments), USD)],
    [cell('Total en bolívares', label), datum(totalBs(payments.map((p) => p.net), rate), BS, COLOR.verde)],
    [
      cell(`Tasa CONATEL ${report.conatel_rate ? formatMonth(report.conatel_rate.month) : ''}`, label),
      datum(rate, RATE),
      cell(rate !== null ? report.conatel_rate.source : report.conatel_rate?.warning || 'Sin tasa: los bolívares quedan vacíos', {
        textColor: COLOR.soft, columnSpan: 5,
      }),
      null, null, null, null,
    ],
    [cell('Personas que cobran', label), datum(payments.filter((p) => p.net > 0).length, INTEGER)],
    ...(report.summary.bonuses ? [[cell('Bonos (incluidos)', label), datum(report.summary.bonuses, USD)]] : []),
    [cell('Ventas validadas', label), datum(report.summary.valid, INTEGER)],
    empty(),
  ];

  // Por equipo
  type Block = { name: string; people: CommissionPayment[]; sales: number | null };
  const byBlock: Col<Block>[] = [
    { title: 'Equipo / rol', width: 34, value: (b) => b.name },
    { title: 'Personas', width: 12, value: (b) => b.people.length, format: INTEGER, total: (bs) => add(bs.flatMap((b) => b.people), () => 1) },
    { title: 'Cobran', width: 12, value: (b) => b.people.filter((p) => p.net > 0).length, format: INTEGER, total: (bs) => bs.flatMap((b) => b.people).filter((p) => p.net > 0).length },
    { title: 'Ventas validadas', width: 14, value: (b) => b.sales ?? add(b.people, validatedSales), format: INTEGER },
    { title: 'Bonos $', width: 14, value: (b) => bonusTotal(b.people) || null, format: USD, total: (bs) => bonusTotal(bs.flatMap((b) => b.people)) || null },
    { title: 'A pagar $', width: 18, value: (b) => usdTotal(b.people), format: USD, total: (bs) => usdTotal(bs.flatMap((b) => b.people)) },
    { title: 'A pagar Bs', width: 22, value: (b) => totalBs(b.people.map((p) => p.net), rate), format: BS, total: (bs) => totalBs(bs.flatMap((b) => b.people).map((p) => p.net), rate) },
  ];
  const allRows: Block[] = [];
  for (const e of payroll.teams) {
    const ofTeam: Block = { name: e.name, people: e.people, sales: e.sales };
    const roles = [...new Set(e.people.map((p) => p.role))].map((role): Block => ({
      name: `    ${titleLabel(role)}`, people: e.people.filter((p) => p.role === role), sales: null,
    }));
    rows.push(band(e.name, N, COLOR.unidad, COLOR.unitText), header(byBlock));
    rows.push(rowOf(byBlock, ofTeam, 0, false));
    roles.forEach((b, i) => rows.push(rowOf(byBlock, b, i + 1, false)));
    rows.push(empty());
    allRows.push(ofTeam);
  }
  rows.push(totalOf(byBlock, allRows, 'Total a pagar', true));

  return { sheetName: 'Resumen', rows, widths: byBlock.map((c) => c.width) };
}

const bonusTotal = (rows: CommissionPayment[]) => Math.round(add(rows, (p) => p.bonus) * 100) / 100;

/** Una hoja por equipo: sus roles de dirección y, por supervisor, sus asesores; como la nómina. */
function teamSheet(e: PayrollTeam, payroll: Payroll, conditions: CommissionConditions, rate: number | null, titleLabel: (r: SalesRole) => string): ExcelStyledSheet {
  const obs = notes(payroll, conditions);
  const cols: Col<CommissionPayment>[] = [
    { title: 'Persona', width: 34, value: (p) => p.name },
    { title: 'Rol', width: 22, value: (p) => titleLabel(p.role) },
    { title: 'Ventas propias', width: 10, value: (p) => p.own_sales, format: INTEGER, total: (f) => add(f, (p) => p.own_sales) },
    { title: 'Ventas de equipo', width: 10, value: (p) => p.team_sales, format: INTEGER, total: (f) => add(f, (p) => p.team_sales) },
    { title: 'PYME', width: 8, value: (p) => p.sme_sales || null, format: INTEGER, total: (f) => add(f, (p) => p.sme_sales) || null },
    ...salesColumnList,
    { title: 'Antes del %', width: 13, value: (p) => p.gross, format: USD, total: (f) => Math.round(add(f, (p) => p.gross) * 100) / 100 },
    {
      title: 'Cumplimiento',
      width: 13,
      value: (p) => p.factor_pct,
      format: PCT,
      color: (p) => (p.factor_pct !== null && p.factor_pct < 100 ? COLOR.amber : undefined),
    },
    { title: 'Origen', width: 22, value: (p) => (p.detail.factor ? complianceSource(p) : '') },
    { title: 'Crecimiento', width: 12, value: (p) => p.growth_pct, format: PCT },
    { title: 'Bonos $', width: 12, value: (p) => p.bonus || null, format: USD, total: (f) => bonusTotal(f) || null },
    ...paymentColumns(rate),
    { title: 'Observaciones', width: 52, value: obs },
  ];
  const N = cols.length;
  const rows: ExcelRow[] = [header(cols)];

  for (const s of e.sections) {
    rows.push(band(s.role_label, N, COLOR.oficina, COLOR.officeText));
    s.payments.forEach((p, i) => rows.push(rowOf(cols, p, i, p.net === 0, 1)));
    rows.push(totalOf(cols, s.payments, `Total ${s.role_label.toLowerCase()}`), empty());
  }
  for (const g of e.groups) {
    const people = [...(g.payment ? [g.payment] : []), ...g.advisors];
    rows.push(band(g.payment ? `Supervisor · ${g.name}` : g.name, N, COLOR.unidad, COLOR.unitText));
    if (g.payment) rows.push(rowOf(cols, g.payment, 0, g.payment.net === 0, 1));
    g.advisors.forEach((p, i) => rows.push(rowOf(cols, p, i + 1, p.net === 0, 2)));
    rows.push(totalOf(cols, people, `Total ${g.name}`), empty());
  }
  rows.push(totalOf(cols, e.people, `Total ${e.name}`, true));
  // Los nombres de hoja de Excel: 31 caracteres como máximo, sin `/ \ ? * [ ]`.
  return { sheetName: e.name.replace(/[/\\?*[\]]/g, ' ').slice(0, 31), rows, widths: cols.map((c) => c.width), stickyRows: 1 };
}

function salesSheet(sales: CommissionSale[]): ExcelStyledSheet {
  const cols: Col<CommissionSale>[] = [
    { title: 'Orden', width: 16, value: (v) => v.order },
    { title: 'Cliente', width: 30, value: (v) => v.client },
    { title: 'Instalada', width: 12, value: (v) => formatDateValue(v.since_date) },
    { title: 'Sucursal', width: 14, value: (v) => v.branch },
    { title: 'Zona', width: 18, value: (v) => v.zone },
    { title: 'Plan', width: 28, value: (v) => v.product },
    { title: 'Tipo', width: 12, value: (v) => (v.sme ? 'PYME' : 'Residencial') },
    { title: 'Precio', width: 11, value: (v) => v.price, format: USD },
    { title: 'Estado actual', width: 14, value: (v) => v.status },
    { title: 'Cancelada el', width: 12, value: (v) => (v.cancelled_on ? formatDateValue(v.cancelled_on) : '') },
    { title: 'Estado de la factura', width: 20, value: (v) => v.billing_status },
    { title: 'Primera mensualidad', width: 18, value: (v) => v.invoice_number ?? '' },
    { title: 'Creada el', width: 12, value: (v) => (v.invoice_date ? formatDateValue(v.invoice_date) : '') },
    { title: 'Plan facturado', width: 28, value: (v) => v.invoice_plan ?? '' },
    { title: 'Estado', width: 12, value: (v) => v.invoice_status ?? '' },
    { title: 'Estado del pago', width: 18, value: (v) => v.invoice_payment ?? '' },
    { title: 'Pagada el', width: 12, value: (v) => (v.paid_date ? formatDateValue(v.paid_date) : '') },
    { title: 'Gratuita', width: 10, value: (v) => (v.is_free ? 'Sí' : '') },
    { title: 'Tramo', width: 22, value: (v) => (v.tier ? TIER[v.tier] : '') },
    { title: 'Clasificación', width: 13, value: (v) => CLASSIFICATION[v.classification].label },
    { title: 'Motivo', width: 40, value: (v) => v.reason },
    { title: 'Medio', width: 24, value: (v) => v.channel },
    { title: 'Oportunidad/Administrador', width: 24, value: (v) => v.supervisor_channel },
    { title: 'Vendedor', width: 30, value: (v) => v.seller },
    { title: 'Equipo', width: 16, value: (v) => v.equipo },
    { title: 'Unidades de negocio', width: 28, value: (v) => v.units.join(', ') },
    { title: 'Avisos', width: 50, value: (v) => v.warnings.join(' · ') },
  ];
  return {
    sheetName: 'Ventas',
    rows: [header(cols), ...sales.map((v, i) => rowOf(cols, v, i, v.classification !== 'valida'))],
    widths: cols.map((c) => c.width),
    stickyRows: 1,
  };
}

/** Descarga el libro del periodo: resumen, una hoja por equipo y el detalle de ventas. */
export async function exportReport(
  report: CommissionReport,
  sales: CommissionSale[],
  conditions: CommissionConditions,
  rate: number | null,
  titleLabel: (role: SalesRole) => string,
  /** Sin extensión. Por defecto `Comisiones <periodo>`; los cierres archivados llevan su versión. */
  name = `Comisiones ${report.period}`,
  /** Los equipos con sus roles, para nombrar y ordenar las hojas. */
  teams: { slug: string; name: string; roles: { role: SalesRole; role_label: string }[] }[] = [],
): Promise<void> {
  const order = teams.length
    ? teams
    : [...new Set(report.payments.map((p) => p.equipo))].map((slug) => ({
      slug,
      name: report.payments.find((p) => p.equipo === slug)?.team_name ?? slug,
      roles: [...new Set(report.payments.filter((p) => p.equipo === slug).map((p) => p.role))]
        .map((role) => ({ role, role_label: titleLabel(role) })),
    }));
  const payroll = buildPayroll(report, order);
  await downloadStyledWorkbook(
    [
      summarySheet(report, payroll, rate, titleLabel),
      ...payroll.teams.map((e) => teamSheet(e, payroll, conditions, rate, titleLabel)),
      salesSheet(sales),
    ],
    name,
  );
}
