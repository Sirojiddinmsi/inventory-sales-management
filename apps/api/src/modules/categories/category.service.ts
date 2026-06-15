import { AppError } from "../../shared/errors/AppError.js";
import { paginationMeta } from "../../shared/pagination.js";
import { categoryRepository } from "./category.repository.js";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return slug || "kategoriya";
}

export class CategoryService {
  async list(input: Parameters<typeof categoryRepository.list>[0]) {
    const result = await categoryRepository.list(input);
    return {
      data: result.rows,
      meta: paginationMeta(result.total, input.page, input.limit)
    };
  }

  async get(id: string) {
    const category = await categoryRepository.findById(id);
    if (!category) throw new AppError(404, "Category not found", "CATEGORY_NOT_FOUND");
    return category;
  }

  async create(input: { name: string; description?: string | null }) {
    const existing = await categoryRepository.findByName(input.name);
    if (existing) {
      throw new AppError(409, "Bu kategoriya allaqachon mavjud", "CATEGORY_ALREADY_EXISTS");
    }

    const slug = await this.ensureUniqueSlug(slugify(input.name));
    return categoryRepository.create({ ...input, slug });
  }

  async update(id: string, input: { name?: string; description?: string | null }) {
    if (input.name) {
      const existing = await categoryRepository.findByName(input.name, id);
      if (existing) {
        throw new AppError(409, "Bu kategoriya allaqachon mavjud", "CATEGORY_ALREADY_EXISTS");
      }
    }

    const category = await categoryRepository.update(id, {
      ...input,
      ...(input.name ? { slug: await this.ensureUniqueSlug(slugify(input.name), id) } : {})
    });
    if (!category) throw new AppError(404, "Category not found", "CATEGORY_NOT_FOUND");
    return category;
  }

  async delete(id: string) {
    const category = await categoryRepository.delete(id);
    if (!category) throw new AppError(404, "Category not found", "CATEGORY_NOT_FOUND");
  }

  private async ensureUniqueSlug(baseSlug: string, excludeId?: string) {
    let slug = baseSlug;
    let suffix = 2;

    while (await categoryRepository.findBySlug(slug, excludeId)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }
}

export const categoryService = new CategoryService();
