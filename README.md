# GMXPluginTimeLine

### Плагин L.control.gmxTimeline
Добавляет контрол таймлайна слоев ГеоМиксера. Расширяет [L.Control](http://leafletjs.com/reference.html#control).
Предназначен для анализа временной составляющей мультивременных векторных слоев ГеоМиксера.
Доступ через пространство имен ГеоМиксера - `window.nsGmx` по идентификатору `gmxTimeline`

Demos
------
  * [Пример](http://maps.kosmosnimki.ru/api/plugins/external/GMXPluginTimeLine/index.html) инициализации.
```html
	<div id="map"></div>
 
	<link rel="stylesheet" href="http://www.kosmosnimki.ru/lib/geomixer/geomixer.css" />
	<script src="http://www.kosmosnimki.ru/lib/geomixer/geomixer-src.js?key=U92596WMIH"></script>

	<link rel="stylesheet" href="http://maps.kosmosnimki.ru/api/plugins/timeline/2.9.1/timeline.css" />
	<script src="http://maps.kosmosnimki.ru/api/plugins/timeline/2.9.1/timeline.js"></script>

	<link rel="stylesheet" href="L.Control.gmxTimeline.css" />
	<script src="L.Control.gmxTimeline.js"></script>
	<script>
	  var map = L.map('map').setView([60, 50], 3);
		
      L.gmx.loadMap('AZR6A', {leafletMap: map}).then(function(gmxMap) {
		var control = L.control.gmxTimeline({
			moveable: true
		})
		.on('dateInterval', function (ev) {
			gmxMap.layersByID[ev.layerID].setDateInterval(ev.beginDate, ev.endDate);
		})
		.on('click', function (ev) {
			gmxMap.layersByID[ev.layerID].repaint();
		});

		map.addControl(control);
		var cDate = new Date(Date.UTC(2017, 0, 1)),
			beginDate = new Date(cDate.valueOf() - 1000 * 60 * 60 * 24),
			endDate = cDate,
			layerID = 'C13B4D9706F7491EBC6DC70DFFA988C0',
			hotSpotsGlobal = gmxMap.layersByID[layerID];

		hotSpotsGlobal.setDateInterval(beginDate, endDate);
		control.addLayer(hotSpotsGlobal);
		map.addLayer(hotSpotsGlobal);
	  });
	</script>
```

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
setCurrentTab|`setCurrentTab(id<String>)`| Установить текущую вкладку таймлайна по идентификатору слоя.


#### События

| Type | Property | Description
| --- | --- |:---
| click | `<Event>` | click на таймлайне
| dateInterval | `<Event>` | произошло изменение интервала таймлайна

#### События добавляемые к карте

| Type | Property | Description
| --- | --- |:---
| gmxTimeLine.currentTabChanged | `<Event>` | изменена текущая вкладка таймлайна

## config line example for Geomixer
     { pluginName: 'Timeline Vectors', file: 'plugins/external/GMXPluginTimeLine/L.Control.gmxTimeLine.js', module: 'gmxTimeLine', mapPlugin: true, isPublic: true }
