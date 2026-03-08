import { useApp } from '../lib/useApp';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Edit3, Settings, LogOut, ChevronRight, HelpCircle, X, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { useEffect, useState } from 'react';

export function Layout() {
  const { isAuthenticated, login, logout, logoDataUrl } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [guideCardPos, setGuideCardPos] = useState({ left: 24, top: 80 });

  const navItems = [
    { path: '/', label: '单元备课', icon: BookOpen, desc: 'Step 1' },
    { path: '/lesson-planner', label: '课时规划', icon: Calendar, desc: 'Step 2' },
    { path: '/design', label: '课时设计', icon: Edit3, desc: 'Step 3' },
    { path: '/settings', label: '系统设置', icon: Settings, desc: 'Config' },
  ];

  useEffect(() => {
    if (!isAuthenticated) return;
    const seen = localStorage.getItem('onboardingSeen') === 'true';
    if (!seen) setShowGuide(true);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = () => {
      setGuideStep(0);
      setShowGuide(true);
    };
    window.addEventListener('open-onboarding', handler as EventListener);
    return () => window.removeEventListener('open-onboarding', handler as EventListener);
  }, [isAuthenticated]);

  const guideItems = [
    { path: '/settings', selector: '[data-guide="settings-provider"]', title: '第1步：选择 AI 服务商', desc: '先选择你可用的 AI 服务商，后续模型与接口会随之匹配。' },
    { path: '/settings', selector: '[data-guide="settings-api-key"]', title: '第2步：填写 API 密钥', desc: '这是 AI 生成功能的核心凭证，填写后即可进行智能生成。' },
    { path: '/settings', selector: '[data-guide="settings-ocr"]', title: '第3步：配置 OCR 服务', desc: '上传教材前建议先测试 OCR，确保文档解析稳定。' },
    { path: '/settings', selector: '[data-guide="settings-model"]', title: '第4步：选择模型', desc: '根据教学场景选择合适模型，可先刷新模型列表再挑选。' },
    { path: '/settings', selector: '[data-guide="settings-web-source"]', title: '第5步：配置联网来源', desc: '可维护白名单与严格模式，保证检索来源可控。' },
    { path: '/settings', selector: '[data-guide="settings-save"]', title: '第6步：保存与自动保存', desc: '设置会自动保存，悬浮保存按钮可随时手动确认。' },
    { path: '/', selector: '[data-guide="unit-subject"]', title: '第7步：填写单元基础信息', desc: '先选学科、教材版本和年级，再上传教材素材。' },
    { path: '/', selector: '[data-guide="unit-start-date"]', title: '第8步：设置起始日期', desc: '设置开课起始日期，系统会自动推算后续课时日期和星期。' },
    { path: '/', selector: '[data-guide="unit-generate-schedule"]', title: '第9步：生成课时安排', desc: '自动生成课题与课型后，逐条确认，作为课时设计输入。' },
    { path: '/', selector: '[data-guide="unit-ai-open"]', title: '第10步：单元 AI 助手', desc: '可用 AI 助手做单元分析优化，并结合联网调试验证证据。' },
    { path: '/design', selector: '[data-guide="design-generate"]', title: '第11步：生成课时设计', desc: '进入课时设计后，一键生成初稿，再进行局部优化。' },
    { path: '/design', selector: '[data-guide="design-ai-open"]', title: '第12步：课时 AI 对话', desc: '通过对话与调试抽屉查看命中链接、正文证据与过滤原因。' },
    { path: '/design', selector: '[data-guide="design-export-pdf"]', title: '第13步：导出成果', desc: '最终导出 PDF 或 Word，形成可直接使用的备课成果。' }
  ];

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!showGuide) return;
    const current = guideItems[guideStep];
    if (!current) return;
    if (location.pathname !== current.path) {
      navigate(current.path);
      return;
    }
    const timer = window.setTimeout(() => {
      const element = document.querySelector(current.selector) as HTMLElement | null;
      if (!element) {
        setTargetRect(null);
        setGuideCardPos({ left: 24, top: 80 });
        return;
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      window.setTimeout(() => {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
        setGuideCardPos(computeGuideCardPos(rect));
      }, 220);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, showGuide, guideStep, location.pathname]);

  const computeGuideCardPos = (rect: DOMRect | null) => {
    if (!rect) return { left: 24, top: 80 };
    const cardW = 360;
    const cardH = 210;
    const gap = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const canRight = rect.right + gap + cardW <= vw - 16;
    const canLeft = rect.left - gap - cardW >= 16;
    const canBottom = rect.bottom + gap + cardH <= vh - 16;
    const canTop = rect.top - gap - cardH >= 16;
    if (canRight) return { left: rect.right + gap, top: Math.min(vh - cardH - 16, Math.max(16, rect.top + rect.height / 2 - cardH / 2)) };
    if (canLeft) return { left: rect.left - gap - cardW, top: Math.min(vh - cardH - 16, Math.max(16, rect.top + rect.height / 2 - cardH / 2)) };
    if (canBottom) return { left: Math.min(vw - cardW - 16, Math.max(16, rect.left + rect.width / 2 - cardW / 2)), top: rect.bottom + gap };
    if (canTop) return { left: Math.min(vw - cardW - 16, Math.max(16, rect.left + rect.width / 2 - cardW / 2)), top: rect.top - gap - cardH };
    return { left: Math.min(vw - cardW - 16, Math.max(16, rect.left)), top: Math.min(vh - cardH - 16, Math.max(16, rect.bottom + gap)) };
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!showGuide) return;
    const onResize = () => {
      const current = guideItems[guideStep];
      const element = current ? document.querySelector(current.selector) as HTMLElement | null : null;
      const rect = element ? element.getBoundingClientRect() : null;
      setTargetRect(rect);
      setGuideCardPos(computeGuideCardPos(rect));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isAuthenticated, showGuide, guideStep]);

  const closeGuide = () => {
    localStorage.setItem('onboardingSeen', 'true');
    setShowGuide(false);
    setGuideStep(0);
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={login} logoDataUrl={logoDataUrl} />;
  }

  return (
    <div className="flex h-screen bg-slate-50/50 font-sans text-slate-900 selection:bg-brand-100 selection:text-brand-900">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200/60 flex flex-col shadow-soft z-20">
        <div className="p-6 pb-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-brand-50 p-1.5 rounded-xl h-10 w-10 border border-brand-100 overflow-hidden">
                 <img src={logoDataUrl} alt="system-logo" className="h-full w-full object-cover" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              三学联网
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium pl-1">AI 驱动的智能备课系统</p>
        </div>
        
        <nav className="flex-1 px-3 space-y-2 py-3">
          {navItems.map((item) => {
             const isActive = location.pathname === item.path;
             return (
                <Link
                key={item.path}
                to={item.path}
                className={cn(
                    "group flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden",
                    isActive 
                    ? "bg-brand-50 text-brand-700 shadow-sm" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
                >
                {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-brand-500 rounded-r-full" />
                )}
                <item.icon className={cn("h-5 w-5 transition-colors", isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")} />
                <div className="flex-1">
                    <span className="block leading-none">{item.label}</span>
                    <span className={cn("text-[10px] mt-1 block font-normal", isActive ? "text-brand-400" : "text-slate-400")}>{item.desc}</span>
                </div>
                {isActive && <ChevronRight className="h-4 w-4 text-brand-400 opacity-50" />}
                </Link>
             )
          })}
        </nav>

        <div className="p-3 border-t border-gray-100 m-3">
          <button onClick={() => { setShowGuide(false); logout(); navigate('/'); }} className="flex items-center gap-3 text-sm text-slate-500 hover:text-red-600 w-full px-3 py-2.5 rounded-xl hover:bg-red-50 transition-all group">
            <LogOut className="h-5 w-5 group-hover:scale-110 transition-transform" />
            <span className="font-medium">退出登录</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F8FAFC]">
        <header className="h-20 bg-white/80 backdrop-blur-sm border-b border-gray-200/60 flex items-center justify-between px-8 sticky top-0 z-10 shadow-sm">
          <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                {navItems.find(i => i.path === location.pathname)?.label || '备课中心'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">欢迎回来，开始今天的教学设计吧</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowGuide(true)}
              className="text-xs font-medium px-3 py-1.5 bg-white text-slate-600 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              新手导引
            </button>
            <div className="text-xs font-medium px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                Today: {new Date().toLocaleDateString('zh-CN')}
            </div>
            <div className="h-9 w-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-bold border border-brand-200">
                T
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
          <div className={cn(
            "mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500",
            ['/', '/lesson-planner', '/design'].includes(location.pathname) ? "max-w-[1720px]" : "max-w-7xl"
          )}>
            <Outlet />
          </div>
        </div>
      </main>
      {showGuide && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]" />
          {targetRect && (
            <div
              className="absolute rounded-xl border-2 border-brand-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] transition-all duration-200"
              style={{
                left: Math.max(10, targetRect.left - 8),
                top: Math.max(10, targetRect.top - 8),
                width: targetRect.width + 16,
                height: targetRect.height + 16
              }}
            />
          )}
          <div
            className="absolute w-[360px] rounded-2xl bg-white border border-slate-200 shadow-2xl p-5"
            style={{
              left: guideCardPos.left,
              top: guideCardPos.top
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{guideItems[guideStep].title}</h3>
                <p className="text-xs text-slate-500 mt-1">第 {guideStep + 1} / {guideItems.length} 步</p>
              </div>
              <button onClick={closeGuide} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-700 leading-6 mb-4">{guideItems[guideStep].desc}</p>
            <div className="flex items-center justify-between">
              <button onClick={() => setGuideStep((s) => Math.max(0, s - 1))} disabled={guideStep === 0} className="px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40">
                上一步
              </button>
              {guideStep < guideItems.length - 1 ? (
                <button onClick={() => setGuideStep((s) => Math.min(guideItems.length - 1, s + 1))} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white">
                  下一步
                </button>
              ) : (
                <button onClick={closeGuide} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white">
                  完成导引
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoginPage({ onLogin, logoDataUrl }: { onLogin: (password: string) => boolean; logoDataUrl: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onLogin(password)) {
      setError('');
      navigate('/');
    } else {
      setError('密码错误，请重试');
    }
  };

  return (
    <div className="h-screen w-screen bg-[#F0F9FF] flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-brand-200/30 rounded-full blur-3xl" />
            <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-blue-200/30 rounded-full blur-3xl" />
        </div>

      <div className="w-full max-w-md bg-white/80 backdrop-blur-xl p-10 rounded-3xl shadow-soft-lg border border-white/50 relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex bg-brand-50 p-4 rounded-2xl mb-6 shadow-sm">
            <img src={logoDataUrl} alt="system-logo" className="h-10 w-10 object-cover rounded-lg" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">三学联网</h1>
          <p className="text-slate-500 mt-3 text-sm">智能备课系统 · 登录</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              访问密码
            </label>
            <input
              type="password"
              className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-brand-100 focus:border-brand-500 transition-all outline-none text-slate-900 placeholder:text-slate-400"
              placeholder="请输入访问密码..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
             <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                 {error}
             </div>
          )}
          <button
            type="submit"
            className="w-full bg-brand-600 text-white py-3.5 rounded-xl hover:bg-brand-700 active:scale-[0.98] transition-all font-semibold shadow-lg shadow-brand-200"
          >
            进入系统
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-8">
            Designed for Professional Education
        </p>
      </div>
    </div>
  );
}
