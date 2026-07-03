/**
 * Investable Edge marka bileşenleri (design_handoff_kalan_ekranlar, rebrand sürümü).
 * - Wordmark: logo karesi + "Investable Edge" (Edge: koyu zeminde #9fe8c6, açıkta yeşil).
 * - CinematicHeroScene: giriş/kayıt hero'sunun dekoratif katmanları — #0b0d11 zemin
 *   üzerine radial ışık haleleri + çapraz huzme + 3D metalik squircle logo + zemin
 *   gölgesi + buzlu cam katmanı + parçacıklar. Salt görsel (aria-hidden).
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

/** Yükselen trend oku (beyaz, drop-shadow'lu). */
function TrendArrow({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ filter: 'drop-shadow(0 2px 3px rgba(0,40,20,0.45))' }}
    >
      <path d="M4 15l5.5-5.5 3.5 3.5L20 7" />
      <path d="M15 7h5v5" />
    </svg>
  );
}

/** 3D metalik squircle logo kompozisyonu — mobile/desktop boyut varyantlı. */
function Logo3D({ desktop }: { desktop?: boolean }) {
  const s = desktop
    ? { box: 236, radius: 62, inner: 100, innerRadius: 32, arrow: 50 }
    : { box: 108, radius: 31, inner: 46, innerRadius: 15, arrow: 23 };
  return (
    <div
      className="absolute"
      style={{
        width: s.box,
        height: s.box,
        borderRadius: s.radius,
        transform: 'rotateY(-42deg) rotateX(12deg) rotateZ(-4deg)',
        background: 'linear-gradient(135deg,#3a414c 0%,#181b21 46%,#0b0d11 100%)',
        boxShadow: desktop
          ? '-24px 16px 0 -2px #05070a,-28px 18px 0 -2px rgba(87,233,165,0.07),-48px 62px 96px rgba(0,0,0,0.66),inset 3px 3px 4px rgba(255,255,255,0.38),inset -12px -18px 36px rgba(0,0,0,0.66),inset 9px 0 22px -4px rgba(87,233,165,0.26),inset 0 0 0 1.5px rgba(255,255,255,0.09)'
          : '-14px 9px 0 -1px #05070a,-16px 10px 0 -1px rgba(87,233,165,0.07),-30px 36px 52px rgba(0,0,0,0.66),inset 2px 2px 3px rgba(255,255,255,0.38),inset -7px -10px 20px rgba(0,0,0,0.66),inset 5px 0 13px -2px rgba(87,233,165,0.26),inset 0 0 0 1px rgba(255,255,255,0.09)',
      }}
    >
      {/* Spekülar highlight katmanı */}
      <div
        className="absolute inset-0"
        style={{ borderRadius: s.radius, background: 'linear-gradient(115deg,rgba(255,255,255,0.22) 0%,rgba(255,255,255,0.05) 26%,rgba(255,255,255,0) 46%)' }}
      />
      <div
        className="absolute"
        style={{
          left: s.box * 0.11,
          top: s.box * 0.085,
          width: s.box * 0.25,
          height: s.box * 0.095,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse,rgba(255,255,255,0.4),rgba(255,255,255,0) 70%)',
          filter: 'blur(2.5px)',
          transform: 'rotate(-18deg)',
        }}
      />
      {/* Camsı yeşil iç squircle + trend oku */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: s.inner,
          height: s.inner,
          borderRadius: s.innerRadius,
          transform: `translate(-50%,-50%) translateZ(${desktop ? 20 : 14}px)`,
          background: 'linear-gradient(140deg,#5eeeaa 0%,#16a35b 55%,#087a41 100%)',
          boxShadow: desktop
            ? '-9px 7px 0 -2px rgba(4,50,27,0.85),0 0 0 8px rgba(255,255,255,0.05),0 20px 48px rgba(22,163,91,0.65),inset 3px 3.5px 6px rgba(255,255,255,0.6),inset -8px -11px 20px rgba(0,58,29,0.55)'
            : '-5px 4px 0 -1px rgba(4,50,27,0.85),0 0 0 4px rgba(255,255,255,0.06),0 9px 22px rgba(22,163,91,0.65),inset 1.5px 2px 3px rgba(255,255,255,0.6),inset -4px -5px 9px rgba(0,58,29,0.55)',
        }}
      >
        <div
          className="absolute inset-0"
          style={{ borderRadius: s.innerRadius, background: 'linear-gradient(120deg,rgba(255,255,255,0.35),rgba(255,255,255,0) 52%)' }}
        />
        <TrendArrow size={s.arrow} />
      </div>
    </div>
  );
}

const PARTICLES: Array<{ left: string; top: string; size: number; color: string }> = [
  { left: '12%', top: '18%', size: 3, color: 'rgba(255,255,255,0.35)' },
  { left: '78%', top: '12%', size: 2, color: 'rgba(87,233,165,0.5)' },
  { left: '64%', top: '56%', size: 3, color: 'rgba(255,255,255,0.22)' },
  { left: '30%', top: '70%', size: 2, color: 'rgba(139,143,255,0.45)' },
  { left: '88%', top: '44%', size: 3, color: 'rgba(87,233,165,0.3)' },
  { left: '46%', top: '30%', size: 2, color: 'rgba(255,255,255,0.3)' },
  { left: '90%', top: '70%', size: 2, color: 'rgba(255,255,255,0.25)' },
];

/**
 * Hero dekor katmanları — konumlandırılmış bir (relative, overflow-hidden, bg #0b0d11)
 * kabın İÇİNE yerleştirilir; metin içeriği bu bileşenden SONRA (relative) gelmelidir.
 */
export function CinematicHeroScene({ desktop }: { desktop?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Işık haleleri */}
      <div
        className="absolute rounded-full"
        style={
          desktop
            ? { right: -100, top: -80, width: 420, height: 420, background: 'radial-gradient(circle,rgba(22,163,91,0.34),rgba(22,163,91,0) 70%)', filter: 'blur(38px)' }
            : { right: -70, top: -50, width: 280, height: 280, background: 'radial-gradient(circle,rgba(22,163,91,0.36),rgba(22,163,91,0) 70%)', filter: 'blur(28px)' }
        }
      />
      <div
        className="absolute rounded-full"
        style={
          desktop
            ? { left: -110, bottom: -130, width: 400, height: 400, background: 'radial-gradient(circle,rgba(107,111,245,0.22),rgba(107,111,245,0) 70%)', filter: 'blur(42px)' }
            : { left: -70, bottom: -90, width: 250, height: 250, background: 'radial-gradient(circle,rgba(107,111,245,0.22),rgba(107,111,245,0) 70%)', filter: 'blur(32px)' }
        }
      />
      {/* Çapraz ışık huzmesi */}
      <div
        className="absolute"
        style={{
          left: desktop ? -80 : -60,
          top: desktop ? '36%' : '34%',
          width: '170%',
          height: desktop ? 170 : 110,
          background: 'linear-gradient(100deg,rgba(255,255,255,0) 32%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0) 68%)',
          transform: 'rotate(-16deg)',
        }}
      />
      {/* 3D logo + zemin gölgesi */}
      {desktop ? (
        <div className="absolute left-1/2 top-[46%] h-[420px] w-[360px] -translate-x-1/2 -translate-y-1/2" style={{ perspective: 1100 }}>
          <div className="absolute left-[60px] top-[60px]">
            <Logo3D desktop />
          </div>
          <div
            className="absolute left-[84px] top-[326px] h-9 w-[206px] rounded-full"
            style={{ background: 'radial-gradient(ellipse,rgba(0,0,0,0.65),rgba(0,0,0,0) 70%)', filter: 'blur(9px)' }}
          />
        </div>
      ) : (
        <div className="absolute right-0 top-3.5 h-[180px] w-[160px]" style={{ perspective: 640 }}>
          <div className="absolute left-[26px] top-3.5">
            <Logo3D />
          </div>
          <div
            className="absolute left-9 top-[132px] h-[19px] w-24 rounded-full"
            style={{ background: 'radial-gradient(ellipse,rgba(0,0,0,0.65),rgba(0,0,0,0) 70%)', filter: 'blur(5px)' }}
          />
        </div>
      )}
      {/* Buzlu cam katmanı */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(11,13,17,0.44)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      />
      {/* Parçacıklar */}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{ left: p.left, top: p.top, width: p.size, height: p.size, background: p.color }}
        />
      ))}
    </div>
  );
}
