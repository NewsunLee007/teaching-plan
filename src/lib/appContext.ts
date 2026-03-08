import { createContext } from 'react';
import { type AppState, type UnitPlan, type DetailedLesson, type AIParameters, type WebSearchSettings } from './types';

export interface AppContextType extends AppState {
  setApiKey: (key: string) => void;
  setAiProvider: (provider: string) => void;
  setOcrEndpoint: (endpoint: string) => void;
  setOcrApiKey: (key: string) => void;
  setAccessPassword: (password: string) => void;
  setLogoDataUrl: (dataUrl: string) => void;
  setSelectedModel: (model: string) => void;
  updateAvailableModels: (models: string[]) => void;
  setAiParameters: (params: Partial<AIParameters>) => void;
  setWebSearchSettings: (settings: Partial<WebSearchSettings>) => void;
  login: (password: string) => boolean;
  logout: () => void;
  updateUnitPlan: (plan: Partial<UnitPlan>) => void;
  updateDetailedLesson: (lessonId: string, lesson: DetailedLesson) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
