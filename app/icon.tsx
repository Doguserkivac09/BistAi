import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: '#0f0f1a',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          fontSize: 14,
          fontWeight: 800,
          color: '#e2e8f0',
          letterSpacing: -0.5,
        }}
      >
        <span style={{ color: '#e2e8f0' }}>B</span>
        <span style={{ color: '#6366f1' }}>AI</span>
      </div>
    ),
    { ...size }
  );
}
