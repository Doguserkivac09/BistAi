/**
 * Fırsat Gerekçe Üretimi (S1) — birim testleri.
 * Kapsam: sözlük tüm sinyalleri karşılıyor mu · 4-rozet sınırı · warn korunur ·
 * boş durum · formasyon tekilleştirme · combo kanıtı · jargon yok.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveReasons, selectTopReasons, buildSummary, firsatToInput, firsatReasons,
  type OpportunityInput, type FirsatLike,
} from '../opportunity-reasons';
import { SIGNAL_CANONICAL_FIELD } from '../signal-horizons';

const base = (over: Partial<OpportunityInput> = {}): OpportunityInput => ({ sinyaller: [], direction: 'yukari', ...over });

describe('deriveReasons — sözlük kapsaması', () => {
  it('signal-horizons’taki HER sinyal tipi bir gerekçe üretir (jargon sızmaz)', () => {
    for (const type of Object.keys(SIGNAL_CANONICAL_FIELD)) {
      const reasons = deriveReasons(base({ sinyaller: [type], direction: 'yukari' }));
      assert.ok(reasons.length >= 1, `"${type}" için gerekçe üretilmedi`);
      // ham motor adı metne sızmamalı (RSI Seviyesi/Vortex vb. sade metne çevrilir)
      assert.ok(!reasons.some((r) => r.text === type), `"${type}" ham adıyla göründü`);
    }
  });
});

describe('selectTopReasons — seçim kuralları', () => {
  it('en fazla 4 rozet', () => {
    const r = deriveReasons(base({
      sinyaller: ['Para Akışı Uyumsuzluğu', 'Hacim Anomalisi', 'Trend Başlangıcı', 'Destek/Direnç Kırılımı', 'Altın Çapraz'],
      relVol5: 3, weeklyAligned: true, sectorAlign: 5, smartMoneyPhase: 'smart_money_entered',
    }));
    assert.ok(selectTopReasons(r).length <= 4);
  });

  it('warn asla gizlenmez — en az 1 uyarı görünür', () => {
    const r = deriveReasons(base({
      sinyaller: ['Para Akışı Uyumsuzluğu', 'Hacim Anomalisi', 'Trend Başlangıcı', 'Destek/Direnç Kırılımı'],
      smartMoneyPhase: 'smart_money_entered', relVol5: 3, weeklyAligned: true,
      earningsRisk: { verdict: 'zayıf', financeBurden: true, redFlag: null }, // düşük öncelikli warn
    }));
    const top = selectTopReasons(r);
    assert.ok(top.some((x) => x.tone === 'warn'), 'uyarı 4 pozitife kurban edildi');
    assert.ok(top.length <= 4);
  });

  it('warn yoksa değiştirme yapılmaz', () => {
    const r = deriveReasons(base({ sinyaller: ['Trend Başlangıcı'], relVol5: 2 }));
    const top = selectTopReasons(r);
    assert.ok(top.every((x) => x.tone !== 'warn'));
  });
});

describe('deriveReasons — özel durumlar', () => {
  it('boş girdi → boş gerekçe', () => {
    assert.equal(deriveReasons(base()).length, 0);
  });

  it('birden çok formasyon → tek "dönüş formasyonu"', () => {
    const r = deriveReasons(base({ sinyaller: ['Çift Dip', 'Bull Flag', 'Higher Lows'] }));
    assert.equal(r.filter((x) => x.text.startsWith('Dönüş formasyonu')).length, 1);
  });

  it('combo → ölçülmüş kanıt (evidence) taşır', () => {
    const r = deriveReasons(base({ combo: { members: ['A', 'B'], winRate: 68, n: 87 } }));
    const c = r.find((x) => x.id === 'combo')!;
    assert.ok(c.evidence?.includes('%68'));
    assert.ok(c.evidence?.includes('87'));
  });

  it('earningsRisk belirsiz (GYO/holding) → uyarı', () => {
    const r = deriveReasons(base({ sinyaller: ['Trend Başlangıcı'], earningsRisk: { verdict: 'belirsiz', financeBurden: false, redFlag: null } }));
    assert.ok(r.some((x) => x.tone === 'warn' && x.id === 'eq-belirsiz'));
  });

  it('bilanço ≤5 gün → uyarı; uzaksa yok', () => {
    assert.ok(deriveReasons(base({ daysUntilEarnings: 3 })).some((x) => x.id === 'earnings-soon'));
    assert.ok(!deriveReasons(base({ daysUntilEarnings: 30 })).some((x) => x.id === 'earnings-soon'));
  });

  it('aşağı yönde MACD/RSI Seviyesi → uyarı tonu', () => {
    const macd = deriveReasons(base({ sinyaller: ['MACD Kesişimi'], direction: 'asagi' }));
    assert.equal(macd.find((x) => x.id === 'macd')!.tone, 'warn');
    const rsi = deriveReasons(base({ sinyaller: ['RSI Seviyesi'], direction: 'asagi' }));
    assert.equal(rsi.find((x) => x.id === 'rsi-lvl')!.tone, 'warn');
  });
});

describe('buildSummary', () => {
  it('pozitiflerden tek cümle üretir', () => {
    const r = deriveReasons(base({ sinyaller: ['Para Akışı Uyumsuzluğu'], smartMoneyPhase: 'smart_money_entered' }));
    const sum = buildSummary(r);
    assert.ok(sum.length > 0 && sum.endsWith('.'));
  });
  it('boş → nötr mesaj', () => {
    assert.ok(buildSummary([]).length > 0);
  });
});

// ── FAZ S2: FirsatItem adaptörü (3 ekranın ortak girişi) ────────────────────
describe('firsatToInput / firsatReasons — S2 adaptörü', () => {
  const firsat = (over: Partial<FirsatLike> = {}): FirsatLike => ({
    sinyaller: [], direction: 'yukari', ...over,
  });

  it('FirsatItem alanlarını doğru eşler (hacim · haftalık · sektör · combo)', () => {
    const inp = firsatToInput(firsat({
      sinyaller: ['Trend Başlangıcı'],
      relVol5: 2.4,
      weeklyAligned: true,
      adjustments: { sectorAlign: 5, kapEvent: 0 },
      combo: { members: ['A', 'B'], n: 30, winRate: 68 },
    }));
    assert.equal(inp.relVol5, 2.4);
    assert.equal(inp.weeklyAligned, true);
    assert.equal(inp.sectorAlign, 5);
    assert.equal(inp.combo?.winRate, 68);
    assert.equal(inp.kapEvent, false);
  });

  it('kapEvent hem adjustments hem kapUyarisi’ndan türetilir', () => {
    assert.equal(firsatToInput(firsat({ adjustments: { sectorAlign: 0, kapEvent: -10 } })).kapEvent, true);
    assert.equal(firsatToInput(firsat({ kapUyarisi: { var: true } })).kapEvent, true);
    assert.equal(firsatToInput(firsat()).kapEvent, false);
  });

  it('firsatReasons maks 4 döndürür ve uyarıyı korur', () => {
    const rs = firsatReasons(firsat({
      sinyaller: ['Para Akışı Uyumsuzluğu', 'Trend Başlangıcı', 'Destek/Direnç Kırılımı', 'Altın Çapraz'],
      relVol5: 3, weeklyAligned: true,
      earningsRisk: { verdict: 'zayıf', financeBurden: true, redFlag: null },
    }));
    assert.ok(rs.length <= 4);
    assert.ok(rs.some((r) => r.tone === 'warn'), 'uyarı gerekçesi kayboldu');
  });

  it('gerekçesiz fırsat boş dizi döndürür (kart özet cümleye düşer)', () => {
    assert.deepEqual(firsatReasons(firsat()), []);
  });
});
