'use client';

import { useState } from 'react';
import { Calculator, TrendingUp, Target, PieChart, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Yardımcı ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function InputField({
  label, value, onChange, suffix, hint, min = 0,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: string;
  min?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="number"
          min={min}
          value={value}
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

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between py-2 border-b border-border/50 last:border-0', highlight && 'py-3')}>
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={cn('font-mono font-semibold', highlight ? 'text-lg text-primary' : 'text-sm text-text-primary')}>
        {value}
      </span>
    </div>
  );
}

function Card({ title, icon: Icon, children, color = 'primary' }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50 overflow-hidden">
      <div className={cn('flex items-center gap-2.5 px-5 py-4 border-b border-border', `bg-${color}/5`)}>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', `bg-${color}/10`)}>
          <Icon className={cn('h-4 w-4', `text-${color}`)} />
        </div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ── 1. Pozisyon Büyüklüğü ─────────────────────────────────────────────────────

function PozisyonBuyuklugu() {
  const [portfolyo, setPortfolyo] = useState('100000');
  const [risk, setRisk] = useState('2');
  const [giris, setGiris] = useState('');
  const [stopLoss, setStopLoss] = useState('');

  const portfolyoN = parseFloat(portfolyo) || 0;
  const riskN = parseFloat(risk) || 0;
  const girisN = parseFloat(giris) || 0;
  const stopN = parseFloat(stopLoss) || 0;

  const riskTL = (portfolyoN * riskN) / 100;
  const fiyatFarki = girisN > 0 && stopN > 0 ? Math.abs(girisN - stopN) : 0;
  const stopYuzde = girisN > 0 && fiyatFarki > 0 ? (fiyatFarki / girisN) * 100 : 0;
  const lotSayisi = fiyatFarki > 0 ? Math.floor(riskTL / fiyatFarki) : 0;
  const pozisyonBuyuklugu = lotSayisi * girisN;
  const portfolyoYuzdesi = portfolyoN > 0 ? (pozisyonBuyuklugu / portfolyoN) * 100 : 0;

  const valid = girisN > 0 && stopN > 0 && stopN < girisN;

  return (
    <Card title="Pozisyon Büyüklüğü" icon={Calculator}>
      <div className="grid grid-cols-2 gap-3">
        <InputField label="Portföy Büyüklüğü" value={portfolyo} onChange={setPortfolyo} suffix="₺" />
        <InputField label="Risk Oranı" value={risk} onChange={setRisk} suffix="%" hint="Portföyün yüzdesi" />
        <InputField label="Giriş Fiyatı" value={giris} onChange={setGiris} suffix="₺" min={0.01} />
        <InputField label="Stop-Loss Fiyatı" value={stopLoss} onChange={setStopLoss} suffix="₺" hint="Giriş fiyatının altında" />
      </div>

      {valid ? (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 mt-2 space-y-0.5">
          <ResultRow label="Riske Edilen Tutar" value={`₺${fmt(riskTL)}`} />
          <ResultRow label="Stop-Loss Mesafesi" value={`%${fmt(stopYuzde)}`} />
          <ResultRow label="Alınabilecek Lot" value={`${lotSayisi.toLocaleString('tr-TR')} adet`} highlight />
          <ResultRow label="Pozisyon Büyüklüğü" value={`₺${fmt(pozisyonBuyuklugu)}`} />
          <ResultRow label="Portföy Yüzdesi" value={`%${fmt(portfolyoYuzdesi)}`} />
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

// ── 2. Risk / Ödül Oranı ─────────────────────────────────────────────────────

function RiskOdul() {
  const [giris, setGiris] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [hedef, setHedef] = useState('');

  const girisN = parseFloat(giris) || 0;
  const stopN = parseFloat(stopLoss) || 0;
  const hedefN = parseFloat(hedef) || 0;

  const risk = girisN > 0 && stopN > 0 ? Math.abs(girisN - stopN) : 0;
  const odul = girisN > 0 && hedefN > 0 ? Math.abs(hedefN - girisN) : 0;
  const oran = risk > 0 ? odul / risk : 0;
  const breakEven = oran > 0 ? (1 / (1 + oran)) * 100 : 0;

  const riskPct = girisN > 0 && risk > 0 ? (risk / girisN) * 100 : 0;
  const odulPct = girisN > 0 && odul > 0 ? (odul / girisN) * 100 : 0;

  const valid = girisN > 0 && stopN > 0 && hedefN > 0 && hedefN > girisN && stopN < girisN;

  const oranColor = oran >= 3 ? 'text-emerald-400' : oran >= 2 ? 'text-green-300' : oran >= 1 ? 'text-yellow-400' : 'text-red-400';
  const oranLabel = oran >= 3 ? 'Mükemmel' : oran >= 2 ? 'İyi' : oran >= 1 ? 'Kabul Edilebilir' : 'Zayıf';

  return (
    <Card title="Risk / Ödül Oranı" icon={TrendingUp}>
      <div className="grid grid-cols-3 gap-3">
        <InputField label="Giriş Fiyatı" value={giris} onChange={setGiris} suffix="₺" />
        <InputField label="Stop-Loss" value={stopLoss} onChange={setStopLoss} suffix="₺" />
        <InputField label="Hedef Fiyat" value={hedef} onChange={setHedef} suffix="₺" />
      </div>

      {valid ? (
        <div className="space-y-3 mt-2">
          {/* Oran göstergesi */}
          <div className="rounded-lg bg-white/3 border border-border p-4 text-center">
            <p className="text-xs text-text-secondary mb-1">Risk / Ödül Oranı</p>
            <p className={cn('text-4xl font-bold font-mono', oranColor)}>
              1 : {fmt(oran, 1)}
            </p>
            <p className={cn('text-sm font-semibold mt-1', oranColor)}>{oranLabel}</p>
          </div>

          {/* Detaylar */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-0.5">
            <ResultRow label="Risk (zarar)" value={`₺${fmt(risk)} (%${fmt(riskPct)})`} />
            <ResultRow label="Ödül (kâr)" value={`₺${fmt(odul)} (%${fmt(odulPct)})`} />
            <ResultRow label="Başa-baş Win Rate" value={`%${fmt(breakEven)}`} />
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-text-secondary">
              <span>Risk (%{fmt(riskPct)})</span>
              <span>Ödül (%{fmt(odulPct)})</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              <div
                className="bg-red-500 rounded-l-full"
                style={{ width: `${(riskPct / (riskPct + odulPct)) * 100}%` }}
              />
              <div
                className="bg-emerald-500 rounded-r-full flex-1"
              />
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

// ── 3. Hedef Fiyat Hesabı ─────────────────────────────────────────────────────

function HedefFiyat() {
  const [mevcutFiyat, setMevcutFiyat] = useState('');
  const [hedefYuzde, setHedefYuzde] = useState('');
  const [stopYuzde, setStopYuzde] = useState('');

  const fiyatN = parseFloat(mevcutFiyat) || 0;
  const hedefPctN = parseFloat(hedefYuzde) || 0;
  const stopPctN = parseFloat(stopYuzde) || 0;

  const hedefFiyat = fiyatN > 0 ? fiyatN * (1 + hedefPctN / 100) : 0;
  const stopFiyat = fiyatN > 0 ? fiyatN * (1 - stopPctN / 100) : 0;
  const oran = stopPctN > 0 ? hedefPctN / stopPctN : 0;

  // Fibonacci seviyeleri
  const fib = fiyatN > 0 ? [
    { label: 'Fib %23.6', value: fiyatN * 1.236 },
    { label: 'Fib %38.2', value: fiyatN * 1.382 },
    { label: 'Fib %61.8', value: fiyatN * 1.618 },
    { label: 'Fib %100',  value: fiyatN * 2.000 },
  ] : [];

  const valid = fiyatN > 0;

  return (
    <Card title="Hedef Fiyat Hesabı" icon={Target}>
      <div className="grid grid-cols-3 gap-3">
        <InputField label="Mevcut Fiyat" value={mevcutFiyat} onChange={setMevcutFiyat} suffix="₺" />
        <InputField label="Hedef %" value={hedefYuzde} onChange={setHedefYuzde} suffix="%" hint="Yükseliş beklentisi" />
        <InputField label="Stop %" value={stopYuzde} onChange={setStopYuzde} suffix="%" hint="Düşüş toleransı" />
      </div>

      {valid ? (
        <div className="space-y-3 mt-2">
          {hedefPctN > 0 && stopPctN > 0 && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-0.5">
              <ResultRow label="Hedef Fiyat" value={`₺${fmt(hedefFiyat)}`} highlight />
              <ResultRow label="Stop-Loss Fiyatı" value={`₺${fmt(stopFiyat)}`} />
              <ResultRow label="R/R Oranı" value={`1 : ${fmt(oran, 1)}`} />
            </div>
          )}

          {fib.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Fibonacci Hedefleri
              </p>
              <div className="rounded-lg border border-border divide-y divide-border">
                {fib.map((f) => (
                  <div key={f.label} className="flex items-center justify-between px-4 py-2">
                    <span className="text-xs text-text-secondary">{f.label}</span>
                    <span className="text-xs font-mono font-semibold text-text-primary">₺{fmt(f.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-white/3 border border-border px-4 py-3 text-xs text-text-secondary">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Mevcut fiyatı girerek Fibonacci seviyelerini görün.
        </div>
      )}
    </Card>
  );
}

// ── 4. Portföy Risk Dağılımı ──────────────────────────────────────────────────

interface PozisyonRow {
  id: number;
  sembol: string;
  deger: string;
  stopYuzde: string;
}

function PortfoyRisk() {
  const [toplam, setToplam] = useState('100000');
  const [pozisyonlar, setPozisyonlar] = useState<PozisyonRow[]>([
    { id: 1, sembol: '', deger: '', stopYuzde: '' },
    { id: 2, sembol: '', deger: '', stopYuzde: '' },
  ]);

  const updateRow = (id: number, field: keyof PozisyonRow, value: string) => {
    setPozisyonlar((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
  };

  const addRow = () => {
    setPozisyonlar((prev) => [...prev, { id: Date.now(), sembol: '', deger: '', stopYuzde: '' }]);
  };

  const removeRow = (id: number) => {
    if (pozisyonlar.length <= 1) return;
    setPozisyonlar((prev) => prev.filter((p) => p.id !== id));
  };

  const toplamN = parseFloat(toplam) || 0;

  const hesaplar = pozisyonlar.map((p) => {
    const deger = parseFloat(p.deger) || 0;
    const stop = parseFloat(p.stopYuzde) || 0;
    const maxKayip = deger * (stop / 100);
    const portfoyYuzdesi = toplamN > 0 ? (deger / toplamN) * 100 : 0;
    const riskYuzdesi = toplamN > 0 ? (maxKayip / toplamN) * 100 : 0;
    return { ...p, deger, stop, maxKayip, portfoyYuzdesi, riskYuzdesi };
  });

  const toplamPozisyon = hesaplar.reduce((s, h) => s + h.deger, 0);
  const toplamRisk = hesaplar.reduce((s, h) => s + h.maxKayip, 0);
  const toplamRiskYuzdesi = toplamN > 0 ? (toplamRisk / toplamN) * 100 : 0;
  const nakitYuzdesi = toplamN > 0 ? Math.max(0, ((toplamN - toplamPozisyon) / toplamN) * 100) : 0;

  const riskRenk = toplamRiskYuzdesi <= 5 ? 'text-emerald-400' : toplamRiskYuzdesi <= 10 ? 'text-yellow-400' : 'text-red-400';

  return (
    <Card title="Portföy Risk Dağılımı" icon={PieChart}>
      <InputField label="Toplam Portföy" value={toplam} onChange={setToplam} suffix="₺" />

      {/* Pozisyon tablosu */}
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
                    className="w-20 rounded border border-border bg-white/3 px-2 py-1 text-xs text-text-primary placeholder-text-secondary/30 focus:border-primary focus:outline-none"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number" min="0"
                    value={h.deger}
                    onChange={(e) => updateRow(h.id, 'deger', e.target.value)}
                    placeholder="0"
                    className="w-24 rounded border border-border bg-white/3 px-2 py-1 text-xs text-text-primary placeholder-text-secondary/30 focus:border-primary focus:outline-none text-right"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number" min="0" max="100"
                    value={h.stopYuzde}
                    onChange={(e) => updateRow(h.id, 'stopYuzde', e.target.value)}
                    placeholder="5"
                    className="w-16 rounded border border-border bg-white/3 px-2 py-1 text-xs text-text-primary placeholder-text-secondary/30 focus:border-primary focus:outline-none text-right"
                  />
                </td>
                <td className={cn('py-1.5 text-right font-mono', h.maxKayip > 0 ? 'text-red-400' : 'text-text-secondary/30')}>
                  {h.maxKayip > 0 ? `-₺${fmt(h.maxKayip)}` : '—'}
                </td>
                <td className="py-1.5 pl-2">
                  <button
                    onClick={() => removeRow(h.id)}
                    className="text-text-secondary/30 hover:text-red-400 transition-colors text-base leading-none"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={addRow}
        className="text-xs text-primary/70 hover:text-primary transition-colors"
      >
        + Pozisyon Ekle
      </button>

      {/* Özet */}
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-0.5">
        <ResultRow label="Toplam Pozisyon" value={`₺${fmt(toplamPozisyon)} (%${fmt((toplamPozisyon / (toplamN || 1)) * 100)})`} />
        <ResultRow label="Nakit" value={`%${fmt(nakitYuzdesi)}`} />
        <ResultRow
          label="Toplam Portföy Riski"
          value={`₺${fmt(toplamRisk)} (%${fmt(toplamRiskYuzdesi)})`}
          highlight
        />
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
  { id: 'pozisyon', label: 'Pozisyon Büyüklüğü', icon: Calculator },
  { id: 'riskodul', label: 'Risk / Ödül',         icon: TrendingUp },
  { id: 'hedef',    label: 'Hedef Fiyat',          icon: Target },
  { id: 'portfoy',  label: 'Portföy Riski',        icon: PieChart },
] as const;

type TabId = typeof TABS[number]['id'];

export default function AraclarPage() {
  const [activeTab, setActiveTab] = useState<TabId>('pozisyon');

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* Başlık */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Yatırım Araçları</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Pozisyon büyüklüğü · Risk/Ödül · Hedef fiyat · Portföy riski
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
                'flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
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

        {/* İçerik */}
        {activeTab === 'pozisyon' && <PozisyonBuyuklugu />}
        {activeTab === 'riskodul'  && <RiskOdul />}
        {activeTab === 'hedef'     && <HedefFiyat />}
        {activeTab === 'portfoy'   && <PortfoyRisk />}

        {/* Disclaimer */}
        <p className="mt-6 text-center text-[11px] text-text-secondary/40">
          Bu araçlar yalnızca hesaplama kolaylığı sağlamak amacıyla sunulmuştur.
          Yatırım tavsiyesi değildir. Risk yönetimi kararlarınızı kendi sorumluluğunuzda alın.
        </p>
      </main>
    </div>
  );
}
