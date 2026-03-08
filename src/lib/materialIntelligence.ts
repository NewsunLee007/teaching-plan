export type MaterialIntent = 'single_lesson' | 'unit' | 'mixed' | 'unknown';

export type MaterialFlowMode = 'auto' | 'unit' | 'lesson';

export type MaterialPipeline = 'direct_text' | 'local_pdf' | 'ocr_image' | 'ocr_document' | 'ocr_pdf' | 'unknown';

export type MaterialAssessment = {
  intent: MaterialIntent;
  confidence: number;
  completenessScore: number;
  reason: string;
  recommendedMode: MaterialFlowMode;
  pipelines: Array<{ fileName: string; pipeline: MaterialPipeline }>;
  signature: string;
};

type MaterialFeature = {
  signature: string;
  confirmedMode: MaterialFlowMode;
  intent: MaterialIntent;
  count: number;
  lastSeenAt: number;
};

const FEATURE_KEY = 'materialFeatureLibrary';

const LESSON_PATTERNS = [
  /第\s*\d+\s*课/,
  /课时/,
  /\blesson\s*\d+/i,
  /学习目标/,
  /教学目标/,
  /导入/,
  /教学过程/
];

const UNIT_PATTERNS = [
  /单元/,
  /\bunit\s*\d+/i,
  /目录/,
  /课时安排/,
  /核心素养/,
  /单元目标/,
  /评价证据/
];

const compact = (text: string) => text.replace(/\s+/g, ' ').trim();

const detectPipelineByFile = (file: File): MaterialPipeline => {
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.json') || name.endsWith('.csv')) return 'direct_text';
  if (file.type.startsWith('image/')) return 'ocr_image';
  if (name.endsWith('.pdf')) return 'local_pdf';
  if (name.endsWith('.ppt') || name.endsWith('.pptx') || name.endsWith('.doc') || name.endsWith('.docx')) return 'ocr_document';
  return 'unknown';
};

const buildSignature = (files: File[], text: string) => {
  const head = compact(text).slice(0, 1200).toLowerCase();
  const marks = [
    files.map((f) => f.name.split('.').pop()?.toLowerCase() || 'unknown').join('|'),
    /(单元|unit)/i.test(head) ? 'unit-mark' : 'no-unit-mark',
    /(课时|lesson)/i.test(head) ? 'lesson-mark' : 'no-lesson-mark',
    String(Math.min(20, (head.match(/\b(unit|lesson)\b/gi) || []).length))
  ];
  return marks.join('::');
};

const loadFeatures = (): MaterialFeature[] => {
  const raw = localStorage.getItem(FEATURE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MaterialFeature[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveFeatures = (items: MaterialFeature[]) => {
  localStorage.setItem(FEATURE_KEY, JSON.stringify(items.slice(0, 200)));
};

export const rememberMaterialDecision = (assessment: MaterialAssessment, confirmedMode: MaterialFlowMode) => {
  const items = loadFeatures();
  const idx = items.findIndex((i) => i.signature === assessment.signature);
  const next: MaterialFeature = {
    signature: assessment.signature,
    confirmedMode,
    intent: assessment.intent,
    count: (idx >= 0 ? items[idx].count : 0) + 1,
    lastSeenAt: Date.now()
  };
  if (idx >= 0) items[idx] = next;
  else items.unshift(next);
  saveFeatures(items);
};

const findFeatureHint = (signature: string) => loadFeatures().find((f) => f.signature === signature);

const scoreByPatterns = (text: string, patterns: RegExp[]) => patterns.reduce((acc, p) => acc + (p.test(text) ? 1 : 0), 0);

export const assessMaterialIntent = (files: File[], text: string): MaterialAssessment => {
  const normalized = compact(text);
  const lessonScore = scoreByPatterns(normalized, LESSON_PATTERNS);
  const unitScore = scoreByPatterns(normalized, UNIT_PATTERNS);
  const structureHints = (normalized.match(/第\s*\d+\s*[课章节单元]/g) || []).length;
  const completenessScore = Math.min(100, Math.round((normalized.length / 24000) * 100));
  let intent: MaterialIntent = 'unknown';
  if (unitScore >= 3 && structureHints >= 2) intent = 'unit';
  else if (lessonScore >= 3 && unitScore <= 2) intent = 'single_lesson';
  else if (unitScore >= 2 && lessonScore >= 2) intent = 'mixed';
  const confidence = Math.min(0.96, Math.max(0.45, (Math.abs(unitScore - lessonScore) + (structureHints > 1 ? 1 : 0)) / 8 + 0.45));
  const reason = intent === 'unit'
    ? '检测到明显单元结构信号（单元/目录/课时安排/多课序号）'
    : intent === 'single_lesson'
      ? '检测到单课时信号（课时目标/教学过程/活动环节）'
      : intent === 'mixed'
        ? '同时包含单元与课时特征，建议人工确认'
        : '素材特征不足，建议人工确认处理模式';
  const signature = buildSignature(files, normalized);
  const featureHint = findFeatureHint(signature);
  let recommendedMode: MaterialFlowMode = intent === 'single_lesson' ? 'lesson' : 'unit';
  if (intent === 'unknown' || intent === 'mixed') recommendedMode = 'auto';
  if (featureHint && featureHint.count >= 2) {
    recommendedMode = featureHint.confirmedMode;
  }
  return {
    intent,
    confidence,
    completenessScore,
    reason,
    recommendedMode,
    pipelines: files.map((file) => ({ fileName: file.name, pipeline: detectPipelineByFile(file) })),
    signature
  };
};

