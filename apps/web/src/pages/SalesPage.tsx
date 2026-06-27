import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Search,
  Download,
  Edit3,
  Plus,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  Trash2,
  Undo2,
  UserPlus,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Pagination,
  SearchInput,
  Select,
  Textarea
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { api, download } from "../lib/api";
import {
  dateTime,
  money,
  number,
  toIsoEndOfDay,
  toIsoFromDateInput
} from "../lib/format";
import type {
  Contact,
  DebtStatus,
  MeasurementUnit,
  Paginated,
  PaymentType,
  Product,
  Sale,
  SaleDetails
} from "../types/api";

type SaleLine = {
  key: string;
  productId: string;
  quantity: string;
  unit: string;
  unitMultiplier: string;
  salePrice: string;
  discount: string;
};

const FRACTIONAL_UNIT_NAMES = new Set([
  "kg",
  "kq",
  "кг",
  "g",
  "gr",
  "гр",
  "l",
  "л",
  "liter",
  "litre",
  "литр",
  "m",
  "metr",
  "meter",
  "метр",
  "рулон"
]);

function normalizeNumericInput(value: string, allowFraction: boolean) {
  const normalized = value.replace(/\s+/g, "").replace(/,/g, ".");
  if (!allowFraction) {
    return normalized.replace(/[^\d]/g, "");
  }

  let result = "";
  let hasDot = false;
  for (const char of normalized) {
    if (/\d/.test(char)) {
      result += char;
      continue;
    }
    if (char === "." && !hasDot) {
      result += char;
      hasDot = true;
    }
  }
  return result;
}

function allowsFractionalQuantity(unit: string, baseUnit?: string) {
  const normalizedUnit = unit.trim().toLowerCase();
  const normalizedBaseUnit = baseUnit?.trim().toLowerCase() ?? "";
  if (normalizedUnit === "шт" || normalizedBaseUnit === "шт") return false;
  return FRACTIONAL_UNIT_NAMES.has(normalizedUnit) || FRACTIONAL_UNIT_NAMES.has(normalizedBaseUnit);
}

function quantityInputProps(unit: string, baseUnit?: string) {
  const fractional = allowsFractionalQuantity(unit, baseUnit);
  return {
    min: fractional ? "0.001" : "1",
    step: fractional ? "0.001" : "1",
    inputMode: fractional ? "decimal" : "numeric"
  } as const;
}

function sanitizeQuantityValue(value: string, unit: string, baseUnit?: string) {
  return normalizeNumericInput(value, allowsFractionalQuantity(unit, baseUnit));
}

function truncateNote(note: string, maxLength = 72) {
  const compact = note.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

const debtStatusLabel = (status: DebtStatus | null | undefined, tr: (uz: string, ru: string) => string) =>
  status === "PAID"
    ? tr("To‘langan", "Оплачен")
    : status === "PARTIALLY_PAID"
      ? tr("Qisman to‘langan", "Частично оплачен")
      : status === "OVERDUE"
        ? tr("Muddati o‘tgan", "Просрочен")
        : tr("To‘lanmagan", "Не оплачен");

const debtStatusTone = (status: DebtStatus | null | undefined) =>
  status === "PAID" ? "success" : status === "OVERDUE" ? "danger" : "warning";

const newLine = (): SaleLine => ({
  key: crypto.randomUUID(),
  productId: "",
  quantity: "1",
  unit: "",
  unitMultiplier: "1",
  salePrice: "",
  discount: "0"
});

function toDateTimeLocalInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalInputValue(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function SalesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { tr } = useI18n();
  const isAdmin = user?.role === "ADMIN";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [archived, setArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lines, setLines] = useState<SaleLine[]>([newLine()]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerNote, setNewCustomerNote] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("CASH");
  const [soldAt, setSoldAt] = useState(toDateTimeLocalInputValue(new Date().toISOString()));
  const [saleDiscount, setSaleDiscount] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [returnSale, setReturnSale] = useState<SaleDetails | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("");
  const [archiveSale, setArchiveSale] = useState<Sale | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [purgeSale, setPurgeSale] = useState<Sale | null>(null);
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [productPickerLineKey, setProductPickerLineKey] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Record<string, Product>>({});
  const productSearchRef = useRef<HTMLInputElement | null>(null);

  const sales = useQuery({
    queryKey: ["sales", page, search, paymentFilter, from, to, archived],
    queryFn: () => api<Paginated<Sale>>("/sales", {
      params: {
        page,
        limit: 15,
        search,
        paymentType: paymentFilter,
        from: toIsoFromDateInput(from),
        to: toIsoEndOfDay(to),
        archived
      }
    })
  });
  const products = useQuery({
    queryKey: ["products", "sale-select", debouncedProductSearch],
    queryFn: () => api<Paginated<Product>>("/products", {
      params: {
        limit: 100,
        search: debouncedProductSearch,
        sortBy: "name",
        sortOrder: "asc"
      }
    }),
    enabled: modalOpen || Boolean(productPickerLineKey),
    staleTime: 30_000
  });
  const units = useQuery({
    queryKey: ["units"],
    queryFn: () => api<MeasurementUnit[]>("/units")
  });
  const customers = useQuery({
    queryKey: ["customers", "sale-select", debouncedCustomerSearch],
    queryFn: () => api<Paginated<Contact>>("/customers", {
      params: { limit: 100, search: debouncedCustomerSearch, sortOrder: "asc" }
    }),
    enabled: modalOpen || customerPickerOpen || newCustomerOpen
  });

  useEffect(() => setPage(1), [search, paymentFilter, from, to, archived]);
  useEffect(() => setSelectedSaleIds([]), [archived, page, search, paymentFilter, from, to]);
  useEffect(() => {
    if (!productPickerLineKey) return;
    const timer = window.setTimeout(() => productSearchRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [productPickerLineKey]);
  useEffect(() => {
    if (!productPickerLineKey) {
      setDebouncedProductSearch("");
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedProductSearch(productSearch.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [productPickerLineKey, productSearch]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedCustomerSearch(customerSearch.trim()),
      250
    );
    return () => window.clearTimeout(timer);
  }, [customerSearch]);

  const subtotal = useMemo(
    () => lines.reduce(
      (sum, line) =>
        sum + Number(line.quantity || 0) * Number(line.salePrice || 0) - Number(line.discount || 0),
      0
    ),
    [lines]
  );
  const total = Math.max(0, subtotal - Number(saleDiscount || 0));
  const selectedPickerLine = productPickerLineKey
    ? lines.find((line) => line.key === productPickerLineKey) ?? null
    : null;
  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    Object.values(selectedProducts).forEach((product) => map.set(product.id, product));
    (products.data?.data ?? []).forEach((product) => map.set(product.id, product));
    return map;
  }, [products.data?.data, selectedProducts]);
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    const items = products.data?.data ?? [];
    if (!term) return items;
    return items.filter((item) =>
      [item.name, item.code, item.category_name, item.location ?? ""]
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [productSearch, products.data?.data]);

  const refreshSales = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["debts"] });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
  };
  const visibleSaleIds = sales.data?.data.map((sale) => sale.id) ?? [];
  const allVisibleSelected = visibleSaleIds.length > 0 && visibleSaleIds.every((id) => selectedSaleIds.includes(id));
  const selectedCount = selectedSaleIds.length;

  const salePayload = () => ({
    customerId: customerId || null,
    customerName: customerName || null,
    customerPhone: customerPhone || null,
    items: lines.map((line) => ({
      productId: line.productId,
      quantity: Number(line.quantity),
      unit: line.unit,
      unitMultiplier: Number(line.unitMultiplier),
      salePrice: Number(line.salePrice),
      discount: Number(line.discount || 0)
    })),
    discount: Number(saleDiscount || 0),
    paymentType,
    soldAt: fromDateTimeLocalInputValue(soldAt),
    dueDate: paymentType === "DEBT" ? dueDate || null : null,
    note: note || null
  });

  const save = useMutation({
    mutationFn: () => api<SaleDetails>(editingId ? `/sales/${editingId}` : "/sales", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify(salePayload())
    }),
    onSuccess: (sale) => {
      toast.success(
        editingId
          ? tr("Sotuv nakladnoyi yangilandi", "Накладная продажи обновлена")
          : tr(`Sotuv saqlandi: ${sale.invoice_number}`, `Продажа сохранена: ${sale.invoice_number}`)
      );
      setModalOpen(false);
      setEditingId(null);
      refreshSales();
    },
    onError: (error) => toast.error(error.message)
  });

  const createCustomer = useMutation({
    mutationFn: () => api<Contact>("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        address: newCustomerAddress.trim() || null,
        note: newCustomerNote.trim() || null
      })
    }),
    onSuccess: (customer) => {
      setCustomerId(customer.id);
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone ?? "");
      setNewCustomerOpen(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerAddress("");
      setNewCustomerNote("");
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(tr("Yangi mijoz yaratildi", "Новый клиент создан"));
    },
    onError: (error) => {
      const duplicate = error.message.includes("phone number already exists");
      toast.error(
        duplicate
          ? tr("Bu telefon raqamli mijoz allaqachon mavjud", "Клиент с этим номером телефона уже существует")
          : error.message
      );
    }
  });

  const archiveMutation = useMutation({
    mutationFn: () => api(`/sales/${archiveSale!.id}/archive`, {
      method: "POST",
      body: JSON.stringify({ reason: archiveReason })
    }),
    onSuccess: () => {
      toast.success("Sotuv 30 kunlik arxivga o‘tkazildi");
      setArchiveSale(null);
      setArchiveReason("");
      refreshSales();
    },
    onError: (error) => toast.error(error.message)
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api(`/sales/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Sotuv arxivdan tiklandi");
      refreshSales();
    },
    onError: (error) => toast.error(error.message)
  });

  const purgeMutation = useMutation({
    mutationFn: (id: string) => api<void>(`/sales/${id}/permanent`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Sotuv butunlay o‘chirildi");
      setPurgeSale(null);
      refreshSales();
    },
    onError: (error) => toast.error(error.message)
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () =>
      api<{ affected: number }>("/sales/bulk-delete", {
        method: "POST",
        body: JSON.stringify({
          ids: selectedSaleIds,
          mode: archived ? "permanent" : "archive",
          reason: archived
            ? "BULK_PERMANENT_DELETE"
            : "BULK_ARCHIVE_DELETE"
        })
      }),
    onSuccess: ({ affected }) => {
      toast.success(
        archived
          ? `${affected} ta nakladnoy butunlay o‘chirildi`
          : `${affected} ta nakladnoy arxivga o‘tkazildi`
      );
      setBulkDeleteOpen(false);
      setSelectedSaleIds([]);
      refreshSales();
    },
    onError: (error) => toast.error(error.message)
  });

  const returnMutation = useMutation({
    mutationFn: () => api<SaleDetails>(`/sales/${returnSale!.id}/returns`, {
      method: "POST",
      body: JSON.stringify({
        items: returnSale!.items
          .map((item) => ({
            saleItemId: item.id,
            quantity: Number(returnQuantities[item.id] || 0)
          }))
          .filter((item) => item.quantity > 0),
        reason: returnReason
      })
    }),
    onSuccess: () => {
      toast.success("Mahsulot omborga qaytarildi");
      setReturnSale(null);
      setReturnQuantities({});
      setReturnReason("");
      refreshSales();
    },
    onError: (error) => toast.error(error.message)
  });

  const resetForm = () => {
    setLines([newLine()]);
    setSelectedProducts({});
    setCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setPaymentType("CASH");
    setSoldAt(toDateTimeLocalInputValue(new Date().toISOString()));
    setSaleDiscount("0");
    setDueDate("");
    setNote("");
    setCustomerPickerOpen(false);
    setCustomerSearch("");
    setNewCustomerOpen(false);
  };

  const openCreate = () => {
    setEditingId(null);
    resetForm();
    setProductPickerLineKey(null);
    setProductSearch("");
    setModalOpen(true);
  };

  const openEdit = async (sale: Sale) => {
    try {
      const details = await api<SaleDetails>(`/sales/${sale.id}`);
      const detailProducts: Record<string, Product> = {};
      await Promise.all(
        details.items.map(async (item) => {
          try {
            detailProducts[item.product_id] = await api<Product>(`/products/${item.product_id}`);
          } catch {
            detailProducts[item.product_id] = {
              id: item.product_id,
              code: item.product_code,
              name: item.product_name,
              category_id: "",
              category_name: "",
              brand: null,
              unit: item.base_unit,
              purchase_price: 0,
              sale_price: item.sale_price,
              stock_quantity: item.remaining_quantity,
              minimum_stock: 0,
              location: null,
              image_url: null,
              image_urls: [],
              description: null,
              is_active: true,
              is_low_stock: false,
              created_at: "",
              updated_at: ""
            };
          }
        })
      );
      setEditingId(details.id);
      setLines(details.items.map((item) => ({
        key: item.id,
        productId: item.product_id,
        quantity: String(item.sale_quantity),
        unit: item.unit,
        unitMultiplier: String(item.unit_multiplier),
        salePrice: String(item.sale_price),
        discount: String(item.discount)
      })));
      setSelectedProducts(detailProducts);
      setCustomerId(details.customer_id ?? "");
      setCustomerName(details.customer_name ?? "");
      setCustomerPhone(details.customer_phone ?? "");
      setPaymentType(details.payment_type);
      setSoldAt(toDateTimeLocalInputValue(details.sold_at));
      setSaleDiscount(String(details.discount));
      setDueDate(details.due_date?.slice(0, 10) ?? "");
      setNote(details.note ?? "");
      setProductPickerLineKey(null);
      setProductSearch("");
      setModalOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sotuvni ochib bo‘lmadi");
    }
  };

  const openReturn = async (sale: Sale) => {
    try {
      const details = await api<SaleDetails>(`/sales/${sale.id}`);
      setReturnSale(details);
      setReturnQuantities({});
      setReturnReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sotuvni ochib bo‘lmadi");
    }
  };

  const updateLine = (key: string, field: keyof Omit<SaleLine, "key">, value: string) => {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        if (field === "productId") {
          const product = productById.get(value);
          const suggestedPrice = product?.sale_price && product.sale_price > 0
            ? product.sale_price
            : product?.last_sale_price && product.last_sale_price > 0
              ? product.last_sale_price
              : null;
          return {
            ...line,
            productId: value,
            unit: product?.unit ?? "",
            unitMultiplier: "1",
            salePrice: suggestedPrice ? String(suggestedPrice) : ""
          };
        }
        if (field === "unit") {
          const product = productById.get(line.productId);
          const nextQuantity = sanitizeQuantityValue(line.quantity, value, product?.unit);
          return {
            ...line,
            unit: value,
            quantity: nextQuantity,
            unitMultiplier: value === product?.unit ? "1" : ""
          };
        }
        if (field === "quantity") {
          const product = productById.get(line.productId);
          return {
            ...line,
            quantity: sanitizeQuantityValue(value, line.unit, product?.unit)
          };
        }
        if (field === "unitMultiplier") {
          return {
            ...line,
            unitMultiplier: normalizeNumericInput(value, true)
          };
        }
        return { ...line, [field]: value };
      })
    );
  };

  const selectCustomer = (id: string) => {
    const customer = customers.data?.data.find((item) => item.id === id);
    setCustomerId(id);
    if (customer) {
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone ?? "");
      setCustomerPickerOpen(false);
      setCustomerSearch("");
    } else {
      setCustomerName("");
      setCustomerPhone("");
      setCustomerPickerOpen(false);
      setCustomerSearch("");
    }
  };

  const lineValidation = lines.map((line) => {
    const product = productById.get(line.productId);
    const quantity = Number(line.quantity);
    const multiplier = Number(line.unitMultiplier);
    const gross = quantity * Number(line.salePrice || 0);
    if (!line.productId) return tr("Mahsulot tanlanmagan", "Товар не выбран");
    if (!Number.isFinite(quantity) || quantity <= 0) return tr("Miqdor noto‘g‘ri", "Некорректное количество");
    if (!line.unit || !Number.isFinite(multiplier) || multiplier <= 0) return tr("Birlik noto‘g‘ri", "Некорректная единица");
    if (line.salePrice === "") return tr("Sotuv narxi kiritilmagan", "Не указана цена продажи");
    if (Number(line.discount || 0) > gross) return tr("Qator chegirmasi summadan katta", "Скидка строки превышает сумму");
    if (product && quantity * multiplier > Number(product.stock_quantity)) {
      return tr("Omborda mahsulot yetarli emas", "Недостаточно товара на складе");
    }
    return null;
  });
  const saveDisabledReason =
    lineValidation.find(Boolean)
    ?? (Number(saleDiscount || 0) > subtotal
      ? tr("Umumiy chegirma sotuv summasidan katta", "Общая скидка превышает сумму продажи")
      : null)
    ?? (!soldAt ? tr("Sotuv sanasi kiritilmagan", "Не указана дата продажи") : null)
    ?? (paymentType === "DEBT" && !customerId
      ? tr("Qarz savdosi uchun mijozni tanlang", "Для продажи в долг выберите клиента")
      : null)
    ?? (paymentType === "DEBT" && !dueDate
      ? tr("Qarz muddatini kiriting", "Укажите срок оплаты долга")
      : null);
  const selectedReturnCount = Object.values(returnQuantities).filter((value) => Number(value) > 0).length;
  const openProductPicker = (line: SaleLine) => {
    setProductPickerLineKey(line.key);
    setProductSearch("");
  };
  const chooseProduct = (lineKey: string, productId: string) => {
    const product = productById.get(productId);
    if (product) {
      setSelectedProducts((current) => ({ ...current, [product.id]: product }));
    }
    updateLine(lineKey, "productId", productId);
    setProductPickerLineKey(null);
    setProductSearch("");
  };

  const receipt = async (sale: Sale) => {
    try {
      await download(`/sales/${sale.id}/receipt.pdf`, `${sale.invoice_number}.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chekni yuklab bo‘lmadi");
    }
  };
  const toggleSaleSelection = (saleId: string, checked: boolean) => {
    setSelectedSaleIds((current) =>
      checked ? [...new Set([...current, saleId])] : current.filter((id) => id !== saleId)
    );
  };
  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedSaleIds((current) => {
      if (checked) return [...new Set([...current, ...visibleSaleIds])];
      return current.filter((id) => !visibleSaleIds.includes(id));
    });
  };

  return (
    <>
      <PageHeader
        title={archived ? tr("Sotuvlar arxivi", "Архив продаж") : tr("Sotuvlar", "Продажи")}
        description={archived
          ? tr("O‘chirilgan nakladnoylar 30 kun saqlanadi.", "Удаленные накладные хранятся 30 дней.")
          : tr("Sotuv yarating, tahrirlang va qaytarishlarni boshqaring.", "Создавайте продажи, редактируйте их и оформляйте возвраты.")}
        actions={
          <>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setArchived((value) => !value)}>
                {archived ? <Undo2 size={17} /> : <Archive size={17} />}
                {archived ? tr("Faol sotuvlar", "Активные продажи") : tr("Arxiv", "Архив")}
              </Button>
            )}
            {!archived && <Button onClick={openCreate}><Plus size={17} /> {tr("Yangi sotuv", "Новая продажа")}</Button>}
          </>
        }
      />
      <Card>
        {isAdmin && selectedCount > 0 && (
          <div className="bulk-action-bar">
            <strong>
              {selectedCount} {tr("ta nakladnoy tanlandi", "накладных выбрано")}
            </strong>
            <div className="bulk-action-buttons">
              <Button variant="danger" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 size={16} />
                {archived
                  ? tr("Tanlanganlarni butunlay o‘chirish", "Удалить выбранные навсегда")
                  : tr("Tanlanganlarni o‘chirish", "Удалить выбранные")}
              </Button>
              <Button variant="secondary" onClick={() => setSelectedSaleIds([])}>
                {tr("Tanlovni tozalash", "Сбросить выбор")}
              </Button>
            </div>
          </div>
        )}
        <div className="filters">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("Nakladnoy, mijoz yoki mahsulot...", "Накладная, клиент или товар...")}
          />
          <Select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
            <option value="">{tr("Barcha to‘lovlar", "Все виды оплаты")}</option>
            <option value="CASH">{tr("Naqd", "Наличные")}</option>
            <option value="CARD">{tr("Plastik", "Карта")}</option>
            <option value="DEBT">{tr("Qarz", "В долг")}</option>
          </Select>
          <Input type="date" label={tr("Dan", "С")} value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input type="date" label={tr("Gacha", "По")} value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <DataTable loading={sales.isLoading} empty={!sales.data?.data.length} minWidth={1040}>
          <thead>
            <tr>
              {isAdmin && <th className="checkbox-column">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                  aria-label={tr("Barchasini tanlash", "Выбрать все")}
                />
              </th>}
              <th>{tr("Nakladnoy", "Накладная")}</th>
              <th>{tr("Sana", "Дата")}</th>
              <th>{tr("Mijoz", "Клиент")}</th>
              <th>{tr("To‘lov", "Оплата")}</th>
              <th>{tr("Jami", "Сумма")}</th>
              <th>{tr("Foyda", "Прибыль")}</th>
              <th>{archived ? tr("Arxiv muddati", "Срок архива") : tr("Sotuvchi", "Продавец")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sales.data?.data.map((sale) => (
              <tr key={sale.id} className={selectedSaleIds.includes(sale.id) ? "table-row-selected" : ""}>
                {isAdmin && (
                  <td data-label={tr("Tanlash", "Выбор")} className="checkbox-cell">
                    <label className="table-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedSaleIds.includes(sale.id)}
                        onChange={(event) => toggleSaleSelection(sale.id, event.target.checked)}
                        aria-label={tr("Nakladnoyni tanlash", "Выбрать накладную")}
                      />
                      <span>{tr("Tanlash", "Выбрать")}</span>
                    </label>
                  </td>
                )}
                <td data-label={tr("Nakladnoy", "Накладная")}>
                  <div className="product-cell">
                    <span className="product-avatar"><ReceiptText size={17} /></span>
                    <div>
                      <strong>{sale.invoice_number}</strong>
                      {sale.returned_amount > 0 && <small>Qaytarish: {money(sale.returned_amount)}</small>}
                      {sale.note && (
                        <small className="invoice-note-preview" title={sale.note}>
                          {tr("Izoh", "Примечание")}: {truncateNote(sale.note)}
                        </small>
                      )}
                    </div>
                  </div>
                </td>
                <td data-label={tr("Sana", "Дата")}>{dateTime(sale.sold_at)}</td>
                <td data-label={tr("Mijoz", "Клиент")}>{sale.customer_name || tr("Noma’lum mijoz", "Клиент не указан")}</td>
                <td data-label={tr("To‘lov", "Оплата")}>
                  <Badge tone={sale.payment_type === "DEBT" ? debtStatusTone(sale.debt_status) : sale.payment_type === "CARD" ? "info" : "success"}>
                    {sale.payment_type === "CASH"
                      ? tr("Naqd", "Наличные")
                      : sale.payment_type === "CARD"
                        ? tr("Plastik", "Карта")
                        : `${tr("Qarz", "В долг")} — ${debtStatusLabel(sale.debt_status, tr)}`}
                  </Badge>
                </td>
                <td data-label={tr("Jami", "Сумма")}><strong>{money(sale.net_total_amount)}</strong></td>
                <td data-label={tr("Foyda", "Прибыль")} className={sale.net_profit >= 0 ? "positive" : "negative"}>{money(sale.net_profit)}</td>
                <td data-label={archived ? tr("Arxiv muddati", "Срок архива") : tr("Sotuvchi", "Продавец")}>{archived ? dateTime(sale.archive_expires_at) : sale.seller_name || "-"}</td>
                <td data-label={tr("Amallar", "Действия")}>
                  <div className="row-actions">
                    {!archived && (
                      <>
                        <button className="icon-button" title={tr("PDF nakladnoy", "PDF накладная")} onClick={() => void receipt(sale)}>
                          <Download size={16} />
                        </button>
                        <button className="icon-button" title={tr("Tahrirlash", "Редактировать")} onClick={() => void openEdit(sale)}>
                          <Edit3 size={16} />
                        </button>
                        <button className="icon-button" title={tr("Mahsulot qaytarish", "Возврат товара")} onClick={() => void openReturn(sale)}>
                          <RotateCcw size={16} />
                        </button>
                        {isAdmin && (
                          <button
                            className="icon-button danger-icon"
                            title="Arxivga o‘tkazish"
                            onClick={() => setArchiveSale(sale)}
                          >
                            <Archive size={16} />
                          </button>
                        )}
                      </>
                    )}
                    {archived && isAdmin && (
                      <>
                        <button
                          className="icon-button"
                          title="Tiklash"
                          onClick={() => restoreMutation.mutate(sale.id)}
                        >
                          <Undo2 size={16} />
                        </button>
                        <button
                          className="icon-button danger-icon"
                          title="Butunlay o‘chirish"
                          onClick={() => setPurgeSale(sale)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {sales.data && (
          <Pagination
            page={sales.data.meta.page}
            totalPages={sales.data.meta.totalPages}
            total={sales.data.meta.total}
            onPage={setPage}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editingId ? tr("Sotuv nakladnoyini tahrirlash", "Редактировать накладную") : tr("Yangi sotuv", "Новая продажа")}
        description={editingId
          ? "Saqlanganda ombor qoldig‘i eski va yangi miqdor farqiga ko‘ra yangilanadi."
          : "Stock sotuv saqlangandan keyin avtomatik kamayadi."}
        onClose={() => setModalOpen(false)}
        className="sale-modal"
        bodyClassName="sale-modal-body"
        footerClassName="sale-modal-footer"
        wide
        footer={
          <>
            <div className="modal-total"><span>{tr("To‘lov summasi", "Сумма к оплате")}</span><strong>{money(total)}</strong></div>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{tr("Bekor qilish", "Отмена")}</Button>
              <Button
                loading={save.isPending}
                disabled={Boolean(saveDisabledReason)}
                title={saveDisabledReason ?? undefined}
                onClick={() => save.mutate()}
              >
              {editingId ? tr("O‘zgarishlarni saqlash", "Сохранить изменения") : tr("Sotuvni saqlash", "Сохранить продажу")}
            </Button>
            {saveDisabledReason && (
              <small className="sale-save-reason">{saveDisabledReason}</small>
            )}
          </>
        }
      >
        <div className="sale-form">
          <div className="sale-section">
            <div className="section-title">
              <div><ShoppingCart size={17} /><strong>{tr("Mahsulotlar", "Товары")}</strong></div>
              <Button variant="secondary" size="sm" onClick={() => setLines((current) => [...current, newLine()])}>
                <Plus size={14} /> {tr("Qator qo‘shish", "Добавить строку")}
              </Button>
            </div>
            <div className="sale-price-note">
              {tr("Har bir mahsulotning sotuv narxini erkin kiriting.", "Введите свободную цену продажи для каждого товара.")}
            </div>
            <div className="sale-line-head">
              <span />
              <span>{tr("Mahsulot", "Товар")}</span>
              <span>{tr("Miqdor / birlik", "Количество / ед.")}</span>
              <span>{tr("Sotuv narxi, summa", "Цена продажи, сумма")}</span>
              <span>{tr("Qator chegirmasi, summa", "Скидка строки, сумма")}</span>
              <span>{tr("Jami", "Сумма")}</span>
              <span />
            </div>
            <div className="sale-lines">
              {lines.map((line, index) => {
                const product = productById.get(line.productId);
                const quantityProps = quantityInputProps(line.unit, product?.unit);
                const validationError = lineValidation[index];
                return (
                  <div className={`sale-line ${validationError ? "sale-line-invalid" : ""}`} key={line.key}>
                    <span className="line-number">{index + 1}</span>
                    <div className="sale-line-product">
                      <span className="sale-mobile-label">{tr("Mahsulot", "Товар")}</span>
                      <button
                        type="button"
                        className={`sale-product-trigger ${line.productId ? "selected" : ""}`}
                        onClick={() => openProductPicker(line)}
                      >
                        <span className="sale-product-trigger-copy">
                          <strong>
                            {product?.name ?? tr("Mahsulotni tanlang", "Выберите товар")}
                          </strong>
                          <small>
                            {product
                              ? `${product.code} · ${product.unit}`
                              : tr("Nom yoki kod bo‘yicha qidiring", "Ищите по названию или коду")}
                          </small>
                        </span>
                        <Search size={16} />
                      </button>
                    </div>
                    <div className="sale-line-quantity">
                      <span className="sale-mobile-label">{tr("Miqdor / birlik", "Количество / ед.")}</span>
                      <div className="sale-quantity-main">
                        <Input
                          type="number"
                          min={quantityProps.min}
                          step={quantityProps.step}
                          inputMode={quantityProps.inputMode}
                          value={line.quantity}
                          onChange={(event) => updateLine(line.key, "quantity", event.target.value)}
                          placeholder={tr("Miqdor", "Количество")}
                        />
                        <Select value={line.unit} onChange={(event) => updateLine(line.key, "unit", event.target.value)}>
                          <option value="">{tr("Birlik", "Единица")}</option>
                          {units.data?.map((unit) => (
                            <option key={unit.id} value={unit.name}>{unit.name}</option>
                          ))}
                          {line.unit && !units.data?.some((unit) => unit.name === line.unit) && (
                            <option value={line.unit}>{line.unit}</option>
                          )}
                        </Select>
                      </div>
                    </div>
                    <div className="sale-line-price">
                      <span className="sale-mobile-label">{tr("Sotuv narxi, summa", "Цена продажи, сумма")}</span>
                      <Input
                        type="number"
                        min="0"
                        value={line.salePrice}
                        onChange={(event) => updateLine(line.key, "salePrice", event.target.value)}
                      />
                    </div>
                    <div className="sale-line-discount">
                      <span className="sale-mobile-label">{tr("Qator chegirmasi, summa", "Скидка строки, сумма")}</span>
                      <Input
                        type="number"
                        min="0"
                        value={line.discount}
                        onChange={(event) => updateLine(line.key, "discount", event.target.value)}
                      />
                    </div>
                    <div className="line-total-block">
                      <span className="sale-mobile-label">{tr("Jami", "Сумма")}</span>
                      <strong className="line-total">
                        {money(Number(line.quantity) * Number(line.salePrice) - Number(line.discount))}
                      </strong>
                    </div>
                    <button
                      className="icon-button danger-icon sale-line-remove"
                      disabled={lines.length === 1}
                      onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                      aria-label={tr("Qatorni o‘chirish", "Удалить строку")}
                    >
                      <Trash2 size={16} />
                      <span className="sale-remove-text">{tr("Mahsulotni o‘chirish", "Удалить товар")}</span>
                    </button>
                    <div className="unit-conversion-slot">
                      {product && line.unit && line.unit !== product.unit ? (
                        <label className="unit-conversion">
                          <span>1 {line.unit} =</span>
                          <input
                            className="input"
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={line.unitMultiplier}
                            onChange={(event) => updateLine(line.key, "unitMultiplier", event.target.value)}
                          />
                          <span>{product.unit}</span>
                        </label>
                      ) : (
                        <small className="base-unit-note placeholder">{"\u00a0"}</small>
                      )}
                    </div>
                    <small className="line-total-note">
                      {product
                        ? `${tr("Qoldiq", "Остаток")}: ${number(product.stock_quantity)} ${product.unit} · ${tr("Sarf", "Расход")}: ${number(Number(line.quantity) * Number(line.unitMultiplier || 0))} ${product.unit}`
                        : "\u00a0"}
                    </small>
                    {validationError && <small className="sale-line-error">{validationError}</small>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sale-section">
            <div className="section-title"><div><strong>{tr("Mijoz va to‘lov", "Клиент и оплата")}</strong></div></div>
            <div className="form-grid">
              <div className="customer-select-field">
                <span className="field-label">{tr("Mavjud mijoz", "Существующий клиент")}</span>
                <div className="customer-select-actions">
                  <button
                    type="button"
                    className="input customer-select-trigger"
                    onClick={() => setCustomerPickerOpen(true)}
                  >
                    <span>
                      <strong>{customerName || tr("Tanlanmagan", "Не выбран")}</strong>
                      {customerPhone && <small>{customerPhone}</small>}
                    </span>
                    <Search size={16} />
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setNewCustomerOpen(true)}
                  >
                    <UserPlus size={16} /> {tr("Yangi mijoz", "Новый клиент")}
                  </Button>
                </div>
                {paymentType === "DEBT" && !customerId && (
                  <small className="field-error">
                    {tr("Qarz savdosi uchun mijoz majburiy", "Для продажи в долг клиент обязателен")}
                  </small>
                )}
              </div>
              <Select label={tr("To‘lov turi *", "Вид оплаты *")} value={paymentType} onChange={(event) => setPaymentType(event.target.value as PaymentType)}>
                <option value="CASH">{tr("Naqd", "Наличные")}</option>
                <option value="CARD">{tr("Plastik", "Карта")}</option>
                <option value="DEBT">{tr("Qarz", "В долг")}</option>
              </Select>
              <Input label={tr("Mijoz nomi", "Имя клиента")} value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              <Input label={tr("Telefon", "Телефон")} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
              <Input label={tr("Umumiy chegirma, summa", "Общая скидка, сумма")} type="number" min="0" value={saleDiscount} onChange={(event) => setSaleDiscount(event.target.value)} />
              <Input
                label={tr("Sotuv sanasi *", "Дата продажи *")}
                type="datetime-local"
                value={soldAt}
                onChange={(event) => setSoldAt(event.target.value)}
              />
              {paymentType === "DEBT" && (
                <Input
                  label={tr("Qarz muddati *", "Срок оплаты *")}
                  type="date"
                  value={dueDate}
                  error={!dueDate ? tr("Muddatni kiriting", "Укажите срок оплаты") : undefined}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              )}
              <Textarea className="full" label={tr("Izoh", "Примечание")} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={customerPickerOpen}
        title={tr("Mijozni tanlash", "Выбор клиента")}
        description={tr(
          "Mijoz ismi yoki telefon raqami bo‘yicha qidiring.",
          "Найдите клиента по имени или номеру телефона."
        )}
        onClose={() => {
          setCustomerPickerOpen(false);
          setCustomerSearch("");
        }}
      >
        <div className="product-picker">
          <label className="field">
            <span className="field-label">{tr("Qidiruv", "Поиск")}</span>
            <div className="product-picker-search">
              <Search size={17} />
              <input
                autoFocus
                className="input"
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder={tr("Ism yoki telefon", "Имя или телефон")}
              />
              {customerSearch && (
                <button
                  type="button"
                  className="icon-button product-picker-clear"
                  onClick={() => setCustomerSearch("")}
                  aria-label={tr("Qidiruvni tozalash", "Очистить поиск")}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </label>
          <div className="product-picker-results customer-picker-results">
            <button
              type="button"
              className={`product-picker-item ${!customerId ? "active" : ""}`}
              onClick={() => selectCustomer("")}
            >
              <span><strong>{tr("Mijoz tanlanmagan", "Клиент не выбран")}</strong></span>
            </button>
            {customers.isFetching ? (
              <div className="product-picker-empty">{tr("Mijozlar qidirilmoqda...", "Поиск клиентов...")}</div>
            ) : customers.data?.data.length ? (
              customers.data.data.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className={`product-picker-item ${customerId === customer.id ? "active" : ""}`}
                  onClick={() => selectCustomer(customer.id)}
                >
                  <span>
                    <strong>{customer.name}</strong>
                    <small>{customer.phone || tr("Telefon ko‘rsatilmagan", "Телефон не указан")}</small>
                  </span>
                </button>
              ))
            ) : (
              <div className="product-picker-empty">{tr("Mijoz topilmadi", "Клиент не найден")}</div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={newCustomerOpen}
        title={tr("Yangi mijoz", "Новый клиент")}
        description={tr(
          "Mijoz savdoga avtomatik tanlanadi. Kiritilgan sotuv ma’lumotlari saqlanib qoladi.",
          "Новый клиент будет автоматически выбран. Данные текущей продажи сохранятся."
        )}
        onClose={() => setNewCustomerOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewCustomerOpen(false)}>
              {tr("Bekor qilish", "Отмена")}
            </Button>
            <Button
              loading={createCustomer.isPending}
              disabled={newCustomerName.trim().length < 2}
              onClick={() => createCustomer.mutate()}
            >
              {tr("Mijozni saqlash", "Сохранить клиента")}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Input
            className="full"
            label={tr("Mijoz ismi *", "Имя клиента *")}
            value={newCustomerName}
            error={newCustomerName.length > 0 && newCustomerName.trim().length < 2
              ? tr("Kamida 2 ta belgi kiriting", "Введите не менее 2 символов")
              : undefined}
            onChange={(event) => setNewCustomerName(event.target.value)}
          />
          <Input
            label={tr("Telefon", "Телефон")}
            value={newCustomerPhone}
            onChange={(event) => setNewCustomerPhone(event.target.value)}
          />
          <Input
            label={tr("Manzil", "Адрес")}
            value={newCustomerAddress}
            onChange={(event) => setNewCustomerAddress(event.target.value)}
          />
          <Textarea
            className="full"
            label={tr("Izoh", "Примечание")}
            value={newCustomerNote}
            onChange={(event) => setNewCustomerNote(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(productPickerLineKey)}
        title={tr("Mahsulotni tanlash", "Выбор товара")}
        description={tr(
          "Nom, kod, kategoriya yoki joylashuv yozing. Qidiruv barcha mahsulotlar bo'yicha serverda ishlaydi.",
          "Введите название, код, категорию или место. Поиск выполняется на сервере по всем товарам."
        )}
        onClose={() => {
          setProductPickerLineKey(null);
          setProductSearch("");
        }}
        wide
      >
        <div className="product-picker">
          <label className="field">
            <span className="field-label">{tr("Qidiruv", "Поиск")}</span>
            <div className="product-picker-search">
              <Search size={17} />
              <input
                ref={productSearchRef}
                className="input"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder={tr("Masalan: P36, lapka, Polka A1", "Например: P36, lapka, Полка A1")}
              />
              {productSearch && (
                <button
                  type="button"
                  className="icon-button product-picker-clear"
                  onClick={() => {
                    setProductSearch("");
                    productSearchRef.current?.focus();
                  }}
                  aria-label={tr("Qidiruvni tozalash", "Очистить поиск")}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </label>
          <div className="product-picker-results">
            {products.isFetching ? (
              <div className="product-picker-empty">
                {tr("Mahsulotlar qidirilmoqda...", "Поиск товаров...")}
              </div>
            ) : filteredProducts.length ? (
              filteredProducts.map((item) => {
                const disabled = lines.some((other) => other.key !== selectedPickerLine?.key && other.productId === item.id);
                const isSelected = selectedPickerLine?.productId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`product-picker-item ${isSelected ? "active" : ""}`}
                    disabled={disabled}
                    onClick={() => selectedPickerLine && chooseProduct(selectedPickerLine.key, item.id)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.code} · {item.category_name} · {item.unit}
                        {item.location ? ` · ${item.location}` : ""}
                      </small>
                      <small className="product-price-details">
                        {tr("FIFO tannarx", "FIFO-себестоимость")}: {money(item.next_fifo_cost ?? item.purchase_price)}
                        {" · "}
                        {tr("Tavsiya narxi", "Рекомендуемая цена")}: {item.sale_price > 0 ? money(item.sale_price) : "—"}
                        {" · "}
                        {tr("Oxirgi sotuv", "Последняя продажа")}: {item.last_sale_price ? money(item.last_sale_price) : "—"}
                      </small>
                    </span>
                    <em>{number(item.stock_quantity)} {item.unit}</em>
                  </button>
                );
              })
            ) : (
              <div className="product-picker-empty">
                {tr("Mos mahsulot topilmadi.", "Подходящий товар не найден.")}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(returnSale)}
        title={tr("Mahsulot qaytarish", "Возврат товара")}
        description={`${returnSale?.invoice_number ?? ""} nakladnoyi bo‘yicha omborga qaytarish.`}
        onClose={() => setReturnSale(null)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setReturnSale(null)}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button
              loading={returnMutation.isPending}
              disabled={!selectedReturnCount || returnReason.trim().length < 2}
              onClick={() => returnMutation.mutate()}
            >
              <RotateCcw size={16} /> {tr("Qaytarishni saqlash", "Сохранить возврат")}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <div className="return-items">
            {returnSale?.items.map((item) => (
              <div key={item.id} className="return-item">
                <div>
                  <strong>{item.product_name}</strong>
                  <small>
                    {tr("Qaytarish mumkin", "Можно вернуть")}: {number(item.remaining_sale_quantity)} {item.unit}
                    {item.unit_multiplier !== 1 && ` (1 ${item.unit} = ${number(item.unit_multiplier)} ${item.base_unit})`}
                  </small>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  max={item.remaining_sale_quantity}
                  value={returnQuantities[item.id] ?? ""}
                  onChange={(event) => setReturnQuantities((current) => ({
                    ...current,
                    [item.id]: event.target.value
                  }))}
                  placeholder="Miqdor"
                />
              </div>
            ))}
          </div>
          <Textarea
            label={tr("Qaytarish sababi *", "Причина возврата *")}
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
            placeholder="Masalan: mijoz qaytardi, mahsulot mos kelmadi"
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(archiveSale)}
        title="Sotuvni arxivga o‘tkazish"
        description="Nakladnoy o‘chiriladi, qolgan mahsulotlar omborga qaytadi va yozuv 30 kun saqlanadi."
        onClose={() => setArchiveSale(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveSale(null)}>Bekor qilish</Button>
            <Button
              variant="danger"
              loading={archiveMutation.isPending}
              disabled={archiveReason.trim().length < 2}
              onClick={() => archiveMutation.mutate()}
            >
              Arxivga o‘tkazish
            </Button>
          </>
        }
      >
        <Textarea
          label="O‘chirish sababi *"
          value={archiveReason}
          onChange={(event) => setArchiveReason(event.target.value)}
          placeholder="Sababni kiriting"
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(purgeSale)}
        title="Sotuvni butunlay o‘chirish"
        message={`${purgeSale?.invoice_number ?? ""} nakladnoyi va unga bog‘liq qarz/to‘lovlar qayta tiklab bo‘lmaydigan tarzda o‘chiriladi.`}
        loading={purgeMutation.isPending}
        onCancel={() => setPurgeSale(null)}
        onConfirm={() => purgeSale && purgeMutation.mutate(purgeSale.id)}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={archived
          ? tr("Tanlangan nakladnoylarni butunlay o‘chirish", "Удалить выбранные накладные навсегда")
          : tr("Tanlangan nakladnoylarni o‘chirish", "Удалить выбранные накладные")}
        message={archived
          ? tr(
            "Tanlangan nakladnoylarni butunlay o‘chirishni tasdiqlaysizmi?",
            "Вы уверены, что хотите удалить выбранные накладные навсегда?"
          )
          : tr(
            "Tanlangan nakladnoylarni o‘chirishni tasdiqlaysizmi?",
            "Вы уверены, что хотите удалить выбранные накладные?"
          )}
        loading={bulkDeleteMutation.isPending}
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={() => bulkDeleteMutation.mutate()}
      />
    </>
  );
}
