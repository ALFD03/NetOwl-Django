/**
 * Las tres hojas del formulario que se declara a la reguladora.
 *
 * Aquí viven las columnas y las constantes del formulario; el reparto de las
 * filas y los cálculos de velocidad y consumo los hace el backend
 * (`services/subscriptions/analytics/eta_forms.py`). La división no es
 * caprichosa: lo que depende del cierre del mes se calcula donde están los
 * datos, y lo que es literalmente el texto del impreso vive junto a la hoja.
 *
 * Buena parte de las columnas son constantes. No es un descuido: la reguladora
 * pide la columna aunque su valor sea siempre el mismo, y omitirla desalinea
 * el formulario respecto a la plantilla oficial.
 */

import type { ExcelColumn, ExcelSheet } from '@/shared/lib/excel';
import type {
  EtaFormularioInternet,
  EtaFormularioTelevision,
  EtaFormularioTransporte,
  EtaForms,
} from '@/shared/types/subscriptions';

/** Valores que el impreso trae fijos para todas las filas. */
const OPEN_STATUS = 'Abierto';
const PAYMENT_MODE = 'PREVIO PAGO';
const NO_APLICA = 'No Aplica';
const ACCESO_DEDICADO = 'Enlace Dedicado';
const TRANSMISSION_MEDIUM = 'Fibra Óptica';
const MODALIDAD_TV = 'IPTV';
const LEGAL_ENTITY = 'Persona Jurídica';

/** La parrilla que se declara, idéntica en todas las filas de televisión. */
const CANALES_TV =
  'NACIONALES, INFANTILES, TELENOVELAS, RELIGION, NOTICIAS, DEPORTES, PELICULAS, DOCUMENTALES, MUSICALES';
const CHANNEL_COUNT = 108;

/** Formato de Excel para bolívares y para un conteo. */
const BOLIVARES = '#,##0.00';
const INTEGER = '#,##0';

/**
 * La renta básica en bolívares.
 *
 * `null` y no `0` cuando la tasa todavía no está fijada: la celda sale vacía,
 * que es lo que significa "falta el dato". Un cero declararía que el plan es
 * gratuito.
 */
const rent = (precio: number, tasa: number): number | null =>
  tasa > 0 ? Math.round(precio * tasa * 100) / 100 : null;

const internetColumns = (tasa: number): ExcelColumn<EtaFormularioInternet>[] => [
  { header: 'Nombre del Plan', value: (r) => r.name, width: 38 },
  { header: 'Estatus del Plan', value: () => OPEN_STATUS, width: 16 },
  { header: 'Modalidad de pago', value: () => PAYMENT_MODE, width: 18 },
  { header: 'Tipo de Suscriptor', value: (r) => r.subscriber_type, width: 20 },
  { header: 'Entidad Federal', value: (r) => r.entities, width: 40 },
  { header: 'Número de Suscriptores por Plan', value: (r) => r.subscribers, format: INTEGER, width: 18 },
  { header: 'Renta básica en Bs. (sin IVA)', value: (r) => rent(r.price, tasa), format: BOLIVARES, width: 22 },
  { header: 'Tipo de Servicio', value: (r) => r.service_type, width: 16 },
  { header: 'Características del tipo de Acceso', value: () => ACCESO_DEDICADO, width: 26 },
  { header: 'MB Incluidos', value: () => NO_APLICA, width: 14 },
  { header: 'Velocidad Máxima de Subida (Uplink) (Kbps)', value: (r) => r.uplink_kbps, format: INTEGER, width: 22 },
  { header: 'Velocidad Máxima de Bajada (Downlink) (Kbps)', value: (r) => r.downlink_kbps, format: INTEGER, width: 22 },
  { header: 'Precio MB Adicional', value: () => NO_APLICA, width: 18 },
  { header: 'Precio por Hora Adicional', value: () => NO_APLICA, width: 20 },
  { header: 'Tecnología de Acceso al Terminal del Usuario', value: (r) => r.service_type, width: 28 },
  { header: 'Velocidad Promedio Teórica por Plan (Kbps)', value: (r) => r.avg_speed_kbps, format: INTEGER, width: 22 },
  { header: 'Promedio de Consumo del Plan en MB', value: (r) => r.avg_usage_mb, format: INTEGER, width: 24 },
];

const transportColumns = (tasa: number): ExcelColumn<EtaFormularioTransporte>[] => [
  { header: 'Nombre del Plan', value: (r) => r.name, width: 38 },
  { header: 'Estatus del Plan', value: () => OPEN_STATUS, width: 16 },
  { header: 'Modalidad de Pago', value: () => PAYMENT_MODE, width: 18 },
  // El transporte de datos no se contrata a título personal: siempre es una
  // empresa, y por eso aquí no se lee del plan como en la hoja de internet.
  { header: 'Tipo de Suscriptor', value: () => LEGAL_ENTITY, width: 20 },
  { header: 'Medio de Transmisión', value: () => TRANSMISSION_MEDIUM, width: 20 },
  { header: 'Renta básica en Bs. (sin IVA)', value: (r) => rent(r.price, tasa), format: BOLIVARES, width: 22 },
  { header: 'Número de Suscriptores / Tipo de Enlace', value: (r) => r.subscribers, format: INTEGER, width: 22 },
  { header: 'Velocidad Máxima de Transmisión de Datos (Kbps)', value: (r) => r.speed_kbps, format: INTEGER, width: 24 },
  // Un enlace por suscriptor: cada contrato de transporte es un enlace, así
  // que la reguladora recibe el mismo número por las dos columnas.
  { header: 'Número de Enlaces', value: (r) => r.subscribers, format: INTEGER, width: 18 },
];

const televisionColumns = (tasa: number): ExcelColumn<EtaFormularioTelevision>[] => [
  { header: 'Nombre del Plan', value: (r) => r.name, width: 38 },
  { header: 'Tipo de suscriptor', value: (r) => r.subscriber_type, width: 20 },
  { header: 'Entidad Federal', value: (r) => r.entities, width: 40 },
  { header: 'Modalidad de Prestación', value: () => MODALIDAD_TV, width: 20 },
  // Todo el parque es previo pago. La columna de post pago va vacía y no a
  // cero: cero declararía que existen contratos post pago sin suscriptores.
  { header: 'Nº de Suscriptores — Previo Pago', value: (r) => r.subscribers, format: INTEGER, width: 20 },
  { header: 'Nº de Suscriptores — Post Pago', value: () => null, width: 20 },
  { header: 'Número total de Suscriptores de acuerdo al Plan', value: (r) => r.subscribers, format: INTEGER, width: 24 },
  { header: 'Canales que Incluye', value: () => CANALES_TV, width: 60 },
  { header: 'Número de Canales', value: () => CHANNEL_COUNT, format: INTEGER, width: 16 },
  { header: 'Renta básica Bs. — Cliente Nuevo / Previo Pago', value: (r) => rent(r.price, tasa), format: BOLIVARES, width: 24 },
  { header: 'Renta básica Bs. — Cliente Nuevo / Post Pago', value: () => null, width: 24 },
  { header: 'Renta básica Bs. — Cliente Existente / Previo Pago', value: (r) => rent(r.price, tasa), format: BOLIVARES, width: 24 },
  { header: 'Renta básica Bs. — Cliente Existente / Post Pago', value: () => null, width: 24 },
  { header: 'Estatus de Comercialización del Plan', value: () => OPEN_STATUS, width: 26 },
];

/**
 * El libro entero, en el orden en que la reguladora espera las hojas.
 *
 * Se devuelven las tres siempre, también las vacías: en un formulario oficial
 * "ninguno" es una respuesta, y una hoja que falta no se lee como un cero sino
 * como un impreso incompleto.
 */
export const hojasFormularioEta = (
  formularios: EtaForms,
  tasa: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada hoja lleva su propio tipo de fila.
): ExcelSheet<any>[] => [
  {
    rows: formularios.internet ?? [],
    columns: internetColumns(tasa),
    sheetName: 'Internet',
  },
  {
    rows: formularios.transport ?? [],
    columns: transportColumns(tasa),
    sheetName: 'Transporte de Datos',
  },
  {
    rows: formularios.television ?? [],
    columns: televisionColumns(tasa),
    sheetName: 'Televisión',
  },
];

/**
 * Nombre del archivo: qué se declara, de qué cierre y a qué tasa.
 *
 * La tasa entra en el nombre porque el mismo mes se puede exportar dos veces
 * —a la tasa con la que se declara y a la de hoy— y los dos libros son
 * idénticos salvo en las columnas de renta. Sin distinguirlos, el segundo pisa
 * al primero en la carpeta de descargas y nadie sabe cuál declaró.
 */
export const formularioEtaFileName = (periodo: string, rateSuffix = ''): string =>
  `Formularios ETA ${periodo}${rateSuffix ? ` (${rateSuffix})` : ''}`.trim();

/** Cuántas filas tiene el libro. Con cero no hay nada que declarar. */
export const formRowCount = (formularios: EtaForms | undefined): number =>
  (formularios?.internet?.length ?? 0)
  + (formularios?.transport?.length ?? 0)
  + (formularios?.television?.length ?? 0);
