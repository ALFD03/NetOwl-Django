import React, { useState, useRef } from 'react';
import { UploadCloud, FileCheck, X } from 'lucide-react';
import { Button } from '../primitives/Button';

interface FileUploadZoneProps {
  onFileSelect: (file: File | null) => void;
  accept?: string;
  isUploading?: boolean;
}

export function FileUploadZone({
  onFileSelect,
  accept = '.csv',
  isUploading = false,
}: FileUploadZoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragOver
            ? 'border-brand bg-brand/10 scale-[1.01]'
            : 'border-slate-700 bg-surface-tertiary hover:border-slate-500 hover:bg-surface-hover'
        }`}
      >
        <UploadCloud className="w-12 h-12 text-brand mx-auto mb-3" />
        <h4 className="text-sm font-bold text-white mb-1">Arrastra tu archivo CSV aquí</h4>
        <p className="text-xs text-slate-400 mb-4">o haz clic para explorar tus archivos</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => e.target.files && handleFileChange(e.target.files[0])}
        />
        <Button variant="outline" size="sm" type="button">
          Buscar Archivo
        </Button>
      </div>

      {selectedFile && (
        <div className="flex items-center justify-between p-3 bg-surface-tertiary border border-slate-700 rounded-lg text-xs">
          <div className="flex items-center gap-2 text-slate-200 font-medium truncate">
            <FileCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="truncate">{selectedFile.name}</span>
            <span className="text-slate-400">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFileChange(null);
            }}
            className="p-1 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};