import { initMap } from "./map.js";
import { addMapClock } from "./clock.js";
import { loadStations, setStationClickHandler } from "./stations.js";
import { loadRoutes } from "./routes.js";
import { initTrains, getStationScheduleData } from "./trains.js";

async function startApp() {
    try {
        const map = initMap();
        addMapClock(map);
        
        await loadRoutes(map);
        await loadStations(map);
        await initTrains(map);

        setStationClickHandler(getStationScheduleData);
        console.log("Aplikasi berhasil dimuat");
    } catch (error) {
        console.error("Gagal memuat aplikasi:", error);
    }
}

startApp();