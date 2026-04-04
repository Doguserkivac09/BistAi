'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calculator, TrendingUp, Target, PieChart, Info, DollarSign, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Yardımcı ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function InputField({
  label, value, onChange, suffix, hint, min = 0,
}: {
  label: string; value: string; onChange: (v: string) => void;
  suffix?: string; hint?: string; min?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="number" min={min} value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder-text-secondary/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-[10px] text-text-secondary/50">{hint}</p>}
    </div>
  );
}

function ResultRow({ label, value, highlight, positive, negative }: {
  label: string; value: string; highlight?: boolean; positive?: boolean; negative?: boolean;
}) {
  return (
    <div className={cn('flex items-center justify-between py-2 border-b border-border/50 last:border-0', highlight && 'py-3')}>
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={cn(
        'font-mono font-semibold',
        highlight ? 'text-lg' : 'text-sm',
        positive ? 'text-emerald-400' : negative ? 'text-red-400' : highlight ? 'text-primary' : 'text-text-primary'
      )}>
        {value}
      </span>
    </div>
  );
}

function Card({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border bg-primary/5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ── 1. Kâr / Zarar Hesabı ────────────────────────────────────────────────────

function KarZarar({ defaultFiyat = '' }: { defaultFiyat?: string }) {
  const [alis,    setAlis]    = useState('');
  const [lot,     setLot]     = useState('');
  const [mevcut,  setMevcut]  = useState(defaultFiyat);

  const alisN   = parseFloat(alis)   || 0;
  const lotN    = parseFloat(lot)    || 0;
  const mevcutN = parseFloat(mevcut) || 0;

  const maliyet      = alisN * lotN;
  const mevcutDeger  = mevcutN * lotN;
  const karZararTL   = mevcutDeger - maliyet;
  const karZararPct  = maliyet > 0 ? (karZararTL / maliyet) * 100 : 0;
  const valid = alisN > 0 && lotN > 0 && mevcutN > 0;
  const kazandi = karZararTL >= 0;

  return (
    <Card title="Kâr / Zarar Hesabı" icon={DollarSign}>
      <div className="grid grid-cols-3 gap-3">
        <InputField label="Alış Fiyatı" value={alis}   onChange={setAlis}   suffix="₺" />
        <InputField label="Lot Sayısı"  value={lot}    onChange={setLot}    suffix="adet" />
        <InputField label="Güncel Fiyat" value={mevcut} onChange={setMevcut} suffix="₺" />
      </div>

      {valid ? (
        <div className="space-y-3 mt-2">
          {/* Ana sonuç */}
          <div className={cn(
            'rounded-lg border p-4 text-center',
            kazandi ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
          )}>
            <p className="text-xs text-text-secondary mb-1">Kâr / Zarar</p>
            <p className={cn('text-4xl font-bold font-mono', kazandi ? 'text-emerald-400' : 'text-red-400')}>
              {kazandi ? '+' : ''}{fmt(karZararTL)} ₺
            </p>
            <p className={cn('text-sm font-semibold mt-1', kazandi ? 'text-emerald-400' : 'text-red-400')}>
              {kazandi ? '+' : ''}{fmt(karZararPct)}%
            </p>
          </div>

          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-0.5">
            <ResultRow label="Toplam Maliyet"   value={`₺${fmt(maliyet)}`} />
            <ResultRow label="Güncel Değer"      value={`₺${fmt(mevcutDeger)}`} />
            <ResultRow
              label="Net Kâr / Zarar"
              value={`${kazandi ? '+' : ''}₺${fmt(karZararTL)} (%${fmt(karZararPct)})`}
              highlight positive={kazandi} negative={!kazandi}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-white/3 border border-border px-4 py-3 text-xs text-text-secondary">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Alış fiyatı, lot sayısı ve güncel fiyatı girin.
        </div>
      )}
    </Card>
  );
}

// ── 2. Pozisyon Büyüklüğü ─────────────────────────────────────────────────────

function PozisyonBuyuklugu() {
  const [portfolyo, setPortfolyo] = useState('100000');
  const [risk,      setRisk]      = useState('2');
  const [giris,     setGiris]     = useState('');
  const [stopLoss,  setStopLoss]  = useState('');

  const portfolyoN = parseFloat(portfolyo) || 0;
  const riskN      = parseFloat(risk)      || 0;
  const girisN     = parseFloat(giris)     || 0;
  const stopN      = parseFloat(stopLoss)  || 0;

  const riskTL            = (portfolyoN * riskN) / 100;
  const fiyatFarki        = girisN > 0 && stopN > 0 ? Math.abs(girisN - stopN) : 0;
  const stopYuzde         = girisN > 0 && fiyatFarki > 0 ? (fiyatFarki / girisN) * 100 : 0;
  const lotSayisi         = fiyatFarki > 0 ? Math.floor(riskTL / fiyatFarki) : 0;
  const pozisyonBuyuklugu = lotSayisi * girisN;
  const portfolyoYuzdesi  = portfolyoN > 0 ? (pozisyonBuyuklugu / portfolyoN) * 100 : 0;
  const valid             = girisN > 0 && stopN > 0 && stopN < girisN;

  return (
    <Card title="Pozisyon Büyüklüğü" icon={Calculator}>
      <div className="grid grid-cols-2 gap-3">
        <InputField label="Portföy Büyüklüğü" value={portfolyo} onChange={setPortfolyo} suffix="₺" />
        <InputField label="Risk Oranı"          value={risk}      onChange={setRisk}      suffix="%" hint="Portföyün yüzdesi" />
        <InputField label="Giriş Fiyatı"        value={giris}     onChange={setGiris}     suffix="₺" />
        <InputField label="Stop-Loss Fiyatı"    value={stopLoss}  onChange={setStopLoss}  suffix="₺" hint="Giriş fiyatının altında" />
      </div>

      {valid ? (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 mt-2 space-y-0.5">
          <ResultRow label="Riske Edilen Tutar"  value={`₺${fmt(riskTL)}`} />
          <ResultRow label="Stop-Loss Mesafesi"  value={`%${fmt(stopYuzde)}`} />
          <ResultRow label="Alınabilecek Lot"    value={`${lotSayisi.toLocaleString('tr-TR')} adet`} highlight />
          <ResultRow label="Pozisyon Büyüklüğü"  value={`₺${fmt(pozisyonBuyuklugu)}`} />
          <ResultRow label="Portföy Yüzdesi"     value={`%${fmt(portfolyoYuzdesi)}`} />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-white/3 border border-border px-4 py-3 text-xs text-text-secondary">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Giriş ve stop-loss fiyatını girin (stop &lt; giriş).
        </div>
      )}
    </Card>
  );
}

// ── 3. Risk / Ödül Oranı ─────────────────────────────────────────────────────

function RiskOdul() {
  const [giris,    setGiris]    = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [hedef,    setHedef]    = useState('');

  const girisN = parseFloat(giris)    || 0;
  const stopN  = parseFloat(stopLoss) || 0;
  const hedefN = parseFloat(hedef)    || 0;

  const risk     = girisN > 0 && stopN > 0  ? Math.abs(girisN - stopN)  : 0;
  const odul     = girisN > 0 && hedefN > 0 ? Math.abs(hedefN - girisN) : 0;
  const oran     = risk > 0 ? odul / risk : 0;
  const breakEven = oran > 0 ? (1 / (1 + oran)) * 100 : 0;
  const riskPct  = girisN > 0 && risk > 0 ? (risk / girisN) * 100  : 0;
  const odulPct  = girisN > 0 && odul > 0 ? (odul / girisN) * 100  : 0;
  const valid    = girisN > 0 && stopN > 0 && hedefN > 0 && hedefN > girisN && stopN < girisN;

  const oranColor = oran >= 3 ? 'text-emerald-400' : oran >= 2 ? 'text-green-300' : oran >= 1 ? 'text-yellow-400' : 'text-red-400';
  const oranLabel = oran >= 3 ? 'Mükemmel' : oran >= 2 ? 'İyi' : oran >= 1 ? 'Kabul Edilebilir' : 'Zayıf';

  return (
    <Card title="Risk / Ödül Oranı" icon={TrendingUp}>
      <div className="grid grid-cols-3 gap-3">
        <InputField label="Giriş Fiyatı" value={giris}    onChange={setGiris}    suffix="₺" />
        <InputField label="Stop-Loss"    value={stopLoss} onChange={setStopLoss} suffix="₺" />
        <InputField label="Hedef Fiyat"  value={hedef}    onChange={setHedef}    suffix="₺" />
      </div>

      {valid ? (
        <div className="space-y-3 mt-2">
          <div className="rounded-lg bg-white/3 border border-border p-4 text-center">
            <p className="text-xs text-text-secondary mb-1">Risk / Ödül Oranı</p>
            <p className={cn('text-4xl font-bold font-mono', oranColor)}>1 : {fmt(oran, 1)}</p>
            <p className={cn('text-sm font-semibold mt-1', oranColor)}>{oranLabel}</p>
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-0.5">
            <ResultRow label="Risk (zarar)"      value={`₺${fmt(risk)} (%${fmt(riskPct)})`} />
            <ResultRow label="Ödül (kâr)"        value={`₺${fmt(odul)} (%${fmt(odulPct)})`} />
            <ResultRow label="Başa-baş Win Rate" value={`%${fmt(breakEven)}`} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-text-secondary">
              <span>Risk (%{fmt(riskPct)})</span>
              <span>Ödül (%{fmt(odulPct)})</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              <div className="bg-red-500 rounded-l-full" style={{ width: `${(riskPct / (riskPct + odulPct)) * 100}%` }} />
              <div className="bg-emerald-500 rounded-r-full flex-1" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-white/3 border border-border px-4 py-3 text-xs text-text-secondary">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Giriş, stop-loss ve hedef fiyatı girin (stop &lt; giriş &lt; hedef).
        </div>
      )}
    </Card>
  );
}

// ── 4. Fibonacci Retracement ──────────────────────────────────────────────────

const FIB_LEVELS = [
  { pct: 0,     label: '%0 (Dip)',    color: 'text-zinc-400'    },
  { pct: 23.6,  label: '%23.6',       color: 'text-blue-400'    },
  { pct: 38.2,  label: '%38.2',       color: 'text-cyan-400'    },
  { pct: 50,    label: '%50',         color: 'text-yellow-400'  },
  { pct: 61.8,  label: '%61.8 (Altın)', color: 'text-amber-400' },
  { pct: 78.6,  label: '%78.6',       color: 'text-orange-400'  },
  { pct: 100,   label: '%100 (Zirve)', color: 'text-red-400'    },
];

const FIB_EXT = [
  { pct: 127.2, label: '%127.2', color: 'text-violet-400' },
  { pct: 161.8, label: '%161.8', color: 'text-purple-400' },
  { pct: 200,   label: '%200',   color: 'text-fuchsia-400' },
];

function FibonacciHesabi() {
  const [dip,    setDip]    = useState('');
  const [zirve,  setZirve]  = useState('');
  const [yon,    setYon]    = useState<'yukari' | 'asagi'>('yukari');

  const dipN    = parseFloat(dip)   || 0;
  const zirveN  = parseFloat(zirve) || 0;
  const aralik  = zirveN - dipN;
  const valid   = dipN > 0 && zirveN > 0 && zirveN > dipN;

  // Yükseliş trendi: dip'ten zirve'ye, retracement seviyeleri zirve'den aşağı
  // Düşüş trendi: zirve'den dip'e, retracement seviyeleri dip'ten yukarı
  function fibFiyat(pct: number): number {
    if (yon === 'yukari') return zirveN - (aralik * pct / 100);
    return dipN + (aralik * pct / 100);
  }

  function extFiyat(pct: number): number {
    if (yon === 'yukari') return dipN + (aralik * pct / 100);
    return zirveN - (aralik * pct / 100);
  }

  return (
    <Card title="Fibonacci Retracement" icon={Target}>
      {/* Yön seçimi */}
      <div className="flex gap-2">
        {(['yukari', 'asagi'] as const).map((y) => (
          <button
            key={y}
            onClick={() => setYon(y)}
            className={cn(
              'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
              yon === y
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border text-text-secondary hover:text-text-primary'
            )}
          >
            {y === 'yukari' ? '📈 Yükseliş Trendi (Geri Çekilme)' : '📉 Düşüş Trendi (Toparlanma)'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InputField label="Swing Dip" value={dip}   onChange={setDip}   suffix="₺" hint="En düşük nokta" />
        <InputField label="Swing Zirve" value={zirve} onChange={setZirve} suffix="₺" hint="En yüksek nokta" />
      </div>

      {valid ? (
        <div className="space-y-3 mt-1">
          {/* Retracement seviyeleri */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/60 mb-2">
              Destek / Direnç Seviyeleri
            </p>
            <div className="rounded-lg border border-border divide-y divide-border/60">
              {FIB_LEVELS.map((f) => (
                <div key={f.pct} className="flex items-center justify-between px-4 py-2">
                  <span className={cn('text-xs font-medium', f.color)}>{f.label}</span>
                  <span className="text-xs font-mono font-semibold text-text-primary">₺{fmt(fibFiyat(f.pct))}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Extension seviyeleri */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/60 mb-2">
              Hedef Seviyeleri (Extension)
            </p>
            <div className="rounded-lg border border-border divide-y divide-border/60">
              {FIB_EXT.map((f) => (
                <div key={f.pct} className="flex items-center justify-between px-4 py-2">
                  <span className={cn('text-xs font-medium', f.color)}>{f.label}</span>
                  <span className="text-xs font-mono font-semibold text-text-primary">₺{fmt(extFiyat(f.pct))}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-text-secondary/40 text-center">
            Aralık: ₺{fmt(aralik)} · Dip: ₺{fmt(dipN)} · Zirve: ₺{fmt(zirveN)}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-white/3 border border-border px-4 py-3 text-xs text-text-secondary">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Swing dip ve zirve fiyatını girin (zirve &gt; dip).
        </div>
      )}
    </Card>
  );
}

// ── 5. Enflasyon Düzeltmeli Getiri ───────────────────────────────────────────

function EnflasyonGetiri() {
  const [baslangic,  setBaslangic]  = useState('');
  const [nominal,    setNominal]    = useState('');
  const [sure,       setSure]       = useState('12');
  const [tufe,       setTufe]       = useState('30.9'); // 2026 gerçekleşme

  const baslangicN = parseFloat(baslangic) || 0;
  const nominalN   = parseFloat(nominal)   || 0;
  const sureN      = parseFloat(sure)      || 12;
  const tufeN      = parseFloat(tufe)      || 30.9;

  // Yıllık bazda hesapla, süreye göre oranla
  const oran          = sureN / 12;
  const nominalYillik = nominalN; // kullanıcı zaten yıllık giriyor
  const tufeYillik    = tufeN;

  // Fisher denklemi: (1 + nominal) / (1 + enflasyon) - 1
  const realGetiri = ((1 + nominalYillik / 100) / (1 + tufeYillik / 100) - 1) * 100;

  const sonDeger        = baslangicN > 0 ? baslangicN * (1 + nominalYillik / 100 * oran) : 0;
  const enflasyonEtkisi = baslangicN > 0 ? baslangicN * (tufeYillik / 100 * oran) : 0;
  const realKazanc      = sonDeger - enflasyonEtkisi - baslangicN;
  const valid           = baslangicN > 0 && nominalN !== 0;
  const kazandi         = realGetiri >= 0;

  return (
    <Card title="Enflasyon Düzeltmeli Getiri" icon={BarChart3}>
      <div className="grid grid-cols-2 gap-3">
        <InputField label="Başlangıç Yatırımı"   value={baslangic} onChange={setBaslangic} suffix="₺" />
        <InputField label="Nominal Getiri (yıllık)" value={nominal} onChange={setNominal}   suffix="%" hint="Hissenin değer artışı %" />
        <InputField label="Süre"                  value={sure}      onChange={setSure}      suffix="ay" hint="Kaç aylık dönem?" />
        <InputField label="TÜFE (yıllık)"         value={tufe}      onChange={setTufe}      suffix="%" hint="Otomatik: %30.9 (2026)" />
      </div>

      {valid ? (
        <div className="space-y-3 mt-2">
          {/* Ana sonuç */}
          <div className={cn(
            'rounded-lg border p-4 text-center',
            kazandi ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
          )}>
            <p className="text-xs text-text-secondary mb-1">Reel (Enflasyondan Arındırılmış) Getiri</p>
            <p className={cn('text-4xl font-bold font-mono', kazandi ? 'text-emerald-400' : 'text-red-400')}>
              {kazandi ? '+' : ''}{fmt(realGetiri)}%
            </p>
            <p className={cn('text-sm mt-1 font-medium', kazandi ? 'text-emerald-400/70' : 'text-red-400/70')}>
              {kazandi
                ? 'Enflasyonu yendin — gerçek kazanç var'
                : 'Enflasyonu yenemedin — satın alma gücü eridi'}
            </p>
          </div>

          {baslangicN > 0 && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-0.5">
              <ResultRow label="Nominal Getiri"        value={`%${fmt(nominalYillik)} → ₺${fmt(sonDeger)}`} />
              <ResultRow label="Enflasyonun Götürdüğü" value={`-₺${fmt(enflasyonEtkisi)}`} negative />
              <ResultRow
                label="Gerçek Kâr / Zarar"
                value={`${kazandi ? '+' : ''}₺${fmt(realKazanc)}`}
                highlight positive={kazandi} negative={!kazandi}
              />
            </div>
          )}

          {/* Karşılaştırma çubuğu */}
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] text-text-secondary">
              <span>Enflasyon (%{fmt(tufeYillik * oran)})</span>
              <span>Nominal getiri (%{fmt(nominalYillik * oran)})</span>
            </div>
            <div className="relative h-3 rounded-full bg-surface overflow-hidden">
              <div
                className="absolute left-0 h-full rounded-full bg-red-500/60"
                style={{ width: `${Math.min((tufeYillik * oran) / (Math.max(nominalYillik, tufeYillik) * oran) * 100, 100)}%` }}
              />
              <div
                className={cn('absolute left-0 h-full rounded-full opacity-80', kazandi ? 'bg-emerald-500' : 'bg-orange-500')}
                style={{ width: `${Math.min((nominalYillik * oran) / (Math.max(nominalYillik, tufeYillik) * oran) * 100, 100)}%` }}
              />
            </div>
            <div className="flex gap-3 text-[10px] text-text-secondary/60">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500/60" />Enflasyon</span>
              <span className="flex items-center gap-1"><span className={cn('inline-block h-2 w-2 rounded-full', kazandi ? 'bg-emerald-500' : 'bg-orange-500')} />Getirin</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-white/3 border border-border px-4 py-3 text-xs text-text-secondary">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Başlangıç yatırımı ve nominal getiri yüzdesini girin. TÜFE otomatik dolduruldu.
        </div>
      )}
    </Card>
  );
}

// ── 6. Portföy Risk Dağılımı ──────────────────────────────────────────────────

interface PozisyonRow {
  id: number; sembol: string; deger: string; stopYuzde: string;
}

function PortfoyRisk() {
  const [toplam, setToplam] = useState('100000');
  const [pozisyonlar, setPozisyonlar] = useState<PozisyonRow[]>([
    { id: 1, sembol: '', deger: '', stopYuzde: '' },
    { id: 2, sembol: '', deger: '', stopYuzde: '' },
  ]);

  const updateRow = (id: number, field: keyof PozisyonRow, value: string) =>
    setPozisyonlar((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));

  const addRow    = () => setPozisyonlar((prev) => [...prev, { id: Date.now(), sembol: '', deger: '', stopYuzde: '' }]);
  const removeRow = (id: number) => { if (pozisyonlar.length > 1) setPozisyonlar((prev) => prev.filter((p) => p.id !== id)); };

  const toplamN = parseFloat(toplam) || 0;

  const hesaplar = pozisyonlar.map((p) => {
    const deger = parseFloat(p.deger) || 0;
    const stop  = parseFloat(p.stopYuzde) || 0;
    const maxKayip = deger * (stop / 100);
    const portfoyYuzdesi = toplamN > 0 ? (deger / toplamN) * 100 : 0;
    const riskYuzdesi    = toplamN > 0 ? (maxKayip / toplamN) * 100 : 0;
    return { ...p, deger, stop, maxKayip, portfoyYuzdesi, riskYuzdesi };
  });

  const toplamPozisyon     = hesaplar.reduce((s, h) => s + h.deger, 0);
  const toplamRisk         = hesaplar.reduce((s, h) => s + h.maxKayip, 0);
  const toplamRiskYuzdesi  = toplamN > 0 ? (toplamRisk / toplamN) * 100 : 0;
  const nakitYuzdesi       = toplamN > 0 ? Math.max(0, ((toplamN - toplamPozisyon) / toplamN) * 100) : 0;
  const riskRenk = toplamRiskYuzdesi <= 5 ? 'text-emerald-400' : toplamRiskYuzdesi <= 10 ? 'text-yellow-400' : 'text-red-400';

  return (
    <Card title="Portföy Risk Dağılımı" icon={PieChart}>
      <InputField label="Toplam Portföy" value={toplam} onChange={setToplam} suffix="₺" />

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-text-secondary font-medium">Hisse</th>
              <th className="text-right py-2 text-text-secondary font-medium">Değer (₺)</th>
              <th className="text-right py-2 text-text-secondary font-medium">Stop %</th>
              <th className="text-right py-2 text-text-secondary font-medium">Max Kayıp</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {hesaplar.map((h) => (
              <tr key={h.id} className="border-b border-border/50">
                <td className="py-1.5 pr-2">
                  <input
                    value={h.sembol}
                    onChange={(e) => updateRow(h.id, 'sembol', e.target.value.toUpperCase())}
                    placeholder="THYAO"
                    className="w-20 rounded border border-border bg-white/[0.05] px-2 py-1 text-xs text-text-primary placeholder-zinc-500 focus:border-primary focus:outline-none"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number" min="0" value={h.deger}
                    onChange={(e) => updateRow(h.id, 'deger', e.target.value)}
                    placeholder="0"
                    className="w-24 rounded border border-border bg-white/[0.05] px-2 py-1 text-xs text-text-primary placeholder-zinc-500 focus:border-primary focus:outline-none text-right"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number" min="0" max="100" value={h.stopYuzde}
                    onChange={(e) => updateRow(h.id, 'stopYuzde', e.target.value)}
                    placeholder="5"
                    className="w-16 rounded border border-border bg-white/[0.05] px-2 py-1 text-xs text-text-primary placeholder-zinc-500 focus:border-primary focus:outline-none text-right"
                  />
                </td>
                <td className={cn('py-1.5 text-right font-mono', h.maxKayip > 0 ? 'text-red-400' : 'text-text-secondary/30')}>
                  {h.maxKayip > 0 ? `-₺${fmt(h.maxKayip)}` : '—'}
                </td>
                <td className="py-1.5 pl-2">
                  <button onClick={() => removeRow(h.id)} className="text-text-secondary/30 hover:text-red-400 transition-colors text-base leading-none">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={addRow} className="text-xs text-primary/70 hover:text-primary transition-colors">
        + Pozisyon Ekle
      </button>

      <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-0.5">
        <ResultRow label="Toplam Pozisyon" value={`₺${fmt(toplamPozisyon)} (%${fmt((toplamPozisyon / (toplamN || 1)) * 100)})`} />
        <ResultRow label="Nakit"           value={`%${fmt(nakitYuzdesi)}`} />
        <ResultRow label="Toplam Portföy Riski" value={`₺${fmt(toplamRisk)} (%${fmt(toplamRiskYuzdesi)})`} highlight />
        <div className="pt-1">
          <p className={cn('text-xs font-semibold text-center', riskRenk)}>
            {toplamRiskYuzdesi <= 5
              ? '✓ Risk seviyesi sağlıklı'
              : toplamRiskYuzdesi <= 10
              ? '⚠ Risk biraz yüksek — pozisyon küçült'
              : '✕ Risk çok yüksek — acil aksyon gerekli'}
          </p>
        </div>
      </div>
    </Card>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'karZarar',   label: 'Kâr / Zarar',      icon: DollarSign  },
  { id: 'pozisyon',   label: 'Pozisyon',           icon: Calculator  },
  { id: 'riskodul',   label: 'Risk / Ödül',        icon: TrendingUp  },
  { id: 'fibonacci',  label: 'Fibonacci',           icon: Target      },
  { id: 'enflasyon',  label: 'Enflasyon Getirisi', icon: BarChart3   },
  { id: 'portfoy',    label: 'Portföy Riski',       icon: PieChart    },
] as const;

type TabId = typeof TABS[number]['id'];

function AraclarContent() {
  const searchParams = useSearchParams();
  const tabParam  = searchParams.get('tab') as TabId | null;
  const fiyatParam = searchParams.get('fiyat') ?? '';

  const [activeTab, setActiveTab] = useState<TabId>(tabParam ?? 'karZarar');

  // URL'den gelen fiyatı Kâr/Zarar bileşenine ilet
  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) setActiveTab(tabParam);
  }, [tabParam]);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Yatırım Araçları</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kâr/zarar · Pozisyon · Risk/Ödül · Fibonacci · Enflasyon · Portföy riski
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-pressed={activeTab === id}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
                activeTab === id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-text-secondary hover:border-primary/30 hover:text-text-primary'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'karZarar'  && <KarZarar defaultFiyat={fiyatParam} />}
        {activeTab === 'pozisyon'  && <PozisyonBuyuklugu />}
        {activeTab === 'riskodul'  && <RiskOdul />}
        {activeTab === 'fibonacci' && <FibonacciHesabi />}
        {activeTab === 'enflasyon' && <EnflasyonGetiri />}
        {activeTab === 'portfoy'   && <PortfoyRisk />}

        <p className="mt-6 text-center text-[11px] text-text-secondary/40">
          Bu araçlar yalnızca hesaplama kolaylığı sağlamak amacıyla sunulmuştur. Yatırım tavsiyesi değildir.
        </p>
      </main>
    </div>
  );
}

export default function AraclarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-surface" />
          <div className="h-12 animate-pulse rounded-xl bg-surface" />
          <div className="h-64 animate-pulse rounded-xl bg-surface" />
        </div>
      </div>
    }>
      <AraclarContent />
    </Suspense>
  );
}
