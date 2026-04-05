/**
 * BIST sembollerini Yahoo Finance'de test eder.
 * Çalıştır: node scripts/test-bist-symbols.mjs
 */

// Mevcut listede olmayan potansiyel BIST sembolleri
const CANDIDATES = [
  // Bankacılık & Finans
  'ICBCT', 'GEDIK', 'GARFA', 'GSDHO', 'GSDDE', 'ISCTR', 'VAKFN',
  // Enerji & Altyapı
  'SASA', 'AYEN', 'AYCES', 'BIOEN', 'EUPWR', 'ZOREN', 'CWENE',
  // GYO
  'AKSGY', 'AKMGY', 'AKFGY', 'MRGYO', 'SNGYO', 'VKGYO', 'RYGYO',
  'DGGYO', 'NUGYO', 'EYGYO', 'MSGYO', 'DZGYO', 'FZLGY', 'OZKGY',
  'ISGYO', 'CSGYO', 'IDGYO',
  // Sanayi & Üretim
  'ASUZU', 'BFREN', 'DITAS', 'GOODY', 'OLMKS', 'ORKLK', 'PRKAB',
  'SKTAS', 'DMSAS', 'ERBOS', 'EMKEL', 'KAPLM', 'KNFRT',
  // Gıda & İçecek
  'BANVT', 'CUSAN', 'ERSU', 'AVOD', 'PINSU', 'ULUUN', 'NUHCM',
  'AEFES', 'KERVT', 'DOBUR',
  // Tekstil & Giyim
  'ATEKS', 'BOSSA', 'DESA', 'SKTAS', 'HATEK', 'KRPLA', 'USAK',
  // Kimya & İlaç
  'COSMO', 'ECZYT', 'IPMAT', 'KMPUR', 'SAMAT',
  // İnşaat & Çimento
  'ADANA', 'ADNAC', 'BSOKE', 'CMENT', 'NUHCM', 'BURCE',
  // Teknoloji & Telekom
  'ARDYZ', 'DGATE', 'DIRIT', 'FONET', 'INDES', 'INVEO', 'PKART',
  'PLTUR', 'RODRG', 'MOBTL', 'GLBMD',
  // Perakende & Hizmet
  'CRFSA', 'ARZUM', 'GRSEL', 'MRSHL', 'VAKKO', 'YATAS',
  // Medya & Eğitim
  'HURGZ', 'IHYAY', 'DNISI',
  // Ulaşım & Lojistik
  'AGHOL', 'HRKET', 'ONRYT',
  // Madencilik & Metal
  'BOLUC', 'CEMTS', 'DOKTA', 'GMTAS', 'LUKSK', 'LKMNH',
  // Diğer
  'ACSEL', 'AHGAZ', 'ALCTL', 'ALFAS', 'ALKA', 'BAKAB', 'BARMA',
  'BAYRK', 'BNTAS', 'BORLS', 'BRMEN', 'BVSAN', 'CANTE', 'CONSE',
  'DAPGM', 'DENGE', 'DERIM', 'DYOBY', 'EGSER', 'ELITE', 'EMNIS',
  'ESEN', 'FADE', 'FLAP', 'FORMT', 'GENIL', 'GEDZA', 'GLRYH',
  'GOLTS', 'GOZDE', 'GUNDG', 'HDFGS', 'HTTBT', 'HUNER', 'ICBCT',
  'IDGYO', 'IEYHO', 'IHEVA', 'IHGZT', 'IHLGM', 'IMASM', 'ISKPL',
  'ISKUR', 'ISYAT', 'ITTFH', 'IZFAS', 'KAPLM', 'KARFA', 'KARSA',
  'KENT', 'KLMSN', 'KUYAS', 'LIDFA', 'MAKTK', 'MEKAG', 'MEGES',
  'MIPAZ', 'MNVOL', 'NBORU', 'NTGAZ', 'NTHOL', 'OBAMS', 'PATEK',
  'PKART', 'POLHO', 'PRDGS', 'PRKME', 'PRZMA', 'PSDTC', 'PTOFS',
  'RODRG', 'ROYAL', 'RTALB', 'SAYAS', 'SEMAS', 'SEYKM', 'SNICA',
  'SNKRN', 'SNPAM', 'TRCAS', 'USAK', 'VAKFN', 'VERTU', 'VKING',
  'YEOTK', 'YGYO', 'YKSLN', 'YATAS',
];

const BATCH = 10;
const DELAY = 300;

async function testSymbol(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}.IS?range=5d&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BistAI/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price && price > 0 ? price : null;
  } catch {
    return null;
  }
}

const working = [];
const notFound = [];

console.log(`\n${CANDIDATES.length} sembol test ediliyor...\n`);

for (let i = 0; i < CANDIDATES.length; i += BATCH) {
  const batch = CANDIDATES.slice(i, i + BATCH);
  const results = await Promise.all(batch.map(async (sym) => ({ sym, price: await testSymbol(sym) })));

  for (const { sym, price } of results) {
    if (price) {
      working.push(sym);
      process.stdout.write(`✓ ${sym.padEnd(8)} ${price}\n`);
    }
  }

  if (i + BATCH < CANDIDATES.length) {
    await new Promise(r => setTimeout(r, DELAY));
  }
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`✅ Çalışan: ${working.length} sembol`);
console.log(`❌ Yok: ${CANDIDATES.length - working.length} sembol`);
console.log(`\nBIST_SYMBOLS'e eklenebilecekler:\n`);
console.log(working.map(s => `'${s}'`).join(', '));
