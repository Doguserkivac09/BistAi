import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { fetchOHLCV } from '@/lib/yahoo';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol = params.symbol.trim().toUpperCase();

  if (!/^[\w^.\-=]{1,20}$/i.test(symbol)) {
    return new Response('Geçersiz sembol', { status: 400 });
  }

  try {
    const { candles, currentPrice, changePercent } = await fetchOHLCV(symbol, 60);
    if (!candles.length) return new Response('Veri yok', { status: 404 });

    const prices = candles.slice(-50).map((c) => c.close);
    const minP = Math.min(...prices) * 0.997;
    const maxP = Math.max(...prices) * 1.003;
    const range = maxP - minP || 1;

    const isUp      = (changePercent ?? 0) >= 0;
    const lineColor = isUp ? '#22c55e' : '#ef4444';
    const bgColor   = isUp ? '#052e16' : '#2d0a0a';
    const changeSign = isUp ? '+' : '';
    const price     = (currentPrice ?? prices[prices.length - 1]!).toFixed(2);
    const change    = (changePercent ?? 0).toFixed(2);

    // Bar chart: each bar = one price point
    const bars = prices.map((p) => {
      const heightPct = Math.max(2, Math.round(((p - minP) / range) * 100));
      return heightPct;
    });

    // Price range labels
    const labelMax = maxP.toFixed(2);
    const labelMin = minP.toFixed(2);

    return new ImageResponse(
      (
        <div
          style={{
            width: 800,
            height: 400,
            background: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'sans-serif',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 28px 12px',
              borderBottom: '1px solid #1e293b',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#ffffff', fontSize: 32, fontWeight: 'bold', letterSpacing: 1 }}>
                {symbol}
              </span>
              <span style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                Son 50 İşlem Günü
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ color: '#ffffff', fontSize: 28, fontWeight: 'bold' }}>
                {price} ₺
              </span>
              <span
                style={{
                  color: lineColor,
                  fontSize: 18,
                  fontWeight: 700,
                  marginTop: 2,
                  background: bgColor,
                  padding: '2px 10px',
                  borderRadius: 6,
                }}
              >
                {changeSign}{change}%
              </span>
            </div>
          </div>

          {/* Chart area */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'stretch',
              padding: '12px 28px 8px',
              gap: 0,
            }}
          >
            {/* Y labels */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginRight: 10,
                paddingBottom: 4,
              }}
            >
              <span style={{ color: '#475569', fontSize: 11 }}>{labelMax}</span>
              <span style={{ color: '#475569', fontSize: 11 }}>{((parseFloat(labelMax) + parseFloat(labelMin)) / 2).toFixed(2)}</span>
              <span style={{ color: '#475569', fontSize: 11 }}>{labelMin}</span>
            </div>

            {/* Bars */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: 2,
              }}
            >
              {bars.map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    background: i === bars.length - 1
                      ? lineColor
                      : `${lineColor}55`,
                    borderRadius: '2px 2px 0 0',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0 28px 12px',
            }}
          >
            <span style={{ color: '#334155', fontSize: 11 }}>bistai.vercel.app</span>
            <span style={{ color: '#334155', fontSize: 11 }}>
              AI Sinyal Botu • {new Date().toLocaleDateString('tr-TR')}
            </span>
          </div>
        </div>
      ),
      { width: 800, height: 400 }
    );
  } catch (err) {
    console.error('[chart-image]', err);
    return new Response('Grafik oluşturulamadı', { status: 500 });
  }
}
