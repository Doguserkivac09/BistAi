/**
 * TradingView Charting Library — UDF datafeed endpoint'leri (FAZ: TradingView pro UI + kendi verimiz).
 *
 * `Datafeeds.UDFCompatibleDatafeed('/api/udf')` bu rotalarla konuşur:
 *   GET /api/udf/config
 *   GET /api/udf/symbols?symbol=GARAN
 *   GET /api/udf/search?query=gar&limit=30
 *   GET /api/udf/history?symbol=GARAN&resolution=D&from=...&to=...
 *   GET /api/udf/time
 *
 * Veri KENDİ kaynağımızdan (Yahoo OHLCV) gelir → BIST veri-lisansı sorunu YOK.
 */

import { NextRequest, NextResponse } from 'next/server';
import { udfConfig, udfSymbolInfo, udfSearch, udfHistory } from '@/lib/udf';

export const dynamic = 'force-dynamic';

// Charting Library farklı origin'de host edilebilir → CORS aç (yalnız GET, veri okuma).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { action: string } },
) {
  const action = params.action;
  const sp = request.nextUrl.searchParams;

  switch (action) {
    case 'config':
      return json(udfConfig());

    case 'time':
      return json(Math.floor(Date.now() / 1000));

    case 'symbols': {
      const symbol = sp.get('symbol');
      if (!symbol) return json({ s: 'error', errmsg: 'symbol gerekli' }, 400);
      // "BIST:GARAN" gibi önekleri temizle
      const clean = symbol.includes(':') ? symbol.split(':')[1]! : symbol;
      return json(udfSymbolInfo(clean));
    }

    case 'search': {
      const query = sp.get('query') ?? '';
      const limit = Number(sp.get('limit')) || 30;
      return json(udfSearch(query, limit));
    }

    case 'history': {
      const symbol = sp.get('symbol');
      const resolution = sp.get('resolution') ?? 'D';
      const from = Number(sp.get('from'));
      const to = Number(sp.get('to'));
      if (!symbol || !Number.isFinite(from) || !Number.isFinite(to)) {
        return json({ s: 'error', errmsg: 'symbol/from/to gerekli' }, 400);
      }
      const clean = symbol.includes(':') ? symbol.split(':')[1]! : symbol;
      const bars = await udfHistory(clean, resolution, from, to);
      return json(bars);
    }

    default:
      return json({ s: 'error', errmsg: 'bilinmeyen endpoint' }, 404);
  }
}
