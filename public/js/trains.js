/**
 * LINTASKA ENGINE - PRO VERSION
 * Optimized for high-frequency updates and multi-day train scheduling.
 */

let trainLayer;
let trainMarkers = new Map(); // Menggunakan Map untuk performa akses O(1)
let gapekaData = [];
let stationsData = new Map(); // Map untuk lookup posisi stasiun kilat
let simulationTimeMs = null; 

/**
 * Inisialisasi Sistem Kereta
 */
export async function initTrains(map) {
    if (trainLayer) map.removeLayer(trainLayer);
    trainLayer = L.layerGroup().addTo(map);

    try {
        // Fetch data secara paralel (Non-blocking)
        const [stRes, gapRes] = await Promise.all([
            fetch("./data/stations.json"),
            fetch("./data/gapeka.json")
        ]);

        const stJson = await stRes.json();
        const gapJson = await gapRes.json();

        // Indexing posisi stasiun
        stJson.data.forEach(st => stationsData.set(st.cd, st.pos));
        gapekaData = gapJson.data;

        // Injeksi data posisi ke jalur kereta
        enrichTrainPaths();
        
        // Inisialisasi kontrol waktu
        setupTimeControl();

        // Loop Utama: Jalankan update posisi setiap 1 detik
        updateTrainPositions();
        setInterval(updateTrainPositions, 1000);
        
        console.log(`🚀 Lintaska Engine: ${gapekaData.length} jadwal KA berhasil dimuat.`);
    } catch (e) {
        console.error("❌ Critical Engine Error:", e);
    }
}

/**
 * Validasi dan Injeksi Posisi ke dalam Path Kereta
 */
function enrichTrainPaths() {
    gapekaData.forEach(train => {
        if (!train.paths) return;
        train.paths.forEach(path => {
            if (!path.pos && stationsData.has(path.st_cd)) {
                path.pos = stationsData.get(path.st_cd);
            }
        });
    });
}

/**
 * Core Algorithm: Kalkulasi Posisi Presisi dengan Windowing 24 Jam
 */
function getTrainPosition(train, timeMs) {
    const paths = train.paths;
    if (!paths || paths.length < 2) return null;

    const DAY_MS = 86400000;
    
    // Triple Window Logic: Cek waktu sekarang, kemarin (lintas hari), dan besok
    // Menjamin kereta malam tidak hilang saat melewati jam 00:00
    const checkWindows = [timeMs, timeMs + DAY_MS, timeMs - DAY_MS];

    for (const t of checkWindows) {
        for (let i = 0; i < paths.length - 1; i++) {
            const curr = paths[i];
            const next = paths[i + 1];

            // 1. Status: Berhenti di Stasiun
            if (t >= curr.arriv_ms && t <= curr.depart_ms) {
                return { lat: curr.pos[0], lng: curr.pos[1], status: "STOP", station: curr.st_cd };
            }

            // 2. Status: Berjalan (Interpolasi Linear Spasial)
            if (t > curr.depart_ms && t < next.arriv_ms) {
                const ratio = (t - curr.depart_ms) / (next.arriv_ms - curr.depart_ms);
                return {
                    lat: curr.pos[0] + (next.pos[0] - curr.pos[0]) * ratio,
                    lng: curr.pos[1] + (next.pos[1] - curr.pos[1]) * ratio,
                    status: "MOVING", from: curr.st_cd, to: next.st_cd
                };
            }
        }
    }
    return null;
}

/**
 * Sync Engine: Mengelola State Marker di Peta
 */
function updateTrainPositions() {
    const now = simulationTimeMs !== null ? simulationTimeMs : getCurrentTimeMs();
    
    // Update Tampilan Jam di UI
    const display = document.getElementById("simTime");
    if (display) display.textContent = formatTime(now);

    const activeIds = new Set();

    gapekaData.forEach(train => {
        const pos = getTrainPosition(train, now);
        const id = train.tr_id;

        if (pos) {
            activeIds.add(id);
            renderTrain(train, pos);
        }
    });

    // Garbage Collection: Hapus marker kereta yang sudah sampai tujuan (tidak aktif)
    for (const [id, marker] of trainMarkers) {
        if (!activeIds.has(id)) {
            trainLayer.removeLayer(marker);
            trainMarkers.delete(id);
        }
    }
}

/**
 * Rendering Layer: Visualisasi Marker Leaflet
 */
function renderTrain(train, pos) {
    const id = train.tr_id;
    const isStop = pos.status === "STOP";
    const color = isStop ? "#4ECDC4" : "#FF6B6B"; // Teal (Berhenti), Coral (Jalan)

    if (!trainMarkers.has(id)) {
        const marker = L.circleMarker([pos.lat, pos.lng], {
            radius: 8, weight: 2, color: "#fff", fillColor: color, fillOpacity: 1
        }).addTo(trainLayer);
        
        marker.on('click', () => {
            marker.closePopup();
            showTrainSchedule(train);
        });
        trainMarkers.set(id, marker);
    }

    const marker = trainMarkers.get(id);
    marker.setLatLng([pos.lat, pos.lng]);
    marker.setStyle({ fillColor: color });

    const tooltip = `<b>KA ${train.tr_cd}</b><br>${isStop ? '📍 Stasiun: '+pos.station : '🚃 '+pos.from+' ➔ '+pos.to}`;
    marker.bindTooltip(tooltip, { sticky: true });
}

/**
 * Time Utilities
 */
function getCurrentTimeMs() {
    const d = new Date();
    return (d.getHours() * 3600000) + (d.getMinutes() * 60000) + (d.getSeconds() * 1000);
}

function formatTime(ms) {
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

function setupTimeControl() {
    const input = document.getElementById("timeControl");
    const btn = document.getElementById("nowBtn");
    
    input?.addEventListener("change", (e) => {
        const [h, m] = e.target.value.split(":");
        simulationTimeMs = (parseInt(h) * 3600000) + (parseInt(m) * 60000);
        updateTrainPositions();
    });

    btn?.addEventListener("click", () => {
        simulationTimeMs = null; // Kembali ke waktu real-time
        updateTrainPositions();
    });
}