CREATE TABLE IF NOT EXISTS debt_payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_payment_id UUID NOT NULL REFERENCES debt_payments(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL CHECK (action IN ('UPDATE')),
  before_data JSONB NOT NULL,
  after_data JSONB NOT NULL,
  edited_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debt_payment_audit_logs_payment
  ON debt_payment_audit_logs(debt_payment_id, edited_at DESC);

CREATE INDEX IF NOT EXISTS idx_debt_payment_audit_logs_debt
  ON debt_payment_audit_logs(debt_id, edited_at DESC);
