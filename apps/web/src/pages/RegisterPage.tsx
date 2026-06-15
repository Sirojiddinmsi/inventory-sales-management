import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "../components/ui";
import { LanguageSwitch, useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";

const schema = z.object({
  name: z.string().trim().min(2, "Ism kamida 2 ta belgidan iborat bo‘lsin"),
  email: z.email("Email manzil noto‘g‘ri"),
  password: z.string().min(8, "Parol kamida 8 ta belgidan iborat bo‘lsin"),
  confirmPassword: z.string()
}).refine((value) => value.password === value.confirmPassword, {
  message: "Parollar bir xil emas",
  path: ["confirmPassword"]
});

type RegisterForm = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { tr } = useI18n();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  const submit = async (values: RegisterForm) => {
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
          role: "ADMIN"
        })
      });
      toast.success("Admin yaratildi. Endi tizimga kiring.");
      navigate("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ro‘yxatdan o‘tishda xatolik");
    }
  };

  return (
    <div className="login-page register-page">
      <section className="login-visual">
        <div className="login-brand">
          <span><Boxes size={29} /></span>
          <div><strong>Inventory & Sales</strong><small>Management System</small></div>
        </div>
        <div className="login-message">
          <span className="eyebrow">{tr("BIRINCHI SOZLASH", "ПЕРВАЯ НАСТРОЙКА")}</span>
          <h1>{tr("Tizim administratorini yarating.", "Создайте администратора системы.")}</h1>
          <p>
            {tr(
              "Bu sahifa faqat bazada foydalanuvchi bo‘lmaganda ishlaydi. Keyingi xodimlar Sozlamalar bo‘limidan qo‘shiladi.",
              "Эта страница доступна, пока в базе нет пользователей. Следующие сотрудники добавляются в настройках."
            )}
          </p>
        </div>
        <div className="login-grid" />
      </section>
      <section className="login-form-side">
        <form className="login-form" onSubmit={handleSubmit(submit)}>
          <div className="login-language"><LanguageSwitch /></div>
          <div className="login-mobile-brand"><Boxes size={25} /><strong>Inventory & Sales</strong></div>
          <span className="eyebrow">{tr("ADMIN HISOBI", "УЧЕТНАЯ ЗАПИСЬ АДМИНА")}</span>
          <h2>{tr("Ro‘yxatdan o‘tish", "Регистрация")}</h2>
          <p>{tr("Birinchi administrator ma’lumotlarini kiriting.", "Введите данные первого администратора.")}</p>

          <label className="field">
            <span className="field-label">{tr("To‘liq ism", "Полное имя")}</span>
            <div className={`input-with-icon ${errors.name ? "input-error" : ""}`}>
              <UserRound size={18} /><input placeholder="Admin ismi" {...register("name")} />
            </div>
            {errors.name && <span className="field-error">{errors.name.message}</span>}
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <div className={`input-with-icon ${errors.email ? "input-error" : ""}`}>
              <Mail size={18} /><input type="email" placeholder="admin@example.com" {...register("email")} />
            </div>
            {errors.email && <span className="field-error">{errors.email.message}</span>}
          </label>
          <label className="field">
            <span className="field-label">{tr("Parol", "Пароль")}</span>
            <div className={`input-with-icon ${errors.password ? "input-error" : ""}`}>
              <LockKeyhole size={18} /><input type="password" {...register("password")} />
            </div>
            {errors.password && <span className="field-error">{errors.password.message}</span>}
          </label>
          <label className="field">
            <span className="field-label">{tr("Parolni takrorlang", "Повторите пароль")}</span>
            <div className={`input-with-icon ${errors.confirmPassword ? "input-error" : ""}`}>
              <LockKeyhole size={18} /><input type="password" {...register("confirmPassword")} />
            </div>
            {errors.confirmPassword && <span className="field-error">{errors.confirmPassword.message}</span>}
          </label>
          <Button type="submit" loading={isSubmitting} className="login-submit">{tr("Admin yaratish", "Создать администратора")}</Button>
          <div className="auth-switch">{tr("Hisob mavjudmi?", "Уже есть учетная запись?")} <Link to="/login">{tr("Kirish", "Войти")}</Link></div>
        </form>
      </section>
    </div>
  );
}
