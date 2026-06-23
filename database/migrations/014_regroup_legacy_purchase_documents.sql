-- Migration 013 intentionally created one document per legacy purchase item.
-- Regroup only those legacy 1:1 documents when the original rows share an
-- exact operation key. Purchase rows and FIFO batches remain unchanged.
CREATE TEMP TABLE legacy_purchase_document_mapping ON COMMIT DROP AS
WITH legacy_items AS (
  SELECT
    pu.id AS purchase_id,
    pu.purchase_document_id,
    pu.purchased_at,
    pu.created_by,
    pu.supplier_id,
    pd.document_number,
    FIRST_VALUE(pu.purchase_document_id) OVER (
      PARTITION BY pu.purchased_at, pu.created_by, pu.supplier_id
      ORDER BY substring(pd.document_number FROM '[0-9]+$')::bigint DESC, pd.id DESC
    ) AS target_document_id
  FROM purchases pu
  JOIN purchase_documents pd ON pd.id = pu.purchase_document_id
  WHERE pu.purchase_document_id = pu.id
    AND pd.id = pu.id
)
SELECT purchase_id, purchase_document_id, target_document_id
FROM legacy_items
WHERE purchase_document_id <> target_document_id;

UPDATE purchases pu
SET purchase_document_id = mapping.target_document_id
FROM legacy_purchase_document_mapping mapping
WHERE pu.id = mapping.purchase_id;

-- Refresh retained header summaries without changing any inventory data.
WITH affected_documents AS (
  SELECT DISTINCT target_document_id AS id
  FROM legacy_purchase_document_mapping
), document_items AS (
  SELECT
    pu.purchase_document_id AS id,
    MIN(pu.purchased_at) AS purchased_at,
    MIN(pu.created_at) AS created_at,
    MAX(pu.updated_at) AS updated_at,
    MAX(pu.supplier_id::text)::uuid AS supplier_id
  FROM purchases pu
  JOIN affected_documents affected ON affected.id = pu.purchase_document_id
  GROUP BY pu.purchase_document_id
)
UPDATE purchase_documents pd
SET supplier_id = document_items.supplier_id,
    purchased_at = document_items.purchased_at,
    created_at = document_items.created_at,
    updated_at = GREATEST(pd.updated_at, document_items.updated_at)
FROM document_items
WHERE pd.id = document_items.id;

-- Remove only now-empty headers. Product lines, FIFO batches, movements,
-- stock balances, reports, and product history are not modified.
DELETE FROM purchase_documents pd
WHERE NOT EXISTS (
  SELECT 1
  FROM purchases pu
  WHERE pu.purchase_document_id = pd.id
);
