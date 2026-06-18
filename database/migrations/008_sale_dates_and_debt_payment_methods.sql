DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'debt_payment_method'
  ) THEN
    CREATE TYPE debt_payment_method AS ENUM ('CASH', 'CARD', 'TRANSFER', 'MIXED');
  END IF;
END
$$;

ALTER TABLE debt_payments
  ADD COLUMN IF NOT EXISTS payment_method debt_payment_method,
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfer_amount NUMERIC(18, 2) NOT NULL DEFAULT 0;

UPDATE debt_payments
SET payment_method = COALESCE(payment_method, 'CASH'::debt_payment_method),
    cash_amount = CASE
      WHEN cash_amount = 0 AND card_amount = 0 AND transfer_amount = 0
        THEN amount
      ELSE cash_amount
    END
WHERE payment_method IS NULL
   OR (cash_amount = 0 AND card_amount = 0 AND transfer_amount = 0);

ALTER TABLE debt_payments
  ALTER COLUMN payment_method SET NOT NULL;

ALTER TABLE debt_payments
  ADD CONSTRAINT debt_payments_amount_split_check
  CHECK (
    cash_amount >= 0
    AND card_amount >= 0
    AND transfer_amount >= 0
    AND ROUND((cash_amount + card_amount + transfer_amount)::numeric, 2) = ROUND(amount::numeric, 2)
  );

CREATE INDEX IF NOT EXISTS idx_debt_payments_method_paid_at
  ON debt_payments(payment_method, paid_at DESC);
