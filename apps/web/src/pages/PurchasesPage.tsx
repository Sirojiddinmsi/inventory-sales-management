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
import type {
  Contact,
  Paginated,
  Product,
  Purchase,
  PurchaseDocument,
  SupplierReturn,
  SupplierReturnDocument
} from "../types/api";

type PurchaseLine = {
  key: string;
  id?: string;
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

type SupplierReturnLine = {
  key: string;
  productId: string;
  productName?: string;
  productCode?: string;
  quantity: string;
  agreedReturnPricePerUnit: string;
  note: string;
};

const SUPPLIER_RETURN_PICKER = "__supplier_return__";

const newSupplierReturnLine = (defaults?: Partial<SupplierReturnLine>): SupplierReturnLine => ({
  key: crypto.randomUUID(),
  productId: defaults?.productId ?? "",
  productName: defaults?.productName,
  productCode: defaults?.productCode,
  quantity: defaults?.quantity ?? "1",
  agreedReturnPricePerUnit: defaults?.agreedReturnPricePerUnit ?? "",
  note: defaults?.note ?? ""
});

const newSupplierReturnDate = () => new Date().toISOString().slice(0, 10);

const newSupplierReturnForm = () => ({
  productId: "",
  quantity: "1",
  agreedReturnPricePerUnit: "",
  returnedAt: newSupplierReturnDate(),
  note: ""
});

const newPurchaseLine = (defaults?: Partial<PurchaseLine>): PurchaseLine => ({
  key: crypto.randomUUID(),
  id: defaults?.id,
  supplierId: defaults?.supplierId ?? "",
  productId: defaults?.productId ?? "",
  productName: defaults?.productName,
  productCode: defaults?.productCode,
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
  const [supplierReturnDate, setSupplierReturnDate] = useState(newSupplierReturnDate);
  const [supplierReturnNote, setSupplierReturnNote] = useState("");
  const [returnLines, setReturnLines] = useState<SupplierReturnLine[]>([newSupplierReturnLine()]);
  const [expandedReturnDocumentIds, setExpandedReturnDocumentIds] = useState<string[]>([]);
  const [deletingSupplierReturn, setDeletingSupplierReturn] = useState<SupplierReturnDocument | null>(null);
  const [editingDocument, setEditingDocument] = useState<PurchaseDocument | null>(null);
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
    queryFn: () => api<Paginated<SupplierReturnDocument>>("/supplier-returns", {
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

  const save = useMutation<{ totalRows: number; totalAmount: number }, Error>({
    mutationFn: () =>
      editingDocument
        ? api<{ totalRows: number; totalAmount: number }>(`/purchases/documents/${editingDocument.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              rows: lines.map((line) => ({
                id: line.id,
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
      if (editingDocument) {
        toast.success(tr("Kirim yozuvi yangilandi", "Приход обновлен"));
      } else {
        toast.success(
          `${result.totalRows} ta mahsulot kirim qilindi. Jami: ${money(result.totalAmount)}`
        );
      }
      setModalOpen(false);
      setEditingDocument(null);
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
    mutationFn: () => api<SupplierReturnDocument>("/supplier-returns/documents", {
      method: "POST",
      body: JSON.stringify({
        returnedAt: supplierReturnDate
          ? new Date(`${supplierReturnDate}T12:00:00`).toISOString()
          : undefined,
        note: supplierReturnNote || null,
        rows: returnLines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          agreedReturnPricePerUnit: Number(line.agreedReturnPricePerUnit),
          note: line.note || null
        }))
      })
    }),
    onSuccess: () => {
      toast.success(tr("Mahsulot yetkazib beruvchiga qaytarildi", "Возврат поставщику сохранен"));
      setSupplierReturnOpen(false);
      setReturnLines([newSupplierReturnLine()]);
      setSupplierReturnNote("");
      setSupplierReturnDate(newSupplierReturnDate());
      setActiveView("returns");
      refresh();
    },
    onError: (error) => toast.error(error.message)
  });

  const removeSupplierReturn = useMutation({
    mutationFn: (id: string) => api<{ deleted: boolean }>(`/supplier-returns/documents/${id}`, {
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
  const selectedReturnPickerLine = productPickerLineKey?.startsWith(`${SUPPLIER_RETURN_PICKER}:`)
    ? returnLines.find((line) => `${SUPPLIER_RETURN_PICKER}:${line.key}` === productPickerLineKey) ?? null
    : null;
  const selectedPickerProductId = selectedReturnPickerLine?.productId
    ?? (productPickerLineKey === SUPPLIER_RETURN_PICKER ? returnLines[0]?.productId : selectedPickerLine?.productId);
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
    (line) =>
      line.productId
      && Number(line.quantity) > 0
      && line.purchasePrice !== ""
      && Number(line.purchasePrice) >= 0
      && Boolean(line.purchasedAt)
  );
  const returnLineTotalAgreed = (line: SupplierReturnLine) =>
    Number(line.quantity || 0) * Number(line.agreedReturnPricePerUnit || 0);
  const returnTotals = useMemo(() => ({
    quantity: returnLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
    agreed: returnLines.reduce((sum, line) => sum + returnLineTotalAgreed(line), 0)
  }), [returnLines]);
  const canSaveSupplierReturn = Boolean(
    supplierReturnDate
    && returnLines.length > 0
    && returnLines.every((line) => {
      const selectedProduct = productById.get(line.productId);
      return line.productId
        && Number(line.quantity) > 0
        && Number(line.quantity) <= Number(selectedProduct?.stock_quantity ?? 0)
        && line.agreedReturnPricePerUnit !== ""
        && Number(line.agreedReturnPricePerUnit) >= 0;
    })
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
    setEditingDocument(null);
    setDefaultPurchasedAt(initialDate);
    setDefaultSupplierId("");
    setSelectedProducts({});
    setProductPickerLineKey(null);
    setProductSearch("");
    setLines([newPurchaseLine({ purchasedAt: initialDate })]);
    setModalOpen(true);
  };

  const openEditDocument = (document: PurchaseDocument) => {
    setEditingDocument(document);
    const firstLine = document.items[0];
    setDefaultSupplierId(firstLine?.supplier_id ?? "");
    setDefaultPurchasedAt(document.purchased_at.slice(0, 10));
    setSelectedProducts({});
    setProductPickerLineKey(null);
    setProductSearch("");
    setLines(document.items.map((purchase) =>
      newPurchaseLine({
        id: purchase.id,
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
    ));
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
    if (lineKey === SUPPLIER_RETURN_PICKER || lineKey.startsWith(`${SUPPLIER_RETURN_PICKER}:`)) {
      const returnKey = lineKey === SUPPLIER_RETURN_PICKER
        ? returnLines[0]?.key
        : lineKey.slice(SUPPLIER_RETURN_PICKER.length + 1);
      if (returnKey) {
        setReturnLines((current) => current.map((line) =>
          line.key === returnKey
            ? {
                ...line,
                productId,
                productName: product?.name,
                productCode: product?.code,
                agreedReturnPricePerUnit: product && !line.agreedReturnPricePerUnit
                  ? String(product.purchase_price)
                  : line.agreedReturnPricePerUnit
              }
            : line
        ));
      }
    } else {
      updateLine(lineKey, "productId", productId);
    }
    setProductPickerLineKey(null);
    setProductSearch("");
  };

  const openSupplierReturn = () => {
    setSupplierReturnDate(newSupplierReturnDate());
    setSupplierReturnNote("");
    setReturnLines([newSupplierReturnLine()]);
    setSelectedProducts({});
    setProductPickerLineKey(null);
    setProductSearch("");
    setSupplierReturnOpen(true);
  };

  const addReturnLine = () => setReturnLines((current) => [...current, newSupplierReturnLine()]);
  const removeReturnLine = (key: string) =>
    setReturnLines((current) => current.length === 1 ? current : current.filter((line) => line.key !== key));
  const updateReturnLine = (
    key: string,
    field: keyof Omit<SupplierReturnLine, "key">,
    value: string
  ) => {
    setReturnLines((current) => current.map((line) =>
      line.key === key ? { ...line, [field]: value } : line
    ));
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
                          className="icon-button"
                          onClick={() => openEditDocument(document)}
                          title={tr("Hujjatni tahrirlash", "Редактировать документ")}
                        >
                          <Edit3 size={16} />
                        </button>
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
                                  onClick={() => openEditDocument(document)}
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
          <DataTable loading={supplierReturns.isLoading} empty={!supplierReturns.data?.data.length} minWidth={1180}>
            <thead>
              <tr>
                <th>{tr("Qaytarish hujjati", "\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0430")}</th>
                <th>{tr("Sana", "\u0414\u0430\u0442\u0430")}</th>
                <th>{tr("Mahsulot qatorlari", "\u0421\u0442\u0440\u043e\u043a \u0442\u043e\u0432\u0430\u0440\u043e\u0432")}</th>
                <th>{tr("Jami miqdor", "\u041e\u0431\u0449\u0435\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}</th>
                <th>{tr("FIFO tannarx", "FIFO-\u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c")}</th>
                <th>{tr("Kelishilgan jami summa", "\u041e\u0431\u0449\u0430\u044f \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0441\u0443\u043c\u043c\u0430")}</th>
                <th>{tr("Qaytarish foydasi", "\u041f\u0440\u0438\u0431\u044b\u043b\u044c \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0430")}</th>
                <th>{tr("Izoh", "\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435")}</th>
                <th>{tr("Kiritgan", "\u0414\u043e\u0431\u0430\u0432\u0438\u043b")}</th>
                <th>{tr("Amallar", "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f")}</th>
              </tr>
            </thead>
            <tbody>
              {supplierReturns.data?.data.map((document) => {
                const expanded = expandedReturnDocumentIds.includes(document.id);
                return (
                  <Fragment key={document.id}>
                    <tr className={expanded ? "purchase-document-row expanded" : "purchase-document-row"}>
                      <td data-label={tr("Qaytarish hujjati", "\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0430")}>
                        <div className="purchase-document-number">
                          <span className="product-avatar"><Undo2 size={17} /></span>
                          <strong>{document.document_number}</strong>
                        </div>
                      </td>
                      <td data-label={tr("Sana", "\u0414\u0430\u0442\u0430")}>{dateTime(document.returned_at)}</td>
                      <td data-label={tr("Mahsulot qatorlari", "\u0421\u0442\u0440\u043e\u043a \u0442\u043e\u0432\u0430\u0440\u043e\u0432")}><strong>{document.line_count}</strong></td>
                      <td data-label={tr("Jami miqdor", "\u041e\u0431\u0449\u0435\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}><strong>{number(document.total_quantity)}</strong></td>
                      <td data-label={tr("FIFO tannarx", "FIFO-\u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c")}>{money(document.total_fifo_cost)}</td>
                      <td data-label={tr("Kelishilgan jami summa", "\u041e\u0431\u0449\u0430\u044f \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0441\u0443\u043c\u043c\u0430")}>{money(document.total_agreed_return_amount)}</td>
                      <td data-label={tr("Qaytarish foydasi", "\u041f\u0440\u0438\u0431\u044b\u043b\u044c \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0430")} className={document.total_supplier_return_profit >= 0 ? "positive" : "negative"}>
                        <strong>{money(document.total_supplier_return_profit)}</strong>
                      </td>
                      <td data-label={tr("Izoh", "\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435")}>{document.note || "-"}</td>
                      <td data-label={tr("Kiritgan", "\u0414\u043e\u0431\u0430\u0432\u0438\u043b")}>{document.created_by_name}</td>
                      <td data-label={tr("Amallar", "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f")}>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-button purchase-document-toggle"
                            onClick={() => setExpandedReturnDocumentIds((current) =>
                              current.includes(document.id)
                                ? current.filter((id) => id !== document.id)
                                : [...current, document.id]
                            )}
                            aria-expanded={expanded}
                          >
                            {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                          </button>
                          <button
                            className="icon-button danger-icon"
                            onClick={() => setDeletingSupplierReturn(document)}
                            title={tr("Qaytarishni o‘chirish", "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u043e\u0437\u0432\u0440\u0430\u0442")}
                            aria-label={tr("Qaytarishni o‘chirish", "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u043e\u0437\u0432\u0440\u0430\u0442")}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="purchase-document-detail-row">
                        <td colSpan={10} className="purchase-document-detail-cell">
                          <div className="purchase-document-items supplier-return-items">
                            <div className="purchase-document-item purchase-document-item-head supplier-return-item">
                              <span>{tr("Mahsulot", "\u0422\u043e\u0432\u0430\u0440")}</span>
                              <span>{tr("Miqdor", "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}</span>
                              <span>{tr("FIFO tannarx", "FIFO-\u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c")}</span>
                              <span>{tr("1 dona narx", "\u0426\u0435\u043d\u0430 \u0437\u0430 \u0435\u0434\u0438\u043d\u0438\u0446\u0443")}</span>
                              <span>{tr("Jami summa", "\u0418\u0442\u043e\u0433\u043e")}</span>
                              <span>{tr("Foyda", "\u041f\u0440\u0438\u0431\u044b\u043b\u044c")}</span>
                            </div>
                            {document.items.map((item) => (
                              <div className="purchase-document-item supplier-return-item" key={item.id}>
                                <div data-label={tr("Mahsulot", "\u0422\u043e\u0432\u0430\u0440")}>
                                  <strong>{item.product_name}</strong>
                                  {item.note ? <small title={item.note}>{item.note}</small> : null}
                                </div>
                                <span data-label={tr("Miqdor", "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}><strong>{number(item.quantity)} {item.unit}</strong></span>
                                <span data-label={tr("FIFO tannarx", "FIFO-\u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c")}>{money(item.fifo_cost)}</span>
                                <span data-label={tr("1 dona narx", "\u0426\u0435\u043d\u0430 \u0437\u0430 \u0435\u0434\u0438\u043d\u0438\u0446\u0443")}>{money(item.agreed_return_price_per_unit)}</span>
                                <span data-label={tr("Jami summa", "\u0418\u0442\u043e\u0433\u043e")}><strong>{money(item.total_agreed_return_amount)}</strong></span>
                                <span data-label={tr("Foyda", "\u041f\u0440\u0438\u0431\u044b\u043b\u044c")} className={item.supplier_return_profit >= 0 ? "positive" : "negative"}>
                                  <strong>{money(item.supplier_return_profit)}</strong>
                                </span>
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
        title={editingDocument ? tr("Kirim hujjatini tahrirlash", "Редактировать документ прихода") : tr("Yangi kirim hujjati", "New purchase")}
        description={editingDocument
          ? tr("O‘zgarishlar stock va FIFO batchga qo‘llanadi.", "Changes will update stock and the FIFO batch.")
          : tr(
              "Bir nechta qatorni bir vaqtning o‘zida saqlang. Har bir qator alohida FIFO batch bo‘ladi.",
              "Сохраняйте несколько строк сразу. Каждая строка станет отдельной FIFO партией."
            )}
        onClose={() => { setModalOpen(false); setEditingDocument(null); }}
        wide
        footer={
          <>
            <div className="modal-total">
              <span>{tr("Hujjat jami", "Итого по документу")}</span>
              <strong>{money(total)}</strong>
            </div>
            <Button variant="secondary" onClick={() => { setModalOpen(false); setEditingDocument(null); }}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button
              loading={save.isPending}
              disabled={!canSave}
              onClick={() => {
                if (editingDocument && !window.confirm("Kirimdagi o'zgarishlar stock va FIFO batchni qayta hisoblaydi. Davom etasizmi?")) return;
                save.mutate();
              }}
            >
              {editingDocument ? tr("O‘zgarishlarni saqlash", "Save changes") : tr("Kirimni saqlash", "Сохранить приход")}
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
              <Button variant="secondary" size="sm" onClick={addRow}>
                <Plus size={14} /> {tr("Mahsulot qatori qo‘shish", "Добавить строку товара")}
              </Button>
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
            {!canSave ? (
              <div className="inline-note">
                {tr(
                  "Har bir qator uchun mahsulot, miqdor, kirim narxi va sana to‘ldirilishi kerak.",
                  "Для каждой строки нужно указать товар, количество, закупочную цену и дату."
                )}
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={supplierReturnOpen}
        title={tr("Yetkazib beruvchiga qaytarish", "\u0412\u043e\u0437\u0432\u0440\u0430\u0442 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0443")}
        description={tr(
          "Bir hujjatda bir nechta mahsulotni FIFO bo‘yicha qaytaring. Bu sotuv sifatida hisoblanmaydi.",
          "\u0412\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0439\u0442\u0435 \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0442\u043e\u0432\u0430\u0440\u043e\u0432 \u0432 \u043e\u0434\u043d\u043e\u043c \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0435 \u043f\u043e FIFO. \u042d\u0442\u043e \u043d\u0435 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f \u043f\u0440\u043e\u0434\u0430\u0436\u0435\u0439."
        )}
        onClose={() => {
          setSupplierReturnOpen(false);
          setProductPickerLineKey(null);
        }}
        wide
        footer={
          <>
            <div className="modal-total">
              <span>{tr("Kelishilgan jami summa", "\u041e\u0431\u0449\u0430\u044f \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0441\u0443\u043c\u043c\u0430")}</span>
              <strong>{money(returnTotals.agreed)}</strong>
            </div>
            <Button variant="secondary" onClick={() => setSupplierReturnOpen(false)}>
              {tr("Bekor qilish", "\u041e\u0442\u043c\u0435\u043d\u0430")}
            </Button>
            <Button
              loading={saveSupplierReturn.isPending}
              disabled={!canSaveSupplierReturn}
              onClick={() => saveSupplierReturn.mutate()}
            >
              <Undo2 size={16} /> {tr("Qaytarishni saqlash", "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0432\u043e\u0437\u0432\u0440\u0430\u0442")}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <div className="sale-section">
            <div className="section-title">
              <div><Truck size={17} /><strong>{tr("Umumiy sozlamalar", "\u041e\u0431\u0449\u0438\u0435 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b")}</strong></div>
            </div>
            <div className="sale-section form-grid">
              <Input
                label={tr("Hujjat sanasi *", "\u0414\u0430\u0442\u0430 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430 *")}
                type="date"
                value={supplierReturnDate}
                onChange={(event) => setSupplierReturnDate(event.target.value)}
              />
              <Input
                label={tr("Umumiy izoh", "\u041e\u0431\u0449\u0435\u0435 \u043f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435")}
                value={supplierReturnNote}
                onChange={(event) => setSupplierReturnNote(event.target.value)}
              />
            </div>
          </div>

          <div className="sale-section">
            <div className="section-title">
              <div><Undo2 size={17} /><strong>{tr("Qaytarish qatorlari", "\u0421\u0442\u0440\u043e\u043a\u0438 \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0430")}</strong></div>
              <Button variant="secondary" size="sm" onClick={addReturnLine}>
                <Plus size={14} /> {tr("Mahsulot qatori qo‘shish", "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443 \u0442\u043e\u0432\u0430\u0440\u0430")}
              </Button>
            </div>
            <div className="sale-lines">
              {returnLines.map((line, index) => {
                const selectedProduct = productById.get(line.productId);
                const quantity = Number(line.quantity || 0);
                const agreedUnitPrice = Number(line.agreedReturnPricePerUnit || 0);
                const totalAgreed = returnLineTotalAgreed(line);
                const overStock = selectedProduct && quantity > Number(selectedProduct.stock_quantity);
                return (
                  <div className="sale-line purchase-line" key={line.key}>
                    <span className="line-number">{index + 1}</span>
                    <div className="sale-line-product">
                      <span className="sale-mobile-label">{tr("Mahsulot", "\u0422\u043e\u0432\u0430\u0440")}</span>
                      <button
                        type="button"
                        className={`sale-product-trigger ${line.productId ? "selected" : ""}`}
                        onClick={() => {
                          setProductPickerLineKey(`${SUPPLIER_RETURN_PICKER}:${line.key}`);
                          setProductSearch("");
                        }}
                      >
                        <span className="sale-product-trigger-copy">
                          <strong>{selectedProduct?.name ?? line.productName ?? tr("Mahsulotni tanlang", "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u043e\u0432\u0430\u0440")}</strong>
                          <small>
                            {selectedProduct
                              ? `${tr("Qoldiq", "\u041e\u0441\u0442\u0430\u0442\u043e\u043a")}: ${number(selectedProduct.stock_quantity)} ${selectedProduct.unit}`
                              : tr("Nom, kod, kategoriya yoki joylashuv bo‘yicha qidiring", "\u0418\u0449\u0438\u0442\u0435 \u043f\u043e \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044e, \u043a\u043e\u0434\u0443, \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438 \u0438\u043b\u0438 \u043c\u0435\u0441\u0442\u0443")}
                          </small>
                        </span>
                        <Search size={16} />
                      </button>
                    </div>
                    <div className="sale-line-quantity">
                      <span className="sale-mobile-label">{tr("Miqdor", "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}</span>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={line.quantity}
                        onChange={(event) => updateReturnLine(line.key, "quantity", event.target.value)}
                      />
                    </div>
                    <div className="sale-line-price">
                      <span className="sale-mobile-label">{tr("1 dona qaytarish narxi", "\u0426\u0435\u043d\u0430 \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0430 \u0437\u0430 \u0435\u0434\u0438\u043d\u0438\u0446\u0443")}</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.agreedReturnPricePerUnit}
                        onChange={(event) => updateReturnLine(line.key, "agreedReturnPricePerUnit", event.target.value)}
                      />
                    </div>
                    <div className="sale-line-discount">
                      <span className="sale-mobile-label">{tr("Izoh", "\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435")}</span>
                      <Input
                        value={line.note}
                        onChange={(event) => updateReturnLine(line.key, "note", event.target.value)}
                        placeholder={tr("Izoh", "\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435")}
                      />
                    </div>
                    <div className="line-total-block">
                      <span className="sale-mobile-label">{tr("Kelishilgan jami", "\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043e \u0432\u0441\u0435\u0433\u043e")}</span>
                      <strong className="line-total">{money(totalAgreed)}</strong>
                    </div>
                    <button
                      className="icon-button danger-icon sale-line-remove"
                      disabled={returnLines.length === 1}
                      onClick={() => removeReturnLine(line.key)}
                      aria-label={tr("Qatorni o‘chirish", "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443")}
                    >
                      <Trash2 size={16} />
                      <span className="sale-remove-text">{tr("Qatorni o‘chirish", "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443")}</span>
                    </button>
                    <small className={`line-total-note ${overStock ? "supplier-return-error" : ""}`}>
                      {selectedProduct
                        ? overStock
                          ? tr(
                              `Miqdor mavjud qoldiqdan oshmasligi kerak: ${number(selectedProduct.stock_quantity)} ${selectedProduct.unit}`,
                              `\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e \u043d\u0435 \u0434\u043e\u043b\u0436\u043d\u043e \u043f\u0440\u0435\u0432\u044b\u0448\u0430\u0442\u044c \u043e\u0441\u0442\u0430\u0442\u043e\u043a: ${number(selectedProduct.stock_quantity)} ${selectedProduct.unit}`
                            )
                          : `${number(quantity || 0)} ? ${money(agreedUnitPrice || 0)} = ${money(totalAgreed)}`
                        : " "}
                    </small>
                  </div>
                );
              })}
            </div>
            {!canSaveSupplierReturn ? (
              <div className="inline-note">
                {tr(
                  "Har bir qator uchun mahsulot, miqdor, narx va yetarli qoldiq kerak.",
                  "\u0414\u043b\u044f \u043a\u0430\u0436\u0434\u043e\u0439 \u0441\u0442\u0440\u043e\u043a\u0438 \u043d\u0443\u0436\u0435\u043d \u0442\u043e\u0432\u0430\u0440, \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e, \u0446\u0435\u043d\u0430 \u0438 \u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u044b\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a."
                )}
              </div>
            ) : null}
          </div>

          <div className="supplier-return-total supplier-return-document-total">
            <span>{tr("Hujjat jami", "\u0418\u0442\u043e\u0433\u043e \u043f\u043e \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0443")}</span>
            <strong>{money(returnTotals.agreed)}</strong>
            <small>
              {tr("Jami miqdor", "\u041e\u0431\u0449\u0435\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e")}: {number(returnTotals.quantity)} · {tr("FIFO tannarx saqlangandan keyin hisoblanadi", "FIFO-\u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c \u0431\u0443\u0434\u0435\u0442 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043d\u0430 \u043f\u043e\u0441\u043b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f")}
            </small>
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
