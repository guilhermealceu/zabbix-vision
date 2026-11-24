import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BrainCircuit, Sparkles, Loader2, Copy, Check, HardDrive, Cpu, ShieldAlert } from 'lucide-react';

interface AIAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string | null;
  loading: boolean;
  engine?: 'gemini' | 'ollama' | 'expert' | 'fallback';
}

const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({
  isOpen,
  onClose,
  title,
  content,
  loading,
  engine = 'gemini',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getEngineBadge = () => {
    switch (engine) {
      case 'gemini':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Google Gemini Flash
          </span>
        );
      case 'ollama':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <HardDrive className="w-3.5 h-3.5 text-purple-400" /> Ollama Local
          </span>
        );
      case 'expert':
      case 'fallback':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" /> Motor Especialista Zabbix
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 15 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-blue-500/10 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-500/30 shrink-0">
                  <BrainCircuit className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white truncate">Análise Inteligente</h3>
                    {getEngineBadge()}
                  </div>
                  <p className="text-slate-400 text-xs truncate" title={title}>
                    {title}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white shrink-0 ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-slate-200">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                    <Sparkles className="w-6 h-6 text-amber-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-slate-200 font-semibold text-base">Processando análise...</p>
                    <p className="text-slate-400 text-xs">
                      Consultando modelo de IA e correlacionando métricas do Zabbix...
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {content ? (
                    <div className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap font-sans bg-slate-950/40 p-5 rounded-xl border border-slate-800/80">
                      {content}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500 italic">
                      Nenhuma resposta gerada.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950/70 border-t border-slate-800 flex items-center justify-between shrink-0">
              {content && !loading ? (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-all"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar Análise
                    </>
                  )}
                </button>
              ) : (
                <div />
              )}

              <button
                onClick={onClose}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AIAnalysisModal;
