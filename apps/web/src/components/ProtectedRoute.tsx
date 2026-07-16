import { LoaderCircle, ShieldAlert } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import type { UserRole } from "../types/api";

type ProtectedRouteProps = {
  children: React.ReactNode;
  roles?: UserRole[];
};

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const { tr } = useI18n();

  if (isLoading) {
    return <div className="full-loader"><LoaderCircle className="spin" size={30} /></div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  if (roles?.length && !roles.includes(user.role)) {
    return (
      <div className="forbidden-page" role="alert">
        <div className="forbidden-card">
          <ShieldAlert size={34} />
          <h1>403</h1>
          <h2>{tr("Ruxsat yo'q", "Нет доступа")}</h2>
          <p>{tr("Bu bo'limdan foydalanish uchun administrator huquqi kerak.", "Для доступа к этому разделу нужны права администратора.")}</p>
          <Link className="button-link" to="/">{tr("Bosh sahifaga qaytish", "Вернуться на главную")}</Link>
        </div>
      </div>
    );
  }

  return children;
}
