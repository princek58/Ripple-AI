import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MessageContent, renderInlineMarkdown, parseMarkdownBlocks } from '../features/chat/MessageContent.js';

describe('Chat Markdown Renderer UI/UX Polish', () => {
  it('renders inline bold text with font-semibold and text-white', () => {
    render(<MessageContent text="Here is **bold text** in response" />);
    const strong = screen.getByText('bold text');
    expect(strong.tagName).toBe('STRONG');
    expect(strong).toHaveClass('font-semibold', 'text-white');
  });

  it('renders inline code with styled monospace pill badge', () => {
    render(<MessageContent text="Check file `auth.test.js` for details" />);
    const code = screen.getByText('auth.test.js');
    expect(code.tagName).toBe('CODE');
    expect(code).toHaveClass('font-mono', 'text-xs', 'px-1.5', 'py-0.5', 'rounded', 'bg-white/10', 'text-lime-300');
  });

  it('renders bullet list with clean vertical spacing (space-y-1.5)', () => {
    const markdown = `- First item\n- Second item with **bold**\n* Third item with \`code\``;
    const { container } = render(<MessageContent text={markdown} />);
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul).toHaveClass('space-y-1.5');
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(3);
    expect(screen.getByText('bold')).toHaveClass('font-semibold', 'text-white');
    expect(screen.getByText('code')).toHaveClass('font-mono', 'text-lime-300');
  });

  it('renders numbered list with clean vertical spacing (space-y-1.5)', () => {
    const markdown = `1. Step one\n2. Step two\n3. Step three`;
    const { container } = render(<MessageContent text={markdown} />);
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol).toHaveClass('space-y-1.5');
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(3);
  });

  it('renders paragraph breaks for text separated by empty lines', () => {
    const markdown = `Paragraph 1 text.\n\nParagraph 2 text.`;
    const { container } = render(<MessageContent text={markdown} />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0]).toHaveTextContent('Paragraph 1 text.');
    expect(paragraphs[1]).toHaveTextContent('Paragraph 2 text.');
  });

  it('handles XSS injection safely without injecting DOM elements', () => {
    const malicious = '<img src=x onerror=alert(1)> <script>alert("xss")</script>';
    const { container } = render(<MessageContent text={malicious} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container).toHaveTextContent(malicious);
  });

  it('renders unclosed markdown tokens safely without throwing', () => {
    expect(() => {
      render(<MessageContent text="This is **unclosed bold and `unclosed code" />);
    }).not.toThrow();
    expect(screen.getByText(/This is \*\*unclosed bold/i)).toBeInTheDocument();
  });

  it('renders both fenced code block and inline markdown in harmony', () => {
    const content = `Analysis summary:\n- Found **36 APIs** affected\n\`\`\`ts\nconst total = 36;\n\`\`\`\nRun \`npm test\` to verify.`;
    const { container } = render(<MessageContent text={content} />);
    expect(screen.getByText('36 APIs')).toHaveClass('font-semibold', 'text-white');
    expect(container.querySelector('[data-testid="chat-code-block"]')).toBeInTheDocument();
    expect(screen.getByText('npm test')).toHaveClass('font-mono', 'text-lime-300');
  });
});

