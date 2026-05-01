// PlaylistTransfer — Design Tokens
// Three aesthetic themes, each tuned for a different mood but using
// the same semantic structure so screens are theme-agnostic.

const THEMES = {
  // ── 1. LATE NIGHT (PRIMARY) ───────────────────────────
  // Charcoal + neon-on-dark. Refined: deeper blacks, tighter contrast,
  // glow on accents but muted body. The product's headline aesthetic.
  night: {
    name: 'Late Night',
    bg: '#0A090C',
    bgElev: '#141318',
    bgInset: '#1C1A21',
    ink: '#F5F2EC',
    inkSoft: '#B8B2A6',
    inkMuted: '#6F6A5E',
    line: 'rgba(245,242,236,0.07)',
    lineStrong: 'rgba(245,242,236,0.14)',
    source: '#3DDC84',
    sourceSoft: 'rgba(61,220,132,0.14)',
    dest: '#FF4E6A',
    destSoft: 'rgba(255,78,106,0.14)',
    accent: '#E8B84A',
    warn: '#E8B84A',
    danger: '#FF6B5C',
    grain: 0.05,
    radius: 18,
    radiusLg: 28,
    shadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 28px rgba(0,0,0,0.5)',
    shadowLg: '0 1px 0 rgba(255,255,255,0.05) inset, 0 24px 60px rgba(0,0,0,0.6)',
    fontDisplay: '"Fraunces", "Times New Roman", serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
    displayWeight: 500,
    displayItalic: true,
    texture: 'noise',
  },

  // ── 2. STUDIO LIGHT ───────────────────────────────────
  // Apple Music-leaning light. Near-white, cool grays, system-y but with
  // a hint of warmth in the display serif so it's not a SaaS dashboard.
  studio: {
    name: 'Studio Light',
    bg: '#FBFBFD',          // near-white, cool
    bgElev: '#FFFFFF',      // pure white cards
    bgInset: '#F2F2F5',     // pressed-in
    ink: '#0B0B0D',         // true black
    inkSoft: '#3A3A3D',
    inkMuted: '#86868B',    // apple's secondary label
    line: 'rgba(11,11,13,0.08)',
    lineStrong: 'rgba(11,11,13,0.14)',
    source: '#1DB954',      // spotify green
    sourceSoft: 'rgba(29,185,84,0.10)',
    dest: '#FA243C',        // apple music pink/red
    destSoft: 'rgba(250,36,60,0.08)',
    accent: '#FA243C',
    warn: '#B86A1F',
    danger: '#D43A2F',
    grain: 0.0,             // clean — no texture
    radius: 16,
    radiusLg: 22,
    shadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(11,11,13,0.06)',
    shadowLg: '0 4px 12px rgba(0,0,0,0.05), 0 20px 50px rgba(11,11,13,0.10)',
    fontDisplay: '"Fraunces", "Times New Roman", serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
    displayWeight: 500,
    displayItalic: true,
    texture: 'none',
  },
};

// Semantic spacing scale (px)
const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 };

// Type ramp (px)
const TYPE = {
  display: { size: 40, line: 1.05, weight: 'display', tracking: -0.02 },
  title:   { size: 28, line: 1.15, weight: 'display', tracking: -0.01 },
  h1:      { size: 22, line: 1.25, weight: 700, tracking: -0.01 },
  h2:      { size: 17, line: 1.3,  weight: 600, tracking: 0 },
  body:    { size: 15, line: 1.4,  weight: 400, tracking: 0 },
  small:   { size: 13, line: 1.35, weight: 500, tracking: 0 },
  micro:   { size: 11, line: 1.3,  weight: 600, tracking: 0.04, upper: true },
  mono:    { size: 13, line: 1.3,  weight: 500, tracking: 0, mono: true },
};

// Mock playlist data — used across all screens
const MOCK_PLAYLIST = {
  name: 'sunday morning kitchen',
  owner: 'maya',
  trackCount: 47,
  duration: '3 hr 12 min',
  cover: ['#C8531A', '#1DB954', '#1A1411'],
  tracks: [
    { id:1, title:'Harvest Moon', artist:'Neil Young', album:'Harvest Moon', status:'ready', confidence:99 },
    { id:2, title:'Redbone', artist:'Childish Gambino', album:'Awaken, My Love!', status:'ready', confidence:100 },
    { id:3, title:'Lovely Day', artist:'Bill Withers', album:"Menagerie", status:'ready', confidence:100 },
    { id:4, title:'The Night We Met', artist:'Lord Huron', album:'Strange Trails', status:'ready', confidence:99 },
    { id:5, title:'Skinny Love (Live)', artist:'Bon Iver', album:'Bonnaroo \'09', status:'review', confidence:74,
      candidate: { title:'Skinny Love', artist:'Bon Iver', album:'For Emma, Forever Ago', note:'Live version not on Apple Music — studio version found' } },
    { id:6, title:'Dreams', artist:'Fleetwood Mac', album:'Rumours', status:'ready', confidence:100 },
    { id:7, title:'Tiny Dancer', artist:'Elton John', album:'Madman Across the Water', status:'ready', confidence:100 },
    { id:8, title:'July (demo)', artist:'Noah Cyrus', album:'Self-titled', status:'review', confidence:62,
      candidate: { title:'July', artist:'Noah Cyrus', album:'THE END OF EVERYTHING', note:'Demo version unavailable — found album cut' } },
    { id:9, title:'Vienna', artist:'Billy Joel', album:'The Stranger', status:'ready', confidence:100 },
    { id:10, title:'Dog Days Are Over', artist:'Florence + the Machine', album:'Lungs', status:'ready', confidence:100 },
    { id:11, title:'Pink Moon', artist:'Nick Drake', album:'Pink Moon', status:'ready', confidence:100 },
    { id:12, title:'Untitled bootleg #4', artist:'Various', album:'unknown', status:'missing', confidence:0,
      candidate: { note:'No confident match — track is a bootleg not in Apple Music catalog' } },
    { id:13, title:'These Days', artist:'Nico', album:'Chelsea Girl', status:'ready', confidence:100 },
    { id:14, title:'Sunday Morning', artist:'The Velvet Underground', album:'The Velvet Underground & Nico', status:'ready', confidence:100 },
  ],
};

const MATCH_STATS = {
  ready: 41,
  review: 4,
  missing: 2,
  total: 47,
  percent: 87,
};

window.THEMES = THEMES;
window.SPACE = SPACE;
window.TYPE = TYPE;
window.MOCK_PLAYLIST = MOCK_PLAYLIST;
window.MATCH_STATS = MATCH_STATS;
