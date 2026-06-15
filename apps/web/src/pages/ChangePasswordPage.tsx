import { useMutation } from "@tanstack/react-query";
import { KeyRound, Save } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Input, PageHeader } from "../components/ui";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";

function passwordStrength(password: string) {
  return {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password)
  };
}

export function ChangePasswordPage() {
  const { tr } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const checks = useMemo(() => passwordStrength(newPassword), [newPassword]);
  const isStrong = Object.values(checks).every(Boolean);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  const changePassword = useMutation({
    mutationFn: () =>
      api<{ success: true }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword
        })
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(tr("Parol yangilandi", "Пароль обновлен"));
    },
    onError: (error) => toast.error(error.message)
  });

  return (
    <>
      <PageHeader
        title={tr("Parolni almashtirish", "Смена пароля")}
        description={tr(
          "Yangi parol uchun joriy parolni tasdiqlang.",
          "Подтвердите текущий пароль перед установкой нового."
        )}
      />

      <Card title={tr("Xavfsizlik", "Безопасность")} className="profile-settings-card">
        <div className="profile-settings">
          <div className="inline-note">
            <KeyRound size={16} />
            {tr(
              "Parol kamida 8 ta belgi, katta-kichik harf va raqamdan iborat bo'lishi kerak.",
              "Пароль должен содержать не менее 8 символов, заглавную и строчную букву, а также цифру."
            )}
          </div>

          <Input
            label={tr("Joriy parol", "Текущий пароль")}
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <Input
            label={tr("Yangi parol", "Новый пароль")}
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <Input
            label={tr("Yangi parolni tasdiqlang", "Подтвердите новый пароль")}
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          <div className="password-rules">
            <span className={checks.length ? "positive" : ""}>{tr("Kamida 8 belgi", "Минимум 8 символов")}</span>
            <span className={checks.lower ? "positive" : ""}>{tr("Kichik harf", "Строчная буква")}</span>
            <span className={checks.upper ? "positive" : ""}>{tr("Katta harf", "Заглавная буква")}</span>
            <span className={checks.number ? "positive" : ""}>{tr("Raqam", "Цифра")}</span>
            <span className={matches ? "positive" : ""}>{tr("Tasdiq mos", "Подтверждение совпадает")}</span>
          </div>

          <Button
            loading={changePassword.isPending}
            disabled={!currentPassword || !isStrong || !matches}
            onClick={() => changePassword.mutate()}
          >
            <Save size={16} /> {tr("Parolni saqlash", "Сохранить пароль")}
          </Button>
        </div>
      </Card>
    </>
  );
}
