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
                      <td>{index + 1}</td>
                      <td><strong>{item.product_name}</strong>{Number(item.returned_sale_quantity) > 0 ? <small>{tr("Qaytarilgan", "Возвращено")}: {number(item.returned_sale_quantity)} {item.unit}</small> : null}</td>
                      <td><code>{item.product_code || "-"}</code></td>
                      <td>{number(item.sale_quantity)} {item.unit}</td>
                      <td>{money(item.sale_price)}</td>
                      <td>{money(item.discount)}</td>
                      <td><strong>{money(item.total_amount)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
