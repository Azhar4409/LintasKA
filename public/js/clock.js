export function addMapClock(map) {
  const ctrl = L.control({ position: "topright" });

  ctrl.onAdd = () => {
    const div = L.DomUtil.create("div", "map-clock");
    div.innerHTML = "--:--:--";
    return div;
  };

  ctrl.addTo(map);

  setInterval(() => {
    ctrl.getContainer().innerHTML =
      new Date().toLocaleTimeString("id-ID");
  }, 1000);
}
