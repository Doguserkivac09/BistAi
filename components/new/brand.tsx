/**
 * Investable Edge marka bileşenleri (design_handoff_kalan_ekranlar, fullekran sürümü).
 * - Wordmark: logo karesi + "Investable Edge" (Edge: koyu zeminde #9fe8c6, açıkta yeşil).
 * - AnimatedNightScene: tam-ekran koyu giriş/kayıt sahnesi — #0b0d11 zemin üzerine
 *   ANİMASYONLU radial ışık haleleri (ie-glow-*), çapraz ışık huzmeleri (ie-beam) ve
 *   yanıp sönen yıldız parçacıkları (ie-tw). Keyframe'ler app/globals.css'te.
 *   Salt görsel (aria-hidden); metin/form içerik bu bileşenden SONRA relative gelir.
 */

const DARK_EDGE = '#9fe8c6';

export function Wordmark({
  onDark = false,
  size = 18,
  markSize = 30,
}: {
  onDark?: boolean;
  size?: number;
  markSize?: number;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`flex items-center justify-center ${onDark ? 'bg-white' : 'bg-ink'}`}
        style={{ width: markSize, height: markSize, borderRadius: markSize * 0.3 }}
      >
        <span className="bg-up" style={{ width: markSize * 0.37, height: markSize * 0.37, borderRadius: markSize * 0.1 }} />
      </span>
      <span
        className={`font-extrabold tracking-[-0.03em] ${onDark ? 'text-white' : 'text-ink'}`}
        style={{ fontSize: size }}
      >
        Investable{' '}
        <span className="font-semibold" style={{ color: onDark ? DARK_EDGE : '#16a35b' }}>
          Edge
        </span>
      </span>
    </span>
  );
}

interface Particle {
  left: string;
  top: string;
  size: number;
  color: string;
  dur: number;
  delay: number;
}

// Masaüstü dağılımı (tasarımdaki 12 parçacık); mobil ilk 11'ini kullanır
const PARTICLES: Particle[] = [
  { left: '10%', top: '12%', size: 3, color: '#fff', dur: 4, delay: 0 },
  { left: '30%', top: '8%', size: 2, color: '#57e9a5', dur: 5, delay: 1 },
  { left: '56%', top: '16%', size: 3, color: '#fff', dur: 6, delay: 2 },
  { left: '78%', top: '10%', size: 2, color: '#8b8fff', dur: 5, delay: 0.5 },
  { left: '92%', top: '30%', size: 3, color: '#57e9a5', dur: 7, delay: 3 },
  { left: '6%', top: '44%', size: 2, color: '#fff', dur: 6, delay: 1.5 },
  { left: '20%', top: '66%', size: 2, color: '#8b8fff', dur: 5, delay: 2.5 },
  { left: '44%', top: '82%', size: 3, color: 'rgba(255,255,255,0.9)', dur: 8, delay: 1 },
  { left: '70%', top: '74%', size: 2, color: '#57e9a5', dur: 6, delay: 4 },
  { left: '88%', top: '88%', size: 2, color: 'rgba(255,255,255,0.8)', dur: 7, delay: 0.8 },
  { left: '38%', top: '38%', size: 2, color: '#57e9a5', dur: 9, delay: 2 },
];

/**
 * Animasyonlu gece sahnesi — (relative, overflow-hidden, bg #0b0d11) kabın içine.
 * `desktop` yalnız hale/huzme boyutlarını büyütür; parçacıklar oransal aynıdır.
 */
export function AnimatedNightScene({ desktop }: { desktop?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Işık haleleri */}
      <div
        className="absolute rounded-full"
        style={{
          right: desktop ? -120 : -90,
          top: desktop ? -100 : -60,
          width: desktop ? 520 : 320,
          height: desktop ? 520 : 320,
          background: 'radial-gradient(circle,rgba(22,163,91,0.37),rgba(22,163,91,0) 70%)',
          filter: `blur(${desktop ? 42 : 30}px)`,
          animation: `ie-glow-a ${desktop ? 8 : 7}s ease-in-out infinite`,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: desktop ? -130 : -90,
          top: desktop ? '24%' : '30%',
          width: desktop ? 480 : 300,
          height: desktop ? 480 : 300,
          background: 'radial-gradient(circle,rgba(107,111,245,0.25),rgba(107,111,245,0) 70%)',
          filter: `blur(${desktop ? 46 : 34}px)`,
          animation: `ie-glow-b ${desktop ? 10 : 9}s ease-in-out infinite`,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          right: desktop ? -100 : -70,
          bottom: desktop ? -140 : -100,
          width: desktop ? 460 : 280,
          height: desktop ? 460 : 280,
          background: 'radial-gradient(circle,rgba(63,206,138,0.19),rgba(63,206,138,0) 70%)',
          filter: `blur(${desktop ? 48 : 36}px)`,
          animation: `ie-glow-c ${desktop ? 12 : 11}s ease-in-out infinite`,
        }}
      />
      {/* Çapraz ışık huzmeleri */}
      <div
        className="absolute"
        style={{
          left: desktop ? -100 : -60,
          top: desktop ? '28%' : '24%',
          width: '170%',
          height: desktop ? 180 : 120,
          background: 'linear-gradient(100deg,rgba(255,255,255,0) 32%,rgba(255,255,255,0.065) 50%,rgba(255,255,255,0) 68%)',
          animation: `ie-beam ${desktop ? 11 : 10}s ease-in-out infinite`,
        }}
      />
      <div
        className="absolute"
        style={{
          left: desktop ? -100 : -60,
          top: '62%',
          width: '170%',
          height: desktop ? 130 : 90,
          background: 'linear-gradient(100deg,rgba(87,233,165,0) 35%,rgba(87,233,165,0.05) 50%,rgba(87,233,165,0) 65%)',
          animation: `ie-beam ${desktop ? 14 : 13}s ease-in-out infinite`,
        }}
      />
      {/* Yanıp sönen parçacıklar */}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: p.color,
            animation: `ie-tw ${p.dur}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
