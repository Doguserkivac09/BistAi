// Ortak yasal feragat şeridi — karar-yoğun ekranlarda (Hisse Detay, Fırsatlar, VIOP, Bugün).
// Footer'daki global uyarıya ek olarak, kullanıcının skor/sinyal görüp aksiyon aldığı
// noktada görünür. Emir dili nötrleştirmesiyle (getDecisionTr vb.) aynı yasal hedef:
// analiz ≠ yatırım tavsiyesi. Tek kaynak — metni burada değiştir, her ekran güncellenir.

export default function YasalFeragat({ className = '' }: { className?: string }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-2.5 rounded-[14px] border border-warn/30 bg-warn/[0.07] px-4 py-3 ${className}`}
    >
      <span aria-hidden className="mt-[1px] text-[15px] leading-none">⚠️</span>
      <p className="text-[12.5px] leading-relaxed text-t2">
        <span className="font-bold text-ink">Yatırım tavsiyesi değildir.</span>{' '}
        Bu sayfadaki skorlar, sinyaller ve analizler yalnızca bilgilendirme amaçlıdır;
        alım-satım önerisi veya kesinlik içermez. Yatırım kararları{' '}
        <span className="font-semibold">kişisel sorumluluğunuzdadır</span> ve geçmiş
        performans gelecek getiriyi garanti etmez.
      </p>
    </div>
  );
}
