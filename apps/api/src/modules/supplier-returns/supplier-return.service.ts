import { paginationMeta } from "../../shared/pagination.js";
import { supplierReturnRepository } from "./supplier-return.repository.js";

export class SupplierReturnService {
  async list(input: Parameters<typeof supplierReturnRepository.list>[0]) {
    const result = await supplierReturnRepository.list(input);
    return { data: result.rows, meta: paginationMeta(result.total, input.page, input.limit) };
  }

  create(
    input: Omit<Parameters<typeof supplierReturnRepository.create>[0], "createdBy">,
    userId: string
  ) {
    return supplierReturnRepository.create({ ...input, createdBy: userId });
  }

  createDocument(
    input: Omit<Parameters<typeof supplierReturnRepository.createDocument>[0], "createdBy">,
    userId: string
  ) {
    return supplierReturnRepository.createDocument({ ...input, createdBy: userId });
  }

  appendDocument(
    id: string,
    input: Parameters<typeof supplierReturnRepository.appendDocument>[1],
    userId: string
  ) {
    return supplierReturnRepository.appendDocument(id, { ...input, createdBy: userId });
  }

  updateDocument(
    id: string,
    input: Parameters<typeof supplierReturnRepository.updateDocument>[1],
    userId: string
  ) {
    return supplierReturnRepository.updateDocument(id, { ...input, updatedBy: userId });
  }

  remove(id: string, userId: string) {
    return supplierReturnRepository.remove(id, userId);
  }

  removeDocument(id: string, userId: string) {
    return supplierReturnRepository.removeDocument(id, userId);
  }
}

export const supplierReturnService = new SupplierReturnService();
