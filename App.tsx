import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, Server, AlertTriangle, Activity, 
  Search, RefreshCw, CheckCircle, Clock, 
  Calendar, BrainCircuit, Settings, Filter, X, UserCheck,
  Sparkles, Cpu, Sliders, Layers, Zap, ArrowRight, ShieldAlert,
  ChevronDown, ExternalLink, Plus, CheckCircle2, ChevronRight, LogIn,
  Network, Radio, Tv, Users
} from 'lucide-react';
import { ZabbixService } from './services/zabbixService';
import { 
  ZabbixProblem, ZabbixHost, ForecastHost, CorrelationGroup, 
  SavedSolution, ZabbixEvent, AIProviderConfig, ZabbixServerConfig,
  TopologyNode, FlappingItem
} from './types';
import { AIService } from './services/aiService';
import StatCard from './components/StatCard';
import Modal from './components/Modal';
import AIAnalysisModal from './components/AIAnalysisModal';
import AISettingsModal from './components/AISettingsModal';
import ZabbixConnectionModal from './components/ZabbixConnectionModal';
import ForecastCalendar from './components/ForecastCalendar';
import Timeline from './components/Timeline';
import TopologyMap from './components/TopologyMap';
import FlappingRadar from './components/FlappingRadar';
import HostStatusKuma from './components/HostStatusKuma';
import NocWallboard from './components/NocWallboard';
import TechnicianAnalytics from './components/TechnicianAnalytics';

const STORAGE_SERVERS_KEY = 'zabbix_vision_servers';
const STORAGE_ACTIVE_SERVER_KEY = 'zabbix_vision_active_server';

// Environment variable fallback
const ENV_ZABBIX_URL = (import.meta as any).env?.VITE_ZABBIX_URL || '';
const ENV_ZABBIX_TOKEN = (import.meta as any).env?.VITE_ZABBIX_TOKEN || '';

const ACK_PRESETS = [
  "Verificando o problema...",
  "Já informado à equipe responsável.",
  "Link secundário, foi informado sobre isso.",
  "Em andamento a correção.",
  "Problema conhecido, aguardando janela.",
  "Monitorando situação."
];

const RESOLVE_PRESETS = [
  "Problema resolvido reiniciando o serviço...",
  "Resolvido atualizando a configuração...",
  "Corrigido substituindo hardware...",
  "Link restabelecido."
];

function App() {
  // --- Multi-Server State ---
  const [servers, setServers] = useState<ZabbixServerConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SERVERS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}

    // Check old single connection key for backward compatibility
    try {
      const oldSingle = localStorage.getItem('zabbix_vision_connection');
      if (oldSingle) {
        const parsed = JSON.parse(oldSingle);
        if (parsed?.url) {
          return [{
            id: 'default',
            name: parsed.label || 'Servidor Principal',
            url: parsed.url,
            token: parsed.token,
            username: parsed.username,
            password: parsed.password,
            color: '#3b82f6',
            enabled: true,
          }];
        }
      }
    } catch (e) {}

    // Fallback to env
    if (ENV_ZABBIX_URL) {
      return [{
        id: 'env-server',
        name: 'Servidor Ambiente',
        url: ENV_ZABBIX_URL,
        token: ENV_ZABBIX_TOKEN,
        color: '#3b82f6',
        enabled: true,
      }];
    }
    return [];
  });

  const [activeServerId, setActiveServerId] = useState<string | 'all'>(() => {
    const savedActive = localStorage.getItem(STORAGE_ACTIVE_SERVER_KEY);
    return savedActive || (servers.length > 0 ? servers[0].id : 'all');
  });

  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data State
  const [hosts, setHosts] = useState<ZabbixHost[]>([]);
  const [allProblems, setAllProblems] = useState<ZabbixProblem[]>([]);
  const [displayedProblems, setDisplayedProblems] = useState<ZabbixProblem[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<ZabbixEvent[]>([]);
  const [forecastData, setForecastData] = useState<ForecastHost[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  
  // Metrics History
  const [history, setHistory] = useState({
    problems: [0,0,0,0,0,0,0,0,0,0],
    hosts: [0,0,0,0,0,0,0,0,0,0],
    availability: [100,100,100,100,100,100,100,100,100,100]
  });

  // UI State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'timeline' | 'problems' | 'forecast' | 'correlation' | 'topology' | 'flapping' | 'status_kuma' | 'tv_wallboard' | 'tech_analytics'>('status_kuma');
  const [selectedProblem, setSelectedProblem] = useState<ZabbixProblem | null>(null);
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIProviderConfig>(AIService.getConfig());
  const [comment, setComment] = useState('');
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRange, setFilterRange] = useState<'today' | 'yesterday' | 'week' | 'unack'>('today');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<{name: string, count: number, type: string}[]>([]);
  const [timelinePeriod, setTimelinePeriod] = useState<'hour' | 'day' | 'week'>('day');

  // Correlation Filters
  const [correlationScope, setCorrelationScope] = useState<'active' | 'history'>('active');
  const [correlationWindow, setCorrelationWindow] = useState<number>(900);
  const [correlationTypeFilter, setCorrelationTypeFilter] = useState<'all' | 'host_cascade' | 'cross_host_wave'>('all');

  // Saved Solutions
  const [solutions, setSolutions] = useState<SavedSolution[]>([]);

  // AI State
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiModalTitle, setAiModalTitle] = useState('');
  const [aiModalContent, setAiModalContent] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEngine, setAiEngine] = useState<'gemini' | 'ollama' | 'expert' | 'fallback'>('gemini');

  // Save servers to localStorage
  const saveServersList = (updated: ZabbixServerConfig[]) => {
    setServers(updated);
    localStorage.setItem(STORAGE_SERVERS_KEY, JSON.stringify(updated));
    if (updated.length === 0) {
      setActiveServerId('all');
    } else if (activeServerId !== 'all' && !updated.some(s => s.id === activeServerId)) {
      setActiveServerId(updated[0].id);
      localStorage.setItem(STORAGE_ACTIVE_SERVER_KEY, updated[0].id);
    }
  };

  const handleSelectServer = (id: string | 'all') => {
    setActiveServerId(id);
    localStorage.setItem(STORAGE_ACTIVE_SERVER_KEY, id);
    setServerDropdownOpen(false);
  };

  const handleSaveServer = (server: ZabbixServerConfig) => {
    const exists = servers.some(s => s.id === server.id);
    let updated: ZabbixServerConfig[];
    if (exists) {
      updated = servers.map(s => s.id === server.id ? server : s);
    } else {
      updated = [...servers, server];
    }
    saveServersList(updated);
    handleSelectServer(server.id);
  };

  const handleDeleteServer = (id: string) => {
    const updated = servers.filter(s => s.id !== id);
    saveServersList(updated);
  };

  // --- Active Server Configs List ---
  const activeConfigs = useMemo(() => {
    if (servers.length === 0) return [];
    if (activeServerId === 'all') return servers.filter(s => s.enabled !== false);
    const found = servers.find(s => s.id === activeServerId);
    return found ? [found] : (servers.length > 0 ? [servers[0]] : []);
  }, [servers, activeServerId]);

  // --- Data Fetching (Supports Multi-Server Federation) ---
  useEffect(() => {
    const savedSols = localStorage.getItem('zabbix_solutions');
    if (savedSols) {
      try { setSolutions(JSON.parse(savedSols)); } catch(e) {}
    }

    if (activeConfigs.length > 0) {
      fetchFederatedDashboardData();
    } else {
      setHosts([]);
      setAllProblems([]);
      setDisplayedProblems([]);
      setTimelineEvents([]);
      setForecastData([]);
      setLastRefreshed(null);
    }
  }, [activeConfigs]);

  // Polling (30s)
  useEffect(() => {
    if (activeConfigs.length === 0) return;
    const interval = setInterval(() => fetchFederatedDashboardData(), 30000);
    return () => clearInterval(interval);
  }, [activeConfigs]);

  const fetchFederatedDashboardData = async () => {
    if (activeConfigs.length === 0) return;
    if (!lastRefreshed) setLoading(true);
    setError(null);

    try {
      const results = await Promise.all(
        activeConfigs.map(async (cfg) => {
          try {
            const srv = new ZabbixService(cfg.url, cfg.token || null);
            if (!cfg.token && cfg.username && cfg.password) {
              await srv.login(cfg.username, cfg.password);
            }

            const fetchedHosts = await srv.getHosts();
            const rawProblems = await srv.getProblems({ limit: 500 });
            const enrichedProblems = await srv.enrichProblems(rawProblems);

            return {
              cfg,
              hosts: fetchedHosts.map(h => ({
                ...h,
                serverId: cfg.id,
                serverName: cfg.name,
                serverColor: cfg.color || '#3b82f6',
              })),
              problems: enrichedProblems.map(p => ({
                ...p,
                serverId: cfg.id,
                serverName: cfg.name,
                serverColor: cfg.color || '#3b82f6',
              })),
            };
          } catch (srvErr: any) {
            console.warn(`Error querying Zabbix server "${cfg.name}":`, srvErr);
            return {
              cfg,
              hosts: [],
              problems: [],
              error: srvErr.message,
            };
          }
        })
      );

      const combinedHosts: ZabbixHost[] = [];
      const combinedProblems: ZabbixProblem[] = [];
      const errorMsgs: string[] = [];

      results.forEach(r => {
        combinedHosts.push(...r.hosts);
        combinedProblems.push(...r.problems);
        if (r.error) {
          errorMsgs.push(`${r.cfg.name}: ${r.error}`);
        }
      });

      if (errorMsgs.length > 0 && combinedHosts.length === 0) {
        setError(errorMsgs.join(' | '));
      }

      setHosts(combinedHosts);
      setAllProblems(combinedProblems);
      extractTags(combinedProblems);
      setLastRefreshed(new Date());

      const availableCount = combinedHosts.filter(h => h.available === '1').length;
      const availPct = combinedHosts.length ? Math.round((availableCount / combinedHosts.length) * 100) : 0;
      setHistory(prev => ({
        problems: [...prev.problems.slice(1), combinedProblems.length],
        hosts: [...prev.hosts.slice(1), combinedHosts.length],
        availability: [...prev.availability.slice(1), availPct]
      }));

    } catch (err: any) {
      console.error("Federated fetch error", err);
      setError(err.message || "Falha na comunicação com os servidores Zabbix");
    } finally {
      setLoading(false);
    }
  };

  const fetchForecastData = async () => {
    if (activeConfigs.length === 0) return;
    setForecastLoading(true);

    try {
      const results = await Promise.all(
        activeConfigs.map(async (cfg) => {
          try {
            const srv = new ZabbixService(cfg.url, cfg.token || null);
            if (!cfg.token && cfg.username && cfg.password) {
              await srv.login(cfg.username, cfg.password);
            }
            const history = await srv.getHistoryProblems(30);
            return history.map(p => ({
              ...p,
              serverId: cfg.id,
              serverName: cfg.name,
              serverColor: cfg.color,
            }));
          } catch (e) {
            return [];
          }
        })
      );

      const mergedHistory = results.flat();
      const combined = [...allProblems];
      const existingIds = new Set(combined.map(p => p.eventid));
      mergedHistory.forEach(hp => {
        if (!existingIds.has(hp.eventid)) {
          combined.push(hp);
        }
      });

      processForecastData(combined.length > 0 ? combined : mergedHistory);
    } catch (e) {
      console.error("Forecast data fetch error:", e);
      processForecastData(allProblems);
    } finally {
      setForecastLoading(false);
    }
  };

  const fetchTimelineData = async (period: 'hour'|'day'|'week') => {
    if (activeConfigs.length === 0) return;
    const now = Math.floor(Date.now() / 1000);
    let timeFrom = now - 86400;
    if (period === 'hour') timeFrom = now - 3600;
    if (period === 'week') timeFrom = now - 604800;

    try {
      const results = await Promise.all(
        activeConfigs.map(async (cfg) => {
          try {
            const srv = new ZabbixService(cfg.url, cfg.token || null);
            if (!cfg.token && cfg.username && cfg.password) {
              await srv.login(cfg.username, cfg.password);
            }
            const events = await srv.getEvents(timeFrom, 100);
            return events.map(e => ({
              ...e,
              serverId: cfg.id,
              serverName: cfg.name,
              serverColor: cfg.color,
            }));
          } catch (e) {
            return [];
          }
        })
      );

      const merged = results.flat().sort((a,b) => parseInt(b.clock) - parseInt(a.clock));
      setTimelineEvents(merged);
    } catch (e) {
      console.error(e);
    }
  };

  // Update filtered problems when search, range, or raw data changes
  useEffect(() => {
    applyFilters();
  }, [allProblems, searchQuery, filterRange, selectedTags]);

  useEffect(() => {
    if (activeTab === 'forecast') {
      fetchForecastData();
    }
  }, [activeTab, activeConfigs]);

  useEffect(() => {
    if (activeTab === 'timeline') {
      fetchTimelineData(timelinePeriod);
    }
  }, [activeTab, timelinePeriod, activeConfigs]);

  // --- Data Processing ---
  const processForecastData = (problems: ZabbixProblem[]) => {
    const hostMap: Record<string, { days: { problems: any[] }[], hostid?: string, serverName?: string, serverColor?: string }> = {};
    
    problems.forEach(p => {
      let hostName = '';
      let hostId = '';
      
      if (p.hosts && p.hosts.length > 0 && p.hosts[0].name && p.hosts[0].hostid !== '0') {
        hostName = p.hosts[0].name;
        hostId = p.hosts[0].hostid;
      } else if (p.triggerDescription) {
        const parts = p.triggerDescription.split(':');
        if (parts.length > 1 && parts[0].trim().length > 2) {
          hostName = parts[0].trim();
        }
      }

      if (!hostName || hostName.toLowerCase().includes('unknown') || hostName.toLowerCase().includes('desconhecido')) {
        const lowerName = (p.name || '').toLowerCase();
        if (lowerName.includes('camera') || lowerName.includes('câmera') || lowerName.includes('dvr') || lowerName.includes('nvr')) {
          hostName = 'CFTV / Câmeras IP';
        } else if (lowerName.includes('icmp') || lowerName.includes('ping') || lowerName.includes('link')) {
          hostName = 'Infraestrutura de Rede';
        } else if (lowerName.includes('cpu') || lowerName.includes('memory') || lowerName.includes('swap') || lowerName.includes('disk')) {
          hostName = 'Servidores do Sistema';
        } else {
          hostName = 'Dispositivos do Sistema';
        }
      }
      
      const hostKey = p.serverName ? `[${p.serverName}] ${hostName}` : hostName;

      if (!hostMap[hostKey]) {
        hostMap[hostKey] = {
          hostid: hostId,
          serverName: p.serverName,
          serverColor: p.serverColor,
          days: Array(7).fill(null).map(() => ({ problems: [] }))
        };
      }
      
      const date = new Date(parseInt(p.clock) * 1000);
      const dayIndex = (date.getDay() + 6) % 7; 
      
      hostMap[hostKey].days[dayIndex].problems.push({
        name: p.name,
        severity: p.severity,
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        clock: p.clock,
        serverName: p.serverName,
      });
    });

    if (hosts.length > 0) {
      hosts.forEach(h => {
        const hostKey = h.serverName ? `[${h.serverName}] ${h.name}` : h.name;
        if (!hostMap[hostKey]) {
          hostMap[hostKey] = {
            hostid: h.hostid,
            serverName: h.serverName,
            serverColor: h.serverColor,
            days: Array(7).fill(null).map(() => ({ problems: [] }))
          };
        }
      });
    }

    const processed: ForecastHost[] = Object.entries(hostMap)
      .map(([host, info]) => ({ 
        host, 
        hostid: info.hostid,
        serverName: info.serverName,
        serverColor: info.serverColor,
        days: info.days 
      }))
      .sort((a,b) => a.host.localeCompare(b.host));
    
    setForecastData(processed);
  };

  const extractTags = (problems: ZabbixProblem[]) => {
    const tagCounts: Record<string, {count: number, type: string}> = {};
    
    problems.forEach(p => {
      const keywords = [];
      if (p.name.includes('ICMP') || p.name.includes('ping') || p.name.includes('link')) keywords.push({name: 'Rede', type: 'type'});
      else if (p.name.includes('CPU') || p.name.includes('Memory') || p.name.includes('disk')) keywords.push({name: 'Servidor', type: 'type'});
      else if (p.name.includes('SQL') || p.name.includes('Database') || p.name.includes('Postgres')) keywords.push({name: 'Banco', type: 'type'});
      
      if (p.severity === '5' || p.severity === '4') keywords.push({name: 'Crítico', type: 'priority'});

      (p.tags || []).forEach(t => keywords.push({name: t.tag, type: 'zabbix'}));

      keywords.forEach(k => {
        if(!tagCounts[k.name]) tagCounts[k.name] = { count: 0, type: k.type };
        tagCounts[k.name].count++;
      });
    });

    setAvailableTags(Object.entries(tagCounts)
      .map(([name, info]) => ({ name, count: info.count, type: info.type }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 8)
    );
  };

  const applyFilters = () => {
    let filtered = [...allProblems];

    if (filterRange === 'today') {
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      filtered = filtered.filter(p => parseInt(p.clock) >= Math.floor(startOfDay.getTime()/1000));
    } else if (filterRange === 'yesterday') {
      const start = new Date(); start.setDate(start.getDate()-1); start.setHours(0,0,0,0);
      const end = new Date(); end.setHours(0,0,0,0);
      filtered = filtered.filter(p => {
        const t = parseInt(p.clock);
        return t >= Math.floor(start.getTime()/1000) && t < Math.floor(end.getTime()/1000);
      });
    } else if (filterRange === 'week') {
      const start = new Date(); start.setDate(start.getDate()-7);
      filtered = filtered.filter(p => parseInt(p.clock) >= Math.floor(start.getTime()/1000));
    } else if (filterRange === 'unack') {
      filtered = filtered.filter(p => p.acknowledged === '0');
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.hosts?.[0]?.name || '').toLowerCase().includes(q) ||
        (p.serverName || '').toLowerCase().includes(q)
      );
    }

    if (selectedTags.length > 0) {
      filtered = filtered.filter(p => {
        const pString = (p.name + (p.hosts?.[0]?.name||'')).toLowerCase();
        return selectedTags.some(t => {
          if (t === 'Rede') return pString.includes('icmp') || pString.includes('ping') || pString.includes('link');
          if (t === 'Servidor') return pString.includes('cpu') || pString.includes('memory') || pString.includes('disk');
          if (t === 'Crítico') return p.severity === '4' || p.severity === '5';
          return (p.tags || []).some(pt => pt.tag === t || pt.value === t);
        });
      });
    }

    setDisplayedProblems(filtered);
  };

  // --- Helper: Extract Real Host and Company/Site from Problem ---
  const getEventSiteAndHost = (p: ZabbixProblem) => {
    let hostName = '';
    if (p.hosts && p.hosts.length > 0 && p.hosts[0].name && p.hosts[0].hostid !== '0') {
      hostName = p.hosts[0].name;
    } else if (p.triggerDescription) {
      const parts = p.triggerDescription.split(':');
      if (parts.length > 1 && parts[0].trim().length > 2) {
        hostName = parts[0].trim();
      }
    }

    if (!hostName || hostName.toLowerCase().includes('unknown') || hostName.toLowerCase().includes('desconhecido') || hostName === 'Dispositivo') {
      const vmMatch = p.name.match(/\[([a-zA-Z0-9_\-\.\/]+)\]/);
      if (vmMatch && vmMatch[1]) {
        hostName = vmMatch[1];
      } else {
        const parts = p.name.split(/[:\-–]/);
        if (parts.length > 1 && parts[0].trim().length > 2) {
          hostName = parts[0].trim();
        } else {
          hostName = 'Servidor';
        }
      }
    }

    // Determine site/company prefix
    let siteName = 'GERAL';
    const clean = hostName.trim();
    const match = clean.match(/^([a-zA-Z0-9]+)[\s\-_\/]/);
    if (match && match[1] && match[1].length >= 2 && !['sw','gw','fw','srv','cam','dvr','nvr','vm','pve'].includes(match[1].toLowerCase())) {
      siteName = match[1].toUpperCase();
    } else {
      const nameMatch = p.name.match(/^([a-zA-Z0-9]+)[\s\-_\/]/);
      if (nameMatch && nameMatch[1] && nameMatch[1].length >= 2) {
        siteName = nameMatch[1].toUpperCase();
      }
    }

    return { hostName, siteName };
  };

  // --- Multi-Dimensional Correlation Engine ---
  const correlations: CorrelationGroup[] = useMemo(() => {
    let sourceEvents: ZabbixProblem[] = [];

    if (correlationScope === 'active') {
      sourceEvents = allProblems;
    } else {
      sourceEvents = timelineEvents.map(e => ({
        eventid: e.eventid,
        objectid: '',
        clock: e.clock,
        ns: '0',
        name: e.name,
        severity: e.severity,
        acknowledged: e.acknowledged,
        hosts: e.hosts,
        tags: e.tags || [],
        serverName: e.serverName,
        serverColor: e.serverColor,
      }));
    }

    if (sourceEvents.length === 0) return [];

    const groups: CorrelationGroup[] = [];

    const extractKeywords = (events: ZabbixProblem[]) => {
      const keywords: Record<string, number> = {};
      events.forEach(p => {
        p.name.toLowerCase().split(/[\s\-_\/]+/).forEach(w => {
          if (w.length > 3 && !['down','high','error','failed','problem','alert','service','host'].includes(w)) {
            keywords[w] = (keywords[w] || 0) + 1;
          }
        });
      });
      return Object.entries(keywords).sort((a,b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    };

    // 1. INTRA-HOST CASCADE
    const problemsByHost: Record<string, ZabbixProblem[]> = {};
    sourceEvents.forEach(p => {
      const { hostName } = getEventSiteAndHost(p);
      const hostKey = p.serverName ? `[${p.serverName}] ${hostName}` : hostName;
      if (!problemsByHost[hostKey]) problemsByHost[hostKey] = [];
      problemsByHost[hostKey].push(p);
    });

    Object.entries(problemsByHost).forEach(([hostKey, hostProblems]) => {
      if (hostProblems.length < 2) return;
      hostProblems.sort((a,b) => parseInt(a.clock) - parseInt(b.clock));
      
      let currentCluster: ZabbixProblem[] = [];
      let prevClock = 0;

      hostProblems.forEach(p => {
        const time = parseInt(p.clock);
        if (prevClock === 0 || (time - prevClock) <= correlationWindow) {
          currentCluster.push(p);
        } else {
          if (currentCluster.length > 1) {
            const timeRange = parseInt(currentCluster[currentCluster.length-1].clock) - parseInt(currentCluster[0].clock);
            const conf = Math.min(98, Math.max(50, Math.round(95 - (timeRange / correlationWindow * 30) + (currentCluster.length * 6))));
            const { hostName, siteName } = getEventSiteAndHost(currentCluster[0]);

            groups.push({
              id: `intra-${hostName}-${currentCluster[0].eventid}`,
              host: `Cascata no Host: ${hostName}`,
              siteName: siteName,
              affectedHosts: [hostName],
              affectedSites: [siteName],
              events: currentCluster,
              confidence: conf,
              startTime: parseInt(currentCluster[0].clock),
              endTime: parseInt(currentCluster[currentCluster.length-1].clock),
              commonKeywords: extractKeywords(currentCluster),
              type: 'host_cascade',
              affectedHostsCount: 1,
              serverName: currentCluster[0].serverName
            });
          }
          currentCluster = [p];
        }
        prevClock = time;
      });

      if (currentCluster.length > 1) {
        const timeRange = parseInt(currentCluster[currentCluster.length-1].clock) - parseInt(currentCluster[0].clock);
        const conf = Math.min(98, Math.max(50, Math.round(95 - (timeRange / correlationWindow * 30) + (currentCluster.length * 6))));
        const { hostName, siteName } = getEventSiteAndHost(currentCluster[0]);

        groups.push({
          id: `intra-${hostName}-${currentCluster[0].eventid}`,
          host: `Cascata no Host: ${hostName}`,
          siteName: siteName,
          affectedHosts: [hostName],
          affectedSites: [siteName],
          events: currentCluster,
          confidence: conf,
          startTime: parseInt(currentCluster[0].clock),
          endTime: parseInt(currentCluster[currentCluster.length-1].clock),
          commonKeywords: extractKeywords(currentCluster),
          type: 'host_cascade',
          affectedHostsCount: 1,
          serverName: currentCluster[0].serverName
        });
      }
    });

    // 2. CROSS-HOST INFRASTRUCTURE WAVE
    const sortedAll = [...sourceEvents].sort((a,b) => parseInt(a.clock) - parseInt(b.clock));
    let crossWave: ZabbixProblem[] = [];
    let prevWaveTime = 0;

    sortedAll.forEach(p => {
      const time = parseInt(p.clock);
      if (prevWaveTime === 0 || (time - prevWaveTime) <= (correlationWindow / 2)) {
        crossWave.push(p);
      } else {
        const hostInfos = crossWave.map(item => getEventSiteAndHost(item));
        const distinctHosts = Array.from(new Set(hostInfos.map(h => h.hostName)));
        const distinctSites = Array.from(new Set(hostInfos.map(h => h.siteName)));

        if (crossWave.length >= 3 && distinctHosts.length >= 2) {
          const timeRange = parseInt(crossWave[crossWave.length-1].clock) - parseInt(crossWave[0].clock);
          const conf = Math.min(96, Math.max(60, Math.round(85 - (timeRange / (correlationWindow / 2) * 20) + (distinctHosts.length * 5))));
          
          groups.push({
            id: `cross-${crossWave[0].eventid}`,
            host: `Onda em ${distinctHosts.length} Hosts: ${distinctHosts.slice(0, 2).join(', ')}${distinctHosts.length > 2 ? ` (+${distinctHosts.length - 2})` : ''}`,
            siteName: distinctSites.length === 1 ? distinctSites[0] : distinctSites.slice(0, 2).join(', ') + (distinctSites.length > 2 ? '...' : ''),
            affectedHosts: distinctHosts,
            affectedSites: distinctSites,
            events: crossWave,
            confidence: conf,
            startTime: parseInt(crossWave[0].clock),
            endTime: parseInt(crossWave[crossWave.length-1].clock),
            commonKeywords: extractKeywords(crossWave),
            type: 'cross_host_wave',
            affectedHostsCount: distinctHosts.length
          });
        }
        crossWave = [p];
      }
      prevWaveTime = time;
    });

    if (crossWave.length >= 3) {
      const hostInfos = crossWave.map(item => getEventSiteAndHost(item));
      const distinctHosts = Array.from(new Set(hostInfos.map(h => h.hostName)));
      const distinctSites = Array.from(new Set(hostInfos.map(h => h.siteName)));

      if (distinctHosts.length >= 2) {
        const timeRange = parseInt(crossWave[crossWave.length-1].clock) - parseInt(crossWave[0].clock);
        const conf = Math.min(96, Math.max(60, Math.round(85 - (timeRange / (correlationWindow / 2) * 20) + (distinctHosts.length * 5))));
        
        groups.push({
          id: `cross-${crossWave[0].eventid}`,
          host: `Onda em ${distinctHosts.length} Hosts: ${distinctHosts.slice(0, 2).join(', ')}${distinctHosts.length > 2 ? ` (+${distinctHosts.length - 2})` : ''}`,
          siteName: distinctSites.length === 1 ? distinctSites[0] : distinctSites.slice(0, 2).join(', ') + (distinctSites.length > 2 ? '...' : ''),
          affectedHosts: distinctHosts,
          affectedSites: distinctSites,
          events: crossWave,
          confidence: conf,
          startTime: parseInt(crossWave[0].clock),
          endTime: parseInt(crossWave[crossWave.length-1].clock),
          commonKeywords: extractKeywords(crossWave),
          type: 'cross_host_wave',
          affectedHostsCount: distinctHosts.length
        });
      }
    }

    let result = groups;
    if (correlationTypeFilter !== 'all') {
      result = result.filter(g => g.type === correlationTypeFilter);
    }

    return result.sort((a,b) => b.events.length - a.events.length);
  }, [allProblems, timelineEvents, correlationScope, correlationWindow, correlationTypeFilter]);

  // --- Actions ---
  const handleAcknowledge = async () => {
    if (!selectedProblem) return;
    try {
      const targetServer = servers.find(s => s.id === selectedProblem.serverId) || activeConfigs[0];
      if (!targetServer) return;

      const srv = new ZabbixService(targetServer.url, targetServer.token || null);
      if (!targetServer.token && targetServer.username && targetServer.password) {
        await srv.login(targetServer.username, targetServer.password);
      }

      await srv.acknowledgeEvent(selectedProblem.eventid, comment, 6); 
      setAckModalOpen(false);
      setComment('');
      fetchFederatedDashboardData();
    } catch (err) { alert("Erro ao reconhecer evento"); }
  };

  const handleResolve = async () => {
    if (!selectedProblem) return;
    try {
      const targetServer = servers.find(s => s.id === selectedProblem.serverId) || activeConfigs[0];
      if (!targetServer) return;

      const newSolution: SavedSolution = {
        id: Date.now().toString(),
        problemName: selectedProblem.name,
        solution: comment,
        timestamp: Date.now(),
        usedCount: 1,
        authorName: 'SRE'
      };
      const updatedSolutions = [newSolution, ...solutions];
      setSolutions(updatedSolutions);
      localStorage.setItem('zabbix_solutions', JSON.stringify(updatedSolutions));

      const srv = new ZabbixService(targetServer.url, targetServer.token || null);
      if (!targetServer.token && targetServer.username && targetServer.password) {
        await srv.login(targetServer.username, targetServer.password);
      }

      await srv.acknowledgeEvent(selectedProblem.eventid, `[RESOLVED] ${comment}`, 1); 
      setResolveModalOpen(false);
      setComment('');
      fetchFederatedDashboardData();
    } catch (err) { alert("Erro ao resolver evento"); }
  };

  // --- AI Handlers ---
  const handleAIProblemAnalysis = async (problem: ZabbixProblem) => {
    setAiModalTitle(`Análise Técnica: ${problem.name}`);
    setIsAIModalOpen(true);
    setAiLoading(true);
    setAiModalContent(null);
    
    const res = await AIService.analyzeProblem(problem);
    setAiModalContent(res.result);
    setAiEngine(res.engine);
    setAiLoading(false);
  };

  const handleAICorrelationAnalysis = async (correlation: CorrelationGroup) => {
    setAiModalTitle(`Correlação de Incidentes: ${correlation.host}`);
    setIsAIModalOpen(true);
    setAiLoading(true);
    setAiModalContent(null);
    
    const res = await AIService.analyzeCorrelation(correlation);
    setAiModalContent(res.result);
    setAiEngine(res.engine);
    setAiLoading(false);
  };

  const handleAIPrediction = async () => {
    setAiModalTitle("Relatório Preditivo de Infraestrutura & Capacidade");
    setIsAIModalOpen(true);
    setAiLoading(true);
    setAiModalContent(null);
    
    const res = await AIService.predictProblems(allProblems);
    setAiModalContent(res.result);
    setAiEngine(res.engine);
    setAiLoading(false);
  };

  const handleAITopologyAnalysis = async (node: TopologyNode, children: TopologyNode[], problemsList: ZabbixProblem[]) => {
    setAiModalTitle(`Impacto em Cascata: ${node.name}`);
    setIsAIModalOpen(true);
    setAiLoading(true);
    setAiModalContent(null);

    const res = await AIService.analyzeTopologyImpact(node, children, problemsList);
    setAiModalContent(res.result);
    setAiEngine(res.engine);
    setAiLoading(false);
  };

  const handleAIFlappingAnalysis = async (item: FlappingItem) => {
    setAiModalTitle(`Diagnóstico de Flapping & Histerese: ${item.hostName}`);
    setIsAIModalOpen(true);
    setAiLoading(true);
    setAiModalContent(null);

    const res = await AIService.analyzeFlapping(item);
    setAiModalContent(res.result);
    setAiEngine(res.engine);
    setAiLoading(false);
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case '5': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case '4': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case '3': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case '2': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getPreviousSolutions = (name: string) => {
    if (!name) return [];
    return solutions.filter(s => s.problemName === name);
  };

  const getProviderLabel = () => {
    switch (aiConfig.provider) {
      case 'gemini': return 'Gemini Cloud';
      case 'ollama': return `Ollama (${aiConfig.ollamaModel})`;
      case 'expert': return 'Motor Especialista';
      default: return 'IA Auto';
    }
  };

  const getActiveServerDisplay = () => {
    if (servers.length === 0) return { label: 'Conectar Servidor', color: '#3b82f6', isAll: false };
    if (activeServerId === 'all') {
      return { label: `Todos os Servidores (${servers.length})`, color: '#8b5cf6', isAll: true };
    }
    const found = servers.find(s => s.id === activeServerId);
    return {
      label: found?.name || 'Servidor Zabbix',
      color: found?.color || '#3b82f6',
      version: found?.version,
      isAll: false,
    };
  };

  const serverDisplay = getActiveServerDisplay();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans flex flex-col justify-between">
      <div>
        {/* Header */}
        <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50 shadow-lg">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-blue-500" size={28} />
              <div>
                <h1 className="text-xl font-bold text-white leading-none">Zabbix Vision</h1>
                <span className="text-xs text-slate-400 font-medium">Enterprise Monitoring & Predictive Intelligence</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2.5">
              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-900/20 px-3 py-1 rounded-full border border-red-500/20">
                  <AlertTriangle size={12} />
                  <span className="max-w-[200px] truncate" title={error}>{error}</span>
                </div>
              )}

              {/* Multi-Server Selector Dropdown */}
              <div className="relative">
                <button
                  onClick={() => servers.length > 0 ? setServerDropdownOpen(!serverDropdownOpen) : setConnectionModalOpen(true)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    servers.length > 0
                      ? 'bg-slate-900 hover:bg-slate-700 text-slate-200 border-slate-700 shadow-sm'
                      : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-md animate-pulse'
                  }`}
                  title="Alternar ou Gerenciar Servidores Zabbix"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: serverDisplay.color }}
                  />
                  <span className="max-w-[140px] sm:max-w-[180px] truncate">{serverDisplay.label}</span>
                  {serverDisplay.version && (
                    <span className="hidden lg:inline text-[10px] px-1.5 py-0.2 bg-slate-800 rounded font-mono text-slate-400">
                      v{serverDisplay.version}
                    </span>
                  )}
                  {servers.length > 0 && <ChevronDown size={14} className="text-slate-400" />}
                </button>

                {/* Dropdown Menu */}
                {serverDropdownOpen && servers.length > 0 && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      Servidores Cadastrados
                    </div>

                    {servers.length > 1 && (
                      <button
                        onClick={() => handleSelectServer('all')}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-800 transition-colors ${
                          activeServerId === 'all' ? 'text-purple-300 font-bold bg-purple-500/10' : 'text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Layers size={14} className="text-purple-400" />
                          <span>Visão Unificada (Todos)</span>
                        </div>
                        {activeServerId === 'all' && <CheckCircle size={14} className="text-purple-400" />}
                      </button>
                    )}

                    {servers.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectServer(s.id)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-800 transition-colors ${
                          activeServerId === s.id ? 'text-blue-300 font-bold bg-blue-500/10' : 'text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color || '#3b82f6' }} />
                          <span className="truncate">{s.name}</span>
                          {s.version && <span className="text-[10px] text-slate-500 font-mono">v{s.version}</span>}
                        </div>
                        {activeServerId === s.id && <CheckCircle size={14} className="text-blue-400" />}
                      </button>
                    ))}

                    <div className="pt-1.5 mt-1.5 border-t border-slate-800 px-2">
                      <button
                        onClick={() => {
                          setServerDropdownOpen(false);
                          setConnectionModalOpen(true);
                        }}
                        className="w-full px-2.5 py-1.5 text-center text-blue-400 hover:text-white hover:bg-blue-600 rounded-lg transition-colors font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Plus size={13} /> Gerenciar Servidores
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Provider Config & Modo TV Buttons (Only shown when server is configured) */}
              {servers.length > 0 && (
                <>
                  <button
                    onClick={() => setAiSettingsOpen(true)}
                    className="p-2 rounded-lg text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition-all shadow-sm flex items-center justify-center"
                    title={`Configurar IA (${getProviderLabel()})`}
                  >
                    <Cpu size={18} className="text-indigo-400" />
                  </button>

                  <button
                    onClick={() => setActiveTab('tv_wallboard')}
                    className="p-2 rounded-lg text-xs font-extrabold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white border border-purple-400/30 transition-all shadow-md flex items-center justify-center animate-pulse"
                    title="Modo TV / NOC Wallboard (Rotação Automática em Telas Grandes)"
                  >
                    <Tv size={18} />
                  </button>

                  <button 
                    onClick={() => fetchFederatedDashboardData()} 
                    className={`p-2 rounded-lg hover:bg-slate-700 text-blue-400 transition-transform ${loading ? 'animate-spin' : ''}`}
                    title="Atualizar dados agora"
                  >
                    <RefreshCw size={18} />
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Navigation */}
        {servers.length > 0 && (
          <nav className="bg-slate-800/80 border-b border-slate-700/50 backdrop-blur-md sticky top-16 z-40">
            <div className="container mx-auto px-4 overflow-x-auto">
              <div className="flex gap-6 min-w-max">
                {[
                  { id: 'dashboard', icon: <Activity size={18} />, label: 'Dashboard' },
                  { id: 'status_kuma', icon: <CheckCircle2 size={18} />, label: 'Status dos Hosts' },
                  { id: 'tech_analytics', icon: <Users size={18} />, label: 'Ações dos Técnicos' },
                  { id: 'tv_wallboard', icon: <Tv size={18} />, label: 'Modo TV (NOC)' },
                  { id: 'flapping', icon: <Radio size={18} />, label: 'Flapping Radar' },
                  { id: 'timeline', icon: <Clock size={18} />, label: 'Timeline' },
                  { id: 'problems', icon: <AlertTriangle size={18} />, label: 'Problemas' },
                  { id: 'forecast', icon: <Calendar size={18} />, label: 'Previsões' },
                  { id: 'correlation', icon: <BrainCircuit size={18} />, label: 'Correlação' },
                ].map(item => {
                  const isSelected = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as any)}
                      title={item.label}
                      className={`group flex items-center py-3.5 px-3.5 border-b-2 transition-all duration-200 cursor-pointer ${
                        isSelected 
                          ? 'border-blue-500 text-blue-400 font-bold bg-blue-500/10 rounded-t-xl' 
                          : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-t-xl'
                      }`}
                    >
                      <span className="shrink-0 flex items-center justify-center">{item.icon}</span>

                      <span className={`text-xs font-semibold whitespace-nowrap transition-all duration-300 ease-in-out overflow-hidden ${
                        isSelected 
                          ? 'max-w-[200px] opacity-100 ml-2' 
                          : 'max-w-0 opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2'
                      }`}>
                        {item.label}
                      </span>

                      {item.id === 'problems' && displayedProblems.length > 0 && (
                        <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md shadow-red-500/20 shrink-0">
                          {displayedProblems.length}
                        </span>
                      )}
                      {item.id === 'correlation' && correlations.length > 0 && (
                        <span className="ml-1.5 bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md shadow-purple-500/20 shrink-0">
                          {correlations.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        )}

        <main className={`container mx-auto p-4 py-8 ${servers.length === 0 ? 'flex-1 flex flex-col items-center justify-center min-h-[calc(85vh-80px)]' : ''}`}>
          
          {/* Welcome / Onboarding Screen if no server is configured */}
          {servers.length === 0 && (
            <div className="max-w-2xl w-full mx-auto my-auto py-12 px-8 bg-slate-800/90 border border-slate-700/80 rounded-3xl text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/30">
                <Server size={32} />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white">Bem-vindo ao Zabbix Vision</h2>
                <p className="text-slate-400 text-sm max-w-lg mx-auto leading-relaxed">
                  Plataforma corporativa para monitoramento inteligente, matriz preditiva de falhas e correlação automatizada de causas-raiz em tempo real.
                </p>
              </div>

              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 text-left space-y-2 text-xs text-slate-300">
                <div className="font-semibold text-slate-200">Recursos Prontos para Uso:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
                  <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400" /> Suporte Multi-Servidor & Versões Mistas</div>
                  <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400" /> Diagnósticos por IA (Gemini ou Ollama)</div>
                  <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400" /> Matriz Preditiva Semanal (Forecast)</div>
                  <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400" /> Detecção de Efeitos Cascata e Tempestades</div>
                </div>
              </div>

              <button
                onClick={() => setConnectionModalOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm shadow-xl shadow-blue-600/20 transition-all transform hover:scale-105"
              >
                <LogIn size={18} />
                Conectar Primeiro Servidor Zabbix
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* Loading Spinner */}
          {loading && !lastRefreshed && servers.length > 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-slate-400 text-sm">Consultando servidores Zabbix e consolidando métricas...</p>
            </div>
          )}

          {/* Error Banner when initial query fails */}
          {error && servers.length > 0 && (!lastRefreshed || (hosts.length === 0 && allProblems.length === 0)) && !loading && (
            <div className="max-w-xl mx-auto p-6 bg-red-950/40 border border-red-500/40 rounded-2xl text-center space-y-4 my-8 shadow-xl">
              <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Falha ao Comunicar com Servidor Zabbix</h3>
                <p className="text-xs text-red-300 mt-1">{error}</p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => fetchFederatedDashboardData()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw size={14} /> Tentar Novamente
                </button>
                <button
                  onClick={() => setConnectionModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Verificar Configurações
                </button>
              </div>
            </div>
          )}

          {/* DASHBOARD TAB */}
          {servers.length > 0 && activeTab === 'dashboard' && lastRefreshed && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                  title="Problemas Ativos" 
                  value={allProblems.length} 
                  subtitle={allProblems.length > 0 ? "Requer atenção imediata" : "Sistemas estáveis"}
                  data={history.problems} 
                  color="#ef4444" 
                  icon={<AlertTriangle size={24} />} 
                />
                <StatCard 
                  title="Hosts Monitorados" 
                  value={hosts.length} 
                  subtitle={activeServerId === 'all' ? `Em ${servers.length} servidores Zabbix` : 'Infraestrutura total'}
                  data={history.hosts} 
                  color="#3b82f6" 
                  icon={<Server size={24} />} 
                />
                <StatCard 
                  title="Disponibilidade" 
                  value={`${history.availability[history.availability.length-1]}%`} 
                  subtitle="Uptime global"
                  data={history.availability} 
                  color="#10b981" 
                  icon={<CheckCircle size={24} />} 
                />
                <StatCard 
                  title="Alertas Hoje" 
                  value={displayedProblems.filter(p => parseInt(p.clock) > (Date.now()/1000 - 86400)).length} 
                  subtitle="Últimas 24 horas"
                  data={[5,12,15,8,20,10,12]} 
                  color="#f59e0b" 
                  icon={<Activity size={24} />} 
                />
              </div>
            </div>
          )}

          {/* PROBLEMS TAB */}
          {servers.length > 0 && (activeTab === 'problems' || activeTab === 'dashboard') && lastRefreshed && (
            <div className={`space-y-4 ${activeTab === 'dashboard' ? 'mt-8' : ''}`}>
              {activeTab === 'dashboard' && (
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Clock size={20} className="text-blue-500"/> Problemas Recentes
                </h2>
              )}
              
              {activeTab === 'problems' && (
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                      {[
                        { id: 'today', label: 'Hoje' },
                        { id: 'yesterday', label: 'Ontem' },
                        { id: 'week', label: 'Esta Semana' },
                        { id: 'unack', label: 'Não Reconhecidos' },
                      ].map(f => (
                        <button
                          key={f.id}
                          onClick={() => setFilterRange(f.id as any)}
                          className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                            filterRange === f.id 
                              ? 'bg-blue-600 text-white font-semibold shadow' 
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                      <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por host, problema, trigger ou servidor..." 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500" 
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
                    <span className="text-xs text-slate-500 flex items-center gap-1 uppercase tracking-wider font-semibold mr-2">
                      <Filter size={12}/> Tags:
                    </span>
                    {availableTags.map(tag => (
                      <button
                        key={tag.name}
                        onClick={() => {
                          if (selectedTags.includes(tag.name)) setSelectedTags(selectedTags.filter(t => t !== tag.name));
                          else setSelectedTags([...selectedTags, tag.name]);
                        }}
                        className={`text-xs px-2.5 py-1 rounded border transition-colors flex items-center gap-1 ${
                          selectedTags.includes(tag.name)
                            ? 'bg-blue-500/20 border-blue-500 text-blue-300 font-semibold'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                        }`}
                      >
                        {tag.name} <span className="opacity-50 text-[10px]">({tag.count})</span>
                      </button>
                    ))}
                    {selectedTags.length > 0 && (
                      <button onClick={() => setSelectedTags([])} className="text-xs text-red-400 hover:text-red-300 ml-auto flex items-center gap-1">
                        <X size={12} /> Limpar
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="p-4">Tempo</th>
                        <th className="p-4">Host / Servidor</th>
                        <th className="p-4 w-1/2">Problema</th>
                        <th className="p-4">Severidade</th>
                        <th className="p-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {displayedProblems.slice(0, activeTab === 'dashboard' ? 6 : 50).map((p, idx) => {
                        const hostName = p.hosts?.[0]?.name || 'Dispositivo';
                        const severityBadge = getSeverityBadge(p.severity);
                        
                        return (
                          <tr key={`${p.serverId || 'srv'}-${p.eventid}-${idx}`} className="hover:bg-slate-700/30 transition-colors group">
                            <td className="p-4 whitespace-nowrap">
                              <div className="flex items-center gap-2 text-slate-300 text-xs font-mono">
                                <Clock size={13} className="text-slate-500" />
                                {new Date(parseInt(p.clock) * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </div>
                              <div className="text-[11px] text-slate-500 ml-5">
                                {new Date(parseInt(p.clock) * 1000).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2 font-medium text-blue-400 text-sm">
                                <Server size={14} className="shrink-0" />
                                <span className="truncate max-w-[200px]" title={hostName}>{hostName}</span>
                              </div>
                              {p.serverName && (
                                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.serverColor || '#3b82f6' }} />
                                  <span className="truncate max-w-[140px]">{p.serverName}</span>
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="text-slate-200 text-sm font-medium">{p.name}</div>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {(p.tags || []).slice(0, 3).map((t, i) => (
                                  <span key={i} className="text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                                    {t.tag}: {t.value}
                                  </span>
                                ))}
                              </div>
                              {p.acknowledges && p.acknowledges.length > 0 && (
                                <div className="mt-1 text-xs text-emerald-400 flex items-center gap-1">
                                  <UserCheck size={11} /> {p.acknowledges.length} comentários
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              <span className={`text-xs font-bold px-2 py-1 rounded border capitalize ${severityBadge}`}>
                                {['N/A','Info','Aviso','Médio','Alto','Crítico'][parseInt(p.severity)] || 'Desconhecido'}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => handleAIProblemAnalysis(p)}
                                  className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border border-indigo-500/30 transition-all shadow-sm"
                                  title="Analisar Causa Raiz e Soluções com IA"
                                >
                                  <Sparkles size={13} className="text-indigo-400" /> IA
                                </button>
                                {p.acknowledged === '0' && (
                                  <button 
                                    onClick={() => { setSelectedProblem(p); setAckModalOpen(true); }}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 shadow-sm"
                                  >
                                    <CheckCircle size={13} /> Ack
                                  </button>
                                )}
                                <button 
                                  onClick={() => { setSelectedProblem(p); setResolveModalOpen(true); }}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 shadow-sm"
                                >
                                  <Settings size={13} /> Resolver
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {displayedProblems.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-slate-500">
                            <div className="flex flex-col items-center gap-2">
                              <CheckCircle size={32} className="text-emerald-500/50" />
                              <span>Nenhum problema encontrado com os filtros atuais.</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TIMELINE TAB */}
          {servers.length > 0 && activeTab === 'timeline' && (
            <div className="animate-in fade-in duration-300 space-y-4">
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center flex-wrap gap-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Clock size={20} className="text-blue-500"/> Timeline de Eventos
                </h2>
                <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                  {[
                    { id: 'hour', label: 'Última Hora' },
                    { id: 'day', label: 'Hoje' },
                    { id: 'week', label: 'Esta Semana' }
                  ].map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => setTimelinePeriod(p.id as any)}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                        timelinePeriod === p.id 
                          ? 'bg-blue-600 text-white shadow' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <Timeline events={timelineEvents} loading={false} />
            </div>
          )}
          
          {/* FORECAST TAB */}
          {servers.length > 0 && activeTab === 'forecast' && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold mb-1 flex items-center gap-2 text-white">
                      <Calendar className="text-indigo-400" /> Matriz Preditiva Semanal & Análise de Risco
                    </h2>
                    <p className="text-slate-400 text-xs sm:text-sm">
                      Previsão probabilística baseada em 30 dias de histórico enriquecido. Identifique recorrências e janelas de risco antes que afetem a operação.
                    </p>
                  </div>
                  <button 
                    onClick={handleAIPrediction}
                    disabled={aiLoading}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all transform hover:scale-105 active:scale-95 shrink-0"
                  >
                    <Sparkles size={16} className={aiLoading ? 'animate-spin' : ''} />
                    Gerar Previsão com IA
                  </button>
                </div>

                {forecastLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-3" />
                    <p className="text-slate-400 text-xs">Calculando projeções probabilísticas de incidentes...</p>
                  </div>
                ) : (
                  <ForecastCalendar 
                    data={forecastData} 
                    onGenerateAIPrediction={handleAIPrediction}
                    loadingAI={aiLoading}
                  />
                )}
              </div>
            </div>
          )}
          
          {/* CORRELATION TAB */}
          {servers.length > 0 && activeTab === 'correlation' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                      <BrainCircuit className="text-purple-400" />
                      Motor de Correlação Inteligente de Eventos
                    </h2>
                    <p className="text-slate-400 text-xs mt-1">
                      Detecta efeitos cascata (blast radius), tempestades de alertas simultâneos e causas-raiz em tempo real.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                      <button
                        onClick={() => setCorrelationScope('active')}
                        className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-all ${
                          correlationScope === 'active'
                            ? 'bg-purple-600 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Alertas Ativos ({allProblems.length})
                      </button>
                      <button
                        onClick={() => {
                          setCorrelationScope('history');
                          if (timelineEvents.length === 0) fetchTimelineData('day');
                        }}
                        className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-all ${
                          correlationScope === 'history'
                            ? 'bg-purple-600 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Histórico Recente
                      </button>
                    </div>

                    <select
                      value={correlationWindow}
                      onChange={(e) => setCorrelationWindow(parseInt(e.target.value))}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-purple-500"
                    >
                      <option value={300}>Janela: 5 min</option>
                      <option value={900}>Janela: 15 min</option>
                      <option value={1800}>Janela: 30 min</option>
                      <option value={3600}>Janela: 1 hora</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-700/60">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Tipo de Correlação:</span>
                  {[
                    { id: 'all', label: `Todos (${correlations.length})` },
                    { id: 'host_cascade', label: 'Cascata no Host' },
                    { id: 'cross_host_wave', label: 'Onda Multi-Host' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setCorrelationTypeFilter(t.id as any)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                        correlationTypeFilter === t.id
                          ? 'bg-purple-500/20 border-purple-500 text-purple-300 font-bold'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Correlation Groups List */}
              <div className="space-y-4">
                {correlations.map((group, i) => (
                  <div 
                    key={group.id || i} 
                    className="bg-slate-800/90 p-6 rounded-xl border border-slate-700 hover:border-purple-500/50 transition-all shadow-lg relative overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4 relative z-10">
                      <div className="flex items-start gap-3">
                        <div className="p-3 bg-purple-500/20 text-purple-400 rounded-xl border border-purple-500/30 shrink-0">
                          {group.type === 'cross_host_wave' ? <Layers size={22} /> : <Server size={22} />}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                              <Server size={18} className="text-purple-400" />
                              <span>Host: <strong className="text-purple-300">{group.host}</strong></span>
                            </h3>
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${
                              group.type === 'cross_host_wave' 
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
                                : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            }`}>
                              {group.type === 'cross_host_wave' ? 'Impacto Multi-Host' : 'Cascata Local'}
                            </span>
                            {group.siteName && (
                              <span className="text-[11px] px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold flex items-center gap-1.5 shadow-sm">
                                🏢 EMPRESA / SITE: <strong>{group.siteName}</strong>
                              </span>
                            )}
                          </div>

                          {/* Affected Hosts List */}
                          {group.affectedHosts && group.affectedHosts.length > 0 && (
                            <div className="text-xs text-slate-300 mt-2 flex flex-wrap items-center gap-1.5 bg-slate-900/60 p-2 rounded-lg border border-slate-700/80">
                              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Hosts Impactados:</span>
                              {group.affectedHosts.map(h => (
                                <span key={h} className="px-2 py-0.5 bg-slate-800 rounded-md border border-slate-600 font-mono text-[11px] text-cyan-300 font-bold flex items-center gap-1">
                                  <Server size={10} className="text-cyan-400" />
                                  {h}
                                </span>
                              ))}
                            </div>
                          )}

                          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                            <Clock size={12} className="text-slate-500" />
                            Início: {new Date(group.startTime * 1000).toLocaleTimeString()} 
                            {group.endTime ? ` ➔ Fim: ${new Date(group.endTime * 1000).toLocaleTimeString()}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-2xl font-black text-purple-400 leading-none">{group.confidence}%</div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Confiança</div>
                        </div>
                        <button 
                          onClick={() => handleAICorrelationAnalysis(group)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-lg border border-indigo-500/30 text-xs font-bold transition-all shadow-sm"
                        >
                          <Sparkles size={13} className="text-indigo-400" /> Diagnóstico IA
                        </button>
                      </div>
                    </div>

                    {group.commonKeywords.length > 0 && (
                      <div className="mb-4 relative z-10 flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] uppercase text-slate-400 font-bold">Padrões Identificados:</span>
                        {group.commonKeywords.map(k => (
                          <span key={k} className="px-2 py-0.5 bg-purple-500/10 rounded-md text-xs text-purple-300 border border-purple-500/20 font-medium">
                            {k}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2 relative z-10">
                      <div className="text-xs uppercase text-slate-400 font-bold flex items-center justify-between">
                        <span>Sequência de Eventos ({group.events.length}):</span>
                        <span className="text-[10px] text-slate-500 lowercase font-normal">ordem cronológica</span>
                      </div>
                      <div className="space-y-1.5">
                        {group.events.map((e, eIdx) => {
                          const isRoot = eIdx === 0;
                          const { hostName: evHost, siteName: evSite } = getEventSiteAndHost(e);

                          return (
                            <div 
                              key={e.eventid + eIdx} 
                              className={`flex flex-wrap sm:flex-nowrap items-center gap-2.5 p-2.5 rounded-xl border transition-all ${
                                isRoot 
                                  ? 'bg-purple-950/30 border-purple-500/40 text-purple-200' 
                                  : 'bg-slate-900/80 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="text-[10px] font-mono text-slate-400 shrink-0">
                                {new Date(parseInt(e.clock)*1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </div>
                              <div className={`w-2 h-2 rounded-full shrink-0 ${getSeverityBadge(e.severity).split(' ')[0].replace('/20', '')}`} />
                              
                              {/* Empresa / Site Tag */}
                              <span className="px-2 py-0.5 rounded-md bg-blue-500/20 border border-blue-500/40 text-blue-300 font-bold text-[10px] shrink-0 flex items-center gap-1">
                                🏢 {evSite}
                              </span>

                              {/* Host Name Tag */}
                              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-700 text-cyan-300 font-mono text-[11px] font-bold flex items-center gap-1 shrink-0">
                                <Server size={11} className="text-cyan-400" />
                                Host: {evHost}
                              </span>

                              {/* Server Origin Tag (if multiple servers exist) */}
                              {e.serverName && servers.length > 1 && (
                                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                  ({e.serverName})
                                </span>
                              )}

                              {/* Event Name */}
                              <div className="flex-1 min-w-0">
                                <span className="text-xs truncate font-medium block" title={e.name}>{e.name}</span>
                              </div>

                              {isRoot && (
                                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold border border-purple-500/40 shrink-0">
                                  Provável Causa Primária
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}

                {correlations.length === 0 && (
                  <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-12 text-center text-slate-400 space-y-3">
                    <BrainCircuit size={48} className="mx-auto text-slate-600" />
                    <p className="text-base font-medium text-slate-300">
                      Nenhuma correlação detectada nos filtros atuais.
                    </p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Você pode alterar a janela de tempo acima para 30 minutos / 1 hora ou alternar para "Histórico Recente" para analisar incidentes passados.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NOC WALLBOARD / MODO TV */}
          {servers.length > 0 && activeTab === 'tv_wallboard' && (
            <NocWallboard
              hosts={hosts}
              problems={allProblems}
              events={timelineEvents}
              lastRefreshed={lastRefreshed}
              onClose={() => setActiveTab('status_kuma')}
              onAnalyzeAI={handleAIProblemAnalysis}
            />
          )}

          {/* TECHNICIAN ANALYTICS TAB */}
          {servers.length > 0 && activeTab === 'tech_analytics' && (
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
              <TechnicianAnalytics
                problems={allProblems}
                events={timelineEvents}
                solutions={solutions}
                onAnalyzeAI={(prompt) => {
                  setAiModalTitle('Relatório de Produtividade da Equipe com IA');
                  setAiModalContent(null);
                  setIsAIModalOpen(true);
                  setAiLoading(true);
                  AIService.generateCustomAnalysis(prompt)
                    .then(res => {
                      setAiModalContent(res.result);
                      setAiEngine(res.engine as any);
                    })
                    .catch(err => setAiModalContent("Erro ao gerar relatório com IA."))
                    .finally(() => setAiLoading(false));
                }}
              />
            </div>
          )}

          {/* STATUS KUMA TAB */}
          {servers.length > 0 && activeTab === 'status_kuma' && (
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
              <HostStatusKuma
                hosts={hosts}
                problems={allProblems}
                onAnalyzeAI={handleAIProblemAnalysis}
              />
            </div>
          )}

          {/* TOPOLOGY TAB */}
          {servers.length > 0 && activeTab === 'topology' && (
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
              <TopologyMap
                hosts={hosts}
                problems={allProblems}
                onAnalyzeAI={handleAITopologyAnalysis}
              />
            </div>
          )}

          {/* FLAPPING RADAR TAB */}
          {servers.length > 0 && activeTab === 'flapping' && (
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
              <FlappingRadar
                events={timelineEvents}
                problems={allProblems}
                onAnalyzeAI={handleAIFlappingAnalysis}
              />
            </div>
          )}

        </main>
      </div>

      {/* --- MODALS --- */}

      {/* Zabbix Multi-Server Connection Settings Modal */}
      <ZabbixConnectionModal
        isOpen={connectionModalOpen}
        onClose={() => setConnectionModalOpen(false)}
        servers={servers}
        activeServerId={activeServerId}
        onSelectActiveServer={handleSelectServer}
        onSaveServer={handleSaveServer}
        onDeleteServer={handleDeleteServer}
      />

      {/* AI Analysis Modal */}
      <AIAnalysisModal 
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        title={aiModalTitle}
        content={aiModalContent}
        loading={aiLoading}
        engine={aiEngine}
      />

      {/* AI Settings / Ollama Config Modal */}
      <AISettingsModal
        isOpen={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
        onConfigChange={(newCfg) => setAiConfig(newCfg)}
      />

      {/* Acknowledge Modal */}
      <Modal 
        isOpen={ackModalOpen} 
        onClose={() => setAckModalOpen(false)} 
        title={`Reconhecer Alerta: ${selectedProblem?.hosts?.[0]?.name || 'Host'}`}
      >
        <div className="space-y-4">
          <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 text-sm">
            <strong className="text-slate-400 block text-xs uppercase mb-1">Problema</strong>
            <p className="text-white font-medium">{selectedProblem?.name}</p>
          </div>

          <div>
            <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">Mensagens Rápidas</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {ACK_PRESETS.map(preset => (
                <button 
                  key={preset}
                  onClick={() => setComment(preset)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-md transition-colors border border-slate-700"
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea 
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none text-xs"
              rows={4}
              placeholder="Descreva as ações tomadas na investigação..."
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
            <button onClick={() => setAckModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white text-xs">Cancelar</button>
            <button onClick={handleAcknowledge} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle size={14} /> Confirmar Reconhecimento
            </button>
          </div>
        </div>
      </Modal>

      {/* Resolve Modal */}
      <Modal 
        isOpen={resolveModalOpen} 
        onClose={() => setResolveModalOpen(false)} 
        title="Resolver e Fechar Incidente"
      >
        <div className="space-y-4">
          <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-900/40">
            <p className="text-xs text-emerald-400 font-bold mb-3 uppercase tracking-wider flex items-center gap-2">
              <BrainCircuit size={14}/> Soluções Salvas no Histórico
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {selectedProblem && getPreviousSolutions(selectedProblem.name).map(s => (
                <div 
                  key={s.id} 
                  onClick={() => setComment(s.solution)}
                  className="text-xs bg-slate-900/60 hover:bg-emerald-900/20 p-2.5 rounded-lg cursor-pointer border border-slate-800 hover:border-emerald-500/40 transition-all group"
                >
                  <p className="text-slate-300 group-hover:text-emerald-300">{s.solution}</p>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {new Date(s.timestamp).toLocaleDateString()} • Utilizado {s.usedCount}x
                  </span>
                </div>
              ))}
              {selectedProblem && getPreviousSolutions(selectedProblem.name).length === 0 && (
                <div className="text-xs text-slate-500 italic text-center py-2">
                  Nenhuma solução anterior registrada para este padrão.
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">Mensagens Rápidas de Resolução</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {RESOLVE_PRESETS.map(preset => (
                <button 
                  key={preset}
                  onClick={() => setComment(preset)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-md transition-colors border border-slate-700"
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea 
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none text-xs"
              rows={4}
              placeholder="Descreva a solução definitiva aplicada..."
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
            <button onClick={() => setResolveModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white text-xs">Cancelar</button>
            <button onClick={handleResolve} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <Settings size={14} /> Resolver & Salvar Solução
            </button>
          </div>
        </div>
      </Modal>

      {/* Footer */}
      <footer className="py-3.5 text-center text-xs text-slate-400 border-t border-slate-800 bg-slate-950/80 mt-auto flex items-center justify-center gap-2">
        <span>Zabbix Vision &copy; 2026</span>
        <span className="text-slate-600">|</span>
        <a 
          href="http://www.runeprojects.com.br/" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-slate-300 hover:text-blue-400 font-medium transition-colors"
        >
          Rune Projects
        </a>
      </footer>
    </div>
  );
}

export default App;
