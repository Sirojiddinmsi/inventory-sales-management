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
                    <td data-label="#">{index + 1}</td>
                    <td data-label={tr("Mahsulot", "Товар")}>
                      <strong>{purchase.product_name}</strong>
                      {purchase.note ? <small title={purchase.note}>{purchase.note}</small> : null}
                    </td>
                    <td data-label={tr("Joylashuv", "Место")}>{purchase.product_location || "-"}</td>
                    <td data-label={tr("Miqdor", "Количество")}><strong>{number(purchase.quantity)} {purchase.unit}</strong></td>
                    <td data-label={tr("Kirim narxi", "Закупочная цена")}>{money(purchase.purchase_price)}</td>
                    <td data-label={tr("Qator jami", "Сумма строки")}><strong>{money(purchase.total_cost)}</strong></td>
                    <td data-label={tr("Amallar", "Действия")}>
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
        </section>

        <section className="purchase-details-summary">
          <div><span>{tr("Jami miqdor", "Общее количество")}</span><strong>{number(document.total_quantity)}</strong></div>
          <div><span>{tr("Jami summa", "Общая сумма")}</span><strong>{money(document.total_amount)}</strong></div>
        </section>
      </div>
    </Modal>
  );
}
