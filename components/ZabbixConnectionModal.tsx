import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Server, Key, User, Plus, Trash2, Edit3, CheckCircle2, 
  AlertCircle, RefreshCw, Layers, Check, ExternalLink, ShieldCheck
} from 'lucide-react';
import { ZabbixServerConfig } from '../types';
import { ZabbixService } from '../services/zabbixService';

interface ZabbixConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  servers: ZabbixServerConfig[];
  activeServerId: string | 'all';
  onSelectActiveServer: (id: string | 'all') => void;
  onSaveServer: (server: ZabbixServerConfig) => void;
  onDeleteServer: (id: string) => void;
}

const SERVER_COLORS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#6366f1', // Indigo
];

const ZabbixConnectionModal: React.FC<ZabbixConnectionModalProps> = ({
  isOpen,
  onClose,
  servers,
  activeServerId,
  onSelectActiveServer,
  onSaveServer,
  onDeleteServer,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authType, setAuthType] = useState<'token' | 'userpass'>('token');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [color, setColor] = useState(SERVER_COLORS[0]);
  const [detectedVersion, setDetectedVersion] = useState<string | undefined>(undefined);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    version?: string;
    error?: string;
  } | null>(null);

  const handleStartAdd = () => {
    setIsEditing(true);
    setEditingId(null);
    setName(`Servidor Zabbix ${servers.length + 1}`);
    setUrl('');
    setAuthType('token');
    setToken('');
    setUsername('');
    setPassword('');
    setColor(SERVER_COLORS[servers.length % SERVER_COLORS.length]);
    setDetectedVersion(undefined);
    setTestResult(null);
  };

  const handleStartEdit = (srv: ZabbixServerConfig) => {
    setIsEditing(true);
    setEditingId(srv.id);
    setName(srv.name || '');
    setUrl(srv.url || '');
    if (srv.token) {
      setAuthType('token');
      setToken(srv.token);
    } else {
      setAuthType('userpass');
      setUsername(srv.username || '');
      setPassword(srv.password || '');
    }
    setColor(srv.color || SERVER_COLORS[0]);
    setDetectedVersion(srv.version);
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    const res = await ZabbixService.testConnection(
      url,
      authType === 'token' ? token : undefined,
      authType === 'userpass' ? username : undefined,
      authType === 'userpass' ? password : undefined
    );

    if (res.success && res.version) {
      setDetectedVersion(res.version);
    }

    setTestResult(res);
    setTesting(false);
  };

  const handleSave = () => {
    if (!url.trim()) return;

    const newServer: ZabbixServerConfig = {
      id: editingId || Date.now().toString(),
      name: name.trim() || `Zabbix ${servers.length + 1}`,
      url: url.trim(),
      token: authType === 'token' ? token.trim() : undefined,
      username: authType === 'userpass' ? username.trim() : undefined,
      password: authType === 'userpass' ? password : undefined,
      version: detectedVersion || testResult?.version,
      color: color,
      enabled: true,
    };

    onSaveServer(newServer);
    setIsEditing(false);
    setEditingId(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden text-slate-200 flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-slate-800/20 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
                  <Server className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Servidores Zabbix Conectados</h3>
                  <p className="text-xs text-slate-400">
                    Gerencie múltiplos ambientes Zabbix (suporta diferentes versões e visualização unificada)
                  </p>
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
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* If in List Mode */}
              {!isEditing ? (
                <div className="space-y-4">
                  {/* Action Bar */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                      Ambientes Cadastrados ({servers.length})
                    </span>
                    <button
                      onClick={handleStartAdd}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                      <Plus size={14} /> Adicionar Servidor
                    </button>
                  </div>

                  {/* Unified Mode Card */}
                  {servers.length > 1 && (
                    <div
                      onClick={() => onSelectActiveServer('all')}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        activeServerId === 'all'
                          ? 'bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-purple-500 ring-1 ring-purple-500 shadow-md'
                          : 'bg-slate-800/60 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-500/30">
                          <Layers size={20} />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white flex items-center gap-2">
                            Visão Global Unificada
                            <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30">
                              Todos ({servers.length})
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            Consolida hosts, problemas e previsões de todos os servidores Zabbix simultaneamente.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeServerId === 'all' && (
                          <span className="text-xs text-purple-300 font-bold flex items-center gap-1">
                            <CheckCircle2 size={16} /> Ativo
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Server List Cards */}
                  <div className="space-y-2.5">
                    {servers.map((srv) => {
                      const isActive = activeServerId === srv.id;
                      return (
                        <div
                          key={srv.id}
                          className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                            isActive
                              ? 'bg-blue-600/10 border-blue-500 shadow-md ring-1 ring-blue-500'
                              : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          <div
                            onClick={() => onSelectActiveServer(srv.id)}
                            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                          >
                            <div
                              className="w-3.5 h-10 rounded-full shrink-0"
                              style={{ backgroundColor: srv.color || '#3b82f6' }}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-white truncate">{srv.name}</span>
                                {srv.version && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 border border-slate-700 font-mono">
                                    v{srv.version}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 truncate font-mono mt-0.5">{srv.url}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isActive ? (
                              <span className="text-xs text-blue-400 font-bold px-2.5 py-1 bg-blue-500/10 rounded-lg border border-blue-500/20 flex items-center gap-1">
                                <Check size={14} /> Ativo
                              </span>
                            ) : (
                              <button
                                onClick={() => onSelectActiveServer(srv.id)}
                                className="text-xs text-slate-300 hover:text-white px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
                              >
                                Selecionar
                              </button>
                            )}

                            <button
                              onClick={() => handleStartEdit(srv)}
                              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                              title="Editar Servidor"
                            >
                              <Edit3 size={15} />
                            </button>

                            <button
                              onClick={() => onDeleteServer(srv.id)}
                              className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition-colors"
                              title="Remover Servidor"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {servers.length === 0 && (
                      <div className="p-10 text-center text-slate-500 space-y-3 bg-slate-950/40 rounded-xl border border-slate-800">
                        <Server size={36} className="mx-auto text-slate-600" />
                        <p className="text-sm font-medium text-slate-300">Nenhum servidor Zabbix configurado.</p>
                        <button
                          onClick={handleStartAdd}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                        >
                          Adicionar Primeiro Servidor
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Add / Edit Form */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Edit3 size={16} className="text-blue-400" />
                      {editingId ? 'Editar Servidor Zabbix' : 'Adicionar Novo Servidor Zabbix'}
                    </h4>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Voltar para a Lista
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Identificação / Nome do Ambiente
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Produção Matriz, Filial Sul..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Cor de Destaque
                      </label>
                      <div className="flex items-center gap-2 h-9">
                        {SERVER_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className={`w-6 h-6 rounded-full border-2 transition-transform ${
                              color === c ? 'scale-125 border-white ring-2 ring-blue-500' : 'border-transparent hover:scale-110'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      URL da API JSON-RPC
                    </label>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://zabbix.suaempresa.com.br/api_jsonrpc.php"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Método de Autenticação
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAuthType('token')}
                        className={`py-2 px-3 text-xs font-semibold rounded-xl border flex items-center justify-center gap-2 transition-all ${
                          authType === 'token'
                            ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Key size={14} /> Token de API
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthType('userpass')}
                        className={`py-2 px-3 text-xs font-semibold rounded-xl border flex items-center justify-center gap-2 transition-all ${
                          authType === 'userpass'
                            ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        <User size={14} /> Usuário e Senha
                      </button>
                    </div>
                  </div>

                  {authType === 'token' ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Token de Acesso (API Token)
                      </label>
                      <input
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Cole seu token do Zabbix aqui..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                          Usuário Zabbix
                        </label>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Admin"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                          Senha
                        </label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Test Result Feedback */}
                  {testResult && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                        testResult.success
                          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                          : 'bg-red-950/40 border-red-500/50 text-red-300'
                      }`}
                    >
                      {testResult.success ? (
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-semibold">
                          {testResult.success ? 'Conexão validada com sucesso!' : 'Falha na conexão'}
                        </div>
                        {testResult.version && (
                          <div className="text-[11px] opacity-80 mt-0.5">
                            Versão Zabbix detectada: <strong>{testResult.version}</strong>
                          </div>
                        )}
                        {testResult.error && (
                          <div className="text-[11px] opacity-90 mt-0.5">{testResult.error}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing || !url}
                    className="px-3.5 py-2 text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={testing ? 'animate-spin' : ''} />
                    Testar Conexão
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!url.trim()}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    >
                      Salvar Servidor
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs text-slate-500">
                    Você pode alternar entre servidores a qualquer momento pelo cabeçalho.
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-all"
                  >
                    Concluir
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ZabbixConnectionModal;
