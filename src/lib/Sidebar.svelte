<script>
  let {
    trips = [],
    stationCount = 0,
    selectedId = null,
    showOrm = $bindable(false),
    onSelectTrip,
    onReset,
  } = $props();

  let totalKm = $derived(
    Math.round(trips.reduce((sum, t) => sum + (t.distanz_km || 0), 0)).toLocaleString("de-DE")
  );
</script>

<aside class="sidebar">
  <header>
    <h1>Bahnreisen 2026</h1>
    <p class="subtitle">Schienennetz-Visualisierung</p>
  </header>

  <div class="stats-grid">
    <div class="stat-card">
      <span class="stat-value">{trips.length}</span>
      <span class="stat-label">Fahrten</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{totalKm}</span>
      <span class="stat-label">Schienen-km</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{stationCount}</span>
      <span class="stat-label">Bahnhöfe</span>
    </div>
  </div>

  <div class="controls">
    <button class="btn-primary" onclick={onReset}>Alle Fahrten anzeigen</button>
    <label class="toggle-label">
      <input type="checkbox" bind:checked={showOrm} />
      OpenRailwayMap-Netz einblenden
    </label>
  </div>

  <ul class="trip-list">
    {#each trips as trip (trip.id)}
      <li>
        <button
          class="trip-item"
          class:active={selectedId === trip.id}
          onclick={() => onSelectTrip(trip.id)}
        >
          <div class="trip-meta">
            <span>{trip.datum} &bull; {trip.zuege}</span>
            <span>{trip.distanz_km} km</span>
          </div>
          <div class="trip-route">{trip.start} &rarr; {trip.ziel}</div>
        </button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .sidebar {
    background: #1e293b;
    border-right: 1px solid #334155;
    display: flex;
    flex-direction: column;
    padding: 1.25rem;
    overflow: hidden;
  }

  header h1 {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .subtitle {
    font-size: 0.85rem;
    color: #94a3b8;
    margin-top: 0.2rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin: 1rem 0;
  }

  .stat-card {
    background: #0f172a;
    padding: 0.65rem 0.5rem;
    border-radius: 8px;
    text-align: center;
    border: 1px solid #334155;
  }

  .stat-value {
    display: block;
    font-size: 1.1rem;
    font-weight: 700;
    color: #38bdf8;
  }

  .stat-label {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .btn-primary {
    background: #0284c7;
    color: #fff;
    border: none;
    padding: 0.55rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .btn-primary:hover {
    background: #0369a1;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: #cbd5e1;
    cursor: pointer;
  }

  .trip-list {
    list-style: none;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-right: 0.25rem;
  }

  .trip-item {
    width: 100%;
    text-align: left;
    color: inherit;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.7rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .trip-item:hover,
  .trip-item.active {
    border-color: #38bdf8;
    background: #172554;
  }

  .trip-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #94a3b8;
    margin-bottom: 0.25rem;
  }

  .trip-route {
    font-size: 0.88rem;
    font-weight: 600;
  }
</style>