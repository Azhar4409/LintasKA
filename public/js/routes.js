export async function loadRoutes(map) {
    try {
        // JANGAN pakai /api/routes, pakai path file json aslinya
        const res = await fetch("./data/route-path.json"); 
        
        if (!res.ok) throw new Error("File JSON Rute tidak ditemukan");

        const json = await res.json();
        
        json.data.forEach(route => {
            route.paths.forEach(p => {
                L.polyline(p.pos, { 
                    color: '#333', 
                    weight: 2, 
                    opacity: 0.5,
                    interactive: false // Supaya tidak menghalangi klik stasiun/kereta
                }).addTo(map);
            });
        });
        console.log("Rute berhasil dimuat dari file lokal");
    } catch (err) { 
        console.error("Gagal load rute:", err); 
    }
}