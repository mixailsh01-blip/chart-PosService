/* ==================== AUTH MODULE ==================== */
/* Отвечает за авторизацию, кэширование, обновление UI */

const Auth = {
  tg: window.Telegram?.WebApp,
  CACHE_KEY: 'user_profile_data',
  CACHE_TTL: 24 * 60 * 60 * 1000, // 24 часа

  /**
   * Показывает индикатор загрузки
   */
  showLoading() {
    // Создаём оверлей загрузки
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        flex-direction: column;
        color: white;
        font-family: 'PT Root UI', sans-serif;
      `;

      const spinner = document.createElement('div');
      spinner.style.cssText = `
        width: 40px;
        height: 40px;
        border: 4px solid #333;
        border-top: 4px solid #00c8ff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 20px;
      `;

      const text = document.createElement('div');
      text.textContent = 'Загрузка данных...';
      text.style.cssText = `
        font-size: 16px;
        font-weight: 500;
      `;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;

      overlay.appendChild(spinner);
      overlay.appendChild(text);
      overlay.appendChild(style);
      document.body.appendChild(overlay);
    }

    overlay.style.display = 'flex';
  },

  /**
   * Скрывает индикатор загрузки
   */
  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  },

  /**
   * Сохраняет данные в localStorage
   * @param {Object} data - Данные для сохранения
   */
  saveToCache(data) {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({
        ...data,
        timestamp: Date.now()
      }));
      console.log('💾 [Auth] Данные сохранены в кэш');
    } catch (error) {
      console.error('❌ [Auth] Ошибка сохранения в localStorage:', error);
    }
  },

  /**
   * Загружает данные из localStorage
   * @returns {Object|null}
   */
  loadFromCache() {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return null;

      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp > this.CACHE_TTL) {
        console.log('🕒 [Auth] Кэш устарел');
        return null;
      }

      console.log('📂 [Auth] Данные загружены из кэша');
      return data;
    } catch (error) {
      console.error('❌ [Auth] Ошибка загрузки из localStorage:', error);
      return null;
    }
  },

  /**
   * Обновляет профиль и рестораны на основе данных из хука
   * @param {Object} userData - Данные пользователя из ответа хука
   */
  updateProfile(userData) {
    // Исправлена опечатка: famely -> lastName
    const firstName = userData.name || '';
    const lastName = userData.last_name || userData.family || ''; // Добавлена проверка на last_name
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Без имени';

    const userFullname = document.getElementById('user-fullname');
    const userName = document.getElementById('user-name');
    
    if (userFullname) userFullname.textContent = fullName;
    if (userName) userName.textContent = firstName || 'Гость';

    // Обновляем телефон
    const phone = userData.phone;
    const userPhone = document.getElementById('user-phone');
    const shareContactBtn = document.getElementById('share-contact-btn');

    if (phone && userPhone) {
      userPhone.textContent = this.formatPhoneNumber(phone);
      if (shareContactBtn) shareContactBtn.classList.add('hidden'); // Прячем кнопку
    }

    // Обновляем список ресторанов
    this.updateRestaurants(userData.restaurants);

    // Сохраняем в кэш
    this.saveToCache({
      fullName,
      phone,
      restaurants: userData.restaurants
    });
  },

  /**
   * Обновляет выпадающий список ресторанов
   * @param {string|Array} restaurantsData - JSON-строка или массив с ресторанами
   */
  updateRestaurants(restaurantsData) {
    try {
      let restaurants = [];
      
      // Обработка разных форматов данных
      if (typeof restaurantsData === 'string') {
        restaurants = JSON.parse(restaurantsData);
      } else if (Array.isArray(restaurantsData)) {
        restaurants = restaurantsData;
      } else {
        console.warn('⚠️ [Auth] Некорректный формат данных ресторанов');
        return;
      }
      
      const dropdown = document.getElementById('main-dropdown');
      
      if (!dropdown || !Array.isArray(restaurants)) return;

      // Очищаем текущие опции (кроме placeholder)
      dropdown.innerHTML = '<option value="">Выберите заведение</option>';

      // Добавляем рестораны
      restaurants.forEach(restaurant => {
        if (restaurant.name && restaurant.id) {
          const option = document.createElement('option');
          option.value = restaurant.id;
          option.textContent = restaurant.name;
          dropdown.appendChild(option);
        }
      });

      console.log(`✅ [Auth] Загружено ${restaurants.length} ресторанов`);

    } catch (error) {
      console.error('❌ [Auth] Ошибка парсинга ресторанов:', error);
    }
  },

  /**
   * Форматирование номера телефона
   * @param {string|number} phone - Номер телефона
   * @returns {string}
   */
  formatPhoneNumber(phone) {
    if (!phone) return '+7 (XXX)-XXX-XXXX';
    const cleaned = phone.toString().replace(/\D/g, '');
    const match = cleaned.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
    return match 
      ? `+7 (${match[1]})-${match[2]}-${match[3]}-${match[4]}`
      : `+7 (${cleaned.substring(0, 3)})-${cleaned.substring(3, 6)}-${cleaned.substring(6, 8)}-${cleaned.substring(8, 10)}`;
  },

  /**
   * Загружает данные из кэша и обновляет UI
   * @returns {boolean} Успешно ли загружены данные
   */
  loadFromCacheAndUpdateUI() {
    const cachedData = this.loadFromCache();
    if (!cachedData) return false;

    // Обновляем профиль
    const userFullname = document.getElementById('user-fullname');
    const userName = document.getElementById('user-name');
    const userPhone = document.getElementById('user-phone');
    const shareContactBtn = document.getElementById('share-contact-btn');

    if (userFullname) userFullname.textContent = cachedData.fullName || 'Без имени';
    if (userName) userName.textContent = (cachedData.fullName || 'Гость').split(' ')[0];
    
    if (cachedData.phone && userPhone) {
      userPhone.textContent = this.formatPhoneNumber(cachedData.phone);
      if (shareContactBtn) shareContactBtn.classList.add('hidden');
    }

    // Обновляем рестораны
    if (cachedData.restaurants) {
      this.updateRestaurants(cachedData.restaurants);
    }

    console.log('✅ [Auth] Данные загружены из кэша');
    return true;
  },

  /**
   * Основной процесс авторизации
   * @param {Object} userData - Данные пользователя из Telegram
   * @param {Function} onReady - Callback, вызываемый после завершения авторизации (всегда!)
   */
  async authorize(userData, onReady = null) {
    if (!userData?.id) {
      console.warn('⚠️ [Auth] Нет ID пользователя для авторизации');
      this.hideLoading(); // На всякий случай скрываем индикатор
      if (onReady) onReady();
      return;
    }

    // Показываем индикатор загрузки
    this.showLoading();

    try {
      // Сначала пробуем загрузить из кэша
      if (this.loadFromCacheAndUpdateUI()) {
        console.log('✅ [Auth] Данные загружены из кэша');
        // Ждём 2 секунды для плавности
        await new Promise(resolve => setTimeout(resolve, 0));
        if (onReady) onReady();
        return;
      }

      // Если кэш неактуален — запрашиваем с сервера
      if (!window.API) {
        console.error('❌ [Auth] Модуль API не загружен');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Ждём 2 сек для UX
        if (onReady) onReady();
        return;
      }

      const result = await window.API.authorize(userData);
      if (!result) {
        console.warn('⚠️ [Auth] Нет ответа от сервера');
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (onReady) onReady();
        return;
      }

      // Находим текущего пользователя по ID
      const currentUser = result.find(item => String(item.id) === String(userData.id));
      if (!currentUser) {
        console.warn('⚠️ [Auth] Пользователь не найден в ответе');
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (onReady) onReady();
        return;
      }

      // Обновляем профиль
      this.updateProfile(currentUser);
      console.log('✅ [Auth] Профиль успешно обновлён');

      // Ждём 2 секунды для плавности
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error('❌ [Auth] Ошибка авторизации:', error);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Всё равно ждём 2 сек
    } finally {
      // ВСЕГДА скрываем индикатор и вызываем onReady
      this.hideLoading();
      if (onReady) onReady(); // ← ЭТО КРИТИЧЕСКИ ВАЖНО
    }
  }
}; // Добавлена закрывающая фигурная скобка

// Экспортируем модуль
window.Auth = Auth;
