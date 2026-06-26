/**
 * Özellik bayrakları (feature flags).
 *
 * ENABLE_US: ABD piyasası özellikleri (Apex-US, Aegis-US, US Future Scores, US tarama).
 * Şimdilik KAPALI — kod/dosya/tablolar duruyor ("ölü kod"), dışarıdan yokmuş gibi görünür.
 * Geri açmak için Vercel/ortam değişkeni: NEXT_PUBLIC_ENABLE_US=true (build-time inline).
 */
export const ENABLE_US = process.env.NEXT_PUBLIC_ENABLE_US === 'true'
