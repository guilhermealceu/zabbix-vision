import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isDev = process.env.NODE_ENV !== 'production';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Helper to get Gemini client
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'zabbix-vision',
      },
    },
  });
}

// Call Ollama local endpoint
async function callOllama(
  endpoint: string = 'http://127.0.0.1:11434',
  model: string = 'llama3.2',
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const cleanEndpoint = endpoint.replace(/\/+$/, '');
  const url = `${cleanEndpoint}/api/generate`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3.2',
        prompt: prompt,
        system: systemInstruction || 'Você é um engenheiro SRE especialista em Zabbix e redes. Responda em Português do Brasil de forma concisa, técnica e direta, sem emojis, sem linhas horizontais e sem enrolação.',
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${errText}`);
    }

    const data: any = await res.json();
    return cleanFormatting(data.response || '');
  } catch (err: any) {
    clearTimeout(timeout);
    throw err;
  }
}

// Clean excess markdown decorators and emojis from AI responses
function cleanFormatting(text: string): string {
  if (!text) return '';
  return text
    // Remove horizontal rule markers
    .replace(/^(?:[-*_]\s*){3,}$/gm, '')
    // Remove excessive asterisks
    .replace(/\*{3,}/g, '**')
    // Remove common emojis
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '')
    // Clean multiple consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Deterministic Expert Fallbacks (Clean, Concise, No Emojis, No Lines)
function generateExpertProblemAnalysis(problem: any): string {
  const name = problem.name || 'Problema não especificado';
  const host = problem.hosts?.[0]?.name || 'Host não especificado';
  const severity = problem.severity;
  const trigger = problem.triggerDescription || '';
  const lowerName = name.toLowerCase();

  let category = 'Geral';
  let rootCause = 'Comportamento anômalo detectado pelo gatilho do Zabbix.';
  let actions: string[] = [];
  let prevention: string[] = [];

  if (lowerName.includes('camera') || lowerName.includes('câmera') || lowerName.includes('rtsp') || lowerName.includes('dvr') || lowerName.includes('nvr')) {
    category = 'CFTV / Câmeras IP';
    rootCause = 'Perda de comunicação com o fluxo RTSP/ONVIF da câmera ou porta do switch PoE desarmada.';
    actions = [
      `Verificar alimentação PoE e link físico da câmera associada a "${host}".`,
      'Testar ping e acesso web/RTSP no IP do dispositivo.',
      'Checar se o switch de acesso registrou flap na interface de rede.',
      'Reiniciar a porta PoE do switch correspondente para resetar o dispositivo.'
    ];
    prevention = [
      'Monitorar consumo de potência total do switch PoE.',
      'Ajustar timeout do gatilho para evitar falsos positivos em oscilações transitórias.'
    ];
  } else if (lowerName.includes('icmp') || lowerName.includes('ping') || lowerName.includes('unreachable') || lowerName.includes('link') || lowerName.includes('bgp') || lowerName.includes('loss')) {
    category = 'Conectividade de Rede';
    rootCause = 'Queda no enlace de comunicação, timeout no gateway ou bloqueio por política de firewall.';
    actions = [
      `Executar traceroute/MTR a partir do Zabbix Server até o host "${host}".`,
      'Verificar status da interface no roteador/switch de borda e consumo de banda.',
      'Checar tabela de roteamento e sessões ativas no firewall.',
      'Validar integridade física do cabo ou enlace de fibra.'
    ];
    prevention = [
      'Configurar redundância de rota (HSRP/VRRP ou BGP multihop).',
      'Definir threshold de aviso prévio com base em jitter e perda parcial.'
    ];
  } else if (lowerName.includes('cpu') || lowerName.includes('load') || lowerName.includes('utilization')) {
    category = 'CPU / Processamento';
    rootCause = 'Processos em loop, concorrência excessiva de threads ou rotinas pesadas sem escalonamento.';
    actions = [
      `Acessar o host "${host}" e listar processos com maior consumo (top / htop / Get-Process).`,
      'Analisar logs de aplicação no momento do pico de processamento.',
      'Verificar se há rotinas de indexação, backup ou varredura de antivírus ativas.',
      'Finalizar ou renivelar prioridade (nice) dos processos ofensores.'
    ];
    prevention = [
      'Otimizar consultas e rotinas batch fora do horário comercial.',
      'Ajustar limites de cgroups/containers ou alocar vCPUs adicionais.'
    ];
  } else if (lowerName.includes('memory') || lowerName.includes('memória') || lowerName.includes('swap')) {
    category = 'Memória / Swap';
    rootCause = 'Consumo elevado de RAM e uso de swap indicando saturação ou vazamento de memória (memory leak).';
    actions = [
      `Identificar processos com maior consumo no host "${host}" (ps aux --sort=-%mem).`,
      'Verificar dimensionamento de buffers e caches (MySQL/PostgreSQL, JVM heap).',
      'Checar histórico do OOM Killer nos logs do sistema (dmesg -T | grep -i oom).',
      'Reiniciar graciosamente o serviço com retenção anômala de memória.'
    ];
    prevention = [
      'Definir limites estritos de heap e memória por processo/container.',
      'Configurar alarme intermediário em 80% de ocupação antes do swapout.'
    ];
  } else if (lowerName.includes('disk') || lowerName.includes('disco') || lowerName.includes('space') || lowerName.includes('filesystem')) {
    category = 'Armazenamento / Disco';
    rootCause = 'Acúmulo de arquivos de log, dumps, tabelas temporárias ou crescimento do volume de dados.';
    actions = [
      `Identificar diretórios volumosos no host "${host}" (ncdu ou du -sh /*).`,
      'Remover ou compactar logs antigos em /var/log ou no diretório da aplicação.',
      'Verificar arquivos temporários em /tmp e lixeiras de banco de dados.',
      'Expandir partição LVM ou volume virtual se necessário.'
    ];
    prevention = [
      'Implementar logrotate com compressão e retenção máxima configurada.',
      'Criar alertas de taxa de crescimento diário de disco (vfs.fs.size predictive).'
    ];
  } else {
    category = 'Serviço / Aplicação';
    rootCause = 'Falha no processo monitorado ou indisponibilidade de porta/endpoint.';
    actions = [
      `Verificar status do serviço no host "${host}" (systemctl status ou Get-Service).`,
      'Inspecionar logs recentes de erro da aplicação.',
      'Testar conectividade local na porta do serviço.',
      'Reiniciar o serviço e monitorar inicialização.'
    ];
    prevention = [
      'Configurar autorestart com systemd ou monitor de processos.',
      'Adicionar health checks de camada 7 para validação funcional.'
    ];
  }

  return `DIAGNÓSTICO TÉCNICO
Host: ${host}
Categoria: ${category}
Severidade: Nível ${severity}
${trigger ? `Gatilho: ${trigger}\n` : ''}
1. Causa Raiz Provável
${rootCause}

2. Ações de Diagnóstico e Resolução
${actions.map((act, i) => `${i + 1}. ${act}`).join('\n')}

3. Prevenção
${prevention.map(p => `• ${p}`).join('\n')}`;
}

function generateExpertCorrelationAnalysis(correlation: any): string {
  const host = correlation.host || 'Infraestrutura';
  const count = correlation.events?.length || 0;
  const keywords = (correlation.commonKeywords || []).join(', ');
  const confidence = correlation.confidence || 80;
  const firstEvent = correlation.events?.[0]?.name || 'Primeiro alerta registrado';

  return `ANÁLISE DE CORRELAÇÃO DE INCIDENTES
Escopo: ${host}
Eventos Agrupados: ${count} alertas
Grau de Confiança: ${confidence}%
Padrões Identificados: ${keywords || 'Simultaneidade temporal'}

1. Diagnóstico de Causa Primária e Efeito Cascata
Os ${count} eventos ocorreram em sequência concentrada no mesmo intervalo de tempo.
O evento inicial "${firstEvent}" atuou como provável gatilho causador, gerando alertas secundários decorrentes da indisponibilidade ou sobrecarga do recurso principal.

2. Ações Prioritárias para Mitigação
1. Concentrar o diagnóstico exclusivamente na causa do evento primário ("${firstEvent}").
2. Evitar reinicializações isoladas de serviços secundários antes de estabilizar o nó causador.
3. Validar se enlaces de rede, portas de switch e dependências centrais foram restaurados.

3. Recomendações
• Configurar dependência de gatilhos (Trigger Dependencies) no Zabbix para suprimir alertas secundários em cascata.
• Documentar o incidente e validar tempo médio de recuperação (MTTR).`;
}

function generateExpertPrediction(history: any[]): string {
  const total = history.length;
  const hostCounts: Record<string, number> = {};
  const hourCounts: Record<number, number> = {};
  
  history.forEach(p => {
    const h = p.hosts?.[0]?.name || p.host || 'Outros';
    hostCounts[h] = (hostCounts[h] || 0) + 1;
    const date = new Date(parseInt(p.clock) * 1000);
    const hour = date.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  const topHosts = Object.entries(hostCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const peakHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return `RELATÓRIO PREDITIVO DE INFRAESTRUTURA
Amostra Analisada: ${total} incidentes históricos (30 dias)
Status Global: ${total > 50 ? 'Atenção Necessária' : 'Operação Estável'}

1. Hosts com Maior Reincidência de Incidentes
${topHosts.length > 0 
  ? topHosts.map(([h, c], idx) => `${idx + 1}. ${h}: ${c} alertas (${Math.round((c / Math.max(1, total)) * 100)}% do volume total)`).join('\n')
  : 'Nenhum host com reincidência crítica no período.'}

2. Janelas Horárias de Maior Concentração de Falhas
${peakHours.length > 0 
  ? peakHours.map(([hr, c]) => `• ${hr.padStart(2, '0')}:00h às ${hr.padStart(2, '0')}:59h (${c} ocorrências registradas)`).join('\n')
  : 'Distribuição homogênea ao longo do dia.'}

3. Recomendações Preventivas
• Revisar capacidade e estabilidade dos 3 principais hosts reincidentes.
• Programar manutenções e backups fora das janelas de pico identificadas.
• Ajustar limiares de aviso prévio nos itens mais sensíveis para evitar alertas de severidade alta.`;
}

// Routes
app.post('/api/ai/analyze-problem', async (req: Request, res: Response) => {
  const { problem, provider, ollamaEndpoint, ollamaModel } = req.body;
  
  if (!problem) {
    return res.status(400).json({ error: 'Problem payload is required' });
  }

  const prompt = `
Você é um engenheiro SRE sênior especialista em monitoramento Zabbix e infraestrutura de TI.
Analise o problema abaixo e responda de forma extremamente DIRETA, TÉCNICA e CONCISA.
NÃO use emojis. NÃO use linhas horizontais (---). NÃO use divisores extravagantes (***).
Seja organizado e objetivo.

Estrutura obrigatória da resposta:
DIAGNÓSTICO TÉCNICO
Host: ${problem.hosts?.[0]?.name || 'Desconhecido'}
Severidade: ${problem.severity}

1. Causa Raiz Provável
[Texto conciso e direto]

2. Ações de Diagnóstico e Resolução
1. [Passo objetivo]
2. [Passo objetivo]
3. [Passo objetivo]

3. Prevenção
• [Item preventivo 1]
• [Item preventivo 2]

Dados do Alerta:
- Nome: ${problem.name}
- Host: ${problem.hosts?.[0]?.name || 'Desconhecido'}
- Severidade: ${problem.severity}
- Tags: ${(problem.tags || []).map((t: any) => `${t.tag}: ${t.value}`).join(', ') || 'N/A'}
- Gatilho: ${problem.triggerDescription || 'N/A'}
`;

  const chosenProvider = provider || 'auto';

  if (chosenProvider === 'ollama') {
    try {
      const ollamaRes = await callOllama(
        ollamaEndpoint || 'http://127.0.0.1:11434',
        ollamaModel || 'llama3.2',
        prompt
      );
      return res.json({ result: cleanFormatting(ollamaRes), engine: 'ollama' });
    } catch (err: any) {
      const fallback = generateExpertProblemAnalysis(problem);
      return res.json({ 
        result: cleanFormatting(fallback), 
        engine: 'fallback' 
      });
    }
  }

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });
      if (response.text) {
        return res.json({ result: cleanFormatting(response.text), engine: 'gemini' });
      }
    } catch (geminiError: any) {
      console.warn('Gemini call failed:', geminiError.message);
    }
  }

  if (chosenProvider === 'auto') {
    try {
      const ollamaRes = await callOllama(
        ollamaEndpoint || 'http://127.0.0.1:11434',
        ollamaModel || 'llama3.2',
        prompt
      );
      return res.json({ result: cleanFormatting(ollamaRes), engine: 'ollama' });
    } catch (ollamaErr) {}
  }

  const fallback = generateExpertProblemAnalysis(problem);
  return res.json({ result: cleanFormatting(fallback), engine: 'expert' });
});

app.post('/api/ai/analyze-correlation', async (req: Request, res: Response) => {
  const { correlation, provider, ollamaEndpoint, ollamaModel } = req.body;

  if (!correlation) {
    return res.status(400).json({ error: 'Correlation payload is required' });
  }

  const eventsList = (correlation.events || [])
    .map((e: any) => `- ${e.name} (${new Date(parseInt(e.clock) * 1000).toLocaleTimeString()})`)
    .join('\n');

  const prompt = `
Você é um especialista em SRE e gerenciamento de incidentes Zabbix.
Analise este grupo de eventos correlacionados de forma DIRETA, CONCISA e TÉCNICA.
NÃO use emojis. NÃO use linhas horizontais (---). NÃO use asteriscos excessivos.

Estrutura da resposta:
ANÁLISE DE CORRELAÇÃO DE INCIDENTES
Escopo: ${correlation.host}
Eventos Agrupados: ${correlation.events?.length || 0}
Grau de Confiança: ${correlation.confidence}%

1. Diagnóstico de Causa Primária e Efeito Cascata
[Explicação concisa e direta do evento inicial e impacto]

2. Ações Prioritárias para Mitigação
1. [Ação 1]
2. [Ação 2]
3. [Ação 3]

3. Recomendações
• [Recomendação 1]
• [Recomendação 2]

Eventos:
${eventsList}
Palavras-chave: ${(correlation.commonKeywords || []).join(', ')}
`;

  const chosenProvider = provider || 'auto';

  if (chosenProvider === 'ollama') {
    try {
      const ollamaRes = await callOllama(
        ollamaEndpoint || 'http://127.0.0.1:11434',
        ollamaModel || 'llama3.2',
        prompt
      );
      return res.json({ result: cleanFormatting(ollamaRes), engine: 'ollama' });
    } catch (err: any) {
      const fallback = generateExpertCorrelationAnalysis(correlation);
      return res.json({ 
        result: cleanFormatting(fallback), 
        engine: 'fallback' 
      });
    }
  }

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });
      if (response.text) {
        return res.json({ result: cleanFormatting(response.text), engine: 'gemini' });
      }
    } catch (geminiError: any) {
      console.warn('Gemini correlation call failed:', geminiError.message);
    }
  }

  if (chosenProvider === 'auto') {
    try {
      const ollamaRes = await callOllama(
        ollamaEndpoint || 'http://127.0.0.1:11434',
        ollamaModel || 'llama3.2',
        prompt
      );
      return res.json({ result: cleanFormatting(ollamaRes), engine: 'ollama' });
    } catch (e) {}
  }

  const fallback = generateExpertCorrelationAnalysis(correlation);
  return res.json({ result: cleanFormatting(fallback), engine: 'expert' });
});

app.post('/api/ai/predict-problems', async (req: Request, res: Response) => {
  const { history, provider, ollamaEndpoint, ollamaModel } = req.body;

  if (!Array.isArray(history)) {
    return res.status(400).json({ error: 'History array is required' });
  }

  const recentHistory = history.slice(0, 50).map((p: any) => ({
    name: p.name,
    host: p.hosts?.[0]?.name || p.host || 'Desconhecido',
    time: new Date(parseInt(p.clock) * 1000).toLocaleString(),
    severity: p.severity,
  }));

  const prompt = `
Você é um analista preditivo de TI e infraestrutura Zabbix.
Com base no histórico recente de incidentes, gere um relatório preditivo DIRETO, TÉCNICO e CONCISO.
NÃO use emojis. NÃO use linhas horizontais (---). NÃO use divisores com asteriscos excessivos.

Estrutura da resposta:
RELATÓRIO PREDITIVO DE INFRAESTRUTURA
Amostra Analisada: ${history.length} incidentes

1. Hosts com Maior Reincidência de Incidentes
[Lista concisa com porcentagem ou volume]

2. Janelas Horárias de Maior Concentração de Falhas
[Horários de pico identificados]

3. Recomendações Preventivas
• [Ação preventiva 1]
• [Ação preventiva 2]
• [Ação preventiva 3]

Histórico:
${JSON.stringify(recentHistory, null, 2)}
`;

  const chosenProvider = provider || 'auto';

  if (chosenProvider === 'ollama') {
    try {
      const ollamaRes = await callOllama(
        ollamaEndpoint || 'http://127.0.0.1:11434',
        ollamaModel || 'llama3.2',
        prompt
      );
      return res.json({ result: cleanFormatting(ollamaRes), engine: 'ollama' });
    } catch (err: any) {
      const fallback = generateExpertPrediction(history);
      return res.json({ 
        result: cleanFormatting(fallback), 
        engine: 'fallback' 
      });
    }
  }

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });
      if (response.text) {
        return res.json({ result: cleanFormatting(response.text), engine: 'gemini' });
      }
    } catch (geminiError: any) {
      console.warn('Gemini prediction call failed:', geminiError.message);
    }
  }

  if (chosenProvider === 'auto') {
    try {
      const ollamaRes = await callOllama(
        ollamaEndpoint || 'http://127.0.0.1:11434',
        ollamaModel || 'llama3.2',
        prompt
      );
      return res.json({ result: cleanFormatting(ollamaRes), engine: 'ollama' });
    } catch (e) {}
  }

  const fallback = generateExpertPrediction(history);
  return res.json({ result: cleanFormatting(fallback), engine: 'expert' });
});

function generateExpertTopologyImpact(node: any, children: any[] = [], problems: any[] = []): string {
  const nodeName = node?.name || 'Dispositivo';
  const category = node?.category || 'Infraestrutura';
  const childCount = children.length;
  const directProblems = problems.length;

  return `ANÁLISE DE IMPACTO EM CASCATA & TOPOLOGIA
Nó Central: ${nodeName} (${category.toUpperCase()})
Severidade do Ponto de Falha: ${directProblems > 0 ? 'CRÍTICO - EM FALHA ATIVA' : 'SIMULAÇÃO DE IMPACTO'}
Dispositivos Dependentes no Raio de Queda: ${childCount} nó(s)

1. Avaliação do Raio de Impacto (Blast Radius)
${childCount > 0 
  ? `A indisponibilidade de "${nodeName}" interrompe o tráfego de ${childCount} dispositivo(s) a jusante, incluindo servidores, câmeras ou serviços dependentes que perderão acesso ao gateway e rotas principais.`
  : `O nó "${nodeName}" opera como dispositivo de borda (folha). Sua queda afeta diretamente o serviço local sem propagar indisponibilidade para outros hosts da rede.`}

2. Análise de Ponto Único de Falha (SPOF)
${category === 'core_network' || category === 'switch'
  ? `ALERTA DE ARQUITETURA: Este elemento atua como nó de agregação/distribuição. A ausência de enlace redundante (LACP/MLAG ou HSRP) gera indisponibilidade generalizada nos segmentos conectados.`
  : `Elemento de aplicação/borda. Recomenda-se balanceamento de carga ou cluster se o serviço for crítico.`}

3. Plano de Contenção Imediata
1. Testar conectividade de gerência no nó ${nodeName} (porta console / OOBM).
2. Verificar se há enlace redundante secundário que deveria ter assumido automaticamente.
3. Isolar tráfego anômalo (broadcast storm / loop de camada 2) nas portas do switch.
4. Validar se a fonte de alimentação ou PoE não sofreu desligamento inesperado.

4. Medidas de Prevenção e Resiliência
• Implementar topologia em anel ou malha com Spanning-Tree (RSTP/MSTP) otimizado.
• Configurar rotas de failover automático para links de saída.
• Estabelecer monitoramento proativo de temperatura, voltagem e taxa de erros CRC nas portas de uplink.`;
}

function generateExpertFlappingAnalysis(item: any): string {
  const host = item?.hostName || 'Host';
  const trigger = item?.triggerName || 'Alerta';
  const flips = item?.transitionsCount || 0;
  const score = item?.flapScore || 50;
  const noise = item?.noiseLevel || 'Alto';

  return `DIAGNÓSTICO DE FLAPPING & REDUÇÃO DE RUÍDO
Host: ${host}
Gatilho Ofensor: ${trigger}
Oscilações Registradas: ${flips} transições no período
Índice de Instabilidade: ${score}% (Nível de Ruído: ${noise})

1. Causa Raiz da Oscilação
O gatilho está alternando repetidamente entre OK e PROBLEMA em curtos intervalos. As causas mais prováveis são:
• Limiar de disparo (threshold) muito sensível sem histerese ou tolerância temporal.
• Instabilidade na camada física (cabo de rede com mau contato, conector RJ45/fibra degradado, interferência eletromagnética).
• Sobrecarga intermitente em portas de switch PoE ou variação de voltagem em câmeras/dispositivos remotos.
• Pacotes perdidos em rota WAN/VPN oscilante ou duplex mismatch na interface.

2. Ações Imediatas de Estabilização
1. Inspecionar a interface física e porta no switch correspondente (verificar erros de CRC e resets de porta via CLI/SNMP).
2. Testar ping contínuo de longa duração (mtr ou ping -t) verificando jitter e perda em rajadas.
3. Se for câmera IP ou IoT, verificar a potência PoE fornecida e estabilidade da fonte de alimentação.

3. Otimização no Zabbix (Redução de Fadiga de Alertas)
• Adicionar histerese na expressão do trigger (ex: disparar apenas se falhar 3x consecutivas usando max(#3)=1 ou count(5m,1,"gt",3)).
• Implementar Recovery Expression mais tolerante para evitar que uma única resposta bem-sucedida feche o alerta prematuramente.
• Configurar janela de manutenção temporária enquanto a correção física é realizada.`;
}

// Route: AI Topology Impact Analysis
app.post('/api/ai/analyze-topology', async (req: Request, res: Response) => {
  const { node, children, problems, provider, ollamaEndpoint, ollamaModel } = req.body;
  const prompt = `Você é um Engenheiro Principal de Redes e Infraestrutura (SRE/Network Architect).
Analise o impacto de queda e a propagação em cascata da seguinte topologia de rede Zabbix:

Nó: ${JSON.stringify(node)}
Dispositivos Filhos Dependentes: ${JSON.stringify(children)}
Problemas Ativos: ${JSON.stringify(problems)}

Forneça um relatório técnico executivo, direto, organizado e sem asteriscos decorativos, emojis ou floreios.
Estrutura exigida:
ANÁLISE DE IMPACTO EM CASCATA & TOPOLOGIA
Nó Central: [Nome] ([Categoria])
Severidade do Ponto de Falha: [Avaliação]
Dispositivos Dependentes no Raio de Queda: [X nós]

1. Avaliação do Raio de Impacto (Blast Radius)
[Explicação concisa sobre quem é afetado]

2. Análise de Ponto Único de Falha (SPOF)
[Análise de redundância e risco arquitetural]

3. Plano de Contenção Imediata
1. [Passo 1]
2. [Passo 2]
3. [Passo 3]

4. Medidas de Prevenção e Resiliência
• [Medida 1]
• [Medida 2]
`;

  const chosenProvider = provider || 'auto';

  if (chosenProvider === 'ollama') {
    try {
      const ollamaRes = await callOllama(
        ollamaEndpoint || 'http://127.0.0.1:11434',
        ollamaModel || 'llama3.2',
        prompt
      );
      return res.json({ result: cleanFormatting(ollamaRes), engine: 'ollama' });
    } catch (err: any) {
      const fallback = generateExpertTopologyImpact(node, children, problems);
      return res.json({ result: cleanFormatting(fallback), engine: 'fallback' });
    }
  }

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });
      if (response.text) {
        return res.json({ result: cleanFormatting(response.text), engine: 'gemini' });
      }
    } catch (geminiError: any) {
      console.warn('Gemini topology analysis failed:', geminiError.message);
    }
  }

  if (chosenProvider === 'auto') {
    try {
      const ollamaRes = await callOllama(
        ollamaEndpoint || 'http://127.0.0.1:11434',
        ollamaModel || 'llama3.2',
        prompt
      );
      return res.json({ result: cleanFormatting(ollamaRes), engine: 'ollama' });
    } catch (e) {}
  }

  const fallback = generateExpertTopologyImpact(node, children, problems);
  return res.json({ result: cleanFormatting(fallback), engine: 'expert' });
});

// Route: AI Flapping & Noise Reduction Analysis
app.post('/api/ai/analyze-flapping', async (req: Request, res: Response) => {
  const { item, provider, ollamaEndpoint, ollamaModel } = req.body;
  const prompt = `Você é um Engenheiro de Monitoramento Zabbix e SRE especializado em redução de ruído de alertas (Alert Fatigue & Flapping Detection).
Analise o seguinte item que está em oscilação contínua (flapping):

${JSON.stringify(item, null, 2)}

Forneça uma análise técnica, concisa e direta, sem emojis, sem linhas divisórias com asteriscos.
Estrutura exigida:
DIAGNÓSTICO DE FLAPPING & REDUÇÃO DE RUÍDO
Host: [Nome]
Gatilho Ofensor: [Gatilho]
Oscilações Registradas: [X transições]
Índice de Instabilidade: [X%] (Nível de Ruído: [Nível])

1. Causa Raiz da Oscilação
[Explicação técnica das causas físicas, de rede ou configuração]

2. Ações Imediatas de Estabilização
1. [Ação 1]
2. [Ação 2]
3. [Ação 3]

3. Otimização no Zabbix (Redução de Fadiga de Alertas)
• [Ajuste de trigger/histerese/expressão no Zabbix]
• [Medida de tolerância/dampening]
`;

  const chosenProvider = provider || 'auto';

  if (chosenProvider === 'ollama') {
    try {
      const ollamaRes = await callOllama(
        ollamaEndpoint || 'http://127.0.0.1:11434',
        ollamaModel || 'llama3.2',
        prompt
      );
      return res.json({ result: cleanFormatting(ollamaRes), engine: 'ollama' });
    } catch (err: any) {
      const fallback = generateExpertFlappingAnalysis(item);
      return res.json({ result: cleanFormatting(fallback), engine: 'fallback' });
    }
  }

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });
      if (response.text) {
        return res.json({ result: cleanFormatting(response.text), engine: 'gemini' });
      }
    } catch (geminiError: any) {
      console.warn('Gemini flapping analysis failed:', geminiError.message);
    }
  }

  if (chosenProvider === 'auto') {
    try {
      const ollamaRes = await callOllama(
        ollamaEndpoint || 'http://127.0.0.1:11434',
        ollamaModel || 'llama3.2',
        prompt
      );
      return res.json({ result: cleanFormatting(ollamaRes), engine: 'ollama' });
    } catch (e) {}
  }

  const fallback = generateExpertFlappingAnalysis(item);
  return res.json({ result: cleanFormatting(fallback), engine: 'expert' });
});

// AI Health Check & Model Discovery
app.post('/api/ai/health', async (req: Request, res: Response) => {
  const { ollamaEndpoint } = req.body;
  const endpoint = (ollamaEndpoint || 'http://127.0.0.1:11434').replace(/\/+$/, '');

  const results: any = {
    gemini: { available: false, error: null },
    ollama: { available: false, models: [], error: null },
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    results.gemini.available = true;
  } else {
    results.gemini.error = 'GEMINI_API_KEY não configurada no servidor';
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const ollamaRes = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (ollamaRes.ok) {
      const data: any = await ollamaRes.json();
      results.ollama.available = true;
      results.ollama.models = (data.models || []).map((m: any) => m.name);
    } else {
      results.ollama.error = `HTTP ${ollamaRes.status}`;
    }
  } catch (err: any) {
    results.ollama.error = err.message || 'Não foi possível conectar ao Ollama';
  }

  return res.json(results);
});

async function startServer() {
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (dev=${isDev})`);
  });
}

startServer();
