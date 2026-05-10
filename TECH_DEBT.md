# GreenLine Preview — Технический долг

Список вещей, которые сейчас «работают, но не идеально». При появлении ресурсов — закрываем.

---

## 🔴 Логотип временно скрыт

**Состояние:** все вхождения `.gl-leaves` (SVG-обводка двух листьев) скрыты через `display: none` в [css/styles.css](css/styles.css).

**Места где должен быть лого:**
- `page-splash` — большой по центру + белый
- `page-onboarding` — маленький в верхнем углу + белый
- `page-welcome` — рядом с «GreenLine» текстом
- Home weather-card — иконка в плашке рекомендации
- Home hero — декоративный листок после слова «лучшего»

**Что сделать когда получим финальный PNG от пользователя:**
1. Положить файл в `img/logo.png` (прозрачный фон обязательно)
2. В [css/styles.css](css/styles.css) удалить блок `/* === TECH DEBT: лого временно скрыт ===` (там же `display: none` правила)
3. В [index.html](index.html) заменить все `<svg class="gl-leaves">…</svg>` на `<img class="gl-logo" src="img/logo.png" alt="GreenLine">` (5 мест)
4. Добавить CSS: `.gl-logo { width: 100%; height: 100%; object-fit: contain; }`

---

## 🟠 OpenWeather API — ключ в RTDB, не в Cloud Function

**Состояние:** ключ читается из Firebase RTDB (`/config/openweather_key`). Любой кто имеет доступ к БД (test mode = открыт всем) видит ключ.

**Что сделать:**
1. Поднять Cloud Function `getWeather` (нужен Blaze plan)
2. Ключ хранить в env-переменной функции
3. В [js/api.js](js/api.js) `weather.get()` → `fetch(cloud-function-url)`
4. Удалить узел `/config/openweather_key` из RTDB

---

## 🟠 Услуги и баннеры захардкожены, не из Firebase

**Состояние:** В [index.html](index.html) на home — массив из 4 услуг с фото и ценами. Цены из макета, не из БД. Админка `greenline-admin` пишет в localStorage браузера, не в Firebase.

**Что сделать:**
1. В админке (`greenline-admin/src/lib/store.ts`) подменить localStorage-store на Firebase RTDB-store: `db.ref('services').set(...)`
2. В [js/api.js](js/api.js) реализовать `api.services.list()` → `db.ref('services').once('value')`
3. На home заменить захардкоженный markup на render из `await api.services.list()`
4. Тоже самое для banners, texts, pricing

---

## 🟠 Firebase RTDB в test mode (открыта всем)

**Состояние:** RTDB позволяет всем читать и писать без аутентификации (срок 30 дней с момента создания, потом доступ закроется автоматически).

**Что сделать перед запуском первым клиентам:**
1. Открыть Firebase Console → Realtime Database → Rules
2. Закрыть write по правилам:
   - `clients/{phone}` — write только если `auth.token.phone_number == phone`
   - `orders/{id}` — write только authenticated, и только если `data.clientPhone == auth.token.phone_number`
   - `config/*` — read для всех authenticated, write только admin
   - `services/*` — read для всех (даже неаутентифицированных), write только admin

---

## 🟡 Onboarding: только 1 слайд

**Состояние:** В [index.html](index.html) внутри `<div id="page-onboarding">` есть только один `<section class="onb-slide">`.

**Что сделать:**
- Получить от пользователя контент 2-3-4 слайдов
- Скопировать `<section class="onb-slide">` 3 раза, поменять текст внутри `.onb-title` и `.onb-sub`
- Точки и кнопка «Далее/Начать» сами адаптируются под количество слайдов (логика в `_initOnboarding()` в [js/app.js](js/app.js))

---

## 🟡 Inline `onclick` в HTML (105 шт)

**Состояние:** Большинство интерактивных элементов на старых страницах используют `onclick="…"`. Capacitor с дефолтным CSP их пропускает — не блокер.

**Что сделать:** Постепенно при правке экранов мигрировать на `data-action` + делегированный listener (паттерн уже есть в начале [js/app.js](js/app.js)).

---

## 🟡 Капакитор-проект (`app/`) ещё не создан

**Состояние:** Сейчас только веб-версия на GitHub Pages. Capacitor-обёртка для iOS/Android не создавалась.

**Что сделать когда вёрстка стабилизируется:**
1. `npx cap init` в отдельной папке `app/`
2. Установить плагины: `@capacitor/geolocation`, `@capacitor/camera`, `@capacitor/preferences`, `@capacitor/push-notifications`, `@capacitor/app`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/keyboard`
3. Скрипт копирования `dist` → `app/www`
4. Иконки + splash + permissions в Info.plist / AndroidManifest

---

## 🟡 Связки админка ↔ мобилка нет

**Состояние:** Репозитории `greenline-admin` и `greenline-preview` не подключены к одной БД. Admin — на новом Firebase-проекте `greenline-prod-5f1c3`? — нет, admin вообще на localStorage.

**Что сделать:** см. пункт «Услуги и баннеры захардкожены».

---

## 🟢 OpenWeather ключ может быть не активирован (~2 часа после регистрации)

**Состояние:** Это не баг, а timing — новый ключ начинает работать через 1-2 часа.

**Что делать:** Просто подождать. Fallback `23°/солнечно/Уральск` показывается всё это время, пользователь не видит ошибок.
