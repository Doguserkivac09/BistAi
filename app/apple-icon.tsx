import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#0f0f1a',
          borderRadius: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: -2,
          }}
        >
          <span style={{ color: '#e2e8f0' }}>B</span>
          <span style={{ color: '#6366f1' }}>AI</span>
        </div>
        <div
          style={{
            marginTop: 8,
            width: 100,
            height: 4,
            background: '#6366f1',
            borderRadius: 2,
            opacity: 0.7,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
