# Соперники и пляжные трамплины

В основном заезде два соперника нормального масштаба. Первая попытка: Лола с коктейлем и Диего с колонкой. Следующая: Алиса и Миша с Никой на одной широкой доске. Пары чередуются при повторном старте; сброс физики не меняет состав. Колонка Диего играет оригинальный короткий синтезированный мотив в радиусе 42 м, громкость зависит от расстояния; пауза, финиш и отключение звука останавливают музыку.

Четыре боковых трамплина — обломок палубы, улетевший пляжный зонт, спасательная доска и пляжный щит. Все поверхности плоские, с подъёмом наружу и вперёд. Отличаются контур, размеры, фактура и наклон; стрелки есть только на спасательной доске и щите. Контуры, рисунки и физика построены в коде.

Ранний аквабайк на 174 м удалён из основного маршрута и Drive Test; более поздние встречи сохранены. Крышки и монетки не создаются, коллекция в HUD скрыта. Захват волн и очки трюков работают независимо от предметов.

SpeedBlur уже существовал: глубина и положение в кадре ограничивают радиальное размытие дальним планом. В обычном режиме эффект нарастает с 30 до 34,5 м/с, в сложном — с 37 до 41,5 м/с. Герой, ближайшая вода и HTML HUD остаются чёткими. Спокойная камера, reduced motion и пауза отключают эффект. Для него нужна поддержка depth texture.

## Изображения

Четыре финальных PNG с альфа-каналом созданы встроенным imagegen. Оригиналы сохранены; прозрачные поля обрезаются только координатами UV при загрузке. Референс стиля для Лолы, Диего и пары: `paper-comics/assets/comics/hero-trim-rear-v2.png`. Сохранённые ассеты:

- `paper-comics/assets/comics/rival-grandma.png`
- `paper-comics/assets/comics/rival-dj.png`
- `paper-comics/assets/comics/rival-blonde.png`
- `paper-comics/assets/comics/rival-couple.png`

Блондинка изображена в пляжной спортивной футболке и шортах: генератор дважды отклонил вариант в купальнике. Остальные детали состава сохранены.

## Финальные промпты

### grandma

Create ONE full-body game character cutout for a playful seaside surfing game. Match the supplied reference's vintage photographic paper collage: realistic anatomy, warm sunlit photographs, coarse printed grain, a thin irregular cream torn-paper outline. Use the reference only for style and rear surfing viewpoint; do NOT reproduce the reference man or sprite sheet. Single isolated subject, true transparent background, no scenery, no water, no surfboard, no text, no ground shadow. Seen from behind at slight three-quarter angle, facing away and a little to the right, dynamic balanced surfing stance with bent knees, both bare feet fully visible and separated horizontally, all limbs inside the frame. Camera slightly above waist height as in third-person chase game. Character fills frame with modest transparent padding. A finished adult character with crisp readable silhouette at small screen sizes. An extravagant energetic 70-year-old woman with an average adult body, curly silver hair, enormous wide-brim woven beach hat with coral ribbon and a feather, stylish opaque teal ONE-PIECE swimsuit with a subtle floral pattern, chunky bracelets. She confidently balances with her left arm while holding a tall tropical cocktail with a tiny parasol in her right hand. Funny, glamorous, mischievous; rear three-quarter angle revealing a little side profile. Exactly one woman, one hat, one cocktail.

### dj

Create ONE full-body game character cutout for a playful seaside surfing game. Match the supplied reference's vintage photographic paper collage: realistic anatomy, warm sunlit photographs, coarse printed grain, a thin irregular cream torn-paper outline. Use the reference only for style and rear surfing viewpoint; do NOT reproduce the reference man or sprite sheet. Single isolated subject, true transparent background, no scenery, no water, no surfboard, no text, no ground shadow. Seen from behind at slight three-quarter angle, facing away and a little to the right, dynamic balanced surfing stance with bent knees, both bare feet fully visible and separated horizontally, all limbs inside the frame. Camera slightly above waist height as in third-person chase game. Character fills frame with modest transparent padding. A finished adult character with crisp readable silhouette at small screen sizes. A cheerful stylish adult Latino man aged about 30, tan skin, short dark curly hair, coral open short-sleeve tropical shirt, turquoise board shorts. He holds one LARGE portable retro music speaker/boombox tucked in his left arm near his hip, with two dark circular speaker cones and a carrying handle; his right arm stretches outward for balance. Warm friendly beach-party energy. Broad healthy adult proportions, clearly identifiable speaker, exactly one man.

### blonde

ONE isolated full-body fictional ADULT female surfer aged 30, blonde wavy hair in a loose ponytail, natural strong sporty build, wearing a loose coral-red sun-protection sports T-SHIRT and teal opaque knee-length board shorts, turquoise sunglasses. Barefoot with both complete feet visible, knees bent slightly, arms extended for surfing balance. Rear three-quarter view facing away, like a character in a third-person beach sports game. Friendly confident beach energy. Realistic photographic anatomy, vintage sunlit photo-collage print with grain, cream torn-paper contour around the cutout. Neutral sports illustration suitable for a family video game. One character, true transparent background, centered with small padding, no board, no water, no text, no scenery, no shadow, no sprite sheet.

### couple

Create ONE full-body game character cutout for a playful seaside surfing game. Match the supplied reference's vintage photographic paper collage: realistic anatomy, warm sunlit photographs, coarse printed grain, a thin irregular cream torn-paper outline. Use the reference only for style and rear surfing viewpoint; do NOT reproduce the reference man or sprite sheet. Single isolated subject, true transparent background, no scenery, no water, no surfboard, no text, no ground shadow. Seen from behind at slight three-quarter angle, facing away and a little to the right, dynamic balanced surfing stance with bent knees, both bare feet fully visible and separated horizontally, all limbs inside the frame. Camera slightly above waist height as in third-person chase game. Character fills frame with modest transparent padding. A finished adult character with crisp readable silhouette at small screen sizes. A young ADULT couple aged about 27 together in ONE combined cutout designed to stand on ONE wide shared surfboard (but do not draw a board). Man on the LEFT, short and overweight, nerdy IT guy with black glasses visible in slight side profile, short dark hair, yellow graphic-free T-shirt and navy swim shorts. Woman on the RIGHT, noticeably taller with long legs, long flowing brunette hair, opaque emerald one-piece swimsuit. Both are full-body barefoot in gently bent-knee surfing stances, close together, their nearest hands holding each other and outside arms balancing. Show ALL FOUR feet near the same bottom baseline, unobstructed and spaced within the combined figure's width. Warm affectionate comic energy, exactly two adults, realistic proportions, wide landscape silhouette rather than stacked characters.

