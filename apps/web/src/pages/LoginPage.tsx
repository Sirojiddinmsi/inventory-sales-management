import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { LanguageSwitch, useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";

const schema = z.object({
  email: z.email("Email manzil noto'g'ri"),
  password: z.string().min(8, "Parol kamida 8 ta belgidan iborat bo'lsin")
});

type LoginForm = z.infer<typeof schema>;
type SetupStatus = { hasUsers: boolean; registrationOpen: boolean };

export function LoginPage() {
  const { login, user } = useAuth();
  const { tr } = useI18n();
  const [showPassword, setShowPassword] = useState(false);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginForm>({
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    let active = true;
    api<SetupStatus>("/auth/setup-status")
      .then((response) => {
        if (active) setSetupStatus(response);
      })
      .catch(() => {
        if (active) setSetupStatus({ hasUsers: true, registrationOpen: false });
      });
    return () => {
      active = false;
    };
  }, []);

  if (user) return <Navigate to="/" replace />;

  const submit = async (values: LoginForm) => {
    try {
      await login(values.email, values.password);
      toast.success(tr("Tizimga muvaffaqiyatli kirdingiz", "Вы успешно вошли в систему"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Kirishda xatolik", "Ошибка входа"));
    }
  };

  return (
    <div className="login-page">
      <section className="login-visual">
        <div className="login-brand">
          <span><Boxes size={29} /></span>
          <div>
            <strong>Tikuv Market</strong>
            <small>{tr("Boshqaruv paneli", "Панель управления")}</small>
          </div>
        </div>
        <div className="login-message">
          <span className="eyebrow">{tr("BIZNES NAZORATI", "КОНТРОЛЬ БИЗНЕСА")}</span>
          <h1>{tr("Ombordan foydagacha — hammasi bir joyda.", "От склада до прибыли — всё в одном месте.")}</h1>
          <p>
            {tr(
              "Mahsulot qoldig'i, sotuv, qarz va xarajatlarni aniq boshqaring. Qarorlarni real ko'rsatkichlar asosida qabul qiling.",
              "Управляйте остатками, продажами, долгами и расходами. Принимайте решения на основе реальных показателей."
            )}
          </p>
          <div className="login-metrics">
            <div><strong>24/7</strong><span>{tr("Real vaqtda nazorat", "Контроль в реальном времени")}</span></div>
            <div><strong>100%</strong><span>{tr("Qoldiq aniqligi", "Точный учет склада")}</span></div>
            <div><strong>1 panel</strong><span>{tr("Barcha jarayonlar", "Все процессы")}</span></div>
          </div>
        </div>
        <div className="login-grid" />
      </section>

      <section className="login-form-side">
        <form className="login-form" onSubmit={handleSubmit(submit)}>
          <div className="login-language"><LanguageSwitch /></div>
          <div className="login-mobile-brand">
            <Boxes size={25} />
            <strong>Tikuv Market</strong>
          </div>
          <span className="eyebrow">{tr("XUSH KELIBSIZ", "ДОБРО ПОЖАЛОВАТЬ")}</span>
          <h2>{tr("Tizimga kirish", "Вход в систему")}</h2>
          <p>{tr("Hisobingiz ma'lumotlarini kiriting.", "Введите данные учетной записи.")}</p>

          <label className="field">
            <span className="field-label">{tr("Email manzil", "Электронная почта")}</span>
            <div className={`input-with-icon ${errors.email ? "input-error" : ""}`}>
              <Mail size={18} />
              <input type="email" placeholder="name@example.com" autoComplete="email" {...register("email")} />
            </div>
            {errors.email && <span className="field-error">{errors.email.message}</span>}
          </label>

          <label className="field">
            <span className="field-label">{tr("Parol", "Пароль")}</span>
            <div className={`input-with-icon ${errors.password ? "input-error" : ""}`}>
              <LockKeyhole size={18} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                {...register("password")}
              />
              <button
                type="button"
                aria-label={showPassword ? tr("Parolni yashirish", "Скрыть пароль") : tr("Parolni ko'rsatish", "Показать пароль")}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <span className="field-error">{errors.password.message}</span>}
          </label>

          <Button type="submit" loading={isSubmitting} className="login-submit">
            {tr("Tizimga kirish", "Войти")}
          </Button>
          {setupStatus?.registrationOpen && (
            <div className="auth-switch">
              {tr("Birinchi marta ishlatyapsizmi?", "Первый запуск?")} <Link to="/register">{tr("Admin yaratish", "Создать администратора")}</Link>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
