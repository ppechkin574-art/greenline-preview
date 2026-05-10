/* GreenLine — слой данных (api.js)
 *
 * UI вызывает ТОЛЬКО функции из window.api — не firebase.*, не fetch.
 * Сейчас под капотом Firebase. При переходе на NestJS — меняется только
 * содержимое этого файла; экраны не трогаются.
 *
 * Контракт зафиксирован в /Users/macbookpro/greenline/CONTEXT.md
 * (раздел «Гибрид GreenLine — карта ответственности»).
 */
(function () {
  'use strict';

  // Firebase инициализирован в app.js (ранний скрипт). Берём готовые ссылки.
  function _db()   { return firebase.database(); }
  function _auth() { return firebase.auth(); }

  // Общий обработчик ошибок: при переезде на NestJS легко завернуть в HTTP-status.
  function _err(scope, e) {
    console.warn('[api.' + scope + ']', e && e.message || e);
    throw e;
  }

  // ================== AUTH ==================
  // SMS-вход через Firebase Phone Auth. Тест-номера настраиваются в Firebase Console
  // (Authentication → Sign-in method → Phone → Phone numbers for testing).
  // При переезде на NestJS — реализация меняется на fetch к собственному endpoint.

  function _getRecaptcha(containerId) {
    // Recaptcha создаётся ОДИН РАЗ. После signOut'а или ошибки — clearRecaptcha().
    if (window._glRecaptcha) return window._glRecaptcha;
    const verifier = new firebase.auth.RecaptchaVerifier(containerId || 'recaptcha-container', {
      size: 'invisible',
      callback: function () { /* пройдена — Firebase сам отправит SMS */ },
      'expired-callback': function () { clearRecaptcha(); }
    });
    // Принудительный рендер — ловим ошибки конфигурации (домен, ключи) рано.
    verifier.render().catch(function (e) { console.warn('recaptcha render', e); });
    window._glRecaptcha = verifier;
    return verifier;
  }

  function clearRecaptcha() {
    try { if (window._glRecaptcha) window._glRecaptcha.clear(); } catch (e) {}
    window._glRecaptcha = null;
    // Контейнер reCAPTCHA Firebase может оставить «съеденным» — очистим вручную.
    const c = document.getElementById('recaptcha-container');
    if (c) c.innerHTML = '';
  }

  const auth = {
    /** @returns {Promise<ConfirmationResult>} объект для последующего auth.verifyCode */
    async sendCode(phoneE164, recaptchaContainerId) {
      try {
        const verifier = _getRecaptcha(recaptchaContainerId);
        return await _auth().signInWithPhoneNumber(phoneE164, verifier);
      } catch (e) {
        clearRecaptcha();
        _err('auth.sendCode', e);
      }
    },

    /** @param confirmation — результат sendCode */
    async verifyCode(confirmation, code) {
      try { return await confirmation.confirm(code); }
      catch (e) { _err('auth.verifyCode', e); }
    },

    async logout() {
      try {
        clearRecaptcha();
        return await _auth().signOut();
      } catch (e) { _err('auth.logout', e); }
    },

    currentUser() { return _auth().currentUser; },

    /** Подписка на изменение состояния (firebase сам персистит сессию в IndexedDB). */
    onAuthChange(cb) { return _auth().onAuthStateChanged(cb); },

    /** Сбросить reCAPTCHA вручную — нужно при resend кода. */
    resetRecaptcha: clearRecaptcha
  };

  // ================== CLIENTS ==================
  // phone10 — 10 цифр без +7 (используется как ключ — совместимо с текущей схемой)
  const clients = {
    async get(phone10) {
      try {
        const snap = await _db().ref('clients/' + phone10).once('value');
        return snap.val();
      } catch (e) { _err('clients.get', e); }
    },

    async upsert(phone10, data) {
      try { return await _db().ref('clients/' + phone10).set(data); }
      catch (e) { _err('clients.upsert', e); }
    }
  };

  // ================== ORDERS ==================
  const orders = {
    async create(orderId, order) {
      try { return await _db().ref('orders/' + orderId).set(order); }
      catch (e) { _err('orders.create', e); }
    },

    async setStatus(orderId, status) {
      try { return await _db().ref('orders/' + orderId + '/status').set(status); }
      catch (e) { _err('orders.setStatus', e); }
    },

    /** Подписка на все заказы (для админки). cb получает массив заказов.
     *  Возвращает функцию отписки. */
    subscribeAll(cb) {
      const ref = _db().ref('orders');
      const handler = ref.on('value', function (snap) {
        const v = snap.val() || {};
        const list = Object.keys(v).map(function (k) { return Object.assign({ id: k }, v[k]); });
        cb(list);
      });
      return function () { ref.off('value', handler); };
    },

    /** Заказы одного клиента — для экрана истории. */
    async listByClient(phone10) {
      try {
        const snap = await _db().ref('orders').orderByChild('clientPhone').equalTo(phone10).once('value');
        const v = snap.val() || {};
        return Object.keys(v).map(function (k) { return Object.assign({ id: k }, v[k]); });
      } catch (e) { _err('orders.listByClient', e); }
    }
  };

  // ================== СПРАВОЧНИКИ (services / banners / texts / pricing) ==================
  // services живут в /services (admin пишет, mobile читает).
  // Структура: массив объектов { id, name, slug, cover, basePrice, unit, ... }.
  // Cover — base64 data URL (загружено через PhotoUploader) или относительный
  // путь к файлу в img/.
  const services = {
    async list() {
      // Никогда не throw — fetch-with-fallback. UI рассчитывает на массив.
      try {
        const snap = await _db().ref('services').once('value');
        const v = snap.val();
        if (!v) return [];
        // RTDB может вернуть массив (если ключи 0..N) или объект — нормализуем.
        const arr = Array.isArray(v) ? v.filter(Boolean) : Object.values(v);
        return arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      } catch (e) {
        console.warn('[api.services.list]', e && e.message || e);
        return [];
      }
    },
    async get(idOrSlug) {
      const list = await this.list();
      return list.find(function (s) { return s.id === idOrSlug || s.slug === idOrSlug; }) || null;
    }
  };

  const banners = { async list() { return []; } };
  const texts   = { async get(/* key */) { return null; } };
  const pricing = { async get() { return null; } };

  // ================== ФОТО (Storage — добавим, когда появится экран загрузки) ==================
  const photos = {
    async upload(/* file */) {
      throw new Error('photos.upload: подключим Firebase Storage когда появится экран фото');
    }
  };

  // ================== WEATHER ==================
  // Сейчас прямой вызов OpenWeather с ключом в клиенте.
  // Безопасный путь: Cloud Function проксирует, ключ только на сервере.
  // TODO: перенести в Cloud Function когда подключим Blaze.
  // Ключ НЕ хранится в git (GitHub secret-scanning блокирует push с ключами).
  // Берём из (по приоритету):
  //   1. localStorage 'gl_owm_key' — поставить вручную в DevTools console
  //   2. Firebase RTDB /config/openweather_key — общий для всех пользователей
  //   3. Иначе fallback (23°/солнечно/Уральск) — UI работает, но без реальных данных
  // На прод правильно поднять Cloud Function-прокси, ключ только на сервере.
  let _owmKeyCache = null;
  async function _getOwmKey() {
    if (_owmKeyCache !== null) return _owmKeyCache;
    const local = localStorage.getItem('gl_owm_key');
    if (local) { _owmKeyCache = local; return local; }
    try {
      const snap = await _db().ref('config/openweather_key').once('value');
      const v = snap.val();
      _owmKeyCache = v || '';
      return _owmKeyCache;
    } catch (e) {
      _owmKeyCache = '';
      return '';
    }
  }

  const weather = {
    async get(city) {
      const fallback = {
        temp: 23, condition: 'солнечно', icon: '01d',
        city: city || 'Уральск', main: 'Clear'
      };
      const key = await _getOwmKey();
      if (!key) return fallback;
      try {
        const url = 'https://api.openweathermap.org/data/2.5/weather?q=' +
          encodeURIComponent(city || 'Uralsk,KZ') +
          '&appid=' + key +
          '&units=metric&lang=ru';
        const r = await fetch(url);
        if (!r.ok) return fallback;
        const d = await r.json();
        return {
          temp: Math.round(d.main.temp),
          condition: d.weather[0].description,
          icon: d.weather[0].icon,
          city: d.name,
          main: d.weather[0].main
        };
      } catch (e) {
        console.warn('weather fallback', e);
        return fallback;
      }
    }
  };

  // ================== CHAT (Cloud Function → Claude) ==================
  const chat = {
    async send(/* message */) {
      throw new Error('chat.send: подключим Cloud Function с Claude API на следующем этапе');
    },
    async history() { return []; }
  };

  // Финальный экспорт — публичный «контракт» для UI
  window.api = {
    auth: auth,
    clients: clients,
    orders: orders,
    services: services,
    banners: banners,
    texts: texts,
    pricing: pricing,
    photos: photos,
    chat: chat,
    weather: weather,
    _internal: { clearRecaptcha: clearRecaptcha }
  };
})();
