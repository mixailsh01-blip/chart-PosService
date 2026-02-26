const DEFAULT_CONFIG = {
  timezone: {
    localOffsetMin: 0,
  },
};

let cachedConfig = null;
let configPromise = null;

function normalizeConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const timezoneRaw = source.timezone && typeof source.timezone === "object" ? source.timezone : {};
  const localOffsetMin = Number(timezoneRaw.localOffsetMin);

  return {
    ...source,
    timezone: {
      ...timezoneRaw,
      localOffsetMin: Number.isFinite(localOffsetMin)
        ? localOffsetMin
        : DEFAULT_CONFIG.timezone.localOffsetMin,
    },
  };
}

export function getConfig() {
  return cachedConfig || DEFAULT_CONFIG;
}

export async function loadConfig() {
  if (cachedConfig) return cachedConfig;
  if (configPromise) return configPromise;

  const configUrl = new URL("../../config.json", import.meta.url);

  configPromise = fetch(configUrl.toString(), { cache: "no-store" })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Не удалось загрузить config.json: ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      cachedConfig = normalizeConfig(data);
      return cachedConfig;
    })
    .catch((err) => {
      console.warn("Используем конфиг по умолчанию", err);
      cachedConfig = DEFAULT_CONFIG;
      return cachedConfig;
    });

  return configPromise;
}
