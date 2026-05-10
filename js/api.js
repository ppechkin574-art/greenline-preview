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
  // SMS-вход: Firebase Auth → Mobizon при переезде.
  // recaptchaContainerId — id <div>, в который Firebase ставит invisible reCAPTCHA.
  const auth = {
    /** @returns {Promise<ConfirmationResult>} объект для последующего auth.verify */
    async sendCode(phoneE164, recaptchaContainerId) {
      try {
        if (!window._glRecaptcha) {
          window._glRecaptcha = new firebase.auth.RecaptchaVerifier(
            recaptchaContainerId,
            { size: 'invisible' }
          );
        }
        return await _auth().signInWithPhoneNumber(phoneE164, window._glRecaptcha);
      } catch (e) { _err('auth.sendCode', e); }
    },

    /** @param confirmation — результат sendCode */
    async verifyCode(confirmation, code) {
      try { return await confirmation.confirm(code); }
      catch (e) { _err('auth.verifyCode', e); }
    },

    async logout() {
      try { return await _auth().signOut(); }
      catch (e) { _err('auth.logout', e); }
    },

    currentUser() { return _auth().currentUser; },

    onAuthChange(cb) { return _auth().onAuthStateChanged(cb); }
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
  // Заглушки — пока тарифы и баннеры не выведены в Firestore через админку.
  // При появлении админки добавятся: db.ref('services').once('value') и т.п.
  const services = {
    async list() { return []; },
    async get(id) { return null; }
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
    chat: chat
  };
})();
