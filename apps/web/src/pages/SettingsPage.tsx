import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Edit3,
  KeyRound,
  Plus,
  Power,
  Ruler,
  Save,
  Trash2,
  UserPlus
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  Select,
  Textarea
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import type { MeasurementUnit, Settings, User, UserRole } from "../types/api";

function passwordStrong(password: string) {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { tr, language } = useI18n();
  const { user: currentUser } = useAuth();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings")
  });
  const units = useQuery({
    queryKey: ["units"],
    queryFn: () => api<MeasurementUnit[]>("/units")
  });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/auth/users")
  });

  const [shopName, setShopName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [currency, setCurrency] = useState("UZS");

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("SELLER");

  const [newUnit, setNewUnit] = useState("");
  const [deletingUnit, setDeletingUnit] = useState<MeasurementUnit | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [statusUser, setStatusUser] = useState<User | null>(null);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("SELLER");
  const [editIsActive, setEditIsActive] = useState(true);

  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    setShopName(settings.data.shop_name);
    setLogoUrl(settings.data.logo_url ?? "");
    setPhone(settings.data.phone ?? "");
    setAddress(settings.data.address ?? "");
    setCurrency(settings.data.currency);
  }, [settings.data]);

  useEffect(() => {
    if (!editingUser) return;
    setEditName(editingUser.name);
    setEditEmail(editingUser.email);
    setEditRole(editingUser.role);
    setEditIsActive(editingUser.is_active);
  }, [editingUser]);

  const resetPasswordValid = useMemo(
    () => passwordStrong(resetPassword) && resetPassword === resetPasswordConfirm,
    [resetPassword, resetPasswordConfirm]
  );

  const save = useMutation({
    mutationFn: () =>
      api<Settings>("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          shopName,
          logoUrl: logoUrl || null,
          phone: phone || null,
          address: address || null,
          currency
        })
      }),
    onSuccess: () => {
      toast.success(tr("Sozlamalar saqlandi", "Настройки сохранены"));
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const addUser = useMutation({
    mutationFn: () =>
      api<User>("/auth/users", {
        method: "POST",
        body: JSON.stringify({
          name: userName.trim(),
          email: userEmail.trim().toLowerCase(),
          password: userPassword,
          role: userRole
        })
      }),
    onSuccess: () => {
      toast.success(tr("Yangi foydalanuvchi yaratildi", "Пользователь создан"));
      setUserName("");
      setUserEmail("");
      setUserPassword("");
      setUserRole("SELLER");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const updateUser = useMutation({
    mutationFn: () =>
      editingUser
        ? api<User>(`/auth/users/${editingUser.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: editName.trim(),
              email: editEmail.trim().toLowerCase(),
              role: editRole,
              isActive: editIsActive
            })
          })
        : Promise.reject(new Error("User is not selected")),
    onSuccess: () => {
      toast.success(tr("Foydalanuvchi yangilandi", "Пользователь обновлен"));
      setEditingUser(null);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const resetUserPassword = useMutation({
    mutationFn: () =>
      resetPasswordUser
        ? api<User>(`/auth/users/${resetPasswordUser.id}/reset-password`, {
            method: "POST",
            body: JSON.stringify({ newPassword: resetPassword })
          })
        : Promise.reject(new Error("User is not selected")),
    onSuccess: () => {
      toast.success(tr("Parol yangilandi", "Пароль обновлен"));
      setResetPasswordUser(null);
      setResetPassword("");
      setResetPasswordConfirm("");
    },
    onError: (error) => toast.error(error.message)
  });

  const toggleStatus = useMutation({
    mutationFn: (target: User) =>
      api<User>(`/auth/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !target.is_active })
      }),
    onSuccess: (_, target) => {
      toast.success(
        target.is_active
          ? tr("Foydalanuvchi o'chirildi", "Пользователь деактивирован")
          : tr("Foydalanuvchi faollashtirildi", "Пользователь активирован")
      );
      setStatusUser(null);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api<{ id: string }>(`/auth/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tr("Foydalanuvchi o'chirildi", "Пользователь удален"));
      setDeletingUser(null);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const addUnit = useMutation({
    mutationFn: () =>
      api<MeasurementUnit>("/units", {
        method: "POST",
        body: JSON.stringify({ name: newUnit })
      }),
    onSuccess: () => {
      toast.success(tr("Yangi birlik qo'shildi", "Единица добавлена"));
      setNewUnit("");
      void queryClient.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const removeUnit = useMutation({
    mutationFn: (id: string) => api<void>(`/units/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tr("Birlik olib tashlandi", "Единица удалена"));
      setDeletingUnit(null);
      void queryClient.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(language === "ru" ? "ru-RU" : "uz-UZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

  return (
    <>
      <PageHeader
        title={tr("Sozlamalar", "Настройки")}
        description={tr(
          "Do'kon rekvizitlari, foydalanuvchilar va mahsulot birliklarini boshqaring.",
          "Управляйте реквизитами магазина, пользователями и единицами товара."
        )}
      />

      <div className="settings-grid">
        <Card title={tr("Do'kon ma'lumotlari", "Данные магазина")}>
          <div className="settings-form">
            <div className="settings-logo">
              <div>{logoUrl ? <img src={logoUrl} alt="Logo" /> : <Building2 size={27} />}</div>
              <span>
                <strong>{tr("Do'kon logosi", "Логотип магазина")}</strong>
                <small>{tr("Ochiq URL orqali logo ko'rsatiladi", "Логотип отображается по открытому URL")}</small>
              </span>
            </div>
            <Input label={tr("Do'kon nomi *", "Название магазина *")} value={shopName} onChange={(e) => setShopName(e.target.value)} />
            <Input label="Logo URL" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
            <div className="form-grid">
              <Input label={tr("Telefon", "Телефон")} value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Select label={tr("Valyuta", "Валюта")} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </Select>
            </div>
            <Textarea label={tr("Manzil", "Адрес")} value={address} onChange={(e) => setAddress(e.target.value)} />
            <Button loading={save.isPending} disabled={shopName.trim().length < 2} onClick={() => save.mutate()}>
              <Save size={16} /> {tr("Sozlamalarni saqlash", "Сохранить настройки")}
            </Button>
          </div>
        </Card>

        <Card title={tr("Yangi foydalanuvchi", "Новый пользователь")}>
          <div className="settings-form">
            <div className="inline-note">
              <UserPlus size={17} />
              {tr(
                "Admin boshqa foydalanuvchilarni boshqaradi. Sotuvchi esa operatsion bo'limlar bilan ishlaydi.",
                "Администратор управляет другими пользователями. Продавец работает с операционными разделами."
              )}
            </div>
            <Input label={tr("To'liq ism *", "Полное имя *")} value={userName} onChange={(e) => setUserName(e.target.value)} />
            <Input label="Email *" type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} />
            <Input
              label={tr("Parol *", "Пароль *")}
              type="password"
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder={tr("8+ belgi, A-z va raqam", "8+ символов, A-z и цифра")}
            />
            <Select label={tr("Rol *", "Роль *")} value={userRole} onChange={(e) => setUserRole(e.target.value as UserRole)}>
              <option value="SELLER">{tr("Sotuvchi", "Продавец")}</option>
              <option value="ADMIN">{tr("Administrator", "Администратор")}</option>
            </Select>
            <Button
              loading={addUser.isPending}
              disabled={userName.trim().length < 2 || !userEmail || !passwordStrong(userPassword)}
              onClick={() => addUser.mutate()}
            >
              <UserPlus size={16} /> {tr("Foydalanuvchi yaratish", "Создать пользователя")}
            </Button>
          </div>
        </Card>
      </div>

      <Card title={tr("Foydalanuvchilar", "Пользователи")} className="users-card">
        <DataTable loading={users.isLoading} empty={!users.data?.length}>
          <thead>
            <tr>
              <th>{tr("Ism", "Имя")}</th>
              <th>Email</th>
              <th>{tr("Rol", "Роль")}</th>
              <th>{tr("Holat", "Статус")}</th>
              <th>{tr("Yaratilgan sana", "Дата создания")}</th>
              <th>{tr("Amallar", "Действия")}</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((item) => (
              <tr key={item.id}>
                <td data-label={tr("Ism", "Имя")}>
                  <div className="user-cell">
                    <span className="avatar avatar-small">
                      {item.profile_image_url ? <img src={item.profile_image_url} alt={item.name} /> : item.name.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{item.name}</strong>
                  </div>
                </td>
                <td data-label="Email">{item.email}</td>
                <td data-label={tr("Rol", "Роль")}>
                  <Badge tone={item.role === "ADMIN" ? "info" : "neutral"}>
                    {item.role === "ADMIN" ? tr("Admin", "Админ") : tr("Sotuvchi", "Продавец")}
                  </Badge>
                </td>
                <td data-label={tr("Holat", "Статус")}>
                  <Badge tone={item.is_active ? "success" : "warning"}>
                    {item.is_active ? tr("Faol", "Активен") : tr("Nofaol", "Неактивен")}
                  </Badge>
                </td>
                <td data-label={tr("Yaratilgan sana", "Дата создания")}>{formatDate(item.created_at)}</td>
                <td data-label={tr("Amallar", "Действия")}>
                  <div className="row-actions">
                    <Button variant="ghost" size="sm" onClick={() => setEditingUser(item)}>
                      <Edit3 size={15} /> {tr("Tahrirlash", "Изменить")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setResetPasswordUser(item)} disabled={item.id === currentUser?.id}>
                      <KeyRound size={15} /> {tr("Parol", "Пароль")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setStatusUser(item)} disabled={item.id === currentUser?.id}>
                      <Power size={15} /> {item.is_active ? tr("O'chirish", "Отключить") : tr("Yoqish", "Включить")}
                    </Button>
                    <Button variant="ghost" size="sm" className="danger-text-button" onClick={() => setDeletingUser(item)} disabled={item.id === currentUser?.id}>
                      <Trash2 size={15} /> {tr("Udalit", "Удалить")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>

      <Card title={tr("Mahsulot birliklari", "Единицы товара")} className="units-card">
        <div className="settings-form">
          <div className="inline-note">
            <Ruler size={17} />
            {tr(
              "Bu birliklar mahsulot yaratish, kirim va sotuvda ishlatiladi.",
              "Эти единицы используются при создании товара, приходе и продаже."
            )}
          </div>
          <div className="unit-create-row">
            <Input
              label={tr("Yangi birlik", "Новая единица")}
              value={newUnit}
              onChange={(event) => setNewUnit(event.target.value)}
              placeholder={tr("Masalan: pachka, rulon, litr", "Например: пачка, рулон, литр")}
            />
            <Button loading={addUnit.isPending} disabled={!newUnit.trim()} onClick={() => addUnit.mutate()}>
              <Plus size={16} /> {tr("Qo'shish", "Добавить")}
            </Button>
          </div>
          <div className="unit-list">
            {units.data?.map((unit) => (
              <div key={unit.id} className="unit-chip">
                <span>
                  <Ruler size={15} /> {unit.name}
                </span>
                <button className="icon-button danger-icon" title={tr("Birlikni o'chirish", "Удалить единицу")} onClick={() => setDeletingUnit(unit)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Modal
        open={Boolean(editingUser)}
        title={tr("Foydalanuvchini tahrirlash", "Редактирование пользователя")}
        onClose={() => setEditingUser(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingUser(null)}>
              {tr("Bekor qilish", "Отмена")}
            </Button>
            <Button
              loading={updateUser.isPending}
              disabled={editName.trim().length < 2 || !editEmail.trim()}
              onClick={() => updateUser.mutate()}
            >
              <Save size={16} /> {tr("Saqlash", "Сохранить")}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Input label={tr("To'liq ism", "Полное имя")} value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Input label="Email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
          <Select label={tr("Rol", "Роль")} value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)}>
            <option value="SELLER">{tr("Sotuvchi", "Продавец")}</option>
            <option value="ADMIN">{tr("Administrator", "Администратор")}</option>
          </Select>
          <Select label={tr("Holat", "Статус")} value={editIsActive ? "active" : "inactive"} onChange={(e) => setEditIsActive(e.target.value === "active")}>
            <option value="active">{tr("Faol", "Активен")}</option>
            <option value="inactive">{tr("Nofaol", "Неактивен")}</option>
          </Select>
        </div>
      </Modal>

      <Modal
        open={Boolean(resetPasswordUser)}
        title={tr("Parolni yangilash", "Сброс пароля")}
        onClose={() => {
          setResetPasswordUser(null);
          setResetPassword("");
          setResetPasswordConfirm("");
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setResetPasswordUser(null);
                setResetPassword("");
                setResetPasswordConfirm("");
              }}
            >
              {tr("Bekor qilish", "Отмена")}
            </Button>
            <Button loading={resetUserPassword.isPending} disabled={!resetPasswordValid} onClick={() => resetUserPassword.mutate()}>
              <Save size={16} /> {tr("Parolni saqlash", "Сохранить пароль")}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Input
            label={tr("Yangi parol", "Новый пароль")}
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
          />
          <Input
            label={tr("Parolni tasdiqlang", "Подтвердите пароль")}
            type="password"
            value={resetPasswordConfirm}
            onChange={(e) => setResetPasswordConfirm(e.target.value)}
          />
          <div className="password-rules">
            <span className={passwordStrong(resetPassword) ? "positive" : ""}>
              {tr("8+ belgi, katta-kichik harf va raqam", "8+ символов, буквы разного регистра и цифра")}
            </span>
            <span className={resetPassword === resetPasswordConfirm && resetPassword.length > 0 ? "positive" : ""}>
              {tr("Tasdiq mos bo'lishi kerak", "Подтверждение должно совпадать")}
            </span>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(statusUser)}
        title={statusUser?.is_active ? tr("Foydalanuvchini o'chirish", "Деактивировать пользователя") : tr("Foydalanuvchini faollashtirish", "Активировать пользователя")}
        message={
          statusUser?.is_active
            ? tr(
                `“${statusUser?.name ?? ""}” foydalanuvchisini nofaol qilasizmi?`,
                `Деактивировать пользователя «${statusUser?.name ?? ""}»?`
              )
            : tr(
                `“${statusUser?.name ?? ""}” foydalanuvchisini faollashtirasizmi?`,
                `Активировать пользователя «${statusUser?.name ?? ""}»?`
              )
        }
        loading={toggleStatus.isPending}
        onCancel={() => setStatusUser(null)}
        onConfirm={() => statusUser && toggleStatus.mutate(statusUser)}
      />

      <ConfirmDialog
        open={Boolean(deletingUser)}
        title={tr("Foydalanuvchini o'chirish", "Удаление пользователя")}
        message={tr(
          `“${deletingUser?.name ?? ""}” foydalanuvchisini butunlay o'chirasizmi? Bog'langan yozuvlar bo'lsa backend o'chirishni bloklaydi.`,
          `Удалить пользователя «${deletingUser?.name ?? ""}» полностью? Если есть связанные записи, backend заблокирует удаление.`
        )}
        loading={deleteUser.isPending}
        onCancel={() => setDeletingUser(null)}
        onConfirm={() => deletingUser && deleteUser.mutate(deletingUser.id)}
      />

      <ConfirmDialog
        open={Boolean(deletingUnit)}
        title={tr("Birlikni olib tashlash", "Удаление единицы")}
        message={tr(
          `“${deletingUnit?.name ?? ""}” birligini ro'yxatdan olib tashlaysizmi? Faol mahsulot yoki sotuvda ishlatilayotgan bo'lsa o'chirish bloklanadi.`,
          `Удалить единицу «${deletingUnit?.name ?? ""}»? Если она используется в товарах или продажах, удаление будет заблокировано.`
        )}
        loading={removeUnit.isPending}
        onCancel={() => setDeletingUnit(null)}
        onConfirm={() => deletingUnit && removeUnit.mutate(deletingUnit.id)}
      />
    </>
  );
}
