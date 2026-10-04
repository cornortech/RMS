// Nepali (Bikram Sambat) date for bills and reports.
// Uses Nepal time (UTC+5:45) so the date is right on any computer.
import * as NepaliDateModule from 'nepali-date-converter';

// The package can arrive in different shapes depending on the bundler,
// so find the NepaliDate class wherever it is.
const pickClass = (m: any): any =>
  typeof m === 'function' ? m
  : typeof m?.default === 'function' ? m.default
  : typeof m?.default?.default === 'function' ? m.default.default
  : null;
const NepaliDate: any = pickClass(NepaliDateModule);

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

// "2082-06-16". If the server already saved the BS date, that one is used.
export function toBS(date?: string | number | Date, saved?: string): string {
  if (saved) return saved;
  if (!NepaliDate) return '';
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return '';
  const t = new Date(d.getTime() + NEPAL_OFFSET_MS);
  const day = new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12);
  return new NepaliDate(day).format('YYYY-MM-DD');
}