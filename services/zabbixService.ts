import { ZabbixHost, ZabbixProblem, ZabbixEvent, ZabbixTrigger } from '../types';

export class ZabbixService {
  private url: string;
  private token: string | null;
  private triggerHostCache: Map<string, { hostid: string; name: string; host: string }> = new Map();
  private hostListCache: ZabbixHost[] = [];
  private userCache: Map<string, string> = new Map();

  constructor(url: string, token: string | null) {
    this.url = (url || '').trim();
    this.token = token ? token.trim() : null;
  }

  static async testConnection(url: string, token?: string, username?: string, password?: string): Promise<{ success: boolean; version?: string; error?: string; token?: string }> {
    const cleanUrl = (url || '').trim();
    if (!cleanUrl) return { success: false, error: 'URL do servidor Zabbix é obrigatória' };

    try {
      // 1. Test basic API accessibility & version
      const verRes = await fetch(cleanUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'apiinfo.version',
          params: {},
          auth: null,
          id: 1,
        }),
      });

      if (!verRes.ok) {
        return { success: false, error: `Servidor HTTP retornou status ${verRes.status}` };
      }

      const verData = await verRes.json();
      if (verData.error) {
        return { success: false, error: verData.error.data || verData.error.message };
      }

      const version = verData.result;

      // 2. If token is provided, test an authenticated call
      let authToken = token ? token.trim() : null;

      if (!authToken && username && password) {
        const loginRes = await fetch(cleanUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'user.login',
            params: {
              user: username.trim(),
              password: password,
            },
            id: 2,
          }),
        });

        const loginData = await loginRes.json();
        if (loginData.error) {
          return { success: false, version, error: `Falha na autenticação: ${loginData.error.data || loginData.error.message}` };
        }
        authToken = loginData.result;
      }

      if (authToken) {
        const authTestRes = await fetch(cleanUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'host.get',
            params: { limit: 1, output: ['hostid'] },
            auth: authToken,
            id: 3,
          }),
        });
        const authTestData = await authTestRes.json();
        if (authTestData.error) {
          return { success: false, version, error: `Token/Credencial inválido: ${authTestData.error.data || authTestData.error.message}` };
        }
      }

      return { success: true, version, token: authToken || undefined };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao conectar com o servidor Zabbix' };
    }
  }

  async getApiVersion(): Promise<string> {
    return this.call('apiinfo.version', {});
  }

  async login(username: string, password: string): Promise<string> {
    const res = await this.call('user.login', {
      user: username,
      password: password,
    });
    this.token = res;
    return res;
  }

  /**
   * Resilient RPC caller that automatically intercepts "unexpected parameter"
   * errors from older or stricter Zabbix versions, removes the offending parameter,
   * and retries seamlessly.
   */
  private async call(method: string, params: any, retryCount = 0): Promise<any> {
    if (!this.url) throw new Error("Zabbix URL não configurada");

    const body = {
      jsonrpc: '2.0',
      method: method,
      params: params,
      auth: method === 'user.login' || method === 'apiinfo.version' ? null : this.token,
      id: Date.now() + retryCount,
    };

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ao conectar à API Zabbix`);
    }

    const data = await response.json();

    if (data.error) {
      const errorMsg = String(data.error.data || data.error.message || '');
      
      // Auto-heal unexpected parameter mismatch across Zabbix versions
      if (retryCount < 4 && typeof params === 'object' && params !== null) {
        const match = errorMsg.match(/unexpected parameter ["']?([a-zA-Z0-9_-]+)["']?/i);
        if (match && match[1]) {
          const badParam = match[1];
          const cleanedParams = { ...params };
          delete cleanedParams[badParam];
          console.warn(`[Zabbix API] Auto-removendo parâmetro incompatível "${badParam}" para ${method} e tentando novamente.`);
          return this.call(method, cleanedParams, retryCount + 1);
        }
      }

      throw new Error(data.error.data || data.error.message || 'Erro desconhecido na API Zabbix');
    }

    return data.result;
  }

  async getHosts(): Promise<ZabbixHost[]> {
    try {
      // Fetch hosts along with their triggers to build a global lookup cache
      const hosts: any[] = await this.call('host.get', {
        output: ['hostid', 'host', 'name', 'status', 'available'],
        selectTriggers: ['triggerid', 'description'],
        filter: { status: '0' }, // Monitored hosts only
      });

      this.hostListCache = hosts.map(h => ({
        hostid: h.hostid,
        host: h.host,
        name: h.name || h.host,
        available: h.available,
      }));

      // Populate trigger-to-host cache
      hosts.forEach(h => {
        const hostObj = { hostid: h.hostid, name: h.name || h.host, host: h.host };
        if (Array.isArray(h.triggers)) {
          h.triggers.forEach((t: any) => {
            if (t.triggerid) {
              this.triggerHostCache.set(t.triggerid, hostObj);
            }
          });
        }
      });

      return this.hostListCache;
    } catch (e) {
      console.warn('host.get com selectTriggers falhou, tentando consulta básica de hosts:', e);
      try {
        const basicHosts: any[] = await this.call('host.get', {
          output: ['hostid', 'host', 'name', 'status', 'available'],
          filter: { status: '0' },
        });
        this.hostListCache = (basicHosts || []).map(h => ({
          hostid: h.hostid,
          host: h.host,
          name: h.name || h.host,
          available: h.available,
        }));
        return this.hostListCache;
      } catch (err: any) {
        console.error('Falha ao obter lista de hosts:', err);
        return [];
      }
    }
  }

  async getProblems(params: any = {}): Promise<ZabbixProblem[]> {
    const defaultParams = {
      output: 'extend',
      selectTags: 'extend',
      selectAcknowledges: 'extend',
      sortfield: ['eventid'],
      sortorder: 'DESC',
      recent: true,
    };

    try {
      return await this.call('problem.get', { ...defaultParams, ...params });
    } catch (e) {
      console.warn('problem.get com parâmetros estendidos falhou, tentando parâmetros simplificados:', e);
      // Fallback with minimal parameters for maximum compatibility with older Zabbix versions
      return await this.call('problem.get', {
        output: 'extend',
        sortfield: ['eventid'],
        sortorder: 'DESC',
        ...params,
      });
    }
  }

  // Batch-fetch triggers without restrictive filters to resolve all hosts
  async getTriggers(triggerIds: string[]): Promise<ZabbixTrigger[]> {
    if (triggerIds.length === 0) return [];
    
    const uniqueIds = [...new Set(triggerIds.filter(Boolean))];
    const results: ZabbixTrigger[] = [];
    
    // Chunk requests into batches of 80 to avoid URL/payload size limits
    const CHUNK_SIZE = 80;
    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
      try {
        const chunkRes: any[] = await this.call('trigger.get', {
          output: ['triggerid', 'description'],
          triggerids: chunk,
          selectHosts: ['hostid', 'host', 'name'],
          expandDescription: true,
        });

        if (Array.isArray(chunkRes)) {
          results.push(...chunkRes);
          // Cache hosts
          chunkRes.forEach(t => {
            if (t.hosts && t.hosts.length > 0 && t.hosts[0].name) {
              this.triggerHostCache.set(t.triggerid, {
                hostid: t.hosts[0].hostid,
                name: t.hosts[0].name || t.hosts[0].host,
                host: t.hosts[0].host || t.hosts[0].name,
              });
            }
          });
        }
      } catch (e) {
        console.warn('Erro ao consultar lote de triggers:', e);
      }
    }

    return results;
  }

  // Fallback: Resolve triggers through items if trigger.get did not return hosts
  async getItemsByTriggers(triggerIds: string[]): Promise<Map<string, { hostid: string; name: string }>> {
    const map = new Map<string, { hostid: string; name: string }>();
    if (triggerIds.length === 0) return map;

    const uniqueIds = [...new Set(triggerIds.filter(Boolean))];
    const CHUNK_SIZE = 80;

    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
      try {
        const items: any[] = await this.call('item.get', {
          output: ['itemid', 'hostid', 'name'],
          triggerids: chunk,
          selectHosts: ['hostid', 'host', 'name'],
        });

        if (Array.isArray(items)) {
          items.forEach(it => {
            if (it.hosts && it.hosts.length > 0) {
              const h = it.hosts[0];
              chunk.forEach(tid => {
                map.set(tid, { hostid: h.hostid, name: h.name || h.host });
              });
            }
          });
        }
      } catch (e) {
        console.warn('Consulta de items para triggers finalizada:', e);
      }
    }

    return map;
  }

  // Comprehensive multi-layer host enrichment
  async enrichProblems(rawProblems: ZabbixProblem[]): Promise<ZabbixProblem[]> {
    if (!rawProblems || rawProblems.length === 0) return [];

    // 1. Identify problems that lack valid host name
    const needsResolution = rawProblems.filter(
      p => !p.hosts || p.hosts.length === 0 || p.hosts[0].hostid === '0' || !p.hosts[0].name
    );

    if (needsResolution.length === 0) return rawProblems;

    // 2. Check in-memory triggerHostCache first
    const stillUnresolved: ZabbixProblem[] = [];
    needsResolution.forEach(p => {
      const cached = this.triggerHostCache.get(p.objectid);
      if (cached) {
        p.hosts = [{ hostid: cached.hostid, host: cached.host, name: cached.name, available: '1' }];
      } else {
        stillUnresolved.push(p);
      }
    });

    if (stillUnresolved.length === 0) return rawProblems;

    // 3. Batch query trigger.get for remaining trigger IDs
    const triggerIds = [...new Set(stillUnresolved.map(p => p.objectid).filter(Boolean))];
    if (triggerIds.length > 0) {
      const triggers = await this.getTriggers(triggerIds);
      const triggersMap = new Map(triggers.map(t => [t.triggerid, t]));

      const remainingAfterTriggers: ZabbixProblem[] = [];

      rawProblems = rawProblems.map(p => {
        const trigger = triggersMap.get(p.objectid);
        if (trigger?.hosts && trigger.hosts.length > 0 && trigger.hosts[0].name) {
          return {
            ...p,
            hosts: trigger.hosts,
            triggerDescription: trigger.description || p.triggerDescription,
          };
        } else if (!p.hosts || p.hosts.length === 0 || p.hosts[0].hostid === '0' || !p.hosts[0].name) {
          remainingAfterTriggers.push(p);
        }
        return p;
      });

      // 4. Layer 3 Fallback: item.get for triggers with indirect host association
      if (remainingAfterTriggers.length > 0) {
        const remainingTriggerIds = [...new Set(remainingAfterTriggers.map(p => p.objectid).filter(Boolean))];
        const itemHostMap = await this.getItemsByTriggers(remainingTriggerIds);

        rawProblems = rawProblems.map(p => {
          if (!p.hosts || p.hosts.length === 0 || p.hosts[0].hostid === '0' || !p.hosts[0].name) {
            const itemHost = itemHostMap.get(p.objectid);
            if (itemHost) {
              return {
                ...p,
                hosts: [{ hostid: itemHost.hostid, host: itemHost.name, name: itemHost.name, available: '1' }],
              };
            }
          }
          return p;
        });
      }
    }

    // Enrich acknowledges with real technician user names
    await this.enrichUsersForAcknowledges(rawProblems);

    return rawProblems;
  }

  // Resolves userids in acknowledges to real display names (e.g. "Fábio Silva", "Guilherme")
  async enrichUsersForAcknowledges(items: any[]): Promise<void> {
    if (!items || items.length === 0) return;

    const userIdsToFetch = new Set<string>();
    items.forEach(p => {
      if (Array.isArray(p.acknowledges)) {
        p.acknowledges.forEach((ack: any) => {
          if (ack.userid && (!ack.alias || ack.alias === ack.userid || /^\d+$/.test(ack.alias))) {
            if (!this.userCache.has(ack.userid)) {
              userIdsToFetch.add(ack.userid);
            }
          }
        });
      }
    });

    if (userIdsToFetch.size > 0) {
      try {
        const users: any[] = await this.call('user.get', {
          output: ['userid', 'username', 'alias', 'name', 'surname'],
          userids: Array.from(userIdsToFetch),
        });

        if (Array.isArray(users)) {
          users.forEach(u => {
            const fullName = [u.name, u.surname].filter(Boolean).join(' ');
            const displayName = fullName || u.alias || u.username || `Técnico #${u.userid}`;
            this.userCache.set(u.userid, displayName);
          });
        }
      } catch (e) {
        console.warn('user.get não retornou usuários, usando rotulação amigável:', e);
      }
    }

    // Attach user display name to acknowledges
    items.forEach(p => {
      if (Array.isArray(p.acknowledges)) {
        p.acknowledges.forEach((ack: any) => {
          if (ack.userid && this.userCache.has(ack.userid)) {
            ack.alias = this.userCache.get(ack.userid);
            ack.username = ack.alias;
            ack.full_name = ack.alias;
          } else if (ack.alias && !/^\d+$/.test(ack.alias)) {
            // Already clean string
          } else if (ack.username && !/^\d+$/.test(ack.username)) {
            ack.alias = ack.username;
          } else if (ack.userid) {
            ack.alias = `Analista NOC (#${ack.userid})`;
            ack.username = ack.alias;
          }
        });
      }
    });
  }

  // For timeline
  async getEvents(timeFrom: number, limit: number = 150): Promise<ZabbixEvent[]> {
    let events: ZabbixEvent[] = [];
    try {
      events = await this.call('event.get', {
        output: 'extend',
        selectAcknowledges: 'extend',
        selectTags: 'extend',
        selectHosts: ['hostid', 'host', 'name'],
        time_from: timeFrom,
        sortfield: ['clock', 'eventid'],
        sortorder: 'DESC',
        limit: limit,
      });
    } catch (err) {
      console.warn('event.get fallback básico:', err);
      events = await this.call('event.get', {
        output: ['eventid', 'objectid', 'name', 'severity', 'clock', 'acknowledged', 'value'],
        time_from: timeFrom,
        sortfield: ['clock'],
        sortorder: 'DESC',
        limit: limit,
      });
    }

    if (!Array.isArray(events)) return [];

    // Enrich events with hosts
    const triggerIds = events
      .filter(e => (!e.hosts || e.hosts.length === 0 || e.hosts[0].hostid === '0') && (e as any).objectid)
      .map(e => (e as any).objectid);

    if (triggerIds.length > 0) {
      const triggers = await this.getTriggers(triggerIds);
      const triggersMap = new Map(triggers.map(t => [t.triggerid, t]));

      return events.map(e => {
        const objId = (e as any).objectid;
        const cached = this.triggerHostCache.get(objId);
        if (cached) {
          return { ...e, hosts: [{ hostid: cached.hostid, host: cached.host, name: cached.name, available: '1' }] };
        }
        const trigger = triggersMap.get(objId);
        if (trigger?.hosts && trigger.hosts.length > 0) {
          return { ...e, hosts: trigger.hosts };
        }
        return e;
      });
    }

    await this.enrichUsersForAcknowledges(events);
    return events;
  }

  // For Forecast (Long 30-day history with full multi-layer enrichment)
  async getHistoryProblems(days: number = 30): Promise<ZabbixProblem[]> {
    const now = Math.floor(Date.now() / 1000);
    const timeFrom = now - (days * 86400);

    let problems: ZabbixProblem[] = [];

    // 1. Query problem.get with full history (recent: false)
    try {
      problems = await this.call('problem.get', {
        output: ['eventid', 'objectid', 'name', 'severity', 'clock', 'acknowledged', 'r_eventid'],
        time_from: timeFrom,
        recent: false,
        limit: 3000,
      });
    } catch (err) {
      console.warn('problem.get history fallback:', err);
    }

    // 2. Query event.get to capture any resolved historical events
    try {
      const events: any[] = await this.call('event.get', {
        output: ['eventid', 'objectid', 'name', 'severity', 'clock', 'acknowledged', 'value'],
        selectHosts: ['hostid', 'host', 'name'],
        value: '1', // Problem events
        source: '0', // Trigger events
        object: '0',
        time_from: timeFrom,
        limit: 3000,
        sortfield: ['clock'],
        sortorder: 'DESC',
      });

      if (Array.isArray(events) && events.length > 0) {
        const existingIds = new Set(problems.map(p => p.eventid));
        events.forEach(e => {
          if (!existingIds.has(e.eventid)) {
            problems.push({
              eventid: e.eventid,
              objectid: e.objectid || '',
              clock: e.clock,
              ns: '0',
              name: e.name,
              severity: e.severity,
              acknowledged: e.acknowledged,
              hosts: e.hosts,
              tags: e.tags || [],
            });
          }
        });
      }
    } catch (err) {
      console.warn('event.get history fallback:', err);
    }

    // Run multi-layer enrichment to map all 30 days of problem triggers to hosts
    return await this.enrichProblems(problems);
  }

  async acknowledgeEvent(eventid: string, message: string, action: number = 6) {
    return this.call('event.acknowledge', {
      eventids: eventid,
      message: message,
      action: action, 
    });
  }
}
