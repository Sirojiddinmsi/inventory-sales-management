import { AppError } from "../../shared/errors/AppError.js";
import { paginationMeta } from "../../shared/pagination.js";
import { expenseRepository } from "./expense.repository.js";

export class ExpenseService {
  async list(input: Parameters<typeof expenseRepository.list>[0]) {
    const result = await expenseRepository.list(input);
    return { data: result.rows, meta: paginationMeta(result.total, input.page, input.limit) };
  }

  create(
    input: Omit<Parameters<typeof expenseRepository.create>[0], "createdBy">,
    userId: string
  ) {
    return expenseRepository.create({ ...input, createdBy: userId });
  }

  async update(id: string, input: Parameters<typeof expenseRepository.update>[1]) {
    const expense = await expenseRepository.update(id, input);
    if (!expense) throw new AppError(404, "Expense not found", "EXPENSE_NOT_FOUND");
    return expense;
  }

  async delete(id: string) {
    const expense = await expenseRepository.delete(id);
    if (!expense) throw new AppError(404, "Expense not found", "EXPENSE_NOT_FOUND");
  }
}

export const expenseService = new ExpenseService();

