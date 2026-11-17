<script>
  // Überschrift Wort für Wort: jedes Wort steigt aus einer Maske auf,
  // gesteuert von --in der Szene (siehe projekt.css).
  let { text, from = 0 } = $props();
  const words = $derived(text.split(" "));
</script>

{#each words as w, i}<span class="w" style="--i:{from + i}"><span class="wi">{w}</span></span>{" "}{/each}
