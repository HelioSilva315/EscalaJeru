import { formatPhone, isValidMobileBR, normalizePhoneBR } from "./phone";
import type { EventInput, MinistryInput, PersonInput } from "./types";

export type Errors = Record<string, string>;

export function validatePerson(input: PersonInput, opts?: { emailRequired?: boolean }): Errors {
  const errors: Errors = {};

  const name = input.full_name.trim();
  if (name.length < 3) errors.full_name = "Informe o nome completo.";
  else if (name.length > 80) errors.full_name = "Use no máximo 80 caracteres.";
  else if (!name.includes(" ")) errors.full_name = "Inclua também o sobrenome.";

  const phone = normalizePhoneBR(input.phone);
  if (!phone) {
    errors.phone = "Telefone obrigatório. Use DDD + número.";
  } else if (phone.startsWith("+55") && !isValidMobileBR(phone)) {
    errors.phone = "Informe um celular com DDD (ex.: 11 91234-5678).";
  }

  const email = (input.email || "").trim();
  if (opts?.emailRequired && !email) {
    errors.email = "Informe o e-mail.";
  } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "E-mail inválido.";
  }

  if (input.role !== "leader" && input.role !== "member") {
    errors.role = "Escolha líder ou membro.";
  }

  if (input.birth_date) {
    const d = new Date(input.birth_date);
    if (Number.isNaN(d.getTime())) errors.birth_date = "Data inválida.";
    else if (d.getTime() > Date.now()) errors.birth_date = "A data não pode ser futura.";
  }

  return errors;
}

export function validateMinistry(input: MinistryInput): Errors {
  const errors: Errors = {};
  if (input.name.trim().length < 2) errors.name = "Informe o nome do ministério.";
  if (input.name.trim().length > 40) errors.name = "Use no máximo 40 caracteres.";
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) errors.color = "Escolha uma cor.";
  if (input.description && input.description.length > 160) {
    errors.description = "Use no máximo 160 caracteres.";
  }
  return errors;
}

export function validateEvent(input: EventInput): Errors {
  const errors: Errors = {};
  if (input.title.trim().length < 3) errors.title = "Informe o nome do encontro.";
  if (input.title.trim().length > 70) errors.title = "Use no máximo 70 caracteres.";
  if (!input.event_date) errors.event_date = "Escolha a data.";
  if (!input.start_time) errors.start_time = "Informe o horário.";
  if (input.end_time && input.start_time && input.end_time <= input.start_time) {
    errors.end_time = "O término deve ser depois do início.";
  }
  if (input.description && input.description.length > 300) {
    errors.description = "Use no máximo 300 caracteres.";
  }
  return errors;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "A senha precisa ter ao menos 8 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(password)) return "Inclua ao menos uma letra.";
  if (!/\d/.test(password)) return "Inclua ao menos um número.";
  return null;
}

export function hasErrors(errors: Errors): boolean {
  return Object.keys(errors).length > 0;
}

export function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function friendlyPhone(phone: string): string {
  return formatPhone(phone);
}
