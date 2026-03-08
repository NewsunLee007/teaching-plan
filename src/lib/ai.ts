export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const providerEndpoints: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  moonshot: 'https://api.moonshot.cn/v1/chat/completions',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
};

const providerModelEndpoints: Record<string, string[]> = {
  openai: ['https://api.openai.com/v1/models'],
  deepseek: ['https://api.deepseek.com/v1/models'],
  moonshot: ['https://api.moonshot.cn/v1/models'],
  qwen: ['https://dashscope.aliyuncs.com/compatible-mode/v1/models'],
  zhipu: ['https://open.bigmodel.cn/api/paas/v4/models'],
  anthropic: ['https://api.anthropic.com/v1/models'],
  gemini: ['https://generativelanguage.googleapis.com/v1beta/models'],
  custom: []
};

const pickEndpoint = (provider: string) => {
  return providerEndpoints[provider] || providerEndpoints.openai;
};

const parseModelList = (payload: unknown): string[] => {
  if (!payload || typeof payload !== 'object') return [];
  const raw = payload as Record<string, unknown>;
  const candidates = [raw.data, raw.models, raw.items];
  for (const item of candidates) {
    if (!Array.isArray(item)) continue;
    const names = item
      .map((m) => {
        if (!m || typeof m !== 'object') return '';
        const rec = m as Record<string, unknown>;
        const id = rec.id ?? rec.name ?? rec.model ?? rec.displayName;
        return typeof id === 'string' ? id : '';
      })
      .filter(Boolean);
    if (names.length > 0) return Array.from(new Set(names));
  }
  return [];
};

const stripFences = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    const firstLineEnd = trimmed.indexOf('\n');
    const rest = firstLineEnd === -1 ? '' : trimmed.slice(firstLineEnd + 1);
    const fenceEnd = rest.lastIndexOf('```');
    return fenceEnd === -1 ? rest.trim() : rest.slice(0, fenceEnd).trim();
  }
  return trimmed;
};

const parseJsonFromText = (text: string) => {
  const cleaned = stripFences(text);
  const direct = cleaned.trim();
  if (direct.startsWith('{') || direct.startsWith('[')) {
    try {
      return JSON.parse(direct);
    } catch (err) {
      if (err instanceof Error) {
        const prefix = direct.slice(0, 200);
        throw new Error(`JSON 解析失败：${err.message}. 内容片段：${prefix}`);
      }
      throw new Error('JSON 解析失败');
    }
  }
  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  const hasArray = arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart;
  const hasObject = objStart !== -1 && objEnd !== -1 && objEnd > objStart;
  const sliceText = hasArray
    ? cleaned.slice(arrStart, arrEnd + 1)
    : hasObject
      ? cleaned.slice(objStart, objEnd + 1)
      : '';
  if (!sliceText) {
    throw new Error('AI 返回内容不是 JSON');
  }
  return JSON.parse(sliceText);
};

export async function chatCompletion(args: {
  apiKey: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}) {
  const endpoint = pickEndpoint(args.provider);
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: args.temperature ?? 0.7
    })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || 'AI 请求失败');
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return String(content);
}

export async function generateUnitPlanAI(args: {
  apiKey: string;
  provider: string;
  model: string;
  subject: string;
  grade: string;
  textbookName: string;
  unitTitle: string;
  outputLanguage?: 'zh' | 'en';
  standards: string;
  textbookContent: string;
  textbookTemplate?: string;
  schedule: { day: number; topic: string; type: string }[];
  aiParameters?: {
    teachingFocus?: string;
    activityPreference?: string;
    assessmentStyle?: string;
    differentiationLevel?: string;
    teachingStyle?: string;
  };
  instruction?: string;
}) {
  const teachingFocus = args.aiParameters?.teachingFocus || '素养导向';
  const activityPreference = args.aiParameters?.activityPreference || '探究式';
  const assessmentStyle = args.aiParameters?.assessmentStyle || '形成性评价';
  
  const system = `你是学校教研助理。你必须严格按模板字段输出 JSON，不要输出其他文本。

【AI 生成参数】
- 教学重点：${teachingFocus}
- 活动偏好：${activityPreference}
- 评价方式：${assessmentStyle}

请根据这些参数生成贴合教学实践的设计。`;
  const languageRule = args.outputLanguage === 'en'
    ? '所有字段统一使用英文输出。'
    : '所有字段统一使用中文输出。';
  const user = `请根据课程标准与教材生成单元备课数据，必须完全覆盖模板字段。模板字段如下：
{
  "textbookAnalysis": "string",
  "studentAnalysis": "string",
  "coreKnowledge": "string(换行分条)",
  "unitObjectives": "string(换行分条)",
  "unitAssessment": "string(换行分条)",
  "unitLessonPlan": "string(换行分条)",
  "unitHomeworkPlan": "string(换行分条)",
  "unitReflection": "string",
  "individualGuidance": "string"
}
约束：
1) 必须体现课程标准与学科核心素养。
2) 结合年级、教材与单元主题。
3) 单元教材分析、单元学情分析、单元核心知识必须采用“分段式”叙述，不得使用项目符号、编号列表或逐行分点。
4) 单元层面“单元课时规划”只描述每课时的【课题/课型/核心任务/关键活动/评价证据/作业要点】与课时之间的逻辑，不得出现“课前/课中/课后/导案/学案”等课时详案结构词。
5) 输出篇幅要更充分：每个字段内容可直接用于备课表填写，避免空泛口号。
6) ${languageRule}
7) 输出为严格 JSON，不要代码块。
输入信息：
学科：${args.subject}
年级：${args.grade}
教材：${args.textbookName}
单元主题：${args.unitTitle}
课程标准：${args.standards}
教材内容（节选）：${args.textbookContent}
教材版本结构模板：${args.textbookTemplate || '无'}
课时安排：${args.schedule.map(s => `第${s.day}天 ${s.topic}（${s.type}）`).join('; ')}
${args.instruction ? `补充优化要求：${args.instruction}` : ''}`;
  const content = await chatCompletion({
    apiKey: args.apiKey,
    provider: args.provider,
    model: args.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.7
  });
  return parseJsonFromText(content);
}

export async function generateDetailedLessonAI(args: {
  apiKey: string;
  provider: string;
  model: string;
  subject: string;
  grade: string;
  textbookName: string;
  unitTitle: string;
  lessonTitle: string;
  lessonType: string;
  standards: string;
  unitObjectives: string;
  unitAssessment: string;
  coreKnowledge: string;
  studentAnalysis: string;
  unitHomeworkPlan: string;
  textbookContent: string;
  textbookStructure?: string;
  textbookTemplate?: string;
  instruction?: string;
  aiParameters?: {
    teachingFocus?: string;
    activityPreference?: string;
    assessmentStyle?: string;
    differentiationLevel?: string;
    teachingStyle?: string;
  };
}) {
  const teachingFocus = args.aiParameters?.teachingFocus || '素养导向';
  const activityPreference = args.aiParameters?.activityPreference || '探究式';
  const assessmentStyle = args.aiParameters?.assessmentStyle || '形成性评价';
  const differentiationLevel = args.aiParameters?.differentiationLevel || '标准';
  const teachingStyle = args.aiParameters?.teachingStyle || '引导探究';
  
  const system = `你是学校教研助理。你必须严格按模板字段输出 JSON，不要输出其他文本。

【AI 生成参数】
- 教学重点：${teachingFocus}
- 活动偏好：${activityPreference}
- 评价方式：${assessmentStyle}
- 分层程度：${differentiationLevel}
- 教学风格：${teachingStyle}

请根据这些参数生成贴合教学实践的课时设计。`;
  const user = `请根据“三学联网”课时教学设计模板生成课时设计数据，必须完全覆盖字段。模板字段如下：
{
  "date": "YYYY-MM-DD",
  "weekDay": "星期X",
  "period": "string",
  "type": "string",
  "targetStudent": "string",
  "textbook": "string",
  "topic": "string",
  "coreContent": "string",
  "studentAnalysis": "string",
  "keyPoints": "string",
  "difficultPoints": "string",
  "objectives": [{"content": "string", "assessment": "string"}],
  "preLearning": {"studentTask": "string", "teacherGuidance": "string", "assessment": "string", "intent": "string"},
  "inClass": [{"title": "string", "studentTask": "string", "teacherGuidance": "string", "evaluation": "string", "designIntent": "string"}],
  "postLearning": {
    "homeworkBasic": "string",
    "homeworkExtension": "string",
    "estimatedTimeBasic": "string",
    "estimatedTimeExtension": "string",
    "attributes": {"source": ["string"], "category": ["string"]}
  },
  "boardDesign": "string",
  "reflection": "string"
}
约束：
1) 必须体现课程标准与学科核心素养。
2) 结合年级、教材与单元/课题。
3) 学习目标与评价要对应。
4) 必须“可落地可操作”：每个活动/任务写清楚【情境/问题或任务/学生活动步骤/教师支架/预设困难与应对/产出物/评价方式/时间建议】；不能只给概述。
5) 结合《温州市教学常规(2025版)》的通用要求：目标表述规范（行为动词+内容+可观察表现），任务链结构化，过程性评价嵌入关键节点，作业分层（基础/拓展/挑战或必做/选做/创做），并给出具体示例。
6) 输出要详实：preLearning 至少 6 行要点；每个 inClass 活动的 studentTask/teacherGuidance/evaluation/designIntent 各至少 6 行；postLearning 两类作业各至少 6 行并标注用时；reflection 至少 6 行改进点。
7) 必须严格贴合教材原文与教材结构，至少明确引用 3 处“教材内容（节选）”中的知识点/语篇/任务，不得编造教材外主内容。
8) keyPoints 与 difficultPoints 不能为空，且各不少于 6 行；difficultPoints 必须体现“难在何处+对应支架策略”。
9) 输出为严格 JSON，不要代码块。
输入信息：
学科：${args.subject}
年级：${args.grade}
教材：${args.textbookName}
单元主题：${args.unitTitle}
课题：${args.lessonTitle}
课型：${args.lessonType}
课程标准：${args.standards}
教材内容（节选）：${args.textbookContent}
单元目标：${args.unitObjectives}
评价证据：${args.unitAssessment}
核心知识：${args.coreKnowledge}
学情分析：${args.studentAnalysis}
单元作业规划：${args.unitHomeworkPlan}`;
  const structureHint = args.textbookStructure ? `\n教材结构索引（按先后顺序）：\n${args.textbookStructure}` : '';
  const templateHint = args.textbookTemplate ? `\n教材版本结构模板：\n${args.textbookTemplate}` : '';
  const extra = args.instruction ? `\n额外要求：${args.instruction}` : '';
  const content = await chatCompletion({
    apiKey: args.apiKey,
    provider: args.provider,
    model: args.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${user}${structureHint}${templateHint}${extra}` }
    ],
    temperature: 0.7
  });
  return parseJsonFromText(content);
}

export async function updateDetailedLessonAI(args: {
  apiKey: string;
  provider: string;
  model: string;
  lessonJson: string;
  instruction: string;
}) {
  const system = `你是学校教研助理。你必须严格按模板字段输出 JSON，不要输出其他文本。`;
  const user = `请根据教师的修改要求更新课时设计，保持模板字段完整并返回完整 JSON。
当前课时设计 JSON：
${args.lessonJson}
修改要求：
${args.instruction}
输出为严格 JSON，不要代码块。`;
  const content = await chatCompletion({
    apiKey: args.apiKey,
    provider: args.provider,
    model: args.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.4
  });
  return parseJsonFromText(content);
}

export async function generateLessonScheduleAI(args: {
  apiKey: string;
  provider: string;
  model: string;
  subject: string;
  grade: string;
  textbookName: string;
  unitTitle: string;
  unitLessonPlan: string;
  unitObjectives: string;
  coreKnowledge: string;
  textbookContent: string;
  textbookStructure?: string;
  textbookTemplate?: string;
  lessonTypes: string[];
  days: number;
}) {
  const system = `你是学校教研助理。你必须严格按模板字段输出 JSON，不要输出其他文本。`;
  const user = `请根据单元课时规划与教材内容生成课时安排，输出 JSON 数组，长度为 ${args.days}。每项包含：
{ "topic": "string", "type": "string" }
要求：
1) 课题与课型必须匹配单元课时规划与教材内容。
2) 课型必须且只能从“${args.lessonTypes.join('/')}”中选择，严禁输出其他课型。
3) 必须严格遵循教材内容先后顺序（先出现的课题先排），不得随意跳跃。
4) 若教材结构中包含章节/单元标题，输出顺序必须与其一致。
5) 输出为严格 JSON，不要代码块。
输入信息：
学科：${args.subject}
年级：${args.grade}
教材：${args.textbookName}
单元主题：${args.unitTitle}
单元课时规划：${args.unitLessonPlan}
单元学习目标：${args.unitObjectives}
单元核心知识：${args.coreKnowledge}
教材内容（节选）：${args.textbookContent}
教材结构索引：${args.textbookStructure || '无'}
教材版本结构模板：${args.textbookTemplate || '无'}`;
  const content = await chatCompletion({
    apiKey: args.apiKey,
    provider: args.provider,
    model: args.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.5
  });
  return parseJsonFromText(content);
}

export async function fetchProviderModels(args: {
  apiKey: string;
  provider: string;
}) {
  const endpoints = providerModelEndpoints[args.provider] || providerModelEndpoints.openai;
  if (endpoints.length === 0) {
    throw new Error('HTTP 405: 当前服务商不支持自动拉取模型列表');
  }
  let lastError = '';
  for (const endpoint of endpoints) {
    try {
      const headers: Record<string, string> = {};
      let url = endpoint;
      if (args.provider === 'gemini') {
        url = `${endpoint}?key=${encodeURIComponent(args.apiKey)}`;
      } else if (args.provider === 'anthropic') {
        headers['x-api-key'] = args.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers.Authorization = `Bearer ${args.apiKey}`;
      }
      const resp = await fetch(url, { method: 'GET', headers });
      if (!resp.ok) {
        const body = await resp.text();
        lastError = `HTTP ${resp.status}: ${body || '模型列表接口请求失败'}`;
        continue;
      }
      const data = await resp.json();
      const models = parseModelList(data);
      if (models.length > 0) return models;
      lastError = '模型列表为空';
    } catch (err) {
      lastError = err instanceof Error ? err.message : '模型拉取失败';
    }
  }
  throw new Error(lastError || '模型拉取失败');
}

export async function fetchTextbookVersionsAI(args: {
  apiKey: string;
  provider: string;
  model: string;
  subject: string;
  grade: string;
}) {
  const system = `你是中国基础教育教材顾问。请返回主流教材版本列表。输出严格 JSON 数组，不要其他文本。`;
  const user = `请给出中国市面上主流的${args.subject}${args.grade}年级教材版本名称，返回长度 4-8 的字符串数组。`;
  const content = await chatCompletion({
    apiKey: args.apiKey,
    provider: args.provider,
    model: args.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.3
  });
  const parsed = parseJsonFromText(content);
  if (Array.isArray(parsed)) {
    return parsed.map((x) => String(x)).filter(Boolean).slice(0, 8);
  }
  return [];
}

export async function generateTextbookProfileAI(args: {
  apiKey: string;
  provider: string;
  model: string;
  subject: string;
  grade: string;
  textbookVersion: string;
}) {
  const system = `你是中国基础教育教材研究员。你必须输出严格 JSON，不要输出其他文本。`;
  const user = `请基于教材版本生成教材画像，用于AI备课增强。输出 JSON：
{
  "style": "教材风格概述",
  "requirements": "能力与评价要求",
  "contentFocus": "内容结构与重难点",
  "teachingTips": "教学实施建议"
}
输入：
学科：${args.subject}
年级：${args.grade}
教材版本：${args.textbookVersion}`;
  const content = await chatCompletion({
    apiKey: args.apiKey,
    provider: args.provider,
    model: args.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.4
  });
  return parseJsonFromText(content) as {
    style?: string;
    requirements?: string;
    contentFocus?: string;
    teachingTips?: string;
  };
}

export type WebSearchItem = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchOptions = {
  strictMode?: boolean;
  allowedDomains?: string[];
};

export type WebSearchStats = {
  provider: string;
  query: string;
  totalFetched: number;
  allowedCount: number;
  filteredCount: number;
  usedCount: number;
  usedItems?: Array<{ title: string; url: string; evidencePreview: string }>;
  filteredItems?: Array<{ url: string; reason: string }>;
};

export type WebSearchResult = {
  items: WebSearchItem[];
  stats: WebSearchStats;
};

export type WebGroundingResult = {
  items: WebSearchItem[];
  stats: WebSearchStats;
  grounding: string;
};

const DEFAULT_SEARCH_DOMAIN_WHITELIST = [
  'gov.cn',
  'moe.gov.cn',
  'edu.cn',
  'wikipedia.org',
  'zh.wikipedia.org',
  'xinhuanet.com',
  'people.com.cn',
  'zj.gov.cn',
  'wenzhou.gov.cn',
  'baike.baidu.com',
  'open-meteo.com',
  'geocoding-api.open-meteo.com',
  'api.open-meteo.com'
];

const normalizeSearchUrl = (input: string) => {
  try {
    const url = new URL(input);
    const redirected = url.searchParams.get('uddg');
    if (redirected) return decodeURIComponent(redirected);
    return url.toString();
  } catch {
    return input;
  }
};

const isAllowedHost = (targetUrl: string, allowedDomains: string[]) => {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

const extractWeatherLocation = (query: string) => {
  const cleaned = query.replace(/[？?。！!,，]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/(?:今天|明天|后天|当前|现在)?\s*([^\s]{2,12}?)(?:地区)?(?:的)?(?:天气|气温|温度|降雨|风力)/);
  const raw = (m?.[1] || cleaned.split(' ')[0] || '').replace(/今天|明天|后天|当前|现在|请问|一下|帮我|查询|地区/g, '').trim();
  return raw || '温州';
};

const isWeatherQuery = (query: string) => /(天气|气温|温度|降雨|风力|湿度|空气质量)/.test(query);

const fetchWeatherItem = async (query: string) => {
  if (!isWeatherQuery(query)) return null;
  const location = extractWeatherLocation(query);
  const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=zh&format=json`, { method: 'GET' });
  if (!geoResp.ok) return null;
  const geo = await geoResp.json() as { results?: Array<{ name: string; country?: string; latitude: number; longitude: number }> };
  const p = geo.results?.[0];
  if (!p) return null;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=Asia%2FShanghai`;
  const weatherResp = await fetch(weatherUrl, { method: 'GET' });
  if (!weatherResp.ok) return null;
  const weather = await weatherResp.json() as {
    current?: { temperature_2m?: number; wind_speed_10m?: number; weather_code?: number };
    daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
  };
  const temp = weather.current?.temperature_2m;
  const wind = weather.current?.wind_speed_10m;
  const max = weather.daily?.temperature_2m_max?.[0];
  const min = weather.daily?.temperature_2m_min?.[0];
  const rain = weather.daily?.precipitation_probability_max?.[0];
  const snippet = `${p.name}${p.country ? `(${p.country})` : ''}实时温度${temp ?? '-'}°C，风速${wind ?? '-'}km/h，今日最高${max ?? '-'}°C，最低${min ?? '-'}°C，降水概率${rain ?? '-'}%。`;
  return { title: `${p.name}天气（Open-Meteo）`, url: weatherUrl, snippet } as WebSearchItem;
};

const fetchAcademicItems = async (query: string) => {
  const list: WebSearchItem[] = [];
  try {
    const resp = await fetch(`https://api.crossref.org/works?query.title=${encodeURIComponent(query)}&rows=5`, { method: 'GET' });
    if (resp.ok) {
      const data = await resp.json() as { message?: { items?: Array<{ title?: string[]; DOI?: string; author?: Array<{ family?: string }>; issued?: { 'date-parts'?: number[][] } }> } };
      const items = data.message?.items || [];
      for (const it of items) {
        const title = it.title?.[0];
        if (!title || !it.DOI) continue;
        const year = it.issued?.['date-parts']?.[0]?.[0];
        const author = it.author?.[0]?.family;
        list.push({
          title: `${title}${year ? ` (${year})` : ''}`,
          url: `https://doi.org/${it.DOI}`,
          snippet: `Crossref 学术条目${author ? `，作者 ${author}` : ''}`
        });
      }
    }
  } catch {
  }
  try {
    const s2 = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=5&fields=title,url,abstract,year,authors`, { method: 'GET' });
    if (s2.ok) {
      const data = await s2.json() as { data?: Array<{ title?: string; url?: string; abstract?: string; year?: number; authors?: Array<{ name?: string }> }> };
      for (const it of data.data || []) {
        if (!it.title) continue;
        list.push({
          title: `${it.title}${it.year ? ` (${it.year})` : ''}`,
          url: it.url || `https://www.semanticscholar.org/search?q=${encodeURIComponent(it.title)}`,
          snippet: (it.abstract || `Semantic Scholar 学术条目${it.authors?.[0]?.name ? `，作者 ${it.authors[0].name}` : ''}`).slice(0, 220)
        });
      }
    }
  } catch {
  }
  return list.slice(0, 8);
};

export async function webSearchLite(query: string, options?: WebSearchOptions): Promise<WebSearchResult> {
  const q = query.trim();
  const allowedDomains = (options?.allowedDomains && options.allowedDomains.length > 0 ? options.allowedDomains : DEFAULT_SEARCH_DOMAIN_WHITELIST)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const strictMode = options?.strictMode ?? true;
  if (!q) {
    return {
      items: [],
      stats: { provider: 'none', query: q, totalFetched: 0, allowedCount: 0, filteredCount: 0, usedCount: 0 }
    };
  }
  const rawItems: WebSearchItem[] = [];
  const filteredItems: Array<{ url: string; reason: string }> = [];
  let provider = 'duckduckgo';
  const weatherItem = await fetchWeatherItem(q).catch(() => null);
  if (weatherItem) rawItems.push(weatherItem);
  const trySearx = async () => {
    const instances = ['https://searx.be', 'https://search.inetol.net', 'https://searx.tiekoetter.com'];
    for (const base of instances) {
      try {
        const resp = await fetch(`${base}/search?q=${encodeURIComponent(q)}&format=json&language=zh-CN`, { method: 'GET' });
        if (!resp.ok) continue;
        const payload = await resp.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
        const results = Array.isArray(payload.results) ? payload.results : [];
        results.slice(0, 8).forEach((it) => {
          if (it.url && it.title) rawItems.push({ title: it.title, url: it.url, snippet: it.content || it.title });
        });
        if (results.length > 0) {
          provider = 'searxng';
          return true;
        }
      } catch {
      }
    }
    return false;
  };
  const hasSearx = await trySearx();
  const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
  try {
    const resp = hasSearx ? null : await fetch(endpoint, { method: 'GET' });
    if (!resp) throw new Error('skip-ddg');
    if (!resp.ok) throw new Error('duckduckgo unavailable');
    const data = await resp.json() as {
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string } | { Topics?: Array<{ Text?: string; FirstURL?: string }> }>;
    };
    if (data.AbstractText && data.AbstractURL) {
      const normalized = normalizeSearchUrl(data.AbstractURL);
      rawItems.push({ title: '摘要结果', url: normalized, snippet: data.AbstractText });
    }
    const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    for (const item of topics) {
      if ('Text' in item && item.Text && item.FirstURL) {
        const normalized = normalizeSearchUrl(item.FirstURL);
        rawItems.push({ title: item.Text.slice(0, 40), url: normalized, snippet: item.Text });
      } else if ('Topics' in item && Array.isArray(item.Topics)) {
        for (const sub of item.Topics) {
          if (sub.Text && sub.FirstURL) {
            const normalized = normalizeSearchUrl(sub.FirstURL);
            rawItems.push({ title: sub.Text.slice(0, 40), url: normalized, snippet: sub.Text });
          }
          if (rawItems.length >= 10) break;
        }
      }
      if (rawItems.length >= 10) break;
    }
    if (rawItems.length === 0) throw new Error('duckduckgo empty');
  } catch {
    provider = 'wikipedia-fallback';
    try {
      const wikiResp = await fetch(`https://zh.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&search=${encodeURIComponent(q)}&limit=8`, { method: 'GET' });
      if (wikiResp.ok) {
        const payload = await wikiResp.json() as [string, string[], string[], string[]];
        const titles = Array.isArray(payload[1]) ? payload[1] : [];
        const snippets = Array.isArray(payload[2]) ? payload[2] : [];
        const urls = Array.isArray(payload[3]) ? payload[3] : [];
        titles.forEach((title, idx) => {
          rawItems.push({
            title,
            snippet: snippets[idx] || title,
            url: urls[idx] || 'https://zh.wikipedia.org'
          });
        });
      }
    } catch {
    }
  }
  if (!strictMode) {
    const academic = await fetchAcademicItems(q);
    if (academic.length > 0) {
      provider = provider.includes('searxng') ? `${provider}+academic` : `academic+${provider}`;
      rawItems.push(...academic);
    }
  }
  const deduped: WebSearchItem[] = [];
  const seen = new Set<string>();
  for (const item of rawItems) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }
  const allowed = deduped.filter((it) => {
    const ok = isAllowedHost(it.url, allowedDomains);
    if (!ok) filteredItems.push({ url: it.url, reason: '域名不在白名单' });
    return ok;
  });
  const finalItems = strictMode
    ? allowed.slice(0, 6)
    : [...allowed, ...deduped.filter((it) => !allowed.some((a) => a.url === it.url))].slice(0, 6);
  const stats: WebSearchStats = {
    provider,
    query: q,
    totalFetched: deduped.length,
    allowedCount: allowed.length,
    filteredCount: deduped.length - allowed.length,
    usedCount: finalItems.length,
    filteredItems: filteredItems.slice(0, 20)
  };
  if (finalItems.length > 0) return { items: finalItems, stats };
  if (!strictMode) {
    return { items: deduped.slice(0, 6), stats: { ...stats, usedCount: Math.min(deduped.length, 6) } };
  }
  return { items: [], stats };
}

const stripMarkdownNoise = (text: string) => {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[#>*_`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const fetchPageEvidence = async (url: string) => {
  try {
    const proxyUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;
    const resp = await fetch(proxyUrl, { method: 'GET' });
    if (!resp.ok) return '';
    const text = await resp.text();
    const cleaned = stripMarkdownNoise(text);
    return cleaned.slice(0, 1200);
  } catch {
    return '';
  }
};

export async function buildWebGrounding(query: string, options?: WebSearchOptions): Promise<WebGroundingResult> {
  const result = await webSearchLite(query, options);
  if (result.items.length === 0) {
    return { ...result, grounding: '' };
  }
  const topItems = result.items.slice(0, 4);
  const usedItems: Array<{ title: string; url: string; evidencePreview: string }> = [];
  const evidences = await Promise.all(topItems.map(async (item, idx) => {
    const body = await fetchPageEvidence(item.url);
    usedItems.push({ title: item.title, url: item.url, evidencePreview: (body || item.snippet || '').slice(0, 200) });
    return `来源${idx + 1}：${item.title}\nURL: ${item.url}\n摘要: ${item.snippet}\n正文证据: ${body || '正文抓取失败，保留摘要。'}`;
  }));
  return {
    items: result.items,
    stats: { ...result.stats, usedItems },
    grounding: evidences.join('\n\n')
  };
}
