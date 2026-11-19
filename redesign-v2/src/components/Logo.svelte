<script>
  // Das Zeichen: eine dampfende Tasse auf einem Stück Gleis
  let { size = 28 } = $props();
</script>

<svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" class="logo">
  <rect width="32" height="32" rx="7" fill="#ec0016" />
  <path d="M12 8.2c-1.4 1.6 1.4 2.6 0 4.4M17 7c-1.4 1.6 1.4 2.6 0 4.4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" />
  <path d="M8 14h14v4.5A6.5 6.5 0 0 1 15.5 25h-1A6.5 6.5 0 0 1 8 18.5z" fill="#fff" />
  <path d="M22 15.4h1.4a2.7 2.7 0 0 1 0 5.4H21.4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" />
  <path d="M6 27.6h20M10 26.4v2.6M16 26.4v2.6M22 26.4v2.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />
</svg>

<style>
  .logo {
    display: block;
    flex: none;
  }
</style>
