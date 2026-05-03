import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Risk Yönetimi — BistAI',
  description: '%1 kuralı, stop-loss disiplini, pozisyon büyüklüğü hesaplama.',
};

export default function RiskYonetimiPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-8">

        <div className="mb-5 flex items-center gap-2 text-sm text-text-secondary">
          <Link href="/yardim" className="hover:text-primary transition-colors">Yardım</Link>
          <span>/</span>
          <span className="text-text-primary">Risk Yönetimi</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-2">🛡️ Risk Yönetimi</h1>
          <p className="text-text-secondary">
            Başarılı yatırımın %80'i risk yönetimidir. Doğru sinyal bulmak kadar,
            kaybı sınırlamak da kritiktir.
          </p>
        </div>

        <div className="space-y-6">

          {/* %1 Kuralı */}
          <Card emoji="1️⃣" title="Altın Kural: %1 Pozisyon Riski">
            <p className="text-sm text-text-secondary leading-relaxed mb-4">
              Tek bir işlemde <strong className="text-text-primary">toplam sermayenin maksimum %1'ini riske at</strong>.
              100.000₺ portföyde bir işlemde maksimum 1.000₺ zarar edilebilir.
            </p>
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 font-mono text-sm">
              <p className="text-emerald-400 font-bold mb-2">Örnek Hesaplama</p>
              <div className="space-y-1 text-text-secondary text-xs">
                <p>Sermaye: 100.000₺</p>
                <p>Maks. Risk / İşlem: 100.000 × %1 = 1.000₺</p>
                <p>Giriş Fiyatı: 50₺ → Stop-Loss: 47₺ (-%6)</p>
                <p className="text-text-primary font-semibold mt-2">
                  Lot = 1.000₺ ÷ 3₺ (stop mesafesi) = 333 adet
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-text-muted/70">
              Bu kural 100 kez yanlış bile girsek sermayemizin yalnızca %50'sini kaybederiz.
              Birçok ticaret platformunda "stop emri" olarak ayarlanmalıdır.
            </p>
          </Card>

          {/* Stop-Loss */}
          <Card emoji="🛑" title="Stop-Loss Disiplini">
            <div className="space-y-3 text-sm text-text-secondary">
              <p>Stop-loss <strong className="text-text-primary">işlem açılmadan önce</strong> belirlenmeli
              ve broker'a emir olarak girilmelidir — "kafadan" takip etmek çalışmaz.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <RuleItem icon="✅" title="Yapılması Gerekenler" items={[
                  'Stop-loss seviyesini grafik öncesi belirle',
                  'Broker\'a emir olarak gir (stop-limit/stop-market)',
                  'ATR bazlı stop kullan (BistAI hesaplar)',
                  'Sinyalde belirtilen teknik seviyeyi kullan',
                ]} color="emerald" />
                <RuleItem icon="❌" title="Yapılmaması Gerekenler" items={[
                  'Stop-loss\'u "sonra koyarım" deme',
                  'Zarar eden pozisyonu "döner" diye tutma',
                  'Stop\'u fiyat yaklaştıkça aşağı çekme',
                  'Duygusal kararla stop iptal etme',
                ]} color="red" />
              </div>
            </div>
          </Card>

          {/* Pozisyon büyüklüğü */}
          <Card emoji="⚖️" title="Pozisyon Büyüklüğü">
            <p className="text-sm text-text-secondary mb-3">
              BistAI'da her sinyal için <strong className="text-text-primary">R/R Oranı</strong> (Risk/Ödül)
              otomatik hesaplanır. R/R 1.5 altındaki sinyaller filtrelenir.
            </p>
            <div className="rounded-xl border border-border bg-surface/50 overflow-hidden">
              <div className="grid grid-cols-3 text-center text-[11px] font-semibold border-b border-border">
                <div className="py-2 text-text-muted">R/R Oranı</div>
                <div className="py-2 text-text-muted">Değerlendirme</div>
                <div className="py-2 text-text-muted">Pozisyon</div>
              </div>
              {[
                { rr: '< 1.5', eval: 'Kötü', pos: 'Girme', color: 'text-red-400' },
                { rr: '1.5 – 2.0', eval: 'Kabul edilebilir', pos: 'Küçük (%0.5 risk)', color: 'text-amber-400' },
                { rr: '2.0 – 3.0', eval: 'İyi', pos: 'Normal (%1 risk)', color: 'text-emerald-400' },
                { rr: '3.0+', eval: 'Mükemmel', pos: 'Tam (%1-1.5 risk)', color: 'text-emerald-400 font-bold' },
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-3 text-center text-xs border-b border-border/40 last:border-0 py-2.5">
                  <div className={`${row.color} font-mono`}>{row.rr}</div>
                  <div className={row.color}>{row.eval}</div>
                  <div className="text-text-secondary">{row.pos}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Portföy çeşitlendirme */}
          <Card emoji="🌐" title="Portföy Çeşitlendirmesi">
            <div className="space-y-2 text-sm text-text-secondary">
              <p>Aynı sektörde çok hisse tutmak çeşitlendirme sağlamaz — BIST'te sektörler yüksek korelasyon taşır.</p>
              <ul className="space-y-2 mt-3">
                {[
                  'Tek hisseye sermayenin max %10\'u',
                  'Tek sektöre max %30 (banka ağırlıklı portföy riski)',
                  'Aynı anda max 5-8 aktif pozisyon',
                  '/ters-portfolyo sayfası sektör yoğunlaşmayı uyarır',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary shrink-0 mt-0.5">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {/* Psikoloji */}
          <Card emoji="🧠" title="Yatırımcı Psikolojisi">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-text-primary font-semibold mb-2">Kaçınılacak tuzaklar</p>
                <ul className="space-y-1 text-text-secondary text-xs">
                  {[
                    'FOMO (kaçırıyorum korkusu) ile giriş',
                    'Kazanınca büyük lot, kaybedince küçük lot',
                    '"Bu sefer farklı" düşüncesi',
                    'Telafi pozisyonu açmak (öç almak)',
                  ].map((item, i) => (
                    <li key={i} className="flex gap-1"><span className="text-red-400 shrink-0">✗</span>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-text-primary font-semibold mb-2">Doğru alışkanlıklar</p>
                <ul className="space-y-1 text-text-secondary text-xs">
                  {[
                    'Her işlem için not tut (sinyal, sebep, sonuç)',
                    'Haftalık gözden geçirme yap',
                    'Kaybı kabul et, süreci değerlendire',
                    'Sinyal gelene kadar bekle — sabır',
                  ].map((item, i) => (
                    <li key={i} className="flex gap-1"><span className="text-emerald-400 shrink-0">✓</span>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

        </div>

        <div className="mt-8 flex gap-3">
          <Link href="/yardim" className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
            ← Yardım Ana Sayfa
          </Link>
          <Link href="/yardim/nasil-kullanilir" className="rounded-lg bg-primary/15 border border-primary/30 px-4 py-2 text-sm text-primary hover:bg-primary/25 transition-colors">
            Nasıl Kullanılır? →
          </Link>
        </div>

        <p className="mt-6 text-[10px] text-text-muted/60 text-center italic">
          * Yatırım tavsiyesi değildir. Tüm kararlar yatırımcının sorumluluğundadır.
        </p>
      </main>
    </div>
  );
}

function Card({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{emoji}</span>
        <h2 className="text-base font-bold text-text-primary">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function RuleItem({ icon, title, items, color }: {
  icon: string; title: string; items: string[]; color: 'emerald' | 'red';
}) {
  const cls = color === 'emerald'
    ? 'border-emerald-500/25 bg-emerald-500/5'
    : 'border-red-500/25 bg-red-500/5';
  const dotCls = color === 'emerald' ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <p className="text-xs font-semibold text-text-primary mb-2">{icon} {title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className={`flex items-start gap-1 text-[11px] text-text-secondary`}>
            <span className={`shrink-0 ${dotCls}`}>•</span>{item}
          </li>
        ))}
      </ul>
    </div>
  );
}
