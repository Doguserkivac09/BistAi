'use client';

/**
 * "Onboarding" akışı (design_handoff_kalan_ekranlar) — hi-fi, açık tema.
 * Adım 2/3 Risk Profili (tek seçim) + Adım 3/3 İlgi Alanları (çoklu seçim).
 * Mobil: üstte geri oku + ilerleme; altta tam genişlik buton.
 * Masaüstü (lg): 68px üst çubuk (logo + 220px ilerleme + adım), ortalanmış
 * 560px sütun, altta "Geri" + 220px "Devam et".
 * Seçimler Supabase auth user_metadata'ya yazılır (MIGRATION YOK):
 *   { risk_profile, interests, onboarded: true } → bitince /bugun.
 */

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Wordmark } from '@/components/new/brand';

type RiskId = 'temkinli' | 'dengeli' | 'atilgan';

const RISKS: { id: RiskId; label: string; ret: string; desc: string }[] = [
  { id: 'temkinli', label: 'Temkinli', ret: '~%14/yıl', desc: 'Sermaye korunması önceliğim.' },
  { id: 'dengeli', label: 'Dengeli', ret: '~%26/yıl', desc: 'Risk ve getiri arasında denge kurmak isterim.' },
  { id: 'atilgan', label: 'Atılgan', ret: '~%41/yıl', desc: 'Yüksek getiri için dalgalanmaya varım.' },
];

const SECTORS = [
  'Bankacılık',
  'Teknoloji',
  'Havacılık',
  'Enerji',
  'Perakende',
  'Sanayi',
  'Sağlık',
  'Gayrimenkul',
  'Temettü',
];

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function KarsilamaScreen() {
  const [step, setStep] = useState<'risk' | 'interests'>('risk');
  const [risk, setRisk] = useState<RiskId>('dengeli');
  const [interests, setInterests] = useState<string[]>(['Bankacılık', 'Havacılık', 'Sanayi']);
  const [saving, setSaving] = useState(false);

  function toggleSector(s: string) {
    setInterests((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function goBack() {
    if (step === 'interests') setStep('risk');
    else window.location.assign('/bugun'); // adım 2/3'te geri = onboarding'i atla
  }

  async function finish() {
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({
        data: { risk_profile: risk, interests, onboarded: true },
      });
    } catch {
      // Kayıt başarısız olsa bile kullanıcıyı uygulamaya al (engelleme)
    } finally {
      window.location.assign('/bugun');
    }
  }

  const filled = step === 'risk' ? 2 : 3;
  const stepLabel = step === 'risk' ? '2/3' : '3/3';

  const progress = (
    <div className="flex flex-1 gap-1.5 lg:w-[220px] lg:flex-none">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`h-[5px] flex-1 rounded-[3px] ${i < filled ? 'bg-ink' : 'bg-hairline'}`} />
      ))}
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page">
      {/* ── Masaüstü üst çubuğu: logo + ilerleme + adım ── */}
      <div className="hidden h-[68px] items-center justify-between border-b border-[#f0f1f3] bg-panel px-8 lg:flex">
        <Wordmark size={18} markSize={30} />
        <div className="flex items-center gap-3.5">
          {progress}
          <span className="font-mono text-[12px] font-semibold text-t3">{stepLabel}</span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-6 pt-4 lg:max-w-[560px] lg:justify-center lg:px-0 lg:pb-16 lg:pt-0">
        {/* Mobil üst bar: geri + ilerleme + adım (masaüstünde topbar var) */}
        <div className="flex items-center gap-3.5 lg:hidden">
          <button onClick={goBack} className="text-ink" aria-label="Geri">
            <ChevronLeft />
          </button>
          {progress}
          <span className="font-mono text-[12px] font-semibold text-t3">{stepLabel}</span>
        </div>

        {step === 'risk' ? (
          <div className="flex flex-1 flex-col pt-3.5 lg:flex-none lg:pt-0">
            <h1 className="text-[25px] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink lg:text-[32px]">
              Risk toleransın
              <br className="lg:hidden" /> nedir?
            </h1>
            <p className="mt-2.5 text-[13px] font-medium leading-[1.5] text-t3 lg:text-[14px]">
              AI önerilerini buna göre kişiselleştireceğiz.
            </p>

            <div className="mt-6 flex flex-col gap-3 lg:mt-[30px] lg:gap-[13px]">
              {RISKS.map((r) => {
                const active = risk === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRisk(r.id)}
                    className={`rounded-[18px] p-[15px] text-left transition-colors lg:px-[22px] lg:py-[19px] ${
                      active ? 'border-2 border-ink bg-panel' : 'border border-hairline bg-panel'
                    }`}
                    aria-pressed={active}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[16px] font-bold text-ink lg:text-[17px]">{r.label}</span>
                        {active && (
                          <span className="rounded-[7px] bg-ink px-2.5 py-1 text-[10px] font-bold text-onink">Seçili</span>
                        )}
                      </div>
                      <span className="font-mono text-[12px] font-semibold text-up lg:text-[13px]">{r.ret}</span>
                    </div>
                    <p className={`mt-1.5 text-[12px] font-medium leading-[1.5] lg:text-[13px] ${active ? 'text-t2' : 'text-t3'}`}>
                      {r.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 lg:flex-none" />

            {/* Alt aksiyon: mobil tam genişlik; masaüstü Geri + 220px Devam et */}
            <div className="mt-6 flex items-center justify-between lg:mt-8">
              <button
                onClick={goBack}
                className="hidden items-center gap-2 text-[14px] font-bold text-t2 hover:text-ink lg:flex"
              >
                <ChevronLeft />
                Geri
              </button>
              <button
                onClick={() => setStep('interests')}
                className="flex h-[54px] w-full items-center justify-center rounded-[15px] bg-ink text-[15px] font-bold text-onink transition-colors hover:bg-ink/90 lg:w-[220px]"
              >
                Devam et
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col pt-3.5 lg:flex-none lg:pt-0">
            <h1 className="text-[25px] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink lg:text-[32px]">
              Hangi sektörler
              <br className="lg:hidden" /> ilgini çekiyor?
            </h1>
            <p className="mt-2.5 text-[13px] font-medium leading-[1.5] text-t3 lg:text-[14px]">
              Radar ve fırsatları bunlara göre önceliklendiririz.
            </p>

            <div className="mt-6 flex flex-wrap gap-2.5 lg:mt-[30px]">
              {SECTORS.map((s) => {
                const active = interests.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSector(s)}
                    className={`rounded-[13px] px-4 py-2.5 text-[14px] font-bold transition-colors ${
                      active ? 'bg-ink text-onink' : 'border border-[#e7e9ec] bg-panel text-ink hover:bg-fill'
                    }`}
                    aria-pressed={active}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 lg:flex-none" />

            {interests.length > 0 && (
              <div className="mb-3 mt-4 flex items-center gap-2 rounded-[14px] border-[1.5px] border-ai-panel-border bg-ai-panel px-[15px] py-3.5 lg:mt-8">
                <span className="font-mono text-[12px] font-bold text-ai">✦</span>
                <span className="text-[12px] font-medium leading-[1.45] text-t2">
                  {interests.length} sektör seçtin — AI bunlara göre seni yönlendirecek.
                </span>
              </div>
            )}

            {/* Alt aksiyon: mobil tam genişlik; masaüstü Geri + 220px başla */}
            <div className="flex items-center justify-between">
              <button
                onClick={goBack}
                className="hidden items-center gap-2 text-[14px] font-bold text-t2 hover:text-ink lg:flex"
              >
                <ChevronLeft />
                Geri
              </button>
              <button
                onClick={finish}
                disabled={saving}
                className="flex h-[54px] w-full items-center justify-center rounded-[15px] bg-ink text-[15px] font-bold text-onink transition-colors hover:bg-ink/90 disabled:opacity-60 lg:w-[220px]"
              >
                {saving ? 'Hazırlanıyor…' : "Investable Edge'e başla"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
