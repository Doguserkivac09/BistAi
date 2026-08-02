/**
 * Fırsat Gerekçe Üretimi (FAZ S1 — "Neden bu hisse?").
 * SAF/deterministik, UI'sız. Tek kaynak: FirsatlarScreen + FirsatKarti + BugunScreen
 * hepsi bunu tüketir. Yeni hesap YOK — hesaplanmış sinyaller/faktörler sade Türkçeye çevrilir.
 *
 * İLKELER: jargon yasak · motor içi (-8/-10/scoreCap) sızmaz · maks 4 rozet ·
 * öncelik sıralı · warn asla gizlenmez · kanıt varsa göster (combo isabet).
 */

export type ReasonTone = 'pos' | 'warn' | 'neutral';

export interface Reason {
  id: string;            // stabil anahtar (test + telemetri)
  priority: number;      // düşük = önce
  tone: ReasonTone;
  text: string;          // kısa rozet metni (sade Türkçe)
  detail?: string;       // tooltip / detay
  evidence?: string;     // ölçülmüş kanıt (combo isabet oranı vb.)
}

export interface OpportunityInput {
  sinyaller: string[];
  direction: 'yukari' | 'asagi' | 'notr';
  relVol5?: number | null;
  weeklyAligned?: boolean | null;
  aboveMA?: boolean | null;
  tavanYaklasiyor?: boolean;
  isTavan?: boolean;
  daysUntilEarnings?: number | null;
  smartMoneyPhase?: 'smart_money_entered' | 'accumulation' | 'distribution' | null;
  catalyst?: { sentiment: string; aligned: boolean } | null;
  earningsRisk?: { verdict: string; financeBurden: boolean; redFlag: string | null } | null;
  combo?: { members: string[]; winRate: number; n: number } | null;
  sectorAlign?: number | null;
  kapEvent?: boolean;
}

// ── Sinyal → sade Türkçe rozet sözlüğü (motor adları DEĞİŞMEZ, yalnız görüntü) ──
type Entry = { text: string; tone: ReasonTone; priority: number };
// Yöne bağlı olmayan sinyaller
const SIGNAL_MAP: Record<string, Entry> = {
  'Trend Başlangıcı':          { text: 'Yeni yükseliş trendi başlıyor', tone: 'pos', priority: 6 },
  'Altın Çapraz':              { text: 'Uzun vadeli al sinyali (Altın Kesişim)', tone: 'pos', priority: 6 },
  'Altın Çapraz Yaklaşıyor':   { text: 'Altın Kesişim’e yaklaşıyor', tone: 'pos', priority: 9 },
  'Hacim Anomalisi':           { text: 'Olağandışı hacim girişi', tone: 'pos', priority: 5 },
  'Para Akışı Uyumsuzluğu':    { text: 'Fiyat düşerken alım gücü artıyor', tone: 'pos', priority: 4 },
  'RSI Uyumsuzluğu':           { text: 'Satış baskısı zayıflıyor', tone: 'pos', priority: 4 },
  'Destek/Direnç Kırılımı':    { text: 'Direnci kırdı', tone: 'pos', priority: 6 },
  'Bollinger Sıkışması':       { text: 'Sıkışma — sert hareket yakın', tone: 'neutral', priority: 11 },
  'Higher Lows':               { text: 'Dönüş formasyonu: Yükselen Dipler', tone: 'pos', priority: 8 },
  'Çift Dip':                  { text: 'Dönüş formasyonu: Çift Dip', tone: 'pos', priority: 8 },
  'Ters Omuz-Baş-Omuz':        { text: 'Dönüş formasyonu: Ters O-B-O', tone: 'pos', priority: 8 },
  'Cup & Handle':              { text: 'Dönüş formasyonu: Fincan-Kulp', tone: 'pos', priority: 8 },
  'Bull Flag':                 { text: 'Dönüş formasyonu: Yükseliş Bayrağı', tone: 'pos', priority: 8 },
  'Yükselen Üçgen':            { text: 'Dönüş formasyonu: Yükselen Üçgen', tone: 'pos', priority: 8 },
  'Direnç Testi':              { text: 'Direnç seviyesini test ediyor', tone: 'neutral', priority: 12 },
  'Trend Olgunlaşıyor':        { text: 'Momentum yavaşlıyor', tone: 'warn', priority: 23 },
  'MACD Daralıyor':            { text: 'Momentum yavaşlıyor', tone: 'warn', priority: 23 },
  'Çift Tepe':                 { text: 'Zayıflama formasyonu: Çift Tepe', tone: 'warn', priority: 22 },
  'Bear Flag':                 { text: 'Zayıflama formasyonu: Düşüş Bayrağı', tone: 'warn', priority: 22 },
  'Ölüm Çaprazı':              { text: 'Uzun vadeli sat sinyali (Ölüm Kesişimi)', tone: 'warn', priority: 21 },
};

/** Yöne bağlı sinyaller (aynı tip yukarı=pozitif, aşağı=uyarı) */
function directionalSignal(type: string, dir: string): Reason | null {
  const up = dir === 'yukari';
  switch (type) {
    case 'MACD Kesişimi':
      return { id: 'macd', priority: 7, tone: up ? 'pos' : 'warn', text: up ? 'Momentum yukarı döndü' : 'Momentum aşağı döndü' };
    case 'Vortex Kesişimi':
      return { id: 'vortex', priority: 7, tone: up ? 'pos' : 'warn', text: up ? 'Trend yukarı döndü (Vortex)' : 'Trend aşağı döndü (Vortex)' };
    case 'RSI Seviyesi':
      return up
        ? { id: 'rsi-lvl', priority: 10, tone: 'pos', text: 'Aşırı satımdan dönüş' }
        : { id: 'rsi-lvl', priority: 24, tone: 'warn', text: 'Aşırı alım bölgesinde' };
    default:
      return null;
  }
}

/** Tüm gerekçeleri üretir (seçilmemiş, öncelik sıralı). */
export function deriveReasons(input: OpportunityInput): Reason[] {
  const out: Reason[] = [];
  const seenFamily = new Set<string>();

  // 1) Akıllı para fazı (en aksiyon-alınabilir)
  if (input.smartMoneyPhase === 'smart_money_entered') out.push({ id: 'smart-money', priority: 1, tone: 'pos', text: 'Akıllı para girişi başladı' });
  else if (input.smartMoneyPhase === 'accumulation') out.push({ id: 'accumulation', priority: 5, tone: 'pos', text: 'Sessiz birikim aşamasında' });
  else if (input.smartMoneyPhase === 'distribution') out.push({ id: 'distribution', priority: 20, tone: 'warn', text: 'Dağıtım baskısı var' });

  // 2) Onaylı kurulum (ölçülmüş combo isabeti — kanıt)
  if (input.combo) {
    out.push({ id: 'combo', priority: 2, tone: 'pos', text: 'Onaylı kurulum',
      detail: input.combo.members.join(' + '),
      evidence: `Bu kurulum geçmişte %${Math.round(input.combo.winRate)} tuttu (n=${input.combo.n})` });
  }

  // 3) Katalist
  if (input.catalyst) {
    if (input.catalyst.aligned && input.catalyst.sentiment === 'pozitif') out.push({ id: 'catalyst-pos', priority: 3, tone: 'pos', text: 'Haber katalisti destekliyor' });
    else if (!input.catalyst.aligned && input.catalyst.sentiment !== 'nötr') out.push({ id: 'catalyst-conflict', priority: 20, tone: 'warn', text: 'Haber sinyalle çelişiyor' });
  }

  // 4) Sinyaller (aile bazında en güçlü tek gerekçe)
  for (const t of input.sinyaller) {
    const dirReason = directionalSignal(t, input.direction);
    if (dirReason) { if (!seenFamily.has(dirReason.id)) { seenFamily.add(dirReason.id); out.push(dirReason); } continue; }
    const e = SIGNAL_MAP[t];
    if (!e) continue;
    // Formasyonları tek "dönüş/zayıflama formasyonu" ailesinde tekilleştir
    const fam = e.text.startsWith('Dönüş formasyonu') ? 'fam-donus' : e.text.startsWith('Zayıflama') ? 'fam-zayif' : `sig-${t}`;
    if (seenFamily.has(fam)) continue;
    seenFamily.add(fam);
    out.push({ id: `sig-${t}`, priority: e.priority, tone: e.tone, text: e.text });
  }

  // 5) Hacim
  if (input.relVol5 != null && input.relVol5 >= 1.5) {
    out.push({ id: 'rvol', priority: 5, tone: 'pos', text: `Hacim ortalamanın ${input.relVol5.toFixed(1)}× üstünde` });
  }

  // 6) Hareketli ortalama / haftalık uyum / sektör
  if (input.aboveMA) out.push({ id: 'above-ma', priority: 9, tone: 'pos', text: 'Hareketli ortalamaların üstünde' });
  if (input.weeklyAligned) out.push({ id: 'weekly', priority: 9, tone: 'pos', text: 'Haftalık trend de aynı yönde' });
  if (input.sectorAlign != null && input.sectorAlign > 0) out.push({ id: 'sector', priority: 10, tone: 'pos', text: 'Sektörü de güçlü' });

  // 7) Tavan
  if (input.isTavan) out.push({ id: 'tavan', priority: 13, tone: 'neutral', text: 'Tavana yakın / tavan' });
  else if (input.tavanYaklasiyor) out.push({ id: 'tavan-yak', priority: 13, tone: 'neutral', text: 'Tavana yaklaşıyor' });

  // 8) Uyarılar — bilanço / KAP / temel (motor içi sayı SIZMAZ, gerekçeye çevrilir)
  if (input.daysUntilEarnings != null && input.daysUntilEarnings >= 0 && input.daysUntilEarnings <= 5) {
    out.push({ id: 'earnings-soon', priority: 21, tone: 'warn', text: `Bilanço ${input.daysUntilEarnings} gün sonra — belirsizlik` });
  }
  if (input.kapEvent) out.push({ id: 'kap', priority: 22, tone: 'warn', text: 'Son 7 günde kritik şirket duyurusu' });
  if (input.earningsRisk) {
    const er = input.earningsRisk;
    if (er.verdict === 'belirsiz') out.push({ id: 'eq-belirsiz', priority: 21, tone: 'warn', text: 'Kâr kalitesi belirsiz (yatırım/değerleme kârı)' });
    else if (er.redFlag) out.push({ id: 'eq-red', priority: 21, tone: 'warn', text: `Bilanço riski: ${er.redFlag}` });
    else if (er.financeBurden) out.push({ id: 'eq-fin', priority: 21, tone: 'warn', text: 'Finansman yükü yüksek' });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

/**
 * Gösterilecek gerekçeleri seçer: maks `max`, EN AZ 1 uyarı görünür (varsa),
 * öncelik sıralı. Uyarı asla pozitiflere kurban edilmez.
 */
export function selectTopReasons(reasons: Reason[], max = 4): Reason[] {
  const sorted = [...reasons].sort((a, b) => a.priority - b.priority);
  const picked = sorted.slice(0, max);
  const firstWarn = sorted.find((r) => r.tone === 'warn');
  if (firstWarn && !picked.some((r) => r.tone === 'warn')) {
    if (picked.length < max) picked.push(firstWarn);
    else picked[max - 1] = firstWarn; // en düşük öncelikli pozitifi uyarıyla değiştir
  }
  return picked.sort((a, b) => a.priority - b.priority);
}

/** Tek cümlelik özet — en yüksek öncelikli 1-2 pozitiften; yoksa ilk gerekçeden. */
export function buildSummary(reasons: Reason[]): string {
  if (reasons.length === 0) return 'Belirgin bir gerekçe yok.';
  const sorted = [...reasons].sort((a, b) => a.priority - b.priority);
  const pos = sorted.filter((r) => r.tone === 'pos').slice(0, 2);
  if (pos.length === 0) return sorted[0]!.text + '.';
  if (pos.length === 1) return pos[0]!.text + '.';
  return `${pos[0]!.text}; ${pos[1]!.text.charAt(0).toLowerCase()}${pos[1]!.text.slice(1)}.`;
}
