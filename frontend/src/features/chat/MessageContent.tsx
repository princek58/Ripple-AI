import React, { useState } from 'react';

export interface CodeBlockPart {
  type: 'code';
  code: string;
  lang?: string;
}

export interface TextPart {
  type: 'text';
  text: string;
}

export type MessagePart = CodeBlockPart | TextPart;

export function parseFencedCodeBlocks(content: string): MessagePart[] {
  if (!content) return [];
  const parts: MessagePart[] = [];
  const fenceRegex = /```(?:([a-zA-Z0-9_\-\.\+]+)?(?:\r?\n|[ \t]))?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        text: content.slice(lastIndex, match.index),
      });
    }
    parts.push({
      type: 'code',
      lang: match[1] || undefined,
      code: match[2].replace(/\r?\n$/, ''),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      text: content.slice(lastIndex),
    });
  }

  return parts;
}

const CodeBlockItem: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      data-testid="chat-code-block"
      className="my-2 rounded-lg border border-theme-border bg-theme-surface-active/60 overflow-hidden font-mono text-xs"
    >
      <div className="flex items-center justify-end px-2.5 py-1 bg-theme-surface-active border-b border-theme-border">
        <button
          type="button"
          onClick={handleCopy}
          className="text-[11px] text-theme-primary hover:underline font-medium"
          aria-label="Copy code"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto whitespace-pre text-theme-text font-mono leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
};

export const MessageContent: React.FC<{ text: string }> = ({ text }) => {
  const parts = parseFencedCodeBlocks(text);

  return (
    <div className="font-sans text-theme-text break-words leading-relaxed">
      {parts.map((part, idx) => {
        if (part.type === 'code') {
          return <CodeBlockItem key={idx} code={part.code} />;
        }
        return (
          <span key={idx} className="whitespace-pre-wrap">
            {part.text}
          </span>
        );
      })}
    </div>
  );
};

export default MessageContent;
