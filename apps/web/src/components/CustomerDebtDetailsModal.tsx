import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Eye, HandCoins, ReceiptText, RefreshCw, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import { date, money } from "../lib/format";
import type {
  CustomerDebtDetails,
  CustomerDebtPaymentResult,
  Debt,
  DebtCustomerGroup,
  DebtPaymentMethod,
  DebtStatus
} from "../types/api";
import { Badge, Button, Input, Modal, Select, Textarea } from "./ui";

type CustomerDebtDetailsModalProps = {
  group: DebtCustomerGroup | null;
  scope: CustomerDebtDetailsScope;
  onClose: () => void;
  onOpenDebt: (debt: Debt) => void;
  onPaid?: (result: CustomerDebtPaymentResult) => void;
};

export type CustomerDebtDetailsScope = "active" | "paid" | "all" | "archive";

export function customerDebtDetailsScopeForFilter(
  filter: CustomerDebtDetailsScope | "overdue" | "partial"
): CustomerDebtDetailsScope {
  return filter === "paid" || filter === "all" || filter === "archive"
    ? filter
    : "active";
}

type CustomerPaymentDraft = {
  amount: string;
  paymentMethod: DebtPaymentMethod;
  cashAmount: string;
  cardAmount: string;
  transferAmount: string;
  note: string;
};

const emptyDraft: CustomerPaymentDraft = {
  amount: "",
  paymentMethod: "CASH",
  cashAmount: "",
  cardAmount: "",
  transferAmount: "",
  note: ""
};

const newRequestId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `00000000-0000-4000-8000-${Date.now().toString().padStart(12, "0").slice(-12)}`;

function moneyCents(value: number) {
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value - cents / 100) > 1e-9) return null;
  return cents;
}

export function buildCustomerDebtPreview(debts: Debt[], amount: number) {
  let remainingCents = moneyCents(amount) ?? 0;
  const preview: Array<{ debt: Debt; amount: number }> = [];

  for (const debt of debts) {
    if (remainingCents <= 0) break;
    if (debt.archived_at) continue;

    const debtRemainingCents = moneyCents(Number(debt.remaining_amount)) ?? 0;
    if (debtRemainingCents <= 0) continue;

    const allocationCents = Math.min(remainingCents, debtRemainingCents);
    preview.push({ debt, amount: allocationCents / 100 });
    remainingCents -= allocationCents;
  }

  return preview;
}

function statusTone(status: DebtStatus) {
  return status === "PAID"
    ? "success"
    : status === "OVERDUE"
      ? "danger"
      : "warning";
}

function statusText(status: DebtStatus, tr: (uz: string, ru: string) => string) {
  if (status === "PAID") return tr("To‘langan", "Оплачен");
  if (status === "OVERDUE") return tr("Muddati o‘tgan", "Просрочен");
  if (status === "PARTIALLY_PAID") return tr("Qisman to‘langan", "Частично оплачен");
  return tr("To‘lanmagan", "Не оплачен");
}

function paymentMethodText(method: DebtPaymentMethod, tr: (uz: string, ru: string) => string) {
  if (method === "CASH") return tr("Naqd", "Наличные");
  if (method === "CARD") return tr("Plastik", "Карта");
  if (method === "TRANSFER") return tr("Bank o‘tkazmasi", "Перевод");
  return tr("Aralash to‘lov", "Смешанная оплата");
}

export function CustomerDebtDetailsModal({
  group,
  scope,
  onClose,
  onOpenDebt,
  onPaid
}: CustomerDebtDetailsModalProps) {
  const { tr } = useI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CustomerPaymentDraft>(emptyDraft);
  const [requestId, setRequestId] = useState(newRequestId);
  const [result, setResult] = useState<CustomerDebtPaymentResult | null>(null);
  const submittingRef = useRef(false);
  const identityKey = group
    ? `${group.identity_type}:${group.customer_key}:${group.phone_key}`
    : "closed";

  useEffect(() => {
    if (!group) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [group]);

  useEffect(() => {
    setDraft(emptyDraft);
    setRequestId(newRequestId());
    setResult(null);
    submittingRef.current = false;
  }, [identityKey, scope]);

  const details = useQuery({
    queryKey: ["debts", "customer-details", identityKey, scope],
    queryFn: () => api<CustomerDebtDetails>("/debts/customer-details", {
      params: group?.identity_type === "CUSTOMER_ID"
        ? {
            identityType: "CUSTOMER_ID",
            customerId: group.customer_id,
            scope
          }
        : {
            identityType: "LEGACY",
            customerName: group?.customer_name,
            phone: group?.phone ?? "",
            scope
          }
    }),
    enabled: Boolean(group)
  });

  const customer = details.data;
  const sortedDebts = useMemo(
    () => [...(customer?.debts ?? [])].sort((left, right) =>
      left.created_at === right.created_at
        ? left.id.localeCompare(right.id)
        : left.created_at.localeCompare(right.created_at)
    ),
    [customer?.debts]
  );
  const amountNumber = Number(draft.amount);
  const amountCents = moneyCents(amountNumber);
  const totalRemainingCents = moneyCents(Number(customer?.total_remaining_amount ?? 0)) ?? 0;
  const cashCents = moneyCents(Number(draft.cashAmount || 0));
  const cardCents = moneyCents(Number(draft.cardAmount || 0));
  const transferCents = moneyCents(Number(draft.transferAmount || 0));
  const mixedCents = cashCents === null || cardCents === null || transferCents === null
    ? null
    : cashCents + cardCents + transferCents;
  const overpayment = amountCents !== null && amountCents > totalRemainingCents;
  const invalidMixed = draft.paymentMethod === "MIXED" &&
    (amountCents === null || mixedCents === null || mixedCents !== amountCents);
  const activeDebts = sortedDebts.filter((debt) => !debt.archived_at && Number(debt.remaining_amount) > 0);
  const preview = buildCustomerDebtPreview(activeDebts, amountNumber);
  const paymentAllowed = scope === "active" || scope === "all";
  const canSubmit = Boolean(
    customer &&
    paymentAllowed &&
    amountCents !== null &&
    amountCents > 0 &&
    !overpayment &&
    !invalidMixed &&
    preview.length > 0
  );

  const payment = useMutation({
    mutationFn: () => api<CustomerDebtPaymentResult>("/debts/customer-payments", {
      method: "POST",
      body: JSON.stringify({
        requestId,
        identityType: customer!.identity_type,
        customerId: customer!.identity_type === "CUSTOMER_ID" ? customer!.customer_id : undefined,
        customerName: customer!.identity_type === "LEGACY" ? customer!.customer_name : undefined,
        phone: customer!.identity_type === "LEGACY" ? customer!.phone : undefined,
        amount: amountNumber,
        paymentMethod: draft.paymentMethod,
        cashAmount: draft.paymentMethod === "MIXED" ? Number(draft.cashAmount || 0) : undefined,
        cardAmount: draft.paymentMethod === "MIXED" ? Number(draft.cardAmount || 0) : undefined,
        transferAmount: draft.paymentMethod === "MIXED" ? Number(draft.transferAmount || 0) : undefined,
        note: draft.note || null
      })
    }),
    onSuccess: async (data) => {
      const closesActiveScope = scope === "active" &&
        moneyCents(data.amount) === totalRemainingCents;
      setResult(data);
      setDraft(emptyDraft);
      setRequestId(newRequestId());
      toast.success(tr("Umumiy to‘lov taqsimlandi", "Общий платеж распределен"));
      if (closesActiveScope) onClose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["debts"] }),
        queryClient.invalidateQueries({ queryKey: ["debt"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] })
      ]);
      onPaid?.(data);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => {
      submittingRef.current = false;
    }
  });

  const setDraftField = <K extends keyof CustomerPaymentDraft>(
    field: K,
    value: CustomerPaymentDraft[K]
  ) => setDraft((current) => ({ ...current, [field]: value }));

  const submitPayment = () => {
    if (!canSubmit || payment.isPending || submittingRef.current) return;
    submittingRef.current = true;
    payment.mutate();
  };

  const closeModal = () => {
    if (payment.isPending) return;
    setDraft(emptyDraft);
    setResult(null);
    onClose();
  };

  return (
    <Modal
      open={Boolean(group)}
      title={tr("Mijoz qarzlari", "Долги клиента")}
      description={group
        ? `${group.customer_name} · ${group.phone || tr("Telefon ko‘rsatilmagan", "Телефон не указан")}`
        : undefined}
      onClose={closeModal}
      closeLabel={tr("Yopish", "Закрыть")}
      wide
      className="customer-debt-modal"
      bodyClassName="customer-debt-modal-body"
      footer={
        <>
          <Button variant="secondary" disabled={payment.isPending} onClick={closeModal}>
            {tr("Yopish", "Закрыть")}
          </Button>
          {customer && paymentAllowed && Number(customer.total_remaining_amount) > 0 ? (
            <Button loading={payment.isPending} disabled={!canSubmit} onClick={submitPayment}>
              <HandCoins size={16} />
              {tr("Umumiy to‘lovni saqlash", "Сохранить общий платеж")}
            </Button>
          ) : null}
        </>
      }
    >
      {details.isLoading ? (
        <div className="customer-debt-modal-state" role="status">
          <RefreshCw className="spin" size={22} />
          <span>{tr("Nakladnoylar yuklanmoqda...", "Накладные загружаются...")}</span>
        </div>
      ) : details.isError ? (
        <div className="customer-debt-modal-state" role="alert">
          <AlertCircle size={24} />
          <strong>{tr("Mijoz qarzlarini yuklab bo‘lmadi", "Не удалось загрузить долги клиента")}</strong>
          <Button variant="secondary" onClick={() => void details.refetch()}>
            <RefreshCw size={15} /> {tr("Qayta urinish", "Повторить")}
          </Button>
        </div>
      ) : customer ? (
        <div className="customer-debt-modal-content">
          <section className="customer-debt-summary-grid" aria-label={tr("Mijoz qarzi xulosasi", "Сводка долга клиента")}>
            <div><span>{tr("Mijoz", "Клиент")}</span><strong><UserRound size={16} /> {customer.customer_name}</strong></div>
            <div><span>{tr("Jami", "Всего")}</span><strong>{money(customer.total_amount)}</strong></div>
            <div><span>{tr("To‘langan", "Оплачено")}</span><strong className="positive">{money(customer.total_paid_amount)}</strong></div>
            <div><span>{tr("Qoldiq", "Остаток")}</span><strong>{money(customer.total_remaining_amount)}</strong></div>
            <div><span>{tr("Eng yaqin muddat", "Ближайший срок")}</span><strong>{date(customer.nearest_due_date)}</strong></div>
            <div><span>{tr("Holat", "Статус")}</span><Badge tone={statusTone(customer.status)}>{statusText(customer.status, tr)}</Badge></div>
          </section>

          <section>
            <div className="modal-section-title">
              <ReceiptText size={17} />
              <strong>{tr("Nakladnoylar", "Накладные")}</strong>
              <span>{customer.debt_count}</span>
            </div>
            <div className="customer-debt-invoice-list">
              {sortedDebts.map((debt) => (
                <article className="customer-debt-invoice-card" key={debt.id}>
                  <div className="customer-debt-invoice-main">
                    <code>{debt.invoice_number}</code>
                    <small>{tr("Sana", "Дата")}: {date(debt.created_at)}</small>
                    <small>{tr("Muddat", "Срок")}: {date(debt.due_date)}</small>
                  </div>
                  <div><span>{tr("Jami", "Всего")}</span><strong>{money(debt.amount)}</strong></div>
                  <div><span>{tr("To‘langan", "Оплачено")}</span><strong className="positive">{money(debt.paid_amount)}</strong></div>
                  <div><span>{tr("Qoldiq", "Остаток")}</span><strong>{money(debt.remaining_amount)}</strong></div>
                  <Badge tone={statusTone(debt.status)}>{statusText(debt.status, tr)}</Badge>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={tr(`${debt.invoice_number} tafsilotlari`, `Детали ${debt.invoice_number}`)}
                    title={tr("Nakladnoy tafsilotlari va to‘lovi", "Детали и оплата накладной")}
                    onClick={() => onOpenDebt(debt)}
                  >
                    <Eye size={16} />
                  </button>
                </article>
              ))}
            </div>
          </section>

          {paymentAllowed && Number(customer.total_remaining_amount) > 0 ? (
            <section className="customer-payment-panel">
              <div className="modal-section-title">
                <HandCoins size={17} />
                <strong>{tr("Umumiy to‘lov", "Общий платеж")}</strong>
              </div>
              <div className="form-grid">
                <Input
                  label={tr("To‘lov summasi *", "Сумма оплаты *")}
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={Number(customer.total_remaining_amount)}
                  value={draft.amount}
                  onChange={(event) => setDraftField("amount", event.target.value)}
                />
                <Select
                  label={tr("To‘lov usuli *", "Способ оплаты *")}
                  value={draft.paymentMethod}
                  onChange={(event) => setDraftField("paymentMethod", event.target.value as DebtPaymentMethod)}
                >
                  <option value="CASH">{tr("Naqd", "Наличные")}</option>
                  <option value="CARD">{tr("Plastik", "Карта")}</option>
                  <option value="TRANSFER">{tr("Bank o‘tkazmasi", "Перевод")}</option>
                  <option value="MIXED">{tr("Aralash to‘lov", "Смешанная оплата")}</option>
                </Select>
              </div>
              {draft.paymentMethod === "MIXED" ? (
                <div className="form-grid customer-payment-splits">
                  <Input label={tr("Naqd qismi", "Наличные")} type="number" min="0" step="0.01" value={draft.cashAmount} onChange={(event) => setDraftField("cashAmount", event.target.value)} />
                  <Input label={tr("Karta qismi", "Карта")} type="number" min="0" step="0.01" value={draft.cardAmount} onChange={(event) => setDraftField("cardAmount", event.target.value)} />
                  <Input label={tr("O‘tkazma qismi", "Перевод")} type="number" min="0" step="0.01" value={draft.transferAmount} onChange={(event) => setDraftField("transferAmount", event.target.value)} />
                  <div className="calculated-field"><span>{tr("Aralash jami", "Итого смешанное")}</span><strong>{money(mixedCents === null ? 0 : mixedCents / 100)}</strong></div>
                </div>
              ) : null}
              <Textarea label={tr("Izoh", "Примечание")} value={draft.note} onChange={(event) => setDraftField("note", event.target.value)} />
              {amountNumber > 0 && amountCents === null ? <div className="inline-error">{tr("Pul summasi ko‘pi bilan 2 kasr xonasiga ega bo‘lishi kerak.", "Денежная сумма должна иметь не более 2 знаков после запятой.")}</div> : null}
              {overpayment ? <div className="inline-error">{tr("To‘lov jami aktiv qoldiqdan oshmasligi kerak.", "Платеж не должен превышать активный остаток.")}</div> : null}
              {invalidMixed ? <div className="inline-error">{tr("Aralash to‘lov qismlari umumiy summaga teng bo‘lishi kerak.", "Части смешанной оплаты должны равняться общей сумме.")}</div> : null}
              {payment.isError ? <div className="inline-error" role="alert">{payment.error.message}</div> : null}
              {preview.length > 0 ? (
                <div className="allocation-preview" aria-live="polite">
                  <strong>{tr("Oldindan taqsimot", "Предварительное распределение")}</strong>
                  {preview.map((item) => (
                    <div key={item.debt.id}>
                      <span>{item.debt.invoice_number}</span>
                      <span>{money(item.amount)}</span>
                    </div>
                  ))}
                  <small>{tr("Yakuniy taqsimot server tomonidan lockdan keyin hisoblanadi.", "Итоговое распределение рассчитывается сервером после блокировки.")}</small>
                </div>
              ) : null}
            </section>
          ) : null}

          {result ? (
            <section className="allocation-result" aria-live="polite">
              <div className="modal-section-title"><RefreshCw size={17} /><strong>{tr("Server taqsimoti", "Распределение сервера")}</strong></div>
              {result.allocations.map((allocation) => (
                <div key={allocation.paymentId}>
                  <span>{allocation.invoiceNumber}</span>
                  <strong>{money(allocation.amount)}</strong>
                  <small>{paymentMethodText(result.paymentMethod, tr)} · {tr("Qoldiq", "Остаток")}: {money(allocation.remainingAmount)}</small>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
