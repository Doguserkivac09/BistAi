import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Yasal Uyarı | BistAI',
  description: 'BistAI platformunun yasal uyarıları ve sorumluluk reddi beyanı.',
};

export default function YasalPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Yasal Uyarı</h1>
          <p className="text-sm text-text-muted">Son güncelleme: Mart 2025</p>
        </div>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-text-secondary">

        <Section title="Yatırım Tavsiyesi Değildir">
          <p>
            BistAI platformunda sunulan tüm içerikler, analizler, sinyaller, göstergeler ve
            bilgiler yalnızca <strong className="text-text-primary">bilgilendirme amaçlıdır</strong> ve
            herhangi bir yatırım tavsiyesi, alım-satım önerisi veya finansal danışmanlık hizmeti
            niteliği taşımaz. Platform, 6362 sayılı Sermaye Piyasası Kanunu kapsamında yatırım
            danışmanlığı hizmeti vermemektedir.
          </p>
        </Section>

        <Section title="Teknik Analiz Sınırlamaları">
          <p>
            Platformda kullanılan RSI, MACD, Bollinger Bantları, Golden Cross gibi teknik analiz
            göstergeleri geçmiş fiyat verilerine dayanır. Teknik göstergeler kesin alım-satım
            sinyali vermez; yanlış sinyaller (false positive/negative) oluşabilir. Geçmiş fiyat
            hareketleri ve sinyal performansı, gelecekteki sonuçların garantisi değildir.
          </p>
        </Section>

        <Section title="Yapay Zeka Açıklamaları">
          <p>
            Platformdaki yapay zeka destekli sinyal açıklamaları otomatik olarak üretilmektedir.
            Bu açıklamalar yanlış, eksik veya yanıltıcı olabilir. Yapay zeka modelinin çıktıları
            bir finansal uzmanın görüşünün yerini tutmaz ve yatırım kararı vermek için tek başına
            kullanılmamalıdır.
          </p>
        </Section>

        <Section title="Veri Doğruluğu ve Gecikmesi">
          <p>
            Fiyat verileri Yahoo Finance başta olmak üçüncü taraf kaynaklardan çekilmektedir ve
            <strong className="text-text-primary"> 15 dakikaya kadar gecikme</strong> içerebilir.
            BistAI, veri sağlayıcılardan kaynaklanan hata, eksiklik veya gecikmelerden sorumlu
            tutulamaz. Anlık işlem kararlarında borsa veya aracı kurum uygulamalarından teyit
            alınması zorunludur.
          </p>
        </Section>

        <Section title="Sorumluluk Reddi">
          <p>
            BistAI ve platformun geliştiricileri; platformun kullanımından doğacak doğrudan,
            dolaylı, arızi veya sonuçsal hiçbir zarar, kayıp, kar kaybı veya fırsatın
            değerlendirilememesinden sorumlu değildir. Platform&quot;olduğu gibi&quot; (as-is)
            sunulmakta olup herhangi bir kâr garantisi, belirli bir amaca uygunluk veya kesintisiz
            erişim vaadi verilmemektedir.
          </p>
        </Section>

        <Section title="Yatırımcı Sorumluluğu">
          <p>
            Yatırım kararları tamamen kullanıcının kendi sorumluluğundadır. Sermaye piyasalarında
            işlem yapmadan önce kendi risk toleransınızı değerlendirmeniz, gerekli durumlarda
            Sermaye Piyasası Kurulu (SPK) lisanslı bir yatırım danışmanına başvurmanız tavsiye
            edilir. Yatırımlar, başlangıçta yatırılan tutarın tamamının kaybedilmesi de dahil
            olmak üzere önemli riskler içerir.
          </p>
        </Section>

        <Section title="Regülasyon">
          <p>
            BistAI, Sermaye Piyasası Kurulu (SPK) tarafından lisanslandırılmış bir yatırım
            kuruluşu değildir. Platform, teknik analiz araçları sunan bağımsız bir yazılım
            servisi olarak faaliyet göstermektedir.
          </p>
        </Section>

      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-text-primary">{title}</h2>
      <div className="rounded-xl border border-border bg-surface/50 px-5 py-4">
        {children}
      </div>
    </section>
  );
}
