// js/config.js
//
// Цель: убрать хардкод → все берём из config.json, но:
// 1) сохраняем дефолты и нормализацию (структура всегда валидна)
// 2) даём удобный доступ по пути (getConfigValue)
// 3) проверяем “обязательные” пути (логируем, но не валим приложение)

const DEFAULT_CONFIG = {
  graphHookUrl: "https://jolikcisout.beget.app/webhook/pyrus/graph",
  clients: {
    webhookUrl: "",
    editWebhookUrl: "",
  },
  auth: {
    methods: {
      loginPassword: {
        enabled: true,
      },
      emailOtp: {
        enabled: false,
      },
    },
    ttlMs: 10 * 60 * 1000,
    codeLength: 6,
    resendTimerSec: 60,
    uiTexts: {
      title: "Вход",
      subtitle: "Подтвердите доступ",
      loginLabel: "Логин",
      passwordLabel: "Пароль",
      emailLabel: "Email",
      otpLabel: "Код из письма",
      submitLabel: "Продолжить",
      resendLabel: "Отправить код ещё раз",
      loadingLabel: "Проверяем данные...",
      errorGeneric: "Не удалось войти. Попробуйте ещё раз.",
    },
    webhooks: {
      emailInit: "",
      emailVerify: "",
    },
    rolePermissions: {
      ALL: [],
      L1: [],
      L2: [],
      OP: [],
      OV: [],
      OU: [],
      AI: [],
    },
  },
  timezone: {
    localOffsetMin: 4 * 60, // GMT+4
  },
  storage: {
    keys: {
      localChanges: "sm1_local_changes",
      changeHistory: "sm1_change_history",
      theme: "sm1_theme_preference",
      currentLine: "sm1_current_line",
      employeeFilters: "sm1_employee_filters",
      cachedEmployees: "sm1_cached_employees",
      cachedShiftTemplates: "sm1_cached_shift_templates",
      cachedSchedulePrefix: "sm1_cached_schedule_",
      shiftDrafts: "graph_l1l2_shift_drafts_v1",
    },
    auth: {
      key: "sm_graph_auth_v1",
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
      ttlMs: 7 * 24 * 60 * 60 * 1000,
      cookieDays: 7,
    },
  },
  // Оставляем дефолты для Pyrus-структуры, чтобы можно было читать config.pyrus.*
  // даже если config.json пустой/не загрузился.
  pyrus: {
    catalogs: {
      shifts: 281369,
    },
    forms: {
      otpusk: 2348174,
      smeni: 2375272,
    },
    // Важно: в коде выше использовались:
    // - smeni.template (а не smeni.shift)
    // - otpusk.person, otpusk.period
    fields: {
      otpusk: { person: 1, period: 2 },
      smeni: { due: 4, amount: 5, person: 8, template: 10 },
    },
  },

  // Эти секции ранее были fallback'ами в app.js.
  // Если хотите убрать “жёсткие” дефолты из app.js полностью — держим их тут.
  ui: {
    lines: {
      order: ["ALL", "OP", "OV", "L1", "L2", "AI", "OU"],
      labels: { ALL: "ВСЕ", OP: "OP", OV: "OV", L1: "L1", L2: "L2", AI: "AI", OU: "OU" },
    },
  },
  departments: {
    byLine: {
      L1: [108368027],
      L2: [108368026, 171248779, 171248780],
      OV: [80208117],
      OP: [108368021, 157753518, 157753516], // важно: порядок групп
      OU: [108368030],
      AI: [166353950],
    },
    orderByLine: {
      L2: [108368026, 171248779, 171248780],
      OP: [108368021, 157753518, 157753516],
    },
  },
  management: {
    topManagementIds: [1167305, 314287], // Лузин, Сухачев
  },
  // Pyrus: значение каталога "Линия/Отдел" (field id=1) в форме явок
  pyrusLineItemIdByLine: {
    L2: 157816613,
    L1: 165474029,
    OV: 157816614,
    OU: 157816622,
    AI: 168065907,
    OP: 157816621,
  },
  calendar: {
    prodCal: {
      ttlMs: 30 * 24 * 60 * 60 * 1000,
      urlTemplate: "https://isdayoff.ru/api/getdata?year={year}&month={month}&day1=1&day2={lastDay}&pre=1&holiday=1",
      cacheKeyPrefix: "prodcal_ru_",
    },
ui: {
  light: {
    workday: {
      background: "transparent",
      border: "var(--table-border-strong)",
      dash: "transparent",
    },
    weekend: {
      background: "#f2e8e8",
      border: "var(--table-border-strong)",
      dash: "transparent",
    },
    holiday: {
      background: "#fadddd",
      border: "#e06b6b",
      dash: "transparent",
    },
    preholiday: {
      background: "#fff4cc",
      border: "var(--table-border-strong)",
      dash: "#3a3522",
    },
    microIndicators: {
      weekend: "#f2e8e8",
      holiday: "#e06b6b",
      preholiday: "#3a3522",
    },
  },
  dark: {
    workday: {
      background: "transparent",
      border: "var(--table-border-strong)",
      dash: "transparent",
    },
    weekend: {
      background: "#332626",
      border: "var(--table-border-strong)",
      dash: "transparent",
    },
    holiday: {
      background: "#4a2323",
      border: "#c45a5a",
      dash: "transparent",
    },
    preholiday: {
      background: "#e6c65c",
      border: "var(--table-border-strong)",
      dash: "#d1b84d",
    },
    microIndicators: {
      weekend: "#332626",
      holiday: "#c45a5a",
      preholiday: "#d1b84d",
    },
  },
},

indicators: {
  birthdayBg: "#ff2b2b",
  birthdayText: "#000000",
},

  },
};

const REQUIRED_PATHS = [
  "graphHookUrl",
  "auth",
  "auth.methods",
  "auth.ttlMs",
  "auth.codeLength",
  "auth.resendTimerSec",
  "auth.uiTexts",
  "auth.webhooks",
  "pyrus",
  "pyrus.catalogs",
  "pyrus.forms",
  "pyrus.fields",
  "timezone",
  "timezone.localOffsetMin",
  "storage",
  "storage.keys",
  "storage.auth",
  "calendar",
  "calendar.prodCal",
  "calendar.prodCal.urlTemplate",
];

function normalizeConfig(config) {
  const root = config && typeof config === "object" ? config : {};

  const auth = root.auth ?? {};
  const authMethods = auth.methods ?? {};
  const authMethodLoginPassword = authMethods.loginPassword ?? {};
  const authMethodEmailOtp = authMethods.emailOtp ?? {};
  const authUiTexts = auth.uiTexts ?? {};
  const authWebhooks = auth.webhooks ?? {};
  const authRolePermissions = auth.rolePermissions ?? {};

  const storage = root.storage ?? {};
  const storageKeys = storage.keys ?? {};
  const storageAuth = storage.auth ?? {};

  const timezone = root.timezone ?? {};
  const pyrus = root.pyrus ?? {};
  const pyrusCatalogs = pyrus.catalogs ?? {};
  const pyrusForms = pyrus.forms ?? {};
  const pyrusFields = pyrus.fields ?? {};
  const pyrusFieldsOtpusk = pyrusFields.otpusk ?? {};
  const pyrusFieldsSmeni = pyrusFields.smeni ?? {};

  const ui = root.ui ?? {};
  const clients = root.clients ?? {};
  const uiLines = ui.lines ?? {};
  const departments = root.departments ?? {};
  const deptByLine = departments.byLine ?? {};
  const deptOrderByLine = departments.orderByLine ?? {};
  const management = root.management ?? {};
  const calendar = root.calendar ?? {};
  const prodCal = calendar.prodCal ?? {};
  const calendarIndicators = calendar.indicators ?? {};
const calendarUi = calendar.ui ?? {};
const calendarUiLight = calendarUi.light ?? {};
const calendarUiDark = calendarUi.dark ?? {};

const calendarUiLightWorkday = calendarUiLight.workday ?? {};
const calendarUiLightWeekend = calendarUiLight.weekend ?? {};
const calendarUiLightHoliday = calendarUiLight.holiday ?? {};
const calendarUiLightPreholiday = calendarUiLight.preholiday ?? {};
const calendarUiLightMicro = calendarUiLight.microIndicators ?? {};

const calendarUiDarkWorkday = calendarUiDark.workday ?? {};
const calendarUiDarkWeekend = calendarUiDark.weekend ?? {};
const calendarUiDarkHoliday = calendarUiDark.holiday ?? {};
const calendarUiDarkPreholiday = calendarUiDark.preholiday ?? {};
const calendarUiDarkMicro = calendarUiDark.microIndicators ?? {};


  return {
    ...DEFAULT_CONFIG,
    ...root,

    graphHookUrl: root.graphHookUrl ?? DEFAULT_CONFIG.graphHookUrl,
    clients: {
      ...DEFAULT_CONFIG.clients,
      ...clients,
    },

    auth: {
      ...DEFAULT_CONFIG.auth,
      ...auth,
      methods: {
        ...DEFAULT_CONFIG.auth.methods,
        ...authMethods,
        loginPassword: {
          ...DEFAULT_CONFIG.auth.methods.loginPassword,
          ...authMethodLoginPassword,
        },
        emailOtp: {
          ...DEFAULT_CONFIG.auth.methods.emailOtp,
          ...authMethodEmailOtp,
        },
      },
      uiTexts: {
        ...DEFAULT_CONFIG.auth.uiTexts,
        ...authUiTexts,
      },
      webhooks: {
        ...DEFAULT_CONFIG.auth.webhooks,
        ...authWebhooks,
      },
      rolePermissions: {
        ...DEFAULT_CONFIG.auth.rolePermissions,
        ...authRolePermissions,
      },
    },

    timezone: {
      ...DEFAULT_CONFIG.timezone,
      ...timezone,
      localOffsetMin: timezone.localOffsetMin ?? DEFAULT_CONFIG.timezone.localOffsetMin,
    },

    storage: {
      ...DEFAULT_CONFIG.storage,
      ...storage,
      keys: {
        ...DEFAULT_CONFIG.storage.keys,
        ...storageKeys,
      },
      auth: {
        ...DEFAULT_CONFIG.storage.auth,
        ...storageAuth,
      },
    },

    pyrus: {
      ...DEFAULT_CONFIG.pyrus,
      ...pyrus,
      catalogs: {
        ...DEFAULT_CONFIG.pyrus.catalogs,
        ...pyrusCatalogs,
      },
      forms: {
        ...DEFAULT_CONFIG.pyrus.forms,
        ...pyrusForms,
      },
      fields: {
        ...DEFAULT_CONFIG.pyrus.fields,
        ...pyrusFields,
        otpusk: {
          ...DEFAULT_CONFIG.pyrus.fields.otpusk,
          ...pyrusFieldsOtpusk,
        },
        smeni: {
          ...DEFAULT_CONFIG.pyrus.fields.smeni,
          ...pyrusFieldsSmeni,
        },
      },
    },

    ui: {
      ...DEFAULT_CONFIG.ui,
      ...ui,
      lines: {
        ...DEFAULT_CONFIG.ui.lines,
        ...uiLines,
        order: uiLines.order ?? DEFAULT_CONFIG.ui.lines.order,
        labels: {
          ...DEFAULT_CONFIG.ui.lines.labels,
          ...(uiLines.labels ?? {}),
        },
      },
    },

    departments: {
      ...DEFAULT_CONFIG.departments,
      ...departments,
      byLine: {
        ...DEFAULT_CONFIG.departments.byLine,
        ...deptByLine,
      },
      orderByLine: {
        ...DEFAULT_CONFIG.departments.orderByLine,
        ...deptOrderByLine,
      },
    },

    management: {
      ...DEFAULT_CONFIG.management,
      ...management,
      topManagementIds:
        management.topManagementIds ?? DEFAULT_CONFIG.management.topManagementIds,
    },

    pyrusLineItemIdByLine: root.pyrusLineItemIdByLine ?? DEFAULT_CONFIG.pyrusLineItemIdByLine,

    calendar: {
      ...DEFAULT_CONFIG.calendar,
      ...calendar,
      prodCal: {
        ...DEFAULT_CONFIG.calendar.prodCal,
        ...prodCal,
      },
ui: {
  ...DEFAULT_CONFIG.calendar.ui,
  ...calendarUi,
  light: {
    ...DEFAULT_CONFIG.calendar.ui.light,
    ...calendarUiLight,
    workday: {
      ...DEFAULT_CONFIG.calendar.ui.light.workday,
      ...calendarUiLightWorkday,
    },
    weekend: {
      ...DEFAULT_CONFIG.calendar.ui.light.weekend,
      ...calendarUiLightWeekend,
    },
    holiday: {
      ...DEFAULT_CONFIG.calendar.ui.light.holiday,
      ...calendarUiLightHoliday,
    },
    preholiday: {
      ...DEFAULT_CONFIG.calendar.ui.light.preholiday,
      ...calendarUiLightPreholiday,
    },
    microIndicators: {
      ...DEFAULT_CONFIG.calendar.ui.light.microIndicators,
      ...calendarUiLightMicro,
    },
  },
  dark: {
    ...DEFAULT_CONFIG.calendar.ui.dark,
    ...calendarUiDark,
    workday: {
      ...DEFAULT_CONFIG.calendar.ui.dark.workday,
      ...calendarUiDarkWorkday,
    },
    weekend: {
      ...DEFAULT_CONFIG.calendar.ui.dark.weekend,
      ...calendarUiDarkWeekend,
    },
    holiday: {
      ...DEFAULT_CONFIG.calendar.ui.dark.holiday,
      ...calendarUiDarkHoliday,
    },
    preholiday: {
      ...DEFAULT_CONFIG.calendar.ui.dark.preholiday,
      ...calendarUiDarkPreholiday,
    },
    microIndicators: {
      ...DEFAULT_CONFIG.calendar.ui.dark.microIndicators,
      ...calendarUiDarkMicro,
    },
  },
},

indicators: {
  ...DEFAULT_CONFIG.calendar.indicators,
  ...calendarIndicators,
},

    },
  };
}

function hasPath(obj, path) {
  const parts = String(path).split(".").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) return false;
    current = current[part];
  }
  return true;
}

function warnMissingRequiredPaths(cfg) {
  const missing = REQUIRED_PATHS.filter((p) => !hasPath(cfg, p));
  if (missing.length) {
    console.error(`Отсутствуют ключи в config.json: ${missing.join(", ")}`);
  }
}

const CONFIG_URL = new URL("../config.json", import.meta.url).toString();

async function loadConfig() {
  try {
    const response = await fetch(CONFIG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Config load failed: HTTP ${response.status}`);

    const loaded = await response.json();
    const normalized = normalizeConfig(loaded);

    warnMissingRequiredPaths(normalized);
    window.APP_CONFIG = normalized; // отладка

    return normalized;
  } catch (error) {
    console.warn("Не удалось загрузить config.json, использую значения по умолчанию", error);

    const normalized = normalizeConfig({});
    warnMissingRequiredPaths(normalized);
    window.APP_CONFIG = normalized;

    return normalized;
  }
}

export const config = await loadConfig();

function resolvePath(obj, path) {
  if (!path) return undefined;

  const parts = String(path).split(".").filter(Boolean);
  let current = obj;

  for (const part of parts) {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function getConfigValue(path, options = {}) {
  const { defaultValue = undefined, required = false } = options;

  const value = resolvePath(config, path);
  if (value === undefined || value === null) {
    const message = `Отсутствует ключ конфига: ${path}`;
    if (required) console.error(message);
    else console.warn(message);
    return defaultValue;
  }
  return value;
}

export function getConfig() {
  return config;
}
