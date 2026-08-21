import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../contexts/I18nContext";
import type { Purchase, PurchaseDocument } from "../types/api";
import { PurchaseDetailsModal } from "./PurchaseDetailsModal";

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: "purchase-1",
    purchase_document_id: "doc-1",
    supplier_id: "supplier-1",
    supplier_name: "Atlas Textile",
    product_id: "product-1",
    product_name: "Atlas mato",
    product_code: "PRD-001",
    unit: "metr",
    product_location: "A-1",
    quantity: 12,
    purchase_price: 15000,
    total_cost: 180000,
    purchased_at: "2026-08-21T08:30:00.000Z",
    note: "Rang: ko'k",
    created_by_name: "Admin",
    ...overrides
  };
}

function documentWithItems(items: Purchase[]): PurchaseDocument {
  return {
    id: "doc-1",
    document_number: "PUR-2026-001",
    purchased_at: "2026-08-21T08:30:00.000Z",
    created_at: "2026-08-21T08:35:00.000Z",
    created_by: "user-1",
    created_by_name: "Admin",
    supplier_name: "Atlas Textile",
    supplier_count: 1,
    line_count: items.length,
    total_quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    total_amount: items.reduce((sum, item) => sum + item.total_cost, 0),
    items
  };
}

function renderModal(language: "uz" | "ru", document: PurchaseDocument | null) {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => language),
    setItem: vi.fn()
  });

  return renderToString(
    <I18nProvider>
      <PurchaseDetailsModal
        document={document}
        exportingDocument={null}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onEdit={vi.fn()}
        onDeleteItem={vi.fn()}
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

describe("PurchaseDetailsModal", () => {
  it("does not render a dialog for a null document", () => {
    const html = renderModal("uz", null);

    expect(html).not.toContain("role=\"dialog\"");
  });

  it("renders document number, metadata, items, quantities, prices, and totals", () => {
    const html = renderModal("uz", documentWithItems([
      purchase(),
      purchase({
        id: "purchase-2",
        product_name: "Ip gazlama",
        product_location: "B-2",
        quantity: 3,
        unit: "dona",
        purchase_price: 22000,
        total_cost: 66000,
        note: null
      })
    ]));
    const text = textContent(html);

    expect(text).toContain("Kirim tafsilotlari");
    expect(text).toContain("PUR-2026-001");
    expect(text).toContain("Atlas Textile");
    expect(text).toContain("Admin");
    expect(text).toContain("Atlas mato");
    expect(text).toContain("Ip gazlama");
    expect(text).toContain("12 metr");
    expect(text).toContain("3 dona");
    expect(text).toContain("15 000 soʻm");
    expect(text).toContain("180 000 soʻm");
    expect(text).toContain("246 000 soʻm");
  });

  it("renders every item in a large document", () => {
    const items = Array.from({ length: 50 }, (_, index) =>
      purchase({
        id: `purchase-${index + 1}`,
        product_name: `Mahsulot ${index + 1}`,
        quantity: index + 1,
        total_cost: (index + 1) * 1000
      })
    );

    const html = renderModal("uz", documentWithItems(items));

    expect(html).toContain("Mahsulot 1");
    expect(html).toContain("Mahsulot 25");
    expect(html).toContain("Mahsulot 50");
  });

  it("renders Uzbek action labels and heading", () => {
    const html = renderModal("uz", documentWithItems([purchase()]));

    expect(html).toContain("Kirim tafsilotlari");
    expect(html).toContain("purchase-details-footer");
    expect(html).toContain("Yopish");
    expect(html).toContain("PDF yuklab olish");
    expect(html).toContain("Excel yuklab olish");
    expect(html).toContain("Tahrirlash");
  });

  it("keeps mobile card labels and row actions available", () => {
    const html = renderModal("uz", documentWithItems([purchase()]));

    expect(html).toContain("purchase-detail-name");
    expect(html).toContain("purchase-detail-quantity");
    expect(html).toContain("purchase-detail-price");
    expect(html).toContain("purchase-detail-total");
    expect(html).toContain("purchase-detail-actions");
    expect(html).toContain("detail-mobile-secondary");
    expect(html).toContain("details-mobile-list purchase-details-mobile-list");
    expect(html).toContain("details-mobile-item-card");
    expect(html).toContain("details-mobile-item-icon");
    expect(textContent(html)).toContain("12 metr × 15 000");
    expect(html).toContain("PRD-001");
    expect(html).toContain("A-1");
    expect(html).toContain("data-label=\"Mahsulot\"");
    expect(html).toContain("data-label=\"Miqdor\"");
    expect(html).toContain("data-label=\"Kirim narxi\"");
    expect(html).toContain("data-label=\"Amallar\"");
    expect(html).toContain("aria-label=\"Tahrirlash\"");
    expect(html).toContain("aria-label=\"O&#x27;chirish\"");
  });

  it("marks empty purchase secondary fields so mobile cards can hide placeholders", () => {
    const html = renderModal("uz", documentWithItems([
      purchase({ product_code: undefined, product_location: null, note: null })
    ]));

    expect(html).toContain("purchase-detail-location is-empty");
    expect(html).not.toContain("detail-mobile-secondary");
  });

  it("renders Russian action labels and heading", () => {
    const html = renderModal("ru", documentWithItems([purchase()]));

    expect(html).toContain("Детали прихода");
    expect(html).toContain("Закрыть");
    expect(html).toContain("Скачать PDF");
    expect(html).toContain("Скачать Excel");
    expect(html).toContain("Редактировать");
  });
});
