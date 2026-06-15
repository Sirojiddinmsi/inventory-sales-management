import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CreditCard, HandCoins, Phone, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import type { Debt, DebtStatus, Paginated } from "../types/api";

type DebtDetails = Debt & {
  payments: Array<{
    id: string;
    amount: number;
    paid_at: string;
    note: string | null;
    received_by_name: string;
  }>;
};

const debtTone = (status: DebtStatus) =>
  status === "PAID" ? "success" : status === "PARTIALLY_PAID" ? "warning" : "danger";

export function DebtsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { tr } = useI18n();
  const isAdmin = user?.role === "ADMIN";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<Debt | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [archiveDebt, setArchiveDebt] = useState<Debt | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [purgeDebt, setPurgeDebt] = useState<Debt | null>(null);

  const debts = useQuery({
    queryKey: ["debts", page, search, status, archived],
    queryFn: () => api<Paginated<Debt>>("/debts", {
      params: { page, limit: 15, search, status, archived }
    })
  });
  const details = useQuery({
    queryKey: ["debt", selected?.id],
    queryFn: () => api<DebtDetails>(`/debts/${selected!.id}`),
    enabled: Boolean(selected)
  });

  useEffect(() => setPage(1), [search, status, archived]);

  const refreshDebts = () => {
    void queryClient.invalidateQueries({ queryKey: ["debts"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const pay = useMutation({
    mutationFn: () => api<Debt>(`/debts/${selected!.id}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount: Number(amount), note: note || null })
    }),
    onSuccess: () => {
      toast.success("Qarz to‘lovi qabul qilindi");
      setAmount("");
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
    setNote("");
  };

  const current = details.data ?? selected;
  const remaining = Number(current?.remaining_amount ?? 0);

  return (
    <>
      <PageHeader
        title={archived ? tr("Qarzlar arxivi", "Архив долгов") : tr("Qarzlar", "Долги")}
        description={archived
          ? tr("O‘chirilgan qarz yozuvlari 30 kun saqlanadi.", "Удаленные долги хранятся 30 дней.")
          : tr("Mijoz qarzlari, muddatlari va to‘lov tarixini nazorat qiling.", "Контролируйте долги клиентов, сроки и историю платежей.")}
        actions={isAdmin && (
          <Button variant="secondary" onClick={() => setArchived((value) => !value)}>
            {archived ? <Undo2 size={17} /> : <Archive size={17} />}
            {archived ? tr("Faol qarzlar", "Активные долги") : tr("Arxiv", "Архив")}
          </Button>
        )}
      />
      <Card>
        <div className="filters">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("Mijoz yoki telefon bo‘yicha...", "Клиент или телефон...")}
          />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">{tr("Barcha holatlar", "Все статусы")}</option>
            <option value="UNPAID">{tr("To‘lanmagan", "Не оплачен")}</option>
            <option value="PARTIALLY_PAID">{tr("Qisman to‘langan", "Оплачен частично")}</option>
            <option value="PAID">{tr("To‘langan", "Оплачен")}</option>
          </Select>
        </div>
        <DataTable loading={debts.isLoading} empty={!debts.data?.data.length} minWidth={archived ? 1080 : 950}>
          <thead>
            <tr>
              <th>{tr("Mijoz", "Клиент")}</th>
              <th>{tr("Nakladnoy", "Накладная")}</th>
              <th>{tr("Jami qarz", "Общий долг")}</th>
              <th>{tr("To‘langan", "Оплачено")}</th>
              <th>{tr("Qoldiq", "Остаток")}</th>
              <th>{tr("Muddat", "Срок")}</th>
              <th>{tr("Holat", "Статус")}</th>
              {archived && <th>{tr("Arxiv muddati", "Срок архива")}</th>}
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
                    {debt.status === "UNPAID"
                      ? tr("To‘lanmagan", "Не оплачен")
                      : debt.status === "PARTIALLY_PAID"
                        ? tr("Qisman to‘langan", "Оплачен частично")
                        : tr("To‘langan", "Оплачен")}
                  </Badge>
                </td>
                {archived && <td data-label={tr("Arxiv muddati", "Срок архива")}>{dateTime(debt.archive_expires_at)}</td>}
                <td data-label={tr("Amallar", "Действия")}>
                  {!archived && (
                    <div className="row-actions">
                      <Button variant="secondary" size="sm" onClick={() => openDebt(debt)}>
                        <HandCoins size={14} /> {tr("To‘lov", "Оплата")}
                      </Button>
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
                  {archived && isAdmin && (
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
            <h3 className="subheading">{tr("To‘lov tarixi", "История платежей")}</h3>
            <div className="payment-history">
              {details.isLoading && <span>{tr("Yuklanmoqda...", "Загрузка...")}</span>}
              {!details.isLoading && !details.data?.payments.length && <span>{tr("Hali to‘lov qilinmagan", "Платежей пока нет")}</span>}
              {details.data?.payments.map((payment) => (
                <div key={payment.id}>
                  <span><strong>{money(payment.amount)}</strong><small>{payment.received_by_name}</small></span>
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
                <div className="quick-amounts">
                  <button onClick={() => setAmount(String(remaining / 2))}>50%</button>
                  <button onClick={() => setAmount(String(remaining))}>{tr("To‘liq yopish", "Погасить полностью")}</button>
                </div>
                <Textarea label={tr("Izoh", "Примечание")} value={note} onChange={(event) => setNote(event.target.value)} />
                <Button
                  loading={pay.isPending}
                  disabled={Number(amount) <= 0 || Number(amount) > remaining}
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
