/**
 * lib/emtia-instruments.ts
 * Emtia & Endeks enstrümanları — paylaşılan tipler ve sabitler
 */

export type InstrumentCategory = 'endeks' | 'emtia' | 'doviz';

export const INSTRUMENTS = [
  { symbol: '^XU100.IS', name: 'BIST 100',     nameShort: 'XU100',   category: 'endeks' as InstrumentCategory, currency: 'TRY', icon: '📈', desc: 'Borsa İstanbul 100 Endeksi' },
  { symbol: '^XU030.IS', name: 'BIST 30',      nameShort: 'XU030',   category: 'endeks' as InstrumentCategory, currency: 'TRY', icon: '📊', desc: 'Borsa İstanbul 30 Endeksi' },
  { symbol: 'GC=F',      name: 'Altın',        nameShort: 'XAU/USD', category: 'emtia'  as InstrumentCategory, currency: 'USD', icon: '🥇', desc: 'Altın Vadeli ($/Ons)' },
  { symbol: 'SI=F',      name: 'Gümüş',        nameShort: 'XAG/USD', category: 'emtia'  as InstrumentCategory, currency: 'USD', icon: '🥈', desc: 'Gümüş Vadeli ($/Ons)' },
  { symbol: 'BZ=F',      name: 'Brent Petrol', nameShort: 'BRENT',   category: 'emtia'  as InstrumentCategory, currency: 'USD', icon: '🛢️', desc: 'Brent Ham Petrol ($/Varil)' },
  { symbol: 'USDTRY=X',  name: 'Dolar/TL',    nameShort: 'USD/TRY', category: 'doviz'  as InstrumentCategory, currency: 'TRY', icon: '💵', desc: 'ABD Doları / Türk Lirası' },
  { symbol: 'EURTRY=X',  name: 'Euro/TL',     nameShort: 'EUR/TRY', category: 'doviz'  as InstrumentCategory, currency: 'TRY', icon: '💶', desc: 'Euro / Türk Lirası' },
] as const;

export interface InstrumentAnalysis {
  symbol:          string;
  name:            string;
  nameShort:       string;
  category:        InstrumentCategory;
  currency:        string;
  icon:            string;
  desc:            string;
  lastClose:       number | null;
  changePercent:   number | null;
  rsi:             number | null;
  relVol5:         number | null;
  confluenceScore: number | null;
  signals:         Array<{ type: string; direction: string; severity: string }>;
  decision:        'AL' | 'TUT' | 'SAT';
  decisionScore:   number;
  keyReason:       string;
  support52w:      number | null;
  resistance52w:   number | null;
  error:           string | null;
}
