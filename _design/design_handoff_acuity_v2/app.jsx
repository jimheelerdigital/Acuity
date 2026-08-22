// app.jsx — v2. Sleek dopamine direction. Two Home variants × light/dark,
// then Entry / Recording / Theme Map / Life Matrix × light/dark.

function App() {
  const [tweak, setTweak] = useTweaks(ACUITY_PALETTES);

  const tDark  = makeAcuityTokens({ dark: true,  accent: tweak.accent, boost: tweak.accentBoost });
  const tLight = makeAcuityTokens({ dark: false, accent: tweak.accent, boost: tweak.accentBoost });

  const W = 440, H = 920;

  const Pair = ({ Comp, t }) => (
    <div style={{
      width: W, height: H,
      background: t.mode === 'dark' ? 'oklch(0.16 0.018 280)' : 'oklch(0.96 0.004 280)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Comp t={t} />
    </div>
  );

  return (
    <React.Fragment>
      <DesignCanvas>
        <DCSection id="home" title="01 · Home" subtitle="Two directions. Dashboard leans gamified (rings, stat tiles, sparkbar). Ritual leans hero-quote + stat strip. Pick one.">
          <DCArtboard id="dash-d" label="A · Dashboard — dark" width={W} height={H}>
            <Pair Comp={HomeDashboard} t={tDark} />
          </DCArtboard>
          <DCArtboard id="dash-l" label="A · Dashboard — light" width={W} height={H}>
            <Pair Comp={HomeDashboard} t={tLight} />
          </DCArtboard>
          <DCArtboard id="rit-d"  label="B · Ritual — dark" width={W} height={H}>
            <Pair Comp={HomeRitual} t={tDark} />
          </DCArtboard>
          <DCArtboard id="rit-l"  label="B · Ritual — light" width={W} height={H}>
            <Pair Comp={HomeRitual} t={tLight} />
          </DCArtboard>
          <DCPostIt top={-30} right={60} rotate={2.5} width={240}>
            Dark is primary. Both share the same chrome (segmented top tabs, floating bottom bar w/ mic FAB, soft glow hero blocks). Pick a Home → I’ll align the others.
          </DCPostIt>
        </DCSection>

        <DCSection id="entry" title="02 · Entry detail" subtitle="Quick stats (themes / tasks / mood), hero pull quote in gradient card, AI summary, tasks list with gradient checks, transcript w/ pull-quote moment highlighted.">
          <DCArtboard id="ent-d" label="Dark" width={W} height={H}>
            <Pair Comp={EntryDetail} t={tDark} />
          </DCArtboard>
          <DCArtboard id="ent-l" label="Light" width={W} height={H}>
            <Pair Comp={EntryDetail} t={tLight} />
          </DCArtboard>
        </DCSection>

        <DCSection id="record" title="03 · Recording" subtitle="Mid-record at 0:23. Half-arc gauge with tick marks, glowing core orb, waveform pulses, ghost transcript fading up.">
          <DCArtboard id="rec-d" label="Dark" width={W} height={H}>
            <Pair Comp={RecordingScreen} t={tDark} />
          </DCArtboard>
          <DCArtboard id="rec-l" label="Light" width={W} height={H}>
            <Pair Comp={RecordingScreen} t={tLight} />
          </DCArtboard>
        </DCSection>

        <DCSection id="thememap" title="04 · Theme Map" subtitle="Cosmic orbital with vivid planet gradients. Segmented top tabs share rhythm with Matrix view.">
          <DCArtboard id="tm-d" label="Dark" width={W} height={H}>
            <Pair Comp={ThemeMap} t={tDark} />
          </DCArtboard>
          <DCArtboard id="tm-l" label="Light" width={W} height={H}>
            <Pair Comp={ThemeMap} t={tLight} />
          </DCArtboard>
        </DCSection>

        <DCSection id="matrix" title="05 · Life Matrix" subtitle="Big overall score with ring. Radar with gradient fill + glow. Top movers as sparkbar rows with hue chips.">
          <DCArtboard id="lm-d" label="Dark" width={W} height={H}>
            <Pair Comp={LifeMatrix} t={tDark} />
          </DCArtboard>
          <DCArtboard id="lm-l" label="Light" width={W} height={H}>
            <Pair Comp={LifeMatrix} t={tLight} />
          </DCArtboard>
        </DCSection>

        <DCSection id="entries" title="06 · Entries list" subtitle="Heatmap strip + grouped chronological cards. Latest entry gets a gradient wash; others are flat cards with date tile, pull quote, themes, task count.">
          <DCArtboard id="en-d" label="Dark" width={W} height={H}>
            <Pair Comp={EntriesList} t={tDark} />
          </DCArtboard>
          <DCArtboard id="en-l" label="Light" width={W} height={H}>
            <Pair Comp={EntriesList} t={tLight} />
          </DCArtboard>
        </DCSection>

        <DCSection id="tasks" title="07 · Tasks list" subtitle="Segmented tabs (Today / Upcoming / Done), MiniStat strip, theme-tagged rows with provenance (which entry surfaced it).">
          <DCArtboard id="tk-d" label="Dark" width={W} height={H}>
            <Pair Comp={TasksList} t={tDark} />
          </DCArtboard>
          <DCArtboard id="tk-l" label="Light" width={W} height={H}>
            <Pair Comp={TasksList} t={tLight} />
          </DCArtboard>
        </DCSection>

        <DCSection id="goals" title="08 · Goals list" subtitle="Per-goal card: progress ring (tinted to theme hue), week count, latest milestone footer. Dormant goals fade.">
          <DCArtboard id="gl-d" label="Dark" width={W} height={H}>
            <Pair Comp={GoalsList} t={tDark} />
          </DCArtboard>
          <DCArtboard id="gl-l" label="Light" width={W} height={H}>
            <Pair Comp={GoalsList} t={tLight} />
          </DCArtboard>
        </DCSection>

        <DCSection id="profile" title="09 · Profile" subtitle="Hero identity card with gradient warmth, Pro subscription block, grouped settings rows.">
          <DCArtboard id="pf-d" label="Dark" width={W} height={H}>
            <Pair Comp={Profile} t={tDark} />
          </DCArtboard>
          <DCArtboard id="pf-l" label="Light" width={W} height={H}>
            <Pair Comp={Profile} t={tLight} />
          </DCArtboard>
        </DCSection>

        <DCSection id="onboard" title="10 · Onboarding step 3 — Life Matrix baseline" subtitle="One axis at a time. Big gradient score, slider, live mood label, and a mini matrix that fills in as the user goes.">
          <DCArtboard id="ob-d" label="Dark" width={W} height={H}>
            <Pair Comp={OnboardingMatrixBaseline} t={tDark} />
          </DCArtboard>
          <DCArtboard id="ob-l" label="Light" width={W} height={H}>
            <Pair Comp={OnboardingMatrixBaseline} t={tLight} />
          </DCArtboard>
        </DCSection>

        <DCSection id="extract" title="11 · Post-record extraction review" subtitle="Themes / Tasks / Goal-touches as check-rows. Default unchecked per brief. Footer pill shows count to keep.">
          <DCArtboard id="ex-d" label="Dark" width={W} height={H}>
            <Pair Comp={ExtractReview} t={tDark} />
          </DCArtboard>
          <DCArtboard id="ex-l" label="Light" width={W} height={H}>
            <Pair Comp={ExtractReview} t={tLight} />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Accent" />
        <TweakRadio
          label="Palette"
          value={tweak.accent}
          options={Object.keys(ACUITY_ACCENT_PRESETS)}
          onChange={(v) => setTweak('accent', v)}
        />
        <TweakSlider
          label="Boost"
          value={tweak.accentBoost}
          min={0.75} max={1.25} step={0.05}
          onChange={(v) => setTweak('accentBoost', v)}
        />

        <TweakSection label="Surfaces" />
        <TweakRadio
          label="Card"
          value={tweak.cardStyle}
          options={['tint', 'hairline']}
          onChange={(v) => setTweak('cardStyle', v)}
        />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
