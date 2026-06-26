WITH normalized AS (
  SELECT
    d.id,
    LEAST(
      d.amount,
      COALESCE((
        SELECT SUM(dp.amount)
        FROM debt_payments dp
        WHERE dp.debt_id = d.id
      ), d.paid_amount)
    ) AS paid_amount
  FROM debts d
)
UPDATE debts d
SET
  paid_amount = n.paid_amount,
  remaining_amount = d.amount - n.paid_amount,
  status = CASE
    WHEN d.amount - n.paid_amount = 0 THEN 'PAID'::debt_status
    WHEN n.paid_amount > 0 THEN 'PARTIALLY_PAID'::debt_status
    ELSE 'UNPAID'::debt_status
  END
FROM normalized n
WHERE d.id = n.id;
