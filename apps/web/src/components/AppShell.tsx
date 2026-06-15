import {
  BarChart3,
  Boxes,
  ChevronDown,
  ClipboardList,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  ReceiptText,
  Settings,
  ShoppingCart,
  Tags,
  UserCircle2,
  WalletCards,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LanguageSwitch, useI18n } from "../contexts/I18nContext";

const navigation = [
  { to: "/", uz: "Bosh sahifa", ru: "Главная", icon: LayoutDashboard },
  { to: "/products", uz: "Mahsulotlar", ru: "Товары", icon: Boxes },
  { to: "/categories", uz: "Kategoriyalar", ru: "Категории", icon: Tags, adminOnly: true },
  { to: "/purchases", uz: "Kirim", ru: "Приход", icon: PackagePlus },
  { to: "/sales", uz: "Sotuv", ru: "Продажи", icon: ShoppingCart },
  { to: "/debts", uz: "Qarzlar", ru: "Долги", icon: CreditCard },
  { to: "/expenses", uz: "Xarajatlar", ru: "Расходы", icon: WalletCards },
  { to: "/reports", uz: "Hisobotlar", ru: "Отчеты", icon: BarChart3 },
  { to: "/settings", uz: "Sozlamalar", ru: "Настройки", icon: Settings, adminOnly: true }
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { tr } = useI18n();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    setProfileOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      {mobileOpen && <button className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <ClipboardList size={24} />
          </span>
          <div>
            <strong>Inventory</strong>
            <small>Sales Management</small>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-label">{tr("Boshqaruv", "Управление")}</span>
          {navigation
            .filter((item) => !item.adminOnly || user?.role === "ADMIN")
            .map(({ to, uz, ru, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={19} />
                <span>{tr(uz, ru)}</span>
              </NavLink>
            ))}
        </nav>

        <div className="sidebar-foot">
          <ReceiptText size={18} />
          <div>
            <strong>UZS</strong>
            <small>{tr("Asosiy valyuta", "Основная валюта")}</small>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="topbar-title">
            <strong>{tr("Ombor va sotuv boshqaruvi", "Управление складом и продажами")}</strong>
            <span>{tr("Bugungi jarayonlarni nazorat qiling", "Контролируйте текущие операции")}</span>
          </div>
          <div className="topbar-actions">
            <div className="profile">
              <button className="profile-button" onClick={() => setProfileOpen((value) => !value)}>
                <span className="avatar">
                  {user?.profile_image_url ? (
                    <img src={user.profile_image_url} alt={user.name} />
                  ) : (
                    user?.name?.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="profile-copy">
                  <strong>{user?.name}</strong>
                  <small>{user?.role === "ADMIN" ? tr("Administrator", "Администратор") : tr("Sotuvchi", "Продавец")}</small>
                </span>
                <ChevronDown size={16} />
              </button>
              {profileOpen && (
                <div className="profile-menu">
                  <div>
                    <strong>{user?.email}</strong>
                    <span>{user?.role}</span>
                  </div>
                  <Link to="/profile" className="profile-menu-link">
                    <UserCircle2 size={17} /> {tr("Mening profilim", "Мой профиль")}
                  </Link>
                  <Link to="/change-password" className="profile-menu-link">
                    <KeyRound size={17} /> {tr("Parolni almashtirish", "Сменить пароль")}
                  </Link>
                  <button onClick={logout}>
                    <LogOut size={17} /> {tr("Chiqish", "Выйти")}
                  </button>
                </div>
              )}
            </div>
            <LanguageSwitch compact />
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
