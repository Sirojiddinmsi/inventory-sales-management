import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronDown, ChevronRight, CreditCard, HandCoins, Phone, Trash2, Undo2, Users } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Textarea
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import { date, dateTime, money } from "../lib/format";
import type { Debt, DebtCustomerGroup, DebtPayment, DebtPaymentMethod, DebtStatus, DebtSummary, Paginated } from "../types/api";

type DebtDetails = Debt & {
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    product_code: string;
    unit: string;
    quantity: number;
    sale_price: number;
    discount: number;
    total_amount: number;
  }>;
  payments: DebtPayment[];
};

const debtTone = (status: DebtStatus) =>
  status === "PAID" ? "success" : status === "PARTIALLY_PAID" ? "warning" : status === "OVERDUE" ? "danger" : "warning";

const debtStatusText = (status: DebtStatus, tr: (uz: string, ru: string) => string) =>
  status === "PAID"
    ? tr("To‘langan", "Оплачен")
    : status === "PARTIALLY_PAID"
      ? tr("Qisman to‘langan", "Частично оплачен")
      : status === "OVERDUE"
        ? tr("Muddati o‘tgan", "Просрочен")
        : tr("To‘lanmagan", "Не оплачен");

type DebtFilter = "active" | "paid" | "archive" | "overdue" | "partial" | "all";
type DebtView = "customers" | "invoices";

export function DebtsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { tr } = useI18n();
  const isAdmin = user?.role === "ADMIN";
  const [page, setPage] = useState(1);
  const [customerPage, setCustomerPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DebtFilter>("active");
  const [view, setView] = useState<DebtView>("customers");
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [selected, setSelected] = useState<Debt | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<DebtPaymentMethod>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [note, setNote] = useState("");
  const [archiveDebt, setArchiveDebt] = useState<Debt | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [purgeDebt, setPurgeDebt] = useState<Debt | null>(null);

  const debts = useQuery({
    queryKey: ["debts", page, search, filter],
    queryFn: () => api<Paginated<Debt>>("/debts", {
      params: {
        page,
        limit: 15,
        search,
        filter,
        archived: filter === "archive"
      }
    })
  });
  const customerDebts = useQuery({
    queryKey: ["debts", "customers", customerPage, search, filter],
    queryFn: () => api<Paginated<DebtCustomerGroup>>("/debts/customers", {
      params: {
        page: customerPage,
        limit: 15,
        search,
        filter,
        archived: filter === "archive"
      }
    })
  });
  const summary = useQuery({
    queryKey: ["debts", "summary"],
    queryFn: () => api<DebtSummary>("/debts/summary")
  });
  const details = useQuery({
    queryKey: ["debt", selected?.id],
    queryFn: () => api<DebtDetails>(`/debts/${selected!.id}`),
    enabled: Boolean(selected)
  });

  useEffect(() => {
    setPage(1);
    setCustomerPage(1);
    setExpandedCustomer(null);
  }, [search, filter]);

  const refreshDebts = () => {
    void queryClient.invalidateQueries({ queryKey: ["debts"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const pay = useMutation({
    mutationFn: () => api<Debt>(`/debts/${selected!.id}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amount: Number(amount),
        paymentMethod,
        cashAmount: paymentMethod === "MIXED" ? Number(cashAmount || 0) : undefined,
        cardAmount: paymentMethod === "MIXED" ? Number(cardAmount || 0) : undefined,
        transferAmount: paymentMethod === "MIXED" ? Number(transferAmount || 0) : undefined,
        note: note || null
      })
    }),
    onSuccess: () => {
      toast.success("Qarz to‘lovi qabul qilindi");
      setAmount("");
      setPaymentMethod("CASH");
      setCashAmount("");
      setCardAmount("");
      setTransferAmount("");
      setNote("");
      refreshDebts();
      void queryClient.invalidateQueries({ queryKey: ["debt", selected?.id] });
    },
    onError: (error) => toast.error(error.message)
  });

  const archiveMutation = useMutation({
    mutationFn: () => api(`/debts/${archiveDebt!.id}/archive`, {
      method: "POST",
      body: JSON.stringify({ reason: archiveReason })
    }),
    onSuccess: () => {
      toast.success("Qarz 30 kunlik arxivga o‘tkazildi");
      setArchiveDebt(null);
      setArchiveReason("");
      refreshDebts();
    },
    onError: (error) => toast.error(error.message)
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api(`/debts/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Qarz arxivdan tiklandi");
      refreshDebts();
    },
    onError: (error) => toast.error(error.message)
  });

  const purgeMutation = useMutation({
    mutationFn: (id: string) => api<void>(`/debts/${id}/permanent`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Qarz butunlay o‘chirildi");
      setPurgeDebt(null);
      refreshDebts();
    },
    onError: (error) => toast.error(error.message)
  });

  const openDebt = (debt: Debt) => {
    setSelected(debt);
    setAmount("");
    setPaymentMethod("CASH");
    setCashAmount("");
    setCardAmount("");
    setTransferAmount("");
    setNote("");
  };

  const current = details.data ?? selected;
  const remaining = Number(current?.remaining_amount ?? 0);
  const isArchiveView = filter === "archive";
  const mixedTotal =
    Number(cashAmount || 0) + Number(cardAmount || 0) + Number(transferAmount || 0);

  const paymentMethodLabel = (method: DebtPaymentMethod) =>
    method === "CASH"
      ? tr("Naqd", "Наличные")
      : method === "CARD"
        ? tr("Plastik", "Карта")
        : method === "TRANSFER"
          ? tr("Bank o‘tkazmasi", "Перевод")
          : tr("Aralash to‘lov", "Смешанная оплата");

  return (
    <>
      <PageHeader
        title={isArchiveView ? tr("Qarzlar arxivi", "Архив долгов") : tr("Qarzlar", "Долги")}
        description={isArchiveView
          ? tr("O‘chirilgan qarz yozuvlari 30 kun saqlanadi.", "Удаленные долги хранятся 30 дней.")
          : tr("Mijoz qarzlari, muddatlari va to‘lov tarixini nazorat qiling.", "Контролируйте долги клиентов, сроки и историю платежей.")}
        actions={isAdmin && (
          <Button variant="secondary" onClick={() => setFilter(isArchiveView ? "active" : "archive")}>
            {isArchiveView ? <Undo2 size={17} /> : <Archive size={17} />}
            {isArchiveView ? tr("Faol qarzlar", "Активные долги") : tr("Arxiv", "Архив")}
          </Button>
        )}
      />
      <div className="stats-grid">
        <Card className="stat-card">
          <span>{tr("Faol qarz jami", "Активный долг")}</span>
          <strong>{money(summary.data?.total_active_debt)}</strong>
        </Card>
        <Card className="stat-card">
          <span>{tr("To‘langan qarzlar", "Оплаченные долги")}</span>
          <strong>{money(summary.data?.paid_debts)}</strong>
        </Card>
        <Card className="stat-card">
          <span>{tr("Muddati o‘tgan", "Просроченные")}</span>
          <strong>{money(summary.data?.overdue_debts)}</strong>
        </Card>
        <Card className="stat-card">
          <span>{tr("Qisman to‘langan", "Частично оплаченные")}</span>
          <strong>{money(summary.data?.partially_paid_debts)}</strong>
        </Card>
      </div>
      <Card>
        <div className="debt-view-tabs">
          <button
            type="button"
            className={view === "customers" ? "active" : ""}
            onClick={() => setView("customers")}
          >
            <Users size={16} /> {tr("Mijozlar bo‘yicha", "По клиентам")}
          </button>
          <button
            type="button"
            className={view === "invoices" ? "active" : ""}
            onClick={() => setView("invoices")}
          >
            <CreditCard size={16} /> {tr("Nakladnoylar bo‘yicha", "По накладным")}
          </button>
        </div>
        <div className="filters">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("Mijoz yoki telefon bo‘yicha...", "Клиент или телефон...")}
          />
          <Select value={filter} onChange={(event) => setFilter(event.target.value as DebtFilter)}>
            <option value="active">{tr("Faol qarzlar", "Активные")}</option>
            <option value="paid">{tr("To‘langan / arxiv", "Оплаченные / архив")}</option>
            <option value="overdue">{tr("Muddati o‘tgan", "Просроченные")}</option>
            <option value="partial">{tr("Qisman to‘langan", "Частично оплаченные")}</option>
            <option value="all">{tr("Barchasini ko‘rsatish", "Показать все")}</option>
            {isAdmin && <option value="archive">{tr("Arxiv", "Архив")}</option>}
          </Select>
        </div>
        {view === "customers" && (
          <>
            <DataTable loading={customerDebts.isLoading} empty={!customerDebts.data?.data.length} minWidth={980}>
              <thead>
                <tr>
                  <th>{tr("Mijoz", "Клиент")}</th>
                  <th>{tr("Nakladnoylar", "Накладные")}</th>
                  <th>{tr("Jami qarz", "Общий долг")}</th>
                  <th>{tr("To‘langan", "Оплачено")}</th>
                  <th>{tr("Qoldiq", "Остаток")}</th>
                  <th>{tr("Eng yaqin muddat", "Ближайший срок")}</th>
                  <th>{tr("Holat", "Статус")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customerDebts.data?.data.map((group) => {
                  const groupKey = `${group.customer_key}:${group.phone_key}`;
                  const expanded = expandedCustomer === groupKey;
                  return (
                    <Fragment key={groupKey}>
                      <tr className="customer-debt-row">
                        <td data-label={tr("Mijoz", "Клиент")}>
                          <div className="product-cell">
                            <span className="product-avatar"><Users size={17} /></span>
                            <div>
                              <strong>{group.customer_name}</strong>
                              <small>{group.phone || tr("Telefon kiritilmagan", "Телефон не указан")}</small>
                            </div>
                          </div>
                        </td>
                        <td data-label={tr("Nakladnoylar", "Накладные")}><strong>{group.debt_count}</strong> {tr("ta", "шт.")}</td>
                        <td data-label={tr("Jami qarz", "Общий долг")}>{money(group.total_amount)}</td>
                        <td data-label={tr("To‘langan", "Оплачено")} className="positive">{money(group.total_paid_amount)}</td>
                        <td data-label={tr("Qoldiq", "Остаток")}><strong>{money(group.total_remaining_amount)}</strong></td>
                        <td data-label={tr("Eng yaqin muddat", "Ближайший срок")}>{date(group.nearest_due_date)}</td>
                        <td data-label={tr("Holat", "Статус")}>
                          <Badge tone={debtTone(group.status)}>{debtStatusText(group.status, tr)}</Badge>
                        </td>
                        <td data-label={tr("Amallar", "Действия")}>
                          <Button variant="secondary" size="sm" onClick={() => setExpandedCustomer(expanded ? null : groupKey)}>
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {expanded ? tr("Yopish", "Скрыть") : tr("Nakladnoylar", "Накладные")}
                          </Button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="customer-debt-details-row">
                          <td colSpan={8}>
                            <div className="customer-debt-details">
                              {group.debts.map((debt) => (
                                <div key={debt.id} className="customer-debt-invoice">
                                  <div>
                                    <code>{debt.invoice_number}</code>
                                    <small>{date(debt.created_at)} · {date(debt.due_date)}</small>
                                  </div>
                                  <span>{money(debt.amount)}</span>
                                  <span className="positive">{money(debt.paid_amount)}</span>
                                  <strong>{money(debt.remaining_amount)}</strong>
                                  <Badge tone={debtTone(debt.status)}>{debtStatusText(debt.status, tr)}</Badge>
                                  <Button variant="secondary" size="sm" onClick={() => openDebt(debt)}>
                                    {Number(debt.remaining_amount) > 0 ? (
                                      <><HandCoins size={14} /> {tr("To‘lov", "Оплата")}</>
                                    ) : (
                                      tr("Batafsil", "Подробнее")
                                    )}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </DataTable>
            {customerDebts.data && (
              <Pagination
                page={customerDebts.data.meta.page}
                totalPages={customerDebts.data.meta.totalPages}
                total={customerDebts.data.meta.total}
                onPage={setCustomerPage}
              />
            )}
          </>
        )}
        {view === "invoices" && (
          <>
        <DataTable loading={debts.isLoading} empty={!debts.data?.data.length} minWidth={isArchiveView ? 1080 : 950}>
          <thead>
            <tr>
              <th>{tr("Mijoz", "Клиент")}</th>
              <th>{tr("Nakladnoy", "Накладная")}</th>
              <th>{tr("Jami qarz", "Общий долг")}</th>
              <th>{tr("To‘langan", "Оплачено")}</th>
              <th>{tr("Qoldiq", "Остаток")}</th>
              <th>{tr("Muddat", "Срок")}</th>
              <th>{tr("Holat", "Статус")}</th>
              {isArchiveView && <th>{tr("Arxiv muddati", "Срок архива")}</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {debts.data?.data.map((debt) => (
              <tr key={debt.id}>
                <td data-label={tr("Mijoz", "Клиент")}>
                  <div className="product-cell">
                    <span className="product-avatar"><CreditCard size={17} /></span>
                    <div>
                      <strong>{debt.customer_name}</strong>
                      <small>{debt.phone || tr("Telefon kiritilmagan", "Телефон не указан")}</small>
                    </div>
                  </div>
                </td>
                <td data-label={tr("Nakladnoy", "Накладная")}><code>{debt.invoice_number}</code></td>
                <td data-label={tr("Jami qarz", "Общий долг")}>{money(debt.amount)}</td>
                <td data-label={tr("To‘langan", "Оплачено")} className="positive">{money(debt.paid_amount)}</td>
                <td data-label={tr("Qoldiq", "Остаток")}><strong>{money(debt.remaining_amount)}</strong></td>
                <td data-label={tr("Muddat", "Срок")}>{date(debt.due_date)}</td>
                <td data-label={tr("Holat", "Статус")}>
                  <Badge tone={debtTone(debt.status)}>
                    {debtStatusText(debt.status, tr)}
                  </Badge>
                </td>
                {isArchiveView && <td data-label={tr("Arxiv muddati", "Срок архива")}>{dateTime(debt.archive_expires_at)}</td>}
                <td data-label={tr("Amallar", "Действия")}>
                  {!isArchiveView && (
                    <div className="row-actions">
                      {Number(debt.remaining_amount) > 0 && (
                        <Button variant="secondary" size="sm" onClick={() => openDebt(debt)}>
                          <HandCoins size={14} /> {tr("To‘lov", "Оплата")}
                        </Button>
                      )}
                      {Number(debt.remaining_amount) <= 0 && (
                        <Button variant="secondary" size="sm" onClick={() => openDebt(debt)}>
                          {tr("Batafsil", "Подробнее")}
                        </Button>
                      )}
                      {isAdmin && (
                        <button
                          className="icon-button danger-icon"
                          title="Arxivga o‘tkazish"
                          onClick={() => setArchiveDebt(debt)}
                        >
                          <Archive size={16} />
                        </button>
                      )}
                    </div>
                  )}
                  {isArchiveView && isAdmin && (
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        title="Tiklash"
                        onClick={() => restoreMutation.mutate(debt.id)}
                      >
                        <Undo2 size={16} />
                      </button>
                      <button
                        className="icon-button danger-icon"
                        title="Butunlay o‘chirish"
                        onClick={() => setPurgeDebt(debt)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {debts.data && (
          <Pagination
            page={debts.data.meta.page}
            totalPages={debts.data.meta.totalPages}
            total={debts.data.meta.total}
            onPage={setPage}
          />
        )}
          </>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        title={current?.customer_name ?? "Qarz"}
        description={`${current?.invoice_number ?? ""} · Muddat: ${date(current?.due_date)}`}
        onClose={() => setSelected(null)}
        wide
      >
        <div className="debt-layout">
          <div>
            <div className="debt-summary">
              <div><span>{tr("Jami qarz", "Общий долг")}</span><strong>{money(current?.amount)}</strong></div>
              <div><span>{tr("To‘langan", "Оплачено")}</span><strong className="positive">{money(current?.paid_amount)}</strong></div>
              <div><span>{tr("Qoldiq", "Остаток")}</span><strong>{money(current?.remaining_amount)}</strong></div>
            </div>
            {current?.phone && <div className="inline-note"><Phone size={15} /> {current.phone}</div>}
            <div className="inline-note">
              <strong>{tr("Holat", "Статус")}:</strong>
              <Badge tone={debtTone(current?.status ?? "UNPAID")}>
                {debtStatusText(current?.status ?? "UNPAID", tr)}
              </Badge>
            </div>
            <h3 className="subheading">{tr("Mahsulotlar", "Товары")}</h3>
            <div className="payment-history">
              {details.isLoading && <span>{tr("Yuklanmoqda...", "Загрузка...")}</span>}
              {!details.isLoading && !details.data?.items.length && <span>{tr("Mahsulotlar topilmadi", "Товары не найдены")}</span>}
              {details.data?.items.map((item) => (
                <div key={item.id}>
                  <span>
                    <strong>{item.product_name}</strong>
                    <small>{item.product_code} · {item.quantity} {item.unit}</small>
                  </span>
                  <span>{money(item.total_amount)}</span>
                </div>
              ))}
            </div>
            <h3 className="subheading">{tr("To‘lov tarixi", "История платежей")}</h3>
            <div className="payment-history">
              {details.isLoading && <span>{tr("Yuklanmoqda...", "Загрузка...")}</span>}
              {!details.isLoading && !details.data?.payments.length && <span>{tr("Hali to‘lov qilinmagan", "Платежей пока нет")}</span>}
              {details.data?.payments.map((payment) => (
                <div key={payment.id}>
                  <span>
                    <strong>{money(payment.amount)}</strong>
                    <small>
                      {paymentMethodLabel(payment.payment_method)} · {payment.received_by_name}
                    </small>
                    {payment.payment_method === "MIXED" && (
                      <small>
                        {`Naqd: ${money(payment.cash_amount)} · Karta: ${money(payment.card_amount)} · Transfer: ${money(payment.transfer_amount)}`}
                      </small>
                    )}
                    {payment.note && <small>{payment.note}</small>}
                  </span>
                  <span>{dateTime(payment.paid_at)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="payment-panel">
            <h3>{tr("To‘lov qabul qilish", "Принять оплату")}</h3>
            {remaining > 0 ? (
              <div className="form-stack">
                <Input
                  label={tr("To‘lov summasi *", "Сумма оплаты *")}
                  type="number"
                  min="1"
                  max={remaining}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <Select
                  label={tr("To‘lov usuli *", "Способ оплаты *")}
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as DebtPaymentMethod)}
                >
                  <option value="CASH">{tr("Naqd", "Наличные")}</option>
                  <option value="CARD">{tr("Plastik", "Карта")}</option>
                  <option value="TRANSFER">{tr("Bank o‘tkazmasi", "Перевод")}</option>
                  <option value="MIXED">{tr("Aralash to‘lov", "Смешанная оплата")}</option>
                </Select>
                {paymentMethod === "MIXED" && (
                  <div className="form-grid">
                    <Input
                      label={tr("Naqd qismi", "Наличные")}
                      type="number"
                      min="0"
                      value={cashAmount}
                      onChange={(event) => setCashAmount(event.target.value)}
                    />
                    <Input
                      label={tr("Karta qismi", "Карта")}
                      type="number"
                      min="0"
                      value={cardAmount}
                      onChange={(event) => setCardAmount(event.target.value)}
                    />
                    <Input
                      label={tr("Transfer qismi", "Перевод")}
                      type="number"
                      min="0"
                      value={transferAmount}
                      onChange={(event) => setTransferAmount(event.target.value)}
                    />
                    <div className="calculated-field">
                      <span>{tr("Aralash jami", "Сумма смешанной оплаты")}</span>
                      <strong>{money(mixedTotal)}</strong>
                    </div>
                  </div>
                )}
                <div className="quick-amounts">
                  <button onClick={() => setAmount(String(remaining / 2))}>50%</button>
                  <button onClick={() => setAmount(String(remaining))}>{tr("To‘liq yopish", "Погасить полностью")}</button>
                </div>
                <Textarea label={tr("Izoh", "Примечание")} value={note} onChange={(event) => setNote(event.target.value)} />
                <Button
                  loading={pay.isPending}
                  disabled={
                    Number(amount) <= 0 ||
                    Number(amount) > remaining ||
                    (paymentMethod === "MIXED" && Math.abs(mixedTotal - Number(amount || 0)) > 0.009)
                  }
                  onClick={() => pay.mutate()}
                >
                  <HandCoins size={16} /> {tr("To‘lovni saqlash", "Сохранить оплату")}
                </Button>
              </div>
            ) : (
              <div className="paid-message"><Badge tone="success">{tr("Qarz to‘liq yopilgan", "Долг полностью погашен")}</Badge></div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(archiveDebt)}
        title="Qarzni arxivga o‘tkazish"
        description="Qarz faol ro‘yxatdan olinadi va 30 kun davomida arxivda saqlanadi."
        onClose={() => setArchiveDebt(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveDebt(null)}>Bekor qilish</Button>
            <Button
              variant="danger"
              loading={archiveMutation.isPending}
              disabled={archiveReason.trim().length < 2}
              onClick={() => archiveMutation.mutate()}
            >
              Arxivga o‘tkazish
            </Button>
          </>
        }
      >
        <Textarea
          label="O‘chirish sababi *"
          value={archiveReason}
          onChange={(event) => setArchiveReason(event.target.value)}
          placeholder="Sababni kiriting"
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(purgeDebt)}
        title="Qarzni butunlay o‘chirish"
        message={`${purgeDebt?.customer_name ?? ""} qarzi va uning to‘lov tarixi qayta tiklab bo‘lmaydigan tarzda o‘chiriladi.`}
        loading={purgeMutation.isPending}
        onCancel={() => setPurgeDebt(null)}
        onConfirm={() => purgeDebt && purgeMutation.mutate(purgeDebt.id)}
      />
    </>
  );
}
