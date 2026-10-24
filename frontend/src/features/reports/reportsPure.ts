import {
  InlineToken,
  ReportBlock,
  ReportParsed,
  Report,
} from './reportsTypes.js';

export function parseInlines(text: string): InlineToken[] {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const tokens: InlineToken[] = [];
  let i = 0;
  let currentText = '';

  const flushText = () => {
    if (currentText) {
      tokens.push({ type: 'text', value: currentText });
      currentText = '';
    }
  };

  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const closeIdx = text.indexOf('**', i + 2);
      if (closeIdx !== -1) {
        flushText();
        tokens.push({ type: 'bold', value: text.slice(i + 2, closeIdx) });
        i = closeIdx + 2;
        continue;
      }
    } else if (text[i] === '`') {
      const closeIdx = text.indexOf('`', i + 1);
      if (closeIdx !== -1) {
        flushText();
        tokens.push({ type: 'code', value: text.slice(i + 1, closeIdx) });
        i = closeIdx + 1;
        continue;
      }
    }
    currentText += text[i];
    i++;
  }

  flushText();
  return tokens;
}

function parseTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.split('|').map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  if (!line || !line.includes('|') || !line.includes('-')) return false;
  return /^\s*\|?(\s*:?-+:?\s*\|)+\s*(:?-+:?)?\s*\|?\s*$/.test(line);
}

export function parseReportMarkdown(md: string): ReportParsed {
  if (typeof md !== 'string') {
    return { blocks: [], truncated: false };
  }

  const rawLines = md.split(/\r?\n/);
  const truncated = rawLines.length > 5000;
  const lines = truncated ? rawLines.slice(0, 5000) : rawLines;

  const blocks: ReportBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    // Heading: level 1 to 3
    if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      let level: 1 | 2 | 3 = 1;
      let text = '';
      if (trimmed.startsWith('### ')) {
        level = 3;
        text = trimmed.slice(4).trim();
      } else if (trimmed.startsWith('## ')) {
        level = 2;
        text = trimmed.slice(3).trim();
      } else {
        level = 1;
        text = trimmed.slice(2).trim();
      }
      blocks.push({ type: 'heading', level, text });
      i++;
      continue;
    }

    // Table detection: line has pipes and next line is table separator
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(line);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i];
        const rowTrimmed = rowLine.trim();
        if (
          rowTrimmed === '' ||
          rowTrimmed.startsWith('#') ||
          rowTrimmed.startsWith('- ') ||
          rowTrimmed.startsWith('* ') ||
          !rowTrimmed.includes('|')
        ) {
          break;
        }
        rows.push(parseTableRow(rowLine));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Bullet list: starts with '- ' or '* '
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const items: InlineToken[][] = [];
      while (i < lines.length) {
        const itemLine = lines[i];
        const itemTrimmed = itemLine.trim();
        if (itemTrimmed.startsWith('- ') || itemTrimmed.startsWith('* ')) {
          const content = itemTrimmed.slice(2).trim();
          items.push(parseInlines(content));
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // Code fence or block quote or "other" blocks
    if (trimmed.startsWith('```') || trimmed.startsWith('>')) {
      if (trimmed.startsWith('```')) {
        let codeContent = line;
        i++;
        while (i < lines.length) {
          codeContent += '\n' + lines[i];
          if (lines[i].trim().startsWith('```')) {
            i++;
            break;
          }
          i++;
        }
        blocks.push({ type: 'other', text: codeContent });
        continue;
      }
      blocks.push({ type: 'other', text: line });
      i++;
      continue;
    }

    // Paragraph: collect lines until empty or block marker
    const paraLines: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const nextLine = lines[i];
      const nextTrimmed = nextLine.trim();
      if (
        nextTrimmed === '' ||
        nextTrimmed.startsWith('#') ||
        nextTrimmed.startsWith('- ') ||
        nextTrimmed.startsWith('* ') ||
        nextTrimmed.startsWith('```') ||
        (nextTrimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(nextTrimmed);
      i++;
    }

    const paraText = paraLines.join(' ');
    blocks.push({
      type: 'paragraph',
      inlines: parseInlines(paraText),
    });
  }

  return { blocks, truncated };
}

export function extractReportSummary(blocks: ReportBlock[] | { blocks?: ReportBlock[] }): {
  sectionTitles: string[];
  hasNotChecked: boolean;
} {
  const list: ReportBlock[] = Array.isArray(blocks)
    ? blocks
    : Array.isArray(blocks?.blocks)
    ? blocks.blocks
    : [];

  const sectionTitles: string[] = [];
  let hasNotChecked = false;

  for (const block of list) {
    if (block.type === 'heading') {
      if (block.level === 2) {
        sectionTitles.push(block.text);
      }
      if (block.text.toLowerCase().includes('what was not checked')) {
        hasNotChecked = true;
      }
    }
  }

  // If no level 2 headings exist, fall back to level 1 headings
  if (sectionTitles.length === 0) {
    for (const block of list) {
      if (block.type === 'heading' && block.level === 1) {
        sectionTitles.push(block.text);
      }
    }
  }

  return { sectionTitles, hasNotChecked };
}

export function buildReportFileName(report?: Partial<Report> | null): string {
  if (!report) return 'ripple-report.md';

  let rawName = report.project_name || report.projectName;
  if (!rawName && report.markdown) {
    const match =
      report.markdown.match(/\*\*Project Name\*\*:\s*([^\r\n]+)/) ||
      report.markdown.match(/# Ripple AI Analysis Report:\s*([^\r\n]+)/);
    if (match) {
      rawName = match[1].trim();
    }
  }

  if (!rawName) return 'ripple-report.md';

  // Sanitise project name using only letters, digits, dash, dot
  const sanitized = rawName
    .replace(/[^a-zA-Z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!sanitized) return 'ripple-report.md';

  const rawDate = report.created_at;
  let dateStr = '';
  if (rawDate) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      dateStr = d.toISOString().slice(0, 10);
    }
  }
  if (!dateStr) {
    dateStr = new Date().toISOString().slice(0, 10);
  }

  const filename = `ripple-report-${sanitized}-${dateStr}.md`;
  return /^[a-zA-Z0-9.-]+$/.test(filename) ? filename : 'ripple-report.md';
}
