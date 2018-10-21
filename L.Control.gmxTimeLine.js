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
		zIndexOffset = -1000,
		zIndexOffsetCurrent = -500,
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
							srs: dmOpt.srs,
							itemHook: function(it) {
								if (!this.cache) { this.cache = {}; }
								var arr = it.properties;
								var clSelect = timeLineControl._containers.cloudSelect;
								if (state.clouds && arr[state.clouds] > Number(clSelect.options[clSelect.selectedIndex].value)) {
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
			minZoom: 8,				// min zoom таймлайна
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
						layerOnMap: state.gmxLayer._map ? true : false,
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
				singleIntervalFlag: singleIntervalFlag,
				isVisible: this._state.isVisible,
				dataSources: dataSources
			};
		},

		getLayerState: function (id) {
			return this._state.data[id];
		},

		getCurrentState: function () {
			return this._state.data[currentDmID];
		},

		clearTab: function (id) {
			if (this._state.data[id]) {
				var state = this._state.data[id],
					gmxLayer = state.gmxLayer,
					observer = state.observer;
				
				observer.deactivate();
				gmxLayer.getDataManager().removeObserver(observer.id);
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
				if (this._map) { this._map.removeControl(this); }

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
				prevent = L.DomEvent.preventDefault,
				gmxLayer = this._state.data[layerID].gmxLayer,
				chkVisible = function (flag) {
					liItem._eye = flag;
					var off = liItem._eye ? '' : '-off';
					spaneye.innerHTML = '<svg role="img" class="svgIcon is' + off + '"><use xlink:href="#transparency-eye' + off + '"></use></svg>';
				};

			liItem._eye = true;
			liItem._layerID = layerID;
			span.innerHTML = title;
			span.title = title;

			L.DomEvent
				// .on(closeButton, 'click', L.DomEvent.preventDefault)
				.on(closeButton, 'click', stop)
				.on(closeButton, 'click', function (ev) {
					this.removeLayer(gmxLayer);
			}, this);

			L.DomEvent
				.on(spaneye, 'click', stop)
				.on(spaneye, 'click', function (ev) {
					var pNode = ev.target.parentNode,
						cstate = this._state.data[pNode._layerID];
					if (cstate) {
						chkVisible(!pNode._eye)
						var tLayer = cstate.gmxLayer;
						if (pNode._eye) {
							if (!tLayer._map) { this._map.addLayer(tLayer); }
						} else {
							if (tLayer._map) { this._map.removeLayer(tLayer); }
						}
					}
			}, this);
			gmxLayer
				.on('zindexupdated', function () { this.chkZindexUpdated(layerID); }, this)
				.on('add', function () { chkVisible(true); }, this)
				.on('remove', function () { chkVisible(false); }, this);

			chkVisible(gmxLayer._map ? true : false);
			this.fire('currentTabChanged', {currentTab: layerID});
			this.fire('layerAdd', { layerID: layerID }, this);
			return liItem;
		},

		chkZindexUpdated: function (id) {
			var state = this.getCurrentState();
			if (state && state.gmxLayer.options.zIndexOffset !== zIndexOffsetCurrent) {
				state.gmxLayer.setZIndexOffset(zIndexOffsetCurrent);
			}
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
				// L.DomUtil.removeClass(this._containers.vis, 'gmx-hidden');
				// L.DomUtil.removeClass(this._container, 'gmx-hidden');
				// if (iconLayers) {
					// L.DomUtil.addClass(iconLayers.getContainer(), 'iconLayersShift');
				// }
				if (this._timeline) {
					this._setCurrentTab(layerID);
					this._setDateScroll();
				}
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
				.off('moveend', this._moveend, this)
				.off('zoomend', this._chkZoom, this);

			var stop = L.DomEvent.stopPropagation,
				prevent = L.DomEvent.preventDefault;
			L.DomEvent
				.off(document, 'keyup', stop)
				.off(document, 'keyup', prevent)
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
			if (currentDmID && this._map && !this._zoomOff) {
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
			var state = this.getCurrentState();
			if (state) {
				var count = 0,
					selected = [],
					res = [],
					clickedUTM = String(state.clickedUTM || ''),
					dSelected = state.selected || {},
					maxUTM = 0;

				for (var utm in state.items) {
					var start = new Date(utm * 1000 + tzm),
						className = clickedUTM === utm ? 'item-clicked' : '',
						item = {
							id: count,
							type: 'dot',
							items: state.items[utm],
							content: '',
							utm: utm,
							start: start
						};
					if (utm > maxUTM) {
						maxUTM = utm;
					}

					if (dSelected[utm]) {
						className += ' item-selected';
					}
					item.className = className;
					res.push(item);
					count++;
				}
				if (!clickedUTM && maxUTM) {
					state.clickedUTM = Number(maxUTM);
					state.skipUnClicked = true;
				}
				if (!this._timeline) {
					this._initTimeline(res);
				}
				if (this._timeline) {
					this._timeline.clearItems();
					this._setWindow(state.oInterval);
					this._timeline.setData(res);

					this._chkSelection(state);

					var cont = this._containers,
						clickCalendar = cont.clickCalendar;
					if (state.clickedUTM && maxUTM) {
						var msec = 1000 * state.clickedUTM,
							clickedDate = new Date(msec),
							tm = this._timeline.getUTCTimeString(clickedDate),
							arr = tm.split(' '),
							arr1 = arr[1].split(':');

						cont.clickId.innerHTML = arr[0];
						cont.clickIdTime.innerHTML = arr1[0] + ':' + arr1[1];
						L.DomUtil.removeClass(clickCalendar, 'disabled');
						if (!this._zoomOff && state.liItem._eye) {
							state.gmxLayer.setDateInterval(clickedDate, new Date(1000 + msec));
							if (!state.gmxLayer._map) {
								this._map.addLayer(state.gmxLayer);
							}
						}
					} else {
						cont.clickId.innerHTML = '--.--.----';
						cont.clickIdTime.innerHTML = '--:--';
						L.DomUtil.addClass(clickCalendar, 'disabled');
					}
				}
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

		_hideOtherLayer: function (id) {
			for (var layerID in this._state.data) {
				var gmxLayer = this._state.data[layerID].gmxLayer;
				if (layerID !== id) {
					this._map.removeLayer(gmxLayer);
				} else {
					this._map.addLayer(gmxLayer);
				}
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

			var stateBefore = this.getCurrentState();
			currentDmID = layerID;
			var state = this.getCurrentState();
			//state.oInterval = state.gmxLayer.getDateInterval();
			state.gmxLayer.setZIndexOffset(zIndexOffsetCurrent);
			if (state.dInterval && (state.dInterval.beginDate.valueOf() < state.oInterval.beginDate.valueOf() || state.dInterval.endDate.valueOf() > state.oInterval.endDate.valueOf())) {
				state.dInterval.beginDate = state.oInterval.beginDate;
				state.dInterval.endDate = state.oInterval.endDate;
			}
			if (stateBefore) {
				stateBefore.gmxLayer.setZIndexOffset(zIndexOffset);
				if (singleIntervalFlag && stateBefore) {
					this._copyState(state, stateBefore);
				}
			}

			this.fire('currentTabChanged', {currentTab: layerID});
			this._bboxUpdate();
			if (this._timeline) {
				this._setWindow(state.oInterval);
				this._setDateScroll();
			}

			// if (Object.keys(state.selected || {}).length > 1) {
				// L.DomUtil.removeClass(this._containers.switchDiv, 'disabled');
			// }
			if (state.clouds) {
				L.DomUtil.removeClass(this._containers.cloudsContent, 'disabled');
			} else {
				L.DomUtil.addClass(this._containers.cloudsContent, 'disabled');
			}

			// if (state.rollClickedFlag) {
				this._chkRollClickedFlag(state);
			// }
			state.gmxLayer.repaint();
			L.gmx.layersVersion.now();
		},

		initialize: function (options) {
			L.Control.prototype.initialize.call(this, options);
			this._commandKeys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'favorite', 'clickTimeLine', 'ArrowUp', 'Down', 'Up', 'Left', 'Right', ' ', 's'];

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
			if (currentDmID && !this._timeline && L.gmx.timeline) {
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
			if (this.options.moveable && calendar) {
				calendar.bindLayer(opt.name); }
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
						var msec = 1000 * data.clickedUTM;
						gmxLayer.setDateInterval(new Date(msec), new Date(1000 + msec));
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
				// this._zoomOff = map.getZoom() < this.options.minZoom;
					// gmxLayer.setDateInterval(data.oInterval.beginDate, data.oInterval.endDate);
					data.uTimeStamp = [data.oInterval.beginDate.getTime()/1000, data.oInterval.endDate.getTime()/1000];
					data.skipUnClicked = true;
				}
				gmxLayer
					.addLayerFilter(function (it) {
						var state = this._state.data[opt.name] || {},
							dt = it.properties[state.tmpKeyNum];

						if (this._zoomOff) { return true; }
						var clSelect = this._containers.cloudSelect;
						if (state.clouds && it.properties[state.clouds] > Number(clSelect.options[clSelect.selectedIndex].value)) {
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

				this.addDataSource(data);
				if (filesToLoad && !promisesArr) {
					promisesArr = filesToLoad.map(function(href) {
						return L.gmxUtil.requestLink(href);
					});
					Promise.all(promisesArr || []).then(function() {
						// console.log('Promise', arguments);
						this._initTimeline();
						L.DomUtil.removeClass(this._containers.vis, 'gmx-hidden');
						L.DomUtil.removeClass(this._container, 'gmx-hidden');
						if (currentDmIDPermalink === opt.name) {
							setTimeout(function() {
								this._setCurrentTab(currentDmIDPermalink);
								currentDmIDPermalink = null;
							}.bind(this), 0);
						}
					}.bind(this));
				} else {
					L.DomUtil.removeClass(this._container, 'gmx-hidden');
				}
			}
		},

		_keydown: function (ev) {
			if (this._map && this._map.keyboard && !this._map.keyboard.enabled()) {
				this.setCommand(ev.key, ev.ctrlKey);
			}
		},

		setCommand: function (key, ctrlKey) {
// console.log('setCommand', key, ctrlKey, this._commandKeys.indexOf(key))
			if (this._commandKeys.indexOf(key) !== -1) {

				var state = this.getCurrentState(),
					setClickedUTMFlag = true;

				if (state) {
					if (!state.gmxLayer._map) {
						this._map.addLayer(state.gmxLayer);
					}
					
					if (key === 'clickTimeLine') {
						state.rollClickedFlag = state.selected && state.selected[state.clickedUTM] ? true : false;
						state.gmxLayer.repaint();
						this._setDateScroll();

						this._bboxUpdate();
						this._redrawTimeline();
						this._chkRollClickedFlag(state);
						return;
					}
					if (state.clickedUTM) {
/*						if (key === ' ') {
							this._addSelected(state.clickedUTM, state);
							// state.skipUnClicked = !state.skipUnClicked;
							setClickedUTMFlag = false;
						} else 
*/
						if (key === 'ArrowUp' || key === 'Up') {
							if (!state.rollClickedFlag) {
								state.rollClickedFlag = true;
								this._chkRollClickedFlag(state);
								if (state.selected && Object.keys(state.selected).length > 0) {
									key = 'Right';
								} else {
									setClickedUTMFlag = false;
								}
							}
						} else if (key === 'ArrowDown' || key === 'Down') {
							if (state.rollClickedFlag) {
								state.rollClickedFlag = false;
								this._chkRollClickedFlag(state);
								key = 'Right';
							} else {
								setClickedUTMFlag = false;
							}
						// } else if (key === 'ArrowUp' || key === 'Up') {
							// this._addSelected(state.clickedUTM, state);
							// setClickedUTMFlag = false;
						// } else if (key === 'ArrowDown' || key === 'Down') {
							// this._removeSelected(state.clickedUTM, state);
							// setClickedUTMFlag = false;
						} else if (key === 'favorite' || key === ' ') {
							if (state.selected && state.selected[state.clickedUTM]) {
								this._removeSelected(state.clickedUTM, state);
								state.rollClickedFlag = false;
							} else {
								this._addSelected(state.clickedUTM, state);
								state.rollClickedFlag = true;
							}
							this._chkRollClickedFlag(state);
							setClickedUTMFlag = false;
						// } else if (key === 's') {
							// state.rollClickedFlag = !state.rollClickedFlag;
							// this._chkRollClickedFlag(state);
						}
						if (setClickedUTMFlag) {
							var clickedUTM = String(state.clickedUTM),
								rollClicked = this.options.rollClicked,
								arr = [];
							if (state.selected && state.rollClickedFlag) {
								arr = Object.keys(state.selected).sort().map(function (it) { return {utm: it}});
							} else {
								this._timeline.getData().forEach(function(it) {
									if (!state.selected || !state.selected[it.utm]) { arr.push({utm: it.utm}); }
								});
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
			state.gmxLayer.repaint();
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
			if (len < 1) {
				state.rollClickedFlag = false;
				// this._setClassName(true, this._containers.switchDiv, 'disabled');
			// } else {
				// this._setClassName(false, this._containers.switchDiv, 'disabled');
			}
			this._setClassName(len > 0 && state.selected[state.clickedUTM], this._containers.favorite, 'on');
			// this._setClassName(!state.rollClickedFlag, this._containers.modeSelectedOff, 'on');
			// this._setClassName(state.rollClickedFlag, this._containers.modeSelectedOn, 'on');

			this._setClassName(!state.rollClickedFlag, this._containers.hr1, 'on');
			this._setClassName(state.rollClickedFlag, this._containers.hr2, 'on');
			
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
				// this.setCommand(state.selected && state.selected[utm] ? 'Up' : 'Down');
				this.setCommand('clickTimeLine');

				// state.gmxLayer.repaint();
				// this._setDateScroll();

				// this._bboxUpdate();
				// this._redrawTimeline();
				// this._chkRollClickedFlag(state);
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

//			<div class="clicked el-left disabled gmx-hidden"><div class="el-act on">по1 всем</div><div class="el-pass">по избранным</div></div>

var str = '\
<div class="showButtonContainer gmx-hidden">\
	<div class="warning"><span class="warningText">' + translate.warning + '</span> <span class="closeWarning">X</span></div>\
	<div class="leaflet-gmx-iconSvg showButton leaflet-control" title="">' + this._addSvgIcon('tl-main-icon') + '</div>\
</div>\
<div class="vis-container">\
	<div class="tabs"><ul class="layers-tab"></ul></div>\
	<div class="internal-container">\
		<div class="w-scroll">\
			<div class="el-left">\
				<span class="el-act-right-1">\
					<span class="different-interval' + (singleIntervalFlag ? '' : ' on') + '" title="' + translate.differentInterval + '">' + this._addSvgIcon('tl-different-interval') + '</span>\
					<span class="line4">|</span>\
					<span class="single-interval' + (singleIntervalFlag ? ' on' : '') + '" title="' + translate.singleInterval + '">' + this._addSvgIcon('tl-single-interval') + '</span>\
				</span>\
			</div>\
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
							<option value="5">0 - 5%</option>\
							<option value="10">0 - 10%</option>\
							<option value="20">0 - 20%</option>\
							<option value="50" selected>0 - 50%</option>\
							<option value="100">0 - 100%</option>\
						</select>\
					</span>\
					&nbsp;&nbsp;\
					<span class="arrow-small"></span>\
				</div>\
			</div>\
			<div class="el-right">\
				<span class="filters"></span>\
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
				// switchDiv = container.getElementsByClassName('el-left')[0],
				hr1 = container.getElementsByClassName('hr1')[0],
				hr2 = container.getElementsByClassName('hr2')[0],
				// modeSelectedOn = container.getElementsByClassName('el-pass')[0],
				// modeSelectedOff = container.getElementsByClassName('el-act')[0],
				hideButton = container.getElementsByClassName('hideButton-content')[0],
				showButtonContainer = container.getElementsByClassName('showButtonContainer')[0],
				showButton = container.getElementsByClassName('showButton')[0],
				closeWarning = container.getElementsByClassName('closeWarning')[0],
				warning = container.getElementsByClassName('warning')[0],
				favorite = container.getElementsByClassName('favorite')[0],
				trash = container.getElementsByClassName('trash')[0],
				useSvg = hideButton.getElementsByTagName('use')[0],
				visContainer = container.getElementsByClassName('vis-container')[0],
				internalContainer = container.getElementsByClassName('internal-container')[0],
				differentInterval = container.getElementsByClassName('different-interval')[0],
				singleInterval = container.getElementsByClassName('single-interval')[0],
				cloudsContent = container.getElementsByClassName('clouds-content')[0],
				layersTab = container.getElementsByClassName('layers-tab')[0];

			if (this.options.webGLFilters) {
				container.getElementsByClassName('filters')[0].appendChild(this.options.webGLFilters.getWebGLFiltersContainer(map));
			}

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
				// switchDiv: switchDiv,
				hr1: hr1,
				hr2: hr2,
				// modeSelectedOff: modeSelectedOff,
				// modeSelectedOn: modeSelectedOn,
				hideButton: hideButton
			};
			// modeSelectedOff.innerHTML = translate.modeSelectedOff;
			// modeSelectedOn.innerHTML = translate.modeSelectedOn;
			var stop = L.DomEvent.stopPropagation,
				prevent = L.DomEvent.preventDefault;
			
			L.DomEvent
				.on(document, 'keyup', stop)
				.on(document, 'keyup', prevent)
				.on(document, 'keyup', this._keydown, this);

			L.DomEvent
				.on(container, 'contextmenu', stop)
				.on(container, 'touchstart', stop)
				// .on(container, 'mousemove', stop)
				.on(container, 'mousedown', stop)
				.on(container, 'mousewheel', stop)
				.on(container, 'dblclick', stop)
				.on(container, 'click', stop);

			var iconLayersCont = iconLayers ? iconLayers.getContainer() : null;
			var toglleVisContainer = function (flag) {
				var isVis = !L.DomUtil.hasClass(visContainer, 'gmx-hidden');
				if (flag) {
					this._setClassName(!this._zoomOff, warning, 'gmx-hidden');
					this._setClassName(this._zoomOff, showButton, 'off');
					if (this._state.isVisible !== false) {
						this._setClassName(flag, showButtonContainer, 'gmx-hidden');
							this._setClassName(!flag, visContainer, 'gmx-hidden');
							if (iconLayersCont && !this._zoomOff) {
								this._setClassName(flag, iconLayersCont, 'iconLayersShift');
							}
						if (!isVis) {
							this._redrawTimeline();
						}
						this._addKeyboard(map);
						this.fire('statechanged', {isVisible: true});
					}
				} else {
					this._setClassName(flag, showButtonContainer, 'gmx-hidden');
					this._setClassName(this._zoomOff, showButton, 'off');
					this._setClassName(!this._zoomOff, warning, 'gmx-hidden');
					if (isVis) {
						this._setClassName(!flag, visContainer, 'gmx-hidden');
						if (iconLayersCont) {
							this._setClassName(flag, iconLayersCont, 'iconLayersShift');
						}
						this._removeKeyboard(map);
						this.fire('statechanged', {isVisible: false});
					}
				}
			}.bind(this);
			var toglleSingleInterval = function (flag) {
				singleIntervalFlag = flag;
				if (singleIntervalFlag) {
					L.DomUtil.addClass(singleInterval, 'on');
					L.DomUtil.removeClass(differentInterval, 'on');
				} else {
					L.DomUtil.addClass(differentInterval, 'on');
					L.DomUtil.removeClass(singleInterval, 'on');
				}
			}.bind(this);
			if (singleIntervalFlag) {
				toglleSingleInterval(true);
			}
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
						toglleSingleInterval(false);
					}
				}, this)
				.on(singleInterval, 'click', function () {
					if (!singleIntervalFlag) {
						toglleSingleInterval(true);
						var state = this.getCurrentState();
						for (var layerID in this._state.data) {
							this._copyState(this._state.data[layerID], state);
						}
					}
				}, this)
				.on(favorite, 'click', function () {
					// var state = this.getCurrentState();
					// this.setCommand(state.selected && state.selected[state.clickedUTM] ? 'Down' : 'Up', true);
					this.setCommand('favorite', true);
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
				// .on(modeSelectedOff, 'click', function (ev) {
					// this.setCommand('s');
					// L.DomUtil.addClass(modeSelectedOff, 'on');
					// L.DomUtil.removeClass(modeSelectedOn, 'on');
				// }, this)
				// .on(modeSelectedOn, 'click', function (ev) {
					// this.setCommand('s');
					// L.DomUtil.addClass(modeSelectedOn, 'on');
					// L.DomUtil.removeClass(modeSelectedOff, 'on');
				// }, this)
				.on(showButton, 'click', function (ev) {
					this._state.isVisible = true;
					toglleVisContainer(true);
				}, this)
				.on(closeWarning, 'click', function (ev) {
					this._setClassName(true, warning, 'gmx-hidden');
				}, this)
				.on(hideButton, 'click', function (ev) {
					this._state.isVisible = false;
					toglleVisContainer(false);
				}, this);

			L.DomEvent
				.on(layersTab, 'click', function (ev) {
					currentDmIDPermalink = null;
					var target = ev.target,
						_prevState = this.getCurrentState() || {},
						_layerID = target._layerID || target.parentNode._layerID;

					if (_layerID && _prevState.layerID !== _layerID) {
						if (singleIntervalFlag) {
							this._hideOtherLayer(_layerID);
						}
						this._setCurrentTab(_layerID);
					}
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
			this._chkZoom = function () {
				this._zoomOff = map.getZoom() < this.options.minZoom;
					toglleVisContainer(!this._zoomOff);
			}.bind(this);
			map
				.on('moveend', this._moveend, this)
				.on('zoomend', this._chkZoom, this);

			this._chkZoom();
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

				if (params.webGLFilters) {
					options.webGLFilters = params.webGLFilters === 'true' ? true : false;
					if (options.webGLFilters) {
						options.webGLFilters = L.rastersBgTiles();
					}
				}
				if (params.moveable) { options.moveable = params.moveable === 'false' ? false : true; }
				// if (params.modeBbox) { options.modeBbox = params.modeBbox; }
				if (params.rollClicked) { options.rollClicked = params.rollClicked === 'false' ? false : true; }
				options.minZoom = params.minZoom || 8;

				if (options.locale === 'ru') {
					translate = {
						differentInterval: 'Раздельные интервалы для вкладок',
						singleInterval: 'Единый интервал для вкладок',
						warning: 'Приблизьте карту для загрузки на таймлайн',
						modeSelectedOff: 'По всем',
						modeSelectedOn: 'По избранным'
					};
				} else {
					translate = {
						differentInterval: 'Different interval for tabs',
						singleInterval: 'Single interval for tabs',
						warning: 'Zoom map for TimeLine',
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
// nsGmx.timeLineControl.on('layerAdd', console.log);
// nsGmx.timeLineControl.on('layerRemove', console.log);
// nsGmx.timeLineControl.on('currentTabChanged', console.log);
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
				if (state.singleIntervalFlag) {
					singleIntervalFlag = state.singleIntervalFlag;
				}
				if (!timeLineControl._map) { nsGmx.leafletMap.addControl(timeLineControl); }
				var layersByID = nsGmx.gmxMap.layersByID;
				state.dataSources.forEach(function (it) {
					var gmxLayer = layersByID[it.layerID];
					if (gmxLayer) {
						timeLineControl.addLayer(gmxLayer, it);
					}
				});
				if (state.currentTab) {
					currentDmIDPermalink = state.currentTab;
					timeLineControl.setCurrentTab(currentDmIDPermalink);
				}
			}
        },
        getLayerState: function(id) {
			return timeLineControl.getLayerState(id);
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
