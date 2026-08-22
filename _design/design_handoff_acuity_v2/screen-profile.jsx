// screen-profile.jsx — settings + subscription + lifetime stats.
// Header card has the gradient warmth; rows are clean grouped lists.

const PROFILE_DATA = {
  name: 'Jordan Reed',
  email: 'jordan@reed.studio',
  memberSince: 'Member since Jul 2024',
  initials: 'J',
  premium: true,
  stats: {
    entries: 41,
    streak: 14,
    longestStreak: 22,
    nightsLogged: 168,
    minutesSpoken: 312,
    themes: 9,
  },
};

function Profile({ t }) {
  const d = PROFILE_DATA;

  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === 'dark'} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 380,
        background: t.heroGrad, pointerEvents: 'none',
      }} />

      <div className="acuity-scroll" style={{
        position: 'absolute', inset: 0, paddingTop: 56, paddingBottom: 130,
        overflowY: 'auto',
      }}>
        {/* Top bar */}
        <div style={{
          padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button style={pillBtn(t)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={t.textSec} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2L4 7l5.5 5" />
            </svg>
          </button>
          <div style={{
            fontFamily: t.display, fontSize: 15, fontWeight: 700,
            color: t.text, letterSpacing: -0.2,
          }}>Profile</div>
          <button style={pillBtn(t)}>
            <AcuityIcons.cog color={t.textSec} />
          </button>
        </div>

        {/* Hero identity card */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{
            padding: '22px 20px', borderRadius: 28, position: 'relative', overflow: 'hidden',
            background: t.mode === 'dark'
              ? `linear-gradient(135deg, oklch(0.24 0.10 ${t._primary[2]} / 0.45) 0%, oklch(0.22 0.10 ${t._secondary[2]} / 0.45) 100%), ${t.cardBg}`
              : `linear-gradient(135deg, oklch(0.95 0.07 ${t._primary[2]}) 0%, oklch(0.95 0.06 ${t._secondary[2]}) 100%)`,
            border: `0.5px solid ${t.lineStrong}`,
            boxShadow: t.shadowLift,
          }}>
            {/* glow */}
            <div style={{
              position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%',
              background: `radial-gradient(circle, ${t.primary} 0%, transparent 70%)`,
              opacity: t.mode === 'dark' ? 0.18 : 0.28, filter: 'blur(24px)', pointerEvents: 'none',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
              <div style={{
                width: 64, height: 64, borderRadius: 32,
                background: t.gradMix,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: t.display, fontWeight: 700, fontSize: 26,
                color: '#fff', letterSpacing: -0.5,
                border: `2px solid oklch(1 0 0 / ${t.mode === 'dark' ? 0.15 : 0.6})`,
              }}>{d.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <h2 style={{
                    fontFamily: t.display, fontSize: 22, fontWeight: 700,
                    color: t.text, letterSpacing: -0.6, lineHeight: 1.05, margin: 0,
                  }}>{d.name}</h2>
                  {d.premium && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 8px 2px 6px', borderRadius: 999,
                      background: t.gradMix,
                      fontFamily: t.mono, fontSize: 9, fontWeight: 700,
                      color: '#fff', letterSpacing: 0.6, textTransform: 'uppercase',
                    }}>
                      <AcuityIcons.sparkle color="#fff" size={10} />
                      Pro
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: t.sans, fontSize: 13, color: t.textSec, marginTop: 4 }}>
                  {d.email}
                </div>
                <div style={{ fontFamily: t.mono, fontSize: 10, color: t.textTer, marginTop: 4, letterSpacing: 0.3 }}>
                  {d.memberSince}
                </div>
              </div>
            </div>

            {/* Stats strip */}
            <div style={{
              marginTop: 18, paddingTop: 16,
              borderTop: `0.5px solid ${t.line}`,
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0,
              position: 'relative',
            }}>
              <ProfileStat t={t} value={d.stats.entries}        label="Entries" />
              <ProfileStat t={t} value={d.stats.streak}         label="Streak"  divider />
              <ProfileStat t={t} value={d.stats.minutesSpoken}  label="Minutes" divider />
            </div>
          </div>
        </div>

        {/* Subscription card */}
        <div style={{ padding: '16px 16px 0' }}>
          <SectionLabel t={t} label="Subscription" />
          <div style={{
            padding: 18, borderRadius: 22, position: 'relative', overflow: 'hidden',
            background: t.cardBg, border: `0.5px solid ${t.lineStrong}`,
            boxShadow: t.shadowSoft,
          }}>
            <div style={{
              position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: '50%',
              background: `radial-gradient(circle, ${t.secondary} 0%, transparent 70%)`,
              opacity: t.mode === 'dark' ? 0.14 : 0.22, filter: 'blur(20px)',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 18,
                background: t.gradMix,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AcuityIcons.sparkle color="#fff" size={17} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: t.display, fontSize: 16, fontWeight: 700,
                  color: t.text, letterSpacing: -0.3,
                }}>Acuity Pro</div>
                <div style={{ fontFamily: t.sans, fontSize: 12, color: t.textSec, marginTop: 1 }}>
                  $12.99/mo · Renews Nov 14
                </div>
              </div>
              <span style={{
                padding: '4px 10px', borderRadius: 999,
                background: t.goodSoft,
                fontFamily: t.mono, fontSize: 10, fontWeight: 700,
                color: t.good, letterSpacing: 0.4, textTransform: 'uppercase',
              }}>Active</span>
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              padding: '10px 12px', borderRadius: 14,
              background: t.mode === 'dark' ? 'oklch(1 0 0 / 0.03)' : 'oklch(0 0 0 / 0.03)',
            }}>
              {[
                'Unlimited entries',
                'Weekly insight gift',
                'Theme Map + Life Matrix',
              ].map((feat) => (
                <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AcuityIcons.check color={t.primary} size={12} weight={2.6} />
                  <span style={{ fontFamily: t.sans, fontSize: 13, color: t.text, letterSpacing: -0.1 }}>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Settings groups */}
        <div style={{ padding: '20px 16px 0' }}>
          <SectionLabel t={t} label="Preferences" />
          <ListGroup t={t}>
            <ListRow t={t} icon="bell"    label="Nightly reminder" detail="9:30 pm" />
            <ListRow t={t} icon="moon"    label="Appearance"        detail="Auto" />
            <ListRow t={t} icon="lock"    label="App lock"          detail="Off" />
            <ListRow t={t} icon="globe"   label="Language"          detail="English (US)" last />
          </ListGroup>
        </div>

        <div style={{ padding: '14px 16px 0' }}>
          <SectionLabel t={t} label="Data" />
          <ListGroup t={t}>
            <ListRow t={t} icon="export" label="Export entries" />
            <ListRow t={t} icon="lock2"  label="Privacy &amp; encryption" />
            <ListRow t={t} icon="trash"  label="Manage account" tone="danger" last />
          </ListGroup>
        </div>

        <div style={{ padding: '14px 16px 0' }}>
          <SectionLabel t={t} label="Support" />
          <ListGroup t={t}>
            <ListRow t={t} icon="heart" label="Send feedback" />
            <ListRow t={t} icon="star"  label="Rate Acuity" />
            <ListRow t={t} icon="info"  label="About"        detail="v2.4.1" last />
          </ListGroup>
        </div>

        <div style={{
          padding: '20px 16px 0', textAlign: 'center',
          fontFamily: t.mono, fontSize: 10, letterSpacing: 1.0,
          color: t.textTer, textTransform: 'uppercase',
        }}>
          Acuity · Built quietly
        </div>
      </div>

      <AcuityTabBar active="home" t={t} withFab={false} />
    </AcuityDevice>
  );
}

function ProfileStat({ t, value, label, divider }) {
  return (
    <div style={{
      padding: '0 10px', position: 'relative',
      borderLeft: divider ? `0.5px solid ${t.line}` : 'none',
    }}>
      <div style={{
        fontFamily: t.display, fontSize: 22, fontWeight: 800,
        color: t.text, letterSpacing: -0.6, lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{ fontFamily: t.sans, fontSize: 11, color: t.textTer, marginTop: 4, letterSpacing: 0.1 }}>
        {label}
      </div>
    </div>
  );
}

function SectionLabel({ t, label }) {
  return (
    <div style={{
      fontFamily: t.display, fontSize: 12, fontWeight: 700,
      color: t.textSec, letterSpacing: 0.4, textTransform: 'uppercase',
      padding: '0 8px 10px',
    }}>{label}</div>
  );
}

function ListGroup({ t, children }) {
  const arr = React.Children.toArray(children);
  return (
    <div style={{
      borderRadius: 20, background: t.cardBg,
      border: `0.5px solid ${t.line}`, overflow: 'hidden',
    }}>
      {arr}
    </div>
  );
}

const SETTING_ICONS = {
  bell: (c) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21h4" /></svg>,
  moon: (c) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.5A9 9 0 1 1 11.5 3a7 7 0 0 0 9.5 9.5z"/></svg>,
  lock: (c) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>,
  lock2: (c) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"/></svg>,
  globe: (c) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18"/></svg>,
  export: (c) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M16 6l-4-4-4 4M12 2v13"/></svg>,
  trash: (c) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>,
  heart: (c) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-4.5-9.5-9C0.6 8.5 3 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 3.5 0 5.9 3.5 4 7-2.5 4.5-9.5 9-9.5 9z"/></svg>,
  star: (c) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.7 5.6 6.3 1-4.5 4.4 1 6.2L12 17.5 6.5 20.2l1-6.2L3 9.6l6.3-1L12 3z"/></svg>,
  info: (c) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v5h1"/></svg>,
};

function ListRow({ t, icon, label, detail, last, tone }) {
  const dangerous = tone === 'danger';
  const c = dangerous ? t.bad : t.textSec;
  const labelColor = dangerous ? t.bad : t.text;
  const Icon = SETTING_ICONS[icon];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
      borderBottom: last ? 'none' : `0.5px solid ${t.line}`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: dangerous ? t.badSoft : t.mode === 'dark' ? 'oklch(1 0 0 / 0.04)' : 'oklch(0 0 0 / 0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {Icon && Icon(c)}
      </div>
      <div style={{
        flex: 1, fontFamily: t.sans, fontSize: 15, color: labelColor, letterSpacing: -0.2,
      }}>{label}</div>
      {detail && (
        <span style={{ fontFamily: t.sans, fontSize: 13, color: t.textTer, marginRight: 4 }}>
          {detail}
        </span>
      )}
      <AcuityIcons.chevron color={t.textTer} />
    </div>
  );
}

Object.assign(window, { Profile, PROFILE_DATA, ProfileStat, SectionLabel, ListGroup, ListRow });
