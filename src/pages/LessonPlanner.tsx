import React, { useState } from 'react';
import { useApp } from '../lib/useApp';
import { ArrowRight, ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { type LessonSchedule } from '../lib/types';
import { generateLessonScheduleAI } from '../lib/ai';
import { buildTextbookSignals, extractTeachingMaterialText, extractTextbookStructure } from '../lib/textbook';
import { buildTemplateContext } from '../lib/textbookTemplates';

const SUBJECT_LESSON_TYPES: Record<string, string[]> = {
  chinese: ['阅读课', '写作指导课', '阅读综合实践课', '专题学习活动课', '活动探究课', '单元整理课', '专题复习课'],
  math: ['新授课', '概念课', '探究课', '习题课', '讲评课', '复习课'],
  english: ['听说课', '阅读课', '语法课', '写作课', '复习课', '综合实践课'],
  science: ['实验探究课', '概念建构课', '探究课', '讲评课', '复习课', '综合实践课'],
  society: ['道法探究课', '历史探究课', '地理综合课', '讲评课', '复习课', '综合实践课']
};

export function LessonPlanner() {
  const { unitPlan, updateUnitPlan, aiProvider, selectedModel, apiKey, ocrEndpoint, ocrApiKey } = useApp();
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const [unitDays, setUnitDays] = useState(5);
  const [scheduleError, setScheduleError] = useState('');
  const [textbookText, setTextbookText] = useState('');

  const materialFiles = unitPlan.textbookFiles && unitPlan.textbookFiles.length > 0
    ? unitPlan.textbookFiles
    : (unitPlan.textbookFile ? [unitPlan.textbookFile] : []);

  const subjectNameMap: Record<string, string> = {
    chinese: '语文',
    math: '数学',
    english: '英语',
    science: '科学',
    society: '社会'
  };

  const currentLessonTypeOptions = SUBJECT_LESSON_TYPES[unitPlan.subject] || SUBJECT_LESSON_TYPES.english;

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

  const reindexSchedule = (schedule: LessonSchedule[]) => schedule.map((lesson, idx) => ({ ...lesson, day: idx + 1 }));

  const sortScheduleByTextbookOrder = (schedule: LessonSchedule[], textbookContent: string) => {
    if (!textbookContent.trim()) return reindexSchedule(schedule);
    const textLower = textbookContent.toLowerCase();
    const scored = schedule.map((lesson, idx) => {
      const topic = lesson.topic.trim();
      const position = topic ? textLower.indexOf(topic.toLowerCase()) : -1;
      return { lesson, idx, position: position === -1 ? Number.MAX_SAFE_INTEGER : position };
    });
    scored.sort((a, b) => (a.position === b.position ? a.idx - b.idx : a.position - b.position));
    return reindexSchedule(scored.map((x) => x.lesson));
  };

  const generateSchedule = () => {
    if (!apiKey) {
      setScheduleError('请先在系统设置中填写 API Key');
      return;
    }
    if (materialFiles.length === 0) {
      setScheduleError('请先上传教材素材');
      return;
    }
    if (!unitPlan.unitLessonPlan) {
      setScheduleError('请先生成或填写单元课时规划');
      return;
    }
    setScheduleError('');
    setIsGeneratingSchedule(true);
    const subjectName = subjectNameMap[unitPlan.subject] || '学科';
    const textbookName = `${materialFiles[0]?.name || '教材'}${materialFiles.length > 1 ? ` +${materialFiles.length - 1}个素材` : ''}${unitPlan.volume ? `（${unitPlan.volume}）` : ''}`;
    const unitTitle = unitPlan.schedule[0]?.topic || '本单元';
    const templateContext = buildTemplateContext({
      subject: unitPlan.subject,
      grade: unitPlan.grade || '',
      textbookVersion: unitPlan.textbookVersion || '',
      volume: unitPlan.volume || ''
    });
    let sourceTextForSort = '';
    const ensureTextbookText = (textbookText && textbookText.length > 200) 
      ? Promise.resolve(textbookText)
      : loadAllMaterialText(materialFiles);
    ensureTextbookText.then((content) => {
      setTextbookText(content);
      sourceTextForSort = content;
      const signals = buildTextbookSignals(
        content,
        unitPlan.schedule[0]?.topic || '本单元',
        unitPlan.coreKnowledge || '',
        unitPlan.unitObjectives || ''
      );
      const enrichedTextbook = [
        content,
        signals.tocText ? `教材目录/单元标题:\n${signals.tocText}` : '',
        signals.paraText ? `关键段落:\n${signals.paraText}` : ''
      ].filter(Boolean).join('\n\n');
      const textbookStructure = extractTextbookStructure(enrichedTextbook, 60).join('\n');
      return generateLessonScheduleAI({
        apiKey,
        provider: aiProvider,
        model: selectedModel,
        subject: subjectName,
        grade: unitPlan.grade || '未知年级',
        textbookName,
        unitTitle,
        unitLessonPlan: unitPlan.unitLessonPlan,
        unitObjectives: unitPlan.unitObjectives,
        coreKnowledge: unitPlan.coreKnowledge,
        textbookContent: enrichedTextbook,
        textbookStructure,
        textbookTemplate: templateContext,
        lessonTypes: SUBJECT_LESSON_TYPES[unitPlan.subject] || SUBJECT_LESSON_TYPES.english,
        days: unitDays
      });
    }).then((items) => {
      const list = Array.isArray(items) ? items : [];
      const typeOptions = SUBJECT_LESSON_TYPES[unitPlan.subject] || SUBJECT_LESSON_TYPES.english;
      const normalizeTopic = (raw: string, idx: number) => {
        const text = (raw || '').replace(/课前|课中|课后|导案|学案|预学|议学|悟学/g, '').replace(/\s{2,}/g, ' ').trim();
        return text || `第${idx + 1}天课题`;
      };
      const rawSchedule: LessonSchedule[] = (list as { topic?: string; type?: string }[]).slice(0, unitDays).map((it, idx) => ({
        id: `${Date.now()}-${idx}`,
        day: idx + 1,
        topic: normalizeTopic(it.topic || '', idx),
        type: typeOptions.includes(it.type || '') ? (it.type as string) : typeOptions[0],
        isConfirmed: false
      }));
      updateUnitPlan({ schedule: sortScheduleByTextbookOrder(rawSchedule, sourceTextForSort) });
    }).catch((err) => {
      setScheduleError(err instanceof Error ? err.message : '课时安排生成失败');
    }).finally(() => {
      setIsGeneratingSchedule(false);
    });
  };

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

  const handleUpdateLesson = (id: string, field: keyof LessonSchedule, value: LessonSchedule[keyof LessonSchedule]) => {
    const newSchedule = unitPlan.schedule.map(l => 
      l.id === id ? { ...l, [field]: value } : l
    );
    updateUnitPlan({ schedule: reindexSchedule(newSchedule) });
  };

  const moveLesson = (id: string, direction: -1 | 1) => {
    const list = [...unitPlan.schedule];
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= list.length) return;
    const [item] = list.splice(idx, 1);
    list.splice(nextIdx, 0, item);
    updateUnitPlan({ schedule: reindexSchedule(list) });
  };

  const handleDeleteLesson = (id: string) => {
    updateUnitPlan({ schedule: reindexSchedule(unitPlan.schedule.filter(l => l.id !== id)) });
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-3xl shadow-soft border border-gray-100">
        <div className="flex justify-between items-start mb-8">
            <div>
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-1">
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-100 text-brand-600 text-sm font-bold">2</span>
                    课时规划
                </h3>
                <p className="text-slate-500 text-sm pl-10">设置单元授课天数，AI 将结合单元课时规划生成安排。</p>
            </div>
        </div>

        <div className="flex items-end gap-6 mb-8 bg-gray-50/80 p-6 rounded-2xl border border-gray-200/60">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-semibold text-slate-700 mb-2">上课起始日期</label>
            <input
              data-guide="unit-start-date"
              type="date" 
              className="input-field cursor-pointer"
              value={unitPlan.termStartDate}
              onChange={(e) => updateUnitPlan({ termStartDate: e.target.value })}
            />
          </div>
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-semibold text-slate-700 mb-2">单元授课天数</label>
            <input 
              type="number" 
              min={1}
              max={30}
              className="input-field"
              value={unitDays}
              onChange={(e) => setUnitDays(Math.max(1, Number(e.target.value || 1)))}
            />
          </div>
          <button 
              data-guide="unit-generate-schedule"
              onClick={generateSchedule}
              disabled={isGeneratingSchedule}
              className="btn-primary px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 h-[46px]"
            >
              {isGeneratingSchedule ? 'AI 规划中...' : '生成课时安排'}
              {!isGeneratingSchedule && <ArrowRight className="h-4 w-4" />}
            </button>
        </div>
        {scheduleError && (
          <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 mb-6">
            {scheduleError}
          </div>
        )}

        {unitPlan.schedule.length > 0 && (
          <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50/80 text-slate-600 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 w-24">天次</th>
                  <th className="px-6 py-4 w-40">日期</th>
                  <th className="px-6 py-4">课题 (Topic)</th>
                  <th className="px-6 py-4 w-48">课型 (Type)</th>
                  <th className="px-6 py-4 w-28 text-center">确认</th>
                  <th className="px-6 py-4 w-36 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {unitPlan.schedule.map((lesson) => (
                  <tr key={lesson.id} className="hover:bg-brand-50/30 transition-colors group">
                    <td className="px-6 py-4">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-bold">
                            第 {lesson.day} 天
                        </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {calcLessonDate(lesson.day) ? (
                        <div className="space-y-1">
                          <div>{calcLessonDate(lesson.day)}</div>
                          <div>{calcWeekDay(lesson.day)}</div>
                        </div>
                      ) : (
                        <span className="text-slate-300">未设置</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <input 
                        type="text" 
                        value={lesson.topic}
                        onChange={(e) => handleUpdateLesson(lesson.id, 'topic', e.target.value)}
                        className="w-full bg-transparent border-b border-transparent focus:border-brand-500 focus:outline-none py-1 text-slate-900 font-medium transition-colors"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        list="lesson-type-options"
                        value={lesson.type}
                        onChange={(e) => handleUpdateLesson(lesson.id, 'type', e.target.value)}
                        className="w-full bg-transparent border border-gray-200 rounded-lg px-3 py-1.5 text-slate-700 text-xs focus:ring-2 focus:ring-brand-200 focus:border-brand-500 outline-none hover:bg-gray-50 transition-colors"
                        placeholder="可输入自定义课型"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleUpdateLesson(lesson.id, 'isConfirmed', !lesson.isConfirmed)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                          lesson.isConfirmed
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                      >
                        {lesson.isConfirmed ? '已确认' : '待确认'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-1 mr-1">
                        <button
                          onClick={() => moveLesson(lesson.id, -1)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                          title="上移"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => moveLesson(lesson.id, 1)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                          title="下移"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button 
                        onClick={() => handleDeleteLesson(lesson.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="lesson-type-options">
              {currentLessonTypeOptions.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <button 
                className="text-brand-600 text-sm font-semibold flex items-center gap-2 hover:text-brand-700 transition-colors px-2 py-1 rounded-md hover:bg-brand-50 w-fit"
                onClick={() => {
                  updateUnitPlan({
                    schedule: reindexSchedule([...unitPlan.schedule,
                      { id: Date.now().toString(), day: 1, topic: '新课时', type: currentLessonTypeOptions[0], isConfirmed: false }
                    ])
                  });
                }}
              >
                <Plus className="h-4 w-4" />
                添加新课时
              </button>
              <button
                className="text-slate-600 text-sm font-semibold flex items-center gap-2 hover:text-slate-800 transition-colors px-2 py-1 rounded-md hover:bg-slate-100 w-fit mt-2"
                onClick={() => {
                  updateUnitPlan({
                    schedule: unitPlan.schedule.map((lesson) => ({ ...lesson, isConfirmed: true }))
                  });
                }}
              >
                全部设为已确认
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}