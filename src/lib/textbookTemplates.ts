type TextbookTemplate = {
  id: string;
  subject: string;
  name: string;
  gradeBands: string[];
  versionKeywords: string[];
  volumeKeywords: string[];
  structureOutline: string[];
  unitRules: string[];
  lessonRules: string[];
  difficultPointPatterns: string[];
};

const TEMPLATES: TextbookTemplate[] = [
  {
    id: 'chinese-renjiao-junior',
    subject: 'chinese',
    name: '语文·人教版·初中通用',
    gradeBands: ['7', '8', '9'],
    versionKeywords: ['人教', '部编'],
    volumeKeywords: ['上册', '下册'],
    structureOutline: ['单元导语', '课文精读', '课文略读/自读', '写作', '综合性学习', '名著导读', '课外古诗词诵读'],
    unitRules: ['按单元学习任务群组织，先阅读后表达', '精读课先文本证据再主题概括', '写作课与阅读单元主题联动', '综合性学习至少设置一次合作展示'],
    lessonRules: ['每课时包含语言积累、思维训练、表达迁移', '活动顺序遵循输入-加工-输出', '评价优先采用表现性任务与量规'],
    difficultPointPatterns: ['文意深层理解与证据表达', '写作立意与结构组织', '文言词句迁移应用']
  },
  {
    id: 'math-renjiao-junior',
    subject: 'math',
    name: '数学·人教版·初中通用',
    gradeBands: ['7', '8', '9'],
    versionKeywords: ['人教'],
    volumeKeywords: ['上册', '下册'],
    structureOutline: ['章', '节', '信息技术应用/数学活动', '复习题', '小结'],
    unitRules: ['按概念形成-性质探究-方法应用推进', '每章至少包含一次模型化问题', '复习课围绕错因与变式设计'],
    lessonRules: ['每课时突出问题情境、推理过程、规范表达', '例题与练习需有梯度', '评价包含过程性提问与结果性检测'],
    difficultPointPatterns: ['概念抽象与本质辨析', '几何推理链条构建', '函数关系建模与解释']
  },
  {
    id: 'english-renjiao-junior',
    subject: 'english',
    name: '英语·人教版·初中通用',
    gradeBands: ['7', '8', '9'],
    versionKeywords: ['人教', 'pep'],
    volumeKeywords: ['上册', '下册'],
    structureOutline: ['Unit 主题', 'Section A', 'Section B', 'Self Check', 'Project/Reading'],
    unitRules: ['围绕主题意义建构，遵循听说读写整合', '词汇语法服务语篇理解与任务表达', '单元末设置迁移创新任务'],
    lessonRules: ['课时顺序遵循输入-操练-输出', '阅读课突出篇章结构与信息整合', '写作课提供支架与同伴互评'],
    difficultPointPatterns: ['语篇层信息整合与推断', '语法在真实表达中的迁移', '口头/书面任务连贯表达']
  },
  {
    id: 'english-waiyan-junior',
    subject: 'english',
    name: '英语·外研版·初中通用',
    gradeBands: ['7', '8', '9'],
    versionKeywords: ['外研'],
    volumeKeywords: ['上册', '下册'],
    structureOutline: ['Module 主题', 'Unit 1 听说', 'Unit 2 阅读', 'Unit 3 语言运用', 'Around the world/写作'],
    unitRules: ['按模块主题推进，强调任务链', '听说与阅读互相支撑', '语言运用课落实语法功能化'],
    lessonRules: ['每课时围绕真实语境任务', '课堂产出需可评价可展示', '作业设计分基础与拓展'],
    difficultPointPatterns: ['主题语境中的功能表达', '跨语篇信息重组', '语言准确性与流利性平衡']
  },
  {
    id: 'subject-generic',
    subject: 'generic',
    name: '通用教材结构模板',
    gradeBands: [],
    versionKeywords: [],
    volumeKeywords: [],
    structureOutline: ['单元导入', '核心内容学习', '实践活动', '巩固提升', '综合评价'],
    unitRules: ['依据教材先后顺序安排课时', '先知识建构后迁移应用', '目标、活动、评价保持一致'],
    lessonRules: ['每课时包含目标、任务、评价证据', '活动层次清晰并可操作', '课堂与作业形成闭环'],
    difficultPointPatterns: ['关键概念理解与迁移', '核心方法应用', '综合任务达成']
  }
];

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '');

const parseGradeNum = (grade: string) => {
  const map: Record<string, string> = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' };
  const digit = grade.match(/\d+/)?.[0];
  if (digit) return digit;
  const zh = grade.match(/[一二三四五六七八九]/)?.[0];
  return zh ? map[zh] : '';
};

const scoreTemplate = (tpl: TextbookTemplate, args: { subject: string; grade: string; textbookVersion: string; volume: string }) => {
  let score = 0;
  if (tpl.subject === args.subject) score += 20;
  if (tpl.subject === 'generic') score += 1;
  const gradeNum = parseGradeNum(args.grade);
  if (gradeNum && tpl.gradeBands.includes(gradeNum)) score += 8;
  const version = normalize(args.textbookVersion);
  if (tpl.versionKeywords.some((kw) => version.includes(normalize(kw)))) score += 30;
  const volume = normalize(args.volume);
  if (tpl.volumeKeywords.some((kw) => volume.includes(normalize(kw)))) score += 5;
  return score;
};

export const matchTextbookTemplate = (args: { subject: string; grade: string; textbookVersion: string; volume: string }) => {
  const ranked = TEMPLATES
    .map((tpl) => ({ tpl, score: scoreTemplate(tpl, args) }))
    .sort((a, b) => b.score - a.score);
  const picked = ranked[0]?.tpl || TEMPLATES[TEMPLATES.length - 1];
  return picked;
};

export const formatTextbookTemplate = (tpl: TextbookTemplate) => {
  const lines = [
    `模板：${tpl.name}`,
    `结构主线：${tpl.structureOutline.join(' -> ')}`,
    '单元规则：',
    ...tpl.unitRules.map((x, i) => `${i + 1}. ${x}`),
    '课时规则：',
    ...tpl.lessonRules.map((x, i) => `${i + 1}. ${x}`),
    `常见难点模式：${tpl.difficultPointPatterns.join('；')}`
  ];
  return lines.join('\n');
};

export const buildTemplateContext = (args: { subject: string; grade: string; textbookVersion: string; volume: string }) => {
  const template = matchTextbookTemplate(args);
  return formatTextbookTemplate(template);
};

