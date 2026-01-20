let trainLayer;
let trainMarkers = {};
let gapekaData = {};
let stationsData = {};
let simulationTimeMs = null; // null = use current time

export async function initTrains(map) {
  if (trainLayer) map.removeLayer(trainLayer);
  trainLayer = L.layerGroup().addTo(map);

  // Load stations data for position mapping
  try {
    const stRes = await fetch("/api/stations");
    const stData = await stRes.json();
    stData.data.forEach((st) => {
      stationsData[st.cd] = st.pos;
    });
    console.log("Stations position map loaded:", Object.keys(stationsData).length, "stations");
  } catch (e) {
    console.error("Error loading stations:", e);
    return;
  }

  // Load gapeka data
  try {
    const res = await fetch("/api/gapeka");
    gapekaData = await res.json();
    console.log("GAPeKA data loaded:", gapekaData.data.length, "trains");
    
    // Enrich paths with station positions
    enrichTrainPaths();
  } catch (e) {
    console.error("Error loading gapeka data:", e);
    return;
  }

  // Setup time control UI
  setupTimeControl();

  // Start real-time train updates
  updateTrainPositions();
  setInterval(updateTrainPositions, 1000); // Update every second
}

function setupTimeControl() {
  const timeInput = document.getElementById("timeControl");
  const nowBtn = document.getElementById("nowBtn");
  const simTimeDisplay = document.getElementById("simTime");

  // Set initial time to current
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  timeInput.value = `${hours}:${minutes}`;
  simulationTimeMs = getCurrentTimeMs();

  // Update simulation time when input changes
  timeInput.addEventListener("change", (e) => {
    const [hours, minutes] = e.target.value.split(":");
    simulationTimeMs = parseInt(hours) * 3600000 + parseInt(minutes) * 60000;
    updateTrainPositions();
    console.log(`⏰ Waktu simulasi diubah ke: ${e.target.value}`);
  });

  // Reset to current time
  nowBtn.addEventListener("click", () => {
    simulationTimeMs = null; // Use current time
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    timeInput.value = `${hours}:${minutes}`;
    updateTrainPositions();
    console.log("⏰ Kembali ke waktu sekarang");
  });
}

function getCurrentTimeMs() {
  // Get time in milliseconds since midnight
  const now = new Date();
  return now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;
}

function enrichTrainPaths() {
  if (!gapekaData.data) return;

  gapekaData.data.forEach((train) => {
    if (!train.paths) return;

    train.paths.forEach((path) => {
      if (!path.pos && stationsData[path.st_cd]) {
        path.pos = stationsData[path.st_cd];
      }
    });
  });
  
  console.log("Train paths enriched with station positions");
}

function getTrainPosition(train, timeMs) {
  // Find where the train is at this time
  if (!train.paths || train.paths.length === 0) return null;

  let position = null;
  let found = false;

  // Hitung apakah kereta lintas hari (depart hari pertama, arriv hari berikutnya)
  const firstDepart = train.paths[0].depart_ms;
  const lastArriv = train.paths[train.paths.length - 1].arriv_ms;
  const isMultiDay = lastArriv < firstDepart; // arriv < depart = lintas hari
  
  // Buat comparison time: jika kereta lintas hari dan waktu masih pagi (sebelum berangkat),
  // tambah 1 hari penuh untuk perbandingan
  let comparisonTimeMs = timeMs;
  if (isMultiDay && timeMs < firstDepart) {
    comparisonTimeMs = timeMs + 86400000; // Tambah 1 hari (24 jam dalam ms)
  }

  // Find the segment the train is on
  for (let i = 0; i < train.paths.length - 1; i++) {
    const currentStop = train.paths[i];
    const nextStop = train.paths[i + 1];

    // Parse time from depart_ms and arriv_ms only
    const currentDepartMs = currentStop.depart_ms;
    const nextArrivMs = nextStop.arriv_ms;

    // Check if train is in this segment
    if (comparisonTimeMs >= currentDepartMs && comparisonTimeMs <= nextArrivMs) {
      found = true;

      // Check if both stops have position data
      if (!currentStop.pos || !nextStop.pos) {
        break;
      }

      if (currentDepartMs === nextArrivMs) {
        // Train is at a station
        position = {
          lat: currentStop.pos[0],
          lng: currentStop.pos[1],
          station: currentStop.st_cd,
          status: "station",
        };
      } else {
        // Train is between stations - interpolate
        const totalTime = nextArrivMs - currentDepartMs;
        const elapsedTime = comparisonTimeMs - currentDepartMs;
        const progress = elapsedTime / totalTime;

        const lat1 = currentStop.pos[0];
        const lng1 = currentStop.pos[1];
        const lat2 = nextStop.pos[0];
        const lng2 = nextStop.pos[1];

        position = {
          lat: lat1 + (lat2 - lat1) * progress,
          lng: lng1 + (lng2 - lng1) * progress,
          from: currentStop.st_cd,
          to: nextStop.st_cd,
          status: "moving",
        };
      }
      break;
    }
  }

  // Check if train hasn't started yet
  if (!found && train.paths[0]) {
    const firstDepartMs = train.paths[0].depart_ms;
    if (comparisonTimeMs < firstDepartMs) {
      if (train.paths[0].pos) {
        position = {
          lat: train.paths[0].pos[0],
          lng: train.paths[0].pos[1],
          station: train.paths[0].st_cd,
          status: "waiting",
        };
      }
    }
  }

  return position;
}

function updateTrainPositions() {
  const timeMs = simulationTimeMs !== null ? simulationTimeMs : getCurrentTimeMs();
  const timeStr = formatTime(timeMs);

  // Update display
  const simTimeDisplay = document.getElementById("simTime");
  if (simTimeDisplay) {
    simTimeDisplay.textContent = timeStr;
  }

  if (!gapekaData.data) return;

  let activeTrains = 0;

  gapekaData.data.forEach((train) => {
    const position = getTrainPosition(train, timeMs);

    if (position) {
      activeTrains++;
      const trainId = train.tr_id;

      // Remove old marker if exists
      if (trainMarkers[trainId]) {
        trainLayer.removeLayer(trainMarkers[trainId]);
      }

      // Choose color and icon based on status
      let color = "#FF6B6B"; // Red for moving
      let icon = "🚂";

      if (position.status === "station") {
        color = "#4ECDC4"; // Teal for at station
        icon = "🛑";
      } else if (position.status === "waiting") {
        color = "#FFE66D"; // Yellow for waiting
        icon = "⏳";
      }

      const marker = L.circleMarker([position.lat, position.lng], {
        radius: 8,
        color: color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      });

      let tooltipText = `<strong>KA ${train.tr_cd}</strong> - ${train.tr_name}`;
      
      // Get first and last stop times
      const firstStop = train.paths[0];
      const lastStop = train.paths[train.paths.length - 1];
      const departTime = formatTime(firstStop?.depart_ms || 0);
      const arrivTime = formatTime(lastStop?.arriv_ms || 0);
      
      tooltipText += `<br/><strong>Berangkat:</strong> ${departTime} dari ${train.start_st_cd}`;
      tooltipText += `<br/><strong>Tiba:</strong> ${arrivTime} di ${train.end_st_cd}`;
      tooltipText += `<br/><small style="color: #0066cc; cursor: pointer;"><u>Klik untuk jadwal lengkap</u></small>`;
      
      if (position.status === "station") {
        tooltipText += `<br/>📍 Sedang berhenti di: ${position.station}`;
      } else if (position.status === "moving") {
        tooltipText += `<br/>🚃 Sedang berjalan: ${position.from} → ${position.to}`;
      } else if (position.status === "waiting") {
        tooltipText += `<br/>⏳ Menunggu di: ${position.station}`;
      }

      marker.bindPopup(tooltipText).bindTooltip(`${icon} KA ${train.tr_cd}`);
      
      // Add click event to show schedule
      marker.on('click', () => {
        marker.closePopup(); // Close popup first
        showTrainSchedule(train);
      });
      
      marker.addTo(trainLayer);
      trainMarkers[trainId] = marker;
    } else {
      // Remove marker if train is not active
      if (trainMarkers[train.tr_id]) {
        trainLayer.removeLayer(trainMarkers[train.tr_id]);
        delete trainMarkers[train.tr_id];
      }
    }
  });

  console.log(`⏰ WAKTU: ${timeStr} | 🚂 KERETA AKTIF: ${activeTrains}`);
}

function formatTime(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function showTrainSchedule(train) {
  // Remove existing modal if any
  const existingModal = document.getElementById("scheduleModal");
  if (existingModal) existingModal.remove();

  // Create modal
  const modal = document.createElement("div");
  modal.id = "scheduleModal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement("div");
  content.style.cssText = `
    background: white;
    border-radius: 8px;
    padding: 20px;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  `;

  // Title
  const title = document.createElement("h2");
  title.style.margin = "0 0 15px 0";
  title.innerHTML = `🚂 KA ${train.tr_cd} - ${train.tr_name}`;

  // Schedule table
  const table = document.createElement("table");
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  `;

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr style="background: #f0f0f0; border-bottom: 2px solid #ddd;">
      <th style="padding: 10px; text-align: left; border-right: 1px solid #ddd;">Stasiun</th>
      <th style="padding: 10px; text-align: center; border-right: 1px solid #ddd;">Tiba</th>
      <th style="padding: 10px; text-align: center;">Berangkat</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (train.paths) {
    train.paths.forEach((path, index) => {
      const row = document.createElement("tr");
      row.style.borderBottom = "1px solid #eee";

      const arrivTime = path.arriv_ms ? formatTime(path.arriv_ms) : "-";
      const departTime = path.depart_ms ? formatTime(path.depart_ms) : "-";

      row.innerHTML = `
        <td style="padding: 10px; border-right: 1px solid #eee; font-weight: bold;">${path.st_cd}</td>
        <td style="padding: 10px; text-align: center; border-right: 1px solid #eee; color: #0066cc;">${arrivTime}</td>
        <td style="padding: 10px; text-align: center; color: #cc0000;">${departTime}</td>
      `;
      tbody.appendChild(row);
    });
  }
  table.appendChild(tbody);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕ Tutup";
  closeBtn.style.cssText = `
    margin-top: 15px;
    padding: 8px 15px;
    background: #ff6b6b;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
  `;
  closeBtn.onclick = () => modal.remove();

  content.appendChild(title);
  content.appendChild(table);
  content.appendChild(closeBtn);
  modal.appendChild(content);
  document.body.appendChild(modal);

  // Close on background click
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

export function getStationScheduleData(stationCd, stationName) {
  const currentTimeMs = getCurrentTimeMs();
  const currentTimeStr = formatTime(currentTimeMs);
  
  const trains = [];

  if (!gapekaData.data) return;

  // Kumpulkan semua kereta yang melalui stasiun ini sepanjang hari
  gapekaData.data.forEach((train) => {
    if (!train.paths) return;

    train.paths.forEach((path) => {
      if (path.st_cd === stationCd) {
        const pathArrivMs = path.arriv_ms;
        const pathDepartMs = path.depart_ms;
        
        // Jika salah satu tidak valid, skip
        if (pathArrivMs === null && pathDepartMs === null) return;

        const actualArriv = pathArrivMs ?? pathDepartMs;
        const actualDepart = pathDepartMs ?? pathArrivMs;

        trains.push({
          trainCode: train.tr_cd,
          trainName: train.tr_name,
          arriv: pathArrivMs ? formatTime(actualArriv) : "-",
          depart: pathDepartMs ? formatTime(actualDepart) : "-",
          arrivMs: actualArriv,
          departMs: actualDepart,
          fromStation: train.start_st_cd,
          toStation: train.end_st_cd
        });
      }
    });
  });

  // Sort by arrival time (ascending), handle wrap-around times
  trains.sort((a, b) => {
    const aArriv = a.arrivMs || 0;
    const bArriv = b.arrivMs || 0;
    
    // Jika ada pembungkus hari (kereta lintas hari), sort dengan logic khusus
    const modDay = 86400000; // 1 hari dalam ms
    const aSorted = aArriv < 43200000 ? aArriv + modDay : aArriv; // Jika pagi (< 12jam), anggap hari besok
    const bSorted = bArriv < 43200000 ? bArriv + modDay : bArriv;
    return aSorted - bSorted;
  });

  showStationScheduleModal(stationCd, stationName, trains, currentTimeStr);
}

function showStationScheduleModal(stationCd, stationName, trains, currentTimeStr) {
  // Remove existing modal if any
  const existingModal = document.getElementById("stationScheduleModal");
  if (existingModal) existingModal.remove();

  // Create modal
  const modal = document.createElement("div");
  modal.id = "stationScheduleModal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement("div");
  content.style.cssText = `
    background: white;
    border-radius: 8px;
    padding: 20px;
    max-width: 800px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  `;

  // Title
  const title = document.createElement("h2");
  title.style.cssText = "margin: 0 0 10px 0; font-size: 20px;";
  title.innerHTML = `📍 <strong>${stationCd}</strong> - ${stationName}`;

  const timeInfo = document.createElement("div");
  timeInfo.style.cssText = "margin-bottom: 15px; color: #666; font-size: 13px; border-bottom: 1px solid #eee; padding-bottom: 10px;";
  timeInfo.innerHTML = `Jadwal Lengkap Sehari | Waktu Sekarang: <strong>${currentTimeStr}</strong> | Total Kereta: <strong>${trains.length}</strong>`;

  // Schedule table
  const table = document.createElement("table");
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  `;

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr style="background: #f0f0f0; border-bottom: 2px solid #ddd; position: sticky; top: 0;">
      <th style="padding: 10px; text-align: left; border-right: 1px solid #ddd;">No. KA</th>
      <th style="padding: 10px; text-align: left; border-right: 1px solid #ddd;">Nama Kereta</th>
      <th style="padding: 10px; text-align: center; border-right: 1px solid #ddd; min-width: 70px;">Datang</th>
      <th style="padding: 10px; text-align: center; border-right: 1px solid #ddd; min-width: 70px;">Berangkat</th>
      <th style="padding: 10px; text-align: left;">Rute</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (trains.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="5" style="padding: 20px; text-align: center; color: #999;">Tidak ada kereta di stasiun ini</td>`;
    tbody.appendChild(row);
  } else {
    trains.forEach((train) => {
      const row = document.createElement("tr");
      row.style.borderBottom = "1px solid #eee";

      row.innerHTML = `
        <td style="padding: 10px; border-right: 1px solid #eee; font-weight: bold; color: #0066cc;">KA ${train.trainCode}</td>
        <td style="padding: 10px; border-right: 1px solid #eee;">${train.trainName}</td>
        <td style="padding: 10px; text-align: center; border-right: 1px solid #eee; color: #0066cc; font-weight: bold;">${train.arriv}</td>
        <td style="padding: 10px; text-align: center; border-right: 1px solid #eee; color: #cc0000; font-weight: bold;">${train.depart}</td>
        <td style="padding: 10px;">${train.fromStation} → ${train.toStation}</td>
      `;
      tbody.appendChild(row);
    });
  }
  table.appendChild(tbody);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕ Tutup";
  closeBtn.style.cssText = `
    margin-top: 15px;
    padding: 10px 20px;
    background: #ff6b6b;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    width: 100%;
  `;
  closeBtn.onclick = () => modal.remove();

  content.appendChild(title);
  content.appendChild(timeInfo);
  content.appendChild(table);
  content.appendChild(closeBtn);
  modal.appendChild(content);
  document.body.appendChild(modal);

  // Close on background click
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}