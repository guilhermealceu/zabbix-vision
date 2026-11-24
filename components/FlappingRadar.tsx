import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, AlertTriangle, Sparkles, Filter, Search, 
  Clock, ShieldAlert, ArrowUpRight, CheckCircle2, 
  Volume2, VolumeX, Sliders, Wrench, RefreshCw, BarChart2
} from 'lucide-react';
import { ZabbixEvent, ZabbixProblem, FlappingItem, FlapTransition } from '../types';

interface FlappingRadarProps {
  events: ZabbixEvent[];
  problems: ZabbixProblem[];
  onAnalyzeAI: (item: FlappingItem) => void;
}

export const FlappingRadar: React.FC<FlappingRadarProps> = ({
  events,
  problems,
  onAnalyzeAI,
}) => {
  const [timeWindowHours, setTimeWindowHours] = useState<number>(24);
  const [selectedNoiseLevel, setSelectedNoiseLevel] = useState<'all' | 'Extremo' | 'Alto' | 'Moderado'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<FlappingItem | null>(null);

  // Compute Flapping Items from Events & Problems History
  const flappingData: FlappingItem[] = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const windowStart = nowSec - (timeWindowHours * 3600);

    // Group events by trigger id / trigger name + host
    const groups = new Map<string, {
      triggerId: string;
      triggerName: string;
      hostId: string;
      hostName: string;
      serverName?: string;
      serverColor?: string;
      severity: string;
      transitions: FlapTransition[];
    }>();

    // 1. Process Timeline Events
    events.forEach(ev => {
      const clock = parseInt(ev.clock);
      if (clock < windowStart) return;

      const triggerId = (ev as any).objectid || ev.name;
      const hostId = ev.hosts?.[0]?.hostid || '0';
      const hostName = ev.hosts?.[0]?.name || 'Dispositivo';
      const key = `${hostName}___${ev.name}`;

      if (!groups.has(key)) {
        groups.set(key, {
          triggerId,
          triggerName: ev.name,
          hostId,
          hostName,
          serverName: ev.serverName,
          serverColor: ev.serverColor,
          severity: ev.severity,
          transitions: [],
        });
      }

      const dateObj = new Date(clock * 1000);
      groups.get(key)!.transitions.push({
        clock,
        value: (ev.value === '1' ? '1' : '0') as '0' | '1',
        name: ev.name,
        timeFormatted: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    });

    // 2. Incorporate Active Problems
    problems.forEach(p => {
      const clock = parseInt(p.clock);
      if (clock < windowStart) return;

      const hostName = p.hosts?.[0]?.name || 'Dispositivo';
      const key = `${hostName}___${p.name}`;

      if (!groups.has(key)) {
        groups.set(key, {
          triggerId: p.objectid,
          triggerName: p.name,
          hostId: p.hosts?.[0]?.hostid || '0',
          hostName,
          serverName: p.serverName,
          serverColor: p.serverColor,
          severity: p.severity,
          transitions: [],
        });
      }

      const grp = groups.get(key)!;
      if (!grp.transitions.some(t => t.clock === clock)) {
        const dateObj = new Date(clock * 1000);
        grp.transitions.push({
          clock,
          value: '1',
          name: p.name,
          timeFormatted: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
    });

    // 3. Calculate Flap Metrics for each group
    const results: FlappingItem[] = [];

    groups.forEach((grp, key) => {
      // Sort transitions chronologically
      grp.transitions.sort((a, b) => a.clock - b.clock);
      const count = grp.transitions.length;

      // Only consider items with 2 or more state changes in window
      if (count >= 2) {
        const firstSeen = grp.transitions[0].clock;
        const lastSeen = grp.transitions[count - 1].clock;
        const timeSpanSec = Math.max(60, lastSeen - firstSeen);

        // Flap Score formula based on flips per hour + severity weight
        const flipsPerHour = (count / (timeSpanSec / 3600));
        const rawScore = Math.min(100, Math.round(flipsPerHour * 18 + (parseInt(grp.severity) * 6)));

        let noiseLevel: 'Extremo' | 'Alto' | 'Moderado' = 'Moderado';
        if (count >= 6 || rawScore >= 75) noiseLevel = 'Extremo';
        else if (count >= 3 || rawScore >= 45) noiseLevel = 'Alto';

        let status: FlappingItem['status'] = 'moderate_flap';
        if (noiseLevel === 'Extremo') status = 'critical_flap';
        else if (nowSec - lastSeen > 1800) status = 'recovering';

        // Recommendation based on trigger type
        let rec = 'Adicionar tolerância na expressão do trigger (histerese com max(#3)=1).';
        const lowerName = grp.triggerName.toLowerCase();
        if (lowerName.includes('icmp') || lowerName.includes('ping') || lowerName.includes('link')) {
          rec = 'Verificar cabo físico e portas no switch. Configurar trigger com perda > 20% em janela de 3 minutos.';
        } else if (lowerName.includes('camera') || lowerName.includes('câmera')) {
          rec = 'Verificar potência PoE e oscilação de alimentação. Aumentar timeout de resposta para 10s.';
        } else if (lowerName.includes('cpu') || lowerName.includes('memory')) {
          rec = 'Utilizar média móvel (avg(10m) > 90) em vez de pico pontual imediato.';
        }

        results.push({
          id: key,
          triggerId: grp.triggerId,
          triggerName: grp.triggerName,
          hostId: grp.hostId,
          hostName: grp.hostName,
          serverName: grp.serverName,
          serverColor: grp.serverColor,
          severity: grp.severity,
          transitionsCount: count,
          flapScore: rawScore,
          status,
          firstSeen,
          lastSeen,
          avgDurationSec: Math.round(timeSpanSec / count),
          transitions: grp.transitions,
          recommendation: rec,
          noiseLevel,
        });
      }
    });

    return results.sort((a, b) => b.flapScore - a.flapScore);
  }, [events, problems, timeWindowHours]);

  // Filtered List
  const filteredData = useMemo(() => {
    return flappingData.filter(item => {
      const matchNoise = selectedNoiseLevel === 'all' || item.noiseLevel === selectedNoiseLevel;
      const matchSearch = !searchQuery || 
        item.hostName.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.triggerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.serverName || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchNoise && matchSearch;
    });
  }, [flappingData, selectedNoiseLevel, searchQuery]);

  // Aggregate Metrics
  const totalWastedAlerts = useMemo(() => {
    return flappingData.reduce((acc, curr) => acc + curr.transitionsCount, 0);
  }, [flappingData]);

  const extremeCount = useMemo(() => {
    return flappingData.filter(i => i.noiseLevel === 'Extremo').length;
  }, [flappingData]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      {/* Header Banner & Summary */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Activity size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Detector de Flapping & Redução de Fadiga de Alertas
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {flappingData.length} alertas oscilantes
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Identifica gatilhos e interfaces instáveis que abrem/fecham repetidamente, reduz ruído operacional e sugere otimização de histerese.
              </p>
            </div>
          </div>

          {/* Time Window Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700 self-start lg:self-auto">
            {[
              { hours: 6, label: '6 Horas' },
              { hours: 24, label: '24 Horas' },
              { hours: 72, label: '3 Dias' },
              { hours: 168, label: '7 Dias' },
            ].map(w => (
              <button
                key={w.hours}
                onClick={() => setTimeWindowHours(w.hours)}
                className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${
                  timeWindowHours === w.hours
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-700/60">
          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Gatilhos em Flap Ativo
            </span>
            <div className="text-2xl font-black text-white flex items-baseline gap-2">
              {flappingData.length}
              <span className="text-xs font-normal text-slate-400">ofensores</span>
            </div>
          </div>

          <div className="bg-red-950/20 p-3.5 rounded-xl border border-red-500/30">
            <span className="text-[10px] text-red-400 uppercase font-semibold block mb-1">
              Oscilação Extrema
            </span>
            <div className="text-2xl font-black text-red-400 flex items-baseline gap-2">
              {extremeCount}
              <span className="text-xs font-normal text-red-300/70">&gt; 6 toggles</span>
            </div>
          </div>

          <div className="bg-amber-950/20 p-3.5 rounded-xl border border-amber-500/30">
            <span className="text-[10px] text-amber-400 uppercase font-semibold block mb-1">
              Ruído Operacional Total
            </span>
            <div className="text-2xl font-black text-amber-400 flex items-baseline gap-2">
              {totalWastedAlerts}
              <span className="text-xs font-normal text-amber-300/70">transições</span>
            </div>
          </div>

          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700/80">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Fadiga Economizada c/ Histerese
            </span>
            <div className="text-2xl font-black text-emerald-400 flex items-baseline gap-2">
              ~{Math.round(totalWastedAlerts * 0.72)}
              <span className="text-xs font-normal text-slate-400">alertas a menos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Filter size={12} /> Grau de Ruído:
          </span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'Extremo', label: 'Extremo (>75%)', color: 'text-red-400' },
            { id: 'Alto', label: 'Alto (45-75%)', color: 'text-amber-400' },
            { id: 'Moderado', label: 'Moderado', color: 'text-blue-400' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedNoiseLevel(f.id as any)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                selectedNoiseLevel === f.id
                  ? 'bg-blue-600 border-blue-500 text-white font-bold shadow'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por host, gatilho ou servidor..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Flapping Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredData.map(item => {
          const isExtreme = item.noiseLevel === 'Extremo';
          const isHigh = item.noiseLevel === 'Alto';

          return (
            <div
              key={item.id}
              className={`bg-slate-800 rounded-2xl p-5 border transition-all hover:border-slate-500 flex flex-col justify-between space-y-4 shadow-lg ${
                isExtreme
                  ? 'border-red-500/40 bg-gradient-to-br from-red-950/20 to-slate-800'
                  : isHigh
                  ? 'border-amber-500/30'
                  : 'border-slate-700'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white truncate" title={item.hostName}>
                        {item.hostName}
                      </span>
                      {item.serverName && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 truncate">
                          {item.serverName}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-300 font-medium truncate mt-0.5" title={item.triggerName}>
                      {item.triggerName}
                    </div>
                  </div>

                  {/* Noise Level Badge */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                      isExtreme
                        ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                        : isHigh
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    Ruído {item.noiseLevel}
                  </span>
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-3 gap-2 bg-slate-900/70 p-2.5 rounded-xl border border-slate-800 my-3 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Transições</span>
                    <span className="text-xs font-bold text-white">{item.transitionsCount}x</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Instabilidade</span>
                    <span className={`text-xs font-bold ${isExtreme ? 'text-red-400' : 'text-amber-400'}`}>
                      {item.flapScore}%
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Intervalo</span>
                    <span className="text-xs font-bold text-slate-300">
                      ~{Math.round(item.avgDurationSec / 60)} min
                    </span>
                  </div>
                </div>

                {/* Transition Timeline Visualizer */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Linha do Tempo de Oscilações ({item.transitions.length})</span>
                    <span>Último: {new Date(item.lastSeen * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div className="h-6 bg-slate-950 rounded-lg border border-slate-800 p-1 flex items-center gap-1 overflow-x-auto">
                    {item.transitions.map((t, idx) => (
                      <div
                        key={idx}
                        title={`[${t.timeFormatted}] ${t.value === '1' ? 'ABRIU PROBLEMA' : 'RESOLVEU'}`}
                        className={`h-4 min-w-[8px] rounded-sm flex-1 cursor-pointer transition-transform hover:scale-125 ${
                          t.value === '1' ? 'bg-red-500' : 'bg-emerald-500'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Practical Recommendation */}
                <div className="mt-3 p-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-2">
                  <Wrench size={14} className="text-blue-400 shrink-0 mt-0.5" />
                  <p className="line-clamp-2">{item.recommendation}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between gap-2">
                <button
                  onClick={() => onAnalyzeAI(item)}
                  className="w-full py-2 px-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={13} /> Analisar Estabilização com IA
                </button>
              </div>
            </div>
          );
        })}

        {filteredData.length === 0 && (
          <div className="col-span-full py-16 text-center bg-slate-800/40 border border-slate-700/80 rounded-2xl space-y-3">
            <CheckCircle2 size={36} className="text-emerald-400 mx-auto" />
            <h4 className="font-bold text-white text-base">Nenhum Flapping Detectado no Período</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Sua infraestrutura está operando de forma estável sem oscilações repetitivas ou gatilhos gerando ruído de alerta desnecessário na janela de {timeWindowHours} horas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlappingRadar;
