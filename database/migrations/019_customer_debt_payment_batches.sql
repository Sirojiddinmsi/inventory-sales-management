CREATE TABLE IF NOT EXISTS debt_payment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  identity_type VARCHAR(20) NOT NULL CHECK (identity_type IN ('CUSTOMER_ID', 'LEGACY')),
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name VARCHAR(255),
  phone VARCHAR(40),
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  payment_method debt_payment_method NOT NULL,
  cash_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  card_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (card_amount >= 0),
  transfer_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (transfer_amount >= 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_paid_at TIMESTAMPTZ,
  note TEXT,
  received_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  allocations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cash_amount + card_amount + transfer_amount = amount),
  CHECK (
    (identity_type = 'CUSTOMER_ID' AND customer_id IS NOT NULL AND customer_name IS NULL AND phone IS NULL)
    OR
    (identity_type = 'LEGACY' AND customer_id IS NULL AND customer_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_debt_payment_batches_customer
  ON debt_payment_batches(identity_type, customer_id, customer_name, phone, created_at DESC);

ALTER TABLE debt_payment_batches
  ADD COLUMN IF NOT EXISTS requested_paid_at TIMESTAMPTZ;

ALTER TABLE debt_payments
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES debt_payment_batches(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_debt_payments_batch_id
  ON debt_payments(batch_id);
