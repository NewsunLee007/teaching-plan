import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min?url';
import JSZip from 'jszip';

const splitLines = (text: string) => text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

const normalizeLine = (line: string) => line.replace(/\s+/g, ' ').trim();

const detectTocLines = (lines: string[]) => {
  const tocMarks = ['目录', '目 录', 'Contents'];
  const tocIndex = lines.findIndex(l => tocMarks.some(m => l.includes(m)));
  const scanLines = tocIndex >= 0 ? lines.slice(tocIndex, tocIndex + 80) : lines.slice(0, 120);
  const tocPattern = /(第[一二三四五六七八九十\d]+[章节单元课]|单元|主题|项目|模块|章|节)/;
  const candidate = scanLines.filter(l => l.length <= 30 && tocPattern.test(l));
  return Array.from(new Set(candidate)).slice(0, 20);
};

export const extractTextbookStructure = (text: string, maxItems = 40) => {
  const lines = splitLines(text);
  const pattern = /(第[一二三四五六七八九十百\d]+[单元章节课]|单元|主题|项目|模块|章|节|lesson|unit)/i;
  const candidates = lines
    .map((line) => normalizeLine(line))
    .filter((line) => line.length >= 2 && line.length <= 42 && pattern.test(line));
  return Array.from(new Set(candidates)).slice(0, maxItems);
};

const buildKeywords = (unitTitle: string, coreKnowledge: string, unitObjectives: string) => {
  const raw = [unitTitle, coreKnowledge, unitObjectives].join(' ');
  const tokens = raw
    .replace(/[0-9.、:：]/g, ' ')
    .split(/[\s,，;；。！？!?\-—/()（）]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2);
  return Array.from(new Set(tokens));
};

const chunkParagraphs = (text: string) => {
  const chunks = text
    .split(/\n{2,}/)
    .map(t => t.replace(/\s+/g, ' ').trim())
    .filter(t => t.length >= 40);
  if (chunks.length > 0) return chunks;
  return splitLines(text).filter(l => l.length >= 40);
};

const scoreParagraph = (para: string, keywords: string[]) => {
  let score = 0;
  for (const kw of keywords) {
    if (para.includes(kw)) score += 3;
  }
  if (/(单元|主题|项目|核心|任务|问题|探究|活动)/.test(para)) score += 2;
  if (para.length > 300) score += 1;
  return score;
};

export const buildTextbookSignals = (text: string, unitTitle: string, coreKnowledge: string, unitObjectives: string) => {
  const lines = splitLines(text);
  const tocLines = detectTocLines(lines);
  const structureLines = extractTextbookStructure(text, 40);
  const keywords = buildKeywords(unitTitle, coreKnowledge, unitObjectives);
  const paragraphs = chunkParagraphs(text);
  const ranked = paragraphs
    .map(p => ({ p, s: scoreParagraph(p, keywords) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map(item => item.p);
  const tocText = [...tocLines, ...structureLines].map(l => `- ${normalizeLine(l)}`).join('\n');
  const paraText = ranked.map((p, i) => `[${i + 1}] ${p}`).join('\n');
  return {
    tocText,
    paraText
  };
};

export const extractPdfTextLocal = async (file: File, maxPages = 24, maxChars = 36000) => {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = '';
  const limitPages = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= limitPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as { str: string }[]).map((it) => it.str).join(' ');
    text += `\n${pageText}`;
    if (text.length > maxChars) break;
  }
  return text.trim().slice(0, maxChars);
};

const normalizeOcrText = (payload: unknown) => {
  const stack: unknown[] = [payload];
  const chunks: string[] = [];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node === 'string') {
      if (node.trim()) chunks.push(node.trim());
      continue;
    }
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i -= 1) stack.push(node[i]);
      continue;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const preferred = [obj.text, obj.content, obj.markdown, obj.md, obj.result, obj.data, obj.output];
      for (let i = preferred.length - 1; i >= 0; i -= 1) {
        if (preferred[i] !== undefined) stack.push(preferred[i]);
      }
      for (const key of Object.keys(obj).reverse()) {
        if (['text', 'content', 'markdown', 'md', 'result', 'data', 'output'].includes(key)) continue;
        stack.push(obj[key]);
      }
    }
  }
  const merged = chunks.join('\n').trim();
  return merged.length > 36000 ? merged.slice(0, 36000) : merged;
};

export const extractPdfTextViaOcr = async (args: { endpoint: string; file: File; apiKey?: string }) => {
  const endpoint = args.endpoint.trim().replace(/[`'"]/g, '').replace(/\s+/g, '');
  if (!endpoint) {
    throw new Error('OCR 地址为空');
  }
  if (endpoint.includes('mineru.net')) {
    const token = (args.apiKey || '').trim().replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('MinerU 需要在系统设置中填写 OCR API Key（Bearer Token）');
    // Use proxy in development mode (supports localhost and LAN IP)
    const useDevProxy = import.meta.env.DEV;
    const baseOrigin = endpoint.startsWith('http') ? new URL(endpoint).origin : 'https://mineru.net';
    const baseApi = endpoint.includes('/api/v4') ? `${baseOrigin}/api/v4` : `${baseOrigin}/api/v4`;
    const buildUrl = (path: string) => useDevProxy ? `/api/mineru/api/v4${path}` : `${baseApi}${path}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const dataId = `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fileName = args.file.name || `upload_${Date.now()}.bin`;
    const createUploadResp = await fetch(buildUrl('/file-urls/batch'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        files: [{ name: fileName, data_id: dataId, is_ocr: true }],
        model_version: 'vlm',
        language: 'ch',
        enable_formula: true,
        enable_table: true
      })
    });
    if (!createUploadResp.ok) {
      const body = (await createUploadResp.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (createUploadResp.status === 405) {
        throw new Error('MinerU 接口地址不匹配（405）。请确认 OCR 地址为 https://mineru.net 并重启开发服务。');
      }
      throw new Error(body || `MinerU 获取上传地址失败（${createUploadResp.status}）`);
    }
    const uploadPayload = await createUploadResp.json();
    const uploadCode = Number((uploadPayload as { code?: unknown }).code ?? 0);
    const uploadMsg = String((uploadPayload as { msg?: unknown }).msg ?? '');
    if (uploadCode !== 0) {
      throw new Error(uploadMsg ? `MinerU 申请上传链接失败：${uploadMsg}` : `MinerU 申请上传链接失败（code=${uploadCode}）`);
    }
    const stack: unknown[] = [uploadPayload];
    let uploadUrl = '';
    let fileUrl = '';
    let uploadMethod = 'PUT';
    let uploadHeaders: Record<string, string> = {};
    let uploadFormFields: Record<string, string> = {};
    let fileFieldName = 'file';
    const uploadCandidates: string[] = [];
    const fileCandidates: string[] = [];
    const genericUrls: string[] = [];
    const seenKeys = new Set<string>();
    const pickString = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const normalizeUrl = (value: string) => {
      if (!value) return '';
      if (/^https?:\/\//i.test(value)) return value;
      if (value.startsWith('//')) return `https:${value}`;
      return '';
    };
    const pushNode = (value: unknown) => {
      if (typeof value === 'string') {
        const raw = value.trim();
        if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
          try {
            stack.push(JSON.parse(raw));
            return;
          } catch {
          }
        }
      }
      stack.push(value);
    };
    const dataObj = (uploadPayload as { data?: { file_urls?: unknown } }).data;
    const rawFileUrls = dataObj?.file_urls;
    if (Array.isArray(rawFileUrls)) {
      for (const row of rawFileUrls) {
        if (typeof row === 'string') {
          const u = normalizeUrl(row);
          if (u) genericUrls.push(u);
        } else if (row && typeof row === 'object') {
          const o = row as Record<string, unknown>;
          const u1 = normalizeUrl(pickString(o.upload_url));
          const u2 = normalizeUrl(pickString(o.put_url));
          const u3 = normalizeUrl(pickString(o.presigned_url));
          const f1 = normalizeUrl(pickString(o.file_url));
          const f2 = normalizeUrl(pickString(o.url));
          if (u1) uploadCandidates.push(u1);
          if (u2) uploadCandidates.push(u2);
          if (u3) uploadCandidates.push(u3);
          if (f1) fileCandidates.push(f1);
          if (f2) fileCandidates.push(f2);
          const m = pickString(o.method || o.upload_method || o.uploadMethod).toUpperCase();
          if (m === 'POST' || m === 'PUT') uploadMethod = m;
          const hs = (o.headers || o.upload_headers || o.uploadHeaders) as Record<string, unknown> | undefined;
          if (hs && typeof hs === 'object') {
            const parsed: Record<string, string> = {};
            Object.entries(hs).forEach(([k, v]) => {
              if (typeof v === 'string' && v.trim()) parsed[k] = v;
            });
            if (Object.keys(parsed).length > 0) uploadHeaders = parsed;
          }
          const fs = (o.form || o.form_data || o.formFields || o.fields) as Record<string, unknown> | undefined;
          if (fs && typeof fs === 'object') {
            const parsed: Record<string, string> = {};
            Object.entries(fs).forEach(([k, v]) => {
              if (typeof v === 'string' && v.trim()) parsed[k] = v;
            });
            if (Object.keys(parsed).length > 0) uploadFormFields = parsed;
          }
          const ff = pickString(o.file_field_name || o.fileFieldName || o.file_field || o.fileKey);
          if (ff) fileFieldName = ff;
        }
      }
    }
    while (stack.length > 0 && (!uploadUrl || !fileUrl)) {
      const cur = stack.pop();
      if (Array.isArray(cur)) {
        for (let i = cur.length - 1; i >= 0; i -= 1) stack.push(cur[i]);
        continue;
      }
      if (!cur || typeof cur !== 'object') continue;
      const obj = cur as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        seenKeys.add(k);
        const key = k.toLowerCase();
        const s = pickString(v);
        if (['method', 'upload_method', 'uploadmethod'].includes(key)) {
          const m = s.toUpperCase();
          if (m === 'POST' || m === 'PUT') uploadMethod = m;
        }
        if (['headers', 'upload_headers', 'uploadheaders'].includes(key) && v && typeof v === 'object') {
          const parsed: Record<string, string> = {};
          Object.entries(v as Record<string, unknown>).forEach(([hk, hv]) => {
            if (typeof hv === 'string' && hv.trim()) parsed[hk] = hv;
          });
          if (Object.keys(parsed).length > 0) uploadHeaders = parsed;
        }
        if (['form', 'fields', 'form_data', 'formfields'].includes(key) && v && typeof v === 'object') {
          const parsed: Record<string, string> = {};
          Object.entries(v as Record<string, unknown>).forEach(([fk, fv]) => {
            if (typeof fv === 'string' && fv.trim()) parsed[fk] = fv;
          });
          if (Object.keys(parsed).length > 0) uploadFormFields = parsed;
        }
        if (['file_field_name', 'filefieldname', 'file_field', 'filekey'].includes(key) && s) {
          fileFieldName = s;
        }
        const normalized = normalizeUrl(s);
        if (normalized) {
          genericUrls.push(normalized);
          if (['upload_url', 'put_url', 'presigned_url', 'uploadurl', 'puturl', 'presignedurl', 'signed_url', 'signedurl'].includes(key)) {
            uploadCandidates.push(normalized);
          }
          if (['file_url', 'download_url', 'url', 'fileurl', 'downloadurl', 'public_url', 'publicurl', 'origin_url', 'originurl'].includes(key)) {
            fileCandidates.push(normalized);
          }
        }
        pushNode(v);
      }
      if (!uploadUrl && uploadCandidates.length > 0) uploadUrl = uploadCandidates[0];
      if (!fileUrl && fileCandidates.length > 0) fileUrl = fileCandidates.find((u) => u !== uploadUrl) || fileCandidates[0];
      if (!uploadUrl && genericUrls.length > 0) {
        uploadUrl = genericUrls.find((u) => /x-amz-|signature=|upload/i.test(u)) || genericUrls[0];
      }
      if (!fileUrl && genericUrls.length > 0) {
        fileUrl = genericUrls.find((u) => u !== uploadUrl && !/x-amz-|signature=|upload/i.test(u)) || '';
      }
    }
    if (!fileUrl && uploadUrl) {
      try {
        const u = new URL(uploadUrl);
        u.search = '';
        fileUrl = u.toString();
      } catch {
      }
    }
    if (!uploadUrl || !fileUrl) {
      throw new Error(`MinerU 返回的上传信息不完整，请检查 API 版本。可用字段: ${Array.from(seenKeys).slice(0, 12).join(', ') || 'none'}`);
    }
    let uploadResp: Response;
    if (useDevProxy) {
      const bytes = new Uint8Array(await args.file.arrayBuffer());
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunk));
      }
      uploadResp = await fetch('/api/mineru-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadUrl,
          fileBase64: btoa(binary),
          contentType: args.file.type || 'application/octet-stream',
          fileName: args.file.name,
          method: uploadMethod,
          headers: uploadHeaders,
          formFields: uploadFormFields,
          fileFieldName
        })
      });
    } else {
      const headers = Object.keys(uploadHeaders).length > 0 ? uploadHeaders : undefined;
      uploadResp = await fetch(uploadUrl, {
        method: uploadMethod,
        headers,
        body: args.file
      });
    }
    if (!uploadResp.ok) {
      if (uploadResp.status === 0) {
        throw new Error('MinerU 文件上传失败：浏览器跨域拦截，请通过后端网关中转上传');
      }
      const text = (await uploadResp.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      throw new Error(`MinerU 文件上传失败（${uploadResp.status}）${text ? `：${text.slice(0, 180)}` : ''}`);
    }
    const batchId = pickString((uploadPayload as { data?: { batch_id?: unknown } }).data?.batch_id)
      || pickString((uploadPayload as { data?: { batchId?: unknown } }).data?.batchId);
    if (!batchId) throw new Error('MinerU 未返回 batch_id');
    const doneStates = new Set(['done', 'ok', 'success', 'completed']);
    const failStates = new Set(['failed', 'error']);
    const collectStringByKeys = (node: unknown, keys: string[]): string => {
      if (!node) return '';
      if (Array.isArray(node)) {
        for (const it of node) {
          const v = collectStringByKeys(it, keys);
          if (v) return v;
        }
        return '';
      }
      if (typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        for (const key of keys) {
          const v = obj[key];
          if (typeof v === 'string' && v.trim()) return v.trim();
        }
        for (const v of Object.values(obj)) {
          const got = collectStringByKeys(v, keys);
          if (got) return got;
        }
      }
      return '';
    };
    const collectZipUrls = (node: unknown): string[] => {
      const urls: string[] = [];
      const stack: unknown[] = [node];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (Array.isArray(cur)) {
          for (let i = cur.length - 1; i >= 0; i -= 1) stack.push(cur[i]);
          continue;
        }
        if (!cur || typeof cur !== 'object') continue;
        const obj = cur as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'string' && /^https?:\/\//.test(v) && (k.toLowerCase().includes('zip') || /\.zip(\?|$)/i.test(v))) {
            urls.push(v);
          } else {
            stack.push(v);
          }
        }
      }
      return Array.from(new Set(urls));
    };
    const readZipText = async (zipUrl: string) => {
      const zipResp = await fetch(zipUrl);
      if (!zipResp.ok) return '';
      const zip = await JSZip.loadAsync(await zipResp.arrayBuffer());
      const mdFiles = Object.keys(zip.files).filter((name) => /\.md$/i.test(name)).sort();
      const collected: string[] = [];
      for (const name of mdFiles.slice(0, 8)) {
        const t = await zip.file(name)?.async('string');
        if (t?.trim()) collected.push(t.trim());
      }
      const mergedMd = collected.join('\n\n').trim();
      return mergedMd.slice(0, 36000);
    };
    let lastPayload: unknown = null;
    for (let i = 0; i < 48; i += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const detailResp = await fetch(buildUrl(`/extract-results/batch/${batchId}`), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!detailResp.ok) continue;
      const detail = await detailResp.json();
      lastPayload = detail;
      const detailCode = Number((detail as { code?: unknown }).code ?? 0);
      const detailMsg = String((detail as { msg?: unknown }).msg ?? '').toLowerCase();
      if (detailCode !== 0 && detailCode !== -60011 && detailCode !== -60012) {
        throw new Error(detailMsg ? `MinerU 查询任务失败：${detailMsg}` : `MinerU 查询任务失败（code=${detailCode}）`);
      }
      const extractResult = (detail as { data?: { extract_result?: Array<Record<string, unknown>> | Record<string, unknown> } }).data?.extract_result;
      const resultList = Array.isArray(extractResult) ? extractResult : (extractResult ? [extractResult] : []);
      const resultItem = resultList.find((x) => pickString(x.data_id) === dataId) || resultList[0] || {};
      const statusText = (pickString(resultItem.state) || pickString((detail as { data?: { state?: string } }).data?.state)).toLowerCase();
      const detailText = normalizeOcrText(detail).toLowerCase();
      if (detailText.includes('task not found') || detailText.includes('expire')) {
        throw new Error('MinerU 任务不存在或已过期，请重新上传样本再试');
      }
      if (detailText.includes('failed to read') || detailText.includes('read failed')) {
        throw new Error('MinerU 读取上传文件失败，请重新上传样本文件后重试');
      }
      if (statusText.includes('waiting-file') || statusText.includes('pending') || statusText.includes('running') || statusText.includes('converting')) {
        continue;
      }
      if (Array.from(failStates).some((s) => statusText.includes(s))) {
        const errMsg = pickString(resultItem.err_msg);
        throw new Error(errMsg ? `MinerU 任务解析失败：${errMsg}` : 'MinerU 任务解析失败');
      }
      if (Array.from(doneStates).some((s) => statusText.includes(s))) {
        const zipUrls = collectZipUrls(resultItem);
        for (const zipUrl of zipUrls) {
          const text = await readZipText(zipUrl);
          if (text.length > 80) return text;
        }
        const taskId = collectStringByKeys(resultItem, ['task_id', 'taskId', 'id']);
        if (taskId) {
          const taskResp = await fetch(buildUrl(`/extract/task/${taskId}`), {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (taskResp.ok) {
            const taskDetail = await taskResp.json();
            const taskZipUrls = collectZipUrls(taskDetail);
            for (const zipUrl of taskZipUrls) {
              const text = await readZipText(zipUrl);
              if (text.length > 80) return text;
            }
          }
        }
        const directText = normalizeOcrText(resultItem);
        if (directText && directText.length > 120) return directText.slice(0, 36000);
      }
    }
    const lastText = normalizeOcrText(lastPayload);
    throw new Error(lastText ? `MinerU 任务超时，最后状态：${lastText.slice(0, 120)}` : 'MinerU 任务超时，请稍后重试');
  }
  if (endpoint.includes('aistudio-app.com/layout-parsing')) {
    const token = (args.apiKey || '').trim().replace(/^token\s+/i, '').replace(/^Bearer\s+/i, '');
    if (!token) {
      throw new Error('飞浆 OCR 需要在系统设置中填写 OCR API Key');
    }
    const fileType = args.file.type.startsWith('image/') ? 1 : 0;
    const bytes = new Uint8Array(await args.file.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunk));
    }
    const payload = {
      file: btoa(binary),
      fileType,
      useDocOrientationClassify: false,
      useDocUnwarping: false,
      useChartRecognition: false
    };
    const useDevProxy = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    const requestUrl = useDevProxy ? '/api/paddle-layout' : endpoint;
    const authHeaders = [`token ${token}`, `Bearer ${token}`, token];
    let resp: Response | null = null;
    let finalBody = '';
    for (const auth of authHeaders) {
      try {
        resp = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        throw new Error(err instanceof Error ? `飞浆 OCR 请求失败：${err.message}` : '飞浆 OCR 请求失败');
      }
      if (resp.ok) break;
      finalBody = await resp.text();
      if (resp.status !== 401 && resp.status !== 403) break;
    }
    if (!resp) {
      throw new Error('飞浆 OCR 请求失败：未收到响应');
    }
    if (!resp.ok) {
      if (resp.status === 403 || resp.status === 401) {
        throw new Error(`飞浆 OCR 鉴权失败（${resp.status}）。请检查 Access Token 是否有效、是否有 layout-parsing 调用权限。`);
      }
      if ([502, 503, 504].includes(resp.status)) {
        throw new Error(`飞浆 OCR 服务暂时不可用（${resp.status}）。请稍后重试。`);
      }
      const body = finalBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      throw new Error(body || `飞浆 OCR 请求失败（${resp.status}）`);
    }
    const data = await resp.json();
    const layout = (data as { result?: { layoutParsingResults?: Array<{ markdown?: { text?: string } }> } }).result?.layoutParsingResults || [];
    const text = layout.map((x) => x.markdown?.text || '').join('\n\n').trim();
    if (!text) {
      const extracted = normalizeOcrText(data);
      if (!extracted) throw new Error('飞浆 OCR 返回为空');
      return extracted.slice(0, 36000);
    }
    return text.slice(0, 36000);
  }
  if (endpoint.includes('ocr.space')) {
    const submit = async (key: string) => {
      const form = new FormData();
      form.append('file', args.file);
      form.append('language', 'chs');
      form.append('isOverlayRequired', 'false');
      form.append('apikey', key);
      const resp = await fetch(endpoint, { method: 'POST', body: form });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'OCR 请求失败');
      }
      return resp.json();
    };
    let payload: unknown;
    try {
      payload = await submit(args.apiKey || 'helloworld');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (args.apiKey && msg.toLowerCase().includes('invalid')) {
        payload = await submit('helloworld');
      } else {
        throw new Error(err instanceof Error ? `OCR 请求失败：${err.message}` : 'OCR 请求失败，请检查网络或跨域限制');
      }
    }
    const parsedResults = Array.isArray((payload as { ParsedResults?: unknown[] }).ParsedResults)
      ? ((payload as { ParsedResults?: Array<{ ParsedText?: string }> }).ParsedResults || [])
      : [];
    const text = parsedResults.map((item) => item.ParsedText || '').join('\n').trim();
    if (!text) {
      throw new Error('OCR 返回为空');
    }
    return text.slice(0, 36000);
  }
  const form = new FormData();
  form.append('file', args.file);
  const headers: Record<string, string> = {};
  if (args.apiKey) headers.Authorization = `Bearer ${args.apiKey}`;
  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: form
    });
  } catch (err) {
    throw new Error(err instanceof Error ? `OCR 请求失败：${err.message}` : 'OCR 请求失败，请检查网络或跨域限制');
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || 'OCR 请求失败');
  }
  const text = await resp.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
  }
  const extracted = normalizeOcrText(payload);
  if (!extracted) {
    throw new Error('OCR 返回为空');
  }
  return extracted;
};

const decodeXmlEntities = (input: string) => input
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, '\'')
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

const extractXmlTexts = (xml: string, tag: string) => {
  const matches = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g')) || [];
  return matches
    .map((item) => item.replace(new RegExp(`^<${tag}[^>]*>|<\\/${tag}>$`, 'g'), ''))
    .map((item) => decodeXmlEntities(item.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()))
    .filter(Boolean);
};

const extractPptxTextLocal = async (file: File, maxChars = 36000) => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slides = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)\.xml/i)?.[1] || '0');
      const bi = Number(b.match(/slide(\d+)\.xml/i)?.[1] || '0');
      return ai - bi;
    });
  const texts: string[] = [];
  for (const slideName of slides) {
    const xml = await zip.file(slideName)?.async('string');
    if (!xml) continue;
    const lines = extractXmlTexts(xml, 'a:t');
    if (lines.length > 0) texts.push(`【${slideName.split('/').pop()?.replace('.xml', '')}】\n${lines.join('\n')}`);
  }
  const merged = texts.join('\n\n').trim();
  if (!merged) throw new Error('PPTX本地解析为空');
  return merged.slice(0, maxChars);
};

const extractDocxTextLocal = async (file: File, maxChars = 36000) => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const doc = await zip.file('word/document.xml')?.async('string');
  if (!doc) throw new Error('DOCX结构无效');
  const lines = extractXmlTexts(doc, 'w:t');
  const merged = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!merged) throw new Error('DOCX本地解析为空');
  return merged.slice(0, maxChars);
};

export const extractTeachingMaterialText = async (args: { endpoint: string; file: File; apiKey?: string }) => {
  const lowerName = args.file.name.toLowerCase();
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || lowerName.endsWith('.json') || lowerName.endsWith('.csv')) {
    const text = await args.file.text();
    return text.trim().slice(0, 36000);
  }
  if (args.file.type.startsWith('image/')) {
    return extractPdfTextViaOcr(args);
  }
  if (lowerName.endsWith('.pdf')) {
    try {
      const local = await extractPdfTextLocal(args.file, 24, 36000);
      if (local && local.length > 500) return local;
      return await extractPdfTextViaOcr(args);
    } catch {
      return extractPdfTextLocal(args.file, 24, 36000);
    }
  }
  if (lowerName.endsWith('.pptx')) {
    try {
      const local = await extractPptxTextLocal(args.file, 36000);
      if (local.length >= 120) return local;
      return await extractPdfTextViaOcr(args);
    } catch (err) {
      try {
        return await extractPdfTextViaOcr(args);
      } catch {
        throw new Error(err instanceof Error ? `PPTX解析失败：${err.message}` : 'PPTX解析失败，请检查文件是否损坏');
      }
    }
  }
  if (lowerName.endsWith('.docx')) {
    try {
      const local = await extractDocxTextLocal(args.file, 36000);
      if (local.length >= 120) return local;
      return await extractPdfTextViaOcr(args);
    } catch (err) {
      try {
        return await extractPdfTextViaOcr(args);
      } catch {
        throw new Error(err instanceof Error ? `DOCX解析失败：${err.message}` : 'DOCX解析失败，请检查文件是否损坏');
      }
    }
  }
  if (lowerName.endsWith('.ppt')) {
    try {
      return await extractPdfTextViaOcr(args);
    } catch {
      throw new Error('PPT二进制格式解析失败：请转换为PPTX后上传，或配置可用OCR服务');
    }
  }
  if (lowerName.endsWith('.doc')) {
    try {
      return await extractPdfTextViaOcr(args);
    } catch {
      throw new Error('DOC二进制格式解析失败：请转换为DOCX后上传，或配置可用OCR服务');
    }
  }
  throw new Error('当前仅支持 PDF、PPT/PPTX、DOC/DOCX、图片、TXT、MD、JSON、CSV 格式');
};
