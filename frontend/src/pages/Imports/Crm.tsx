import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { ImportsHeader } from '@/components/Navigation/ImportsHeader';
import { FileUploadZone } from '@/components/UI/FileUploadZone';
import { Button } from '@/components/UI/Button';
import { MonthPicker } from '@/components/UI/MonthPicker';
import { Play, Terminal, Activity } from 'lucide-react';
import axios from 'axios';

export default function ImportCrm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estados del Análisis
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [consoleLog, setConsoleLog] = useState<string | null>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('csv_file', selectedFile);

    try {
      const res = await axios.post('/imports/api/import-crm/', formData, {
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
        text: err.response?.data?.message || 'Error al importar datos de CRM.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!selectedPeriod) {
      setAnalysisMessage({ type: 'error', text: 'Por favor selecciona el mes de análisis en el calendario.' });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisMessage(null);
    setConsoleLog(`Iniciando motor de análisis CRM para el periodo ${selectedPeriod}...`);

    try {
      const res = await axios.post('/imports/api/run-crm-analysis/', {
        month: selectedPeriod,
      }, {
        headers: {
          'X-CSRFToken': (document.querySelector('meta[name="csrf-token"]') as any)?.content || '',
        },
      });

      setConsoleLog(res.data.log_output || res.data.message);
      setAnalysisMessage({ 
        type: 'success', 
        text: `Análisis de CRM completado exitosamente para ${res.data.periodo_label || selectedPeriod}.` 
      });
    } catch (err: any) {
      setConsoleLog(err.response?.data?.log_output || err.response?.data?.message || 'Error en ejecución.');
      setAnalysisMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Error al ejecutar el análisis CRM.' 
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <AppLayout title="Importar CRM Analytics">
      <ImportsHeader activeTab="crm" />

      {/* SECCIÓN 1: CARGA DE ARCHIVO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-4">Cargar Exportación CSV Odoo CRM</h3>

          <form onSubmit={handleUpload} className="space-y-4">
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
              isLoading={isUploading}
            >
              Iniciar Carga CRM
            </Button>
          </form>
        </div>

        {/* Requisitos */}
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white mb-4">Especificaciones Odoo CRM</h3>
            <ul className="text-xs text-slate-400 space-y-2.5 list-disc list-inside leading-relaxed">
              <li>Formato soportado: <strong>CSV (.csv) UTF-8</strong> con separador por coma (,).</li>
              <li>Debe contener: ID, Oportunidad, Cliente, Sucursal, Vendedor, Campaña, Etapa, Ganado y Fechas.</li>
              <li>Incluye histórico de <strong>Entradas de Tiempo</strong> para seguimiento de horas por etapa.</li>
            </ul>
          </div>

          <div className="p-4 bg-brand/5 border border-brand/20 rounded-xl flex items-center gap-3 mt-4">
            <Activity className="w-5 h-5 text-brand flex-shrink-0" />
            <p className="text-[11px] text-slate-400">
              Tras importar el archivo, selecciona el mes a procesar en la sección inferior para calcular las cohortes.
            </p>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: EJECUCIÓN CON MONTHPICKER OBLIGATORIO */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Ejecutar Análisis Mensual de CRM</h3>
            <p className="text-xs text-slate-400 mt-0.5">Calcula la cohorte del mes: ganados, perdidos, pendientes, devueltos E8 y SLAs.</p>
          </div>

          <div className="flex items-center gap-3">
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
              Iniciar Cálculo CRM
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
          <div className="mt-4 bg-black/90 border border-slate-800 rounded-lg p-4 font-mono text-xs text-emerald-400 max-h-60 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 text-slate-400 pb-2 mb-2 border-b border-slate-800">
              <Terminal className="w-4 h-4" />
              <span>Consola de Ejecución CRM</span>
            </div>
            <pre className="whitespace-pre-wrap">{consoleLog}</pre>
          </div>
        )}
      </div>
    </AppLayout>
  );
}