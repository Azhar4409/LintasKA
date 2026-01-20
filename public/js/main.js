import { initMap } from "./map.js";
import { addMapClock } from "./clock.js";
import { loadStations, setStationClickHandler } from "./stations.js";
import { loadRoutes } from "./routes.js";
import { initTrains, getStationScheduleData } from "./trains.js";

async function startApp() {
    try {
        // 1. Inisialisasi Peta
        const map = initMap();
        
        // 2. Tambahkan UI Clock
        addMapClock(map);
        
        // 3. Load Data secara berurutan (PENTING)
        // Jalankan Routes dan Stations dulu agar trains punya referensi posisi
        await Promise.all([
            loadRoutes(map),
            loadStations(map)
        ]);
        
        // 4. Inisialisasi Pergerakan Kereta
        await initTrains(map);

        // 5. Hubungkan klik stasiun ke fungsi jadwal
        setStationClickHandler(getStationScheduleData);
        
        console.log("✅ Lintaska: Sistem Berhasil Dimuat");
    } catch (error) {
        console.error("❌ Lintaska Error:", error);
    }
}

// Jalankan aplikasi
startApp();