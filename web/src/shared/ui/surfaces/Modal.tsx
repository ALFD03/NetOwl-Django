import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

import { useScrollLock } from '@/shared/hooks/useScrollLock';

export type ModalTheme = 'slate' | 'blue' | 'green' | 'red' | 'yellow' | 'purple';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'wide';
  theme?: ModalTheme;
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  size = 'xl',
  theme = 'slate',
}: ModalProps) {
  // `onClose` llega como lambda en linea desde todos los consumidores, asi que
  // cambia de identidad en cada render. Si estuviera en las dependencias del
  // efecto, el efecto se volveria a montar continuamente. Se guarda en una ref
  // para poder depender solo de `isOpen`.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Los anchos solo rigen desde `sm`: por debajo el modal ocupa la pantalla.
  const sizes = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
    wide: 'sm:max-w-[85vw]',
  };

  const themeBorders: Record<ModalTheme, string> = {
    slate: 'border-slate-700/60 shadow-slate-950/60',
    blue: 'border-sky-500/40 shadow-sky-950/30',
    green: 'border-emerald-500/40 shadow-emerald-950/30',
    red: 'border-rose-500/40 shadow-rose-950/30',
    yellow: 'border-amber-500/40 shadow-amber-950/30',
    purple: 'border-purple-500/40 shadow-purple-950/30',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        // En el teléfono el modal sube desde abajo y ocupa el ancho entero (una
        // hoja); desde `sm` vuelve a ser la tarjeta centrada.
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          {/* Backdrop con Blur suave */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 320 }}
            className={`relative w-full ${sizes[size]} bg-gradient-to-br from-slate-900 via-surface-secondary to-surface-primary border ${themeBorders[theme]} rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92dvh] sm:max-h-[90vh]`}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 border-b border-slate-800/80 bg-slate-900/40 flex-shrink-0">
              <div className="flex min-w-0 items-center gap-3">
                {icon && (
                  <div className="p-2 rounded-xl bg-surface-primary border border-slate-800">
                    {icon}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-black text-white tracking-tight uppercase">{title}</h3>
                  {subtitle && <p className="text-[11px] text-slate-400 font-medium">{subtitle}</p>}
                </div>
              </div>

              <button
                onClick={onClose}
                className="shrink-0 p-2 rounded-xl text-slate-400 hover:text-white bg-surface-primary hover:bg-rose-500/20 border border-slate-800 hover:border-rose-500/40 transition-all"
                title="Cerrar (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body con Scroll Personalizado */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};