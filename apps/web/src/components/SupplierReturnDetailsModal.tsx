import { CalendarClock, Edit3, FileText, Package, Trash2, Undo2, UserRound } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import { dateTime, money, number } from "../lib/format";
import type { SupplierReturnDocument } from "../types/api";
import { Button, Modal } from "./ui";

type SupplierReturnDetailsModalProps = {
  document: SupplierReturnDocument | null;
  onClose: () => void;
  onEdit: (document: SupplierReturnDocument) => void;
  onDelete: (document: SupplierReturnDocument) => void;
};

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function SupplierReturnDetailsModal({
  document,
  onClose,
  onEdit,
  onDelete
}: SupplierReturnDetailsModalProps) {
  const { tr } = useI18n();
  if (!document) return null;

  return (
    <Modal
      open
      title={tr("Qaytarish tafsilotlari", "\u0414\u0435\u0442\u0430\u043b\u0438 \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0430")}
      description={document.document_number}
      onClose={onClose}
      wide
      className="supplier-return-details-modal"
      bodyClassName="supplier-return-details-body"
      footerClassName="supplier-return-details-footer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tr("Yopish", "\u0417\u0430\u043a\u0440\u044b\u0442\u044c")}</Button>
          <Button variant="secondary" onClick={() => onEdit(document)}>
            <Edit3 size={16} /> {tr("Tahrirlash", "\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c")}
          </Button>
          <Button variant="danger" onClick={() => onDelete(document)}>
            <Trash2 size={16} /> {tr("O'chirish", "\u0423\u0434\u0430\u043b\u0438\u0442\u044c")}
          </Button>
        </>
      }
    >
      <div className="supplier-return-details-content">
        <section className="supplier-return-details-meta">
          <div><CalendarClock size={17} /><span>{tr("Sana", "\u0414\u0430\u0442\u0430")}</span><strong>{dateTime(document.returned_at)}</strong></div>
          <div><UserRound size={17} /><span>{tr("Kiritgan", "\u0414\u043e\u0431\u0430\u0432\u0438\u043b")}</span><strong>{document.created_by_name || "-"}</strong></div>
          <div><Package size={17} /><span>{tr("Qatorlar", "\u0421\u0442\u0440\u043e\u043a\u0438")}</span><strong>{number(document.line_count)}</strong></div>
          <div><Undo2 size={17} /><span>{tr("Jami miqdor", "\u041e\u0431\u0449\u0435\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}</span><strong>{number(document.total_quantity)}</strong></div>
          <div><FileText size={17} /><span>{tr("FIFO tannarx", "FIFO-\u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c")}</span><strong>{money(document.total_fifo_cost)}</strong></div>
          <div><FileText size={17} /><span>{tr("Kelishilgan summa", "\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0441\u0443\u043c\u043c\u0430")}</span><strong>{money(document.total_agreed_return_amount)}</strong></div>
          <div><FileText size={17} /><span>{tr("Qaytarish foydasi", "\u041f\u0440\u0438\u0431\u044b\u043b\u044c \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0430")}</span><strong className={document.total_supplier_return_profit >= 0 ? "positive" : "negative"}>{money(document.total_supplier_return_profit)}</strong></div>
        </section>

        {optionalText(document.note) ? (
          <section className="supplier-return-details-note">
            <FileText size={17} />
            <div>
              <strong>{tr("Izoh", "\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435")}</strong>
              <p>{document.note}</p>
            </div>
          </section>
        ) : null}

        <section className="supplier-return-details-products">
          <div className="supplier-return-details-section-title">
            <Undo2 size={17} />
            <strong>{tr("Qaytarilgan mahsulotlar", "\u0412\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u043d\u044b\u0435 \u0442\u043e\u0432\u0430\u0440\u044b")}</strong>
            <span>{document.items.length}</span>
          </div>
          <div className="supplier-return-details-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{tr("Mahsulot", "\u0422\u043e\u0432\u0430\u0440")}</th>
                  <th>{tr("Kod", "\u041a\u043e\u0434")}</th>
                  <th>{tr("Miqdor", "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}</th>
                  <th>{tr("FIFO tannarx", "FIFO-\u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c")}</th>
                  <th>{tr("Kelishilgan narx", "\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0446\u0435\u043d\u0430")}</th>
                  <th>{tr("Kelishilgan summa", "\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0441\u0443\u043c\u043c\u0430")}</th>
                  <th>{tr("Foyda", "\u041f\u0440\u0438\u0431\u044b\u043b\u044c")}</th>
                  <th>{tr("Izoh", "\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435")}</th>
                </tr>
              </thead>
              <tbody>
                {document.items.map((item, index) => {
                  const productCode = optionalText(item.product_code);
                  const note = optionalText(item.note);

                  return (
                    <tr key={item.id}>
                      <td className="supplier-return-detail-index" data-label="#"> {index + 1}</td>
                      <td className="supplier-return-detail-name" data-label={tr("Mahsulot", "\u0422\u043e\u0432\u0430\u0440")}>
                        <strong>{item.product_name}</strong>
                        {note ? <small title={note}>{note}</small> : null}
                      </td>
                      <td className={`supplier-return-detail-code${productCode ? "" : " is-empty"}`} data-label={tr("Kod", "\u041a\u043e\u0434")}>{productCode || "-"}</td>
                      <td className="supplier-return-detail-quantity" data-label={tr("Miqdor", "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}><strong>{number(item.quantity)} {item.unit}</strong></td>
                      <td className="supplier-return-detail-fifo" data-label={tr("FIFO tannarx", "FIFO-\u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c")}>{money(item.fifo_cost)}</td>
                      <td className="supplier-return-detail-price" data-label={tr("Kelishilgan narx", "\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0446\u0435\u043d\u0430")}>{money(item.agreed_return_price_per_unit)}</td>
                      <td className="supplier-return-detail-total" data-label={tr("Kelishilgan summa", "\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0441\u0443\u043c\u043c\u0430")}><strong>{money(item.total_agreed_return_amount)}</strong></td>
                      <td className={`supplier-return-detail-profit ${item.supplier_return_profit >= 0 ? "positive" : "negative"}`} data-label={tr("Foyda", "\u041f\u0440\u0438\u0431\u044b\u043b\u044c")}><strong>{money(item.supplier_return_profit)}</strong></td>
                      <td className="supplier-return-detail-note" data-label={tr("Izoh", "\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435")}>{note || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="details-mobile-list supplier-return-details-mobile-list">
            {document.items.map((item) => {
              const productCode = optionalText(item.product_code);
              const note = optionalText(item.note);

              return (
                <article className="details-mobile-item-card supplier-return-details-mobile-card" key={item.id}>
                  <div className="details-mobile-item-icon" aria-hidden="true">
                    <Undo2 size={22} />
                  </div>
                  <div className="details-mobile-item-main">
                    <strong>{item.product_name}</strong>
                    <span>{number(item.quantity)} {item.unit} {"\u00d7"} {money(item.agreed_return_price_per_unit)}</span>
                    {productCode ? <small>{productCode}</small> : null}
                    <small>{tr("FIFO", "FIFO")}: {money(item.fifo_cost)}</small>
                    {note ? <small>{note}</small> : null}
                  </div>
                  <div className="details-mobile-item-side">
                    <strong>{money(item.total_agreed_return_amount)}</strong>
                    <small className={item.supplier_return_profit >= 0 ? "positive" : "negative"}>
                      {money(item.supplier_return_profit)}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="supplier-return-details-summary">
          <div><span>{tr("Jami miqdor", "\u041e\u0431\u0449\u0435\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}</span><strong>{number(document.total_quantity)}</strong></div>
          <div><span>{tr("FIFO tannarx", "FIFO-\u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c")}</span><strong>{money(document.total_fifo_cost)}</strong></div>
          <div><span>{tr("Kelishilgan summa", "\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0441\u0443\u043c\u043c\u0430")}</span><strong>{money(document.total_agreed_return_amount)}</strong></div>
          <div><span>{tr("Qaytarish foydasi", "\u041f\u0440\u0438\u0431\u044b\u043b\u044c \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0430")}</span><strong className={document.total_supplier_return_profit >= 0 ? "positive" : "negative"}>{money(document.total_supplier_return_profit)}</strong></div>
        </section>
      </div>
    </Modal>
  );
}
