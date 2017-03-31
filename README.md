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
------|------|:-----------
addLayer|`addLayer(`[layer](https://github.com/ScanEx/Leaflet-GeoMixer/blob/master/documentation-rus.md#Класс-lgmxvectorlayer)`)`| Добавляет мультивременной слой.
removeLayer|`removeLayer(`[layer](https://github.com/ScanEx/Leaflet-GeoMixer/blob/master/documentation-rus.md#Класс-lgmxvectorlayer)`)`| Удаляет мультивременной слой.

## config line example for Geomixer
     { pluginName: 'Timeline Vectors', file: 'plugins/external/GMXPluginTimeLine/L.Control.gmxTimeLine.js', module: 'gmxTimeLine', mapPlugin: true, isPublic: true }
