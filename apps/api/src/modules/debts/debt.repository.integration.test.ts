import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

function isDisposableIssue004Database(value?: string) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const databaseName = parsed.pathname.replace(/^\//u, "");
    return ["localhost", "127.0.0.1"].includes(parsed.hostname) &&
      (databaseName.includes("_test") || databaseName.toLowerCase().includes("issue004"));
  } catch {
    return false;
  }
}

const describeDatabase = isDisposableIssue004Database(databaseUrl) ? describe : describe.skip;
const { Pool } = pg;

describeDatabase("DebtRepository customer payment integration (disposable DB only)", () => {
  const runTag = `issue004_${Date.now().toString(36)}`;
  const invoicePrefix = `I4-${Date.now().toString(36).slice(-7)}`;
  let invoiceCounter = 0;
  let fixturePool: import("pg").Pool;
  let applicationPool: import("pg").Pool;
  let repository: InstanceType<typeof import("./debt.repository.js").DebtRepository>;
  let reportRepository: typeof import("../reports/report.repository.js").reportRepository;
  let userId: string;

  async function createCustomer(name: string, phone: string | null) {
    const id = randomUUID();
    await fixturePool.query(
      "INSERT INTO customers (id, name, phone, note) VALUES ($1,$2,$3,$4)",
      [id, name, phone, runTag]
    );
    return id;
  }

  async function createDebtSet(input: {
    amounts: number[];
    customerId: string | null;
    customerName: string;
    phone: string | null;
    createdBase?: string;
  }) {
    const debtIds: string[] = [];
    const saleIds: string[] = [];
    const createdBase = new Date(input.createdBase ?? "2026-08-01T08:00:00.000Z").getTime();

    for (const [index, amount] of input.amounts.entries()) {
      invoiceCounter += 1;
      const saleId = randomUUID();
      const debtId = randomUUID();
      const createdAt = new Date(createdBase + index * 86_400_000).toISOString();
      const invoiceNumber = `${invoicePrefix}-${invoiceCounter}`;

      await fixturePool.query(
        `INSERT INTO sales (
           id, invoice_number, customer_id, customer_name, customer_phone,
           subtotal, discount, total_amount, payment_type, profit,
           fifo_cost, sold_at, note, created_by, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,0,$6,'DEBT',20000,80000,$7,$8,$9,$7)`,
        [
          saleId,
          invoiceNumber,
          input.customerId,
          input.customerName,
          input.phone,
          amount,
          createdAt,
          runTag,
          userId
        ]
      );
      await fixturePool.query(
        `INSERT INTO debts (
           id, sale_id, customer_id, customer_name, phone, amount,
           paid_amount, remaining_amount, status, due_date, note, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,0,$6,'UNPAID',$7,$8,$9)`,
        [
          debtId,
          saleId,
          input.customerId,
          input.customerName,
          input.phone,
          amount,
          new Date(createdBase + (index + 10) * 86_400_000).toISOString().slice(0, 10),
          runTag,
          createdAt
        ]
      );
      saleIds.push(saleId);
      debtIds.push(debtId);
    }

    return { debtIds, saleIds };
  }

  async function debtRows(debtIds: string[]) {
    const result = await fixturePool.query(
      `SELECT d.id, d.amount, d.paid_amount, d.remaining_amount, d.status,
              COALESCE(SUM(dp.amount), 0) AS payment_sum
       FROM debts d
       LEFT JOIN debt_payments dp ON dp.debt_id = d.id
       WHERE d.id = ANY($1::uuid[])
       GROUP BY d.id
       ORDER BY d.created_at, d.id`,
      [debtIds]
    );
    return result.rows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      paidAmount: Number(row.paid_amount),
      remainingAmount: Number(row.remaining_amount),
      status: row.status,
      paymentSum: Number(row.payment_sum)
    }));
  }

  async function createAccountingSnapshotFixture(saleId: string) {
    const categoryId = randomUUID();
    const productId = randomUUID();
    const batchId = randomUUID();
    const saleItemId = randomUUID();
    const returnId = randomUUID();

    await fixturePool.query(
      "INSERT INTO categories (id, name, slug) VALUES ($1,$2,$3)",
      [categoryId, `Issue 004 ${runTag}`, `${runTag}-category`]
    );
    await fixturePool.query(
      `INSERT INTO products (
         id, code, name, category_id, unit, purchase_price, sale_price,
         stock_quantity, minimum_stock, description
       ) VALUES ($1,$2,$3,$4,'dona',10000,12500,43,2,$5)`,
      [productId, `${runTag}-PRODUCT`, `Invariant product ${runTag}`, categoryId, runTag]
    );
    await fixturePool.query(
      `INSERT INTO inventory_batches (
         id, product_id, initial_quantity, remaining_quantity, purchase_price,
         received_at, source, source_reference_id
       ) VALUES ($1,$2,50,43,10000,'2026-07-01T08:00:00Z','PURCHASE',$3)`,
      [batchId, productId, randomUUID()]
    );
    await fixturePool.query(
      `INSERT INTO sale_items (
         id, sale_id, product_id, quantity, sale_quantity, unit, unit_multiplier,
         sale_price, purchase_price, discount, total_amount, profit, fifo_cost,
         returned_quantity, returned_sale_quantity, returned_amount,
         returned_profit, returned_fifo_cost
       ) VALUES ($1,$2,$3,8,8,'dona',1,12500,10000,0,100000,20000,80000,1,1,12500,2500,10000)`,
      [saleItemId, saleId, productId]
    );
    await fixturePool.query(
      `INSERT INTO sale_item_batch_allocations (
         sale_item_id, batch_id, quantity, unit_cost, cost_amount, returned_quantity
       ) VALUES ($1,$2,8,10000,80000,1)`,
      [saleItemId, batchId]
    );
    await fixturePool.query(
      `INSERT INTO sale_returns (
         id, sale_id, sale_item_id, product_id, quantity, sale_quantity, unit,
         unit_multiplier, amount, profit_reversal, fifo_cost_reversal,
         reason, returned_at, created_by
       ) VALUES ($1,$2,$3,$4,1,1,'dona',1,12500,2500,10000,$5,'2026-08-20T08:00:00Z',$6)`,
      [returnId, saleId, saleItemId, productId, runTag, userId]
    );
    await fixturePool.query(
      `UPDATE sales
       SET returned_amount = 12500, returned_profit = 2500, returned_fifo_cost = 10000
       WHERE id = $1`,
      [saleId]
    );

    return { productId, batchId, saleItemId, returnId, saleId };
  }

  async function accountingSnapshot(ids: Awaited<ReturnType<typeof createAccountingSnapshotFixture>>) {
    const [product, batch, allocation, sale, item, saleReturn] = await Promise.all([
      fixturePool.query(
        "SELECT stock_quantity, purchase_price, sale_price FROM products WHERE id = $1",
        [ids.productId]
      ),
      fixturePool.query(
        "SELECT initial_quantity, remaining_quantity, purchase_price, source FROM inventory_batches WHERE id = $1",
        [ids.batchId]
      ),
      fixturePool.query(
        `SELECT quantity, unit_cost, cost_amount, returned_quantity, archived_released_quantity
         FROM sale_item_batch_allocations WHERE sale_item_id = $1 AND batch_id = $2`,
        [ids.saleItemId, ids.batchId]
      ),
      fixturePool.query(
        `SELECT payment_type, total_amount, profit, fifo_cost, returned_amount,
                returned_profit, returned_fifo_cost, archived_at
         FROM sales WHERE id = $1`,
        [ids.saleId]
      ),
      fixturePool.query(
        `SELECT quantity, sale_quantity, total_amount, profit, fifo_cost,
                returned_quantity, returned_sale_quantity, returned_amount,
                returned_profit, returned_fifo_cost
         FROM sale_items WHERE id = $1`,
        [ids.saleItemId]
      ),
      fixturePool.query(
        `SELECT quantity, sale_quantity, amount, profit_reversal, fifo_cost_reversal,
                reason, returned_at
         FROM sale_returns WHERE id = $1`,
        [ids.returnId]
      )
    ]);

    return {
      product: product.rows[0],
      batch: batch.rows[0],
      allocation: allocation.rows[0],
      sale: sale.rows[0],
      item: item.rows[0],
      saleReturn: saleReturn.rows[0]
    };
  }

  beforeAll(async () => {
    fixturePool = new Pool({ connectionString: databaseUrl, max: 8 });
    const databaseCheck = await fixturePool.query(
      "SELECT current_database() AS database_name, host(inet_server_addr()) AS server_address"
    );
    const databaseName = String(databaseCheck.rows[0]?.database_name ?? "");
    const serverAddress = String(databaseCheck.rows[0]?.server_address ?? "");
    if (!(databaseName.includes("_test") || databaseName.toLowerCase().includes("issue004")) ||
        !["127.0.0.1", "::1"].includes(serverAddress)) {
      throw new Error("ISSUE-004 integration guard rejected the connected database");
    }

    const repositoryModule = await import("./debt.repository.js");
    const databaseModule = await import("../../config/database.js");
    const reportModule = await import("../reports/report.repository.js");
    repository = new repositoryModule.DebtRepository();
    applicationPool = databaseModule.pool;
    reportRepository = reportModule.reportRepository;

    userId = randomUUID();
    await fixturePool.query(
      `INSERT INTO users (id, name, email, password_hash, role)
       VALUES ($1,$2,$3,'integration-test-only','ADMIN')`,
      [userId, `Issue 004 tester ${runTag}`, `${runTag}@example.test`]
    );
  });

  afterAll(async () => {
    if (!fixturePool) return;
    await fixturePool.query("DROP TRIGGER IF EXISTS issue004_fail_second_batch_child ON debt_payments");
    await fixturePool.query("DROP FUNCTION IF EXISTS issue004_fail_second_batch_child()");
    await fixturePool.query(
      `DELETE FROM debt_payments
       WHERE received_by = $1
          OR debt_id IN (
            SELECT d.id FROM debts d JOIN sales s ON s.id = d.sale_id WHERE s.created_by = $1
          )`,
      [userId]
    );
    await fixturePool.query("DELETE FROM debt_payment_batches WHERE received_by = $1", [userId]);
    await fixturePool.query(
      "DELETE FROM debts WHERE sale_id IN (SELECT id FROM sales WHERE created_by = $1)",
      [userId]
    );
    await fixturePool.query(
      "DELETE FROM sale_returns WHERE sale_id IN (SELECT id FROM sales WHERE created_by = $1)",
      [userId]
    );
    await fixturePool.query(
      `DELETE FROM sale_item_batch_allocations
       WHERE sale_item_id IN (
         SELECT si.id FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.created_by = $1
       )`,
      [userId]
    );
    await fixturePool.query(
      "DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE created_by = $1)",
      [userId]
    );
    await fixturePool.query("DELETE FROM sales WHERE created_by = $1", [userId]);
    await fixturePool.query(
      "DELETE FROM inventory_batches WHERE product_id IN (SELECT id FROM products WHERE description = $1)",
      [runTag]
    );
    await fixturePool.query("DELETE FROM products WHERE description = $1", [runTag]);
    await fixturePool.query("DELETE FROM categories WHERE slug = $1", [`${runTag}-category`]);
    await fixturePool.query("DELETE FROM customers WHERE note = $1", [runTag]);
    await fixturePool.query("DELETE FROM users WHERE id = $1", [userId]);
    await applicationPool?.end();
    await fixturePool.end();
  });

  it("allocates 250k as 100k + 150k and preserves stock/FIFO/sale/profit/return snapshots", async () => {
    const customerId = await createCustomer(`Main ${runTag}`, "+998901010101");
    const fixture = await createDebtSet({
      amounts: [100000, 200000, 300000],
      customerId,
      customerName: `Main ${runTag}`,
      phone: "+998901010101"
    });
    const accountingIds = await createAccountingSnapshotFixture(fixture.saleIds[0]!);
    const before = await accountingSnapshot(accountingIds);

    const result = await repository.payCustomer({
      requestId: randomUUID(),
      identityType: "CUSTOMER_ID",
      customerId,
      amount: 250000,
      paymentMethod: "CASH",
      receivedBy: userId,
      note: "100k + 150k"
    });

    expect(result.allocations.map((allocation) => [allocation.debtId, allocation.amount])).toEqual([
      [fixture.debtIds[0], 100000],
      [fixture.debtIds[1], 150000]
    ]);
    expect(result.allocations.map((allocation) => [
      allocation.cashAmount,
      allocation.cardAmount,
      allocation.transferAmount
    ])).toEqual([[100000, 0, 0], [150000, 0, 0]]);
    expect(await debtRows(fixture.debtIds)).toEqual([
      expect.objectContaining({ paidAmount: 100000, remainingAmount: 0, status: "PAID", paymentSum: 100000 }),
      expect.objectContaining({ paidAmount: 150000, remainingAmount: 50000, status: "PARTIALLY_PAID", paymentSum: 150000 }),
      expect.objectContaining({ paidAmount: 0, remainingAmount: 300000, status: "UNPAID", paymentSum: 0 })
    ]);
    expect(await accountingSnapshot(accountingIds)).toEqual(before);
  });

  it("closes exactly the first two oldest invoices for an exact 300k payment", async () => {
    const customerId = await createCustomer(`Exact ${runTag}`, "+998902020202");
    const fixture = await createDebtSet({
      amounts: [100000, 200000, 300000],
      customerId,
      customerName: `Exact ${runTag}`,
      phone: "+998902020202",
      createdBase: "2026-05-01T08:00:00.000Z"
    });

    const result = await repository.payCustomer({
      requestId: randomUUID(),
      identityType: "CUSTOMER_ID",
      customerId,
      amount: 300000,
      paymentMethod: "CARD",
      receivedBy: userId
    });

    expect(result.allocations.map((allocation) => allocation.amount)).toEqual([100000, 200000]);
    expect((await debtRows(fixture.debtIds)).map((row) => [row.paidAmount, row.remainingAmount, row.status])).toEqual([
      [100000, 0, "PAID"],
      [200000, 0, "PAID"],
      [0, 300000, "UNPAID"]
    ]);
  });

  it("rejects total + 0.01 with HTTP-domain 422 semantics and performs no write", async () => {
    const customerId = await createCustomer(`Overpay ${runTag}`, "+998903030303");
    const fixture = await createDebtSet({
      amounts: [100000, 200000],
      customerId,
      customerName: `Overpay ${runTag}`,
      phone: "+998903030303"
    });
    const requestId = randomUUID();
    const before = await debtRows(fixture.debtIds);

    await expect(repository.payCustomer({
      requestId,
      identityType: "CUSTOMER_ID",
      customerId,
      amount: 300000.01,
      paymentMethod: "TRANSFER",
      receivedBy: userId
    })).rejects.toMatchObject({
      statusCode: 422,
      code: "PAYMENT_EXCEEDS_CUSTOMER_DEBT"
    });

    expect(await debtRows(fixture.debtIds)).toEqual(before);
    expect(Number((await fixturePool.query(
      "SELECT COUNT(*) AS count FROM debt_payment_batches WHERE request_id = $1",
      [requestId]
    )).rows[0].count)).toBe(0);
    expect(Number((await fixturePool.query(
      "SELECT COUNT(*) AS count FROM debt_payments WHERE debt_id = ANY($1::uuid[])",
      [fixture.debtIds]
    )).rows[0].count)).toBe(0);
  });

  it("rolls back the batch, first child insert and debt update when a later child fails", async () => {
    const customerId = await createCustomer(`Rollback ${runTag}`, "+998904040404");
    const fixture = await createDebtSet({
      amounts: [100000, 200000],
      customerId,
      customerName: `Rollback ${runTag}`,
      phone: "+998904040404"
    });
    const requestId = randomUUID();
    const before = await debtRows(fixture.debtIds);

    await fixturePool.query(`
      CREATE OR REPLACE FUNCTION issue004_fail_second_batch_child()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.batch_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM debt_payments WHERE batch_id = NEW.batch_id
        ) THEN
          RAISE EXCEPTION 'issue004 injected second-child failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await fixturePool.query(`
      CREATE TRIGGER issue004_fail_second_batch_child
      BEFORE INSERT ON debt_payments
      FOR EACH ROW EXECUTE FUNCTION issue004_fail_second_batch_child()
    `);

    try {
      await expect(repository.payCustomer({
        requestId,
        identityType: "CUSTOMER_ID",
        customerId,
        amount: 250000,
        paymentMethod: "CASH",
        receivedBy: userId
      })).rejects.toThrow("issue004 injected second-child failure");
    } finally {
      await fixturePool.query("DROP TRIGGER issue004_fail_second_batch_child ON debt_payments");
      await fixturePool.query("DROP FUNCTION issue004_fail_second_batch_child()");
    }

    expect(await debtRows(fixture.debtIds)).toEqual(before);
    expect(Number((await fixturePool.query(
      "SELECT COUNT(*) AS count FROM debt_payment_batches WHERE request_id = $1",
      [requestId]
    )).rows[0].count)).toBe(0);
    expect(Number((await fixturePool.query(
      "SELECT COUNT(*) AS count FROM debt_payments WHERE debt_id = ANY($1::uuid[])",
      [fixture.debtIds]
    )).rows[0].count)).toBe(0);
  });

  it("scopes UUID and normalized legacy customer details to active, paid, all, and archive sets", async () => {
    const scopeToken = randomUUID().slice(0, 8);
    const scopeName = `Scope ${scopeToken}`;
    const scopePhone = "+998 90 505 05 05";
    const customerId = await createCustomer(scopeName, scopePhone);
    const uuidFixture = await createDebtSet({
      amounts: [100000, 200000, 300000, 400000],
      customerId,
      customerName: scopeName,
      phone: scopePhone,
      createdBase: "2040-01-01T08:00:00.000Z"
    });
    const legacyFixture = await createDebtSet({
      amounts: [110000, 210000, 310000, 410000],
      customerId: null,
      customerName: `  ${scopeName.toUpperCase().replace(" ", "   ")}  `,
      phone: "998905050505",
      createdBase: "2040-02-01T08:00:00.000Z"
    });

    await repository.pay({
      debtId: uuidFixture.debtIds[0]!,
      amount: 100000,
      paymentMethod: "CASH",
      receivedBy: userId
    });
    await repository.pay({
      debtId: uuidFixture.debtIds[1]!,
      amount: 50000,
      paymentMethod: "CARD",
      receivedBy: userId
    });
    await repository.pay({
      debtId: legacyFixture.debtIds[0]!,
      amount: 110000,
      paymentMethod: "TRANSFER",
      receivedBy: userId
    });
    await repository.pay({
      debtId: legacyFixture.debtIds[1]!,
      amount: 60000,
      paymentMethod: "CASH",
      receivedBy: userId
    });
    await fixturePool.query(
      `UPDATE debts
       SET archived_at = NOW(), archived_by = $2, archive_reason = 'issue005 scope fixture'
       WHERE id = ANY($1::uuid[])`,
      [[uuidFixture.debtIds[3], legacyFixture.debtIds[3]], userId]
    );

    const identities = [
      {
        identity: { identityType: "CUSTOMER_ID" as const, customerId },
        fixture: uuidFixture,
        expected: {
          active: { count: 2, total: 500000, paid: 50000, remaining: 450000 },
          paid: { count: 1, total: 100000, paid: 100000, remaining: 0 },
          all: { count: 3, total: 600000, paid: 150000, remaining: 450000 },
          archive: { count: 1, total: 400000, paid: 0, remaining: 400000 }
        }
      },
      {
        identity: {
          identityType: "LEGACY" as const,
          customerName: scopeName.toLowerCase(),
          phone: "+998 (90) 505-05-05"
        },
        fixture: legacyFixture,
        expected: {
          active: { count: 2, total: 520000, paid: 60000, remaining: 460000 },
          paid: { count: 1, total: 110000, paid: 110000, remaining: 0 },
          all: { count: 3, total: 630000, paid: 170000, remaining: 460000 },
          archive: { count: 1, total: 410000, paid: 0, remaining: 410000 }
        }
      }
    ];

    for (const { identity, fixture, expected } of identities) {
      for (const scope of ["active", "paid", "all", "archive"] as const) {
        const details = await repository.customerDetails({ ...identity, scope });
        const expectedTotals = expected[scope];
        const expectedIds = scope === "active"
          ? fixture.debtIds.slice(1, 3)
          : scope === "paid"
            ? fixture.debtIds.slice(0, 1)
            : scope === "all"
              ? fixture.debtIds.slice(0, 3)
              : fixture.debtIds.slice(3, 4);

        expect(details).toMatchObject({
          debt_count: expectedTotals.count,
          total_amount: expectedTotals.total,
          total_paid_amount: expectedTotals.paid,
          total_remaining_amount: expectedTotals.remaining
        });
        expect(details.debts.map((debt: { id: string }) => debt.id)).toEqual(expectedIds);
        if (scope === "active") {
          expect(details.debts.every((debt: { remaining_amount: number }) =>
            Number(debt.remaining_amount) > 0)).toBe(true);
        } else if (scope === "paid") {
          expect(details.debts.every((debt: { remaining_amount: number }) =>
            Number(debt.remaining_amount) === 0)).toBe(true);
        } else if (scope === "archive") {
          expect(details.debts.every((debt: { archived_at: string | null }) =>
            debt.archived_at !== null)).toBe(true);
        }
      }
    }
  });

  it("isolates UUID customers from same-name customers and normalized legacy debts", async () => {
    const identityToken = randomUUID().slice(0, 8);
    const identityName = `Identity ${identityToken}`;
    const identityPhone = "+998 90 555 44 33";
    const customerA = await createCustomer(identityName, identityPhone);
    const customerB = await createCustomer(identityName, identityPhone);
    const fixtureA = await createDebtSet({
      amounts: [100000, 30000, 70000],
      customerId: customerA,
      customerName: identityName,
      phone: identityPhone,
      createdBase: "2026-01-01T08:00:00.000Z"
    });
    const fixtureB = await createDebtSet({
      amounts: [200000],
      customerId: customerB,
      customerName: identityName,
      phone: identityPhone,
      createdBase: "2026-02-01T08:00:00.000Z"
    });
    const legacyFirst = await createDebtSet({
      amounts: [90000],
      customerId: null,
      customerName: identityName,
      phone: identityPhone,
      createdBase: "2026-03-01T08:00:00.000Z"
    });
    const legacySecond = await createDebtSet({
      amounts: [110000],
      customerId: null,
      customerName: `  ${identityName.toUpperCase().replace(" ", "   ")}  `,
      phone: "998905554433",
      createdBase: "2026-03-02T08:00:00.000Z"
    });

    await repository.pay({
      debtId: fixtureA.debtIds[1]!,
      amount: 30000,
      paymentMethod: "CASH",
      receivedBy: userId
    });
    await fixturePool.query(
      "UPDATE debts SET archived_at = NOW(), archived_by = $2, archive_reason = 'integration' WHERE id = $1",
      [fixtureA.debtIds[2], userId]
    );

    const details = await repository.customerDetails({
      identityType: "CUSTOMER_ID",
      customerId: customerA,
      scope: "all"
    });
    expect(details.debt_count).toBe(2);
    expect(details.debts.map((debt: { id: string }) => debt.id)).toEqual(fixtureA.debtIds.slice(0, 2));

    const filteredGroups = await repository.customers({
      page: 1,
      limit: 20,
      search: identityToken,
      filter: "active",
      archived: false,
      sortBy: "created_at",
      sortOrder: "asc"
    });
    expect(filteredGroups.rows.find((row: { customer_id: string }) => row.customer_id === customerA))
      .toMatchObject({ debt_count: 1, total_remaining_amount: 100000 });

    const groups = await repository.customers({
      page: 1,
      limit: 20,
      search: identityToken,
      filter: "all",
      archived: false,
      sortBy: "created_at",
      sortOrder: "asc"
    });
    expect(groups.rows).toHaveLength(3);
    expect(groups.rows.filter((row: { identity_type: string }) => row.identity_type === "CUSTOMER_ID")
      .map((row: { customer_id: string }) => row.customer_id).sort()).toEqual([customerA, customerB].sort());
    expect(groups.rows.filter((row: { identity_type: string }) => row.identity_type === "LEGACY"))
      .toHaveLength(1);

    await repository.payCustomer({
      requestId: randomUUID(),
      identityType: "CUSTOMER_ID",
      customerId: customerA,
      amount: 100000,
      paymentMethod: "CARD",
      receivedBy: userId
    });
    const legacyResult = await repository.payCustomer({
      requestId: randomUUID(),
      identityType: "LEGACY",
      customerName: identityName.toLowerCase(),
      phone: "+998 (90) 555-44-33",
      amount: 150000,
      paymentMethod: "TRANSFER",
      receivedBy: userId
    });

    expect(legacyResult.allocations.map((allocation) => [allocation.debtId, allocation.amount])).toEqual([
      [legacyFirst.debtIds[0], 90000],
      [legacySecond.debtIds[0], 60000]
    ]);
    expect((await debtRows(fixtureB.debtIds))[0]).toMatchObject({ paidAmount: 0, remainingAmount: 200000 });
    expect((await debtRows([fixtureA.debtIds[2]!]))[0]).toMatchObject({ paidAmount: 0, remainingAmount: 70000 });
  });

  it("returns the original receipt for duplicate requestId and keeps admin edit audit/current totals", async () => {
    const customerId = await createCustomer(`Idempotent ${runTag}`, "+998906060606");
    const fixture = await createDebtSet({
      amounts: [300000],
      customerId,
      customerName: `Idempotent ${runTag}`,
      phone: "+998906060606"
    });
    const requestId = randomUUID();
    const paidAt = "2042-06-06T06:06:06.000Z";
    const payload = {
      requestId,
      identityType: "CUSTOMER_ID" as const,
      customerId,
      amount: 120000,
      paymentMethod: "MIXED" as const,
      cashAmount: 50000,
      cardAmount: 40000,
      transferAmount: 30000,
      paidAt,
      note: "immutable receipt",
      receivedBy: userId
    };

    const first = await repository.payCustomer(payload);
    const retry = await repository.payCustomer(payload);
    expect(retry).toEqual(first);
    expect(Number((await fixturePool.query(
      "SELECT COUNT(*) AS count FROM debt_payment_batches WHERE request_id = $1",
      [requestId]
    )).rows[0].count)).toBe(1);
    expect(Number((await fixturePool.query(
      "SELECT COUNT(*) AS count FROM debt_payments WHERE batch_id = $1",
      [first.batchId]
    )).rows[0].count)).toBe(1);

    const paymentId = first.allocations[0]!.paymentId;
    await repository.updatePayment({
      debtId: fixture.debtIds[0]!,
      paymentId,
      amount: 100000,
      paymentMethod: "MIXED",
      cashAmount: 40000,
      cardAmount: 35000,
      transferAmount: 25000,
      paidAt,
      note: "admin-adjusted child",
      editedBy: userId
    });

    const afterEditRetry = await repository.payCustomer(payload);
    expect(afterEditRetry.allocations).toEqual(first.allocations);
    expect(afterEditRetry.allocations[0]).toMatchObject({ amount: 120000, paidAmount: 120000 });
    expect((await debtRows(fixture.debtIds))[0]).toMatchObject({
      paidAmount: 100000,
      remainingAmount: 200000,
      paymentSum: 100000
    });
    expect(Number((await fixturePool.query(
      "SELECT COUNT(*) AS count FROM debt_payment_audit_logs WHERE debt_payment_id = $1",
      [paymentId]
    )).rows[0].count)).toBe(1);
    expect(Number((await fixturePool.query(
      "SELECT (allocations_json->0->>'amount')::numeric AS amount FROM debt_payment_batches WHERE id = $1",
      [first.batchId]
    )).rows[0].amount)).toBe(120000);

    await expect(repository.payCustomer({ ...payload, amount: 120000.01, cashAmount: 50000.01 }))
      .rejects.toMatchObject({ statusCode: 409, code: "PAYMENT_REQUEST_ID_REUSED" });
    await expect(repository.payCustomer({ ...payload, paidAt: undefined }))
      .rejects.toMatchObject({ statusCode: 409, code: "PAYMENT_REQUEST_ID_REUSED" });
  });

  it("keeps every method/split exact and reports each child once", async () => {
    const cases = [
      { method: "CASH" as const, day: "01", split: [100000, 0, 0] },
      { method: "CARD" as const, day: "02", split: [0, 100000, 0] },
      { method: "TRANSFER" as const, day: "03", split: [0, 0, 100000] },
      { method: "MIXED" as const, day: "04", split: [30000, 40000, 30000] }
    ];

    for (const current of cases) {
      const customerId = await createCustomer(`${current.method} ${runTag}`, `+99890707${current.day}`);
      const fixture = await createDebtSet({
        amounts: [60000, 60000],
        customerId,
        customerName: `${current.method} ${runTag}`,
        phone: `+99890707${current.day}`
      });
      const paidAt = `2041-01-${current.day}T10:00:00.000Z`;
      const result = await repository.payCustomer({
        requestId: randomUUID(),
        identityType: "CUSTOMER_ID",
        customerId,
        amount: 100000,
        paymentMethod: current.method,
        cashAmount: current.method === "MIXED" ? current.split[0] : undefined,
        cardAmount: current.method === "MIXED" ? current.split[1] : undefined,
        transferAmount: current.method === "MIXED" ? current.split[2] : undefined,
        paidAt,
        receivedBy: userId
      });
      const aggregate = await fixturePool.query(
        `SELECT COUNT(*)::int AS child_count, SUM(amount) AS amount,
                SUM(cash_amount) AS cash, SUM(card_amount) AS card,
                SUM(transfer_amount) AS transfer
         FROM debt_payments WHERE batch_id = $1`,
        [result.batchId]
      );
      expect(aggregate.rows[0]).toMatchObject({
        child_count: result.allocations.length,
        amount: 100000,
        cash: current.split[0],
        card: current.split[1],
        transfer: current.split[2]
      });
      for (const allocation of result.allocations) {
        expect(allocation.cashAmount + allocation.cardAmount + allocation.transferAmount)
          .toBe(allocation.amount);
      }

      const report = await reportRepository.get({
        from: `2041-01-${current.day}T00:00:00.000Z`,
        to: `2041-01-${current.day}T23:59:59.999Z`,
        paymentType: current.method
      });
      expect(report.debt_payments).toEqual([
        expect.objectContaining({
          payment_method: current.method,
          payment_count: result.allocations.length,
          total_amount: 100000
        })
      ]);
      expect((await debtRows(fixture.debtIds)).every((row) =>
        row.paidAmount === row.paymentSum && row.remainingAmount === row.amount - row.paidAmount
      )).toBe(true);
    }
  });

  it("serializes parallel customer payments and deduplicates parallel identical requestIds", async () => {
    const customerId = await createCustomer(`Concurrent ${runTag}`, "+998908080808");
    const fixture = await createDebtSet({
      amounts: [100000, 200000],
      customerId,
      customerName: `Concurrent ${runTag}`,
      phone: "+998908080808"
    });
    const common = {
      identityType: "CUSTOMER_ID" as const,
      customerId,
      amount: 200000,
      paymentMethod: "CASH" as const,
      receivedBy: userId
    };

    const competing = await Promise.allSettled([
      repository.payCustomer({ ...common, requestId: randomUUID() }),
      repository.payCustomer({ ...common, requestId: randomUUID() })
    ]);
    expect(competing.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(competing.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(competing.find((result) => result.status === "rejected")).toMatchObject({
      reason: { statusCode: 422, code: "PAYMENT_EXCEEDS_CUSTOMER_DEBT" }
    });
    const rows = await debtRows(fixture.debtIds);
    expect(rows.reduce((sum, row) => sum + row.paidAmount, 0)).toBe(200000);
    expect(rows.every((row) => row.remainingAmount >= 0 && row.paidAmount === row.paymentSum)).toBe(true);

    const retryCustomerId = await createCustomer(`Parallel retry ${runTag}`, "+998909090909");
    const retryFixture = await createDebtSet({
      amounts: [100000],
      customerId: retryCustomerId,
      customerName: `Parallel retry ${runTag}`,
      phone: "+998909090909"
    });
    const requestId = randomUUID();
    const identical = {
      requestId,
      identityType: "CUSTOMER_ID" as const,
      customerId: retryCustomerId,
      amount: 50000,
      paymentMethod: "TRANSFER" as const,
      receivedBy: userId
    };
    const [first, second] = await Promise.all([
      repository.payCustomer(identical),
      repository.payCustomer(identical)
    ]);
    expect(second).toEqual(first);
    expect(Number((await fixturePool.query(
      "SELECT COUNT(*) AS count FROM debt_payment_batches WHERE request_id = $1",
      [requestId]
    )).rows[0].count)).toBe(1);
    expect((await debtRows(retryFixture.debtIds))[0]).toMatchObject({
      paidAmount: 50000,
      paymentSum: 50000,
      remainingAmount: 50000
    });
  });

  it("keeps the backward-compatible single payment and admin audit flow", async () => {
    const customerId = await createCustomer(`Single ${runTag}`, "+998901111111");
    const fixture = await createDebtSet({
      amounts: [100000],
      customerId,
      customerName: `Single ${runTag}`,
      phone: "+998901111111"
    });
    await repository.pay({
      debtId: fixture.debtIds[0]!,
      amount: 40000,
      paymentMethod: "CASH",
      receivedBy: userId
    });
    const payment = await fixturePool.query(
      "SELECT id FROM debt_payments WHERE debt_id = $1",
      [fixture.debtIds[0]]
    );
    await repository.updatePayment({
      debtId: fixture.debtIds[0]!,
      paymentId: payment.rows[0].id,
      amount: 50000,
      paymentMethod: "CARD",
      paidAt: "2043-01-01T10:00:00.000Z",
      note: "single payment edit",
      editedBy: userId
    });

    expect((await debtRows(fixture.debtIds))[0]).toMatchObject({
      paidAmount: 50000,
      paymentSum: 50000,
      remainingAmount: 50000,
      status: "PARTIALLY_PAID"
    });
    expect(Number((await fixturePool.query(
      "SELECT COUNT(*) AS count FROM debt_payment_audit_logs WHERE debt_payment_id = $1",
      [payment.rows[0].id]
    )).rows[0].count)).toBe(1);
  });
});
