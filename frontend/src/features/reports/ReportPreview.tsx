import React, { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Report, InlineToken, ReportBlock } from './reportsTypes.js';
import { parseReportMarkdown, extractReportSummary } from './reportsPure.js';

interface ReportPreviewProps {
  report: Report;
}

function renderInlines(tokens: InlineToken[]) {
  return tokens.map((token, idx) => {
    switch (token.type) {
      case 'bold':
        return (
          <strong key={idx} className="font-semibold text-theme-text">
            {token.value}
          </strong>
        );
      case 'code':
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 rounded bg-theme-bg font-mono text-xs text-theme-text border border-theme-border/60"
          >
            {token.value}
          </code>
        );
      case 'text':
      default:
        return <React.Fragment key={idx}>{token.value}</React.Fragment>;
    }
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const ReportPreview: React.FC<ReportPreviewProps> = ({ report }) => {
  const { blocks, truncated } = useMemo(() => {
    return parseReportMarkdown(report.markdown || '');
  }, [report.markdown]);

  const { sectionTitles, hasNotChecked } = useMemo(() => {
    return extractReportSummary(blocks);
  }, [blocks]);

  return (
    <article
      data-testid="report-preview"
      className="p-6 sm:p-8 bg-theme-surface border border-theme-border rounded-xl space-y-6 text-theme-text"
    >
      {/* Generated Date Header (visible in preview and print) */}
      <div className="text-xs text-theme-text-muted pb-3 border-b border-theme-border flex items-center justify-between">
        <span>Report ID: <code className="font-mono">{report.id}</code></span>
        <span>Generated: {new Date(report.created_at).toLocaleString()}</span>
      </div>

      {/* Table of Contents from extractReportSummary */}
      {sectionTitles.length > 0 && (
        <nav
          aria-label="Table of contents"
          data-testid="report-toc"
          className="p-4 rounded-xl bg-theme-bg border border-theme-border space-y-2 no-print"
        >
          <div className="text-xs font-semibold text-theme-text-muted uppercase tracking-wider">
            Contents
          </div>
          <ul className="space-y-1 text-xs">
            {sectionTitles.map((title) => (
              <li key={title} data-testid={`toc-item-${slugify(title)}`}>
                <a
                  href={`#${slugify(title)}`}
                  className="text-theme-text hover:text-brand-primary font-medium transition-colors"
                >
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Warning: visible ONLY when 'What was not checked' section is missing */}
      {!hasNotChecked && (
        <div
          role="alert"
          data-testid="report-warning-not-checked"
          className="p-3.5 rounded-xl bg-severity-medium/10 border border-severity-medium/30 flex items-start gap-2.5 text-xs text-theme-text"
        >
          <AlertCircle className="w-4 h-4 text-severity-medium shrink-0 mt-0.5" aria-hidden="true" />
          <span>This report has no &apos;What was not checked&apos; section</span>
        </div>
      )}

      {/* Render Markdown Blocks */}
      <div className="space-y-4">
        {blocks.map((block: ReportBlock, idx: number) => {
          switch (block.type) {
            case 'heading': {
              const slug = slugify(block.text);
              if (block.level === 1) {
                return (
                  <h1
                    key={idx}
                    id={slug}
                    className="font-heading font-bold text-xl sm:text-2xl text-theme-text pt-2 pb-1"
                    data-testid="report-heading-1"
                  >
                    {block.text}
                  </h1>
                );
              }
              if (block.level === 2) {
                return (
                  <h2
                    key={idx}
                    id={slug}
                    className="font-heading font-semibold text-lg sm:text-xl text-theme-text pt-4 pb-1 border-b border-theme-border"
                    data-testid={`report-heading-2-${slug}`}
                  >
                    {block.text}
                  </h2>
                );
              }
              return (
                <h3
                  key={idx}
                  id={slug}
                  className="font-heading font-medium text-sm sm:text-base text-theme-text pt-2"
                  data-testid={`report-heading-3-${slug}`}
                >
                  {block.text}
                </h3>
              );
            }

            case 'paragraph':
              return (
                <p
                  key={idx}
                  className="text-xs sm:text-sm text-theme-text leading-relaxed"
                >
                  {renderInlines(block.inlines)}
                </p>
              );

            case 'list':
              return (
                <ul
                  key={idx}
                  className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-theme-text"
                >
                  {block.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="leading-relaxed">
                      {renderInlines(item)}
                    </li>
                  ))}
                </ul>
              );

            case 'table':
              return (
                <div
                  key={idx}
                  className="overflow-x-auto my-4 border border-theme-border rounded-lg"
                  data-testid="report-table-container"
                >
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <caption className="sr-only">Analysis report data table</caption>
                    <thead>
                      <tr className="bg-theme-bg border-b border-theme-border">
                        {block.headers.map((h, hIdx) => (
                          <th
                            key={hIdx}
                            scope="col"
                            className="px-3.5 py-2.5 font-semibold text-theme-text"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border/50">
                      {block.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-theme-surface-active/30 transition-colors"
                          data-testid="report-table-row"
                        >
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3.5 py-2 text-theme-text font-mono text-xs whitespace-nowrap sm:whitespace-normal"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );

            case 'other':
              return (
                <pre
                  key={idx}
                  className="p-3 my-2 rounded-lg bg-theme-bg border border-theme-border font-mono text-xs text-theme-text overflow-x-auto"
                >
                  {block.text}
                </pre>
              );

            default:
              return null;
          }
        })}
      </div>

      {truncated && (
        <div
          role="note"
          className="p-3 rounded-lg bg-theme-bg border border-theme-border text-xs text-theme-text-muted"
        >
          Report was truncated at 5,000 lines.
        </div>
      )}

      {/* Printed-only text requirement */}
      <div className="print-only text-xs text-theme-text-muted mt-8 pt-4 border-t border-theme-border">
        Printed from Ripple AI, code is never executed.
      </div>
    </article>
  );
};
