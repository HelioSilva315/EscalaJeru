export function onlyDigits(value: string): string {
  return (value || "").replace(/\D/g, "");
}

/**
 * Converte o que a pessoa digitou em E.164.
 * Aceita (11) 91234-5678, 11912345678, +55 11 91234-5678 etc.
 */
export function normalizePhoneBR(value: string): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  let digits = onlyDigits(raw);

  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  if (digits.length !== 10 && digits.length !== 11) return null;
  // DDD válido no Brasil
  if (digits[0] === "0") return null;
  return `+55${digits}`;
}

export function isValidMobileBR(e164: string): boolean {
  return /^\+55[1-9]{2}9\d{8}$/.test(e164);
}

export function formatPhone(value: string): string {
  if (!value) return "—";
  const digits = onlyDigits(value);
  if (value.startsWith("+55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) {
      return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return value.startsWith("+") ? value : `+${digits}`;
}

export function maskPhoneInput(value: string): string {
  let digits = onlyDigits(value);
  // Aceita também números já salvos em E.164 (+55...), sem duplicar o DDI.
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function whatsappLink(phone: string, message?: string): string {
  const digits = onlyDigits(phone);
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function telLink(phone: string): string {
  return `tel:${phone}`;
}
