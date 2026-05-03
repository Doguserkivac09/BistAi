import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Nasıl Kullanılır? — BistAI',
  description: 'BistAI\'da yatırım yaparken dikkat edilecekler, sayfa rehberi ve adım adım kullanım.',
};

export default function NasilKullanilirPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-8">

        <div className="mb-5 flex items-center gap-2 text-sm text-text-secondary">
          <Link href="/yardim" className="hover:text-primary transition-colors">Yardım</Link>
          <span>/</span>
          <span className="text-text-primary">Nasıl Kullanılır?</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-2">📖 BistAI Nasıl Kullanılır?</h1>
          <p className="text-text-secondary">
            Adım adım rehber — ilk girişten ilk işleme kadar.
          </p>
        </div>

        {/* Önemli Uyarı */}
        <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
          <p className="text-sm font-bold text-amber-300 mb-2">⚠️ Başlamadan Önce</p>
          <ul className="space-y-1 text-xs text-amber-200/90">
            <li>→ BistAI bir analiz aracıdır — yatırım tavsiyesi vermez</li>
            <li>→ Veriler ~15 dakika gecikmeli (Yahoo Finance)</li>
            <li>→ Geçmiş sinyal başarısı gelecek performansı garanti etmez</li>
            <li>→ Risk yönetimini öğrenmeden işlem yapmaya başlama</li>
          </ul>
        </div>

        <div className="space-y-6">

          {/* Adım 1 */}
          <StepCard step={1} title="Profilini yapılandır" emoji="👤">
            <ul className="space-y-1.5 text-sm text-text-secondary">
              <li className="flex gap-2"><span className="text-primary shrink-0">→</span>
                <span><Link href="/profil" className="text-primary hover:underline">Profil sayfasında</Link> e-posta bildirimlerini aç</span>
              </li>
              <li className="flex gap-2"><span className="text-primary shrink-0">→</span>
                <span>Hangi sinyal tiplerini almak istediğini seç (Klasik / Formasyonlar)</span>
              </li>
              <li className="flex gap-2"><span className="text-primary shrink-0">→</span>
                <span>Portföyüne hisse ekle — hem analiz hem kişisel bildirim için</span>
              </li>
            </ul>
          </StepCard>

          {/* Adım 2 */}
          <StepCard step={2} title="Sabah rutini — Fırsatlar sayfası" emoji="☀️">
            <p className="text-sm text-text-secondary mb-2">
              Her sabah 07:30'da cron çalışır, Fırsatlar güncellenir.
              12:00 ve 19:00'da tekrar güncellenir.
            </p>
            <ul className="space-y-1.5 text-sm text-text-secondary">
              <li className="flex gap-2"><span className="text-primary shrink-0">1.</span>
                <Link href="/firsatlar" className="text-primary hover:underline">Fırsatlar sayfasını</Link> aç</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">2.</span>
                "✓ Veri güncel" rozetini kontrol et (yeşil = taze)</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">3.</span>
                "⚡ Yeni" filtresi açık — son 48 saatteki sinyaller</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">4.</span>
                Yüksek skorlu 2-3 hisseyi listeye al</li>
            </ul>
          </StepCard>

          {/* Adım 3 */}
          <StepCard step={3} title="Hisse detayını incele — 7 kontrol" emoji="🔍">
            <p className="text-sm text-text-secondary mb-3">
              İlgilendiğin hissenin adına tıkla. Teknik tab'da şunları kontrol et:
            </p>
            <div className="grid gap-1.5">
              {[
                { ok: true,  text: 'Teknik Profil ≥ 70?' },
                { ok: true,  text: 'Şirket Değer Skoru ≥ 45?' },
                { ok: true,  text: 'Çelişki banner\'ı yok mu?' },
                { ok: true,  text: 'En güçlü sinyal "güçlü" şiddette mi?' },
                { ok: true,  text: 'KAP kritik duyurusu yok mu?' },
                { ok: true,  text: 'Sektör Emsalleri listesinde iyi sırada mı?' },
                { ok: true,  text: 'R/R oranı ≥ 1.5?' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className="h-4 w-4 rounded border border-border bg-surface flex items-center justify-center text-[10px]">
                    {i + 1}
                  </span>
                  {item.text}
                </div>
              ))}
            </div>
          </StepCard>

          {/* Adım 4 */}
          <StepCard step={4} title="Pozisyon büyüklüğünü hesapla" emoji="🧮">
            <p className="text-sm text-text-secondary mb-3">
              BistAI'da İşlem Planı kartında Stop-Loss seviyesi verilir.
              Bu seviyeyi kullanarak lot hesapla:
            </p>
            <div className="rounded-lg border border-border bg-surface/50 p-3 font-mono text-xs text-text-secondary">
              <p>Lot = (Sermaye × %1 Risk) ÷ (Giriş − Stop)</p>
              <p className="mt-1 text-text-primary">Örnek: (50.000 × 0.01) ÷ (48.2 − 46.0)</p>
              <p className="text-emerald-400 font-bold">= 500 ÷ 2.2 = 227 adet</p>
            </div>
            <p className="mt-2 text-[11px] text-text-muted">
              Veya <Link href="/araclar?tab=karZarar" className="text-primary hover:underline">
              Araçlar &gt; Kâr/Zarar Hesaplayıcı</Link> kullanabilirsin.
            </p>
          </StepCard>

          {/* Adım 5 */}
          <StepCard step={5} title="İşlemi aç — Stop-Loss EMRİ ver" emoji="💼">
            <ul className="space-y-1.5 text-sm text-text-secondary">
              <li className="flex gap-2"><span className="text-primary shrink-0">1.</span>
                Broker'unda hisseyi bul</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">2.</span>
                Piyasa/limit emir — hesaplanan lot</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">3.</span>
                <strong className="text-red-400">Stop-loss emrini HEMEN gir</strong> (stop-limit veya stop-market)</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">4.</span>
                Hedef fiyatı watchlist'ine ekle — alarm kur</li>
            </ul>
          </StepCard>

          {/* Adım 6 */}
          <StepCard step={6} title="Takip et — Portföy sayfası" emoji="📊">
            <ul className="space-y-1.5 text-sm text-text-secondary">
              <li className="flex gap-2"><span className="text-primary shrink-0">→</span>
                <Link href="/portfolyo" className="text-primary hover:underline">Portföy sayfası</Link> — mevcut pozisyon değeri</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">→</span>
                <Link href="/ters-portfolyo" className="text-primary hover:underline">Ters Portföy</Link> — sektör yoğunlaşma uyarısı</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">→</span>
                Sinyal "geç" hale gelirse (5+ gün) — pozisyon küçüt</li>
              <li className="flex gap-2"><span className="text-primary shrink-0">→</span>
                Yeni sinyal gelirse — hedefi güncelle</li>
            </ul>
          </StepCard>

          {/* Sayfa rehberi */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-sm font-bold text-text-primary mb-4">🗺️ Sayfa Rehberi — Hangi Sayfa Ne İçin?</p>
            <div className="space-y-2">
              {[
                { href: '/firsatlar',      icon: '⚡', title: 'Fırsatlar',         desc: 'Tüm BIST\'te aktif sinyaller — günlük fırsat listesi' },
                { href: '/ters-portfolyo', icon: '🧭', title: 'Ters Portföy',      desc: 'Portföyünde olmayan güçlü fırsatlar + çeşitlendirme önerisi' },
                { href: '/tarama',         icon: '🔍', title: 'Sinyal Tarama',      desc: 'Tüm BIST\'i manuel tara — sinyal tipini seç' },
                { href: '/screener',       icon: '🎚️', title: 'Screener',           desc: 'RSI, hacim, confluence filtreleri — gelişmiş tarama' },
                { href: '/sektorler',      icon: '🏗️', title: 'Sektör Analizi',    desc: 'Para nereye akıyor — sektör rotasyonu' },
                { href: '/backtesting',    icon: '📈', title: 'Backtest',           desc: 'Geçmiş sinyallerin başarı oranı — kanıt tabanlı' },
                { href: '/yardim',         icon: '📚', title: 'Eğitim Merkezi',    desc: 'Formasyonlar, sinyaller, risk yönetimi rehberleri' },
              ].map((page) => (
                <Link key={page.href} href={page.href}
                  className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-white/5 transition-colors group"
                >
                  <span className="text-base shrink-0">{page.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary group-hover:text-primary transition-colors">
                      {page.title}
                    </p>
                    <p className="text-[11px] text-text-secondary truncate">{page.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

        </div>

        <div className="mt-8 flex gap-3">
          <Link href="/yardim" className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
            ← Yardım Ana Sayfa
          </Link>
          <Link href="/yardim/risk-yonetimi" className="rounded-lg bg-primary/15 border border-primary/30 px-4 py-2 text-sm text-primary hover:bg-primary/25 transition-colors">
            Risk Yönetimi →
          </Link>
        </div>

        <p className="mt-6 text-[10px] text-text-muted/60 text-center italic">
          * Bu rehber genel eğitim amaçlıdır. Yatırım tavsiyesi değildir.
        </p>
      </main>
    </div>
  );
}

function StepCard({ step, title, emoji, children }: {
  step: number; title: string; emoji: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary shrink-0">
          {step}
        </div>
        <span className="text-base">{emoji}</span>
        <h2 className="text-sm font-bold text-text-primary">{title}</h2>
      </div>
      {children}
    </div>
  );
}
