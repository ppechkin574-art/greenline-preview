
/* === Делегированный обработчик кликов ===
 * Для НОВОГО кода используем data-action / data-* вместо inline onclick=.
 * Пример: <button data-action="show-page" data-page="profile">Профиль</button>
 * Старые inline onclick остаются работать (Capacitor с дефолтным CSP их разрешает),
 * но мигрируем их инкрементально по мере переписывания экранов.
 */
document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-action]');
  if (!el) return;
  var action = el.dataset.action;
  switch (action) {
    case 'show-page':
      if (el.dataset.page) showPage(el.dataset.page);
      break;
    case 'go-back':
      if (typeof window.detailGoBack === 'function') window.detailGoBack();
      else history.back();
      break;
    case 'open-tel':
      if (window.api && api.native) api.native.openTel(el.dataset.phone);
      break;
    case 'open-whatsapp':
      if (window.api && api.native) api.native.openWhatsApp(el.dataset.phone, el.dataset.text || '');
      break;
    case 'welcome-login':
      showPage('register');
      if (typeof regShowStep === 'function') regShowStep('login');
      break;
    case 'welcome-register':
      showPage('register');
      if (typeof regShowStep === 'function') regShowStep('register');
      break;
  }
});

  const firebaseConfig = {
    apiKey: "AIzaSyDx7ZzcEDAIQpdRtQVx4rC4i31YwdYgMH8",
    authDomain: "greenline-prod-5f1c3.firebaseapp.com",
    databaseURL: "https://greenline-prod-5f1c3-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "greenline-prod-5f1c3",
    storageBucket: "greenline-prod-5f1c3.firebasestorage.app",
    messagingSenderId: "314425697791",
    appId: "1:314425697791:web:b759eda9972e198a1473ca"
  };
  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();
  const auth = firebase.auth();
  auth.languageCode = 'ru';


/* === BLOCK BREAK === */



// Global vars
let detailVolume = 'Маленький';
let detailDate = 'Сегодня';

// Navigation
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + name);
  if (el) { el.classList.add('active'); } else { document.getElementById('page-home').classList.add('active'); }
  window.scrollTo(0,0);
  // Hide bottom nav on auth/onboarding/admin pages
  const nav = document.getElementById('bottomNav');
  if (nav) {
    const hidden = (name === 'register' || name === 'admin' || name === 'splash' || name === 'onboarding' || name === 'welcome');
    nav.style.display = hidden ? 'none' : 'flex';
  }
  // Подсветить активную вкладку нижнего бара (если функция уже определена)
  if (typeof updateBottomNavActive === 'function') updateBottomNavActive(name);
  // Обновить приветствие на главной (имя из localStorage)
  if (name === 'home' && typeof renderHomeGreeting === 'function') renderHomeGreeting();
  // Map: ленивая инициализация при первом показе home + invalidateSize в любом случае
  if (name === 'home') {
    if (typeof _glInitMap === 'function') {
      setTimeout(_glInitMap, 50);
      setTimeout(_glInitMap, 400);
    }
  }
  // Gallery: рендер карточек при показе страницы (двойной вызов для надёжности)
  if (name === 'gallery' && typeof renderGallery === 'function') {
    var activeFilter = document.querySelector('.gallery-filter.active');
    var f = activeFilter ? activeFilter.dataset.filter : 'all';
    renderGallery(f);
    setTimeout(function(){ renderGallery(f); }, 100);
  }
  // Service-detail: гарантированный рендер дат, времени, виз. параметра + step-states
  if (name === 'service-detail') {
    setTimeout(function(){ try { updateOrderState(); } catch(e) {} }, 80);
    if (typeof renderOrderDates === 'function') {
      try { renderOrderDates(); } catch(e) {}
      setTimeout(function(){ try { renderOrderDates(); } catch(e) {} }, 50);
    }
    if (typeof renderOrderTimes === 'function') {
      try { renderOrderTimes(); } catch(e) {}
      setTimeout(function(){ try { renderOrderTimes(); } catch(e) {} }, 50);
    }
    if (typeof window.serviceForm !== 'undefined' && typeof window.serviceForm.refresh === 'function') {
      try { window.serviceForm.refresh(); } catch(e) {}
      setTimeout(function(){ try { window.serviceForm.refresh(); } catch(e) {} }, 50);
    }
  }
}
function switchTo(tab) { showPage(tab); }

// Гарантированный открыватель галереи: переключаем страницу + рендерим
function openGallery() {
  showPage('gallery');
  // Всегда вызываем явно, не полагаясь на typeof check внутри showPage
  if (typeof renderGallery === 'function') {
    renderGallery('all');
    setTimeout(function(){ renderGallery('all'); }, 80);
    setTimeout(function(){ renderGallery('all'); }, 250);
  }
}
function detailGoBack() { showPage(window._detailFromPage || 'home'); }
function goToHome() { showPage('home'); }
// ============================================================
// СИСТЕМА ВХОДА ЧЕРЕЗ FIREBASE SMS
// ============================================================
let _regPhone = '';
let _regName = '';
let _confirmationResult = null;
let _resendTimer = null;
const ADMIN_SECRET = 'ADMIN_GL_2025_HIGHT_LEVEL_OF_SECURITY';

// ===== AUTH / REGISTER (UX v3 — real-time validation, loading, paste, transitions) =====
let _regMode = 'login'; // 'login' | 'register'
const NAME_RE = /^[А-Яа-яЁёA-Za-z][А-Яа-яЁёA-Za-z\s\-]{1,39}$/;
const PROGRESS_LABELS = {
  login: 'Шаг 1 из 2 · Номер телефона',
  register: 'Шаг 1 из 2 · Контактные данные',
  code: 'Шаг 2 из 2 · Подтверждение',
  success: 'Готово'
};

function formatPhoneInput(input) {
  // Оставляем только цифры, максимум 10 (без +7), и форматируем "XXX XXX XX XX"
  let d = input.value.replace(/\D/g, '');
  // Если пользователь начал с 7 или 8 — отбрасываем (мы уже показываем +7 префикс)
  if (d.startsWith('7') || d.startsWith('8')) d = d.slice(1);
  if (d.length > 10) d = d.slice(0, 10);
  let out = '';
  if (d.length > 0) out = d.slice(0, 3);
  if (d.length > 3) out += ' ' + d.slice(3, 6);
  if (d.length > 6) out += ' ' + d.slice(6, 8);
  if (d.length > 8) out += ' ' + d.slice(8, 10);
  input.value = out;
}

function formatNameInput(input) {
  // Только буквы (рус/англ), пробел, дефис. Удаляем всё остальное в реал-тайме.
  let v = input.value.replace(/[^А-Яа-яЁёA-Za-z\s\-]/g, '');
  // Не более одного пробела подряд
  v = v.replace(/\s{2,}/g, ' ');
  input.value = v;
}

function getCleanPhone(input) {
  return input.value.replace(/\D/g, '');
}

function formatPhoneForDisplay(raw) {
  const d = String(raw).replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return raw;
  return '+7 ' + d.slice(0,3) + ' ' + d.slice(3,6) + ' ' + d.slice(6,8) + ' ' + d.slice(8,10);
}

function showFieldError(inputEl, errorEl, msg) {
  if (errorEl) {
    errorEl.textContent = msg;
    errorEl.classList.add('visible');
  }
  if (inputEl) {
    const wrap = inputEl.closest('.input-wrap');
    if (wrap) {
      wrap.classList.add('has-error');
      wrap.classList.remove('has-success');
    }
  }
}

function clearFieldError(inputEl, errorEl) {
  if (errorEl) {
    errorEl.classList.remove('visible');
    errorEl.textContent = '';
  }
  if (inputEl) {
    const wrap = inputEl.closest('.input-wrap');
    if (wrap) wrap.classList.remove('has-error');
  }
}

function setFieldValid(inputEl, statusEl) {
  if (inputEl) {
    const wrap = inputEl.closest('.input-wrap');
    if (wrap) wrap.classList.add('has-success');
  }
  if (statusEl) {
    statusEl.classList.add('success', 'visible');
  }
}

function clearFieldValid(inputEl, statusEl) {
  if (inputEl) {
    const wrap = inputEl.closest('.input-wrap');
    if (wrap) wrap.classList.remove('has-success');
  }
  if (statusEl) {
    statusEl.classList.remove('success', 'visible');
  }
}

function setBtnLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('loading', !!on);
  btn.disabled = !!on;
}

function evaluateLoginForm() {
  const phoneInput = document.getElementById('login-phone');
  const status = document.getElementById('login-phone-status');
  const btn = document.getElementById('loginBtnSend');
  if (!phoneInput || !btn) return;
  const valid = getCleanPhone(phoneInput).length === 10;
  if (valid) setFieldValid(phoneInput, status);
  else clearFieldValid(phoneInput, status);
  btn.disabled = !valid;
}

function evaluateRegisterForm() {
  const nameInput = document.getElementById('reg-name');
  const phoneInput = document.getElementById('reg-phone');
  const nameStatus = document.getElementById('reg-name-status');
  const phoneStatus = document.getElementById('reg-phone-status');
  const btn = document.getElementById('regBtnSend');
  if (!nameInput || !phoneInput || !btn) return;
  const nameTrim = nameInput.value.trim().replace(/\s+/g, ' ');
  const nameOk = NAME_RE.test(nameTrim);
  const phoneOk = getCleanPhone(phoneInput).length === 10;
  if (nameOk) setFieldValid(nameInput, nameStatus);
  else clearFieldValid(nameInput, nameStatus);
  if (phoneOk) setFieldValid(phoneInput, phoneStatus);
  else clearFieldValid(phoneInput, phoneStatus);
  btn.disabled = !(nameOk && phoneOk);
}

function evaluateCodeForm() {
  const btn = document.getElementById('regBtnVerify');
  if (!btn) return;
  const full = [0,1,2,3,4,5].every(n => {
    const el = document.getElementById('rc'+n);
    return el && el.value;
  });
  btn.disabled = !full;
}

function regShowStep(step) {
  // step: 'login' | 'register' | 'code' | 'success'
  ['reg-login', 'reg-register', 'reg-step2', 'reg-success'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const map = { login: 'reg-login', register: 'reg-register', code: 'reg-step2', success: 'reg-success' };
  const target = document.getElementById(map[step]);
  if (target) {
    target.style.display = 'block';
    // Перезапуск анимации входа
    target.style.animation = 'none';
    void target.offsetWidth;
    target.style.animation = '';
  }

  // Прогресс-бар + лейбл
  const seg2 = document.getElementById('regSeg2');
  if (seg2) {
    if (step === 'code' || step === 'success') seg2.classList.add('active');
    else seg2.classList.remove('active');
  }
  const progressLabel = document.getElementById('regProgressLabel');
  const progressWrap = document.querySelector('.reg-progress-wrap');
  if (progressLabel) progressLabel.textContent = PROGRESS_LABELS[step] || '';
  if (progressWrap) progressWrap.style.display = (step === 'success') ? 'none' : 'block';

  // Кнопка "Назад" — только на шаге кода (visibility, не display, чтобы layout не прыгал)
  const back = document.getElementById('regBackBtn');
  if (back) back.style.visibility = (step === 'code') ? 'visible' : 'hidden';

  // Заголовок на шаге кода — отличается для регистрации/входа
  const codeTitle = document.getElementById('regCodeTitle');
  if (codeTitle) codeTitle.textContent = (step === 'code' && _regMode === 'register') ? 'Подтвердите номер' : 'Введите код';

  // Брэнд-лого скрываем на success (там свой акцент-чекмарк)
  const brand = document.querySelector('.reg-brand');
  if (brand) brand.style.display = (step === 'success') ? 'none' : 'flex';

  // Auto-focus первого поля
  setTimeout(() => {
    if (step === 'login') {
      const el = document.getElementById('login-phone');
      if (el) el.focus();
    } else if (step === 'register') {
      const el = document.getElementById('reg-name');
      if (el && !el.value) el.focus();
    } else if (step === 'code') {
      const el = document.getElementById('rc0');
      if (el) el.focus();
    }
  }, 280);

  window.scrollTo(0, 0);
}

function switchAuthMode(mode) {
  _regMode = mode;
  // Сбрасываем ошибки и поля
  ['login-phone', 'reg-name', 'reg-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('invalid');
  });
  ['login-phone-error', 'reg-name-error', 'reg-phone-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('visible'); el.textContent = ''; }
  });
  regShowStep(mode);
}

// === LOGIN: проверка существования номера + реальный SMS через Firebase Phone Auth ===
async function loginRequestCode() {
  const phoneInput = document.getElementById('login-phone');
  const errEl = document.getElementById('login-phone-error');
  const btn = document.getElementById('loginBtnSend');
  clearFieldError(phoneInput, errEl);

  const phone = getCleanPhone(phoneInput);
  if (phone.length !== 10) {
    showFieldError(phoneInput, errEl, 'Введите 10 цифр номера');
    return;
  }

  setBtnLoading(btn, true);
  try {
    const data = await api.clients.get(phone);
    if (!data) {
      setBtnLoading(btn, false);
      showFieldError(phoneInput, errEl, 'Этот номер не зарегистрирован. Зарегистрируйтесь.');
      return;
    }
    _regMode = 'login';
    _regPhone = '+7' + phone;
    _regName = data.name || '';
    _confirmationResult = await api.auth.sendCode(_regPhone, 'recaptcha-container');
    setBtnLoading(btn, false);
    proceedToCodeStep();
  } catch (e) {
    setBtnLoading(btn, false);
    showFieldError(phoneInput, errEl, _smsErrorMessage(e));
  }
}

// === REGISTER: проверка что номер свободен + реальный SMS ===
async function registerRequestCode() {
  const nameInput = document.getElementById('reg-name');
  const nameErr = document.getElementById('reg-name-error');
  const phoneInput = document.getElementById('reg-phone');
  const phoneErr = document.getElementById('reg-phone-error');
  const btn = document.getElementById('regBtnSend');

  clearFieldError(nameInput, nameErr);
  clearFieldError(phoneInput, phoneErr);

  const name = nameInput.value.trim().replace(/\s+/g, ' ');
  const phone = getCleanPhone(phoneInput);

  let hasError = false;
  if (!NAME_RE.test(name)) {
    showFieldError(nameInput, nameErr, 'Имя — только буквы, минимум 2 символа');
    hasError = true;
  }
  if (phone.length !== 10) {
    showFieldError(phoneInput, phoneErr, 'Введите 10 цифр номера');
    hasError = true;
  }
  if (hasError) return;

  setBtnLoading(btn, true);
  try {
    const existing = await api.clients.get(phone);
    if (existing) {
      setBtnLoading(btn, false);
      showFieldError(phoneInput, phoneErr, 'Этот номер уже зарегистрирован. Войдите.');
      return;
    }
    _regMode = 'register';
    _regName = name;
    _regPhone = '+7' + phone;
    _confirmationResult = await api.auth.sendCode(_regPhone, 'recaptcha-container');
    setBtnLoading(btn, false);
    proceedToCodeStep();
  } catch (e) {
    setBtnLoading(btn, false);
    showFieldError(phoneInput, phoneErr, _smsErrorMessage(e));
  }
}

// Перевод ошибок Firebase Phone Auth в человеческий русский
function _smsErrorMessage(e) {
  const code = (e && e.code) || '';
  switch (code) {
    case 'auth/invalid-phone-number': return 'Неверный формат номера';
    case 'auth/too-many-requests':    return 'Слишком много попыток. Попробуйте позже';
    case 'auth/quota-exceeded':       return 'Превышен лимит SMS. Свяжитесь с поддержкой';
    case 'auth/captcha-check-failed': return 'Не удалось проверить, что вы не робот. Обновите страницу';
    case 'auth/network-request-failed': return 'Нет связи с сервером. Проверьте интернет';
    case 'auth/app-not-authorized':   return 'Домен не авторизован в Firebase';
    case 'auth/operation-not-allowed': return 'Phone-вход не включён в Firebase Console';
    default: return 'Не удалось отправить SMS. ' + (e && e.message ? e.message : '');
  }
}

function proceedToCodeStep() {
  const phoneShown = document.getElementById('regPhoneShown');
  if (phoneShown) phoneShown.textContent = formatPhoneForDisplay(_regPhone);
  regShowStep('code');
  startResendTimer();
  // Очистить поля кода
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('rc' + i);
    if (el) el.value = '';
  }
  setTimeout(() => {
    const first = document.getElementById('rc0');
    if (first) first.focus();
  }, 300);
}

function regGoBack() {
  // Назад с шага кода — обратно на форму (login или register)
  const errEl = document.getElementById('reg-code-error');
  if (errEl) errEl.style.display = 'none';
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('rc' + i);
    if (el) el.value = '';
  }
  clearInterval(_resendTimer);
  regShowStep(_regMode);
}

function startResendTimer() {
  let sec = 59;
  const link = document.getElementById('reg-resend-link');
  const timer = document.getElementById('reg-resend-timer');
  const secEl = document.getElementById('reg-resend-sec');
  if (link) link.style.display = 'none';
  if (timer) timer.style.display = 'inline';
  if (secEl) secEl.textContent = sec;
  clearInterval(_resendTimer);
  _resendTimer = setInterval(function() {
    sec--;
    if (secEl) secEl.textContent = sec;
    if (sec <= 0) {
      clearInterval(_resendTimer);
      if (timer) timer.style.display = 'none';
      if (link) link.style.display = 'inline';
    }
  }, 1000);
}

// Повторная отправка SMS на тот же номер.
// reCAPTCHA нужно сбросить — иначе Firebase бросит "captcha already used".
async function regResendCode() {
  if (!_regPhone) { regGoBack(); return; }
  api._internal.clearRecaptcha();
  try {
    _confirmationResult = await api.auth.sendCode(_regPhone, 'recaptcha-container');
    startResendTimer();
    // Очистить поля кода
    for (let i = 0; i < 6; i++) {
      const el = document.getElementById('rc' + i);
      if (el) { el.value = ''; el.classList.remove('filled'); }
    }
    const first = document.getElementById('rc0');
    if (first) first.focus();
  } catch (e) {
    flashCodeError(_smsErrorMessage(e));
  }
}

function regCodeInput(i) {
  const el = document.getElementById('rc' + i);
  el.value = el.value.replace(/\D/g,'').slice(-1);
  if (el.value && i < 5) {
    document.getElementById('rc' + (i+1)).focus();
  }
  const full = [0,1,2,3,4,5].every(n => document.getElementById('rc'+n).value);
  if (full) setTimeout(regVerifyCode, 200);
}

function regCodeKey(e, i) {
  if (e.key === 'Backspace' && !document.getElementById('rc'+i).value && i > 0) {
    document.getElementById('rc'+(i-1)).focus();
  }
}

async function regVerifyCode() {
  const entered = [0,1,2,3,4,5].map(i => document.getElementById('rc'+i).value).join('');
  const errEl = document.getElementById('reg-code-error');
  const btn = document.getElementById('regBtnVerify');
  const wrap = document.getElementById('regCodeWrap');
  if (entered.length < 6) return;

  if (errEl) errEl.style.display = 'none';
  if (wrap) wrap.classList.remove('error');

  if (!_confirmationResult) {
    flashCodeError('Сессия истекла. Запросите код ещё раз');
    setTimeout(regGoBack, 800);
    return;
  }

  setBtnLoading(btn, true);
  try {
    await api.auth.verifyCode(_confirmationResult, entered);
    setBtnLoading(btn, false);
    clearInterval(_resendTimer);
    _confirmationResult = null;

    if (_regMode === 'register') {
      const phone10 = _regPhone.replace('+7', '');
      await api.clients.upsert(phone10, {
        name: _regName,
        phone: _regPhone,
        registered: Date.now()
      });
      const nameEl = document.getElementById('regSuccessName');
      if (nameEl) nameEl.textContent = (_regName || '').split(' ')[0] || 'друг';
      regShowStep('success');
    } else {
      finishAuth();
    }
  } catch (e) {
    setBtnLoading(btn, false);
    const code = (e && e.code) || '';
    if (code === 'auth/invalid-verification-code') flashCodeError('Неверный код. Попробуйте ещё раз');
    else if (code === 'auth/code-expired')          flashCodeError('Код истёк. Запросите новый');
    else                                            flashCodeError('Ошибка проверки кода');
  }
}

function flashCodeError(msg) {
  const errEl = document.getElementById('reg-code-error');
  const wrap = document.getElementById('regCodeWrap');
  if (errEl) {
    errEl.textContent = msg || 'Неверный код. Попробуйте ещё раз';
    errEl.style.display = 'block';
    errEl.style.animation = 'none';
    void errEl.offsetWidth;
    errEl.style.animation = '';
  }
  if (wrap) {
    wrap.classList.add('error', 'shake');
    setTimeout(() => wrap.classList.remove('shake'), 400);
  }
  // Очистить и сфокусироваться на первом
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('rc'+i);
    if (el) {
      el.value = '';
      el.classList.remove('filled');
    }
  }
  const first = document.getElementById('rc0');
  if (first) first.focus();
  setTimeout(() => { if (wrap) wrap.classList.remove('error'); }, 1200);
}

function finishAuth() {
  // Локальный кеш для оффлайн-приветствия. Источником истины остаётся Firebase Auth.
  localStorage.setItem('gl_name', _regName);
  localStorage.setItem('gl_phone', _regPhone);
  _renderProfileFields(_regName, _regPhone);
  injectBottomNav();
  showPage('home');
}

function _renderProfileFields(name, phone) {
  if (document.getElementById('profileName')) document.getElementById('profileName').textContent = name || '';
  if (document.getElementById('profileInitial') && name) document.getElementById('profileInitial').textContent = name[0].toUpperCase();
  if (document.getElementById('profilePhone')) document.getElementById('profilePhone').textContent = formatPhoneForDisplay(phone || '');
}

// === BOOT: splash (1.5с) → авто-вход / onboarding / welcome ===
// Firebase сам персистит сессию в IndexedDB, нам нужно лишь подписаться.
const SPLASH_MIN_MS = 1500;
const ONBOARDING_FLAG = 'gl_onboarding_seen';

function _hideSplash() {
  const el = document.getElementById('page-splash');
  if (!el) return;
  el.classList.add('is-leaving');
  setTimeout(function () { el.classList.remove('active', 'is-leaving'); }, 360);
}

async function _bootAuthCheck() {
  const splashStart = Date.now();

  // Параллельно ждём ответ Firebase Auth (одноразово) и таймаут сплэша.
  const authPromise = new Promise(function (resolve) {
    const off = api.auth.onAuthChange(function (user) { off(); resolve(user); });
  });
  const user = await authPromise;
  const elapsed = Date.now() - splashStart;
  if (elapsed < SPLASH_MIN_MS) await new Promise(r => setTimeout(r, SPLASH_MIN_MS - elapsed));

  if (user) {
    // Залогинен — на home, минуя onboarding и welcome
    const phone = user.phoneNumber || '';
    const phone10 = phone.replace(/^\+7/, '').replace(/\D/g, '');
    let name = localStorage.getItem('gl_name') || '';
    try {
      const data = await api.clients.get(phone10);
      if (data && data.name) name = data.name;
    } catch (e) { /* offline → localStorage */ }

    _regPhone = phone;
    _regName = name;
    localStorage.setItem('gl_phone', phone);
    if (name) localStorage.setItem('gl_name', name);
    _renderProfileFields(name, phone);
    injectBottomNav();
    _hideSplash();
    showPage('home');
    return true;
  }

  // Не залогинен → onboarding (если первый запуск) или сразу welcome
  _hideSplash();
  if (!localStorage.getItem(ONBOARDING_FLAG)) {
    _initOnboarding();
    showPage('onboarding');
  } else {
    showPage('welcome');
  }
  return false;
}

// === ONBOARDING ===
function _initOnboarding() {
  const track = document.getElementById('onbTrack');
  const dots = document.getElementById('onbDots');
  if (!track || !dots) return;
  const slides = track.querySelectorAll('.onb-slide');
  let i = 0;

  // Рисуем точки под количество слайдов
  dots.innerHTML = '';
  slides.forEach((_, n) => {
    const d = document.createElement('span');
    d.className = 'onb-dot' + (n === 0 ? ' active' : '');
    dots.appendChild(d);
  });

  function go(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    track.style.transform = 'translateX(' + (-i * 100) + '%)';
    dots.querySelectorAll('.onb-dot').forEach((d, k) => d.classList.toggle('active', k === i));
    const btn = document.getElementById('onbBtnNext');
    if (btn) btn.querySelector('.btn-label').textContent = (i === slides.length - 1) ? 'Начать' : 'Далее';
  }

  function next() {
    if (i >= slides.length - 1) finishOnboarding();
    else go(i + 1);
  }

  function finishOnboarding() {
    localStorage.setItem(ONBOARDING_FLAG, '1');
    showPage('welcome');
  }

  const btn = document.getElementById('onbBtnNext');
  const skip = document.getElementById('onbSkip');
  if (btn)  btn.onclick  = next;
  if (skip) skip.onclick = finishOnboarding;
  go(0);
}

// === LOGOUT: реальный выход + очистка локального кеша ===
async function glLogout() {
  try { await api.auth.logout(); } catch (e) { console.warn('logout', e); }
  localStorage.removeItem('gl_name');
  localStorage.removeItem('gl_phone');
  _regPhone = '';
  _regName = '';
  _confirmationResult = null;
  // Сброс полей формы
  const lp = document.getElementById('login-phone'); if (lp) lp.value = '';
  const rp = document.getElementById('reg-phone');   if (rp) rp.value = '';
  const rn = document.getElementById('reg-name');    if (rn) rn.value = '';
  regShowStep('login');
  showPage('welcome');
}
window.glLogout = glLogout;

// Обратная совместимость со старым именем
function regBack() { regGoBack(); }
function regSendCode() { /* legacy stub — заменено на loginRequestCode/registerRequestCode */ }

// ===== Обработчики формы регистрации/входа (UX v3) =====
function attachInputFocusClass(input) {
  if (!input) return;
  const wrap = input.closest('.input-wrap');
  if (!wrap) return;
  input.addEventListener('focus', () => wrap.classList.add('focused'));
  input.addEventListener('blur', () => wrap.classList.remove('focused'));
}

document.addEventListener('DOMContentLoaded', function () {
  // Авто-вход: если Firebase Auth ещё помнит пользователя — сразу на home.
  if (window.api && api.auth) _bootAuthCheck();

  const loginPhone = document.getElementById('login-phone');
  const regName = document.getElementById('reg-name');
  const regPhone = document.getElementById('reg-phone');

  // Focus highlight на input-wrap
  [loginPhone, regName, regPhone].forEach(attachInputFocusClass);

  // Real-time форматирование + валидация
  if (loginPhone) {
    loginPhone.addEventListener('input', () => {
      formatPhoneInput(loginPhone);
      clearFieldError(loginPhone, document.getElementById('login-phone-error'));
      evaluateLoginForm();
    });
  }
  if (regName) {
    regName.addEventListener('input', () => {
      formatNameInput(regName);
      clearFieldError(regName, document.getElementById('reg-name-error'));
      evaluateRegisterForm();
    });
  }
  if (regPhone) {
    regPhone.addEventListener('input', () => {
      formatPhoneInput(regPhone);
      clearFieldError(regPhone, document.getElementById('reg-phone-error'));
      evaluateRegisterForm();
    });
  }

  // Forms — Enter submits
  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', (e) => { e.preventDefault(); loginRequestCode(); });
  const registerForm = document.getElementById('registerForm');
  if (registerForm) registerForm.addEventListener('submit', (e) => { e.preventDefault(); registerRequestCode(); });

  // Кнопки (button type=submit уже сабмитит форму, но дублируем для надёжности)
  const verifyBtn = document.getElementById('regBtnVerify');
  if (verifyBtn) verifyBtn.addEventListener('click', regVerifyCode);

  const finishBtn = document.getElementById('regBtnFinish');
  if (finishBtn) finishBtn.addEventListener('click', finishAuth);

  // Переключатель Вход ⇄ Регистрация
  const toReg = document.getElementById('switchToRegLink');
  if (toReg) toReg.addEventListener('click', () => switchAuthMode('register'));
  const toLogin = document.getElementById('switchToLoginLink');
  if (toLogin) toLogin.addEventListener('click', () => switchAuthMode('login'));

  // Resend ссылка → реальный повторный SMS
  const resendLink = document.getElementById('reg-resend-link');
  if (resendLink) resendLink.addEventListener('click', regResendCode);

  // Кнопка "Назад" с шага кода
  const backBtn = document.getElementById('regBackBtn');
  if (backBtn) backBtn.addEventListener('click', regGoBack);

  // "Изменить" возле номера на шаге кода
  const editPhone = document.getElementById('regEditPhone');
  if (editPhone) editPhone.addEventListener('click', regGoBack);

  // Поля для ввода кода — input/keydown/paste
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('rc' + i);
    if (!el) continue;
    el.addEventListener('input', function () {
      el.value = el.value.replace(/\D/g, '').slice(-1);
      if (el.value) el.classList.add('filled');
      else el.classList.remove('filled');
      if (el.value && i < 5) {
        const next = document.getElementById('rc' + (i + 1));
        if (next) next.focus();
      }
      evaluateCodeForm();
      const full = [0,1,2,3,4,5].every(n => document.getElementById('rc'+n).value);
      if (full) setTimeout(regVerifyCode, 180);
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !el.value && i > 0) {
        const prev = document.getElementById('rc' + (i-1));
        if (prev) { prev.focus(); prev.value = ''; prev.classList.remove('filled'); evaluateCodeForm(); }
      } else if (e.key === 'ArrowLeft' && i > 0) {
        const prev = document.getElementById('rc' + (i-1));
        if (prev) prev.focus();
      } else if (e.key === 'ArrowRight' && i < 5) {
        const next = document.getElementById('rc' + (i+1));
        if (next) next.focus();
      }
    });
    el.addEventListener('paste', function (e) {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const digits = (text || '').replace(/\D/g, '').slice(0, 6);
      if (!digits) return;
      // Распределяем цифры начиная с текущего поля
      let cursor = i;
      for (let k = 0; k < digits.length && cursor < 6; k++, cursor++) {
        const node = document.getElementById('rc' + cursor);
        if (node) {
          node.value = digits[k];
          node.classList.add('filled');
        }
      }
      const target = document.getElementById('rc' + Math.min(cursor, 5));
      if (target) target.focus();
      evaluateCodeForm();
      const full = [0,1,2,3,4,5].every(n => document.getElementById('rc'+n).value);
      if (full) setTimeout(regVerifyCode, 180);
    });
  }

  // Первичная оценка (на случай автозаполнения браузера)
  evaluateLoginForm();
  evaluateRegisterForm();
  evaluateCodeForm();

  // Auto-focus первого поля при загрузке — если экран входа активен
  setTimeout(() => {
    const loginVisible = document.getElementById('reg-login') &&
      document.getElementById('reg-login').style.display !== 'none';
    if (loginVisible && loginPhone) loginPhone.focus();
  }, 350);
});

function goHome() {
  injectBottomNav();
  showPage('home');
}

function setHomeTab(btn) {
  document.querySelectorAll('#page-home .nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
// ============================================================


  // Автовход если уже входил
  const savedName = localStorage.getItem('gl_name');
  const savedPhone = localStorage.getItem('gl_phone');
  if (savedName && savedPhone) {
    if (document.getElementById('profileName'))
      document.getElementById('profileName').textContent = savedName;
    if (document.getElementById('profileInitial'))
      document.getElementById('profileInitial').textContent = savedName[0].toUpperCase();
    if (document.getElementById('profilePhone'))
      document.getElementById('profilePhone').textContent = formatPhoneForDisplay(savedPhone);
    injectBottomNav();
    showPage('home');
  }

// Home hero greeting — заполнение имени пользователя
// === Приветствие на home ===
// Время суток + имя пользователя из localStorage (или Firebase Auth profile)
function renderHomeGreeting() {
  // Старый идентификатор оставляем на всякий случай
  const oldNameEl = document.getElementById('homeUserName');
  const newNameEl = document.getElementById('hmGreetName');
  const timeEl    = document.getElementById('hmGreetTime');

  const stored = localStorage.getItem('gl_name') || '';
  const firstName = stored.trim().split(/\s+/)[0] || 'Друг';
  if (oldNameEl) oldNameEl.textContent = firstName;
  if (newNameEl) newNameEl.textContent = firstName;

  if (timeEl) {
    const h = new Date().getHours();
    let g = 'Добрый вечер,';
    if (h < 5)        g = 'Доброй ночи,';
    else if (h < 12)  g = 'Доброе утро,';
    else if (h < 17)  g = 'Добрый день,';
    timeEl.textContent = g;
  }
}
renderHomeGreeting();

// === Погода + рекомендация услуги на home ===
async function renderHomeWeather() {
  if (!window.api || !api.weather) return;
  try {
    const w = await api.weather.get('Uralsk,KZ');
    const tEl    = document.getElementById('hmWeatherTemp');
    const cityEl = document.getElementById('hmWeatherCity');
    const condEl = document.getElementById('hmWeatherCond');
    const recEl  = document.getElementById('hmWeatherRecSub');
    const iconEl = document.getElementById('hmWeatherIcon');

    if (tEl)    tEl.textContent    = w.temp + '°';
    if (cityEl) cityEl.textContent = 'Уральск'; // принудительно — даже если API вернёт английский
    if (condEl) condEl.textContent = w.condition;
    if (recEl)  recEl.textContent  = _pickRecommendation(w);
    if (iconEl) iconEl.innerHTML   = _renderWeatherIcon(w);
  } catch (e) { /* остаются заглушки из HTML */ }
}

// Рекомендация услуги по погоде. Простая эвристика на этапе MVP.
function _pickRecommendation(w) {
  const main = (w.main || '').toLowerCase();
  const t = w.temp;
  if (main.includes('rain') || main.includes('drizzle') || main.includes('thunder'))
    return 'отложите покос';
  if (main.includes('snow'))   return 'для планирования';
  if (t > 28)                  return 'для полива';
  if (t >= 18 && t <= 28)      return 'для покоса!';
  if (t >= 10)                 return 'для посадки';
  return 'для топиара';
}

// SVG-иконка погоды по коду от OpenWeather (или main).
function _renderWeatherIcon(w) {
  const m = (w.main || '').toLowerCase();
  if (m.includes('rain') || m.includes('drizzle')) return _wIcon('rain');
  if (m.includes('snow'))   return _wIcon('snow');
  if (m.includes('cloud'))  return _wIcon('cloud');
  if (m.includes('thunder')) return _wIcon('thunder');
  return _wIcon('sun');
}
function _wIcon(kind) {
  switch (kind) {
    case 'sun':
      return '<svg viewBox="0 0 48 48" fill="none">'
        + '<circle cx="24" cy="24" r="9" fill="#FFC940"/>'
        + '<g stroke="#FFC940" stroke-width="2.6" stroke-linecap="round">'
        + '<path d="M24 6v6"/><path d="M24 36v6"/>'
        + '<path d="M6 24h6"/><path d="M36 24h6"/>'
        + '<path d="M11 11l4 4"/><path d="M33 33l4 4"/>'
        + '<path d="M37 11l-4 4"/><path d="M15 33l-4 4"/>'
        + '</g></svg>';
    case 'cloud':
      return '<svg viewBox="0 0 48 48" fill="none">'
        + '<path d="M14 32 C 8 32 6 26 11 22 C 11 16 18 14 22 18 C 26 12 36 14 36 22 C 42 22 42 32 36 32 Z" fill="#A8B8B8"/>'
        + '</svg>';
    case 'rain':
      return '<svg viewBox="0 0 48 48" fill="none">'
        + '<path d="M14 26 C 8 26 6 20 11 16 C 11 10 18 8 22 12 C 26 6 36 8 36 16 C 42 16 42 26 36 26 Z" fill="#7A8898"/>'
        + '<g stroke="#4A8FE0" stroke-width="2.4" stroke-linecap="round">'
        + '<path d="M16 32l-2 6"/><path d="M24 32l-2 6"/><path d="M32 32l-2 6"/>'
        + '</g></svg>';
    case 'snow':
      return '<svg viewBox="0 0 48 48" fill="none">'
        + '<path d="M14 26 C 8 26 6 20 11 16 C 11 10 18 8 22 12 C 26 6 36 8 36 16 C 42 16 42 26 36 26 Z" fill="#C8D4E0"/>'
        + '<g fill="#FFFFFF" stroke="#A8B8C8" stroke-width="0.8">'
        + '<circle cx="16" cy="36" r="2"/><circle cx="24" cy="40" r="2"/><circle cx="32" cy="36" r="2"/>'
        + '</g></svg>';
    case 'thunder':
      return '<svg viewBox="0 0 48 48" fill="none">'
        + '<path d="M14 26 C 8 26 6 20 11 16 C 11 10 18 8 22 12 C 26 6 36 8 36 16 C 42 16 42 26 36 26 Z" fill="#5A6878"/>'
        + '<path d="M22 26 L 18 36 L 22 36 L 20 44 L 30 32 L 24 32 L 28 26 Z" fill="#FFC940"/>'
        + '</svg>';
  }
}

// Запуск при загрузке home
document.addEventListener('DOMContentLoaded', renderHomeWeather);

// Before/After mini sliders

// Modal
function openModal() { document.getElementById('modalOverlay').classList.add('open'); }
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
function closeModalOutside(e) { if(e.target === document.getElementById('modalOverlay')) closeModal(); }
function submitOrder() { closeModal(); alert('✅ Заявка отправлена!'); }

// Order page
let orderStep = 1, selectedService = null, selectedServicePrice = 0, selectedTime = null, orderArea = 4, preSelectedService = false;

function openOrderPage(serviceName, servicePrice) {
  selectedService = null; selectedTime = null;
  selectedServicePrice = 0; preSelectedService = false;
  document.querySelectorAll('.service-pick-card').forEach(c => c.classList.remove('selected'));
  const sl = document.getElementById('areaSlider'); if(sl){ sl.value = 4; updateArea(4); }
  document.getElementById('orderFooter').style.display = 'flex';

  if (serviceName) {
    // Came from service card - skip step 1 completely
    selectedService = serviceName;
    selectedServicePrice = servicePrice;
    preSelectedService = true;
    orderStep = 2;
  } else {
    // Came from hero button - show service selection
    orderStep = 1;
  }

  renderOrderStep(); showPage('order');
}

function selectService(card, name, icon, price) {
  document.querySelectorAll('.order-svc-item').forEach(c => {
    c.classList.remove('selected');
    const arr = c.querySelector('.order-svc-arrow');
    if(arr) arr.textContent = '›';
  });
  card.classList.add('selected');
  const arr = card.querySelector('.order-svc-arrow');
  if(arr) arr.textContent = '✓';
  document.querySelectorAll('.service-pick-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedService = name; selectedServicePrice = price;
  // Auto advance to step 2
  setTimeout(function(){ orderStep=2; renderOrderStep(); }, 200);
}
function updateArea(val) {
  orderArea = parseInt(val);
  const av = document.getElementById('areaVal'); if(av) av.innerHTML = val + ' <span>соток</span>';
}
function selectTime(el) {
  if(el.classList.contains('disabled')) return;
  document.querySelectorAll('.time-slot').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected'); selectedTime = el.textContent;
}
function renderOrderStep() {
  document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));

  // If service pre-selected, steps show as 2-step flow (hide step 1 dot)
  const stepsBar = document.getElementById('stepsBar');
  if (preSelectedService) {
    stepsBar.style.display = 'none';
  } else {
    stepsBar.style.display = 'flex';
    for(let i=1;i<=3;i++){
      const d=document.getElementById('sd'+i);
      if(i<orderStep){d.className='step-dot done';d.textContent='✓';}
      else if(i===orderStep){d.className='step-dot active';d.textContent=i;}
      else{d.className='step-dot pending';d.textContent=i;}
    }
    for(let i=1;i<=2;i++) document.getElementById('sl'+i).className='step-line'+(i<orderStep?' done':'');
  }

  const s=document.getElementById('ostep'+orderStep);
  if(s) s.classList.add('active');
  document.getElementById('orderPrevBtn').style.display = (orderStep>1 && !preSelectedService) || (preSelectedService && orderStep>2) ?'flex':'none';
  const titles={1:'Выбор услуги',2:'Дата и адрес',3:'Подтверждение'};
  document.getElementById('orderHeaderTitle').textContent = preSelectedService && orderStep===2 ? selectedService : (titles[orderStep]||'Заказ');
  document.getElementById('orderNextBtn').textContent = orderStep===3?'Подтвердить заказ ✓':'Далее →';
  document.getElementById('orderNextBtn').style.display = orderStep===1 ? 'none' : 'flex';
  if(orderStep===3){
    document.getElementById('sumService').textContent=selectedService||'—';
    document.getElementById('sumArea').textContent=orderArea+' соток';
    document.getElementById('sumDate').textContent=window._orderDate||'Сегодня';
    document.getElementById('sumTime').textContent=selectedTime||'—';
    document.getElementById('sumAddr').textContent=document.getElementById('orderAddress').value||'—';
    document.getElementById('sumTotal').textContent=(selectedServicePrice*orderArea).toLocaleString('ru')+' ₸';
  }
  document.getElementById('orderScrollBody').scrollTop=0;
}
function orderNext() {
  if(orderStep===1){
    if(!selectedService){alert('Выберите услугу');return;}
    orderStep=2;renderOrderStep();
  } else if(orderStep===2){
    const addrEl = document.getElementById('orderAddress');
    const nameEl = document.getElementById('orderName');
    const phoneEl = document.getElementById('orderPhone');
    if(!addrEl || !addrEl.value.trim()){alert('Введите адрес');return;}
    if(!nameEl || !nameEl.value.trim()){alert('Введите ваше имя');return;}
    if(!phoneEl || !phoneEl.value.trim()){alert('Введите номер телефона');return;}
    orderStep=3;renderOrderStep();
  } else if(orderStep===3){
    document.querySelectorAll('.step-section').forEach(s=>s.classList.remove('active'));
    document.getElementById('ostep-success').classList.add('active');
    document.getElementById('orderFooter').style.display='none';
    document.getElementById('stepsBar').style.display='none';
    document.getElementById('orderNum').textContent='#GL-'+String(Math.floor(1000+Math.random()*9000));
    document.getElementById('orderHeaderTitle').textContent='Готово!';
  }
}
function orderPrev() {
  if (preSelectedService) {
    if (orderStep > 2) { orderStep--; renderOrderStep(); }
    else { goToHome(); }
  } else {
    if(orderStep>1){orderStep--;document.getElementById('orderFooter').style.display='flex';document.getElementById('stepsBar').style.display='flex';renderOrderStep();}
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  const t=new Date().toISOString().split('T')[0];
  const d=document.getElementById('orderDate');
  if(d) d.min=t;
});

// ===== SERVICE DETAIL PAGE =====

const serviceDetails = {
  'Топиарная обрезка': { sub: 'Придадим вашим растениям идеальную форму', icon: '🌲' },
  'Покос травы':       { sub: 'Быстро и аккуратно скосим траву на участке', icon: '🌾' },
  'Стрижка газона':    { sub: 'Профессиональная стрижка газонокосилкой', icon: '🚜' },
  'Вспашка':           { sub: 'Вспашка земли мотоблоком любой площади', icon: '🚜' },
  'Посадка газона':    { sub: 'Укладка рулонного газона под ключ', icon: '🌱' },
  'Посадка растений':  { sub: 'Посадка кустарников, деревьев и цветов', icon: '🌿' },
};

// Store images per service for detail page
const serviceImages = {};

/* ============================================================
   ORDER PAGE v2 — clean form with validation, autofill, price calc
   ============================================================ */

// Тарифы за сотку (примерные, для расчёта стоимости)
var ORDER_RATES = {
  'Покос травы':         1500,
  'Покос':               1500,
  'Покос триммером':     1800,
  'Стрижка газона':      2000,
  'Вспашка':             3000,
  'Вспашка участка':     3000,
  'Посадка газона':      8000,
  'Посадка рулонного газона': 8000,
  'Посадка растений':    5000,
  'Топиарная обрезка':   4000,
  '__default':           2000
};
var TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

var orderState = {
  service: null,
  area: 4,
  address: '',
  date: null,
  time: null,
  name: '',
  phone: ''
};

function openServiceDetail(name, tileEl, fromPage) {
  // САМОЕ ВАЖНОЕ — переключаем страницу первым делом, чтобы даже если
  // что-то ниже упадёт, пользователь увидит экран заказа
  window._detailFromPage = fromPage || 'home';
  showPage('service-detail');

  try {
    var imgSrc = null;
    try { imgSrc = (tileEl && tileEl.querySelector && tileEl.querySelector('img')) ? tileEl.querySelector('img').src : null; } catch(e) {}

    // Сброс state
    orderState.service = name;
    orderState.area = 4;
    orderState.address = '';
    orderState.date = null;
    orderState.time = null;

    // Автозаполнение контактов из localStorage (защищено от Safari private mode)
    var savedName = 'Друг', savedPhone = '';
    try {
      savedName = localStorage.getItem('gl_name') || 'Друг';
      savedPhone = localStorage.getItem('gl_phone') || '';
    } catch(e) {}
    orderState.name = savedName;
    orderState.phone = savedPhone;
    var nameNode = document.getElementById('orderContactName');
    var phoneNode = document.getElementById('orderContactPhone');
    if (nameNode) nameNode.textContent = savedName;
    if (phoneNode) phoneNode.textContent = savedPhone ? formatPhoneForDisplay(savedPhone) : 'Не указан';

    // Сброс UI полей
    var addrEl = document.getElementById('orderAddress');
    if (addrEl) addrEl.value = '';
    // Применить service-specific data (виз. параметр, единицу площади, диапазон).
    // Тройной вызов: сразу + через requestAnimationFrame + через 80ms таймаут —
    // гарантируем что нужная услуга применится, даже если первая попытка
    // случится до полной готовности DOM или стейта.
    var applySvc = function() {
      if (typeof window.serviceForm !== 'undefined' && typeof window.serviceForm.setService === 'function') {
        try {
          window.serviceForm.setService(name);
          var sfState = window.serviceForm.getState();
          if (sfState) orderState.area = sfState.area;
        } catch(e) {}
      }
    };
    applySvc();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(applySvc);
    setTimeout(applySvc, 80);

    // Hero
    var titleEl = document.getElementById('detailTitle');
    var subEl = document.getElementById('detailSub');
    var heroImg = document.getElementById('detailHeroImg');
    var info = (typeof serviceDetails !== 'undefined' && serviceDetails[name]) ? serviceDetails[name] : { sub: '' };
    if (titleEl) titleEl.textContent = name;
    if (subEl) subEl.textContent = info.sub || '';
    if (heroImg && imgSrc) heroImg.src = imgSrc;

    // Рендер дат и времени
    renderOrderDates();
    renderOrderTimes();

    updateOrderState();
  } catch (err) {
    console.error('openServiceDetail error:', err);
  }
}

function updateOrderArea(val) {
  orderState.area = parseInt(val, 10) || 1;
  var el = document.getElementById('orderAreaVal');
  if (el) el.textContent = orderState.area;
  if (typeof window.serviceForm !== 'undefined' && typeof window.serviceForm.setArea === 'function') {
    try { window.serviceForm.setArea(orderState.area); } catch(e) {}
  }
  updateOrderState();
}

function renderOrderDates() {
  var row = document.getElementById('orderDateRow');
  if (!row) return;
  var dows = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  var months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  var today = new Date();
  var html = '';
  for (var i = 0; i < 7; i++) {
    var d = new Date(today);
    d.setDate(today.getDate() + i);
    var iso = d.toISOString().slice(0,10);
    var dow = (i === 0) ? 'Сегодня' : (i === 1 ? 'Завтра' : dows[d.getDay()]);
    html += '<button type="button" class="order-date-chip" data-date="' + iso + '" onclick="selectOrderDate(\'' + iso + '\', this)">' +
      '<span class="order-date-chip-dow">' + dow + '</span>' +
      '<span class="order-date-chip-day">' + d.getDate() + '</span>' +
      '<span class="order-date-chip-mon">' + months[d.getMonth()] + '</span>' +
    '</button>';
  }
  row.innerHTML = html;
}

function renderOrderTimes() {
  var grid = document.getElementById('orderTimeGrid');
  if (!grid) return;
  var html = '';
  for (var i = 0; i < TIME_SLOTS.length; i++) {
    html += '<button type="button" class="order-time-chip" data-time="' + TIME_SLOTS[i] + '" onclick="selectOrderTime(\'' + TIME_SLOTS[i] + '\', this)">' + TIME_SLOTS[i] + '</button>';
  }
  grid.innerHTML = html;
}

function selectOrderDate(iso, el) {
  orderState.date = iso;
  document.querySelectorAll('#orderDateRow .order-date-chip').forEach(function(c){ c.classList.remove('selected'); });
  if (el) el.classList.add('selected');
  updateOrderState();
}

function selectOrderTime(t, el) {
  orderState.time = t;
  document.querySelectorAll('#orderTimeGrid .order-time-chip').forEach(function(c){ c.classList.remove('selected'); });
  if (el) el.classList.add('selected');
  updateOrderState();
}

function onOrderInputChange() {
  var addrEl = document.getElementById('orderAddress');
  orderState.address = addrEl ? addrEl.value.trim() : '';
  updateOrderState();
}

function editOrderContact(field) {
  var label = field === 'name' ? 'Имя' : 'Номер телефона';
  var current = field === 'name' ? orderState.name : orderState.phone;
  var next = window.prompt('Изменить «' + label + '»:', current);
  if (next === null) return;
  next = next.trim();
  if (!next) return;
  if (field === 'name') {
    orderState.name = next;
    var n = document.getElementById('orderContactName');
    if (n) n.textContent = next;
    localStorage.setItem('gl_name', next);
  } else {
    orderState.phone = next;
    var p = document.getElementById('orderContactPhone');
    if (p) p.textContent = formatPhoneForDisplay(next);
    localStorage.setItem('gl_phone', next);
  }
}

function calcOrderPrice() {
  var rate = ORDER_RATES[orderState.service] || ORDER_RATES.__default;
  return orderState.area * rate;
}

function _formatPriceKZT(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function updateOrderState() {
  var addrEl = document.getElementById('orderAddress');
  if (addrEl) orderState.address = addrEl.value.trim();
  var validArea = orderState.area >= 1;
  var validAddr = orderState.address.length >= 3;
  var validDate = !!orderState.date;
  var validTime = !!orderState.time;
  // Item 4=а — виз. параметр обязателен (если для услуги предусмотрен)
  var validParam = true;
  if (typeof window.serviceForm !== 'undefined' && typeof window.serviceForm.hasOption === 'function') {
    var paramSection = document.getElementById('orderParamGrid');
    var hasParamUI = paramSection && paramSection.closest('.order-section') &&
                     paramSection.closest('.order-section').style.display !== 'none';
    if (hasParamUI) validParam = window.serviceForm.hasOption();
  }
  var allValid = validParam && validArea && validAddr && validDate && validTime;

  // Submit button
  var btn = document.getElementById('orderSubmitBtn');
  if (btn) btn.disabled = !allValid;

  // Обновить состояние шагов timeline (pending / active / done)
  updateStepStates([validParam, validArea, validAddr, (validDate && validTime), !!(orderState.name && orderState.phone), false]);
}

/* Timeline шагов: для каждой .order-section выставляет состояние step-num
   (pending/active/done) и цвет линии-соединителя.
   doneFlags — массив 6 bool: [параметр, площадь, адрес, дата+время, контакты, фото] */
function updateStepStates(doneFlags) {
  var sections = document.querySelectorAll('#page-service-detail .order-section');
  if (!sections.length) return;
  // Найти первый невыполненный шаг — он становится "active"
  var activeIdx = -1;
  for (var i = 0; i < doneFlags.length; i++) {
    if (!doneFlags[i]) { activeIdx = i; break; }
  }
  for (var j = 0; j < sections.length && j < doneFlags.length; j++) {
    var num = sections[j].querySelector('.order-step-num');
    if (!num) continue;
    var state;
    if (doneFlags[j]) state = 'done';
    else if (j === activeIdx) state = 'active';
    else state = 'pending';
    num.setAttribute('data-state', state);
    // Цвет линии под шагом: зелёная если шаг done, иначе светло-серая
    sections[j].style.setProperty('--tl-color', doneFlags[j] ? '#4ADE4A' : '#DCEEDC');
  }
  // Цвет линии через inline-цены — равен цвету линии секции "площадь" (индекс 1)
  var priceInline = document.getElementById('orderPriceInline');
  if (priceInline) {
    priceInline.style.setProperty('--tl-color', doneFlags[1] ? '#4ADE4A' : '#DCEEDC');
  }
}

function submitOrder() {
  if (document.getElementById('orderSubmitBtn').disabled) return;
  // На этапе 2: POST /api/orders
  // Сейчас — открываем success screen существующий
  if (typeof showOrderSuccess === 'function') {
    showOrderSuccess(orderState.service, orderState.address, orderState.date + ' ' + orderState.time);
  } else {
    alert('Заказ оформлен!\n\n' + orderState.service + '\n' + orderState.address + '\n' + orderState.date + ' ' + orderState.time + '\n~ ' + _formatPriceKZT(calcOrderPrice()) + ' ₸');
  }
}

// Legacy совместимость (старые onclick могут вызывать)
function selectDate(card, val) { /* no-op */ }
function selectVolume(card, val) { /* no-op */ }
function updateDetailArea(val) { updateOrderArea(val); }

function sendWhatsApp() {
  const name = document.getElementById('detailName').value.trim();
  const phone = document.getElementById('detailPhone').value.trim();
  const address = document.getElementById('detailAddress').value.trim();
  const service = document.getElementById('detailTitle').textContent;

  if (!address) { alert('Пожалуйста, введите адрес'); return; }
  if (!name) { alert('Пожалуйста, введите ваше имя'); return; }
  if (!phone) { alert('Пожалуйста, введите номер телефона'); return; }

  const msg = encodeURIComponent(
    `Здравствуйте! Хочу заказать услугу:\n` +
    `📋 Услуга: ${service}\n` +
    `📦 Объём: ${detailVolume}\n` +
    `📍 Адрес: ${address}\n` +
    `📅 Когда: ${detailDate}\n` +
    `👤 Имя: ${name}\n` +
    `📞 Телефон: ${phone}`
  );
  api.native.openWhatsApp('77000000000', decodeURIComponent(msg));

  // ===== СОХРАНЕНИЕ В FIREBASE =====
  const now = new Date();
  const timeStr = now.toLocaleString('ru-RU', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
  const orderId = now.getTime();
  const order = {
    id: orderId,
    service: service,
    name: name,
    phone: phone,
    address: address,
    area: detailVolume || '—',
    date: detailDate || 'Не указана',
    status: 'new',
    time: timeStr
  };
  db.ref('orders/' + orderId).set(order)
    .then(() => console.log('✅ Заявка сохранена в Firebase'))
    .catch(err => console.error('❌ Ошибка Firebase:', err));
  // ==================================

  // Show success screen
  const num = '#LN-' + Math.floor(1000 + Math.random() * 9000);
  document.getElementById('scService').textContent = service;
  document.getElementById('scAddress').textContent = address;
  document.getElementById('scOrderNum').textContent = num;
  window._lastWhatsAppMsg = `https://wa.me/77000000000?text=${msg}`;
  document.getElementById('successScreen').style.display = 'block';
  document.getElementById('successScreen').style.animation = 'none';
}


// Dynamic dates
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function formatDate(d) {
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
}

function dateLabelToday() {
  return 'Сегодня, ' + formatDate(new Date());
}

function dateLabelTomorrow() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return 'Завтра, ' + formatDate(t);
}

function initDateLabels() {
  const todayEl = document.getElementById('dateTodayLabel');
  const tomorrowEl = document.getElementById('dateTomorrowLabel');
  if (todayEl) todayEl.textContent = dateLabelToday();
  if (tomorrowEl) tomorrowEl.textContent = dateLabelTomorrow();
}

document.addEventListener('DOMContentLoaded', initDateLabels);


  // Before/After sliders
  function baInit(sliderId, handleId, beforeId) {
    const slider = document.getElementById(sliderId);
    const handle = document.getElementById(handleId);
    const before = document.getElementById(beforeId);
    if (!slider || !handle || !before) return;
    function setPos(x) {
      const rect = slider.getBoundingClientRect();
      let pct = Math.min(Math.max((x - rect.left) / rect.width * 100, 0), 100);
      before.style.clipPath = `inset(0 ${100-pct}% 0 0)`;
      handle.style.left = pct + '%';
    }
    slider.addEventListener('mousedown', e => {
      setPos(e.clientX);
      const move = e2 => setPos(e2.clientX);
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', () => document.removeEventListener('mousemove', move), {once:true});
    });
    slider.addEventListener('touchstart', e => {
      const move = e2 => setPos(e2.touches[0].clientX);
      setPos(e.touches[0].clientX);
      document.addEventListener('touchmove', move, {passive:true});
      document.addEventListener('touchend', () => document.removeEventListener('touchmove', move), {once:true});
    });
  }
  

function selectReminder(el, days) {
  document.querySelectorAll('.reminder-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  alert('Напоминание установлено через ' + days + ' дней!');
}
function setCustomReminder() {
  const days = document.getElementById('reminderDays').value;
  if (!days || days < 1) { alert('Укажите количество дней'); return; }
  alert('Напоминание установлено через ' + days + ' дней!');
}


function handlePhoto(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    const preview = document.getElementById('photoPreview');
    preview.innerHTML = '<img class="photo-preview-img" src="' + e.target.result + '"><div style="text-align:center;padding:8px;font-size:12px;color:#2E8B2E;font-weight:600">✅ Фото добавлено. Нажмите чтобы изменить</div>';
  };
  reader.readAsDataURL(file);
  window._photoFile = file;
}


function closeSuccess() {
  document.getElementById('successScreen').style.display = 'none';
  showPage('home');
}
function openWhatsAppAgain() {
  if (window._lastWhatsAppMsg) window.open(window._lastWhatsAppMsg, '_blank');
}


// Map working hours status
(function() {
  const now = new Date();
  const h = now.getHours();
  const el = document.getElementById('mapStatusText');
  if (el) {
    if (h >= 8 && h < 20) {
      el.textContent = 'Работаем';
      el.style.color = '#2E8B2E';
      el.previousElementSibling.style.background = '#2E8B2E';
    } else {
      el.textContent = 'Закрыто';
      el.style.color = '#e53935';
      el.previousElementSibling.style.background = '#e53935';
      el.closest('.map-status').style.background = '#ffeaea';
    }
  }
})();


// Leaflet OpenStreetMap — Uralsk (надёжная инициализация)
function _glInitMap() {
  if (window._leafletMap) {
    try { window._leafletMap.invalidateSize(); } catch(e) {}
    return;
  }
  if (!window.L) return;
  var el = document.getElementById('mapLeaflet');
  if (!el) return;
  if (el.offsetWidth === 0 || el.offsetHeight === 0) {
    setTimeout(_glInitMap, 250);
    return;
  }

  var map = window._leafletMap = L.map('mapLeaflet', {
    zoomControl: false,
    scrollWheelZoom: false,
    attributionControl: false
  }).setView([51.2297, 51.3728], 11);

  // Тайлы — стандартный OSM (надёжный publish CDN)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: ''
  }).addTo(map);

  // Зона работы: Уральск + 10 км (внешнее dashed-кольцо)
  L.circle([51.2297, 51.3728], {
    radius: 10000,
    color: '#2E8B2E',
    fillColor: '#2E8B2E',
    fillOpacity: 0.14,
    weight: 2,
    dashArray: '4 4'
  }).addTo(map);

  // Внутреннее ядро (центр города)
  L.circle([51.2297, 51.3728], {
    radius: 4500,
    color: '#2E8B2E',
    fillColor: '#3DA83D',
    fillOpacity: 0.12,
    weight: 0
  }).addTo(map);

  // Метка по центру — без emoji, чистый градиентный pin
  var icon = L.divIcon({
    html: '<div style="background:linear-gradient(135deg,#4ADE4A 0%,#2E8B2E 100%);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,0.35);"></div>',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    className: ''
  });
  L.marker([51.2297, 51.3728], { icon: icon }).addTo(map);

  // Авто-фит под радиус 10км
  try {
    map.fitBounds(L.latLng(51.2297, 51.3728).toBounds(22000), { padding: [12, 12] });
  } catch (e) {}

  // Двойной invalidateSize — на случай если контейнер размером пустой при init
  setTimeout(function(){ try { map.invalidateSize(); } catch(e){} }, 100);
  setTimeout(function(){ try { map.invalidateSize(); } catch(e){} }, 600);
}

(function loadLeaflet() {
  if (window.L) { _glInitMap(); return; }
  var script = document.createElement('script');
  script.src = 'vendor/leaflet/leaflet.js';
  script.onload = function() {
    _glInitMap();
    setTimeout(_glInitMap, 300);
  };
  script.onerror = function() {
    console.warn('Leaflet failed to load (vendor/leaflet/leaflet.js)');
  };
  document.head.appendChild(script);
})();


// Show detail footer on scroll


function updateArea2(val) {
  const el = document.getElementById('areaVal2');
  if(el) el.textContent = val;
  window._orderArea = val;
}

function selectOrderDate(el, date) {
  document.querySelectorAll('.date-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  window._orderDate = date;
}

function submitOrderWhatsApp() {
  const name = document.getElementById('orderName') ? document.getElementById('orderName').value.trim() : '';
  const phone = document.getElementById('orderPhone') ? document.getElementById('orderPhone').value.trim() : '';
  const address = document.getElementById('orderAddress') ? document.getElementById('orderAddress').value.trim() : '';
  const sliderEl = document.getElementById('areaSlider');
  const area = window._orderArea || (sliderEl ? sliderEl.value : '4');
  const date = window._orderDate || 'Сегодня';
  const service = selectedService || 'Не выбрано';

  if (!name) { alert('Введите ваше имя'); return; }
  if (!phone) { alert('Введите номер телефона'); return; }
  if (!address) { alert('Введите адрес'); return; }

  // ===== СОХРАНЕНИЕ В FIREBASE =====
  const now = new Date();
  const timeStr = now.toLocaleString('ru-RU', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
  const orderId = now.getTime();
  const order = {
    id: orderId,
    service: service,
    name: name,
    phone: phone,
    address: address,
    area: area + ' соток',
    date: date,
    status: 'new',
    time: timeStr
  };
  db.ref('orders/' + orderId).set(order)
    .then(() => console.log('✅ Заявка сохранена в Firebase'))
    .catch(err => console.error('❌ Ошибка Firebase:', err));
  // ==================================

  const msg = encodeURIComponent(
    '🌿 Новая заявка GreenLine!\n\n' +
    '📋 Услуга: ' + service + '\n' +
    '👤 Имя: ' + name + '\n' +
    '📞 Телефон: ' + phone + '\n' +
    '📍 Адрес: ' + address + '\n' +
    '📐 Площадь: ' + area + ' соток\n' +
    '📅 Дата: ' + date
  );
  api.native.openWhatsApp('77000000000', decodeURIComponent(msg));

  // Show success
  const num = '#LN-' + Math.floor(1000 + Math.random() * 9000);
  if(document.getElementById('scService')) document.getElementById('scService').textContent = service;
  if(document.getElementById('scAddress')) document.getElementById('scAddress').textContent = address;
  if(document.getElementById('scOrderNum')) document.getElementById('scOrderNum').textContent = num;
  window._lastWhatsAppMsg = 'https://wa.me/77000000000?text=' + msg;
  const ss = document.getElementById('successScreen');
  if(ss) { ss.style.display = 'block'; }
  showPage('home');
}

function handleOrderPhoto(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const preview = document.getElementById('orderPhotoPreview');
    if(preview) preview.innerHTML = '<img class="photo-preview-img" src="' + e.target.result + '"><div style="text-align:center;padding:8px;font-size:12px;color:#2E8B2E;font-weight:600">✅ Фото добавлено</div>';
  };
  reader.readAsDataURL(input.files[0]);
}


// Init: show correct nav state
(function() {
  const nav = document.getElementById('bottomNav');
  const activePage = document.querySelector('.page.active');
  if (nav && activePage) {
    const pid = activePage.id;
    nav.style.display = (pid === 'page-register' || pid === 'page-admin' || pid === 'page-splash' || pid === 'page-onboarding' || pid === 'page-welcome') ? 'none' : 'flex';
  }
})();

// Маппинг "page id (без префикса page-)" → активная вкладка нижнего бара.
// Сюда же сводим services и подстраницы профиля.
const NAV_TAB_FOR_PAGE = {
  'home': 'home',
  'gallery': 'home',             // галерея работ — глубокая страница от главной
  'orders': 'orders',
  'services': 'orders',          // объединили: каталог услуг и история — одна вкладка
  'service-detail': 'orders',    // открывая услугу, остаёмся в "Ваши заказы"
  'order': 'orders',             // оформление заказа — тоже сюда
  'profile': 'profile',
  'profile-addresses': 'profile',
  'profile-notifications': 'profile',
  'profile-referral': 'profile',
  'profile-help': 'profile'
};

function updateBottomNavActive(pageName) {
  const tab = NAV_TAB_FOR_PAGE[pageName] || null;
  document.querySelectorAll('#bottomNav .nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

// Inject bottom nav after login
function injectBottomNav() {
  if (document.getElementById('bottomNav')) return;
  const phone = document.querySelector('.phone');
  if (!phone) return;
  phone.insertAdjacentHTML('beforeend', `<nav class="bottom-nav" id="bottomNav" role="navigation" aria-label="Главное меню" style="display:none!important;">
    <button class="nav-btn active" type="button" data-tab="home" data-target="home" aria-label="Главная">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 11.5L12 4l9 7.5"/>
        <path d="M5 10v10h5v-6h4v6h5V10"/>
      </svg>
      <span class="nav-label">Главная</span>
    </button>
    <button class="nav-btn" type="button" data-tab="orders" data-target="orders" aria-label="Ваши заказы">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="16" height="17" rx="3"/>
        <path d="M9 4v3M15 4v3"/>
        <path d="M8 11h8M8 15h6"/>
      </svg>
      <span class="nav-label">Ваши заказы</span>
    </button>
    <button class="nav-btn" type="button" data-tab="profile" data-target="profile" aria-label="Профиль">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
      </svg>
      <span class="nav-label">Профиль</span>
    </button>
  </nav>`);

  // Обработчики кликов
  document.querySelectorAll('#bottomNav .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (!target) return;
      // Сразу подсвечиваем активную (UI отвечает мгновенно, не ждёт showPage)
      document.querySelectorAll('#bottomNav .nav-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      // Снимаем фокус, чтобы убрать браузерный outline после тапа
      btn.blur();
      showPage(target);
    });
  });

  // Синхронизировать состояние с активной страницей
  const activePage = document.querySelector('.page.active');
  if (activePage) updateBottomNavActive(activePage.id.replace(/^page-/, ''));
}



/* === BLOCK BREAK === */


const adminStatusCfg = {
  new:       {label:'Новая',       bg:'rgba(46,204,113,0.12)', color:'#2ECC71', dot:'#2ECC71'},
  contacted: {label:'Связались',   bg:'rgba(255,255,255,0.06)',color:'#8B949E', dot:'#484F58'},
  agreed:    {label:'Согласовано', bg:'rgba(56,139,253,0.12)', color:'#58A6FF', dot:'#58A6FF'},
  done:      {label:'Выполнено',   bg:'rgba(56,189,170,0.12)', color:'#39BDA9', dot:'#39BDA9'},
  postponed: {label:'Перенесено',  bg:'rgba(240,167,47,0.12)', color:'#F0A72F', dot:'#F0A72F'},
  declined:  {label:'Отказ',       bg:'rgba(248,81,73,0.12)',  color:'#F85149', dot:'#F85149'},
};
const adminStatusOrder = ['new','contacted','agreed','done','postponed','declined'];
let adminLeads = [
  {id:1,status:'new',service:'Покос травы',name:'Ержан Сейткали',phone:'+7 701 234 56 78',address:'ул. Абая 45',size:'6 соток',date:'Сегодня',comment:'Трава очень высокая, около 40 см.',time:'Сегодня, 14:30',note:'',showNote:false},
  {id:2,status:'contacted',service:'Стрижка кустарников',name:'Айгуль Нурланова',phone:'+7 702 987 65 43',address:'пр. Назарбаева 12',size:'3 куста',date:'Завтра',comment:'Нужна аккуратная стрижка туй вдоль забора.',time:'Сегодня, 11:15',note:'',showNote:false},
  {id:3,status:'done',service:'Озеленение',name:'Сауле Бекова',phone:'+7 771 666 55 00',address:'ул. Ленина 3',size:'2 сотки',date:'Сегодня',comment:'Посадка цветов вдоль дорожки.',time:'Сегодня, 08:30',note:'Клиент доволен',showNote:false},
];
let adminActiveFilter = 'all';
let adminOpenMenu = null;

function updateStats() {
  const t=document.getElementById('stat-total');
  const n=document.getElementById('stat-new');
  const d=document.getElementById('stat-done');
  if(!t) return;
  t.textContent=adminLeads.length;
  n.textContent=adminLeads.filter(l=>l.status==='new').length;
  d.textContent=adminLeads.filter(l=>l.status==='done').length;
}
function renderTabs() {
  const el=document.getElementById('tabs');
  if(!el) return;
  const tabs=[{key:'all',label:'Все'},{key:'new',label:'Новые'},{key:'contacted',label:'Связались'},{key:'agreed',label:'Согласовано'},{key:'done',label:'Выполнено'},{key:'postponed',label:'Перенесено'},{key:'declined',label:'Отказ'}];
  el.innerHTML=tabs.map(t=>`<button class="tab${adminActiveFilter===t.key?' active':''}" onclick="filterLeads('${t.key}')">${t.label}</button>`).join('');
}
function filterLeads(f) {
  adminActiveFilter=f; closeAllMenus(); renderTabs(); renderLeads();
}
function closeAllMenus() {
  adminOpenMenu=null;
  document.querySelectorAll('#page-admin .status-menu').forEach(m=>m.remove());
}
function toggleMenu(id) {
  if(adminOpenMenu===id){closeAllMenus();return;}
  closeAllMenus(); adminOpenMenu=id;
  const lead=adminLeads.find(l=>l.id===id);
  const wrap=document.getElementById('actions-'+id);
  const menu=document.createElement('div');
  menu.className='status-menu';
  menu.innerHTML=adminStatusOrder.map(s=>`<div class="status-opt" onclick="setStatus(${id},'${s}')"><span style="width:8px;height:8px;border-radius:50%;background:${adminStatusCfg[s].dot};flex-shrink:0"></span><span${lead.status===s?' style="font-weight:600"':''}>${adminStatusCfg[s].label}</span>${lead.status===s?'<span class="check">✓</span>':''}</div>`).join('');
  wrap.style.position='relative';
  wrap.appendChild(menu);
}
function setStatus(id,status) {
  adminLeads.find(l=>l.id===id).status=status;
  closeAllMenus(); updateStats(); renderLeads();
}
function toggleNote(id) {
  const lead=adminLeads.find(l=>l.id===id);
  lead.showNote=!lead.showNote; renderLeads();
}
function saveNote(id,val) { adminLeads.find(l=>l.id===id).note=val; }
function adminCall(phone) { api.native.openTel(phone); }
function adminWhatsapp(phone,name) { api.native.openWhatsApp(phone, 'Здравствуйте ' + name + ', мы из GreenLine!'); }
function renderLeads() {
  const container=document.getElementById('leads');
  if(!container) return;
  const filtered=adminActiveFilter==='all'?adminLeads:adminLeads.filter(l=>l.status===adminActiveFilter);
  if(!filtered.length){container.innerHTML='<div class="empty">Нет заявок в этой категории</div>';return;}
  container.innerHTML=filtered.map(l=>{
    const s=adminStatusCfg[l.status];
    return `<div class="lead-card"><div class="lead-body"><div class="lead-top"><span class="badge" style="background:${s.bg};color:${s.color}"><span class="badge-dot" style="background:${s.dot}"></span>${s.label}</span><span class="lead-time">${l.time}</span></div><div class="lead-service">${l.service}</div><div class="lead-grid"><div><div class="lead-field-label">Клиент</div><div class="lead-field-val">${l.name}</div></div><div><div class="lead-field-label">Телефон</div><div class="lead-field-val blue" onclick="adminCall('${l.phone}')">${l.phone}</div></div><div><div class="lead-field-label">Адрес</div><div class="lead-field-val muted">${l.address}</div></div><div><div class="lead-field-label">Объём · Дата</div><div class="lead-field-val muted">${l.size} · ${l.date}</div></div></div><div class="lead-comment">${l.comment}</div>${l.showNote?`<textarea class="note-input" rows="2" placeholder="Заметка..." onchange="saveNote(${l.id},this.value)">${l.note}</textarea>`:l.note?`<div class="lead-note" onclick="toggleNote(${l.id})">📝 ${l.note}</div>`:''}</div><div class="lead-actions" id="actions-${l.id}"><button class="action-btn blue" onclick="adminCall('${l.phone}')">Позвонить</button><button class="action-btn green" onclick="adminWhatsapp('${l.phone}','${l.name}')">WhatsApp</button><button class="action-btn muted" onclick="toggleNote(${l.id})">Заметка</button><button class="action-btn status" onclick="toggleMenu(${l.id})">Статус ▾</button></div></div>`;
  }).join('');
}
document.addEventListener('click',function(e){
  if(!e.target.closest('#page-admin .status-menu')&&!e.target.closest('#page-admin .action-btn.status')) closeAllMenus();
});


/* === BLOCK BREAK === */


// ===== NEW ADMIN =====
const admStatusCfg = {
  new:       { label:'Новая',       bg:'#E8F5E8', color:'#2E8B2E' },
  contacted: { label:'Связались',   bg:'#EEF2FF', color:'#4F6EF7' },
  agreed:    { label:'Согласовано', bg:'#E0F2FE', color:'#0284C7' },
  done:      { label:'Выполнено',   bg:'#F0FFF4', color:'#16A34A' },
  postponed: { label:'Перенесено',  bg:'#FEF9C3', color:'#CA8A04' },
  declined:  { label:'Отказ',       bg:'#FEE2E2', color:'#DC2626' },
  archive:   { label:'📦 Архив',    bg:'#F3F4F6', color:'#6B7280' },
};
const admStatusOrder = ['new','contacted','agreed','done','postponed','declined','archive'];

const admServiceIcons = {
  'Покос травы': '🌾',
  'Стрижка газона': '🌿',
  'Вспашка': '🚜',
  'Посадка газона': '🌱',
  'Посадка растений': '🌿',
  'Топиарная обрезка': '✂️',
};

let admLeadsList = [];

// ===== FIREBASE REAL-TIME ЗАГРУЗКА ЗАЯВОК =====
let admFirebaseInited = false;
function admInitFirebase() {
  if (admFirebaseInited) return;
  admFirebaseInited = true;
  db.ref('orders').on('value', function(snapshot) {
    const data = snapshot.val();
    if (data) {
      admLeadsList = Object.values(data).reverse();
    } else {
      admLeadsList = [];
    }
    updateStats();
    renderTabs();
    renderLeads();
  });
}
// ================================================

let admFilter = 'all';
let admOpenMenu = null;

function updateStats() {
  const t = document.getElementById('admStatTotal');
  const n = document.getElementById('admStatNew');
  const c = document.getElementById('admStatContacted');
  if (!t) return;
  t.textContent = admLeadsList.length;
  n.textContent = admLeadsList.filter(l => l.status === 'new').length;
  c.textContent = admLeadsList.filter(l => l.status === 'contacted').length;
}

function renderTabs() {
  const el = document.getElementById('admTabs');
  if (!el) return;
  const tabs = [
    {key:'all', label:'Все'},
    {key:'new', label:'Новые'},
    {key:'contacted', label:'Связались'},
    {key:'agreed', label:'Согласовано'},
    {key:'declined', label:'Отказ'},
    {key:'archive', label:'📦 Архив'},
  ];
  el.innerHTML = tabs.map(t => {
    const count = t.key === 'all' ? admLeadsList.length : admLeadsList.filter(l => l.status === t.key).length;
    return `<button class="adm-tab${admFilter===t.key?' active':''}" onclick="admFilterLeads('${t.key}')">
      ${t.label}${count > 0 ? `<span class="adm-tab-count">${count}</span>` : ''}
    </button>`;
  }).join('');
}

function admFilterLeads(f) {
  admFilter = f;
  admCloseMenus();
  renderTabs();
  renderLeads();
}

function admCloseMenus() {
  admOpenMenu = null;
  document.querySelectorAll('#page-admin .adm-status-menu').forEach(m => m.remove());
}

function admToggleMenu(id) {
  if (admOpenMenu === id) { admCloseMenus(); return; }
  admCloseMenus();
  admOpenMenu = id;
  const lead = admLeadsList.find(l => l.id === id);
  const wrap = document.getElementById('admActions-' + id);
  if (!wrap) return;
  const menu = document.createElement('div');
  menu.className = 'adm-status-menu';
  menu.style.position = 'absolute';
  menu.innerHTML = admStatusOrder.map(s => `
    <div class="adm-status-opt" onclick="admSetStatus(${id},'${s}')">
      <span style="width:10px;height:10px;border-radius:50%;background:${admStatusCfg[s].color};display:inline-block;"></span>
      <span style="${lead.status===s?'font-weight:700':''};">${admStatusCfg[s].label}</span>
      ${lead.status===s ? '<span style="margin-left:auto;color:#2E8B2E;">✓</span>' : ''}
    </div>`).join('');
  wrap.style.position = 'relative';
  wrap.appendChild(menu);
}

function admSetStatus(id, status) {
  // ===== ОБНОВЛЕНИЕ СТАТУСА В FIREBASE =====
  db.ref('orders/' + id + '/status').set(status)
    .then(() => console.log('✅ Статус обновлён в Firebase'))
    .catch(err => console.error('❌ Ошибка обновления статуса:', err));
  // =========================================
  admLeadsList.find(l => l.id === id).status = status;
  admCloseMenus();
  updateStats();
  renderTabs();
  renderLeads();
}

function renderLeads() {
  const el = document.getElementById('admLeads');
  if (!el) return;
  const filtered = admFilter === 'all' 
    ? admLeadsList.filter(l => l.status !== 'archive')
    : admLeadsList.filter(l => l.status === admFilter);
  if (!filtered.length) {
    el.innerHTML = '<div class="adm-empty">📭 Заявок пока нет.<br><span style="font-size:12px;">Они появятся здесь в реальном времени</span></div>';
    return;
  }
  el.innerHTML = filtered.map(l => {
    const s = admStatusCfg[l.status] || admStatusCfg.new;
    const icon = admServiceIcons[l.service] || '🌿';
    return `
    <div class="adm-card">
      <div class="adm-card-header">
        <span class="adm-badge" style="background:${s.bg};color:${s.color};">${s.label}</span>
        <span class="adm-time">${l.time}</span>
      </div>
      <div class="adm-card-body">
        <div class="adm-card-top">
          <div class="adm-card-icon">${icon}</div>
          <div class="adm-card-service">${l.service}</div>
        </div>
        <div class="adm-card-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ${l.name}
        </div>
        <div class="adm-card-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.29 6.29l1.28-1.28a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          ${l.phone}
        </div>
        <div class="adm-card-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${l.address}
        </div>
        <div class="adm-card-meta">
          <span>📐 ${l.size || l.area || '—'}</span>
          <span>🗓️ ${l.date}</span>
        </div>
        <div class="adm-card-comment">💬 ${l.comment || '—'}</div>
      </div>
      <div class="adm-card-actions" id="admActions-${l.id}">
        <button class="adm-action-btn call" onclick="api.native.openTel('${l.phone.replace(/\s/g,'')}')" >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.29 6.29l1.28-1.28a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          Позвонить
        </button>
        <button class="adm-action-btn wa" onclick="api.native.openWhatsApp('${l.phone.replace(/\D/g,'')}','Здравствуйте ${l.name}! Мы из GreenLine.')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.849L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
        </button>
        <button class="adm-action-btn status" onclick="admToggleMenu(${l.id})">
          ••• Статус
        </button>
      </div>
    </div>`;
  }).join('');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('#page-admin .adm-status-menu') && !e.target.closest('#page-admin .adm-action-btn.status')) {
    admCloseMenus();
  }
});


/* === BLOCK BREAK === */


// AI CHAT
var aiHistory = [];
var aiInited = false;

function openAiChat() {
  document.getElementById('ai-chat-panel').classList.add('open');
  document.getElementById('ai-chat-overlay').classList.add('open');
  if (!aiInited) {
    aiInited = true;
    aiAddMsg('bot', 'Привет! Я помощник GreenLine. Помогу узнать цены, записаться на услугу или ответить на вопрос. Чем могу помочь?');
  }
  setTimeout(function() { document.getElementById('aiInput').focus(); }, 300);
}

function closeAiChat() {
  document.getElementById('ai-chat-panel').classList.remove('open');
  document.getElementById('ai-chat-overlay').classList.remove('open');
}

function aiQuick(text) {
  document.getElementById('aiInput').value = text;
  aiSend();
}

function aiAddMsg(role, text) {
  var el = document.getElementById('aiMessages');
  var div = document.createElement('div');
  div.className = 'ai-msg ' + role;
  div.textContent = text;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function aiShowTyping() {
  var el = document.getElementById('aiMessages');
  var div = document.createElement('div');
  div.className = 'ai-msg typing';
  div.id = 'aiTyping';
  var dots = document.createElement('div');
  dots.className = 'ai-typing-dots';
  dots.innerHTML = '<span></span><span></span><span></span>';
  div.appendChild(dots);
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function aiRemoveTyping() {
  var t = document.getElementById('aiTyping');
  if (t) t.remove();
}

function aiSend() {
  var input = document.getElementById('aiInput');
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  aiAddMsg('user', text);
  aiHistory.push({ role: 'user', content: text });
  document.getElementById('aiQuickBtns').style.display = 'none';
  aiShowTyping();
  setTimeout(function() {
    aiRemoveTyping();
    var reply = aiGetReply(text);
    aiHistory.push({ role: 'assistant', content: reply });
    aiAddMsg('bot', reply);
  }, 700);
}

function aiGetReply(text) {
  var t = text.toLowerCase();
  if (t.indexOf("привет") >= 0 || t.indexOf("здравствуй") >= 0 || t.indexOf("добрый") >= 0) {
    return "Привет! Рад помочь! Я знаю всё о наших услугах и ценах. Спрашивайте!";
  }
  if (t.indexOf("цен") >= 0 || t.indexOf("сколько") >= 0 || t.indexOf("стоит") >= 0 || t.indexOf("прайс") >= 0 || t.indexOf("дорого") >= 0) {
    return "Наши цены: Покос травы - от 3 000 тг/сотка. Стрижка газона - от 4 000 тг/сотка. Вспашка - от 5 000 тг/сотка. Посадка газона - от 8 000 тг/кв.м. Топиарная обрезка - от 5 000 тг.";
  }
  if (t.indexOf("покос") >= 0 || t.indexOf("трав") >= 0 || t.indexOf("триммер") >= 0) {
    return "Покос травы - наша основная услуга! Цена: от 3 000 тг за сотку. Выезжаем по всему Уральску. Работаем Пн-Вс 8:00-20:00. Выберите Покос травы на главной странице чтобы записаться.";
  }
  if (t.indexOf("стрижк") >= 0 || t.indexOf("газон") >= 0) {
    return "Стрижка газона - аккуратная стрижка и поддержание идеальной высоты. Цена: от 4 000 тг/сотка. Выберите услугу на главной странице!";
  }
  if (t.indexOf("вспашк") >= 0 || t.indexOf("мотоблок") >= 0 || t.indexOf("земл") >= 0) {
    return "Вспашка земли мотоблоком - подготовка к посадке. Цена: от 5 000 тг/сотка. Выберите Вспашка на главной странице!";
  }
  if (t.indexOf("посадк") >= 0 || t.indexOf("дерев") >= 0 || t.indexOf("куст") >= 0) {
    return "Посадка газона - от 8 000 тг/кв.м. Посадка растений - от 2 000 тг/шт. Выберите нужную услугу на главной странице!";
  }
  if (t.indexOf("обрезк") >= 0 || t.indexOf("топиар") >= 0) {
    return "Топиарная обрезка - формирование и декоративная стрижка кустарников. Цена: от 5 000 тг. Выберите услугу на главной!";
  }
  if (t.indexOf("записат") >= 0 || t.indexOf("заказат") >= 0 || t.indexOf("оформ") >= 0 || t.indexOf("как") >= 0) {
    return "Записаться просто! 1. Выберите услугу на главной. 2. Укажите адрес. 3. Выберите дату. 4. Оставьте контакты. 5. Нажмите Узнать стоимость. Мы перезвоним за 15 минут!";
  }
  if (t.indexOf("услуг") >= 0 || t.indexOf("чем занимает") >= 0) {
    return "Наши услуги: Покос травы, Стрижка газона, Вспашка земли, Посадка газона, Посадка растений, Топиарная обрезка. Выберите на главной странице!";
  }
  if (t.indexOf("работает") >= 0 || t.indexOf("режим") >= 0 || t.indexOf("когда") >= 0 || t.indexOf("время") >= 0) {
    return "Режим работы: Пн-Вс 8:00-20:00. Работаем без выходных по всему Уральску!";
  }
  if (t.indexOf("район") >= 0 || t.indexOf("куда") >= 0 || t.indexOf("выезжает") >= 0 || t.indexOf("приедет") >= 0) {
    return "Выезжаем по всему Уральску и пригороду! Центр, Зачаганск, дачные массивы - везде приедем. Укажите адрес при оформлении заявки.";
  }
  if (t.indexOf("телефон") >= 0 || t.indexOf("номер") >= 0 || t.indexOf("контакт") >= 0) {
    return "Связаться с нами: WhatsApp +7 700 000 00 00. Отвечаем быстро!";
  }
  if (t.indexOf("скидк") >= 0 || t.indexOf("акция") >= 0) {
    return "При первом заказе - скидка 10%! При регулярном обслуживании - специальная цена. Уточняйте у менеджера!";
  }
  if (t.indexOf("оплат") >= 0 || t.indexOf("kaspi") >= 0 || t.indexOf("каспи") >= 0 || t.indexOf("наличн") >= 0) {
    return "Принимаем оплату: Kaspi перевод и наличные. Оплата после выполнения работы!";
  }
  if (t.indexOf("спасибо") >= 0 || t.indexOf("рахмет") >= 0) {
    return "Пожалуйста! Рады помочь. Есть ещё вопросы - спрашивайте!";
  }
  if (t.indexOf("гарантия") >= 0 || t.indexOf("качеств") >= 0) {
    return "Гарантируем качество! Профессиональное оборудование, опытные мастера. Если не понравится - бесплатно переделаем!";
  }
  return "Уточните пожалуйста: вас интересует цена, запись или информация об услугах? Спрашивайте - отвечу подробно!";
}


/* ============================================================
   HOME — SCHEDULE / DISCOUNT TIMER / GALLERY (UX v3)
   ============================================================ */

// --- Schedule data (mocked; backend integration в этапе 2) ---
function getScheduleForNextDays(days) {
  const out = [];
  const now = new Date();
  // День начинается с сегодняшнего; первая дата может быть с меньшим количеством слотов
  const dayNames = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const totalSlotsPerDay = 6;
  // Псевдо-распределение: воскресенье полное, среда мало, остальные — свободно
  for (let i = 0; i < days; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const dow = d.getDay();
    let booked;
    if (dow === 0) booked = totalSlotsPerDay; // Вс — полный
    else if (dow === 3 || dow === 5) booked = 4 + (i % 2); // Ср, Пт — мало
    else booked = Math.max(0, (i + dow) % 4);
    booked = Math.min(booked, totalSlotsPerDay);
    const free = totalSlotsPerDay - booked;
    let status;
    if (free === 0) status = 'full';
    else if (free <= 2) status = 'some';
    else status = 'free';
    out.push({
      date: d,
      dow: dayNames[dow],
      day: d.getDate(),
      free, total: totalSlotsPerDay, status,
      isToday: i === 0
    });
  }
  return out;
}

function renderSchedule() {
  const row = document.getElementById('scheduleRow');
  if (!row) return;
  const days = getScheduleForNextDays(7);
  row.innerHTML = days.map(d => {
    const cls = ['schedule-day'];
    if (d.status === 'some') cls.push('some');
    if (d.status === 'full') cls.push('full');
    if (d.isToday) cls.push('today');
    let label;
    if (d.status === 'full') label = 'Занято';
    else if (d.status === 'some') label = d.free + ' ' + (d.free === 1 ? 'место' : 'места');
    else label = d.free + ' ' + (d.free === 1 ? 'место' : (d.free < 5 ? 'места' : 'мест'));
    const fillPct = Math.round(((d.total - d.free) / d.total) * 100);
    return `
      <button class="${cls.join(' ')}" type="button" data-date="${d.date.toISOString().slice(0,10)}">
        <span class="schedule-day-name">${d.isToday ? 'Сегодня' : d.dow}</span>
        <span class="schedule-day-num">${d.day}</span>
        <div class="schedule-day-bar"><div class="schedule-day-bar-fill" style="width:${fillPct}%"></div></div>
        <span class="schedule-day-status">${label}</span>
      </button>
    `;
  }).join('');
  // Click → открыть оформление заказа с предзаполненной датой (на этапе 2 — реальная логика)
  row.querySelectorAll('.schedule-day').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('full')) return;
      window._preselectedDate = btn.dataset.date;
      if (typeof openOrderPage === 'function') openOrderPage();
      else showPage('order');
    });
  });
}

// --- Personal discount countdown ---
let _discountTimerHandle = null;
function startDiscountTimer() {
  // Дедлайн: до конца сегодняшнего дня (демо). На этапе 2 — данные с бэкенда (per-user).
  let deadline = parseInt(localStorage.getItem('gl_discount_deadline') || '0', 10);
  if (!deadline || deadline < Date.now()) {
    // Если не задан — задаём 23:59 сегодняшнего дня
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 0);
    deadline = end.getTime();
    localStorage.setItem('gl_discount_deadline', String(deadline));
  }
  function tick() {
    const ms = Math.max(0, deadline - Date.now());
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const eH = document.getElementById('dcH');
    const eM = document.getElementById('dcM');
    const eS = document.getElementById('dcS');
    if (eH) eH.textContent = String(h).padStart(2, '0');
    if (eM) eM.textContent = String(m).padStart(2, '0');
    if (eS) eS.textContent = String(s).padStart(2, '0');
  }
  tick();
  if (_discountTimerHandle) clearInterval(_discountTimerHandle);
  _discountTimerHandle = setInterval(tick, 1000);
}

// --- Gallery (page-gallery) ---
// Demo gallery items (placeholder mocks — будут заменены на бэкенд-данные на этапе 2)
const GALLERY_ITEMS = [
  { before: 'img/bfd86991f4.png', after: 'img/8ed73f0d79.png', title: 'Покос',                addr: 'Самал 1',      duration: '1 ч',   filter: 'mow' },
  { before: 'img/4b43bb493b.png', after: 'img/ce6a6b6607.png', title: 'Стрижка газона',       addr: 'Сатпаева 22',  duration: '1,5 ч', filter: 'lawn' },
  { before: 'img/8624433c27.png', after: 'img/0d19d8e209.png', title: 'Топиарная обрезка',    addr: 'Жибек жолы 14', duration: '2 ч',   filter: 'topiary' },
  { before: 'img/c7ea20cb93.png', after: 'img/c300d3358f.png', title: 'Покос триммером',      addr: 'Курмангазы 7', duration: '1,5 ч', filter: 'mow' },
  { before: 'img/8ed73f0d79.png', after: 'img/bfd86991f4.png', title: 'Стрижка газона',       addr: 'Чапаева 19',   duration: '1 ч',   filter: 'lawn' },
  { before: 'img/0d19d8e209.png', after: 'img/4b43bb493b.png', title: 'Посадка газона',       addr: 'Абая 45',      duration: '4 ч',   filter: 'lawn' },
  { before: 'img/c300d3358f.png', after: 'img/c7ea20cb93.png', title: 'Вспашка',              addr: 'Ескелди 8',    duration: '3 ч',   filter: 'till' },
  { before: 'img/ce6a6b6607.png', after: 'img/8624433c27.png', title: 'Посадка растений',     addr: 'Достык 2',     duration: '2,5 ч', filter: 'lawn' },
];

function _galleryRatingStars(n) {
  var out = '';
  for (var i = 0; i < 5; i++) {
    out += '<svg viewBox="0 0 16 16" fill="' + (i < n ? '#FFB020' : 'rgba(180,190,180,0.4)') + '"><path d="M8 1l2 4.7 5 .5-3.7 3.4 1.1 5L8 11.9 3.6 14.6l1.1-5L1 6.2l5-.5z"/></svg>';
  }
  return out;
}

function renderGallery(filter) {
  try {
    var grid = document.getElementById('galleryGrid');
    if (!grid) return;
    filter = filter || 'all';
    var items = (filter === 'all') ? GALLERY_ITEMS : GALLERY_ITEMS.filter(function(it){ return it.filter === filter; });

    if (!items.length) {
      grid.innerHTML = '<div class="gallery-empty"><div class="gallery-empty-icon">📸</div><div class="gallery-empty-title">Пока нет работ</div><div class="gallery-empty-sub">В этой категории работ ещё не было</div></div>';
    } else {
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        html += '<article class="gallery-item">' +
          '<div class="gallery-thumb">' +
            '<div class="gallery-thumb-half">' +
              '<img src="' + it.before + '" alt="До">' +
              '<span class="gallery-thumb-tag">До</span>' +
            '</div>' +
            '<div class="gallery-thumb-half">' +
              '<img src="' + it.after + '" alt="После">' +
              '<span class="gallery-thumb-tag gallery-thumb-tag-after">После</span>' +
            '</div>' +
            '<div class="gallery-thumb-overlay">' +
              '<div class="gallery-overlay-info">' +
                '<div class="gallery-overlay-title">' + it.title + '</div>' +
                '<div class="gallery-overlay-addr">' +
                  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5C5.4 1.5 3.3 3.6 3.3 6.2c0 3.5 4.7 8.3 4.7 8.3s4.7-4.8 4.7-8.3c0-2.6-2.1-4.7-4.7-4.7z"/><circle cx="8" cy="6" r="1.7"/></svg>' +
                  '<span>' + it.addr + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="gallery-overlay-duration">' + it.duration + '</div>' +
            '</div>' +
          '</div>' +
        '</article>';
      }
      grid.innerHTML = html;
    }

    var countEl = document.getElementById('galleryCount');
    if (countEl) countEl.textContent = items.length + ' ' + (items.length === 1 ? 'работа' : (items.length < 5 ? 'работы' : 'работ')) + ' · до и после';
  } catch (err) {
    console.error('renderGallery error:', err);
    var grid2 = document.getElementById('galleryGrid');
    if (grid2) grid2.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#E53935;font-size:13px;">Ошибка загрузки галереи: ' + (err && err.message ? err.message : 'unknown') + '</div>';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  // Initial home render — расписание и таймер
  if (document.getElementById('scheduleRow')) renderSchedule();
  if (document.getElementById('discountTimer')) startDiscountTimer();
  // Gallery initial render + filter handlers
  if (document.getElementById('galleryGrid')) {
    renderGallery('all');
    document.querySelectorAll('.gallery-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gallery-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderGallery(btn.dataset.filter);
      });
    });
  }
});

/* ============================================================
   iOS STATUS BAR — текущее время в десктоп-мокапе
   ============================================================ */
function updateIosStatusTime() {
  const el = document.getElementById('iosStatusTime');
  if (!el) return;
  const d = new Date();
  el.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}
updateIosStatusTime();
// Обновляем раз в минуту (хватает; статус-бар не нужно по-секундно)
setInterval(updateIosStatusTime, 30 * 1000);

/* ============================================================
   ANIMATED COUNTERS — для why-banner stats
   ============================================================ */
function _glAnimateCounter(el, target, divisor, suffix, duration) {
  duration = duration || 1100;
  divisor = divisor || 1;
  suffix = suffix || '';
  var startTime = performance.now();
  function tick(now) {
    var p = Math.min(1, (now - startTime) / duration);
    // ease-out cubic
    var eased = 1 - Math.pow(1 - p, 3);
    var current = target * eased;
    if (divisor > 1) {
      el.textContent = (current / divisor).toFixed(1) + suffix;
    } else {
      el.textContent = Math.round(current) + suffix;
    }
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

let _glCountersAnimated = false;
function runWhyStatsCounters() {
  if (_glCountersAnimated) return;
  var nodes = document.querySelectorAll('#whyStatsBanner [data-counter]');
  if (!nodes.length) return;
  _glCountersAnimated = true;
  nodes.forEach(function(el) {
    var target = parseFloat(el.getAttribute('data-counter')) || 0;
    var divisor = parseFloat(el.getAttribute('data-divisor')) || 1;
    var suffix = el.getAttribute('data-suffix') || '';
    _glAnimateCounter(el, target, divisor, suffix, 1100);
  });
}

// Запуск при первом показе home через IntersectionObserver
(function() {
  function trySetupObserver() {
    var banner = document.getElementById('whyStatsBanner');
    if (!banner || !window.IntersectionObserver) return;
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          runWhyStatsCounters();
          io.disconnect();
        }
      });
    }, { threshold: 0.4 });
    io.observe(banner);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trySetupObserver);
  } else {
    trySetupObserver();
  }
})();

/* ============================================================
   HOME — Floating Action Button (показываем при scrollTop > 200)
   Reveal-анимация теперь чисто CSS, без JS-зависимости.
   ============================================================ */
function _glHomeFab() {
  var fab = document.getElementById('homeFab');
  var scroller = document.getElementById('homeScrollBody');
  if (!fab) return;
  function check() {
    var top = scroller ? scroller.scrollTop : window.scrollY;
    if (top > 200) fab.classList.add('visible');
    else fab.classList.remove('visible');
  }
  if (!fab._glScrollAttached) {
    if (scroller) {
      scroller.addEventListener('scroll', check, { passive: true });
    } else {
      window.addEventListener('scroll', check, { passive: true });
    }
    fab._glScrollAttached = true;
  }
  check();
}

(function setupHomeFab() {
  function run() {
    if (document.getElementById('page-home')) _glHomeFab();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

/* ============================================================
   ORDERS PAGE — Demo active order with cyclable status
   ============================================================ */
// Inline-SVG для каждого статуса (виден внутри 3D-icon на pill).
// Glyph'ы белые, поверх цветного градиента иконки.
var DEMO_ORDER_STATUSES = [
  {
    key: 'processing', text: 'В обработке',
    iconSvg: '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>'
  },
  {
    key: 'confirmed', text: 'Подтверждён',
    iconSvg: '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 4.5"/></svg>'
  },
  {
    key: 'onway', text: 'Мы едем к вам',
    iconSvg: '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11V6a1 1 0 011-1h6v6"/><path d="M9 7h3l2 2.5V11"/><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/></svg>'
  },
  {
    key: 'late', text: 'Опаздываем',
    iconSvg: '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5l6.5 11.5h-13z"/><path d="M8 6v3"/><circle cx="8" cy="11" r="0.6" fill="#fff"/></svg>'
  },
  {
    key: 'cancelled', text: 'Отменён',
    iconSvg: '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/></svg>'
  }
];
var _demoOrderStatusIdx = 0;

function _renderDemoOrderStatus(idx) {
  var s = DEMO_ORDER_STATUSES[idx];
  var pill = document.getElementById('aoStatusPill');
  var icon = document.getElementById('aoStatusIcon');
  if (pill) {
    pill.setAttribute('data-status', s.key);
    var txt = pill.querySelector('.aos-text');
    if (txt) txt.textContent = s.text;
  }
  if (icon) icon.innerHTML = s.iconSvg;
}

/* Заглушка обратного звонка */
function requestCallback() {
  var btn = event && event.currentTarget;
  if (btn) {
    var orig = btn.querySelector('span').textContent;
    btn.querySelector('span').textContent = '✓ Заявка принята';
    btn.disabled = true;
    setTimeout(function(){
      btn.querySelector('span').textContent = orig;
      btn.disabled = false;
    }, 2400);
  }
  // На этапе 2: POST /api/callbacks { orderId, phone }
}

/* Inline editing — карандаш у даты/адреса. В прототипе prompt(),
   в проде → datepicker / map-picker. */
function editOrderField(field) {
  var el, label;
  if (field === 'date') { el = document.getElementById('aoDateValue'); label = 'Дата и время'; }
  else if (field === 'addr') { el = document.getElementById('aoAddrValue'); label = 'Адрес'; }
  else return;
  if (!el) return;
  var current = el.textContent;
  var next = window.prompt('Изменить «' + label + '»:', current);
  if (next === null) return;
  next = next.trim();
  if (!next) return;
  el.textContent = next;
  // На этапе 2: PUT /api/orders/:id { date | addr } → бэкенд → пуш менеджеру
}

function toggleDemoOrder() {
  var card = document.getElementById('demoOrderCard');
  var empty = document.getElementById('emptyOrderCard');
  if (!card || !empty) return;
  var isHidden = (card.style.display === 'none' || !card.style.display);
  if (isHidden) {
    empty.style.display = 'none';
    card.style.display = 'block';
    _demoOrderStatusIdx = 0;
    _renderDemoOrderStatus(_demoOrderStatusIdx);
  } else {
    card.style.display = 'none';
    empty.style.display = 'flex';
  }
}

function cycleDemoStatus() {
  _demoOrderStatusIdx = (_demoOrderStatusIdx + 1) % DEMO_ORDER_STATUSES.length;
  _renderDemoOrderStatus(_demoOrderStatusIdx);
}

function toggleOrderMenu(e) {
  if (e) e.stopPropagation();
  var dd = document.getElementById('orderMenuDropdown');
  if (!dd) return;
  dd.classList.toggle('open');
}

function cancelDemoOrder() {
  // В демо — переключаемся на статус "cancelled" и закрываем меню
  for (var i = 0; i < DEMO_ORDER_STATUSES.length; i++) {
    if (DEMO_ORDER_STATUSES[i].key === 'cancelled') {
      _demoOrderStatusIdx = i;
      _renderDemoOrderStatus(i);
      break;
    }
  }
  var dd = document.getElementById('orderMenuDropdown');
  if (dd) dd.classList.remove('open');
}

// Закрытие dropdown по клику вне
document.addEventListener('click', function(e) {
  var dd = document.getElementById('orderMenuDropdown');
  if (!dd || !dd.classList.contains('open')) return;
  var menu = document.querySelector('.active-order-menu-wrap');
  if (menu && !menu.contains(e.target)) {
    dd.classList.remove('open');
  }
});

/* ============================================================
   ORDER HISTORY — "Заказать снова"
   ============================================================ */
function repeatOrder(serviceName, btn) {
  // На этапе 2: подтянуть прошлые параметры (площадь/адрес) из history-API
  // Сейчас — просто открываем форму заказа с этой услугой
  // Передаём элемент истории как tileEl (для img.src в hero), используем .ohi-photo img
  var tileEl = btn ? btn.closest('.order-history-item') : null;
  var imgWrap = tileEl ? tileEl.querySelector('.ohi-photo') : null;
  if (typeof openServiceDetail === 'function') {
    openServiceDetail(serviceName, imgWrap, 'orders');
  }
}

