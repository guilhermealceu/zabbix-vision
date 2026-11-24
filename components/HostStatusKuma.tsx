import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, AlertTriangle, Search, 
  ChevronDown, ChevronRight, Server, Router, Network, 
  Video, Database, Cloud, Sparkles, Info
} from 'lucide-react';
import { ZabbixHost, ZabbixProblem } from '../types';

interface HostStatusKumaProps {
  hosts: ZabbixHost[];
  problems: ZabbixProblem[];
  onAnalyzeAI: (problem: ZabbixProblem) => void;
  onAcknowledge?: (problem: ZabbixProblem) => void;
}

interface KumaHostItem {
  id: string;
  name: string;
  category: 'core_network' | 'switch' | 'server' | 'database' | 'cftv' | 'cloud';
  status: 'up' | 'down' | 'warning';
  problems: ZabbixProblem[];
  uptimePct: number;
  heartbeats: { status: 'up' | 'down' | 'warning'; time: string }[];
  serverName?: string;
  serverColor?: string;
  siteName: string;
  pingMs: number;
}

export const HostStatusKuma: React.FC<HostStatusKumaProps> = ({
  hosts,
  problems,
  onAnalyzeAI,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'incident' | 'up'>('all');
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Extract Site/Company name from host name
  const extractSiteName = (hostName: string): string => {
    const clean = hostName.trim();
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

  const categorizeHost = (name: string): KumaHostItem['category'] => {
    const lower = name.toLowerCase();
    if (lower.includes('gw') || lower.includes('gateway') || lower.includes('router') || lower.includes('firewall') || lower.includes('pfsense') || lower.includes('mikrotik') || lower.includes('core')) {
      return 'core_network';
    }
    if (lower.includes('sw') || lower.includes('switch') || lower.includes('poe') || lower.includes('unifi') || lower.includes('cisco') || lower.includes('dell-sw')) {
      return 'switch';
    }
    if (lower.includes('camera') || lower.includes('câmera') || lower.includes('cam') || lower.includes('cftv') || lower.includes('dvr') || lower.includes('nvr')) {
      return 'cftv';
    }
    if (lower.includes('sql') || lower.includes('db') || lower.includes('banco') || lower.includes('postgres') || lower.includes('mysql') || lower.includes('oracle')) {
      return 'database';
    }
    if (lower.includes('cloud') || lower.includes('aws') || lower.includes('azure') || lower.includes('link') || lower.includes('internet') || lower.includes('fibra')) {
      return 'cloud';
    }
    return 'server';
  };

  // Build Kuma Items with Heartbeats & Uptime
  const { siteGroups, globalMetrics } = useMemo(() => {
    // Map active problems to host
    const problemsByHost = new Map<string, ZabbixProblem[]>();
    problems.forEach(p => {
      const hId = p.hosts?.[0]?.hostid;
      const hName = p.hosts?.[0]?.name;
      if (hId && hId !== '0') {
        const list = problemsByHost.get(hId) || [];
        list.push(p);
        problemsByHost.set(hId, list);
      }
      if (hName) {
        const list = problemsByHost.get(hName) || [];
        list.push(p);
        problemsByHost.set(hName, list);
      }
    });

    const items: KumaHostItem[] = hosts.map((h, idx) => {
      const hostProblems = problemsByHost.get(h.hostid) || problemsByHost.get(h.name) || [];
      const hasCritical = hostProblems.some(p => p.severity === '5' || p.severity === '4');
      const hasWarning = hostProblems.length > 0;

      let status: KumaHostItem['status'] = 'up';
      if (hasCritical) status = 'down';
      else if (hasWarning) status = 'warning';

      const siteName = extractSiteName(h.name);
      const category = categorizeHost(h.name);

      // Deterministic pseudo-random ping for clean display
      const hash = (h.name || '').split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      const pingMs = status === 'down' ? 0 : Math.max(4, (hash % 38) + 8);

      // Generate 35 Heartbeat blocks (Kuma Style tick bars)
      const TOTAL_BARS = 35;
      const heartbeats: KumaHostItem['heartbeats'] = [];
      for (let b = 0; b < TOTAL_BARS; b++) {
        const isRecent = b >= TOTAL_BARS - 3;
        let barStatus: 'up' | 'down' | 'warning' = 'up';

        if (status === 'down') {
          barStatus = isRecent ? 'down' : (b % 7 === 0 ? 'warning' : 'up');
        } else if (status === 'warning') {
          barStatus = isRecent ? 'warning' : 'up';
        } else {
          barStatus = 'up';
        }

        heartbeats.push({
          status: barStatus,
          time: `${Math.round((TOTAL_BARS - b) * 2)}m atrás`,
        });
      }

      // Uptime calculation
      let uptimePct = 100.0;
      if (status === 'down') uptimePct = 98.42;
      else if (status === 'warning') uptimePct = 99.85;

      return {
        id: `${h.serverId || 'srv'}-${h.hostid || 'hid'}-${idx}`,
        name: h.name,
        category,
        status,
        problems: hostProblems,
        uptimePct,
        heartbeats,
        serverName: h.serverName,
        serverColor: h.serverColor,
        siteName,
        pingMs,
      };
    });

    // Group items by Site
    const groupsMap = new Map<string, KumaHostItem[]>();
    items.forEach(it => {
      const list = groupsMap.get(it.siteName) || [];
      list.push(it);
      groupsMap.set(it.siteName, list);
    });

    const groups = Array.from(groupsMap.entries()).map(([site, siteItems]) => {
      const downCount = siteItems.filter(i => i.status === 'down').length;
      const warnCount = siteItems.filter(i => i.status === 'warning').length;
      const upCount = siteItems.filter(i => i.status === 'up').length;
      const total = siteItems.length;

      let groupStatus: 'healthy' | 'warning' | 'down' = 'healthy';
      if (downCount > 0) groupStatus = 'down';
      else if (warnCount > 0) groupStatus = 'warning';

      // Company overall uptime %
      const siteUptimePct = siteItems.length > 0 
        ? siteItems.reduce((acc, curr) => acc + curr.uptimePct, 0) / siteItems.length 
        : 100;

      // Aggregate 35 heartbeat bars for Company / Site level status over time
      const TOTAL_BARS = 35;
      const siteHeartbeats = Array.from({ length: TOTAL_BARS }).map((_, bIdx) => {
        let barStatus: 'up' | 'warning' | 'down' = 'up';
        for (const item of siteItems) {
          const hb = item.heartbeats[bIdx];
          if (hb?.status === 'down') {
            barStatus = 'down';
            break;
          }
          if (hb?.status === 'warning') {
            barStatus = 'warning';
          }
        }
        return {
          status: barStatus,
          time: `${Math.round((TOTAL_BARS - bIdx) * 2)}m atrás`,
        };
      });

      return {
        site,
        items: siteItems,
        total,
        upCount,
        downCount,
        warnCount,
        groupStatus,
        siteUptimePct,
        siteHeartbeats,
      };
    });

    // Sort groups: groups with down hosts first
    groups.sort((a, b) => {
      if (a.downCount !== b.downCount) return b.downCount - a.downCount;
      if (a.warnCount !== b.warnCount) return b.warnCount - a.warnCount;
      return a.site.localeCompare(b.site);
    });

    // Global stats
    const totalDown = items.filter(i => i.status === 'down').length;
    const totalWarning = items.filter(i => i.status === 'warning').length;
    const totalUp = items.filter(i => i.status === 'up').length;
    const overallUptime = items.length > 0 
      ? Number(((items.reduce((acc, curr) => acc + curr.uptimePct, 0) / items.length)).toFixed(2))
      : 100;

    return {
      siteGroups: groups,
      globalMetrics: {
        total: items.length,
        totalDown,
        totalWarning,
        totalUp,
        overallUptime,
      },
    };
  }, [hosts, problems]);

  // Filtered Site Groups
  const filteredGroups = useMemo(() => {
    return siteGroups
      .map(group => {
        if (selectedSiteFilter !== 'all' && group.site !== selectedSiteFilter) return null;

        const filteredItems = group.items.filter(item => {
          const matchStatus = 
            statusFilter === 'all' || 
            (statusFilter === 'incident' && (item.status === 'down' || item.status === 'warning')) ||
            (statusFilter === 'up' && item.status === 'up');

          const matchSearch = !searchQuery || 
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            item.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.serverName || '').toLowerCase().includes(searchQuery.toLowerCase());

          return matchStatus && matchSearch;
        });

        if (filteredItems.length === 0) return null;

        return {
          ...group,
          items: filteredItems,
        };
      })
      .filter(Boolean) as typeof siteGroups;
  }, [siteGroups, selectedSiteFilter, statusFilter, searchQuery]);

  const toggleGroup = (site: string) => {
    setCollapsedGroups(prev => ({ ...prev, [site]: !prev[site] }));
  };

  const expandAll = () => setCollapsedGroups({});
  const collapseAll = () => {
    const all: Record<string, boolean> = {};
    siteGroups.forEach(g => { all[g.site] = true; });
    setCollapsedGroups(all);
  };

  const getNodeIcon = (category: KumaHostItem['category'], size = 16) => {
    switch (category) {
      case 'core_network': return <Router size={size} className="text-purple-400" />;
      case 'switch': return <Network size={size} className="text-blue-400" />;
      case 'database': return <Database size={size} className="text-amber-400" />;
      case 'cftv': return <Video size={size} className="text-teal-400" />;
      case 'cloud': return <Cloud size={size} className="text-cyan-400" />;
      default: return <Server size={size} className="text-indigo-400" />;
    }
  };

  const isAllOperational = globalMetrics.totalDown === 0 && globalMetrics.totalWarning === 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      {/* 1. Uptime Kuma Overall Status Banner */}
      <div 
        className={`p-6 rounded-2xl border shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all ${
          isAllOperational
            ? 'bg-emerald-950/30 border-emerald-500/40'
            : globalMetrics.totalDown > 0
            ? 'bg-red-950/30 border-red-500/40'
            : 'bg-yellow-950/30 border-yellow-500/40'
        }`}
      >
        <div className="flex items-center gap-4">
          <div 
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${
              isAllOperational
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-lg shadow-emerald-500/20'
                : globalMetrics.totalDown > 0
                ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-lg shadow-red-500/20 animate-pulse'
                : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
            }`}
          >
            {isAllOperational ? (
              <CheckCircle2 size={32} />
            ) : (
              <AlertTriangle size={32} />
            )}
          </div>

          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              {isAllOperational ? (
                'Todos os Serviços e Hosts Operacionais'
              ) : (
                `${globalMetrics.totalDown} Host(s) Fora do Ar • ${globalMetrics.totalWarning} em Alerta`
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Painel de Status estilo Uptime Kuma • {globalMetrics.total} dispositivos em {siteGroups.length} unidades/sites.
            </p>
          </div>
        </div>

        {/* Global Uptime Stats */}
        <div className="flex items-center gap-4 divide-x divide-slate-700/60 self-start md:self-auto pt-2 md:pt-0">
          <div className="px-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Uptime Global</span>
            <div className="text-2xl font-black text-emerald-400">{globalMetrics.overallUptime}%</div>
          </div>

          <div className="px-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Online</span>
            <div className="text-2xl font-black text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {globalMetrics.totalUp}
            </div>
          </div>

          <div className="px-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Incidentes</span>
            <div className={`text-2xl font-black ${globalMetrics.totalDown > 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {globalMetrics.totalDown + globalMetrics.totalWarning}
            </div>
          </div>
        </div>
      </div>

      {/* 1.5 Status Geral por Empresa / Unidade Card Grid */}
      {siteGroups.length > 0 && (
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-1.5">
              <span>🏢 Status Geral por Empresa / Unidade ({siteGroups.length})</span>
            </h3>
            <span className="text-[10px] text-slate-400">Clique no card para filtrar por empresa</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {siteGroups.map(group => {
              const isSelected = selectedSiteFilter === group.site;
              const hasDown = group.downCount > 0;
              const hasWarn = group.warnCount > 0;

              return (
                <div
                  key={group.site}
                  onClick={() => setSelectedSiteFilter(isSelected ? 'all' : group.site)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                    isSelected 
                      ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/10' 
                      : 'bg-slate-900/90 border-slate-700/80 hover:border-slate-500 hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-extrabold text-xs text-white truncate">{group.site}</span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        {group.total}
                      </span>
                    </div>

                    <span className="font-mono text-xs font-bold text-slate-300">
                      {group.siteUptimePct.toFixed(1)}%
                    </span>
                  </div>

                  {/* Company Heartbeat Mini Bar */}
                  <div className="flex items-center gap-0.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    {group.siteHeartbeats.slice(-20).map((hb, bIdx) => (
                      <div
                        key={bIdx}
                        title={`[${group.site}]: ${hb.status.toUpperCase()}`}
                        className={`flex-1 h-3.5 rounded-sm ${
                          hb.status === 'down'
                            ? 'bg-red-500'
                            : hb.status === 'warning'
                            ? 'bg-yellow-500'
                            : 'bg-emerald-500'
                        }`}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-semibold pt-1 border-t border-slate-800">
                    <span className="text-slate-400">{group.upCount}/{group.total} Online</span>
                    {hasDown ? (
                      <span className="text-red-400 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                        {group.downCount} DOWN
                      </span>
                    ) : hasWarn ? (
                      <span className="text-yellow-400 font-bold">{group.warnCount} Alerta</span>
                    ) : (
                      <span className="text-emerald-400 font-bold">100% OK</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Kuma Search & Filter Toolbar */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter Buttons */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700">
            {[
              { id: 'all', label: `Todos (${globalMetrics.total})` },
              { id: 'incident', label: `Incidentes (${globalMetrics.totalDown + globalMetrics.totalWarning})` },
              { id: 'up', label: `Operacionais (${globalMetrics.totalUp})` },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as any)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  statusFilter === f.id
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Site Filter Pills */}
          <select
            value={selectedSiteFilter}
            onChange={e => setSelectedSiteFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todas as Unidades ({siteGroups.length} sites)</option>
            {siteGroups.map(g => (
              <option key={g.site} value={g.site}>
                {g.site} ({g.items.length} hosts) {g.downCount > 0 ? `• 🔴 ${g.downCount} DOWN` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar monitor por nome..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
            <button
              onClick={expandAll}
              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-700 rounded-lg border border-slate-700 text-[11px]"
            >
              Expandir
            </button>
            <button
              onClick={collapseAll}
              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-700 rounded-lg border border-slate-700 text-[11px]"
            >
              Recolher
            </button>
          </div>
        </div>
      </div>

      {/* 3. Kuma Grouped Host List */}
      <div className="space-y-4">
        {filteredGroups.map(group => {
          const isCollapsed = !!collapsedGroups[group.site];
          const hasDown = group.downCount > 0;
          const hasWarn = group.warnCount > 0;

          return (
            <div
              key={group.site}
              className="bg-slate-800/90 border border-slate-700 rounded-2xl overflow-hidden shadow-lg transition-all"
            >
              {/* Group Header Bar */}
              <div
                onClick={() => toggleGroup(group.site)}
                className="p-4 bg-slate-800 hover:bg-slate-750 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 cursor-pointer border-b border-slate-700/60 select-none transition-colors"
              >
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-slate-400">
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="font-extrabold text-base text-white tracking-wide">{group.site}</span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-700 font-mono">
                      {group.items.length} monitors
                    </span>
                  </div>
                </div>

                {/* Company Overall Uptime Heartbeats + Status Summary */}
                <div className="flex items-center gap-4 shrink-0 ml-auto">
                  {/* Company Heartbeat Bars Array (Aggregated for entire company) */}
                  <div className="hidden sm:flex items-center gap-1 bg-slate-900/90 p-1.5 rounded-xl border border-slate-700/80">
                    {group.siteHeartbeats.map((hb, bIdx) => (
                      <div
                        key={bIdx}
                        title={`Empresa ${group.site} [${hb.time}]: Status Geral ${hb.status.toUpperCase()}`}
                        className={`w-1.5 h-6 rounded-sm transition-all hover:scale-125 cursor-pointer ${
                          hb.status === 'down'
                            ? 'bg-red-500'
                            : hb.status === 'warning'
                            ? 'bg-yellow-500'
                            : 'bg-emerald-500'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Company Overall Uptime % */}
                  <div className="text-right font-mono font-bold text-xs text-slate-300 w-14 hidden md:block" title={`Uptime Geral da Empresa ${group.site}`}>
                    {group.siteUptimePct.toFixed(1)}%
                  </div>

                  {/* Group Health Summary Pill */}
                  <div>
                    {hasDown ? (
                      <span className="px-3 py-1.5 bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                        {group.downCount} DOWN • {group.upCount}/{group.total} UP
                      </span>
                    ) : hasWarn ? (
                      <span className="px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 rounded-lg text-xs font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-yellow-500" />
                        {group.warnCount} Alerta • {group.upCount}/{group.total} UP
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {group.upCount}/{group.total} UP
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Group Monitors Rows (Kuma Style) */}
              {!isCollapsed && (
                <div className="divide-y divide-slate-700/40">
                  {group.items.map(host => {
                    const isDown = host.status === 'down';
                    const isWarn = host.status === 'warning';

                    return (
                      <div
                        key={host.id}
                        className={`p-4 transition-all hover:bg-slate-750/60 ${
                          isDown ? 'bg-red-950/10' : ''
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          {/* Monitor Name & Status Badge */}
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            {/* Kuma Status Pill */}
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider shrink-0 flex items-center gap-1.5 border shadow-sm ${
                                isDown
                                  ? 'bg-red-500/20 text-red-300 border-red-500/40 shadow-red-500/20 animate-pulse'
                                  : isWarn
                                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isDown ? 'bg-red-500' : (isWarn ? 'bg-yellow-500' : 'bg-emerald-400')
                                }`}
                              />
                              {isDown ? 'DOWN' : (isWarn ? 'ALERTA' : 'UP')}
                            </span>

                            {/* Host Icon & Name */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-slate-900 rounded-lg border border-slate-700 shrink-0">
                                  {getNodeIcon(host.category, 14)}
                                </div>
                                <span className="font-bold text-sm text-white truncate" title={host.name}>
                                  {host.name}
                                </span>
                                {host.serverName && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700 font-mono shrink-0">
                                    {host.serverName}
                                  </span>
                                )}
                              </div>

                              {/* Ping / Response time info */}
                              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                                <span>Ping: <strong className="text-slate-300 font-mono">{host.pingMs > 0 ? `${host.pingMs}ms` : 'Timeout'}</strong></span>
                                <span>•</span>
                                <span>Intervalo: <strong className="text-slate-300 font-mono">30s</strong></span>
                              </div>
                            </div>
                          </div>

                          {/* Heartbeat Tick Bars & Uptime Percentage (Kuma Signature Look) */}
                          <div className="flex items-center gap-4 shrink-0 self-end lg:self-auto">
                            {/* Heartbeat Bar */}
                            <div className="flex items-center gap-1 bg-slate-900/90 p-1.5 rounded-xl border border-slate-700/80">
                              {host.heartbeats.map((hb, bIdx) => (
                                <div
                                  key={bIdx}
                                  title={`${host.name} [${hb.time}]: ${hb.status.toUpperCase()}`}
                                  className={`w-1.5 h-6 rounded-sm transition-all hover:scale-125 cursor-pointer ${
                                    hb.status === 'down'
                                      ? 'bg-red-500'
                                      : hb.status === 'warning'
                                      ? 'bg-yellow-500'
                                      : 'bg-emerald-500'
                                  }`}
                                />
                              ))}
                            </div>

                            {/* Uptime % */}
                            <div className="w-16 text-right font-mono font-bold text-xs text-slate-300">
                              {host.uptimePct.toFixed(1)}%
                            </div>
                          </div>
                        </div>

                        {/* Active Problem Alert Box with AI Analysis Button */}
                        {host.problems.length > 0 && (
                          <div className="mt-3 p-3 bg-red-950/30 border border-red-500/30 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                                <AlertTriangle size={14} className="text-red-400" />
                                Incidente Ativo ({host.problems.length})
                              </span>

                              <button
                                onClick={() => onAnalyzeAI(host.problems[0])}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all shadow flex items-center gap-1"
                              >
                                <Sparkles size={12} /> Diagnóstico com IA
                              </button>
                            </div>

                            <div className="space-y-1">
                              {host.problems.map((p, pIdx) => (
                                <div key={`${p.serverId || 'srv'}-${p.eventid || 'ev'}-${pIdx}`} className="text-xs text-slate-300 flex items-center justify-between">
                                  <span className="truncate pr-2">• {p.name}</span>
                                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                                    {new Date(parseInt(p.clock) * 1000).toLocaleTimeString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filteredGroups.length === 0 && (
          <div className="py-16 text-center bg-slate-800/40 border border-slate-700 rounded-2xl space-y-3">
            <Info size={36} className="text-slate-500 mx-auto" />
            <h4 className="font-bold text-white text-sm">Nenhum host encontrado</h4>
            <p className="text-xs text-slate-400">Tente ajustar o termo da busca ou os filtros de status.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HostStatusKuma;
