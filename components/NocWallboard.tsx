import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Tv, Play, Pause, ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Volume2, VolumeX, AlertTriangle, CheckCircle2, Server, Activity,
  Clock, Sparkles, Layers, ShieldAlert, Radio, RefreshCw, X
} from 'lucide-react';
import { ZabbixHost, ZabbixProblem, ZabbixEvent } from '../types';

interface NocWallboardProps {
  hosts: ZabbixHost[];
  problems: ZabbixProblem[];
  events?: ZabbixEvent[];
  lastRefreshed?: Date | null;
  onClose?: () => void;
  onAnalyzeAI?: (problem: ZabbixProblem) => void;
}

interface CompanySummary {
  siteName: string;
  totalHosts: number;
  upHosts: number;
  downHosts: number;
  warnHosts: number;
  uptimePct: number;
  problems: ZabbixProblem[];
  heartbeats: { status: 'up' | 'down' | 'warning'; time: string }[];
}

export const NocWallboard: React.FC<NocWallboardProps> = ({
  hosts,
  problems,
  events = [],
  lastRefreshed,
  onClose,
  onAnalyzeAI
}) => {
  // Navigation & Carousel State
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [intervalSec, setIntervalSec] = useState<number>(15);
  const [timeLeft, setTimeLeft] = useState<number>(15);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);

  // Live Clock Update
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setCurrentDate(now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Extract Company Groups & Stats
  const { companySummaries, globalMetrics, totalSlides } = useMemo(() => {
    // Map problems to hosts
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

    // Extract site name helper
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

    // Group hosts by company
    const groupsMap = new Map<string, { hosts: ZabbixHost[]; problems: ZabbixProblem[] }>();
    hosts.forEach(h => {
      const site = extractSiteName(h.name);
      const hProblems = problemsByHost.get(h.hostid) || problemsByHost.get(h.name) || [];
      const entry = groupsMap.get(site) || { hosts: [], problems: [] };
      entry.hosts.push(h);
      hProblems.forEach(p => {
        if (!entry.problems.some(existing => existing.eventid === p.eventid)) {
          entry.problems.push(p);
        }
      });
      groupsMap.set(site, entry);
    });

    const summaries: CompanySummary[] = Array.from(groupsMap.entries()).map(([siteName, data]) => {
      let downHosts = 0;
      let warnHosts = 0;
      let upHosts = 0;

      data.hosts.forEach(h => {
        const hp = problemsByHost.get(h.hostid) || problemsByHost.get(h.name) || [];
        const hasCritical = hp.some(p => p.severity === '5' || p.severity === '4');
        if (hasCritical) downHosts++;
        else if (hp.length > 0) warnHosts++;
        else upHosts++;
      });

      const totalHosts = data.hosts.length;
      const uptimePct = totalHosts > 0 
        ? Math.max(0, Number((100 - (downHosts / totalHosts * 100) - (warnHosts / totalHosts * 15)).toFixed(1))) 
        : 100;

      // Generate 35 company tick bars
      const TOTAL_BARS = 35;
      const heartbeats = Array.from({ length: TOTAL_BARS }).map((_, bIdx) => {
        const isRecent = bIdx >= TOTAL_BARS - 3;
        let status: 'up' | 'down' | 'warning' = 'up';
        if (downHosts > 0) {
          status = isRecent ? 'down' : (bIdx % 6 === 0 ? 'warning' : 'up');
        } else if (warnHosts > 0) {
          status = isRecent ? 'warning' : 'up';
        }
        return {
          status,
          time: `${Math.round((TOTAL_BARS - bIdx) * 2)}m atrás`,
        };
      });

      return {
        siteName,
        totalHosts,
        upHosts,
        downHosts,
        warnHosts,
        uptimePct,
        problems: data.problems,
        heartbeats,
      };
    });

    // Sort: Companies with down hosts first
    summaries.sort((a, b) => {
      if (a.downHosts !== b.downHosts) return b.downHosts - a.downHosts;
      if (a.warnHosts !== b.warnHosts) return b.warnHosts - a.warnHosts;
      return a.siteName.localeCompare(b.siteName);
    });

    const totalHosts = hosts.length;
    const totalDown = summaries.reduce((acc, c) => acc + c.downHosts, 0);
    const totalWarn = summaries.reduce((acc, c) => acc + c.warnHosts, 0);
    const totalUp = Math.max(0, totalHosts - totalDown - totalWarn);
    const globalSLA = summaries.length > 0 
      ? Number((summaries.reduce((acc, c) => acc + c.uptimePct, 0) / summaries.length).toFixed(1))
      : 100;

    // Slide count = 1 (Summary) + Number of companies with active incidents (or top companies)
    const incidentCompanies = summaries.filter(s => s.downHosts > 0 || s.warnHosts > 0);
    const companySlides = incidentCompanies.length > 0 ? incidentCompanies : summaries.slice(0, 4);

    return {
      companySummaries: summaries,
      incidentCompanies: companySlides,
      globalMetrics: {
        totalHosts,
        totalDown,
        totalWarn,
        totalUp,
        globalSLA,
        totalProblems: problems.length,
      },
      totalSlides: 1 + companySlides.length + 1, // 0: Summary, 1..N: Companies, N+1: Flapping/Events
    };
  }, [hosts, problems]);

  // Carousel Auto-Rotation Timer
  useEffect(() => {
    if (!isAutoPlay || totalSlides <= 1) return;

    setTimeLeft(intervalSec);
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setCurrentSlide(curr => (curr + 1) % totalSlides);
          return intervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoPlay, intervalSec, totalSlides]);

  // Fullscreen Handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => console.error(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(err => console.error(err));
      setIsFullscreen(false);
    }
  };

  // Keyboard Shortcuts (Space: Play/Pause, Right/Left: Next/Prev)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsAutoPlay(prev => !prev);
      } else if (e.code === 'ArrowRight') {
        setCurrentSlide(curr => (curr + 1) % totalSlides);
        setTimeLeft(intervalSec);
      } else if (e.code === 'ArrowLeft') {
        setCurrentSlide(curr => (curr - 1 + totalSlides) % totalSlides);
        setTimeLeft(intervalSec);
      } else if (e.code === 'KeyF') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalSlides, intervalSec]);

  // Current Slide Company (if on company slide)
  const currentCompany = useMemo(() => {
    const incidentCompanies = companySummaries.filter(s => s.downHosts > 0 || s.warnHosts > 0);
    const activeList = incidentCompanies.length > 0 ? incidentCompanies : companySummaries.slice(0, 4);
    if (currentSlide > 0 && currentSlide <= activeList.length) {
      return activeList[currentSlide - 1];
    }
    return null;
  }, [currentSlide, companySummaries]);

  const isAllOperational = globalMetrics.totalDown === 0 && globalMetrics.totalWarn === 0;

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none font-sans"
    >
      {/* 1. WALLBOARD HEADER */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-2xl backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30 shrink-0">
            <Tv size={26} className="animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-wider uppercase flex items-center gap-2">
                Zabbix Vision • NOC War Room
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40">
                Modo TV
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 font-mono">
              <span>{hosts.length} Monitores</span>
              <span>•</span>
              <span>{companySummaries.length} Empresas</span>
              <span>•</span>
              <span className="text-emerald-400">SLA Global: {globalMetrics.globalSLA}%</span>
            </p>
          </div>
        </div>

        {/* Global Operational Status Pill */}
        <div className="hidden lg:flex items-center gap-3 bg-slate-950/80 px-5 py-2 rounded-2xl border border-slate-800 shadow-inner">
          <div 
            className={`w-3.5 h-3.5 rounded-full ${
              isAllOperational 
                ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' 
                : globalMetrics.totalDown > 0 
                ? 'bg-red-500 animate-ping shadow-lg shadow-red-500/50' 
                : 'bg-yellow-500'
            }`} 
          />
          <div className="text-xs font-black uppercase tracking-wider">
            {isAllOperational ? (
              <span className="text-emerald-400">Todos os Sistemas Operacionais</span>
            ) : (
              <span className="text-red-400">
                {globalMetrics.totalDown} Host(s) DOWN • {globalMetrics.totalWarn} Alertas
              </span>
            )}
          </div>
        </div>

        {/* Clock & Controls */}
        <div className="flex items-center gap-4">
          {/* Live Clock */}
          <div className="text-right font-mono hidden sm:block">
            <div className="text-2xl font-black text-cyan-400 leading-none">{currentTime}</div>
            <div className="text-[10px] text-slate-400 capitalize mt-1">{currentDate}</div>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-2xl border border-slate-700 shadow-lg">
            {/* Play / Pause Button */}
            <button
              onClick={() => setIsAutoPlay(!isAutoPlay)}
              className={`p-2 rounded-xl transition-all ${
                isAutoPlay ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
              title={isAutoPlay ? 'Pausar rotação automática (Espaço)' : 'Iniciar rotação automática (Espaço)'}
            >
              {isAutoPlay ? <Pause size={16} /> : <Play size={16} />}
            </button>

            {/* Interval Selector */}
            <select
              value={intervalSec}
              onChange={e => {
                const val = parseInt(e.target.value);
                setIntervalSec(val);
                setTimeLeft(val);
              }}
              className="bg-slate-950 text-slate-300 text-xs font-mono font-bold px-2 py-1.5 rounded-xl border border-slate-700 focus:outline-none"
              title="Tempo de rotação por slide"
            >
              <option value={10}>10s</option>
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>

            {/* Navigation Prev/Next */}
            <button
              onClick={() => {
                setCurrentSlide(curr => (curr - 1 + totalSlides) % totalSlides);
                setTimeLeft(intervalSec);
              }}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
              title="Slide Anterior"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              onClick={() => {
                setCurrentSlide(curr => (curr + 1) % totalSlides);
                setTimeLeft(intervalSec);
              }}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
              title="Próximo Slide"
            >
              <ChevronRight size={16} />
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors hidden sm:block"
              title="Modo Tela Cheia (F)"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Exit Button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white rounded-xl transition-all border border-red-500/30"
                title="Sair do Modo TV"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. PROGRESS BAR & SLIDE INDICATOR */}
      <div className="bg-slate-900 px-6 py-2 border-b border-slate-800/80 flex items-center justify-between shrink-0">
        {/* Slide Indicator Pills */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {Array.from({ length: totalSlides }).map((_, idx) => {
            let label = 'Geral NOC';
            if (idx > 0 && idx < totalSlides - 1) {
              const incidentList = companySummaries.filter(s => s.downHosts > 0 || s.warnHosts > 0);
              const activeList = incidentList.length > 0 ? incidentList : companySummaries.slice(0, 4);
              label = activeList[idx - 1]?.siteName || `Empresa ${idx}`;
            } else if (idx === totalSlides - 1) {
              label = 'Radar & Timeline';
            }

            const isActive = currentSlide === idx;

            return (
              <button
                key={idx}
                onClick={() => {
                  setCurrentSlide(idx);
                  setTimeLeft(intervalSec);
                }}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 scale-105'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Timer Countdown Progress */}
        {isAutoPlay && (
          <div className="flex items-center gap-2 shrink-0 font-mono text-xs text-slate-400">
            <span>Próximo em: <strong className="text-cyan-400 font-bold">{timeLeft}s</strong></span>
            <div className="w-16 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="h-full bg-cyan-500 transition-all duration-1000 ease-linear"
                style={{ width: `${(timeLeft / intervalSec) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. MAIN CONTENT SLIDES */}
      <main className="flex-1 p-6 overflow-y-auto space-y-6">
        
        {/* SLIDE 0: VISÃO GERAL NOC (EXECUTIVE SUMMARY & ALL COMPANIES) */}
        {currentSlide === 0 && (
          <div className="animate-in fade-in zoom-in-95 duration-300 space-y-6">
            {/* Top Key Performance Indicators (Giant NOC Numbers) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-wider font-extrabold text-slate-400 block mb-1">Total de Monitores</span>
                  <div className="text-5xl font-black text-white">{globalMetrics.totalHosts}</div>
                  <span className="text-[11px] text-slate-500 font-mono mt-1 block">Monitored Items</span>
                </div>
                <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center border border-blue-500/20 shrink-0">
                  <Server size={32} />
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-wider font-extrabold text-slate-400 block mb-1">Hosts Operacionais</span>
                  <div className="text-5xl font-black text-emerald-400">{globalMetrics.totalUp}</div>
                  <span className="text-[11px] text-emerald-500/80 font-mono mt-1 block">Online & Saudáveis</span>
                </div>
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <CheckCircle2 size={32} />
                </div>
              </div>

              <div className={`bg-slate-900/90 border rounded-3xl p-6 shadow-2xl flex items-center justify-between transition-all ${
                globalMetrics.totalDown > 0 ? 'border-red-500/50 bg-red-950/20' : 'border-slate-800'
              }`}>
                <div>
                  <span className="text-xs uppercase tracking-wider font-extrabold text-slate-400 block mb-1">Hosts Fora do Ar (DOWN)</span>
                  <div className={`text-5xl font-black ${globalMetrics.totalDown > 0 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}>
                    {globalMetrics.totalDown}
                  </div>
                  <span className="text-[11px] text-red-400/80 font-mono mt-1 block">Incidentes Críticos</span>
                </div>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border ${
                  globalMetrics.totalDown > 0 ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-slate-800 text-slate-500 border-slate-700'
                }`}>
                  <AlertTriangle size={32} />
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-wider font-extrabold text-slate-400 block mb-1">Uptime Global SLA</span>
                  <div className="text-5xl font-black text-cyan-400">{globalMetrics.globalSLA}%</div>
                  <span className="text-[11px] text-cyan-500/80 font-mono mt-1 block">Média Corporativa</span>
                </div>
                <div className="w-16 h-16 bg-cyan-500/10 text-cyan-400 rounded-2xl flex items-center justify-center border border-cyan-500/20 shrink-0">
                  <Activity size={32} />
                </div>
              </div>
            </div>

            {/* Matrix of Companies Status */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Layers size={18} className="text-blue-400" />
                  <span>Matriz de Unidades & Empresas ({companySummaries.length})</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">Ordenado por severidade</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {companySummaries.map(comp => {
                  const hasDown = comp.downHosts > 0;
                  const hasWarn = comp.warnHosts > 0;

                  return (
                    <div
                      key={comp.siteName}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                        hasDown
                          ? 'bg-red-950/20 border-red-500/40 shadow-lg shadow-red-500/10'
                          : hasWarn
                          ? 'bg-yellow-950/20 border-yellow-500/40'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-white">{comp.siteName}</span>
                          <span className="text-xs text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
                            {comp.totalHosts} hosts
                          </span>
                        </div>

                        <span className="font-mono text-sm font-black text-cyan-300">
                          {comp.uptimePct.toFixed(1)}%
                        </span>
                      </div>

                      {/* Company Kuma Tick Bars */}
                      <div className="flex items-center gap-1 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
                        {comp.heartbeats.slice(-25).map((hb, bIdx) => (
                          <div
                            key={bIdx}
                            className={`flex-1 h-5 rounded-sm ${
                              hb.status === 'down'
                                ? 'bg-red-500'
                                : hb.status === 'warning'
                                ? 'bg-yellow-500'
                                : 'bg-emerald-500'
                            }`}
                          />
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-xs font-bold pt-1">
                        <span className="text-slate-400">{comp.upHosts}/{comp.totalHosts} Operacionais</span>
                        {hasDown ? (
                          <span className="text-red-400 font-black flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                            {comp.downHosts} DOWN
                          </span>
                        ) : hasWarn ? (
                          <span className="text-yellow-400 font-bold">{comp.warnHosts} Alerta</span>
                        ) : (
                          <span className="text-emerald-400 font-bold">100% OK</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 1..N: INDIVIDUAL COMPANY FOCUS (FOR INCIDENT COMPANIES) */}
        {currentCompany && (
          <div className="animate-in fade-in zoom-in-95 duration-300 space-y-6">
            {/* Company Banner */}
            <div className={`p-8 rounded-3xl border shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all ${
              currentCompany.downHosts > 0 
                ? 'bg-red-950/30 border-red-500/50' 
                : 'bg-slate-900/90 border-slate-800'
            }`}>
              <div className="flex items-center gap-5">
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shrink-0 border shadow-2xl ${
                  currentCompany.downHosts > 0 
                    ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse' 
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                }`}>
                  {currentCompany.downHosts > 0 ? <AlertTriangle size={36} /> : <CheckCircle2 size={36} />}
                </div>

                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-black text-white tracking-wide">{currentCompany.siteName}</h2>
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-slate-950 text-slate-300 border border-slate-800">
                      Unidade / Empresa
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    {currentCompany.totalHosts} Monitores • {currentCompany.downHosts} DOWN • {currentCompany.warnHosts} Alerta • {currentCompany.upHosts} Operacionais
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 divide-x divide-slate-800 self-start md:self-auto">
                <div className="px-4 text-right">
                  <span className="text-xs uppercase font-extrabold text-slate-400 block mb-1">SLA da Empresa</span>
                  <div className="text-4xl font-black text-cyan-400">{currentCompany.uptimePct.toFixed(1)}%</div>
                </div>

                <div className="pl-6 text-right">
                  <span className="text-xs uppercase font-extrabold text-slate-400 block mb-1">Status</span>
                  <div className={`text-xl font-black uppercase ${currentCompany.downHosts > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {currentCompany.downHosts > 0 ? '🔴 Incidente Ativo' : '🟢 Operacional'}
                  </div>
                </div>
              </div>
            </div>

            {/* Active Problems for this company */}
            {currentCompany.problems.length > 0 ? (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
                <h3 className="text-base font-extrabold text-white flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="flex items-center gap-2">
                    <ShieldAlert size={20} className="text-red-400" />
                    <span>Incidentes em Andamento ({currentCompany.problems.length})</span>
                  </span>
                  <span className="text-xs text-slate-400 font-mono">Prioridade por severidade</span>
                </h3>

                <div className="space-y-3">
                  {currentCompany.problems.map((p, idx) => {
                    const hostName = p.hosts?.[0]?.name || 'Host Desconhecido';

                    return (
                      <div 
                        key={p.eventid + idx}
                        className="p-5 bg-slate-950 rounded-2xl border border-red-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg hover:border-red-500/60 transition-all"
                      >
                        <div className="flex items-start gap-4">
                          <span className="px-3 py-1 bg-red-500/20 text-red-300 border border-red-500/40 rounded-xl text-xs font-black uppercase shrink-0">
                            CRÍTICO
                          </span>

                          <div>
                            <div className="flex items-center gap-2 text-sm font-bold text-cyan-300">
                              <Server size={14} />
                              <span>{hostName}</span>
                            </div>
                            <h4 className="text-base font-extrabold text-white mt-1">{p.name}</h4>
                            <p className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-2">
                              <Clock size={12} className="text-slate-500" />
                              Aberto às {new Date(parseInt(p.clock) * 1000).toLocaleTimeString('pt-BR')}
                            </p>
                          </div>
                        </div>

                        {onAnalyzeAI && (
                          <button
                            onClick={() => onAnalyzeAI(p)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5 shrink-0 self-end md:self-auto"
                          >
                            <Sparkles size={14} /> Diagnóstico IA
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 space-y-3">
                <CheckCircle2 size={48} className="text-emerald-500 mx-auto" />
                <h3 className="text-lg font-extrabold text-white">Nenhum incidente ativo registrado para esta unidade</h3>
                <p className="text-xs text-slate-500">Todos os monitores e serviços estão respondendo normalmente.</p>
              </div>
            )}
          </div>
        )}

        {/* SLIDE N+1: FLAPPING RADAR & EVENT TIMELINE */}
        {currentSlide === totalSlides - 1 && (
          <div className="animate-in fade-in zoom-in-95 duration-300 space-y-6">
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Radio size={22} className="text-cyan-400" />
                  <span>Flapping Radar & Oscilações Recentes em Tempo Real</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">Eventos recentes</span>
              </div>

              <div className="space-y-3">
                {problems.slice(0, 8).map((p, idx) => (
                  <div key={p.eventid + idx} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-mono text-cyan-300 font-bold block">
                          {p.hosts?.[0]?.name || 'Host'}
                        </span>
                        <p className="text-sm font-bold text-white truncate" title={p.name}>{p.name}</p>
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs text-slate-400 shrink-0">
                      {new Date(parseInt(p.clock) * 1000).toLocaleTimeString('pt-BR')}
                    </div>
                  </div>
                ))}

                {problems.length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    Nenhuma oscilação ou flapping detectado nos últimos minutos.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* 4. FOOTER ticker */}
      <footer className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-white">Zabbix Vision &copy; 2026</span>
          <span>|</span>
          <a href="http://www.runeprojects.com.br/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">
            Rune Projects
          </a>
        </div>

        <div className="flex items-center gap-4 text-slate-500 text-[11px] font-mono">
          <span>Pressione <kbd className="px-1.5 py-0.5 bg-slate-850 rounded border border-slate-700 text-slate-300">Espaço</kbd> para pausar</span>
          <span>•</span>
          <span><kbd className="px-1.5 py-0.5 bg-slate-850 rounded border border-slate-700 text-slate-300">F</kbd> para Tela Cheia</span>
        </div>
      </footer>
    </div>
  );
};

export default NocWallboard;
