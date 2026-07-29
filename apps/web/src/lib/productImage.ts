type ProductImageSource = {
  image_url?: string | null;
  image_urls?: Array<string | null | undefined> | null;
};

export function productImageUrl(product?: ProductImageSource | null) {
  const imageFromGallery = product?.image_urls?.find(
    (url): url is string => typeof url === "string" && url.trim().length > 0
  );

  return imageFromGallery ?? product?.image_url ?? null;
}
