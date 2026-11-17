// Linien, die sich Stück für Stück zeichnen. Statt pathLength="1" (setzen manche Handy-Browser falsch um:
// Linien stehen dann schon vor dem Start da oder laufen gar nicht) wird die echte Länge gemessen und in Pixeln gerechnet.
// Nutzung:  <path use:measure style={drawn(f)} />   mit f von 0 bis 1.
export function measure(node) {
  const set = () => node.style.setProperty("--len", node.getTotalLength().toFixed(2));
  set();
}

export const drawn = (f) => {
  const k = f < 0 ? 0 : f > 1 ? 1 : f;
  return `stroke-dasharray:calc(var(--len,99999) * 1px);stroke-dashoffset:calc(var(--len,99999) * ${(1 - k).toFixed(4)} * 1px);stroke-opacity:${k > 0.0005 ? 1 : 0}`;
};
