// ICE Futures U.S. cocoa trading hours: 4:45 a.m. – 1:30 p.m. New York time, Monday to Friday
// (10:45 – 19:30 in Paris most of the year). Exchange holidays are not known here.
const OPEN = 4 * 60 + 45, CLOSE = 13 * 60 + 30;

export function cocoaMarketOpen(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
  const m = Number(p.hour) * 60 + Number(p.minute);
  return m >= OPEN && m < CLOSE;
}
