import { AppError } from "../../shared/errors/AppError.js";
import { paginationMeta } from "../../shared/pagination.js";
import {
  contactRepository,
  type ContactInput,
  type ContactKind
} from "./contact.repository.js";

export class ContactService {
  async list(kind: ContactKind, input: Parameters<typeof contactRepository.list>[1]) {
    const result = await contactRepository.list(kind, input);
    return { data: result.rows, meta: paginationMeta(result.total, input.page, input.limit) };
  }

  create(kind: ContactKind, input: Required<Pick<ContactInput, "name">> & ContactInput) {
    return contactRepository.create(kind, input);
  }

  async update(kind: ContactKind, id: string, input: ContactInput) {
    const record = await contactRepository.update(kind, id, input);
    if (!record) throw new AppError(404, "Contact not found", "CONTACT_NOT_FOUND");
    return record;
  }

  async delete(kind: ContactKind, id: string) {
    const record = await contactRepository.delete(kind, id);
    if (!record) throw new AppError(404, "Contact not found", "CONTACT_NOT_FOUND");
  }
}

export const contactService = new ContactService();

