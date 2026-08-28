import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../contexts/I18nContext";
import type { CustomerDebtPaymentResult, Debt, DebtCustomerGroup } from "../types/api";
import { buildCustomerDebtPreview, CustomerDebtDetailsModal } from "./CustomerDebtDetailsModal";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  invalidateQueries: vi.fn((_input: { queryKey: string[] }) => Promise.resolve()),
  mutate: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  mutationOptions: undefined as Record<string, (...args: unknown[]) => unknown> | undefined,
  mutationPending: false,
  mutationError: null as Error | null,
  queryData: null as DebtCustomerGroup | null
}));

vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("react-hot-toast", () => ({
  default: { success: mocks.toastSuccess, error: mocks.toastError }
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useQuery: () => ({
    data: mocks.queryData,
    isLoading: false,
    isError: false,
    refetch: mocks.refetch
  }),
  useMutation: (options: Record<string, (...args: unknown[]) => unknown>) => {
    mocks.mutationOptions = options;
    return {
      mutate: mocks.mutate,
      isPending: mocks.mutationPending,
      isError: Boolean(mocks.mutationError),
      error: mocks.mutationError
    };
  }
}));

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    sale_id: "sale-1",
    customer_id: "11111111-1111-4111-8111-111111111111",
    invoice_number: "INV-1",
    customer_name: "Mijoz Textile",
    phone: "+998901234567",
    amount: 100000,
    paid_amount: 0,
    remaining_amount: 100000,
    status: "UNPAID",
    due_date: "2026-08-30",
    note: null,
    created_at: "2026-08-01T09:00:00.000Z",
    archived_at: null,
    archive_reason: null,
    archive_expires_at: null,
    ...overrides
  };
}

function group(debts: Debt[]): DebtCustomerGroup {
  return {
    identity_type: "CUSTOMER_ID",
    customer_id: "11111111-1111-4111-8111-111111111111",
    customer_key: "11111111-1111-4111-8111-111111111111",
    phone_key: "",
    customer_name: "Mijoz Textile",
    phone: "+998901234567",
    debt_count: debts.length,
    total_amount: debts.reduce((sum, item) => sum + Number(item.amount), 0),
    total_paid_amount: debts.reduce((sum, item) => sum + Number(item.paid_amount), 0),
    total_remaining_amount: debts.reduce((sum, item) => sum + Number(item.remaining_amount), 0),
    nearest_due_date: "2026-08-30",
    latest_created_at: "2026-08-03T09:00:00.000Z",
    has_overdue: false,
    status: "UNPAID",
    debts
  };
}

function renderModal(
  selectedGroup: DebtCustomerGroup | null,
  props: Partial<Parameters<typeof CustomerDebtDetailsModal>[0]> = {}
) {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => "uz"),
    setItem: vi.fn()
  });
  mocks.queryData = selectedGroup;

  return renderToString(
    <I18nProvider>
      <CustomerDebtDetailsModal
        group={selectedGroup}
        archived={false}
        onClose={vi.fn()}
        onOpenDebt={vi.fn()}
        {...props}
      />
    </I18nProvider>
  );
}

const paymentResult: CustomerDebtPaymentResult = {
  batchId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  amount: 250000,
  paymentMethod: "CASH",
  cashAmount: 250000,
  cardAmount: 0,
  transferAmount: 0,
  paidAt: "2026-08-28T08:00:00.000Z",
  allocations: [{
    paymentId: "44444444-4444-4444-8444-444444444444",
    debtId: "debt-1",
    invoiceNumber: "INV-1",
    amount: 100000,
    cashAmount: 100000,
    cardAmount: 0,
    transferAmount: 0,
    debtAmount: 100000,
    paidAmount: 100000,
    remainingAmount: 0,
    status: "PAID"
  }]
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutationOptions = undefined;
  mocks.mutationPending = false;
  mocks.mutationError = null;
});

describe("CustomerDebtDetailsModal", () => {
  it("does not render or write when no customer is selected", () => {
    const html = renderModal(null);

    expect(html).not.toContain("role=\"dialog\"");
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("renders the Eye modal without the old inline row", () => {
    const customer = group([
      debt({ id: "debt-1", invoice_number: "INV-1" }),
      debt({ id: "debt-2", invoice_number: "INV-2", amount: 200000, remaining_amount: 200000 })
    ]);
    const html = renderModal(customer);

    expect(html).toContain("customer-debt-modal");
    expect(html).toContain("Mijoz Textile");
    expect(html).toContain("INV-1");
    expect(html).toContain("INV-2");
    expect(html).toContain("Umumiy to");
    expect(html).not.toContain("customer-debt-details-row");
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("builds the oldest-first preview at cent precision", () => {
    const preview = buildCustomerDebtPreview([
      debt({ id: "first", remaining_amount: 100000 }),
      debt({ id: "second", remaining_amount: 200000 }),
      debt({ id: "third", remaining_amount: 300000 })
    ], 250000);

    expect(preview.map((item) => [item.debt.id, item.amount])).toEqual([
      ["first", 100000],
      ["second", 150000]
    ]);
  });

  it("one mutation execution produces one customer-payment POST", async () => {
    const customer = group([debt()]);
    renderModal(customer);
    mocks.api.mockResolvedValueOnce(paymentResult);

    await mocks.mutationOptions?.mutationFn?.();

    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api).toHaveBeenCalledWith(
      "/debts/customer-payments",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("disables the explicit save while a request is pending", () => {
    mocks.mutationPending = true;
    const html = renderModal(group([debt()]));

    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("Umumiy to");
  });

  it("invalidates debt, customer, summary, dashboard and report caches after success", async () => {
    const onPaid = vi.fn();
    renderModal(group([debt()]), { onPaid });

    await mocks.mutationOptions?.onSuccess?.(paymentResult);

    expect(mocks.invalidateQueries.mock.calls.map(([input]) => input)).toEqual([
      { queryKey: ["debts"] },
      { queryKey: ["debt"] },
      { queryKey: ["dashboard"] },
      { queryKey: ["reports"] }
    ]);
    expect(onPaid).toHaveBeenCalledWith(paymentResult);
  });

  it("renders 50 invoices without an inline table detail row", () => {
    const invoices = Array.from({ length: 50 }, (_, index) => debt({
      id: `debt-${index + 1}`,
      invoice_number: `INV-${index + 1}`,
      created_at: `2026-08-${String((index % 28) + 1).padStart(2, "0")}T09:00:00.000Z`
    }));
    const html = renderModal(group(invoices));

    expect(html).toContain("INV-1");
    expect(html).toContain("INV-25");
    expect(html).toContain("INV-50");
    expect(html).not.toContain("customer-debt-details-row");
  });
});
