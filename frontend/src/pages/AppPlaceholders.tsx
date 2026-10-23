import React from 'react';
import { Card, CardTitle, CardDescription } from '../components/ui/Card.js';
import { SampleDataTag } from '../components/ui/SampleDataTag.js';

interface PlaceholderProps {
  title: string;
  stepNumber: number;
  description: string;
}

export const PlaceholderPage: React.FC<PlaceholderProps> = ({
  title,
  stepNumber,
  description,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-theme-text tracking-tight">
            {title}
          </h1>
          <p className="mt-1 text-sm text-theme-text-muted">
            Coming in Step {stepNumber}
          </p>
        </div>
        <SampleDataTag />
      </div>

      <Card className="p-8">
        <CardTitle>{title}</CardTitle>
        <CardDescription className="mt-2">{description}</CardDescription>
        <div className="mt-6 p-4 rounded-lg bg-theme-bg border border-dashed border-theme-border text-xs text-theme-text-muted">
          Feature implementation will arrive in Step {stepNumber}. This shell route verifies navigation, layout tokens, and accessibility.
        </div>
      </Card>
    </div>
  );
};

export const OverviewPage: React.FC = () => (
  <PlaceholderPage
    title="Overview"
    stepNumber={10}
    description="Project overview, KPI metrics, findings summary, affected modules, and scan results."
  />
);

export const ProjectsPage: React.FC = () => (
  <PlaceholderPage
    title="Projects"
    stepNumber={10}
    description="Project directory, upload flow for ZIP files, and project management."
  />
);

export const GraphPage: React.FC = () => (
  <PlaceholderPage
    title="Graph"
    stepNumber={11}
    description="Interactive multi-level dependency graph (L1-L3), search filters, and node details panel."
  />
);

export const InvestigationsPage: React.FC = () => (
  <PlaceholderPage
    title="Investigations"
    stepNumber={12}
    description="Findings explorer, evidence view, confidence ratings, and root cause analysis."
  />
);

export const FixesPage: React.FC = () => (
  <PlaceholderPage
    title="Fixes"
    stepNumber={12}
    description="Proposed fixes, diff viewer, and approval / patch generation."
  />
);

export const TestsPage: React.FC = () => (
  <PlaceholderPage
    title="Tests"
    stepNumber={12}
    description="Test run status and test verification coverage."
  />
);

export const ReportsPage: React.FC = () => (
  <PlaceholderPage
    title="Reports"
    stepNumber={12}
    description="Evidence reports, Markdown/PDF exports, and verification summaries."
  />
);
