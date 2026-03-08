import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { useApp } from '../lib/useApp';
import { Bot, User, FileText, Download, Loader2, Sparkles, Eye, X, MessageCircle, Paperclip, Quote, ArrowRight, Maximize2, Minimize2, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { type DetailedLesson } from '../lib/types';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun, ImageRun, Header, Footer, AlignmentType, BorderStyle, PageNumber } from 'docx';
import { saveAs } from 'file-saver';
import { buildWebGrounding, chatCompletion, generateDetailedLessonAI, updateDetailedLessonAI } from '../lib/ai';
import { buildTextbookSignals, extractTeachingMaterialText, extractTextbookStructure } from '../lib/textbook';
import { buildTemplateContext } from '../lib/textbookTemplates';
import { generatePptPrompt, loadPromptVersions, savePromptVersion, type PptLanguageMode, type PptTool, type PromptVersion } from '../lib/pptPrompts';
import { MarkdownText } from '../components/MarkdownText';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export function DetailedDesigner() {
  const { unitPlan, detailedLessons, updateDetailedLesson, aiProvider, selectedModel, apiKey, aiParameters, ocrEndpoint, ocrApiKey, logoDataUrl, webSearchSettings, setWebSearchSettings } = useApp();
  const [selectedLessonId, setSelectedLessonId] = useState<string>('');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([
    { role: 'ai', content: '你好！我是你的 AI 备课助手 🎉\n\n我可以帮你：\n• 直接生成课时教学设计（选择课时后点击"AI 生成设计"）\n• 随时回答教学相关问题\n• 根据你的想法优化设计\n\n不用拘束，有任何教学设计的想法都可以直接告诉我！' }
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [reviseTarget, setReviseTarget] = useState<'global' | 'coreContent' | 'studentAnalysis' | 'keyPoints' | 'difficultPoints' | 'preLearning' | 'inClass' | 'postLearning' | 'boardDesign' | 'reflection'>('global');
  const [reviseInstruction, setReviseInstruction] = useState('');
  const [structuredActivityId, setStructuredActivityId] = useState('');
  
  // Template Preview State
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);
  const [lessonPrecheck, setLessonPrecheck] = useState<{ level: 'success' | 'warn'; text: string } | null>(null);
  const [historyByLesson, setHistoryByLesson] = useState<Record<string, Array<{
    id: string;
    label: string;
    createdAt: number;
    lesson: DetailedLesson;
  }>>>({});
  const [isAssetParsing, setIsAssetParsing] = useState(false);
  const [assetOcrText, setAssetOcrText] = useState('');
  const [assetName, setAssetName] = useState('');
  const [recentAssets, setRecentAssets] = useState<Array<{ name: string; text: string; at: number }>>([]);
  
  // Lesson Specific Material State
  const [lessonMaterialFile, setLessonMaterialFile] = useState<File | null>(null);
  const [lessonMaterialText, setLessonMaterialText] = useState('');
  const [isParsingLessonMaterial, setIsParsingLessonMaterial] = useState(false);
  
  // AI Assistant collapsible state
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isAiMaximized, setIsAiMaximized] = useState(false);
  const [showDebugDrawer, setShowDebugDrawer] = useState(false);
  const [showPptPromptPanel, setShowPptPromptPanel] = useState(false);
  const [pptMode, setPptMode] = useState<PptLanguageMode>('zh-to-zh');
  const [pptTool, setPptTool] = useState<PptTool>('wps');
  const [pptPromptText, setPptPromptText] = useState('');
  const [copied, setCopied] = useState(false);
  const [promptHistory, setPromptHistory] = useState<Record<string, PromptVersion[]>>({});
  
  // PDF Export Ref
  const lessonContentRef = useRef<HTMLDivElement>(null);
  
  // Ref to scroll chat to bottom
  const chatEndRef = useRef<HTMLDivElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    const saved = localStorage.getItem('detailedChatHistory');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { role: 'user' | 'ai'; content: string }[];
      if (Array.isArray(parsed) && parsed.length > 0) setChatHistory(parsed);
    } catch {
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('detailedChatHistory', JSON.stringify(chatHistory.slice(-60)));
  }, [chatHistory]);

  useEffect(() => {
    setPromptHistory(loadPromptVersions());
  }, []);

  const availableLessons = unitPlan.schedule.filter((lesson) => lesson.isConfirmed);
  const currentLesson = availableLessons.find(l => l.id === selectedLessonId);
  const detailedData = detailedLessons[selectedLessonId];
  const materialFiles = unitPlan.textbookFiles && unitPlan.textbookFiles.length > 0
    ? unitPlan.textbookFiles
    : (unitPlan.textbookFile ? [unitPlan.textbookFile] : []);
  const subjectLessonTypesMap: Record<string, string[]> = {
    chinese: ['阅读课', '写作指导课', '阅读综合实践课', '专题学习活动课', '活动探究课', '单元整理课', '专题复习课'],
    math: ['新授课', '概念课', '探究课', '习题课', '讲评课', '复习课'],
    english: ['听说课', '阅读课', '语法课', '写作课', '复习课', '综合实践课'],
    science: ['实验探究课', '概念建构课', '探究课', '讲评课', '复习课', '综合实践课'],
    society: ['道法探究课', '历史探究课', '地理综合课', '讲评课', '复习课', '综合实践课']
  };
  const templateContext = useMemo(() => buildTemplateContext({
    subject: unitPlan.subject,
    grade: unitPlan.grade || '',
    textbookVersion: unitPlan.textbookVersion || '',
    volume: unitPlan.volume || ''
  }), [unitPlan.subject, unitPlan.grade, unitPlan.textbookVersion, unitPlan.volume]);
  const getTodayLabel = () => {
    const now = new Date();
    const weekNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}年${m}月${d}日（${weekNames[now.getDay()]}）`;
  };
  const isDateQuestion = (text: string) => /(今天|当前|现在).*(几号|日期|星期)|今天.*(哪天|周几)|^\s*(今天|日期|现在时间)\s*[?？]?\s*$/.test(text);

  useEffect(() => {
    if (unitPlan.subject !== 'english' && pptMode !== 'zh-to-zh') {
      setPptMode('zh-to-zh');
    }
  }, [unitPlan.subject, pptMode]);

  useEffect(() => {
    if (!selectedLessonId) return;
    const exists = availableLessons.some((lesson) => lesson.id === selectedLessonId);
    if (!exists) setSelectedLessonId('');
  }, [availableLessons, selectedLessonId]);

  useEffect(() => {
    if (!selectedLessonId || !detailedData) return;
    const hasHistory = (historyByLesson[selectedLessonId] || []).length > 0;
    if (hasHistory) return;
    createSnapshot(selectedLessonId, '初始版本', detailedData);
  }, [selectedLessonId, detailedData, historyByLesson]);

  useEffect(() => {
    if (!detailedData?.inClass?.length) return;
    if (!structuredActivityId || !detailedData.inClass.some((a) => a.id === structuredActivityId)) {
      setStructuredActivityId(detailedData.inClass[0].id);
    }
  }, [detailedData, structuredActivityId]);

  const parseStartDate = () => {
    if (!unitPlan.termStartDate) return null;
    const [year, month, day] = unitPlan.termStartDate.split('-').map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  const formatLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const calcLessonDate = (lessonDay: number) => {
    const base = parseStartDate();
    if (!base) return '';
    const date = new Date(base);
    date.setDate(base.getDate() + lessonDay - 1);
    return formatLocalDate(date);
  };

  const calcWeekDay = (lessonDay: number) => {
    const base = parseStartDate();
    if (!base) return '';
    const date = new Date(base);
    date.setDate(base.getDate() + lessonDay - 1);
    const weekNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return weekNames[date.getDay()];
  };

  const getPlannedLessonDate = () => {
    const day = currentLesson?.day;
    if (!day) return '';
    return calcLessonDate(day);
  };

  const getPlannedWeekDay = () => {
    const day = currentLesson?.day;
    if (!day) return '';
    return calcWeekDay(day);
  };
  const normalizeKeyDiff = (keyRaw: string, diffRaw: string) => {
    const keyLines = keyRaw.split('\n').map((x) => x.trim()).filter(Boolean);
    const diffLines = diffRaw.split('\n').map((x) => x.trim()).filter(Boolean);
    const movedToDiff = keyLines.filter((line) => /(教学难点|难点|难于|困难)/.test(line));
    const keptKey = keyLines.filter((line) => !/(教学难点|难点|难于|困难)/.test(line));
    const movedToKey = diffLines.filter((line) => /(教学重点|重点|关键)/.test(line) && !/(教学难点|难点)/.test(line));
    const keptDiff = diffLines.filter((line) => !(/(教学重点|重点|关键)/.test(line) && !/(教学难点|难点)/.test(line)));
    return {
      keyPoints: [...keptKey, ...movedToKey].join('\n'),
      difficultPoints: [...keptDiff, ...movedToDiff].join('\n')
    };
  };
  const ensureDifficultPoints = (raw: string, keyPoints: string, coreContent: string, lessonTitle: string) => {
    const current = raw.split('\n').map((x) => x.trim()).filter(Boolean);
    if (current.length >= 3) return current.join('\n');
    const seeds = Array.from(new Set([
      ...keyPoints.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3),
      ...coreContent.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3)
    ])).slice(0, 4);
    const fallback = seeds.length > 0 ? seeds.map((line, idx) => `难点${idx + 1}：${line}；支架：通过示例拆解与分层任务逐步突破。`) : [
      `难点1：${lessonTitle}中的关键概念迁移应用；支架：先例后练，提供句式与步骤卡。`,
      `难点2：学生易混点辨析；支架：对比例证与错因纠偏。`,
      `难点3：综合表达与任务达成；支架：提供评价量规与同伴互评。`
    ];
    return fallback.join('\n');
  };
  const buildLessonScopedTextbook = (content: string, lessonTitle: string) => {
    const chunks = content.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    const hit = chunks
      .map((chunk, idx) => ({ chunk, idx, score: chunk.includes(lessonTitle) ? 3 : /(第.|单元|主题|任务|活动)/.test(chunk) ? 1 : 0 }))
      .sort((a, b) => (b.score === a.score ? a.idx - b.idx : b.score - a.score))
      .slice(0, 12)
      .map((x) => x.chunk)
      .join('\n\n');
    return hit || content.slice(0, 20000);
  };
  const displayDate = getPlannedLessonDate() || detailedData?.date || '';
  const patchLesson = (patch: Partial<DetailedLesson>) => {
    if (!selectedLessonId || !detailedData) return;
    updateDetailedLesson(selectedLessonId, { ...detailedData, ...patch });
  };

  const patchObjective = (idx: number, key: 'content' | 'assessment', value: string) => {
    if (!selectedLessonId || !detailedData) return;
    const objectives = detailedData.objectives.map((o, i) => i === idx ? { ...o, [key]: value } : o);
    updateDetailedLesson(selectedLessonId, { ...detailedData, objectives });
  };

  const patchInClass = (id: string, key: 'title' | 'studentTask' | 'teacherGuidance' | 'evaluation' | 'designIntent', value: string) => {
    if (!selectedLessonId || !detailedData) return;
    const inClass = detailedData.inClass.map((a) => a.id === id ? { ...a, [key]: value } : a);
    updateDetailedLesson(selectedLessonId, { ...detailedData, inClass });
  };
  const addInClassActivity = () => {
    if (!selectedLessonId || !detailedData) return;
    const nextId = `${Date.now()}`;
    const inClass = [...detailedData.inClass, { id: nextId, title: `活动${detailedData.inClass.length + 1}`, studentTask: '', teacherGuidance: '', evaluation: '', designIntent: '' }];
    updateDetailedLesson(selectedLessonId, { ...detailedData, inClass });
    setStructuredActivityId(nextId);
  };
  const removeInClassActivity = (id: string) => {
    if (!selectedLessonId || !detailedData || detailedData.inClass.length <= 1) return;
    const inClass = detailedData.inClass.filter((a) => a.id !== id);
    updateDetailedLesson(selectedLessonId, { ...detailedData, inClass });
    setStructuredActivityId(inClass[0]?.id || '');
  };
  const activeActivity = detailedData?.inClass.find((a) => a.id === structuredActivityId) || detailedData?.inClass[0];
  const displayWeekDay = getPlannedWeekDay() || detailedData?.weekDay || '';


  const getLessonPrecheckIssues = (lesson: DetailedLesson) => {
    const issues: string[] = [];
    if (!lesson.topic.trim()) issues.push('课题为空');
    if (!lesson.coreContent.trim()) issues.push('核心内容为空');
    if (!lesson.keyPoints.trim()) issues.push('教学重点为空');
    if (!lesson.difficultPoints.trim()) issues.push('教学难点为空');
    if (!lesson.objectives.length || lesson.objectives.some((o) => !o.content.trim() || !o.assessment.trim())) issues.push('目标与评价未完整填写');
    if (!lesson.inClass.length) issues.push('课中议学活动为空');
    if (!lesson.postLearning.homeworkBasic.trim()) issues.push('基础作业为空');
    if (!lesson.postLearning.homeworkExtension.trim()) issues.push('拓展作业为空');
    return issues;
  };

  const runLessonPrecheck = (lesson: DetailedLesson) => {
    const issues = getLessonPrecheckIssues(lesson);
    if (issues.length === 0) {
      setLessonPrecheck({ level: 'success', text: '预检通过：课时设计完整，可导出。' });
      return true;
    }
    setLessonPrecheck({ level: 'warn', text: `预检发现 ${issues.length} 项：${issues.join('；')}` });
    return false;
  };

  const createSnapshot = (lessonId: string, label: string, lesson: DetailedLesson) => {
    setHistoryByLesson((prev) => {
      const list = prev[lessonId] || [];
      const snapshot = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label,
        createdAt: Date.now(),
        lesson: JSON.parse(JSON.stringify(lesson)) as DetailedLesson
      };
      return {
        ...prev,
        [lessonId]: [snapshot, ...list].slice(0, 20)
      };
    });
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
      if (dstNode instanceof HTMLTextAreaElement) {
        dstNode.style.display = 'block';
        dstNode.style.height = 'auto';
        dstNode.style.maxHeight = 'none';
        dstNode.style.minHeight = `${Math.max(dstNode.scrollHeight, 80)}px`;
        dstNode.style.overflow = 'visible';
        dstNode.style.whiteSpace = 'pre-wrap';
        dstNode.style.wordBreak = 'break-word';
        dstNode.style.overflowWrap = 'anywhere';
      }
      if (dstNode instanceof HTMLInputElement && dstNode.type === 'text') {
        dstNode.style.display = 'block';
        dstNode.style.height = 'auto';
        dstNode.style.minHeight = '38px';
        dstNode.style.whiteSpace = 'normal';
        dstNode.style.overflow = 'visible';
        dstNode.style.wordBreak = 'break-word';
        dstNode.style.overflowWrap = 'anywhere';
      }
    });
    return { element: clone, cleanup: () => document.body.removeChild(wrap) };
  };

  const handleLessonMaterialUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingLessonMaterial(true);
    setGenerateError('');
    try {
      const text = await extractTeachingMaterialText({ endpoint: ocrEndpoint, file, apiKey: ocrApiKey || undefined });
      setLessonMaterialFile(file);
      setLessonMaterialText(text);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : '素材 OCR 解析失败');
    } finally {
      setIsParsingLessonMaterial(false);
      e.target.value = '';
    }
  };

  const handleGenerateInitial = () => {
    if (!selectedLessonId) return;
    if (!apiKey) {
      setGenerateError('请先在系统设置中填写 API Key');
      return;
    }
    if (materialFiles.length === 0) {
      setGenerateError('请先上传教材素材');
      return;
    }
    setGenerateError('');
    setIsGenerating(true);
    setChatHistory(prev => [...prev, { role: 'user', content: '为这节课生成详细的“三学联网”教学设计' }]);
    
    const standardsMap: Record<string, string> = {
      chinese: "语文教学常规：以学习任务群统整单元，强化语言实践与思维进阶；阅读课突出文本细读与证据表达，写作课突出任务驱动、同伴互评和再修改；评价嵌入过程性表现。",
      math: "数学教学常规：重视“问题情境-抽象建模-推理论证-应用迁移”；概念课强调形成过程，探究课强调猜想验证，习题/讲评课强调错因诊断与变式提升。",
      english: "英语教学常规：遵循“学习理解-应用实践-迁移创新”；听说课突出语音语调与交际任务，阅读课突出语篇结构与信息整合，写作课突出支架与分层反馈。",
      science: "科学教学常规：坚持“提出问题-设计方案-证据收集-解释论证-交流反思”；实验探究课要有变量控制、记录表和安全规范，评价关注证据质量。",
      society: "道法/历史/地理常规：议题式或问题链组织学习，道法强调价值辨析与法治实践，历史强调史料实证与历史解释，地理强调区域认知与人地协调。"
    };
    const subjectNameMap: Record<string, string> = {
      chinese: '语文',
      math: '数学',
      english: '英语',
      science: '科学',
      society: '社会'
    };
    const subjectName = subjectNameMap[unitPlan.subject] || '学科';
    const textbookName = `${materialFiles[0]?.name || '教材'}${materialFiles.length > 1 ? ` +${materialFiles.length - 1}个素材` : ''}${unitPlan.volume ? `（${unitPlan.volume}）` : ''}${unitPlan.textbookVersion ? `-${unitPlan.textbookVersion}` : ''}`;
    const unitTitle = unitPlan.schedule[0]?.topic || '本单元';
    const standards = `${standardsMap[unitPlan.subject] || '核心素养导向'}\n课型要求：${(subjectLessonTypesMap[unitPlan.subject] || []).join('、')}`;
    const lessonTitle = currentLesson?.topic || unitTitle;
    const lessonType = currentLesson?.type || (subjectLessonTypesMap[unitPlan.subject]?.[0] || '新授课');

    loadAllMaterialText(materialFiles).then((textbookContent) => {
      const scopedTextbook = buildLessonScopedTextbook(textbookContent, lessonTitle);
      const signals = buildTextbookSignals(
        scopedTextbook,
        unitPlan.schedule[0]?.topic || '本单元',
        unitPlan.coreKnowledge || '',
        unitPlan.unitObjectives || ''
      );
      const structureText = extractTextbookStructure(scopedTextbook, 80).join('\n');
      
      const additionalMaterial = lessonMaterialText 
        ? `\n\n【补充课时素材：${lessonMaterialFile?.name}】\n${lessonMaterialText}` 
        : '';
        
      const enrichedTextbook = [
        unitPlan.textbookVersion ? `教材版本：${unitPlan.textbookVersion}` : '',
        scopedTextbook,
        additionalMaterial,
        signals.tocText ? `教材目录/单元标题:\n${signals.tocText}` : '',
        signals.paraText ? `关键段落:\n${signals.paraText}` : ''
      ].filter(Boolean).join('\n\n');
      
      return generateDetailedLessonAI({
        apiKey,
        provider: aiProvider,
        model: selectedModel,
        subject: subjectName,
        grade: unitPlan.grade || '未知年级',
        textbookName,
        unitTitle,
        lessonTitle,
        lessonType,
        standards,
        unitObjectives: unitPlan.unitObjectives || '',
        unitAssessment: unitPlan.unitAssessment || '',
        coreKnowledge: unitPlan.coreKnowledge || '',
        studentAnalysis: unitPlan.studentAnalysis || '',
        unitHomeworkPlan: unitPlan.unitHomeworkPlan || '',
        textbookContent: enrichedTextbook,
        textbookStructure: structureText,
        textbookTemplate: templateContext,
        aiParameters
      });
    }).then((aiData) => {
      const objectives = (aiData.objectives || []) as { content?: string; assessment?: string }[];
      const inClass = (aiData.inClass || []) as { title?: string; studentTask?: string; teacherGuidance?: string; evaluation?: string; designIntent?: string }[];
      const normalized = normalizeKeyDiff(aiData.keyPoints || '', aiData.difficultPoints || '');
      const ensuredDifficult = ensureDifficultPoints(normalized.difficultPoints, normalized.keyPoints, aiData.coreContent || '', lessonTitle);
      const newLesson: DetailedLesson = {
        lessonId: selectedLessonId,
        date: getPlannedLessonDate() || formatLocalDate(new Date()),
        weekDay: getPlannedWeekDay() || '星期一',
        period: `第${currentLesson?.day || 1}节`,
        type: lessonType,
        targetStudent: aiData.targetStudent || `${unitPlan.grade}年级学生`,
        textbook: aiData.textbook || `${subjectName}${textbookName ? `（${textbookName}）` : ''}`,
        topic: lessonTitle,
        coreContent: aiData.coreContent || '',
        studentAnalysis: aiData.studentAnalysis || '',
        keyPoints: normalized.keyPoints,
        difficultPoints: ensuredDifficult,
        objectives: objectives.map((o, idx) => ({
          id: `${idx + 1}`,
          content: o.content || '',
          assessment: o.assessment || ''
        })),
        preLearning: aiData.preLearning || { studentTask: '', teacherGuidance: '', assessment: '', intent: '' },
        inClass: inClass.map((a, idx) => ({
          id: `${idx + 1}`,
          title: a.title || `活动${idx + 1}`,
          studentTask: a.studentTask || '',
          teacherGuidance: a.teacherGuidance || '',
          evaluation: a.evaluation || '',
          designIntent: a.designIntent || ''
        })),
        postLearning: aiData.postLearning || {
          homeworkBasic: '',
          homeworkExtension: '',
          estimatedTimeBasic: '',
          estimatedTimeExtension: '',
          attributes: { source: [], category: [] }
        },
        boardDesign: aiData.boardDesign || '',
        reflection: aiData.reflection || ''
      };
      updateDetailedLesson(selectedLessonId, newLesson);
      createSnapshot(selectedLessonId, 'AI 初稿生成', newLesson);
      setChatHistory(prev => [...prev, { role: 'ai', content: '已通过 AI 生成初稿，你可以继续提出修改要求。' }]);
    }).catch((err) => {
      setGenerateError(err instanceof Error ? err.message : 'AI 生成失败');
      setChatHistory(prev => [...prev, { role: 'ai', content: 'AI 生成失败，请检查 API Key 或模型配置。' }]);
    }).finally(() => {
      setIsGenerating(false);
    });
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsAssetParsing(true);
    setGenerateError('');
    try {
      const text = await extractTeachingMaterialText({ endpoint: ocrEndpoint, file, apiKey: ocrApiKey || undefined });
      setAssetName(file.name);
      setAssetOcrText(text);
      setRecentAssets((prev) => [{ name: file.name, text, at: Date.now() }, ...prev].slice(0, 5));
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : '素材 OCR 解析失败');
    } finally {
      setIsAssetParsing(false);
      e.target.value = '';
    }
  };

  const quoteAssetToInput = () => {
    if (!assetOcrText) return;
    const quoted = `请结合以下素材片段优化本节课：\n【素材：${assetName}】\n${assetOcrText.slice(0, 1200)}`;
    setChatInput((prev) => (prev ? `${prev}\n\n${quoted}` : quoted));
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    if (!apiKey) {
      setGenerateError('请先在系统设置中填写 API Key');
      return;
    }
    
    const visibleMsg = chatInput.trim();
    const memoryContext = [
      recentAssets.length > 0 ? `最近素材：${recentAssets.map((a) => a.name).join('、')}` : '',
      selectedLessonId ? `当前课时版本：${historyByLesson[selectedLessonId]?.[0]?.label || '初始版本'}` : ''
    ].filter(Boolean).join('\n');
    const assetContext = assetOcrText ? `\n\n【最近OCR素材：${assetName}】\n${assetOcrText.slice(0, 1800)}` : '';
    const userMsg = `${visibleMsg}${assetContext}${memoryContext ? `\n\n【多模态上下文】\n${memoryContext}` : ''}`;
    setChatHistory(prev => [...prev, { role: 'user', content: visibleMsg }]);
    setChatInput('');
    if (isDateQuestion(visibleMsg)) {
      setChatHistory((prev) => [...prev, { role: 'ai', content: `今天是 ${getTodayLabel()}。` }]);
      return;
    }
    setIsGenerating(true);
    setChatHistory((prev) => [...prev, { role: 'ai', content: '⏳ 正在联网检索并生成回答…' }]);

    const subjectNameMap: Record<string, string> = {
      chinese: '语文',
      math: '数学',
      english: '英语',
      science: '科学',
      society: '社会'
    };
    const subjectName = subjectNameMap[unitPlan.subject] || '学科';
    const textbookName = `${materialFiles[0]?.name || '教材'}${materialFiles.length > 1 ? ` +${materialFiles.length - 1}个素材` : ''}${unitPlan.volume ? `（${unitPlan.volume}）` : ''}${unitPlan.textbookVersion ? `-${unitPlan.textbookVersion}` : ''}`;
    const unitTitle = unitPlan.schedule[0]?.topic || '本单元';
    const standardsMap: Record<string, string> = {
      chinese: "语文教学常规：任务群统整单元，读写联动，过程评价前置。",
      math: "数学教学常规：问题驱动、推理建模、错因诊断、变式提升。",
      english: "英语教学常规：学习理解-应用实践-迁移创新，强调语篇与交际。",
      science: "科学教学常规：问题-假设-探究-证据-解释-交流闭环。",
      society: "道法/历史/地理常规：议题/问题链推进，证据支撑观点。"
    };
    const standards = `${standardsMap[unitPlan.subject] || '核心素养导向'}\n课型要求：${(subjectLessonTypesMap[unitPlan.subject] || []).join('、')}`;
    const lessonTitle = currentLesson?.topic || unitTitle;
    const lessonType = currentLesson?.type || (subjectLessonTypesMap[unitPlan.subject]?.[0] || '新授课');
    const context = [
      `学科：${subjectName}`,
      `年级：${unitPlan.grade || '未选择'}`,
      `册别：${unitPlan.volume || '未选择'}`,
      `教材版本：${unitPlan.textbookVersion || '未选择'}`,
      `课时：${lessonTitle}`,
      `课型：${lessonType}`,
      `课程标准：${standards}`,
      `单元目标：${unitPlan.unitObjectives || '无'}`,
      `核心知识：${unitPlan.coreKnowledge || '无'}`
    ].join('\n');
    const run = async () => {
      const searchResult = enableWebSearch
        ? await buildWebGrounding(`${subjectName} ${userMsg}`, {
          strictMode: webSearchSettings.strictMode,
          allowedDomains: webSearchSettings.allowedDomains
        })
        : { items: [], grounding: '', stats: { provider: 'disabled', query: userMsg, totalFetched: 0, allowedCount: 0, filteredCount: 0, usedCount: 0 } };
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
          { role: 'system', content: `你是课时备课助手，请结合上下文给出可执行建议，必要时提供可直接粘贴到表单的内容。当前真实日期：${getTodayLabel()}。若提供了“联网检索参考/联网证据正文”，必须优先基于这些证据回答，且不得说“无法联网/无法查询实时信息”。` },
          { role: 'user', content: `当前备课上下文：\n${context}\n\n教材素材：${textbookName}\n\n用户问题：${userMsg}${grounding}${citationGuide}` }
        ],
        temperature: 0.7
      });
      return { content, search, stats: searchResult.stats };
    };
    run().then(({ content, search, stats }) => {
      if (enableWebSearch) {
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
        : (enableWebSearch ? '\n\n参考来源：未命中白名单来源，可在系统设置放宽规则或补充来源域名。' : '');
      setChatHistory((prev) => {
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
      setChatHistory((prev) => {
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
      setIsGenerating(false);
    });
  };

  const handleAiRevise = async () => {
    if (!detailedData || !apiKey || !reviseInstruction.trim()) return;
    setIsGenerating(true);
    try {
      if (reviseTarget === 'global') {
        const aiData = await updateDetailedLessonAI({
          apiKey,
          provider: aiProvider,
          model: selectedModel,
          lessonJson: JSON.stringify(detailedData, null, 2),
          instruction: `${reviseInstruction}\n请严格遵循教材版本结构模板：\n${templateContext}`
        });
        const objectives = (aiData.objectives || detailedData.objectives || []) as { content?: string; assessment?: string }[];
        const inClass = (aiData.inClass || detailedData.inClass || []) as { title?: string; studentTask?: string; teacherGuidance?: string; evaluation?: string; designIntent?: string }[];
        const normalized = normalizeKeyDiff(aiData.keyPoints || detailedData.keyPoints, aiData.difficultPoints || detailedData.difficultPoints);
        const ensuredDifficult = ensureDifficultPoints(normalized.difficultPoints, normalized.keyPoints, aiData.coreContent || detailedData.coreContent, detailedData.topic);
        patchLesson({
          coreContent: aiData.coreContent || detailedData.coreContent,
          studentAnalysis: aiData.studentAnalysis || detailedData.studentAnalysis,
          keyPoints: normalized.keyPoints,
          difficultPoints: ensuredDifficult,
          objectives: objectives.map((o, idx) => ({ id: `${idx + 1}`, content: o.content || '', assessment: o.assessment || '' })),
          preLearning: aiData.preLearning || detailedData.preLearning,
          inClass: inClass.map((a, idx) => ({ id: `${idx + 1}`, title: a.title || `活动${idx + 1}`, studentTask: a.studentTask || '', teacherGuidance: a.teacherGuidance || '', evaluation: a.evaluation || '', designIntent: a.designIntent || '' })),
          postLearning: aiData.postLearning || detailedData.postLearning,
          boardDesign: aiData.boardDesign || detailedData.boardDesign,
          reflection: aiData.reflection || detailedData.reflection
        });
      } else if (reviseTarget === 'preLearning' || reviseTarget === 'postLearning' || reviseTarget === 'inClass') {
        const aiData = await updateDetailedLessonAI({
          apiKey,
          provider: aiProvider,
          model: selectedModel,
          lessonJson: JSON.stringify(detailedData, null, 2),
          instruction: `仅优化 ${reviseTarget} 板块，其它字段保持不变。要求：${reviseInstruction}\n请严格遵循教材版本结构模板：\n${templateContext}`
        });
        if (reviseTarget === 'preLearning') patchLesson({ preLearning: aiData.preLearning || detailedData.preLearning });
        if (reviseTarget === 'postLearning') patchLesson({ postLearning: aiData.postLearning || detailedData.postLearning });
        if (reviseTarget === 'inClass') {
          const inClass = (aiData.inClass || detailedData.inClass || []) as { title?: string; studentTask?: string; teacherGuidance?: string; evaluation?: string; designIntent?: string }[];
          patchLesson({ inClass: inClass.map((a, idx) => ({ id: `${idx + 1}`, title: a.title || `活动${idx + 1}`, studentTask: a.studentTask || '', teacherGuidance: a.teacherGuidance || '', evaluation: a.evaluation || '', designIntent: a.designIntent || '' })) });
        }
      } else {
        const fieldText = reviseTarget === 'coreContent' ? detailedData.coreContent
          : reviseTarget === 'studentAnalysis' ? detailedData.studentAnalysis
          : reviseTarget === 'keyPoints' ? detailedData.keyPoints
          : reviseTarget === 'difficultPoints' ? detailedData.difficultPoints
          : reviseTarget === 'boardDesign' ? detailedData.boardDesign
          : detailedData.reflection;
        const content = await chatCompletion({
          apiKey,
          provider: aiProvider,
          model: selectedModel,
          messages: [
            { role: 'system', content: '你是教学内容优化助手。只输出优化后正文，不做解释。' },
            { role: 'user', content: `优化目标：${reviseTarget}\n要求：${reviseInstruction}\n原文：\n${fieldText}` }
          ],
          temperature: 0.6
        });
        patchLesson({ [reviseTarget]: content } as Partial<DetailedLesson>);
      }
      setChatHistory(prev => [...prev, { role: 'ai', content: '已完成二次优化。' }]);
      setReviseInstruction('');
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'ai', content: err instanceof Error ? err.message : '二次优化失败' }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportToDocx = async (format: 'docx' | 'pdf' = 'docx') => {
    try {
      if (!detailedData) return;
      const plannedDate = getPlannedLessonDate() || detailedData.date;
      const plannedWeekDay = getPlannedWeekDay() || detailedData.weekDay;
      const pass = runLessonPrecheck(detailedData);
      if (!pass) {
        setLessonPrecheck({ level: 'warn', text: `存在未完成项，已继续导出。${getLessonPrecheckIssues(detailedData).join('；')}` });
      }
      
      if (format === 'pdf') {
        if (!lessonContentRef.current) throw new Error('导出区域未就绪');
      
        const element = lessonContentRef.current;
        const safe = buildPdfSafeClone(element);
        safe.element.style.width = '1120px';
        safe.element.style.maxWidth = '1120px';
        safe.element.style.margin = '0 auto';
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
      
        pdf.save(`${detailedData.topic}-教学设计.pdf`);
        return;
      }
    
    const bodyFont = '仿宋_GB2312';
    const titleFont = '宋体';
    const tableBorder = {
      top: { style: BorderStyle.SINGLE, size: 6, color: 'A8A8A8' },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A8A8A8' },
      left: { style: BorderStyle.SINGLE, size: 6, color: 'A8A8A8' },
      right: { style: BorderStyle.SINGLE, size: 6, color: 'A8A8A8' }
    };

    const buildParagraphs = (text: string, opts: { bold?: boolean; align?: string; indent?: number; font?: string; size?: number } = {}) =>
      (text || '（空）').split('\n').map((line) => new Paragraph({
        children: [new TextRun({
          text: line || ' ',
          bold: opts.bold,
          size: opts.size || 21,
          font: opts.font || bodyFont
        })],
        alignment: opts.align as any,
        indent: opts.indent ? { firstLine: opts.indent } : undefined,
        spacing: { after: 80, before: 40 }
      }));

    const createCell = (text: string, options: { bold?: boolean; fill?: string; colSpan?: number; rowSpan?: number; align?: string } = {}) => {
      return new TableCell({
        children: buildParagraphs(text, { bold: options.bold, align: options.align || AlignmentType.CENTER, font: titleFont }),
        columnSpan: options.colSpan,
        rowSpan: options.rowSpan,
        shading: options.fill ? { fill: options.fill } : undefined,
        borders: tableBorder,
        verticalAlign: 'center',
        margins: { top: 80, bottom: 80, left: 120, right: 120 }
      });
    };

    const createContentCell = (text: string, options: { colSpan?: number; rowSpan?: number; indent?: boolean } = {}) => {
      return new TableCell({
        children: buildParagraphs(text, { indent: options.indent === false ? 0 : 420 }),
        columnSpan: options.colSpan,
        rowSpan: options.rowSpan,
        borders: tableBorder,
        margins: { top: 80, bottom: 80, left: 120, right: 120 }
      });
    };

    const logoData = await buildLogoPng();
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: bodyFont,
              size: 21
            }
          }
        }
      },
      sections: [{
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `2025 学年第二学期 · ${unitPlan.grade}年级${unitPlan.volume ? unitPlan.volume : ''}`, font: bodyFont, size: 18 })],
                alignment: AlignmentType.RIGHT
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: '第 ', font: bodyFont, size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT], font: bodyFont, size: 18 }),
                  new TextRun({ text: ' 页', font: bodyFont, size: 18 })
                ],
                alignment: AlignmentType.CENTER
              })
            ]
          })
        },
        children: [
          ...(logoData ? [
            new Paragraph({
              children: [new ImageRun({ data: logoData, type: 'png', transformation: { width: 48, height: 48 } })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 120 }
            })
          ] : []),
          new Paragraph({
            children: [new TextRun({ text: "“三学联网”课时教学设计", bold: true, font: titleFont, size: 32 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 }
          }),
          new Paragraph({
            children: [new TextRun({ text: `${unitPlan.grade}年级${unitPlan.volume ? ` ${unitPlan.volume}` : ''} · ${unitPlan.textbookVersion || '教材版本未填写'}`, font: bodyFont, size: 22 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 220 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [1100, 2900, 1100, 1500, 1100, 2900],
            rows: [
              new TableRow({
                children: [createCell("课题", { bold: true }), createContentCell(detailedData.topic, { colSpan: 2, indent: false }), createCell("课型", { bold: true }), createContentCell(detailedData.type, { colSpan: 2, indent: false })]
              }),
              new TableRow({
                children: [createCell("日期", { bold: true }), createContentCell(plannedDate, { indent: false }), createCell("星期", { bold: true }), createContentCell(plannedWeekDay, { indent: false }), createCell("课时", { bold: true }), createContentCell(detailedData.period, { indent: false })]
              }),
              new TableRow({
                children: [createCell("授课对象", { bold: true }), createContentCell(detailedData.targetStudent, { colSpan: 2, indent: false }), createCell("教材", { bold: true }), createContentCell(detailedData.textbook, { colSpan: 2, indent: false })]
              }),
              new TableRow({ children: [createCell("学习核心内容", { bold: true }), createContentCell(detailedData.coreContent, { colSpan: 5 })] }),
              new TableRow({ children: [createCell("学情分析", { bold: true }), createContentCell(detailedData.studentAnalysis, { colSpan: 5 })] }),
              new TableRow({ children: [createCell("教学重点", { bold: true }), createContentCell(detailedData.keyPoints, { colSpan: 5 })] }),
              new TableRow({ children: [createCell("教学难点", { bold: true }), createContentCell(detailedData.difficultPoints, { colSpan: 5 })] }),
              new TableRow({ children: [createCell("一、目标与评价", { bold: true, fill: "EAF5F4", colSpan: 6, align: AlignmentType.LEFT })] }),
              new TableRow({ children: [createCell("学习目标", { bold: true, colSpan: 3 }), createCell("评价设计", { bold: true, colSpan: 3 })] }),
              ...detailedData.objectives.map((obj) => new TableRow({ children: [createContentCell(obj.content, { colSpan: 3 }), createContentCell(obj.assessment, { colSpan: 3 })] })),
              new TableRow({ children: [createCell("二、课前预学", { bold: true, fill: "EAF5F4", colSpan: 6, align: AlignmentType.LEFT })] }),
              new TableRow({ children: [createCell("学案", { bold: true, rowSpan: 2 }), createContentCell(detailedData.preLearning.studentTask, { colSpan: 2, rowSpan: 2 }), createCell("导案", { bold: true }), createContentCell(detailedData.preLearning.teacherGuidance, { colSpan: 2 })] }),
              new TableRow({ children: [createCell("评价", { bold: true }), createContentCell(detailedData.preLearning.assessment, { colSpan: 2 })] }),
              new TableRow({ children: [createCell("设计意图", { bold: true }), createContentCell(detailedData.preLearning.intent, { colSpan: 5 })] }),
              new TableRow({ children: [createCell("三、课中议学", { bold: true, fill: "EAF5F4", colSpan: 6, align: AlignmentType.LEFT })] }),
              ...detailedData.inClass.flatMap((act) => [
                new TableRow({ children: [createCell(act.title, { bold: true, fill: "F5F7F8", colSpan: 6, align: AlignmentType.LEFT })] }),
                new TableRow({ children: [createCell("学案", { bold: true, rowSpan: 2 }), createContentCell(act.studentTask, { colSpan: 2, rowSpan: 2 }), createCell("导案", { bold: true }), createContentCell(act.teacherGuidance, { colSpan: 2 })] }),
                new TableRow({ children: [createCell("评价", { bold: true }), createContentCell(act.evaluation, { colSpan: 2 })] }),
                new TableRow({ children: [createCell("设计意图", { bold: true }), createContentCell(act.designIntent, { colSpan: 5 })] })
              ]),
              new TableRow({ children: [createCell("四、课后悟学", { bold: true, fill: "EAF5F4", colSpan: 6, align: AlignmentType.LEFT })] }),
              new TableRow({ children: [createCell("基础作业", { bold: true }), createContentCell(detailedData.postLearning.homeworkBasic, { colSpan: 3 }), createCell("预计时长", { bold: true }), createContentCell(detailedData.postLearning.estimatedTimeBasic, { indent: false })] }),
              new TableRow({ children: [createCell("拓展作业", { bold: true }), createContentCell(detailedData.postLearning.homeworkExtension, { colSpan: 3 }), createCell("预计时长", { bold: true }), createContentCell(detailedData.postLearning.estimatedTimeExtension, { indent: false })] }),
              new TableRow({ children: [createCell("作业属性", { bold: true }), createContentCell(`来源: ${detailedData.postLearning.attributes.source.join('、')}\n类别: ${detailedData.postLearning.attributes.category.join('、')}`, { colSpan: 5, indent: false })] }),
              new TableRow({ children: [createCell("五、板书设计", { bold: true, fill: "EAF5F4", colSpan: 6, align: AlignmentType.LEFT })] }),
              new TableRow({ children: [createContentCell(detailedData.boardDesign, { colSpan: 6 })] }),
              new TableRow({ children: [createCell("六、课后反思", { bold: true, fill: "EAF5F4", colSpan: 6, align: AlignmentType.LEFT })] }),
              new TableRow({ children: [createContentCell(detailedData.reflection, { colSpan: 6 })] })
            ]
          })
        ],
      }],
    });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${detailedData.topic}-教学设计.docx`);
    } catch (err) {
      setGenerateError(err instanceof Error ? `导出失败：${err.message}` : '导出失败');
    }
  };

  const handleGeneratePptPrompt = () => {
    if (!detailedData) return;
    const text = generatePptPrompt({
      lesson: detailedData,
      subject: unitPlan.subject,
      mode: pptMode,
      tool: pptTool
    });
    setPptPromptText(text);
    const version: PromptVersion = {
      id: `${Date.now()}`,
      createdAt: Date.now(),
      mode: pptMode,
      tool: pptTool,
      prompt: text
    };
    savePromptVersion(selectedLessonId, version);
    setPromptHistory(loadPromptVersions());
    setShowPptPromptPanel(true);
  };

  const handleCopyPrompt = async () => {
    if (!pptPromptText.trim()) return;
    await navigator.clipboard.writeText(pptPromptText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex gap-6 relative">
      {/* Left: Editor/Preview */}
      <div className={cn(
        "flex-1 min-w-0 flex flex-col bg-white rounded-3xl shadow-soft border border-gray-100 overflow-hidden relative",
        showTemplatePreview ? "" : ""
      )}>
        {/* Toolbar */}
        <div className="min-h-16 border-b border-gray-100 flex items-center justify-between px-6 py-3 bg-white z-10 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
             <select 
                className="bg-gray-50 border border-gray-200 text-sm font-medium rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent cursor-pointer min-w-[200px]"
                value={selectedLessonId}
                onChange={(e) => setSelectedLessonId(e.target.value)}
            >
                <option value="">请选择课时...</option>
                {availableLessons.map(l => (
                <option key={l.id} value={l.id}>第{l.day}天（{calcLessonDate(l.day) || '未设置日期'}）：{l.topic}</option>
                ))}
            </select>
          </div>
          
          <div className="flex gap-3">
             {selectedLessonId && (
               <div className="flex items-center">
                 <input
                   type="file"
                   id="lesson-material-upload"
                   className="hidden"
                   accept=".pdf,.ppt,.pptx,.doc,.docx,image/*,.txt,.md,.markdown,.json,.csv"
                   onChange={handleLessonMaterialUpload}
                 />
                 <label
                   htmlFor="lesson-material-upload"
                   className={cn(
                     "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors",
                     lessonMaterialText
                       ? "bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-100"
                       : "bg-white border-gray-200 text-slate-600 hover:bg-gray-50"
                   )}
                   title={lessonMaterialFile ? `已加载：${lessonMaterialFile.name}` : "上传针对本课时的特定素材（可选）"}
                 >
                   {isParsingLessonMaterial ? (
                     <Loader2 className="h-3.5 w-3.5 animate-spin" />
                   ) : lessonMaterialText ? (
                     <Check className="h-3.5 w-3.5" />
                   ) : (
                     <Paperclip className="h-3.5 w-3.5" />
                   )}
                   {isParsingLessonMaterial ? '解析中...' : lessonMaterialFile ? '已加载素材' : '补充课时素材'}
                 </label>
                 {lessonMaterialFile && (
                   <button
                     onClick={() => {
                       setLessonMaterialFile(null);
                       setLessonMaterialText('');
                     }}
                     className="ml-1 p-1 text-slate-400 hover:text-red-500 transition-colors"
                     title="清除素材"
                   >
                     <X className="h-3.5 w-3.5" />
                   </button>
                 )}
               </div>
             )}
             <button 
                onClick={() => setShowTemplatePreview(true)}
                className="btn-secondary px-4 py-2 text-sm rounded-lg flex items-center gap-2"
            >
                <Eye className="h-4 w-4" />
                模板预览
            </button>
            <button 
                data-guide="design-generate"
                onClick={handleGenerateInitial}
                disabled={!selectedLessonId || isGenerating}
                className="btn-primary px-4 py-2 text-sm rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:shadow-none"
            >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                AI 生成设计
            </button>
            {detailedData && (
                <div className="flex gap-2">
                    <button 
                        onClick={handleGeneratePptPrompt}
                        className="btn-secondary px-4 py-2 text-sm rounded-lg flex items-center gap-2"
                    >
                        <Sparkles className="h-4 w-4" />
                        生成PPT提示词
                    </button>

                    <button 
                        onClick={() => exportToDocx('docx')}
                        className="btn-secondary px-4 py-2 text-sm rounded-lg flex items-center gap-2"
                    >
                        <Download className="h-4 w-4" />
                        导出 Word
                    </button>
                    <button 
                        data-guide="design-export-pdf"
                        onClick={() => exportToDocx('pdf')}
                        className="btn-secondary px-4 py-2 text-sm rounded-lg flex items-center gap-2"
                    >
                        <Download className="h-4 w-4" />
                        导出 PDF
                    </button>
                </div>
            )}
          </div>
        </div>

        {generateError && (
          <div className="mx-6 mt-4 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
            {generateError}
          </div>
        )}
        {lessonPrecheck && (
          <div className={cn(
            "mx-6 mt-4 text-xs px-3 py-2 rounded-lg border",
            lessonPrecheck.level === 'success'
              ? "text-green-700 bg-green-50 border-green-100"
              : "text-amber-700 bg-amber-50 border-amber-100"
          )}>
            {lessonPrecheck.text}
          </div>
        )}
        {showPptPromptPanel && detailedData && (
          <div className="mx-6 mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-800">AI 生成PPT提示词</div>
              <button onClick={() => setShowPptPromptPanel(false)} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600">收起</button>
            </div>
            <div className="grid grid-cols-12 gap-3 mb-3">
              <select
                value={pptTool}
                onChange={(e) => setPptTool(e.target.value as PptTool)}
                className="col-span-2 text-xs px-2 py-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value="wps">WPS AI</option>
                <option value="copilot">Microsoft Copilot</option>
                <option value="canva">Canva AI</option>
              </select>
              <select
                value={pptMode}
                onChange={(e) => setPptMode(e.target.value as PptLanguageMode)}
                className="col-span-3 text-xs px-2 py-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value="zh-to-zh">中文提示词→中文PPT</option>
                <option value="zh-to-en" disabled={unitPlan.subject !== 'english'}>中文提示词→英文PPT</option>
                <option value="en-to-en" disabled={unitPlan.subject !== 'english'}>英文提示词→英文PPT</option>
              </select>
              <button
                onClick={handleGeneratePptPrompt}
                className="col-span-2 text-xs px-2 py-2 bg-slate-900 text-white rounded-lg"
              >
                重新生成
              </button>
              <button
                onClick={handleCopyPrompt}
                className="col-span-2 text-xs px-2 py-2 bg-brand-600 text-white rounded-lg flex items-center justify-center gap-1"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? '已复制' : '一键复制'}
              </button>
              <div className="col-span-3 text-[11px] text-slate-500 flex items-center">支持粘贴到 WPS AI / Copilot / Canva</div>
            </div>
            <AutoGrowTextarea
              value={pptPromptText}
              onChange={(e) => setPptPromptText(e.target.value)}
              maxRows={24}
              className="w-full min-h-[180px] text-xs leading-6 border border-slate-200 rounded-xl p-3 bg-slate-50"
            />
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-700 mb-2">历史版本</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {(promptHistory[selectedLessonId] || []).slice(0, 6).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setPptPromptText(v.prompt)}
                    className="w-full text-left text-[11px] px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-50"
                  >
                    {new Date(v.createdAt).toLocaleString()} · {v.tool} · {v.mode}
                  </button>
                ))}
                {(promptHistory[selectedLessonId] || []).length === 0 && (
                  <div className="text-[11px] text-slate-400">当前课时暂无历史版本</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-6 bg-slate-50/50">
            {detailedData ? (
                <div ref={lessonContentRef} className="max-w-[1360px] mx-auto bg-white p-8 md:p-10 shadow-sm rounded-2xl border border-gray-100 animate-in fade-in duration-500">
                    <h1 className="text-3xl font-bold text-center mb-10 text-slate-800 tracking-tight">{detailedData.topic} 教学设计</h1>
                    
                    {/* Basic Info Grid */}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-8 text-sm text-slate-600 bg-slate-50 p-6 rounded-xl border border-slate-100">
                        <div className="flex"><span className="font-bold w-20 text-slate-800">日期:</span> {displayDate}</div>
                        <div className="flex"><span className="font-bold w-20 text-slate-800">星期:</span> {displayWeekDay}</div>
                        <div className="flex items-center gap-2"><span className="font-bold w-20 text-slate-800">课时:</span><AutoGrowTextarea minRows={1} value={detailedData.period} onChange={(e) => patchLesson({ period: e.target.value })} className="flex-1 px-2 py-1 border rounded text-sm" /></div>
                        <div className="flex items-center gap-2"><span className="font-bold w-20 text-slate-800">课型:</span><AutoGrowTextarea minRows={1} value={detailedData.type} onChange={(e) => patchLesson({ type: e.target.value })} className="flex-1 px-2 py-1 border rounded text-sm" /></div>
                        <div className="flex col-span-2 items-start gap-2"><span className="font-bold w-20 text-slate-800 shrink-0 pt-2">授课对象:</span><AutoGrowTextarea minRows={1} value={detailedData.targetStudent} onChange={(e) => patchLesson({ targetStudent: e.target.value })} className="flex-1 px-2 py-1 border rounded text-sm" /></div>
                        <div className="flex col-span-2 items-start gap-2"><span className="font-bold w-20 text-slate-800 shrink-0 pt-2">教材:</span><AutoGrowTextarea minRows={1} value={detailedData.textbook} onChange={(e) => patchLesson({ textbook: e.target.value })} className="flex-1 px-2 py-1 border rounded text-sm" /></div>
                    </div>

                    {/* Analysis Section */}
                    <Section title="学习分析">
                        <div className="space-y-4">
                            <InfoBlock label="核心内容" content={detailedData.coreContent} onChange={(v) => patchLesson({ coreContent: v })} />
                            <InfoBlock label="学情分析" content={detailedData.studentAnalysis} onChange={(v) => patchLesson({ studentAnalysis: v })} />
                            <InfoBlock label="教学重点" content={detailedData.keyPoints} onChange={(v) => patchLesson({ keyPoints: v })} />
                            <InfoBlock label="教学难点" content={detailedData.difficultPoints} onChange={(v) => patchLesson({ difficultPoints: v })} />
                        </div>
                    </Section>

                    {/* Objectives */}
                    <Section title="一、目标与评价">
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-slate-700 font-bold border-b border-gray-200">
                                    <tr>
                                        <th className="p-4 w-1/2">学习目标</th>
                                        <th className="p-4 w-1/2">评价设计</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {detailedData.objectives.map((obj, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50">
                                            <td className="p-2 text-slate-600 align-top"><AutoGrowTextarea value={obj.content} onChange={(e) => patchObjective(idx, 'content', e.target.value)} className="w-full min-h-[92px] p-2 border rounded text-sm" /></td>
                                            <td className="p-2 text-slate-600 align-top"><AutoGrowTextarea value={obj.assessment} onChange={(e) => patchObjective(idx, 'assessment', e.target.value)} className="w-full min-h-[92px] p-2 border rounded text-sm" /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>

                    {/* Pre-Learning */}
                    <Section title="二、课前预学">
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-4 space-y-4">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <h4 className="font-bold text-brand-700 mb-2 flex items-center gap-2 text-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                                        学案 (Student Task)
                                    </h4>
                                    <AutoGrowTextarea value={detailedData.preLearning.studentTask} onChange={(e) => patchLesson({ preLearning: { ...detailedData.preLearning, studentTask: e.target.value } })} className="w-full min-h-[130px] text-slate-600 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-brand-700 mb-2 flex items-center gap-2 text-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                                        导案 (Teacher Guidance)
                                    </h4>
                                    <AutoGrowTextarea value={detailedData.preLearning.teacherGuidance} onChange={(e) => patchLesson({ preLearning: { ...detailedData.preLearning, teacherGuidance: e.target.value } })} className="w-full min-h-[130px] text-slate-600 text-sm bg-brand-50/30 p-3 rounded-lg border border-brand-100/50" />
                                </div>
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-700 mb-1 text-xs">评价</h4>
                                <AutoGrowTextarea value={detailedData.preLearning.assessment} onChange={(e) => patchLesson({ preLearning: { ...detailedData.preLearning, assessment: e.target.value } })} className="w-full min-h-[60px] text-slate-600 text-sm border rounded p-2" />
                            </div>
                             <div>
                                <h4 className="font-bold text-slate-700 mb-1 text-xs">设计意图</h4>
                                <AutoGrowTextarea value={detailedData.preLearning.intent} onChange={(e) => patchLesson({ preLearning: { ...detailedData.preLearning, intent: e.target.value } })} className="w-full min-h-[60px] text-slate-600 text-sm italic border rounded p-2" />
                            </div>
                        </div>
                    </Section>

                    {/* In-Class */}
                    <Section title="三、课中议学">
                        <div className="space-y-6">
                            {detailedData.inClass.map((activity) => (
                                <div key={activity.id} className="relative pl-6 border-l-2 border-brand-200 pb-6 last:pb-0">
                                    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-brand-100 border-2 border-brand-500" />
                                    <input value={activity.title} onChange={(e) => patchInClass(activity.id, 'title', e.target.value)} className="font-bold text-lg text-slate-800 mb-3 border rounded px-2 py-1 w-full" />
                                    
                                    <div className="grid grid-cols-2 gap-4 mb-3">
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <div className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">Student Task (学案)</div>
                                            <AutoGrowTextarea value={activity.studentTask} onChange={(e) => patchInClass(activity.id, 'studentTask', e.target.value)} className="w-full min-h-[120px] text-sm text-slate-700 leading-relaxed border rounded p-2" />
                                        </div>
                                        <div className="bg-brand-50/30 p-4 rounded-xl border border-brand-100/50">
                                            <div className="text-xs font-bold text-brand-400 uppercase mb-2 tracking-wider">Teacher Guidance (导案)</div>
                                            <AutoGrowTextarea value={activity.teacherGuidance} onChange={(e) => patchInClass(activity.id, 'teacherGuidance', e.target.value)} className="w-full min-h-[120px] text-sm text-slate-700 leading-relaxed border rounded p-2" />
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                         <div className="text-xs text-slate-500 bg-gray-50 px-3 py-2 rounded-lg">
                                            <span className="font-bold text-slate-700 block mb-1">评价:</span>
                                            <AutoGrowTextarea value={activity.evaluation} onChange={(e) => patchInClass(activity.id, 'evaluation', e.target.value)} className="w-full min-h-[72px] text-xs text-slate-600 border rounded p-2 mt-1" />
                                        </div>
                                         <div className="text-xs text-slate-500 bg-gray-50 px-3 py-2 rounded-lg">
                                            <span className="font-bold text-slate-700 block mb-1">设计意图:</span>
                                            <AutoGrowTextarea value={activity.designIntent} onChange={(e) => patchInClass(activity.id, 'designIntent', e.target.value)} className="w-full min-h-[72px] text-xs text-slate-600 border rounded p-2 mt-1" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* Post-Learning */}
                    <Section title="四、课后悟学">
                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <div className="border border-gray-200 p-5 rounded-xl bg-white shadow-sm flex flex-col">
                                <div className="font-bold text-slate-700 mb-2 flex justify-between">
                                    基础作业
                                    <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{detailedData.postLearning.estimatedTimeBasic}</span>
                                </div>
                                <AutoGrowTextarea value={detailedData.postLearning.homeworkBasic} onChange={(e) => patchLesson({ postLearning: { ...detailedData.postLearning, homeworkBasic: e.target.value } })} className="w-full min-h-[120px] text-sm text-slate-600 border rounded p-2" />
                            </div>
                            <div className="border border-gray-200 p-5 rounded-xl bg-white shadow-sm flex flex-col">
                                <div className="font-bold text-slate-700 mb-2 flex justify-between">
                                    拓展作业
                                    <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{detailedData.postLearning.estimatedTimeExtension}</span>
                                </div>
                                <AutoGrowTextarea value={detailedData.postLearning.homeworkExtension} onChange={(e) => patchLesson({ postLearning: { ...detailedData.postLearning, homeworkExtension: e.target.value } })} className="w-full min-h-[120px] text-sm text-slate-600 border rounded p-2" />
                            </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm">
                            <div className="font-bold text-slate-700 mb-2">作业属性</div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex gap-2 items-center text-slate-600">
                                    <span className="text-slate-400 text-xs">来源:</span>
                                    <input value={detailedData.postLearning.attributes.source.join(', ')} onChange={(e) => patchLesson({ postLearning: { ...detailedData.postLearning, attributes: { ...detailedData.postLearning.attributes, source: e.target.value.split(',').map(v => v.trim()).filter(Boolean) } } })} className="w-full border rounded px-2 py-1 text-xs" />
                                </div>
                                <div className="flex gap-2 items-center text-slate-600">
                                    <span className="text-slate-400 text-xs">类别:</span>
                                    <input value={detailedData.postLearning.attributes.category.join(', ')} onChange={(e) => patchLesson({ postLearning: { ...detailedData.postLearning, attributes: { ...detailedData.postLearning.attributes, category: e.target.value.split(',').map(v => v.trim()).filter(Boolean) } } })} className="w-full border rounded px-2 py-1 text-xs" />
                                </div>
                            </div>
                        </div>
                    </Section>
                    
                    {/* Board Design */}
                    <Section title="五、板书设计">
                        <AutoGrowTextarea value={detailedData.boardDesign} onChange={(e) => patchLesson({ boardDesign: e.target.value })} className="w-full min-h-[150px] bg-white p-6 rounded-xl border-2 border-dashed border-gray-300 text-slate-700 text-sm leading-relaxed" />
                    </Section>

                    {/* Reflection */}
                    <Section title="六、课后反思">
                        <AutoGrowTextarea value={detailedData.reflection} onChange={(e) => patchLesson({ reflection: e.target.value })} className="w-full min-h-[140px] bg-yellow-50/50 p-6 rounded-xl border border-yellow-100 text-slate-700 text-sm leading-relaxed" />
                    </Section>

                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                         <FileText className="h-10 w-10 opacity-30" />
                    </div>
                    <p className="text-lg font-medium text-slate-500">{availableLessons.length > 0 ? '请选择左上角的已确认课时' : '请先到单元备课中确认课时'}</p>
                    <p className="text-sm mt-2">{availableLessons.length > 0 ? '点击“AI 生成设计”开始备课' : '确认后将出现在这里供生成设计'}</p>
                </div>
            )}
        </div>

        {/* Template Preview Modal */}
        {showTemplatePreview && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-8 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden relative">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <FileText className="h-5 w-5 text-brand-600" />
                            课时教学设计模板预览
                        </h3>
                        <button 
                            onClick={() => setShowTemplatePreview(false)}
                            className="p-2 bg-white hover:bg-gray-100 rounded-full transition-colors text-slate-500 hover:text-slate-800 border border-gray-200 shadow-sm"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-12 bg-slate-100 flex justify-center">
                        {/* Realistic Template HTML Representation */}
                        <div className="w-[210mm] min-h-[297mm] bg-white shadow-lg p-[20mm] text-black text-[10.5pt] leading-normal font-serif">
                            <h1 className="text-center text-2xl font-bold mb-6 font-sans">“三学联网”课时教学设计</h1>
                            
                            <table className="w-full border-collapse border border-black text-center">
                                <tbody>
                                    <tr className="h-10">
                                        <td className="border border-black font-bold bg-gray-100 w-24">课题</td>
                                        <td className="border border-black" colSpan={2}>Unit 1 My Day</td>
                                        <td className="border border-black font-bold bg-gray-100 w-24">课型</td>
                                        <td className="border border-black" colSpan={2}>New Lesson</td>
                                    </tr>
                                    <tr className="h-10">
                                        <td className="border border-black font-bold bg-gray-100">日期</td>
                                        <td className="border border-black">2024-03-20</td>
                                        <td className="border border-black font-bold bg-gray-100">星期</td>
                                        <td className="border border-black">Monday</td>
                                        <td className="border border-black font-bold bg-gray-100">课时</td>
                                        <td className="border border-black">1</td>
                                    </tr>
                                    <tr className="h-10">
                                        <td className="border border-black font-bold bg-gray-100">授课对象</td>
                                        <td className="border border-black" colSpan={2}>Class 1, Grade 7</td>
                                        <td className="border border-black font-bold bg-gray-100">教材</td>
                                        <td className="border border-black" colSpan={2}>PEP English</td>
                                    </tr>
                                     <tr className="h-16">
                                        <td className="border border-black font-bold bg-gray-100">学习<br/>核心内容</td>
                                        <td className="border border-black text-left p-2" colSpan={5}>...</td>
                                    </tr>
                                    <tr className="h-16">
                                        <td className="border border-black font-bold bg-gray-100">学情分析</td>
                                        <td className="border border-black text-left p-2" colSpan={5}>...</td>
                                    </tr>
                                     <tr className="h-16">
                                        <td className="border border-black font-bold bg-gray-100">教学重点</td>
                                        <td className="border border-black text-left p-2" colSpan={5}>...</td>
                                    </tr>
                                     <tr className="h-16">
                                        <td className="border border-black font-bold bg-gray-100">教学难点</td>
                                        <td className="border border-black text-left p-2" colSpan={5}>...</td>
                                    </tr>

                                    {/* Objectives */}
                                    <tr>
                                        <td className="border border-black font-bold bg-gray-200 text-left pl-2" colSpan={6}>一、目标与评价</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black font-bold" colSpan={3}>学习目标</td>
                                        <td className="border border-black font-bold" colSpan={3}>评价设计</td>
                                    </tr>
                                    <tr className="h-20">
                                        <td className="border border-black text-left p-2" colSpan={3}>1. ...</td>
                                        <td className="border border-black text-left p-2" colSpan={3}>1. ...</td>
                                    </tr>

                                    {/* Pre-Learning */}
                                    <tr>
                                        <td className="border border-black font-bold bg-gray-200 text-left pl-2" colSpan={6}>二、课前预学</td>
                                    </tr>
                                    <tr className="h-24">
                                        <td className="border border-black font-bold" rowSpan={2}>学案<br/>(Student Task)</td>
                                        <td className="border border-black text-left p-2" colSpan={2} rowSpan={2}>...</td>
                                        <td className="border border-black font-bold">导案<br/>(Teacher Guidance)</td>
                                        <td className="border border-black text-left p-2" colSpan={2}>...</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black font-bold">评价</td>
                                        <td className="border border-black text-left p-2" colSpan={2}>...</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black font-bold">设计意图</td>
                                        <td className="border border-black text-left p-2" colSpan={5}>...</td>
                                    </tr>

                                    {/* In-Class */}
                                    <tr>
                                        <td className="border border-black font-bold bg-gray-200 text-left pl-2" colSpan={6}>三、课中议学</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black font-bold bg-gray-50" colSpan={6}>Activity 1: ...</td>
                                    </tr>
                                    <tr className="h-24">
                                        <td className="border border-black font-bold" rowSpan={2}>学案<br/>(Student Task)</td>
                                        <td className="border border-black text-left p-2" colSpan={2} rowSpan={2}>...</td>
                                        <td className="border border-black font-bold">导案<br/>(Teacher Guidance)</td>
                                        <td className="border border-black text-left p-2" colSpan={2}>...</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black font-bold">评价</td>
                                        <td className="border border-black text-left p-2" colSpan={2}>...</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black font-bold">设计意图</td>
                                        <td className="border border-black text-left p-2" colSpan={5}>...</td>
                                    </tr>

                                    {/* Post-Learning */}
                                    <tr>
                                        <td className="border border-black font-bold bg-gray-200 text-left pl-2" colSpan={6}>四、课后悟学</td>
                                    </tr>
                                    <tr className="h-16">
                                        <td className="border border-black font-bold">基础作业</td>
                                        <td className="border border-black text-left p-2" colSpan={3}>...</td>
                                        <td className="border border-black font-bold">预计时长</td>
                                        <td className="border border-black">...</td>
                                    </tr>
                                    <tr className="h-16">
                                        <td className="border border-black font-bold">拓展作业</td>
                                        <td className="border border-black text-left p-2" colSpan={3}>...</td>
                                        <td className="border border-black font-bold">预计时长</td>
                                        <td className="border border-black">...</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-black font-bold">作业属性</td>
                                        <td className="border border-black text-left p-2" colSpan={5}>来源: ... 类别: ...</td>
                                    </tr>
                                    
                                     {/* Board Design */}
                                    <tr>
                                        <td className="border border-black font-bold bg-gray-200 text-left pl-2" colSpan={6}>五、板书设计</td>
                                    </tr>
                                    <tr className="h-24">
                                        <td className="border border-black text-left p-2" colSpan={6}>...</td>
                                    </tr>

                                    {/* Reflection */}
                                    <tr>
                                        <td className="border border-black font-bold bg-gray-200 text-left pl-2" colSpan={6}>六、课后反思</td>
                                    </tr>
                                    <tr className="h-24">
                                        <td className="border border-black text-left p-2" colSpan={6}>...</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* Right: AI Assistant - Collapsible Floating Panel */}
      {isAiPanelOpen && (
        <div className={cn(
          "fixed bg-white rounded-2xl shadow-2xl border border-gray-100 z-40 flex flex-col overflow-hidden",
          isAiMaximized ? "inset-6" : "right-8 bottom-28 w-[380px] h-[560px]"
        )}>
          <div className="h-14 border-b border-gray-100 flex items-center justify-between px-5 bg-white">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Bot className="h-5 w-5 text-brand-600" />
              AI 助手
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsAiMaximized((v) => !v)}
                className="p-1 rounded-md hover:bg-gray-100 text-slate-500 hover:text-slate-800 transition-colors"
                title={isAiMaximized ? '还原窗口' : '放大窗口'}
              >
                {isAiMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setIsAiPanelOpen(false)}
                className="p-1 rounded-md hover:bg-gray-100 text-slate-500 hover:text-slate-800 transition-colors"
                title="收起"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/40">
              {chatHistory.map((msg, i) => (
                <div key={i} className={cn("flex gap-3", msg.role === 'user' ? "justify-end" : "justify-start")}>
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
              {isGenerating && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center mt-1">
                    <Bot className="h-4 w-4 text-brand-600" />
                  </div>
                  <div className="bg-white border border-gray-100 px-4 py-2.5 rounded-2xl rounded-bl-md">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-gray-100">
              <input
                ref={assetInputRef}
                type="file"
                accept=".pdf,.ppt,.pptx,.doc,.docx,image/*,.txt,.md,.markdown,.json,.csv"
                className="hidden"
                onChange={handleAssetUpload}
              />
              {(isAssetParsing || assetOcrText) && (
                <div className="mb-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  {isAssetParsing ? (
                    <div className="text-xs text-slate-600 flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      正在进行 OCR 解析...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-slate-600">已解析素材：{assetName}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-2">{assetOcrText.slice(0, 140)}</div>
                      <button
                        onClick={quoteAssetToInput}
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
                  value={reviseTarget}
                  onChange={(e) => setReviseTarget(e.target.value as typeof reviseTarget)}
                  className="col-span-4 text-xs px-2 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="global">全局优化</option>
                  <option value="coreContent">核心内容</option>
                  <option value="studentAnalysis">学情分析</option>
                  <option value="keyPoints">教学重点</option>
                  <option value="difficultPoints">教学难点</option>
                  <option value="preLearning">课前预学</option>
                  <option value="inClass">课中议学</option>
                  <option value="postLearning">课后悟学</option>
                  <option value="boardDesign">板书设计</option>
                  <option value="reflection">课后反思</option>
                </select>
                <input
                  value={reviseInstruction}
                  onChange={(e) => setReviseInstruction(e.target.value)}
                  className="col-span-6 text-xs px-2 py-2 border border-slate-200 rounded-lg"
                  placeholder="输入局部/全局二次优化要求"
                />
                <button
                  onClick={handleAiRevise}
                  disabled={!reviseInstruction.trim() || isGenerating || !detailedData}
                  className="col-span-2 text-xs px-2 py-2 bg-slate-900 text-white rounded-lg disabled:bg-slate-300"
                >
                  二次优化
                </button>
              </div>
              {detailedData && reviseTarget === 'preLearning' && (
                <div className="mb-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                  <div className="text-xs font-semibold text-slate-700">结构化编辑器：课前预学</div>
                  <AutoGrowTextarea value={detailedData.preLearning.studentTask} onChange={(e) => patchLesson({ preLearning: { ...detailedData.preLearning, studentTask: e.target.value } })} className="w-full min-h-[72px] text-xs border rounded p-2" placeholder="学案任务" />
                  <AutoGrowTextarea value={detailedData.preLearning.teacherGuidance} onChange={(e) => patchLesson({ preLearning: { ...detailedData.preLearning, teacherGuidance: e.target.value } })} className="w-full min-h-[72px] text-xs border rounded p-2" placeholder="导案支持" />
                  <AutoGrowTextarea value={detailedData.preLearning.assessment} onChange={(e) => patchLesson({ preLearning: { ...detailedData.preLearning, assessment: e.target.value } })} className="w-full min-h-[52px] text-xs border rounded p-2" placeholder="评价设计" />
                </div>
              )}
              {detailedData && reviseTarget === 'inClass' && (
                <div className="mb-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                  <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>结构化编辑器：课中议学</span>
                    <div className="flex gap-1">
                      <button onClick={addInClassActivity} className="text-[11px] px-2 py-1 bg-white border rounded">新增活动</button>
                      {activeActivity && <button onClick={() => removeInClassActivity(activeActivity.id)} className="text-[11px] px-2 py-1 bg-white border rounded">删除活动</button>}
                    </div>
                  </div>
                  <select value={activeActivity?.id || ''} onChange={(e) => setStructuredActivityId(e.target.value)} className="w-full text-xs border rounded p-2">
                    {(detailedData.inClass || []).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                  {activeActivity && (
                    <>
                      <input value={activeActivity.title} onChange={(e) => patchInClass(activeActivity.id, 'title', e.target.value)} className="w-full text-xs border rounded p-2" placeholder="活动标题" />
                      <AutoGrowTextarea value={activeActivity.studentTask} onChange={(e) => patchInClass(activeActivity.id, 'studentTask', e.target.value)} className="w-full min-h-[70px] text-xs border rounded p-2" placeholder="学生活动步骤" />
                      <AutoGrowTextarea value={activeActivity.teacherGuidance} onChange={(e) => patchInClass(activeActivity.id, 'teacherGuidance', e.target.value)} className="w-full min-h-[70px] text-xs border rounded p-2" placeholder="教师支架与追问" />
                      <AutoGrowTextarea value={activeActivity.evaluation} onChange={(e) => patchInClass(activeActivity.id, 'evaluation', e.target.value)} className="w-full min-h-[52px] text-xs border rounded p-2" placeholder="评价方式" />
                    </>
                  )}
                </div>
              )}
              {detailedData && reviseTarget === 'postLearning' && (
                <div className="mb-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                  <div className="text-xs font-semibold text-slate-700">结构化编辑器：课后悟学</div>
                  <AutoGrowTextarea value={detailedData.postLearning.homeworkBasic} onChange={(e) => patchLesson({ postLearning: { ...detailedData.postLearning, homeworkBasic: e.target.value } })} className="w-full min-h-[72px] text-xs border rounded p-2" placeholder="基础作业" />
                  <AutoGrowTextarea value={detailedData.postLearning.homeworkExtension} onChange={(e) => patchLesson({ postLearning: { ...detailedData.postLearning, homeworkExtension: e.target.value } })} className="w-full min-h-[72px] text-xs border rounded p-2" placeholder="拓展作业" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={detailedData.postLearning.estimatedTimeBasic} onChange={(e) => patchLesson({ postLearning: { ...detailedData.postLearning, estimatedTimeBasic: e.target.value } })} className="text-xs border rounded p-2" placeholder="基础作业时长" />
                    <input value={detailedData.postLearning.estimatedTimeExtension} onChange={(e) => patchLesson({ postLearning: { ...detailedData.postLearning, estimatedTimeExtension: e.target.value } })} className="text-xs border rounded p-2" placeholder="拓展作业时长" />
                  </div>
                </div>
              )}
              <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={enableWebSearch}
                  onChange={(e) => setEnableWebSearch(e.target.checked)}
                />
                启用联网检索增强回答
              </label>
              <button
                onClick={() => setShowDebugDrawer((v) => !v)}
                className="mb-2 text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                {showDebugDrawer ? '收起联网调试' : '展开联网调试'}
              </button>
              {showDebugDrawer && (
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
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="请输入你的问题..."
                  className="flex-1 px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                  disabled={isGenerating}
                />
                <button
                  onClick={() => assetInputRef.current?.click()}
                  className="w-10 h-10 bg-white border border-gray-200 hover:bg-brand-50 text-slate-600 hover:text-brand-700 rounded-lg flex items-center justify-center transition-colors"
                  title="上传图片/PDF做OCR"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isGenerating}
                  className="w-10 h-10 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white rounded-lg flex items-center justify-center transition-colors"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
          </div>
        </div>
      )}

      {/* Floating Action Button - Always visible when panel is closed */}
      {!isAiPanelOpen && (
        <button
          data-guide="design-ai-open"
          onClick={() => setIsAiPanelOpen(true)}
          className="fixed right-8 bottom-8 w-14 h-14 bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-30"
          title="打开 AI 助手"
        >
          <MessageCircle className="h-6 w-6" />
          {isGenerating && <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white animate-pulse" />}
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div className="mb-10">
            <h2 className="text-lg font-bold text-slate-900 border-l-4 border-brand-500 pl-3 mb-6 flex items-center">{title}</h2>
            {children}
        </div>
    );
}

function InfoBlock({ label, content, onChange }: { label: string, content: string; onChange?: (value: string) => void }) {
    return (
        <div className="grid grid-cols-[100px_1fr] gap-4">
            <div className="font-bold text-slate-700 text-right pt-2">{label}</div>
            {onChange ? (
              <AutoGrowTextarea value={content} onChange={(e) => onChange(e.target.value)} className="text-slate-600 bg-white p-3 rounded-lg border border-gray-100 min-h-[96px]" />
            ) : (
              <div className="text-slate-600 bg-white p-3 rounded-lg border border-gray-100">{content}</div>
            )}
        </div>
    );
}

function AutoGrowTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxRows?: number }) {
  const { className, minRows = 3, maxRows = 12, onInput, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const minHeight = minRows * 24;
    const maxHeight = maxRows * 24;
    const next = Math.max(el.scrollHeight, minHeight);
    el.style.height = `${Math.min(next, maxHeight)}px`;
    el.style.overflowY = next > maxHeight ? 'auto' : 'hidden';
  };
  useLayoutEffect(() => {
    resize();
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      {...rest}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={cn("w-full resize-y", className)}
    />
  );
}
