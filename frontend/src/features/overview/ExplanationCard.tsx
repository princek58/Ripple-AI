import React, { useState } from 'react';
import { BookOpen, Sparkles } from 'lucide-react';
import type { ProjectSummary, FindingSeverity } from '../../../../shared/types.js';
import { Card } from '../../components/ui/Card.js';

export interface ExplanationCardProps {
  summary: ProjectSummary;
  className?: string;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
};

export const ExplanationCard: React.FC<ExplanationCardProps> = ({
  summary,
  className = '',
}) => {
  const [language, setLanguage] = useState<'en' | 'hinglish'>('en');

  const totalFindings = summary.kpi.openFindings;
  const criticalPlusHigh = summary.kpi.criticalPlusHigh;
  const verifiedFixes = summary.kpi.verifiedFixes;

  // Highest severity module from affectedModules
  const mostAffectedModule =
    summary.affectedModules.length > 0
      ? [...summary.affectedModules].sort(
          (a, b) =>
            (SEVERITY_ORDER[b.maxSeverity] ?? 0) -
              (SEVERITY_ORDER[a.maxSeverity] ?? 0) ||
            b.findingCount - a.findingCount
        )[0]
      : null;

  const englishExplanation =
    totalFindings === 0
      ? 'This project has 0 findings detected by Phase 1 static checks. No fixes have been verified yet.'
      : `Found ${totalFindings} total findings across the project. ${criticalPlusHigh} ${criticalPlusHigh === 1 ? 'is' : 'are'} critical or high severity.${
          mostAffectedModule ? ` The most affected module is ${mostAffectedModule.label}.` : ''
        } ${verifiedFixes === 0 ? 'No fixes have been verified yet.' : `${verifiedFixes} fix(es) have been verified.`}`;

  const hinglishExplanation =
    totalFindings === 0
      ? 'Is project me Phase 1 static checks se 0 findings mili hain. Abhi tak koi bhi fix verify nahi hua hai.'
      : `Is project me kul ${totalFindings} findings mili hain. Inme se ${criticalPlusHigh} critical ya high severity hain.${
          mostAffectedModule ? ` Sabse zyada prabhavit module ${mostAffectedModule.label} hai.` : ''
        } ${verifiedFixes === 0 ? 'Abhi tak koi bhi fix verify nahi hua hai.' : `${verifiedFixes} fix verify ho chuke hain.`}`;

  return (
    <Card className={`p-5 space-y-4 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-theme-border/60 pb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-theme-text-muted" aria-hidden="true" />
          <h3 className="font-heading font-semibold text-sm text-theme-text uppercase tracking-wider">
            Plain-language summary
          </h3>
          <span
            data-testid="template-label"
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-theme-border/50 text-theme-text-muted"
          >
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            Template-based, not AI
          </span>
        </div>

        {/* English / Hinglish Toggle */}
        <div
          role="group"
          aria-label="Language selection"
          className="inline-flex rounded-lg border border-theme-border p-0.5 bg-theme-bg"
        >
          <button
            type="button"
            data-testid="lang-toggle-en"
            aria-pressed={language === 'en'}
            onClick={() => setLanguage('en')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 motion-reduce:transition-none ${
              language === 'en'
                ? 'bg-forest text-cream dark:bg-lime dark:text-forest shadow-xs'
                : 'text-theme-text-muted hover:text-theme-text'
            }`}
          >
            English
          </button>
          <button
            type="button"
            data-testid="lang-toggle-hinglish"
            aria-pressed={language === 'hinglish'}
            onClick={() => setLanguage('hinglish')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 motion-reduce:transition-none ${
              language === 'hinglish'
                ? 'bg-forest text-cream dark:bg-lime dark:text-forest shadow-xs'
                : 'text-theme-text-muted hover:text-theme-text'
            }`}
          >
            Hinglish
          </button>
        </div>
      </div>

      <div
        data-testid="explanation-text"
        className="text-xs sm:text-sm text-theme-text leading-relaxed bg-theme-bg/60 p-4 rounded-xl border border-theme-border"
      >
        {language === 'en' ? englishExplanation : hinglishExplanation}
      </div>
    </Card>
  );
};
