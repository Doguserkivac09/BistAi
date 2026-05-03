/**
 * E-posta gönderim servisi — Resend ile
 * Portföydeki hisselerde sinyal çıktığında kullanıcıya bildirim gönderir.
 */

import { Resend } from 'resend';
import type { StockSignal } from '@/types';

// Lazy init — build sırasında env var olmayabilir, runtime'da oluştur
function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = process.env.RESEND_FROM ?? 'Investable Edge <bildirim@investableedge.app>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://investableedge.vercel.app';

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function severityLabel(s: string) {
  if (s === 'güçlü') return '🔴 Güçlü';
  if (s === 'orta')  return '🟡 Orta';
  return '⚪ Zayıf';
}

function directionLabel(d: string) {
  if (d === 'yukari') return '▲ Yukarı';
  if (d === 'asagi')  return '▼ Aşağı';
  return '→ Nötr';
}

function signalColor(d: string) {
  if (d === 'yukari') return '#10b981'; // yeşil
  if (d === 'asagi')  return '#ef4444'; // kırmızı
  return '#6b7280';
}

// ─── HTML Şablon ──────────────────────────────────────────────────────────────

function buildHtml(stocks: Array<{ sembol: string; signals: StockSignal[] }>) {
  const rows = stocks
    .flatMap(({ sembol, signals }) =>
      signals.map((sig) => `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a3a;font-weight:600;color:#e2e8f0;">
            ${sembol}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a3a;color:#94a3b8;">
            ${sig.type}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a3a;color:${signalColor(sig.direction)};">
            ${directionLabel(sig.direction)}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a3a;color:#94a3b8;">
            ${severityLabel(sig.severity)}
          </td>
        </tr>
      `)
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Logo -->
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#e2e8f0;">Bist<span style="color:#6366f1;">AI</span></span>
            </td>
          </tr>

          <!-- Başlık -->
          <tr>
            <td style="background:#1a1a2e;border-radius:16px 16px 0 0;padding:24px 32px 16px;border-bottom:1px solid #2a2a3a;">
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#e2e8f0;">
                📊 Portföyünde yeni sinyaller
              </h1>
              <p style="margin:8px 0 0;font-size:14px;color:#64748b;">
                Takip ettiğin hisseler için bugün sinyal tespit edildi.
              </p>
            </td>
          </tr>

          <!-- Tablo -->
          <tr>
            <td style="background:#1a1a2e;padding:0 0 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <thead>
                  <tr style="background:#141428;">
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:500;color:#475569;text-transform:uppercase;letter-spacing:.05em;">Hisse</th>
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:500;color:#475569;text-transform:uppercase;letter-spacing:.05em;">Sinyal</th>
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:500;color:#475569;text-transform:uppercase;letter-spacing:.05em;">Yön</th>
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:500;color:#475569;text-transform:uppercase;letter-spacing:.05em;">Güç</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background:#1a1a2e;border-radius:0 0 16px 16px;padding:24px 32px;">
              <a href="${APP_URL}/portfolyo"
                 style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
                Portföyümü Görüntüle →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0;text-align:center;font-size:12px;color:#374151;">
              Investable Edge · BIST Hisselerinde AI Destekli Analiz<br>
              <a href="${APP_URL}/portfolyo" style="color:#6366f1;text-decoration:none;">Bildirimleri yönet</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Formasyon Bildirimi HTML ─────────────────────────────────────────────────

const FORMATION_TYPES = new Set([
  'Çift Dip', 'Çift Tepe', 'Bull Flag', 'Bear Flag',
  'Cup & Handle', 'Ters Omuz-Baş-Omuz', 'Yükselen Üçgen',
]);

function formatFormationDetail(sig: StockSignal): string {
  const d = sig.data as Record<string, number | string> | undefined;
  if (!d) return '';
  const parts: string[] = [];
  if (typeof d.neckline   === 'number') parts.push(`Boyun: ${d.neckline.toFixed(2)}₺`);
  if (typeof d.resistance === 'number') parts.push(`Direnç: ${d.resistance.toFixed(2)}₺`);
  if (typeof d.handleHigh === 'number') parts.push(`Kırılım: ${d.handleHigh.toFixed(2)}₺`);
  if (typeof d.cupDepthPct === 'number') parts.push(`Kupa derinliği: %${d.cupDepthPct}`);
  if (typeof d.flagpoleDrop === 'number') parts.push(`Bayrak direği: %${d.flagpoleDrop} düşüş`);
  if (typeof d.headDepthPct === 'number') parts.push(`Baş derinliği: %${d.headDepthPct}`);
  return parts.length > 0 ? parts.join(' · ') : '';
}

interface FormationGroup {
  sembol: string;
  signal: StockSignal;
  stage: 'kırılım' | 'oluşum';
  currentPrice?: number;
}

function buildFormationHtml(
  groups: FormationGroup[],
  isBreakout: boolean,
): string {
  const stageLabel  = isBreakout ? '🚨 KIRILIM' : '📐 OLUŞUM';
  const stageColor  = isBreakout ? '#ef4444' : '#f59e0b';
  const headerText  = isBreakout
    ? 'Formasyon kırılımı tespit edildi'
    : 'Formasyon oluşum aşamasında';
  const subText     = isBreakout
    ? 'Fiyat breakout seviyesini geçti — aksiyon zamanı olabilir.'
    : 'Formasyon henüz oluşum aşamasında. Kırılım teyidini bekle.';

  const rows = groups.map(({ sembol, signal, currentPrice }) => {
    const detail     = formatFormationDetail(signal);
    const detailHtml = detail
      ? `<br><span style="font-size:11px;color:#64748b;">${detail}</span>`
      : '';
    const priceHtml  = currentPrice
      ? `<span style="color:#e2e8f0;font-weight:600;">${currentPrice.toFixed(2)}₺</span>`
      : '—';
    const dirColor   = signal.direction === 'yukari' ? '#10b981' : signal.direction === 'asagi' ? '#ef4444' : '#6b7280';
    const detailLink = `${APP_URL}/hisse/${encodeURIComponent(sembol)}`;

    return `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #2a2a3a;vertical-align:top;">
          <a href="${detailLink}" style="color:#818cf8;text-decoration:none;font-weight:700;font-size:16px;">
            ${sembol}
          </a>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #2a2a3a;vertical-align:top;">
          <span style="background:${stageColor}22;color:${stageColor};border:1px solid ${stageColor}55;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;">
            ${stageLabel}
          </span>
          <br>
          <span style="color:#94a3b8;font-size:13px;">${signal.type}</span>
          ${detailHtml}
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #2a2a3a;color:${dirColor};font-weight:600;white-space:nowrap;">
          ${directionLabel(signal.direction)}
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #2a2a3a;color:#94a3b8;white-space:nowrap;">
          ${priceHtml}
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Logo -->
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#e2e8f0;">Bist<span style="color:#6366f1;">AI</span></span>
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;border-radius:16px 16px 0 0;padding:24px 32px 16px;border-bottom:3px solid ${stageColor};">
              <h1 style="margin:0;font-size:20px;font-weight:700;color:#e2e8f0;">
                ${stageLabel} — ${headerText}
              </h1>
              <p style="margin:8px 0 0;font-size:14px;color:#64748b;">
                ${subText}
              </p>
            </td>
          </tr>

          <!-- Tablo -->
          <tr>
            <td style="background:#1a1a2e;padding:0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <thead>
                  <tr style="background:#141428;">
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:500;color:#475569;text-transform:uppercase;letter-spacing:.05em;">Hisse</th>
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:500;color:#475569;text-transform:uppercase;letter-spacing:.05em;">Formasyon</th>
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:500;color:#475569;text-transform:uppercase;letter-spacing:.05em;">Yön</th>
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:500;color:#475569;text-transform:uppercase;letter-spacing:.05em;">Fiyat</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </td>
          </tr>

          <!-- Uyarı (oluşum için) -->
          ${!isBreakout ? `
          <tr>
            <td style="background:#1a1a2e;padding:16px 32px;">
              <div style="background:#92400e22;border:1px solid #f59e0b44;border-radius:8px;padding:12px 16px;">
                <p style="margin:0;font-size:12px;color:#d97706;">
                  ⚠️ <strong>Oluşum Aşaması:</strong> Formasyon henüz tamamlanmadı.
                  Kırılım teyidini beklemek daha güvenlidir.
                  Kırılım gerçekleştiğinde ayrıca bildirim alacaksın.
                </p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- CTA -->
          <tr>
            <td style="background:#1a1a2e;border-radius:0 0 16px 16px;padding:24px 32px;">
              <a href="${APP_URL}/firsatlar"
                 style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-right:12px;">
                Fırsatları Gör →
              </a>
              <a href="${APP_URL}/tarama"
                 style="display:inline-block;border:1px solid #4b5563;color:#9ca3af;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;">
                Taramaya Git
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0;text-align:center;font-size:12px;color:#374151;">
              BistAI · BIST Hisselerinde AI Destekli Analiz<br>
              <small>Yatırım tavsiyesi değildir. Veriler ~15 dk gecikmeli.</small>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Dışa açık fonksiyon ──────────────────────────────────────────────────────

export async function sendSignalAlert(params: {
  to: string;
  stocks: Array<{ sembol: string; signals: StockSignal[] }>;
}): Promise<{ success: boolean; error?: string }> {
  const { to, stocks } = params;

  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY eksik, e-posta gönderilemedi.');
    return { success: false, error: 'RESEND_API_KEY eksik' };
  }

  const totalSignals = stocks.reduce((s, x) => s + x.signals.length, 0);
  const symbols = stocks.map((x) => x.sembol).join(', ');

  try {
    const { error } = await getResend().emails.send({
      from: FROM,
      to,
      subject: `📊 ${symbols} — ${totalSignals} yeni sinyal`,
      html: buildHtml(stocks),
    });

    if (error) {
      console.error('[email] Resend hatası:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email] Gönderim hatası:', msg);
    return { success: false, error: msg };
  }
}

// ─── Formasyon özel bildirim ──────────────────────────────────────────────────

/**
 * Formasyon kırılım / oluşum bildirimi.
 * Klasik sinyal email'inden ayrı template ile gönderilir.
 * stage='kırılım' → yüksek öncelikli 🚨, stage='oluşum' → bilgilendirici 📐
 */
export async function sendFormationAlert(params: {
  to: string;
  groups: FormationGroup[];
  stage: 'kırılım' | 'oluşum';
}): Promise<{ success: boolean; error?: string }> {
  const { to, groups, stage } = params;

  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY eksik, formasyon maili gönderilemedi.');
    return { success: false, error: 'RESEND_API_KEY eksik' };
  }
  if (!groups.length) return { success: true };

  const isBreakout = stage === 'kırılım';
  const symbols = [...new Set(groups.map((g) => g.sembol))].join(', ');
  const prefix = isBreakout ? '🚨 KIRILIM' : '📐 Oluşum';
  const subject = `${prefix} — ${symbols}`;

  try {
    const { error } = await getResend().emails.send({
      from: FROM,
      to,
      subject,
      html: buildFormationHtml(groups, isBreakout),
    });

    if (error) {
      console.error('[email] Formasyon bildirimi gönderilemedi:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email] Formasyon gönderim hatası:', msg);
    return { success: false, error: msg };
  }
}

/** Verilen sinyal bir formasyon mu? */
export function isFormationSignalEmail(type: string): boolean {
  return FORMATION_TYPES.has(type);
}

// FormationGroup tipini export
export type { FormationGroup };
