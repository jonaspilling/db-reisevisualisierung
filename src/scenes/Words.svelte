<script>
  // Überschrift Wort für Wort: jedes Wort steigt aus einer Maske auf,
  // gesteuert von --in der Szene (siehe projekt.css).
  // Ein Wort mit * davor setzt die Sonderschrift (Akzentwort): Words text="Bis zum *Mond sind es noch"
  let { text, from = 0 } = $props();
  const words = $derived(text.split(" ").map((w) => ({ t: w.replace(/^\*/, ""), sp: w.startsWith("*") })));
</script>

{#each words as w, i}<span class="w" style="--i:{from + i}"><span class="wi" class:special={w.sp}>{w.t}</span></span>{" "}{/each}
