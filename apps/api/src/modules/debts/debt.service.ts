import { AppError } from "../../shared/errors/AppError.js";
import { paginationMeta } from "../../shared/pagination.js";
import { debtRepository } from "./debt.repository.js";

export class DebtService {
  async list(input: Parameters<typeof debtRepository.list>[0]) {
    const result = await debtRepository.list(input);
    return { data: result.rows, meta: paginationMeta(result.total, input.page, input.limit) };
  }

  async get(id: string) {
    const debt = await debtRepository.get(id);
    if (!debt) throw new AppError(404, "Debt not found", "DEBT_NOT_FOUND");
    return debt;
  }

  summary() {
    return debtRepository.summary();
  }

  pay(
    debtId: string,
    input: Omit<Parameters<typeof debtRepository.pay>[0], "debtId" | "receivedBy">,
    userId: string
  ) {
    return debtRepository.pay({ ...input, debtId, receivedBy: userId });
  }

  archive(id: string, reason: string, userId: string) {
    return debtRepository.archive(id, reason, userId);
  }

  restore(id: string) {
    return debtRepository.restore(id);
  }

  purge(id: string) {
    return debtRepository.purge(id);
  }
}

export const debtService = new DebtService();
