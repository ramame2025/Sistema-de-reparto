const WEEKDAYS = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIERCOLES',
  'JUEVES',
  'VIERNES',
  'SABADO',
] as const;

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * La jornada como la nombra el chofer: "JUEVES 28/08".
 *
 * Lee el calendario del dispositivo (getDay/getDate/getMonth), no UTC: a las
 * 23:30 de un jueves el chofer sigue trabajando el jueves, aunque para el
 * servidor ya sea viernes. Mismo criterio que `TruckContext.localDay`.
 *
 * Los nombres van sin acento a proposito, para no depender de que el motor
 * traiga los datos de locale (ver el comentario de `formatArs`).
 */
export function formatJornada(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}
