/**
 * E-posta gönderim servisi — Resend ile
 * Portföydeki hisselerde sinyal çıktığında kullanıcıya bildirim gönderir.
 */

import { Resend } from 'resend';
import type { StockSignal } from '@/types';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.RESEND_FROM ?? 'BistAI <bildirim@bistai.app>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bistai.vercel.app';

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
              BistAI · BIST Hisselerinde AI Destekli Analiz<br>
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
    const { error } = await resend.emails.send({
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
