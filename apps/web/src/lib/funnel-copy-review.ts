/**
 * Funnel copy from the 2026-11-04 persona review (Keenan: "create the ideal
 * profile for the specific person going through that funnel ... are we
 * actually speaking to the person in this funnel? if not, make the changes").
 * One researched profile per funnel and gender (scratchpad personas/*.md,
 * summarized on the review page); this layer applies the resulting copy on
 * top of the configs in funnel-v9-config.ts. Step and option ids never change.
 */
import type { V9Config, V9Step } from "./funnel-v9-config";

type StepCopy = { title?: string; sub?: string; statement?: string; left?: string; right?: string; options?: Record<string, string> };
type Result = { name: string; line: string };
type SideCopy = { steps?: Record<string, StepCopy>; config?: Record<string, any> };

export const REVIEW_COPY: Record<string, { women: SideCopy; men: SideCopy }> = {
 "relief": {
  "women": {
   "steps": {
    "seen": {
     "title": "When you do write it down, what happens to the list?",
     "options": {
      "never": "I never have time to write it down",
      "ignore": "I stop looking at it"
     }
    },
    "help": {
     "title": "What would take the most off your mind?",
     "options": {
      "out": "Getting it out of my head",
      "once": "Saying it once and being done",
      "one": "Everything in one place",
      "nolist": "Not being the only one who remembers",
      "dates": "The dates kept straight for me"
     }
    },
    "week": {
     "title": "What are you keeping track of this week?"
    },
    "s-load": {
     "title": "Write it or say it?",
     "left": "Writing it all down works for me",
     "right": "I’d rather just say it and be done"
    },
    "commit": {
     "title": "Ready to stop carrying it all in your head?"
    }
   },
   "config": {
    "reassure": {
     "body": "You’re remembering the dates, the forms and everyone’s plans, and remembering to remember. Nobody could hold all of that.",
     "body2": "With Ripple, you just say it. It puts the tasks and dates you mention on one list. Nothing to set up or keep up."
    },
    "resultOutro": "None of this means you’re failing. It means you’re responsible for everything, and it all lives in one head. Ripple remembers it for you.",
    "vs": {
     "sub": "What changes when you say it once"
    }
   }
  },
  "men": {
   "steps": {
    "help": {
     "title": "What would take the most off your mind?",
     "options": {
      "out": "Getting it out of my head",
      "nothing": "Knowing nothing’s slipping",
      "once": "Saying it once and moving on",
      "one": "Everything in one place",
      "nolist": "Not having to remember it all",
      "dates": "The dates kept straight for me"
     }
    },
    "s-load": {
     "title": "Write it or say it?",
     "left": "Writing it down works for me",
     "right": "I’d rather just say it and move on"
    },
    "commit": {
     "title": "Ready to get back on top of it?"
    }
   },
   "config": {
    "reassure": {
     "body": "Work, home, the bills, the kids’ plans, and remembering to remember. Nobody could hold all of that.",
     "body2": "With Ripple, you just say it. It puts the tasks and dates you mention on one list. Nothing to set up or keep up."
    },
    "resultOutro": "None of this means you’re dropping the ball. It means it all lives in one head. Ripple remembers it for you.",
    "vs": {
     "sub": "What changes when you say it once"
    },
    "results": [
     {
      "name": "The Keeper of Everything",
      "line": "Work, home, the bills, everyone’s plans. It all runs through your head, with no backup."
     },
     {
      "name": "The List Juggler",
      "line": "You’ve tried writing it down. Keeping the list up became one more job."
     },
     {
      "name": "The Last in Line",
      "line": "Everyone else comes first. Your own goals keep getting pushed back."
     },
     {
      "name": "The Always-On Mind",
      "line": "Your head won’t switch off, because it’s holding all of it."
     },
     {
      "name": "The One Who Handles It",
      "line": "You handle more than anyone sees, and most of it lives in your head."
     }
    ]
   }
  }
 },
 "catch": {
  "women": {
   "steps": {
    "hook": {
     "statement": "I keep forgetting things I swore I’d remember."
    },
    "st-mid": {
     "statement": "I used to remember everything. Now things fall through."
    },
    "help": {
     "options": {
      "nothing": "Knowing it’s all written down"
     }
    },
    "s-sure": {
     "title": "How does this week feel?",
     "left": "I’ve got every date handled",
     "right": "Something’s bound to slip"
    },
    "st-close": {
     "statement": "I’d relax if it was all in one place, with the dates."
    },
    "commit": {
     "title": "Ready to say it once and let Ripple keep it?"
    }
   },
   "config": {
    "hookLine": "Say it once. Ripple puts it on your list, with the date.",
    "vs": {
     "left": "In your head",
     "sub": "Where it lands with Ripple",
     "rows": [
      [
       "Form due… Friday? Monday?",
       "On your list",
       "With the date"
      ],
      [
       "Mia’s birthday is when again?",
       "Every date",
       "In one place"
      ],
      [
       "Screenshot of a screenshot",
       "Said once",
       "Caught for you"
      ],
      [
       "Meant to reply. Forgot.",
       "Every promise",
       "Written down as you say it"
      ],
      [
       "What did I forget this week?",
       "Your week",
       "Laid out for you"
      ]
     ]
    },
    "results": [
     {
      "name": "The Overflow",
      "line": "It isn’t a memory problem. One head is holding more than any head can."
     },
     {
      "name": "The One Who Cares",
      "line": "When something slips, you carry it for days. That’s how much you care. You just need somewhere to put it all."
     },
     {
      "name": "The Human Calendar",
      "line": "Everyone’s dates live in your head, and there’s no backup when one falls out."
     },
     {
      "name": "The Juggler",
      "line": "You keep a lot in the air. Now and then one drops, and it’s always on you."
     }
    ]
   }
  },
  "men": {
   "steps": {
    "hook": {
     "statement": "I keep dropping the ball on stuff I said I’d handle."
    },
    "help": {
     "options": {
      "nothing": "Knowing it’s all written down"
     }
    },
    "s-sure": {
     "title": "How does this week look?",
     "left": "I’ve got every date handled",
     "right": "Something’s bound to slip"
    },
    "st-close": {
     "statement": "I’d breathe easier if it was all in one place, with the dates."
    },
    "commit": {
     "title": "Ready to say it once and know it’s handled?"
    }
   },
   "config": {
    "hookLine": "Say it once. Ripple puts it on your list, with the date.",
    "resultOutro": "None of this means you’re dropping the ball. It means there’s too much to hold in one head. Ripple holds it for you.",
    "vs": {
     "left": "In your head",
     "sub": "Where it lands with Ripple",
     "rows": [
      [
       "Form due… Friday? Monday?",
       "On your list",
       "With the date"
      ],
      [
       "When’s Dad’s birthday again?",
       "Every date",
       "In one place"
      ],
      [
       "Screenshot of a screenshot",
       "Said once",
       "Caught for you"
      ],
      [
       "Meant to reply. Forgot.",
       "Every promise",
       "Written down as you say it"
      ],
      [
       "What did I miss this week?",
       "Your week",
       "Laid out for you"
      ]
     ]
    },
    "results": [
     {
      "name": "The Overflow",
      "line": "It isn’t a memory problem. One head is holding more than any head can."
     },
     {
      "name": "The Guy Who Follows Through",
      "line": "When something slips, it bugs you for days. You hold yourself to a high bar. You just need a backup."
     },
     {
      "name": "The Human Calendar",
      "line": "Everyone’s dates live in your head, and there’s no backup when one falls out."
     },
     {
      "name": "The Juggler",
      "line": "You keep a lot in the air. Now and then one drops, and it’s always on you."
     }
    ]
   }
  }
 },
 "clarity": {
  "women": {
   "steps": {
    "repeat": {
     "sub": "Rough guess. Tired has a way of starting to feel normal."
    },
    "helps": {
     "title": "What used to make you feel like yourself?"
    },
    "st-mid": {
     "statement": "Some weeks I’m fine, some weeks I’m wiped, and I can’t tell what’s different."
    },
    "want": {
     "title": "What would you want Ripple to show you?",
     "options": {
      "habits": "Which habits I actually keep",
      "pattern": "How my mood moves week to week"
     }
    },
    "week": {
     "title": "What’s using up your week?",
     "sub": "Tap everything you’re carrying. Ripple would catch these from a debrief."
    },
    "s-know": {
     "title": "Could you name what’s draining you?",
     "left": "I could name it right now",
     "right": "I just feel tired, no idea why"
    },
    "st-close": {
     "statement": "If I could see what’s wearing me down, I’d know what to change."
    },
    "commit": {
     "title": "Ready to find out what’s draining you?"
    }
   },
   "config": {
    "hookLine": "Talk about your days. Ripple shows you what’s wearing you down.",
    "reassure": {
     "title": "There’s a reason you’re this tired. It’s just spread across your week.",
     "body": "A short night here, a hard call there, the walk you skipped, the weekend that didn’t recharge you. Living it, you only feel the tired, not the pattern.",
     "body2": "Ripple sees it. You talk about your days, and over the weeks it shows you what drains you, what lifts you and what keeps coming back.",
     "things": [
      "Tired again",
      "Skipped the walk",
      "Next week",
      "Short with the kids",
      "Up late again",
      "Weekend didn’t help",
      "Same argument",
      "Monday again"
     ],
     "cta": "That’s me"
    },
    "resultOutro": "Being this tired isn’t you doing life wrong. The reasons are in your days, in your own words. Ripple puts them in front of you, week by week.",
    "stamps": {
     "helps": {
      "walk": "Skipped this week",
      "friends": "Not since summer",
      "sleep": "Not lately",
      "move": "Next week",
      "quiet": "Someday",
      "fun": "Can’t remember"
     }
    },
    "results": [
     {
      "name": "The Long Haul",
      "line": "You’ve been running on empty for a long time and kept going anyway. That takes more than anyone sees."
     },
     {
      "name": "The Someday Self",
      "line": "You know what helps you. It just keeps landing on next week’s list."
     },
     {
      "name": "The Blurred Week",
      "line": "Every week runs into the next, so you never get to see what’s wearing you down."
     },
     {
      "name": "The Quiet Fader",
      "line": "You keep everything going, and a little of you slips away each week."
     }
    ]
   }
  },
  "men": {
   "steps": {
    "often": {
     "title": "How many days a week are you wiped?",
     "sub": "Each dot is a wiped day."
    },
    "repeat": {
     "sub": "Rough guess. After a while, wiped just feels normal."
    },
    "helps": {
     "title": "What used to help you reset?"
    },
    "why": {
     "title": "Do you know what’s wearing you down?"
    },
    "st-mid": {
     "statement": "Some weeks I’m fine, some weeks I’m wiped, and I can’t tell what’s different."
    },
    "want": {
     "title": "What would you want Ripple to show you?",
     "options": {
      "habits": "Which habits I actually keep",
      "pattern": "How my mood moves week to week"
     }
    },
    "week": {
     "title": "What’s eating up your week?",
     "sub": "Tap everything on your plate. Ripple would catch these from a debrief."
    },
    "s-know": {
     "title": "Could you name what’s wearing you down?",
     "left": "I could name it right now",
     "right": "I’m just wiped, no idea why"
    },
    "st-close": {
     "statement": "If I could see what’s wearing me down, I’d fix it."
    },
    "commit": {
     "title": "Ready to find out what’s wearing you down?"
    }
   },
   "config": {
    "hookLine": "Talk through your days. Ripple shows you what’s wearing you down.",
    "reassure": {
     "title": "There’s a reason you’re wiped. It’s just spread across your week.",
     "body": "A short night, a rough meeting, a skipped workout, a weekend that didn’t recharge you. Getting on with it, you only feel the tired, not the pattern.",
     "body2": "Ripple sees it. You talk through your days, and over the weeks it shows you what drains you, what recharges you and what keeps coming back.",
     "things": [
      "Wiped again",
      "Skipped the gym",
      "Next week",
      "Short with the kids",
      "Up late again",
      "Weekend didn’t help",
      "Same argument",
      "Monday again"
     ],
     "cta": "That’s me"
    },
    "resultOutro": "Being wiped all the time isn’t a toughness problem. The reasons are in your days, in your own words. Ripple lays them out, week by week.",
    "receipt": {
     "title": "Your week · on repeat",
     "stamp": "Same week, again",
     "stampSub": "and you can’t see why",
     "extra": {
      "label": "The stuff that keeps you sane",
      "value": "skipped"
     }
    }
   }
  }
 },
 "progress": {
  "women": {
   "steps": {
    "pain": {
     "options": {
      "stuck": "I don’t know what to change"
     }
    },
    "look": {
     "title": "When do you stop and check what’s working?",
     "options": {
      "never": "Never, I’m too busy"
     }
    },
    "slid": {
     "title": "What do you keep trying to change?"
    },
    "st-mid": {
     "statement": "On paper I’m fine. I just feel stuck, and I can’t say why."
    },
    "want": {
     "options": {
      "life": "Which part of my life needs me"
     }
    },
    "week": {
     "title": "What’s filling your week right now?",
     "sub": "Tap what’s on your list. It’s the stuff that crowds out what you’re trying to change."
    },
    "s-see": {
     "title": "When nothing changes, do you know why?",
     "left": "I know what’s holding me back",
     "right": "I have no idea why"
    },
    "st-close": {
     "statement": "If I could see what’s actually working, I’d know what to change."
    },
    "commit": {
     "title": "Ready to see what’s holding you back?"
    }
   },
   "config": {
    "hookLine": "Ripple shows you what’s working and what’s in the way, week by week.",
    "reassure": {
     "title": "You’re not failing. You just can’t see what’s in the way.",
     "body": "When nothing changes, it’s easy to blame yourself. But from inside a full week, you can’t see what’s working, what keeps getting in the way, or how much you’ve already done.",
     "body2": "Ripple shows you. Talk about your days, and it tracks your goals and habits and shows you what keeps coming up, week by week."
    },
    "preview": {
     "title": "You talk. Ripple keeps track of what moves.",
     "caption": "This is what you see after a debrief. Your tasks are on the list and your goals and habits are tracked, so week by week you can see what’s moving and what’s stuck."
    },
    "resultOutro": "None of this means you’re not trying. You are. You just can’t see what’s working and what’s in the way. Ripple shows you, from your own words.",
    "closeStamp": "see what works",
    "vs": {
     "left": "Stuck on your own",
     "sub": "What changes when you can see it",
     "rows": [
      [
       "Same goal as last January",
       "Your goals",
       "Tracked from what you say"
      ],
      [
       "Trying hard, nothing moves",
       "What keeps coming up",
       "Your patterns, week to week"
      ],
      [
       "Wins forgotten by Friday",
       "Your week, told back",
       "A weekly report"
      ],
      [
       "Habits started, then dropped",
       "Your habits",
       "Nothing resets"
      ],
      [
       "Which part of life is slipping?",
       "Your Life Matrix",
       "Six areas, over time"
      ]
     ]
    },
    "receipt": {
     "title": "Trying · this year",
     "stamp": "Stuck in place",
     "stampSub": "and you can’t see why",
     "extra": {
      "label": "What’s in your way",
      "value": "no idea"
     }
    },
    "results": [
     {
      "name": "The Persistent One",
      "line": "You never stop trying. What’s missing is seeing what knocks you off track, so the next try goes differently."
     },
     {
      "name": "The Treadmill",
      "line": "You’re working hard all the time and still feel stuck, because you can’t see what’s moving or what’s in the way."
     },
     {
      "name": "The Unseen Achiever",
      "line": "More is changing than you can see. It just isn’t written down anywhere."
     },
     {
      "name": "The Quiet Climber",
      "line": "You’re getting somewhere, a little at a time, and little steps are easy to miss."
     }
    ]
   }
  },
  "men": {
   "steps": {
    "pain": {
     "options": {
      "stuck": "I’m spinning my wheels",
      "goals": "My goals keep slipping"
     }
    },
    "look": {
     "title": "When do you stop and check what’s working?",
     "options": {
      "never": "Never, too busy"
     }
    },
    "slid": {
     "title": "What do you keep trying to fix?"
    },
    "st-mid": {
     "statement": "I’m putting in the work. I just can’t tell what’s holding me back."
    },
    "want": {
     "options": {
      "progress": "Proof the work is paying off",
      "life": "Which part of my life needs work"
     }
    },
    "week": {
     "title": "What’s eating your week right now?",
     "sub": "Tap what’s on your list. It’s the stuff that crowds out what you’re trying to fix."
    },
    "s-see": {
     "title": "When nothing changes, do you know why?",
     "left": "I know what’s holding me back",
     "right": "No clue why"
    },
    "st-close": {
     "statement": "If I could see what’s actually working, I’d know what to fix."
    },
    "commit": {
     "title": "Ready to see what’s holding you back?"
    }
   },
   "config": {
    "reassure": {
     "title": "You’re not slacking. You just can’t see what’s in the way.",
     "body": "When you’re grinding and nothing moves, it’s easy to blame yourself. But from inside a busy week, you can’t see what’s working or what keeps knocking you off track.",
     "body2": "Ripple shows you. Talk about your days, and it tracks your goals and habits and shows you what keeps coming up, week by week."
    },
    "resultOutro": "None of this means you’re not putting in the work. You are. You just can’t see what’s working and what’s in the way. Ripple shows you, from your own words.",
    "vs": {
     "left": "Stuck on your own",
     "sub": "What changes when you can see it",
     "rows": [
      [
       "Same goal as last January",
       "Your goals",
       "Tracked from what you say"
      ],
      [
       "Grinding, nothing moves",
       "What keeps coming up",
       "Your patterns, week to week"
      ],
      [
       "Wins forgotten by Friday",
       "Your week, told back",
       "A weekly report"
      ],
      [
       "Gym for two weeks, then gone",
       "Your habits",
       "Nothing resets"
      ],
      [
       "Which part of life is slipping?",
       "Your Life Matrix",
       "Six areas, over time"
      ]
     ]
    }
   }
  }
 },
 "focus": {
  "women": {
   "steps": {
    "pain": {
     "options": {
      "lose": "Good ideas vanish before I write them down"
     }
    },
    "fail": {
     "options": {
      "setup": "Setting it up is the fun part. Then I drop it"
     }
    },
    "brain": {
     "title": "Which sounds most like your brain?",
     "sub": "Ripple works the same either way.",
     "options": {
      "yes": "ADHD, officially",
      "wonder": "Pretty sure it’s ADHD",
      "scattered": "Not ADHD, just a lot going on",
      "skip": "Doesn’t matter, I just need help"
     }
    },
    "want": {
     "options": {
      "talk": "Talking it out, with no listening back",
      "nostreak": "Missing a day doesn’t wipe my progress"
     }
    },
    "s-thoughts": {
     "title": "Right now, your head is…",
     "left": "Calm, one thing at a time",
     "right": "Ten things at once"
    },
    "commit": {
     "title": "Ready to get those 47 tabs out of your head?"
    }
   },
   "config": {
    "hookLine": "For busy, scattered and ADHD brains. Say it the second you think it, and it lands on one list.",
    "reassure": {
     "title": "It’s not a willpower problem.",
     "body": "A brain that moves this fast can’t also be the filing cabinet. And the tricks that used to hold it all together stop working when life gets this full.",
     "body2": "Ripple works the way your brain does. Say it the second you think it, in any order. Every task lands on one list, with the dates you said.",
     "things": [
      "Reply to Jen",
      "Laundry!!",
      "Dentist?",
      "Renew passport",
      "That idea",
      "Call back",
      "Return package",
      "Pay parking"
     ],
     "cta": "That’s me"
    },
    "receipt": {
     "title": "Your brain · this week",
     "stamp": "Too many tabs open",
     "stampSub": "and nowhere to put them",
     "extra": {
      "label": "Apps you tried",
      "value": "abandoned"
     }
    },
    "vs": {
     "left": "In your head",
     "sub": "Where it goes with Ripple",
     "rows": [
      [
       "“I’ll remember that.” (Didn’t.)",
       "Said once",
       "On your list"
      ],
      [
       "Five apps, none up to date",
       "One list",
       "From your own voice"
      ],
      [
       "Great idea in the shower, gone",
       "Every idea",
       "Caught as you say it"
      ],
      [
       "Ten things half-started",
       "Every open loop",
       "On one list"
      ],
      [
       "Missed a day, quit the app",
       "Nothing resets",
       "Pick up anytime"
      ]
     ]
    },
    "results": [
     {
      "name": "The System Collector",
      "line": "You’ve tried system after system. None of them were built for a brain that moves this fast."
     },
     {
      "name": "The Tab Opener",
      "line": "Ideas arrive faster than you can finish them, so a lot gets left open."
     },
     {
      "name": "The Vanishing Thought",
      "line": "Good thoughts show up at the worst moments and are gone a minute later."
     },
     {
      "name": "The Fast Thinker",
      "line": "Your brain moves fast. Your list just has to keep up."
     }
    ]
   }
  },
  "men": {
   "steps": {
    "pain": {
     "options": {
      "start": "I start five jobs and finish none",
      "lose": "Good ideas vanish before I write them down",
      "overwhelm": "Too much in my head, no idea where to start",
      "freeze": "I stall when I sit down to plan"
     }
    },
    "fail": {
     "options": {
      "setup": "Setting it up is the fun part. Then I drop it"
     }
    },
    "brain": {
     "title": "Which sounds most like your brain?",
     "sub": "Ripple works the same either way.",
     "options": {
      "yes": "ADHD, officially",
      "wonder": "Pretty sure it’s ADHD",
      "scattered": "Not ADHD, just a lot going on",
      "skip": "Doesn’t matter, I just need help"
     }
    },
    "want": {
     "options": {
      "talk": "Talking it out, with no listening back",
      "nostreak": "Missing a day doesn’t wipe my progress"
     }
    },
    "s-thoughts": {
     "title": "Right now, your head is…",
     "left": "Calm, one thing at a time",
     "right": "Ten things at once"
    },
    "commit": {
     "title": "Ready to get those 47 tabs out of your head?"
    },
    "st-close": {
     "statement": "If I could just say it and move on, I’d actually keep up."
    }
   },
   "config": {
    "hookLine": "For busy, scattered and ADHD brains. Say it the second you think it, and it lands on one list.",
    "reassure": {
     "title": "It’s not a willpower problem.",
     "body": "You’re great when it’s urgent. It’s the boring stuff that slips: the reply, the invoice, the renewal. A brain that moves this fast can’t also be the filing cabinet.",
     "body2": "Ripple works the way your brain does. Say it the second you think it, in any order. Every task lands on one list, with the dates you said.",
     "things": [
      "Reply to Jake",
      "Laundry!!",
      "Dentist?",
      "Renew passport",
      "That idea",
      "Call back",
      "Return package",
      "Pay parking"
     ],
     "cta": "That’s me"
    },
    "resultOutro": "None of this means you’re lazy or careless. Your brain needs somewhere to put things down. Ripple is that place.",
    "receipt": {
     "title": "Your brain · this week",
     "stamp": "Too many tabs open",
     "stampSub": "and nowhere to put them",
     "extra": {
      "label": "Apps you tried",
      "value": "abandoned"
     }
    },
    "vs": {
     "left": "In your head",
     "sub": "Where it goes with Ripple",
     "rows": [
      [
       "“I’ll remember that.” (Didn’t.)",
       "Said once",
       "On your list"
      ],
      [
       "Notes app, whiteboard, texts to self",
       "One list",
       "From your own voice"
      ],
      [
       "Great idea on the drive, gone",
       "Every idea",
       "Caught as you say it"
      ],
      [
       "Ten jobs half-started",
       "Every open loop",
       "On one list"
      ],
      [
       "Missed a day, ditched the app",
       "Nothing resets",
       "Pick up anytime"
      ]
     ]
    },
    "results": [
     {
      "name": "The System Collector",
      "line": "You’ve tried system after system. None of them were built for a brain that moves this fast."
     },
     {
      "name": "The Tab Opener",
      "line": "Ideas arrive faster than you can finish them, so a lot gets left open."
     },
     {
      "name": "The Vanishing Thought",
      "line": "Good thoughts show up at the worst moments and are gone a minute later."
     },
     {
      "name": "The Fast Thinker",
      "line": "Your brain moves fast. Your list just has to keep up."
     }
    ]
   }
  }
 },
 "journal": {
  "women": {
   "steps": {
    "why": {
     "title": "What were you hoping the last planner would fix?",
     "options": {
      "fresh": "A fresh start. This time for real."
     }
    },
    "pain": {
     "title": "When it all ends up back in your head, what happens?"
    },
    "often": {
     "title": "With it all in your head, how often does something slip?"
    },
    "happens": {
     "title": "How does it usually end?",
     "options": {
      "miss": "I miss a few days, then it feels ruined",
      "chore": "Keeping it up becomes another chore",
      "forget": "It ends up in a drawer",
      "blank": "I stare at the blank page"
     }
    },
    "st-upkeep": {
     "statement": "A few missed days, and I feel like I failed."
    },
    "easier": {
     "options": {
      "matters": "If it showed me what keeps coming up",
      "restart": "If missing a day didn’t ruin it"
     }
    },
    "week": {
     "title": "What would have gone in the planner this week?",
     "sub": "Tap everything you’re holding in your head instead."
    }
   },
   "config": {
    "results": [
     {
      "name": "The Restarter",
      "line": "You keep buying fresh pages because none of them fit a life this full. The system is wrong, not you."
     },
     {
      "name": "The Keeper",
      "line": "You keep everything going for everyone. A planner that needs keeping too is the first thing to go, and then you blame yourself."
     },
     {
      "name": "The Juggler",
      "line": "Plenty gets done. The planner is just the first thing to drop when the week gets full."
     },
     {
      "name": "The Carrier",
      "line": "You carry more than any page can hold, so most of it stays in your head."
     }
    ]
   }
  },
  "men": {
   "steps": {
    "hook": {
     "statement": "I spent a Sunday setting up a new system. It was dead by week two."
    },
    "why": {
     "title": "Why do you keep trying new planners and apps?",
     "options": {
      "forget": "To stop dropping the ball",
      "control": "To feel on top of things",
      "head": "To get it out of my head",
      "family": "To keep home and family on track",
      "me": "To make time for my own goals",
      "fresh": "To get dialed in. For real this time."
     }
    },
    "pain": {
     "title": "When it all ends up back in your head, what happens?",
     "options": {
      "slip": "Things fall through the cracks",
      "switch": "I can’t switch off",
      "snap": "I’m short with the people I love",
      "behind": "I’m always playing catch-up",
      "last": "My own goals get pushed back",
      "drained": "I’m running on fumes"
     }
    },
    "tried": {
     "title": "How many times have you set up a new system?"
    },
    "tried-what": {
     "options": {
      "bullet": "A notebook",
      "notes": "A whiteboard or sticky notes"
     }
    },
    "happens": {
     "title": "How does it usually end?",
     "options": {
      "miss": "I miss a few days and stop opening it",
      "chore": "I spend more time organizing than doing",
      "forget": "I forget it exists",
      "blank": "I never know what to put in"
     }
    },
    "st-upkeep": {
     "statement": "When it falls apart, I figure I just lack discipline."
    },
    "easier": {
     "options": {
      "say": "If I could just say it",
      "sorts": "If it organized itself",
      "setup": "If there was nothing to set up",
      "matters": "If it showed me what keeps coming up",
      "restart": "If missing a week didn’t kill it",
      "blank": "If there was nothing to fill in"
     }
    },
    "week": {
     "title": "What would have gone in the system this week?",
     "sub": "Tap everything you’re carrying in your head instead."
    },
    "s-say": {
     "left": "I’d rather type it in",
     "right": "I’d rather just say it"
    },
    "st-zero": {
     "statement": "If it took zero upkeep, I’d actually stick with it."
    },
    "commit": {
     "title": "Ready for a system you don’t have to maintain?"
    }
   },
   "config": {
    "hookLine": "Ripple keeps track of what you say. No system to keep running.",
    "reassure": {
     "title": "It’s not discipline. It’s upkeep.",
     "body": "Every planner and app needs you to keep it running, and you’re already keeping everything else running.",
     "body2": "Ripple works the other way round. You talk, and it does the keeping track.",
     "things": [
      "Set up the app",
      "Rebuild the system",
      "Catch up on last week",
      "Buy the good notebook",
      "Tag every task",
      "Clear 23 overdue",
      "Try another app",
      "Update the board"
     ],
     "cta": "That’s me"
    },
    "resultOutro": "None of this means you lack discipline. It means a system shouldn’t need maintenance. That’s the part Ripple does.",
    "stamps": {
     "tried-what": {
      "paper": "Made it to Feb",
      "bullet": "4 pages used",
      "journal-app": "Opened twice",
      "todo-app": "41 overdue",
      "reminders": "Snoozed 9 times",
      "notes": "Wiped clean",
      "habit-app": "Streak: 0"
     }
    },
    "vs": {
     "left": "Planners and apps",
     "sub": "Why people are switching",
     "rows": [
      [
       "Two hours setting it up",
       "Just talk",
       "It writes the list"
      ],
      [
       "Notebook left at the office",
       "Always on you",
       "Right on your phone"
      ],
      [
       "Streak broke, deleted the app",
       "Tracks habits",
       "From what you say"
      ],
      [
       "Can’t show what keeps coming up",
       "Your patterns",
       "Week to week"
      ],
      [
       "Fall behind, build a new one",
       "Never resets",
       "Picks up anytime"
      ]
     ]
    },
    "results": [
     {
      "name": "The Restarter",
      "line": "You keep building new systems because none of them fit a life this busy. The system is the problem, not you."
     },
     {
      "name": "The Workhorse",
      "line": "You keep everything running for everyone. A system that needs maintaining too was always going to get dropped."
     },
     {
      "name": "The Juggler",
      "line": "Plenty gets done. The system is just the first thing to go when the week gets busy."
     },
     {
      "name": "The Carrier",
      "line": "You carry more than any app can hold, so most of it stays in your head."
     }
    ]
   }
  }
 }
};

/** Men's chip list for the shared "What's on your list this week?" screen (same ids, his life). */
const MEN_WEEK_ITEMS: Record<string, { chip: string; task: string }> = {
  school: { chip: "Something for the kids", task: "Sort the kids’ thing" },
  mom: { chip: "Calling my parents", task: "Call your parents back" },
  deadline: { chip: "A work deadline", task: "Get the work deadline done" },
  bills: { chip: "Bills", task: "Pay the bills" },
  groceries: { chip: "Oil change", task: "Book the oil change" },
  dentist: { chip: "The dentist", task: "Book the dentist" },
  gift: { chip: "A birthday gift", task: "Get the birthday gift" },
  pickups: { chip: "Kids’ practice", task: "Get the kids to practice" },
  emails: { chip: "Emails I owe", task: "Answer the emails you owe" },
  callback: { chip: "Calling someone back", task: "Call them back" },
  workout: { chip: "The gym", task: "Get to the gym" },
  me: { chip: "Renewing the insurance", task: "Renew the insurance" },
};

const TEXT = ["title", "sub", "statement", "left", "right"] as const;

function patchStep(st: V9Step, p: StepCopy, from?: V9Step, base?: V9Step): V9Step {
  // from/base: when inheriting the women's copy into a men's step, only touch fields he still shares with her original.
  const next = { ...st } as V9Step & Record<string, unknown>;
  const cur = st as unknown as Record<string, unknown>;
  const orig = base as unknown as Record<string, unknown> | undefined;
  for (const k of TEXT) if (p[k] !== undefined && (!orig || cur[k] === orig[k])) next[k] = p[k];
  if (p.options && "options" in st) {
    const bo = orig && "options" in (base as object) ? ((base as { options: { id: string; label: string }[] }).options) : undefined;
    next.options = (st as { options: { id: string; label: string }[] }).options.map((o) => {
      const want = p.options![o.id];
      if (want === undefined) return o;
      if (bo && bo.find((b) => b.id === o.id)?.label !== o.label) return o;
      return { ...o, label: want };
    });
  }
  return next as V9Step;
}

function mapResults(orig: V9Config["stateName"], from: string[], to: Result[] | undefined): V9Config["stateName"] {
  if (!to?.length) return orig;
  const m = new Map(from.map((n, i) => [n, to[i]]));
  return ((a: Parameters<V9Config["stateName"]>[0]) => {
    const r = orig(a);
    return m.get(r.name) ?? r;
  }) as V9Config["stateName"];
}

/** Apply one side's copy to a config, in place. `inherit` = the women's original + patch, for men's configs. */
export function applyReviewCopy(c: V9Config, side: SideCopy, resultNames: string[], opts: { inheritFrom?: { base: V9Config; copy: SideCopy }; men?: boolean } = {}): string[] {
  const problems: string[] = [];
  const ids = new Set(c.steps.map((s) => s.id));
  for (const id of Object.keys(side.steps ?? {})) if (!ids.has(id)) problems.push(`${c.brand}: no step "${id}"`);
  const inh = opts.inheritFrom;
  c.steps = c.steps.map((st) => {
    let s = st;
    const herBase = inh?.base.steps.find((b) => b.id === st.id);
    if (inh?.copy.steps?.[st.id] && herBase) s = patchStep(s, inh.copy.steps[st.id], undefined, herBase);
    if (side.steps?.[st.id]) s = patchStep(s, side.steps[st.id]);
    if (opts.men && s.kind === "week") s = { ...s, items: (s as Extract<V9Step, { kind: "week" }>).items.map((it) => (MEN_WEEK_ITEMS[it.id] ? { ...it, ...MEN_WEEK_ITEMS[it.id] } : it)) } as V9Step;
    return s;
  });
  const cfg = { ...(inh?.copy.config ?? {}), ...(side.config ?? {}) };
  const own = side.config ?? {};
  const shared = (k: keyof V9Config) => !inh || own[k as string] !== undefined || JSON.stringify(c[k]) === JSON.stringify(inh.base[k]);
  if (cfg.hookLine && shared("hookLine")) c.hookLine = cfg.hookLine;
  if (cfg.resultOutro && shared("resultOutro")) c.resultOutro = cfg.resultOutro;
  if (cfg.reassure && shared("reassure")) c.reassure = { ...c.reassure, ...cfg.reassure };
  if (cfg.preview) c.preview = { ...(c.preview ?? { eyebrow: "", title: "", caption: "" }), ...cfg.preview };
  if (c.painKit) {
    const kit = { ...c.painKit };
    if (cfg.vs) kit.vs = cfg.vs;
    if (cfg.receipt) kit.receipt = { ...kit.receipt, ...cfg.receipt, extra: { ...kit.receipt.extra, ...(cfg.receipt.extra ?? {}) } };
    if (cfg.closeStamp) kit.closeStamp = cfg.closeStamp;
    if (cfg.stamps) {
      const st: Record<string, Record<string, string>> = { ...kit.stamps };
      for (const [k, v] of Object.entries(cfg.stamps as Record<string, Record<string, string>>)) st[k] = { ...(st[k] ?? {}), ...v };
      kit.stamps = st as typeof kit.stamps;
    }
    c.painKit = kit;
  }
  c.stateName = mapResults(c.stateName, resultNames, (own.results as Result[] | undefined) ?? (inh?.copy.config?.results as Result[] | undefined));
  return problems;
}
