# Серфер с обычным телосложением, v5

Демка использует `assets/comics/hero-rear-grip-v5.png`: один слой персонажа с прозрачностью, 1133 × 1388. Предыдущая версия `hero-rear-grip-v4.png` сохранена.

Зелёные шорты с жёлтыми цветами удлинены до чуть выше колен, стали шире и свободнее у краёв. Объём и рельеф мышц ног смягчены. Обе стопы немного укорочены. Сохранены длина ног, положение суставов, поза, мокрая майка и волосы, правая кисть и хват. Кружка остаётся отдельным динамическим объектом.

Точки опоры уточнены по нижнему краю стоп на новом PNG: `[470,1240]` и `[835,1343]` в исходных пикселях. Хват `[1000,223]` сохранён. Точки преобразуются тем же способом, что и спрайт во всех 32 позах. Существующая очистка прозрачности при загрузке убирает отдельные цветные фрагменты вне связного силуэта.

## Генерация

Встроенный ImageGen, редактирование с прозрачным фоном. Вход: `hero-rear-grip-v4.png`. Финальный оригинал: `C:/Users/amazi/.codex/generated_images/01a129d7-73bc-7950-b297-7b273bfc5185/exec-aacced00-f667-4c06-a4f9-cbdadd4fc3c1.png`. В проект скопирован тот же PNG.

Точный промпт:

```text
Use case: precise-object-edit / identity-preserve.
Asset type: one isolated full-body rear-view game sprite on genuine transparent alpha.
Edit target: the attached existing hero-rear-grip-v4 sprite. Make ONLY these requested changes to shorts, leg build and foot length.

SHORTS: extend the same dark green board shorts with yellow flowers down to JUST ABOVE THE KNEES, a visibly longer classic relaxed surfer board-short length. Keep the waistband at precisely the same height, same hips, same yellow floral print identity and same green palette. Make the shorts visibly WIDER and LOOSER as clothing: roomy thighs, freely hanging leg openings, broad weighted folds, natural fabric drape around the bent legs. Keep the pelvis and body width unchanged; the extra width is fabric ease. Hem follows the two different thigh angles naturally, without hiding the knee joint, without dropping the crotch. Keep the soaked dark-green patches and restrained damp highlights from the current sprite. The shorts should read as wet loose board shorts rather than fitted gym shorts.

LEGS: turn the currently bulky muscular thighs and calves into the legs of an ORDINARY adult guy who surfs casually. Reduce thigh/calf muscle bulk modestly but clearly, especially the bulging calves. Make the surface and shading smoother with less sharply separated muscles and tendons, no bodybuilding definition or pronounced veins. Keep natural healthy soft tissue and normal adult knee/ankle proportions, not skinny frail legs. Preserve the EXACT femur and tibia lengths, pelvis height, knee locations, ankle locations, stance and adult long-legged proportions. Do not shorten the legs, squat the torso downward, enlarge the head, or make the character stocky. Moist skin and the warm paper-collage finish remain, but use restrained wet sheen instead of exaggerating sculpted muscle highlights.

FEET: shorten BOTH bare feet by a SMALL amount, approximately 12–15 percent of heel-to-toe length, mostly by drawing the forefoot/toes closer to the heel. Keep five normal toes per foot, natural proportion and the same orientations. Preserve both heels and ankle locations, preserve the height of the bottoms of the soles and their contact with the imaginary surfboard. Do not move either leg or change their stance, do not make tiny cartoon feet. The right horizontal foot should be less elongated and the smaller left foot should be proportionally shortened too.

LOCK EVERYTHING ELSE: exact same man, rear camera view, head size, dark wet curly hair, neck, shoulders, arms, torso length, loose damp white tank top, right closed gripping fist, wrist position and orientation, left balancing arm. The right hand must stay fixed because the separately rendered mug attaches there. Keep all these pixel positions and the original 1133 x 1388 canvas framing, figure scale and transparent margins as closely as possible. Keep the complete head and both feet visible, same cream cut-paper outer edge and vintage photographic collage style. Do not add a mug, glass, beer, surfboard, crab, background, scene, labels, extra poses or objects. Clean true transparency between limbs and outside the person, no detached red/yellow speckles. One finished production sprite, not a comparison.
```

## Проверка

`npm run test:hero-grip` проверяет связь стоп с доской и кисти с ручкой в 32 позах, движение жидкости, потери и капли при проливе, сброс, четыре размера окна и обе страницы демки. Кадры и отчёт сохраняются в `review/comics/hero-grip-v5/`. Для визуальной проверки выбран участок после флага, чтобы он не закрывал одежду и ноги.
