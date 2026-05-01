// PlaylistTransfer — Additional Screens
// Error states, Alternatives sheet, History, Settings

// ════════════════════════════════════════════════════════════
// ERROR STATES — three variants on the paste screen
// ════════════════════════════════════════════════════════════
function ScreenError({ t, kind = 'invalid' }) {
  const errors = {
    invalid: {
      icon: '!',
      title: 'That doesn\'t look like a Spotify playlist link.',
      body: 'Make sure you copied the full URL — it should start with open.spotify.com/playlist/.',
      cta: 'Try a different link',
    },
    private: {
      icon: '🔒',
      title: 'This playlist is private.',
      body: 'We can only read public Spotify playlists. Ask the owner to make it public, then paste the link again.',
      cta: 'Paste another link',
    },
    network: {
      icon: '◍',
      title: 'We couldn\'t reach Spotify.',
      body: 'Check your connection and try again. Nothing was transferred.',
      cta: 'Retry',
    },
  };
  const e = errors[kind];
  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <Grain t={t} />
      <div style={{ padding: '60px 24px 0', position: 'relative', zIndex: 2 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 28,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3l-5 5 5 5" stroke={t.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <Eyebrow t={t} color={t.inkMuted}>Back</Eyebrow>
          </div>
        </div>

        {/* error icon */}
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: t.destSoft,
          border: `1px solid ${t.dest}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: t.fontDisplay, fontStyle: 'italic',
          fontWeight: t.displayWeight, fontSize: 32,
          color: t.dest, marginBottom: 20,
        }}>{e.icon}</div>

        <Display t={t} size={28} style={{ marginBottom: 14 }}>
          {e.title}
        </Display>
        <div style={{
          fontFamily: t.fontBody, fontSize: 15, color: t.inkSoft, lineHeight: 1.5,
          marginBottom: 24,
        }}>
          {e.body}
        </div>

        {/* the bad link, if relevant */}
        {kind !== 'network' && (
          <div style={{
            background: t.bgInset, borderRadius: 12,
            border: `1px solid ${t.line}`,
            padding: '12px 14px', marginBottom: 16,
          }}>
            <Eyebrow t={t} color={t.inkMuted}>You pasted</Eyebrow>
            <div style={{
              fontFamily: t.fontMono, fontSize: 13, color: t.inkSoft,
              marginTop: 4, wordBreak: 'break-all', textDecoration: 'line-through',
              textDecorationColor: t.dest, textDecorationThickness: 1.5,
            }}>
              {kind === 'invalid'
                ? 'open.spotify.com/track/4cOdK2wG…'
                : 'open.spotify.com/playlist/2x7P9nM…'}
            </div>
          </div>
        )}

        {/* helper card */}
        <div style={{
          background: t.bgElev, borderRadius: 14,
          border: `1px solid ${t.line}`,
          padding: '14px 16px',
        }}>
          <Eyebrow t={t} color={t.source}>How to copy a link</Eyebrow>
          <ol style={{
            fontFamily: t.fontBody, fontSize: 13, color: t.inkSoft,
            lineHeight: 1.6, paddingLeft: 18, marginTop: 8, marginBottom: 0,
          }}>
            <li>Open Spotify and find your playlist</li>
            <li>Tap the ··· menu → Share → Copy link</li>
            <li>Come back here and paste it</li>
          </ol>
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '0 24px 32px', position: 'relative', zIndex: 2 }}>
        <Button t={t} variant="primary">{e.cta}</Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ALTERNATIVES SHEET — bottom sheet over Match Report
// ════════════════════════════════════════════════════════════
function ScreenAlternatives({ t }) {
  const original = MOCK_PLAYLIST.tracks[4]; // Skinny Love (Live)
  const alternatives = [
    { id: 1, title: 'Skinny Love', artist: 'Bon Iver', album: 'For Emma, Forever Ago', year: 2007, confidence: 88, suggested: true },
    { id: 2, title: 'Skinny Love', artist: 'Birdy', album: 'Birdy', year: 2011, confidence: 64 },
    { id: 3, title: 'Skinny Love (Acoustic)', artist: 'Bon Iver', album: 'Live at AIR Studios', year: 2009, confidence: 76 },
    { id: 4, title: 'Skinny Love - Live', artist: 'Bon Iver', album: 'Singles', year: 2012, confidence: 71 },
  ];
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: 'rgba(11,11,13,0.45)',
    }}>
      {/* Dim background showing match report behind */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.3, pointerEvents: 'none',
      }}>
        <ScreenMatchReport t={t} />
      </div>

      {/* Bottom sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        boxShadow: '0 -20px 60px rgba(0,0,0,0.25)',
        maxHeight: '88%', display: 'flex', flexDirection: 'column',
      }}>
        {/* grabber */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 6 }}>
          <div style={{ width: 38, height: 5, borderRadius: 999, background: t.lineStrong }} />
        </div>

        <div style={{ padding: '8px 20px 16px' }}>
          <Eyebrow t={t} color={t.warn}>Choose a match</Eyebrow>
          <Display t={t} size={22} italic={true} style={{ marginTop: 4, marginBottom: 6 }}>
            Skinny Love (Live)
          </Display>
          <div style={{
            fontFamily: t.fontBody, fontSize: 13, color: t.inkSoft,
          }}>Bon Iver · Bonnaroo '09</div>
        </div>

        {/* Original track */}
        <div style={{ padding: '0 20px 14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', background: t.bgInset, borderRadius: 12,
            border: `1px solid ${t.line}`,
          }}>
            <ServiceMark kind="spotify" t={t} size={16} />
            <Eyebrow t={t} color={t.inkMuted}>From Spotify</Eyebrow>
            <div style={{ marginLeft: 'auto', fontFamily: t.fontBody, fontSize: 12, color: t.inkMuted }}>
              Live · 4:21
            </div>
          </div>
        </div>

        {/* Alternatives */}
        <div style={{ padding: '0 20px 8px' }}>
          <Eyebrow t={t} color={t.inkMuted}>Apple Music candidates</Eyebrow>
        </div>
        <div style={{
          margin: '0 20px', background: t.bgElev, borderRadius: 14,
          border: `1px solid ${t.line}`, overflow: 'hidden',
          flex: 1, overflowY: 'auto',
        }}>
          {alternatives.map((alt, i) => (
            <div key={alt.id} style={{
              padding: '12px 14px',
              borderBottom: i < alternatives.length - 1 ? `1px solid ${t.line}` : 'none',
              display: 'flex', alignItems: 'center', gap: 12,
              position: 'relative',
              background: alt.suggested ? t.sourceSoft : 'transparent',
            }}>
              {/* radio */}
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                border: `1.5px solid ${alt.suggested ? t.source : t.lineStrong}`,
                background: alt.suggested ? t.source : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {alt.suggested && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
              </div>
              <Sleeve t={t} seed={alt.id * 19} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    fontFamily: t.fontBody, fontSize: 14, fontWeight: 600, color: t.ink,
                  }}>{alt.title}</div>
                  {alt.suggested && (
                    <div style={{
                      padding: '1px 6px', borderRadius: 999,
                      background: t.source, color: '#fff',
                      fontFamily: t.fontMono, fontSize: 9, fontWeight: 700,
                      letterSpacing: 0.5, textTransform: 'uppercase',
                    }}>Suggested</div>
                  )}
                </div>
                <div style={{
                  fontFamily: t.fontBody, fontSize: 12, color: t.inkMuted, marginTop: 2,
                }}>{alt.artist} · {alt.album} · {alt.year}</div>
              </div>
              <div style={{
                fontFamily: t.fontMono, fontSize: 11, fontWeight: 700,
                color: alt.confidence >= 80 ? t.source : alt.confidence >= 65 ? t.warn : t.danger,
                flexShrink: 0,
              }}>{alt.confidence}%</div>
            </div>
          ))}
        </div>

        {/* footer */}
        <div style={{ padding: '14px 20px 28px', borderTop: `1px solid ${t.line}`, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Button t={t} variant="ghost">Skip this track</Button>
            </div>
            <div style={{ flex: 1.4 }}>
              <Button t={t} variant="primary">Use selected</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// HISTORY — past transfers
// ════════════════════════════════════════════════════════════
function ScreenHistory({ t }) {
  const transfers = [
    { id: 1, name: 'sunday morning kitchen', when: '2 minutes ago', tracks: 47, success: 45, status: 'done', accent: t.source },
    { id: 2, name: 'driving home, august', when: 'Yesterday', tracks: 32, success: 32, status: 'done', accent: t.source },
    { id: 3, name: '4am thoughts', when: '3 days ago', tracks: 68, success: 64, status: 'done', accent: t.source },
    { id: 4, name: 'wedding dance floor', when: 'Last week', tracks: 24, success: 21, status: 'done', accent: t.source },
    { id: 5, name: 'rainy afternoon', when: 'Mar 12', tracks: 19, success: 0, status: 'failed', accent: t.danger },
    { id: 6, name: 'workout, hard', when: 'Feb 28', tracks: 41, success: 39, status: 'done', accent: t.source },
  ];
  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <Grain t={t} />
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', zIndex: 2 }}>
        <div style={{ padding: '60px 24px 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 14,
          }}>
            <Eyebrow t={t} color={t.inkMuted}>Library</Eyebrow>
            <div style={{
              fontFamily: t.fontBody, fontSize: 13, color: t.inkSoft, fontWeight: 500,
            }}>Done</div>
          </div>
          <Display t={t} size={32} style={{ marginBottom: 6 }}>
            Past transfers
          </Display>
          <div style={{
            fontFamily: t.fontBody, fontSize: 14, color: t.inkSoft, marginBottom: 22,
          }}>
            6 playlists moved · 197 of 231 tracks
          </div>
        </div>

        <div style={{ padding: '0 20px 24px' }}>
          {transfers.map((tr) => (
            <div key={tr.id} style={{
              background: t.bgElev, borderRadius: 14,
              border: `1px solid ${t.line}`,
              padding: 14, marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <Sleeve t={t} seed={tr.id * 23} size={52} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: t.fontDisplay,
                  fontStyle: t.displayItalic ? 'italic' : 'normal',
                  fontWeight: t.displayWeight, fontSize: 17,
                  color: t.ink, lineHeight: 1.2, letterSpacing: -0.2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{tr.name}</div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
                  fontFamily: t.fontMono, fontSize: 10, fontWeight: 600,
                  color: t.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase',
                }}>
                  <span>{tr.when}</span>
                  <span style={{ width: 2, height: 2, borderRadius: '50%', background: t.inkMuted }} />
                  {tr.status === 'done' ? (
                    <span><span style={{ color: tr.accent }}>{tr.success}</span>/{tr.tracks} transferred</span>
                  ) : (
                    <span style={{ color: t.danger }}>Failed</span>
                  )}
                </div>
              </div>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                <path d="M1 1l6 6-6 6" stroke={t.inkMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* sticky bottom CTA */}
      <div style={{
        padding: '12px 20px 28px',
        background: `linear-gradient(to top, ${t.bg} 60%, transparent)`,
        borderTop: `1px solid ${t.line}`,
        position: 'relative', zIndex: 3,
      }}>
        <Button t={t} variant="primary" icon={
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke={t.bg} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        }>
          New transfer
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════
function ScreenSettings({ t }) {
  const Row = ({ label, value, danger, switch_ }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', borderBottom: `1px solid ${t.line}`,
    }}>
      <div style={{
        flex: 1,
        fontFamily: t.fontBody, fontSize: 15, fontWeight: 500,
        color: danger ? t.danger : t.ink,
      }}>{label}</div>
      {switch_ ? (
        <div style={{
          width: 46, height: 28, borderRadius: 999,
          background: switch_ === 'on' ? t.source : t.bgInset,
          padding: 2, position: 'relative',
          border: `1px solid ${t.line}`,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', background: '#fff',
            transform: switch_ === 'on' ? 'translateX(18px)' : 'translateX(0)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s',
          }} />
        </div>
      ) : value ? (
        <>
          <div style={{
            fontFamily: t.fontBody, fontSize: 14, color: t.inkMuted,
          }}>{value}</div>
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
            <path d="M1 1l5 5-5 5" stroke={t.inkMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </>
      ) : null}
    </div>
  );

  const Section = ({ label, children }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ padding: '0 16px 8px' }}>
        <Eyebrow t={t} color={t.inkMuted}>{label}</Eyebrow>
      </div>
      <div style={{
        background: t.bgElev, borderRadius: 14,
        border: `1px solid ${t.line}`, overflow: 'hidden',
      }}>{children}</div>
    </div>
  );

  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <Grain t={t} />
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', zIndex: 2 }}>
        <div style={{ padding: '60px 20px 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 14, padding: '0 4px',
          }}>
            <Eyebrow t={t} color={t.inkMuted}>Profile</Eyebrow>
            <div style={{
              fontFamily: t.fontBody, fontSize: 13, color: t.inkSoft, fontWeight: 500,
            }}>Done</div>
          </div>
          <Display t={t} size={32} style={{ padding: '0 4px', marginBottom: 22 }}>
            Settings
          </Display>
        </div>

        <div style={{ padding: '0 20px 24px' }}>
          {/* Account card */}
          <div style={{
            background: `linear-gradient(135deg, ${t.dest} 0%, ${t.accent} 100%)`,
            borderRadius: 16, padding: 18, marginBottom: 22,
            position: 'relative', overflow: 'hidden',
          }}>
            <Grain t={t} opacity={0.1} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <Eyebrow t={t} color="rgba(255,255,255,0.85)">Apple Music</Eyebrow>
              <div style={{
                fontFamily: t.fontDisplay,
                fontStyle: 'italic', fontWeight: t.displayWeight,
                fontSize: 22, color: '#fff', marginTop: 4,
              }}>maya@email.com</div>
              <div style={{
                marginTop: 10, padding: '5px 10px', borderRadius: 999,
                background: 'rgba(255,255,255,0.18)', display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: t.fontMono, fontSize: 10, fontWeight: 600,
                color: '#fff', letterSpacing: 0.5, textTransform: 'uppercase',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
                Connected
              </div>
            </div>
          </div>

          <Section label="Transfer behavior">
            <Row label="Skip 'Review' tracks automatically" switch_="off" />
            <Row label="Default playlist privacy" value="Private" />
            <Row label="Match confidence threshold" value="70%" />
          </Section>

          <Section label="Appearance">
            <Row label="Theme" value="Studio Light" />
            <Row label="Reduce motion" switch_="off" />
          </Section>

          <Section label="About">
            <Row label="Privacy policy" value="" />
            <Row label="Terms of service" value="" />
            <Row label="Version" value="1.0.0" />
          </Section>

          <Section label="Account">
            <Row label="Disconnect Apple Music" danger={true} />
          </Section>

          <div style={{
            textAlign: 'center', padding: '8px 0 24px',
            fontFamily: t.fontMono, fontSize: 10, fontWeight: 600,
            color: t.inkMuted, letterSpacing: 1, textTransform: 'uppercase',
          }}>
            Made with care · Side A → Side B
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  ScreenError, ScreenAlternatives, ScreenHistory, ScreenSettings,
});
