/* ==================== Логирование ==================== */
// Добавить в начало файла для лучшего логирования
if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
    Telegram.WebApp.expand();
    Telegram.WebApp.ready();
    
    // Показывать ошибки прямо в приложении
    window.onerror = function(message, source, lineno, colno, error) {
        Telegram.WebApp.showPopup({
            title: "Ошибка",
            message: message + " (строка " + lineno + ")",
            buttons: [{type: "close"}]
        });
        return true;
    };
}

/* ==================== ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP ==================== */
const tg = window.Telegram?.WebApp;
const user = tg?.initDataUnsafe?.user;

if (tg) {
  tg.expand();
  tg.ready();
}

/* ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================== */

const getGreetingByTime = () => {
  const hours = new Date().getHours();
  if (hours >= 5 && hours < 12) return "Доброе утро";
  if (hours >= 12 && hours < 17) return "Добрый день";
  if (hours >= 17 && hours < 23) return "Добрый вечер";
  return "Доброй ночи";
};

const formatPhoneNumber = (phone) => {
  if (!phone) return '+7 (XXX)-XXX-XXXX';
  const cleaned = phone.toString().replace(/\D/g, '');
  const match = cleaned.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return match 
    ? `+7 (${match[1]})-${match[2]}-${match[3]}-${match[4]}`
    : `+7 (${cleaned.substring(0, 3)})-${cleaned.substring(3, 6)}-${cleaned.substring(6, 8)}-${cleaned.substring(8, 10)}`;
};

/* ==================== РАБОТА С ДАННЫМИ ПОЛЬЗОВАТЕЛЯ ==================== */

const initializeUserData = () => {
  const greeting = getGreetingByTime();
  
  // Получаем имя из Telegram сразу
  let displayName = 'Гость';
  if (user?.first_name) {
    displayName = user.first_name;
  }

  // Устанавливаем имя сразу, без "Загрузка..."
  document.querySelector('#welcome-screen p').innerHTML = `${greeting}, <span id="user-name">${displayName}</span>`;

  // Остальная логика остаётся без изменений — обновление аватара, телефона и т.д.
  if (user) {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Без имени';
    document.getElementById('user-fullname').textContent = fullName;

    if (user.photo_url) {
      document.getElementById('user-avatar').src = user.photo_url;
    }

    const phoneNumber = user.phone_number;
    if (phoneNumber) {
      document.getElementById('user-phone').textContent = formatPhoneNumber(phoneNumber);
    } else {
      document.getElementById('user-phone').textContent = '+7 (XXX)-XXX-XXXX';
      document.getElementById('share-contact-btn').classList.remove('hidden');
    }
  }
};

/* ==================== РАБОТА С КАМЕРОЙ ==================== */

const checkCameraPermission = async () => {
  try {
    if (!navigator.permissions) {
      return true;
    }
    const permission = await navigator.permissions.query({ name: 'camera' });
    return permission.state === 'granted' || permission.state === 'prompt';
  } catch (error) {
    console.warn('Не удалось проверить разрешения камеры:', error);
    return true;
  }
};

const openCameraForRestaurant = async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Камера не поддерживается этим браузером или протоколом (нужен https)');
    }

    const hasPermission = await checkCameraPermission();
    if (!hasPermission && !confirm('Для добавления заведения требуется доступ к камере. Разрешить?')) {
      throw new Error('Доступ к камере запрещен пользователем');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });

    handleCameraStream(stream);

  } catch (error) {
    console.error('Ошибка при открытии камеры:', error);
    
    let errorMessage = 'Не удалось открыть камеру. ';
    
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        errorMessage += 'Доступ к камере запрещен. Пожалуйста, разрешите доступ в настройках браузера.';
        break;
      case 'NotFoundError':
      case 'OverconstrainedError':
        errorMessage += 'Камера не найдена или недоступна.';
        break;
      case 'NotReadableError':
        errorMessage += 'Камера занята другим приложением.';
        break;
      case 'AbortError':
        errorMessage += 'Операция была прервана.';
        break;
      default:
        errorMessage += error.message || 'Произошла неизвестная ошибка.';
    }
    
    alert(errorMessage);
  }
};

const handleCameraStream = (stream) => {
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    
    const cameraContainer = document.createElement('div');
    cameraContainer.id = 'camera-container';
    cameraContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #000;
      z-index: 2000;
      display: flex;
      flex-direction: column;
    `;
    
    video.style.cssText = `
      flex: 1;
      object-fit: cover;
      width: 100%;
    `;
    
    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = `
      display: flex;
      justify-content: center;
      padding: 20px;
      gap: 16px;
      background: rgba(0,0,0,0.7);
    `;

    const hint = document.createElement('div');
    hint.textContent = 'Наведите камеру на QR-код';
    hint.style.cssText = `
      color: #ffffff;
      font-size: 14px;
      opacity: 0.8;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Закрыть';
    closeBtn.style.cssText = `
      background: #333;
      color: white;
      border: none;
      padding: 15px 30px;
      border-radius: 84%;
      font-size: 16px;
      cursor: pointer;
    `;
    
    closeBtn.addEventListener('click', () => closeCamera(stream));
    
    controlsDiv.appendChild(hint);
    controlsDiv.appendChild(closeBtn);
    cameraContainer.appendChild(video);
    cameraContainer.appendChild(controlsDiv);
    
    document.body.appendChild(cameraContainer);

    // Запускаем сканирование QR-кода
    startQrScanner(video, stream);
    
  } catch (error) {
    console.error('Ошибка при создании интерфейса камеры:', error);
    closeCamera(stream);
    alert('Не удалось открыть интерфейс камеры');
  }
};

const startQrScanner = (video, stream) => {
  try {
    if (typeof jsQR === 'undefined') {
      console.error('Библиотека jsQR не загружена');
      alert('Не удалось запустить сканер QR-кода.');
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scan = () => {
      // Если камера уже закрыта, выходим
      if (!document.getElementById('camera-container')) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code && code.data) {
          handleQrResult(code.data, stream);
          return;
        }
      }

      requestAnimationFrame(scan);
    };

    requestAnimationFrame(scan);
  } catch (error) {
    console.error('Ошибка работы сканера QR:', error);
    alert('Не удалось запустить сканирование QR-кода');
  }
};

const handleQrResult = (data, stream) => {
  try {
    console.log('QR-код распознан:', data);
    closeCamera(stream);

    if (window.API?.sendQrData) {
      window.API.sendQrData(data, user)
        .then(() => {
          alert('QR-код распознан и отправлен: ' + data);
        })
        .catch((error) => {
          console.error('Ошибка отправки QR в вебхук:', error);
          alert('QR-код распознан: ' + data);
        });
    } else {
      alert('QR-код распознан: ' + data);
    }
  } catch (error) {
    console.error('Ошибка обработки результата QR:', error);
    alert('Не удалось обработать QR-код');
  }
};

const closeCamera = (stream) => {
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    const cameraContainer = document.getElementById('camera-container');
    if (cameraContainer) {
      cameraContainer.remove();
    }
    
  } catch (error) {
    console.error('Ошибка при закрытии камеры:', error);
  }
};

const handleRestaurantPhoto = (blob) => {
  try {
    console.log('Фото заведения получено, размер:', blob.size, 'байт');
    const imageUrl = URL.createObjectURL(blob);
    alert('Фото заведения успешно загружено! Теперь вы можете добавить информацию о заведении.');
    
  } catch (error) {
    console.error('Ошибка при обработке фото:', error);
    alert('Не удалось обработать фото заведения');
  }
};

const setupAddRestaurantButton = () => {
  const addRestaurantBtn = document.querySelector('.btn-AddRestaurant');
  if (addRestaurantBtn) {
    addRestaurantBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Если запущено внутри Telegram и есть встроенный сканер — используем его
      if (tg && typeof tg.openScanQrPopup === 'function') {
        tg.openScanQrPopup((text) => {
          if (!text) {
            console.log('QR-сканер Telegram закрыт без результата');
            return;
          }
          handleQrResult(text, null);
        });
      } else {
        // Иначе пробуем открыть камеру браузера
        openCameraForRestaurant();
      }
    });
  }
};

/* ==================== РАБОТА С МОДАЛЬНЫМИ ОКНАМИ ==================== */

const setupModal = () => {
  const editIcon = document.getElementById('edit-icon');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const closeModalIcon = document.getElementById('close-modal-icon');
  const saveProfileBtn = document.getElementById('save-profile-btn');
  const modal = document.getElementById('edit-modal');
  const userFullname = document.getElementById('user-fullname');

  editIcon?.addEventListener('click', () => {
    const nameParts = userFullname.textContent.split(' ');
    document.getElementById('edit-firstname').value = nameParts[0] || '';
    document.getElementById('edit-lastname').value = nameParts[1] || '';
    modal.classList.remove('hidden');
  });

  closeModalBtn?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  closeModalIcon?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  saveProfileBtn?.addEventListener('click', () => {
    const firstName = document.getElementById('edit-firstname').value.trim();
    const lastName = document.getElementById('edit-lastname').value.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Без имени';
    userFullname.textContent = fullName;
    modal.classList.add('hidden');
    
    // Также обновляем имя в приветствии
    document.getElementById('user-name').textContent = firstName || 'Гость';
  });
};

/* ==================== РАБОТА С КОНТАКТАМИ ==================== */

const setupContactSharing = () => {
  const shareBtn = document.getElementById('share-contact-btn');
  if (!shareBtn) return;

  shareBtn.addEventListener('click', () => {
    console.log('📤 Запрашиваем контакт...');
    
    // Проверяем поддержку метода
    if (typeof Telegram?.WebApp?.requestContact !== 'function') {
      showContactError('Метод requestContact не поддерживается');
      return;
    }

    // Запрашиваем контакт
    Telegram.WebApp.requestContact((result) => {
      console.log('📥 Результат requestContact:', result);
      
      // Проверяем результат
      if (!result) {
        console.warn('⚠️ Контакт не предоставлен');
        showContactError('Контакт не был предоставлен. Попробуйте еще раз.');
        return;
      }
      
      // Если результат true - контакт запрошен, данные нужно получить из initDataUnsafe
      if (result === true) {
        console.log('✅ Контакт запрошен, пытаемся получить данные...');
        
        // Попробуем получить данные через initDataUnsafe с небольшой задержкой
        setTimeout(() => {
          const initData = Telegram.WebApp.initDataUnsafe;
          console.log('🔍 initDataUnsafe:', initData);
          
          if (initData?.user?.phone_number) {
            console.log('✅ Получен контакт через initDataUnsafe');
            updateContactInfo({
              phone_number: initData.user.phone_number,
              first_name: initData.user.first_name,
              last_name: initData.user.last_name,
              user_id: initData.user.id
            });
          } else {
            // Если данных нет сразу, попробуем еще раз через 1 секунду
            setTimeout(() => {
              const initData2 = Telegram.WebApp.initDataUnsafe;
              console.log('🔍 initDataUnsafe (повторная попытка):', initData2);
              
              if (initData2?.user?.phone_number) {
                console.log('✅ Получен контакт через initDataUnsafe (повторная попытка)');
                updateContactInfo({
                  phone_number: initData2.user.phone_number,
                  first_name: initData2.user.first_name,
                  last_name: initData2.user.last_name,
                  user_id: initData2.user.id
                });
              } else {
                console.warn('⚠️ Контакт запрошен, но данные не получены');
                showContactInfo('Контакт запрошен. Если номер не отобразился, пожалуйста, перезапустите приложение.');
              }
            }, 1000);
          }
        }, 500);
        
      } else if (typeof result === 'object') {
        // Если сразу получили объект с данными
        console.log('✅ Получен контакт напрямую');
        updateContactInfo(result);
      } else if (typeof result === 'string') {
        // Если получили строку (возможно URL-параметры)
        try {
          const contact = parseContactString(result);
          if (contact) {
            console.log('✅ Получен контакт из строки');
            updateContactInfo(contact);
          } else {
            console.warn('⚠️ Не удалось распарсить строку контакта:', result);
          }
        } catch (e) {
          console.error('❌ Ошибка парсинга строки контакта:', e);
        }
      }
    });
  });
};

// Функция для парсинга строки контакта
const parseContactString = (contactString) => {
  try {
    // Попытка 1: URL-параметры
    const urlParams = new URLSearchParams(contactString);
    const contactParam = urlParams.get('contact');
    
    if (contactParam) {
      const decodedContact = decodeURIComponent(contactParam);
      return JSON.parse(decodedContact);
    }
    
    // Попытка 2: Прямой JSON
    return JSON.parse(contactString);
  } catch (e) {
    console.warn('Не удалось распарсить как JSON:', e);
    return null;
  }
};

// Функция для показа ошибки
const showContactError = (message) => {
  Telegram.WebApp?.showPopup?.({
    title: "Ошибка",
    message: message,
    buttons: [{type: "close"}]
  });
  
  console.error('❌ Ошибка получения контакта:', message);
};

// Функция для показа информационного сообщения
const showContactInfo = (message) => {
  Telegram.WebApp?.showPopup?.({
    title: "Информация",
    message: message,
    buttons: [{type: "close"}]
  });
  
  console.log('ℹ️ Информация:', message);
};

// Отдельная функция для обновления контактной информации
const updateContactInfo = (contact) => {
  console.log('✅ Обновляем контактную информацию:', contact);
  
  // Проверяем наличие номера телефона
  if (!contact?.phone_number) {
    console.warn('⚠️ Номер телефона отсутствует в данных контакта');
    showContactError('Номер телефона не найден в данных контакта');
    return;
  }
  
  // Обновляем номер телефона в профиле
  const userPhoneElement = document.getElementById('user-phone');
  if (userPhoneElement) {
    userPhoneElement.textContent = formatPhoneNumber(contact.phone_number);
    console.log('📱 Телефон обновлён в UI:', contact.phone_number);
  }
  
  // Обновляем имя, если нужно
  const userFullname = document.getElementById('user-fullname');
  const userName = document.getElementById('user-name');
  
  if (contact.first_name || contact.last_name) {
    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Без имени';
    if (userFullname) {
      userFullname.textContent = fullName;
    }
    if (userName) {
      userName.textContent = contact.first_name || 'Гость';
    }
    console.log('👤 Имя обновлено:', fullName);
  }
  
  // Прячем кнопку "Поделиться контактом"
  const shareBtn = document.getElementById('share-contact-btn');
  if (shareBtn) {
    shareBtn.classList.add('hidden');
  }
  
  // Сохраняем в localStorage (опционально)
  try {
    const cachedData = JSON.parse(localStorage.getItem('user_profile_data') || '{}');
    cachedData.phone = contact.phone_number;
    if (contact.first_name) cachedData.firstName = contact.first_name;
    if (contact.last_name) cachedData.lastName = contact.last_name;
    
    localStorage.setItem('user_profile_data', JSON.stringify({
      ...cachedData,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.error('Ошибка сохранения данных в кэш:', e);
  }
  
  // Показываем сообщение об успехе
  showContactInfo('Номер телефона успешно обновлен!');
  
  console.log('✅ Контактная информация успешно обновлена');
};

/* ==================== АНИМАЦИИ ==================== */

const resetAnimationStyles = () => {
  document.querySelectorAll('[class^="btn-"]').forEach(btn => {
    btn.style.opacity = '';
    btn.style.transform = '';
  });

  const navBar = document.querySelector('.nav-bar');
  if (navBar) {
    navBar.style.opacity = '';
    navBar.style.transform = '';
  }

  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {
    welcomeScreen.classList.remove('fade-in');
    welcomeScreen.style.display = '';
  }

  const mainApp = document.getElementById('main-app');
  if (mainApp) {
    mainApp.style.display = '';
  }
};

const animateButtons = (page) => {
  const buttons = page.querySelectorAll('[class^="btn-"]');
  buttons.forEach((btn, index) => {
    setTimeout(() => {
      btn.classList.add('slide-in');
    }, index * 400);
  });

  if (page.id === 'home') {
    const dropdownContainer = page.querySelector('.dropdown-container');
    if (dropdownContainer) {
      setTimeout(() => {
        dropdownContainer.classList.add('slide-in');
      }, 100);
    }
  }

  if (page.id === 'requests') {
    const tableContainer = page.querySelector('.requests-table');
    if (tableContainer) {
      setTimeout(() => {
        tableContainer.classList.add('slide-in');
      }, 300);
    }
  }
};

const startAnimation = () => {
  resetAnimationStyles();
  
  const welcomeScreen = document.getElementById('welcome-screen');
  welcomeScreen.style.display = 'flex';

  setTimeout(() => {
    welcomeScreen.classList.add('fade-in');
    
    setTimeout(() => {
      welcomeScreen.style.display = 'none';
      document.getElementById('main-app').style.display = 'block';
      
      setTimeout(() => {
        const activePage = document.querySelector('.page.active');
        if (activePage) animateButtons(activePage);
        document.querySelector('.nav-bar')?.classList.add('slide-in');
      }, 100);
    }, 3000);
  }, 500);
};

/* ==================== НАВИГАЦИЯ ==================== */

const setupNavigation = () => {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = btn.getAttribute('data-page');

      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

      const newPage = document.getElementById(pageId);
      newPage?.classList.add('active');
      btn.classList.add('active');

      const allButtons = newPage.querySelectorAll('[class^="btn-"]');
      allButtons.forEach(button => button.classList.remove('slide-in'));

      const dropdownContainers = newPage.querySelectorAll('.dropdown-container');
      dropdownContainers.forEach(dropdown => dropdown.classList.remove('slide-in'));

      const tableContainers = newPage.querySelectorAll('.table-container, .requests-table');
      tableContainers.forEach(table => table.classList.remove('slide-in'));

      setTimeout(() => {
        allButtons.forEach((button, index) => {
          setTimeout(() => button.classList.add('slide-in'), index * 200);
        });

        if (pageId === 'home') {
          const dropdownContainer = newPage.querySelector('.dropdown-container');
          if (dropdownContainer) {
            setTimeout(() => {
              dropdownContainer.classList.add('slide-in');
            }, 100);
          }
        }

        if (pageId === 'requests') {
          const tableContainer = newPage.querySelector('.requests-table');
          if (tableContainer) {
            setTimeout(() => {
              tableContainer.classList.add('slide-in');
            }, 300);
          }
        }
      }, 50);
    });
  });
};

/* ==================== ФИЛЬТРАЦИЯ И СОРТИРОВКА ТАБЛИЦЫ ==================== */

const setupTableFiltersAndSorting = () => {
  const table = document.getElementById('requests-table');
  const tbody = document.getElementById('requests-table-body');
  const originalRows = Array.from(tbody.querySelectorAll('tr'));
  
  let currentSort = {
    column: null,
    direction: 'asc'
  };

  const filterInputs = {
    dateCreated: document.getElementById('filter-date-created'),
    dateCompleted: document.getElementById('filter-date-completed'),
    establishment: document.getElementById('filter-establishment')
  };

  const clearFiltersBtn = document.getElementById('clear-filters');

  const applyFilters = () => {
    const filters = {
      dateCreated: filterInputs.dateCreated.value,
      dateCompleted: filterInputs.dateCompleted.value,
      establishment: filterInputs.establishment.value
    };

    const filteredRows = originalRows.filter(row => {
      const cells = row.querySelectorAll('td');
      
      if (filters.dateCreated) {
        const rowDate = cells[1].getAttribute('data-sort');
        if (rowDate && rowDate !== filters.dateCreated) {
          return false;
        }
      }

      if (filters.dateCompleted) {
        const rowDate = cells[2].getAttribute('data-sort');
        if (rowDate && rowDate !== filters.dateCompleted) {
          return false;
        }
      }

      if (filters.establishment && cells[3].textContent !== filters.establishment) {
        return false;
      }

      return true;
    });

    const sortedRows = sortRows(filteredRows, currentSort.column, currentSort.direction);
    updateTable(sortedRows);
  };

  const sortRows = (rows, column, direction) => {
    if (!column) return rows;

    const columnIndex = getColumnIndex(column);
    if (columnIndex === -1) return rows;

    return [...rows].sort((a, b) => {
      let aValue, bValue;

      switch (column) {
        case 'number':
          aValue = parseInt(a.cells[columnIndex].textContent);
          bValue = parseInt(b.cells[columnIndex].textContent);
          break;
        case 'date-created':
        case 'date-completed':
          aValue = a.cells[columnIndex].getAttribute('data-sort') || '';
          bValue = b.cells[columnIndex].getAttribute('data-sort') || '';
          break;
        case 'establishment':
          aValue = a.cells[columnIndex].textContent;
          bValue = b.cells[columnIndex].textContent;
          break;
        default:
          aValue = a.cells[columnIndex].textContent;
          bValue = b.cells[columnIndex].textContent;
      }

      if (aValue === '' && bValue !== '') return 1;
      if (aValue !== '' && bValue === '') return -1;
      if (aValue === '' && bValue === '') return 0;

      let comparison = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        comparison = aValue.toString().localeCompare(bValue.toString());
      }

      return direction === 'asc' ? comparison : -comparison;
    });
  };

  const getColumnIndex = (columnName) => {
    const columns = {
      'number': 0,
      'date-created': 1,
      'date-completed': 2,
      'establishment': 3
    };
    return columns[columnName] !== undefined ? columns[columnName] : -1;
  };

  const updateTable = (rows) => {
    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
  };

  Object.values(filterInputs).forEach(input => {
    input.addEventListener('input', applyFilters);
  });

  clearFiltersBtn.addEventListener('click', () => {
    Object.values(filterInputs).forEach(input => {
      input.value = '';
    });
    applyFilters();
  });

  const sortableHeaders = table.querySelectorAll('.sortable');
  sortableHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const column = header.getAttribute('data-column');
      
      sortableHeaders.forEach(h => {
        h.querySelector('.sort-arrow').className = 'sort-arrow';
      });

      if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
      }

      const arrow = header.querySelector('.sort-arrow');
      arrow.className = 'sort-arrow ' + currentSort.direction;

      applyFilters();
    });
  });

  const requestsPage = document.getElementById('requests');
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        if (requestsPage.classList.contains('active')) {
          const filters = requestsPage.querySelector('.table-filters');
          if (filters) {
            setTimeout(() => {
              filters.classList.add('slide-in');
            }, 100);
          }
        }
      }
    });
  });

  observer.observe(requestsPage, { attributes: true });
};

/* ==================== УЛУЧШЕНИЕ UX ==================== */

const enhanceMobileUX = () => {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch-device');
  }
  
  document.querySelectorAll('button, .nav-btn').forEach(element => {
    let lastTouchEnd = 0;
    element.addEventListener('touchend', function (event) {
      const now = (new Date()).getTime();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, false);
  });
};

/* ==================== ВЫБОР ЗАВЕДЕНИЯ ДЛЯ СЧЕТОВ ==================== */

let currentlySelectedEstablishmentButton = null;

const setupEstablishmentSelection = () => {
  const selectBtn = document.getElementById('select-establishment-btn');
  const selectedDisplay = document.getElementById('selected-establishment');
  const modal = document.getElementById('establishment-modal');
  const closeBtn = document.getElementById('close-establishment-modal-btn');
  const establishmentItems = document.querySelectorAll('.establishment-item');

  if (!selectBtn || !selectedDisplay || !modal || !closeBtn) return;

  // Открытие модального окна
  selectBtn.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.remove('hidden');
  });

  // Закрытие по кнопке "Отмена"
  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // Выбор заведения
  establishmentItems.forEach(item => {
    item.addEventListener('click', () => {
      const establishmentName = item.textContent.trim();

      // Сбрасываем предыдущую выбранную кнопку
      if (currentlySelectedEstablishmentButton) {
        currentlySelectedEstablishmentButton.classList.remove('selected');
      }

      // Применяем состояние к новой
      item.classList.add('selected');
      currentlySelectedEstablishmentButton = item;

      // Обновляем отображение
      selectedDisplay.textContent = establishmentName;
      selectedDisplay.classList.remove('text-gray-400');
      selectedDisplay.classList.add('text-white');

      // Закрываем модалку
      modal.classList.add('hidden');
    });
  });
};

/* ==================== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ==================== */

const initializeApp = () => {
  try {
    initializeUserData(); // Показываем имя из Telegram сразу
    setupModal();
    setupContactSharing();
    setupNavigation();
    setupAddRestaurantButton();
    enhanceMobileUX();
    setupTableFiltersAndSorting();
    setupEstablishmentSelection();

    // Показываем приветственный экран
    //const welcomeScreen = document.getElementById('welcome-screen');
    //welcomeScreen.style.display = 'flex';
    //welcomeScreen.classList.add('fade-in');

    // Запускаем авторизацию
    if (user && window.Auth) {
      window.Auth.authorize(user, () => {
        // После завершения авторизации — запускаем основную анимацию
        startAnimation();
      });
    } else {
      // Если нет данных пользователя или Auth — запускаем через 2 секунды
      setTimeout(() => {
        startAnimation();
      }, 2000);
    }

  } catch (error) {
    console.error('❌ Ошибка инициализации приложения:', error);
    alert('Произошла ошибка при запуске приложения. Попробуйте перезагрузить.');
    setTimeout(() => {
      startAnimation();
    }, 1000);
  }
};

document.addEventListener('DOMContentLoaded', initializeApp);
