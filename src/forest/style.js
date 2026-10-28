// The forest's palette (painted colour, kept dark): deep green-black up close, fading to grey-green haze and a dim
// ochre sky in the distance, with a weak warm light catching the edges that face it. Everything that paints reads `S`.
// Layer tones go far to near; `ink` is the play plane (ground, boy, creatures), `front` the blurred foreground.
export const S = {
  sky: ['#0d1b22', '#2f4946', '#7d7a5f', '#3e3c2f'], sun: '226,208,160',
  layers: ['#4f6a63', '#3a554b', '#284135', '#1a2f24', '#0f1e16'],
  ink: '#060b08', front: '#020403', mist: '150,160,146', mistAlpha: 0.5,
  fog: 0xaab3a4, fogAlpha: 0.55, shaft: 0xe6d6a8, dust: 0xeee2c0, bloom: 0xe0d2a8, flock: 0x2e3d37, puff: 0x7d7a66,
  leaf: 0x0a160e, pitFog: 0x56604f, pitTop: 0x121a14, pitDeep: 0x020403, dark: '2,5,3', vignette: 1.2, grain: 0.75,
  rim: 'rgba(236,196,126,0.6)', water: 0x05100c, waterHi: 0x9fa894,
};

export const hex = (css) => parseInt(css.slice(1), 16);
