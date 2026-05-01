// PlaylistTransfer — Shared UI Components
// All components are theme-aware: they take a `t` prop (the theme object).

// ─────────── Texture / Grain background overlay ───────────
function Grain({ t, opacity }) {
  const op = opacity ?? t.grain;
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
      opacity: op,
      mixBlendMode: t.bg && t.bg.startsWith('#0') ? 'screen' : 'multiply',
      zIndex: 1,
    }} />
  );
}

// ─────────── Album art placeholder (gradient + sleeve) ───────────
function Sleeve({ seed = 0, size = 56, t, ring = false, label }) {
  // Deterministic pseudo-random palette per seed
  const palettes = [
    ['#C8531A', '#F4ECDD', '#1A1411'],   // burnt orange
    ['#1DB954', '#0E0D11', '#F4ECDD'],   // green/black
    ['#FA243C', '#FBE6BD', '#1A1411'],   // red/cream
    ['#2E5BBA', '#E8D9B8', '#1A1411'],   // blue/cream
    ['#7A3FBF', '#F4ECDD', '#1A1411'],   // purple
    ['#B86A1F', '#1A1411', '#F4ECDD'],   // ochre
    ['#0E5C4A', '#FBE6BD', '#1A1411'],   // forest
    ['#A8331A', '#F4ECDD', '#1A1411'],   // brick
    ['#1A1411', '#C8531A', '#F4ECDD'],   // dark
    ['#FBE6BD', '#A8331A', '#1A1411'],   // butter
  ];
  const p = palettes[Math.abs(seed) % palettes.length];
  const angle = (seed * 47) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: 4,
      background: `linear-gradient(${angle}deg, ${p[0]}, ${p[1]} 60%, ${p[2]})`,
      position: 'relative', overflow: 'hidden', flexShrink: 0,
      boxShadow: ring
        ? `0 0 0 1px ${t.line}, 0 6px 14px rgba(0,0,0,0.18)`
        : '0 1px 3px rgba(0,0,0,0.18), inset 0 0 0 0.5px rgba(255,255,255,0.12)',
    }}>
      {/* fake sleeve detail — circle for vinyl peeking out */}
      <div style={{
        position: 'absolute', right: -size * 0.18, top: '50%',
        transform: 'translateY(-50%)',
        width: size * 0.55, height: size * 0.55,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, #2a2520 0%, #0a0808 70%)`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
        opacity: 0.85,
      }} />
      {label && (
        <div style={{
          position: 'absolute', left: 6, bottom: 5,
          fontFamily: t.fontMono, fontSize: 8, fontWeight: 600,
          color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5,
          textTransform: 'uppercase', mixBlendMode: 'difference',
        }}>{label}</div>
      )}
    </div>
  );
}

// ─────────── Service mark (S = source, A = dest) ───────────
function ServiceMark({ kind, t, size = 18 }) {
  // kind: 'spotify' (green circle w/ waves) or 'apple' (red square w/ note)
  const isSpot = kind === 'spotify';
  const color = isSpot ? t.source : t.dest;
  return (
    <div style={{
      width: size, height: size, borderRadius: isSpot ? '50%' : size * 0.22,
      background: color, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {isSpot ? (
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12">
          <path d="M2 4.5 Q6 3 10 4.5" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          <path d="M2.5 6.5 Q6 5.2 9.5 6.5" stroke="#fff" strokeWidth="1.1" fill="none" strokeLinecap="round"/>
          <path d="M3 8.3 Q6 7.3 9 8.3" stroke="#fff" strokeWidth="1" fill="none" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 10 10">
          <circle cx="3.5" cy="7" r="1.5" fill="#fff"/>
          <path d="M5 7 V2.2 L9 1.2 V6" stroke="#fff" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="7.5" cy="6" r="1.5" fill="#fff"/>
        </svg>
      )}
    </div>
  );
}

// ─────────── Status pill ───────────
function StatusPill({ status, t, small = false }) {
  const map = {
    ready:   { bg: t.sourceSoft, fg: t.source, dot: t.source, label: 'Ready' },
    review:  { bg: 'rgba(184,106,31,0.14)', fg: t.warn, dot: t.warn, label: 'Review' },
    missing: { bg: 'rgba(168,51,26,0.12)',  fg: t.danger, dot: t.danger, label: 'Missing' },
  };
  const s = map[status];
  const pad = small ? '2px 7px' : '4px 10px';
  const fs = small ? 10 : 11;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.fg,
      padding: pad, borderRadius: 999,
      fontFamily: t.fontMono, fontSize: fs, fontWeight: 600,
      letterSpacing: 0.5, textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />
      {s.label}
    </div>
  );
}

// ─────────── Card ───────────
function Card({ t, children, style, inset = false, padding = 16 }) {
  return (
    <div style={{
      background: inset ? t.bgInset : t.bgElev,
      borderRadius: t.radius,
      boxShadow: inset ? 'none' : t.shadow,
      border: inset ? `1px solid ${t.line}` : `1px solid ${t.line}`,
      padding,
      ...style,
    }}>{children}</div>
  );
}

// ─────────── Button ───────────
function Button({ t, children, variant = 'primary', icon, full = true, disabled = false, style }) {
  const variants = {
    primary: { bg: t.ink, fg: t.bg, border: t.ink },
    source:  { bg: t.source, fg: '#fff', border: t.source },
    dest:    { bg: t.dest, fg: '#fff', border: t.dest },
    ghost:   { bg: 'transparent', fg: t.ink, border: t.lineStrong },
    soft:    { bg: t.bgInset, fg: t.ink, border: t.line },
  };
  const v = variants[variant];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      width: full ? '100%' : 'auto',
      height: 54, borderRadius: 999,
      background: v.bg, color: v.fg, border: `1px solid ${v.border}`,
      fontFamily: t.fontBody, fontSize: 16, fontWeight: 600,
      letterSpacing: -0.1,
      opacity: disabled ? 0.4 : 1,
      boxShadow: variant === 'ghost' || variant === 'soft' ? 'none' : '0 2px 0 rgba(0,0,0,0.08), 0 8px 18px rgba(0,0,0,0.12)',
      ...style,
    }}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

// ─────────── Section heading (label) ───────────
function Eyebrow({ t, children, color }) {
  return (
    <div style={{
      fontFamily: t.fontMono, fontSize: 11, fontWeight: 600,
      letterSpacing: 0.8, textTransform: 'uppercase',
      color: color ?? t.inkMuted,
    }}>{children}</div>
  );
}

// ─────────── Display heading ───────────
function Display({ t, children, size = 36, italic, style }) {
  return (
    <div style={{
      fontFamily: t.fontDisplay,
      fontWeight: t.displayWeight,
      fontStyle: italic ?? t.displayItalic ? 'italic' : 'normal',
      fontSize: size, lineHeight: 1.05, letterSpacing: -0.02 * size,
      color: t.ink,
      ...style,
    }}>{children}</div>
  );
}

// ─────────── Track row (for match report) ───────────
function TrackRow({ t, track, expanded, dense }) {
  const padV = dense ? 10 : 14;
  return (
    <div style={{
      padding: `${padV}px 14px`,
      borderBottom: `1px solid ${t.line}`,
      background: 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Sleeve t={t} seed={track.id * 13} size={dense ? 38 : 44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: t.fontBody, fontSize: 15, fontWeight: 600, color: t.ink,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{track.title}</div>
          <div style={{
            fontFamily: t.fontBody, fontSize: 13, color: t.inkMuted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginTop: 2,
          }}>{track.artist} · {track.album}</div>
        </div>
        <StatusPill status={track.status} t={t} small={dense} />
      </div>
      {expanded && track.candidate && (
        <div style={{
          marginTop: 10, marginLeft: dense ? 50 : 56,
          paddingLeft: 12, borderLeft: `2px solid ${track.status === 'missing' ? t.danger : t.warn}`,
        }}>
          <div style={{
            fontFamily: t.fontMono, fontSize: 10, fontWeight: 600,
            color: track.status === 'missing' ? t.danger : t.warn,
            textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
          }}>
            {track.status === 'missing' ? 'No match found' : 'Suggested match'}
          </div>
          {track.candidate.title && (
            <div style={{ fontFamily: t.fontBody, fontSize: 14, fontWeight: 600, color: t.ink }}>
              {track.candidate.title} — {track.candidate.artist}
            </div>
          )}
          <div style={{ fontFamily: t.fontBody, fontSize: 12, color: t.inkSoft, marginTop: 3, lineHeight: 1.45 }}>
            {track.candidate.note}
          </div>
          {track.status === 'review' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div style={{
                padding: '6px 12px', borderRadius: 999,
                background: t.source, color: '#fff',
                fontFamily: t.fontBody, fontSize: 12, fontWeight: 600,
              }}>Approve</div>
              <div style={{
                padding: '6px 12px', borderRadius: 999,
                background: 'transparent', color: t.ink,
                border: `1px solid ${t.lineStrong}`,
                fontFamily: t.fontBody, fontSize: 12, fontWeight: 600,
              }}>See alternatives</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────── Stat tile ───────────
function StatTile({ t, label, value, accent, sublabel }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: t.bgElev, borderRadius: 14,
      border: `1px solid ${t.line}`,
      padding: '12px 12px 14px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        fontFamily: t.fontMono, fontSize: 9, fontWeight: 600,
        letterSpacing: 0.7, textTransform: 'uppercase',
        color: t.inkMuted, marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontFamily: t.fontDisplay, fontSize: 30,
        fontWeight: t.displayWeight,
        fontStyle: t.displayItalic ? 'italic' : 'normal',
        color: accent ?? t.ink, lineHeight: 1, letterSpacing: -0.6,
      }}>{value}</div>
      {sublabel && (
        <div style={{
          fontFamily: t.fontBody, fontSize: 11, color: t.inkMuted,
          marginTop: 4,
        }}>{sublabel}</div>
      )}
    </div>
  );
}

// ─────────── Vinyl record ───────────
function Vinyl({ t, size = 200, label = 'A SIDE' }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', position: 'relative',
      background: 'radial-gradient(circle at 30% 30%, #2a2520 0%, #0a0807 75%, #050403 100%)',
      boxShadow: '0 20px 50px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.04)',
    }}>
      {/* grooves */}
      {[0.95, 0.88, 0.81, 0.74, 0.67, 0.60, 0.53, 0.46].map((r, i) => (
        <div key={i} style={{
          position: 'absolute', inset: `${(1 - r) * 50}%`,
          borderRadius: '50%',
          border: `1px solid rgba(255,255,255,${0.025 + (i % 2) * 0.015})`,
        }} />
      ))}
      {/* center label */}
      <div style={{
        position: 'absolute', inset: '32%', borderRadius: '50%',
        background: `radial-gradient(circle, ${t.dest} 0%, ${t.accent} 60%, #6b2a14 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          width: '90%', height: '90%', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <div style={{
            fontFamily: t.fontMono, fontSize: size * 0.05, fontWeight: 700,
            color: 'rgba(255,255,255,0.85)', letterSpacing: 1.5, textTransform: 'uppercase',
          }}>{label}</div>
          <div style={{
            width: size * 0.055, height: size * 0.055, borderRadius: '50%',
            background: '#000', marginTop: size * 0.04,
            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2)',
          }} />
        </div>
      </div>
    </div>
  );
}

// ─────────── Big sleeve / cover for preview screens ───────────
function BigSleeve({ t, size = 240, palette }) {
  const p = palette || [t.accent, t.source, t.dest];
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, position: 'relative',
      overflow: 'hidden', flexShrink: 0,
      boxShadow: '0 30px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.08)',
    }}>
      {/* gradient bg */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(135deg, ${p[0]}, ${p[1]} 55%, ${p[2]})`,
      }} />
      {/* sun arcs (mixtape art) */}
      {[0.85, 0.70, 0.55, 0.40, 0.25].map((r, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: '50%', bottom: '-30%',
          width: size * r, height: size * r,
          marginLeft: -size * r / 2,
          borderRadius: '50%',
          background: `rgba(255,255,255,${0.05 + i * 0.03})`,
          mixBlendMode: 'overlay',
        }} />
      ))}
      {/* vinyl peeking out the right */}
      <div style={{
        position: 'absolute', right: -size * 0.35, top: '50%',
        transform: 'translateY(-50%)',
        width: size * 0.95, height: size * 0.95, borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 30%, #1a1612 0%, #050403 75%)',
        opacity: 0.92,
      }}>
        <div style={{
          position: 'absolute', inset: '38%', borderRadius: '50%',
          background: t.dest,
        }} />
      </div>
      {/* subtle grain */}
      <Grain t={t} opacity={0.12} />
    </div>
  );
}

// ─────────── Progress bar ───────────
function Progress({ t, value, label, accent }) {
  return (
    <div>
      {label && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 8,
        }}>
          <div style={{ fontFamily: t.fontBody, fontSize: 14, color: t.inkSoft, fontWeight: 500 }}>
            {label}
          </div>
          <div style={{ fontFamily: t.fontMono, fontSize: 12, color: t.inkMuted, fontWeight: 600 }}>
            {Math.round(value)}%
          </div>
        </div>
      )}
      <div style={{
        height: 8, borderRadius: 999, background: t.bgInset,
        overflow: 'hidden', position: 'relative',
        border: `1px solid ${t.line}`,
      }}>
        <div style={{
          width: `${value}%`, height: '100%',
          background: accent ?? t.ink,
          borderRadius: 999,
          transition: 'width 0.4s',
        }} />
      </div>
    </div>
  );
}

Object.assign(window, {
  Grain, Sleeve, ServiceMark, StatusPill, Card, Button,
  Eyebrow, Display, TrackRow, StatTile, Vinyl, BigSleeve, Progress,
});
