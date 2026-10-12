# Базовая стойка и хват, v6

Базовый образ на согласовании: реалистичный серфер с вытянутой левой рукой из выбранного пользователем первого варианта. Отдельные спрайты поворотов и трюков ещё не создаются.

## Материалы

- `assets/comics/hero-rear-grip-v6.png` — слой персонажа, 1133 × 1388, исходное естественное положение передней ноги. Локальный поворот одной стопы, который нарушал анатомию, не используется.
- `assets/comics/hero-base-v6-review.png` — иллюстрация базовой стойки с доской и кружкой для визуального согласования; это не игровая текстура жидкости.

Персонаж взят из первого реалистичного варианта: `exec-d4c82d68-708f-48c8-a83d-4d37a2f87f3c.png`. Доска в игре подбирает угол под проекцию стойки. Опорные точки исходного слоя: передняя `[540,1129]`, задняя `[840,1318]`. Существующая процедурная анимация сохраняется как временная; область обеих стоп исключена из деформации. Новых рисованных поз для неё нет.

Кружка остаётся отдельным объектом: стекло слева от правой кисти, ручка справа, кисть поверх ручки. Пиво, пена и пролив используют существующую физику. Привязка перенесена на точку кисти `[916,210]` нового слоя. Раздельные фрагменты за силуэтом очищаются существующим кодом при загрузке.

## Генерация

Встроенный ImageGen. Первый вход — приложенный пользователем фотографический коллаж `codex-clipboard-137cc87a-5dc7-4b39-8286-40ced514c66c.png`, второй — предыдущий слой v5 только как ориентир композиции. Промпт выбранного слоя:

```text
Use case: identity-preserve / precise-object-edit.
Create ONE corrected production game character sprite on genuine transparent alpha.

IMAGE ROLES:
Image 1 (surfer in the yellow/blue collage) is the PRIMARY reference: match the REAL HUMAN ANATOMY, believable photographic skin, relaxed wet clothes, dark damp wavy hair, natural proportions and photographic cut-paper style of the MAN in this image. Use the man only.
Image 2 (isolated previous sprite) is ONLY a secondary guide for the game's rear-facing standing surfing pose, approximate full-body framing, two separated bare feet and raised right hand. Its anatomy and artificial skin rendering need correction. Do not copy its overlong arms, bulky muscles, shiny orange plastic skin, geometric crackle skin texture, dense artificial ringlets or stray red/yellow fragments.

SUBJECT / PHOTOREALISM:
An ordinary adult male recreational surfer viewed from behind, with natural human proportions and ordinary moderate muscle tone, closely matching the believable man in Image 1. Real photographic skin with subtle pores, slight uneven tan, gentle wet sheen and soft realistic shadows. Natural damp dark-brown wavy/curly hair like Image 1, with irregular wet clumps and a few loose strands, not a sculpted mass of metallic curls. This must feel like a cutout from an actual photograph, with the restrained warm vintage grading and thin off-white paper-cut edge of Image 1. No 3D-rendered toy appearance, no orange lacquer skin, no polygon facets or crackle texture on skin, no bodybuilding definition.

ANATOMY AND POSE:
Correct the upper limbs deliberately. Both upper arms and forearms must be noticeably shorter and proportionate to the torso and adult leg length, roughly 15–20% less extended than Image 2, with plausible shoulder–elbow–wrist relationships, natural-sized hands and correct foreshortening. Use Image 1 as the anatomical standard. The left arm reaches diagonally down and outward for balance; its hand is closer to the torso and higher than the oversized reach in Image 2. The right upper arm extends moderately outward, elbow bent about 90 degrees, forearm raised naturally and the right hand at about shoulder/head height. Move the elbow and gripping hand closer to the shoulder as necessary to correct the arm length. Do NOT preserve Image 2's wrist location at the cost of overlong arms: the game attachment will be updated to the new hand position.
The RIGHT HAND forms a natural closed grip around an imaginary vertical mug-handle bar, viewed from behind: back of the right hand facing the viewer, thumb wrapped over the index finger, bent fingers visible at the left side of the fist. A large mug will be rendered separately to the LEFT of this fist; allow clear room for it beside the head. Do not draw the mug or its handle. The grip must read as a real person holding a handle, not a gesture or clenched raised fighting fist.
Keep a believable bent-knee surfing stance with normal adult thigh/shin length and lean ordinary calves. Keep the current long-legged adult proportions, normal pelvis and torso, compact normal-sized bare feet. Do not solve the arm proportion problem by shortening the legs or shrinking the whole body. Maintain the two feet approximately where they are in Image 2, with their heels and ground contact heights stable, and keep the torso position broadly stable. Natural joints, five fingers and five toes where visible, no distorted shoulders or impossibly twisted wrists.

CLOTHING:
As in Image 1, a relaxed damp WHITE TANK TOP with soft cloth drape, broad natural folds and uneven subtly water-darkened areas. Green surfer board shorts with muted yellow botanical/floral print, roomy relaxed cut with wide leg openings, ending just above the knees as requested in the previous revision. Shorts look wet and weighted, not inflated or skin-tight. Use realistic textile rather than engraved or synthetic texture.

OUTPUT:
One complete isolated person only. Preserve approximately the 1133 x 1388 portrait canvas composition of Image 2 with small clear transparent margins, both feet and head fully visible. Genuine clean alpha transparency around the man and between limbs; no detached colored debris or painted background. Thin consistent off-white cut-paper edge. No mug, beer, glass, surfboard, wave, water, splashes around the silhouette, crab, scenery, UI, labels or comparison panels. Prioritize anatomical plausibility and the photographic realism of Image 1 over fidelity to the flawed anatomy/style of Image 2.
```

Промпт иллюстрации стойки с доской и кружкой:

```text
Create ONE anatomically correct base-pose review image for this surfer game, on a clean transparent background: the man STANDING ON HIS SURFBOARD and naturally HOLDING A LARGE BEER MUG.

Image 1 is the approved man: preserve his realistic photographic identity, ordinary adult build, wet dark wavy hair, loose wet white tank top, roomy green botanical board shorts and the extended LEFT arm balancing outward. Keep his forward body lean and rear three-quarter view. The left arm length is approved; do not shorten it.
Image 2 supplies ONLY the blue surfboard with cream center stripe and paper edges.
Image 3 supplies ONLY the approved mug grip relationship and large mug size: the glass body sits to the LEFT of the right fist, handle on the RIGHT of the glass, fingers closed naturally around the handle, back of the right hand visible. Do not copy Image 3's man, exaggerated muscles or artificial skin.

CRITICAL: solve the ENTIRE LOWER-BODY stance coherently, from pelvis through hips, femurs, knees, shins, ankles and feet. Do not rotate an isolated foot while freezing its knee and hip. You may reposition and rotate both legs and the pelvis as a connected anatomical system. Use a natural balanced surfing stance photographed from behind and slightly above: feet separated along the board, front foot near the middle and rear foot nearer the tail; comfortable flexed knees; body weight supported between the feet; ordinary adult leg lengths. Front knee tracks naturally over the front foot, rear knee tracks naturally over the rear foot. Ankle joints have believable neutral alignment. Both bare feet make full believable sole contact with the SAME board deck plane. Show the board beneath them so the support and perspective are unambiguous. The feet can have different visible foreshortening and angles because of perspective; do not force two parallel feet in image space. No sideways bent shins, no reversed knees, no twisted ankle, no detached feet, no broken leg, no tiptoe pose, no shortened or muscular bodybuilder legs. Preserve the ordinary person's proportions and the forward-leaning balancing gesture of Image 1.

Render the whole blue-and-cream surfboard in perspective extending away beneath him. It must be wide enough to support the feet and long enough for a normal surfing stance, with its nose away and tail toward the viewer. Do not bend or wrap the board around the feet.

MUG: one oversized transparent cylindrical glass beer mug in the raised right hand, approximately 1.4–1.6 head heights tall. The thumb and fingers genuinely wrap the vertical outer handle bar, with convincing overlap and contact. The wrist continues naturally from the forearm. A naturally bent elbow supports the weight. Keep the mug beside the head with a small clear gap, avoiding penetration into the head or shoulder. Amber beer around 75% full, white foam, visible empty glass above it. Glass body left of the fist and handle right, as Image 3. Natural light and coherent perspective.

Same photographic realism as Image 1, restrained warm vintage grading, subtle natural wet skin and textile, thin cream cut-paper edge. One complete person, one mug, one board only; all fully visible. Portrait composition with clear margins. Clean genuine alpha transparency, no sea, scenery, UI, text, detached red/yellow fragments or multiple poses. This is a single coherent pose for review, not a sprite sheet.
```

## Проверка

`npm run test:hero-grip` проверяет обе опоры внутри проекции доски, связь ручки с кистью, динамику жидкости, пролив, сброс и размеры экрана. Проверяются существующие 32 состояния процедурной анимации одного исходного слоя. Крупный план базовой стойки, игровые кадры и отчёт сохраняются в `review/comics/hero-grip-v6/`.
