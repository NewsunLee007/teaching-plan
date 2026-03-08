import { type DetailedLesson } from './types';

export type PptLanguageMode = 'zh-to-zh' | 'zh-to-en' | 'en-to-en';

export type PptTool = 'wps' | 'copilot' | 'canva';

export type PromptVersion = {
  id: string;
  createdAt: number;
  mode: PptLanguageMode;
  tool: PptTool;
  prompt: string;
};

const sectionWeight: Record<string, number> = {
  objectives: 5,
  keyPoints: 5,
  difficultPoints: 5,
  inClass: 4,
  preLearning: 3,
  postLearning: 3,
  boardDesign: 2,
  reflection: 1
};

const takeTopSentences = (text: string, max = 4) => text
  .split(/\n|。|\.|；|;/)
  .map((x) => x.trim())
  .filter(Boolean)
  .slice(0, max)
  .join('；');

const subjectTemplateMap: Record<string, { zh: string; en: string }> = {
  chinese: { zh: '突出文本细读、证据表达、写作迁移与文化理解。', en: 'Highlight close reading, evidence-based expression, writing transfer, and cultural literacy.' },
  math: { zh: '突出问题情境、推理论证、建模应用与变式训练。', en: 'Highlight problem contexts, reasoning, modeling application, and variation practice.' },
  english: { zh: '突出主题语境、语篇结构、任务驱动输出与分层反馈。', en: 'Highlight thematic contexts, discourse structure, task-based output, and differentiated feedback.' },
  science: { zh: '突出探究流程、变量控制、证据解释与安全规范。', en: 'Highlight inquiry flow, variable control, evidence interpretation, and safety routines.' },
  society: { zh: '突出议题链、史料证据、价值辨析与现实连接。', en: 'Highlight issue chains, evidence from sources, value reasoning, and real-world connection.' }
};

const buildElements = (lesson: DetailedLesson) => {
  const objectives = lesson.objectives.map((o) => `${o.content}（评价：${o.assessment}）`).slice(0, 4).join('\n');
  const inClass = lesson.inClass.map((a, i) => `活动${i + 1} ${a.title}：${takeTopSentences(a.studentTask, 2)}；教师支架：${takeTopSentences(a.teacherGuidance, 2)}`).slice(0, 4).join('\n');
  return {
    title: lesson.topic,
    basic: `日期：${lesson.date}，课时：${lesson.period}，课型：${lesson.type}，授课对象：${lesson.targetStudent}`,
    coreContent: takeTopSentences(lesson.coreContent, 5),
    studentAnalysis: takeTopSentences(lesson.studentAnalysis, 4),
    keyPoints: takeTopSentences(lesson.keyPoints, 4),
    difficultPoints: takeTopSentences(lesson.difficultPoints, 4),
    objectives,
    preLearning: takeTopSentences(lesson.preLearning.studentTask, 4),
    inClass,
    postLearning: `基础作业：${takeTopSentences(lesson.postLearning.homeworkBasic, 3)}；拓展作业：${takeTopSentences(lesson.postLearning.homeworkExtension, 3)}`,
    boardDesign: takeTopSentences(lesson.boardDesign, 3),
    reflection: takeTopSentences(lesson.reflection, 3)
  };
};

const toolInstruction: Record<PptTool, string> = {
  wps: '输出可直接用于 WPS AI 生成课堂PPT，页标题要简洁，支持逐页备注。',
  copilot: '输出可直接用于 Microsoft Copilot 生成演示文稿，包含每页 speaker notes。',
  canva: '输出可直接用于 Canva AI 生成演示，强调视觉层次、图文比例和互动页。'
};

export const generatePptPrompt = (args: {
  lesson: DetailedLesson;
  subject: string;
  mode: PptLanguageMode;
  tool: PptTool;
}) => {
  const element = buildElements(args.lesson);
  const subjectGuide = subjectTemplateMap[args.subject] || subjectTemplateMap.english;
  const needEnglish = args.mode === 'zh-to-en' || args.mode === 'en-to-en';
  const langGuide = args.mode === 'zh-to-zh'
    ? '提示词与PPT内容均使用中文。'
    : args.mode === 'zh-to-en'
      ? '提示词用中文描述，但要求最终PPT页面文案全部使用英文。'
      : '提示词与PPT内容均使用英文。';
  const weighted = [
    ['objectives', element.objectives],
    ['keyPoints', element.keyPoints],
    ['difficultPoints', element.difficultPoints],
    ['inClass', element.inClass],
    ['preLearning', element.preLearning],
    ['postLearning', element.postLearning],
    ['boardDesign', element.boardDesign],
    ['reflection', element.reflection]
  ].sort((a, b) => sectionWeight[b[0]] - sectionWeight[a[0]]);
  const detailLines = weighted.map(([k, v]) => `${k}: ${v}`).join('\n');
  const prompt = args.mode === 'en-to-en'
    ? [
      `You are an instructional designer. Create a classroom PPT plan for "${args.lesson.topic}".`,
      `Language rule: The prompt and final PPT content must both be in English.`,
      `Tool requirement: ${toolInstruction[args.tool]}`,
      `Subject guideline: ${subjectGuide.en}`,
      `Lesson metadata: ${element.basic}`,
      `Core content: ${element.coreContent}`,
      `Student profile: ${element.studentAnalysis}`,
      `Generate 12-16 slides with: cover, objectives, key concepts, activity flow, checkpoints, differentiated homework, board summary, reflection.`,
      `For each slide output: title + 3-5 bullets + visual suggestion + speaker note.`,
      `Teaching elements:\n${detailLines}`
    ].join('\n\n')
    : [
      `请作为资深教研设计师，生成一份 ${args.lesson.topic} 的课堂PPT方案。`,
      langGuide,
      toolInstruction[args.tool],
      needEnglish ? `学科特征（英文表达）：${subjectGuide.en}` : `学科特征：${subjectGuide.zh}`,
      `基础信息：${element.basic}`,
      `核心内容：${element.coreContent}`,
      `学情分析：${element.studentAnalysis}`,
      `请输出 12-16 页PPT，至少包含：封面、学习目标、关键知识讲解、活动任务、评价节点、分层作业、板书总结、反思页。`,
      `每页按“页标题 + 3-5条要点 + 可视化建议 + 讲解备注”输出。`,
      `教学要素明细：\n${detailLines}`
    ].join('\n\n');
  return prompt;
};

const HISTORY_KEY = 'pptPromptHistory';

export const loadPromptVersions = (): Record<string, PromptVersion[]> => {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, PromptVersion[]>;
  } catch {
    return {};
  }
};

export const savePromptVersion = (lessonId: string, version: PromptVersion) => {
  const all = loadPromptVersions();
  const list = all[lessonId] || [];
  all[lessonId] = [version, ...list].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
};
