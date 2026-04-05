import type { Metadata } from 'next';
import { Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Gizlilik Politikası | Investable Edge',
  description: 'Investable Edge gizlilik politikası — kişisel verilerinizi nasıl topluyor, kullanıyor ve koruyoruz.',
};

export default function GizlilikPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Gizlilik Politikası</h1>
          <p className="text-sm text-text-muted">Son güncelleme: Mart 2025</p>
        </div>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-text-secondary">

        <Section title="Toplanan Veriler">
          <ul className="space-y-2">
            <li><span className="font-medium text-text-primary">Hesap bilgileri:</span> E-posta adresi ve şifre (Supabase Auth üzerinden güvenli şekilde saklanır).</li>
            <li><span className="font-medium text-text-primary">Portföy verileri:</span> Eklediğiniz hisse senetleri, lot miktarları ve alış fiyatları.</li>
            <li><span className="font-medium text-text-primary">Watchlist:</span> Takibe aldığınız hisseler.</li>
            <li><span className="font-medium text-text-primary">Kullanım verileri:</span> Hangi sinyallerin görüntülendiği, bildirim tercihleri.</li>
            <li><span className="font-medium text-text-primary">Teknik veriler:</span> IP adresi, tarayıcı türü (standart sunucu logları).</li>
          </ul>
        </Section>

        <Section title="Verilerin Kullanım Amacı">
          <ul className="space-y-2">
            <li>Hesabınızı oluşturmak ve yönetmek</li>
            <li>Portföy ve watchlist verilerinizi saklamak</li>
            <li>Seçtiğiniz hisseler için sinyal e-posta bildirimleri göndermek</li>
            <li>Platformun güvenliğini ve stabilitesini sağlamak</li>
            <li>Hizmet kalitesini iyileştirmek</li>
          </ul>
        </Section>

        <Section title="Veriler Üçüncü Taraflarla Paylaşılır mı?">
          <p className="mb-3">
            Kişisel verileriniz hiçbir koşulda üçüncü taraflara satılmaz. Yalnızca hizmetin
            işleyişi için zorunlu olan aşağıdaki altyapı sağlayıcılarıyla paylaşılır:
          </p>
          <ul className="space-y-2">
            <li><span className="font-medium text-text-primary">Supabase:</span> Veritabanı ve kimlik doğrulama altyapısı.</li>
            <li><span className="font-medium text-text-primary">Vercel:</span> Uygulama barındırma ve dağıtım.</li>
            <li><span className="font-medium text-text-primary">Resend:</span> E-posta bildirim gönderimi (yalnızca e-posta adresiniz iletilir).</li>
            <li><span className="font-medium text-text-primary">Anthropic:</span> AI sinyal açıklamaları (kişisel veri iletilmez, yalnızca anonim teknik veriler).</li>
          </ul>
        </Section>

        <Section title="Veri Güvenliği">
          <p>
            Verileriniz Supabase altyapısında şifreli (AES-256) olarak saklanır. Supabase Row
            Level Security (RLS) politikaları ile her kullanıcı yalnızca kendi verilerine
            erişebilir. HTTPS ile tüm iletişim şifrelidir. Şifreler hiçbir zaman düz metin
            olarak saklanmaz.
          </p>
        </Section>

        <Section title="Çerezler (Cookies)">
          <p>
            Investable Edge yalnızca oturum yönetimi için zorunlu çerezler kullanır. Reklamcılık veya
            takip amaçlı üçüncü taraf çerez bulunmamaktadır. Oturum çerezleri tarayıcınızı
            kapattığınızda silinir.
          </p>
        </Section>

        <Section title="Verilerinizi Silme Hakkı">
          <p>
            Hesabınızı ve tüm verilerinizi kalıcı olarak silmek için{' '}
            <a href="mailto:destek@investableedge.app" className="text-primary underline-offset-2 hover:underline">
              destek@investableedge.app
            </a>{' '}
            adresine e-posta gönderebilirsiniz. Talepler 30 gün içinde işleme alınır.
            Profil sayfasından portföy ve watchlist verilerinizi kendiniz silebilirsiniz.
          </p>
        </Section>

        <Section title="İletişim">
          <p>
            Gizlilik politikamız hakkında sorularınız için:{' '}
            <a href="mailto:destek@investableedge.app" className="text-primary underline-offset-2 hover:underline">
              destek@investableedge.app
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
