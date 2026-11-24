import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Network, Server, Database, Video, Cloud, Router, 
  AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, 
  Search, ZoomIn, ZoomOut, RotateCcw, Filter, Eye, 
  Layers, ArrowRight, Zap, Info, Play, RefreshCw, X, Radio,
  Building2, ChevronRight, ChevronDown, Check, Activity
} from 'lucide-react';
import { ZabbixHost, ZabbixProblem, TopologyNode, TopologyLink } from '../types';

interface TopologyMapProps {
  hosts: ZabbixHost[];
  problems: ZabbixProblem[];
  onAnalyzeAI: (node: TopologyNode, children: TopologyNode[], problems: ZabbixProblem[]) => void;
}

interface SiteCluster {
  id: string;
  name: string;
  serverName?: string;
  serverColor?: string;
  rootNode?: TopologyNode;
  nodes: TopologyNode[];
  criticalCount: number;
  warningCount: number;
  totalProblems: number;
  status: 'healthy' | 'warning' | 'critical';
}

export const TopologyMap: React.FC<TopologyMapProps> = ({
  hosts,
  problems,
  onAnalyzeAI,
}) => {
  const [selectedSiteId, setSelectedSiteId] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'sites' | 'canvas'>('sites');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [simulatedDownId, setSimulatedDownId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract Site prefix from host name (e.g. EMPRESA-PFSENSE -> EMPRESA, FILIAL-SP-SW... -> FILIAL)
  const extractSiteName = (hostName: string): string => {
    const clean = hostName.trim();
    // Check delimiter - or _ or space
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

  // Categorize host by function
  const categorizeHost = (name: string): TopologyNode['category'] => {
    const lower = name.toLowerCase();
    if (lower.includes('gw') || lower.includes('gateway') || lower.includes('router') || lower.includes('firewall') || lower.includes('forti') || lower.includes('pfsense') || lower.includes('mikrotik') || lower.includes('bgp') || lower.includes('core') || lower.includes('-fw')) {
      return 'core_network';
    }
    if (lower.includes('sw') || lower.includes('switch') || lower.includes('poe') || lower.includes('unifi') || lower.includes('cisco') || lower.includes('hp') || lower.includes('dell-sw')) {
      return 'switch';
    }
    if (lower.includes('camera') || lower.includes('câmera') || lower.includes('cam') || lower.includes('cftv') || lower.includes('dvr') || lower.includes('nvr') || lower.includes('intelbras')) {
      return 'cftv';
    }
    if (lower.includes('sql') || lower.includes('db') || lower.includes('banco') || lower.includes('postgres') || lower.includes('mysql') || lower.includes('oracle') || lower.includes('mongo') || lower.includes('redis')) {
      return 'database';
    }
    if (lower.includes('cloud') || lower.includes('aws') || lower.includes('azure') || lower.includes('gcp') || lower.includes('link') || lower.includes('internet') || lower.includes('fibra') || lower.includes('wan')) {
      return 'cloud';
    }
    return 'server';
  };

  // Build Topology by Site Clusters (Eliminating cross-client spaghetti links!)
  const { siteClusters, allNodes, allLinks } = useMemo(() => {
    if (hosts.length === 0) return { siteClusters: [], allNodes: [], allLinks: [] };

    // Group active problems by host id & name
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

    // 1. Group hosts into Site Clusters based on naming prefix
    const clusterMap = new Map<string, ZabbixHost[]>();
    hosts.forEach(h => {
      const site = extractSiteName(h.name);
      const list = clusterMap.get(site) || [];
      list.push(h);
      clusterMap.set(site, list);
    });

    const clustersList: SiteCluster[] = [];
    const completeNodes: TopologyNode[] = [];
    const completeLinks: TopologyLink[] = [];

    let currentCanvasX = 60;

    clusterMap.forEach((clusterHosts, siteName) => {
      // Build nodes for this cluster
      const clusterNodes: TopologyNode[] = clusterHosts.map((h, idx) => {
        const category = categorizeHost(h.name);
        const hostProblems = problemsByHost.get(h.hostid) || problemsByHost.get(h.name) || [];
        const hasCritical = hostProblems.some(p => p.severity === '5' || p.severity === '4');
        const hasWarning = hostProblems.length > 0;

        let status: TopologyNode['status'] = 'healthy';
        if (hasCritical) status = 'critical';
        else if (hasWarning) status = 'warning';

        return {
          id: h.hostid || `${siteName}-node-${idx}`,
          hostid: h.hostid,
          name: h.name,
          category,
          status,
          activeProblemsCount: hostProblems.length,
          problems: hostProblems,
          childrenIds: [],
          serverName: h.serverName,
          serverColor: h.serverColor,
        };
      });

      // Find root node (Gateway / Firewall / Switch / or first node)
      let root = clusterNodes.find(n => n.category === 'core_network');
      if (!root) root = clusterNodes.find(n => n.category === 'switch');
      if (!root && clusterNodes.length > 0) root = clusterNodes[0];

      // Identify switches and leaves
      const switches = clusterNodes.filter(n => n.category === 'switch' && n.id !== root?.id);
      const leaves = clusterNodes.filter(n => n.id !== root?.id && !switches.some(s => s.id === n.id));

      // Build internal cluster links (Within this site only!)
      if (root) {
        if (switches.length > 0) {
          switches.forEach(sw => {
            root!.childrenIds = root!.childrenIds || [];
            root!.childrenIds.push(sw.id);
            sw.parentId = root!.id;
            completeLinks.push({
              source: root!.id,
              target: sw.id,
              status: root!.status === 'critical' ? 'broken' : (root!.status === 'warning' ? 'degraded' : 'active')
            });
          });

          leaves.forEach((leaf, lIdx) => {
            const parentSw = switches[lIdx % switches.length];
            parentSw.childrenIds = parentSw.childrenIds || [];
            parentSw.childrenIds.push(leaf.id);
            leaf.parentId = parentSw.id;
            completeLinks.push({
              source: parentSw.id,
              target: leaf.id,
              status: parentSw.status === 'critical' || root!.status === 'critical' ? 'broken' : 'active'
            });
          });
        } else {
          // Leaves connect directly to root
          leaves.forEach(leaf => {
            root!.childrenIds = root!.childrenIds || [];
            root!.childrenIds.push(leaf.id);
            leaf.parentId = root!.id;
            completeLinks.push({
              source: root!.id,
              target: leaf.id,
              status: root!.status === 'critical' ? 'broken' : 'active'
            });
          });
        }
      }

      // Check Cascade Propagation within this cluster
      const isRootDown = root?.status === 'critical';
      if (isRootDown) {
        clusterNodes.forEach(n => {
          if (n.id !== root?.id && n.status === 'healthy') {
            n.status = 'cascaded';
          }
        });
      }

      // Simulated Cascade
      if (simulatedDownId && clusterNodes.some(n => n.id === simulatedDownId)) {
        const simNode = clusterNodes.find(n => n.id === simulatedDownId)!;
        simNode.status = 'simulated_down';
        const queue = [simulatedDownId];
        while (queue.length > 0) {
          const currId = queue.shift()!;
          const curr = clusterNodes.find(n => n.id === currId);
          if (curr && curr.childrenIds) {
            curr.childrenIds.forEach(cId => {
              const child = clusterNodes.find(n => n.id === cId);
              if (child) {
                child.status = 'simulated_down';
                queue.push(cId);
              }
            });
          }
        }
      }

      // Layout Positions for Canvas Mode (Clean Tree by Cluster)
      const NODE_GAP_X = 220;
      const clusterWidth = Math.max(260, Math.max(switches.length, leaves.length, 1) * NODE_GAP_X);
      const clusterCenterX = currentCanvasX + (clusterWidth / 2) - 100;

      if (root) {
        root.x = clusterCenterX;
        root.y = 80;
      }

      switches.forEach((sw, idx) => {
        const swStartX = currentCanvasX + (idx * NODE_GAP_X);
        sw.x = swStartX;
        sw.y = 230;
      });

      leaves.forEach((leaf, idx) => {
        const leafStartX = currentCanvasX + (idx * NODE_GAP_X);
        leaf.x = leafStartX;
        leaf.y = 380;
      });

      currentCanvasX += clusterWidth + 140;

      // Stats
      const criticalCount = clusterNodes.filter(n => n.status === 'critical').length;
      const warningCount = clusterNodes.filter(n => n.status === 'warning' || n.status === 'cascaded').length;
      const totalProblems = clusterNodes.reduce((acc, curr) => acc + curr.activeProblemsCount, 0);

      let status: SiteCluster['status'] = 'healthy';
      if (criticalCount > 0) status = 'critical';
      else if (warningCount > 0) status = 'warning';

      clustersList.push({
        id: siteName,
        name: siteName,
        serverName: clusterHosts[0]?.serverName,
        serverColor: clusterHosts[0]?.serverColor,
        rootNode: root,
        nodes: clusterNodes,
        criticalCount,
        warningCount,
        totalProblems,
        status,
      });

      completeNodes.push(...clusterNodes);
    });

    // Sort clusters: critical first, then warning, then name
    clustersList.sort((a, b) => {
      if (a.criticalCount !== b.criticalCount) return b.criticalCount - a.criticalCount;
      if (a.totalProblems !== b.totalProblems) return b.totalProblems - a.totalProblems;
      return a.name.localeCompare(b.name);
    });

    return {
      siteClusters: clustersList,
      allNodes: completeNodes,
      allLinks: completeLinks,
    };
  }, [hosts, problems, simulatedDownId]);

  // Filtered clusters based on selection and search
  const displayedClusters = useMemo(() => {
    return siteClusters.filter(c => {
      const matchSite = selectedSiteId === 'all' || c.id === selectedSiteId;
      const matchSearch = !searchQuery || 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.nodes.some(n => n.name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSite && matchSearch;
    });
  }, [siteClusters, selectedSiteId, searchQuery]);

  // Nodes for Canvas mode
  const displayedCanvasNodes = useMemo(() => {
    if (selectedSiteId === 'all') return allNodes;
    const cl = siteClusters.find(c => c.id === selectedSiteId);
    return cl ? cl.nodes : allNodes;
  }, [allNodes, siteClusters, selectedSiteId]);

  const selectedNode = useMemo(() => {
    return allNodes.find(n => n.id === selectedNodeId) || null;
  }, [allNodes, selectedNodeId]);

  const selectedNodeChildren = useMemo(() => {
    if (!selectedNode?.childrenIds) return [];
    return allNodes.filter(n => selectedNode.childrenIds?.includes(n.id));
  }, [allNodes, selectedNode]);

  const getNodeIcon = (category: TopologyNode['category'], size = 18) => {
    switch (category) {
      case 'core_network': return <Router size={size} className="text-purple-400" />;
      case 'switch': return <Network size={size} className="text-blue-400" />;
      case 'database': return <Database size={size} className="text-amber-400" />;
      case 'cftv': return <Video size={size} className="text-teal-400" />;
      case 'cloud': return <Cloud size={size} className="text-cyan-400" />;
      default: return <Server size={size} className="text-indigo-400" />;
    }
  };

  const getStatusBadge = (status: TopologyNode['status']) => {
    switch (status) {
      case 'critical':
        return {
          label: 'Falha Crítica',
          bg: 'bg-red-500/20 border-red-500/40 text-red-300',
          dot: 'bg-red-500',
          ring: 'border-red-500/60 shadow-lg shadow-red-500/20 animate-pulse',
        };
      case 'warning':
        return {
          label: 'Alerta',
          bg: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
          dot: 'bg-yellow-500',
          ring: 'border-yellow-500/50',
        };
      case 'cascaded':
        return {
          label: 'Impacto em Cascata',
          bg: 'bg-orange-500/20 border-orange-500/40 text-orange-300',
          dot: 'bg-orange-500',
          ring: 'border-orange-500/50 animate-pulse',
        };
      case 'simulated_down':
        return {
          label: 'Queda Simulada',
          bg: 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-300',
          dot: 'bg-fuchsia-500',
          ring: 'border-fuchsia-500 animate-bounce',
        };
      default:
        return {
          label: 'Operacional',
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
          dot: 'bg-emerald-500',
          ring: 'border-slate-700 hover:border-slate-500',
        };
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      {/* Top Header & View Toggle Bar */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Network size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Mapa de Topologia e Dependências por Site
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {siteClusters.length} Unidades / {hosts.length} Dispositivos
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Visualização estruturada por filiais/clientes com detecção de falha raiz no gateway e propagação de impacto a jusante.
              </p>
            </div>
          </div>

          {/* View Mode Toggle (Sites Hierarchy vs Canvas) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setViewMode('sites')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                  viewMode === 'sites'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers size={14} /> Árvore por Sites / Clientes
              </button>
              <button
                onClick={() => setViewMode('canvas')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                  viewMode === 'canvas'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Activity size={14} /> Grafo Visual do Enlace
              </button>
            </div>

            {simulatedDownId && (
              <button
                onClick={() => setSimulatedDownId(null)}
                className="px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow animate-pulse"
              >
                <RotateCcw size={13} /> Limpar Simulação
              </button>
            )}
          </div>
        </div>

        {/* Site Filter Pills & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-700/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Building2 size={13} /> Filtrar Site:
            </span>

            <button
              onClick={() => setSelectedSiteId('all')}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                selectedSiteId === 'all'
                  ? 'bg-blue-600 border-blue-500 text-white font-bold shadow'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              Todos ({siteClusters.length})
            </button>

            {siteClusters.map(cl => (
              <button
                key={cl.id}
                onClick={() => setSelectedSiteId(cl.id)}
                className={`px-2.5 py-1 text-xs rounded-lg border flex items-center gap-1.5 transition-all ${
                  selectedSiteId === cl.id
                    ? 'bg-blue-600 border-blue-500 text-white font-bold shadow'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    cl.status === 'critical'
                      ? 'bg-red-500'
                      : cl.status === 'warning'
                      ? 'bg-yellow-500'
                      : 'bg-emerald-500'
                  }`}
                />
                <span>{cl.name}</span>
                <span className="text-[10px] opacity-60 font-mono">({cl.nodes.length})</span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por host, switch, CFTV..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: SITES HIERARCHY TREE VIEW (Organized by Client / Branch) */}
      {viewMode === 'sites' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Clusters List */}
          <div className="lg:col-span-8 xl:col-span-8 space-y-4">
            {displayedClusters.map(cluster => {
              const isCrit = cluster.status === 'critical';
              const isWarn = cluster.status === 'warning';

              return (
                <div
                  key={cluster.id}
                  className={`bg-slate-800 rounded-2xl border p-5 transition-all shadow-lg space-y-4 ${
                    isCrit
                      ? 'border-red-500/50 bg-gradient-to-r from-red-950/20 via-slate-800 to-slate-800'
                      : isWarn
                      ? 'border-yellow-500/40'
                      : 'border-slate-700'
                  }`}
                >
                  {/* Site Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-700/60">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-xl border ${
                          isCrit
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : isWarn
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        <Building2 size={20} />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-white">{cluster.name}</h3>
                          {cluster.serverName && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                              {cluster.serverName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {cluster.nodes.length} dispositivo(s) monitorados neste segmento
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {cluster.totalProblems > 0 ? (
                        <span className="px-2.5 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg text-xs font-bold flex items-center gap-1.5">
                          <AlertTriangle size={13} /> {cluster.totalProblems} alerta(s)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                          <CheckCircle2 size={13} /> 100% Estável
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Clean Hierarchy Tree Flow */}
                  <div className="space-y-3 pt-1">
                    {/* Layer 1: Gateway / Root */}
                    {cluster.rootNode && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                          <Router size={13} className="text-purple-400" /> Borda / Gateway de Saída:
                        </div>

                        <div
                          onClick={() => setSelectedNodeId(cluster.rootNode!.id)}
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            getStatusBadge(cluster.rootNode.status).ring
                          } ${
                            selectedNodeId === cluster.rootNode.id
                              ? 'bg-slate-700 ring-2 ring-blue-400'
                              : 'bg-slate-900/80 hover:bg-slate-700/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                              {getNodeIcon(cluster.rootNode.category, 18)}
                            </div>
                            <div>
                              <div className="font-bold text-xs text-white flex items-center gap-2">
                                {cluster.rootNode.name}
                                <span className={`text-[10px] px-2 py-0.5 rounded border ${getStatusBadge(cluster.rootNode.status).bg}`}>
                                  {getStatusBadge(cluster.rootNode.status).label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400">Ponto Central da Topologia</p>
                            </div>
                          </div>

                          {cluster.rootNode.activeProblemsCount > 0 && (
                            <span className="text-xs text-red-400 font-bold px-2 py-1 bg-red-950/40 rounded-lg border border-red-500/30">
                              {cluster.rootNode.activeProblemsCount} problema(s)
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Layer 2 & 3: Downstream Devices / Switches & Endpoints */}
                    {cluster.nodes.filter(n => n.id !== cluster.rootNode?.id).length > 0 && (
                      <div className="space-y-2 pl-4 border-l-2 border-slate-700/80 mt-2">
                        <div className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                          <ArrowRight size={12} className="text-blue-400" /> Dispositivos e Serviços Conectados ({cluster.nodes.length - 1}):
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {cluster.nodes
                            .filter(n => n.id !== cluster.rootNode?.id)
                            .map(node => {
                              const badge = getStatusBadge(node.status);
                              const isSelected = selectedNodeId === node.id;

                              return (
                                <div
                                  key={node.id}
                                  onClick={() => setSelectedNodeId(node.id)}
                                  className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${badge.ring} ${
                                    isSelected
                                      ? 'bg-slate-700 ring-2 ring-blue-400'
                                      : 'bg-slate-900/60 hover:bg-slate-700/40'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="p-1.5 bg-slate-950 rounded-lg border border-slate-800 shrink-0">
                                      {getNodeIcon(node.category, 15)}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-semibold text-xs text-white truncate" title={node.name}>
                                        {node.name}
                                      </div>
                                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                                        <span>{badge.label}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {node.activeProblemsCount > 0 && (
                                    <span className="text-[10px] text-red-400 font-bold px-1.5 py-0.5 bg-red-950/40 rounded border border-red-500/30 shrink-0">
                                      {node.activeProblemsCount}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {displayedClusters.length === 0 && (
              <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-12 text-center text-slate-400 space-y-3">
                <Search size={36} className="mx-auto text-slate-600" />
                <h4 className="font-bold text-white text-sm">Nenhum site encontrado para esta busca</h4>
                <p className="text-xs text-slate-500">Tente ajustar o termo de pesquisa ou selecionar "Todos".</p>
              </div>
            )}
          </div>

          {/* Node Inspector Side Drawer */}
          <div className="lg:col-span-4 xl:col-span-4 space-y-4">
            {selectedNode ? (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-5 shadow-2xl sticky top-20">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-700 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-900 text-blue-400 rounded-xl border border-slate-700">
                      {getNodeIcon(selectedNode.category, 22)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-white truncate" title={selectedNode.name}>
                        {selectedNode.name}
                      </h3>
                      <p className="text-xs text-slate-400 capitalize">
                        {selectedNode.category.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedNodeId(null)}
                    className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Status & Cascade Blast Radius Metrics */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block mb-1">
                      Estado
                    </span>
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${getStatusBadge(selectedNode.status).dot}`} />
                      {getStatusBadge(selectedNode.status).label}
                    </span>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block mb-1">
                      Raio de Queda
                    </span>
                    <span className="text-xs font-bold text-blue-400 flex items-center gap-1">
                      <Radio size={13} /> {selectedNodeChildren.length} dependentes
                    </span>
                  </div>
                </div>

                {/* Simulation Action */}
                <div>
                  {simulatedDownId === selectedNode.id ? (
                    <button
                      onClick={() => setSimulatedDownId(null)}
                      className="w-full py-2.5 px-3 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow"
                    >
                      <RotateCcw size={14} /> Encerrar Simulação de Queda
                    </button>
                  ) : (
                    <button
                      onClick={() => setSimulatedDownId(selectedNode.id)}
                      className="w-full py-2.5 px-3 bg-slate-900 hover:bg-fuchsia-600/20 text-fuchsia-300 hover:text-fuchsia-200 border border-fuchsia-500/30 hover:border-fuchsia-500/60 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <Play size={14} /> Simular Queda Deste Dispositivo
                    </button>
                  )}
                </div>

                {/* AI Impact Analysis Button */}
                <button
                  onClick={() => onAnalyzeAI(selectedNode, selectedNodeChildren, selectedNode.problems)}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
                >
                  <Sparkles size={14} /> Analisar Impacto em Cascata com IA
                </button>

                {/* Active Problems List */}
                <div className="space-y-2 pt-2 border-t border-slate-700">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    Alarmes Ativos ({selectedNode.problems.length})
                  </span>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedNode.problems.map(p => (
                      <div
                        key={p.eventid}
                        className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-1"
                      >
                        <div className="font-semibold text-white truncate">{p.name}</div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span>Severidade {p.severity}</span>
                          <span>{new Date(parseInt(p.clock) * 1000).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}

                    {selectedNode.problems.length === 0 && (
                      <div className="p-4 text-center bg-slate-900/50 rounded-xl border border-slate-800 text-xs text-slate-500">
                        Nenhum problema registrado no dispositivo.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-8 text-center space-y-3 sticky top-20">
                <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mx-auto">
                  <Info size={22} />
                </div>
                <h4 className="font-bold text-sm text-white">Inspeção de Topologia</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Selecione qualquer dispositivo para verificar suas dependências, disparar o simulador de queda de enlace ou executar a análise de impacto com IA.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: VISUAL CANVAS GRAPH (Clean by Site) */}
      {viewMode === 'canvas' && (
        <div className="bg-slate-950 border border-slate-800 rounded-3xl min-h-[620px] h-[680px] relative overflow-hidden select-none shadow-2xl p-4">
          <div 
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }}
          />

          <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1.5 rounded-xl">
            <button
              onClick={() => setZoomLevel(prev => Math.max(0.6, prev - 0.15))}
              className="p-1.5 text-slate-400 hover:text-white rounded"
              title="Diminuir Zoom"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-xs font-mono text-slate-300 px-1">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel(prev => Math.min(1.5, prev + 0.15))}
              className="p-1.5 text-slate-400 hover:text-white rounded"
              title="Aumentar Zoom"
            >
              <ZoomIn size={15} />
            </button>
            <button
              onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
              className="p-1.5 text-slate-400 hover:text-white rounded border-l border-slate-800"
              title="Resetar Posição"
            >
              <RotateCcw size={15} />
            </button>
          </div>

          {/* SVG Canvas for Links and Nodes */}
          <div
            className="absolute inset-0 overflow-auto p-8"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'top left',
            }}
          >
            {/* SVG Connecting Curves */}
            <svg className="absolute inset-0 w-[4000px] h-[2000px] pointer-events-none overflow-visible">
              {allLinks.map((link, idx) => {
                const s = displayedCanvasNodes.find(n => n.id === link.source);
                const t = displayedCanvasNodes.find(n => n.id === link.target);
                if (!s?.x || !s?.y || !t?.x || !t?.y) return null;

                const sx = s.x + 95;
                const sy = s.y + 55;
                const tx = t.x + 95;
                const ty = t.y;

                const isBroken = link.status === 'broken' || s.status === 'critical';
                const isSimulated = s.status === 'simulated_down';
                const path = `M ${sx} ${sy} C ${sx} ${sy + 45}, ${tx} ${ty - 45}, ${tx} ${ty}`;

                return (
                  <path
                    key={idx}
                    d={path}
                    fill="none"
                    stroke={isSimulated ? '#d946ef' : (isBroken ? '#ef4444' : '#3b82f6')}
                    strokeWidth={isBroken || isSimulated ? 2.5 : 1.8}
                    strokeDasharray={isBroken || isSimulated ? '5,4' : undefined}
                    opacity={0.7}
                  />
                );
              })}
            </svg>

            {/* Positioned Node Cards */}
            {displayedCanvasNodes.map(node => {
              if (node.x === undefined || node.y === undefined) return null;
              const badge = getStatusBadge(node.status);
              const isSelected = selectedNodeId === node.id;

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  style={{
                    position: 'absolute',
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: '190px',
                  }}
                  className={`bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 border transition-all cursor-pointer shadow-xl ${badge.ring} ${
                    isSelected ? 'ring-2 ring-blue-400 scale-105 z-30' : 'hover:scale-102 z-10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="p-1.5 bg-slate-950 rounded-lg border border-slate-800">
                      {getNodeIcon(node.category, 15)}
                    </div>
                    <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                  </div>

                  <div className="font-bold text-xs text-white truncate" title={node.name}>
                    {node.name}
                  </div>

                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-800 text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded border ${badge.bg}`}>
                      {badge.label}
                    </span>
                    {node.activeProblemsCount > 0 && (
                      <span className="text-red-400 font-bold">
                        {node.activeProblemsCount} !
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TopologyMap;
