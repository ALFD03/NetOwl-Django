import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { ImportsHeader } from '@/components/Navigation/ImportsHeader';
import { FileUploadZone } from '@/components/UI/FileUploadZone';
import { Button } from '@/components/UI/Button';
import { MonthPicker } from '@/components/UI/MonthPicker'; // 👈 NUEVO COMPONENTE
import { Play, Terminal, Activity } from 'lucide-react';
import axios from 'axios';

export default function ImportSubscriptions() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<'subscriptions' | 'logs'>('subscriptions');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estados del Análisis
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [consoleLog, setConsoleLog] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('csv_file', selectedFile);

    const endpoint = importType === 'subscriptions' 
      ? '/imports/api/import-subscriptions/' 
      : '/imports/api/import-logs/';

    try {
      const res = await axios.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-CSRFToken': (document.querySelector('meta[name="csrf-token"]') as any)?.content || '',
        },
      });
      setMessage({ type: 'success', text: res.data.message });
      setSelectedFile(null);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Error al procesar la importación.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!selectedPeriod) {
      setAnalysisMessage({ type: 'error', text: 'Por favor selecciona un mes en el calendario.' });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisMessage(null);
    setConsoleLog(`Iniciando motor de análisis de Churn para el periodo ${selectedPeriod}...`);

    try {
      const res = await axios.post('/imports/api/run-analysis/', {
        month: selectedPeriod,
      }, {
        headers: {
          'X-CSRFToken': (document.querySelector('meta[name="csrf-token"]') as any)?.content || '',
        },
      });

      setConsoleLog(res.data.log_output || 'Análisis completado.');
      setAnalysisMessage({ 
        type: 'success', 
        text: `Análisis de Churn completado exitosamente para ${res.data.periodo_label || selectedPeriod}.` 
      });
    } catch (err: any) {
      setConsoleLog(err.response?.data?.log_output || err.response?.data?.message || 'Error en ejecución.');
      setAnalysisMessage({
        type: 'error',
        text: err.response?.data?.message || 'Error al ejecutar el análisis de Churn.',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <AppLayout title="Importar Subscriptions">
      <ImportsHeader activeTab="subscriptions" />

      {/* SECCIÓN 1: FORMULARIO DE CARGA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-4">Cargar Archivo CSV Subscriptions</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-3 mb-4">
              <label className="flex-1 p-3 border border-slate-700 rounded-lg bg-surface-tertiary cursor-pointer flex items-center gap-2 text-xs font-semibold text-slate-200">
                <input
                  type="radio"
                  name="importType"
                  checked={importType === 'subscriptions'}
                  onChange={() => setImportType('subscriptions')}
                  className="text-brand"
                />
                <span>Suscripciones / Clientes</span>
              </label>

              <label className="flex-1 p-3 border border-slate-700 rounded-lg bg-surface-tertiary cursor-pointer flex items-center gap-2 text-xs font-semibold text-slate-200">
                <input
                  type="radio"
                  name="importType"
                  checked={importType === 'logs'}
                  onChange={() => setImportType('logs')}
                  className="text-brand"
                />
                <span>Logs / Transiciones</span>
              </label>
            </div>

            <FileUploadZone onFileSelect={setSelectedFile} />

            {message && (
              <div
                className={`p-3 rounded-lg text-xs font-semibold ${
                  message.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {message.text}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={!selectedFile}
              isLoading={isLoading}
            >
              Iniciar Carga
            </Button>
          </form>
        </div>

        {/* Requisitos */}
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white mb-4">Requisitos de Importación</h3>
            <ul className="text-xs text-slate-400 space-y-2.5 list-disc list-inside leading-relaxed">
              <li>Formato de archivo soportado: <strong>CSV (.csv)</strong></li>
              <li>Codificación de caracteres: <strong>UTF-8</strong></li>
              <li>Separador de campos: <strong>Comas (,)</strong></li>
              <li><strong>Suscripciones:</strong> Debe contener orden, cliente, producto, fecha de inicio, tarifa, total.</li>
              <li><strong>Logs:</strong> Debe contener orden, fecha de cambio, nota y estado interno.</li>
            </ul>
          </div>

          <div className="p-4 bg-brand/5 border border-brand/20 rounded-xl flex items-center gap-3 mt-4">
            <Activity className="w-5 h-5 text-brand flex-shrink-0" />
            <p className="text-[11px] text-slate-400">
              Tras cargar ambos archivos, selecciona el mes correspondiente y ejecuta el análisis en la sección inferior.
            </p>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: EJECUCIÓN CON MONTHPICKER PERSONALIZADO */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Ejecutar Análisis Mensual de Subscriptions (Churn)</h3>
            <p className="text-xs text-slate-400 mt-0.5">Calcula la base inicial, final, nuevos, reactivaciones y matrices dimensionales del mes.</p>
          </div>

          <div className="flex items-center gap-3">
            {/* 👇 NUEVO SELECTOR DE MES DARK & READONLY */}
            <MonthPicker
              value={selectedPeriod}
              onChange={setSelectedPeriod}
              placeholder="Elegir mes de análisis..."
            />

            <Button
              onClick={handleRunAnalysis}
              isLoading={isAnalyzing}
              disabled={!selectedPeriod}
              icon={<Play className="w-4 h-4 fill-current" />}
            >
              Iniciar Análisis Churn
            </Button>
          </div>
        </div>

        {analysisMessage && (
          <div
            className={`p-3 rounded-lg text-xs font-semibold mb-4 ${
              analysisMessage.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}
          >
            {analysisMessage.text}
          </div>
        )}

        {consoleLog && (
          <div className="mt-4 bg-black/90 border border-slate-800 rounded-lg p-4 font-mono text-xs text-emerald-400 max-h-64 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 text-slate-400 pb-2 mb-2 border-b border-slate-800">
              <Terminal className="w-4 h-4" />
              <span>Consola de Ejecución MetricsAnalyzer</span>
            </div>
            <pre className="whitespace-pre-wrap">{consoleLog}</pre>
          </div>
        )}
      </div>
    </AppLayout>
  );
}