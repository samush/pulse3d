# Модели предметов (GLB)

Файлы генерируются скриптами `tools/models/*.js` (node + впендоренный `three.min.js`, без внешних зависимостей и лицензий):
`node tools/models/sofa.js` → `models/sofa.glb`, `node tools/models/chair.js` → `models/chair.glb`. Руками GLB не править — менять скрипт и перегенерировать.

Конвенция: метры, pivot в СЗ углу предмета (x,z ≥ 0), низ на y=0, спинка у z=size[2]; имена материалов = слоты
(`fabric`, `wood`, `paint`, `metal`), текстур внутри нет — материалы подменяются на серые `ITEM_MATS` при загрузке (`items.js`).

| Файл | Предмет | Треугольников | Источник |
|---|---|---|---|
| `sofa.glb` | `sofa` 2.0×0.85×0.88 | ~10.5k | `tools/models/sofa.js` |
| `chair.glb` | `chair1…6` 0.42×0.9×0.42, один файл, клоны с общей geometry, поворот `glbRot` | ~1.6k | `tools/models/chair.js` |
| `kidsofa.glb` | `kidsofa` 0.75×0.80×1.60 | ~6.6k | `tools/models/kidsofa.js` |
| `kidchair.glb` | `kidchair`, `kidchair2` 0.55×0.85×0.55, один файл | ~2.1k | `tools/models/kidchair.js` |
| `windowseat1.glb` | `windowseat1` 0.60×0.65×1.89; имена материалов — ключи `ITEM_MATS` (`kmat`, `pillow`, `body`…), чтобы оттенки концепта сохранились | ~3.1k | `tools/models/windowseat1.js` |
