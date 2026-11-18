/**
 * Diagrama de flujo de dos columnas: de dónde sale lo que hay y adónde va.
 *
 * Cada banda es un enlace origen → destino con un grosor proporcional a su
 * valor, así que la pregunta «¿qué parte de lo que entró acabó en X?» se
 * contesta mirando el ancho, sin leer una tabla. Las dos columnas comparten
 * escala: un nodo mide lo que suman sus bandas.
 *
 * Es SVG propio y no un plugin de Chart.js porque no hace falta más que esto, y
 * un controlador más registrado en todas las páginas costaría para un solo
 * gráfico. En pantallas estrechas el contenedor se desplaza en horizontal: la
 * forma no se lee comprimida a la mitad.
 */

import { useMemo, useState } from 'react';

import { cn } from '@/shared/lib/cn';

export interface SankeyNode {
  id: string;
  label: string;
  /** Color del nodo; las bandas toman el del origen. */
  color: string;
  /** Una línea debajo de la etiqueta, p. ej. «de ellos 120 llegaron de ATC». */
  caption?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface Props {
  sources: SankeyNode[];
  targets: SankeyNode[];
  links: SankeyLink[];
  formatValue?: (value: number) => string;
  /** Alto del dibujo en unidades del viewBox (el ancho es 1000). */
  height?: number;
  className?: string;
}

const WIDTH = 1000;
const X_SOURCE = 250;
const X_TARGET = 735;
const NODE = 16;
const GAP = 28;
/**
 * Alto mínimo que ocupa un nodo en su columna: el de sus dos líneas de texto.
 * Un nodo fino (el arrastre, lo que quedó abierto) se dibuja centrado en ese
 * hueco, así que su etiqueta ni pisa la del vecino ni se sale del dibujo.
 */
const LABEL = 56;
/** Con `caption` la etiqueta lleva una tercera línea. */
const LABEL_WITH_NOTE = 80;
const MARGIN = 12;

interface PlacedNode extends SankeyNode {
  value: number;
  y: number;
  h: number;
}

interface Column {
  nodes: PlacedNode[];
  height: number;
}

function placeNodes(nodes: SankeyNode[], values: Map<string, number>, scale: number): Column {
  let y = 0;
  const placedNodes = nodes
    .filter((n) => (values.get(n.id) ?? 0) > 0)
    .map((n) => {
      const value = values.get(n.id) ?? 0;
      const h = Math.max(2, value * scale);
      const gap = Math.max(h, n.caption ? LABEL_WITH_NOTE : LABEL);
      const placed = { ...n, value, y: y + (gap - h) / 2, h };
      y += gap + GAP;
      return placed;
    });
  return { nodes: placedNodes, height: Math.max(0, y - GAP) };
}

export function SankeyChart({
  sources,
  targets,
  links,
  formatValue: formatValue = (v) => v.toLocaleString('es-VE'),
  height: height = 300,
  className,
}: Props) {
  const [active, setActive] = useState<number | null>(null);

  const drawing = useMemo(() => {
    const validLinks = links.filter((e) => e.value > 0);
    const sumBy = (key: 'source' | 'target') => {
      const m = new Map<string, number>();
      for (const e of validLinks) m.set(e[key], (m.get(e[key]) ?? 0) + e.value);
      return m;
    };
    const exits = sumBy('source');
    const entries = sumBy('target');
    const total = Math.max(1, ...[exits, entries].map((m) => [...m.values()].reduce((a, b) => a + b, 0)));
    const nVisible = (nodes: SankeyNode[], m: Map<string, number>) => nodes.filter((n) => (m.get(n.id) ?? 0) > 0).length;
    const gaps = Math.max(nVisible(sources, exits), nVisible(targets, entries)) - 1;
    const scale = (height - Math.max(0, gaps) * GAP) / total;

    const leftColumn = placeNodes(sources, exits, scale);
    const rightColumn = placeNodes(targets, entries, scale);
    // Centra la columna más corta respecto de la más alta.
    const H = Math.max(leftColumn.height, rightColumn.height);
    for (const c of [leftColumn, rightColumn]) {
      const d = (H - c.height) / 2;
      for (const n of c.nodes) n.y += d;
    }
    const left = leftColumn.nodes;
    const right = rightColumn.nodes;

    const byId = (c: PlacedNode[]) => new Map(c.map((n) => [n.id, n]));
    const mLeft = byId(left);
    const mRight = byId(right);
    const exitOffset = new Map<string, number>();
    const enterOffset = new Map<string, number>();
    const targetOrder = new Map(right.map((n, i) => [n.id, i]));
    const sourceOrder = new Map(left.map((n, i) => [n.id, i]));

    const bands = [...validLinks]
      .sort(
        (a, b) =>
          (sourceOrder.get(a.source) ?? 0) - (sourceOrder.get(b.source) ?? 0) ||
          (targetOrder.get(a.target) ?? 0) - (targetOrder.get(b.target) ?? 0),
      )
      .flatMap((e) => {
        const other = mLeft.get(e.source);
        const d = mRight.get(e.target);
        if (!other || !d) return [];
        const h = e.value * scale;
        const y0 = other.y + (exitOffset.get(other.id) ?? 0);
        const y1 = d.y + (enterOffset.get(d.id) ?? 0);
        exitOffset.set(other.id, (exitOffset.get(other.id) ?? 0) + h);
        enterOffset.set(d.id, (enterOffset.get(d.id) ?? 0) + h);
        const xa = X_SOURCE + NODE;
        const xb = X_TARGET;
        const xm = (xa + xb) / 2;
        const path = [
          `M ${xa} ${y0}`,
          `C ${xm} ${y0}, ${xm} ${y1}, ${xb} ${y1}`,
          `L ${xb} ${y1 + h}`,
          `C ${xm} ${y1 + h}, ${xm} ${y0 + h}, ${xa} ${y0 + h}`,
          'Z',
        ].join(' ');
        return [{ ...e, path, color: other.color, sourceLabel: other.label, targetLabel: d.label }];
      });

    return { left, right, bands, H, total: [...exits.values()].reduce((a, b) => a + b, 0) };
  }, [sources, targets, links, height]);

  const pct = (v: number) => (drawing.total > 0 ? `${((v / drawing.total) * 100).toFixed(1)}%` : '');
  const band = active !== null ? drawing.bands[active] : null;

  return (
    <div className={cn('custom-scrollbar overflow-x-auto', className)}>
      <div className="relative min-w-[640px]">
        <svg
          viewBox={`0 ${-MARGIN} ${WIDTH} ${drawing.H + 2 * MARGIN}`}
          className="h-auto w-full text-slate-300"
          role="img"
          aria-label="Diagrama de flujo"
        >
          {drawing.bands.map((b, i) => (
            <path
              key={`${b.source}-${b.target}`}
              d={b.path}
              fill={b.color}
              fillOpacity={active === null ? 0.32 : active === i ? 0.6 : 0.12}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className="cursor-default transition-[fill-opacity] duration-150"
            >
              <title>{`${b.sourceLabel} → ${b.targetLabel}: ${formatValue(b.value)}`}</title>
            </path>
          ))}

          {drawing.left.map((n) => {
            // La nota va en una línea propia: al lado de la cifra se saldría
            // del dibujo por la izquierda.
            const lift = n.caption ? 22 : 11;
            return (
              <g key={n.id}>
                <rect x={X_SOURCE} y={n.y} width={NODE} height={n.h} rx={4} fill={n.color} />
                <text x={X_SOURCE - 14} y={n.y + n.h / 2 - lift} textAnchor="end" dominantBaseline="middle" className="fill-current text-[19px] font-bold">
                  {n.label}
                </text>
                <text x={X_SOURCE - 14} y={n.y + n.h / 2 - lift + 24} textAnchor="end" dominantBaseline="middle" className="fill-current font-mono text-[17px] opacity-80">
                  {formatValue(n.value)}
                </text>
                {n.caption && (
                  <text x={X_SOURCE - 14} y={n.y + n.h / 2 - lift + 46} textAnchor="end" dominantBaseline="middle" className="fill-current text-[15px] opacity-60">
                    {n.caption}
                  </text>
                )}
              </g>
            );
          })}

          {drawing.right.map((n) => (
            <g key={n.id}>
              <rect x={X_TARGET} y={n.y} width={NODE} height={n.h} rx={4} fill={n.color} />
              <text x={X_TARGET + NODE + 14} y={n.y + n.h / 2 - 11} dominantBaseline="middle" className="fill-current text-[19px] font-bold">
                {n.label}
              </text>
              <text x={X_TARGET + NODE + 14} y={n.y + n.h / 2 + 13} dominantBaseline="middle" className="fill-current font-mono text-[17px] opacity-80">
                {formatValue(n.value)} · {pct(n.value)}
              </text>
            </g>
          ))}
        </svg>

        <p className="mt-1 h-4 text-center font-mono text-[11px] text-slate-400" aria-live="polite">
          {band ? `${band.sourceLabel} → ${band.targetLabel}: ${formatValue(band.value)} (${pct(band.value)})` : ''}
        </p>
      </div>
    </div>
  );
}
