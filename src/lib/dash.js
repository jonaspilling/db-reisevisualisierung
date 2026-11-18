// Linien, die sich Stück für Stück zeichnen. Statt pathLength="1" (setzen manche Handy-Browser falsch um:
// Linien stehen dann schon vor dem Start da oder laufen gar nicht) wird die echte Länge gemessen und in Pixeln gerechnet.
// Nutzung:
//   <path use:measure style:stroke-dashoffset={dashOff(f)} style:stroke-opacity={dashVis(f)} />
// und im CSS der Linie:  stroke-dasharray: calc(var(--len, 99999) * 1px);
// Wichtig: die Länge steckt in der Variable --len. Sie darf nicht über ein style="..."-Attribut gesetzt werden, das
// sich ändert (Svelte schreibt das ganze Attribut neu und löscht dabei --len), deshalb einzelne style:-Angaben.
export function measure(node) {
  node.style.setProperty("--len", node.getTotalLength().toFixed(2));
}

const clamp = (f) => (f < 0 ? 0 : f > 1 ? 1 : f);

export const dashOff = (f) => `calc(var(--len, 99999) * ${(1 - clamp(f)).toFixed(4)} * 1px)`;

// Bei null Fortschritt ganz ausblenden (sonst bleibt ein Punkt an der runden Linienkappe stehen)
export const dashVis = (f) => (clamp(f) > 0.0005 ? 1 : 0);
