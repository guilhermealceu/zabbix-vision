export interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
  available: string; // '1' = available, '2' = unavailable
  serverId?: string;
  serverName?: string;
  serverColor?: string;
}

export interface ZabbixTag {
  tag: string;
  value: string;
}

export interface ZabbixTrigger {
  triggerid: string;
  description: string;
  hosts?: ZabbixHost[];
}

export interface ZabbixProblem {
  eventid: string;
  objectid: string; // triggerid
  clock: string; // timestamp in seconds
  ns: string;
  name: string;
  severity: string; // '0' to '5'
  acknowledged: string; // '0' or '1'
  hosts?: ZabbixHost[];
  tags: ZabbixTag[];
  r_eventid?: string; // Recovery event ID (if resolved)
  // Enriched fields
  triggerDescription?: string; 
  itemDetails?: { key: string; name: string };
  acknowledges?: ZabbixAcknowledge[];
  value?: string; // Current state
  serverId?: string;
  serverName?: string;
  serverColor?: string;
}

export interface ZabbixEvent {
  eventid: string;
  clock: string;
  value: string; // '1' = problem, '0' = recovery
  name: string;
  severity: string;
  acknowledged: string;
  hosts?: ZabbixHost[];
  acknowledges?: ZabbixAcknowledge[];
  tags?: ZabbixTag[];
  serverId?: string;
  serverName?: string;
  serverColor?: string;
}

export interface ZabbixAcknowledge {
  userid: string;
  clock: string;
  message: string;
  action: string;
  alias: string;
  username?: string;
  full_name?: string;
}

export interface CorrelationGroup {
  id?: string;
  host: string;
  siteName?: string;
  affectedHosts?: string[];
  affectedSites?: string[];
  events: ZabbixProblem[];
  confidence: number;
  startTime: number;
  endTime?: number;
  commonKeywords: string[];
  type?: 'host_cascade' | 'cross_host_wave' | 'service_cluster';
  affectedHostsCount?: number;
  serverName?: string;
}

export interface SavedSolution {
  id: string;
  problemName: string;
  solution: string;
  timestamp: number;
  usedCount: number;
  authorName?: string;
}

export interface ForecastDay {
  problems: {
    name: string;
    severity: string;
    time: string;
    clock: string;
    serverName?: string;
  }[];
  riskScore?: number;
}

export interface ForecastHost {
  host: string;
  hostid?: string;
  days: ForecastDay[];
  totalIncidents?: number;
  criticalCount?: number;
  riskScore?: number; // 0-100
  riskLevel?: 'Crítico' | 'Alto' | 'Moderado' | 'Baixo';
  peakHour?: number;
  topProblem?: string;
  serverName?: string;
  serverColor?: string;
}

export interface AIProviderConfig {
  provider: 'auto' | 'gemini' | 'ollama' | 'expert';
  ollamaEndpoint: string;
  ollamaModel: string;
}

export interface AIAnalysisResponse {
  result: string;
  engine: 'gemini' | 'ollama' | 'expert' | 'fallback';
}

export interface ZabbixServerConfig {
  id: string;
  name: string;
  url: string;
  token?: string;
  username?: string;
  password?: string;
  version?: string;
  color?: string;
  enabled?: boolean;
  isDefault?: boolean;
}

export interface ZabbixConnectionConfig {
  url: string;
  token?: string;
  username?: string;
  password?: string;
  label?: string;
}

export interface TopologyNode {
  id: string;
  hostid?: string;
  name: string;
  category: 'core_network' | 'switch' | 'server' | 'database' | 'cftv' | 'cloud' | 'service';
  status: 'healthy' | 'warning' | 'critical' | 'cascaded' | 'simulated_down';
  activeProblemsCount: number;
  problems: ZabbixProblem[];
  parentId?: string;
  childrenIds?: string[];
  serverName?: string;
  serverColor?: string;
  x?: number;
  y?: number;
}

export interface TopologyLink {
  source: string;
  target: string;
  status: 'active' | 'degraded' | 'broken' | 'simulated';
}

export interface FlapTransition {
  clock: number;
  value: '0' | '1'; // 1=problem, 0=recovery
  name: string;
  timeFormatted: string;
}

export interface FlappingItem {
  id: string;
  triggerId: string;
  triggerName: string;
  hostId: string;
  hostName: string;
  serverName?: string;
  serverColor?: string;
  severity: string;
  transitionsCount: number;
  flapScore: number; // 0 - 100
  status: 'critical_flap' | 'moderate_flap' | 'recovering';
  firstSeen: number;
  lastSeen: number;
  avgDurationSec: number;
  transitions: FlapTransition[];
  recommendation: string;
  noiseLevel: 'Extremo' | 'Alto' | 'Moderado';
}



