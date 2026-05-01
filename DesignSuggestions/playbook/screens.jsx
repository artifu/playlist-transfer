// PlaylistTransfer — Screen Components
// Each screen is a function that returns iOS-frame content.
// All take { t } (theme); some take state.

// ════════════════════════════════════════════════════════════
// 0. ONBOARDING — Connect Apple Music
// ════════════════════════════════════════════════════════════
function ScreenOnboarding({ t }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg,
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <Grain t={t} />
      {/* Hero gradient sleeve top */}
      <div style={{
        height: 320, position: 'relative', overflow: 'hidden',
        background: `linear-gradient(160deg, ${t.dest} 0%, ${t.accent} 55%, ${t.source} 130%)`,
      }}>
        <Grain t={t} opacity={0.15} />
        {/* arcs */}
        {[0.95, 0.78, 0.61, 0.44].map((r, i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', bottom: '-40%',
            width: 402 * r, height: 402 * r,
            marginLeft: -402 * r / 2,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            mixBlendMode: 'overlay',
          }} />
        ))}
        {/* big "PT" mark */}
        <div style={{
          position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          width: 96, height: 96, borderRadius: 14,
          background: t.bgElev,
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 2,
        }}>
          <div style={{
            fontFamily: t.fontDisplay, fontSize: 38,
            fontWeight: t.displayWeight, fontStyle: 'italic',
            color: t.ink, lineHeight: 1, letterSpacing: -1,
          }}>pt</div>
          <div style={{
            width: 32, height: 2, background: t.dest, borderRadius: 1,
          }} />
        </div>
        {/* tagline */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 24,
          textAlign: 'center', padding: '0 32px',
        }}>
          <div style={{
            fontFamily: t.fontMono, fontSize: 11, fontWeight: 600,
            color: 'rgba(255,255,255,0.85)', letterSpacing: 1.5,
            textTransform: 'uppercase',
          }}>Side A → Side B</div>
        </div>
      </div>

      {/* content */}
      <div style={{ flex: 1, padding: '28px 24px 24px', display: 'flex', flexDirection: 'column' }}>
        <Display t={t} size={32} style={{ marginBottom: 10 }}>
          Move your crate
          <br/>from Spotify to Apple Music.
        </Display>
        <div style={{
          fontFamily: t.fontBody, fontSize: 15, color: t.inkSoft, lineHeight: 1.45,
          marginBottom: 24,
        }}>
          Paste a public Spotify playlist link. We'll match every track to Apple Music
          and show you exactly what transfers before you commit.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 'auto' }}>
          {[
            { n: '01', t: 'Paste a Spotify link' },
            { n: '02', t: 'Review every match' },
            { n: '03', t: 'Create the playlist' },
          ].map((row, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderRadius: 14,
              background: t.bgElev, border: `1px solid ${t.line}`,
            }}>
              <div style={{
                fontFamily: t.fontMono, fontSize: 11, fontWeight: 700,
                color: t.inkMuted, letterSpacing: 0.5,
              }}>{row.n}</div>
              <div style={{
                fontFamily: t.fontBody, fontSize: 15, fontWeight: 600, color: t.ink,
              }}>{row.t}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <Button t={t} variant="dest" icon={<ServiceMark kind="apple" t={t} size={18} />}>
            Connect Apple Music
          </Button>
          <div style={{
            textAlign: 'center', marginTop: 14,
            fontFamily: t.fontBody, fontSize: 12, color: t.inkMuted,
          }}>
            We never see your password. Auth happens via Apple.
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 1. PASTE LINK — Home
// ════════════════════════════════════════════════════════════
function ScreenPaste({ t }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <Grain t={t} />
      <div style={{ padding: '70px 24px 0', position: 'relative', zIndex: 2 }}>
        {/* top tag */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: t.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: t.fontDisplay, fontStyle: 'italic',
              color: t.bg, fontSize: 16, fontWeight: t.displayWeight,
            }}>pt</div>
            <Eyebrow t={t}>Playlist Transfer</Eyebrow>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: t.fontMono, fontSize: 11, fontWeight: 600,
            color: t.inkMuted, letterSpacing: 0.5,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.source }} />
            CONNECTED
          </div>
        </div>

        {/* hero */}
        <Display t={t} size={38} style={{ marginBottom: 14 }}>
          Drop a link.<br/>
          <span style={{ color: t.inkMuted }}>We'll do the digging.</span>
        </Display>
        <div style={{
          fontFamily: t.fontBody, fontSize: 15, color: t.inkSoft,
          lineHeight: 1.45, marginBottom: 28,
        }}>
          Move public Spotify playlists into Apple Music — tracks, order, all of it.
        </div>

        {/* paste field */}
        <div style={{
          background: t.bgInset, borderRadius: 16,
          border: `1.5px solid ${t.lineStrong}`,
          padding: '14px 16px', marginBottom: 14,
          position: 'relative',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          }}>
            <ServiceMark kind="spotify" t={t} size={16} />
            <Eyebrow t={t} color={t.source}>Spotify Playlist URL</Eyebrow>
          </div>
          <div style={{
            fontFamily: t.fontMono, fontSize: 13, color: t.ink,
            wordBreak: 'break-all', lineHeight: 1.4,
          }}>
            open.spotify.com/playlist/<span style={{ color: t.inkMuted }}>37i9dQZF1DX...</span>
            <span style={{
              display: 'inline-block', width: 1.5, height: 14, background: t.ink,
              marginLeft: 1, verticalAlign: -2,
            }} />
          </div>
        </div>

        {/* paste from clipboard chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 999,
          background: t.bgElev, border: `1px solid ${t.line}`,
          marginBottom: 28,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="2" y="3" width="8" height="8" rx="1.5" stroke={t.inkSoft} strokeWidth="1.2"/>
            <rect x="4" y="1" width="4" height="2.5" rx="0.5" fill={t.inkSoft}/>
          </svg>
          <span style={{
            fontFamily: t.fontBody, fontSize: 12, fontWeight: 600, color: t.inkSoft,
          }}>Paste from clipboard</span>
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '0 24px 32px', position: 'relative', zIndex: 2 }}>
        <Button t={t} variant="primary" icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10m0 0L8.5 3.5M13 8l-4.5 4.5" stroke={t.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        }>
          Transfer to Apple Music
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 2. PLAYLIST PREVIEW
// ════════════════════════════════════════════════════════════
function ScreenPreview({ t }) {
  const pl = MOCK_PLAYLIST;
  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <Grain t={t} />
      <div style={{ padding: '60px 24px 0', position: 'relative', zIndex: 2 }}>
        {/* breadcrumb / step */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Eyebrow t={t} color={t.inkMuted}>Step 1 of 3</Eyebrow>
          </div>
          <div style={{
            fontFamily: t.fontBody, fontSize: 13, color: t.inkMuted, fontWeight: 500,
          }}>Cancel</div>
        </div>

        {/* eyebrow + title */}
        <Eyebrow t={t} color={t.source}>✓ We found your playlist</Eyebrow>
        <Display t={t} size={28} style={{ marginTop: 6, marginBottom: 24 }}>
          Here's what we'll be<br/>working with.
        </Display>

        {/* big card */}
        <div style={{
          background: t.bgElev, borderRadius: t.radiusLg,
          border: `1px solid ${t.line}`, boxShadow: t.shadowLg,
          padding: 18, marginBottom: 18,
        }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <BigSleeve t={t} size={104} palette={pl.cover} />
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <ServiceMark kind="spotify" t={t} size={13} />
                <span style={{
                  fontFamily: t.fontMono, fontSize: 10, fontWeight: 600,
                  color: t.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase',
                }}>Public Spotify Playlist</span>
              </div>
              <Display t={t} size={22} italic={true} style={{ marginBottom: 4 }}>
                {pl.name}
              </Display>
              <div style={{
                fontFamily: t.fontBody, fontSize: 13, color: t.inkSoft,
                marginBottom: 10,
              }}>by {pl.owner}</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: t.fontMono, fontSize: 11, fontWeight: 600,
                color: t.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase',
              }}>
                <span>{pl.trackCount} tracks</span>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: t.inkMuted }} />
                <span>{pl.duration}</span>
              </div>
            </div>
          </div>

          {/* destination preview */}
          <div style={{
            marginTop: 18, padding: '12px 14px',
            background: t.bgInset, borderRadius: 12,
            border: `1px dashed ${t.lineStrong}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ServiceMark kind="spotify" t={t} size={16} />
              <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
                <path d="M0 5h20m0 0L16 1m4 4l-4 4" stroke={t.inkMuted} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <ServiceMark kind="apple" t={t} size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: t.fontMono, fontSize: 9, fontWeight: 600,
                color: t.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase',
                marginBottom: 2,
              }}>Will create on Apple Music</div>
              <div style={{
                fontFamily: t.fontBody, fontSize: 13, fontWeight: 600, color: t.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{pl.name}</div>
            </div>
          </div>
        </div>

        {/* small preview tracks */}
        <Eyebrow t={t} style={{ marginBottom: 10 }}>First 3 tracks</Eyebrow>
        <div style={{
          background: t.bgElev, borderRadius: 14,
          border: `1px solid ${t.line}`, overflow: 'hidden',
        }}>
          {pl.tracks.slice(0, 3).map((tr, i) => (
            <div key={tr.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              borderBottom: i < 2 ? `1px solid ${t.line}` : 'none',
            }}>
              <div style={{
                fontFamily: t.fontMono, fontSize: 11, fontWeight: 600,
                color: t.inkMuted, width: 18,
              }}>{String(i + 1).padStart(2, '0')}</div>
              <Sleeve t={t} seed={tr.id * 13} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: t.fontBody, fontSize: 13, fontWeight: 600, color: t.ink,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{tr.title}</div>
                <div style={{
                  fontFamily: t.fontBody, fontSize: 11, color: t.inkMuted,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{tr.artist}</div>
              </div>
            </div>
          ))}
          <div style={{
            padding: '8px 12px',
            fontFamily: t.fontMono, fontSize: 11, fontWeight: 600,
            color: t.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase',
            background: t.bgInset,
          }}>+ {pl.trackCount - 3} more tracks</div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '20px 24px 32px', position: 'relative', zIndex: 2 }}>
        <Button t={t} variant="primary">Analyze Matches</Button>
        <div style={{
          textAlign: 'center', marginTop: 12,
          fontFamily: t.fontBody, fontSize: 12, color: t.inkMuted,
        }}>
          Nothing's transferred yet. We'll show you matches first.
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 3. MATCH REPORT
// ════════════════════════════════════════════════════════════
function ScreenMatchReport({ t, dense }) {
  const pl = MOCK_PLAYLIST;
  const stats = MATCH_STATS;
  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <Grain t={t} />
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', zIndex: 2 }}>
        <div style={{ padding: '60px 20px 16px' }}>
          {/* breadcrumb */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3l-5 5 5 5" stroke={t.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <Eyebrow t={t} color={t.inkMuted}>Step 2 of 3 · Match Report</Eyebrow>
            </div>
          </div>

          {/* hero stat */}
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 6,
          }}>
            <div style={{
              fontFamily: t.fontDisplay,
              fontWeight: t.displayWeight,
              fontStyle: t.displayItalic ? 'italic' : 'normal',
              fontSize: 76, lineHeight: 0.9, color: t.ink, letterSpacing: -2,
            }}>{stats.percent}<span style={{ fontSize: 36, color: t.inkMuted }}>%</span></div>
            <div style={{
              fontFamily: t.fontBody, fontSize: 14, color: t.inkSoft,
              paddingBottom: 8, lineHeight: 1.3, fontWeight: 500,
            }}>
              tracks ready to<br/>transfer cleanly.
            </div>
          </div>
          <div style={{
            fontFamily: t.fontBody, fontSize: 13, color: t.inkMuted,
            marginBottom: 18, lineHeight: 1.45,
          }}>
            We matched {stats.ready} of {stats.total} tracks confidently. {stats.review} need a quick look. {stats.missing} won't transfer.
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <StatTile t={t} label="Ready" value={stats.ready} accent={t.source} />
            <StatTile t={t} label="Review" value={stats.review} accent={t.warn} />
            <StatTile t={t} label="Missing" value={stats.missing} accent={t.danger} />
          </div>

          {/* filters */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 4, overflowX: 'auto', paddingBottom: 4 }}>
            {[
              { l: 'All', n: stats.total, active: true },
              { l: 'Needs review', n: stats.review, dot: t.warn },
              { l: 'Missing', n: stats.missing, dot: t.danger },
              { l: 'Ready', n: stats.ready, dot: t.source },
            ].map((f, i) => (
              <div key={i} style={{
                padding: '6px 11px', borderRadius: 999,
                background: f.active ? t.ink : t.bgElev,
                color: f.active ? t.bg : t.ink,
                border: `1px solid ${f.active ? t.ink : t.line}`,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: t.fontBody, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                {f.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.dot }} />}
                {f.l}
                <span style={{
                  fontFamily: t.fontMono, fontSize: 10, opacity: 0.7,
                }}>{f.n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* track list — needs-review group at top */}
        <div style={{ padding: '0 20px 24px' }}>
          <div style={{ marginBottom: 8, marginTop: 8 }}>
            <Eyebrow t={t} color={t.warn}>Needs your review · {stats.review}</Eyebrow>
          </div>
          <div style={{
            background: t.bgElev, borderRadius: 14,
            border: `1px solid ${t.line}`, overflow: 'hidden',
            marginBottom: 16,
          }}>
            {pl.tracks.filter(tr => tr.status === 'review').slice(0, 2).map((tr, i, a) => (
              <div key={tr.id} style={{ borderBottom: i < a.length - 1 ? `1px solid ${t.line}` : 'none' }}>
                <TrackRow t={t} track={tr} expanded={i === 0} dense={dense} />
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 8 }}>
            <Eyebrow t={t} color={t.danger}>Won't transfer · {stats.missing}</Eyebrow>
          </div>
          <div style={{
            background: t.bgElev, borderRadius: 14,
            border: `1px solid ${t.line}`, overflow: 'hidden',
            marginBottom: 16,
          }}>
            {pl.tracks.filter(tr => tr.status === 'missing').map((tr) => (
              <TrackRow key={tr.id} t={t} track={tr} expanded={true} dense={dense} />
            ))}
          </div>

          <div style={{ marginBottom: 8 }}>
            <Eyebrow t={t} color={t.source}>Ready to transfer · {stats.ready}</Eyebrow>
          </div>
          <div style={{
            background: t.bgElev, borderRadius: 14,
            border: `1px solid ${t.line}`, overflow: 'hidden',
          }}>
            {pl.tracks.filter(tr => tr.status === 'ready').slice(0, 5).map((tr, i, a) => (
              <TrackRow key={tr.id} t={t} track={tr} dense={dense} />
            ))}
            <div style={{
              padding: '10px 14px', textAlign: 'center',
              fontFamily: t.fontMono, fontSize: 11, fontWeight: 600,
              color: t.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase',
              background: t.bgInset,
            }}>+ 36 more ready tracks</div>
          </div>
        </div>
      </div>

      {/* sticky CTA */}
      <div style={{
        padding: '12px 20px 28px',
        background: `linear-gradient(to top, ${t.bg} 60%, transparent)`,
        position: 'relative', zIndex: 3,
        borderTop: `1px solid ${t.line}`,
      }}>
        <div style={{
          fontFamily: t.fontBody, fontSize: 12, color: t.inkMuted,
          marginBottom: 8, textAlign: 'center',
        }}>
          Tapping Create will transfer <strong style={{ color: t.ink }}>{stats.ready + stats.review} tracks</strong> to Apple Music.
        </div>
        <Button t={t} variant="dest" icon={<ServiceMark kind="apple" t={t} size={16} />}>
          Create Apple Music Playlist
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 4. CREATE / PROGRESS
// ════════════════════════════════════════════════════════════
function ScreenProgress({ t }) {
  const pl = MOCK_PLAYLIST;
  const steps = [
    { l: 'Reading playlist', done: true },
    { l: 'Matching songs', done: true },
    { l: 'Creating Apple Music playlist', done: false, active: true },
    { l: 'Adding tracks', done: false },
  ];
  // Stack of "flying" album art — ids of tracks visible in the shuffle
  const stackIds = [3, 7, 1, 11, 5, 9];
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(170deg, ${t.bg} 0%, ${t.bgElev} 100%)`,
      display: 'flex', flexDirection: 'column',
    }}>
      <Grain t={t} />
      <div style={{ padding: '60px 24px 0', position: 'relative', zIndex: 2 }}>
        <Eyebrow t={t} color={t.inkMuted}>Step 3 of 3 · Transferring</Eyebrow>
      </div>

      {/* Album art shuffle */}
      <div style={{
        height: 240, position: 'relative', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 8,
      }}>
        {/* center stack */}
        <div style={{ position: 'relative', width: 160, height: 160 }}>
          {stackIds.map((id, i) => {
            const idx = i - 2;
            const rot = idx * 6;
            const offX = idx * 14;
            const offY = Math.abs(idx) * 6;
            const scale = 1 - Math.abs(idx) * 0.06;
            const opacity = i === 2 ? 1 : 1 - Math.abs(idx) * 0.18;
            return (
              <div key={id} style={{
                position: 'absolute', inset: 0,
                transform: `translate(${offX}px, ${offY}px) rotate(${rot}deg) scale(${scale})`,
                opacity, zIndex: 10 - Math.abs(idx),
              }}>
                <Sleeve t={t} seed={id * 13} size={160} ring={true} />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        padding: '8px 28px 0', textAlign: 'center', position: 'relative', zIndex: 2,
      }}>
        <Eyebrow t={t} color={t.dest}>Now matching</Eyebrow>
        <Display t={t} size={26} italic={true} style={{ marginTop: 6, marginBottom: 4 }}>
          Lovely Day
        </Display>
        <div style={{
          fontFamily: t.fontBody, fontSize: 14, color: t.inkSoft, fontWeight: 500,
        }}>Bill Withers</div>
      </div>

      {/* progress + steps */}
      <div style={{ padding: '32px 24px 0', position: 'relative', zIndex: 2 }}>
        <Progress t={t} value={62} accent={t.dest} label={
          <span><span style={{ color: t.ink, fontWeight: 600 }}>29</span> of {pl.trackCount} tracks added</span>
        } />

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: s.done || s.active ? 1 : 0.4,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                border: `1.5px solid ${s.done ? t.source : s.active ? t.dest : t.lineStrong}`,
                background: s.done ? t.source : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                {s.done && (
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path d="M1 4.5L4 7.5L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {s.active && (
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: t.dest,
                    animation: 'pt-pulse 1.4s ease-in-out infinite',
                  }} />
                )}
              </div>
              <div style={{
                fontFamily: t.fontBody, fontSize: 14,
                fontWeight: s.active ? 600 : 500,
                color: s.done || s.active ? t.ink : t.inkMuted,
              }}>{s.l}{s.active && '…'}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '0 24px 32px', position: 'relative', zIndex: 2 }}>
        <Button t={t} variant="ghost">Run in background</Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 5. SUCCESS
// ════════════════════════════════════════════════════════════
function ScreenSuccess({ t }) {
  const pl = MOCK_PLAYLIST;
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: t.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Hero gradient */}
      <div style={{
        height: 380, position: 'relative', overflow: 'hidden',
        background: `linear-gradient(165deg, ${t.dest} 0%, ${t.accent} 60%, #6b2a14 110%)`,
      }}>
        <Grain t={t} opacity={0.15} />
        {/* arcs */}
        {[1.2, 1.0, 0.8, 0.6, 0.4].map((r, i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', bottom: '-50%',
            width: 402 * r, height: 402 * r,
            marginLeft: -402 * r / 2,
            borderRadius: '50%',
            background: `rgba(255,255,255,${0.04 + i * 0.02})`,
            mixBlendMode: 'overlay',
          }} />
        ))}

        {/* tape badge */}
        <div style={{
          position: 'absolute', top: 70, left: 0, right: 0,
          textAlign: 'center',
        }}>
          <div style={{
            display: 'inline-block',
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(0,0,0,0.25)',
            backdropFilter: 'blur(10px)',
            fontFamily: t.fontMono, fontSize: 11, fontWeight: 600,
            color: '#fff', letterSpacing: 1.2, textTransform: 'uppercase',
          }}>
            ✓ Transfer complete
          </div>
        </div>

        {/* center sleeve */}
        <div style={{
          position: 'absolute', left: '50%', top: 130,
          transform: 'translateX(-50%)',
        }}>
          <BigSleeve t={t} size={180} palette={pl.cover} />
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 24px 0', display: 'flex', flexDirection: 'column' }}>
        <Display t={t} size={32} italic={true}>
          {pl.name}
        </Display>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
          fontFamily: t.fontMono, fontSize: 11, fontWeight: 600,
          color: t.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase',
        }}>
          <ServiceMark kind="apple" t={t} size={13} />
          Now in your Apple Music library
        </div>

        {/* result summary */}
        <div style={{
          marginTop: 18, padding: '14px 16px',
          background: t.bgElev, borderRadius: 14,
          border: `1px solid ${t.line}`,
          display: 'flex', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: t.fontDisplay,
              fontStyle: t.displayItalic ? 'italic' : 'normal',
              fontWeight: t.displayWeight,
              fontSize: 28, color: t.source, lineHeight: 1, letterSpacing: -0.5,
            }}>45</div>
            <div style={{
              fontFamily: t.fontBody, fontSize: 11, color: t.inkMuted,
              fontWeight: 500, marginTop: 4,
            }}>transferred</div>
          </div>
          <div style={{ width: 1, background: t.line }} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: t.fontDisplay,
              fontStyle: t.displayItalic ? 'italic' : 'normal',
              fontWeight: t.displayWeight,
              fontSize: 28, color: t.danger, lineHeight: 1, letterSpacing: -0.5,
            }}>2</div>
            <div style={{
              fontFamily: t.fontBody, fontSize: 11, color: t.inkMuted,
              fontWeight: 500, marginTop: 4,
            }}>skipped</div>
          </div>
          <div style={{ width: 1, background: t.line }} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: t.fontDisplay,
              fontStyle: t.displayItalic ? 'italic' : 'normal',
              fontWeight: t.displayWeight,
              fontSize: 28, color: t.ink, lineHeight: 1, letterSpacing: -0.5,
            }}>1:42</div>
            <div style={{
              fontFamily: t.fontBody, fontSize: 11, color: t.inkMuted,
              fontWeight: 500, marginTop: 4,
            }}>elapsed</div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', paddingBottom: 32 }}>
          <Button t={t} variant="dest" icon={<ServiceMark kind="apple" t={t} size={16} />}>
            Open in Apple Music
          </Button>
          <div style={{ marginTop: 10 }}>
            <Button t={t} variant="ghost">Transfer another playlist</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  ScreenOnboarding, ScreenPaste, ScreenPreview,
  ScreenMatchReport, ScreenProgress, ScreenSuccess,
});
