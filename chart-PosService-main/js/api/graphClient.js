import { createLogger } from "../utils/logger.js";

export function createGraphClient({ graphHookUrl, fetchFn = fetch, logger } = {}) {
  if (!graphHookUrl) {
    throw new Error("graphHookUrl is required for graphClient");
  }

  const log = logger || createLogger("graph");

  async function callGraphApi(type, payload) {
    if (!type) {
      throw new Error("callGraphApi: не указан тип хука");
    }

    const allowedTypes = new Set([
      "auth",
      "auth_email_init",
      "auth_email_verify",
      "email",
      "pyrus_api",
      "pyrus_save",
    ]);
    if (!allowedTypes.has(type)) {
      log.warn(`callGraphApi: неизвестный тип хука "${type}"`);
    }

    const res = await fetchFn(graphHookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...payload }),
    });

    const contentType = res.headers.get("content-type") || "";

    if (!res.ok) {
      let body = null;
      let text = "";

      if (contentType.includes("application/json")) {
        try {
          body = await res.json();
        } catch (_) {
          body = null;
        }
      } else {
        text = await res.text().catch(() => "");
      }

      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterSec = Number(retryAfterHeader) || 0;
      const errorPayload = body?.error ?? body ?? {};
      const message =
        (typeof errorPayload === "string" && errorPayload) ||
        errorPayload.message ||
        body?.message ||
        text ||
        `Ошибка HTTP ${res.status}: ${res.statusText || ""}`;

      const error = new Error(message);
      error.status = res.status;
      error.code = errorPayload.code || body?.code;
      error.retryAfterSec =
        Number(errorPayload.retryAfterSec || body?.retryAfterSec) || retryAfterSec || 0;

      throw error;
    }

    if (!contentType.includes("application/json")) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Некорректный ответ сервера (ожидался JSON): ${text || "пустой ответ"}`
      );
    }

    return res.json();
  }

  return { callGraphApi };
}
