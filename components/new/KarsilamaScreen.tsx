'use client';

/**
 * "Onboarding" akışı (design_handoff_kalan_ekranlar) — hi-fi, açık tema.
 * Adım 2/3 Risk Profili (tek seçim) + Adım 3/3 İlgi Alanları (çoklu seçim).
 * Seçimler Supabase auth user_metadata'ya yazılır (MIGRATION YOK):
 *   { risk_profile, interests, onboarded: true } → bitince /bugun.
 * Hesap oluşturma (adım 1/3) /kayit ekranında yapılır.
 */

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
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

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-6 pt-4">
        {/* Üst bar: geri + ilerleme + adım */}
        <div className="flex items-center gap-3.5">
          <button onClick={goBack} className="text-ink" aria-label="Geri">
            <ChevronLeft />
          </button>
          <div className="flex flex-1 gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-[5px] flex-1 rounded-[3px] ${i < filled ? 'bg-ink' : 'bg-hairline'}`} />
            ))}
          </div>
          <span className="font-mono text-[12px] font-semibold text-t3">{step === 'risk' ? '2/3' : '3/3'}</span>
        </div>

        {step === 'risk' ? (
          <div className="flex flex-1 flex-col pt-3.5">
            <h1 className="text-[25px] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink">
              Risk toleransın
              <br />
              nedir?
            </h1>
            <p className="mt-2.5 text-[13px] font-medium leading-[1.5] text-t3">
              AI önerilerini buna göre kişiselleştireceğiz.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              {RISKS.map((r) => {
                const active = risk === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRisk(r.id)}
                    className={`rounded-[18px] p-[15px] text-left transition-colors ${
                      active ? 'border-2 border-ink bg-page' : 'border border-hairline bg-panel'
                    }`}
                    aria-pressed={active}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[16px] font-bold text-ink">{r.label}</span>
                        {active && (
                          <span className="rounded-[7px] bg-ink px-2.5 py-1 text-[10px] font-bold text-white">Seçili</span>
                        )}
                      </div>
                      <span className="font-mono text-[12px] font-semibold text-up">{r.ret}</span>
                    </div>
                    <p className={`mt-1.5 text-[12px] font-medium leading-[1.5] ${active ? 'text-t2' : 'text-t3'}`}>
                      {r.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="flex-1" />
            <button
              onClick={() => setStep('interests')}
              className="mt-6 flex h-[54px] items-center justify-center rounded-[15px] bg-ink text-[15px] font-bold text-white transition-colors hover:bg-ink/90"
            >
              Devam et
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col pt-3.5">
            <h1 className="text-[25px] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink">
              Hangi sektörler
              <br />
              ilgini çekiyor?
            </h1>
            <p className="mt-2.5 text-[13px] font-medium leading-[1.5] text-t3">
              Radar ve fırsatları bunlara göre önceliklendiririz.
            </p>

            <div className="mt-6 flex flex-wrap gap-2.5">
              {SECTORS.map((s) => {
                const active = interests.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSector(s)}
                    className={`rounded-[13px] px-4 py-2.5 text-[14px] font-bold transition-colors ${
                      active ? 'bg-ink text-white' : 'border border-[#e7e9ec] bg-panel text-ink hover:bg-fill'
                    }`}
                    aria-pressed={active}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            <div className="flex-1" />

            {interests.length > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded-[14px] border-[1.5px] border-ai-panel-border bg-ai-panel px-[15px] py-3.5">
                <span className="font-mono text-[12px] font-bold text-ai">✦</span>
                <span className="text-[12px] font-medium leading-[1.45] text-t2">
                  {interests.length} sektör seçtin — AI bunlara göre seni yönlendirecek.
                </span>
              </div>
            )}

            <button
              onClick={finish}
              disabled={saving}
              className="flex h-[54px] items-center justify-center rounded-[15px] bg-ink text-[15px] font-bold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
            >
              {saving ? 'Hazırlanıyor…' : "bistAI'a başla"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
