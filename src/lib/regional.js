// Regionalverkehr von Arverio (früher Go-Ahead) steht NICHT in der DB-Reisehistorie.
// Wer diese Fahrten in den Kapiteln "Arverio Bayern" und "Arverio Baden-Württemberg" mitzählen will, trägt sie hier ein.
// Solange hier nichts steht, nennen die Kapitel keine Zahlen und sagen ehrlich, dass sie fehlen.
//
//   fahrten:  Anzahl der Fahrten im Jahr, z. B. 24  (null = unbekannt)
//   strecken: kurze Beschreibung, z. B. "Augsburg – Lindau" (leer = weglassen)
export const REGIONAL = {
  bayern: { fahrten: null, strecken: "" },
  bawue: { fahrten: null, strecken: "" },
};
