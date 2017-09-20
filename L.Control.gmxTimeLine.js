(function () {
    'use strict';

	window.nsGmx = window.nsGmx || {};
    var timeLineControl,
		calendar,
		iconLayers,
		timeClass,
		timeLineType = 'timeline',	// vis timeline vis-timeline
		timeLinePrefix = '../../timeline/2.9.1/',
        pluginName = 'gmxTimeLine',
		filesToLoad = null,
		promisesArr = null,
		tzs = (new Date()).getTimezoneOffset() * 60,
		// tzs = 0,
		tzm = tzs * 1000,
		ns = {},
		zeroDate = new Date(1980, 0, 1),
		modeSelect = 'range',
		translate = {
			modeSelectedOff: 'By all',
			modeSelectedOn: 'By selected'
		},
		currentLayerID,
		currentDmID,
		currentDmIDPermalink,
		singleIntervalFlag,

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
						cloudsKey = dmOpt.MetaProperties.clouds ? dmOpt.MetaProperties.clouds.Value : '',
						clouds = dm.tileAttributeIndexes[cloudsKey] || dm.tileAttributeIndexes.clouds || dm.tileAttributeIndexes.CLOUDS || null,
						dInterval = gmxLayer.getDateInterval(),
						opt = gmxLayer.getGmxProperties(),
						type = (opt.GeometryType || 'point').toLowerCase(),
						oneDay = 1000 * 60 * 60 * 24;

					dInterval = {
						beginDate: new Date(opt.DateBeginUTC * 1000 - oneDay),
						endDate: new Date((1 + opt.DateEndUTC) * 1000 + oneDay)
					};
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
						clouds: clouds,
						modeBbox: type === 'polygon' ? 'center' : 'thirdpart',
						TemporalColumnName: dmOpt.TemporalColumnName,
						temporalColumnType: dm.temporalColumnType,
						// dInterval: dInterval,
						oInterval: dInterval,
						uTimeStamp: [dInterval.beginDate.getTime()/1000, dInterval.endDate.getTime()/1000]
						,
						observer: dm.addObserver({
							type: 'resend',
							filters: ['clipFilter', 'userFilter', 'userFilter_timeline', 'styleFilter'],
							active: false,
							layerID: opt.name,
							itemHook: function(it) {
								if (!this.cache) { this.cache = {}; }
								var arr = it.properties;
								if (state.clouds && arr[state.clouds] > Number(timeLineControl._containers.cloudSelect.selectedOptions[0].value)) {
									return false;
								}

								if (this.intersectsWithGeometry(arr[arr.length - 1])) {
									var utm = Number(arr[tmpKeyNum]);
									if (timeColumnName) { utm += arr[timeKeyNum] + tzs; }
									this.cache[utm] = 1 + (this.cache[utm] || 0);
									if (state.needResort && state.clickedUTM === utm) {
										state.needResort[state.needResort.length] = it.id;
									}
								}
							},
							callback: function(data) {
								var out = this.cache || {};
// console.log('observer', opt.name, Object.keys(out).length);
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
				}
			}
			return state;
		};

	L.Control.GmxTimeline = L.Control.extend({
		includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,
		options: {
			position: 'bottom',
			id: 'gmxTimeline',
			className: 'gmxTimeline',
			locale: 'ru',
			rollClicked: false,		// режим кругового обхода для clickedUTM
			modeSelect: 'range',	// selected
			// modeBbox: 'thirdpart',		// screen, center, thirdpart
			centerBuffer: 10,		// буфер центра в пикселях
			groups: false,
			moveable: true
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
						modeBbox: state.modeBbox,
						rollClickedFlag: state.rollClickedFlag,
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
				this._map.removeControl(this);

			} else {
				this._setCurrentTab((liItem.nextSibling || layersTab.lastChild)._layerID);
			}
			this.fire('layerRemove', { layerID: liItem._layerID }, this);
		},

		_addLayerTab: function (layerID, title) {
			var layersTab = this._containers.layersTab,
				liItem = L.DomUtil.create('li', 'selected', layersTab),
				spaneye = L.DomUtil.create('span', 'eye', liItem),
				span = L.DomUtil.create('span', '', liItem),
				closeButton = L.DomUtil.create('span', 'close-button', liItem),
				stop = L.DomEvent.stopPropagation,
				gmxLayer = this._state.data[layerID].gmxLayer,
				chkVisible = function (flag) {
					liItem._eye = flag;
					var off = liItem._eye ? '' : '-off';
					spaneye.innerHTML = '<svg role="img" class="svgIcon is' + off + '"><use xlink:href="#transparency-eye' + off + '"></use></svg>';
				};

			liItem._eye = true;
			liItem._layerID = layerID;
			span.innerHTML = title;

			L.DomEvent
				.on(closeButton, 'click', stop)
				.on(closeButton, 'click', function (ev) {
					this._removeLayerTab(liItem);
			}, this);

			L.DomEvent
				.on(spaneye, 'click', stop)
				.on(spaneye, 'click', function (ev) {
					var state = this.getCurrentState();
					if (state.layerID === layerID) {
						chkVisible(!liItem._eye)
						if (liItem._eye) {
							if (!gmxLayer._map) { this._map.addLayer(gmxLayer); }
						} else {
							if (gmxLayer._map) { this._map.removeLayer(gmxLayer); }
						}
					}
			}, this);
			gmxLayer
				.on('add', function () { chkVisible(true); }, this)
				.on('remove', function () { chkVisible(false); }, this);

			chkVisible(gmxLayer._map ? true : false);
			this.fire('currentTabChanged', {currentTab: layerID});
			this.fire('layerAdd', { layerID: layerID }, this);
			return liItem;
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
				dataSource.liItem = pDataSource ? pDataSource.liItem : this._addLayerTab(layerID, dataSource.title || '');

				if (dataSource.observer) {
					dataSource.observer.on('data', function(ev) {
						var state = this.getCurrentState(),
							tLayerID = ev.target.layerID;

						this._state.data[tLayerID].items = ev.data;
						if (tLayerID === state.layerID) {
							this._redrawTimeline();
						}
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

		_addKeyboard: function (map) {
			map = map || this._map;
			if (map && map.keyboard) {
				map.keyboard.disable();
				// this._map.dragging.disable();
			}
		},

		_removeKeyboard: function (map) {
			map = map || this._map;
			if (map && map.keyboard) {
				map.keyboard.enable();
			}
			map._container.blur();
			map._container.focus();
		},

		onRemove: function (map) {
			if (map.gmxControlsManager) {
				map.gmxControlsManager.remove(this);
			}
			map
				.off('moveend', this._moveend, this);

			L.DomEvent
				.off(document, 'keyup', this._keydown, this);

			this._removeKeyboard(map);
			map.fire('controlremove', this);
		},

		_moveend: function () {
			if (this._sidebarOn) {
				this._bboxUpdate();
			}
		},

		_bboxUpdate: function () {
			if (currentDmID && this._map) {
				this._triggerObserver(this.getCurrentState());
			}
		},

		_triggerObserver: function (state) {
			var map = this._map,
				sw, ne, delta;

			if (state.modeBbox === 'center')	{
				var cp = map._getCenterLayerPoint(),
					buffer = this.options.centerBuffer;
				delta = [buffer, buffer];
				sw = map.layerPointToLatLng(cp.subtract(delta)),
				ne = map.layerPointToLatLng(cp.add(delta));
			} else {
				var sbox = map.getPixelBounds();
				delta = [(sbox.max.x - sbox.min.x) / 6, (sbox.min.y - sbox.max.y) / 6];
				sw = map.unproject(sbox.getBottomLeft().add(delta)),
				ne = map.unproject(sbox.getTopRight().subtract(delta));
			}

			var bounds = L.gmxUtil.bounds([
				[sw.lng, sw.lat],
				[ne.lng, ne.lat]
			]);
			// state.observer.deactivate();
			state.currentBounds = bounds;
			state.observer.setBounds(bounds);
			state.observer.setDateInterval(state.oInterval.beginDate, state.oInterval.endDate);
			state.observer.activate();
		},

		_redrawTimeline: function () {
			var count = 0,
				type = 'dot',
				selected = [],
				res = [],
				needGroup = this.options.groups,
				state = this._state,
				groupInterval = [state.maxDate, state.zeroDate],
				data = this.getCurrentState(),
				dInterval = data.dInterval || data.oInterval,
				beginDate = dInterval.beginDate.valueOf() / 1000,
				endDate = dInterval.endDate.valueOf() / 1000,
				clickedUTM = String(data.clickedUTM || ''),
				dSelected = data.selected || {},
				maxUTM = 0;

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

				groupInterval[0] = Math.min(start, groupInterval[0]);
				groupInterval[1] = Math.max(start, groupInterval[1]);
				var className = '';
				if (utm > maxUTM) {
					maxUTM = utm;
				}
				if (clickedUTM === utm) {
					className = 'item-clicked';
				}

				if (dSelected[utm]) {
					className += ' item-selected';
				}
				item.className = className;
				res.push(item);
				count++;
			}
			if (!clickedUTM && maxUTM) {
				data.clickedUTM = Number(maxUTM);
				data.skipUnClicked = true;
			}
			if (count && needGroup) {
				res.push({id: 'background_' + currentDmID, start: groupInterval[0], end: groupInterval[1], type: 'background', className: 'negative',group:currentDmID});
				count++;
			}
			if (!this._timeline) {
				this._initTimeline(res);
			}
			this._timeline.clearItems();
			this._setWindow(data.oInterval);
			this._timeline.setData(res);

			this._chkSelection(data);

			var cont = this._containers,
				clickCalendar = cont.clickCalendar;
			if (data.clickedUTM && maxUTM) {
				var tm = this._timeline.getUTCTimeString(new Date(1000 * data.clickedUTM)),
					arr = tm.split(' '),
					arr1 = arr[1].split(':');
				// clickId.innerHTML = this._timeline.getUTCTimeString(new Date(1000 * data.clickedUTM)) + ' (' + clickIdCount + ')';
				cont.clickId.innerHTML = arr[0];
				cont.clickIdTime.innerHTML = arr1[0] + ':' + arr1[1];
				L.DomUtil.removeClass(clickCalendar, 'disabled');
			} else {
				cont.clickId.innerHTML = '--.--.----';
				cont.clickIdTime.innerHTML = '--:--';
				L.DomUtil.addClass(clickCalendar, 'disabled');
			}
		},

		_setWindow: function (dInterval) {
			if (this._timeline) {
				var setWindow = this._timeline.setWindow ? 'setWindow' : 'setVisibleChartRange';
				this._timeline[setWindow](dInterval.beginDate, dInterval.endDate, false);
			}
		},

		_chkSelection: function (state) {
			var dInterval = state.dInterval || state.oInterval,
				beginDate = new Date(dInterval.beginDate.valueOf() + tzm),
				endDate = new Date(dInterval.endDate.valueOf() + tzm),
				clickedUTM = state.clickedUTM ? String(state.clickedUTM) : null,
				lastDom = null;

			this._timeline.items.forEach(function(it) {
				if (it.dom && it.dom.parentNode) {
					lastDom = it.dom;
					if (!clickedUTM) {
						if (it.start >= beginDate && it.start < endDate) {
							L.DomUtil.addClass(lastDom, 'item-range');
						} else {
							L.DomUtil.removeClass(lastDom, 'item-range');
						}
					}
				}
				if (clickedUTM === it.utm && lastDom) {
					L.DomUtil.addClass(lastDom, 'item-clicked');
				}
			});
		},

		_setEvents: function (tl) {
			var events = L.gmx.timeline.events;
			events.addListener(tl, 'rangechange', this._rangechanged.bind(this));
			events.addListener(tl, 'rangechanged', this._rangechanged.bind(this));
			events.addListener(tl, 'select', this._clickOnTimeline.bind(this));
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

		_copyState: function (stateTo, stateFrom) {
			stateTo.oInterval.beginDate = stateFrom.oInterval.beginDate;
			stateTo.oInterval.endDate = stateFrom.oInterval.endDate;
			stateTo.uTimeStamp[0] = stateFrom.uTimeStamp[0];
			stateTo.uTimeStamp[1] = stateFrom.uTimeStamp[1];
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
			var stateBefore = this.getCurrentState();

			currentDmID = layerID;
			var state = this.getCurrentState();
			state.oInterval = state.gmxLayer.getDateInterval();
			if (state.dInterval && (state.dInterval.beginDate.valueOf() < state.oInterval.beginDate.valueOf() || state.dInterval.endDate.valueOf() > state.oInterval.endDate.valueOf())) {
				state.dInterval.beginDate = state.oInterval.beginDate;
				state.dInterval.endDate = state.oInterval.endDate;
			}
			if (singleIntervalFlag && stateBefore) {
				this._copyState(state, stateBefore);
			}

			this.fire('currentTabChanged', {currentTab: layerID});
			this._bboxUpdate();
			if (this._timeline) {
				this._setWindow(state.oInterval);
			}
			this._setDateScroll();

			if (Object.keys(state.selected || {}).length > 1) {
				L.DomUtil.removeClass(this._containers.switchDiv, 'disabled');
			}
			if (state.clouds) {
				L.DomUtil.removeClass(this._containers.cloudsContent, 'disabled');
			} else {
				L.DomUtil.addClass(this._containers.cloudsContent, 'disabled');
			}

			if (state.rollClickedFlag) {
				this._chkRollClickedFlag(state);
			}
			L.gmx.layersVersion.now();
		},

		initialize: function (options) {
			L.Control.prototype.initialize.call(this, options);
			this._commandKeys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Down', 'Up', 'Left', 'Right', ' ', 's'];

			this._state = {
				data: {},
				timeLineOptions: {
					locale: options.locale,
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
					options = this._state.timeLineOptions;

				if (state.oInterval) {
					options.start = state.oInterval.beginDate;
					options.end = state.oInterval.endDate;
				}
				this._containers.vis.innerHTML = '';

				this._timeline = new L.gmx.timeline.Timeline(this._containers.vis, options);
				var c = this._timeline.getCurrentTime();
				this._timeline.setCurrentTime(new Date(c.valueOf() + c.getTimezoneOffset() * 60000));
				this._timeline.draw(data);
				this._setEvents(this._timeline);
			}
		},

		removeLayer: function (gmxLayer) {
			var opt = gmxLayer.getGmxProperties(),
				layerID = opt.name,
				data = getDataSource(gmxLayer);
			if (data) {
				gmxLayer
					.removeLayerFilter({type: 'screen', id: pluginName});
					// .off('dateIntervalChanged', this._dateIntervalChanged, this);
				var layersTab = this._containers.layersTab;
				for (var i = 0, len = layersTab.children.length; i < len; i++) {
					var li = layersTab.children[i];
					if (li._layerID === layerID) {
						this._removeLayerTab(li);
						break;
					}
				}
			}
			if (this.options.moveable && calendar) { calendar.bindLayer(opt.name); }
			return this;
		},

		addLayer: function (gmxLayer, options) {
			var opt = gmxLayer.getGmxProperties(),
				data = getDataSource(gmxLayer);

			if (this.options.moveable && calendar) { calendar.unbindLayer(opt.name); }
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
						data.uTimeStamp = [data.dInterval.beginDate.getTime()/1000, data.dInterval.endDate.getTime()/1000];
					}
					data.selected = options.selected;
					if (options.clickedUTM) {
						data.clickedUTM = options.clickedUTM;
					}
					if (options.skipUnClicked) {
						data.skipUnClicked = options.skipUnClicked;
					}
					if (options.rollClickedFlag) {
						data.rollClickedFlag = options.rollClickedFlag;
					}
					if (options.modeBbox) {
						data.modeBbox = options.modeBbox;
					}
				}
				var stateBefore = this.getCurrentState();
				if (singleIntervalFlag && stateBefore) {
					this._copyState(data, stateBefore);
				}

				if (this.options.moveable) {
					gmxLayer.setDateInterval(data.oInterval.beginDate, data.oInterval.endDate);
					data.uTimeStamp = [data.oInterval.beginDate.getTime()/1000, data.oInterval.endDate.getTime()/1000];
					data.skipUnClicked = true;
				}
				gmxLayer
					.addLayerFilter(function (it) {
						var state = this._state.data[opt.name] || {},
							dt = it.properties[state.tmpKeyNum];

						if (state.clouds && it.properties[state.clouds] > Number(this._containers.cloudSelect.selectedOptions[0].value)) {
							return false;
						}
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

				if (filesToLoad && !promisesArr) {
					promisesArr = filesToLoad.map(function(href) {
						return L.gmxUtil.requestLink(href);
					});
				}
				Promise.all(promisesArr || []).then(function() {
					// console.log('Promise', arguments);
					this.addDataSource(data);
					if (currentDmIDPermalink) {
						this.setCurrentTab(currentDmIDPermalink);
						currentDmIDPermalink = null;
					}
				}.bind(this));
			}
		},

		_keydown: function (ev) {
			if (this._map && this._map.keyboard && !this._map.keyboard.enabled()) {
				this.setCommand(ev.key, ev.ctrlKey);
			}
		},

		setCommand: function (key, ctrlKey) {
			if (this._commandKeys.indexOf(key) !== -1) {

				var state = this.getCurrentState(),
					setClickedUTMFlag = true;

				if (state) {
					if (state.clickedUTM) {
						if (key === ' ') {
							state.skipUnClicked = !state.skipUnClicked;
							setClickedUTMFlag = false;
						} else if (key === 'ArrowUp' || key === 'Up') {
							this._addSelected(state.clickedUTM, state);
							setClickedUTMFlag = false;
						} else if (key === 'ArrowDown' || key === 'Down') {
							this._removeSelected(state.clickedUTM, state);
							setClickedUTMFlag = false;
						} else if (key === 's') {
							state.rollClickedFlag = !state.rollClickedFlag;
							this._chkRollClickedFlag(state);
						}
						if (setClickedUTMFlag) {
							var clickedUTM = String(state.clickedUTM),
								rollClicked = this.options.rollClicked,
								arr = [];
							if (state.selected && state.rollClickedFlag) {
								arr = Object.keys(state.selected).sort().map(function (it) { return {utm: it}});
							} else {
								arr = this._timeline.getData();
							}
							for (var i = 0, len = arr.length - 1; i <= len; i++) {
								if (Number(arr[i].utm) > state.clickedUTM) {
									break;
								}
							}

							if (key === 'ArrowLeft' || key === 'Left') {
								i = ctrlKey ? 0 : (i > 1 ? i - 2 : (rollClicked ? len : 0));
							} else if (key === 'ArrowRight' || key === 'Right') {
								i = ctrlKey ? len : (i < len ? i: (rollClicked ? 0 : len));
							} else if (key === 's') {
								i = i === 0 ? 0 : i - 1;
							}
							if (arr[i]) {
								state.clickedUTM = Number(arr[i].utm);
								this._setClassName(state.selected && state.selected[state.clickedUTM], this._containers.favorite, 'on');
							}
						}
					}
					this._chkObserver(state);
				}
			}
		},

		_chkObserver: function (state) {
			var observer = state.observer;
			observer.activate();
			observer.needRefresh = true;
			state.gmxLayer.getDataManager().checkObserver(observer);
		},

		_setClassName: function (flag, el, name) {
			var hasClass = L.DomUtil.hasClass(el, name);
			if (flag && !hasClass) {
				L.DomUtil.addClass(el, name);
			} else if (!flag && hasClass) {
				L.DomUtil.removeClass(el, name);
			}
		},

		_chkRollClickedFlag: function (state) {
			state = state || this.getCurrentState();
			var len = state.selected ? Object.keys(state.selected).length : 0;
			if (len < 2) {
				state.rollClickedFlag = false;
				this._setClassName(true, this._containers.switchDiv, 'disabled');
			} else {
				this._setClassName(false, this._containers.switchDiv, 'disabled');
			}
			this._setClassName(len > 0 && state.selected[state.clickedUTM], this._containers.favorite, 'on');
			this._setClassName(!state.rollClickedFlag, this._containers.modeSelectedOff, 'on');
			this._setClassName(state.rollClickedFlag, this._containers.modeSelectedOn, 'on');
		},

		_removeSelected: function (utm, state) {
			state = state || this.getCurrentState();
			if (utm) {
				delete state.selected[utm];
			} else {
				state.selected = null;
			}
			this._chkRollClickedFlag(state);
		},

		_addSelected: function (utm, state) {
			state = state || this.getCurrentState();
			if (!state.selected) { state.selected = {}; }
			state.selected[utm] = true;
			delete state.dInterval;
			state.uTimeStamp = [state.oInterval.beginDate.getTime()/1000, state.oInterval.endDate.getTime()/1000];
			this._chkRollClickedFlag(state);
		},

		_clickOnTimeline: function (ev) {
			var tl = this._timeline,
				state = this.getCurrentState();

			if (ev) {
				var it = tl.getItem(ev.index),
					ctrlKey = ev.originalEvent.ctrlKey,
					title = '',
					clickId = this._containers.clickId,
					utm = Number(it.utm);

				state.clickedUTM = utm;
				state.skipUnClicked = state.clickedUTM ? true : false;
				state.gmxLayer.repaint();
				this._setDateScroll();

				this._bboxUpdate();
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

		_addSvgIcon: function (id) {
			return '<svg role="img" class="svgIcon"><use xlink:href="#' + id + '"></use></svg>';
		},

		onAdd: function (map) {
			var container = this._container = L.DomUtil.create('div', this.options.className + ' gmx-hidden');

			L.DomEvent.on(container, 'selectstart', L.DomEvent.preventDefault);
			this._addKeyboard(map);
			container.tabindex = -1;

var str = '\
<div class="leaflet-gmx-iconSvg showButton gmx-hidden leaflet-control" title="">' + this._addSvgIcon('arrow-up-01') + '</div>\
<div class="vis-container">\
	<div class="tabs"><ul class="layers-tab"></ul></div>\
	<div class="internal-container">\
		<div class="w-scroll">\
			<div class="clicked el-left disabled"><div class="el-act on">по1 всем</div><div class="el-pass">по избранным</div></div>\
			<div class="el-center">\
				<span class="clicked click-left">' + this._addSvgIcon('arrow_left') + '</span>\
				<span class="clicked click-right">' + this._addSvgIcon('arrow_right') + '</span>\
				&nbsp;&nbsp;\
				<div class="el-act-cent-1">\
					<span class="favorite">' + this._addSvgIcon('tl-favorites') + '</span>\
					<span class="line">|</span>\
					<span class="trash">' + this._addSvgIcon('tl-trash') + '</span>\
				</div>\
				&nbsp;&nbsp;\
				<div class="el-act-cent-2">\
					<span class="calendar">' + this._addSvgIcon('tl-date') + '</span>\
					<span class="calendar-text">01.01.2017</span>\
					<span class="line1">|</span>\
					<span class="clock">' + this._addSvgIcon('tl-time') + '</span>\
					<span class="clock-text">00:00</span>\
				</div>\
				&nbsp;&nbsp;\
				<div class="clouds-content disabled">\
					<span class="cloud">' + this._addSvgIcon('tl-cloud-cover') + '</span>\
					<span class="cloud-text">\
						<select class="cloud-select">\
							<option value="5">до 5%</option>\
							<option value="10">до 10%</option>\
							<option value="20">до 20%</option>\
							<option value="50" selected>до 50%</option>\
							<option value="100">до 100%</option>\
						</select>\
					</span>\
					&nbsp;&nbsp;\
					<span class="arrow-small"></span>\
				</div>\
			</div>\
			<div class="el-right">\
				<span class="el-act-right-1">\
					<span class="different-interval on">' + this._addSvgIcon('tl-different-interval') + '</span>\
					<span class="line4">|</span>\
					<span class="single-interval">' + this._addSvgIcon('tl-single-interval') + '</span>\
				</span>\
				<span class="el-act-right-2"><span class="ques gmx-hidden">' + this._addSvgIcon('tl-help') + '</span></span>\
				<span class="hideButton-content"><span class="arrow hideButton">' + this._addSvgIcon('arrow-down-01') + '</span></span>\
			</div>\
			<div class="g-scroll"></div>\
			<div class="c-scroll">\
				<div class="c-borders"></div>\
			</div>\
		</div>\
		<div class="hr1"></div>\
		<div class="hr2"></div>\
		<div class="vis"></div>\
	</div>\
</div>';
			container.innerHTML = str;
			container._id = this.options.id;
			this._map = map;
			var	clickLeft = container.getElementsByClassName('click-left')[0],
				clickRight = container.getElementsByClassName('click-right')[0],
				cloudSelect = container.getElementsByClassName('cloud-select')[0],
				clickCalendar = container.getElementsByClassName('el-act-cent-2')[0],
				clickId = container.getElementsByClassName('calendar-text')[0],
				clickIdTime = container.getElementsByClassName('clock-text')[0],
				switchDiv = container.getElementsByClassName('el-left')[0],
				modeSelectedOn = container.getElementsByClassName('el-pass')[0],
				modeSelectedOff = container.getElementsByClassName('el-act')[0],
				hideButton = container.getElementsByClassName('hideButton')[0],
				showButton = container.getElementsByClassName('showButton')[0],
				favorite = container.getElementsByClassName('favorite')[0],
				trash = container.getElementsByClassName('trash')[0],
				useSvg = hideButton.getElementsByTagName('use')[0],
				visContainer = container.getElementsByClassName('vis-container')[0],
				internalContainer = container.getElementsByClassName('internal-container')[0],
				differentInterval = container.getElementsByClassName('different-interval')[0],
				singleInterval = container.getElementsByClassName('single-interval')[0],
				cloudsContent = container.getElementsByClassName('clouds-content')[0],
				layersTab = container.getElementsByClassName('layers-tab')[0];

			this._containers = {
				vis: container.getElementsByClassName('vis')[0],
				cloudSelect: cloudSelect,
				cloudsContent: cloudsContent,
				internalContainer: internalContainer,
				layersTab: layersTab,
				clickCalendar: clickCalendar,
				clickId: clickId,
				clickIdTime: clickIdTime,
				favorite: favorite,
				switchDiv: switchDiv,
				modeSelectedOff: modeSelectedOff,
				modeSelectedOn: modeSelectedOn,
				hideButton: hideButton
			};
			modeSelectedOff.innerHTML = translate.modeSelectedOff;
			modeSelectedOn.innerHTML = translate.modeSelectedOn;
			L.DomEvent
				.on(document, 'keyup', this._keydown, this);

			var stop = L.DomEvent.stopPropagation;
			L.DomEvent
				.on(container, 'contextmenu', stop)
				.on(container, 'touchstart', stop)
				.on(container, 'mousedown', stop)
				.on(container, 'mousewheel', stop)
				.on(container, 'dblclick', stop)
				.on(container, 'click', stop);

			var iconLayersCont = iconLayers ? iconLayers.getContainer() : null;
			L.DomEvent
				.on(cloudSelect, 'change', function (ev) {
					ev.target.blur();
					this._bboxUpdate();
					var state = this.getCurrentState();
					state.gmxLayer.repaint();
					this.setCommand('Left');
					this.setCommand('Right');
				}, this)
				.on(differentInterval, 'click', function () {
					if (singleIntervalFlag) {
						singleIntervalFlag = false;
						L.DomUtil.addClass(differentInterval, 'on');
						L.DomUtil.removeClass(singleInterval, 'on');
					}
				}, this)
				.on(singleInterval, 'click', function () {
					if (!singleIntervalFlag) {
						singleIntervalFlag = true;
						L.DomUtil.addClass(singleInterval, 'on');
						L.DomUtil.removeClass(differentInterval, 'on');
						var state = this.getCurrentState();
						for (var layerID in this._state.data) {
							this._copyState(this._state.data[layerID], state);
						}
					}
				}, this)
				.on(favorite, 'click', function () {
					var state = this.getCurrentState();
					this.setCommand(state.selected && state.selected[state.clickedUTM] ? 'Down' : 'Up', true);
				}, this)
				.on(trash, 'click', function (ev) {
					this._removeSelected();
					this._redrawTimeline();
				}, this)
				.on(clickLeft, 'mousemove', stop)
				.on(clickLeft, 'click', function (ev) {
					this.setCommand('Left');
				}, this)
				.on(clickRight, 'mousemove', stop)
				.on(clickRight, 'click', function (ev) {
					this.setCommand('Right');
				}, this)
				.on(modeSelectedOff, 'click', function (ev) {
					this.setCommand('s');
					L.DomUtil.addClass(modeSelectedOff, 'on');
					L.DomUtil.removeClass(modeSelectedOn, 'on');
				}, this)
				.on(modeSelectedOn, 'click', function (ev) {
					this.setCommand('s');
					L.DomUtil.addClass(modeSelectedOn, 'on');
					L.DomUtil.removeClass(modeSelectedOff, 'on');
				}, this)
				.on(showButton, 'click', function (ev) {
					if (L.DomUtil.hasClass(visContainer, 'gmx-hidden')) {
						L.DomUtil.removeClass(visContainer, 'gmx-hidden');
						L.DomUtil.addClass(showButton, 'gmx-hidden');
						if (iconLayersCont) {
							L.DomUtil.addClass(iconLayersCont, 'iconLayersShift');
						}
						this._state.isVisible = true;
						this._redrawTimeline();
						this._addKeyboard(map);
					}
				}, this)
				.on(hideButton, 'click', function (ev) {
					if (!L.DomUtil.hasClass(visContainer, 'gmx-hidden')) {
						L.DomUtil.addClass(visContainer, 'gmx-hidden');
						L.DomUtil.removeClass(showButton, 'gmx-hidden');
						this._state.isVisible = false;
						if (iconLayersCont) {
							L.DomUtil.removeClass(iconLayersCont, 'iconLayersShift');
						}
						this._removeKeyboard(map);
					}
				}, this);

			L.DomEvent
				.on(layersTab, 'click', function (ev) {
					var target = ev.target,
						_prevState = this.getCurrentState() || {},
						_layerID = target._layerID || target.parentNode._layerID;

					if (_layerID && _prevState.layerID !== _layerID) { this._setCurrentTab(_layerID); }
				}, this);

			var _this = this;
			this._setDateScroll = function () {
				var state = _this.getCurrentState();
				if (state) {
					this._chkSelection(state);
				}
			};
			if (map.gmxControlsManager) {
				map.gmxControlsManager.add(this);
			}
			this._sidebarOn = true;
			map
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
				if (params.gmxMap && !window.nsGmx.gmxMap) { window.nsGmx.gmxMap = params.gmxMap; }
				var options = {
						locale: window.language === 'eng' ? 'en' : 'ru'
					},
					nsGmx = window.nsGmx,
					layersByID = nsGmx.gmxMap.layersByID;

				// options.clouds = params.clouds || '';

				if (params.moveable) { options.moveable = params.moveable === 'false' ? false : true; }
				// if (params.modeBbox) { options.modeBbox = params.modeBbox; }
				if (params.rollClicked) { options.rollClicked = params.rollClicked === 'false' ? false : true; }

				if (options.locale === 'ru') {
					translate = {
						modeSelectedOff: 'По всем',
						modeSelectedOn: 'По избранным'
					};
				} else {
					translate = {
						modeSelectedOff: 'By all',
						modeSelectedOn: 'By selected'
					};
				}

				if (nsGmx.widgets && nsGmx.widgets.commonCalendar) {
					calendar = nsGmx.widgets.commonCalendar;
				}
				iconLayers = map.gmxControlsManager.get('iconLayers');

				timeLineControl = L.control.gmxTimeline(options)
					.on('click', function (ev) {
						layersByID[ev.layerID].repaint();
					});

				nsGmx.timeLineControl = timeLineControl;
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
			if (!timeLineControl._map) { nsGmx.leafletMap.addControl(timeLineControl); }
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
				if (state.currentTab) {
					currentDmIDPermalink = state.currentTab;
				}
				if (!timeLineControl._map) { nsGmx.leafletMap.addControl(timeLineControl); }
				var layersByID = nsGmx.gmxMap.layersByID;
				state.dataSources.forEach(function (it) {
					var gmxLayer = layersByID[it.layerID];
					if (gmxLayer) {
						timeLineControl.addLayer(gmxLayer, it);
					}
				});
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
        },
        getPluginPath: function() {
		}
    };

    if (window.gmxCore) {
		var path = gmxCore.getModulePath('gmxTimeLine'),
			timeLinePath = path + timeLinePrefix + 'timeline';
		filesToLoad = [
			timeLinePath + '.js',
			timeLinePath + '.css',
			path + 'L.Control.gmxTimeLine.css'
		];
        window.gmxCore.addModule(pluginName, publicInterface, {});
	} else {
		window.nsGmx[pluginName] = publicInterface;
	}
})();
