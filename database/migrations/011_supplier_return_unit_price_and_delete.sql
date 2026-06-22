DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'supplier_returns'
      AND column_name = 'agreed_return_price'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'supplier_returns'
      AND column_name = 'agreed_return_price_per_unit'
  ) THEN
    ALTER TABLE supplier_returns
      RENAME COLUMN agreed_return_price TO agreed_return_price_per_unit;
  END IF;
END $$;

ALTER TABLE supplier_returns
  ADD COLUMN IF NOT EXISTS total_agreed_return_amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Records created before this migration stored the entered unit price in the
-- old ambiguously named column. Recalculate all derived values consistently.
UPDATE supplier_returns
SET total_agreed_return_amount = ROUND((agreed_return_price_per_unit * quantity)::numeric, 2),
    supplier_return_profit =
      ROUND((agreed_return_price_per_unit * quantity)::numeric, 2) - fifo_cost;

ALTER TABLE supplier_returns
  ALTER COLUMN total_agreed_return_amount SET NOT NULL,
  ADD CONSTRAINT supplier_returns_total_agreed_amount_nonnegative
    CHECK (total_agreed_return_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_supplier_returns_active_date
  ON supplier_returns(returned_at DESC, id DESC)
  WHERE deleted_at IS NULL;
