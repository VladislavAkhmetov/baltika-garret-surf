# Персонаж и хват кружки, v3

Демка использует исправленный спрайт со взрослыми пропорциями. Корпус кружки расположен слева от правой кисти, ручка справа. Кисть перекрывает ручку. Кружка остаётся крупной и вращается вокруг места хвата.

## Материалы

- `assets/comics/hero-rear-grip-v3-reference.png` — согласованный визуальный эскиз с кружкой.
- `assets/comics/hero-rear-grip-v3.png` — отдельный слой персонажа, подготовленный встроенным ImageGen из согласованного эскиза.
- `assets/comics/mug-paper-frame.png` — исходная рамка стекла. При отрисовке она зеркально разворачивается для ручки справа.

Персонаж очищается от отдельных фрагментов за пределами связного силуэта при загрузке. Из одного исходного рисунка собираются четыре атласа по восемь поз: обычная стойка, левый и правый поворот, восстановление. Небольшие деформации корпуса и ног оставляют точки опоры стоп неподвижными. Кисть и её угол измеряются тем же преобразованием, что и сам спрайт. Это адаптация одного рисунка, а не новая серия фотографических поз.

Стекло рисуется под слоем персонажа, поэтому пальцы перекрывают ручку. Пиво и пена рисуются динамически внутри маски стекла. `ComicBeerLiquid` и существующие правила пролива, потерь, посадки и HUD используют тот же объект жидкости; на спрайте персонажа пиво не запечено. HUD учитывает положение ручки справа.

## Генерация отдельного слоя

Режим: встроенный ImageGen, прозрачный фон. Вход: согласованный эскиз `hero-rear-grip-v3-reference.png`.

Точный финальный промпт:

> Precise production layer separation of this APPROVED game sprite. Remove ONLY the entire beer mug, its glass, handle, liquid, foam and paper outline. Replace those pixels with genuine alpha transparency. Preserve the entire man EXACTLY as in the reference: same body and head proportions, identical face/hair identity from behind, white tank top, floral green shorts, long adult legs and feet, left arm pose, exact right arm, right wrist and closed gripping hand position and orientation. Keep the right hand CLOSED around an imaginary handle: do not open the fist, do not change the arm pose, do not move the wrist or fingers. Do not redraw or restyle the anatomy or clothing. Where mug overlapped the silhouette of the upper right arm, restore only the tiny missing skin/paper edge needed to complete that arm. Keep the same full-body sprite scale and composition with small transparent margins, no cropping. Clean isolated yellow/red/white stray speckles outside the connected human silhouette, including between legs and around the left arm; keep a consistent thin cream cut-paper outline on the person's outer edge. Output exactly ONE isolated full-body person layer on clean transparent background, with empty transparent space where mug used to be. No mug at all, no beer, no objects, no board, no scene, no labels, no extra poses. This is asset decomposition, not a character redesign.

## Проверка

`npm run test:hero-grip` проверяет связь хвата с ручкой и стоп с доской в 32 позах, движение жидкости, потери при проливе, капли, сброс, четыре размера окна и обе точки входа в демку. Кадры и числовой отчёт сохраняются в `review/comics/hero-grip-v3/`.

При внедрении прошли `test:hero-grip`, `test:airwaves` и `test:prototype`. Проверены мобильные размеры 360×640 и 393×852, десктоп 1240×900 и горизонтальный экран 844×390. Основной прогон дополнительно проверил управление, прыжки, посадки, погоню акулы, HUD, финиш и перезапуск.
