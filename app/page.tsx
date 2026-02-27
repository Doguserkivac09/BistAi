import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { BarChart3, Sparkles, TrendingUp } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-12 md:py-20">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-text-primary md:text-5xl lg:text-6xl">
            BIST Hisselerinde{' '}
            <span className="text-primary">AI Destekli</span> Sinyal Analizi
          </h1>
          <p className="mt-6 text-lg text-text-secondary md:text-xl">
            Hisse senedi sinyallerini anında tarayın, teknik analiz çıktılarını yapay zeka ile
            sade Türkçe açıklamalarla takip edin.
          </p>
          <Button size="lg" className="mt-8" asChild>
            <Link href="/kayit">Ücretsiz Başla</Link>
          </Button>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          <Card className="border-border bg-surface/80 backdrop-blur-sm transition hover:border-primary/50">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-card border border-border bg-primary/10 text-primary">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary">Sinyal Tarama</h2>
            </CardHeader>
            <CardContent>
              <p className="text-text-secondary">
                Önemli BIST hisselerini tek tıkla tarayın; RSI uyumsuzluğu, hacim anomalisi, trend
                başlangıcı ve kırılım sinyallerini görün.
              </p>
            </CardContent>
          </Card>
          <Card className="border-border bg-surface/80 backdrop-blur-sm transition hover:border-primary/50">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-card border border-border bg-primary/10 text-primary">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary">Grafik Analizi</h2>
            </CardHeader>
            <CardContent>
              <p className="text-text-secondary">
                Hisse bazında mum grafikleri, EMA çizgileri ve RSI göstergesi ile teknik analiz
                yapın.
              </p>
            </CardContent>
          </Card>
          <Card className="border-border bg-surface/80 backdrop-blur-sm transition hover:border-primary/50">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-card border border-border bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary">Akıllı Açıklamalar</h2>
            </CardHeader>
            <CardContent>
              <p className="text-text-secondary">
                Her sinyal için Claude AI ile üretilen, jargon-free ve anlaşılır Türkçe
                açıklamalar.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
