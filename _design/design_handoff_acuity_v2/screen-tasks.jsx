// screen-tasks.jsx — surfaced todos from entries. Segmented tabs,
// theme-tagged rows, gradient check-boxes when complete.

const TASKS_DATA = {
  todayCount: 3,
  upcomingCount: 5,
  doneCount: 47,
  groups: [
    {
      label: 'Today',
      sub: 'Surfaced from last night',
      items: [
        { text: 'Reply to Mira about Dad\u2019s appointment',     theme: 'Family', hue: 25,  from: 'Entry 41 \u00b7 Tue 11:18pm', done: false },
        { text: 'Put Marcus 1:1 on the calendar before Friday',    theme: 'Career', hue: 295, from: 'Entry 41 \u00b7 Tue 11:18pm', done: false },
        { text: 'Move the morning run to 6:00 \u2014 try again',     theme: 'Health', hue: 165, from: 'Entry 41 \u00b7 Tue 11:18pm', done: false },
      ],
    },
    {
      label: 'This week',
      sub: 'From earlier entries',
      items: [
        { text: 'Send the Q3 retro doc to Anya before skip-level', theme: 'Career', hue: 295, from: 'Entry 39 \u00b7 Sun', done: false },
        { text: 'Ask Sam about the Saturday hike',                  theme: 'Friends', hue: 345, from: 'Entry 38 \u00b7 Sat', done: false },
        { text: 'Cancel the gym, the running app is enough',        theme: 'Health', hue: 165, from: 'Entry 37 \u00b7 Fri', done: false },
      ],
    },
    {
      label: 'Just done',
      sub: 'Last 24 hours',
      items: [
        { text: 'Texted Mira about Sunday',                          theme: 'Family', hue: 25,  from: 'Entry 38 \u00b7 Sat', done: true },
        { text: 'Drafted the launch readiness one-pager',            theme: 'Career', hue: 295, from: 'Entry 40 \u00b7 Mon', done: true },
      ],
    },
  ],
};

function TasksList({ t }) {
  const d = TASKS_DATA;
  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === 'dark'} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 360,
        background: t.heroGrad, pointerEvents: 'none',
      }} />

      <div className="acuity-scroll" style={{
        position: 'absolute', inset: 0, paddingTop: 56, paddingBottom: 130,
        overflowY: 'auto',
      }}>
        <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              fontFamily: t.mono, fontSize: 10, letterSpacing: 1.6,
              textTransform: 'uppercase', color: t.textTer,
            }}>Surfaced from voice</div>
            <h1 style={{
              fontFamily: t.display, fontSize: 28, fontWeight: 700,
              color: t.text, letterSpacing: -0.7, lineHeight: 1.05, margin: '4px 0 0',
            }}>Tasks</h1>
          </div>
          <button style={pillBtn(t)}>
            <AcuityIcons.more color={t.textSec} />
          </button>
        </div>

        {/* Stats strip */}
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0,
            padding: '14px 0', borderRadius: 22,
            background: t.cardBg, border: `0.5px solid ${t.line}`,
            boxShadow: t.shadowSoft,
          }}>
            <MiniStat t={t} value={d.todayCount}    label="Today"    delta="+3" />
            <MiniStat t={t} value={d.upcomingCount} label="Upcoming"               divider />
            <MiniStat t={t} value={d.doneCount}     label="Done all-time" delta="+12" divider />
          </div>
        </div>

        {/* Segmented tabs */}
        <div style={{ padding: '18px 20px 0' }}>
          <SegmentedTabs t={t} options={['Today', 'Upcoming', 'Done']} active="Today" />
        </div>

        {/* Groups */}
        {d.groups.map((g) => (
          <div key={g.label}>
            <div style={{
              padding: '22px 24px 10px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <div>
                <h2 style={{
                  fontFamily: t.display, fontSize: 13, fontWeight: 700,
                  color: t.textSec, letterSpacing: 0.4, textTransform: 'uppercase', margin: 0,
                }}>{g.label}</h2>
                <div style={{ fontFamily: t.sans, fontSize: 12, color: t.textTer, marginTop: 2 }}>
                  {g.sub}
                </div>
              </div>
              <span style={{ fontFamily: t.mono, fontSize: 11, color: t.textTer }}>{g.items.length}</span>
            </div>
            <div style={{ padding: '0 16px' }}>
              <div style={{
                borderRadius: 22, background: t.cardBg,
                border: `0.5px solid ${t.line}`, overflow: 'hidden',
                boxShadow: t.shadowSoft,
              }}>
                {g.items.map((task, i) => <TaskRow key={i} t={t} task={task} first={i === 0} />)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <AcuityTabBar active="tasks" t={t} />
    </AcuityDevice>
  );
}

function TaskRow({ t, task, first }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
      borderTop: first ? 'none' : `0.5px solid ${t.line}`,
    }}>
      {/* Check */}
      <div style={{
        width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1,
        background: task.done ? t.gradMix : 'transparent',
        border: task.done ? 'none' : `1.5px solid ${t.mode === 'dark' ? 'oklch(1 0 0 / 0.22)' : 'oklch(0 0 0 / 0.22)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {task.done && <AcuityIcons.check color="#fff" size={12} weight={2.8} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: t.sans, fontSize: 15, color: task.done ? t.textTer : t.text,
          letterSpacing: -0.2, lineHeight: 1.35,
          textDecoration: task.done ? 'line-through' : 'none',
          textDecorationColor: t.textQuiet,
        }}>{task.text}</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
        }}>
          <span style={{
            fontFamily: t.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            padding: '2px 7px', borderRadius: 999,
            background: `oklch(0.65 0.14 ${task.hue} / 0.18)`,
            color: `oklch(${t.mode === 'dark' ? 0.78 : 0.55} 0.13 ${task.hue})`,
            textTransform: 'uppercase',
          }}>{task.theme}</span>
          <span style={{ fontFamily: t.sans, fontSize: 11, color: t.textTer }}>{task.from}</span>
        </div>
      </div>
      <AcuityIcons.chevron color={t.textTer} />
    </div>
  );
}

Object.assign(window, { TasksList, TASKS_DATA, TaskRow });
