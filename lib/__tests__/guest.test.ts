/**
 * Misafir (anonim) oturum yardımcıları — birim testleri.
 * Kritik: normal kullanıcı YANLIŞLIKLA misafir sayılmamalı (AI'ı kaybederdi),
 * misafir de gözden kaçmamalı (maliyet koruması delinirdi).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isGuestUser, GUEST_SIGNUP_METADATA, GUEST_BLOCKED_MESSAGE } from '../guest';

describe('isGuestUser', () => {
  it('is_anonymous:true → misafir', () => {
    assert.equal(isGuestUser({ is_anonymous: true }), true);
  });

  it('eski istemci yedeği: app_metadata.provider = anonymous', () => {
    assert.equal(isGuestUser({ app_metadata: { provider: 'anonymous' } }), true);
  });

  it('normal kullanıcı misafir DEĞİL (e-posta/Google girişleri)', () => {
    assert.equal(isGuestUser({ is_anonymous: false, app_metadata: { provider: 'email' } }), false);
    assert.equal(isGuestUser({ app_metadata: { provider: 'google' } }), false);
    assert.equal(isGuestUser({}), false);
  });

  it('oturum yoksa misafir sayılmaz (401 yolu ayrıdır)', () => {
    assert.equal(isGuestUser(null), false);
    assert.equal(isGuestUser(undefined), false);
  });
});

describe('misafir metadata', () => {
  it('onboarding ATLANIR — tanıtımda sürtünme istemiyoruz', () => {
    assert.equal(GUEST_SIGNUP_METADATA.onboarded, true);
    assert.equal(GUEST_SIGNUP_METADATA.guest, true);
  });

  it('engel mesajı kayıt yolunu gösterir (ölü uç değil)', () => {
    assert.match(GUEST_BLOCKED_MESSAGE, /hesap oluştur/i);
  });
});
