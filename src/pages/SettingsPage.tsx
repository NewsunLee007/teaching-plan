import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/useApp';
import { Save, RefreshCcw, Link as LinkIcon, ChevronDown, Sliders, ImagePlus, Trash2, Cpu, GraduationCap, Database, Settings, KeyRound } from 'lucide-react';
import { fetchProviderModels } from '../lib/ai';
import { extractPdfTextViaOcr } from '../lib/textbook';

export function SettingsPage() {
  const { 
    apiKey, setApiKey, 
    aiProvider, setAiProvider,
    ocrEndpoint, setOcrEndpoint,
    ocrApiKey, setOcrApiKey,
    accessPassword, setAccessPassword,
    logoDataUrl, setLogoDataUrl,
    selectedModel, setSelectedModel,
    availableModels, updateAvailableModels,
    aiParameters, setAiParameters,
    webSearchSettings, setWebSearchSettings
  } = useApp();

  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localOcrEndpoint, setLocalOcrEndpoint] = useState(ocrEndpoint || 'https://mineru.net');
  const [localOcrApiKey, setLocalOcrApiKey] = useState(ocrApiKey);
  const [localAccessPassword, setLocalAccessPassword] = useState(accessPassword);
  const [localLogoDataUrl, setLocalLogoDataUrl] = useState(logoDataUrl);
  const [localWebStrictMode, setLocalWebStrictMode] = useState(webSearchSettings.strictMode);
  const [localWebDomains, setLocalWebDomains] = useState(webSearchSettings.allowedDomains.join('\n'));
  const [saved, setSaved] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [isTestingOcr, setIsTestingOcr] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [modelStatus, setModelStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [modelStatusText, setModelStatusText] = useState('');
  const ocrSampleInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const providers = [
    { id: 'openai', name: 'OpenAI (国际版)' },
    { id: 'anthropic', name: 'Anthropic (Claude)' },
    { id: 'gemini', name: 'Google Gemini' },
    { id: 'deepseek', name: 'DeepSeek (深度求索)' },
    { id: 'moonshot', name: 'Moonshot AI (Kimi)' },
    { id: 'qwen', name: 'Alibaba Qwen (通义千问)' },
    { id: 'zhipu', name: 'Zhipu GLM (智谱清言)' },
    { id: 'custom', name: '自定义接口 (Custom OpenAI Compatible)' },
  ];


  const normalizeDomains = (raw: string) => Array.from(new Set(
    raw.split(/[\n,]/).map((x) => x.trim().toLowerCase()).filter(Boolean)
  ));

  const arraysEqual = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

  const persistSettings = (manual = false) => {
    setApiKey(localApiKey);
    setOcrEndpoint(localOcrEndpoint);
    setOcrApiKey(localOcrApiKey);
    setAccessPassword(localAccessPassword);
    setLogoDataUrl(localLogoDataUrl);
    const parsedDomains = normalizeDomains(localWebDomains);
    setWebSearchSettings({
      strictMode: localWebStrictMode,
      allowedDomains: parsedDomains.length > 0 ? Array.from(new Set(parsedDomains)) : webSearchSettings.allowedDomains
    });
    if (manual) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } else {
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 1500);
    }
  };

  const handleSave = () => persistSettings(true);

  const isDirty = useMemo(() => {
    const currentDomains = normalizeDomains(localWebDomains);
    const savedDomains = normalizeDomains(webSearchSettings.allowedDomains.join('\n'));
    return localApiKey !== apiKey
      || localOcrEndpoint !== ocrEndpoint
      || localOcrApiKey !== ocrApiKey
      || localAccessPassword !== accessPassword
      || localLogoDataUrl !== logoDataUrl
      || localWebStrictMode !== webSearchSettings.strictMode
      || !arraysEqual(currentDomains, savedDomains);
  }, [localApiKey, apiKey, localOcrEndpoint, ocrEndpoint, localOcrApiKey, ocrApiKey, localAccessPassword, accessPassword, localLogoDataUrl, logoDataUrl, localWebStrictMode, webSearchSettings.strictMode, localWebDomains, webSearchSettings.allowedDomains]);

  useEffect(() => {
    if (!isDirty) return;
    const timer = window.setTimeout(() => persistSettings(false), 850);
    return () => window.clearTimeout(timer);
  }, [isDirty, localApiKey, localOcrEndpoint, localOcrApiKey, localAccessPassword, localLogoDataUrl, localWebStrictMode, localWebDomains]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setLocalLogoDataUrl(result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTestOcr = () => {
    ocrSampleInputRef.current?.click();
  };

  const handleTestOcrWithSample = async (file: File) => {
    if (!localOcrEndpoint.trim()) {
      setOcrStatus('error');
      setOcrStatusText('请先填写 OCR 地址');
      return;
    }
    setIsTestingOcr(true);
    setOcrStatus('idle');
    setOcrStatusText('');
    try {
      const text = await extractPdfTextViaOcr({
        endpoint: localOcrEndpoint,
        file,
        apiKey: localOcrApiKey || undefined
      });
      setOcrStatus('success');
      setOcrStatusText(`识别成功（${text.length} 字）`);
    } catch (err) {
      setOcrStatus('error');
      const msg = err instanceof Error ? err.message : '连接失败';
      if (msg.toLowerCase().includes('failed to fetch')) {
        if (localOcrEndpoint.includes('aistudio-app.com/layout-parsing')) {
          setOcrStatusText('连接失败：浏览器跨域拦截。请确保在本地 dev 环境运行（已内置飞浆代理），或使用你自己的后端 OCR 网关。');
        } else if (localOcrEndpoint.includes('mineru.net')) {
          setOcrStatusText('连接失败：MinerU 网络不可达或跨域受限。请检查网络并重试。');
        } else {
          setOcrStatusText('连接失败（可能是跨域限制）。请改用 OCR.Space 或可跨域 OCR 网关。');
        }
      } else {
        const compact = msg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        setOcrStatusText(compact || '连接失败');
      }
    } finally {
      setIsTestingOcr(false);
      window.setTimeout(() => {
        setOcrStatus('idle');
        setOcrStatusText('');
      }, 3000);
    }
  };

  const handleOcrSampleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleTestOcrWithSample(file);
    e.target.value = '';
  };

  const classifyModelError = (message: string) => {
    const m = message.toLowerCase();
    if (m.includes('401') || m.includes('unauthorized') || m.includes('invalid api key') || m.includes('incorrect api key')) {
      return 'API Key 无效或未生效';
    }
    if (m.includes('403') || m.includes('forbidden') || m.includes('insufficient') || m.includes('permission')) {
      return '权限不足或账号无模型访问权限';
    }
    if (m.includes('404') || m.includes('405') || m.includes('not found') || m.includes('not supported') || m.includes('unsupported')) {
      return '当前服务商暂不支持模型列表接口';
    }
    if (m.includes('429') || m.includes('rate limit') || m.includes('quota')) {
      return '请求受限，请稍后重试或检查额度';
    }
    if (m.includes('failed to fetch') || m.includes('network') || m.includes('cors')) {
      return '网络不可达或跨域受限';
    }
    return '未知错误';
  };

  const handleRefreshModels = async () => {
    if (!localApiKey.trim()) {
      setModelStatus('error');
      setModelStatusText('请先填写 API Key');
      return;
    }
    setIsRefreshingModels(true);
    setModelStatus('idle');
    setModelStatusText('');
    try {
      const newModels = await fetchProviderModels({
        apiKey: localApiKey,
        provider: aiProvider
      });
      updateAvailableModels(newModels);
      if (newModels.length > 0) {
        setSelectedModel(newModels[0]);
      }
      setModelStatus('success');
      setModelStatusText(`已刷新 ${newModels.length} 个模型`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '模型刷新失败';
      const category = classifyModelError(raw);
      setModelStatus('error');
      setModelStatusText(`${category}：${raw}`);
    } finally {
      setIsRefreshingModels(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      
      {/* 1. AI Service Configuration */}
      <div className="bg-white p-8 rounded-3xl shadow-soft border border-gray-100">
        <div className="mb-6 border-b border-gray-100 pb-4">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <div className="p-2.5 bg-brand-50 rounded-xl text-brand-600">
                <Cpu className="h-6 w-6" />
            </div>
            AI 模型与服务
            </h3>
            <p className="text-sm text-slate-500 pl-[3.25rem]">
                配置核心 AI 服务商及模型参数，这是生成教学设计的基础。
            </p>
        </div>
        
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* AI Provider */}
                <div>
                    <label className="block text-sm font-bold text-slate-800 mb-2">AI 服务商</label>
                    <div className="relative">
                        <select
                            data-guide="settings-provider"
                            className="input-field appearance-none cursor-pointer"
                            value={aiProvider}
                            onChange={(e) => setAiProvider(e.target.value)}
                        >
                            {providers.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {/* API Key */}
                <div>
                    <label className="block text-sm font-bold text-slate-800 mb-2">API 密钥</label>
                    <input
                        data-guide="settings-api-key"
                        type="password"
                        className="input-field font-mono text-sm"
                        value={localApiKey}
                        onChange={(e) => setLocalApiKey(e.target.value)}
                        placeholder={`请输入 ${providers.find(p => p.id === aiProvider)?.name.split(' ')[0]} API Key`}
                    />
                </div>
            </div>

            {/* Model Selection & Refresh */}
            <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">选择模型</label>
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <select
                            data-guide="settings-model"
                            className="input-field appearance-none cursor-pointer"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                        >
                            {availableModels.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                    <button 
                        onClick={handleRefreshModels}
                        disabled={isRefreshingModels}
                        className="btn-secondary px-4 flex items-center gap-2 whitespace-nowrap"
                        title="刷新模型列表"
                    >
                        <RefreshCcw className={isRefreshingModels ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                        {isRefreshingModels ? '刷新中' : '刷新列表'}
                    </button>
                </div>
                {modelStatus !== 'idle' && (
                    <div className={`mt-2 text-xs px-3 py-2 rounded-lg border ${
                        modelStatus === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'
                    }`}>
                        {modelStatus === 'success' ? '✓ ' : '✕ '}{modelStatusText}
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* 2. Teaching Preferences */}
      <div className="bg-white p-8 rounded-3xl shadow-soft border border-gray-100">
        <div className="mb-6 border-b border-gray-100 pb-4">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                <GraduationCap className="h-6 w-6" />
            </div>
            教学偏好设置
            </h3>
            <p className="text-sm text-slate-500 pl-[3.25rem]">
                自定义 AI 生成教学设计的风格与倾向，使其更符合您的教学理念。
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Teaching Focus */}
            <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">教学重点倾向</label>
                <select
                    className="input-field"
                    value={aiParameters.teachingFocus}
                    onChange={(e) => setAiParameters({ ...aiParameters, teachingFocus: e.target.value })}
                >
                    <option value="知识掌握">知识掌握 - 重视基础知识和技能的巩固</option>
                    <option value="能力培养">能力培养 - 强调思维能力和解决问题能力</option>
                    <option value="素养导向">素养导向 - 关注学科核心素养的全面发展</option>
                </select>
            </div>

            {/* Activity Preference */}
            <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">活动类型偏好</label>
                <select
                    className="input-field"
                    value={aiParameters.activityPreference}
                    onChange={(e) => setAiParameters({ ...aiParameters, activityPreference: e.target.value })}
                >
                    <option value="探究式">探究式 - 引导学生自主探索和发现</option>
                    <option value="合作式">合作式 - 注重小组合作和交流讨论</option>
                    <option value="项目式">项目式 - 基于真实情境的项目学习</option>
                    <option value="混合式">混合式 - 多种活动形式相结合</option>
                </select>
            </div>

            {/* Assessment Style */}
            <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">评价方式</label>
                <select
                    className="input-field"
                    value={aiParameters.assessmentStyle}
                    onChange={(e) => setAiParameters({ ...aiParameters, assessmentStyle: e.target.value })}
                >
                    <option value="形成性评价">形成性评价 - 关注学习过程的持续反馈</option>
                    <option value="总结性评价">总结性评价 - 重视学习结果的检测</option>
                    <option value="表现性评价">表现性评价 - 通过实际表现评估能力</option>
                    <option value="多元化评价">多元化评价 - 多种评价方式相结合</option>
                </select>
            </div>

            {/* Differentiation Level */}
            <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">分层程度</label>
                <select
                    className="input-field"
                    value={aiParameters.differentiationLevel}
                    onChange={(e) => setAiParameters({ ...aiParameters, differentiationLevel: e.target.value })}
                >
                    <option value="基础">基础 - 适合学习基础较弱的学生</option>
                    <option value="标准">标准 - 适合大多数学生的常规要求</option>
                    <option value="挑战">挑战 - 适合学有余力的优秀学生</option>
                </select>
            </div>

            {/* Teaching Style */}
            <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-800 mb-2">教学风格</label>
                <select
                    className="input-field"
                    value={aiParameters.teachingStyle}
                    onChange={(e) => setAiParameters({ ...aiParameters, teachingStyle: e.target.value })}
                >
                    <option value="传统讲授">传统讲授 - 教师主导，系统讲解知识</option>
                    <option value="引导探究">引导探究 - 教师引导，学生主动探究</option>
                    <option value="混合式">混合式 - 讲授与探究相结合</option>
                    <option value="学生中心">学生中心 - 完全以学生活动为主</option>
                </select>
            </div>
        </div>
      </div>

      {/* 3. Resources & Tools */}
      <div className="bg-white p-8 rounded-3xl shadow-soft border border-gray-100">
        <div className="mb-6 border-b border-gray-100 pb-4">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <div className="p-2.5 bg-purple-50 rounded-xl text-purple-600">
                <Database className="h-6 w-6" />
            </div>
            资源与工具配置
            </h3>
            <p className="text-sm text-slate-500 pl-[3.25rem]">
                管理 OCR 识别服务、联网搜索源及导出设置。
            </p>
        </div>

        <div className="space-y-8">
            {/* OCR Settings */}
            <div>
                <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-bold text-slate-800" data-guide="settings-ocr">OCR 服务地址</label>
                    <button 
                        onClick={handleTestOcr}
                        disabled={isTestingOcr}
                        className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 transition-colors font-medium disabled:opacity-50"
                    >
                        {isTestingOcr ? <RefreshCcw className="h-3 w-3 animate-spin" /> : <LinkIcon className="h-3 w-3" />}
                        {isTestingOcr ? '识别中...' : '上传样本页测试'}
                    </button>
                </div>
                <input
                    ref={ocrSampleInputRef}
                    type="file"
                    accept=".pdf,.ppt,.pptx,.doc,.docx,image/*,.txt,.md,.markdown,.json,.csv"
                    className="hidden"
                    onChange={handleOcrSampleChange}
                />
                <div className="space-y-3">
                    <input
                        type="text"
                        className="input-field font-mono text-sm text-slate-600"
                        value={localOcrEndpoint}
                        onChange={(e) => setLocalOcrEndpoint(e.target.value)}
                        placeholder="OCR API Endpoint"
                    />
                    <div className="flex gap-2">
                        <button onClick={() => setLocalOcrEndpoint('https://mineru.net')} className="text-[11px] px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">MinerU (推荐)</button>
                        <button onClick={() => setLocalOcrEndpoint('https://7bj8i4gb0bp656t9.aistudio-app.com/layout-parsing')} className="text-[11px] px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">飞浆 Layout</button>
                        <button onClick={() => setLocalOcrEndpoint('https://api.ocr.space/parse/image')} className="text-[11px] px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">OCR.Space</button>
                    </div>
                    <input
                        type="text"
                        className="input-field font-mono text-sm text-slate-600"
                        value={localOcrApiKey}
                        onChange={(e) => setLocalOcrApiKey(e.target.value)}
                        placeholder="OCR API Key (MinerU 必填)"
                    />
                    <div className="flex justify-between items-start gap-4">
                        <p className="text-xs text-slate-400 leading-relaxed">
                            MinerU 使用 Bearer Token，支持 PDF/图片高精度解析。PPTX/DOCX 优先本地解析，不消耗 OCR 额度。
                        </p>
                        {(ocrStatus === 'success' || ocrStatus === 'error') && (
                            <span className={`text-xs font-medium shrink-0 ${ocrStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                {ocrStatus === 'success' ? '✓ ' : '✕ '}{ocrStatusText}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Web Search Settings */}
            <div className="pt-6 border-t border-gray-100">
                <label className="block text-sm font-bold text-slate-800 mb-3">联网搜索配置</label>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-4">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={localWebStrictMode}
                            onChange={(e) => setLocalWebStrictMode(e.target.checked)}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span>严格模式（仅允许白名单域名）</span>
                    </label>
                    <div>
                        <span className="text-xs font-semibold text-slate-600 block mb-2">域名白名单（每行一个）</span>
                        <textarea
                            value={localWebDomains}
                            onChange={(e) => setLocalWebDomains(e.target.value)}
                            className="input-field min-h-[80px] font-mono text-xs bg-white"
                            placeholder="例如：gov.cn"
                        />
                    </div>
                    <div className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                        <span className="font-medium text-slate-700">最近统计：</span>
                        {webSearchSettings.lastStats ? (
                            <span>{new Date(webSearchSettings.lastStats.queriedAt).toLocaleDateString()} 查询 "{webSearchSettings.lastStats.query}"，抓取 {webSearchSettings.lastStats.totalFetched} 条，使用 {webSearchSettings.lastStats.usedCount} 条。</span>
                        ) : '暂无数据'}
                    </div>
                </div>
            </div>

            {/* Logo Settings */}
            <div className="pt-6 border-t border-gray-100">
                 <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-bold text-slate-800">导出文档 Logo</label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => logoInputRef.current?.click()}
                            className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 transition-colors font-medium"
                        >
                            <ImagePlus className="h-3.5 w-3.5" />
                            上传
                        </button>
                        {localLogoDataUrl && (
                            <button
                                onClick={() => setLocalLogoDataUrl('')}
                                className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                清除
                            </button>
                        )}
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </div>
                <div className="h-16 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                    {localLogoDataUrl ? (
                        <img src={localLogoDataUrl} alt="logo" className="h-full object-contain p-1" />
                    ) : (
                        <span className="text-xs text-slate-400">未配置（使用默认）</span>
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* 4. System Settings */}
      <div className="bg-white p-8 rounded-3xl shadow-soft border border-gray-100">
        <div className="mb-6 border-b border-gray-100 pb-4">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <div className="p-2.5 bg-slate-100 rounded-xl text-slate-600">
                <Settings className="h-6 w-6" />
            </div>
            系统管理
            </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">登录访问密码</label>
                <div className="relative">
                    <input
                        type="password"
                        className="input-field pl-10"
                        value={localAccessPassword}
                        onChange={(e) => setLocalAccessPassword(e.target.value)}
                        placeholder="设置新密码"
                    />
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
            </div>
            
            <div className="flex items-end">
                <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center justify-between">
                    <div>
                        <div className="text-sm font-semibold text-slate-700">新手引导</div>
                        <div className="text-xs text-slate-500">重置后将重新显示操作指引</div>
                    </div>
                    <button
                        onClick={() => {
                            localStorage.setItem('onboardingSeen', 'false');
                            window.dispatchEvent(new Event('open-onboarding'));
                        }}
                        className="text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium"
                    >
                        重置引导
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* Floating Save Button */}
      <div className="fixed right-8 bottom-8 z-40 flex flex-col items-end gap-2">
        {autoSaved && (
            <div className="bg-white/95 text-slate-600 px-3 py-2 rounded-lg border border-slate-200 shadow-sm text-xs backdrop-blur-sm">
                已自动保存
            </div>
        )}
        <button
            data-guide="settings-save"
            onClick={handleSave}
            className="btn-primary px-6 py-3 rounded-full font-semibold flex items-center gap-2 shadow-lg shadow-brand-200/50 hover:shadow-brand-300/50 hover:-translate-y-0.5 transition-all"
        >
            <Save className="h-5 w-5" />
            保存配置
        </button>
      </div>

      {saved && (
        <div className="fixed bottom-8 right-8 bg-green-50 text-green-700 px-6 py-4 rounded-xl shadow-lg border border-green-100 flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300 z-50">
            <div className="bg-green-100 p-1 rounded-full">
                <CheckIcon />
            </div>
            <div>
                <p className="font-bold">保存成功</p>
                <p className="text-xs opacity-80">配置已更新至本地存储</p>
            </div>
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.3334 4L6.00008 11.3333L2.66675 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    )
}