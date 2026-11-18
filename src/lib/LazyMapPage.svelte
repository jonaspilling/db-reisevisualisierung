<script module>
  // Die Karte (MapLibre, gut 800 kB Code) wird erst geladen, wenn sie gebraucht wird: Der Start der Seite
  // bleibt dadurch auf schwächeren Geräten flüssig. Einmal geladen, teilen sich alle Karten denselben Code.
  let loading = null;
  export const loadMapPage = () => (loading ??= import("../pages/MapPage.svelte"));
</script>

<script>
  let props = $props();
  const mod = loadMapPage();
</script>

{#await mod then m}
  <m.default {...props} />
{/await}
