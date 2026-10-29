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

/**
 * Parses inline markdown:
 * - `**bold text**` -> <strong className="font-semibold text-white">...</strong>
 * - `` `inline code` `` -> <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/10 text-lime-300">...</code>
 * - Plain text remains React strings (zero dangerouslySetInnerHTML, completely XSS-safe).
 */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  const len = text.length;

  while (cursor < len) {
    const nextTick = text.indexOf('`', cursor);
    const nextBold = text.indexOf('**', cursor);

    let nextSpecial = -1;
    let tokenType: 'code' | 'bold' | null = null;

    if (nextTick !== -1 && nextBold !== -1) {
      if (nextTick < nextBold) {
        nextSpecial = nextTick;
        tokenType = 'code';
      } else {
        nextSpecial = nextBold;
        tokenType = 'bold';
      }
    } else if (nextTick !== -1) {
      nextSpecial = nextTick;
      tokenType = 'code';
    } else if (nextBold !== -1) {
      nextSpecial = nextBold;
      tokenType = 'bold';
    }

    if (nextSpecial === -1 || tokenType === null) {
      nodes.push(text.slice(cursor));
      break;
    }

    if (nextSpecial > cursor) {
      nodes.push(text.slice(cursor, nextSpecial));
    }

    if (tokenType === 'code') {
      const closeTick = text.indexOf('`', nextSpecial + 1);
      if (closeTick !== -1) {
        const codeContent = text.slice(nextSpecial + 1, closeTick);
        nodes.push(
          <code
            key={`code-${cursor}-${nextSpecial}`}
            className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/10 text-lime-300"
          >
            {codeContent}
          </code>
        );
        cursor = closeTick + 1;
      } else {
        nodes.push(text.slice(nextSpecial));
        break;
      }
    } else if (tokenType === 'bold') {
      const closeBold = text.indexOf('**', nextSpecial + 2);
      if (closeBold !== -1) {
        const boldContent = text.slice(nextSpecial + 2, closeBold);
        nodes.push(
          <strong
            key={`bold-${cursor}-${nextSpecial}`}
            className="font-semibold text-white"
          >
            {renderInlineMarkdown(boldContent)}
          </strong>
        );
        cursor = closeBold + 2;
      } else {
        nodes.push(text.slice(nextSpecial));
        break;
      }
    }
  }

  return nodes;
}

export interface MarkdownBlock {
  type: 'ul' | 'ol' | 'p';
  items?: string[];
  lines?: string[];
}

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const rawLines = text.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let currentBlock: MarkdownBlock | null = null;

  const flush = () => {
    if (currentBlock) {
      blocks.push(currentBlock);
      currentBlock = null;
    }
  };

  const ulRegex = /^\s*[-*]\s+(.*)$/;
  const olRegex = /^\s*\d+\.\s+(.*)$/;

  for (const line of rawLines) {
    if (!line.trim()) {
      flush();
      continue;
    }

    const ulMatch = line.match(ulRegex);
    if (ulMatch) {
      if (currentBlock && currentBlock.type === 'ul') {
        currentBlock.items?.push(ulMatch[1]);
      } else {
        flush();
        currentBlock = { type: 'ul', items: [ulMatch[1]] };
      }
      continue;
    }

    const olMatch = line.match(olRegex);
    if (olMatch) {
      if (currentBlock && currentBlock.type === 'ol') {
        currentBlock.items?.push(olMatch[1]);
      } else {
        flush();
        currentBlock = { type: 'ol', items: [olMatch[1]] };
      }
      continue;
    }

    if (currentBlock && currentBlock.type === 'p') {
      currentBlock.lines?.push(line);
    } else {
      flush();
      currentBlock = { type: 'p', lines: [line] };
    }
  }

  flush();
  return blocks;
}

export const FormattedMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const blocks = parseMarkdownBlocks(text);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <>
      {blocks.map((block, bIdx) => {
        if (block.type === 'ul') {
          return (
            <ul
              key={bIdx}
              className="space-y-1.5 my-1.5 first:mt-0 last:mb-0 list-disc list-outside pl-5"
            >
              {block.items?.map((item, iIdx) => (
                <li key={iIdx} className="leading-relaxed">
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol
              key={bIdx}
              className="space-y-1.5 my-1.5 first:mt-0 last:mb-0 list-decimal list-outside pl-5"
            >
              {block.items?.map((item, iIdx) => (
                <li key={iIdx} className="leading-relaxed">
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={bIdx} className="my-1.5 first:mt-0 last:mb-0 leading-relaxed">
            {block.lines?.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {renderInlineMarkdown(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
};

export const MessageContent: React.FC<{ text: string }> = ({ text }) => {
  const parts = parseFencedCodeBlocks(text);

  return (
    <div className="font-sans text-theme-text break-words text-sm leading-relaxed">
      {parts.map((part, idx) => {
        if (part.type === 'code') {
          return <CodeBlockItem key={idx} code={part.code} />;
        }
        return <FormattedMarkdown key={idx} text={part.text} />;
      })}
    </div>
  );
};

export default MessageContent;
