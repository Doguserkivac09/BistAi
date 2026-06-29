/**
 * Özellik bayrakları (feature flags).
 *
 * ENABLE_US: ABD piyasası özellikleri (Apex-US, Aegis-US, US Future Scores, US tarama).
 * Şimdilik KAPALI — kod/dosya/tablolar duruyor ("ölü kod"), dışarıdan yokmuş gibi görünür.
 * Geri açmak için Vercel/ortam değişkeni: NEXT_PUBLIC_ENABLE_US=true (build-time inline).
 */
export const ENABLE_US = process.env.NEXT_PUBLIC_ENABLE_US === 'true'

/**
 * ENABLE_ECONOMIC_CALENDAR: Ekonomi Takvimi sayfası. Veri şu an hardcoded/bozuk
 * (gerçek API yok) → gizli. Gerçek veri kaynağı eklenince aç:
 * NEXT_PUBLIC_ENABLE_ECONOMIC_CALENDAR=true
 */
export const ENABLE_ECONOMIC_CALENDAR = process.env.NEXT_PUBLIC_ENABLE_ECONOMIC_CALENDAR === 'true'
