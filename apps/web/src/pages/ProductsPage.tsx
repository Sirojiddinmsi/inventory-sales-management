import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileSpreadsheet,
  History,
  ImageOff,
  MapPin,
  Plus,
  Tags,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import toast from "react-hot-toast";
import { readSheet } from "read-excel-file/browser";
import { useSearchParams } from "react-router-dom";
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
import { api, download, downloadPost } from "../lib/api";
import { dateTime, money, number, toIsoEndOfDay, toIsoFromDateInput } from "../lib/format";
import type {
  Category,
  MeasurementUnit,
  Paginated,
  Product,
  ProductHistory,
  ProductMovementType
} from "../types/api";

type ProductForm = {
  name: string;
  categoryId: string;
  unit: string;
  purchasePrice: string;
  salePrice: string;
  stockQuantity: string;
  minimumStock: string;
  location: string;
  imageUrls: string[];
  description: string;
};

const emptyForm: ProductForm = {
  name: "",
  categoryId: "",
  unit: "dona",
  purchasePrice: "",
  salePrice: "",
  stockQuantity: "0",
  minimumStock: "0",
  location: "",
  imageUrls: [],
  description: ""
};

type ImportRow = {
  rowNumber: number;
  name: string;
  category: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  minimumStock: number;
  location: string | null;
  description: string | null;
};

type ImportResult = {
  totalRows: number;
  created: number;
  updated: number;
  importedQuantity: number;
};

const PRODUCT_PAGE_SIZE_KEY = "products.pageSize";
const productPageSizeOptions = [15, 25, 50, 100] as const;

function ProductImage({
  src,
  alt,
  fallbackLabel,
  fallbackCompact = false,
  className,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  fallbackLabel: string;
  fallbackCompact?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (failed) {
    return (
      <span className={`product-image-fallback ${fallbackCompact ? "compact" : ""} ${className ?? ""}`}>
        <ImageOff size={fallbackCompact ? 18 : 32} />
        {!fallbackCompact ? <span>{fallbackLabel}</span> : null}
      </span>
    );
  }

  return <img {...props} className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}

const headerAliases: Record<keyof Omit<ImportRow, "rowNumber">, string[]> = {
  name: ["nomi", "name", "mahsulot nomi", "product name"],
  category: ["kategoriya", "category"],
  unit: ["birlik", "unit"],
  purchasePrice: ["kirim narxi", "purchase price"],
  salePrice: ["tavsiya sotuv narxi", "sotuv narxi", "sale price"],
  quantity: ["miqdor", "qoldiq", "quantity", "stock"],
  minimumStock: ["minimal qoldiq", "minimum stock"],
  location: ["joylashuv", "location", "polka", "yashik", "shelf", "box"],
  description: ["tavsif", "description"]
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("*", "")
    .replace(/[‘’ʻʼ']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numericCell(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readProductPageSize() {
  const fallback = 50;
  try {
    const stored = Number(window.localStorage.getItem(PRODUCT_PAGE_SIZE_KEY));
    return productPageSizeOptions.includes(stored as (typeof productPageSizeOptions)[number])
      ? stored
      : fallback;
  } catch {
    return fallback;
  }
}

export function ProductsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { tr } = useI18n();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readProductPageSize);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkLocation, setBulkLocation] = useState("");
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [parsingExcel, setParsingExcel] = useState(false);
  const [previewGallery, setPreviewGallery] = useState<{
    name: string;
    images: string[];
    index: number;
  } | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyType, setHistoryType] = useState<ProductMovementType | "">("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewTouchStartX = useRef<number | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const categories = useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => api<Paginated<Category>>("/categories", { params: { limit: 100, sortOrder: "asc" } })
  });
  const units = useQuery({
    queryKey: ["units"],
    queryFn: () => api<MeasurementUnit[]>("/units")
  });

  const products = useQuery({
    queryKey: ["products", page, pageSize, search, categoryId, locationFilter, lowStock],
    queryFn: () =>
      api<Paginated<Product>>("/products", {
        params: {
          page,
          limit: pageSize,
          search,
          categoryId,
          location: locationFilter,
          lowStock: lowStock || undefined,
          sortBy: "id",
          sortOrder: "asc"
        }
      })
  });
  const productHistory = useQuery({
    queryKey: ["product-history", historyProduct?.id, historyFrom, historyTo, historyType],
    queryFn: () =>
      api<ProductHistory>(`/products/${historyProduct!.id}/history`, {
        params: {
          from: toIsoFromDateInput(historyFrom),
          to: toIsoEndOfDay(historyTo),
          movementType: historyType || undefined
        }
      }),
    enabled: Boolean(historyProduct)
  });
  const visibleProductIds = products.data?.data.map((product) => product.id) ?? [];
  const tableInstanceKey = [
    page,
    pageSize,
    search,
    categoryId,
    locationFilter,
    lowStock ? "1" : "0"
  ].join(":");
  const selectedCount = selectedProductIds.length;
  const visibleSelectedCount = visibleProductIds.filter((id) =>
    selectedProductIds.includes(id)
  ).length;
  const allVisibleSelected =
    visibleProductIds.length > 0 && visibleSelectedCount === visibleProductIds.length;

  useEffect(() => setPage(1), [pageSize, search, categoryId, locationFilter, lowStock]);
  useEffect(() => {
    window.localStorage.setItem(PRODUCT_PAGE_SIZE_KEY, String(pageSize));
  }, [pageSize]);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        visibleSelectedCount > 0 && !allVisibleSelected;
    }
  }, [allVisibleSelected, visibleSelectedCount]);
  useEffect(() => {
    if (searchParams.get("import") === "1") {
      setImportOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  useEffect(() => {
    if (!previewGallery) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setPreviewGallery((current) =>
          current
            ? {
                ...current,
                index: current.index === 0 ? current.images.length - 1 : current.index - 1
              }
            : current
        );
      }
      if (event.key === "ArrowRight") {
        setPreviewGallery((current) =>
          current
            ? {
                ...current,
                index: current.index === current.images.length - 1 ? 0 : current.index + 1
              }
            : current
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewGallery]);
  useEffect(() => {
    if (!import.meta.env.DEV || !products.data) return;
    console.debug("[Products pagination debug]", {
      page,
      pageSize,
      total: products.data.meta.total,
      ids: products.data.data.map((product) => product.id),
      names: products.data.data.map((product) => product.name)
    });
  }, [page, pageSize, products.data]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        categoryId: form.categoryId,
        unit: form.unit,
        purchasePrice: Number(form.purchasePrice),
        salePrice: Number(form.salePrice || 0),
        stockQuantity: Number(form.stockQuantity),
        minimumStock: Number(form.minimumStock),
        location: form.location || null,
        imageUrl: form.imageUrls[0] || null,
        imageUrls: form.imageUrls,
        description: form.description || null
      };
      return api<Product>(editing ? `/products/${editing.id}` : "/products", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Mahsulot yangilandi" : "Mahsulot qo‘shildi");
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Mahsulot butunlay o‘chirildi");
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const bulkDelete = useMutation({
    mutationFn: () =>
      api<{ deleted: number }>("/products/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: selectedProductIds })
      }),
    onSuccess: (result) => {
      toast.success(`${result.deleted} ta mahsulot butunlay o'chirildi`);
      setBulkDeleteOpen(false);
      setSelectedProductIds([]);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const bulkMove = useMutation({
    mutationFn: () =>
      api<{ updated: number }>("/products/bulk-location", {
        method: "POST",
        body: JSON.stringify({
          ids: selectedProductIds,
          location: bulkLocation.trim()
        })
      }),
    onSuccess: (result) => {
      toast.success(`${result.updated} ta mahsulot joylashuvi yangilandi`);
      setBulkMoveOpen(false);
      setBulkLocation("");
      setSelectedProductIds([]);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const bulkChangeCategory = useMutation({
    mutationFn: () =>
      api<{ updated: number }>("/products/bulk-category", {
        method: "POST",
        body: JSON.stringify({
          ids: selectedProductIds,
          categoryId: bulkCategoryId
        })
      }),
    onSuccess: (result) => {
      toast.success(`${result.updated} ta mahsulot kategoriyasi yangilandi`);
      setBulkCategoryOpen(false);
      setBulkCategoryId("");
      setSelectedProductIds([]);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const uploadImages = useMutation({
    mutationFn: async (files: File[]) => {
      if (form.imageUrls.length + files.length > 4) {
        throw new Error(tr("Jami 4 tagacha rasm tanlash mumkin", "Можно выбрать не более 4 изображений"));
      }
      const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
      for (const file of files) {
        if (!allowedTypes.has(file.type)) {
          throw new Error(tr(
            "Faqat JPG, PNG yoki WebP rasmlarini yuklash mumkin",
            "Можно загружать только изображения JPG, PNG или WebP"
          ));
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(tr(
            "Har bir rasm hajmi 5 MB dan oshmasligi kerak",
            "Размер каждого изображения не должен превышать 5 МБ"
          ));
        }
      }
      const body = new FormData();
      files.forEach((file) => body.append("images", file));
      return api<{ urls: string[] }>("/products/images", { method: "POST", body });
    },
    onSuccess: ({ urls }) => {
      setForm((current) => ({
        ...current,
        imageUrls: [...current.imageUrls, ...urls].slice(0, 4)
      }));
      toast.success(tr("Rasm yuklandi", "Изображение загружено"));
    },
    onError: (error) => toast.error(error.message)
  });

  const importProducts = useMutation({
    mutationFn: () =>
      api<ImportResult>("/products/import", {
        method: "POST",
        body: JSON.stringify({ rows: importRows })
      }),
    onSuccess: (result) => {
      toast.success(
        `${result.created} ta yangi, ${result.updated} ta yangilandi. Stock: +${number(result.importedQuantity)}`
      );
      setImportOpen(false);
      setImportRows([]);
      setImportFileName("");
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      categoryId: categories.data?.data[0]?.id ?? "",
      unit: units.data?.[0]?.name ?? "dona"
    });
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({
      name: product.name,
      categoryId: product.category_id,
      unit: product.unit,
      purchasePrice: String(product.purchase_price),
      salePrice: String(product.sale_price),
      stockQuantity: String(product.stock_quantity),
      minimumStock: String(product.minimum_stock),
      location: product.location ?? "",
      imageUrls: [
        ...(product.image_urls?.length ? product.image_urls : product.image_url ? [product.image_url] : [])
      ],
      description: product.description ?? ""
    });
    setModalOpen(true);
  };

  const update = (key: keyof ProductForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const openPreview = (product: Product, index = 0) => {
    const images = product.image_urls?.length
      ? product.image_urls
      : product.image_url
        ? [product.image_url]
        : [];
    if (!images.length) return;
    setPreviewGallery({
      name: product.name,
      images,
      index: Math.min(index, images.length - 1)
    });
  };
  const showPreviousPreviewImage = () =>
    setPreviewGallery((current) =>
      current
        ? {
            ...current,
            index: current.index === 0 ? current.images.length - 1 : current.index - 1
          }
        : current
    );
  const showNextPreviewImage = () =>
    setPreviewGallery((current) =>
      current
        ? {
            ...current,
            index: current.index === current.images.length - 1 ? 0 : current.index + 1
          }
        : current
    );

  const removeImage = (index: number) =>
    setForm((current) => ({
      ...current,
      imageUrls: current.imageUrls.filter((_, imageIndex) => imageIndex !== index)
    }));

  const valid =
    form.name.trim() &&
    form.categoryId &&
    form.unit.trim() &&
    form.purchasePrice !== "";

  const parseExcel = async (file: File) => {
    setParsingExcel(true);
    setImportError("");
    setImportRows([]);
    setImportFileName(file.name);

    try {
      const sheet = await readSheet(file);
      if (sheet.length < 2) throw new Error("Excel faylda ma’lumot qatorlari yo‘q");

      const headers = sheet[0]!.map(normalizeHeader);
      const columnIndex = Object.fromEntries(
        Object.entries(headerAliases).map(([key, aliases]) => [
          key,
          headers.findIndex((header) => aliases.includes(header))
        ])
      ) as Record<keyof Omit<ImportRow, "rowNumber">, number>;

      for (const required of ["name", "category", "purchasePrice", "quantity"] as const) {
        if (columnIndex[required] < 0) {
          throw new Error(`Majburiy ustun topilmadi: ${headerAliases[required][0]}`);
        }
      }

      const parsed = sheet.slice(1).flatMap((row, index) => {
        const value = (key: keyof Omit<ImportRow, "rowNumber">) =>
          columnIndex[key] >= 0 ? row[columnIndex[key]] : null;
        const name = String(value("name") ?? "").trim();
        const category = String(value("category") ?? "").trim();

        if (!name && !category) return [];

        const purchasePrice = numericCell(value("purchasePrice"));
        const salePrice = numericCell(value("salePrice"));
        const quantity = numericCell(value("quantity"));
        const minimumStock = numericCell(value("minimumStock"));

        if (!name || !category) {
          throw new Error(`${index + 2}-qatorda nom yoki kategoriya bo‘sh`);
        }
        if ([purchasePrice, salePrice, quantity, minimumStock].some(Number.isNaN)) {
          throw new Error(`${index + 2}-qatorda narx yoki miqdor noto‘g‘ri`);
        }

        return [{
          rowNumber: index + 2,
          name,
          category,
          unit: String(value("unit") ?? "").trim() || "dona",
          purchasePrice,
          salePrice,
          quantity,
          minimumStock,
          location: String(value("location") ?? "").trim() || null,
          description: String(value("description") ?? "").trim() || null
        }];
      });

      if (parsed.length === 0) throw new Error("Import qilinadigan mahsulot topilmadi");
      if (parsed.length > 2000) throw new Error("Bir faylda maksimum 2000 ta mahsulot mumkin");
      setImportRows(parsed);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Excel faylni o‘qib bo‘lmadi");
    } finally {
      setParsingExcel(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      await download("/products/import-template.xlsx", "mahsulot-import-shablon.xlsx");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shablonni yuklab bo‘lmadi");
    }
  };
  const exportHistory = async () => {
    if (!historyProduct) return;
    try {
      await download(
        `/products/${historyProduct.id}/history/export.xlsx`,
        `product-history-${historyProduct.name}.xlsx`,
        {
          from: toIsoFromDateInput(historyFrom),
          to: toIsoEndOfDay(historyTo),
          movementType: historyType || undefined
        }
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export xatosi");
    }
  };
  const exportSelected = async () => {
    try {
      await downloadPost(
        "/products/export-selected.xlsx",
        "tanlangan-mahsulotlar.xlsx",
        { ids: selectedProductIds }
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export xatosi");
    }
  };
  const toggleProductSelection = (productId: string, checked: boolean) => {
    setSelectedProductIds((current) =>
      checked
        ? [...new Set([...current, productId])]
        : current.filter((id) => id !== productId)
    );
  };
  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedProductIds((current) => {
      if (checked) return [...new Set([...current, ...visibleProductIds])];
      return current.filter((id) => !visibleProductIds.includes(id));
    });
  };

  return (
    <>
      <PageHeader
        title={tr("Mahsulotlar", "Товары")}
        description={tr(
          "Ombordagi mahsulotlar, narxlar va qoldiqlarni boshqaring.",
          "Управляйте товарами, ценами и остатками на складе."
        )}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet size={17} /> {tr("Excel import", "Импорт Excel")}
            </Button>
            <Button onClick={openCreate}><Plus size={17} /> {tr("Mahsulot qo‘shish", "Добавить товар")}</Button>
          </>
        }
      />

      <Card>
        {selectedCount > 0 && (
          <div className="bulk-action-bar">
            <strong>
              {selectedCount} {tr("ta mahsulot tanlandi", "товаров выбрано")}
            </strong>
            <div className="bulk-action-buttons">
              {user?.role === "ADMIN" && (
                <Button variant="danger" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 size={16} /> {tr("Tanlanganlarni o'chirish", "Удалить выбранные")}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setBulkMoveOpen(true)}>
                <MapPin size={16} /> {tr("Ko'chirish", "Переместить")}
              </Button>
              <Button variant="secondary" onClick={() => setBulkCategoryOpen(true)}>
                <Tags size={16} /> {tr("Kategoriyani almashtirish", "Изменить категорию")}
              </Button>
              <Button variant="secondary" onClick={() => void exportSelected()}>
                <Download size={16} /> {tr("Tanlanganlarni export", "Экспорт выбранных")}
              </Button>
              <Button variant="ghost" onClick={() => setSelectedProductIds([])}>
                <X size={16} /> {tr("Tanlovni tozalash", "Сбросить выбор")}
              </Button>
            </div>
          </div>
        )}
        <div className="filters">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("Nomi bo‘yicha qidirish...", "Поиск по названию...")}
          />
          <Input
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            placeholder={tr("Joylashuv bo‘yicha qidirish...", "Поиск по месту...")}
          />
          <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">{tr("Barcha kategoriyalar", "Все категории")}</option>
            {categories.data?.data.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
          <label className="checkbox-filter">
            <input
              type="checkbox"
              checked={lowStock}
              onChange={(event) => setLowStock(event.target.checked)}
            />
            <AlertTriangle size={15} />
            {tr("Kam qolganlar", "Мало на складе")}
          </label>
        </div>

        <DataTable
          key={tableInstanceKey}
          loading={products.isLoading}
          empty={!products.data?.data.length}
          minWidth={1040}
        >
          <thead>
            <tr>
              <th className="checkbox-column">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                  aria-label={tr("Ko'rinib turganlarning barchasini tanlash", "Выбрать все видимые")}
                />
              </th>
              <th>{tr("Mahsulot", "Товар")}</th>
              <th>{tr("Kategoriya", "Категория")}</th>
              <th>{tr("Joylashuv", "Место")}</th>
              <th>{tr("Kirim narxi", "Закупочная цена")}</th>
              <th>{tr("Tavsiya narx", "Рекомендуемая цена")}</th>
              <th>{tr("Qoldiq", "Остаток")}</th>
              <th>{tr("Holat", "Статус")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.data?.data.map((product) => (
              <tr
                key={product.id}
                className={selectedProductIds.includes(product.id) ? "table-row-selected" : ""}
              >
                <td data-label={tr("Tanlash", "Выбор")} className="checkbox-cell">
                  <label className="table-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={(event) =>
                        toggleProductSelection(product.id, event.target.checked)
                      }
                      aria-label={`${product.name} ${tr("tanlash", "выбрать")}`}
                    />
                    <span>{tr("Tanlash", "Выбрать")}</span>
                  </label>
                </td>
                <td data-label={tr("Mahsulot", "Товар")}>
                  <div className="product-cell">
                    <span className={`product-avatar ${product.image_url ? "product-avatar-photo" : ""}`}>
                      {product.image_url
                        ? (
                          <button
                            type="button"
                            className="product-image-trigger product-image-trigger-card"
                            onClick={() => openPreview(product)}
                            aria-label={tr("Rasmni kattalashtirish", "Увеличить изображение")}
                          >
                            <ProductImage
                              src={product.image_url}
                              alt={product.name}
                              fallbackLabel={tr("Rasmni yuklab bo‘lmadi", "Не удалось загрузить изображение")}
                              fallbackCompact
                            />
                          </button>
                        )
                        : <Boxes size={18} />}
                    </span>
                    <div><strong>{product.name}</strong></div>
                  </div>
                </td>
                <td data-label={tr("Kategoriya", "Категория")}>{product.category_name}</td>
                <td data-label={tr("Joylashuv", "Место")}>{product.location || "-"}</td>
                <td data-label={tr("Kirim narxi", "Закупочная цена")}>{money(product.purchase_price)}</td>
                <td data-label={tr("Tavsiya narx", "Рекомендуемая цена")}><strong>{product.sale_price > 0 ? money(product.sale_price) : tr("Erkin narx", "Свободная цена")}</strong></td>
                <td data-label={tr("Qoldiq", "Остаток")}>{number(product.stock_quantity)} {product.unit}</td>
                <td data-label={tr("Holat", "Статус")}>
                  {product.is_low_stock
                    ? <Badge tone="warning">{tr("Kam qolgan", "Мало")}</Badge>
                    : <Badge tone="success">{tr("Yetarli", "Достаточно")}</Badge>}
                </td>
                <td data-label={tr("Amallar", "Действия")}>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        onClick={() => setHistoryProduct(product)}
                        title={tr("Harakatlar tarixi", "История движений")}
                      >
                        <History size={16} />
                      </button>
                      <button className="icon-button" onClick={() => openEdit(product)} title="Tahrirlash">
                        <Edit3 size={16} />
                      </button>
                    {user?.role === "ADMIN" && (
                      <button
                        className="icon-button danger-icon"
                        onClick={() => setDeleting(product)}
                        title="O‘chirish"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {products.data && (
          <Pagination
            page={products.data.meta.page}
            totalPages={products.data.meta.totalPages}
            total={products.data.meta.total}
            onPage={setPage}
            pageSize={pageSize}
            pageSizeOptions={[...productPageSizeOptions]}
            onPageSizeChange={setPageSize}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? tr("Mahsulotni tahrirlash", "Редактировать товар") : tr("Yangi mahsulot", "Новый товар")}
        description={tr(
          "Tavsiya narx ixtiyoriy. Sotuv paytida narxni har safar erkin kiritish mumkin.",
          "Рекомендуемая цена необязательна. При продаже цену можно вводить свободно."
        )}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
              {editing ? tr("Saqlash", "Сохранить") : tr("Qo‘shish", "Добавить")}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Input label={tr("Mahsulot nomi *", "Название товара *")} value={form.name} onChange={(e) => update("name", e.target.value)} />
          <Select label={tr("Kategoriya *", "Категория *")} value={form.categoryId} onChange={(e) => update("categoryId", e.target.value)}>
            <option value="">{tr("Tanlang", "Выберите")}</option>
            {categories.data?.data.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
          <Select label={tr("Birlik *", "Единица *")} value={form.unit} onChange={(e) => update("unit", e.target.value)}>
            <option value="">{tr("Birlikni tanlang", "Выберите единицу")}</option>
            {units.data?.map((unit) => (
              <option key={unit.id} value={unit.name}>{unit.name}</option>
            ))}
          </Select>
          <Input
            label={tr("Joylashuv", "Место хранения")}
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
            placeholder={tr("Masalan: Polka A1 / Yashik 12", "Например: Полка A1 / Ящик 12")}
          />
          <Input label={tr("Boshlang‘ich qoldiq", "Начальный остаток")} type="number" min="0" step="0.001" value={form.stockQuantity} onChange={(e) => update("stockQuantity", e.target.value)} />
          <Input label={tr("Kirim narxi *", "Закупочная цена *")} type="number" min="0" value={form.purchasePrice} onChange={(e) => update("purchasePrice", e.target.value)} />
          <Input label={tr("Tavsiya sotuv narxi", "Рекомендуемая цена")} type="number" min="0" value={form.salePrice} onChange={(e) => update("salePrice", e.target.value)} placeholder={tr("Ixtiyoriy", "Необязательно")} />
          <Input label={tr("Minimal qoldiq", "Минимальный остаток")} type="number" min="0" step="0.001" value={form.minimumStock} onChange={(e) => update("minimumStock", e.target.value)} />
          <div className="full">
            <label className="field-label">{tr("Mahsulot rasmlari (4 tagacha)", "Фото товара (до 4)")}</label>
            <button
              type="button"
              className="image-upload-button"
              disabled={uploadImages.isPending || form.imageUrls.length >= 4}
              onClick={() => imageInputRef.current?.click()}
            >
              <Upload size={18} />
              <span>
                <strong>{uploadImages.isPending ? tr("Yuklanmoqda...", "Загрузка...") : tr("Kompyuterdan rasm tanlash", "Выбрать фото с компьютера")}</strong>
                <small>JPG, PNG, WebP · max 5 MB</small>
              </span>
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) uploadImages.mutate(files);
                event.target.value = "";
              }}
            />
          </div>
          <Textarea className="full" label={tr("Tavsif", "Описание")} value={form.description} onChange={(e) => update("description", e.target.value)} />
          {form.imageUrls.some(Boolean) && (
            <div className="full product-image-gallery">
              {form.imageUrls.filter(Boolean).map((url, index) => (
                <div className="product-image-preview" key={`${url}-${index}`}>
                  <ProductImage
                    src={url}
                    alt={`${tr("Mahsulot rasmi", "Фото товара")} ${index + 1}`}
                    fallbackLabel={tr("Rasmni yuklab bo‘lmadi", "Не удалось загрузить изображение")}
                    fallbackCompact
                  />
                  <button type="button" onClick={() => removeImage(index)} title={tr("Rasmni olib tashlash", "Удалить фото")}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={importOpen}
        title={tr("Excel orqali mahsulot kirim qilish", "Приход товаров через Excel")}
        description={tr("Har bir qator yangi mahsulot sifatida qo‘shiladi.", "Каждая строка добавляется как новый товар.")}
        onClose={() => setImportOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button
              loading={importProducts.isPending}
              disabled={!importRows.length || parsingExcel}
              onClick={() => importProducts.mutate()}
            >
              <Upload size={16} /> {importRows.length} {tr("ta mahsulotni import qilish", "товаров импортировать")}
            </Button>
          </>
        }
      >
        <div className="excel-import">
          <div className="excel-actions">
            <Button variant="secondary" onClick={() => void downloadTemplate()}>
              <Download size={16} /> {tr("Excel shablonni yuklash", "Скачать шаблон Excel")}
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

          <div className="inline-note">
            <FileSpreadsheet size={17} />
            Kategoriya nomi tizimdagi nom bilan bir xil bo‘lsin: Lapka, Plastina, Nina, Pichoq, Disk, Ulitka, Overlock parts yoki Other.
          </div>

          {importFileName && (
            <div className={`excel-file-status ${importError ? "has-error" : ""}`}>
              <strong>{importFileName}</strong>
              <span>{importError || `${importRows.length} ta qator tayyor`}</span>
            </div>
          )}

          {importRows.length > 0 && (
            <DataTable minWidth={760}>
              <thead>
                <tr>
                  <th>{tr("Qator", "Строка")}</th>
                  <th>{tr("Mahsulot", "Товар")}</th>
                  <th>{tr("Kategoriya", "Категория")}</th>
                  <th>{tr("Joylashuv", "Место")}</th>
                  <th>{tr("Kirim narxi", "Закупочная цена")}</th>
                  <th>{tr("Tavsiya narx", "Рекомендуемая цена")}</th>
                  <th>{tr("Miqdor", "Количество")}</th>
                </tr>
              </thead>
              <tbody>
                {importRows.slice(0, 10).map((row) => (
                  <tr key={row.rowNumber}>
                    <td data-label={tr("Qator", "Строка")}>{row.rowNumber}</td>
                    <td data-label={tr("Mahsulot", "Товар")}><strong>{row.name}</strong></td>
                    <td data-label={tr("Kategoriya", "Категория")}>{row.category}</td>
                    <td data-label={tr("Joylashuv", "Место")}>{row.location || "-"}</td>
                    <td data-label={tr("Kirim narxi", "Закупочная цена")}>{money(row.purchasePrice)}</td>
                    <td data-label={tr("Tavsiya narx", "Рекомендуемая цена")}>{row.salePrice > 0 ? money(row.salePrice) : "Erkin"}</td>
                    <td data-label={tr("Miqdor", "Количество")}>{number(row.quantity)} {row.unit}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
          {importRows.length > 10 && (
            <div className="excel-more">Yana {importRows.length - 10} ta qator import qilinadi.</div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Mahsulotni butunlay o‘chirish"
        message={`“${deleting?.name ?? ""}” mahsuloti va uning kirim tarixi butunlay o‘chiriladi. Agar mahsulot sotilgan bo‘lsa, avval bog‘liq sotuv nakladnoylarini butunlay o‘chirish kerak.`}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={tr("Tanlangan mahsulotlarni o'chirish", "Удалить выбранные товары")}
        message={tr(
          `${selectedCount} ta mahsulotni butunlay o'chirasizmi? Sotuvga bog'langan mahsulot bo'lsa, hech biri o'chirilmaydi.`,
          `Удалить выбранные товары (${selectedCount}) навсегда? Если хотя бы один товар связан с продажей, удаление не будет выполнено.`
        )}
        loading={bulkDelete.isPending}
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={() => bulkDelete.mutate()}
      />

      <Modal
        open={bulkMoveOpen}
        title={tr("Tanlangan mahsulotlarni ko'chirish", "Переместить выбранные товары")}
        description={tr(
          `${selectedCount} ta mahsulot uchun yangi polka yoki yashikni kiriting.`,
          `Укажите новую полку или ящик для выбранных товаров (${selectedCount}).`
        )}
        onClose={() => setBulkMoveOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkMoveOpen(false)}>
              {tr("Bekor qilish", "Отмена")}
            </Button>
            <Button
              loading={bulkMove.isPending}
              disabled={!bulkLocation.trim()}
              onClick={() => bulkMove.mutate()}
            >
              <MapPin size={16} /> {tr("Ko'chirish", "Переместить")}
            </Button>
          </>
        }
      >
        <Input
          label={tr("Yangi joylashuv", "Новое расположение")}
          value={bulkLocation}
          onChange={(event) => setBulkLocation(event.target.value)}
          placeholder={tr("Masalan: Polka B3 / Yashik 25", "Например: Полка B3 / Ящик 25")}
        />
      </Modal>

      <Modal
        open={bulkCategoryOpen}
        title={tr("Kategoriyani almashtirish", "Изменить категорию")}
        description={tr(
          `${selectedCount} ta mahsulot uchun yangi kategoriya tanlang.`,
          `Выберите новую категорию для товаров (${selectedCount}).`
        )}
        onClose={() => setBulkCategoryOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkCategoryOpen(false)}>
              {tr("Bekor qilish", "Отмена")}
            </Button>
            <Button
              loading={bulkChangeCategory.isPending}
              disabled={!bulkCategoryId}
              onClick={() => bulkChangeCategory.mutate()}
            >
              <Tags size={16} /> {tr("Almashtirish", "Изменить")}
            </Button>
          </>
        }
      >
        <Select
          label={tr("Yangi kategoriya", "Новая категория")}
          value={bulkCategoryId}
          onChange={(event) => setBulkCategoryId(event.target.value)}
        >
          <option value="">{tr("Kategoriya tanlang", "Выберите категорию")}</option>
          {categories.data?.data.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </Select>
      </Modal>

      <Modal
        open={Boolean(historyProduct)}
        title={historyProduct?.name ?? tr("Mahsulot tarixi", "История товара")}
        description={tr(
          "Kirim, sotuv, qaytarish, adjustment va FIFO batch qoldiqlarini ko‘ring.",
          "Смотрите приход, продажи, возвраты, корректировки и остатки FIFO партий."
        )}
        onClose={() => setHistoryProduct(null)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setHistoryProduct(null)}>
              {tr("Yopish", "Закрыть")}
            </Button>
            <Button variant="secondary" onClick={() => void exportHistory()}>
              <Download size={16} /> {tr("Excel export", "Экспорт Excel")}
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Card className="report-filters">
            <Input
              label={tr("Boshlanish sanasi", "Дата начала")}
              type="date"
              value={historyFrom}
              onChange={(event) => setHistoryFrom(event.target.value)}
            />
            <Input
              label={tr("Tugash sanasi", "Дата окончания")}
              type="date"
              value={historyTo}
              onChange={(event) => setHistoryTo(event.target.value)}
            />
            <Select
              label={tr("Harakat turi", "Тип движения")}
              value={historyType}
              onChange={(event) => setHistoryType(event.target.value as ProductMovementType | "")}
            >
              <option value="">{tr("Barchasi", "Все")}</option>
              <option value="arrival">{tr("Kirim", "Приход")}</option>
              <option value="sale">{tr("Sotuv", "Продажа")}</option>
              <option value="return">{tr("Qaytarish", "Возврат")}</option>
              <option value="supplier_return">{tr("Yetkazib beruvchiga qaytarish", "Возврат поставщику")}</option>
              <option value="adjustment">{tr("Adjustment", "Корректировка")}</option>
            </Select>
          </Card>

          <div className="stats-grid report-stats history-stats">
            <div className="card stat-card">
              <div className="stat-copy">
                <span>{tr("Joriy qoldiq", "Текущий остаток")}</span>
                <strong>
                  {number(productHistory.data?.summary.current_stock ?? historyProduct?.stock_quantity ?? 0)} {historyProduct?.unit}
                </strong>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-copy">
                <span>{tr("Qolgan stock qiymati", "Стоимость остатка")}</span>
                <strong>{money(productHistory.data?.summary.remaining_stock_value)}</strong>
              </div>
            </div>
          </div>

          <Card title={tr("Harakatlar", "Движения")}>
            <DataTable
              loading={productHistory.isLoading}
              empty={!productHistory.data?.movements.length}
              minWidth={980}
            >
              <thead>
                <tr>
                  <th>{tr("Turi", "Тип")}</th>
                  <th>{tr("Sana", "Дата")}</th>
                  <th>{tr("Miqdor", "Количество")}</th>
                  <th>{tr("Kirim narxi", "Закупочная цена")}</th>
                  <th>{tr("Sotuv narxi", "Цена продажи")}</th>
                  <th>{tr("FIFO tannarx", "FIFO себестоимость")}</th>
                  <th>{tr("Foyda", "Прибыль")}</th>
                  <th>{tr("Hujjat", "Документ")}</th>
                </tr>
              </thead>
              <tbody>
                {productHistory.data?.movements.map((row) => (
                  <tr key={`${row.movement_type}-${row.reference_number}-${row.movement_at}`}>
                    <td data-label={tr("Turi", "Тип")}>{row.movement_type}</td>
                    <td data-label={tr("Sana", "Дата")}>{dateTime(row.movement_at)}</td>
                    <td data-label={tr("Miqdor", "Количество")}>{number(row.quantity)}</td>
                    <td data-label={tr("Kirim narxi", "Закупочная цена")}>{row.purchase_price ? money(row.purchase_price) : "-"}</td>
                    <td data-label={tr("Sotuv narxi", "Цена продажи")}>{row.sale_price ? money(row.sale_price) : "-"}</td>
                    <td data-label={tr("FIFO tannarx", "FIFO себестоимость")}>{row.fifo_cost ? money(row.fifo_cost) : "-"}</td>
                    <td data-label={tr("Foyda", "Прибыль")}>{row.profit !== undefined ? money(row.profit) : "-"}</td>
                    <td data-label={tr("Hujjat", "Документ")}>
                      <strong>{row.reference_number}</strong>
                      {row.partner_name ? <small>{row.partner_name}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card title={tr("FIFO batchlar", "FIFO партии")}>
            <DataTable
              loading={productHistory.isLoading}
              empty={!productHistory.data?.batches.length}
              minWidth={920}
            >
              <thead>
                <tr>
                  <th>{tr("Sana", "Дата")}</th>
                  <th>{tr("Manba", "Источник")}</th>
                  <th>{tr("Miqdor", "Количество")}</th>
                  <th>{tr("Qolgan", "Осталось")}</th>
                  <th>{tr("Kirim narxi", "Закупочная цена")}</th>
                  <th>{tr("Yetkazib beruvchi", "Поставщик")}</th>
                  <th>{tr("Joylashuv", "Место")}</th>
                </tr>
              </thead>
              <tbody>
                {productHistory.data?.batches.map((batch) => (
                  <tr key={batch.id}>
                    <td data-label={tr("Sana", "Дата")}>{dateTime(batch.received_at)}</td>
                    <td data-label={tr("Manba", "Источник")}>{batch.source}</td>
                    <td data-label={tr("Miqdor", "Количество")}>{number(batch.initial_quantity)}</td>
                    <td data-label={tr("Qolgan", "Осталось")}><strong>{number(batch.remaining_quantity)}</strong></td>
                    <td data-label={tr("Kirim narxi", "Закупочная цена")}>{money(batch.purchase_price)}</td>
                    <td data-label={tr("Yetkazib beruvchi", "Поставщик")}>{batch.supplier_name || "-"}</td>
                    <td data-label={tr("Joylashuv", "Место")}>{batch.location || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        </div>
      </Modal>

      <Modal
        open={Boolean(previewGallery)}
        title={previewGallery?.name ?? tr("Mahsulot rasmi", "Фото товара")}
        onClose={() => setPreviewGallery(null)}
        className="image-lightbox-modal"
        bodyClassName="image-lightbox-body"
      >
        {previewGallery && (
          <div className="image-lightbox-gallery">
            <div
              className="image-lightbox-frame"
              onTouchStart={(event) => {
                previewTouchStartX.current = event.changedTouches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const startX = previewTouchStartX.current;
                const endX = event.changedTouches[0]?.clientX ?? null;
                previewTouchStartX.current = null;
                if (startX === null || endX === null) return;
                const delta = endX - startX;
                if (Math.abs(delta) < 40) return;
                if (delta > 0) showPreviousPreviewImage();
                else showNextPreviewImage();
              }}
            >
              {previewGallery.images.length > 1 && (
                <button
                  type="button"
                  className="image-lightbox-nav image-lightbox-prev"
                  onClick={showPreviousPreviewImage}
                  aria-label={tr("Oldingi rasm", "Предыдущее изображение")}
                >
                  <ChevronLeft size={22} />
                </button>
              )}
              <ProductImage
                src={previewGallery.images[previewGallery.index]!}
                alt={`${previewGallery.name} ${previewGallery.index + 1}`}
                fallbackLabel={tr("Rasmni yuklab bo‘lmadi", "Не удалось загрузить изображение")}
                className="image-lightbox-image"
              />
              {previewGallery.images.length > 1 && (
                <button
                  type="button"
                  className="image-lightbox-nav image-lightbox-next"
                  onClick={showNextPreviewImage}
                  aria-label={tr("Keyingi rasm", "Следующее изображение")}
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>
            {previewGallery.images.length > 1 && (
              <>
                <div className="image-lightbox-counter">
                  {previewGallery.index + 1} / {previewGallery.images.length}
                </div>
                <div className="image-lightbox-thumbs">
                  {previewGallery.images.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      className={`image-lightbox-thumb ${index === previewGallery.index ? "active" : ""}`}
                      onClick={() =>
                        setPreviewGallery((current) =>
                          current ? { ...current, index } : current
                        )
                      }
                      aria-label={`${tr("Rasm", "Изображение")} ${index + 1}`}
                    >
                      <ProductImage
                        src={image}
                        alt=""
                        fallbackLabel={tr("Rasmni yuklab bo‘lmadi", "Не удалось загрузить изображение")}
                        fallbackCompact
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
