export interface UnitPlan {
  subject: string;
  grade: string;
  volume: string;
  textbookVersion: string;
  termStartDate: string;
  outputLanguage: 'zh' | 'en';
  textbookFile: File | null;
  textbookFiles: File[];
  textbookAnalysis: string; // 单元教材分析
  studentAnalysis: string; // 单元学情分析
  coreKnowledge: string; // 单元核心知识
  unitObjectives: string; // 单元学习目标
  unitAssessment: string; // 评价证据
  unitLessonPlan: string; // 单元课时规划
  unitHomeworkPlan: string; // 单元作业规划
  unitReflection: string; // 单元教学反思
  individualGuidance: string; // 个别辅导对象 (可选)
  schedule: LessonSchedule[];
}

export interface LessonSchedule {
  id: string;
  day: number;
  topic: string;
  type: string; // e.g., "听说课", "阅读课"
  isConfirmed: boolean;
}

export interface DetailedLesson {
  lessonId: string;
  date: string; // 日期
  weekDay: string; // 星期
  period: string; // 课时
  type: string; // 题型 -> 课型
  targetStudent: string; // 授课对象
  textbook: string; // 教材
  topic: string; // 课题
  
  coreContent: string; // 学习核心内容
  studentAnalysis: string; // 学情分析
  keyPoints: string; // 教学重点
  difficultPoints: string; // 教学难点
  
  // 学习目标及评价设计
  objectives: {
    id: string;
    content: string; // 具体内容 (学习情境+行为动词+核心内容+素养指向)
    assessment: string; // 评价设计
  }[];
  
  // 导学过程 (三学)
  preLearning: {
    studentTask: string; // 【学生做什么】
    teacherGuidance: string; // 【教师怎么导】
    assessment: string; // 效果评价
    intent: string; // 设计意图
  };
  
  inClass: Activity[];
  
  postLearning: {
    homeworkBasic: string; // 基础巩固类
    homeworkExtension: string; // 拓展/实践类
    estimatedTimeBasic: string;
    estimatedTimeExtension: string;
    attributes: {
      source: string[]; // 选用, 改编, 自编, 其他
      category: string[]; // 书面练习, 口头训练, 活动实践, 其他
    };
  };
  
  boardDesign: string; // 板书设计
  reflection: string; // 课后反思
}

export interface Activity {
  id: string;
  title: string; // 活动名称 (e.g., 活动一)
  studentTask: string; // 学案(核心任务/问题链)
  teacherGuidance: string; // 导案(组织/追问/点拨)
  evaluation: string; // 效果评价
  designIntent: string; // 设计意图
}

export interface AIParameters {
  teachingFocus: string; // 教学重点倾向：知识掌握、能力培养、素养导向
  activityPreference: string; // 活动类型偏好：探究式、合作式、项目式
  assessmentStyle: string; // 评价方式：形成性评价、总结性评价、表现性评价
  differentiationLevel: string; // 分层程度：基础、标准、挑战
  teachingStyle: string; // 教学风格：传统讲授、引导探究、混合式
}

export interface WebSearchStats {
  queriedAt: string;
  provider: string;
  query: string;
  totalFetched: number;
  allowedCount: number;
  filteredCount: number;
  usedCount: number;
  usedItems?: Array<{ title: string; url: string; evidencePreview: string }>;
  filteredItems?: Array<{ url: string; reason: string }>;
}

export interface WebSearchSettings {
  strictMode: boolean;
  allowedDomains: string[];
  lastStats: WebSearchStats | null;
}

export interface AppState {
  apiKey: string;
  aiProvider: string;
  ocrEndpoint: string;
  ocrApiKey: string;
  accessPassword: string;
  logoDataUrl: string;
  selectedModel: string;
  availableModels: string[];
  aiParameters: AIParameters;
  webSearchSettings: WebSearchSettings;
  isAuthenticated: boolean;
  unitPlan: UnitPlan;
  detailedLessons: Record<string, DetailedLesson>;
}

export const defaultWebSearchDomains = [
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

export const initialUnitPlan: UnitPlan = {
  subject: "",
  grade: "",
  volume: "",
  textbookVersion: "",
  termStartDate: "",
  outputLanguage: "zh",
  textbookFile: null,
  textbookFiles: [],
  textbookAnalysis: "",
  studentAnalysis: "",
  coreKnowledge: "",
  unitObjectives: "",
  unitAssessment: "",
  unitLessonPlan: "",
  unitHomeworkPlan: "",
  unitReflection: "",
  individualGuidance: "",
  schedule: [],
};
