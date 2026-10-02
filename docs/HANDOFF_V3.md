# HANDOFF v3 — переход на свободное управление (для Antigravity)

Читать вместе с `docs/CONTROLS_SANDBOX_SPEC.md` (что строим) — этот файл говорит **где и как** менять код.
`docs/LEVEL1_SPEC.md` §3.4 и §5.3 (полосы, «гироскоп только для баланса») — **отменены**. Фазы 4+ не начинать.

## Главные правила
1. **`index.html` и текущий игровой флоу не ломать.** Всё новое — в `sandbox.html` и новых файлах. Миграция игры — отдельный шаг (§9), только после утверждения пресета заказчиком.
2. Код полос/свайпов **не удалять**, а отключать флагами — до миграции.
3. Ось X: камера смотрит в +Z, поэтому **+X мира = лево экрана**. В `CONTROLS_SANDBOX_SPEC.md` координата `x` — экранная (0 = карман слева, 16 = плечо справа). Перевод в мир строго в одном месте: `worldX = −x` (функция `toWorldX` в `surf-physics.js`). Нигде больше знак не крутить.
4. Все константы — в `CFG.surf` / `CFG.peel` и на панели тюнинга.

## 0. Бэкап
Коммит/тег `v2-lanes` (или копия `js/`, `index.html`, `css/` в `legacy/v2-lanes/`).

## 1. Что из текущего кода переиспользуем

| Файл | Решение | Детали |
|---|---|---|
| `js/mug.js` | **Оставить как есть** | `MugLiquid.update(dt, ax, ay, tilt)`, `applyLandingImpulse(clean)`, `applyStumbleImpulse()`, `MugRenderer.render(mug, dt, mugTilt)`. Интерфейс не менять |
| `js/balance.js` | **Доработать** (§4) | Машинерия источников (`acquireSource`, `evaluateSource`, `addWave`, `addWake`, `onHit`, `onSeagull`, `enterBarrel`) остаётся. Меняется формула `mugTilt` |
| `js/ocean.js` | **Доработать флагами** (§5) | Вода, дальний океан, горизонт, `getSurfaceInfo` остаются. Разделители полос и левые «ступени» — выключаемые |
| `js/input.js` | **Не трогать** | Остаётся для `index.html`. Из него **скопировать** в новый файл `startCalibration()` и `onDeviceOrientation()` (калибровка, iOS-permission, `screen.orientation.angle`) |
| `js/game.js` | **Не трогать** | Для песочницы — отдельный оркестратор `js/sandbox-game.js`. Можно копировать `initThree()`, свет, рендер-цикл, paper boil |
| `js/models.js`, `js/entities.js` | Переиспользовать | Сёрфер-риг, буйки, трамплины |
| `js/spawner.js`, `js/level1.js`, `js/fx.js`, `js/rivals.js`, `js/events.js`, `js/meta.js` | **Не подключать** в песочнице | Будут переписаны после утверждения управления |

## 2. `js/config.js` — добавить
- `CFG.surf` — все параметры из таблицы §6 `CONTROLS_SANDBOX_SPEC.md` (имена 1:1) + `baseSpeedStart 26`, `baseSpeedMax 34`, `speedResponse 1.5`, `pumpDecay 0.6`, `pumpMax 8`, `headingAx 0.15`, `minHoldForJump 0.12`, `rampJumpMult 1.6`, `lipJumpMult 1.4`, `trackMinX −5`, `trackMaxX 16`, `pocketWidth 4`.
- `CFG.peel` — `H 3.2`, `faceFromX −6`, `faceToX 4`, `lipX −5`, `lipThrowEvery [6, 10]`, `lipThrowLen 12`, `lipThrowWarn 1.2`, `lipThrowZoneX 1`.
- `CFG.balance.model: 'jerk'` (новое) | `'tilt'` (старое v2). По умолчанию `'jerk'` только в песочнице: `sandbox-game.js` выставляет его при старте.
- `CFG.ocean.showLaneDividers` (true), `CFG.ocean.showLeftSteps` (true), `CFG.ocean.waterCenterX` (0), `CFG.ocean.width` (оставить 14) — песочница переопределяет.

## 3. Новые файлы

### `js/control-input.js` → класс `ControlInput`
Спека: §3 `CONTROLS_SANDBOX_SPEC.md`. Выход `{ lean, hold, holdTime, released, mode }`.
- Гироскоп: калибровка (скопировать из `input.js`), `lean` по формуле с `leanRange/leanCurve/leanAlpha/leanDeadzone`. **Без** магнитов, полос, свайпов.
- Палец: `pointerdown` где угодно (кроме ⚙ и панели) → `hold=true`; `pointerup` → `released=true` на один кадр + `holdTime`. Метод `consumeRelease()`.
- Фолбэк без гироскопа: левая половина — drag = `lean` (`dx/80px`), правая — hold/release. Призрачные подписи «◀ НАКЛОН ▶» / «ДЕРЖИ — ПРИСЕД, ОТПУСТИ — ПРЫЖОК» при первом запуске (Caveat, 26px, opacity 0.7, исчезают после 3 использований).
- Клавиатура: ←/→ — `lean` с набором за 0.25 с, Пробел — hold/release.
- `?input=gyro|drag|keys` — принудительный режим.

### `js/surf-physics.js` → класс `SurfPhysics`
Спека: §4 и §5 `CONTROLS_SANDBOX_SPEC.md`, формулы 1:1. Шаг 1/120 с (накопитель).
- `update(dt, input, surface /*{height, slope, inPocket, dhdz}*/, disturbances)`.
- Выдаёт: `state {x, z, worldX, y, heading, speed, roll, airborne, spin, crouch, pose}` и **для кружки** `{ jerkTilt, ax, ay }`.
- `jerkTilt`: `leanAngle = lean·28°`, `leanSmooth` — экспоненциальный low-pass с `sloshTau`, `jerkTilt = (leanAngle − leanSmooth)·jerkGain`.
- События (колбэки): `onJump(mult)`, `onLand(clean, spinDeg)`, `onStumble(reason)`, `onPumpGood()`, `onPumpBad()`.
- Позы: `norma`, `turn` (зеркалить по знаку `lean`), `crouch` (пока `hold` на воде), `jump`, `grab` (`hold` в воздухе). Нет спрайтов `crouch/grab` — временно `jump` с масштабом Y 0.85.

### `js/peel-wave.js` → класс `PeelingWave`
Спека: §2.1. Отдельный меш склона слева (в мире — при `worldX > 0`), бумажные слои + белая кромка гребня, пена позади точки ломки.
- `getSurface(x, z) → { height, slope, inPocket, dhdz }` — **единая функция поверхности** для песочницы: внутри складывает `ocean.getSurfaceInfo()` + склон волны + зыбь зоны 300–550 м.
- `update(dt, playerZ, playerSpeed)`: точка ломки (`peelSpeed`), выбросы губы с предупреждением (тень + звук), проверка «накрыло» → колбэк `onWipe()`.
- Включена только в зоне «Волна» цикла (0–300 м), плавно поднимается/опускается за 30 м.

### `js/tuning-panel.js` → `TuningPanel`
Спека: §6. Ползунки пишут прямо в `CFG.surf.*` / `CFG.balance.*`. Пресеты A/B/C — `localStorage` `garret_sandbox_presets`. «Копировать JSON» — `navigator.clipboard.writeText` (фолбэк — `<textarea>` с выделением). Пауза игры, пока панель открыта.

### `js/sandbox-game.js` → `SandboxGame`
- Сцена: копия `initThree()` из `game.js`. `CFG.ocean.showLaneDividers=false`, `showLeftSteps=false`, `width=30`, `waterCenterX` так, чтобы вода покрывала `worldX ∈ [−18, +8]`.
- Цикл 900 м, зоны и телепорт — §2 спеки. Буйки/трамплины — `entities.js`, расставить статично по циклу (не через спавнер).
- Бот-соперник: спрайт сёрфера с тинтом, держит `x = 2` (карман) со скоростью `baseSpeed·1.0`, стартует за 20 м впереди в зоне «Соперник»; кильватер 10 м → `balance.addWake()`; столкновение → `balance.onHit()` + спотыкание.
- **Камера (free-roam):**
  - позиция = `(worldX − 1.2, y + 3.2, z − 6.5)` (сдвиг вправо по экрану, чтобы видеть склон слева), lerp `1 − exp(−8·dt)` по X/Y, Z — жёстко;
  - взгляд = `(worldX + 0.8 − sin(heading)·4, y + 0.6, z + 14)` — смотрит чуть в сторону поворота;
  - крен камеры = `roll · 0.15`, клэмп ±5°; FOV `58 + (speed − 26)·0.7`.
- HUD: только HUD-кружка (`MugRenderer`), телеметрия (§7 спеки), ⚙. Старые HUD-плашки не показывать.
- Флоу песочницы: экран «Нажми, чтобы начать» → калибровка 3-2-1 → езда. Падение → респаун через 1 с на том же месте цикла, пиво 100%.

## 4. `js/balance.js` — правки
- В `update(dt, playerZ, playerSpeed, tiltInput)`:
  - `CFG.balance.model === 'jerk'`: `mugTilt = tiltInput /*jerkTilt*/ + worldRoll·(1 − assist)`.
  - `'tilt'`: старая формула v2 (не трогать).
- `onLaneChange()` и `checkWaiterBonus()` в режиме `'jerk'` — не вызываются (песочница их не дёргает). Не удалять.
- Новый источник `faceChop`: шум ±`chopPocket`·`inPocket`, 4 Гц, активен пока `inPocket > 0` (обновлять силу каждый кадр, а не создавать новый источник).
- Новый источник `swellBump` ±2° на гребнях зыби.
- `initLevelEvents()` (расписание волн уровня) в песочнице не вызывать.
- `assist` в песочнице берётся из ползунка, а не из флага первого заезда.

## 5. `js/ocean.js` — правки
- `initLaneDividers()` — выполнять только при `CFG.ocean.showLaneDividers`; в `update()` пропускать разделители, если их нет.
- `initLeftSideDecor()` — ступени только при `CFG.ocean.showLeftSteps`; городок на скале оставить всегда.
- Плоскость воды: ширина `CFG.ocean.width`, центр `CFG.ocean.waterCenterX`; `segX` пересчитать, чтобы шаг сетки ≤ 0.6 м.
- `setTilt()` / `calcTiltH()` (наклон воды от волн v2) в песочнице не использовать.

## 6. `sandbox.html`
Порядок скриптов: `three.min.js, sprites-data, config, audio, ocean, entities, models, mug, balance, control-input, peel-wave, surf-physics, tuning-panel, sandbox-game`. Тот же `css/style.css` + небольшой `<style>` для панели и телеметрии. Подключить шрифты как в `index.html`.

## 7. Тест и отчёт
- `scripts/test_sandbox.js` (по образцу `test_game.js`): открыть `sandbox.html?input=keys`, проехать каждую зону, скриншоты в `review/sandbox/`: волна (в кармане), зыбь, трамплин в воздухе, кильватер за ботом, открытая панель тюнинга. Ноль ошибок консоли.
- Запуск на телефоне по HTTPS — дописать в `docs/DEV.md`.
- Отчёт: что сделано; что отклонилось от спеки; JSON пресета по умолчанию; видео 30 с **с реального телефона** (карман, накачка, прыжок с трюком, кильватер).

## 8. Чего НЕ делать
- Не менять `index.html`, `game.js`, `input.js`, `level1.js`, `spawner.js`.
- Не делать стоп-кадры, меню, мету, спрайты.
- Не «улучшать» формулы — только ползунки. Идеи — в раздел «предложения» отчёта.

## 9. После утверждения пресета (НЕ сейчас — ждать отдельное ТЗ)
Перенос в игру: `ControlInput` + `SurfPhysics` + `PeelingWave` заменят полосы в `game.js`; `level1.js` перейдёт с 3-символьных паттернов на свободные координаты `x`; флоу «меню → калибровка → интро → заезд» получит новые подсказки обучения. ТЗ на это пришлёт арт-директор.
