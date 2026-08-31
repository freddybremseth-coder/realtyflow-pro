export interface BrandScopedEmailMessage {
  brand_id?: string | null;
}

export function filterEmailMessagesByBrand<T extends BrandScopedEmailMessage>(messages: T[], brandId?: string | null) {
  const normalizedBrandId = String(brandId || "").trim();
  if (!normalizedBrandId) return messages;
  return messages.filter((message) => String(message.brand_id || "") === normalizedBrandId);
}
