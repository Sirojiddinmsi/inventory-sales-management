import { AppError } from "../../shared/errors/AppError.js";
import { unitRepository } from "./unit.repository.js";

export class UnitService {
  list() {
    return unitRepository.list();
  }

  create(name: string) {
    return unitRepository.create(name.trim());
  }

  async delete(id: string) {
    const unit = await unitRepository.delete(id);
    if (!unit) throw new AppError(404, "Unit not found", "UNIT_NOT_FOUND");
  }
}

export const unitService = new UnitService();
