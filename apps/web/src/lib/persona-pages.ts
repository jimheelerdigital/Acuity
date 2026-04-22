export interface PersonaPage {
  slug: string;
  title: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  painPoints: string[];
  solutionHeadline: string;
  solutionBody: string;
  features: Array<{ title: string; description: string }>;
  testimonial: {
    quote: string;
    name: string;
    detail: string;
  };
  ctaHeadline: string;
  accentColor: string;
}

export const PERSONA_PAGES: PersonaPage[] = [
  {
    slug: "anxiety",
    title: "Acuity for Anxiety — Nightly Voice Journaling to Calm Your Mind",
    metaDescription:
      "Acuity helps you manage anxiety with 60-second nightly voice journaling. AI detects anxiety triggers, breaks rumination loops, and tracks your patterns over time.",
    headline: "What if your anxiety had somewhere to go every night?",
    subheadline:
      "You can't think your way out of a thought spiral. Acuity gives your anxious mind a release valve — 60 seconds of talking before bed, and AI that spots the patterns your worry hides from you.",
    painPoints: [
      "You lie awake replaying conversations, rehearsing disasters, and spiraling into what-ifs that never resolve",
      "You've tried journaling but your anxious brain makes writing feel like another task to fail at",
      "You know your anxiety has triggers, but in the moment they all blur into one overwhelming wave",
    ],
    solutionHeadline: "Externalize the spiral. See the pattern. Break the loop.",
    solutionBody:
      "Every night, talk for 60 seconds. Say whatever's circling in your head — the worry, the dread, the thing you can't stop replaying. Acuity's AI listens, extracts the recurring themes, and shows you your anxiety patterns over time. When you can see that every Sunday night you spiral about Monday, or that specific people trigger specific fears, you stop being trapped inside the loop.",
    features: [
      {
        title: "Anxiety Trigger Detection",
        description:
          "Acuity's AI identifies the people, situations, and time patterns that consistently precede your anxiety spikes — things you'd never spot from inside the spiral.",
      },
      {
        title: "Cognitive Offloading",
        description:
          "Speaking your worries out loud moves them from rumination to record. Your brain can let go because something else is holding onto it now.",
      },
      {
        title: "Weekly Mood Narrative",
        description:
          "Every Sunday, get a report that maps your emotional week — when you were calm, when you spiraled, and what actually helped. Proof that it's not all bad, all the time.",
      },
    ],
    testimonial: {
      quote:
        "I used to lie in bed for two hours with my brain on fire. Now I do my 60 seconds, and it's like I handed the worry to someone else to hold. The weekly report showed me that 80% of my anxiety was about one coworker. I never would've seen that on my own.",
      name: "Rachel M.",
      detail: "34, marketing coordinator",
    },
    ctaHeadline: "Give your anxiety somewhere to land tonight.",
    accentColor: "violet",
  },
  {
    slug: "adhd",
    title: "Acuity for ADHD — Voice-First Journaling That Works With Your Brain",
    metaDescription:
      "Acuity is built for ADHD brains. Talk for 60 seconds, AI extracts your tasks and priorities. No writing, no apps to check. Just speak and let go.",
    headline: "ADHD brains have 100 tabs open. Acuity closes them.",
    subheadline:
      "You don't need another productivity app you'll abandon in a week. Acuity is 60 seconds of talking — voice-first, zero friction — and AI that catches the tasks and ideas your working memory is about to drop.",
    painPoints: [
      "You have brilliant ideas at 11pm that are completely gone by morning, and no note-taking system has ever stuck",
      "Your to-do list is scattered across 6 apps, 3 notebooks, and 47 mental sticky notes you've already lost",
      "You know what you should be doing but you can't hold onto priorities long enough to actually do them",
    ],
    solutionHeadline: "Talk it out. Acuity catches what your brain drops.",
    solutionBody:
      "No opening an app, no finding a pen, no typing into a tiny box. Just talk. Acuity's AI automatically extracts every task, idea, and priority from your 60-second brain dump. Your weekly report shows you what you keep saying you'll do but haven't — the accountability your ADHD brain actually needs.",
    features: [
      {
        title: "Automatic Task Extraction",
        description:
          "Mention something you need to do while rambling? Acuity catches it and adds it to your task list. No manual entry, no second step, no chance to forget.",
      },
      {
        title: "Voice-First, Zero Friction",
        description:
          "60 seconds of talking. That's it. No screen to stare at, no blank page to fill. The lowest-friction capture system your ADHD brain has ever used.",
      },
      {
        title: "Priority Pattern Tracking",
        description:
          "Acuity spots what you keep mentioning but never acting on, what you're hyperfocusing on at the expense of everything else, and where your attention actually goes week to week.",
      },
    ],
    testimonial: {
      quote:
        "Every productivity app becomes another thing I feel guilty about not using. Acuity is the first one that stuck because it's just talking. I ramble for a minute before bed, and in the morning I have a clean task list I didn't have to write. That's never happened before.",
      name: "Devon K.",
      detail: "28, software developer with ADHD",
    },
    ctaHeadline: "Stop trying to remember everything. Start talking.",
    accentColor: "amber",
  },
  {
    slug: "remote-workers",
    title: "Acuity for Remote Workers — The Shutdown Ritual You're Missing",
    metaDescription:
      "Remote workers need a way to leave work at work. Acuity's 60-second nightly debrief creates the boundary your home office doesn't have.",
    headline: "The end-of-day ritual remote workers are missing.",
    subheadline:
      "There's no commute to decompress. No door to close between you and your job. Acuity gives you a 60-second shutdown ritual that draws the line your apartment never will.",
    painPoints: [
      "You close your laptop at 6pm but you're still mentally answering Slack messages at midnight",
      "Your bedroom is your office is your break room is your everything — there's no physical boundary to signal 'work is over'",
      "You can't remember the last time you had an evening that felt fully yours, not borrowed from tomorrow's to-do list",
    ],
    solutionHeadline: "Clock out for real. In 60 seconds.",
    solutionBody:
      "The commute used to be your transition. Now you need something else. Acuity's nightly debrief takes 60 seconds: say what happened today, what's lingering, what can wait until tomorrow. Your brain gets the signal that the workday is done. Over time, your weekly report shows whether your work-life boundary is holding — or slowly dissolving.",
    features: [
      {
        title: "Shutdown Ritual",
        description:
          "A 60-second verbal close-out that signals to your brain that the workday is finished. Capture tomorrow's priorities so you can stop holding them in your head tonight.",
      },
      {
        title: "Work-Life Balance Tracking",
        description:
          "Acuity tracks how often work dominates your nightly entries. When your personal life starts disappearing from the data, you'll see it before you feel it.",
      },
      {
        title: "Tomorrow's Task Capture",
        description:
          "Mention what needs to happen tomorrow and Acuity extracts it cleanly. You wake up to a list instead of a fog of half-remembered obligations.",
      },
    ],
    testimonial: {
      quote:
        "I work from my kitchen table and I was never 'off.' My partner said I was always somewhere else even when I was right there. Acuity became my fake commute — 60 seconds to dump the day, and then I'm actually present. The weekly report showed me I was mentioning work in every single entry. That was a wake-up call.",
      name: "James L.",
      detail: "31, remote product manager",
    },
    ctaHeadline: "Build the boundary your home office can't.",
    accentColor: "sky",
  },
  {
    slug: "new-parents",
    title: "Acuity for New Parents — 60 Seconds to Track Your Own Well-Being",
    metaDescription:
      "New parents track feedings, diapers, and naps — but who tracks you? Acuity's 60-second voice journal keeps you visible during the hardest season.",
    headline: "You're tracking your baby's everything. Who's tracking yours?",
    subheadline:
      "You know exactly how many ounces they drank and when they last slept. But you couldn't tell your doctor when you last felt like yourself. Acuity takes 60 seconds — because that's all you have.",
    painPoints: [
      "You haven't had a thought that wasn't about the baby in weeks, and you're not sure who you are outside of 'parent' anymore",
      "Everyone asks how the baby is doing — no one asks how you're actually holding up, and you've stopped asking yourself",
      "You're too exhausted to journal, too overwhelmed to meditate, and too touched-out to talk to anyone about it",
    ],
    solutionHeadline: "60 seconds. Eyes closed. Just your voice.",
    solutionBody:
      "While the baby sleeps — or screams — talk for one minute. No screen to stare at with blurry, sleep-deprived eyes. Just say how you're feeling. Acuity tracks your mood, energy, and emotional state across the weeks so you can see the trajectory you're too tired to notice. It's not self-care theater. It's a 60-second check-in with yourself.",
    features: [
      {
        title: "Mood Tracking Through Exhaustion",
        description:
          "Too tired to rate your mood on a scale? Just talk. Acuity's AI reads the emotional tenor of your voice entry and tracks it for you — no scales, no checkboxes.",
      },
      {
        title: "Hands-Free, Eyes-Free",
        description:
          "Start your entry while rocking the baby, lying in the dark, or pacing the hallway. Voice-first means you don't need your hands or your reading glasses.",
      },
      {
        title: "Postpartum Pattern Visibility",
        description:
          "Your weekly narrative shows emotional patterns across the week — good days, hard days, and whether the hard days are getting more frequent. Data to bring to your next appointment if you need it.",
      },
    ],
    testimonial: {
      quote:
        "At 3am I'd be nursing and crying and I couldn't even explain why. I started doing Acuity entries in the dark while she fed. My weekly report showed that I was happy during the day but falling apart every night. My midwife said that pattern was really important to catch early. 60 seconds probably saved me.",
      name: "Priya N.",
      detail: "29, first-time mom, 4 months postpartum",
    },
    ctaHeadline: "You deserve 60 seconds of your own attention.",
    accentColor: "rose",
  },
  {
    slug: "burnout",
    title: "Acuity for Burnout — Detect the Patterns Before You Break",
    metaDescription:
      "Burnout builds slowly in patterns you can't see. Acuity's AI tracks mood, work mentions, and energy over time to catch burnout before it catches you.",
    headline:
      "Burnout doesn't happen overnight. It builds in the patterns you can't see.",
    subheadline:
      "By the time you realize you're burned out, you've been burning for months. Acuity watches for the signals — declining mood, shrinking personal life, creeping cynicism — and shows you the trajectory before you hit the wall.",
    painPoints: [
      "You keep saying 'I just need to get through this week' but it's been every week for six months",
      "You used to love your work. Now you feel nothing about it, and that absence of feeling scares you more than stress ever did",
      "You're performing fine on the outside but running on fumes inside, and no one around you can tell the difference",
    ],
    solutionHeadline: "An early warning system for your own burnout.",
    solutionBody:
      "Every night, 60 seconds. Acuity's AI doesn't just listen — it watches the trends. When your entries start skewing more negative, when work takes over every single entry, when hobbies and friends stop appearing in your data, the weekly report flags it. You get a burnout signal weeks before you'd have noticed it yourself.",
    features: [
      {
        title: "Burnout Pattern Detection",
        description:
          "Acuity tracks the ratio of work-to-personal mentions, mood trajectory over weeks, and the disappearance of joy indicators — the classic burnout fingerprint.",
      },
      {
        title: "Energy & Engagement Tracking",
        description:
          "Your weekly narrative shows not just what you did, but how you felt about it. Watch for the shift from stressed-but-engaged to numb-and-going-through-the-motions.",
      },
      {
        title: "Recovery Visibility",
        description:
          "When you start making changes, Acuity shows whether they're working. See your mood trajectory bend back upward. Proof that the boundary you set or the vacation you took actually helped.",
      },
    ],
    testimonial: {
      quote:
        "My Acuity report showed me that I hadn't mentioned a single friend, hobby, or anything non-work in three straight weeks. I thought I was 'busy.' The data said I was disappearing. I showed it to my therapist and she said that was textbook pre-burnout. I took a leave two weeks later. I'm glad I caught it.",
      name: "Marcus T.",
      detail: "38, engineering director",
    },
    ctaHeadline: "Catch it early. Your future self will thank you.",
    accentColor: "emerald",
  },
  {
    slug: "students",
    title: "Acuity for Students — Track Stress, Capture Tasks, Stay on Top of It",
    metaDescription:
      "College and grad students: use Acuity's 60-second voice journal to manage stress, capture deadlines, and spot when you're overextending before you crash.",
    headline: "The study tool no one told you about: your own voice.",
    subheadline:
      "You're juggling classes, deadlines, social pressure, and the creeping feeling that everyone else has it figured out. Acuity gives you 60 seconds to dump it all — and AI that shows you what's actually overwhelming you versus what just feels that way.",
    painPoints: [
      "You have five deadlines, three group projects, and a social life you're failing at, and everything feels equally urgent and impossible",
      "You spend more time worrying about work than actually doing it, then pull all-nighters fueled by guilt and Red Bull",
      "You compare yourself to classmates who seem calm and competent while you're barely holding it together behind a smile",
    ],
    solutionHeadline: "60 seconds to clear the noise. AI to find the signal.",
    solutionBody:
      "Talk through your day before bed. What's due, what's stressing you, what you're avoiding. Acuity extracts your tasks, tracks your stress levels across the semester, and shows you patterns — like how you always spiral on Sundays, or how your confidence drops after certain classes. It's the self-awareness you need to get through school without losing yourself.",
    features: [
      {
        title: "Deadline & Task Capture",
        description:
          "Mention a paper due Thursday or a meeting with your advisor? Acuity catches it and puts it on your extracted task list. No planners to maintain, no apps to forget about.",
      },
      {
        title: "Stress Pattern Mapping",
        description:
          "See which classes, days, and situations spike your stress. Your weekly report reveals whether you're on a manageable rhythm or heading toward a crash.",
      },
      {
        title: "Imposter Syndrome Tracker",
        description:
          "Acuity detects recurring self-doubt themes and shows you how often you felt incapable versus how often things actually went wrong. Spoiler: the ratio will surprise you.",
      },
    ],
    testimonial: {
      quote:
        "I was pulling all-nighters every week and thought that was normal. My Acuity report showed that I only mentioned positive things about one class — everything else was dread. I dropped a course I was taking out of obligation and suddenly I could breathe again. I wish I'd had this freshman year.",
      name: "Aisha R.",
      detail: "21, junior studying biochemistry",
    },
    ctaHeadline: "Stop surviving the semester. Start understanding it.",
    accentColor: "indigo",
  },
  {
    slug: "entrepreneurs",
    title: "Acuity for Entrepreneurs — Your Nightly Co-Founder for Mental Clarity",
    metaDescription:
      "Solo entrepreneurs need someone to debrief with. Acuity's 60-second AI voice journal captures decisions, tracks mental load, and writes your weekly review.",
    headline: "You run a business. Who's running your headspace?",
    subheadline:
      "You make 200 decisions a day with no one to talk them through with. By 10pm your brain is fried and you can't tell which fire actually matters. Acuity is the debrief partner your solo venture is missing.",
    painPoints: [
      "You wear every hat — CEO, marketer, accountant, support — and by evening you can't remember what you actually accomplished versus just survived",
      "You have no co-founder, no manager, no one who asks 'how are you holding up?' with the context to understand the answer",
      "Decision fatigue is making you avoid important choices, so you stay busy on easy tasks and call it productivity",
    ],
    solutionHeadline: "Debrief with AI that actually remembers your context.",
    solutionBody:
      "Every night, dump the day in 60 seconds. What shipped, what's stuck, what's keeping you up. Acuity's AI extracts your action items, tracks your focus areas week over week, and generates the founder's weekly review you'd never sit down to write. See where your time and energy are actually going — not where you think they're going.",
    features: [
      {
        title: "Founder's Weekly Review",
        description:
          "Every week, Acuity writes a narrative review of your business and mental state — wins, blockers, shifting priorities, and patterns in your decision-making. The investor update for yourself.",
      },
      {
        title: "Decision Fatigue Tracking",
        description:
          "Acuity spots when you're avoiding big decisions in favor of busywork, when your entries become more overwhelmed, and when your strategic thinking starts degrading.",
      },
      {
        title: "Goal Drift Detection",
        description:
          "Said you'd focus on sales this quarter? Acuity shows you if your nightly entries are about product, support, or anything but sales. Catch the drift before the quarter is gone.",
      },
    ],
    testimonial: {
      quote:
        "I was working 14-hour days and couldn't explain what I was actually building anymore. My Acuity weekly review showed that I spent 80% of my mental energy on customer support fires and almost none on the product roadmap. That one insight changed how I structured my entire week. It's like having a board advisor for $10 a month.",
      name: "Carlos V.",
      detail: "33, solo SaaS founder",
    },
    ctaHeadline: "Build the business. Let Acuity watch your back.",
    accentColor: "purple",
  },
  {
    slug: "creatives",
    title: "Acuity for Creatives — Capture Ideas Before They Vanish",
    metaDescription:
      "Writers, artists, and musicians: Acuity captures your fleeting creative ideas with 60-second voice entries. Never lose an insight to sleep again.",
    headline: "Your best ideas come at the worst times. Acuity catches them.",
    subheadline:
      "That perfect lyric at 2am. The plot twist in the shower. The design concept on the edge of sleep. By morning, they're ghosts. Acuity captures your creative sparks in 60 seconds of voice — and connects them into patterns you'd never see in a sketchbook.",
    painPoints: [
      "You've lost more good ideas to sleep than you've ever captured in a notebook, and every morning feels like a creative crime scene",
      "Your emotional highs and lows fuel your best work, but you can't seem to channel them on demand — only in retrospect",
      "You have scraps of ideas in 12 different apps, 4 notebooks, and a voice memo graveyard you'll never listen back to",
    ],
    solutionHeadline: "Turn fleeting sparks into a creative archive.",
    solutionBody:
      "Talk for 60 seconds before bed. Dump the ideas, the frustrations, the breakthroughs, the fragments. Acuity doesn't just record — it extracts themes, connects recurring ideas across entries, and shows you the creative threads running through your subconscious. Your weekly report is a map of your creative mind that no journal could match.",
    features: [
      {
        title: "Idea Extraction & Tagging",
        description:
          "Every creative fragment you mention gets captured and tagged. Acuity connects tonight's offhand comment to last Tuesday's breakthrough — surfacing patterns in your creative thinking.",
      },
      {
        title: "Emotional-Creative Correlation",
        description:
          "See which emotional states produce your best ideas. Your weekly report maps mood to creative output, revealing the conditions your best work actually needs.",
      },
      {
        title: "Theme Tracking Across Entries",
        description:
          "That thing you keep coming back to — the image, the idea, the obsession? Acuity tracks recurring creative themes so you can see what your subconscious is trying to tell you to make.",
      },
    ],
    testimonial: {
      quote:
        "I'm a songwriter and my best lines always come right before I fall asleep. I used to grab my phone and type gibberish I couldn't read in the morning. Now I talk into Acuity for 60 seconds. Last month's report showed me I'd been circling the same three metaphors for weeks — that became the backbone of my EP. It's like having a creative partner with perfect memory.",
      name: "Kai J.",
      detail: "26, indie singer-songwriter",
    },
    ctaHeadline: "Never lose another idea to the morning.",
    accentColor: "fuchsia",
  },
  {
    slug: "couples",
    title: "Acuity for Couples — Individual Clarity for Better Relationships",
    metaDescription:
      "Acuity helps couples communicate better. Individual 60-second voice journals reveal relationship patterns, unspoken needs, and what actually matters.",
    headline: "The 60-second habit that's saving relationships.",
    subheadline:
      "You don't fight about the dishes. You fight about what the dishes represent. Acuity's nightly debrief helps each partner see their own patterns — what they're avoiding, what keeps coming up, what they actually need — so conversations start with clarity instead of accusations.",
    painPoints: [
      "You have the same argument every few weeks and neither of you can explain what it's really about underneath the surface trigger",
      "You hold things in all day and then unload on your partner at 10pm when neither of you has the bandwidth to listen",
      "You've both said 'we need to communicate better' a hundred times but have no idea what that actually looks like in practice",
    ],
    solutionHeadline: "Know yourself first. Show up to the conversation second.",
    solutionBody:
      "Each partner does their own 60-second nightly entry. Not about each other — about themselves. What stressed you, what you need, what you're grateful for. Acuity's AI reveals patterns: that you always get critical when you're anxious, or that your partner's complaints spike on days they feel unappreciated. You show up to difficult conversations already knowing what's underneath.",
    features: [
      {
        title: "Individual Pattern Detection",
        description:
          "See your own emotional patterns clearly — when you're triggered, what you're avoiding, what your complaints are really about. Self-awareness before conversation.",
      },
      {
        title: "Recurring Theme Surfacing",
        description:
          "Acuity shows you what you keep bringing up night after night. If 'feeling unheard' appears 12 times in a month, that's not a bad day — that's a pattern that needs addressing.",
      },
      {
        title: "Gratitude & Appreciation Tracking",
        description:
          "Your weekly report includes the positive things you mentioned about your partner and your relationship. On hard weeks, it's a reminder that the good is still there in the data.",
      },
    ],
    testimonial: {
      quote:
        "My wife and I both use Acuity separately. We don't share entries, but we share insights. I realized from my report that I mentioned feeling 'dismissed' almost every day — and I'd never once told her that directly. When I finally said it, she cried because she had no idea. That one word changed everything.",
      name: "David & Leah W.",
      detail: "Both 36, married 8 years, two kids",
    },
    ctaHeadline: "Understand yourself first. The relationship follows.",
    accentColor: "rose",
  },
  {
    slug: "grief",
    title: "Acuity for Grief — A Safe Space to Talk Every Night",
    metaDescription:
      "Processing grief is a journey. Acuity gives you 60 seconds each night to talk through loss, track healing over time, and see the progress you can't feel.",
    headline: "You don't have to process grief alone.",
    subheadline:
      "Grief doesn't follow a schedule. It hits at 2pm on a Tuesday or 11pm when you hear their song. Acuity gives you a place to put it every night — not to fix it, not to analyze it, just to say it out loud and know that something is tracking the journey even when you can't.",
    painPoints: [
      "People stopped asking how you're doing after a few weeks, but the grief didn't stop — it just went underground where no one can see it",
      "Some days you feel okay and then feel guilty for feeling okay, and you can't tell if you're healing or just going numb",
      "You don't want therapy right now, but you also can't keep carrying this alone with nowhere to put it down",
    ],
    solutionHeadline: "A place for your grief. Every night. No pressure.",
    solutionBody:
      "Just talk. Say their name. Say what you miss. Say you're angry, or say nothing happened today and that felt wrong too. Acuity holds it all without judgment, and over weeks and months, your report shows you the shape of your grief — the slow, non-linear, real trajectory of healing that you can't feel from inside it.",
    features: [
      {
        title: "Grief Journey Tracking",
        description:
          "Grief isn't linear and Acuity doesn't pretend it is. Your weekly report maps the real shape of your loss — the setbacks, the breakthroughs, the quiet plateaus — so you can see you're moving even when it doesn't feel like it.",
      },
      {
        title: "Safe Night Ritual",
        description:
          "Nighttime is the hardest. Acuity gives you a structured 60 seconds to put down the weight before you try to sleep. Not therapy, not advice — just a witness.",
      },
      {
        title: "Memory Preservation",
        description:
          "The stories you tell about them in your entries — the funny ones, the painful ones, the tiny details — are captured and preserved. Your grief journal becomes a memory archive too.",
      },
    ],
    testimonial: {
      quote:
        "After my dad died, everyone moved on after a month but I was still drowning. I started talking to Acuity every night just to say his name. Three months later, my report showed me that I'd gone from talking about pain every night to talking about memories. I was healing and I didn't even know it. Seeing that saved me.",
      name: "Nina S.",
      detail: "41, lost her father to cancer",
    },
    ctaHeadline: "Your grief deserves a place to rest tonight.",
    accentColor: "teal",
  },
  {
    slug: "career-change",
    title: "Acuity for Career Change — Let Your Voice Notes Reveal the Answer",
    metaDescription:
      "Considering a career change? Acuity's AI analyzes your nightly voice entries to surface what drains you, what energizes you, and what you really want.",
    headline:
      "Thinking about a career change? Your voice notes already know the answer.",
    subheadline:
      "You've been going back and forth for months. Should you stay or go? What would you even do instead? Acuity doesn't tell you what to do — it shows you what you've already been telling yourself, night after night, in the patterns you can't see.",
    painPoints: [
      "You spend Sunday evenings dreading Monday but can't articulate exactly what's wrong — just a sinking feeling that this isn't it",
      "You keep waiting for clarity to strike but instead you just oscillate between 'it's not that bad' and 'I can't do this anymore'",
      "You're terrified of making the wrong choice so you make no choice, and another year passes while you stay stuck in limbo",
    ],
    solutionHeadline: "Stop guessing. Start listening to your own data.",
    solutionBody:
      "Talk every night for a month. Don't try to figure anything out — just say what happened, how it felt, what drained you, what gave you energy. Acuity's AI finds the patterns: what you consistently complain about, what lights you up, what you keep fantasizing about, and what you're avoiding. After 30 entries, your weekly reports read like a career clarity roadmap written by someone who knows you better than you know yourself.",
    features: [
      {
        title: "Energy & Drain Mapping",
        description:
          "Acuity categorizes what consistently energizes you versus what drains you. After a few weeks, the data is undeniable — and it cuts through the noise of fear and obligation.",
      },
      {
        title: "Recurring Desire Detection",
        description:
          "That thing you keep mentioning — the side project, the different field, the 'what if I just...' — Acuity tracks how often it appears and how your energy shifts when you talk about it.",
      },
      {
        title: "Decision Clarity Report",
        description:
          "Your weekly narrative synthesizes the themes across your entries. It's not advice. It's a mirror — showing you what you've been saying to yourself when nobody's listening.",
      },
    ],
    testimonial: {
      quote:
        "I was stuck for two years. Acuity showed me that I mentioned 'teaching' in 23 out of 30 entries. Not as a plan, just naturally — 'I wish I could explain this to someone,' 'I love when I get to mentor the junior team.' The data made it obvious. I'm getting my teaching certification now.",
      name: "Jordan P.",
      detail: "35, former data analyst, future teacher",
    },
    ctaHeadline: "Your next chapter is already in the data. Start talking.",
    accentColor: "amber",
  },
  {
    slug: "nurses",
    title: "Acuity for Nurses — 60 Seconds to Process After 12-Hour Shifts",
    metaDescription:
      "Nurses carry impossible emotional weight. Acuity's 60-second voice journal helps healthcare workers process the day and track compassion fatigue over time.",
    headline: "12-hour shifts. Zero time to process. Acuity gives you 60 seconds.",
    subheadline:
      "You held someone's hand while they died, then charted for an hour, then drove home and were supposed to be 'normal.' You don't need a 30-minute journaling practice. You need 60 seconds to put the shift down before it follows you to bed.",
    painPoints: [
      "You absorb trauma all day and then go home and feel guilty for being upset because 'at least you're not the patient'",
      "You can't talk to friends or family about what you saw today because they wouldn't understand and you'd have to comfort them",
      "You've stopped feeling things at work and you're not sure if that's professionalism or a warning sign",
    ],
    solutionHeadline: "Put the shift down. In 60 seconds. In private.",
    solutionBody:
      "In the parking lot, in your car, on the drive home — 60 seconds of talking. Not a debrief for your charge nurse. For you. Say what hit you today, what you're carrying, what you need to let go of. Acuity tracks your compassion fatigue patterns over weeks, so you can see when you're depleting faster than you're recovering.",
    features: [
      {
        title: "Compassion Fatigue Tracking",
        description:
          "Acuity detects the slow erosion — when your entries shift from processing emotions to flat, detached recounting. That shift is a signal, and Acuity catches it before you burn out.",
      },
      {
        title: "60-Second Emotional Debrief",
        description:
          "No journaling practice, no meditation app, no hour you don't have. Voice-first, 60 seconds, done. The lowest-energy way to process the highest-stress job.",
      },
      {
        title: "Weekly Resilience Report",
        description:
          "Your weekly narrative tracks emotional load, recovery patterns, and whether your days off are actually restoring you. Data to advocate for yourself — or to show your own therapist.",
      },
    ],
    testimonial: {
      quote:
        "I lost a pediatric patient and went straight to my next admit. Didn't process it for weeks. Started using Acuity in my car after shifts. My report showed I mentioned 'I'm fine' eleven times in two weeks, which is apparently what I say when I'm not fine at all. Now my charge nurse uses it too.",
      name: "Bri C.",
      detail: "29, pediatric ICU nurse, night shift",
    },
    ctaHeadline: "You carry enough. Let something carry this.",
    accentColor: "emerald",
  },
  {
    slug: "teachers",
    title: "Acuity for Teachers — Manage Your Own Mind While Managing 30 Others",
    metaDescription:
      "Teachers give everything to their students. Acuity's 60-second voice journal helps educators track burnout, process emotional labor, and protect their energy.",
    headline: "You manage 30 minds a day. Who manages yours?",
    subheadline:
      "You're a teacher, counselor, referee, motivator, and admin — all before lunch. By 3pm you're empty. Acuity's nightly debrief helps you see what's actually draining you, what still lights you up, and whether you're heading toward a wall.",
    painPoints: [
      "You bring work home every night — not just papers to grade, but the kid who's struggling and the parent who yelled and the meeting that wasted an hour",
      "You became a teacher to make a difference but spend most of your energy on paperwork, politics, and managing behaviors instead of teaching",
      "You're emotionally exhausted but feel guilty complaining because 'you knew what you signed up for' — except you didn't, not really",
    ],
    solutionHeadline: "See what's draining you. Protect what fills you up.",
    solutionBody:
      "Sixty seconds after the school day ends. Talk about the wins, the frustrations, the kid who finally got it, the system that's failing you. Acuity's AI separates what energizes you from what depletes you and tracks those ratios over time. Your weekly report becomes the evidence you need — whether that's to set better boundaries, switch schools, or remember why you started.",
    features: [
      {
        title: "Energy Source vs. Drain Analysis",
        description:
          "Acuity separates what fills your cup (the teaching moments) from what empties it (the admin, the politics). See the ratio shift week by week and intervene before the drains win.",
      },
      {
        title: "Emotional Labor Tracking",
        description:
          "Teaching is emotional labor disguised as a profession. Acuity tracks the weight of student needs, parent interactions, and administrative pressure so you can see the invisible load you're carrying.",
      },
      {
        title: "Burnout Early Warning",
        description:
          "When your entries stop mentioning students and start focusing only on frustration and fatigue, Acuity flags the shift. Catch the slide before you become the teacher who stopped caring.",
      },
    ],
    testimonial: {
      quote:
        "I cried in the supply closet three times last semester and told everyone I was fine. My Acuity report showed that I mentioned wanting to quit in 15 out of 20 entries — but also that every single positive entry was about one specific class. I transferred to teach that grade full-time. It changed everything.",
      name: "Ms. Andrea T.",
      detail: "32, 5th grade teacher, public school",
    },
    ctaHeadline: "You pour into everyone else. Pour 60 seconds into yourself.",
    accentColor: "cyan",
  },
  {
    slug: "therapists",
    title: "Acuity for Therapists — Your Own Emotional Processing Tool",
    metaDescription:
      "Therapists absorb client emotions all day with nowhere to put them. Acuity's 60-second voice journal gives clinicians their own pattern detection system.",
    headline: "You listen to everyone else all day. Who listens to you?",
    subheadline:
      "You hold space for other people's darkest moments and then drive home and make dinner like nothing happened. You know better than anyone that unexpressed emotions compound. Acuity gives you your own tool — the one you'd prescribe to a client.",
    painPoints: [
      "You absorb your clients' grief, anxiety, and trauma all day, and by evening you're carrying emotional weight that isn't yours but feels like it is",
      "You know you should have your own reflective practice, but after 8 sessions a day the last thing you want is more introspection",
      "You can't talk about your work with friends, your supervisor sessions are monthly, and your own therapy appointment is never soon enough",
    ],
    solutionHeadline: "Process your own patterns with the rigor you give your clients.",
    solutionBody:
      "Sixty seconds every evening. Not clinical notes — your emotional residue from the day. What session stuck with you, where you felt activated, what you're carrying home. Acuity's AI detects your patterns the same way you detect your clients' patterns: recurring themes, emotional shifts, blind spots. Your weekly report is supervision between supervisions.",
    features: [
      {
        title: "Countertransference Awareness",
        description:
          "Acuity tracks which clients and themes keep appearing in your entries, surfacing potential countertransference patterns you might not be catching in the session.",
      },
      {
        title: "Vicarious Trauma Monitoring",
        description:
          "Your weekly report flags shifts in your emotional baseline — creeping cynicism, emotional flatness, hypervigilance — the classic signs of vicarious traumatization that clinicians miss in themselves.",
      },
      {
        title: "Professional Reflection Archive",
        description:
          "Build a longitudinal record of your clinical emotional experience. Bring patterns to supervision, track your growth as a clinician, and maintain the self-awareness your license demands.",
      },
    ],
    testimonial: {
      quote:
        "I see nine clients a day. I was going through the motions and calling it 'professional detachment.' My Acuity report showed that I mentioned feeling 'empty' after sessions 14 times in one month. I brought it to my supervisor and she said, 'This is exactly what vicarious trauma looks like.' I needed my own tool to see it.",
      name: "Dr. Sam W.",
      detail: "44, licensed clinical psychologist, private practice",
    },
    ctaHeadline: "You deserve the self-awareness you give your clients.",
    accentColor: "violet",
  },
  {
    slug: "overthinkers",
    title: "Acuity for Overthinkers — Get It Out of Your Head, Into Something Useful",
    metaDescription:
      "Chronic overthinker? Acuity's 60-second voice journal gives racing thoughts somewhere to go. AI finds patterns in your mental loops so you can break them.",
    headline: "Your brain won't stop. Give it somewhere to go.",
    subheadline:
      "You've replayed that conversation 40 times. You've considered every possible outcome. You've made pro-con lists in your head for decisions that don't even matter. Acuity gives your overactive mind an exit ramp — 60 seconds of talking turns circular thinking into linear insight.",
    painPoints: [
      "You can't make a simple decision without considering 15 scenarios, second-guessing yourself, and then regretting whichever option you chose",
      "Your brain treats everything like a problem to solve, including things that aren't problems, and the processing never actually reaches a conclusion",
      "People tell you to 'just stop overthinking' as if you haven't tried, as if there's an off switch you simply haven't found yet",
    ],
    solutionHeadline: "Externalize the loop. Watch the pattern dissolve.",
    solutionBody:
      "Here's what overthinkers don't realize: the loop continues because the thought has nowhere to go. It stays in your head, circling. Acuity breaks the circuit. Speak the worry, the analysis, the spiral — out loud, into something external. When the thought is captured, your brain gets the signal that it's been processed. Your weekly report shows you which topics are genuinely worth thinking about and which ones are just your brain's screensaver.",
    features: [
      {
        title: "Loop Detection",
        description:
          "Acuity identifies topics that appear in entry after entry without resolution. When you see that you've mentioned the same worry 12 nights in a row, the loop becomes visible — and breakable.",
      },
      {
        title: "Cognitive Offloading",
        description:
          "Speaking a thought out loud and having it captured tells your brain 'this is handled.' The rumination circuit completes. The thought can rest because it's been externalized.",
      },
      {
        title: "Worry vs. Reality Tracking",
        description:
          "Your weekly report shows what you worried about last week and what actually happened. Over time, you build evidence that 90% of your overthinking is about things that never materialize.",
      },
    ],
    testimonial: {
      quote:
        "I spent three weeks overthinking whether to text someone back. THREE WEEKS. When Acuity showed me I'd mentioned it in 19 out of 21 entries, I felt so absurd that I just texted them. It took 10 seconds. My brain had spent 60+ hours on a 10-second task. Seeing the pattern was the cure.",
      name: "Tommy L.",
      detail: "25, grad student, chronic overthinker",
    },
    ctaHeadline: "Your brain has been looping long enough. Give it an exit.",
    accentColor: "sky",
  },
  {
    slug: "introverts",
    title: "Acuity for Introverts — Process Internally, Understand Externally",
    metaDescription:
      "Introverts process deeply but rarely externalize. Acuity's private 60-second voice journal makes your inner world visible — no audience, no judgment.",
    headline: "You process the world internally. Acuity makes it visible.",
    subheadline:
      "You don't need to talk to more people. You need to talk to yourself — out loud, in private, where no one's watching. Acuity is the introvert's perfect tool: a 60-second voice journal with zero social energy required and AI that turns your inner world into patterns you can actually use.",
    painPoints: [
      "You process everything deeply but it all stays inside your head, where it becomes a tangled knot of half-formed thoughts no one else will ever see",
      "Journaling apps feel performative, therapy feels draining, and the idea of 'talking about your feelings' with another human sounds like punishment",
      "People mistake your quietness for simplicity, but inside you're running a continuous, complex inner monologue that deserves to be seen — just not by an audience",
    ],
    solutionHeadline: "Private. Voice-only. No audience. Just clarity.",
    solutionBody:
      "Acuity was practically designed for introverts. Talk in your room, in the dark, to no one. There's no social component, no sharing, no community feed. Just you, your voice, and AI that organizes the rich inner world you've been navigating alone. Your weekly report shows you the patterns of your internal life — made visible for the first time without requiring a single conversation.",
    features: [
      {
        title: "Zero Social Energy Required",
        description:
          "No profiles, no sharing, no community. Acuity is a completely private experience. Your entries exist only for you and the AI that processes them. The ultimate introvert-first design.",
      },
      {
        title: "Inner World Made Visible",
        description:
          "You think deeply. Acuity shows you the shape of those thoughts — recurring themes, emotional patterns, evolving ideas — without requiring you to explain yourself to another person.",
      },
      {
        title: "Voice in Private, Insights in Writing",
        description:
          "Talk when you're alone and comfortable. Receive your insights as a written weekly report you can read and reflect on at your own pace. Input mode: voice. Output mode: text. Perfectly introvert-shaped.",
      },
    ],
    testimonial: {
      quote:
        "I've never been able to journal because writing my feelings feels like performing for an invisible audience. Talking out loud alone in my apartment? That I can do. It's like thinking, but it actually goes somewhere. My weekly report showed me I think about connection way more than I realized — I'm not as anti-social as I thought. I just needed a private way to see it.",
      name: "Yuki H.",
      detail: "30, UX researcher, textbook introvert",
    },
    ctaHeadline: "Your inner world is rich. It's time to see it clearly.",
    accentColor: "indigo",
  },
  {
    slug: "managers",
    title: "Acuity for Managers — Debrief Your Leadership, Not Just Your Team",
    metaDescription:
      "People managers carry invisible weight. Acuity's 60-second nightly debrief tracks leadership patterns, team dynamics, and management growth over time.",
    headline: "You're responsible for everyone else's growth. What about yours?",
    subheadline:
      "You spent today in 1:1s, navigating team conflict, giving feedback that took more out of you than them, and wondering if you're actually good at this. Acuity's nightly debrief captures the leadership experience no one sees — and shows you the patterns that make you better or burn you out.",
    painPoints: [
      "You absorb your team's stress, shield them from chaos above, and carry both loads home with no one to debrief with",
      "You had three difficult conversations today and you're replaying all of them, wondering if you said the right thing or made it worse",
      "You got promoted for being good at the work, but no one taught you how to manage people — and you're figuring it out in real-time",
    ],
    solutionHeadline: "Lead better by understanding how you lead now.",
    solutionBody:
      "Sixty seconds after work. What went well, what was hard, who needed what, and how you feel about all of it. Acuity extracts patterns in your leadership — which team members you mention most (and least), what types of situations drain you, whether your management style shifts under pressure. Your weekly report is a leadership development tool disguised as a journal.",
    features: [
      {
        title: "Leadership Pattern Detection",
        description:
          "Acuity tracks how you talk about your team, your decisions, and your stress. See if you're micromanaging when anxious, avoiding certain conversations, or consistently energized by specific types of work.",
      },
      {
        title: "Team Dynamic Tracking",
        description:
          "Who keeps appearing in your entries? Who's draining your energy? Who do you never mention? Your nightly data reveals where your attention goes — and where it doesn't.",
      },
      {
        title: "Management Growth Report",
        description:
          "Your weekly narrative tracks your evolution as a leader. See how your reactions to conflict, feedback delivery, and team challenges change over months. Concrete evidence of growth.",
      },
    ],
    testimonial: {
      quote:
        "I realized from Acuity that I mentioned one team member in 90% of my entries — always about problems. My report made it clear I was spending all my energy on one person and neglecting a team of eight. I restructured my 1:1s, addressed the pattern, and my whole team's engagement scores went up. I couldn't see the imbalance until the data showed me.",
      name: "Rashid M.",
      detail: "39, VP of Engineering, manages 12 direct reports",
    },
    ctaHeadline: "Invest 60 seconds in the leader you're becoming.",
    accentColor: "teal",
  },
  {
    slug: "freelancers",
    title: "Acuity for Freelancers — The Accountability System You Actually Need",
    metaDescription:
      "Freelancers lack structure and accountability. Acuity's 60-second nightly debrief tracks goals, surfaces procrastination, and writes your weekly review.",
    headline: "No structure. No boss. No accountability. Until now.",
    subheadline:
      "Freedom was the dream. But no one told you freedom comes with no guardrails, no feedback loops, and no one to tell you that you've been 'about to start that project' for three weeks. Acuity is the structure you need without the structure you left behind.",
    painPoints: [
      "You set ambitious goals every Monday and by Friday you've done a fraction of them, but you're not sure where the time went",
      "You have no one checking in on you, no performance review, no team standup — and the freedom that felt liberating now feels like floating",
      "You procrastinate on client work and then panic-work at 2am, and the cycle repeats because there's nothing holding you accountable between invoice and deadline",
    ],
    solutionHeadline: "Build your own guardrails in 60 seconds a night.",
    solutionBody:
      "Every evening, debrief: what you did, what you avoided, what's due. Acuity automatically tracks your goals, captures your tasks, and writes the weekly review you'd never write yourself. Over time, it surfaces your procrastination patterns — which projects you avoid, when in the week you lose momentum, what you say you'll do but never actually start. It's accountability without a boss.",
    features: [
      {
        title: "Procrastination Pattern Detection",
        description:
          "Acuity tracks what you keep saying you'll do but don't. When the same task appears in 10 entries without completion, the pattern is undeniable — and that awareness is the first step to breaking it.",
      },
      {
        title: "Automated Weekly Review",
        description:
          "Every Sunday, Acuity generates a narrative review of your week — what shipped, what slipped, where your energy went, and how your goals are tracking. The review you need but would never sit down to write.",
      },
      {
        title: "Goal Tracking & Drift Alerts",
        description:
          "Set a quarterly goal in your entries and Acuity tracks whether your daily actions align with it. When you drift — and you will — the weekly report calls it out before a month disappears.",
      },
    ],
    testimonial: {
      quote:
        "I quit my job for freelance freedom and then spent six months watching Netflix until 2pm. Acuity showed me that I mentioned 'I need to start' 47 times in one month without ever starting. Seeing that number broke the spell. I restructured my entire workflow. Now my weekly Acuity review is my Monday morning standup — with myself.",
      name: "Sasha D.",
      detail: "27, freelance brand designer",
    },
    ctaHeadline: "Freedom needs structure. Build yours in 60 seconds.",
    accentColor: "amber",
  },
  {
    slug: "athletes",
    title: "Acuity for Athletes — Track the Mental Game That Wins Championships",
    metaDescription:
      "Athletes track physical performance but ignore the mental game. Acuity's 60-second voice journal tracks confidence, focus, and competitive mindset over time.",
    headline: "The mental game is the game. Start tracking it.",
    subheadline:
      "You track every rep, every split, every macro. But the thing that actually decides game day — your confidence, your focus, your pre-competition headspace — goes completely unmeasured. Acuity brings the same data-driven approach to your mental performance.",
    painPoints: [
      "You've had your best training weeks followed by your worst performances and you don't understand why — because you're only tracking the physical half",
      "Pre-competition anxiety makes you perform below your ability, and 'just relax' is about as useful as 'just run faster'",
      "You don't have a structured way to process bad performances, so losses linger in your head and contaminate the next competition",
    ],
    solutionHeadline: "Your mental performance log. 60 seconds a night.",
    solutionBody:
      "After training, after competition, after rest days — 60 seconds of voice. How do you feel about your performance? What's your confidence level? Are you dreading or excited about tomorrow? Acuity tracks your mental state alongside your physical calendar, revealing the mental patterns that predict peak performance and the ones that predict collapse.",
    features: [
      {
        title: "Confidence Trajectory Tracking",
        description:
          "Acuity maps your self-belief over time. See how confidence builds during training blocks and how it responds to wins, losses, injuries, and coaching feedback.",
      },
      {
        title: "Pre-Competition Mental Patterns",
        description:
          "Your entries before competitions reveal your mental state going in. Over a season, Acuity shows which pre-competition mindsets correlate with your best and worst performances.",
      },
      {
        title: "Recovery Mindset Monitoring",
        description:
          "Track how you mentally process setbacks. Are bad performances lingering for days or bouncing off? Your weekly report shows whether your mental recovery is keeping pace with physical recovery.",
      },
    ],
    testimonial: {
      quote:
        "My coach kept telling me my losses were mental. I didn't know what that meant until Acuity showed me that my confidence tanked every time I had a bad practice the week before a meet. My physical training was fine — my self-talk was sabotaging me. Now I use my Acuity report in my sports psych sessions. It's changed my competitive career.",
      name: "Elijah R.",
      detail: "22, Division I swimmer, 200m butterfly",
    },
    ctaHeadline: "Train your mind like you train your body. Start tonight.",
    accentColor: "cyan",
  },
  {
    slug: "chronic-pain",
    title: "Acuity for Chronic Pain — Track Flares, Mood, and Patterns in Your Words",
    metaDescription:
      "Living with chronic pain? Acuity's 60-second voice journal tracks flare triggers, mood-pain links, and energy patterns. Real data for real appointments.",
    headline: "Track what your body is telling you — in your own words.",
    subheadline:
      "Pain scales lie. '7 out of 10' doesn't capture what it's actually like — the frustration, the grief, the way it steals your plans and your patience. Acuity lets you describe your experience in your own voice, then finds the patterns that pain diaries miss.",
    painPoints: [
      "Doctors ask you to rate your pain 1-10 but that number means nothing — it can't capture the difference between 'managing' and 'barely surviving'",
      "You've tried tracking with apps and spreadsheets but when you're flaring, the last thing you can do is fill out a form with tiny checkboxes",
      "You know there are triggers and patterns but you're in too much pain to be your own detective, and by the time you see your doctor you've forgotten the details",
    ],
    solutionHeadline: "Your voice captures what pain scales can't.",
    solutionBody:
      "Talk for 60 seconds. Describe today — the pain, the mood, what you ate, how you slept, what you could and couldn't do. Acuity's AI finds the correlations you're too exhausted to track: sleep-to-flare patterns, stress-to-pain links, which treatments actually change your baseline. Print your weekly report and bring it to your next appointment. Give your doctor the data that actually matters.",
    features: [
      {
        title: "Flare Trigger Correlation",
        description:
          "Acuity analyzes your entries for patterns before flare-ups — sleep changes, stress spikes, weather mentions, food, activity levels. Over time, your triggers become visible in the data.",
      },
      {
        title: "Mood-Pain Connection Mapping",
        description:
          "Chronic pain and mental health are inseparable. Acuity tracks how your mood and pain levels interact — showing whether emotional stress is preceding physical flares or the other way around.",
      },
      {
        title: "Appointment-Ready Reports",
        description:
          "Your weekly narrative is a detailed, organized summary of your week with chronic pain. Bring it to your doctor, rheumatologist, or pain specialist. Finally, an answer better than 'I don't know, it's been a bad month.'",
      },
    ],
    testimonial: {
      quote:
        "I have fibromyalgia and my doctor kept asking me to keep a symptom diary. I couldn't — on bad days I can barely hold my phone. With Acuity I just talk from bed. My report showed that my worst flares happened 2-3 days after high-stress entries. My rheumatologist said that correlation was more useful than a year of pain scales. I cried in her office.",
      name: "Laura B.",
      detail: "45, living with fibromyalgia for 12 years",
    },
    ctaHeadline: "Your pain story deserves better than a number. Start talking.",
    accentColor: "fuchsia",
  },
];

export function getPersonaBySlug(slug: string): PersonaPage | undefined {
  return PERSONA_PAGES.find((p) => p.slug === slug);
}

export function getAllPersonaSlugs(): string[] {
  return PERSONA_PAGES.map((p) => p.slug);
}
