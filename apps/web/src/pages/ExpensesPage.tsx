import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus, Trash2, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
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
import { dateTime, money, toIsoEndOfDay, toIsoFromDateInput } from "../lib/format";
import type { Expense, Paginated } from "../types/api";

const expenseTypes = ["Ijara", "Ish haqi", "Transport", "Internet", "Boshqa"];

export function ExpensesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { tr } = useI18n();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [expenseType, setExpenseType] = useState("Ijara");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const expenses = useQuery({
    queryKey: ["expenses", page, search, typeFilter, from, to],
    queryFn: () => api<Paginated<Expense>>("/expenses", {
      params: {
        page,
        limit: 15,
        search,
        expenseType: typeFilter,
        from: toIsoFromDateInput(from),
        to: toIsoEndOfDay(to)
      }
    })
  });

  useEffect(() => setPage(1), [search, typeFilter, from, to]);

  const save = useMutation({
    mutationFn: () => api<Expense>(editing ? `/expenses/${editing.id}` : "/expenses", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify({
        expenseType,
        amount: Number(amount),
        spentAt: new Date(`${spentAt}T12:00:00`).toISOString(),
        note: note || null
      })
    }),
    onSuccess: () => {
      toast.success(editing ? "Xarajat yangilandi" : "Xarajat qo‘shildi");
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error) => toast.error(error.message)
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Xarajat o‘chirildi");
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const openCreate = () => {
    setEditing(null);
    setExpenseType("Ijara");
    setAmount("");
    setSpentAt(new Date().toISOString().slice(0, 10));
    setNote("");
    setModalOpen(true);
  };
  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setExpenseType(expense.expense_type);
    setAmount(String(expense.amount));
    setSpentAt(expense.spent_at.slice(0, 10));
    setNote(expense.note ?? "");
    setModalOpen(true);
  };

  return (
    <>
      <PageHeader
        title={tr("Xarajatlar", "Расходы")}
        description={tr("Operatsion xarajatlarni kiriting va sof foydani aniq hisoblang.", "Учитывайте операционные расходы и точно рассчитывайте чистую прибыль.")}
        actions={<Button onClick={openCreate}><Plus size={17} /> {tr("Xarajat qo‘shish", "Добавить расход")}</Button>}
      />
      <Card>
        <div className="filters">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Xarajat yoki izoh...", "Расход или примечание...")} />
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{tr("Barcha turlar", "Все виды")}</option>
            {expenseTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </Select>
          <Input label={tr("Dan", "С")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label={tr("Gacha", "По")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <DataTable loading={expenses.isLoading} empty={!expenses.data?.data.length} minWidth={760}>
          <thead><tr><th>{tr("Sana", "Дата")}</th><th>{tr("Turi", "Вид")}</th><th>{tr("Summa", "Сумма")}</th><th>{tr("Izoh", "Примечание")}</th><th>{tr("Kiritgan", "Добавил")}</th><th /></tr></thead>
          <tbody>
            {expenses.data?.data.map((expense) => (
              <tr key={expense.id}>
                <td data-label={tr("Sana", "Дата")}>{dateTime(expense.spent_at)}</td>
                <td data-label={tr("Turi", "Вид")}>
                  <div className="product-cell">
                    <span className="product-avatar"><WalletCards size={17} /></span>
                    <strong>{expense.expense_type}</strong>
                  </div>
                </td>
                <td data-label={tr("Summa", "Сумма")}><strong>{money(expense.amount)}</strong></td>
                <td data-label={tr("Izoh", "Примечание")}>{expense.note || "-"}</td>
                <td data-label={tr("Kiritgan", "Добавил")}>{expense.created_by_name}</td>
                <td data-label={tr("Amallar", "Действия")}>
                  <div className="row-actions">
                    <button className="icon-button" onClick={() => openEdit(expense)}><Edit3 size={16} /></button>
                    {user?.role === "ADMIN" && (
                      <button className="icon-button danger-icon" onClick={() => setDeleting(expense)}><Trash2 size={16} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {expenses.data && <Pagination {...expenses.data.meta} onPage={setPage} />}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? tr("Xarajatni tahrirlash", "Редактировать расход") : tr("Yangi xarajat", "Новый расход")}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button loading={save.isPending} disabled={!expenseType || Number(amount) <= 0} onClick={() => save.mutate()}>{tr("Saqlash", "Сохранить")}</Button>
          </>
        }
      >
        <div className="form-stack">
          <Select label={tr("Xarajat turi *", "Вид расхода *")} value={expenseType} onChange={(e) => setExpenseType(e.target.value)}>
            {expenseTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </Select>
          <Input label={tr("Summa *", "Сумма *")} type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label={tr("Sana *", "Дата *")} type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
          <Textarea label={tr("Izoh", "Примечание")} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Xarajatni o‘chirish"
        message={`${deleting?.expense_type ?? ""} xarajati (${money(deleting?.amount)}) o‘chiriladi.`}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
