export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'code'; value: string };

export type HeadingBlock = {
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
};

export type ParagraphBlock = {
  type: 'paragraph';
  inlines: InlineToken[];
};

export type ListBlock = {
  type: 'list';
  items: InlineToken[][];
};

export type TableBlock = {
  type: 'table';
  headers: string[];
  rows: string[][];
};

export type OtherBlock = {
  type: 'other';
  text: string;
};

export type ReportBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | TableBlock
  | OtherBlock;

export interface ReportParsed {
  blocks: ReportBlock[];
  truncated: boolean;
}

export interface Report {
  id: string;
  project_id: string;
  created_at: string;
  markdown: string;
  project_name?: string;
  projectName?: string;
}
