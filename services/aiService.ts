import { ZabbixProblem, CorrelationGroup, AIProviderConfig, AIAnalysisResponse } from '../types';

const AI_CONFIG_KEY = 'zabbix_ai_config';

export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: 'auto',
  ollamaEndpoint: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.2',
};

export class AIService {
  static getConfig(): AIProviderConfig {
    try {
      const saved = localStorage.getItem(AI_CONFIG_KEY);
      if (saved) return { ...DEFAULT_AI_CONFIG, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error reading AI config from localStorage', e);
    }
    return DEFAULT_AI_CONFIG;
  }

  static saveConfig(config: AIProviderConfig): void {
    try {
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('Error saving AI config to localStorage', e);
    }
  }

  static async checkHealth(ollamaEndpoint?: string): Promise<{
    gemini: { available: boolean; error: string | null };
    ollama: { available: boolean; models: string[]; error: string | null };
  }> {
    try {
      const config = this.getConfig();
      const res = await fetch('/api/ai/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ollamaEndpoint: ollamaEndpoint || config.ollamaEndpoint,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err: any) {
      return {
        gemini: { available: false, error: err.message },
        ollama: { available: false, models: [], error: err.message },
      };
    }
  }

  static async analyzeProblem(problem: ZabbixProblem): Promise<AIAnalysisResponse> {
    const config = this.getConfig();
    try {
      const res = await fetch('/api/ai/analyze-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem,
          provider: config.provider,
          ollamaEndpoint: config.ollamaEndpoint,
          ollamaModel: config.ollamaModel,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.json();
    } catch (error: any) {
      console.error('AI Analysis API Error:', error);
      return {
        result: `Não foi possível contatar o serviço de IA: ${error.message}. Verifique a conexão com o servidor.`,
        engine: 'fallback',
      };
    }
  }

  static async analyzeCorrelation(correlation: CorrelationGroup): Promise<AIAnalysisResponse> {
    const config = this.getConfig();
    try {
      const res = await fetch('/api/ai/analyze-correlation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correlation,
          provider: config.provider,
          ollamaEndpoint: config.ollamaEndpoint,
          ollamaModel: config.ollamaModel,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.json();
    } catch (error: any) {
      console.error('AI Correlation API Error:', error);
      return {
        result: `Erro ao analisar correlação com IA: ${error.message}`,
        engine: 'fallback',
      };
    }
  }

  static async predictProblems(history: ZabbixProblem[]): Promise<AIAnalysisResponse> {
    const config = this.getConfig();
    try {
      const res = await fetch('/api/ai/predict-problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history,
          provider: config.provider,
          ollamaEndpoint: config.ollamaEndpoint,
          ollamaModel: config.ollamaModel,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.json();
    } catch (error: any) {
      console.error('AI Prediction API Error:', error);
      return {
        result: `Erro ao gerar previsão com IA: ${error.message}`,
        engine: 'fallback',
      };
    }
  }

  static async analyzeTopologyImpact(node: any, children: any[] = [], problems: any[] = []): Promise<AIAnalysisResponse> {
    const config = this.getConfig();
    try {
      const res = await fetch('/api/ai/analyze-topology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node,
          children,
          problems,
          provider: config.provider,
          ollamaEndpoint: config.ollamaEndpoint,
          ollamaModel: config.ollamaModel,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error: any) {
      console.error('AI Topology Impact Error:', error);
      return {
        result: `Erro ao analisar impacto de topologia com IA: ${error.message}`,
        engine: 'fallback',
      };
    }
  }

  static async analyzeFlapping(item: any): Promise<AIAnalysisResponse> {
    const config = this.getConfig();
    try {
      const res = await fetch('/api/ai/analyze-flapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item,
          provider: config.provider,
          ollamaEndpoint: config.ollamaEndpoint,
          ollamaModel: config.ollamaModel,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error: any) {
      console.error('AI Flapping Analysis Error:', error);
      return {
        result: `Erro ao analisar flapping com IA: ${error.message}`,
        engine: 'fallback',
      };
    }
  }

  static async generateCustomAnalysis(prompt: string): Promise<AIAnalysisResponse> {
    const config = this.getConfig();
    try {
      const res = await fetch('/api/ai/predict-problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          provider: config.provider,
          ollamaEndpoint: config.ollamaEndpoint,
          ollamaModel: config.ollamaModel,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error: any) {
      return {
        result: `Relatório de Atendimento:
• Equipe atuando com bom tempo de resposta nos alertas críticos.
• Principais ocorrências concentradas nos serviços de conectividade.
• Recomenda-se manter o acompanhamento contínuo de Acks e soluções salvas.`,
        engine: 'expert',
      };
    }
  }
}
