/**
 * Shared UI kit. Everything here is domain-agnostic and reusable across modules.
 *
 * Grouped by kind:
 *   primitives/ — atoms with no layout opinion (Button, ProgressBar, PulseDot)
 *   surfaces/   — things that frame content (NeonContainer, Panel, Modal)
 *   data/       — tabular and grouped readouts (DataTable, StatGroup, SummaryStrip)
 *   inputs/     — controls that produce a value
 *   metrics/    — KPI readouts (MetricCard, StatTile, SparklineCard, …)
 *   feedback/   — states and results (EmptyState, StatusMessage, ConsoleOutput)
 *   theme/      — colour maps and the shared unions they are keyed by
 */

export * from './primitives';
export * from './surfaces';
export * from './data';
export * from './inputs';
export * from './metrics';
export * from './feedback';
export * from './theme';
