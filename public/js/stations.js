let stationLayer;
let stationData = {};
let getStationSchedule; // Will be set by trains.js

export function setStationClickHandler(handler) {
  getStationSchedule = handler;
}

export async function loadStations(map) {
  if (stationLayer) map.removeLayer(stationLayer);
  stationLayer = L.layerGroup().addTo(map);

  const res = await fetch("/api/stations");
  const json = await res.json();

  json.data.forEach(st => {
    if (!st.pos) return;

    stationData[st.cd] = st;

    const marker = L.circleMarker(st.pos, {
      radius: 5,
      color: "#000",
      fillColor: "#fff",
      fillOpacity: 1,
      weight: 2
    });

    marker.bindTooltip(`${st.cd} - ${st.nm}`);
    
    // Add click event to show schedule
    marker.on('click', () => {
      if (getStationSchedule) {
        getStationSchedule(st.cd, st.nm);
      }
    });

    marker.addTo(stationLayer);
  });
}
