// /js/api/pyrusAuth.js
const N8N_GRAPH_URL = (window.APP_CONFIG && window.APP_CONFIG.graphHookUrl) || "https://jolikcisout.beget.app/webhook/pyrus/graph";

/**
 * Универсальный вызов Pyrus через n8n-хук /graph с type="pyrus-api".
 *
 * path   - строка вида "/members", "/catalogs/281369", "/forms/2375272/register"
 * options.method - HTTP метод
 * options.body   - строка JSON или объект
 *
 * Ожидаемый ответ от n8n:
 * {
 *   "success": true,
 *   "data": <сырой JSON от Pyrus>
 * }
 */
export async function pyrusFetch(path, options = {}) {
  const method = options.method || "GET";

  let rawBody = options.body || null;
  let payload = null;

  if (rawBody != null) {
    if (typeof rawBody === "string") {
      try {
        payload = JSON.parse(rawBody);
      } catch (e) {
        // оставляем строку как есть
        payload = rawBody;
      }
    } else {
      payload = rawBody;
    }
  }

  const res = await fetch(N8N_GRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "pyrus-api",
      path,
      method,
      payload
    })
  });

  const text = await res.text();

  alert(
    "Ответ n8n (/graph, type=pyrus-api):\n" +
      "HTTP " +
      res.status +
      "\n\n" +
      text
  );

  if (!res.ok) {
    throw new Error("Ошибка обращения к n8n-прокси: HTTP " + res.status);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error("Некорректный JSON от n8n (pyrus-api)");
  }

  if (!json.success) {
    throw new Error("Ошибка от Pyrus через n8n: " + (json.error || "unknown"));
  }

  const data = json.data;

  // Возвращаем "псевдо-Response", чтобы дальше можно было делать res.json()
  return {
    ok: true,
    async json() {
      return data;
    }
  };
}
