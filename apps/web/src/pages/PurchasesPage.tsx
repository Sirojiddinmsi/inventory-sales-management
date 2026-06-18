import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Truck,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { readSheet } from "read-excel-file/browser";
import {
  Button,
  Card,
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
import type { Contact, Paginated, Product, Purchase } from "../types/api";

type PurchaseLine = {
  key: string;
  supplierId: string;
  productId: string;
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
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
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
    queryFn: () => api<Paginated<Purchase>>("/purchases", {
      params: {
        page,
        limit: 15,
        search,
        from: toIsoFromDateInput(from),
        to: toIsoEndOfDay(to)
      }
    })
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
    enabled: modalOpen || importOpen || Boolean(productPickerLineKey),
    staleTime: 30_000
  });
  const suppliers = useQuery({
    queryKey: ["suppliers", "all"],
    queryFn: () => api<Paginated<Contact>>("/suppliers", {
      params: { limit: 200, sortOrder: "asc" }
    })
  });

  useEffect(() => setPage(1), [search, from, to]);
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
  };

  const save = useMutation({
    mutationFn: () =>
      api<{ totalRows: number; totalAmount: number }>("/purchases/bulk", {
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
      toast.success(
        `${result.totalRows} ta mahsulot kirim qilindi. Jami: ${money(result.totalAmount)}`
      );
      setModalOpen(false);
      setLines([newPurchaseLine({ purchasedAt: defaultPurchasedAt, supplierId: defaultSupplierId })]);
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
    setDefaultPurchasedAt(initialDate);
    setDefaultSupplierId("");
    setSelectedProducts({});
    setProductPickerLineKey(null);
    setProductSearch("");
    setLines([newPurchaseLine({ purchasedAt: initialDate })]);
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
    updateLine(lineKey, "productId", productId);
    setProductPickerLineKey(null);
    setProductSearch("");
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
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet size={17} /> {tr("Excel import", "Импорт Excel")}
            </Button>
            <Button onClick={openCreate}>
              <PackagePlus size={17} /> {tr("Yangi kirim", "Новый приход")}
            </Button>
          </>
        }
      />
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
        <DataTable loading={purchases.isLoading} empty={!purchases.data?.data.length} minWidth={1040}>
          <thead>
            <tr>
              <th>{tr("Sana", "Дата")}</th>
              <th>{tr("Mahsulot", "Товар")}</th>
              <th>{tr("Joylashuv", "Место")}</th>
              <th>{tr("Yetkazib beruvchi", "Поставщик")}</th>
              <th>{tr("Miqdor", "Количество")}</th>
              <th>{tr("Kirim narxi", "Закупочная цена")}</th>
              <th>{tr("Jami", "Сумма")}</th>
              <th>{tr("Kiritgan", "Добавил")}</th>
            </tr>
          </thead>
          <tbody>
            {purchases.data?.data.map((purchase) => (
              <tr key={purchase.id}>
                <td data-label={tr("Sana", "Дата")}>{dateTime(purchase.purchased_at)}</td>
                <td data-label={tr("Mahsulot", "Товар")}>
                  <div className="product-cell">
                    <span className="product-avatar"><PackagePlus size={17} /></span>
                    <div><strong>{purchase.product_name}</strong></div>
                  </div>
                </td>
                <td data-label={tr("Joylashuv", "Место")}>{purchase.product_location || "-"}</td>
                <td data-label={tr("Yetkazib beruvchi", "Поставщик")}>{purchase.supplier_name || "-"}</td>
                <td data-label={tr("Miqdor", "Количество")}><strong>{number(purchase.quantity)}</strong></td>
                <td data-label={tr("Kirim narxi", "Закупочная цена")}>{money(purchase.purchase_price)}</td>
                <td data-label={tr("Jami", "Сумма")}><strong>{money(purchase.total_cost)}</strong></td>
                <td data-label={tr("Kiritgan", "Добавил")}>{purchase.created_by_name}</td>
              </tr>
            ))}
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
      </Card>

      <Modal
        open={modalOpen}
        title={tr("Yangi kirim hujjati", "Новый приходный документ")}
        description={tr(
          "Bir nechta qatorni bir vaqtning o‘zida saqlang. Har bir qator alohida FIFO batch bo‘ladi.",
          "Сохраняйте несколько строк сразу. Каждая строка станет отдельной FIFO партией."
        )}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <div className="modal-total">
              <span>{tr("Hujjat jami", "Итого по документу")}</span>
              <strong>{money(total)}</strong>
            </div>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{tr("Bekor qilish", "Отмена")}</Button>
            <Button loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
              {tr("Kirimni saqlash", "Сохранить приход")}
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
                <Plus size={14} /> {tr("Qator qo‘shish", "Добавить строку")}
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
                            {selectedProduct?.name ?? tr("Mahsulotni tanlang", "Выберите товар")}
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
                  className={`product-picker-item ${selectedPickerLine?.productId === item.id ? "active" : ""}`}
                  onClick={() => selectedPickerLine && chooseProduct(selectedPickerLine.key, item.id)}
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
    </>
  );
}
