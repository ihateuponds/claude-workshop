// Mansion layout: bands, rooms, where each station's resident stands, and routes via the glass elevator.
'use strict';
(function (WS) {
  const W = 540, H = 960;
  const SHAFT = { x0: 240, x1: 300, cx: 270 };
  const FLOORS = {
    roof: { y0: 0, y1: 170, floorY: 160 },
    f3: { y0: 170, y1: 370, floorY: 358 },
    f2: { y0: 370, y1: 570, floorY: 558 },
    f1: { y0: 570, y1: 780, floorY: 768 },
  };
  const CAPTION = { y0: 780, y1: 960 };
  const ROOMS = {
    observatory: { floor: 'roof', x0: 0, x1: 240, station: 'telescope', name: 'Observatory' },
    pad: { floor: 'roof', x0: 300, x1: 540, station: 'helper', name: 'Drone pad' },
    library: { floor: 'f3', x0: 0, x1: 240, station: 'bookshelf', name: 'Library' },
    workshop: { floor: 'f3', x0: 300, x1: 540, station: 'workbench', name: 'Workshop' },
    archive: { floor: 'f2', x0: 0, x1: 240, station: 'cabinet', name: 'Archive' },
    engine: { floor: 'f2', x0: 300, x1: 540, station: 'terminal', name: 'Engine room' },
    parlor: { floor: 'f1', x0: 0, x1: 540, stations: ['door', 'desk', 'rest'], name: 'Parlor' },
  };
  const SPOTS = {
    bookshelf: { x: 90, floor: 'f3', face: 'U' },
    workbench: { x: 420, floor: 'f3', face: 'D' },
    cabinet: { x: 80, floor: 'f2', face: 'L' },
    terminal: { x: 430, floor: 'f2', face: 'U' },
    telescope: { x: 120, floor: 'roof', face: 'L' },
    helper: { x: 420, floor: 'roof', face: 'R' },
    desk: { x: 120, floor: 'f1', face: 'D' },
    rest: { x: 470, floor: 'f1', face: 'D' },
    door: { x: 360, floor: 'f1', face: 'D' },
  };
  const OUTSIDE = 60; // how far below the parlor floor "outside the front door" is
  const ENTRY = { x: 360, floor: 'f1', outside: true };
  const STATION_ROOM = {};
  for (const [k, r] of Object.entries(ROOMS)) for (const s of r.stations || [r.station]) STATION_ROOM[s] = k;

  const floorY = f => FLOORS[f].floorY;
  const isStation = s => typeof s === 'string' && Object.hasOwn(SPOTS, s);
  // Route from a point on a floor to a station: walk, ride the shaft if the floor differs, walk.
  function pathTo(from, station) {
    const to = SPOTS[station];
    if (from.floor === to.floor) return [{ x: to.x, floor: to.floor }];
    return [{ x: SHAFT.cx, floor: from.floor }, { x: SHAFT.cx, floor: to.floor, ride: true }, { x: to.x, floor: to.floor }];
  }
  WS.layout = { W, H, SHAFT, FLOORS, CAPTION, ROOMS, SPOTS, ENTRY, OUTSIDE, STATION_ROOM, floorY, isStation, pathTo };
})(window.WS = window.WS || {});
