(function () {
    'use strict';

	window.nsGmx = window.nsGmx || {};
    var timeLineControl,
		focuse = false,
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
		currentLayerID,
		currentDmID,

		getDataSource = function (gmxLayer) {
			// var gmxLayer = nsGmx.gmxMap.layersByID[id];
			var state = null;
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
						var cInterval;
						if (calendar) {
							cInterval = calendar.getDateInterval().attributes;
						} else {
							var cDate = new Date();
							cInterval = {
								dateBegin: cDate,
								dateEnd: new Date(cDate.valueOf() + 1000 * 60 * 60 * 24)
							};
						}
						dInterval = {
							beginDate: cInterval.dateBegin,
							endDate: cInterval.dateEnd
						};
					}
					
					state = {
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
									utm = Number(arr[tmpKeyNum]);
								if (timeColumnName) { utm += arr[timeKeyNum] + tzs; }
								this.cache[utm] = 1 + (this.cache[utm] || 0);
								if (state.needResort && state.clickedUTM === utm) {
									state.needResort[state.needResort.length] = it.id;
								}
							},
							callback: function(data) {
								var out = this.cache || {};
								this.cache = {};
								if (state.needResort) {
									gmxLayer.setReorderArrays(state.needResort);
									state.needResort = null;
								}
								gmxLayer.repaint();
								return out;
							}
						})
					};
					// gmxLayer.repaintObservers[state.observer.id] = true;
				}
			}
			return state;
		};

	L.Control.GmxTimeline = L.Control.extend({
		includes: L.Mixin.Events,
		options: {
			position: 'bottom',
			id: 'gmxTimeline',
			className: 'gmxTimeline',
			modeSelect: 'range',	// selected
			groups: false,
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
						clickedUTM: state.clickedUTM,
						skipUnClicked: state.skipUnClicked,
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

		clearTab: function (id) {
			if (this._state.data[id]) {
				this._state.data[id].observer.deactivate();
				delete this._state.data[id];	// При удалении tab забываем о слое
			}
		},

		_removeLayerTab: function (liItem) {
			var layersTab = this._containers.layersTab;
			layersTab.removeChild(liItem);
			this.clearTab(liItem._layerID);
			if (layersTab.children.length === 0) {
				currentDmID = null;
				L.DomUtil.addClass(this._container, 'gmx-hidden');
				if (iconLayers) {
					L.DomUtil.removeClass(iconLayers.getContainer(), 'iconLayersShift');
				}
			} else {
				this._setCurrentTab((liItem.nextSibling || layersTab.lastChild)._layerID);
			}
		},

		_addLayerTab: function (layerID, title) {
			var layersTab = this._containers.layersTab,
				liItem = L.DomUtil.create('li', 'selected', layersTab),
				span = L.DomUtil.create('span', '', liItem),
				closeButton = L.DomUtil.create('span', 'close-button', liItem),
				stop = L.DomEvent.stopPropagation;

			liItem._layerID = layerID;
			span.innerHTML = title;

			L.DomEvent
				.on(closeButton, 'click', stop)
				.on(closeButton, 'click', function (ev) {
					this._removeLayerTab(liItem);
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
					this._bboxUpdate();
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
			map
				.off('moveend', this._moveend, this)
				.off('focus', this._unsetFocuse, this)
				.off('blur', this._setFocuse, this);
			L.DomEvent
				.off(document, 'keydown', this._keydown, this);

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
				type = timeLineType === 'timeline' ? 'dot' : 'point',
				selected = [],
				res = [],
				needGroup = this.options.groups,
				state = this._state,
				groupInterval = [state.maxDate, state.zeroDate],
				data = this.getCurrentState(),
				dInterval = data.dInterval || data.oInterval,
				beginDate = dInterval.beginDate.valueOf() / 1000,
				endDate = dInterval.endDate.valueOf() / 1000,
				clickedUTM = String(data.clickedUTM),
				dSelected = data.selected || {};

			for (var utm in data.items) {
				var start = new Date(utm * 1000 + tzm),
					item = {
						id: count,
						type: type,
						items: data.items[utm],
						// group: currentDmID,
						// title: it[0].toString(),
						content: '',
						utm: utm,
						start: start
					};
				if (needGroup) {
					item.group = currentDmID;
				}
				// if (utm >= beginDate && utm < endDate) {
					// item.className = 'timeline-event-selected';
				// }

				groupInterval[0] = Math.min(start, groupInterval[0]);
				groupInterval[1] = Math.max(start, groupInterval[1]);
				var className = clickedUTM === utm ? 'item-clicked' : '';
				if (dSelected[utm]) {
					className += ' item-selected';
					selected.push(count);
				}
				item.className = className;
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
			if (selected.length) {
				this._timeline.setSelection(selected);
			} else {
				this._chkSelection(data);
			}
		},

		_chkSelection: function (state) {
			if (!state.selected) {
				var dInterval = state.dInterval || state.oInterval,
					beginDate = new Date(dInterval.beginDate.valueOf() + tzm),
					endDate = new Date(dInterval.endDate.valueOf() + tzm);

				this._timeline.items.forEach(function(it) {
					if (it.dom) {
						if (it.start >= beginDate && it.start < endDate) {
							L.DomUtil.addClass(it.dom, 'item-selected');
						} else {
							L.DomUtil.removeClass(it.dom, 'item-selected');
						}
					}
				});
			}
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
		},

		_rangechanged: function (ev) {
			var state = this.getCurrentState();
			state.oInterval = {beginDate: ev.start, endDate: ev.end};
			state.dInterval = null;
			this.fire('dateInterval', {
				layerID: state.layerID,
				beginDate: state.oInterval.beginDate,
				endDate: state.oInterval.endDate
			}, this);
			
			this._setDateScroll();
			this._bboxUpdate();
		},

		_clickOnTimeline: function (ev) {
			var tl = this._timeline,
				state = this.getCurrentState();

			// if (ev && ev.originalEvent.shiftKey) {
			if (ev) {
				var observer = state.observer,
					dm = state.gmxLayer.getDataManager(),
					it = tl.getItem(ev.index),
					utm = Number(it.utm);

				state.clickedUTM = state.clickedUTM === utm ? null : utm;
				if (state.clickedUTM) {
					state.needResort = [];
					observer.activate();
					observer.needRefresh = true;
					dm.checkObserver(observer);
				}
				this._redrawTimeline();
			} else {
				var selectedPrev = state.selected || {},
					selected = {};

				tl.getSelection().forEach(function (it, i) {
					var	pt = tl.getItem(it.row),
						utm = Number(pt.utm);
						
					if (selectedPrev[utm]) {
						delete selectedPrev[utm];
					} else {
						selected[utm] = true;
					}
				});
				for (var key in selectedPrev) {
					selected[key] = true;
				}
				if (Object.keys(selected).length) {
					state.selected = selected;
				} else {
					delete state.selected;
				}
				this._bboxUpdate();
			}
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
			var state = this.getCurrentState();
			state.oInterval = state.gmxLayer.getDateInterval();
			if (state.dInterval && (state.dInterval.beginDate.valueOf() < state.oInterval.beginDate.valueOf() || state.dInterval.endDate.valueOf() > state.oInterval.endDate.valueOf())) {
				state.dInterval.beginDate = state.oInterval.beginDate;
				state.dInterval.endDate = state.oInterval.endDate;
			}

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

		removeLayer: function (gmxLayer) {
			var opt = gmxLayer.getGmxProperties(),
				layerID = opt.name,
				data = getDataSource(gmxLayer);
			if (data) {
				gmxLayer
					.removeLayerFilter({type: 'screen', id: pluginName})
					.off('dateIntervalChanged', this._dateIntervalChanged, this);
				var layersTab = this._containers.layersTab;
				for (var i = 0, len = layersTab.children.length; i < len; i++) {
					var li = layersTab.children[i];
					if (li._layerID === layerID) {
						this._removeLayerTab(li);
						break;
					}
				}
			}
			return this;
		},

		addLayer: function (gmxLayer, options) {
			var opt = gmxLayer.getGmxProperties(),
				data = getDataSource(gmxLayer);
			if (data) {
				if (options) {
					if (options.oInterval) {
						data.oInterval = {
							beginDate: new Date(options.oInterval.beginDate),
							endDate: new Date(options.oInterval.endDate)
						};
					}
					if (options.dInterval) {
						data.dInterval = {
							beginDate: new Date(options.dInterval.beginDate),
							endDate: new Date(options.dInterval.endDate)
						};
					}
					data.selected = options.selected;
					if (options.clickedUTM) {
						data.clickedUTM = options.clickedUTM;
					}
					if (options.skipUnClicked) {
						data.skipUnClicked = options.skipUnClicked;
					}
				}

				gmxLayer
					.on('dateIntervalChanged', this._dateIntervalChanged, this)
					.on('click', function (ev) {
						var state = this._state.data[opt.name] || {},
							it = ev.gmx.target,
							dt = it.properties[state.tmpKeyNum];

						state.clickedUTM = dt;
						this._redrawTimeline();
					}, this)
					.addLayerFilter(function (it) {
						var state = this._state.data[opt.name] || {},
							dt = it.properties[state.tmpKeyNum];

						if (state.skipUnClicked) {
							return state.clickedUTM === dt;
						} else if (state.selected) {
							return state.selected[dt];
						} else if (modeSelect === 'range') {
							var uTimeStamp = state.uTimeStamp || [0, 0];
							if (dt < uTimeStamp[0] || dt > uTimeStamp[1]) {
								return false;
							}
						}
						return true;
					}.bind(this)
					, {target: 'screen', id: pluginName});

				this.addDataSource(data);
			}
		},

		_dateIntervalChanged: function (ev) {
			var gmxLayer = ev.target,
				state = this.getCurrentState(),
				opt = gmxLayer.getGmxProperties(),
				dInterval = gmxLayer.getDateInterval();

			if (state && state.layerID === opt.name && dInterval.beginDate) {
				state.oInterval = {
					beginDate: dInterval.beginDate,
					endDate: dInterval.endDate
				};
				state.uTimeStamp = [dInterval.beginDate.getTime()/1000, dInterval.endDate.getTime()/1000];
				if (!this.options.moveable) {
					delete state.dInterval;
				}
				if (this._timeline) {
					this._setWindow(dInterval);
				}
				this._setDateScroll();
				this._bboxUpdate();
			}
		},

		_keydown: function (ev) {
			if (!this._map || this._map.keyboard._focused) { return; }
			this._setFocuse();

			var state = this.getCurrentState(),
				clickedUTM = String(state.clickedUTM);
			if (clickedUTM) {
				var tl = this._timeline,
					arr = tl.getData(),
					key = ev.key;
				for (var i = 0, len = arr.length - 1; i <= len; i++) {
					if (arr[i].utm === clickedUTM) {
						if (key === 'ArrowLeft') {
							clickedUTM = arr[i > 0 ? i - 1 : ( i === 0 ? len : 0)].utm;
						} else if (key === 'ArrowRight') {
							clickedUTM = arr[i >= len ? 0 : i + 1].utm;
						} else if (key === ' ') {
							state.skipUnClicked = !state.skipUnClicked;
						}
						state.clickedUTM = Number(clickedUTM);
						state.needResort = [];
						var observer = state.observer,
							dm = state.gmxLayer.getDataManager();
						observer.activate();
						observer.needRefresh = true;
						dm.checkObserver(observer);
						break;
					}
				}
			}
		},

		_setFocuse: function () {
			focuse = true;
			L.DomUtil.addClass(this._containers.internalContainer, 'gmx-focuse');
		},

		_unsetFocuse: function () {
			focuse = false;
			L.DomUtil.removeClass(this._containers.internalContainer, 'gmx-focuse');
		},

		onAdd: function (map) {
			var container = this._container = L.DomUtil.create('div', this.options.className + ' gmx-hidden'),
				stop = L.DomEvent.stopPropagation;

			L.DomEvent
				.on(document, 'keydown', this._keydown, this);
			map
				.on('focus', this._unsetFocuse, this)
				.on('blur', this._setFocuse, this);

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
			container.innerHTML = str + '<div class="vis-container"><div class="tabs"><ul class="layers-tab"></ul></div><div class="internal-container"><div class="w-scroll"><div class="g-scroll"></div><div class="c-scroll"><div class="c-borders"></div></div><div class="l-scroll"><div class="l-scroll-title gmx-hidden"></div></div><div class="r-scroll"><div class="r-scroll-title gmx-hidden"></div></div></div><div class="vis"></div></div></div>';
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
				internalContainer = container.getElementsByClassName('internal-container')[0],
				layersTab = container.getElementsByClassName('layers-tab')[0];
			this._containers = {
				vis: container.getElementsByClassName('vis')[0],
				internalContainer: internalContainer,
				layersTab: layersTab,
				hideButton: hideButton,
				lScroll: lScroll,
				rScroll: rScroll,
				cScroll: cScroll
			};

			L.DomEvent
				.on(hideButton, 'click', function (ev) {
					var isVisible = !L.DomUtil.hasClass(visContainer, 'gmx-hidden'),
						iconLayersCont = iconLayers ? iconLayers.getContainer() : null,
						xTop = '0px';
					if (isVisible) {
						L.DomUtil.addClass(visContainer, 'gmx-hidden');
						if (iconLayersCont) {
							L.DomUtil.removeClass(iconLayersCont, 'iconLayersShift');
						}
						useSvg.setAttribute('href', '#arrow-up-01');
					} else {
						L.DomUtil.removeClass(visContainer, 'gmx-hidden');
						if (iconLayersCont) {
							L.DomUtil.addClass(iconLayersCont, 'iconLayersShift');
							xTop = '-10px';
						}
						useSvg.setAttribute('href', '#arrow-down-01');
						this._redrawTimeline();
					}
					hideButton.style.top = xTop;
					this._state.isVisible = isVisible;
				}, this);
				if (iconLayers) {
					hideButton.style.top = '-10px';
				}

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
						state.uTimeStamp = [state.dInterval.beginDate.getTime()/1000, state.dInterval.endDate.getTime()/1000];
						_this.fire('click', {
							layerID: state.layerID,
							beginDate: state.dInterval.beginDate,
							endDate: state.dInterval.endDate
						}, _this);
						_this._chkSelection(state);
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
					this._chkSelection(state);
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
						// this.addLayer(ev.layer);
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

			if (!map.keyboard._focused) { this._setFocuse(); }

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
				if (params.gmxMap && !window.nsGmx.gmxMap) { window.nsGmx.gmxMap = params.gmxMap; }
				var options = {},
					nsGmx = window.nsGmx,
					layersByID = nsGmx.gmxMap.layersByID;

				if (params.moveable) { options.moveable = params.moveable === 'false' ? false : params.moveable; }
				if (nsGmx.widgets && nsGmx.commonCalendar) {
					calendar = nsGmx.commonCalendar;
				}
				iconLayers = map.gmxControlsManager.get('iconLayers');

				timeLineControl = L.control.gmxTimeline(options)
					.on('dateInterval', function (ev) {
						var d1 = ev.beginDate,
							d2 = ev.endDate,
							gmxLayer = layersByID[ev.layerID];

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
						// timeLineControl.addLayer(gmxLayer);
					// }
				// });
				var title = 'Добавить в таймлайн';
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
				if (nsGmx.ContextMenuController) {
					nsGmx.ContextMenuController.addContextMenuElem({
						title: function() { return title; },
						isVisible: function(context) {
							return !context.layerManagerFlag && 
									context.elem.type == "Vector" &&
									context.elem.Temporal;
						},
						clickCallback: function(context) {
							this.layerAdd(context.elem.name);
						}.bind(this)
					}, 'Layer');
				}

				if (window._mapHelper) {
					_mapHelper.customParamsManager.addProvider({
						name: pluginName,
						loadState: function(state) {
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
        removeLayer: function(gmxLayer) {
			nsGmx.timeLineControl.removeLayer(gmxLayer);
			return this;
        },
        addLayer: function(gmxLayer) {
			nsGmx.timeLineControl.addLayer(gmxLayer);
			return this;
        },
        layerRemove: function(layerID) {
			var gmxLayer = nsGmx.gmxMap.layersByID[layerID];
			if (gmxLayer) {
				this.removeLayer(gmxLayer);
			}
			return this;
        },
        layerAdd: function(layerID) {
			var gmxLayer = nsGmx.gmxMap.layersByID[layerID];
			if (gmxLayer) {
				this.addLayer(gmxLayer);
			}
			return this;
        },
        loadState: function(state, map) {
			if (state.dataSources) {
				var layersByID = nsGmx.gmxMap.layersByID;
				state.dataSources.forEach(function (it) {
					var gmxLayer = layersByID[it.layerID];
					if (gmxLayer) {
						timeLineControl.addLayer(gmxLayer, it);
						// var data = getDataSource(gmxLayer);
						// if (data) {
							// data.oInterval = {
								// beginDate: new Date(it.oInterval.beginDate),
								// endDate: new Date(it.oInterval.endDate)
							// };
							// if (it.dInterval) {
								// data.dInterval = {
									// beginDate: new Date(it.dInterval.beginDate),
									// endDate: new Date(it.dInterval.endDate)
								// };
							// }
							// data.selected = it.selected;
							// timeLineControl.addDataSource(data);
							// gmxLayer.addLayerFilter(filter.bind(gmxLayer), {type: 'screen', id: pluginName});
						// }
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
