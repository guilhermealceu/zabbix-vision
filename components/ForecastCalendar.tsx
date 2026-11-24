import React, { useState, useMemo } from 'react';
import { ForecastHost, ForecastDay } from '../types';
import { 
  Server, Database, Router, Shield, Wifi, AlertTriangle, 
  TrendingUp, Clock, Calendar, CheckCircle2, ChevronRight, 
  Filter, Search, Info, Flame, ShieldAlert, Sparkles, X
} from 'lucide-react';

interface ForecastCalendarProps {
  data: ForecastHost[];
  onAnalyzeHost?: (hostName: string, hostData: ForecastHost) => void;
  onGenerateAIPrediction?: () => void;
  loadingAI?: boolean;
}

const getHostIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('proxy') || lower.includes('firewall') || lower.includes('pfsense') || lower.includes('forti')) return <Shield size={16} className="text-amber-400" />;
  if (lower.includes('router') || lower.includes('roteador') || lower.includes('mikrotik') || lower.includes('cisco')) return <Router size={16} className="text-blue-400" />;
  if (lower.includes('switch') || lower.includes('ap') || lower.includes('wifi') || lower.includes('unifi')) return <Wifi size={16} className="text-cyan-400" />;
  if (lower.includes('db') || lower.includes('sql') || lower.includes('postgres') || lower.includes('mysql') || lower.includes('oracle')) return <Database size={16} className="text-purple-400" />;
  return <Server size={16} className="text-indigo-400" />;
};

const getRiskBadge = (score: number) => {
  if (score >= 70) return { label: 'Crítico', bg: 'bg-red-500/20 text-red-300 border-red-500/40' };
  if (score >= 40) return { label: 'Alto', bg: 'bg-orange-500/20 text-orange-300 border-orange-500/40' };
  if (score >= 15) return { label: 'Moderado', bg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' };
  return { label: 'Estável', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
};

const getDayHeatColor = (count: number, hasCritical: boolean) => {
  if (count === 0) return 'bg-slate-900/40 border-slate-800 text-slate-600 hover:border-slate-700';
  if (hasCritical || count >= 5) return 'bg-red-950/40 border-red-500/50 text-red-400 hover:bg-red-900/30';
  if (count >= 3) return 'bg-orange-950/40 border-orange-500/50 text-orange-400 hover:bg-orange-900/30';
  if (count >= 1) return 'bg-yellow-950/30 border-yellow-500/40 text-yellow-300 hover:bg-yellow-900/20';
  return 'bg-blue-950/30 border-blue-500/30 text-blue-300';
};

const DAYS_HEADER = [
  { short: 'Seg', full: 'Segunda-feira' },
  { short: 'Ter', full: 'Terça-feira' },
  { short: 'Qua', full: 'Quarta-feira' },
  { short: 'Qui', full: 'Quinta-feira' },
  { short: 'Sex', full: 'Sexta-feira' },
  { short: 'Sáb', full: 'Sábado' },
  { short: 'Dom', full: 'Domingo' }
];

const ForecastCalendar: React.FC<ForecastCalendarProps> = ({ 
  data, 
  onAnalyzeHost, 
  onGenerateAIPrediction,
  loadingAI = false
}) => {
  const [search, setSearch] = useState('');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    host: string;
    dayName: string;
    problems: any[];
  } | null>(null);

  // Compute enriched metrics for each host
  const enrichedHosts = useMemo(() => {
    return data.map(h => {
      let total = 0;
      let criticals = 0;
      let worstDayIdx = 0;
      let maxDayCount = 0;
      const hourDistribution: Record<number, number> = {};

      h.days.forEach((day, idx) => {
        total += day.problems.length;
        if (day.problems.length > maxDayCount) {
          maxDayCount = day.problems.length;
          worstDayIdx = idx;
        }
        day.problems.forEach(p => {
          if (p.severity === '4' || p.severity === '5') criticals++;
          const date = new Date(parseInt(p.clock) * 1000);
          const hr = date.getHours();
          hourDistribution[hr] = (hourDistribution[hr] || 0) + 1;
        });
      });

      // Calculate risk score: 0 to 100 based on frequency, severity weight, and recurrence
      const riskScore = Math.min(100, Math.round((criticals * 25) + (total * 8)));

      let peakHour = 0;
      let maxHrCount = 0;
      Object.entries(hourDistribution).forEach(([hr, count]) => {
        if (count > maxHrCount) {
          maxHrCount = count;
          peakHour = parseInt(hr);
        }
      });

      return {
        ...h,
        totalIncidents: total,
        criticalCount: criticals,
        riskScore,
        worstDayIdx,
        peakHour,
        peakHourCount: maxHrCount
      };
    });
  }, [data]);

  // Overall Global Forecast Metrics
  const summaryMetrics = useMemo(() => {
    const totalEvents = enrichedHosts.reduce((acc, h) => acc + (h.totalIncidents || 0), 0);
    const criticalHosts = enrichedHosts.filter(h => h.riskScore >= 40).length;
    
    // Most vulnerable weekday across all hosts
    const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
    enrichedHosts.forEach(h => {
      h.days.forEach((d, idx) => {
        weekdayTotals[idx] += d.problems.length;
      });
    });

    let maxWdIdx = 0;
    let maxWdVal = 0;
    weekdayTotals.forEach((val, idx) => {
      if (val > maxWdVal) {
        maxWdVal = val;
        maxWdIdx = idx;
      }
    });

    return {
      totalEvents,
      criticalHosts,
      worstDay: DAYS_HEADER[maxWdIdx].full,
      worstDayCount: maxWdVal,
      avgPerHost: enrichedHosts.length ? (totalEvents / enrichedHosts.length).toFixed(1) : '0'
    };
  }, [enrichedHosts]);

  // Filter and Sort
  const filteredHosts = useMemo(() => {
    return enrichedHosts
      .filter(h => {
        const matchesSearch = h.host.toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;
        if (selectedRisk === 'critical') return h.riskScore >= 70;
        if (selectedRisk === 'high') return h.riskScore >= 40 && h.riskScore < 70;
        if (selectedRisk === 'moderate') return h.riskScore >= 15 && h.riskScore < 40;
        if (selectedRisk === 'low') return h.riskScore < 15;
        return true;
      })
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [enrichedHosts, search, selectedRisk]);

  return (
    <div className="space-y-6">
      {/* Forecast Executive Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
            <Calendar size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Incidentes Analisados</div>
            <div className="text-xl font-bold text-white">{summaryMetrics.totalEvents}</div>
            <div className="text-[11px] text-slate-500">Histórico de 30 dias</div>
          </div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Flame size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Dia de Maior Risco</div>
            <div className="text-xl font-bold text-amber-400 truncate">{summaryMetrics.worstDay}</div>
            <div className="text-[11px] text-slate-500">{summaryMetrics.worstDayCount} ocorrências registradas</div>
          </div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center gap-3">
          <div className="p-3 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20">
            <ShieldAlert size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Hosts de Alta Atenção</div>
            <div className="text-xl font-bold text-red-400">{summaryMetrics.criticalHosts}</div>
            <div className="text-[11px] text-slate-500">Probabilidade de reincidência</div>
          </div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Média por Host</div>
            <div className="text-xl font-bold text-indigo-400">{summaryMetrics.avgPerHost}</div>
            <div className="text-[11px] text-slate-500">Incidentes / host monitorado</div>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por nome do host..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 flex items-center gap-1 font-semibold uppercase">
            <Filter size={12} /> Risco:
          </span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'critical', label: 'Crítico' },
            { id: 'high', label: 'Alto' },
            { id: 'moderate', label: 'Moderado' },
            { id: 'low', label: 'Estável' },
          ].map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRisk(r.id)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                selectedRisk === r.id
                  ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Weekly Matrix Calendar */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
        {/* Table Header */}
        <div className="grid grid-cols-12 border-b border-slate-700 bg-slate-900/80 text-xs font-semibold text-slate-300 uppercase tracking-wider">
          <div className="col-span-4 p-3.5 flex items-center gap-2">
            <Server size={14} className="text-slate-400" />
            Host / Grau de Risco
          </div>
          <div className="col-span-1 p-3.5 text-center border-l border-slate-700/60">
            Total
          </div>
          {DAYS_HEADER.map(d => (
            <div key={d.short} className="col-span-1 p-3.5 text-center border-l border-slate-700/60 font-bold">
              {d.short}
            </div>
          ))}
        </div>

        {/* Table Rows */}
        <div className="max-h-[580px] overflow-y-auto divide-y divide-slate-700/60">
          {filteredHosts.map((hostData, idx) => {
            const risk = getRiskBadge(hostData.riskScore);

            return (
              <div
                key={hostData.host + idx}
                className="grid grid-cols-12 hover:bg-slate-700/20 transition-colors items-center"
              >
                {/* Host Column */}
                <div className="col-span-4 p-3 flex items-center justify-between gap-2 overflow-hidden">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="shrink-0">{getHostIcon(hostData.host)}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate" title={hostData.host}>
                        {hostData.host}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <Clock size={11} className="text-slate-500" />
                        Pico às {String(hostData.peakHour).padStart(2, '0')}:00h
                      </div>
                    </div>
                  </div>

                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${risk.bg}`}>
                    {risk.label} ({hostData.riskScore}%)
                  </span>
                </div>

                {/* Total Incidents Column */}
                <div className="col-span-1 p-3 text-center border-l border-slate-700/40 font-bold text-sm text-slate-200">
                  {hostData.totalIncidents}
                </div>

                {/* Days of week columns */}
                {hostData.days.map((day, dIdx) => {
                  const count = day.problems.length;
                  const hasCritical = day.problems.some(p => p.severity === '4' || p.severity === '5');
                  const heatStyle = getDayHeatColor(count, hasCritical);

                  return (
                    <div
                      key={dIdx}
                      onClick={() => {
                        if (count > 0) {
                          setSelectedDayDetail({
                            host: hostData.host,
                            dayName: DAYS_HEADER[dIdx].full,
                            problems: day.problems
                          });
                        }
                      }}
                      className={`col-span-1 p-2 border-l border-slate-700/40 min-h-[56px] flex flex-col items-center justify-center transition-all ${
                        count > 0 ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
                      }`}
                    >
                      <div
                        className={`w-full h-9 rounded-lg border flex flex-col items-center justify-center transition-all ${heatStyle}`}
                        title={count > 0 ? `${count} incidentes na ${DAYS_HEADER[dIdx].full} (Clique para detalhes)` : 'Nenhum incidente'}
                      >
                        {count > 0 ? (
                          <>
                            <span className="text-xs font-bold leading-none">{count}</span>
                            <span className="text-[9px] opacity-75 font-semibold">alertas</span>
                          </>
                        ) : (
                          <span className="text-[11px] opacity-20">-</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {filteredHosts.length === 0 && (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <CheckCircle2 size={36} className="mx-auto text-emerald-500/40" />
              <p className="text-sm font-medium">Nenhum host encontrado com os filtros aplicados.</p>
            </div>
          )}
        </div>
      </div>

      {/* Legend & Advice */}
      <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-semibold text-slate-300">Legenda de Probabilidade:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-500/80"></span> Crítico / Recorrente (5+)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-orange-500/80"></span> Risco Alto (3-4)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-yellow-500/80"></span> Risco Moderado (1-2)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700"></span> Estável (0)
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-slate-500">
          <Info size={14} />
          Clique em qualquer dia colorido para ver o histórico detalhado do host.
        </div>
      </div>

      {/* Day Details Modal */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-800/60">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Server size={18} className="text-indigo-400" />
                  {selectedDayDetail.host}
                </h3>
                <p className="text-xs text-slate-400">
                  Incidentes registrados na <span className="text-indigo-300 font-semibold">{selectedDayDetail.dayName}</span> ({selectedDayDetail.problems.length} total)
                </p>
              </div>
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-2.5 flex-1 divide-y divide-slate-800/80">
              {selectedDayDetail.problems.map((p, idx) => (
                <div key={idx} className="pt-2.5 first:pt-0 flex items-start gap-3">
                  <div className="p-1.5 bg-slate-800 rounded-lg text-slate-400 shrink-0 text-xs font-mono">
                    {p.time || new Date(parseInt(p.clock) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200">{p.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Severidade: {['Não classificado', 'Informação', 'Aviso', 'Média', 'Alta', 'Desastre'][parseInt(p.severity)] || 'Desconhecida'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-slate-950/70 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForecastCalendar;
