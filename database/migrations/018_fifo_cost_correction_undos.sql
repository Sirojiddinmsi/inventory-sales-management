CREATE TABLE IF NOT EXISTS fifo_cost_correction_undos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_id UUID NOT NULL UNIQUE REFERENCES fifo_cost_corrections(id) ON DELETE RESTRICT,
  undone_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  undone_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_fifo_cost_correction_undos_correction
  ON fifo_cost_correction_undos(correction_id);
