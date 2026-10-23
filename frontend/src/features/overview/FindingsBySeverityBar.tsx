import React from 'react';
import { BarChart3 } from 'lucide-react';
import type { FindingSeverity } from '../../../../shared/types.js';
import { Card } from '../../components/ui/Card.js';

export interface FindingsBySeverityBarProps {
  bySeverity: Record<FindingSeverity, number>;
  className?: string;
}

const SEVERITY_CONFIG: Array<{
  key: FindingSeverity;
  label: string;
  bgClass: string;
}> = [
  { key: 'critical', label: 'Critical', bgClass: 'bg-severity-critical' },
  { key: 'high', label: 'High', bgClass: 'bg-severity-high' },
  { key: 'medium', label: 'Medium', bgClass: 'bg-severity-medium' },
  { key: 'low', label: 'Low', bgClass: 'bg-severity-low' },
  { key: 'unknown', label: 'Unknown', bgClass: 'bg-severity-unknown' },
];

export const FindingsBySeverityBar: React.FC<FindingsBySeverityBarProps> = ({
  bySeverity,
  className = '',
}) => {
  const totalFindings = Object.values(bySeverity).reduce((sum, count) => sum + count, 0);
  const maxCount = Math.max(1, ...Object.values(bySeverity));

  return (
    <Card className={`p-5 space-y-4 ${className}`}>
      <div className="flex items-center justify-between border-b border-theme-border/60 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-theme-text-muted" aria-hidden="true" />
          <h3 className="font-heading font-semibold text-sm text-theme-text uppercase tracking-wider">
            Findings by Severity
          </h3>
        </div>
        <span className="text-xs text-theme-text-muted font-medium">
          {totalFindings} total
        </span>
      </div>

      {/* Accessible Table representation */}
      <table className="sr-only" aria-label="Findings count by severity">
        <thead>
          <tr>
            <th scope="col">Severity</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {SEVERITY_CONFIG.map(({ key, label }) => (
            <tr key={key}>
              <td>{label}</td>
              <td>{bySeverity[key] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Horizontal Bar Chart */}
      <div
        data-testid="findings-by-severity-chart"
        className="space-y-3 pt-1"
        aria-hidden="true"
      >
        {SEVERITY_CONFIG.map(({ key, label, bgClass }) => {
          const count = bySeverity[key] ?? 0;
          const percentage = totalFindings > 0 ? (count / maxCount) * 100 : 0;

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-theme-text">{label}</span>
                <span className="text-theme-text-muted font-mono font-semibold" data-testid={`severity-count-${key}`}>
                  {count}
                </span>
              </div>
              <div className="w-full h-4 bg-theme-border/40 rounded-full overflow-hidden flex items-center">
                <div
                  className={`h-full ${bgClass} rounded-full transition-all duration-500 ease-out motion-reduce:transition-none flex items-center justify-end pr-2 text-[10px] font-bold text-cream select-none`}
                  style={{ width: `${Math.max(count > 0 ? 6 : 0, percentage)}%` }}
                >
                  {count > 0 && count}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
