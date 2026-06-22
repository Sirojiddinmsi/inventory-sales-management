import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  Calculator,
  CreditCard,
  PackagePlus,
  ShoppingBag,
  TrendingUp
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Badge, Card, DataTable, PageHeader, StatCard } from "../components/ui";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import { money, number } from "../lib/format";
import type { DashboardData, FinancePaymentMethod } from "../types/api";

const paymentColors: Record<FinancePaymentMethod, string> = {
  CASH: "#2563eb",
  CARD: "#8b5cf6",
  DEBT: "#f59e0b",
  TRANSFER: "#0f766e",
  MIXED: "#64748b"
};

export function DashboardPage() {
  const { tr } = useI18n();
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/dashboard")
  });
  const data = dashboard.data;
  const paymentLabel = (type: FinancePaymentMethod) =>
    type === "CASH"
      ? tr("Naqd", "Наличные")
      : type === "CARD"
        ? tr("Plastik", "Карта")
        : type === "DEBT"
          ? tr("Qarz", "В долг")
          : type === "TRANSFER"
            ? tr("Bank o‘tkazmasi", "Перевод")
            : tr("Aralash", "Смешанная");
  const payments = (["CASH", "CARD", "DEBT", "TRANSFER", "MIXED"] as FinancePaymentMethod[]).map((type) => {
    const item = data?.payment_stats.find((stat) => stat.payment_type === type);
    return {
      type,
      name: paymentLabel(type),
      amount: Number(item?.amount ?? 0),
      count: item?.sale_count ?? 0
    };
  }).filter((item) => item.amount > 0 || item.count > 0);

  return (
    <>
      <PageHeader
        title={tr("Bosh sahifa", "Главная")}
        description={tr("Bugungi savdo va ombor holatining umumiy ko‘rinishi.", "Обзор сегодняшних продаж и состояния склада.")}
      />

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-eyebrow">{tr("OMBOR VA SOTUV NAZORATI", "КОНТРОЛЬ СКЛАДА И ПРОДАЖ")}</span>
          <h2>{tr("Barcha jarayonlar bitta boshqaruv panelida.", "Все процессы в одной панели управления.")}</h2>
          <p>
            {tr("Mahsulot qoldig‘i, sotuvlar, qaytarishlar va qarzlarni real vaqtda boshqaring.", "Управляйте остатками, продажами, возвратами и долгами в реальном времени.")}
          </p>
          <div className="dashboard-hero-actions">
            <Link className="button button-primary button-md" to="/sales">
              <ShoppingBag size={16} /> {tr("Yangi sotuv", "Новая продажа")} <ArrowRight size={15} />
            </Link>
            <Link className="button dashboard-hero-secondary button-md" to="/products">
              <PackagePlus size={16} /> {tr("Mahsulotlar", "Товары")}
            </Link>
          </div>
        </div>
      </section>

      <div className="stats-grid">
        <StatCard
          label={tr("Bugungi sotuv", "Продажи сегодня")}
          value={money(data?.today_sales)}
          hint={tr("Jami savdo aylanmasi", "Общий оборот")}
          icon={ShoppingBag}
          tone="blue"
        />
        <StatCard
          label={tr("Bugungi foyda", "Прибыль сегодня")}
          value={money(data?.today_profit)}
          hint={`${tr("Xarajat", "Расходы")}: ${money(data?.today_expenses)}`}
          icon={TrendingUp}
          tone="green"
        />
        <StatCard
          label={tr("Ombordagi mahsulot", "Товаров на складе")}
          value={number(data?.total_stock_quantity)}
          hint={`${data?.low_stock_count ?? 0} ${tr("ta mahsulot kam qolgan", "товаров заканчиваются")}`}
          icon={Boxes}
          tone="purple"
        />
        <StatCard
          label={tr("Jami qarzdorlik", "Общая задолженность")}
          value={money(data?.outstanding_debt)}
          hint={tr("Yopilmagan qarzlar", "Непогашенные долги")}
          icon={CreditCard}
          tone="orange"
        />
      </div>

      <Card
        title={tr("Haftalik hisob-kitob", "Недельный расчет")}
        className="weekly-settlement-card"
      >
        <div className="stats-grid weekly-settlement-grid">
          <StatCard
            label={tr("Bu hafta sotuv", "Продажи за неделю")}
            value={money(data?.week_sales)}
            icon={ShoppingBag}
            tone="blue"
          />
          <StatCard
            label={tr("Bu hafta FIFO tannarx", "FIFO-себестоимость за неделю")}
            value={money(data?.week_fifo_cost)}
            icon={Calculator}
            tone="orange"
          />
          <StatCard
            label={tr("Bu hafta foyda", "Прибыль за неделю")}
            value={money(data?.week_profit)}
            icon={TrendingUp}
            tone="green"
          />
          <StatCard
            label={tr("Topshiriladigan summa", "Сумма к сдаче")}
            value={money(data?.amount_to_submit)}
            hint={tr("FIFO tannarx minus yetkazib beruvchi qaytarishi", "FIFO-себестоимость минус возврат поставщику")}
            icon={Banknote}
            tone="purple"
          />
        </div>
      </Card>

      <div className="dashboard-grid">
        <Card title={tr("To‘lov turlari", "Виды оплаты")} className="chart-card">
          <div className="chart-layout">
            <div className="pie-chart">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={payments}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={63}
                    outerRadius={88}
                    paddingAngle={4}
                  >
                    {payments.map((entry) => (
                      <Cell key={entry.type} fill={paymentColors[entry.type]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => money(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-center">
                <small>{tr("Jami", "Итого")}</small>
                <strong>{money(payments.reduce((sum, item) => sum + item.amount, 0))}</strong>
              </div>
            </div>
            <div className="chart-legend">
              {payments.map((item) => (
                <div key={item.type}>
                  <i style={{ background: paymentColors[item.type] }} />
                  <span>{item.name}<small>{item.count} {tr("ta sotuv", "продаж")}</small></span>
                  <strong>{money(item.amount)}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title={tr("Bugungi moliyaviy holat", "Финансы за сегодня")} className="chart-card">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={[
                { name: tr("Sotuv", "Продажи"), amount: Number(data?.today_sales ?? 0) },
                { name: tr("Foyda", "Прибыль"), amount: Number(data?.today_profit ?? 0) },
                { name: tr("Xarajat", "Расходы"), amount: Number(data?.today_expenses ?? 0) }
              ]}
              margin={{ top: 16, right: 8, bottom: 0, left: -10 }}
            >
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${Math.round(value / 1000)}k`}
              />
              <Tooltip formatter={(value) => money(Number(value))} cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey="amount" fill="#2563eb" radius={[7, 7, 0, 0]} maxBarSize={64} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card
        title={tr("Kam qolgan mahsulotlar", "Товары с низким остатком")}
        actions={
          <Badge tone={(data?.low_stock_count ?? 0) > 0 ? "warning" : "success"}>
            {data?.low_stock_count ?? 0} ta
          </Badge>
        }
      >
        <DataTable
          loading={dashboard.isLoading}
          empty={!data?.low_stock_products.length}
          minWidth={680}
        >
          <thead>
            <tr>
              <th>{tr("Mahsulot", "Товар")}</th>
              <th>{tr("Kategoriya", "Категория")}</th>
              <th>{tr("Qoldiq", "Остаток")}</th>
              <th>{tr("Minimal", "Минимум")}</th>
              <th>{tr("Holat", "Статус")}</th>
            </tr>
          </thead>
          <tbody>
            {data?.low_stock_products.map((product) => (
              <tr key={product.id}>
                <td data-label={tr("Mahsulot", "Товар")}>
                  <div className="product-cell">
                    <span className="product-avatar"><Boxes size={18} /></span>
                    <div><strong>{product.name}</strong></div>
                  </div>
                </td>
                <td data-label={tr("Kategoriya", "Категория")}>{product.category_name}</td>
                <td data-label={tr("Qoldiq", "Остаток")}><strong>{number(product.stock_quantity)} {product.unit}</strong></td>
                <td data-label={tr("Minimal", "Минимум")}>{number(product.minimum_stock)} {product.unit}</td>
                <td data-label={tr("Holat", "Статус")}>
                  <Badge tone="warning"><AlertTriangle size={13} /> {tr("Kam qolgan", "Мало")}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
