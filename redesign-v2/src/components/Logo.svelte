<script>
  // Vier Logo-Entwürfe, im Studio-Knopf (Aa) umschaltbar. v = Nummer, sonst die gewählte.
  // Alle vier sind einfach gebaut, damit sie auch mit 28 px noch lesbar sind.
  import { studio } from "../lib/studio.svelte.js";

  let { size = 28, v = null } = $props();
  const n = $derived(v ?? studio.logo);
</script>

<svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" class="logo">
  {#if n === 0}
    <!-- ICE von vorn: Frontscheibe, Scheinwerfer, Schaumkrone auf dem Dach -->
    <rect width="32" height="32" rx="9" fill="#ec0016" />
    <circle cx="11.6" cy="6.6" r="2.6" fill="#ffe9a8" />
    <circle cx="16" cy="5.4" r="3.2" fill="#fff6dc" />
    <circle cx="20.4" cy="6.6" r="2.6" fill="#ffe9a8" />
    <path d="M7.5 25V14.5C7.5 11 10.6 8.4 16 8.4S24.5 11 24.5 14.5V25Z" fill="#fff" />
    <path d="M10 13.6C10 12.2 12.4 11 16 11S22 12.2 22 13.6V18H10Z" fill="#14231b" />
    <circle cx="11.4" cy="21.4" r="1.5" fill="#f2b705" />
    <circle cx="20.6" cy="21.4" r="1.5" fill="#f2b705" />
    <path d="M5.5 27.6h21" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />
  {:else if n === 1}
    <!-- ICE von der Seite, lange Nase, im Kreis -->
    <circle cx="16" cy="16" r="16" fill="#ec0016" />
    <path d="M3.6 20.6V15.4C3.6 14 4.4 13.2 5.8 13.2H17C20.6 13.2 24 15.4 28.6 19.2V20.6Z" fill="#fff" />
    <path d="M6 14.6h2.8v2.6H6zM10 14.6h2.8v2.6H10zM14 14.6h2.6v2.6H14zM19.6 14.8c2 0 3.8 1 5.4 2.4h-5.4z" fill="#14231b" />
    <path d="M3.6 19.2h25" stroke="#ec0016" stroke-width="1" />
    <circle cx="9" cy="22.2" r="1.5" fill="#fff" />
    <circle cx="22" cy="22.2" r="1.5" fill="#fff" />
    <path d="M3 24.8h26" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />
  {:else if n === 2}
    <!-- Pils-Tulpe, in der Gleise zum Horizont laufen -->
    <rect width="32" height="32" rx="9" fill="#ec0016" />
    <path d="M10.6 5.4h10.8c.6 4.4.3 8.6-1.6 11.8-1.4 2.4-2.8 4-2.8 6.2v3.2c0 .8 2.6 1 4 1.9.5.4-.4 1.1-4.6 1.1s-5.1-.7-4.6-1.1c1.4-.9 4-1.1 4-1.9v-3.2c0-2.2-1.4-3.8-2.8-6.2-1.9-3.2-2.2-7.4-1.6-11.8Z" fill="#f2b705" />
    <path d="M14.1 18.2 15.7 8.2M17.9 18.2 16.3 8.2" stroke="#7a3d00" stroke-width="1.1" stroke-linecap="round" fill="none" />
    <path d="M13.6 15.6h4.8M13 12.8h6M12.4 10h7.2" stroke="#7a3d00" stroke-width=".8" stroke-linecap="round" />
    <path d="M10.2 4.6c0-1.6 1.6-2.4 3.2-1.8 1-1.2 3.4-1.2 4.4 0 1.6-.6 3.2.2 3.2 1.8v1.8H10.2Z" fill="#fff6dc" />
    <path d="M10.6 5.4h10.8c.6 4.4.3 8.6-1.6 11.8-1.4 2.4-2.8 4-2.8 6.2v3.2c0 .8 2.6 1 4 1.9.5.4-.4 1.1-4.6 1.1s-5.1-.7-4.6-1.1c1.4-.9 4-1.1 4-1.9v-3.2c0-2.2-1.4-3.8-2.8-6.2-1.9-3.2-2.2-7.4-1.6-11.8Z" fill="none" stroke="#fff" stroke-width="1.3" stroke-linejoin="round" />
  {:else}
    <!-- Zugfenster mit B, Schaumtupfer darüber -->
    <rect width="32" height="32" rx="9" fill="#ec0016" />
    <path d="M5 12.4C5 10.6 6.4 9.4 8.2 9.4H23.8C25.6 9.4 27 10.6 27 12.4V23.6H5Z" fill="#14231b" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" />
    <circle cx="10" cy="6.2" r="2.1" fill="#ffe9a8" />
    <circle cx="14.2" cy="5" r="2.7" fill="#fff6dc" />
    <circle cx="18.6" cy="5.8" r="2.3" fill="#fff6dc" />
    <path fill="#fff" fill-rule="evenodd" d="M12 12.4h5.3a2.9 2.9 0 0 1 1.6 5.3 3.2 3.2 0 0 1-1 6.1H12zM14.2 14.2v2.6h2.6a1.3 1.3 0 0 0 0-2.6zM14.2 18.5v3.4h3a1.7 1.7 0 0 0 0-3.4z" transform="translate(1.1 -0.8)" />
  {/if}
</svg>

<style>
  .logo {
    display: block;
    flex: none;
  }
</style>
