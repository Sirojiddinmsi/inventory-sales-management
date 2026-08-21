import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CreditCard, Download, Edit3, FileText, Package, RefreshCw, RotateCcw, UserRound } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import { dateTime, money, number } from "../lib/format";
import type { Sale, SaleDetails } from "../types/api";
import { Button, Modal } from "./ui";

type SaleDetailsModalProps = {
  sale: Sale | null;
  onClose: () => void;
  onDownload: (sale: Sale) => void;
  onEdit: (sale: Sale) => void;
  onReturn: (sale: Sale) => void;
};

function paymentLabel(paymentType: Sale["payment_type"], tr: (uz: string, ru: string) => string) {
  if (paymentType === "CASH") return tr("Naqd", "Наличные");
  if (paymentType === "CARD") return tr("Plastik", "Карта");
  return tr("Qarz", "В долг");
}

export function SaleDetailsModal({ sale, onClose, onDownload, onEdit, onReturn }: SaleDetailsModalProps) {
  const { tr } = useI18n();
  const detailsQuery = useQuery({
    queryKey: ["sale-details", sale?.id],
    queryFn: () => api<SaleDetails>(`/sales/${sale!.id}`),
    enabled: Boolean(sale)
  });
  const details = detailsQuery.data;
  const archived = Boolean(details?.archived_at ?? sale?.archived_at);

  return (
    <Modal
      open={Boolean(sale)}
      title={tr("Sotuv ma'lumotlari", "Детали продажи")}
      description={sale?.invoice_number}
      onClose={onClose}
      wide
      className="sale-details-modal"
      bodyClassName="sale-details-body"
      footerClassName="sale-details-footer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tr("Yopish", "Закрыть")}</Button>
          {details ? <Button variant="secondary" onClick={() => onDownload(details)}><Download size={16} /> {tr("PDF yuklab olish", "Скачать PDF")}</Button> : null}
          {details && !archived ? <Button variant="secondary" onClick={() => onReturn(details)}><RotateCcw size={16} /> {tr("Qaytarish", "Возврат")}</Button> : null}
          {details && !archived ? <Button onClick={() => onEdit(details)}><Edit3 size={16} /> {tr("Tahrirlash", "Редактировать")}</Button> : null}
        </>
      }
    >
      {detailsQuery.isLoading ? (
        <div className="sale-details-state"><RefreshCw className="spin" size={22} /><span>{tr("Nakladnoy yuklanmoqda...", "Загрузка накладной...")}</span></div>
      ) : null}
      {detailsQuery.isError ? (
        <div className="sale-details-state sale-details-error" role="alert">
          <FileText size={28} />
          <strong>{tr("Nakladnoyni ochib bo'lmadi", "Не удалось открыть накладную")}</strong>
          <p>{detailsQuery.error instanceof Error ? detailsQuery.error.message : tr("Server xatosi yuz berdi.", "Произошла ошибка сервера.")}</p>
          <Button variant="secondary" onClick={() => void detailsQuery.refetch()}><RefreshCw size={16} /> {tr("Qayta urinish", "Повторить")}</Button>
        </div>
      ) : null}
      {details ? (
        <div className="sale-details-content">
          <section className="sale-details-meta">
            <div><CalendarClock size={17} /><span>{tr("Sana va vaqt", "Дата и время")}</span><strong>{dateTime(details.sold_at)}</strong></div>
            <div><UserRound size={17} /><span>{tr("Mijoz", "Клиент")}</span><strong>{details.customer_name || tr("Ko'rsatilmagan", "Не указан")}</strong>{details.customer_phone ? <small>{details.customer_phone}</small> : null}</div>
            <div><CreditCard size={17} /><span>{tr("To'lov turi", "Тип оплаты")}</span><strong>{paymentLabel(details.payment_type, tr)}</strong></div>
            <div><UserRound size={17} /><span>{tr("Sotuvchi", "Продавец")}</span><strong>{details.seller_name || "-"}</strong></div>
          </section>

          {details.note ? <section className="sale-details-note"><FileText size={16} /><div><strong>{tr("Izoh", "Примечание")}</strong><p>{details.note}</p></div></section> : null}

          <section className="sale-details-products">
            <div className="sale-details-section-title"><Package size={17} /><strong>{tr("Sotilgan mahsulotlar", "Проданные товары")}</strong><span>{details.items.length}</span></div>
            <div className="sale-details-table-wrap">
              <table>
                <thead><tr><th>#</th><th>{tr("Mahsulot", "Товар")}</th><th>{tr("Kod", "Код")}</th><th>{tr("Miqdor", "Количество")}</th><th>{tr("Narx", "Цена")}</th><th>{tr("Chegirma", "Скидка")}</th><th>{tr("Jami", "Сумма")}</th></tr></thead>
                <tbody>
                  {details.items.map((item, index) => (
                    <tr key={item.id}>
                      <td className="sale-detail-index" data-label="#">{index + 1}</td>
                      <td className="sale-detail-name" data-label={tr("Mahsulot", "\u0422\u043e\u0432\u0430\u0440")}>
                        <strong>{item.product_name}</strong>
                        {item.product_code ? <small className="detail-mobile-secondary">{item.product_code}</small> : null}
                        {Number(item.returned_sale_quantity) > 0 ? <small>{tr("Qaytarilgan", "\u0412\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u043e")}: {number(item.returned_sale_quantity)} {item.unit}</small> : null}
                      </td>
                      <td className={`sale-detail-code${item.product_code ? "" : " is-empty"}`} data-label={tr("Kod", "\u041a\u043e\u0434")}><code>{item.product_code || "-"}</code></td>
                      <td className="sale-detail-quantity" data-label={tr("Miqdor", "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}>{number(item.sale_quantity)} {item.unit}</td>
                      <td className="sale-detail-price" data-label={tr("Narx", "\u0426\u0435\u043d\u0430")}>{money(item.sale_price)}</td>
                      <td className={`sale-detail-discount${Number(item.discount) > 0 ? "" : " is-zero"}`} data-label={tr("Chegirma", "\u0421\u043a\u0438\u0434\u043a\u0430")}>{money(item.discount)}</td>
                      <td className="sale-detail-total" data-label={tr("Jami", "\u0421\u0443\u043c\u043c\u0430")}><strong>{money(item.total_amount)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="details-mobile-list sale-details-mobile-list">
              {details.items.map((item) => (
                <article className="details-mobile-item-card" key={item.id}>
                  <div className="details-mobile-item-icon" aria-hidden="true">
                    <Package size={22} />
                  </div>
                  <div className="details-mobile-item-main">
                    <strong>{item.product_name}</strong>
                    <span>{number(item.sale_quantity)} {item.unit} {"\u00d7"} {money(item.sale_price)}</span>
                    {item.product_code ? <small>{item.product_code}</small> : null}
                    {Number(item.discount) > 0 ? <small>{tr("Chegirma", "\u0421\u043a\u0438\u0434\u043a\u0430")}: {money(item.discount)}</small> : null}
                    {Number(item.returned_sale_quantity) > 0 ? <small>{tr("Qaytarilgan", "\u0412\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u043e")}: {number(item.returned_sale_quantity)} {item.unit}</small> : null}
                  </div>
                  <div className="details-mobile-item-side">
                    <strong>{money(item.total_amount)}</strong>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="sale-details-summary">
            <div><span>{tr("To'lov summasi", "Сумма к оплате")}</span><strong>{money(details.net_total_amount)}</strong></div>
            <div><span>{tr("Foyda", "Прибыль")}</span><strong className={details.net_profit >= 0 ? "positive" : "negative"}>{money(details.net_profit)}</strong></div>
          </section>
        </div>
      ) : null}
    </Modal>
  );
}
