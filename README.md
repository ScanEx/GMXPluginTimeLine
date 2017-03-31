# GMXPluginTimeLine

### Плагин L.control.gmxTimeline
Добавляет контрол таймлайна слоев ГеоМиксера. Расширяет [L.Control](http://leafletjs.com/reference.html#control).
Предназначен для анализа временной составляющей мультивременных векторных слоев ГеоМиксера.
Доступ через пространство имен ГеоМиксера - `window.nsGmx` по идентификатору `gmxTimeline`

Demos
------
  * [Пример](http://scanex.github.io/GMXPluginTimeLine/index.html) инициализации.

### Options

Свойство|Тип|По умолчанию|Описание
------|------|:---------:|:-----------
id|`<String>`|`gmxTimeline`| Идентификатор контрола.
moveable|`<Boolean>`|`false`| При `true` позволяет изменять временной интервал через таймлайн.

#### Методы

Метод|Синтаксис|Описание
------|------|:---------:|:-----------
layerAdd|`layerAdd(layerID)`| Добавляет мультивременной слой с идентификатором `layerID`.

## config line example for Geomixer
     { pluginName: 'Timeline Vectors', file: 'plugins/external/GMXPluginTimeLine/L.Control.gmxTimeLine.js', module: 'gmxTimeLine', mapPlugin: true, isPublic: true }
