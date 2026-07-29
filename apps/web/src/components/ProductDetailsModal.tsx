import { useQuery } from "@tanstack/react-query";
import { Boxes, History, ImageOff, MapPin, Package, RefreshCw, Tag, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "./ui";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import { dateTime, money, number } from "../lib/format";
import type { Product, ProductHistory, ProductMovementType } from "../types/api";

type Section = "information" | "history";

type ProductDetailsModalProps = {
  product: Product | null;
  onClose: () => void;
  onEdit?: (product: Product) => void;
  initialSection?: Section;
};

const historyTypes: Array<{ value: ProductMovementType | ""; uz: string; ru: string }> = [
  { value: "", uz: "Barchasi", ru: "Все" },
  { value: "arrival", uz: "Kirim", ru: "Приход" },
  { value: "sale", uz: "Sotuv", ru: "Продажи" },
  { value: "return", uz: "Qaytarish", ru: "Возвраты" },
  { value: "supplier_return", uz: "Yetkazib beruvchiga qaytarish", ru: "Возврат поставщику" },
  { value: "adjustment", uz: "Tuzatish", ru: "Корректировки" }
];

function imageUrls(product: Product) {
  return [...new Set([...(product.image_urls ?? []), product.image_url].filter((value): value is string => Boolean(value)))];
}

function movementLabel(type: ProductMovementType, tr: (uz: string, ru: string) => string) {
  const item = historyTypes.find((entry) => entry.value === type);
  if (item) return tr(item.uz, item.ru);
  return type === "cost_correction"
    ? tr("Tannarx tuzatishi", "Корректировка себестоимости")
    : tr("Harakat", "Движение");
}

function isOutgoingMovement(type: ProductMovementType) {
  return type === "sale" || type === "supplier_return";
}

export function ProductDetailsModal({ product, onClose, onEdit, initialSection = "information" }: ProductDetailsModalProps) {
  const { tr } = useI18n();
  const [section, setSection] = useState<Section>(initialSection);
  const [movementType, setMovementType] = useState<ProductMovementType | "">("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const images = useMemo(() => product ? imageUrls(product) : [], [product]);

  useEffect(() => {
    if (!product) return;
    setSection(initialSection);
    setMovementType("");
    setSelectedImage(0);
    setPreviewOpen(false);
    setImageFailed(false);
  }, [product?.id, initialSection]);

  const history = useQuery({
    queryKey: ["product-details-history", product?.id, movementType],
    queryFn: () => api<ProductHistory>(`/products/${product!.id}/history`, {
      params: { movementType: movementType || undefined }
    }),
    enabled: Boolean(product) && section === "history"
  });

  if (!product) return null;

  const currentImage = images[selectedImage];
  const stock = history.data?.summary.current_stock ?? product.stock_quantity;
  const fields = [
    { icon: Tag, label: tr("Kategoriya", "Категория"), value: product.category_name },
    { icon: Package, label: tr("Birlik", "Единица"), value: product.unit },
    { icon: MapPin, label: tr("Joylashuv", "Место хранения"), value: product.location },
    { icon: Boxes, label: tr("Tavsif", "Описание"), value: product.description }
  ].filter((field): field is typeof field & { value: string } => Boolean(field.value));

  return (
    <>
      <Modal
        open
        title={tr("Mahsulot ma'lumotlari", "Карточка товара")}
        description={tr("Mahsulot qoldig‘i, joylashuvi va harakatlarini ko‘ring.", "Смотрите остаток, место хранения и движения товара.")}
        onClose={onClose}
        wide
        className="product-details-modal"
        bodyClassName="product-details-body"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>{tr("Yopish", "Закрыть")}</Button>
            {onEdit ? <Button onClick={() => onEdit(product)}>{tr("Tahrirlash", "Редактировать")}</Button> : null}
          </>
        }
      >
        <div className="product-details-tabs" role="tablist" aria-label={tr("Mahsulot bo‘limlari", "Разделы товара")}>
          <button type="button" role="tab" aria-selected={section === "information"} className={section === "information" ? "active" : ""} onClick={() => setSection("information")}>
            {tr("Ma'lumot", "Информация")}
          </button>
          <button type="button" role="tab" aria-selected={section === "history"} className={section === "history" ? "active" : ""} onClick={() => setSection("history")}>
            <History size={15} /> {tr("Harakatlar", "Движения")}
          </button>
        </div>

        {section === "information" ? (
          <div className="product-details-information">
            <section className="product-details-hero">
              <div className="product-details-gallery">
                <button
                  type="button"
                  className="product-details-main-image"
                  onClick={() => currentImage && setPreviewOpen(true)}
                  disabled={!currentImage || imageFailed}
                  aria-label={tr("Rasmni kattalashtirish", "Увеличить изображение")}
                >
                  {currentImage && !imageFailed ? (
                    <img src={currentImage} alt={product.name} loading="lazy" onError={() => setImageFailed(true)} />
                  ) : (
                    <span className="product-details-image-fallback"><ImageOff size={36} /><small>{tr("Rasm yo'q", "Нет фото")}</small></span>
                  )}
                </button>
                {images.length > 1 ? (
                  <div className="product-details-thumbnails" aria-label={tr("Mahsulot rasmlari", "Фотографии товара")}>
                    {images.map((image, index) => (
                      <button key={image} type="button" className={selectedImage === index ? "active" : ""} onClick={() => { setSelectedImage(index); setImageFailed(false); }} aria-label={`${tr("Rasm", "Фото")} ${index + 1}`}>
                        <img src={image} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="product-details-heading">
                <h3>{product.name}</h3>
                {product.code ? <code>{product.code}</code> : null}
                <div className="product-details-stock">
                  <span>{tr("Joriy qoldiq", "Текущий остаток")}</span>
                  <strong>{number(stock)} {product.unit}</strong>
                </div>
                {product.location ? <div className="product-details-location"><MapPin size={17} /><span>{tr("Joylashuv", "Место")}: <strong>{product.location}</strong></span></div> : null}
              </div>
            </section>

            <section className="product-details-prices" aria-label={tr("Narxlar", "Цены")}>
              <div><span>{tr("Sotuv narxi", "Цена продажи")}</span><strong>{product.sale_price > 0 ? money(product.sale_price) : tr("Erkin narx", "Свободная цена")}</strong></div>
              <div><span>{tr("Standart kirim narxi", "Закупочная цена по умолчанию")}</span><strong>{money(product.purchase_price)}</strong></div>
              {history.data?.summary.remaining_stock_value !== undefined ? <div><span>{tr("Qoldiq qiymati", "Стоимость остатка")}</span><strong>{money(history.data.summary.remaining_stock_value)}</strong></div> : null}
            </section>

            {fields.length ? (
              <section className="product-details-fields">
                {fields.map(({ icon: Icon, label, value }) => (
                  <div key={label}><Icon size={16} /><span>{label}</span><strong>{value}</strong></div>
                ))}
              </section>
            ) : null}

            <section className="product-details-dates">
              <span>{tr("Yaratilgan", "Создан")}: <strong>{dateTime(product.created_at)}</strong></span>
              <span>{tr("Yangilangan", "Обновлён")}: <strong>{dateTime(product.updated_at)}</strong></span>
            </section>
          </div>
        ) : (
          <section className="product-details-history">
            <div className="product-details-history-toolbar">
              <div className="product-details-stock compact"><span>{tr("Joriy qoldiq", "Текущий остаток")}</span><strong>{number(stock)} {product.unit}</strong></div>
              <div className="product-details-filters" role="group" aria-label={tr("Harakat filtri", "Фильтр движений")}>
                {historyTypes.map((item) => (
                  <button key={item.value || "all"} type="button" className={movementType === item.value ? "active" : ""} onClick={() => setMovementType(item.value)}>{tr(item.uz, item.ru)}</button>
                ))}
              </div>
            </div>
            {history.isLoading ? <div className="product-details-state"><RefreshCw className="spin" size={20} /> {tr("Harakatlar yuklanmoqda...", "Загрузка движений...")}</div> : null}
            {history.isError ? <div className="product-details-state error"><span>{tr("Harakatlarni yuklab bo‘lmadi.", "Не удалось загрузить движения.")}</span><Button size="sm" variant="secondary" onClick={() => void history.refetch()}>{tr("Qayta urinish", "Повторить")}</Button></div> : null}
            {!history.isLoading && !history.isError && !history.data?.movements.length ? <div className="product-details-state"><History size={22} /> {tr("Harakatlar topilmadi.", "Движения не найдены.")}</div> : null}
            {history.data?.movements.length ? <div className="product-details-movements">
              {history.data.movements.map((movement) => (
                <article key={`${movement.movement_type}-${movement.reference_number}-${movement.movement_at}`} className={`product-details-movement ${isOutgoingMovement(movement.movement_type) ? "outgoing" : "incoming"}`}>
                  <div className="product-details-movement-icon">{isOutgoingMovement(movement.movement_type) ? "−" : "+"}</div>
                  <div className="product-details-movement-copy"><strong>{movementLabel(movement.movement_type, tr)}</strong><small>{dateTime(movement.movement_at)}{movement.reference_number ? ` · ${movement.reference_number}` : ""}</small>{movement.note ? <small className="product-details-note">{movement.note}</small> : null}</div>
                  <div className="product-details-movement-value"><strong>{isOutgoingMovement(movement.movement_type) ? "−" : "+"}{number(movement.quantity)} {product.unit}</strong>{movement.sale_price !== undefined ? <small>{money(movement.sale_price)}</small> : movement.purchase_price !== undefined ? <small>{money(movement.purchase_price)}</small> : null}</div>
                </article>
              ))}
            </div> : null}
          </section>
        )}
      </Modal>

      <Modal open={previewOpen} title={product.name} onClose={() => setPreviewOpen(false)} className="product-details-preview-modal" bodyClassName="product-details-preview-body">
        <div className="product-details-preview-frame">
          {currentImage && !imageFailed ? <img src={currentImage} alt={product.name} onError={() => setImageFailed(true)} /> : <span className="product-details-image-fallback"><ImageOff size={36} /><small>{tr("Rasmni yuklab bo‘lmadi", "Не удалось загрузить изображение")}</small></span>}
        </div>
      </Modal>
    </>
  );
}
