import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
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
  Textarea
} from "../components/ui";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import { date } from "../lib/format";
import type { Category, Paginated } from "../types/api";

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const { tr } = useI18n();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const categories = useQuery({
    queryKey: ["categories", page, search],
    queryFn: () => api<Paginated<Category>>("/categories", {
      params: { page, limit: 15, search, sortOrder: "asc" }
    })
  });

  const save = useMutation({
    mutationFn: () => api<Category>(editing ? `/categories/${editing.id}` : "/categories", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify({ name, description: description || null })
    }),
    onSuccess: () => {
      toast.success(editing ? "Kategoriya yangilandi" : "Kategoriya qo‘shildi");
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Kategoriya o‘chirildi");
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setModalOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setName(category.name);
    setDescription(category.description ?? "");
    setModalOpen(true);
  };

  return (
    <>
      <PageHeader
        title={tr("Kategoriyalar", "Категории")}
        description={tr("Mahsulotlarni tartibli guruhlarga ajrating.", "Объединяйте товары в удобные группы.")}
        actions={<Button onClick={openCreate}><Plus size={17} /> {tr("Kategoriya qo‘shish", "Добавить категорию")}</Button>}
      />
      <Card>
        <div className="filters">
          <SearchInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={tr("Kategoriya qidirish...", "Поиск категории...")}
          />
        </div>
        <DataTable loading={categories.isLoading} empty={!categories.data?.data.length} minWidth={560}>
          <thead>
            <tr>
              <th>{tr("Nomi", "Название")}</th>
              <th>{tr("Tavsif", "Описание")}</th>
              <th>{tr("Yaratilgan", "Создано")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.data?.data.map((category) => (
              <tr key={category.id}>
                <td data-label={tr("Nomi", "Название")}>
                  <div className="product-cell">
                    <span className="product-avatar"><Tags size={17} /></span>
                    <strong>{category.name}</strong>
                  </div>
                </td>
                <td data-label={tr("Tavsif", "Описание")}>{category.description || "-"}</td>
                <td data-label={tr("Yaratilgan", "Создано")}>{date(category.created_at)}</td>
                <td data-label={tr("Amallar", "Действия")}>
                  <div className="row-actions">
                    <button className="icon-button" onClick={() => openEdit(category)}><Edit3 size={16} /></button>
                    <button className="icon-button danger-icon" onClick={() => setDeleting(category)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {categories.data && (
          <Pagination
            page={categories.data.meta.page}
            totalPages={categories.data.meta.totalPages}
            total={categories.data.meta.total}
            onPage={setPage}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? tr("Kategoriyani tahrirlash", "Редактировать категорию") : tr("Yangi kategoriya", "Новая категория")}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button loading={save.isPending} disabled={name.trim().length < 2} onClick={() => save.mutate()}>
              {tr("Saqlash", "Сохранить")}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Input label={tr("Kategoriya nomi *", "Название категории *")} value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea label={tr("Tavsif", "Описание")} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Kategoriyani o‘chirish"
        message={`“${deleting?.name ?? ""}” kategoriyasi o‘chiriladi. Agar unga mahsulotlar biriktirilgan bo‘lsa, server operatsiyani rad etadi.`}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
