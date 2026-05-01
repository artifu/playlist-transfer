// PlaylistTransfer — App entry: design canvas with all screens

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "studio",
  "fontDisplay": "Fraunces",
  "fontBody": "Inter",
  "density": "comfortable"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const t = React.useMemo(() => {
    const base = THEMES[tweaks.theme] || THEMES.studio;
    return {
      ...base,
      fontDisplay: `"${tweaks.fontDisplay}", ${base.fontDisplay}`,
      fontBody: `"${tweaks.fontBody}", ${base.fontBody}`,
    };
  }, [tweaks.theme, tweaks.fontDisplay, tweaks.fontBody]);

  const dense = tweaks.density === 'compact';

  // Core screens, current theme
  const screens = [
    { id: 'onboarding', label: '00 · Onboarding',   el: <ScreenOnboarding t={t} /> },
    { id: 'paste',      label: '01 · Paste Link',   el: <ScreenPaste t={t} /> },
    { id: 'preview',    label: '02 · Preview',      el: <ScreenPreview t={t} /> },
    { id: 'match',      label: '03 · Match Report', el: <ScreenMatchReport t={t} dense={dense} /> },
    { id: 'progress',   label: '04 · Transferring', el: <ScreenProgress t={t} /> },
    { id: 'success',    label: '05 · Success',      el: <ScreenSuccess t={t} /> },
  ];

  // Supporting screens
  const supporting = [
    { id: 'alt',      label: '06 · Alternatives sheet', el: <ScreenAlternatives t={t} /> },
    { id: 'history',  label: '07 · History',            el: <ScreenHistory t={t} /> },
    { id: 'settings', label: '08 · Settings',           el: <ScreenSettings t={t} /> },
  ];

  // Error states
  const errors = [
    { id: 'err-invalid', label: 'Invalid link',     el: <ScreenError t={t} kind="invalid" /> },
    { id: 'err-private', label: 'Private playlist', el: <ScreenError t={t} kind="private" /> },
    { id: 'err-network', label: 'Network error',    el: <ScreenError t={t} kind="network" /> },
  ];

  return (
    <DesignCanvas
      title="PlaylistTransfer"
      subtitle="iOS · Studio Light (primary) · 12 screens"
      defaultBg={t.bg}
    >
      <DCSection id="flow" title="Core Flow" subtitle={`Theme: ${THEMES[tweaks.theme].name} · The 6-screen journey from paste to success`}>
        {screens.map(s => (
          <DCArtboard key={s.id} id={s.id} label={s.label} width={402} height={874}>
            {s.el}
          </DCArtboard>
        ))}
      </DCSection>

      <DCSection id="supporting" title="Supporting Screens" subtitle="Alternatives sheet · History · Settings">
        {supporting.map(s => (
          <DCArtboard key={s.id} id={s.id} label={s.label} width={402} height={874}>
            {s.el}
          </DCArtboard>
        ))}
      </DCSection>

      <DCSection id="errors" title="Error States" subtitle="Recovery is calm and explicit — always tells the user why and how to fix it.">
        {errors.map(s => (
          <DCArtboard key={s.id} id={s.id} label={s.label} width={402} height={874}>
            {s.el}
          </DCArtboard>
        ))}
      </DCSection>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Theme">
          <TweakRadio
            label="Aesthetic"
            value={tweaks.theme}
            onChange={v => setTweak('theme', v)}
            options={[
              { value: 'studio', label: 'Studio Light' },
              { value: 'night', label: 'Late Night' },
            ]}
          />
        </TweakSection>
        <TweakSection title="Type">
          <TweakSelect
            label="Display font"
            value={tweaks.fontDisplay}
            onChange={v => setTweak('fontDisplay', v)}
            options={[
              { value: 'Fraunces', label: 'Fraunces' },
              { value: 'Playfair Display', label: 'Playfair Display' },
              { value: 'DM Serif Display', label: 'DM Serif Display' },
              { value: 'Instrument Serif', label: 'Instrument Serif' },
            ]}
          />
          <TweakSelect
            label="Body font"
            value={tweaks.fontBody}
            onChange={v => setTweak('fontBody', v)}
            options={[
              { value: 'Inter', label: 'Inter' },
              { value: 'IBM Plex Sans', label: 'IBM Plex Sans' },
              { value: 'Geist', label: 'Geist' },
              { value: 'DM Sans', label: 'DM Sans' },
            ]}
          />
        </TweakSection>
        <TweakSection title="Density">
          <TweakRadio
            label="Track rows"
            value={tweaks.density}
            onChange={v => setTweak('density', v)}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
