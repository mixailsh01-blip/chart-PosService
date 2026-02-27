/* ==================== API MODULE ==================== */
/* Отвечает за все HTTP-запросы к внешним системам */

const API = {
  /**
   * Авторизация через хук
   * @param {Object} userData - Данные пользователя из Telegram
   * @returns {Promise<Array|null>} Массив пользователей или null
   */
  async authorize(userData) {
    const hookUrl = 'https://quumahienot.beget.app/webhook/lk-ps';
    const payload = {
      date: "auth",
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null
    };

    try {
      console.log('📤 [API] Отправляем запрос авторизации:', payload);
      
      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ [API] Ответ от хука:', result);
      return result;

    } catch (error) {
      console.error('❌ [API] Ошибка авторизации:', error);
      return null;
    }
  },

  /**
   * Отправка данных QR-кода в вебхук
   * @param {string} qrData - Строка из QR-кода (обычно URL)
   * @param {Object} userData - Данные пользователя из Telegram
   * @returns {Promise<any|null>} Ответ вебхука или null
   */
  async sendQrData(qrData, userData) {
    const hookUrl = 'https://quumahienot.beget.app/webhook/lk-ps';
    const userDataWithoutPhoto = Object.fromEntries(
      Object.entries(userData || {}).filter(
        ([key]) => !['photo_url', 'photo', 'avatar', 'avatar_url'].includes(key)
      )
    );

    const payload = {
      date: "qr",
      qr_data: qrData,
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      tg_user: userDataWithoutPhoto
    };

    try {
      console.log('📤 [API] Отправляем QR в вебхук:', payload);
      
      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] QR успешно отправлен, ответ:', result);
      return result;

    } catch (error) {
      console.error('❌ [API] Ошибка отправки QR:', error);
      return null;
    }
  }
  ,

  /**
   * Второй вебхук: передаем массив заведений [{Client, ID}]
   * @param {Array|Object} establishmentsPayload - Массив или один объект {Client, ID}
   * @returns {Promise<any|null>} Ответ вебхука или null
   */
  async sendTaskSupport(establishmentsPayload) {
    const hookUrl = 'https://quumahienot.beget.app/webhook/task_support';
    const payload = Array.isArray(establishmentsPayload)
      ? establishmentsPayload
      : (establishmentsPayload ? [establishmentsPayload] : []);

    try {
      console.log('📤 [API] Отправляем task_support:', payload);

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ task_support:', result);
      return result;

    } catch (error) {
      console.error('❌ [API] Ошибка task_support:', error);
      return null;
    }
  }

  ,

  /**
   * При открытии страницы отправляем данные пользователя Telegram в вебхук
   * @param {Object} userData - tg.initDataUnsafe.user
   * @param {Object} webApp - window.Telegram.WebApp
   * @returns {Promise<any|null>}
   */
  async sendClientTGSupport(userData, webApp) {
    const hookUrl = 'https://quumahienot.beget.app/webhook/clientTG_support';
    const userDataWithoutPhoto = Object.fromEntries(
      Object.entries(userData || {}).filter(
        ([key]) => !['photo_url', 'photo', 'avatar', 'avatar_url'].includes(key)
      )
    );

    // Берем максимально полезные данные, но оставляем payload JSON-safe
    const payload = {
      date: 'clientTG_support',
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      tg_user: userDataWithoutPhoto,
      tg_init_data: webApp?.initData || null,
      tg_platform: webApp?.platform || null,
      tg_version: webApp?.version || null,
      tg_color_scheme: webApp?.colorScheme || null
    };

    try {
      console.log('📤 [API] Отправляем clientTG_support:', payload);

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ clientTG_support:', result);
      return result;
    } catch (error) {
      console.error('❌ [API] Ошибка clientTG_support:', error);
      return null;
    }
  }

  ,

  /**
   * Регистрация клиента после предоставления номера телефона
   * @param {Object} contact - объект контакта (ожидается phone_number)
   * @param {Object} userData - tg.initDataUnsafe.user
   * @param {Object} webApp - window.Telegram.WebApp
   * @returns {Promise<any|null>}
   */
  async sendRegistrClient(contact, userData, webApp) {
    const hookUrl = 'https://quumahienot.beget.app/webhook/registr_client';
    const userDataWithoutPhoto = Object.fromEntries(
      Object.entries(userData || {}).filter(
        ([key]) => !['photo_url', 'photo', 'avatar', 'avatar_url'].includes(key)
      )
    );

    const payload = {
      date: 'registr_client',
      phone_number: contact?.phone_number || null,
      user_id: userData?.id || null,
      username: userData?.username || null,
      first_name: userData?.first_name || null,
      last_name: userData?.last_name || null,
      tg_user: userDataWithoutPhoto,
      tg_init_data: webApp?.initData || null,
      tg_platform: webApp?.platform || null,
      tg_version: webApp?.version || null
    };

    try {
      console.log('📤 [API] Отправляем registr_client:', payload);

      const response = await fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json().catch(() => null);
      console.log('✅ [API] Ответ registr_client:', result);
      return result;
    } catch (error) {
      console.error('❌ [API] Ошибка registr_client:', error);
      return null;
    }
  }
};

// Экспортируем модуль
window.API = API;
