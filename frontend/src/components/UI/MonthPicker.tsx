import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface MonthPickerProps {
  value: string; // Formato 'YYYY-MM' (ej: '2026-08')
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const MONTHS = [
  { short: 'Ene', full: 'Enero', num: '01' },
  { short: 'Feb', full: 'Febrero', num: '02' },
  { short: 'Mar', full: 'Marzo', num: '03' },
  { short: 'Abr', full: 'Abril', num: '04' },
  { short: 'May', full: 'Mayo', num: '05' },
  { short: 'Jun', full: 'Junio', num: '06' },
  { short: 'Jul', full: 'Julio', num: '07' },
  { short: 'Ago', full: 'Agosto', num: '08' },
  { short: 'Sep', full: 'Septiembre', num: '09' },
  { short: 'Oct', full: 'Octubre', num: '10' },
  { short: 'Nov', full: 'Noviembre', num: '11' },
  { short: 'Dic', full: 'Diciembre', num: '12' },
];

export const MonthPicker: React.FC<MonthPickerProps> = ({
  value,
  onChange,
  placeholder = 'Seleccionar mes...',
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extraer año y mes actual del valor recibido o fecha actual
  const initialYear = value ? parseInt(value.split('-')[0], 10) : new Date().getFullYear();
  const [displayYear, setDisplayYear] = useState<number>(initialYear);

  useEffect(() => {
    if (value) {
      setDisplayYear(parseInt(value.split('-')[0], 10));
    }
  }, [value]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectMonth = (monthNum: string) => {
    onChange(`${displayYear}-${monthNum}`);
    setIsOpen(false);
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    setDisplayYear(curYear);
    onChange(`${curYear}-${curMonth}`);
    setIsOpen(false);
  };

  // Etiqueta formateada para el botón (ej: "Agosto 2026")
  const getFormattedLabel = () => {
    if (!value) return null;
    const [y, m] = value.split('-');
    const monthObj = MONTHS.find((item) => item.num === m);
    return monthObj ? `${monthObj.full} ${y}` : value;
  };

  const selectedMonthNum = value ? value.split('-')[1] : null;
  const selectedYearNum = value ? parseInt(value.split('-')[0], 10) : null;

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* BOTÓN DISPARADOR (SOLO LECTURA, NO SE PUEDE ESCRIBIR) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center gap-2.5 px-4 py-2 bg-[#0f1a36] border rounded-xl text-xs font-bold transition-all shadow-md ${
          isOpen
            ? 'border-brand ring-2 ring-brand/20 text-white'
            : 'border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <Calendar className="w-4 h-4 text-brand flex-shrink-0" />
        <span className={getFormattedLabel() ? 'text-white' : 'text-slate-500'}>
          {getFormattedLabel() || placeholder}
        </span>
      </button>

      {/* MODAL DESPLEGABLE PERSONALIZADO DARK */}
      {isOpen && (
        <div className="absolute left-0 mt-2 z-50 w-72 bg-[#0f1a36] border border-slate-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          
          {/* HEADER CON SELECTOR DE AÑO */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <button
              type="button"
              onClick={() => setDisplayYear((prev) => prev - 1)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-sm font-black text-white tracking-wider">
              {displayYear}
            </span>

            <button
              type="button"
              onClick={() => setDisplayYear((prev) => prev + 1)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* CUADRÍCULA DE LOS 12 MESES */}
          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map((m) => {
              const isSelected = selectedMonthNum === m.num && selectedYearNum === displayYear;
              return (
                <button
                  key={m.num}
                  type="button"
                  onClick={() => handleSelectMonth(m.num)}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all relative ${
                    isSelected
                      ? 'bg-brand text-white shadow-lg shadow-brand/30 font-black scale-105'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  {m.short}
                  {isSelected && (
                    <span className="absolute top-1 right-1">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* PIE CON ACCIONES RÁPIDAS */}
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] font-bold">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="text-slate-500 hover:text-rose-400 transition-colors"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={handleCurrentMonth}
              className="text-brand hover:text-brand-hover transition-colors"
            >
              Este mes
            </button>
          </div>

        </div>
      )}
    </div>
  );
};