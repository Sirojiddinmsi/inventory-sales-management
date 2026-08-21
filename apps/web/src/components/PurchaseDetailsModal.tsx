import { CalendarClock, Download, Edit3, FileSpreadsheet, FileText, Package, PackagePlus, Trash2, Truck, UserRound } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import { dateTime, money, number } from "../lib/format";
import type { Purchase, PurchaseDocument } from "../types/api";
import { Button, Modal } from "./ui";

type ExportingDocument = {
  id: string;
  format: "pdf" | "xlsx";
} | null;

type PurchaseDetailsModalProps = {
  document: PurchaseDocument | null;
  exportingDocument: ExportingDocument;
  onClose: () => void;
  onDownload: (document: PurchaseDocument, format: "pdf" | "xlsx") => void;
  onEdit: (document: PurchaseDocument) => void;
  onDeleteItem: (purchase: Purchase) => void;
};

function supplierLabel(document: PurchaseDocument, tr: (uz: string, ru: string) => string) {
  if (document.supplier_count > 1) return tr("Bir nechta", "Несколько");
  return document.supplier_name || tr("Ko'rsatilmagan", "Не указан");
}

export function PurchaseDetailsModal({
  document,
  exportingDocument,
  onClose,
  onDownload,
  onEdit,
  onDeleteItem
}: PurchaseDetailsModalProps) {
  const { tr } = useI18n();
  if (!document) return null;

  const exportingPdf = exportingDocument?.id === document.id && exportingDocument.format === "pdf";
  const exportingExcel = exportingDocument?.id === document.id && exportingDocument.format === "xlsx";
  const exportingCurrentDocument = exportingDocument?.id === document.id;

  return (
    <Modal
      open
      title={tr("Kirim tafsilotlari", "Детали прихода")}
      description={document.document_number}
      onClose={onClose}
      wide
      className="purchase-details-modal"
      bodyClassName="purchase-details-body"
      footerClassName="purchase-details-footer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tr("Yopish", "Закрыть")}</Button>
          <Button
            variant="secondary"
            loading={exportingPdf}
            disabled={Boolean(exportingDocument) && !exportingPdf}
            onClick={() => onDownload(document, "pdf")}
          >
            <Download size={16} /> {tr("PDF yuklab olish", "Скачать PDF")}
          </Button>
          <Button
            variant="secondary"
            loading={exportingExcel}
            disabled={Boolean(exportingDocument) && !exportingExcel}
            onClick={() => onDownload(document, "xlsx")}
          >
            <FileSpreadsheet size={16} /> {tr("Excel yuklab olish", "Скачать Excel")}
          </Button>
          <Button disabled={exportingCurrentDocument} onClick={() => onEdit(document)}>
            <Edit3 size={16} /> {tr("Tahrirlash", "Редактировать")}
          </Button>
        </>
      }
    >
      <div className="purchase-details-content">
        <section className="purchase-details-meta">
          <div><CalendarClock size={17} /><span>{tr("Sana", "Дата")}</span><strong>{dateTime(document.purchased_at)}</strong></div>
          <div><Truck size={17} /><span>{tr("Yetkazib beruvchi", "Поставщик")}</span><strong>{supplierLabel(document, tr)}</strong></div>
          <div><UserRound size={17} /><span>{tr("Kiritgan", "Добавил")}</span><strong>{document.created_by_name || "-"}</strong></div>
          <div><PackagePlus size={17} /><span>{tr("Qatorlar", "Строки")}</span><strong>{number(document.line_count)}</strong></div>
          <div><Package size={17} /><span>{tr("Jami miqdor", "Общее количество")}</span><strong>{number(document.total_quantity)}</strong></div>
          <div><FileText size={17} /><span>{tr("Jami summa", "Общая сумма")}</span><strong>{money(document.total_amount)}</strong></div>
        </section>

        <section className="purchase-details-products">
          <div className="purchase-details-section-title">
            <Package size={17} />
            <strong>{tr("Kirim mahsulotlari", "Товары прихода")}</strong>
            <span>{document.items.length}</span>
          </div>
          <div className="purchase-details-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{tr("Mahsulot", "Товар")}</th>
                  <th>{tr("Joylashuv", "Место")}</th>
                  <th>{tr("Miqdor", "Количество")}</th>
                  <th>{tr("Kirim narxi", "Закупочная цена")}</th>
                  <th>{tr("Qator jami", "Сумма строки")}</th>
                  <th>{tr("Amallar", "Действия")}</th>
                </tr>
              </thead>
              <tbody>
                {document.items.map((purchase, index) => (
                  <tr key={purchase.id}>
                    <td className="purchase-detail-index" data-label="#">{index + 1}</td>
                    <td className="purchase-detail-name" data-label={tr("Mahsulot", "\u0422\u043e\u0432\u0430\u0440")}>
                      <strong>{purchase.product_name}</strong>
                      {purchase.product_code || purchase.product_location ? (
                        <small className="detail-mobile-secondary">
                          {[purchase.product_code, purchase.product_location].filter(Boolean).join(" / ")}
                        </small>
                      ) : null}
                      {purchase.note ? <small title={purchase.note}>{purchase.note}</small> : null}
                    </td>
                    <td className={`purchase-detail-location${purchase.product_location ? "" : " is-empty"}`} data-label={tr("Joylashuv", "\u041c\u0435\u0441\u0442\u043e")}>{purchase.product_location || "-"}</td>
                    <td className="purchase-detail-quantity" data-label={tr("Miqdor", "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}><strong>{number(purchase.quantity)} {purchase.unit}</strong></td>
                    <td className="purchase-detail-price" data-label={tr("Kirim narxi", "\u0417\u0430\u043a\u0443\u043f\u043e\u0447\u043d\u0430\u044f \u0446\u0435\u043d\u0430")}>{money(purchase.purchase_price)}</td>
                    <td className="purchase-detail-total" data-label={tr("Qator jami", "\u0421\u0443\u043c\u043c\u0430 \u0441\u0442\u0440\u043e\u043a\u0438")}><strong>{money(purchase.total_cost)}</strong></td>
                    <td className="purchase-detail-actions" data-label={tr("Amallar", "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f")}>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => onEdit(document)}
                          title={tr("Tahrirlash", "Редактировать")}
                          aria-label={tr("Tahrirlash", "Редактировать")}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger-icon"
                          onClick={() => onDeleteItem(purchase)}
                          title={tr("O'chirish", "Удалить")}
                          aria-label={tr("O'chirish", "Удалить")}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="details-mobile-list purchase-details-mobile-list">
            {document.items.map((purchase) => (
              <article className="details-mobile-item-card" key={purchase.id}>
                <div className="details-mobile-item-icon" aria-hidden="true">
                  <Package size={22} />
                </div>
                <div className="details-mobile-item-main">
                  <strong>{purchase.product_name}</strong>
                  <span>{number(purchase.quantity)} {purchase.unit} {"\u00d7"} {money(purchase.purchase_price)}</span>
                  {purchase.product_code || purchase.product_location ? (
                    <small>{[purchase.product_code, purchase.product_location].filter(Boolean).join(" / ")}</small>
                  ) : null}
                </div>
                <div className="details-mobile-item-side">
                  <strong>{money(purchase.total_cost)}</strong>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onEdit(document)}
                      title={tr("Tahrirlash", "Ð ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð¾Ð²Ð°Ñ‚ÑŒ")}
                      aria-label={tr("Tahrirlash", "Ð ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð¾Ð²Ð°Ñ‚ÑŒ")}
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger-icon"
                      onClick={() => onDeleteItem(purchase)}
                      title={tr("O'chirish", "Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ")}
                      aria-label={tr("O'chirish", "Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="purchase-details-summary">
          <div><span>{tr("Jami miqdor", "Общее количество")}</span><strong>{number(document.total_quantity)}</strong></div>
          <div><span>{tr("Jami summa", "Общая сумма")}</span><strong>{money(document.total_amount)}</strong></div>
        </section>
      </div>
    </Modal>
  );
}
