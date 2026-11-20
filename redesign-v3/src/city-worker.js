// Lädt und zerlegt eine Stadtdatei außerhalb des Hauptthreads. Das JSON-Parsen großer Städte (bis 1,6 MB)
// blockiert sonst 100 ms und mehr und lässt Kamerafahrten ruckeln. Das Ergebnis geht in kleinen Portionen
// zurück, damit auch das Übernehmen im Hauptthread nie lange dauert.
self.onmessage = async ({ data: { id, url, batch } }) => {
  try {
    const r = await fetch(url);
    if (!r.ok) { postMessage({ id, type: "none" }); return; }
    const d = await r.json();
    const send = (part, arr) => { for (let i = 0; i < arr.length; i += batch) postMessage({ id, type: part, v: arr.slice(i, i + batch) }); };
    send("b", d.b);
    send("road", d.road);
    send("rail", d.rail);
    send("water", d.water || []);
    send("wa", d.wa || []);
    postMessage({ id, type: "end" });
  } catch (e) {
    postMessage({ id, type: "error", message: String(e) });
  }
};
