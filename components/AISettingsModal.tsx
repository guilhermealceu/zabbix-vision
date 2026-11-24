import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Cpu, Sparkles, CheckCircle2, AlertCircle, RefreshCw, HardDrive, Zap, Info } from 'lucide-react';
import { AIProviderConfig } from '../types';
import { AIService, DEFAULT_AI_CONFIG } from '../services/aiService';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChange?: (config: AIProviderConfig) => void;
}

const AISettingsModal: React.FC<AISettingsModalProps> = ({ isOpen, onClose, onConfigChange }) => {
  const [config, setConfig] = useState<AIProviderConfig>(DEFAULT_AI_CONFIG);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<{
    gemini: { available: boolean; error: string | null };
    ollama: { available: boolean; models: string[]; error: string | null };
  } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const current = AIService.getConfig();
      setConfig(current);
      runHealthCheck(current.ollamaEndpoint);
    }
  }, [isOpen]);

  const runHealthCheck = async (endpoint?: string) => {
    setTesting(true);
    const res = await AIService.checkHealth(endpoint || config.ollamaEndpoint);
    setHealth(res);
    setTesting(false);
  };

  const handleSave = () => {
    AIService.saveConfig(config);
    if (onConfigChange) onConfigChange(config);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden text-slate-200"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-purple-600/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    Configuração de IA & Fallback
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </h3>
                  <p className="text-xs text-slate-400">Escolha o provedor de inteligência artificial ou use Ollama local</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Provider Selection Cards */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Provedor Principal de IA
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Auto Fallback */}
                  <div
                    onClick={() => setConfig({ ...config, provider: 'auto' })}
                    className={`cursor-pointer p-4 rounded-xl border transition-all ${
                      config.provider === 'auto'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-400" /> Automático (Recomendado)
                      </span>
                      {config.provider === 'auto' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Gemini Gratuito ➔ Fallback Ollama Local ➔ Motor Especialista Zabbix.
                    </p>
                  </div>

                  {/* Gemini Cloud */}
                  <div
                    onClick={() => setConfig({ ...config, provider: 'gemini' })}
                    className={`cursor-pointer p-4 rounded-xl border transition-all ${
                      config.provider === 'gemini'
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg shadow-blue-500/10 ring-1 ring-blue-500'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-400" /> Google Gemini
                      </span>
                      {config.provider === 'gemini' && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Nuvem rápida de alta capacidade com modelo <code>gemini-3.8-flash</code>.
                    </p>
                  </div>

                  {/* Ollama Local */}
                  <div
                    onClick={() => setConfig({ ...config, provider: 'ollama' })}
                    className={`cursor-pointer p-4 rounded-xl border transition-all ${
                      config.provider === 'ollama'
                        ? 'bg-purple-600/20 border-purple-500 text-white shadow-lg shadow-purple-500/10 ring-1 ring-purple-500'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm flex items-center gap-1.5">
                        <HardDrive className="w-4 h-4 text-purple-400" /> Ollama Local
                      </span>
                      {config.provider === 'ollama' && <CheckCircle2 className="w-4 h-4 text-purple-400" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      100% offline, seguro e privado no seu ambiente (localhost:11434).
                    </p>
                  </div>

                  {/* Expert Rules */}
                  <div
                    onClick={() => setConfig({ ...config, provider: 'expert' })}
                    className={`cursor-pointer p-4 rounded-xl border transition-all ${
                      config.provider === 'expert'
                        ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm flex items-center gap-1.5">
                        <Cpu className="w-4 h-4 text-emerald-400" /> Motor Especialista
                      </span>
                      {config.provider === 'expert' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Diagnósticos heurísticos determinísticos baseados em boas práticas Zabbix SRE.
                    </p>
                  </div>
                </div>
              </div>

              {/* Ollama Custom Settings (Shown always or when relevant) */}
              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-purple-400" />
                    Parâmetros do Ollama Local
                  </h4>
                  <button
                    onClick={() => runHealthCheck(config.ollamaEndpoint)}
                    disabled={testing}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/30 transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                    Testar Conexão
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Endpoint do Ollama</label>
                    <input
                      type="text"
                      value={config.ollamaEndpoint}
                      onChange={(e) => setConfig({ ...config, ollamaEndpoint: e.target.value })}
                      placeholder="http://127.0.0.1:11434"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Modelo Ollama</label>
                    <input
                      type="text"
                      value={config.ollamaModel}
                      onChange={(e) => setConfig({ ...config, ollamaModel: e.target.value })}
                      placeholder="llama3.2 ou mistral ou qwen2.5"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Health feedback */}
                {health && (
                  <div className="pt-2 border-t border-slate-700/60 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Google Gemini Cloud:
                      </span>
                      {health.gemini.available ? (
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Conectado / Chave Ativa
                        </span>
                      ) : (
                        <span className="text-amber-400 font-medium flex items-center gap-1" title={health.gemini.error || ''}>
                          <Info className="w-3.5 h-3.5" /> {health.gemini.error || 'Não disponível'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-purple-400" /> Ollama Local ({config.ollamaEndpoint}):
                      </span>
                      {health.ollama.available ? (
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Online ({health.ollama.models.length} modelos)
                        </span>
                      ) : (
                        <span className="text-slate-400 flex items-center gap-1" title={health.ollama.error || ''}>
                          <AlertCircle className="w-3.5 h-3.5 text-slate-500" /> Offline / Inacessível
                        </span>
                      )}
                    </div>

                    {health.ollama.available && health.ollama.models.length > 0 && (
                      <div className="mt-2 p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                        <span className="text-slate-500 text-[11px] block mb-1">Modelos detectados no Ollama:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {health.ollama.models.map((m) => (
                            <button
                              key={m}
                              onClick={() => setConfig({ ...config, ollamaModel: m })}
                              className={`text-[10px] px-2 py-0.5 rounded border transition-all ${
                                config.ollamaModel === m
                                  ? 'bg-purple-500/20 border-purple-500 text-purple-300 font-bold'
                                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Fallback automático garante que a análise nunca falhe.
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className={`px-5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    savedSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  }`}
                >
                  {savedSuccess ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Salvo!
                    </>
                  ) : (
                    'Salvar Configurações'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AISettingsModal;
