import { initMap } from "./map.js";
import { addMapClock } from "./clock.js";
import { loadStations, setStationClickHandler } from "./stations.js";
import { loadRoutes } from "./routes.js";
import { initTrains, getStationScheduleData } from "./trains.js";

const map = initMap();

addMapClock(map);
await loadRoutes(map);
await loadStations(map);
await initTrains(map);

// Set up station click handler
setStationClickHandler(getStationScheduleData);
