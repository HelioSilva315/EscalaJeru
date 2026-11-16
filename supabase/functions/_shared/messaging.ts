// Envio de lembretes por WhatsApp (Cloud API ou Z-API) e SMS (Twilio).
// Tudo por variáveis de ambiente: sem configuração, o envio é "skipped"
// e o aviso continua aparecendo dentro do app.

export type NotifyChannel = "whatsapp" | "sms";

export interface SendResult {
  ok: boolean;
  provider: string;
  skipped?: boolean;
  detail?: string;
}

function whatsappProvider(): "cloud" | "zapi" | null {
  const value = (Deno.env.get("WHATSAPP_PROVIDER") ?? "").toLowerCase();
  if (value === "cloud" || value === "meta") return "cloud";
  if (value === "zapi" || value === "z-api") return "zapi";
  return null;
}

function twilioConfigured(): boolean {
  return Boolean(
    Deno.env.get("TWILIO_ACCOUNT_SID") &&
      Deno.env.get("TWILIO_AUTH_TOKEN") &&
      Deno.env.get("TWILIO_FROM_NUMBER"),
  );
}

export function whatsappReady(): boolean {
  const provider = whatsappProvider();
  if (provider === "cloud") {
    return Boolean(
      Deno.env.get("WHATSAPP_TOKEN") && Deno.env.get("WHATSAPP_PHONE_ID"),
    );
  }
  if (provider === "zapi") {
    return Boolean(
      Deno.env.get("ZAPI_INSTANCE") && Deno.env.get("ZAPI_TOKEN"),
    );
  }
  return false;
}

export function smsReady(): boolean {
  return twilioConfigured();
}

export async function sendWhatsApp(
  phone: string,
  text: string,
): Promise<SendResult> {
  const provider = whatsappProvider();
  if (!provider || !whatsappReady()) {
    return { ok: false, provider: provider ?? "none", skipped: true };
  }

  try {
    if (provider === "cloud") {
      const phoneId = Deno.env.get("WHATSAPP_PHONE_ID")!;
      const token = Deno.env.get("WHATSAPP_TOKEN")!;
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone.replace(/\D/g, ""),
            type: "text",
            text: { preview_url: false, body: text },
          }),
        },
      );
      if (!response.ok) {
        return {
          ok: false,
          provider: "whatsapp-cloud",
          detail: (await response.text()).slice(0, 300),
        };
      }
      return { ok: true, provider: "whatsapp-cloud" };
    }

    const instance = Deno.env.get("ZAPI_INSTANCE")!;
    const token = Deno.env.get("ZAPI_TOKEN")!;
    const response = await fetch(
      `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": Deno.env.get("ZAPI_CLIENT_TOKEN") ?? "",
        },
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ""),
          message: text,
        }),
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        provider: "zapi",
        detail: (await response.text()).slice(0, 300),
      };
    }
    return { ok: true, provider: "zapi" };
  } catch (error) {
    return {
      ok: false,
      provider: provider === "cloud" ? "whatsapp-cloud" : "zapi",
      detail: error instanceof Error ? error.message : "erro de rede",
    };
  }
}

export async function sendSms(
  phone: string,
  text: string,
): Promise<SendResult> {
  if (!twilioConfigured()) {
    return { ok: false, provider: "twilio", skipped: true };
  }

  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const from = Deno.env.get("TWILIO_FROM_NUMBER")!;

  try {
    const body = new URLSearchParams({
      To: phone,
      From: from,
      Body: text,
    });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        provider: "twilio",
        detail: (await response.text()).slice(0, 300),
      };
    }
    return { ok: true, provider: "twilio" };
  } catch (error) {
    return {
      ok: false,
      provider: "twilio",
      detail: error instanceof Error ? error.message : "erro de rede",
    };
  }
}

export async function sendReminder(
  phone: string,
  text: string,
  options: { whatsapp: boolean; sms: boolean },
): Promise<SendResult> {
  if (options.whatsapp && whatsappReady()) {
    const result = await sendWhatsApp(phone, text);
    if (result.ok) return result;
  }
  if (options.sms && smsReady()) {
    return sendSms(phone, text);
  }
  if (options.whatsapp && !whatsappReady() && options.sms && !smsReady()) {
    return { ok: false, provider: "none", skipped: true };
  }
  if (!options.whatsapp && options.sms && !smsReady()) {
    return { ok: false, provider: "none", skipped: true };
  }
  return { ok: false, provider: "none", skipped: true };
}
