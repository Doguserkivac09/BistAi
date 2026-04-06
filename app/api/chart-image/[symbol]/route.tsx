import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { fetchOHLCV } from '@/lib/yahoo';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol = params.symbol.trim().toUpperCase();

  if (!/^[\w^.\-=]{1,20}$/i.test(symbol)) {
    return new Response('Geçersiz sembol', { status: 400 });
  }

  try {
    const { candles, currentPrice, changePercent } = await fetchOHLCV(symbol, 60);
    if (!candles.length) return new Response('Veri yok', { status: 404 });

    const prices = candles.slice(-60).map((c) => c.close);
    const dates  = candles.slice(-60).map((c) =>
      typeof c.date === 'string' ? c.date.slice(5) : '' // MM-DD
    );

    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const padding = (rawMax - rawMin) * 0.08 || 1;
    const minP = rawMin - padding;
    const maxP = rawMax + padding;
    const range = maxP - minP;

    const W = 800, H = 420;
    const CX = 70, CY = 80, CW = 690, CH = 250;

    const toX = (i: number) => CX + (i / Math.max(prices.length - 1, 1)) * CW;
    const toY = (p: number) => CY + CH - ((p - minP) / range) * CH;

    const linePoints = prices.map((p, i) => `${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ');

    const areaD = [
      `M ${toX(0).toFixed(1)},${(CY + CH).toFixed(1)}`,
      ...prices.map((p, i) => `L ${toX(i).toFixed(1)},${toY(p).toFixed(1)}`),
      `L ${toX(prices.length - 1).toFixed(1)},${(CY + CH).toFixed(1)}`,
      'Z',
    ].join(' ');

    const isUp      = (changePercent ?? 0) >= 0;
    const lineColor = isUp ? '#22c55e' : '#ef4444';
    const changeSign = isUp ? '+' : '';

    // Y-axis price labels (4 ticks)
    const ticks = [0, 0.33, 0.66, 1].map((r) => ({
      y: CY + CH * r,
      label: (maxP - r * range).toFixed(2),
    }));

    // X-axis date labels (first, mid, last)
    const xLabels = [
      { x: toX(0), label: dates[0] ?? '' },
      { x: toX(Math.floor(prices.length / 2)), label: dates[Math.floor(prices.length / 2)] ?? '' },
      { x: toX(prices.length - 1), label: dates[prices.length - 1] ?? '' },
    ];

    const lastX = toX(prices.length - 1);
    const lastY = toY(prices[prices.length - 1]!);

    return new ImageResponse(
      (
        <div
          style={{
            width: W,
            height: H,
            background: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'sans-serif',
            position: 'relative',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '18px 30px 0',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#ffffff', fontSize: 30, fontWeight: 'bold', letterSpacing: 1 }}>
                {symbol}
              </span>
              <span style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                Son 60 Gün · BistAI
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ color: '#ffffff', fontSize: 26, fontWeight: 'bold' }}>
                {(currentPrice ?? prices[prices.length - 1]!).toFixed(2)} ₺
              </span>
              <span style={{ color: lineColor, fontSize: 17, fontWeight: 600, marginTop: 2 }}>
                {changeSign}{(changePercent ?? 0).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Chart */}
          <svg
            width={W}
            height={CH + CY + 10}
            style={{ position: 'absolute', top: 70 }}
          >
            {/* Grid lines + Y labels */}
            {ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={CX} y1={t.y} x2={CX + CW} y2={t.y}
                  stroke="#1e293b" strokeWidth={1}
                />
                <text
                  x={CX - 6} y={t.y + 4}
                  textAnchor="end" fill="#475569" fontSize={12}
                >
                  {t.label}
                </text>
              </g>
            ))}

            {/* X labels */}
            {xLabels.map((xl, i) => (
              <text
                key={i}
                x={xl.x} y={CY + CH + 22}
                textAnchor="middle" fill="#475569" fontSize={11}
              >
                {xl.label}
              </text>
            ))}

            {/* Gradient def */}
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Area fill */}
            <path d={areaD} fill="url(#areaGrad)" />

            {/* Line */}
            <polyline
              points={linePoints}
              fill="none"
              stroke={lineColor}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />

            {/* Last price dot */}
            <circle cx={lastX} cy={lastY} r={5} fill={lineColor} />
            <circle cx={lastX} cy={lastY} r={9} fill={lineColor} fillOpacity={0.25} />
          </svg>

          {/* Footer */}
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              left: 30,
              right: 30,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#334155', fontSize: 12 }}>bistai.vercel.app</span>
            <span style={{ color: '#334155', fontSize: 12 }}>AI Sinyal Botu • {new Date().toLocaleDateString('tr-TR')}</span>
          </div>
        </div>
      ),
      { width: W, height: H }
    );
  } catch (err) {
    console.error('[chart-image]', err);
    return new Response('Grafik oluşturulamadı', { status: 500 });
  }
}
