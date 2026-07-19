import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  CalendarDays,
  Calculator,
  CreditCard,
  Download,
  HandCoins,
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
import { Badge, Button, Card, DataTable, Input, PageHeader, Select, StatCard } from "../components/ui";
import { useI18n } from "../contexts/I18nContext";
import { api, download } from "../lib/api";
import { calculateCashReport } from "../lib/cash-report";
import { date, money, number, toIsoEndOfDay, toIsoFromDateInput } from "../lib/format";
import type { FinancePaymentMethod, ReportData } from "../types/api";

const cashMethodColors: Record<FinancePaymentMethod, string> = {
  CASH: "#2563eb",
  CARD: "#8b5cf6",
  DEBT: "#f59e0b",
  TRANSFER: "#0f766e",
  MIXED: "#64748b"
};

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
    queryFn: async () => {
      try {
        return await api<ReportData>("/reports", { params });
      } catch (error) {
        console.error("Reports request failed", error);
        throw error;
      }
    }
  });
  const report = reports.data;
  const salePaymentsForCash = paymentType
    ? (report?.by_payment_type.filter((item) => item.payment_type === paymentType) ?? [])
    : (report?.by_payment_type ?? []);
  const debtPaymentsForCash = paymentType === "DEBT" ? [] : (report?.debt_payments ?? []);
  const cashReport = calculateCashReport(salePaymentsForCash, debtPaymentsForCash);
  const cashMethods = (["CASH", "CARD", "TRANSFER", "MIXED"] as FinancePaymentMethod[])
    .filter((method) => !paymentType || paymentType === method)
    .map((method) => {
      const sale = salePaymentsForCash.find((item) => item.payment_type === method);
      const debt = debtPaymentsForCash.find((item) => item.payment_method === method);
      return {
        method,
        saleAmount: Number(sale?.total_sales ?? 0),
        debtAmount: Number(debt?.total_amount ?? 0),
        totalAmount: Number(sale?.total_sales ?? 0) + Number(debt?.total_amount ?? 0),
        saleCount: sale?.sale_count ?? 0,
        debtPaymentCount: debt?.payment_count ?? 0
      };
    });
  const cashMethodLabel = (method: FinancePaymentMethod) =>
    method === "CASH"
      ? tr("Naqd", "Наличные")
      : method === "CARD"
        ? tr("Plastik", "Карта")
        : method === "TRANSFER"
          ? tr("Bank o‘tkazmasi", "Перевод")
          : tr("Aralash", "Смешанная оплата");

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

      {reports.isError ? (
        <Card className="empty-state">
          <strong>{tr("Hisobotlarni yuklab bo‘lmadi", "Не удалось загрузить отчеты")}</strong>
          <p>{reports.error instanceof Error ? reports.error.message : tr("Server xatoligi yuz berdi.", "Произошла ошибка сервера.")}</p>
        </Card>
      ) : null}

      {!reports.isError ? (
        <>
      <div className="stats-grid report-stats">
        <StatCard label={tr("Jami sotuv", "Общие продажи")} value={money(report?.summary.total_sales)} hint={`${report?.summary.sale_count ?? 0} ${tr("ta sotuv", "продаж")}`} icon={Banknote} tone="blue" />
        <StatCard label={tr("FIFO tannarx", "FIFO-себестоимость")} value={money(report?.summary.total_fifo_cost)} hint={`${report?.summary.products_sold_count ?? 0} ${tr("xil mahsulot", "товаров")}`} icon={Calculator} tone="orange" />
        <StatCard label={tr("Yalpi foyda", "Валовая прибыль")} value={money(report?.summary.total_profit)} icon={TrendingUp} tone="green" />
        <StatCard label={tr("Topshiriladigan summa", "Сумма к сдаче")} value={money(report?.summary.amount_to_submit)} hint={tr("FIFO tannarx minus yetkazib beruvchi qaytarishi", "FIFO-себестоимость минус возврат поставщику")} icon={WalletCards} tone="purple" />
        <StatCard label={tr("Xarajatlar", "Расходы")} value={money(report?.summary.total_expenses)} icon={TrendingDown} tone="orange" />
        <StatCard label={tr("Sof foyda", "Чистая прибыль")} value={money(report?.summary.net_profit)} icon={WalletCards} tone={(report?.summary.net_profit ?? 0) >= 0 ? "purple" : "red"} />
      </div>

      <Card
        title={tr("Kassa tushumlari", "Поступления в кассу")}
        actions={
          <Badge tone="info">
            {from === to ? date(`${from}T00:00:00`) : `${date(`${from}T00:00:00`)} - ${date(`${to}T00:00:00`)}`}
          </Badge>
        }
        className="report-cash-card"
      >
        <p className="report-cash-description">
          {tr(
            "Tanlangan davrdagi haqiqiy tushum: darhol to‘langan sotuvlar va eski qarzlardan olingan to‘lovlar.",
            "Фактические поступления за выбранный период: оплаченные продажи и платежи по старым долгам."
          )}
        </p>
        <div className="report-cash-summary">
          <div>
            <span><Banknote size={17} /> {tr("Sotuvlardan tushum", "Поступления от продаж")}</span>
            <strong>{money(cashReport.saleCollections)}</strong>
          </div>
          <div>
            <span><HandCoins size={17} /> {tr("Eski qarzlardan tushum", "Погашение старых долгов")}</span>
            <strong>{money(cashReport.debtCollections)}</strong>
          </div>
          <div className="report-cash-total">
            <span><Calculator size={17} /> {tr("Kassaga jami tushgan", "Всего поступило в кассу")}</span>
            <strong>{money(cashReport.totalCollections)}</strong>
          </div>
          <div className="report-cash-credit">
            <span><CreditCard size={17} /> {tr("Qarzga sotuv (kassaga kirmaydi)", "Продажи в долг (не входят в кассу)")}</span>
            <strong>{money(cashReport.creditSales)}</strong>
          </div>
        </div>
        <div className="report-cash-methods">
          {cashMethods.map((item) => (
            <div className="report-cash-method" key={item.method}>
              <i style={{ background: cashMethodColors[item.method] }} />
              <div>
                <strong>{cashMethodLabel(item.method)}</strong>
                <small>
                  {tr("Sotuv", "Продажи")}: {money(item.saleAmount)} ({item.saleCount}) · {tr("Qarz to‘lovi", "Погашение долга")}: {money(item.debtAmount)} ({item.debtPaymentCount})
                </small>
              </div>
              <b>{money(item.totalAmount)}</b>
            </div>
          ))}
        </div>
      </Card>

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
      {report?.supplier_returns.length ? (
        <Card title={tr("Yetkazib beruvchiga qaytarish tafsilotlari", "Детали возвратов поставщику")}>
          <DataTable minWidth={1080}>
            <thead>
              <tr>
                <th>{tr("Sana", "Дата")}</th>
                <th>{tr("Mahsulot", "Товар")}</th>
                <th>{tr("Miqdor", "Количество")}</th>
                <th>{tr("1 dona uchun qaytarish narxi", "Цена возврата за единицу")}</th>
                <th>{tr("Kelishilgan jami summa", "Общая согласованная сумма")}</th>
                <th>{tr("FIFO tannarx", "FIFO-себестоимость")}</th>
                <th>{tr("Qaytarish foydasi", "Прибыль возврата")}</th>
                <th>{tr("Izoh", "Примечание")}</th>
              </tr>
            </thead>
            <tbody>
              {report.supplier_returns.map((item) => (
                <tr key={item.id}>
                  <td data-label={tr("Sana", "Дата")}>{date(item.returned_at)}</td>
                  <td data-label={tr("Mahsulot", "Товар")}><strong>{item.name}</strong></td>
                  <td data-label={tr("Miqdor", "Количество")}>{number(item.quantity)} {item.unit}</td>
                  <td data-label={tr("1 dona uchun qaytarish narxi", "Цена возврата за единицу")}>{money(item.agreed_return_price_per_unit)}</td>
                  <td data-label={tr("Kelishilgan jami summa", "Общая согласованная сумма")}>{money(item.total_agreed_return_amount)}</td>
                  <td data-label={tr("FIFO tannarx", "FIFO-себестоимость")}>{money(item.fifo_cost)}</td>
                  <td data-label={tr("Qaytarish foydasi", "Прибыль возврата")} className={item.supplier_return_profit >= 0 ? "positive" : "negative"}>{money(item.supplier_return_profit)}</td>
                  <td data-label={tr("Izoh", "Примечание")}>{item.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      ) : null}
        </>
      ) : null}
    </>
  );
}
