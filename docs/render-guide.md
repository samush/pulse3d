# Стайлгайд агента: фотореалистичные визуализации квартиры на базе Gemini (Nano Banana)

Документ предназначен для агента, который принимает скриншот простой 3D-сцены (геометрия комнаты + условные боксы мебели) и через Gemini API превращает его в фотореалистичную визуализацию конкретного ракурса — сохраняя планировку и пропорции, но добавляя реалистичные материалы, свет и детали обстановки.

---

## 1. Модель и технические параметры API

Актуальное поколение image-моделей Gemini — **Gemini 3 Pro Image (Nano Banana Pro)** и **Gemini 3.1 Flash Image (Nano Banana 2)** ([Google Cloud, «The ultimate Nano Banana prompting guide»](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)).

| Параметр | Значение |
|---|---|
| Модель для финальных, максимально реалистичных кадров | **Nano Banana Pro** — премиальное качество, лучше держит фотореализм и материалы |
| Модель для быстрых черновиков/перебора вариантов | **Nano Banana 2** — быстрее, дешевле, используйте для итераций по композиции/стилю до финального рендера |
| Референсные изображения на один запрос | до 14, но для контроля держите 1–3: 1 геометрический якорь + 1–2 стилевых референса ([Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)) |
| Форматы входных изображений | PNG, JPEG, WEBP, HEIC, HEIF |
| Разрешение вывода | 1K / 2K / 4K — для финалов берите 2K–4K |
| Соотношение сторон | задаётся `image_config.aspect_ratio`; поддерживаются 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 |
| `temperature` | оставляйте **1.0** (значение по умолчанию) — для моделей семейства Gemini 3 тюнинг температуры не рекомендован и не улучшает результат ([Google AI for Developers, Gemini 3 guide](https://ai.google.dev/gemini-api/docs/gemini-3)) |
| Watermark/метаданные | все выходные изображения промаркированы SynthID и содержат C2PA Content Credentials — учтите это, если рендеры пойдут в презентацию заказчику |

Важный нюанс поведения модели: **при редактировании изображение обычно наследует соотношение сторон входного файла**, а если подаётся несколько референсов с разными пропорциями — модель ориентируется на **последнее** изображение в запросе ([Google Developers Blog](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/)). Поэтому:
- Геометрический референс (скриншот 3D-сцены) всегда должен идти **последним** в списке изображений, если хотите, чтобы итоговый кадр унаследовал именно его пропорции.
- Если поведение всё равно «плывёт», явно прописывайте в тексте: *«Do not change the input aspect ratio»*.

---

## 2. Архитектура промпта: три слоя

1. **System-инструкция агента (константа, не меняется между запросами)** — роль, жёсткие правила «что сохранять», словарь стиля/материалов квартиры (см. §6), формат вывода.
2. **Референсные изображения:**
   - **Геометрический якорь** — скриншот 3D-сцены этого ракурса (обязателен, один и тот же кадр, без сжатия/пересжатия).
   - **Стилевые референсы (опционально)** — фото материалов/мебели/атмосферы, которые агент хочет перенести (текстура паркета, конкретный диван и т.п.). Явно называйте роль каждого референса в тексте промпта.
3. **Per-shot инструкция (меняется под конкретный кадр)** — что именно должно появиться/обновиться в этом ракурсе.

Такое разделение отражает официальную формулу Google для генерации с референсами:
`[Референсы] + [Relationship instruction — как их использовать] + [New scenario — что построить]` ([Google Cloud prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)), а также формулу для точечного редактирования: *«Using the provided image, change only \[X\]. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition»* ([Google Developers Blog](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/)).

---

## 3. Базовая формула промпта для этой задачи

```
Using the attached image as the exact structural reference (room geometry, wall
positions, window/door placement and size, ceiling height, and camera framing) —
render this same room and same camera angle as a photorealistic interior photograph.

Preserve exactly: room shape and proportions, wall/window/door positions and count,
ceiling height, floor footprint, camera angle, field of view and aspect ratio, and the
overall zoning/placement of furniture shown by the reference boxes.

You may: replace the placeholder boxes with realistic furniture of the same category,
scale and footprint, refine their silhouette to a coherent [СТИЛЬ] design, add finishing
materials, decor, textiles, lighting fixtures and small realistic details that a lived-in
[ТИП КОМНАТЫ] would have.

Style and materials: [описание стиля и палитры — см. §6].
Lighting: [источник света, время суток, направление].
Camera: photographed with [объектив/ракурс], natural depth of field, no lens distortion.
Aspect ratio: keep identical to the input image. Do not change the input aspect ratio.
```

Пример заполненного промпта (гостиная, скандинавский минимализм, тёплые тона — из ваших предпочтений):

```
Using the attached image as the exact structural reference (room geometry, wall
positions, the two windows on the north wall, ceiling height of 2.7 m, and camera
framing) — render this same room and same camera angle as a photorealistic interior
photograph.

Preserve exactly: room shape and proportions, both window positions and sizes, the
door on the left wall, ceiling height, floor footprint, camera angle and aspect ratio,
and the zoning shown by the reference boxes (sofa against the right wall, TV console
opposite, dining area near the windows).

You may: replace the placeholder boxes with realistic furniture of the same footprint —
a modern low-profile sofa in warm beige boucle fabric, a light oak TV console, a round
oak dining table with 4 upholstered chairs. Add a soft wool area rug, linen curtains,
2-3 potted plants, wall art, and a floor lamp. Keep proportions and clearances between
furniture consistent with the reference layout.

Style and materials: modern minimalist, ergonomic, earthy warm palette — light oak wood
with visible grain, matte white walls, terracotta and sand textile accents, brushed
brass fixtures. Avoid glossy plastic-looking surfaces.

Lighting: soft natural daylight coming through the windows from the left, golden-hour
warmth, gentle shadows with visible falloff, a warm floor lamp adding secondary fill
light in the evening corner.

Camera: photographed with a 24mm wide-angle architectural lens, eye-level height,
natural depth of field, no fisheye distortion, sharp focus throughout the room.

Aspect ratio: keep identical to the input image. Do not change the input aspect ratio.
```

---

## 4. Что сохранять, что можно менять, что запрещено добавлять

| Категория | Правило |
|---|---|
| **Всегда сохранять (жёсткие ограничения)** | форма и площадь комнаты; положение и размеры всех стен, окон, дверей, ниш, колонн; высота потолка; положение камеры, угол обзора (FOV) и соотношение сторон; общая зональность мебели (что где стоит крупными блоками) |
| **Можно уточнять/дополнять в разумных пределах** | силуэт и стиль конкретной мебели (при сохранении её footprint/габаритов и категории — «диван остаётся диваном той же длины и ориентации»); материалы и текстуры поверхностей; декор, текстиль, растения, светильники, посуда, книги; естественные несовершенства (складки на подушках, лёгкий беспорядок) |
| **Запрещено** | менять количество/расположение окон и дверей; менять высоту потолка и геометрию помещения; менять этаж/вид за окном без запроса; добавлять несуществующие проёмы, балконы, антресоли; менять ракурс камеры и обрезку кадра; добавлять читаемый бренд/логотип без явного запроса |

Формулируйте ограничения **позитивно**, а не через отрицание — Google явно рекомендует «semantic positive prompting»: вместо «без пустой стены» пишите «стена оформлена панно с растительным мотивом»; вместо «не меняй окна» — «окна остаются точно на тех же позициях и того же размера, что и на референсе» ([Google Developers Blog](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/), [Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)).

---

## 5. Приёмы снижения галлюцинаций и повышения реализма

1. **Описывайте сцену рассказом, а не списком тегов.** Связный абзац на естественном языке систематически даёт более когерентный результат, чем набор ключевых слов ([Google Developers Blog](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/)).
2. **Один геометрический якорь на генерацию.** Не подмешивайте в один запрос несколько разных 3D-скриншотов одной комнаты — модель может смешать их геометрию. Если нужен стилевой референс — явно подписывайте его роль («это референс только материала обивки, не геометрии»).
3. **Указывайте реальные числа.** Модель не может «на глаз» восстановить реальный масштаб из синтетического рендера — если известны реальные размеры (площадь, высота потолка, ширина проёмов), явно проговаривайте их в промпте.
4. **«Edit, don't re-roll».** Если результат близок, но не идеален — не генерируйте с нуля, а просите точечную правку: *«Keep everything the same, only fix the window proportions to match the reference»*. Это резко снижает дрейф геометрии между итерациями ([Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)).
5. **Управляйте камерой профессиональной лексикой:** `wide-angle shot`, `24mm architectural lens`, `eye-level`, `low-angle`, `shallow depth of field (f/2.8)` — это резко повышает фотореализм и предсказуемость композиции ([Google Developers Blog](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/)).
6. **Проектируйте свет явно.** Указывайте источник, направление и время суток («мягкий естественный свет слева из окон, золотой час, мягкие тени с затуханием») — без этого модель выбирает нейтральное плоское освещение, которое выглядит «пластиково» ([rendershop.ai](https://rendershop.ai/blog/common-ai-rendering-mistakes), [MeltFlex AI](https://www.meltflexai.com/blog/why-ai-renders-look-fake)).
7. **Называйте материалы физически, а не абстрактно.** Не «деревянный стол», а «стол из мореного дуба с видимой текстурой волокон, матовый лак»; не «мраморная столешница», а «каррарский мрамор с серыми прожилками, полированная поверхность». Абстрактные названия материалов — частая причина «пластикового» вида ([Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana), [MeltFlex AI](https://www.meltflexai.com/blog/why-ai-renders-look-fake)).
8. **Держите `temperature` на значении по умолчанию (1.0).** Для Gemini 3 понижение температуры не делает геометрию точнее — вместо этого делайте несколько сэмплов и выбирайте/дорабатывайте лучший ([Gemini 3 developer guide](https://ai.google.dev/gemini-api/docs/gemini-3)).
9. **Явно фиксируйте aspect ratio входа**, особенно если референс идёт не последним изображением в запросе (см. §1).
10. **Если сцена сложная — разбивайте на диалоговые шаги.** Сначала зафиксируйте геометрию и общий свет, затем отдельным ходом уточняйте материалы, затем — декор. Это дешевле по количеству неудачных полных перегенераций и снижает риск, что модель «переизобретёт» комнату целиком.
11. **При накоплении дрейфа — начинайте новый диалог заново с тем же исходным референсом**, а не продолжайте цепочку правок до бесконечности: после многих итераций модель может начать «уплывать» от исходной геометрии ([Google Developers Blog](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/)).

---

## 6. Консистентность между разными ракурсами одной квартиры

Так как вы будете генерировать несколько кадров одной и той же квартиры, критично, чтобы материалы, мебель и стиль не «плавали» от кадра к кадру.

- Заведите **«библиотеку стиля»** — фиксированный текстовый блок (материалы, палитра, ключевая мебель по комнатам, отделка) и **вставляйте его дословно** в system-инструкцию каждого запроса, для всех ракурсов.
- Формулировки материалов копируйте **слово в слово** между промптами разных ракурсов одной комнаты («дуб натурального медового тона, матовый лак» — не переформулируйте это иначе от кадра к кадру).
- Для одной комнаты по возможности ведите один диалог/сессию с моделью и генерируйте ракурсы последовательными репликами, а не параллельными независимыми запросами — так модель удерживает контекст выбранных материалов.
- Если сессии всё же независимые (например, ракурсы разных комнат обрабатываются параллельно) — прикладывайте один и тот же стилевой референс-коллаж (мудборд материалов) как второе изображение к каждому запросу.

---

## 7. Пайплайн агента (пошагово)

1. **Подготовка входа:** экспортировать кадр 3D-сцены в чистом виде (без UI-оверлеев редактора, без надписей), зафиксировать реальные размеры комнаты/проёмов, если они известны из сцены.
2. **Сборка промпта:** system-блок (библиотека стиля) + геометрический референс + per-shot текст по шаблону из §3.
3. **Генерация черновика** на Nano Banana 2 (быстро, дёшево) для проверки композиции и общей идеи.
4. **Самопроверка черновика** по чек-листу из §8 (геометрия, свет, материалы, консистентность).
5. **Точечные правки** диалоговыми репликами «keep everything the same, only fix X» до устранения критичных ошибок.
6. **Финальный рендер** тем же диалогом или тем же промптом на Nano Banana Pro, 2K/4K.
7. **Архивация:** сохранить итоговый промпт, референсы и результат вместе — это ваш воспроизводимый рецепт для похожих ракурсов/комнат.

---

## 8. Чек-лист типичных ошибок ИИ при генерации интерьеров

Используйте как финальный QA перед принятием кадра.

### Геометрия и масштаб
- [ ] Стены не «гуляют» и не изгибаются, углы остаются прямыми и сходятся корректно
- [ ] Оконные и дверные рамы прямые, не «плывут» и не выглядят «подводными»
- [ ] Количество и позиции окон/дверей совпадают с референсом
- [ ] Высота потолка визуально соответствует референсу и человеческому масштабу
- [ ] Мебель не слишком крупная/мелкая относительно комнаты (диван, стол, шкаф — правдоподобного размера)
- [ ] Плитка, паркетная доска и другие модульные текстуры не «гигантские» и не «кукольные» по масштабу
- [ ] Мебель одного гарнитура (например, стулья вокруг стола) одинакового масштаба и дизайна между собой
- [ ] Широкоугольный объектив не создаёт неправдоподобных искажений пропорций у ближней мебели

([источники: rendershop.ai](https://rendershop.ai/blog/common-ai-rendering-mistakes), [ArchitectGPT](https://www.architectgpt.io/blog/escaping-ai-render-uncanny-valley-5-fixes), [Volexi](https://www.volexi.com/blog/architectural-rendering-mistakes-that-kill-realism))

### Свет и тени
- [ ] Свет исходит из явного источника (окно/светильник), а не «отовсюду и ниоткуда»
- [ ] Есть затухание яркости от источника света к дальним углам комнаты (нет ровной «плоской» засветки всей сцены)
- [ ] Тени согласованы по направлению с источником света (не противоречат друг другу)
- [ ] У мебели/предметов есть контактная тень в месте касания пола — предметы не «парят» над полом
- [ ] Свет из окна не выжигает вид наружу в чистый белый прямоугольник без деталей пейзажа
- [ ] Ночная/вечерняя сцена освещена точечными практическими источниками (лампы, бра), а не общим театральным заливающим светом

([источники: MeltFlex AI](https://www.meltflexai.com/blog/why-ai-renders-look-fake), [Volexi](https://www.volexi.com/blog/architectural-rendering-mistakes-that-kill-realism), [ArchitectGPT](https://www.architectgpt.io/blog/escaping-ai-render-uncanny-valley-5-fixes))

### Материалы и текстуры
- [ ] Дерево показывает волокна и лёгкий блеск, не выглядит как ламинат/наклейка
- [ ] Камень/мрамор не выглядит как плоская фактура-наклейка, есть эффект глубины прожилок
- [ ] Ткань выглядит тканой (видна структура плетения), а не как винил/пластик
- [ ] Разные поверхности не имеют одинакового «глянцевого пластикового» финиша
- [ ] На металле отражения соответствуют заявленному типу отделки (матовый/полированный/анодированный)
- [ ] Нет нелогичных сочетаний материалов (дорогой камень в утилитарной зоне без функционального обоснования, золото в бюджетном интерьере и т.п.)
- [ ] Текстуры не повторяются заметным регулярным паттерном (видимый тайлинг)

([источники: MeltFlex AI](https://www.meltflexai.com/blog/why-ai-renders-look-fake), [ArchitectGPT](https://www.architectgpt.io/blog/escaping-ai-render-uncanny-valley-5-fixes), [Volexi](https://www.volexi.com/blog/architectural-rendering-mistakes-that-kill-realism))

### Композиция и камера
- [ ] Ракурс и обрезка кадра совпадают с исходной 3D-сценой
- [ ] Соотношение сторон изображения не изменилось относительно референса
- [ ] Нет случайных «рыбий глаз» искажений, если явно не запрошены
- [ ] Кадр не унаследовал неудачную композицию исходника (если сцена снята «от пола» или слишком крупным планом — стоит явно скорректировать ракурс в промпте)

([источник: rendershop.ai](https://rendershop.ai/blog/common-ai-rendering-mistakes))

### Реализм и «эффект жилого пространства»
- [ ] Комната не выглядит «стерильной шоурумной» — уместны лёгкие естественные несовершенства (складка на пледе, книга под углом)
- [ ] Не все предметы расставлены идеально симметрично/по линейке без вариаций
- [ ] Есть разумное количество «жилых» деталей (текстиль, растения, мелкий декор), но без визуального захламления

([источник: MeltFlex AI](https://www.meltflexai.com/blog/why-ai-renders-look-fake))

### Специфика жилых интерьеров (доменные проверки)
- [ ] Розетки/выключатели расположены на разумной высоте и в логичных местах (не посреди стены без причины)
- [ ] Радиаторы отопления под окнами не исчезли и не телепортировались в другое место
- [ ] Плинтусы присутствуют по периметру и не прерываются случайным образом
- [ ] Вентиляционные решётки/короба (если были на референсе) сохранены
- [ ] Зеркала отражают правдоподобную часть комнаты, а не постороннюю сцену
- [ ] Шторы/жалюзи по длине и креплению соответствуют реальному окну
- [ ] Двери открываются в реалистичную сторону и не перекрывают проходы
- [ ] Нет дублирующихся объектов декора (одно и то же кашпо/подушка не клонируется подряд)

### Консистентность между кадрами одной квартиры
- [ ] Материалы пола/стен одной комнаты идентичны между разными ракурсами
- [ ] Мебель, видимая на двух соседних ракурсах, выглядит как один и тот же предмет (форма, цвет, обивка)
- [ ] Общая цветовая палитра и стиль не меняются от кадра к кадру без причины
- [ ] Вид за окном (если он попадает в кадр) согласован между ракурсами одной стены/этажа

### Текст и брендинг
- [ ] На кадре нет случайного псевдо-текста/логотипов на упаковках, книгах, технике, если это не запрошено явно
- [ ] Если текст всё же нужен — он задан в кавычках с указанием шрифта, иначе не запрашивайте видимый текст вовсе ([Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana))

---

## 9. Готовые шаблоны для агента

**System-инструкция (константа, один раз на всю сессию/агента):**

```
You are a photoreal interior visualization assistant. You receive a screenshot of a
simple 3D layout scene (a room's geometry and placeholder furniture boxes) and turn it
into a photorealistic interior photograph for renovation planning.

Hard rules — always preserve from the reference image:
- room shape, wall/window/door positions, count and sizes, ceiling height
- camera angle, field of view and aspect ratio
- overall furniture zoning shown by the reference boxes

You are allowed to, within the footprint of each reference box:
- turn placeholder boxes into realistic furniture of the same category and scale
- refine furniture silhouette and style to match the style guide below
- add materials, textures, decor, textiles, plants, lighting fixtures, and small
  lived-in details

Never invent new openings, floors, or rooms. Never change camera framing or aspect
ratio. Describe every change positively and specifically; avoid vague style words.

Style guide (apply consistently across all rooms and shots):
[ВСТАВИТЬ дословно библиотеку стиля из §6: палитра, материалы, референсные предметы мебели]
```

**Per-shot шаблон (заполняется под конкретный ракурс):**

```
Room: [комната]. Reference image attached is the exact geometry and camera anchor for
this shot — [краткое описание того, что на референсе: окна/двери/зонирование].

Update for this shot: [что добавить/уточнить именно здесь — конкретная мебель, декор].
Lighting: [время суток, источник, направление].
Camera: [объектив/высота/ракурс, если требуется уточнение].
Aspect ratio: keep identical to the input image.
```

**Шаблон точечной правки (для диалоговых итераций):**

```
Keep everything else in the image exactly the same — same geometry, same materials,
same lighting. Only fix: [конкретная проблема, например: "the left window proportions
to match the reference" / "the sofa fabric to matte boucle instead of glossy leather"].
```

---

## Источники

- [How to prompt Gemini 2.5 Flash Image Generation for the best results — Google Developers Blog](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/)
- [The ultimate Nano Banana prompting guide — Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)
- [Gemini 3 developer guide — Google AI for Developers](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Why AI Renders Look Fake (and the Real Fix) — MeltFlex AI](https://www.meltflexai.com/blog/why-ai-renders-look-fake)
- [Common AI Rendering Mistakes and How to Fix Them — RenderShop.ai](https://rendershop.ai/blog/common-ai-rendering-mistakes)
- [Escaping the AI Render Uncanny Valley: 5 Fixes — ArchitectGPT](https://www.architectgpt.io/blog/escaping-ai-render-uncanny-valley-5-fixes)
- [Architectural Rendering Mistakes That Kill Realism — Volexi](https://www.volexi.com/blog/architectural-rendering-mistakes-that-kill-realism)
- [5 common AI prompt mistakes ruining your interior design renders — Kate Vera Creative](https://www.kateveracreative.com/blog/common-ai-prompt-mistakes-interior-design-renders)
