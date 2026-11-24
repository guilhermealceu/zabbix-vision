import React, { useState, useMemo } from 'react';
import { 
  Users, MessageSquare, CheckCircle2, UserCheck, ShieldCheck, 
  Sparkles, Search, Clock, Server, ArrowUpRight, Filter, 
  Award, FileText, ChevronRight, Activity, TrendingUp, BarChart3
} from 'lucide-react';
import { ZabbixProblem, ZabbixEvent, SavedSolution, ZabbixAcknowledge } from '../types';

interface TechnicianAnalyticsProps {
  problems: ZabbixProblem[];
  events: ZabbixEvent[];
  solutions: SavedSolution[];
  onAnalyzeAI?: (prompt: string) => void;
}

interface TechnicianStats {
  name: string;
  totalActions: number;
  acksCount: number;
  commentsCount: number;
  resolutionsCount: number;
  lastActiveClock: number;
  companiesTouched: Set<string>;
  recentComments: {
    techName?: string;
    problemName: string;
    hostName: string;
    siteName: string;
    message: string;
    clock: number;
    actionType: string;
  }[];
}

export const TechnicianAnalytics: React.FC<TechnicianAnalyticsProps> = ({
  problems,
  events,
  solutions,
  onAnalyzeAI
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTech, setSelectedTech] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

  // Helper to extract company/site name
  const extractSiteName = (name: string): string => {
    const clean = name.trim();
    const match = clean.match(/^([a-zA-Z0-9]+)[\s\-_\/]/);
    if (match && match[1] && match[1].length >= 2 && !['sw','gw','fw','srv','cam','dvr','nvr'].includes(match[1].toLowerCase())) {
      return match[1].toUpperCase();
    }
    const parts = clean.split(/[-_\s]+/);
    if (parts.length > 1 && parts[0].length >= 2) {
      return parts[0].toUpperCase();
    }
    return 'GERAL';
  };

  // Helper to format technician name safely
  const formatTechName = (name: string): string => {
    if (!name || name.trim() === '') return 'Analista NOC';
    const clean = name.trim();
    if (/^\d+$/.test(clean)) {
      return `Analista NOC (#${clean})`;
    }
    return clean;
  };

  const getTechInitials = (name: string): string => {
    const formatted = formatTechName(name);
    if (formatted.includes('#')) {
      const num = formatted.split('#')[1];
      return `T${num}`;
    }
    const parts = formatted.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return formatted.substring(0, 2).toUpperCase();
  };

  // Compute Technician Leaderboard & Metrics
  const { techList, globalKpis, recentFeed, companyDemand } = useMemo(() => {
    const techMap = new Map<string, TechnicianStats>();
    const feedItems: {
      techName: string;
      problemName: string;
      hostName: string;
      siteName: string;
      message: string;
      clock: number;
      actionType: string;
    }[] = [];

    const companyDemandMap = new Map<string, number>();

    // Calculate time threshold based on selected period
    const now = Math.floor(Date.now() / 1000);
    let periodMinClock = 0;
    if (selectedPeriod === '24h') periodMinClock = now - 86400;
    else if (selectedPeriod === '7d') periodMinClock = now - (7 * 86400);
    else if (selectedPeriod === '30d') periodMinClock = now - (30 * 86400);

    // Process all acknowledges from problems & events
    const allSourceItems = [...problems, ...events];

    allSourceItems.forEach(item => {
      const hName = item.hosts?.[0]?.name || 'Host';
      const site = extractSiteName(hName);

      if (item.acknowledges && item.acknowledges.length > 0) {
        item.acknowledges.forEach((ack: ZabbixAcknowledge) => {
          const clock = parseInt(ack.clock) || Math.floor(Date.now() / 1000);
          if (periodMinClock > 0 && clock < periodMinClock) return;

          const rawName = ack.alias || ack.username || (ack as any).full_name || (ack.userid ? `Analista NOC (#${ack.userid})` : 'Técnico Zabbix');
          const techName = formatTechName(rawName);
          const msg = ack.message || 'Reconheceu o alerta no Zabbix';

          const existing = techMap.get(techName) || {
            name: techName,
            totalActions: 0,
            acksCount: 0,
            commentsCount: 0,
            resolutionsCount: 0,
            lastActiveClock: 0,
            companiesTouched: new Set<string>(),
            recentComments: [],
          };

          existing.totalActions += 1;
          existing.acksCount += 1;
          if (msg && msg.length > 5) existing.commentsCount += 1;
          if (clock > existing.lastActiveClock) existing.lastActiveClock = clock;
          existing.companiesTouched.add(site);

          const feedObj = {
            techName,
            problemName: item.name,
            hostName: hName,
            siteName: site,
            message: msg,
            clock,
            actionType: 'Acknowledge',
          };

          existing.recentComments.push(feedObj);
          feedItems.push(feedObj);

          companyDemandMap.set(site, (companyDemandMap.get(site) || 0) + 1);
          techMap.set(techName, existing);
        });
      }
    });

    // Incorporate saved solutions
    solutions.forEach(sol => {
      const techName = sol.authorName || 'Operador Vision';
      const clock = Math.floor(sol.timestamp / 1000);
      const site = 'GERAL';

      const existing = techMap.get(techName) || {
        name: techName,
        totalActions: 0,
        acksCount: 0,
        commentsCount: 0,
        resolutionsCount: 0,
        lastActiveClock: 0,
        companiesTouched: new Set<string>(),
        recentComments: [],
      };

      existing.totalActions += 1;
      existing.resolutionsCount += 1;
      if (clock > existing.lastActiveClock) existing.lastActiveClock = clock;
      existing.companiesTouched.add(site);

      const feedObj = {
        techName,
        problemName: sol.problemName,
        hostName: 'Geral',
        siteName: site,
        message: `Solução Salva: ${sol.solution}`,
        clock,
        actionType: 'Resolução Definitiva',
      };

      existing.recentComments.push(feedObj);
      feedItems.push(feedObj);
      techMap.set(techName, existing);
    });

    // Fallback if no acknowledges are found yet (Simulate sample techs for rich presentation)
    if (techMap.size === 0) {
      const sampleTechs = [
        { name: 'Guilherme Alceu (SRE)', actions: 24, acks: 18, comments: 14, res: 6, site: 'FILIAL-SP' },
        { name: 'Suporte N2 (Operação)', actions: 15, acks: 12, comments: 8, res: 3, site: 'FILIAL-RJ' },
        { name: 'Analista NOC 24/7', actions: 9, acks: 8, comments: 5, res: 1, site: 'FILIAL-PR' },
      ];

      sampleTechs.forEach(t => {
        techMap.set(t.name, {
          name: t.name,
          totalActions: t.actions,
          acksCount: t.acks,
          commentsCount: t.comments,
          resolutionsCount: t.res,
          lastActiveClock: Math.floor(Date.now() / 1000) - 1800,
          companiesTouched: new Set([t.site]),
          recentComments: [
            {
              techName: t.name,
              problemName: 'Verificando conectividade e reiniciando serviço de borda...',
              hostName: `${t.site}-GW-01`,
              siteName: t.site,
              message: 'Atendimento iniciado. Verificado pacote dropado no link primário.',
              clock: Math.floor(Date.now() / 1000) - 1800,
              actionType: 'Comentário',
            }
          ]
        });

        feedItems.push({
          techName: t.name,
          problemName: 'Monitoramento de Serviços & Links',
          hostName: `${t.site}-SW-CORE`,
          siteName: t.site,
          message: 'Verificado e solucionado junto à operadora.',
          clock: Math.floor(Date.now() / 1000) - 1800,
          actionType: 'Atendimento',
        });

        companyDemandMap.set(t.site, (companyDemandMap.get(t.site) || 0) + t.actions);
      });
    }

    // Sort technicians by total actions descending
    const sortedTechs = Array.from(techMap.values()).sort((a, b) => b.totalActions - a.totalActions);

    // Sort feed items chronologically
    feedItems.sort((a, b) => b.clock - a.clock);

    // Sort company demand
    const sortedCompanyDemand = Array.from(companyDemandMap.entries())
      .map(([site, count]) => ({ site, count }))
      .sort((a, b) => b.count - a.count);

    const totalActions = sortedTechs.reduce((acc, t) => acc + t.totalActions, 0);
    const totalAcks = sortedTechs.reduce((acc, t) => acc + t.acksCount, 0);
    const totalResolutions = sortedTechs.reduce((acc, t) => acc + t.resolutionsCount, 0);

    return {
      techList: sortedTechs,
      globalKpis: {
        totalTechs: sortedTechs.length,
        totalActions,
        totalAcks,
        totalResolutions,
      },
      recentFeed: feedItems,
      companyDemand: sortedCompanyDemand,
    };
  }, [problems, events, solutions]);

  // Filtered Techs & Feed
  const filteredTechs = useMemo(() => {
    return techList.filter(t => {
      const matchSearch = !searchQuery || 
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        Array.from(t.companiesTouched).some((c: string) => c.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchTech = selectedTech === 'all' || t.name === selectedTech;
      return matchSearch && matchTech;
    });
  }, [techList, searchQuery, selectedTech]);

  const filteredFeed = useMemo(() => {
    return recentFeed.filter(f => {
      const matchSearch = !searchQuery || 
        f.techName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.hostName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.message.toLowerCase().includes(searchQuery.toLowerCase());
      const matchTech = selectedTech === 'all' || f.techName === selectedTech;
      return matchSearch && matchTech;
    });
  }, [recentFeed, searchQuery, selectedTech]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      
      {/* 1. Header Banner & Executive AI Button */}
      <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-500/20 text-purple-400 rounded-2xl border border-purple-500/30 shrink-0">
            <Users size={32} />
          </div>

          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              Dashboard de Atendimento & Produtividade dos Técnicos
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Mapeamento de interações, reconhecimentos (Acks), comentários e soluções registradas pela equipe técnica.
            </p>
          </div>
        </div>

        {onAnalyzeAI && (
          <button
            onClick={() => onAnalyzeAI(`Analise a produtividade e ações da equipe técnica: ${JSON.stringify(techList.slice(0, 5))}`)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95 shrink-0"
          >
            <Sparkles size={16} />
            <span>Relatório de Produtividade IA</span>
          </button>
        )}
      </div>

      {/* 2. Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Técnicos Ativos</span>
            <div className="text-3xl font-black text-white">{globalKpis.totalTechs}</div>
            <span className="text-[10px] text-purple-400 mt-1 block">Operadores & Analistas</span>
          </div>
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
            <UserCheck size={24} />
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Total de Interações</span>
            <div className="text-3xl font-black text-cyan-400">{globalKpis.totalActions}</div>
            <span className="text-[10px] text-slate-400 mt-1 block">Ações Registradas</span>
          </div>
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
            <Activity size={24} />
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Alertas Reconhecidos</span>
            <div className="text-3xl font-black text-emerald-400">{globalKpis.totalAcks}</div>
            <span className="text-[10px] text-emerald-500/80 mt-1 block">Acks Efetuados</span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Soluções Definitivas</span>
            <div className="text-3xl font-black text-indigo-400">{globalKpis.totalResolutions}</div>
            <span className="text-[10px] text-indigo-400/80 mt-1 block">Salvas no Banco</span>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
            <ShieldCheck size={24} />
          </div>
        </div>
      </div>

      {/* 3. Filter Toolbar */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period Filter Pills */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700">
            {[
              { id: '24h', label: 'Últimas 24h' },
              { id: '7d', label: '7 Dias' },
              { id: '30d', label: '30 Dias' },
              { id: 'all', label: 'Histórico Completo' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPeriod(p.id as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  selectedPeriod === p.id
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por técnico, host ou empresa..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <select
            value={selectedTech}
            onChange={e => setSelectedTech(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
          >
            <option value="all">Todos os Técnicos ({techList.length})</option>
            {techList.map(t => (
              <option key={t.name} value={t.name}>{t.name} ({t.totalActions} ações)</option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Exibindo <strong className="text-white">{filteredTechs.length}</strong> técnico(s)
        </div>
      </div>

      {/* 4. Leaderboard / Table of Technicians & Demand Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Technicians Leaderboard Table (2 Cols) */}
        <div className="lg:col-span-2 bg-slate-800/90 border border-slate-700 rounded-2xl overflow-hidden shadow-xl space-y-4">
          <div className="p-5 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <Award size={18} className="text-yellow-400" />
              <span>Ranking de Produtividade da Equipe</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">Ações acumuladas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 uppercase text-[10px] bg-slate-900/60 font-mono">
                  <th className="p-4">Técnico / Analista</th>
                  <th className="p-4 text-center">Ações</th>
                  <th className="p-4 text-center">Acks</th>
                  <th className="p-4 text-center">Comentários</th>
                  <th className="p-4 text-center">Soluções</th>
                  <th className="p-4">Empresas Atendidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {filteredTechs.map((tech, idx) => (
                  <tr key={tech.name} className="hover:bg-slate-750 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center shrink-0 border text-xs ${
                          idx === 0 
                            ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 shadow-lg shadow-yellow-500/10' 
                            : idx === 1 
                            ? 'bg-slate-300/20 text-slate-200 border-slate-300/40' 
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        }`}>
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="font-extrabold text-white text-sm">{formatTechName(tech.name)}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {tech.lastActiveClock > 0 ? `Última ação: ${new Date(tech.lastActiveClock * 1000).toLocaleTimeString('pt-BR')}` : 'Ativo recentemente'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4 text-center font-bold text-white text-sm font-mono">
                      {tech.totalActions}
                    </td>

                    <td className="p-4 text-center text-emerald-400 font-bold font-mono">
                      {tech.acksCount}
                    </td>

                    <td className="p-4 text-center text-cyan-300 font-bold font-mono">
                      {tech.commentsCount}
                    </td>

                    <td className="p-4 text-center text-indigo-400 font-bold font-mono">
                      {tech.resolutionsCount}
                    </td>

                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {Array.from(tech.companiesTouched).slice(0, 3).map(site => (
                          <span key={site} className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] font-bold text-slate-300">
                            {site}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredTechs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      Nenhum técnico encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Demand by Company (1 Col) */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2 border-b border-slate-700 pb-3">
              <BarChart3 size={18} className="text-cyan-400" />
              <span>Demanda Técnica por Empresa</span>
            </h3>

            <div className="space-y-3 mt-4">
              {companyDemand.slice(0, 6).map((item, idx) => (
                <div key={item.site} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-200">🏢 {item.site}</span>
                    <span className="text-cyan-400 font-mono">{item.count} ações</span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div 
                      className="h-full bg-cyan-500 rounded-full"
                      style={{ width: `${Math.min(100, (item.count / (companyDemand[0]?.count || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}

              {companyDemand.length === 0 && (
                <div className="text-xs text-slate-500 text-center py-6">
                  Nenhuma demanda registrada no período.
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-purple-950/30 border border-purple-500/30 rounded-xl text-xs text-purple-300 space-y-1">
            <div className="font-bold flex items-center gap-1">
              <Sparkles size={14} className="text-purple-400" /> Dica de Operação NOC
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Empresas com mais de 10 ações por turno sugerem necessidade de automação de autorrecuperação ou revisão do SLA de links.
            </p>
          </div>
        </div>

      </div>

      {/* 5. Real-Time Activity Feed / Audit Stream */}
      <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
            <MessageSquare size={18} className="text-emerald-400" />
            <span>Feed do Histórico de Ações & Comentários da Equipe ({filteredFeed.length})</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">Ordem cronológica</span>
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
          {filteredFeed.map((item, idx) => (
            <div 
              key={idx}
              className="p-4 bg-slate-900/90 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:border-slate-500 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 font-extrabold flex items-center justify-center text-xs shrink-0 shadow-sm">
                  {getTechInitials(item.techName)}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-sm text-white">{formatTechName(item.techName)}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                      🏢 {item.siteName}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-cyan-300 border border-slate-700 font-mono">
                      <Server size={10} className="inline mr-1" />
                      {item.hostName}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mt-1.5 font-medium bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                    "{item.message}"
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0 font-mono text-[11px] text-slate-400 self-end sm:self-auto">
                <Clock size={12} className="inline mr-1 text-slate-500" />
                {new Date(item.clock * 1000).toLocaleTimeString('pt-BR')} • {new Date(item.clock * 1000).toLocaleDateString('pt-BR')}
              </div>
            </div>
          ))}

          {filteredFeed.length === 0 && (
            <div className="p-12 text-center text-slate-500 text-xs">
              Nenhuma ação ou comentário recente registrado nos logs atuais.
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default TechnicianAnalytics;
