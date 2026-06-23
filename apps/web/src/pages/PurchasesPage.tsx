import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  FileSpreadsheet,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Truck,
  Undo2,
  X
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { readSheet } from "read-excel-file/browser";
import {
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
import { useI18n } from "../contexts/I18nContext";
import { api, download } from "../lib/api";
import { dateTime, money, number, toIsoEndOfDay, toIsoFromDateInput } from "../lib/format";
import type { Contact, Paginated, Product, Purchase, PurchaseDocument, SupplierReturn } from "../types/api";

type PurchaseLine = {
  key: string;
  supplierId: string;
  productId: string;
  productName?: string;
  productCode?: string;
  quantity: string;
  purchasePrice: string;
  location: string;
  purchasedAt: string;
  note: string;
};

type ImportRow = {
  rowNumber: number;
  product: string;
  quantity: number;
  purchasePrice: number;
  location: string | null;
  supplier: string | null;
  purchasedAt?: string;
  note: string | null;
  errors: string[];
};

type SupplierReturnForm = {
  productId: string;
  quantity: string;
  agreedReturnPricePerUnit: string;
  returnedAt: string;
  note: string;
};

const SUPPLIER_RETURN_PICKER = "__supplier_return__";

const newSupplierReturnForm = (): SupplierReturnForm => ({
  productId: "",
  quantity: "1",
  agreedReturnPricePerUnit: "",
  returnedAt: new Date().toISOString().slice(0, 10),
  note: ""
});

const newPurchaseLine = (defaults?: Partial<PurchaseLine>): PurchaseLine => ({
  key: crypto.randomUUID(),
  supplierId: defaults?.supplierId ?? "",
  productId: defaults?.productId ?? "",
  quantity: defaults?.quantity ?? "1",
  purchasePrice: defaults?.purchasePrice ?? "",
  location: defaults?.location ?? "",
  purchasedAt: defaults?.purchasedAt ?? new Date().toISOString().slice(0, 10),
  note: defaults?.note ?? ""
});

const headerAliases = {
  product: ["mahsulot kodi yoki nomi", "mahsulot", "product", "product code", "product name", "code"],
  quantity: ["miqdor", "quantity"],
  purchasePrice: ["kirim narxi", "purchase price"],
  location: ["joylashuv", "location", "polka", "yashik"],
  supplier: ["yetkazib beruvchi", "supplier"],
  purchasedAt: ["sana", "date"],
  note: ["izoh", "note"]
} as const;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[‘’ʻʼ']/g, "")
    .replaceAll("*", "")
    .replace(/\s+/g, " ")
    .trim();
}

function numericCell(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toIsoDateTime(value: string) {
  if (!value.trim()) return undefined;
  const normalized = value.includes("T")
    ? value
    : value.length <= 10
      ? `${value}T12:00:00`
      : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function PurchasesPage() {
  const queryClient = useQueryClient();
  const { tr } = useI18n();
  const [page, setPage] = useState(1);
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<string[]>([]);
  const [returnPage, setReturnPage] = useState(1);
  const [activeView, setActiveView] = useState<"purchases" | "returns">("purchases");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [supplierReturnOpen, setSupplierReturnOpen] = useState(false);
  const [supplierReturnForm, setSupplierReturnForm] = useState<SupplierReturnForm>(newSupplierReturnForm);
  const [deletingSupplierReturn, setDeletingSupplierReturn] = useState<SupplierReturn | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [deletingPurchase, setDeletingPurchase] = useState<Purchase | null>(null);
  const [supplierModal, setSupplierModal] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [defaultSupplierId, setDefaultSupplierId] = useState("");
  const [defaultPurchasedAt, setDefaultPurchasedAt] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<PurchaseLine[]>([newPurchaseLine()]);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [parsingExcel, setParsingExcel] = useState(false);
  const [productPickerLineKey, setProductPickerLineKey] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Record<string, Product>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);

  const purchases = useQuery({
    queryKey: ["purchases", page, search, from, to],
    queryFn: () => api<Paginated<PurchaseDocument>>("/purchases", {
      params: {
        page,
        limit: 15,
        search,
        from: toIsoFromDateInput(from),
        to: toIsoEndOfDay(to)
      }
    })
  });
  const supplierReturns = useQuery({
    queryKey: ["supplier-returns", returnPage, search, from, to],
    queryFn: () => api<Paginated<SupplierReturn>>("/supplier-returns", {
      params: {
        page: returnPage,
        limit: 15,
        search,
        from: toIsoFromDateInput(from),
        to: toIsoEndOfDay(to)
      }
    }),
    enabled: activeView === "returns"
  });
  const products = useQuery({
    queryKey: ["products", "purchase-select", debouncedProductSearch],
    queryFn: () => api<Paginated<Product>>("/products", {
      params: {
        limit: 100,
        search: debouncedProductSearch,
        sortBy: "name",
        sortOrder: "asc"
      }
    }),
    enabled: modalOpen || importOpen || supplierReturnOpen || Boolean(productPickerLineKey),
    staleTime: 30_000
  });
  const suppliers = useQuery({
    queryKey: ["suppliers", "all"],
    queryFn: () => api<Paginated<Contact>>("/suppliers", {
      params: { limit: 200, sortOrder: "asc" }
    })
  });

  useEffect(() => {
    setPage(1);
    setReturnPage(1);
    setExpandedDocumentIds([]);
  }, [search, from, to]);
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

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["purchases"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["supplier-returns"] });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
  };

  const save = useMutation<Purchase | { totalRows: number; totalAmount: number }, Error>({
    mutationFn: () =>
      editingPurchase
        ? api<Purchase>(`/purchases/${editingPurchase.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              supplierId: lines[0]?.supplierId || null,
              productId: lines[0]?.productId,
              quantity: Number(lines[0]?.quantity ?? 0),
              purchasePrice: Number(lines[0]?.purchasePrice ?? 0),
              location: lines[0]?.location || null,
              purchasedAt: lines[0]?.purchasedAt
                ? new Date(`${lines[0].purchasedAt}T12:00:00`).toISOString()
                : undefined,
              note: lines[0]?.note || null
            })
          })
        : api<{ totalRows: number; totalAmount: number }>("/purchases/bulk", {
            method: "POST",
            body: JSON.stringify({
              rows: lines.map((line) => ({
                supplierId: line.supplierId || null,
                productId: line.productId,
                quantity: Number(line.quantity),
                purchasePrice: Number(line.purchasePrice),
                location: line.location || null,
                purchasedAt: line.purchasedAt
                  ? new Date(`${line.purchasedAt}T12:00:00`).toISOString()
                  : undefined,
                note: line.note || null
              }))
            })
          }),
    onSuccess: (result) => {
      if (editingPurchase) {
        toast.success(tr("Kirim yozuvi yangilandi", "Приход обновлен"));
      } else {
        const created = result as { totalRows: number; totalAmount: number };
        toast.success(
          `${created.totalRows} ta mahsulot kirim qilindi. Jami: ${money(created.totalAmount)}`
        );
      }
      setModalOpen(false);
      setEditingPurchase(null);
      setLines([newPurchaseLine({ purchasedAt: defaultPurchasedAt, supplierId: defaultSupplierId })]);
      refresh();
    },
    onError: (error) => toast.error(error.message)
  });

  const removePurchase = useMutation({
    mutationFn: (id: string) => api<{ deleted: boolean }>(`/purchases/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tr("Kirim o‘chirildi", "Приход удален"));
      setDeletingPurchase(null);
      refresh();
    },
    onError: (error) => toast.error(error.message)
  });

  const saveSupplierReturn = useMutation({
    mutationFn: () => api<SupplierReturn>("/supplier-returns", {
      method: "POST",
      body: JSON.stringify({
        productId: supplierReturnForm.productId,
        quantity: Number(supplierReturnForm.quantity),
        agreedReturnPricePerUnit: Number(supplierReturnForm.agreedReturnPricePerUnit),
        returnedAt: supplierReturnForm.returnedAt
          ? new Date(`${supplierReturnForm.returnedAt}T12:00:00`).toISOString()
          : undefined,
        note: supplierReturnForm.note || null
      })
    }),
    onSuccess: () => {
      toast.success(tr("Mahsulot yetkazib beruvchiga qaytarildi", "Возврат поставщику сохранен"));
      setSupplierReturnOpen(false);
      setSupplierReturnForm(newSupplierReturnForm());
      setActiveView("returns");
      refresh();
    },
    onError: (error) => toast.error(error.message)
  });

  const removeSupplierReturn = useMutation({
    mutationFn: (id: string) => api<{ deleted: boolean }>(`/supplier-returns/${id}`, {
      method: "DELETE"
    }),
    onSuccess: () => {
      toast.success(tr(
        "Yetkazib beruvchiga qaytarish o‘chirildi va mahsulot omborga tiklandi",
        "Возврат поставщику удален, товар восстановлен на складе"
      ));
      setDeletingSupplierReturn(null);
      refresh();
    },
    onError: (error) => toast.error(error.message)
  });

  const addSupplier = useMutation({
    mutationFn: () => api<Contact>("/suppliers", {
      method: "POST",
      body: JSON.stringify({ name: supplierName, phone: supplierPhone || null })
    }),
    onSuccess: (supplier) => {
      toast.success("Yetkazib beruvchi qo‘shildi");
      setDefaultSupplierId(supplier.id);
      setLines((current) =>
        current.map((line) =>
          !line.supplierId ? { ...line, supplierId: supplier.id } : line
        )
      );
      setSupplierModal(false);
      setSupplierName("");
      setSupplierPhone("");
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const importPurchases = useMutation({
    mutationFn: () =>
      api<{ totalRows: number; totalAmount: number; importedQuantity: number }>("/purchases/import", {
        method: "POST",
        body: JSON.stringify({
          rows: importRows.map((row) => ({
            rowNumber: row.rowNumber,
            product: row.product,
            quantity: row.quantity,
            purchasePrice: row.purchasePrice,
            location: row.location,
            supplier: row.supplier,
            purchasedAt: row.purchasedAt,
            note: row.note
          }))
        })
      }),
    onSuccess: (result) => {
      toast.success(
        `${result.totalRows} ta qator kirim qilindi. Jami: ${money(result.totalAmount)}`
      );
      setImportOpen(false);
      setImportRows([]);
      setImportFileName("");
      refresh();
    },
    onError: (error) => toast.error(error.message)
  });

  const lineTotal = (line: PurchaseLine) =>
    Number(line.quantity || 0) * Number(line.purchasePrice || 0);
  const total = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotal(line), 0),
    [lines]
  );
  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    Object.values(selectedProducts).forEach((product) => map.set(product.id, product));
    (products.data?.data ?? []).forEach((product) => map.set(product.id, product));
    return map;
  }, [products.data?.data, selectedProducts]);
  const selectedPickerLine = productPickerLineKey
    ? lines.find((line) => line.key === productPickerLineKey) ?? null
    : null;
  const selectedPickerProductId = productPickerLineKey === SUPPLIER_RETURN_PICKER
    ? supplierReturnForm.productId
    : selectedPickerLine?.productId;
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    const items = products.data?.data ?? [];
    if (!term) return items;
    return items.filter((item) =>
      [item.name, item.code, item.category_name, item.location ?? ""]
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [productSearch, products.data?.data]);
  const canSave = lines.every(
    (line) => line.productId && Number(line.quantity) > 0 && line.purchasePrice !== ""
  );
  const selectedSupplierReturnProduct = productById.get(supplierReturnForm.productId);
  const supplierReturnQuantity = Number(supplierReturnForm.quantity);
  const agreedReturnPricePerUnit = Number(supplierReturnForm.agreedReturnPricePerUnit);
  const totalAgreedReturnAmount = Number.isFinite(supplierReturnQuantity * agreedReturnPricePerUnit)
    ? supplierReturnQuantity * agreedReturnPricePerUnit
    : 0;
  const canSaveSupplierReturn = Boolean(
    supplierReturnForm.productId
    && supplierReturnQuantity > 0
    && supplierReturnQuantity <= Number(selectedSupplierReturnProduct?.stock_quantity ?? 0)
    && supplierReturnForm.agreedReturnPricePerUnit !== ""
    && agreedReturnPricePerUnit > 0
    && supplierReturnForm.returnedAt
  );
  const hasImportErrors = importRows.some((row) => row.errors.length > 0);

  const updateLine = (key: string, field: keyof Omit<PurchaseLine, "key">, value: string) => {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        if (field === "productId") {
          const product = productById.get(value);
          return {
            ...line,
            productId: value,
            productName: product?.name,
            productCode: product?.code,
            purchasePrice: product ? String(product.purchase_price) : "",
            location: product?.location ?? line.location
          };
        }
        return { ...line, [field]: value };
      })
    );
  };

  const addRow = () =>
    setLines((current) => [
      ...current,
      newPurchaseLine({
        supplierId: defaultSupplierId,
        purchasedAt: defaultPurchasedAt
      })
    ]);

  const removeRow = (key: string) =>
    setLines((current) => current.length === 1 ? current : current.filter((line) => line.key !== key));

  const openCreate = () => {
    const initialDate = new Date().toISOString().slice(0, 10);
    setEditingPurchase(null);
    setDefaultPurchasedAt(initialDate);
    setDefaultSupplierId("");
    setSelectedProducts({});
    setProductPickerLineKey(null);
    setProductSearch("");
    setLines([newPurchaseLine({ purchasedAt: initialDate })]);
    setModalOpen(true);
  };

  const openEdit = (purchase: Purchase) => {
    setEditingPurchase(purchase);
    setDefaultSupplierId(purchase.supplier_id ?? "");
    setDefaultPurchasedAt(purchase.purchased_at.slice(0, 10));
    setSelectedProducts({});
    setProductPickerLineKey(null);
    setProductSearch("");
    setLines([
      newPurchaseLine({
        supplierId: purchase.supplier_id ?? "",
        productId: purchase.product_id,
        productName: purchase.product_name,
        productCode: purchase.product_code,
        quantity: String(purchase.quantity),
        purchasePrice: String(purchase.purchase_price),
        location: purchase.product_location ?? "",
        purchasedAt: purchase.purchased_at.slice(0, 10),
        note: purchase.note ?? ""
      })
    ]);
    setModalOpen(true);
  };

  const openProductPicker = (lineKey: string) => {
    setProductPickerLineKey(lineKey);
    setProductSearch("");
  };

  const chooseProduct = (lineKey: string, productId: string) => {
    const product = productById.get(productId);
    if (product) {
      setSelectedProducts((current) => ({ ...current, [product.id]: product }));
    }
    if (lineKey === SUPPLIER_RETURN_PICKER) {
      setSupplierReturnForm((current) => ({ ...current, productId }));
    } else {
      updateLine(lineKey, "productId", productId);
    }
    setProductPickerLineKey(null);
    setProductSearch("");
  };

  const openSupplierReturn = () => {
    setSupplierReturnForm(newSupplierReturnForm());
    setSelectedProducts({});
    setProductPickerLineKey(null);
    setProductSearch("");
    setSupplierReturnOpen(true);
  };

  const downloadTemplate = async () => {
    try {
      await download("/purchases/import-template.xlsx", "kirim-import-shablon.xlsx");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shablonni yuklab bo‘lmadi");
    }
  };

  const parseExcel = async (file: File) => {
    setParsingExcel(true);
    setImportFileName(file.name);
    setImportError("");
    setImportRows([]);
    try {
      const sheet = await readSheet(file);
      if (sheet.length < 2) throw new Error("Excel faylda ma’lumot qatorlari yo‘q");
      const headers = sheet[0]!.map(normalizeHeader);
      const getIndex = (aliases: readonly string[]) =>
        headers.findIndex((header) => aliases.includes(header));
      const indexes = {
        product: getIndex(headerAliases.product),
        quantity: getIndex(headerAliases.quantity),
        purchasePrice: getIndex(headerAliases.purchasePrice),
        location: getIndex(headerAliases.location),
        supplier: getIndex(headerAliases.supplier),
        purchasedAt: getIndex(headerAliases.purchasedAt),
        note: getIndex(headerAliases.note)
      };
      for (const required of ["product", "quantity", "purchasePrice"] as const) {
        if (indexes[required] < 0) {
          throw new Error(`Majburiy ustun topilmadi: ${headerAliases[required][0]}`);
        }
      }

      const productMap = new Map<string, Product>();
      for (const product of products.data?.data ?? []) {
        productMap.set(product.name.toLowerCase(), product);
        productMap.set(product.code.toLowerCase(), product);
      }
      const supplierSet = new Set(
        (suppliers.data?.data ?? []).map((supplier) => supplier.name.toLowerCase())
      );

      const parsed = sheet.slice(1).flatMap((cells, index) => {
        const value = (column: keyof typeof indexes) =>
          indexes[column] >= 0 ? cells[indexes[column]] : null;
        const product = String(value("product") ?? "").trim();
        if (!product) return [];
        const quantity = numericCell(value("quantity"));
        const purchasePrice = numericCell(value("purchasePrice"));
        const supplier = String(value("supplier") ?? "").trim() || null;
        const purchasedAtText = String(value("purchasedAt") ?? "").trim();
        const purchasedAt = purchasedAtText ? toIsoDateTime(purchasedAtText) : undefined;
        const errors: string[] = [];
        if (!productMap.has(product.toLowerCase())) errors.push(tr("Mahsulot topilmadi", "Товар не найден"));
        if (Number.isNaN(quantity) || quantity <= 0) errors.push(tr("Miqdor noto‘g‘ri", "Неверное количество"));
        if (Number.isNaN(purchasePrice) || purchasePrice < 0) errors.push(tr("Kirim narxi noto‘g‘ri", "Неверная закупочная цена"));
        if (supplier && !supplierSet.has(supplier.toLowerCase())) errors.push(tr("Yetkazib beruvchi topilmadi", "Поставщик не найден"));
        if (purchasedAtText && !purchasedAt) errors.push(tr("Sana noto‘g‘ri", "Неверная дата"));
        return [{
          rowNumber: index + 2,
          product,
          quantity,
          purchasePrice,
          location: String(value("location") ?? "").trim() || null,
          supplier,
          purchasedAt,
          note: String(value("note") ?? "").trim() || null,
          errors
        }];
      });

      if (!parsed.length) throw new Error("Import qilinadigan qator topilmadi");
      setImportRows(parsed);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Excel faylni o‘qib bo‘lmadi");
    } finally {
      setParsingExcel(false);
    }
  };

  return (
    <>
      <PageHeader
        title={tr("Kirim", "Приход")}
        description={tr(
          "Bir hujjatda bir nechta mahsulot kirim qiling va FIFO batchlarni yarating.",
          "Оформляйте приход нескольких товаров в одном документе и создавайте FIFO партии."
        )}
        actions={
          <>
            <Button variant="secondary" onClick={openSupplierReturn}>
              <Undo2 size={17} /> {tr("Yetkazib beruvchiga qaytarish", "Возврат поставщику")}
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet size={17} /> {tr("Excel import", "Импорт Excel")}
            </Button>
            <Button onClick={openCreate}>
              <PackagePlus size={17} /> {tr("Yangi kirim", "Новый приход")}
            </Button>
          </>
        }
      />
      <div className="purchase-view-tabs" role="tablist">
        <button
          type="button"
          className={activeView === "purchases" ? "active" : ""}
          onClick={() => setActiveView("purchases")}
          role="tab"
          aria-selected={activeView === "purchases"}
        >
          <PackagePlus size={16} /> {tr("Kirimlar", "Приходы")}
        </button>
        <button
          type="button"
          className={activeView === "returns" ? "active" : ""}
          onClick={() => setActiveView("returns")}
          role="tab"
          aria-selected={activeView === "returns"}
        >
          <Undo2 size={16} /> {tr("Yetkazib beruvchiga qaytarish", "Возврат поставщику")}
        </button>
      </div>
      <Card>
        <div className="filters">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("Mahsulot yoki yetkazib beruvchi...", "Товар или поставщик...")}
          />
          <Input type="date" label={tr("Dan", "С")} value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" label={tr("Gacha", "По")} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {activeView === "purchases" ? <>
        <DataTable loading={purchases.isLoading} empty={!purchases.data?.data.length} minWidth={1060}>
          <thead>
            <tr>
              <th>{tr("Kirim hujjati", "Документ прихода")}</th>
              <th>{tr("Sana", "Дата")}</th>
              <th>{tr("Yetkazib beruvchi", "Поставщик")}</th>
              <th>{tr("Mahsulot qatorlari", "Строк товаров")}</th>
              <th>{tr("Jami miqdor", "Общее количество")}</th>
              <th>{tr("Jami summa", "Общая сумма")}</th>
              <th>{tr("Kiritgan", "Добавил")}</th>
              <th>{tr("Amallar", "Действия")}</th>
            </tr>
          </thead>
          <tbody>
            {purchases.data?.data.map((document) => {
              const expanded = expandedDocumentIds.includes(document.id);
              return (
                <Fragment key={document.id}>
                  <tr className={expanded ? "purchase-document-row expanded" : "purchase-document-row"}>
                    <td data-label={tr("Kirim hujjati", "Документ прихода")}>
                      <div className="purchase-document-number">
                        <span className="product-avatar"><PackagePlus size={17} /></span>
                        <strong>{document.document_number}</strong>
                      </div>
                    </td>
                    <td data-label={tr("Sana", "Дата")}>{dateTime(document.purchased_at)}</td>
                    <td data-label={tr("Yetkazib beruvchi", "Поставщик")}>
                      {document.supplier_count > 1
                        ? tr("Bir nechta", "Несколько")
                        : document.supplier_name || "-"}
                    </td>
                    <td data-label={tr("Mahsulot qatorlari", "Строк товаров")}>
                      <strong>{document.line_count}</strong>
                    </td>
                    <td data-label={tr("Jami miqdor", "Общее количество")}>
                      <strong>{number(document.total_quantity)}</strong>
                    </td>
                    <td data-label={tr("Jami summa", "Общая сумма")}>
                      <strong>{money(document.total_amount)}</strong>
                    </td>
                    <td data-label={tr("Kiritgan", "Добавил")}>{document.created_by_name}</td>
                    <td data-label={tr("Amallar", "Действия")}>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button purchase-document-toggle"
                          onClick={() => setExpandedDocumentIds((current) =>
                            current.includes(document.id)
                              ? current.filter((id) => id !== document.id)
                              : [...current, document.id]
                          )}
                          title={expanded
                            ? tr("Mahsulotlarni yopish", "Скрыть товары")
                            : tr("Mahsulotlarni ko‘rsatish", "Показать товары")}
                          aria-expanded={expanded}
                        >
                          {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="purchase-document-detail-row">
                      <td colSpan={8} className="purchase-document-detail-cell">
                        <div className="purchase-document-items">
                          <div className="purchase-document-item purchase-document-item-head">
                            <span>{tr("Mahsulot", "Товар")}</span>
                            <span>{tr("Joylashuv", "Место")}</span>
                            <span>{tr("Miqdor", "Количество")}</span>
                            <span>{tr("Kirim narxi", "Закупочная цена")}</span>
                            <span>{tr("Qator jami", "Сумма строки")}</span>
                            <span>{tr("Amallar", "Действия")}</span>
                          </div>
                          {document.items.map((purchase) => (
                            <div className="purchase-document-item" key={purchase.id}>
                              <div data-label={tr("Mahsulot", "Товар")}>
                                <strong>{purchase.product_name}</strong>
                                {purchase.note ? <small title={purchase.note}>{purchase.note}</small> : null}
                              </div>
                              <span data-label={tr("Joylashuv", "Место")}>{purchase.product_location || "-"}</span>
                              <span data-label={tr("Miqdor", "Количество")}><strong>{number(purchase.quantity)} {purchase.unit}</strong></span>
                              <span data-label={tr("Kirim narxi", "Закупочная цена")}>{money(purchase.purchase_price)}</span>
                              <span data-label={tr("Qator jami", "Сумма строки")}><strong>{money(purchase.total_cost)}</strong></span>
                              <div className="row-actions" data-label={tr("Amallar", "Действия")}>
                                <button
                                  className="icon-button"
                                  onClick={() => openEdit(purchase)}
                                  title={tr("Tahrirlash", "Редактировать")}
                                >
                                  <Edit3 size={16} />
                                </button>
                                <button
                                  className="icon-button danger-icon"
                                  onClick={() => setDeletingPurchase(purchase)}
                                  title={tr("O‘chirish", "Удалить")}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </DataTable>
        {purchases.data && (
          <Pagination
            page={purchases.data.meta.page}
            totalPages={purchases.data.meta.totalPages}
            total={purchases.data.meta.total}
            onPage={setPage}
          />
        )}
        </> : <>
          <DataTable loading={supplierReturns.isLoading} empty={!supplierReturns.data?.data.length} minWidth={1320}>
            <thead>
              <tr>
                <th>{tr("Sana", "Дата")}</th>
                <th>{tr("Mahsulot", "Товар")}</th>
                <th>{tr("Miqdor", "Количество")}</th>
                <th>{tr("FIFO tannarx", "FIFO-себестоимость")}</th>
                <th>{tr("Kelishilgan qaytarish narxi, 1 dona uchun", "Согласованная цена возврата за единицу")}</th>
                <th>{tr("Kelishilgan jami qaytarish summasi", "Общая согласованная сумма возврата")}</th>
                <th>{tr("Qaytarish foydasi", "Прибыль возврата")}</th>
                <th>{tr("Izoh", "Примечание")}</th>
                <th>{tr("Kiritgan", "Добавил")}</th>
                <th>{tr("Amallar", "Действия")}</th>
              </tr>
            </thead>
            <tbody>
              {supplierReturns.data?.data.map((item) => (
                <tr key={item.id}>
                  <td data-label={tr("Sana", "Дата")}>{dateTime(item.returned_at)}</td>
                  <td data-label={tr("Mahsulot", "Товар")}>
                    <div className="product-cell">
                      <span className="product-avatar"><Undo2 size={17} /></span>
                      <div><strong>{item.product_name}</strong></div>
                    </div>
                  </td>
                  <td data-label={tr("Miqdor", "Количество")}><strong>{number(item.quantity)} {item.unit}</strong></td>
                  <td data-label={tr("FIFO tannarx", "FIFO-себестоимость")}>{money(item.fifo_cost)}</td>
                  <td data-label={tr("Kelishilgan qaytarish narxi, 1 dona uchun", "Согласованная цена возврата за единицу")}>{money(item.agreed_return_price_per_unit)}</td>
                  <td data-label={tr("Kelishilgan jami qaytarish summasi", "Общая согласованная сумма возврата")}>{money(item.total_agreed_return_amount)}</td>
                  <td data-label={tr("Qaytarish foydasi", "Прибыль возврата")} className={item.supplier_return_profit >= 0 ? "positive" : "negative"}>
                    <strong>{money(item.supplier_return_profit)}</strong>
                  </td>
                  <td data-label={tr("Izoh", "Примечание")}>{item.note || "-"}</td>
                  <td data-label={tr("Kiritgan", "Добавил")}>{item.created_by_name}</td>
                  <td data-label={tr("Amallar", "Действия")}>
                    <div className="row-actions">
                      <button
                        className="icon-button danger-icon"
                        onClick={() => setDeletingSupplierReturn(item)}
                        title={tr("Qaytarishni o‘chirish", "Удалить возврат")}
                        aria-label={tr("Qaytarishni o‘chirish", "Удалить возврат")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {supplierReturns.data && (
            <Pagination
              page={supplierReturns.data.meta.page}
              totalPages={supplierReturns.data.meta.totalPages}
              total={supplierReturns.data.meta.total}
              onPage={setReturnPage}
            />
          )}
        </>}
      </Card>

      <Modal
        open={modalOpen}
        title={editingPurchase ? tr("Kirimni tahrirlash", "Edit purchase") : tr("Yangi kirim hujjati", "New purchase")}
        description={editingPurchase
          ? tr("O‘zgarishlar stock va FIFO batchga qo‘llanadi.", "Changes will update stock and the FIFO batch.")
          : tr(
              "Bir nechta qatorni bir vaqtning o‘zida saqlang. Har bir qator alohida FIFO batch bo‘ladi.",
              "Сохраняйте несколько строк сразу. Каждая строка станет отдельной FIFO партией."
            )}
        onClose={() => { setModalOpen(false); setEditingPurchase(null); }}
        wide
        footer={
          <>
            <div className="modal-total">
              <span>{tr("Hujjat jami", "Итого по документу")}</span>
              <strong>{money(total)}</strong>
            </div>
            <Button variant="secondary" onClick={() => { setModalOpen(false); setEditingPurchase(null); }}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button
              loading={save.isPending}
              disabled={!canSave}
              onClick={() => {
                if (editingPurchase && !window.confirm("Kirimdagi o'zgarishlar stock va FIFO batchni qayta hisoblaydi. Davom etasizmi?")) return;
                save.mutate();
              }}
            >
              {editingPurchase ? tr("O‘zgarishlarni saqlash", "Save changes") : tr("Kirimni saqlash", "Сохранить приход")}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <div className="sale-section">
            <div className="section-title">
              <div><Truck size={17} /><strong>{tr("Umumiy sozlamalar", "Общие параметры")}</strong></div>
            </div>
            <div className="sale-section form-grid">
              <div className="select-with-action">
                <Select
                  label={tr("Standart yetkazib beruvchi", "Поставщик по умолчанию")}
                  value={defaultSupplierId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDefaultSupplierId(value);
                    setLines((current) =>
                      current.map((line) => (!line.supplierId ? { ...line, supplierId: value } : line))
                    );
                  }}
                >
                  <option value="">{tr("Ko‘rsatilmagan", "Не указан")}</option>
                  {suppliers.data?.data.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </Select>
                <Button variant="secondary" size="sm" onClick={() => setSupplierModal(true)}>
                  <Plus size={15} /> {tr("Yangi", "Новый")}
                </Button>
              </div>
              <Input
                label={tr("Standart sana", "Дата по умолчанию")}
                type="date"
                value={defaultPurchasedAt}
                onChange={(event) => {
                  const value = event.target.value;
                  setDefaultPurchasedAt(value);
                  setLines((current) =>
                    current.map((line) =>
                      line.purchasedAt === defaultPurchasedAt ? { ...line, purchasedAt: value } : line
                    )
                  );
                }}
              />
            </div>
          </div>

          <div className="sale-section">
            <div className="section-title">
              <div><PackagePlus size={17} /><strong>{tr("Kirim qatorlari", "Строки прихода")}</strong></div>
              {!editingPurchase && <Button variant="secondary" size="sm" onClick={addRow}>
                <Plus size={14} /> {tr("Qator qo‘shish", "Добавить строку")}
              </Button>}
            </div>
            <div className="sale-lines">
              {lines.map((line, index) => {
                const selectedProduct = productById.get(line.productId);
                return (
                  <div className="sale-line purchase-line" key={line.key}>
                    <span className="line-number">{index + 1}</span>
                    <div className="sale-line-product">
                      <span className="sale-mobile-label">{tr("Mahsulot", "Товар")}</span>
                      <button
                        type="button"
                        className={`sale-product-trigger ${line.productId ? "selected" : ""}`}
                        onClick={() => openProductPicker(line.key)}
                      >
                        <span className="sale-product-trigger-copy">
                          <strong>
                            {selectedProduct?.name ?? line.productName ?? tr("Mahsulotni tanlang", "Выберите товар")}
                          </strong>
                          <small>
                            {selectedProduct
                              ? `${selectedProduct.code} · ${selectedProduct.category_name}${selectedProduct.location ? ` · ${selectedProduct.location}` : ""}`
                              : tr("Nom, kod, kategoriya yoki joylashuv bo‘yicha qidiring", "Ищите по названию, коду, категории или месту")}
                          </small>
                        </span>
                        <Search size={16} />
                      </button>
                    </div>
                    <div className="sale-line-quantity">
                      <span className="sale-mobile-label">{tr("Miqdor / joy", "Количество / место")}</span>
                      <div className="purchase-line-grid">
                        <Input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={line.quantity}
                          onChange={(event) => updateLine(line.key, "quantity", event.target.value)}
                          placeholder={selectedProduct?.unit ?? tr("Miqdor", "Количество")}
                        />
                        <Input
                          value={line.location}
                          onChange={(event) => updateLine(line.key, "location", event.target.value)}
                          placeholder={tr("Joylashuv", "Место")}
                        />
                      </div>
                    </div>
                    <div className="sale-line-price">
                      <span className="sale-mobile-label">{tr("Kirim narxi", "Закупочная цена")}</span>
                      <Input
                        type="number"
                        min="0"
                        value={line.purchasePrice}
                        onChange={(event) => updateLine(line.key, "purchasePrice", event.target.value)}
                      />
                    </div>
                    <div className="sale-line-discount">
                      <span className="sale-mobile-label">{tr("Sana", "Дата")}</span>
                      <Input
                        type="date"
                        value={line.purchasedAt}
                        onChange={(event) => updateLine(line.key, "purchasedAt", event.target.value)}
                      />
                    </div>
                    <div className="line-total-block">
                      <span className="sale-mobile-label">{tr("Qator jami", "Сумма строки")}</span>
                      <strong className="line-total">{money(lineTotal(line))}</strong>
                    </div>
                    <button
                      className="icon-button danger-icon sale-line-remove"
                      disabled={lines.length === 1}
                      onClick={() => removeRow(line.key)}
                      aria-label={tr("Qatorni o‘chirish", "Удалить строку")}
                    >
                      <Trash2 size={16} />
                      <span className="sale-remove-text">{tr("Qatorni o‘chirish", "Удалить строку")}</span>
                    </button>
                    <div className="unit-conversion-slot purchase-line-meta">
                      <div className="purchase-line-grid purchase-line-grid-meta">
                        <Select value={line.supplierId} onChange={(event) => updateLine(line.key, "supplierId", event.target.value)}>
                          <option value="">{tr("Yetkazib beruvchi", "Поставщик")}</option>
                          {suppliers.data?.data.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                          ))}
                        </Select>
                        <Input
                          value={line.note}
                          onChange={(event) => updateLine(line.key, "note", event.target.value)}
                          placeholder={tr("Izoh", "Примечание")}
                        />
                      </div>
                    </div>
                    <small className="line-total-note">
                      {selectedProduct
                        ? `${tr("Birlik", "Единица")}: ${selectedProduct.unit} · ${tr("Qoldiq", "Остаток")}: ${number(selectedProduct.stock_quantity)} ${selectedProduct.unit} · ${tr("Oxirgi kirim narxi", "Последняя закупочная цена")}: ${money(selectedProduct.purchase_price)}`
                        : "\u00a0"}
                    </small>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={supplierReturnOpen}
        title={tr("Yetkazib beruvchiga qaytarish", "Возврат поставщику")}
        description={tr(
          "Qaytarilgan mahsulot stockdan FIFO bo‘yicha ayriladi va sotuv sifatida hisoblanmaydi.",
          "Возвращенный товар списывается со склада по FIFO и не считается продажей."
        )}
        onClose={() => {
          setSupplierReturnOpen(false);
          setProductPickerLineKey(null);
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSupplierReturnOpen(false)}>
              {tr("Bekor qilish", "Отмена")}
            </Button>
            <Button
              loading={saveSupplierReturn.isPending}
              disabled={!canSaveSupplierReturn}
              onClick={() => saveSupplierReturn.mutate()}
            >
              <Undo2 size={16} /> {tr("Qaytarishni saqlash", "Сохранить возврат")}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <label className="field">
            <span className="field-label">{tr("Mahsulot *", "Товар *")}</span>
            <button
              type="button"
              className={`sale-product-trigger ${supplierReturnForm.productId ? "selected" : ""}`}
              onClick={() => {
                setProductPickerLineKey(SUPPLIER_RETURN_PICKER);
                setProductSearch("");
              }}
            >
              <span className="sale-product-trigger-copy">
                <strong>
                  {productById.get(supplierReturnForm.productId)?.name
                    ?? tr("Mahsulotni tanlang", "Выберите товар")}
                </strong>
                <small>
                  {productById.get(supplierReturnForm.productId)
                    ? `${tr("Qoldiq", "Остаток")}: ${number(productById.get(supplierReturnForm.productId)!.stock_quantity)} ${productById.get(supplierReturnForm.productId)!.unit}`
                    : tr("Nom, kod, kategoriya yoki joylashuv bo‘yicha qidiring", "Ищите по названию, коду, категории или месту")}
                </small>
              </span>
              <Search size={16} />
            </button>
          </label>
          <div className="form-grid">
            <Input
              label={tr("Miqdor *", "Количество *")}
              type="number"
              min="0.001"
              step="0.001"
              value={supplierReturnForm.quantity}
              onChange={(event) => setSupplierReturnForm((current) => ({
                ...current,
                quantity: event.target.value
              }))}
            />
            <Input
              label={tr("Kelishilgan qaytarish narxi, 1 dona uchun *", "Согласованная цена возврата за единицу *")}
              type="number"
              min="0.01"
              step="0.01"
              value={supplierReturnForm.agreedReturnPricePerUnit}
              onChange={(event) => setSupplierReturnForm((current) => ({
                ...current,
                agreedReturnPricePerUnit: event.target.value
              }))}
            />
            <Input
              label={tr("Sana *", "Дата *")}
              type="date"
              value={supplierReturnForm.returnedAt}
              onChange={(event) => setSupplierReturnForm((current) => ({
                ...current,
                returnedAt: event.target.value
              }))}
            />
          </div>
          <div className="supplier-return-total">
            <span>{tr("Kelishilgan jami qaytarish summasi", "Общая согласованная сумма возврата")}</span>
            <strong>{money(totalAgreedReturnAmount)}</strong>
            <small>
              {number(supplierReturnQuantity || 0)} × {money(agreedReturnPricePerUnit || 0)}
            </small>
          </div>
          {selectedSupplierReturnProduct
            && supplierReturnQuantity > Number(selectedSupplierReturnProduct.stock_quantity) ? (
              <div className="inline-note supplier-return-error">
                {tr(
                  `Miqdor mavjud qoldiqdan oshmasligi kerak: ${number(selectedSupplierReturnProduct.stock_quantity)} ${selectedSupplierReturnProduct.unit}`,
                  `Количество не должно превышать остаток: ${number(selectedSupplierReturnProduct.stock_quantity)} ${selectedSupplierReturnProduct.unit}`
                )}
              </div>
            ) : null}
          <Textarea
            label={tr("Izoh", "Примечание")}
            value={supplierReturnForm.note}
            onChange={(event) => setSupplierReturnForm((current) => ({
              ...current,
              note: event.target.value
            }))}
          />
          <div className="inline-note">
            <Undo2 size={16} />
            {tr(
              "Qaytarish foydasi = 1 dona narxi × miqdor - FIFO tannarx.",
              "Прибыль возврата = цена за единицу × количество - FIFO-себестоимость."
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        title={tr("Excel orqali kirim qilish", "Приход через Excel")}
        description={tr(
          "Bir nechta kirim qatorini oldindan tekshirib, keyin birdaniga saqlang.",
          "Проверьте несколько строк прихода заранее и сохраните их одним действием."
        )}
        onClose={() => setImportOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button
              loading={importPurchases.isPending}
              disabled={!importRows.length || hasImportErrors || parsingExcel}
              onClick={() => importPurchases.mutate()}
            >
              {tr("Importni tasdiqlash", "Подтвердить импорт")}
            </Button>
          </>
        }
      >
        <div className="excel-import">
          <div className="excel-actions">
            <Button variant="secondary" onClick={() => void downloadTemplate()}>
              <FileSpreadsheet size={16} /> {tr("Shablonni yuklash", "Скачать шаблон")}
            </Button>
            <Button variant="secondary" loading={parsingExcel} onClick={() => fileInputRef.current?.click()}>
              <FileSpreadsheet size={16} /> {tr("Excel fayl tanlash", "Выбрать файл Excel")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void parseExcel(file);
                event.target.value = "";
              }}
            />
          </div>
          {importFileName && (
            <div className={`excel-file-status ${importError ? "has-error" : ""}`}>
              <strong>{importFileName}</strong>
              <span>
                {importError || (
                  hasImportErrors
                    ? tr("Xatolar bor, tuzating", "Есть ошибки, исправьте их")
                    : `${importRows.length} ${tr("ta qator tayyor", "строк готово")}`
                )}
              </span>
            </div>
          )}
          {importRows.length > 0 && (
            <DataTable minWidth={980}>
              <thead>
                <tr>
                  <th>{tr("Qator", "Строка")}</th>
                  <th>{tr("Mahsulot", "Товар")}</th>
                  <th>{tr("Miqdor", "Количество")}</th>
                  <th>{tr("Kirim narxi", "Закупочная цена")}</th>
                  <th>{tr("Joylashuv", "Место")}</th>
                  <th>{tr("Yetkazib beruvchi", "Поставщик")}</th>
                  <th>{tr("Sana", "Дата")}</th>
                  <th>{tr("Holat", "Статус")}</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row) => (
                  <tr key={row.rowNumber} className={row.errors.length ? "table-row-error" : ""}>
                    <td data-label={tr("Qator", "Строка")}>{row.rowNumber}</td>
                    <td data-label={tr("Mahsulot", "Товар")}><strong>{row.product}</strong></td>
                    <td data-label={tr("Miqdor", "Количество")}>{number(row.quantity)}</td>
                    <td data-label={tr("Kirim narxi", "Закупочная цена")}>{money(row.purchasePrice)}</td>
                    <td data-label={tr("Joylashuv", "Место")}>{row.location || "-"}</td>
                    <td data-label={tr("Yetkazib beruvchi", "Поставщик")}>{row.supplier || "-"}</td>
                    <td data-label={tr("Sana", "Дата")}>{row.purchasedAt ? dateTime(row.purchasedAt) : "-"}</td>
                    <td data-label={tr("Holat", "Статус")}>
                      {row.errors.length
                        ? row.errors.join(", ")
                        : tr("Tayyor", "Готово")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(productPickerLineKey)}
        title={tr("Mahsulotni tanlash", "Выбор товара")}
        description={tr(
          "Nom, kod, kategoriya yoki joylashuv yozing. Qidiruv barcha mahsulotlar bo‘yicha serverda ishlaydi.",
          "Введите название, код, категорию или место. Поиск работает по всем товарам на сервере."
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
              filteredProducts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`product-picker-item ${selectedPickerProductId === item.id ? "active" : ""}`}
                  onClick={() => productPickerLineKey && chooseProduct(productPickerLineKey, item.id)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.code} · {item.category_name} · {item.unit}
                      {item.location ? ` · ${item.location}` : ""}
                    </small>
                  </span>
                  <em>{number(item.stock_quantity)} {item.unit}</em>
                </button>
              ))
            ) : (
              <div className="product-picker-empty">
                {tr("Mos mahsulot topilmadi.", "Подходящий товар не найден.")}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={supplierModal}
        title={tr("Yetkazib beruvchi qo‘shish", "Добавить поставщика")}
        onClose={() => setSupplierModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSupplierModal(false)}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button
              loading={addSupplier.isPending}
              disabled={supplierName.trim().length < 2}
              onClick={() => addSupplier.mutate()}
            >
              {tr("Qo‘shish", "Добавить")}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Input label={tr("Nomi *", "Название *")} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          <Input label={tr("Telefon", "Телефон")} value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
          <div className="inline-note"><Truck size={16} /> {tr("Yetkazib beruvchi keyingi kirimlarda ham tanlash uchun saqlanadi.", "Поставщик сохранится для следующих приходов.")}</div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingPurchase)}
        title={tr("Kirimni o'chirish", "Delete purchase")}
        message={tr(
          "Bu kirim hali sotuvlarda ishlatilmagan bo'lsa, stock va FIFO batchdan olib tashlanadi.",
          "This purchase will be removed from stock and FIFO if it has not been used in sales."
        )}
        loading={removePurchase.isPending}
        onCancel={() => setDeletingPurchase(null)}
        onConfirm={() => deletingPurchase && removePurchase.mutate(deletingPurchase.id)}
      />
      <ConfirmDialog
        open={Boolean(deletingSupplierReturn)}
        title={tr("Yetkazib beruvchiga qaytarishni o‘chirish", "Удалить возврат поставщику")}
        message={tr(
          "Qaytarishni o‘chirsangiz, mahsulot aniq FIFO batchlariga va ombor qoldig‘iga tiklanadi. Hisobotlar ham qayta hisoblanadi.",
          "При удалении возврата товар будет восстановлен в исходных FIFO-партиях и на складе. Отчеты будут пересчитаны."
        )}
        loading={removeSupplierReturn.isPending}
        onCancel={() => setDeletingSupplierReturn(null)}
        onConfirm={() => deletingSupplierReturn && removeSupplierReturn.mutate(deletingSupplierReturn.id)}
      />
    </>
  );
}
