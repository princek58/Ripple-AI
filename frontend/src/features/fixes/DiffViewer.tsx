import React, { useState, useMemo } from 'react';
import { Copy, Download, Check, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button.js';
import { parseUnifiedDiff, maskEnvValues, buildPatchFileName } from './fixesPure.js';

export interface DiffViewerProps {
  diffText: string;
  files?: string[];
  fixId: string;
  ruleId?: string;
  maxLinesCollapsed?: number;
}

interface FlattenedLine {
  kind: 'add' | 'del' | 'context' | 'meta';
  text: string;
  oldNo?: number;
  newNo?: number;
  filePath: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diffText,
  files = [],
  fixId,
  ruleId,
  maxLinesCollapsed = 500,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Parse unified diff
  const parsed = useMemo(() => parseUnifiedDiff(diffText), [diffText]);

  // Flatten lines and associate active file path
  const flattenedLines = useMemo(() => {
    const lines: FlattenedLine[] = [];
    let currentPath = files[0] || '';

    // Add header lines as meta lines
    for (const h of parsed.header) {
      lines.push({
        kind: 'meta',
        text: h,
        filePath: currentPath,
      });
    }

    for (const hunk of parsed.hunks) {
      // Add hunk header as meta line
      const hunkHeader = `@@ -${hunk.oldStart} +${hunk.newStart} @@`;
      lines.push({
        kind: 'meta',
        text: hunkHeader,
        filePath: currentPath,
      });

      for (const line of hunk.lines) {
        // Check if a line is a file path indicator (e.g. --- a/path or +++ b/path)
        if (line.kind === 'meta' || line.text.startsWith('---') || line.text.startsWith('+++')) {
          const pathMatch = line.text.match(/^(?:---|\+\+\+)\s+[ab]\/(.+)$/);
          if (pathMatch) {
            currentPath = pathMatch[1].trim();
          }
        }

        lines.push({
          kind: line.kind,
          text: line.text,
          oldNo: line.oldNo,
          newNo: line.newNo,
          filePath: currentPath,
        });
      }
    }

    return lines;
  }, [parsed, files]);

  const totalLines = flattenedLines.length;
  const isTruncatedByDiff = parsed.truncated;
  const isCollapsingLines = !showAll && totalLines > maxLinesCollapsed;
  const displayedLines = isCollapsingLines ? flattenedLines.slice(0, maxLinesCollapsed) : flattenedLines;

  // Copy handler
  const handleCopy = async () => {
    setCopyFeedback(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(diffText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setCopyFeedback('Clipboard not available in this environment');
      }
    } catch {
      setCopyFeedback('Clipboard write failed');
    }
  };

  // Download handler
  const handleDownload = () => {
    const filename = buildPatchFileName({ id: fixId, rule_id: ruleId });
    const blob = new Blob([diffText], { type: 'text/x-diff;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col space-y-2">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2 text-xs text-theme-text-muted">
          <span>{totalLines} lines in diff</span>
          {isTruncatedByDiff && (
            <span
              data-testid="diff-truncated-badge"
              className="px-2 py-0.5 rounded-full bg-severity-medium/10 text-severity-medium font-medium"
            >
              truncated at 2,000 lines
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {copyFeedback && (
            <span className="text-xs text-severity-medium flex items-center space-x-1" role="status">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{copyFeedback}</span>
            </span>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5"
            aria-label="Copy diff"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-severity-low" aria-hidden="true" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy diff</span>
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownload}
            className="gap-1.5"
            aria-label="Download .patch"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Download .patch</span>
          </Button>
        </div>
      </div>

      {/* Diff Table / Container - horizontally scrollable, text nodes only */}
      <div
        className="overflow-x-auto max-w-full rounded-lg border border-theme-border bg-theme-surface font-mono text-xs select-text focus:outline-none focus:ring-2 focus:ring-theme-primary"
        tabIndex={0}
        aria-label="Unified diff viewer"
      >
        <div className="min-w-max">
          {displayedLines.map((line, idx) => {
            // Apply defensive mask to every line before rendering
            const masked = maskEnvValues(line.filePath, line.text);

            let rowBgClass = 'bg-transparent text-theme-text';
            let symbol = ' ';
            let srText = 'context line';

            if (line.kind === 'add') {
              rowBgClass = 'bg-diff-add-bg text-diff-add-text';
              symbol = '+';
              srText = 'added line';
            } else if (line.kind === 'del') {
              rowBgClass = 'bg-diff-del-bg text-diff-del-text';
              symbol = '-';
              srText = 'removed line';
            } else if (line.kind === 'meta') {
              rowBgClass = 'text-theme-text-muted italic bg-theme-surface';
              symbol = ' ';
              srText = 'metadata';
            }

            return (
              <div
                key={idx}
                className={`flex items-stretch border-b border-theme-border/20 ${rowBgClass}`}
              >
                {/* Screen-reader marker so color is never the only signal */}
                <span className="sr-only">{srText} </span>

                {/* Line number gutter */}
                <div className="flex select-none shrink-0 bg-diff-gutter-bg text-diff-line-number border-r border-theme-border/40">
                  <span className="w-10 text-right pr-2 py-0.5" aria-hidden="true">
                    {line.oldNo !== undefined ? line.oldNo : ''}
                  </span>
                  <span className="w-10 text-right pr-2 py-0.5 border-r border-theme-border/40" aria-hidden="true">
                    {line.newNo !== undefined ? line.newNo : ''}
                  </span>
                </div>

                {/* Symbol column (+ / - / space) */}
                <span
                  className="w-6 shrink-0 text-center select-none py-0.5 font-bold"
                  aria-hidden="true"
                >
                  {symbol}
                </span>

                {/* Line text: RENDERED STRICTLY AS A REACT TEXT NODE */}
                <span className="flex-1 py-0.5 pr-4 whitespace-pre">
                  {masked}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Show all button for collapsed diffs */}
      {isCollapsingLines && (
        <div className="flex items-center justify-center pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAll(true)}
            className="w-full sm:w-auto"
          >
            Show all ({totalLines} lines)
          </Button>
        </div>
      )}
    </div>
  );
};
