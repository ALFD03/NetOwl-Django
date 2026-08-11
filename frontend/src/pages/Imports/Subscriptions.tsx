import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { ImportsHeader } from '@/components/Navigation/ImportsHeader';
import { FileUploadZone } from '@/components/UI/FileUploadZone';
import { Button } from '@/components/UI/Button';
import axios from 'axios';

export default function ImportSubscriptions() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<'subscriptions' | 'logs'>('subscriptions');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  return (
    <AppLayout title="Importar Subscriptions">
      <ImportsHeader activeTab="subscriptions" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-4">Requisitos de Importación</h3>
          <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
            <li>Formato de archivo soportado: <strong>CSV (.csv)</strong></li>
            <li>Codificación de caracteres: <strong>UTF-8</strong></li>
            <li>Separador de campos: <strong>Comas (,)</strong></li>
            <li>Primera fila debe contener exactamente los nombres de las columnas exigidas.</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}