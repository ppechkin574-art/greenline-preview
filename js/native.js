/* GreenLine — слой нативных вызовов (native.js)
 *
 * UI вызывает window.api.native.* — внутри сейчас веб-реализация (browser API),
 * после `cap init` подменим на @capacitor/* плагины БЕЗ ИЗМЕНЕНИЙ В ЭКРАНАХ.
 *
 * Контракт: каждая функция возвращает Promise (даже если веб-API синхронное),
 * чтобы Capacitor-версия (всегда async) была drop-in заменой.
 */
(function () {
  'use strict';

  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  // ===== TEL / EXTERNAL URL =====
  async function openTel(phone) {
    const num = String(phone || '').replace(/\s/g, '');
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      return window.Capacitor.Plugins.App.openUrl({ url: 'tel:' + num });
    }
    // Web: создаём <a> с href=tel: и кликаем — без full-reload
    const a = document.createElement('a');
    a.href = 'tel:' + num;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function openExternal(url) {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
      return window.Capacitor.Plugins.Browser.open({ url: url });
    }
    window.open(url, '_blank', 'noopener');
  }

  async function openWhatsApp(phone, text) {
    const num = String(phone || '').replace(/\D/g, '');
    const url = 'https://wa.me/' + num + (text ? '?text=' + encodeURIComponent(text) : '');
    return openExternal(url);
  }

  // ===== GEOLOCATION =====
  async function getLocation() {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation) {
      const r = await window.Capacitor.Plugins.Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      return { lat: r.coords.latitude, lng: r.coords.longitude };
    }
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('Geolocation API недоступен'));
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        function (err) { reject(err); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  // ===== CAMERA / PHOTO =====
  async function takePhoto() {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera) {
      const r = await window.Capacitor.Plugins.Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: 'dataUrl',
        source: 'PROMPT'
      });
      return r.dataUrl;
    }
    return new Promise(function (resolve, reject) {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.capture = 'environment';
      inp.onchange = function () {
        const f = inp.files && inp.files[0];
        if (!f) return reject(new Error('Файл не выбран'));
        const r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
        r.readAsDataURL(f);
      };
      inp.click();
    });
  }

  // ===== STORAGE (токены, флаги) =====
  // Capacitor: @capacitor/preferences. Web: localStorage.
  // ВАЖНО: для секретов в Capacitor использовать SecureStorage (добавим при cap init).
  async function getItem(key) {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences) {
      const r = await window.Capacitor.Plugins.Preferences.get({ key: key });
      return r.value;
    }
    return localStorage.getItem(key);
  }
  async function setItem(key, value) {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences) {
      return window.Capacitor.Plugins.Preferences.set({ key: key, value: String(value) });
    }
    localStorage.setItem(key, value);
  }
  async function removeItem(key) {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences) {
      return window.Capacitor.Plugins.Preferences.remove({ key: key });
    }
    localStorage.removeItem(key);
  }

  // ===== ANDROID BACK BUTTON =====
  // В вебе нет аналога — только history.back(). Регистрируем listener для Capacitor,
  // в браузере вернём no-op unsubscribe.
  function onBackButton(cb) {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      const handle = window.Capacitor.Plugins.App.addListener('backButton', cb);
      return function () { try { handle.remove(); } catch (e) {} };
    }
    return function () {};
  }

  // ===== STATUS BAR / SAFE AREA INFO =====
  async function setStatusBarStyle(style /* 'light' | 'dark' */) {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar) {
      return window.Capacitor.Plugins.StatusBar.setStyle({ style: style === 'light' ? 'LIGHT' : 'DARK' });
    }
  }

  // ===== SHARE =====
  async function share(payload /* { title, text, url } */) {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share) {
      return window.Capacitor.Plugins.Share.share(payload);
    }
    if (navigator.share) return navigator.share(payload);
    throw new Error('Share API недоступен');
  }

  // Подмешиваем в window.api (создан в api.js)
  window.api = window.api || {};
  window.api.native = {
    isCapacitor: isCapacitor,
    openTel: openTel,
    openExternal: openExternal,
    openWhatsApp: openWhatsApp,
    getLocation: getLocation,
    takePhoto: takePhoto,
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    onBackButton: onBackButton,
    setStatusBarStyle: setStatusBarStyle,
    share: share
  };
})();
