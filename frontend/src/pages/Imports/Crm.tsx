import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { ImportsHeader } from '@/components/Navigation/ImportsHeader';
import { FileUploadZone } from '@/components/UI/FileUploadZone';
import { Button } from '@/components/UI/Button';
import { Play, Terminal } from 'lucide-react';
import axios from 'axios';

export default function ImportCrm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
    setIsAnalyzing(true);
    setConsoleLog('Iniciando cálculo de métricas CRM...');

    try {
      const res = await axios.post('/imports/api/run-crm-analysis/', {}, {
        headers: {
          'X-CSRFToken': (document.querySelector('meta[name="csrf-token"]') as any)?.content || '',
        },
      });
      setConsoleLog(res.data.log_output || res.data.message);
      setMessage({ type: 'success', text: 'Análisis CRM completado con éxito.' });
    } catch (err: any) {
      setConsoleLog(err.response?.data?.log_output || err.response?.data?.message || 'Error en ejecución.');
      setMessage({ type: 'error', text: 'Error al ejecutar el análisis CRM.' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <AppLayout title="Importar CRM Analytics">
      <ImportsHeader activeTab="crm" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Formulario Carga */}
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
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-4">Especificaciones Odoo v17</h3>
          <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
            <li>Formato: <strong>CSV (.csv) UTF-8</strong> con separador por coma.</li>
            <li>Fila principal debe incluir cliente, oportunidad, vendedor, etapa y estado.</li>
            <li>Filas secundarias deben incluir historial de entradas de tiempo.</li>
          </ul>
        </div>
      </div>

      {/* Sección Ejecución de Análisis */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Ejecutar Cálculo Global de CRM</h3>
          <Button
            onClick={handleRunAnalysis}
            isLoading={isAnalyzing}
            icon={<Play className="w-4 h-4 fill-current" />}
          >
            Iniciar Cálculo CRM
          </Button>
        </div>

        {consoleLog && (
          <div className="mt-4 bg-black/90 border border-slate-800 rounded-lg p-4 font-mono text-xs text-emerald-400 max-h-60 overflow-y-auto">
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