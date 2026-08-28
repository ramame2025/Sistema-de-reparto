/**
 * Distancia en el lenguaje del chofer: metros redondeados de a diez cuando el
 * cliente esta cerca, kilometros con un decimal cuando no. Debajo del
 * kilometro los metros son lo unico accionable ("a 40 m" se camina, "a 0,04
 * km" no se lee); arriba del kilometro, los metros son ruido.
 */
export function formatDistance(kilometers: number): string {
  if (kilometers < 1) {
    const meters = Math.round((kilometers * 1000) / 10) * 10;
    return `a ${meters} m`;
  }

  return `a ${kilometers.toFixed(1).replace('.', ',')} km`;
}
