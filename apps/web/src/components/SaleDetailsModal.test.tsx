import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../contexts/I18nContext";
import type { Sale, SaleDetails, SaleItem } from "../types/api";
import { SaleDetailsModal } from "./SaleDetailsModal";

const queryState = vi.hoisted(() => ({
  details: null as SaleDetails | null,
  isLoading: false,
  isError: false,
  error: null as Error | null
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: queryState.details,
    isLoading: queryState.isLoading,
    isError: queryState.isError,
    error: queryState.error,
    refetch: vi.fn()
  })
}));

function saleItem(overrides: Partial<SaleItem> = {}): SaleItem {
  return {
    id: "sale-item-1",
    product_id: "product-1",
    product_code: "PRD-001",
    product_name: "Atlas mato",
    base_unit: "metr",
    unit: "metr",
    quantity: 12,
    sale_quantity: 12,
    returned_quantity: 0,
    returned_sale_quantity: 0,
    remaining_quantity: 12,
    remaining_sale_quantity: 12,
    unit_multiplier: 1,
    sale_price: 25000,
    discount: 1000,
    total_amount: 299000,
    fifo_cost: 180000,
    returned_fifo_cost: 0,
    profit: 119000,
    ...overrides
  };
}

function saleDetails(items: SaleItem[]): SaleDetails {
  return {
    id: "sale-1",
    invoice_number: "INV-2026-001",
    customer_id: "customer-1",
    customer_name: "Mijoz Textile",
    customer_phone: "+998901234567",
    subtotal: 300000,
    discount: 1000,
    total_amount: 299000,
    returned_amount: 0,
    net_total_amount: 299000,
    fifo_cost: 180000,
    returned_fifo_cost: 0,
    payment_type: "CASH",
    debt_id: null,
    debt_status: null,
    debt_paid_amount: null,
    debt_remaining_amount: null,
    profit: 119000,
    returned_profit: 0,
    net_profit: 119000,
    sold_at: "2026-08-21T08:30:00.000Z",
    note: "Telefon tekshiruvi uchun izoh",
    seller_name: "Admin",
    archived_at: null,
    archive_reason: null,
    archive_expires_at: null,
    created_at: "2026-08-21T08:35:00.000Z",
    items,
    returns: []
  };
}

function renderModal(language: "uz" | "ru", details: SaleDetails | null) {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => language),
    setItem: vi.fn()
  });
  queryState.details = details;

  const sale = details ? ({
    id: details.id,
    invoice_number: details.invoice_number,
    archived_at: details.archived_at
  } as Sale) : null;

  return renderToString(
    <I18nProvider>
      <SaleDetailsModal
        sale={sale}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onEdit={vi.fn()}
        onReturn={vi.fn()}
      />
    </I18nProvider>
  );
}

function textContent(html: string) {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  queryState.details = null;
  queryState.isLoading = false;
  queryState.isError = false;
  queryState.error = null;
});

describe("SaleDetailsModal", () => {
  it("does not render a dialog for a null sale", () => {
    const html = renderModal("uz", null);

    expect(html).not.toContain("role=\"dialog\"");
  });

  it("renders metadata, footer actions, and mobile labels", () => {
    const html = renderModal("uz", saleDetails([saleItem()]));
    const text = textContent(html);

    expect(html).toContain("sale-details-footer");
    expect(html).toContain("sale-detail-name");
    expect(html).toContain("sale-detail-quantity");
    expect(html).toContain("sale-detail-price");
    expect(html).toContain("sale-detail-discount");
    expect(html).toContain("sale-detail-total");
    expect(html).toContain("detail-mobile-secondary");
    expect(html).toContain("details-mobile-list sale-details-mobile-list");
    expect(html).toContain("details-mobile-item-card");
    expect(html).toContain("details-mobile-item-icon");
    expect(text).toContain("Mijoz Textile");
    expect(text).toContain("Atlas mato");
    expect(text).toContain("PRD-001");
    expect(text).toContain("12 metr × 25 000");
    expect(text).toContain("12 metr");
    expect(text).toContain("25 000 soʻm");
    expect(html).toContain("data-label=\"Mahsulot\"");
    expect(html).toContain("data-label=\"Miqdor\"");
    expect(html).toContain("data-label=\"Jami\"");
    expect(html).toContain("Yopish");
    expect(html).toContain("PDF yuklab olish");
    expect(html).toContain("Qaytarish");
    expect(html).toContain("Tahrirlash");
  });

  it("marks zero and non-zero sale discount states for compact mobile cards", () => {
    const zeroDiscount = renderModal("uz", saleDetails([saleItem({ discount: 0 })]));
    const discounted = renderModal("uz", saleDetails([saleItem({ id: "sale-item-2", discount: 5000 })]));

    expect(zeroDiscount).toContain("sale-detail-discount is-zero");
    expect(discounted).toContain("sale-detail-discount");
    expect(discounted).not.toContain("sale-detail-discount is-zero");
    expect(textContent(discounted)).toContain("5 000");
  });

  it("renders returned quantity only when it is greater than zero", () => {
    const noReturn = renderModal("uz", saleDetails([saleItem({ returned_sale_quantity: 0 })]));
    const returned = renderModal("uz", saleDetails([saleItem({ id: "sale-item-2", returned_sale_quantity: 2 })]));

    expect(textContent(noReturn)).not.toContain("Qaytarilgan");
    expect(textContent(returned)).toContain("Qaytarilgan");
    expect(textContent(returned)).toContain("2 metr");
  });

  it("renders every item in a large sale", () => {
    const items = Array.from({ length: 50 }, (_, index) =>
      saleItem({
        id: `sale-item-${index + 1}`,
        product_name: `Sotuv mahsuloti ${index + 1}`,
        sale_quantity: index + 1,
        total_amount: (index + 1) * 1000
      })
    );

    const html = renderModal("uz", saleDetails(items));

    expect(html).toContain("Sotuv mahsuloti 1");
    expect(html).toContain("Sotuv mahsuloti 25");
    expect(html).toContain("Sotuv mahsuloti 50");
  });

  it("renders Russian mobile labels without relying on narrow table headers", () => {
    const html = renderModal("ru", saleDetails([saleItem()]));

    expect(html).toContain("data-label=\"\u0422\u043e\u0432\u0430\u0440\"");
    expect(html).toContain("data-label=\"\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e\"");
    expect(html).toContain("data-label=\"\u0421\u0443\u043c\u043c\u0430\"");
  });
});
