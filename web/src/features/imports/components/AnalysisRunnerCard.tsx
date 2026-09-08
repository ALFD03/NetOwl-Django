import { useState } from 'react';
import { Play } from 'lucide-react';

import { useAsyncAction, type ActionStatus } from '@/shared/hooks/useAsyncAction';
import { Button, ConsoleOutput, MonthPicker, Panel, StatusMessage } from '@/shared/ui';
import type { ImportOperationResult } from '../types';

export interface AnalysisRunnerCardProps {
  title: string;
  description?: string;
  runLabel: string;
  consoleTitle: string;
  monthPlaceholder: string;
  /** Runs the analysis for the chosen month (null when none is required). */
  onRun: (month: string | null) => Promise<ImportOperationResult>;
  successMessage: (result: ImportOperationResult, month: string) => string;
  errorMessage: string;
  /** Text written to the console while the run is in flight. */
  pendingLog?: (month: string) => string;
  /**
   * When true the run button stays disabled until a month is chosen, and
   * submitting without one reports a validation message instead of calling the API.
   */
  requireMonth?: boolean;
  /** Validation copy shown when `requireMonth` is set and none was chosen. */
  missingMonthMessage?: string;
}

/**
 * Month picker + run button + console, shared by every import page.
 *
 * Replaces the `isAnalyzing` / `analysisMessage` / `consoleLog` state triple and
 * the duplicated axios error narrowing that each page carried.
 */
export function AnalysisRunnerCard({
  title,
  description,
  runLabel,
  consoleTitle,
  monthPlaceholder,
  onRun,
  successMessage,
  errorMessage,
  pendingLog,
  requireMonth = false,
  missingMonthMessage = 'Por favor selecciona el mes de análisis en el calendario.',
}: AnalysisRunnerCardProps) {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [validation, setValidation] = useState<ActionStatus | null>(null);

  const analysis = useAsyncAction(onRun, {
    successMessage: (result) => successMessage(result, selectedMonth),
    errorMessage,
    readLog: (result) => result.log_output ?? result.message,
    pendingLog: pendingLog?.(selectedMonth),
  });

  const handleRun = async () => {
    if (requireMonth && !selectedMonth) {
      setValidation({ type: 'error', text: missingMonthMessage });
      return;
    }
    setValidation(null);
    await analysis.run(selectedMonth || null);
  };

  return (
    <Panel
      title={title}
      description={description}
      actions={
        <>
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth} placeholder={monthPlaceholder} />
          <Button
            onClick={handleRun}
            isLoading={analysis.isPending}
            disabled={requireMonth && !selectedMonth}
            icon={<Play className="h-4 w-4 fill-current" />}
          >
            {runLabel}
          </Button>
        </>
      }
    >
      <StatusMessage status={validation ?? analysis.status} className="mb-4" />
      <ConsoleOutput title={consoleTitle} output={analysis.log} />
    </Panel>
  );
}
