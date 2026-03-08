import { useEffect, useState, type ReactNode } from 'react';
import { type UnitPlan, type DetailedLesson, initialUnitPlan, type AIParameters, type WebSearchSettings, defaultWebSearchDomains } from './types';
import { AppContext } from './appContext';

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const SYSTEM_LOGO_URL = 'https://p.ipic.vip/lhgb6n.png';
  const [apiKey, setApiKey] = useState(localStorage.getItem('apiKey') || '');
  const [aiProvider, setAiProviderState] = useState(localStorage.getItem('aiProvider') || 'openai');
  const [ocrEndpoint, setOcrEndpointState] = useState(() => {
    const saved = (localStorage.getItem('ocrEndpoint') || '').trim();
    if (!saved || saved.includes('mineru.net')) {
      const fallback = 'https://api.ocr.space/parse/image';
      localStorage.setItem('ocrEndpoint', fallback);
      return fallback;
    }
    return saved;
  });
  const [ocrApiKey, setOcrApiKeyState] = useState(localStorage.getItem('ocrApiKey') || '');
  const [accessPassword, setAccessPasswordState] = useState(localStorage.getItem('accessPassword') || 'admin123');
  const [logoDataUrl, setLogoDataUrlState] = useState(() => {
    const saved = localStorage.getItem('logoDataUrl');
    if (saved && saved.trim()) return saved;
    localStorage.setItem('logoDataUrl', SYSTEM_LOGO_URL);
    return SYSTEM_LOGO_URL;
  });
  const [selectedModel, setSelectedModelState] = useState(localStorage.getItem('selectedModel') || 'gpt-4o');
  const [availableModels, setAvailableModels] = useState<string[]>(() => {
    const saved = localStorage.getItem('availableModels');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
      }
    }
    return [
      'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3.5-sonnet', 'deepseek-chat', 'deepseek-reasoner', 'gemini-1.5-pro'
    ];
  });
  const [aiParameters, setAiParametersState] = useState<AIParameters>(() => {
    const saved = localStorage.getItem('aiParameters');
    return saved ? JSON.parse(saved) : {
      teachingFocus: '素养导向',
      activityPreference: '探究式',
      assessmentStyle: '形成性评价',
      differentiationLevel: '标准',
      teachingStyle: '引导探究'
    };
  });
  const [webSearchSettings, setWebSearchSettingsState] = useState<WebSearchSettings>(() => {
    const saved = localStorage.getItem('webSearchSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as WebSearchSettings;
        return {
          strictMode: parsed.strictMode ?? true,
          allowedDomains: Array.isArray(parsed.allowedDomains) && parsed.allowedDomains.length > 0 ? parsed.allowedDomains : defaultWebSearchDomains,
          lastStats: parsed.lastStats || null
        };
      } catch {
      }
    }
    return {
      strictMode: true,
      allowedDomains: defaultWebSearchDomains,
      lastStats: null
    };
  });
  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('isAuthenticated') === 'true');
  const [unitPlan, setUnitPlan] = useState<UnitPlan>(() => {
    const saved = localStorage.getItem('unitPlan');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<UnitPlan>;
        return { ...initialUnitPlan, ...parsed, textbookFile: null, textbookFiles: [] };
      } catch {
      }
    }
    return initialUnitPlan;
  });
  const [detailedLessons, setDetailedLessons] = useState<Record<string, DetailedLesson>>(() => {
    const saved = localStorage.getItem('detailedLessons');
    if (saved) {
      try {
        return JSON.parse(saved) as Record<string, DetailedLesson>;
      } catch {
      }
    }
    return {};
  });

  useEffect(() => {
    const { textbookFile: _textbookFile, textbookFiles: _textbookFiles, ...rest } = unitPlan;
    localStorage.setItem('unitPlan', JSON.stringify(rest));
  }, [unitPlan]);

  useEffect(() => {
    localStorage.setItem('detailedLessons', JSON.stringify(detailedLessons));
  }, [detailedLessons]);

  const handleSetApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('apiKey', key);
  };

  const setAiProvider = (provider: string) => {
    setAiProviderState(provider);
    localStorage.setItem('aiProvider', provider);
  };

  const setOcrEndpoint = (endpoint: string) => {
    setOcrEndpointState(endpoint);
    localStorage.setItem('ocrEndpoint', endpoint);
  };

  const setOcrApiKey = (key: string) => {
    setOcrApiKeyState(key);
    localStorage.setItem('ocrApiKey', key);
  };

  const setAccessPassword = (password: string) => {
    setAccessPasswordState(password);
    localStorage.setItem('accessPassword', password);
  };

  const setLogoDataUrl = (dataUrl: string) => {
    setLogoDataUrlState(dataUrl);
    localStorage.setItem('logoDataUrl', dataUrl);
  };

  const setSelectedModel = (model: string) => {
    setSelectedModelState(model);
    localStorage.setItem('selectedModel', model);
  };

  const updateAvailableModels = (models: string[]) => {
    setAvailableModels(models);
    localStorage.setItem('availableModels', JSON.stringify(models));
  };

  const setAiParameters = (params: Partial<AIParameters>) => {
    const newParams = { ...aiParameters, ...params };
    setAiParametersState(newParams);
    localStorage.setItem('aiParameters', JSON.stringify(newParams));
  };

  const setWebSearchSettings = (settings: Partial<WebSearchSettings>) => {
    const merged = { ...webSearchSettings, ...settings };
    setWebSearchSettingsState(merged);
    localStorage.setItem('webSearchSettings', JSON.stringify(merged));
  };

  const login = (password: string) => {
    const ok = password === accessPassword;
    if (ok) {
      setIsAuthenticated(true);
      localStorage.setItem('isAuthenticated', 'true');
    }
    return ok;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('isAuthenticated');
  };

  const updateUnitPlan = (plan: Partial<UnitPlan>) => {
    setUnitPlan(prev => ({ ...prev, ...plan }));
  };

  const updateDetailedLesson = (lessonId: string, lesson: DetailedLesson) => {
    setDetailedLessons(prev => ({
      ...prev,
      [lessonId]: lesson
    }));
  };

  return (
    <AppContext.Provider value={{
      apiKey,
      aiProvider,
      ocrEndpoint,
      ocrApiKey,
      accessPassword,
      logoDataUrl,
      selectedModel,
      availableModels,
      aiParameters,
      webSearchSettings,
      isAuthenticated,
      unitPlan,
      detailedLessons,
      setApiKey: handleSetApiKey,
      setAiProvider,
      setOcrEndpoint,
      setOcrApiKey,
      setAccessPassword,
      setLogoDataUrl,
      setSelectedModel,
      updateAvailableModels,
      setAiParameters,
      setWebSearchSettings,
      login,
      logout,
      updateUnitPlan,
      updateDetailedLesson
    }}>
      {children}
    </AppContext.Provider>
  );
};
