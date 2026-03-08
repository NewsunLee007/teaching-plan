import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useApp } from '../lib/useApp';
import { Upload, FileText, Loader2, CheckCircle, Download, Book, Sparkles, Calendar as CalendarIcon, ArrowRight, Eye, X, MessageCircle, Bot, User, Paperclip, Quote, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType, TextRun, ImageRun } from 'docx';
import { saveAs } from 'file-saver';
import { type LessonSchedule } from '../lib/types';
import { buildWebGrounding, chatCompletion, fetchTextbookVersionsAI, generateTextbookProfileAI, generateUnitPlanAI } from '../lib/ai';
import { buildTextbookSignals, extractTeachingMaterialText } from '../lib/textbook';
import { buildTemplateContext } from '../lib/textbookTemplates';
import { assessMaterialIntent, rememberMaterialDecision, type MaterialAssessment, type MaterialFlowMode } from '../lib/materialIntelligence';
import { MarkdownText } from '../components/MarkdownText';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useNavigate } from 'react-router-dom';

const CURRICULUM_STANDARDS: Record<string, string> = {
  chinese: "【语文课程标准(2022年版)】\n核心素养：文化自信、语言运用、思维能力、审美创造。\n课程内容：分为“语言文字积累与梳理”、“实用性阅读与交流”、“文学阅读与创意表达”、“思辨性阅读与表达”、“整本书阅读”、“跨学科学习”六个任务群。",
  math: "【数学课程标准(2022年版)】\n核心素养：会用数学的眼光观察现实世界，会用数学的思维思考现实世界，会用数学的语言表达现实世界。\n重点关注：数感、量感、符号意识、运算能力、几何直观、空间观念、推理意识、数据意识、模型意识、应用意识、创新意识。",
  english: "【英语课程标准(2022年版)】\n核心素养：语言能力、文化意识、思维品质、学习能力。\n课程内容：包括主题、语篇、语言知识、文化知识、语言技能和学习策略六个要素。强调英语学习活动观（学习理解、应用实践、迁移创新）。",
  science: "【科学课程标准(2022年版)】\n核心素养：科学观念、科学思维、探究实践、态度责任。\n重点：物质与能量、结构与功能、系统与模型、稳定与变化等跨学科概念。强调像科学家一样探究。",
  society: "【义务教育道德与法治/历史/地理课程标准(2022年版)】\n道德与法治：政治认同、道德修养、法治观念、健全人格、责任意识。\n历史：唯物史观、时空观念、史料实证、历史解释、家国情怀。\n地理：人地协调观、综合思维、区域认知、地理实践力。\n综合要求：关注社会发展，培养公民意识，强调跨学科主题学习（如“中华文化与民族团结”、“环境保护与可持续发展”）。"
};

const SUBJECT_LESSON_TYPES: Record<string, string[]> = {
  chinese: ['阅读课', '写作指导课', '阅读综合实践课', '专题学习活动课', '活动探究课', '单元整理课', '专题复习课'],
  math: ['新授课', '概念课', '探究课', '习题课', '讲评课', '复习课'],
  english: ['听说课', '阅读课', '语法课', '写作课', '复习课', '综合实践课'],
  science: ['实验探究课', '概念建构课', '探究课', '讲评课', '复习课', '综合实践课'],
  society: ['道法探究课', '历史探究课', '地理综合课', '讲评课', '复习课', '综合实践课']
};

export function UnitPlanner() {
  const navigate = useNavigate();
  const { unitPlan, updateUnitPlan, aiProvider, selectedModel, apiKey, aiParameters, ocrEndpoint, ocrApiKey, logoDataUrl, webSearchSettings, setWebSearchSettings } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [generateError, setGenerateError] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [textbookText, setTextbookText] = useState('');
  
  // Template Preview State
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);
  const [precheckResult, setPrecheckResult] = useState<{ level: 'success' | 'warn'; text: string } | null>(null);
  const [textbookVersions, setTextbookVersions] = useState<string[]>([]);
  const [isLoadingTextbookVersions, setIsLoadingTextbookVersions] = useState(false);
  const [isUnitAiPanelOpen, setIsUnitAiPanelOpen] = useState(false);
  const [unitChatInput, setUnitChatInput] = useState('');
  const [unitChatHistory, setUnitChatHistory] = useState<{ role: 'user' | 'ai'; content: string }[]>([
    { role: 'ai', content: '你好，我可以协助你完善单元备课、教材分析和课时规划。' }
  ]);
  const [isUnitChatLoading, setIsUnitChatLoading] = useState(false);
  const [isUnitAiMaximized, setIsUnitAiMaximized] = useState(false);
  const [showUnitDebugDrawer, setShowUnitDebugDrawer] = useState(false);
  const [enableUnitWebSearch, setEnableUnitWebSearch] = useState(true);
  const [unitReviseInstruction, setUnitReviseInstruction] = useState('');
  const [unitReviseTarget, setUnitReviseTarget] = useState<'global' | 'textbookAnalysis' | 'studentAnalysis' | 'coreKnowledge' | 'unitObjectives' | 'unitAssessment' | 'unitLessonPlan' | 'unitHomeworkPlan' | 'unitReflection' | 'individualGuidance'>('global');
  const [isUnitAssetParsing, setIsUnitAssetParsing] = useState(false);
  const [unitAssetText, setUnitAssetText] = useState('');
  const [unitAssetName, setUnitAssetName] = useState('');
  const [materialFlowMode, setMaterialFlowMode] = useState<MaterialFlowMode>('auto');
  const [materialAssessment, setMaterialAssessment] = useState<MaterialAssessment | null>(null);
  
  // PDF Export Ref
  const unitPlanContentRef = useRef<HTMLDivElement>(null);
  const unitChatEndRef = useRef<HTMLDivElement>(null);
  const unitAssetInputRef = useRef<HTMLInputElement>(null);
  const progressPanelRef = useRef<HTMLDivElement>(null);
  const [showCompactProgress, setShowCompactProgress] = useState(false);
  const materialFiles = unitPlan.textbookFiles && unitPlan.textbookFiles.length > 0
    ? unitPlan.textbookFiles
    : (unitPlan.textbookFile ? [unitPlan.textbookFile] : []);

  useEffect(() => {
    unitChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [unitChatHistory, isUnitChatLoading]);

  useEffect(() => {
    const saved = localStorage.getItem('unitChatHistory');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { role: 'user' | 'ai'; content: string }[];
      if (Array.isArray(parsed) && parsed.length > 0) setUnitChatHistory(parsed);
    } catch {
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('unitChatHistory', JSON.stringify(unitChatHistory.slice(-40)));
  }, [unitChatHistory]);

  useEffect(() => {
    if (!progressPanelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setShowCompactProgress(!entry.isIntersecting);
      },
      { threshold: 0.25 }
    );
    observer.observe(progressPanelRef.current);
    return () => observer.disconnect();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      updateUnitPlan({ textbookFile: files[0], textbookFiles: files });
      setMaterialAssessment(assessMaterialIntent(files, files.map((f) => f.name).join('\n')));
    }
  };

  const extractPdfText = async (file: File) => {
    return extractTeachingMaterialText({
      endpoint: ocrEndpoint,
      file,
      apiKey: ocrApiKey || undefined
    });
  };

  const loadAllMaterialText = async (files: File[]) => {
    const settled = await Promise.allSettled(files.map(async (file) => {
      const text = await extractPdfText(file);
      return `【素材：${file.name}】\n${text}`;
    }));
    const texts = settled
      .filter((it): it is PromiseFulfilledResult<string> => it.status === 'fulfilled')
      .map((it) => it.value);
    if (texts.length === 0) {
      const reason = settled.find((it): it is PromiseRejectedResult => it.status === 'rejected')?.reason;
      throw new Error(reason instanceof Error ? reason.message : '教材解析失败');
    }
    return texts.join('\n\n').slice(0, 80000);
  };

  const subjectNameMap: Record<string, string> = {
    chinese: '语文',
    math: '数学',
    english: '英语',
    science: '科学',
    society: '社会'
  };
  const getTodayLabel = () => {
    const now = new Date();
    const weekNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}年${m}月${d}日（${weekNames[now.getDay()]}）`;
  };
  const isDateQuestion = (text: string) => /(今天|当前|现在).*(几号|日期|星期)|今天.*(哪天|周几)|^\s*(今天|日期|现在时间)\s*[?？]?\s*$/.test(text);

  const getFallbackVersions = (subject: string) => {
    const map: Record<string, string[]> = {
      chinese: ['人教版', '部编版', '苏教版', '北师大版'],
      math: ['人教版', '北师大版', '苏教版', '浙教版'],
      english: ['人教版', '外研版', '译林版', '牛津上海版'],
      science: ['教科版', '人教版', '苏教版', '浙教版'],
      society: ['人教版', '部编版', '岳麓版', '中图版']
    };
    return map[subject] || ['人教版'];
  };

  useEffect(() => {
    if (!unitPlan.subject) {
      setTextbookVersions([]);
      return;
    }
    const fallback = getFallbackVersions(unitPlan.subject);
    setTextbookVersions(fallback);
    if (!unitPlan.textbookVersion) {
      updateUnitPlan({ textbookVersion: fallback[0] || '' });
    }
  }, [unitPlan.subject]);

  useEffect(() => {
    if (!unitPlan.subject || !unitPlan.grade || !apiKey) return;
    let cancelled = false;
    setIsLoadingTextbookVersions(true);
    fetchTextbookVersionsAI({
      apiKey,
      provider: aiProvider,
      model: selectedModel,
      subject: subjectNameMap[unitPlan.subject] || '学科',
      grade: unitPlan.grade
    }).then((versions) => {
      if (cancelled) return;
      const list = versions.length > 0 ? versions : getFallbackVersions(unitPlan.subject);
      setTextbookVersions(list);
      if (!unitPlan.textbookVersion) {
        updateUnitPlan({ textbookVersion: list[0] || '' });
      }
    }).catch(() => {
      if (cancelled) return;
      const list = getFallbackVersions(unitPlan.subject);
      setTextbookVersions(list);
      if (!unitPlan.textbookVersion) {
        updateUnitPlan({ textbookVersion: list[0] || '' });
      }
    }).finally(() => {
      if (!cancelled) setIsLoadingTextbookVersions(false);
    });
    return () => {
      cancelled = true;
    };
  }, [unitPlan.subject, unitPlan.grade, apiKey, aiProvider, selectedModel]);

  const deriveUnitName = () => {
    const fromPlan = unitPlan.unitLessonPlan
      .split('\n')
      .map((l) => l.trim())
      .find((l) => (l.includes('单元') || /unit/i.test(l)) && l.length <= 40 && !/[；。]/.test(l));
    if (fromPlan) {
      const clean = fromPlan.replace(/^[\d一二三四五六七八九十.、\-\s]+/, '').trim();
      if (clean) return clean;
    }
    if (unitPlan.schedule.length > 0) return unitPlan.schedule[0].topic;
    const fileName = (materialFiles[0]?.name || '').replace(/\.(pdf|ppt|pptx|doc|docx|txt|md|markdown|json|csv)$/i, '');
    const unitMatch = fileName.match(/(Unit\s*\d+[^_\-\s]*)/i);
    if (unitMatch) return unitMatch[1];
    return unitPlan.textbookVersion ? `${unitPlan.textbookVersion}单元` : '本单元';
  };

  const parseModuleLabel = (text: string) => {
    const compact = text.replace(/\s+/g, '');
    if (compact.length !== 6) return text;
    return `${compact.slice(0, 2)}\n${compact.slice(2, 4)}\n${compact.slice(4, 6)}`;
  };

  const toParagraphStyle = (raw: string) => {
    const lines = raw
      .split('\n')
      .map((line) => line.replace(/^\s*([•●▪\-*]|\d+[.)、]|[一二三四五六七八九十]+[、.])\s*/, '').trim())
      .filter(Boolean);
    if (lines.length <= 2) return raw.trim();
    const merged = lines.join(' ');
    const cut = Math.ceil(lines.length / 2);
    const first = lines.slice(0, cut).join(' ');
    const second = lines.slice(cut).join(' ');
    if (first.length > 20 && second.length > 20) return `${first}\n\n${second}`.trim();
    return merged.trim();
  };

  const inferLessonTopic = (text: string) => {
    const compactText = text.replace(/\r/g, '');
    const matched = compactText.match(/(第\s*\d+\s*课[：:\s-]*[^\n。]{2,30})/);
    if (matched?.[1]) return matched[1].trim();
    const line = compactText.split('\n').map((x) => x.trim()).find((x) => x.length >= 4 && x.length <= 28);
    if (line) return line;
    const baseName = (materialFiles[0]?.name || '本课时').replace(/\.(pdf|ppt|pptx|doc|docx|txt|md|markdown|json|csv)$/i, '');
    return baseName || '本课时';
  };

  const buildLogoPng = async () => {
    if (logoDataUrl) {
      try {
        if (logoDataUrl.startsWith('data:')) {
          const base64 = logoDataUrl.split(',')[1] || '';
          const binary = atob(base64);
          const arr = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) arr[i] = binary.charCodeAt(i);
          return arr;
        }
        const resp = await fetch(logoDataUrl);
        if (resp.ok) return new Uint8Array(await resp.arrayBuffer());
      } catch {
      }
    }
    const remoteLogo = 'https://p.ipic.vip/lhgb6n.png';
    try {
      const resp = await fetch(remoteLogo);
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        return new Uint8Array(buffer);
      }
    } catch {
    }
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, 180, 180);
    ctx.fillStyle = 'rgba(16,185,129,0.12)';
    ctx.beginPath();
    ctx.arc(90, 90, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(5,150,105,0.45)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(90, 90, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(5,150,105,0.7)';
    ctx.font = 'bold 34px PingFang SC, Microsoft YaHei';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('教研', 90, 82);
    ctx.font = 'bold 16px PingFang SC, Microsoft YaHei';
    ctx.fillText('LOGO', 90, 112);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  };

  const drawPdfLogo = (pdf: jsPDF, pageWidth: number, pageHeight: number) => {
    const x = pageWidth - 20;
    const y = pageHeight - 20;
    pdf.setDrawColor(16, 185, 129);
    pdf.setTextColor(16, 185, 129);
    pdf.setLineWidth(0.4);
    pdf.circle(x, y, 9, 'S');
    pdf.setFontSize(8);
    pdf.text('教研', x, y + 1.5, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  };

  const buildPdfSafeClone = (source: HTMLElement) => {
    const wrap = document.createElement('div');
    wrap.style.position = 'fixed';
    wrap.style.left = '-10000px';
    wrap.style.top = '0';
    wrap.style.width = `${source.offsetWidth}px`;
    wrap.style.background = '#ffffff';
    const clone = source.cloneNode(true) as HTMLElement;
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    const srcNodes = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))];
    const dstNodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
    const skipProps = new Set(['content', 'inset-block', 'inset-inline']);
    srcNodes.forEach((srcNode, idx) => {
      const dstNode = dstNodes[idx];
      if (!dstNode) return;
      const computed = getComputedStyle(srcNode);
      dstNode.removeAttribute('class');
      for (let i = 0; i < computed.length; i += 1) {
        const prop = computed[i];
        if (!prop || prop.startsWith('--') || skipProps.has(prop)) continue;
        const val = computed.getPropertyValue(prop);
        if (!val || /oklch\(|oklab\(/i.test(val)) continue;
        try {
          dstNode.style.setProperty(prop, val);
        } catch {
        }
      }
      if (dstNode.tagName?.toLowerCase() === 'svg') {
        dstNode.style.color = computed.color;
        dstNode.style.fill = computed.fill;
        dstNode.style.stroke = computed.stroke;
      }
    });
    return { element: clone, cleanup: () => document.body.removeChild(wrap) };
  };

  const getUnitPlanPrecheckIssues = () => {
    const issues: string[] = [];
    if (!unitPlan.subject) issues.push('未选择学科');
    if (!unitPlan.grade) issues.push('未选择年级');
    if (!unitPlan.volume) issues.push('未选择册别');
    if (materialFiles.length === 0) issues.push('未上传教材素材');
    if (!unitPlan.textbookAnalysis.trim()) issues.push('单元教材分析为空');
    if (!unitPlan.unitObjectives.trim()) issues.push('单元学习目标为空');
    if (!unitPlan.unitLessonPlan.trim()) issues.push('单元课时规划为空');
    if (unitPlan.schedule.length === 0) issues.push('课时安排为空');
    if (unitPlan.schedule.length > 0 && !unitPlan.schedule.some((s) => s.isConfirmed)) issues.push('尚未确认任何课时');
    return issues;
  };

  const runUnitPrecheck = () => {
    const issues = getUnitPlanPrecheckIssues();
    if (issues.length === 0) {
      setPrecheckResult({ level: 'success', text: '预检通过：可直接导出。' });
      return true;
    }
    setPrecheckResult({ level: 'warn', text: `预检发现 ${issues.length} 项：${issues.join('；')}` });
    return false;
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      setGenerateError('请先在系统设置中填写 API Key');
      return;
    }
    if (materialFiles.length === 0) {
      setGenerateError('请先上传教材素材');
      return;
    }
    setIsGenerating(true);
    setGenerateError('');
    setLoadingStep('正在解析教材素材...');
    let textbookContent = '';
    try {
      textbookContent = await loadAllMaterialText(materialFiles);
      setTextbookText(textbookContent);
      const assessment = assessMaterialIntent(materialFiles, textbookContent);
      setMaterialAssessment(assessment);
      const resolvedMode = materialFlowMode === 'auto' ? assessment.recommendedMode : materialFlowMode;
      rememberMaterialDecision(assessment, resolvedMode);
      if (resolvedMode === 'lesson') {
        const typeOptions = SUBJECT_LESSON_TYPES[unitPlan.subject] || SUBJECT_LESSON_TYPES.english;
        const single: LessonSchedule = {
          id: `${Date.now()}-single`,
          day: 1,
          topic: inferLessonTopic(textbookContent),
          type: typeOptions[0] || '新授课',
          isConfirmed: true
        };
        updateUnitPlan({
          schedule: [single],
          unitLessonPlan: `单课时智能识别：已识别为单课时素材，自动跳过单元生成并直达课时设计。`,
          textbookAnalysis: '',
          studentAnalysis: '',
          coreKnowledge: ''
        });
        setPrecheckResult({ level: 'warn', text: '系统识别为单课时素材，已跳过单元生成并直达课时设计。' });
        setIsGenerating(false);
        setLoadingStep('');
        navigate('/design');
        return;
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? `教材解析失败：${err.message}` : '教材解析失败，请更换素材格式或OCR地址');
      setIsGenerating(false);
      setLoadingStep('');
      return;
    }
    
    setLoadingStep(`检索${unitPlan.subject === 'society' ? '社会类' : ''}课程标准(2022版)...`);
    const standards = CURRICULUM_STANDARDS[unitPlan.subject] || "未找到对应课程标准";
    await new Promise(r => setTimeout(r, 1500));
    
    setLoadingStep('生成单元分析与核心知识...');
    const subjectName = subjectNameMap[unitPlan.subject] || '学科';
    const volumeText = unitPlan.volume || '';
    const textbookName = `${materialFiles[0]?.name || '教材'}${materialFiles.length > 1 ? ` +${materialFiles.length - 1}个素材` : ''}${volumeText ? `（${volumeText}）` : ''}`;
    const unitTitle = unitPlan.schedule[0]?.topic || '本单元';
    const templateContext = buildTemplateContext({
      subject: unitPlan.subject,
      grade: unitPlan.grade || '',
      textbookVersion: unitPlan.textbookVersion || '',
      volume: unitPlan.volume || ''
    });
    const signals = buildTextbookSignals(
      textbookContent,
      unitTitle,
      unitPlan.coreKnowledge || '',
      unitPlan.unitObjectives || ''
    );
    const enrichedTextbook = [
      textbookContent,
      signals.tocText ? `教材目录/单元标题:\n${signals.tocText}` : '',
      signals.paraText ? `关键段落:\n${signals.paraText}` : ''
    ].filter(Boolean).join('\n\n');
    try {
      let profileText = '';
      if (unitPlan.textbookVersion) {
        try {
          const profile = await generateTextbookProfileAI({
            apiKey,
            provider: aiProvider,
            model: selectedModel,
            subject: subjectName,
            grade: `${unitPlan.grade || '未知年级'}${volumeText ? ` ${volumeText}` : ''}`,
            textbookVersion: unitPlan.textbookVersion
          });
          profileText = [
            `教材版本画像：${unitPlan.textbookVersion}${volumeText ? `（${volumeText}）` : ''}`,
            profile.style ? `风格：${profile.style}` : '',
            profile.requirements ? `要求：${profile.requirements}` : '',
            profile.contentFocus ? `内容重点：${profile.contentFocus}` : '',
            profile.teachingTips ? `教学建议：${profile.teachingTips}` : ''
          ].filter(Boolean).join('\n');
        } catch {
          profileText = '';
        }
      }
      const aiResult = await generateUnitPlanAI({
        apiKey,
        provider: aiProvider,
        model: selectedModel,
        subject: subjectName,
        grade: unitPlan.grade || '未知年级',
        textbookName,
        unitTitle,
        outputLanguage: unitPlan.outputLanguage,
        standards: `${standards}\n\n【学科课型要求】${(SUBJECT_LESSON_TYPES[unitPlan.subject] || []).join('、')}`,
        textbookContent: [enrichedTextbook, profileText].filter(Boolean).join('\n\n'),
        textbookTemplate: templateContext,
        schedule: unitPlan.schedule.map(s => ({ day: s.day, topic: s.topic, type: s.type })),
        aiParameters
      });
      updateUnitPlan({
        textbookAnalysis: toParagraphStyle(aiResult.textbookAnalysis || ''),
        studentAnalysis: toParagraphStyle(aiResult.studentAnalysis || ''),
        coreKnowledge: toParagraphStyle(aiResult.coreKnowledge || ''),
        unitObjectives: aiResult.unitObjectives || '',
        unitAssessment: aiResult.unitAssessment || '',
        unitLessonPlan: aiResult.unitLessonPlan || '',
        unitHomeworkPlan: aiResult.unitHomeworkPlan || '',
        unitReflection: aiResult.unitReflection || '',
        individualGuidance: aiResult.individualGuidance || ''
      });
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'AI 生成失败');
    }
    
    setIsGenerating(false);
    setLoadingStep('');
  };

  const handleUnitChatSend = () => {
    if (!unitChatInput.trim()) return;
    if (!apiKey) {
      setGenerateError('请先在系统设置中填写 API Key');
      return;
    }
    const visibleMsg = unitChatInput.trim();
    setUnitChatHistory((prev) => [...prev, { role: 'user', content: visibleMsg }]);
    setUnitChatInput('');
    if (isDateQuestion(visibleMsg)) {
      setUnitChatHistory((prev) => [...prev, { role: 'ai', content: `今天是 ${getTodayLabel()}。` }]);
      return;
    }
    setIsUnitChatLoading(true);
    setUnitChatHistory((prev) => [...prev, { role: 'ai', content: '⏳ 正在联网检索并生成回答…' }]);
    const userMsg = `${visibleMsg}${unitAssetText ? `\n\n【素材：${unitAssetName}】\n${unitAssetText.slice(0, 1500)}` : ''}`;
    const context = [
      `学科：${subjectNameMap[unitPlan.subject] || '未选择'}`,
      `年级：${unitPlan.grade || '未选择'}`,
      `册别：${unitPlan.volume || '未选择'}`,
      `教材版本：${unitPlan.textbookVersion || '未选择'}`,
      `教材分析：${unitPlan.textbookAnalysis || '无'}`,
      `核心知识：${unitPlan.coreKnowledge || '无'}`,
      `单元目标：${unitPlan.unitObjectives || '无'}`,
      `课时安排：${unitPlan.schedule.map((s) => `第${s.day}天 ${s.topic}`).join('；') || '无'}`
    ].join('\n');
    const run = async () => {
      const searchResult = enableUnitWebSearch
        ? await buildWebGrounding(`${subjectNameMap[unitPlan.subject] || '学科'} ${visibleMsg}`, {
          strictMode: webSearchSettings.strictMode,
          allowedDomains: webSearchSettings.allowedDomains
        })
        : { items: [], grounding: '', stats: { provider: 'disabled', query: visibleMsg, totalFetched: 0, allowedCount: 0, filteredCount: 0, usedCount: 0 } };
      const search = searchResult.items;
      const citationGuide = search.length > 0 ? `\n\n回答中使用联网信息时，请用 [来源1] [来源2] 标注。` : '';
      const grounding = search.length > 0
        ? `\n\n联网检索参考：\n${search.map((it, idx) => `${idx + 1}. ${it.title}\n${it.snippet}\n${it.url}`).join('\n\n')}\n\n联网证据正文：\n${searchResult.grounding}`
        : '';
      const content = await chatCompletion({
        apiKey,
        provider: aiProvider,
        model: selectedModel,
        messages: [
          { role: 'system', content: `你是单元备课助手，请结合上下文给出可执行建议，必要时提供可直接粘贴到表单的内容。当前真实日期：${getTodayLabel()}。若提供了“联网检索参考/联网证据正文”，必须优先基于这些证据回答，且不得说“无法联网/无法查询实时信息”。` },
          { role: 'user', content: `当前备课上下文：\n${context}\n\n用户问题：${userMsg}${grounding}${citationGuide}` }
        ],
        temperature: 0.7
      });
      return { content, search, stats: searchResult.stats };
    };
    run().then(({ content, search, stats }) => {
      if (enableUnitWebSearch) {
        setWebSearchSettings({
          lastStats: {
            queriedAt: new Date().toISOString(),
            provider: stats.provider,
            query: stats.query,
            totalFetched: stats.totalFetched,
            allowedCount: stats.allowedCount,
            filteredCount: stats.filteredCount,
            usedCount: stats.usedCount,
            usedItems: stats.usedItems,
            filteredItems: stats.filteredItems
          }
        });
      }
      const sourceText = search.length > 0
        ? `\n\n参考来源：\n${search.map((it, idx) => `[来源${idx + 1}] ${it.title} - ${it.url}`).join('\n')}`
        : (enableUnitWebSearch ? '\n\n参考来源：未命中白名单来源，可在系统设置放宽规则或补充来源域名。' : '');
      setUnitChatHistory((prev) => {
        const next = [...prev];
        const idx = [...next].reverse().findIndex((m) => m.role === 'ai' && m.content.startsWith('⏳ 正在联网检索并生成回答'));
        if (idx !== -1) {
          const realIdx = next.length - 1 - idx;
          next[realIdx] = { role: 'ai', content: `${content}${sourceText}` };
          return next;
        }
        return [...prev, { role: 'ai', content: `${content}${sourceText}` }];
      });
    }).catch((err) => {
      setUnitChatHistory((prev) => {
        const next = [...prev];
        const idx = [...next].reverse().findIndex((m) => m.role === 'ai' && m.content.startsWith('⏳ 正在联网检索并生成回答'));
        const msg = err instanceof Error ? err.message : 'AI 回复失败';
        if (idx !== -1) {
          const realIdx = next.length - 1 - idx;
          next[realIdx] = { role: 'ai', content: msg };
          return next;
        }
        return [...prev, { role: 'ai', content: msg }];
      });
    }).finally(() => {
      setIsUnitChatLoading(false);
    });
  };

  const handleUnitAiRevise = async () => {
    if (!apiKey || !unitReviseInstruction.trim()) return;
    setIsUnitChatLoading(true);
    try {
      if (unitReviseTarget === 'global') {
        const revised = await generateUnitPlanAI({
          apiKey,
          provider: aiProvider,
          model: selectedModel,
          subject: subjectNameMap[unitPlan.subject] || '学科',
          grade: unitPlan.grade || '未知年级',
          textbookName: `${materialFiles[0]?.name || '教材'}${unitPlan.volume ? `（${unitPlan.volume}）` : ''}`,
          unitTitle: unitPlan.schedule[0]?.topic || '本单元',
          outputLanguage: unitPlan.outputLanguage,
          standards: CURRICULUM_STANDARDS[unitPlan.subject] || '',
          textbookContent: textbookText || '无',
          schedule: unitPlan.schedule.map(s => ({ day: s.day, topic: s.topic, type: s.type })),
          aiParameters,
          instruction: unitReviseInstruction
        });
        updateUnitPlan({
          textbookAnalysis: toParagraphStyle(String(revised.textbookAnalysis || '')),
          studentAnalysis: toParagraphStyle(String(revised.studentAnalysis || '')),
          coreKnowledge: toParagraphStyle(String(revised.coreKnowledge || '')),
          unitObjectives: String(revised.unitObjectives || ''),
          unitAssessment: String(revised.unitAssessment || ''),
          unitLessonPlan: String(revised.unitLessonPlan || ''),
          unitHomeworkPlan: String(revised.unitHomeworkPlan || ''),
          unitReflection: String(revised.unitReflection || ''),
          individualGuidance: String(revised.individualGuidance || '')
        });
        setUnitChatHistory((prev) => [...prev, { role: 'ai', content: '已完成全局二次优化，请检查各板块并继续微调。' }]);
      } else {
        const fieldText = String(unitPlan[unitReviseTarget] || '');
        const languageHint = unitPlan.outputLanguage === 'en' ? '请使用英文输出。' : '请使用中文输出。';
        const styleHint = (unitReviseTarget === 'textbookAnalysis' || unitReviseTarget === 'studentAnalysis' || unitReviseTarget === 'coreKnowledge')
          ? '请用分段式表述，不要使用分点列表。'
          : '';
        const content = await chatCompletion({
          apiKey,
          provider: aiProvider,
          model: selectedModel,
          messages: [
            { role: 'system', content: '你是教学文案优化助手。只输出优化后的正文，不要解释。' },
            { role: 'user', content: `目标字段：${unitReviseTarget}\n优化要求：${unitReviseInstruction}\n语言要求：${languageHint}\n样式要求：${styleHint || '保持原样式'}\n原文：\n${fieldText}` }
          ],
          temperature: 0.6
        });
        updateUnitPlan({ [unitReviseTarget]: styleHint ? toParagraphStyle(content) : content } as Partial<typeof unitPlan>);
        setUnitChatHistory((prev) => [...prev, { role: 'ai', content: `已完成“${unitReviseTarget}”局部优化。` }]);
      }
      setUnitReviseInstruction('');
    } catch (err) {
      setUnitChatHistory((prev) => [...prev, { role: 'ai', content: err instanceof Error ? err.message : '二次优化失败' }]);
    } finally {
      setIsUnitChatLoading(false);
    }
  };

  const handleUnitAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUnitAssetParsing(true);
    try {
      const text = await extractTeachingMaterialText({ endpoint: ocrEndpoint, file, apiKey: ocrApiKey || undefined });
      setUnitAssetName(file.name);
      setUnitAssetText(text.slice(0, 6000));
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : '素材解析失败');
    } finally {
      setIsUnitAssetParsing(false);
      e.target.value = '';
    }
  };

  const quoteUnitAssetToInput = () => {
    if (!unitAssetText) return;
    const quoted = `请结合以下素材优化单元设计：\n【素材：${unitAssetName}】\n${unitAssetText.slice(0, 1200)}`;
    setUnitChatInput((prev) => (prev ? `${prev}\n\n${quoted}` : quoted));
  };

  const exportUnitPlan = async (format: 'docx' | 'pdf' = 'docx') => {
    try {
      const pass = runUnitPrecheck();
      if (!pass) {
        setPrecheckResult({ level: 'warn', text: `存在未完成项，已继续导出。${getUnitPlanPrecheckIssues().join('；')}` });
      }
      if (format === 'pdf') {
        if (!unitPlanContentRef.current) throw new Error('导出区域未就绪');
      
        const element = unitPlanContentRef.current;
        const safe = buildPdfSafeClone(element);
        let canvas: HTMLCanvasElement;
        try {
          canvas = await html2canvas(safe.element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          });
        } finally {
          safe.cleanup();
        }
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const margin = 8;
      const renderWidth = pdfWidth - margin * 2;
      const renderHeight = (imgHeight * renderWidth) / imgWidth;
      const pageRenderableHeight = pdfHeight - margin * 2;
      let heightLeft = renderHeight;
      let position = margin;
      pdf.addImage(imgData, 'PNG', margin, position, renderWidth, renderHeight);
      drawPdfLogo(pdf, pdfWidth, pdfHeight);
      heightLeft -= pageRenderableHeight;
      
      while (heightLeft > 0) {
        pdf.addPage();
        position = heightLeft - renderHeight + margin;
        pdf.addImage(imgData, 'PNG', margin, position, renderWidth, renderHeight);
        drawPdfLogo(pdf, pdfWidth, pdfHeight);
        heightLeft -= pageRenderableHeight;
      }
      
        pdf.save(`单元备课-${subjectNameMap[unitPlan.subject] || unitPlan.subject}-${unitPlan.grade}.pdf`);
        return;
      }

    const createCell = (text: string, options: { bold?: boolean, fill?: string, colSpan?: number, rowSpan?: number, width?: number } = {}) => {
        return new TableCell({
            children: text.split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line, bold: options.bold, size: 24 })], alignment: "center" })),
            columnSpan: options.colSpan,
            rowSpan: options.rowSpan,
            shading: options.fill ? { fill: options.fill } : undefined,
            verticalAlign: "center",
            width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
        });
    };

    const createContentCell = (text: string, options: { colSpan?: number, rowSpan?: number } = {}) => {
        return new TableCell({
            children: text.split('\n').map(line => new Paragraph({
                children: [new TextRun({ text: line, size: 21 })],
                indent: { firstLine: 420 }
            })),
            columnSpan: options.colSpan,
            rowSpan: options.rowSpan,
        });
    };

    const subjectText = subjectNameMap[unitPlan.subject] || unitPlan.subject || '学科';
    const unitName = deriveUnitName();
    const logoData = await buildLogoPng();

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          ...(logoData ? [
            new Paragraph({
              children: [
                new ImageRun({
                  data: logoData,
                  type: 'png',
                  transformation: { width: 56, height: 56 }
                })
              ],
              alignment: 'center'
            })
          ] : []),
          new Paragraph({
            text: `2025 学年第二学期${subjectText}单元教学备课表`,
            heading: HeadingLevel.HEADING_1,
            alignment: "center",
          }),
          new Paragraph({ 
            text: `${unitPlan.grade}年级${unitPlan.volume ? ` ${unitPlan.volume}` : ''}    单元名称：${unitName}    总课时数：${unitPlan.schedule.length}`,
            alignment: "center",
          }),
          new Paragraph({ text: "" }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createCell("模块", { bold: true, fill: "F2F2F2", width: 15 }),
                  createCell("具体内容", { bold: true, fill: "F2F2F2" }),
                ],
              }),
              new TableRow({
                children: [
                  createCell(parseModuleLabel("单元教材分析"), { bold: true }),
                  createContentCell(unitPlan.textbookAnalysis),
                ],
              }),
              new TableRow({
                children: [
                  createCell(parseModuleLabel("单元学情分析"), { bold: true }),
                  createContentCell(unitPlan.studentAnalysis),
                ],
              }),
              new TableRow({
                children: [
                  createCell(parseModuleLabel("单元核心知识"), { bold: true }),
                  createContentCell(unitPlan.coreKnowledge),
                ],
              }),
              new TableRow({
                children: [
                  createCell(parseModuleLabel("单元学习目标"), { bold: true }),
                  new TableCell({
                    children: [
                        new Paragraph({ children: [new TextRun({ text: "单元学习目标：", bold: true })], indent: { firstLine: 420 } }),
                        ...unitPlan.unitObjectives.split('\n').map(line => new Paragraph({ text: line, indent: { firstLine: 420 } })),
                        new Paragraph({ text: "" }),
                        new Paragraph({ children: [new TextRun({ text: "评价证据：", bold: true })], indent: { firstLine: 420 } }),
                        ...unitPlan.unitAssessment.split('\n').map(line => new Paragraph({ text: line, indent: { firstLine: 420 } })),
                    ]
                  }),
                ],
              }),
              new TableRow({
                children: [
                  createCell(parseModuleLabel("单元课时规划"), { bold: true }),
                  createContentCell(unitPlan.unitLessonPlan),
                ],
              }),
              new TableRow({
                children: [
                  createCell(parseModuleLabel("单元作业规划"), { bold: true }),
                  createContentCell(unitPlan.unitHomeworkPlan),
                ],
              }),
              new TableRow({
                children: [
                  createCell(parseModuleLabel("单元教学反思"), { bold: true }),
                  createContentCell(unitPlan.unitReflection),
                ],
              }),
               new TableRow({
                children: [
                  createCell(parseModuleLabel("个别辅导对象"), { bold: true }),
                  createContentCell(unitPlan.individualGuidance || "（无）"),
                ],
              }),
            ],
          }),
        ],
      }],
    });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `单元备课-${subjectText}-${unitPlan.grade}.docx`);
    } catch (err) {
      setGenerateError(err instanceof Error ? `导出失败：${err.message}` : '导出失败');
    }
  };

  const currentLessonTypeOptions = SUBJECT_LESSON_TYPES[unitPlan.subject] || SUBJECT_LESSON_TYPES.english;
  const templateContext = useMemo(() => buildTemplateContext({
    subject: unitPlan.subject,
    grade: unitPlan.grade || '',
    textbookVersion: unitPlan.textbookVersion || '',
    volume: unitPlan.volume || ''
  }), [unitPlan.subject, unitPlan.grade, unitPlan.textbookVersion, unitPlan.volume]);
  const templateName = templateContext.split('\n')[0]?.replace(/^模板：/, '') || '通用教材结构模板';
  const unitPanelClass = isUnitAiMaximized
    ? "fixed inset-6 bg-white rounded-2xl shadow-2xl border border-gray-100 z-40 flex flex-col overflow-hidden"
    : "fixed right-8 bottom-28 w-[380px] h-[560px] bg-white rounded-2xl shadow-2xl border border-gray-100 z-40 flex flex-col overflow-hidden";
  const progressSteps = [
    { label: '系统配置', done: Boolean(apiKey) },
    { label: '基础信息', done: Boolean(unitPlan.subject && unitPlan.grade && unitPlan.volume && materialFiles.length > 0 && unitPlan.textbookVersion) },
    { label: '单元分析', done: Boolean(unitPlan.textbookAnalysis.trim()) },
    { label: '课时规划', done: unitPlan.schedule.length > 0 },
    { label: '课时确认', done: unitPlan.schedule.some((s) => s.isConfirmed) }
  ];
  const progressDoneCount = progressSteps.filter((s) => s.done).length;
  const progressPercent = Math.round((progressDoneCount / progressSteps.length) * 100);

  return (
    <div className="space-y-8">
      <div ref={progressPanelRef} className="bg-gradient-to-r from-white to-brand-50/40 p-6 rounded-2xl border border-brand-100 shadow-soft">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">备课流程进度</h3>
            <span className="text-xs font-semibold text-brand-700">{progressDoneCount}/{progressSteps.length} · {progressPercent}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {progressSteps.map((step) => (
              <div key={step.label} className={cn("text-xs px-2 py-1.5 rounded-lg text-center border", step.done ? "bg-green-50 text-green-700 border-green-200" : "bg-white text-slate-500 border-slate-200")}>
                {step.done ? '✓ ' : ''}{step.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step 1: Unit Planning */}
      <div className="bg-white p-8 rounded-3xl shadow-soft border border-gray-100 relative">
        <div className="flex justify-between items-start mb-8">
            <div>
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-1">
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-100 text-brand-600 text-sm font-bold">1</span>
                    单元教学备课
                </h3>
                <p className="text-slate-500 text-sm pl-10">上传教材并选择年级，AI 将为您生成深度分析</p>
            </div>
            <div className="flex gap-3">
                <button 
                    onClick={() => setShowTemplatePreview(true)}
                    className="btn-secondary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                >
                    <Eye className="h-4 w-4" />
                    备课模板预览
                </button>
                {unitPlan.textbookAnalysis && (
                    <div className="flex gap-2">

                        <button 
                            onClick={() => exportUnitPlan('docx')}
                            className="btn-secondary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                        >
                            <Download className="h-4 w-4" />
                            导出 Word
                        </button>
                        <button 
                            onClick={() => exportUnitPlan('pdf')}
                            className="btn-secondary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                        >
                            <Download className="h-4 w-4" />
                            导出 PDF
                        </button>
                    </div>
                )}
            </div>
        </div>
        {precheckResult && (
          <div className={cn(
            "mb-6 text-xs px-3 py-2 rounded-lg border",
            precheckResult.level === 'success'
              ? "text-green-700 bg-green-50 border-green-100"
              : "text-amber-700 bg-amber-50 border-amber-100"
          )}>
            {precheckResult.text}
          </div>
        )}
        
        <div className="grid grid-cols-6 gap-8 mb-8">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">学科</label>
            <div className="relative">
                <select 
                data-guide="unit-subject"
                className="input-field appearance-none cursor-pointer"
                value={unitPlan.subject}
                onChange={(e) => updateUnitPlan({ subject: e.target.value, textbookVersion: '' })}
                >
                <option value="">请选择学科</option>
                <option value="chinese">语文</option>
                <option value="math">数学</option>
                <option value="english">英语</option>
                <option value="science">科学</option>
                <option value="society">社会 (道法/历史/地理)</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">教材版本</label>
            <div className="relative">
              <select
                className="input-field appearance-none cursor-pointer"
                value={unitPlan.textbookVersion}
                onChange={(e) => updateUnitPlan({ textbookVersion: e.target.value })}
                disabled={!unitPlan.subject}
                >
                <option value="">{isLoadingTextbookVersions ? 'AI 拉取教材版本中...' : '请选择教材版本'}</option>
                {textbookVersions.map((ver) => (
                  <option key={ver} value={ver}>{ver}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <div className="text-[11px] text-slate-500">结构模板：{templateName}</div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">年级</label>
            <div className="relative">
                <select 
                className="input-field appearance-none cursor-pointer"
                value={unitPlan.grade}
                onChange={(e) => updateUnitPlan({ grade: e.target.value })}
                >
                <option value="">请选择年级</option>
                <option value="7">七年级</option>
                <option value="8">八年级</option>
                <option value="9">九年级</option>
                </select>
                 <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">册别</label>
            <div className="relative">
                <select
                className="input-field appearance-none cursor-pointer"
                value={unitPlan.volume}
                onChange={(e) => updateUnitPlan({ volume: e.target.value })}
                >
                <option value="">请选择册别</option>
                <option value="上册">上册</option>
                <option value="下册">下册</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">教材素材</label>
            <div className="relative">
              <input 
                type="file" 
                accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.json,.csv,image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden" 
                id="pdf-upload"
              />
              <label 
                htmlFor="pdf-upload"
                className={cn(
                    "flex flex-col items-center justify-center w-full h-[46px] border-2 border-dashed rounded-xl cursor-pointer transition-all",
                    materialFiles.length > 0
                        ? "bg-brand-50 border-brand-200 text-brand-700" 
                        : "border-gray-300 hover:border-brand-400 hover:bg-gray-50 text-slate-500"
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                    {materialFiles.length > 0 ? (
                        <>
                            <CheckCircle className="h-4 w-4" />
                            {materialFiles.length === 1 ? materialFiles[0].name : `已选择 ${materialFiles.length} 个素材`}
                        </>
                    ) : (
                        <>
                            <Upload className="h-4 w-4" />
                            <span>上传素材（PDF/PPT/Word/图片/文本）</span>
                        </>
                    )}
                </div>
              </label>
            </div>
            {materialFiles.length > 1 && (
              <div className="mt-1 text-[11px] text-slate-500 truncate">{materialFiles.map((f) => f.name).join('、')}</div>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">输出语言</label>
            <div className="relative">
              <select
                className="input-field appearance-none cursor-pointer"
                value={unitPlan.outputLanguage}
                onChange={(e) => updateUnitPlan({ outputLanguage: e.target.value as 'zh' | 'en' })}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
        <div className="mb-5 grid grid-cols-3 gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600">智能分流模式</label>
            <select
              className="input-field h-10 text-sm"
              value={materialFlowMode}
              onChange={(e) => setMaterialFlowMode(e.target.value as MaterialFlowMode)}
            >
              <option value="auto">自动判断</option>
              <option value="unit">强制单元备课</option>
              <option value="lesson">强制单课时直达</option>
            </select>
          </div>
          <div className="col-span-2 text-xs text-slate-600 space-y-1">
            <div>识别结果：{materialAssessment ? ({ single_lesson: '单课时', unit: '完整单元', mixed: '混合素材', unknown: '未知' }[materialAssessment.intent]) : '待识别'}</div>
            <div>完整度评分：{materialAssessment ? `${materialAssessment.completenessScore}/100` : '—'} · 置信度：{materialAssessment ? `${Math.round(materialAssessment.confidence * 100)}%` : '—'}</div>
            <div className="truncate">分析说明：{materialAssessment ? materialAssessment.reason : '上传素材后系统将自动识别，并支持手动覆盖。'}</div>
            {materialAssessment && (
              <div className="truncate">处理链路：{materialAssessment.pipelines.map((p) => `${p.fileName}→${p.pipeline}`).join('；')}</div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100">
          {generateError && (
            <div className="mr-auto text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              {generateError}
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={!unitPlan.subject || !unitPlan.grade || !unitPlan.volume || materialFiles.length === 0 || !unitPlan.textbookVersion || isGenerating}
            className={cn(
              "btn-primary px-8 py-3 rounded-xl font-semibold flex items-center gap-2.5 min-w-[200px] justify-center",
              (!unitPlan.subject || !unitPlan.grade || !unitPlan.volume || materialFiles.length === 0 || !unitPlan.textbookVersion || isGenerating) && "opacity-50 cursor-not-allowed shadow-none hover:shadow-none"
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{loadingStep}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                <span>AI 一键生成分析</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results Section - For PDF Export */}
      {(unitPlan.textbookAnalysis || isGenerating) && (
        <div ref={unitPlanContentRef} className="grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <ResultCard 
            title="单元教材分析" 
            icon={<Book className="h-5 w-5 text-brand-500" />}
            content={unitPlan.textbookAnalysis} 
            loading={isGenerating} 
            placeholder="从学科本质属性出发，深入研读课程标准与统编教材。系统梳理单元知识结构，把握编者意图，挖掘教材的育人内涵与核心教学价值。"
            onUpdate={(val) => updateUnitPlan({ textbookAnalysis: val })}
          />
          <ResultCard 
            title="单元学情分析" 
            icon={<FileText className="h-5 w-5 text-purple-500" />}
            content={unitPlan.studentAnalysis} 
            loading={isGenerating} 
            placeholder="通过预学检测、访谈调查、课堂观察等途径，精准研判学生已有的知识基础、认知能力、生活经验以及潜在的学习困难或认知障碍。"
            onUpdate={(val) => updateUnitPlan({ studentAnalysis: val })}
          />
          <ResultCard 
            title="单元核心知识" 
            icon={<Sparkles className="h-5 w-5 text-amber-500" />}
            content={unitPlan.coreKnowledge} 
            loading={isGenerating} 
            className="col-span-2"
            placeholder="借助单元导语、课后思考题等，提取单元核心概念。建议通过时间轴、思维导图或逻辑框架图等形式整体建构单元知识框架。"
            onUpdate={(val) => updateUnitPlan({ coreKnowledge: val })}
          />
          <ResultCard 
            title="单元学习目标" 
            icon={<CheckCircle className="h-5 w-5 text-green-500" />}
            content={unitPlan.unitObjectives} 
            loading={isGenerating} 
            placeholder="依据课程标准确定单元整体学习目标。要求采用“目标+评价证据”的对应形式。"
            onUpdate={(val) => updateUnitPlan({ unitObjectives: val })}
          />
          <ResultCard 
            title="评价证据" 
            icon={<CheckCircle className="h-5 w-5 text-blue-500" />}
            content={unitPlan.unitAssessment} 
            loading={isGenerating} 
            placeholder="例：单元纸笔测试卷、思维导图梳理成果、探究报告、项目海报或视频等表现性记录。"
            onUpdate={(val) => updateUnitPlan({ unitAssessment: val })}
          />
           <ResultCard 
            title="单元课时规划" 
            icon={<CalendarIcon className="h-5 w-5 text-indigo-500" />}
            content={unitPlan.unitLessonPlan} 
            loading={isGenerating} 
            className="col-span-2"
            placeholder="基于单元核心知识架构与学习目标，以大观念、大任务或大问题为引领，规划具体的课时安排、逻辑路径及学习活动蓝图。"
            onUpdate={(val) => updateUnitPlan({ unitLessonPlan: val })}
          />
          <ResultCard 
            title="单元作业规划" 
            icon={<CheckCircle className="h-5 w-5 text-emerald-500" />}
            content={unitPlan.unitHomeworkPlan} 
            loading={isGenerating} 
            className="col-span-2"
            placeholder="统筹基础性作业、拓展性作业以及实践性作业，促进知识深度理解与迁移。"
            onUpdate={(val) => updateUnitPlan({ unitHomeworkPlan: val })}
          />
          <ResultCard 
            title="单元教学反思" 
            icon={<FileText className="h-5 w-5 text-rose-500" />}
            content={unitPlan.unitReflection} 
            loading={isGenerating} 
            placeholder="围绕目标达成度、核心知识建构、学生实践能力等方面进行反思。"
            onUpdate={(val) => updateUnitPlan({ unitReflection: val })}
          />
          <ResultCard 
            title="个别辅导对象" 
            icon={<FileText className="h-5 w-5 text-slate-500" />}
            content={unitPlan.individualGuidance} 
            loading={isGenerating} 
            placeholder="基于学情及教学反馈，确定个别辅导对象及具体内容。"
            onUpdate={(val) => updateUnitPlan({ individualGuidance: val })}
          />
        </div>
      )}



      {showCompactProgress && !isUnitAiPanelOpen && (
      <div className="fixed left-4 bottom-24 md:bottom-6 z-30 bg-white/95 backdrop-blur-sm border border-brand-100 rounded-xl shadow-lg px-3 py-3 w-52">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-700">实时进度</span>
          <span className="text-xs text-brand-700 font-semibold">{progressPercent}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          当前待完成：{progressSteps.find((s) => !s.done)?.label || '已全部完成'}
        </div>
      </div>
      )}

      <button
        data-guide="unit-ai-open"
        onClick={() => setIsUnitAiPanelOpen((v) => !v)}
        className="fixed right-8 bottom-8 w-14 h-14 bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-30"
        title="打开 AI 助手"
      >
        <MessageCircle className="h-6 w-6" />
        {isUnitChatLoading && <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white animate-pulse" />}
      </button>

      {isUnitAiPanelOpen && (
        <div className={unitPanelClass}>
          <div className="h-14 border-b border-gray-100 flex items-center justify-between px-5 bg-white">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Bot className="h-5 w-5 text-brand-600" />
              AI 助手
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsUnitAiMaximized((v) => !v)}
                className="p-1 rounded-md hover:bg-gray-100 text-slate-500 hover:text-slate-800 transition-colors"
                title={isUnitAiMaximized ? '还原窗口' : '放大窗口'}
              >
                {isUnitAiMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setIsUnitAiPanelOpen(false)}
                className="p-1 rounded-md hover:bg-gray-100 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/40">
            {unitChatHistory.map((msg, idx) => (
              <div key={idx} className={cn("flex gap-3", msg.role === 'user' ? "justify-end" : "justify-start")}>
                {msg.role === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center mt-1">
                    <Bot className="h-4 w-4 text-brand-600" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[78%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words",
                  msg.role === 'user' ? "bg-brand-600 text-white rounded-br-md" : "bg-white border border-gray-100 text-slate-700 rounded-bl-md"
                )}>
                  <MarkdownText content={msg.content} className="space-y-1" />
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center mt-1">
                    <User className="h-4 w-4 text-slate-600" />
                  </div>
                )}
              </div>
            ))}
            {isUnitChatLoading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center mt-1">
                  <Bot className="h-4 w-4 text-brand-600" />
                </div>
                <div className="bg-white border border-gray-100 px-4 py-2.5 rounded-2xl rounded-bl-md">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                </div>
              </div>
            )}
            <div ref={unitChatEndRef} />
          </div>
          <div className="p-4 border-t border-gray-100 bg-white">
            <input
              ref={unitAssetInputRef}
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx,image/*,.txt,.md,.markdown,.json,.csv"
              className="hidden"
              onChange={handleUnitAssetUpload}
            />
            {(isUnitAssetParsing || unitAssetText) && (
              <div className="mb-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                {isUnitAssetParsing ? (
                  <div className="text-xs text-slate-600 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在进行 OCR 解析...
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-600">已解析素材：{unitAssetName}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-2">{unitAssetText.slice(0, 140)}</div>
                    <button
                      onClick={quoteUnitAssetToInput}
                      className="text-xs px-2 py-1 rounded-md bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100 flex items-center gap-1"
                    >
                      <Quote className="h-3 w-3" />
                      一键引用到对话
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="mb-3 grid grid-cols-12 gap-2">
              <select
                value={unitReviseTarget}
                onChange={(e) => setUnitReviseTarget(e.target.value as typeof unitReviseTarget)}
                className="col-span-4 text-xs px-2 py-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value="global">全局优化</option>
                <option value="textbookAnalysis">教材分析</option>
                <option value="studentAnalysis">学情分析</option>
                <option value="coreKnowledge">核心知识</option>
                <option value="unitObjectives">学习目标</option>
                <option value="unitAssessment">评价证据</option>
                <option value="unitLessonPlan">课时规划</option>
                <option value="unitHomeworkPlan">作业规划</option>
                <option value="unitReflection">教学反思</option>
                <option value="individualGuidance">个别辅导</option>
              </select>
              <input
                value={unitReviseInstruction}
                onChange={(e) => setUnitReviseInstruction(e.target.value)}
                className="col-span-6 text-xs px-2 py-2 border border-slate-200 rounded-lg"
                placeholder="输入二次优化要求（局部/全局）"
              />
              <button
                onClick={handleUnitAiRevise}
                disabled={!unitReviseInstruction.trim() || isUnitChatLoading}
                className="col-span-2 text-xs px-2 py-2 bg-slate-900 text-white rounded-lg disabled:bg-slate-300"
              >
                二次优化
              </button>
            </div>
            <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={enableUnitWebSearch}
                onChange={(e) => setEnableUnitWebSearch(e.target.checked)}
              />
              启用联网检索增强回答
            </label>
              <button
                onClick={() => setShowUnitDebugDrawer((v) => !v)}
                className="mb-2 text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                {showUnitDebugDrawer ? '收起联网调试' : '展开联网调试'}
              </button>
              {showUnitDebugDrawer && (
                <div className="mb-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-2">
                  <div className="font-semibold text-slate-700">本次联网调试</div>
                  <div>来源通道：{webSearchSettings.lastStats?.provider || '无'}</div>
                  <div>命中/过滤/使用：{webSearchSettings.lastStats?.allowedCount || 0}/{webSearchSettings.lastStats?.filteredCount || 0}/{webSearchSettings.lastStats?.usedCount || 0}</div>
                  <div className="font-semibold text-slate-700">命中 URL 与正文前 200 字</div>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {(webSearchSettings.lastStats?.usedItems || []).map((it, idx) => (
                      <div key={`${it.url}-${idx}`} className="p-2 bg-white border rounded">
                        <div className="text-slate-700">{it.url}</div>
                        <div className="text-slate-500 mt-1">{it.evidencePreview || '无正文抓取'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="font-semibold text-slate-700">被过滤原因</div>
                  <div className="space-y-1 max-h-32 overflow-auto">
                    {(webSearchSettings.lastStats?.filteredItems || []).map((it, idx) => (
                      <div key={`${it.url}-${idx}`} className="p-2 bg-white border rounded text-slate-600">{it.url} · {it.reason}</div>
                    ))}
                  </div>
                </div>
              )}
            <div className="flex gap-2">
              <input
                type="text"
                value={unitChatInput}
                onChange={(e) => setUnitChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleUnitChatSend();
                  }
                }}
                placeholder="请输入你的问题..."
                className="flex-1 px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
              />
              <button
                onClick={() => unitAssetInputRef.current?.click()}
                className="w-10 h-10 bg-white border border-gray-200 hover:bg-brand-50 text-slate-600 hover:text-brand-700 rounded-lg flex items-center justify-center transition-colors"
                title="上传图片/PDF做OCR"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                onClick={handleUnitChatSend}
                disabled={!unitChatInput.trim() || isUnitChatLoading}
                className="w-10 h-10 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white rounded-lg flex items-center justify-center transition-colors"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {showTemplatePreview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-8 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden relative">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="h-5 w-5 text-brand-600" />
                        单元教学备课模板预览
                    </h3>
                    <button 
                        onClick={() => setShowTemplatePreview(false)}
                        className="p-2 bg-white hover:bg-gray-100 rounded-full transition-colors text-slate-500 hover:text-slate-800 border border-gray-200 shadow-sm"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-12 bg-slate-100 flex justify-center">
                    {/* Mock Template Document */}
                    <div className="w-[210mm] min-h-[297mm] bg-white shadow-lg p-[20mm] text-slate-800 font-serif">
                        <div className="text-center font-bold text-xl mb-8">2025学年第二学期[填写具体学科]单元教学备课表</div>
                        <div className="text-center mb-4">____年级 ____册 单元名称：____________________ 总课时数：____</div>
                         <div className="text-right mb-4">设计者：__________</div>
                        
                        <div className="border border-black text-sm">
                            {/* Header */}
                            <div className="flex border-b border-black bg-gray-100 font-bold text-center">
                                <div className="w-24 p-2 border-r border-black flex items-center justify-center">模块</div>
                                <div className="flex-1 p-2 flex items-center justify-center">具体内容</div>
                            </div>

                            {/* Row 1: 单元教材分析 */}
                            <div className="flex border-b border-black">
                                <div className="w-24 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50">单元<br/>教材<br/>分析</div>
                                <div className="flex-1 p-2 text-gray-500 italic">
                                    （填写说明：从学科本质属性出发，深入研读课程标准与统编教材。系统梳理单元知识结构，把握编者意图，挖掘教材的育人内涵与核心教学价值。）
                                </div>
                            </div>

                             {/* Row 2: 学情分析 */}
                            <div className="flex border-b border-black">
                                <div className="w-24 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50">学情<br/>分析</div>
                                <div className="flex-1 p-2 text-gray-500 italic">
                                    （填写说明：通过预学检测、访谈调查、课堂观察等途径，精准研判学生已有的知识基础、认知能力、生活经验以及潜在的学习困难或认知障碍。）
                                </div>
                            </div>

                             {/* Row 3: 单元核心知识 */}
                            <div className="flex border-b border-black">
                                <div className="w-24 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50">单元<br/>核心<br/>知识</div>
                                <div className="flex-1 p-2 text-gray-500 italic">
                                    （填写说明：借助单元导语、课后思考题等，提取单元核心概念。建议通过时间轴、思维导图或逻辑框架图（如地理的“地理要素—时空联系—人地关系”）等形式整体建构单元知识框架。）
                                </div>
                            </div>

                             {/* Row 4: 单元学习目标 */}
                            <div className="flex border-b border-black">
                                <div className="w-24 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50">单元<br/>学习<br/>目标</div>
                                <div className="flex-1 p-2">
                                    <div className="text-gray-500 italic mb-2">
                                    （填写说明：依据课程标准确定单元整体学习目标。部分学科（如科学、语文、英语、道德与法治）要求采用“目标+评价证据”的对应形式。）
                                    </div>
                                    <div className="font-bold">单元学习目标：</div>
                                    <div>1. </div>
                                    <div>2. </div>
                                    <div>3. </div>
                                    <div className="font-bold mt-2">评价证据：</div>
                                    <div className="text-gray-500 italic">（例：单元纸笔测试卷、思维导图梳理成果、探究报告、项目海报或视频等表现性记录。）</div>
                                </div>
                            </div>

                             {/* Row 5: 单元课时规划 */}
                            <div className="flex border-b border-black">
                                <div className="w-24 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50">单元<br/>课时<br/>规划</div>
                                <div className="flex-1 p-2 text-gray-500 italic">
                                    （填写说明：基于单元核心知识架构与学习目标，以大观念、大任务或大问题为引领，规划具体的课时安排、逻辑路径及学习活动蓝图。）
                                </div>
                            </div>

                            {/* Row 6: 单元作业规划 */}
                            <div className="flex border-b border-black">
                                <div className="w-24 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50">单元<br/>作业<br/>规划</div>
                                <div className="flex-1 p-2 text-gray-500 italic">
                                    （填写说明：基于单元整体学习设计，统筹规划基础性作业、拓展性作业以及指向大项目、大任务的实践性作业，促进知识的深度理解与迁移。）
                                </div>
                            </div>

                             {/* Row 7: 单元教学反思 */}
                            <div className="flex border-b border-black">
                                <div className="w-24 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50">单元<br/>教学<br/>反思</div>
                                <div className="flex-1 p-2 text-gray-500 italic">
                                    （填写说明：结合班级具体教学实践与单元评价结果，围绕目标达成度、核心知识建构、学生实践能力等方面进行课后反思。）
                                </div>
                            </div>

                             {/* Row 8: 个别辅导对象 */}
                            <div className="flex">
                                <div className="w-24 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50">个别<br/>辅导<br/>对象</div>
                                <div className="flex-1 p-2 text-gray-500 italic">
                                    （填写说明：部分文科学科（如语文、道德与法治）特有。基于学情及教学反馈，确定个别辅导对象及具体的辅导内容。）（可选）
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ title, icon, content, loading, className, placeholder, onUpdate }: { title: string, icon: React.ReactNode, content: string, loading: boolean, className?: string, placeholder?: string, onUpdate?: (val: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);

  // Sync editValue when content updates (e.g. from AI generation)
  React.useEffect(() => {
    setEditValue(content);
  }, [content]);

  const handleSave = () => {
    onUpdate?.(editValue);
    setIsEditing(false);
  };

  return (
    <div className={cn("bg-white p-6 rounded-3xl shadow-soft border border-gray-100 flex flex-col h-full transition-all hover:shadow-soft-lg group", className)}>
      <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-3">
        <div className="p-2 bg-gray-50 rounded-lg border border-gray-100">
            {icon}
        </div>
        {title}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-300 ml-auto" />}
        {!loading && content && !isEditing && (
             <button 
                onClick={() => setIsEditing(true)}
                className="ml-auto text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded hover:bg-brand-50 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100"
            >
                修改
            </button>
        )}
      </h4>
      <div className="flex-1">
        {loading ? (
          <div className="space-y-3 animate-pulse py-2">
            <div className="h-2.5 bg-gray-100 rounded-full w-full"></div>
            <div className="h-2.5 bg-gray-100 rounded-full w-[95%]"></div>
            <div className="h-2.5 bg-gray-100 rounded-full w-[90%]"></div>
            <div className="h-2.5 bg-gray-100 rounded-full w-[80%]"></div>
          </div>
        ) : isEditing ? (
            <div className="flex flex-col gap-2 h-full">
                <textarea 
                    className="w-full flex-1 min-h-[140px] p-4 text-sm leading-relaxed text-slate-600 bg-white border-2 border-brand-200 rounded-xl focus:border-brand-500 focus:ring-4 focus:ring-brand-50 transition-all resize-none outline-none"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder={placeholder}
                    autoFocus
                />
                <div className="flex justify-end gap-2">
                    <button 
                        onClick={() => { setIsEditing(false); setEditValue(content); }}
                        className="text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleSave}
                        className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium"
                    >
                        确认修改
                    </button>
                </div>
            </div>
        ) : (
          <div 
            className="w-full h-full min-h-[140px] p-4 text-sm leading-relaxed text-slate-600 bg-gray-50/50 border border-gray-200 rounded-xl whitespace-pre-wrap cursor-pointer hover:border-brand-300 transition-colors"
            onClick={() => setIsEditing(true)}
            title="点击修改"
          >
            {content || <span className="text-slate-300 italic">{placeholder}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
