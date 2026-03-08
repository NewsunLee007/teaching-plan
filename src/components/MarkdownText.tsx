import React from 'react';

type Props = {
  content: string;
  className?: string;
};

const renderInline = (text: string) => {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null = regex.exec(text);
  while (m) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={`${m.index}-b`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={`${m.index}-c`} className="px-1 py-0.5 rounded bg-slate-100 text-slate-700">{token.slice(1, -1)}</code>);
    } else {
      parts.push(token);
    }
    last = m.index + token.length;
    m = regex.exec(text);
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

export function MarkdownText({ content, className = '' }: Props) {
  const lines = content.replace(/\r/g, '').split('\n');
  const nodes: React.ReactNode[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];
  let ulBuffer: string[] = [];
  let olBuffer: string[] = [];

  const flushList = () => {
    if (ulBuffer.length > 0) {
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="list-disc pl-5 space-y-1">
          {ulBuffer.map((item, idx) => <li key={idx}>{renderInline(item)}</li>)}
        </ul>
      );
      ulBuffer = [];
    }
    if (olBuffer.length > 0) {
      nodes.push(
        <ol key={`ol-${nodes.length}`} className="list-decimal pl-5 space-y-1">
          {olBuffer.map((item, idx) => <li key={idx}>{renderInline(item)}</li>)}
        </ol>
      );
      olBuffer = [];
    }
  };

  const flushCode = () => {
    if (!inCode) return;
    nodes.push(
      <pre key={`code-${nodes.length}`} className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto text-xs">
        <code>{codeBuffer.join('\n')}</code>
      </pre>
    );
    codeBuffer = [];
    inCode = false;
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      flushList();
      if (inCode) {
        flushCode();
      } else {
        inCode = true;
        codeBuffer = [];
      }
      return;
    }
    if (inCode) {
      codeBuffer.push(raw);
      return;
    }
    if (!line.trim()) {
      flushList();
      nodes.push(<div key={`sp-${nodes.length}`} className="h-1" />);
      return;
    }
    if (line.startsWith('# ')) {
      flushList();
      nodes.push(<h1 key={`h1-${nodes.length}`} className="text-base font-bold">{renderInline(line.slice(2))}</h1>);
      return;
    }
    if (line.startsWith('## ')) {
      flushList();
      nodes.push(<h2 key={`h2-${nodes.length}`} className="text-sm font-bold">{renderInline(line.slice(3))}</h2>);
      return;
    }
    if (line.startsWith('### ')) {
      flushList();
      nodes.push(<h3 key={`h3-${nodes.length}`} className="text-sm font-semibold">{renderInline(line.slice(4))}</h3>);
      return;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      olBuffer = [];
      ulBuffer.push(line.slice(2));
      return;
    }
    if (/^\d+\.\s+/.test(line)) {
      ulBuffer = [];
      olBuffer.push(line.replace(/^\d+\.\s+/, ''));
      return;
    }
    flushList();
    nodes.push(<p key={`p-${nodes.length}`} className="leading-relaxed">{renderInline(line)}</p>);
  });

  flushList();
  flushCode();

  return <div className={className}>{nodes}</div>;
}
