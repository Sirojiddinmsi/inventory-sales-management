import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  CalendarDays,
  Calculator,
  Download,
  Printer,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { format, startOfMonth, startOfWeek } from "date-fns";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Button, Card, DataTable, Input, PageHeader, Select, StatCard } from "../components/ui";
import { useI18n } from "../contexts/I18nContext";
import { api, download } from "../lib/api";
import { date, money, number, toIsoEndOfDay, toIsoFromDateInput } from "../lib/format";
import type { ReportData } from "../types/api";

export function ReportsPage() {
  const { tr } = useI18n();
  const current = new Date();
  const [from, setFrom] = useState(new Date(current.getFullYear(), current.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(current.toISOString().slice(0, 10));
  const [paymentType, setPaymentType] = useState("");
  const params = {
    from: toIsoFromDateInput(from),
    to: toIsoEndOfDay(to),
    paymentType: paymentType || undefined
  };
  const reports = useQuery({
    queryKey: ["reports", from, to, paymentType],
    queryFn: () => api<ReportData>("/reports", { params })
  });
  const report = reports.data;

  const exportExcel = async () => {
    try {
      await download("/reports/export.xlsx", `hisobot-${from}-${to}.xlsx`, params);
      toast.success("Excel hisobot yuklandi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export xatosi");
    }
  };

  const setPeriod = (period: "week" | "month") => {
    const start = period === "week"
      ? startOfWeek(current, { weekStartsOn: 1 })
      : startOfMonth(current);
    setFrom(format(start, "yyyy-MM-dd"));
    setTo(format(current, "yyyy-MM-dd"));
  };

  return (
    <>
      <PageHeader
        title={tr("Hisobotlar", "Отчеты")}
        description={tr("Savdo, foyda va xarajatlarni tanlangan davr bo‘yicha tahlil qiling.", "Анализируйте продажи, прибыль и расходы за выбранный период.")}
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={17} /> {tr("Chop etish", "Печать")}
            </Button>
            <Button onClick={() => void exportExcel()}>
              <Download size={17} /> {tr("Excel export", "Экспорт Excel")}
            </Button>
          </>
        }
      />
      <Card className="report-filters">
        <Input label={tr("Boshlanish sanasi", "Дата начала")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label={tr("Tugash sanasi", "Дата окончания")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select label={tr("To‘lov turi", "Вид оплаты")} value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
          <option value="">{tr("Barchasi", "Все")}</option>
          <option value="CASH">{tr("Naqd", "Наличные")}</option>
          <option value="CARD">{tr("Plastik", "Карта")}</option>
          <option value="DEBT">{tr("Qarz", "В долг")}</option>
          <option value="TRANSFER">{tr("Bank o‘tkazmasi", "Перевод")}</option>
          <option value="MIXED">{tr("Aralash", "Смешанная")}</option>
        </Select>
        <div className="report-period-actions">
          <Button variant="secondary" onClick={() => setPeriod("week")}>
            <CalendarDays size={16} /> {tr("Bu hafta", "Эта неделя")}
          </Button>
          <Button variant="secondary" onClick={() => setPeriod("month")}>
            <CalendarDays size={16} /> {tr("Bu oy", "Этот месяц")}
          </Button>
        </div>
      </Card>

      <div className="stats-grid report-stats">
        <StatCard label={tr("Jami sotuv", "Общие продажи")} value={money(report?.summary.total_sales)} hint={`${report?.summary.sale_count ?? 0} ${tr("ta sotuv", "продаж")}`} icon={Banknote} tone="blue" />
        <StatCard label={tr("FIFO tannarx", "FIFO-себестоимость")} value={money(report?.summary.total_fifo_cost)} hint={`${report?.summary.products_sold_count ?? 0} ${tr("xil mahsulot", "товаров")}`} icon={Calculator} tone="orange" />
        <StatCard label={tr("Yalpi foyda", "Валовая прибыль")} value={money(report?.summary.total_profit)} icon={TrendingUp} tone="green" />
        <StatCard label={tr("Topshiriladigan summa", "Сумма к сдаче")} value={money(report?.summary.amount_to_submit)} hint={tr("Tanlangan davrdagi FIFO tannarx", "FIFO-себестоимость за период")} icon={WalletCards} tone="purple" />
        <StatCard label={tr("Xarajatlar", "Расходы")} value={money(report?.summary.total_expenses)} icon={TrendingDown} tone="orange" />
        <StatCard label={tr("Sof foyda", "Чистая прибыль")} value={money(report?.summary.net_profit)} icon={WalletCards} tone={(report?.summary.net_profit ?? 0) >= 0 ? "purple" : "red"} />
      </div>

      <div className="dashboard-grid">
        <Card title={tr("Kunlik sotuv va foyda", "Продажи и прибыль по дням")} className="chart-card report-chart">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={report?.daily ?? []} margin={{ top: 20, right: 20, left: -5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={(value) => date(value, "dd.MM")} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(value) => date(String(value))} formatter={(value) => money(Number(value))} />
              <Legend />
              <Line type="monotone" dataKey="total_sales" name="Sotuv" stroke="#2563eb" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="fifo_cost" name="FIFO tannarx" stroke="#d97706" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="profit" name="Foyda" stroke="#16a34a" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title={tr("To‘lov turlari", "Виды оплаты")} className="chart-card report-chart">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={report?.by_payment_type.map((item) => ({
              ...item,
              label: item.payment_type === "CASH"
                ? tr("Naqd", "Наличные")
                : item.payment_type === "CARD"
                  ? tr("Plastik", "Карта")
                  : item.payment_type === "DEBT"
                    ? tr("Qarz", "В долг")
                    : item.payment_type === "TRANSFER"
                      ? tr("Bank o‘tkazmasi", "Перевод")
                      : tr("Aralash", "Смешанная")
            })) ?? []} margin={{ top: 20, right: 20, left: -5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => money(Number(value))} />
              <Bar dataKey="total_sales" name="Sotuv" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title={tr("Mahsulotlar bo‘yicha natija", "Результаты по товарам")}>
        <DataTable loading={reports.isLoading} empty={!report?.by_product.length} minWidth={840}>
          <thead><tr><th>{tr("Mahsulot", "Товар")}</th><th>{tr("Sotilgan miqdor", "Продано")}</th><th>{tr("Sotuv summasi", "Сумма продаж")}</th><th>{tr("FIFO tannarx", "FIFO-себестоимость")}</th><th>{tr("Foyda", "Прибыль")}</th></tr></thead>
          <tbody>
            {report?.by_product.map((item) => (
              <tr key={item.product_id}>
                <td data-label={tr("Mahsulot", "Товар")}>
                  <div className="product-cell">
                    <span className="product-avatar"><ReceiptText size={17} /></span>
                    <div><strong>{item.name}</strong></div>
                  </div>
                </td>
                <td data-label={tr("Sotilgan miqdor", "Продано")}>{number(item.quantity)}</td>
                <td data-label={tr("Sotuv summasi", "Сумма продаж")}><strong>{money(item.total_sales)}</strong></td>
                <td data-label={tr("FIFO tannarx", "FIFO-себестоимость")}>{money(item.fifo_cost)}</td>
                <td data-label={tr("Foyda", "Прибыль")} className={item.profit >= 0 ? "positive" : "negative"}>{money(item.profit)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
