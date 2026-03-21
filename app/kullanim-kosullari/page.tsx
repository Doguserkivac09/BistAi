import type { Metadata } from 'next';
import { FileText } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Kullanım Koşulları | BistAI',
  description: 'BistAI platformunu kullanmadan önce lütfen kullanım koşullarını okuyunuz.',
};

export default function KullanimKosullariPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Kullanım Koşulları</h1>
          <p className="text-sm text-text-muted">Son güncelleme: Mart 2025</p>
        </div>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-text-secondary">

        <Section title="Kabul">
          <p>
            BistAI platformunu kullanarak bu kullanım koşullarını okuduğunuzu, anladığınızı
            ve kabul ettiğinizi beyan edersiniz. Koşulları kabul etmiyorsanız platformu
            kullanmayınız.
          </p>
        </Section>

        <Section title="Hizmetin Kapsamı">
          <p className="mb-3">BistAI aşağıdaki hizmetleri sunar:</p>
          <ul className="space-y-1.5">
            <li>BIST hisselerinde teknik analiz sinyal taraması</li>
            <li>Hisse fiyat grafikleri ve göstergeleri</li>
            <li>Yapay zeka destekli sinyal açıklamaları</li>
            <li>Portföy ve watchlist takibi</li>
            <li>Makroekonomik gösterge takibi</li>
            <li>E-posta sinyal bildirimleri</li>
          </ul>
        </Section>

        <Section title="Kullanıcı Yükümlülükleri">
          <ul className="space-y-2">
            <li>Platforma kayıt olurken gerçek ve doğru bilgi vermek</li>
            <li>Hesap güvenliğini korumak; şifreyi başkalarıyla paylaşmamak</li>
            <li>Platformu yalnızca kişisel, ticari olmayan amaçlarla kullanmak</li>
            <li>Platformun altyapısına zarar verecek eylemlerden kaçınmak (scraping, DoS vb.)</li>
            <li>Diğer kullanıcıların haklarına saygı göstermek</li>
            <li>Topluluk özelliklerinde yanıltıcı, hakaret içerikli veya yasadışı içerik paylaşmamak</li>
          </ul>
        </Section>

        <Section title="Fikri Mülkiyet">
          <p>
            Platform tasarımı, kodu, logosu ve içerikleri BistAI&apos;a aittir. İzin alınmaksızın
            kopyalanamaz, dağıtılamaz veya ticari amaçla kullanılamaz. Kullanıcılar tarafından
            oluşturulan portföy ve watchlist verileri kullanıcıya aittir.
          </p>
        </Section>

        <Section title="Hizmet Kesintileri">
          <p>
            BistAI, bakım, güncelleme veya teknik sorunlar nedeniyle hizmeti geçici olarak
            kesme hakkını saklı tutar. Hizmet kesintilerinden doğan kayıplar için sorumluluk
            kabul edilmez.
          </p>
        </Section>

        <Section title="Hesap Askıya Alma">
          <p>
            Kullanım koşullarının ihlali, platforma zarar verilmesi veya yasadışı kullanım
            tespit edilmesi durumunda hesabınız önceden bildirim yapılmaksızın askıya alınabilir
            veya kalıcı olarak kapatılabilir.
          </p>
        </Section>

        <Section title="Değişiklikler">
          <p>
            Bu koşullar zaman zaman güncellenebilir. Önemli değişiklikler e-posta ile
            bildirilir. Güncel koşulları bu sayfadan her zaman inceleyebilirsiniz.
            Güncellemeden sonra platformu kullanmaya devam etmeniz yeni koşulları
            kabul ettiğiniz anlamına gelir.
          </p>
        </Section>

        <Section title="Uygulanacak Hukuk">
          <p>
            Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda
            İstanbul Mahkemeleri ve İcra Daireleri yetkilidir.
          </p>
        </Section>

        <Section title="İletişim">
          <p>
            Kullanım koşulları hakkında sorularınız için:{' '}
            <a href="mailto:destek@bistai.app" className="text-primary underline-offset-2 hover:underline">
              destek@bistai.app
            </a>
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
