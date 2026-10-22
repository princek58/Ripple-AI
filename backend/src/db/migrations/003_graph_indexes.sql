-- Migration 003: Additional graph query indexes
CREATE INDEX IF NOT EXISTS idx_nodes_project_parent ON nodes(project_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_project_type ON nodes(project_id, type);
CREATE INDEX IF NOT EXISTS idx_edges_project_source ON edges(project_id, source_id);
CREATE INDEX IF NOT EXISTS idx_edges_project_target ON edges(project_id, target_id);
