import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../contexts/I18nContext";
import purchasesPageSource from "../pages/PurchasesPage.tsx?raw";
import type { SupplierReturn, SupplierReturnDocument } from "../types/api";
import { SupplierReturnDetailsModal } from "./SupplierReturnDetailsModal";

function supplierReturn(overrides: Partial<SupplierReturn> = {}): SupplierReturn {
  return {
    id: "return-1",
    supplier_return_document_id: "doc-1",
    product_id: "product-1",
    product_name: "Atlas mato",
    product_code: "PRD-001",
    unit: "metr",
    quantity: 5,
    fifo_cost: 75000,
    agreed_return_price_per_unit: 20000,
    total_agreed_return_amount: 100000,
    supplier_return_profit: 25000,
    returned_at: "2026-08-24T08:30:00.000Z",
    note: "Rang mos emas",
    created_by_name: "Admin",
    created_at: "2026-08-24T08:35:00.000Z",
    ...overrides
  };
}

function documentWithItems(items: SupplierReturn[]): SupplierReturnDocument {
  return {
    id: "doc-1",
    document_number: "SR-00017",
    returned_at: "2026-08-24T08:30:00.000Z",
    note: "Yetkazib beruvchi bilan kelishildi",
    created_by: "user-1",
    created_by_name: "Admin",
    created_at: "2026-08-24T08:35:00.000Z",
    line_count: items.length,
    total_quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    total_fifo_cost: items.reduce((sum, item) => sum + item.fifo_cost, 0),
    total_agreed_return_amount: items.reduce((sum, item) => sum + item.total_agreed_return_amount, 0),
    total_supplier_return_profit: items.reduce((sum, item) => sum + item.supplier_return_profit, 0),
    items
  };
}

function renderModal(language: "uz" | "ru", document: SupplierReturnDocument | null) {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => language),
    setItem: vi.fn()
  });

  return renderToString(
    <I18nProvider>
      <SupplierReturnDetailsModal
        document={document}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
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

describe("SupplierReturnDetailsModal", () => {
  it("does not render a dialog for a null document", () => {
    const html = renderModal("uz", null);

    expect(html).not.toContain("role=\"dialog\"");
  });

  it("renders header, metadata, items, FIFO, agreed amounts, and profit", () => {
    const html = renderModal("uz", documentWithItems([
      supplierReturn(),
      supplierReturn({
        id: "return-2",
        product_name: "Ip gazlama",
        product_code: "",
        quantity: 2,
        unit: "dona",
        fifo_cost: 22000,
        agreed_return_price_per_unit: 18000,
        total_agreed_return_amount: 36000,
        supplier_return_profit: -4000,
        note: null
      })
    ]));
    const text = textContent(html);

    expect(text).toContain("Qaytarish tafsilotlari");
    expect(text).toContain("SR-00017");
    expect(text).toContain("Admin");
    expect(text).toContain("Atlas mato");
    expect(text).toContain("Ip gazlama");
    expect(text).toContain("5 metr");
    expect(text).toContain("2 dona");
    expect(text).toContain("75 000 so\u02bbm");
    expect(text).toContain("100 000 so\u02bbm");
    expect(text).toContain("25 000 so\u02bbm");
    expect(text).toContain("-4 000 so\u02bbm");
    expect(text).toContain("136 000 so\u02bbm");
  });

  it("renders every item in a large supplier return document", () => {
    const items = Array.from({ length: 50 }, (_, index) =>
      supplierReturn({
        id: `return-${index + 1}`,
        product_name: `Qaytarilgan mahsulot ${index + 1}`,
        quantity: index + 1,
        total_agreed_return_amount: (index + 1) * 1000
      })
    );

    const html = renderModal("uz", documentWithItems(items));

    expect(html).toContain("Qaytarilgan mahsulot 1");
    expect(html).toContain("Qaytarilgan mahsulot 25");
    expect(html).toContain("Qaytarilgan mahsulot 50");
  });

  it("renders Uzbek labels, footer actions, and compact mobile markers", () => {
    const html = renderModal("uz", documentWithItems([supplierReturn()]));

    expect(html).toContain("Qaytarish tafsilotlari");
    expect(html).toContain("supplier-return-details-footer");
    expect(html).toContain("Yopish");
    expect(html).toContain("Tahrirlash");
    expect(html).toContain("O&#x27;chirish");
    expect(html).toContain("details-mobile-list supplier-return-details-mobile-list");
    expect(html).toContain("details-mobile-item-card supplier-return-details-mobile-card");
    expect(html).toContain("supplier-return-detail-fifo");
    expect(html).toContain("supplier-return-detail-profit positive");
    expect(textContent(html)).toContain("5 metr \u00d7 20 000");
  });

  it("does not render empty code or note as compact mobile secondary text", () => {
    const html = renderModal("uz", documentWithItems([
      supplierReturn({ product_code: "", note: "" })
    ]));

    expect(html).toContain("supplier-return-detail-code is-empty");
    expect(html).not.toContain("Rang mos emas");
    expect(html).not.toContain(">PRD-001<");
  });

  it("renders Russian heading and actions", () => {
    const html = renderModal("ru", documentWithItems([supplierReturn()]));

    expect(html).toContain("\u0414\u0435\u0442\u0430\u043b\u0438 \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0430");
    expect(html).toContain("\u0417\u0430\u043a\u0440\u044b\u0442\u044c");
    expect(html).toContain("\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c");
    expect(html).toContain("\u0423\u0434\u0430\u043b\u0438\u0442\u044c");
  });

  it("wires the purchases page to the modal instead of the inline return detail row", () => {
    expect(purchasesPageSource).toContain("selectedSupplierReturnDocument");
    expect(purchasesPageSource).toContain("<SupplierReturnDetailsModal");
    expect(purchasesPageSource).toContain("setSelectedSupplierReturnDocument(document)");
    expect(purchasesPageSource).toContain("<Eye size={17} />");
    expect(purchasesPageSource).not.toContain("expandedReturnDocumentIds");
    expect(purchasesPageSource).not.toContain("supplier-return-items");
    expect(purchasesPageSource).not.toContain("aria-expanded={expanded}");
  });
});
