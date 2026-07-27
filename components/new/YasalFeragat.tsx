// Ortak yasal feragat şeridi — karar-yoğun ekranlarda (Hisse Detay, Fırsatlar, VIOP, Bugün).
// Footer'daki global uyarıya ek olarak, kullanıcının skor/sinyal görüp aksiyon aldığı
// noktada görünür. Emir dili nötrleştirmesiyle (getDecisionTr vb.) aynı yasal hedef:
// analiz ≠ yatırım tavsiyesi. Tek kaynak — metni burada değiştir, her ekran güncellenir.

const METIN =
  'Bu sayfadaki skorlar, sinyaller ve analizler yalnızca bilgilendirme amaçlıdır; ' +
  'yatırım tavsiyesi, alım-satım önerisi veya kesinlik içermez. Yatırım kararları ' +
  'kişisel sorumluluğunuzdadır. Geçmiş performans gelecek getiriyi garanti etmez.';

export default function YasalFeragat({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-[11px] leading-relaxed text-t3 ${className}`}>
      {METIN}
    </p>
  );
}
