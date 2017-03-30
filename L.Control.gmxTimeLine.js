(function () {
    'use strict';

	window.nsGmx = window.nsGmx || {};
    var timeLineControl,
		calendar,
		iconLayers,
		timeClass,
		timeLineType = 'timeline',	// vis timeline vis-timeline
		timeLinePrefix = '../../timeline/' + (timeLineType === 'timeline' ? '2.9.1/' : '/'),
        pluginName = 'gmxTimeLine',
		tzs = (new Date()).getTimezoneOffset() * 60,
		// tzs = 0,
		tzm = tzs * 1000,
		ns = {},
		zeroDate = new Date(1980, 0, 1),
		modeSelect = 'range',
		filter = function (it) {
			var state = timeLineControl.getCurrentState() || {},
				selected = state.selected;
			if (modeSelect === 'range') {
				var uTimeStamp = state.uTimeStamp || [0, 0],
					prop = it.properties,
					dt = prop[state.tmpKeyNum];

				if (dt < uTimeStamp[0] || dt > uTimeStamp[1]) {
					return false;
				}
			}
			// if (selected) {
				// var utm = it.properties[state.tmpKeyNum];
				// if (selected[utm]) {
					// return true;
				// }
			// }
			return true;
		},
		currentLayerID,
		currentDmID,

		getDataSource = function (id) {
			var gmxLayer = nsGmx.gmxMap.layersByID[id];
			if (gmxLayer && gmxLayer.getDataManager) {
				var dm = gmxLayer.getDataManager(),
					dmOpt = dm.options;
				if (dmOpt.Temporal) {
					var tmpKeyNum = dm.tileAttributeIndexes[dmOpt.TemporalColumnName],
						timeColumnName = dmOpt.MetaProperties.timeColumnName ? dmOpt.MetaProperties.timeColumnName.Value : null,
						timeKeyNum = timeColumnName ? dm.tileAttributeIndexes[timeColumnName] : null,
						dInterval = gmxLayer.getDateInterval(),
						opt = gmxLayer.getGmxProperties();

					if (!dInterval.beginDate || !dInterval.endDate) {
						var cInterval = calendar.getDateInterval().attributes;
						dInterval = {
							beginDate: cInterval.dateBegin,
							endDate: cInterval.dateEnd
						};
					}
					
					return {
						gmxLayer: gmxLayer, 
						layerID: opt.name, title: opt.title, //dmID: dmOpt.name,
						tmpKeyNum: tmpKeyNum,
						timeKeyNum: timeKeyNum,
						TemporalColumnName: dmOpt.TemporalColumnName,
						temporalColumnType: dm.temporalColumnType,
						// dInterval: dInterval,
						oInterval: dInterval,
						uTimeStamp: [dInterval.beginDate.getTime()/1000, dInterval.endDate.getTime()/1000],
						observer: dm.addObserver({
							type: 'resend',
							filters: ['clipFilter', 'userFilter_timeline', 'styleFilter'],
							active: false,
							itemHook: function(it) {
								if (!this.cache) { this.cache = {}; }
								var arr = it.properties,
									utm = arr[tmpKeyNum];
								if (timeColumnName) { utm += arr[timeKeyNum] + tzs; }
								this.cache[utm] = 1 + (this.cache[utm] || 0);
							},
							callback: function(data) {
								var out = this.cache || {};
								this.cache = {};
								gmxLayer.repaint();
								return out;
							}
						})
					};
				}
			}
			return null;
		};

	L.Control.GmxTimeline = L.Control.extend({
		includes: L.Mixin.Events,
		options: {
			position: 'bottom',
			id: 'gmxTimeline',
			className: 'gmxTimeline',
			modeSelect: 'range',	// selected
			groups: false,
			hostPrefix: 'http://maps.kosmosnimki.ru/',
			dateInterval: [new Date('2016-01-01'), new Date('2016-12-31')],
			moveable: false
        },

        saveState: function() {
			var dataSources = [];
			for (var layerID in this._state.data) {
				var state = this._state.data[layerID],
					oInterval = state.oInterval,
					hash = {
						layerID: layerID,
						TemporalColumnName: state.TemporalColumnName,
						oInterval: {
							beginDate: oInterval.beginDate.valueOf(),
							endDate: oInterval.endDate.valueOf()
						},
						currentBounds: state.currentBounds,
						selected: state.selected,
						items: state.items
					};

				if (state.dInterval) {
					hash.dInterval = {
						beginDate: state.dInterval.beginDate.valueOf(),
						endDate: state.dInterval.endDate.valueOf()
					};
				}
				dataSources.push(hash);
			}
			return {
				version: '1.0.0',
				currentTab: currentDmID,
				isVisible: this._state.isVisible,
				dataSources: dataSources
			};
		},

		getCurrentState: function () {
			return this._state.data[currentDmID];
		},

		_addLayerTab: function (layerID, title) {
			var layersTab = this._containers.layersTab,
				liItem = L.DomUtil.create('li', 'selected', layersTab),
				span = L.DomUtil.create('span', '', liItem),
				closeButton = L.DomUtil.create('span', 'close-button', liItem),
				stop = L.DomEvent.stopPropagation;

			liItem._layerID = layerID;
			span.innerHTML = title;
			// closeButton.innerHTML = '×';

			L.DomEvent
				.on(closeButton, 'click', stop)
				.on(closeButton, 'click', function (ev) {
					var nextTab = liItem.nextSibling;
					layersTab.removeChild(liItem);
					delete this._state.data[layerID];	// При удалении tab забываем о слое
					if (layersTab.children.length === 0) {
						currentDmID = null;
						L.DomUtil.addClass(this._container, 'gmx-hidden');
						if (iconLayers) {
							L.DomUtil.removeClass(iconLayers.getContainer(), 'iconLayersShift');
						}
					} else {
						this._setCurrentTab((nextTab || layersTab.lastChild)._layerID);
					}
			}, this);
		},

		setCurrentTab: function (id) {
			this._setCurrentTab(id);
		},

		addDataSource: function (dataSource) {
			var layerID = dataSource.layerID;
			if (layerID) {
				var pDataSource = this._state.data[layerID];
				this._timeline = null;
				this._state.data[layerID] = dataSource;
				if (pDataSource) {
					dataSource.oInterval = pDataSource.oInterval;
					dataSource.dInterval = pDataSource.dInterval;
					var dInterval = dataSource.dInterval || dataSource.oInterval;
					dataSource.uTimeStamp = [dInterval.beginDate.getTime()/1000, dInterval.endDate.getTime()/1000];
					this.fire('dateInterval', {
						layerID: layerID,
						beginDate: dInterval.beginDate,
						endDate: dInterval.endDate
					}, this);
				}
				if (dataSource.oInterval) {
					currentDmID = layerID;
					this._initTimeline();
					timeLineControl._bboxUpdate();
				}
				if (!pDataSource) {
					this._addLayerTab(layerID, dataSource.title || '');
				}
				// if (dataSource.selected) {
					// this._setMode('selected');
					// this._modeSelectCheck();
				// }

				if (dataSource.observer) {
					dataSource.observer.on('data', function(ev) {
						this._state.data[currentDmID].items = ev.data;
						this._redrawTimeline();
					}, this);
				}
				L.DomUtil.removeClass(this._containers.vis, 'gmx-hidden');
				L.DomUtil.removeClass(this._container, 'gmx-hidden');
				if (iconLayers) {
					L.DomUtil.addClass(iconLayers.getContainer(), 'iconLayersShift');
				}
				this._setCurrentTab(layerID);
				this._setDateScroll();
			}
			return this;
		},

		onRemove: function (map) {
			if (map.gmxControlsManager) {
				map.gmxControlsManager.remove(this);
			}
			map.off('moveend', this._moveend, this);
			map.fire('controlremove', this);
		},

		_moveend: function () {
			if (this._sidebarOn) {
				this._bboxUpdate();
			}
		},

		_bboxUpdate: function () {
			if (currentDmID && this._map) {
				var state = this.getCurrentState(),
					oInterval = state.oInterval,
					map = this._map,
					lbox = map.getBounds(),
					bounds = L.gmxUtil.bounds([[lbox._southWest.lng, lbox._southWest.lat], [lbox._northEast.lng, lbox._northEast.lat]]);

				// state.observer.deactivate();
				state.currentBounds = bounds;
				state.observer.setBounds(bounds);
				state.observer.setDateInterval(oInterval.beginDate, oInterval.endDate);
				state.observer.activate();
			}
		},

		_redrawTimeline: function () {
			var count = 0,
				// interval = this._getDateInterval(true),
				type = timeLineType === 'timeline' ? 'dot' : 'point',
				selected = [],
				res = [],
				needGroup = this.options.groups,
				state = this._state,
				groupInterval = [state.maxDate, state.zeroDate],
				data = this.getCurrentState(),
				dSelected = data.selected || {};

			for (var utm in data.items) {
				var start = new Date(utm * 1000 + tzm),
					item = {
						id: count,
						type: type,
						items: data.items[utm],
						// group: currentDmID,
						// title: it[0].toString(),
						// content: it[0].toString(),
						utm: utm,
						start: start
					};
				if (needGroup) {
					item.group = currentDmID;
				}
				groupInterval[0] = Math.min(start, groupInterval[0]);
				groupInterval[1] = Math.max(start, groupInterval[1]);
				if (dSelected[utm]) {
					selected.push(count);
				}
				// res[count] = item;
				res.push(item);
				count++;
			}
			if (count && needGroup) {
				res.push({id: 'background_' + currentDmID, start: groupInterval[0], end: groupInterval[1], type: 'background', className: 'negative',group:currentDmID});
				count++;
			}
			if (!this._timeline) {
				this._initTimeline(res);
			} else {
				if (timeLineType === 'timeline') {
					this._timeline.draw(res);
				} else {
					this._items.clear();
					this._items.add(res);
				}
			}
			this._timeline.setSelection(selected);
		},

		_setEvents: function (tl) {
			if (timeLineType === 'timeline') {
				var events = L.gmx.timeline.events;
				events.addListener(tl, 'rangechange', this._rangechanged.bind(this));
				events.addListener(tl, 'rangechanged', this._rangechanged.bind(this));
				events.addListener(tl, 'select', this._clickOnTimeline.bind(this));
			} else {
				tl
					.on('rangechange', this._rangechanged.bind(this))
					.on('rangechanged', this._rangechanged.bind(this))
					.on('click', this._clickOnTimeline.bind(this));
			}
		},

		_rangechange: function (ev) {
			var state = this.getCurrentState();
			state.oInterval = {beginDate: ev.start, endDate: ev.end};
			this._setDateScroll();
// console.log('_rangechange', ev.start);
		},

		_rangechanged: function (ev) {
			var state = this.getCurrentState();
			state.oInterval = {beginDate: ev.start, endDate: ev.end};
			this.fire('dateInterval', {
				layerID: state.layerID,
				beginDate: state.oInterval.beginDate,
				endDate: state.oInterval.endDate
			}, this);
			
			this._setDateScroll();
			this._bboxUpdate();
		},

		_clickOnTimeline: function (items) {
			return;
			var stateAll = this._state,
				state = this.getCurrentState(),
				selectedPrev = state.selected || {},
				selected = {},
				out = {},
				tl = this._timeline;
			// state.selected = {};
			// this._items.get(tl.getSelection()).forEach(function (pt, i) {
			tl.getSelection().forEach(function (it, i) {
				tl.setSelection([it]);
				var	pt = tl.getItem(it.row),
					layerID = pt.group || currentDmID,
					group = out[layerID] || {filters: [], dateInterval: [stateAll.maxDate, stateAll.zeroDate]},
					d1 = pt.start.getTime(),
					d2 = d1 + stateAll.day,
					utm = pt.utm;
					
				selected[utm] = selectedPrev[utm] || state.currentBounds;
				// state.selected = hash;
				group.filters.push([d1, d2]);
				group.dateInterval[0] = Math.min(d1, group.dateInterval[0]);
				group.dateInterval[1] = Math.max(d2, group.dateInterval[1]);
				out[layerID] = group;
			});
			// if (Object.keys(selected).length === 0) {
				// state.items = {};
			// }
			state.selected = selected;

			// if (modeSelect === 'selected') {
			this.fire('click', {selected: out, layerID: currentDmID, originalEvent: items ? items.event: null});
			// }
		},

		_setCurrentTab: function (layerID) {
			var layersTab = this._containers.layersTab;
			for (var i = 0, len = layersTab.children.length; i < len; i++) {
				var li = layersTab.children[i];
				if (li._layerID === layerID) {
					L.DomUtil.addClass(li, 'selected');
				} else {
					L.DomUtil.removeClass(li, 'selected');
				}
			}
			currentDmID = layerID;
			this._map.fire('gmxTimeLine.currentTabChanged', {currentTab: layerID});
			this._bboxUpdate();
			if (this._timeline) {
				var state = this.getCurrentState(),
					oInterval = state.oInterval;
				if (timeLineType === 'timeline') {
					this._setWindow(oInterval);
				}
			}
			this._setDateScroll();
		},

		initialize: function (options) {
			L.Control.prototype.initialize.call(this, options);
			var day = 1000 * 60 * 60 * 24;

			this._state = {
				data: {},
				day: day,
				timeLineOptions: {
					vis: {
						moment: function(date) {
							return vis.moment.duration ? vis.moment(date).utc() : null;
						},
						moveable: this.options.moveable || false,
						stack: false,
						multiselect: true,
						orientation: 'top',
						rollingMode: false
					},
					timeline: {
						locale: 'ru',
						zoomable: this.options.moveable || false,
						moveable: this.options.moveable || false,
						timeChangeable: false,
						// unselectable: false,
						animateZoom: false,
						autoHeight: false,
						stackEvents: false,
						axisOnTop: true,
						'box.align': 'center',
						zoomMin: 1000 * 60 * 60 * 10,
						width:  '100%',
						height: '81px'
					}
				},
				zeroDate: zeroDate.getTime(),
				maxDate: new Date(2980, 0, 1).getTime()
			};
		},

		_initTimeline: function (data) {
			if (currentDmID && !this._timeline) {
				var state = this.getCurrentState(),
					groups = this.options.groups ? [{
						id: state.layerID,
						title: state.title,
						content: state.title,
						layerID: state.layerID
					}] : null,
					options = this._state.timeLineOptions[timeLineType];

				if (state.oInterval) {
					options.start = state.oInterval.beginDate;
					options.end = state.oInterval.endDate;
				}
				if (state.temporalColumnType === 'date') {
					// options.zoomMin = this._state.day * 30;
					// options.timeAxis = {scale: 'day'};
				}
				this._containers.vis.innerHTML = '';

				var _this = this;
				if (timeLineType === 'timeline') {
					this._timeline = new L.gmx.timeline.Timeline(this._containers.vis, options);
					var c = this._timeline.getCurrentTime();
					this._timeline.setCurrentTime(new Date(c.valueOf() + c.getTimezoneOffset() * 60000));
					this._timeline.draw(data);
				} else {
					this._items = new vis.DataSet(data);
					this._timeline = new vis.Timeline(this._containers.vis, this._items, groups, options);
				}
				this._setEvents(this._timeline);
			} else {
				
			}
		},

		_setWindow: function (dInterval) {
			if (this._timeline) {
				var setWindow = this._timeline.setWindow ? 'setWindow' : 'setVisibleChartRange';
				this._timeline[setWindow](dInterval.beginDate, dInterval.endDate);
			}
		},

		layerAdd: function (gmxLayer) {
			var opt = gmxLayer.getGmxProperties(),
				data = getDataSource(opt.name);
			if (data) {
				gmxLayer
					.setFilter(filter.bind(gmxLayer))
					.on('dateIntervalChanged', this._dateIntervalChanged, this);
				this.addDataSource(data);
			}
		},

		_dateIntervalChanged: function (ev) {
			var gmxLayer = ev.target,
				state = this.getCurrentState(),
				dInterval = gmxLayer.getDateInterval();
			if (state && dInterval.beginDate) {
				state.oInterval = {
					beginDate: dInterval.beginDate,
					endDate: dInterval.endDate
				};
				state.uTimeStamp = [dInterval.beginDate.getTime()/1000, dInterval.endDate.getTime()/1000];
				if (this._timeline) {
					this._setWindow(dInterval);
				}
				this._setDateScroll();
				this._bboxUpdate();
			}
		},

		onAdd: function (map) {
			var container = this._container = L.DomUtil.create('div', this.options.className + ' gmx-hidden'),
				stop = L.DomEvent.stopPropagation;

			L.DomEvent
				// .on(container, 'mousemove', stop)
				.on(container, 'touchstart', stop)
				.on(container, 'mousedown', stop)
				.on(container, 'mousewheel', stop)
				.on(container, 'dblclick', stop)
				.on(container, 'click', stop);

			// L.DomUtil.setPosition(container, new L.Point(0, 0));
			// this.draggable = new L.Draggable(container);
			// this.draggable.enable();
			// L.DomEvent.disableScrollPropagation(container);

			var str = '<div class="leaflet-gmx-iconSvg hideButton leaflet-control" title=""><svg role="img" class="svgIcon"><use xlink:href="#arrow-down-01"></use></svg></div>';
			container.innerHTML = str + '<div class="vis-container"><div class="tabs"><ul class="layers-tab"></ul></div><div class="internal-container"><div class="w-scroll"><div class="c-scroll"><div class="c-borders"></div></div><div class="l-scroll"><div class="l-scroll-title gmx-hidden"></div></div><div class="r-scroll"><div class="r-scroll-title gmx-hidden"></div></div></div><div class="vis"></div></div></div>';
			container._id = this.options.id;
			this._map = map;
			var lScroll = container.getElementsByClassName('l-scroll')[0],
				lScrollTitle = container.getElementsByClassName('l-scroll-title')[0],
				rScroll = container.getElementsByClassName('r-scroll')[0],
				rScrollTitle = container.getElementsByClassName('r-scroll-title')[0],
				cScroll = container.getElementsByClassName('c-scroll')[0],
				wScroll = container.getElementsByClassName('w-scroll')[0],
				hideButton = container.getElementsByClassName('hideButton')[0],
				useSvg = hideButton.getElementsByTagName('use')[0],
				visContainer = container.getElementsByClassName('vis-container')[0],
				layersTab = container.getElementsByClassName('layers-tab')[0];
			this._containers = {
				vis: container.getElementsByClassName('vis')[0],
				layersTab: layersTab,
				hideButton: hideButton,
				lScroll: lScroll,
				rScroll: rScroll,
				cScroll: cScroll
			};

			L.DomEvent
				.on(hideButton, 'click', function (ev) {
					var isVisible = !L.DomUtil.hasClass(visContainer, 'gmx-hidden'),
						iconLayersCont = iconLayers ? iconLayers.getContainer() : null;
					if (isVisible) {
						L.DomUtil.addClass(visContainer, 'gmx-hidden');
						if (iconLayersCont) {
							L.DomUtil.removeClass(iconLayersCont, 'iconLayersShift');
							hideButton.style.top = '0px';
							useSvg.setAttribute('href', '#arrow-up-01');
						}
					} else {
						L.DomUtil.removeClass(visContainer, 'gmx-hidden');
						if (iconLayersCont) {
							L.DomUtil.addClass(iconLayersCont, 'iconLayersShift');
							hideButton.style.top = '-10px';
							useSvg.setAttribute('href', '#arrow-down-01');
						}
					}
					this._state.isVisible = isVisible;
				}, this);

			L.DomEvent
				.on(lScroll, 'mouseover', function (ev) {
					var state = this.getCurrentState(),
						dt = (state.dInterval || state.oInterval).beginDate,
						str = this._timeline.getUTCTimeString(dt);
					lScroll.title = str;
				}, this);

			L.DomEvent
				.on(rScroll, 'mouseover', function (ev) {
					var state = this.getCurrentState(),
						dt = (state.dInterval || state.oInterval).endDate,
						str = this._timeline.getUTCTimeString(new Date(dt - 1));
					rScroll.title = str;
					// rScroll.title = (new Date(dt.getTime() + tzm)).toLocaleString();
				}, this);

			L.DomEvent
				.on(layersTab, 'click', function (ev) {
					var target = ev.target,
						_layerID = target._layerID || target.parentNode._layerID;
					this._setCurrentTab(_layerID);
				}, this);

			L.DomUtil.setPosition(lScroll, new L.Point(0, 0));
			L.DomUtil.setPosition(rScroll, new L.Point(0, 0));
			var _this = this,
				dragend = function () {
					var state = _this.getCurrentState(),
						lPos = L.DomUtil.getPosition(lScroll),
						rPos = L.DomUtil.getPosition(rScroll),
						ww = wScroll.clientWidth - 24,
						w = ww - lPos.x + rPos.x,
						tl = _this._timeline,
						range = tl.getWindow ? tl.getWindow() : tl.getVisibleChartRange(),
						start = range.start.getTime(),
						px = (range.end.getTime() - start) / ww,
						msec1 = start + px * lPos.x,
						msec2 = msec1 + px * w;
					if (state) {
						state.dInterval = { beginDate: new Date(msec1), endDate: new Date(msec2) };
// console.log('state.dateInterval__', state.dInterval.beginDate.toGMTString(), state.dInterval.endDate.toGMTString());
						state.uTimeStamp = [state.dInterval.beginDate.getTime()/1000, state.dInterval.endDate.getTime()/1000];
						_this.fire('click', {
							layerID: state.layerID,
							beginDate: state.dInterval.beginDate,
							endDate: state.dInterval.endDate
						}, _this);
					}
				};
			this._dIntervalUpdate = dragend;
			this._setDateScroll = function () {
				var state = _this.getCurrentState();
				if (state) {
					var oInterval = state.oInterval,
						// dInterval = oInterval,
						dInterval = state.dInterval || oInterval,
						oe = oInterval.endDate.getTime(),
						ob = oInterval.beginDate.getTime(),
						msecW = oe - ob,
						ww = wScroll.clientWidth,
						px = ww / msecW,
						x1 = px * (dInterval.beginDate.getTime() - ob),
						x2 = px * (dInterval.endDate.getTime() - oe),
						point = new L.Point(x1, 0);

					L.DomUtil.setPosition(lScroll, point);
					L.DomUtil.setPosition(cScroll, point);
					L.DomUtil.setPosition(rScroll, new L.Point(x2, 0));
					cScroll.style.width = (ww + x2 - x1 - 24) + 'px';
					// if (!state.dInterval) {
						// _this.fire('dateInterval', {
							// layerID: state.layerID,
							// beginDate: oInterval.beginDate,
							// endDate: oInterval.endDate
						// }, _this);
					// }
				}
			};
			(new L.Draggable(lScroll))
				.on('dragend ', dragend, this)
				.on('drag', function (ev) {
					var target = ev.target,
						x = target._newPos.x,
						x2 = wScroll.clientWidth + L.DomUtil.getPosition(rScroll).x;
					
					if (x < 0) { x = 0; }
					else if (x2 - x < 10) { x = x2 - 10; }
					var	point = new L.Point(x, 0);
					L.DomUtil.setPosition(lScroll, point);
					cScroll.style.width = (x2 - x - 24) + 'px';
					L.DomUtil.setPosition(cScroll, point);
				})
				.enable(),
			(new L.Draggable(rScroll))
				.on('dragend ', dragend, this)
				.on('drag', function (ev) {
					var target = ev.target,
						x = target._newPos.x,
						x1 = wScroll.clientWidth - L.DomUtil.getPosition(lScroll).x;
					
					if (x > 0) { x = 0; }
					else if (x1 + x < 10) { x = 10 - x1; }
					L.DomUtil.setPosition(rScroll, new L.Point(x, 0));
					cScroll.style.width = (x1 + x - 24) + 'px';
				})
				.enable();

			if (map.gmxControlsManager) {
				map.gmxControlsManager.add(this);
			}
			this._sidebarOn = true;
			map
				// .on('layeradd', function(ev) {
					// if (ev.layer instanceof L.gmx.VectorLayer) {
						// this.layerAdd(ev.layer);
					// }
				// }, this)
				// .on('layerremove', function(ev) {
					// if (ev.layer instanceof L.gmx.VectorLayer) {
						// var gmxLayer = ev.layer,
							// opt = gmxLayer.getGmxProperties();
						// map.removeLayer(gmxLayer);
						// gmxLayer
							// .removeFilter()
							// .off('dateIntervalChanged', this._dateIntervalChanged, this);
					// }
				// }, this)
				.on('moveend', this._moveend, this);

			return container;
		}
	});

	L.control.gmxTimeline = function (options) {
	  return new L.Control.GmxTimeline(options);
	};

    var publicInterface = {
        pluginName: pluginName,

        afterViewer: function (params, map) {
			if (window.nsGmx) {
				var options = {},
					nsGmx = window.nsGmx,
					layersByID = nsGmx.gmxMap.layersByID;

				if (params.moveable) { options.moveable = params.moveable === 'false' ? false : params.moveable; }
				if (nsGmx.widgets && nsGmx.commonCalendar) {
					calendar = nsGmx.commonCalendar;
				}
				iconLayers = nsGmx.leafletMap.gmxControlsManager.get('iconLayers');

				timeLineControl = L.control.gmxTimeline(options)
					.on('dateInterval', function (ev) {
						var d1 = ev.beginDate,
							d2 = ev.endDate,
							gmxLayer = layersByID[ev.layerID];

						// console.log('dateInterval__', d1.toGMTString(), d2.toGMTString(), ev.layerID);
						if (map.hasLayer(gmxLayer) && calendar) {
							calendar.setDateInterval(d1, d2, gmxLayer);
						} else {
							gmxLayer.setDateInterval(d1, d2);
						}
					})
					.on('click', function (ev) {
						layersByID[ev.layerID].repaint();
					});

				map.addControl(timeLineControl);
				nsGmx.timeLineControl = timeLineControl;
				// nsGmx.gmxMap.layers.forEach(function (gmxLayer) {
					// if (map.hasLayer(gmxLayer)) {
						// timeLineControl.layerAdd(gmxLayer);
					// }
				// });
				var title = 'Добавить к Таймлайну';
				if (nsGmx.Translations) {
					var translations = nsGmx.Translations;
					translations.addText('rus', {'gmxTimeLine': {
						contextMemuTitle: title
					}});
					translations.addText('eng', {'gmxTimeLine': {
						contextMemuTitle: 'Add to TimeLine'
					}});
					title = translations.getText('gmxTimeLine.contextMemuTitle');
				}
				nsGmx.ContextMenuController.addContextMenuElem({
					title: function() { return title; },
					isVisible: function(context) {
						return !context.layerManagerFlag && 
								context.elem.type == "Vector" &&
								context.elem.Temporal;
								// &&
								// context.elem.GeometryType !== 'point';
					},
					clickCallback: function(context) {
						this.layerAdd(context.elem.name);
					}.bind(this)
				}, 'Layer');

				if (window._mapHelper) {
					_mapHelper.customParamsManager.addProvider({
						name: pluginName,
						loadState: function(state) {
// console.log('loadState__', arguments);
							publicInterface.loadState(state, map);
						},
						saveState: publicInterface.saveState
					});
				} else if (params.state) {
					publicInterface.loadState(params.state, map);
				}
				return timeLineControl;
			}
        },
        layerAdd: function(layerID) {
			var gmxLayer = nsGmx.gmxMap.layersByID[layerID];
			if (gmxLayer) {
				nsGmx.timeLineControl.layerAdd(gmxLayer);
			}
			return this;
        },
        loadState: function(state, map) {
			if (state.dataSources) {
				var layersByID = nsGmx.gmxMap.layersByID;
				state.dataSources.forEach(function (it) {
					var gmxLayer = layersByID[it.layerID];
					if (gmxLayer) {
						var data = getDataSource(it.layerID);
						if (data) {
							data.oInterval = {
								beginDate: new Date(it.oInterval.beginDate),
								endDate: new Date(it.oInterval.endDate)
							};
							if (it.dInterval) {
								data.dInterval = {
									beginDate: new Date(it.dInterval.beginDate),
									endDate: new Date(it.dInterval.endDate)
								};
							}
							data.selected = it.selected;
							timeLineControl.addDataSource(data);
							gmxLayer.setFilter(filter.bind(gmxLayer));
						}
					}
				});
				if (state.currentTab) {
					timeLineControl.setCurrentTab(state.currentTab);
				}
			}
        },
        saveState: function() {
			return timeLineControl.saveState();
        },
        unload: function() {
            var lmap = window.nsGmx.leafletMap,
                gmxControlsManager = lmap.gmxControlsManager,
                gmxTimeline = gmxControlsManager.get('gmxTimeline');

			gmxControlsManager.remove(gmxTimeline);
        }
    };

    if (window.gmxCore) {
		window.gmxCore.addModule(pluginName, publicInterface, {
			css: 'L.Control.gmxTimeLine.css',
			init: function(module, path) {
				var filePrefix = path + timeLinePrefix + timeLineType,
					def = $.Deferred();
				gmxCore.loadScriptWithCheck([
					{
						check: function(){ return window.links; },
						script: filePrefix + '.js',
						css: filePrefix + '.css'
					}
				]).done(function() {
					def.resolve();
				});
				
				return def;
			}
		});
	} else {
		window.nsGmx[pluginName] = publicInterface;
	}
})();
