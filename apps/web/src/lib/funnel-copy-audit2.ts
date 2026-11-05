// Second persona pass (2026-11-05): per-funnel patches from the screen-by-screen
// audits against the ideal-client profiles (docs/ideal-client-profiles.md).
// Applied over REVIEW_COPY / STRUCTURE by applyAudit() in funnel-v9-config.ts.
/* eslint-disable */
export const AUDIT2: Record<string, any> = {
 "relief": {
  "women": {
   "steps": {
    "help": {
     "options": {
      "nothing": "Knowing it’s all written down"
     }
    }
   },
   "config": {
    "resultOutro": "None of this means you’re failing. It means you’re responsible for everything, and it all lives in your head. Ripple keeps it on one list.",
    "reassure": {
     "body": "The dates, the forms, everyone’s plans, and remembering to remember it all. Nobody could hold all of that."
    },
    "preview": {
     "caption": "Each time you talk, that’s a debrief. This is what comes back: it’s on your list now, out of your head."
    },
    "results": [
     {
      "name": "The Keeper of Everything",
      "line": "You hold the dates, the forms and everyone’s plans, and you’re the only one who remembers them."
     },
     {
      "name": "The List Starter",
      "line": "You’ve started the list a hundred times. Keeping it up became one more thing to carry."
     },
     {
      "name": "The Last on the List",
      "line": "You make room for everyone. Your own things wait for someday."
     },
     {
      "name": "The Always-On Mind",
      "line": "Your head keeps going long after the day is done, because it’s holding all of it."
     },
     {
      "name": "The One Who Remembers",
      "line": "You carry more than anyone sees, and most of it stays in your head."
     }
    ],
    "vs": {
     "left": "In your head",
     "sub": "What changes when you say it once",
     "rows": [
      [
       "Dentist is Thursday… or Friday?",
       "On your list",
       "With the date"
      ],
      [
       "Did I sign the permission slip?",
       "Every task",
       "In one place"
      ],
      [
       "I’ll start walking again next week",
       "Your habits",
       "From what you say"
      ],
      [
       "Why am I this tired every week?",
       "Your patterns",
       "Week to week"
      ],
      [
       "Going over everything, again",
       "A quiet head",
       "Said once, held for you"
      ]
     ]
    }
   },
   "extras": {
    "weekNote": "And that’s just this week."
   }
  },
  "men": {
   "steps": {
    "tabs": {
     "options": {
      "phone": "Texts and reminders to myself"
     }
    },
    "help": {
     "options": {
      "nothing": "Knowing it’s all written down"
     }
    }
   },
   "config": {
    "resultOutro": "None of this means you’re dropping the ball. It means it all lives in your head. Ripple keeps it on one list.",
    "preview": {
     "caption": "Each time you talk, that’s a debrief. This is what comes back: it’s on your list now, out of your head."
    },
    "vs": {
     "left": "In your head",
     "sub": "What changes when you say it once",
     "rows": [
      [
       "Oil change… this week or next?",
       "On your list",
       "With the date"
      ],
      [
       "Did I pay the card?",
       "Every task",
       "In one place"
      ],
      [
       "Gym again next week",
       "Your habits",
       "From what you say"
      ],
      [
       "Why am I wiped every week?",
       "Your patterns",
       "Week to week"
      ],
      [
       "Running through it all, again",
       "A clear head",
       "Said once, held for you"
      ]
     ]
    }
   },
   "extras": {
    "weekNote": "And that’s just this week.",
    "feeling": "maxed out"
   }
  }
 },
 "catch": {
  "women": {
   "steps": {
    "often": {
     "title": "How often does something fall through the cracks?"
    },
    "after": {
     "options": {
      "guilt": "I feel terrible for days"
     }
    },
    "help": {
     "options": {
      "catch": "Getting it down the second I think of it",
      "top": "Feeling like I’ve got this"
     }
    },
    "st-close": {
     "statement": "My head could let go if it was all in one place, with the dates."
    }
   },
   "config": {
    "preview": {
     "title": "Every date, in one place."
    },
    "resultOutro": "None of this means you’re losing your edge. It means there’s too much to hold in one head. Ripple holds it for you."
   },
   "extras": {
    "weekItems": [
     {
      "id": "school",
      "chip": "A school form",
      "task": "Sign the school form"
     },
     {
      "id": "mom",
      "chip": "Mom’s appointment",
      "task": "Book Mom’s appointment"
     },
     {
      "id": "deadline",
      "chip": "A work deadline",
      "task": "Get the work deadline done"
     },
     {
      "id": "bills",
      "chip": "Bills",
      "task": "Pay the bills"
     },
     {
      "id": "dentist",
      "chip": "The dentist",
      "task": "Book the dentist"
     },
     {
      "id": "gift",
      "chip": "A birthday gift",
      "task": "Get the birthday gift"
     },
     {
      "id": "pickups",
      "chip": "Pickups and drop-offs",
      "task": "Sort this week’s pickups"
     },
     {
      "id": "emails",
      "chip": "Emails I owe",
      "task": "Answer the emails you owe"
     },
     {
      "id": "callback",
      "chip": "Calling someone back",
      "task": "Call them back"
     },
     {
      "id": "registration",
      "chip": "A sign-up deadline",
      "task": "Do the sign-up before it closes"
     },
     {
      "id": "rsvp",
      "chip": "An RSVP",
      "task": "Send the RSVP"
     },
     {
      "id": "return",
      "chip": "A return to send back",
      "task": "Send the return back"
     }
    ]
   }
  },
  "men": {
   "steps": {
    "pain": {
     "options": {
      "reply": "A call or text I meant to return"
     }
    },
    "often": {
     "title": "How often does something fall through the cracks?"
    },
    "after": {
     "options": {
      "replay": "Someone has to chase me on it",
      "blame": "I’m annoyed at myself"
     }
    },
    "help": {
     "options": {
      "top": "Following through on what I say"
     }
    },
    "week": {
     "sub": "Tap everything you’ve said you’d handle."
    },
    "st-close": {
     "statement": "I don’t need a system. I need one place it all goes, with the dates."
    }
   },
   "config": {
    "preview": {
     "title": "Every date, in one place."
    },
    "stamps": {
     "after": {
      "replay": "Did you ever…?"
     }
    }
   },
   "extras": {
    "feeling": "totally spaced it"
   }
  }
 },
 "clarity": {
  "women": {
   "steps": {
    "s-know": {
     "title": "On your most tired days, could you say why?"
    },
    "commit": {
     "title": "Ready to see what’s behind it?"
    }
   },
   "config": {
    "reassure": {
     "title": "A lot of what wears you down is spread across your week."
    },
    "preview": {
     "caption": "This is what you see after every debrief: your tasks caught, and over the weeks, what drains you and what lifts you."
    },
    "vs": {
     "left": "Your week now",
     "sub": "What changes when you can see it",
     "rows": [
      [
       "Tired again, no idea why",
       "What drains you",
       "Shown week to week"
      ],
      [
       "Can’t say where the week went",
       "Your week, told back",
       "A weekly report"
      ],
      [
       "The walk got skipped. Again.",
       "Your habits",
       "From what you say"
      ],
      [
       "Some weeks fine, some wiped",
       "What keeps coming up",
       "Your patterns"
      ],
      [
       "Nothing left for me",
       "What lifts you",
       "From your own words"
      ]
     ]
    }
   },
   "extras": {
    "paywallTitle": [
     "See what drains you.",
     "Get back what lifts you."
    ],
    "trust": [
     "What drains you and lifts you, week to week",
     "Mood and habits tracked, nothing to fill in",
     "A weekly report on what keeps coming up"
    ],
    "todaysRead": "Your most tired days were the ones with no walk. Worth a look."
   }
  },
  "men": {
   "steps": {
    "s-know": {
     "title": "On your worst days, could you say why?"
    },
    "commit": {
     "title": "Ready to see what’s behind it?"
    }
   },
   "config": {
    "reassure": {
     "title": "A lot of what wears you down is spread across your week."
    },
    "preview": {
     "title": "You talk. Ripple shows you what’s wearing you down.",
     "caption": "This is what you see after every debrief: your tasks caught, and over the weeks, what drains you and what recharges you."
    },
    "results": [
     {
      "name": "The Long Haul",
      "line": "You’ve been running on fumes for a long time and kept going anyway. That takes more than anyone sees."
     },
     {
      "name": "The Someday Self",
      "line": "You know what resets you. It just keeps getting pushed to next week."
     },
     {
      "name": "The Blurred Week",
      "line": "The days blur together, so you never get to see what’s draining you."
     },
     {
      "name": "The Quiet Fader",
      "line": "You keep everything running, and the stuff that’s yours keeps getting cut."
     }
    ],
    "vs": {
     "left": "Your week now",
     "sub": "What changes when you can see it",
     "rows": [
      [
       "Wiped again, no idea why",
       "What drains you",
       "Shown week to week"
      ],
      [
       "Can’t say where the week went",
       "Your week, told back",
       "A weekly report"
      ],
      [
       "Skipped the gym. Again.",
       "Your habits",
       "From what you say"
      ],
      [
       "Some weeks fine, some wiped",
       "What keeps coming up",
       "Your patterns"
      ],
      [
       "Home with nothing left",
       "What recharges you",
       "From your own words"
      ]
     ]
    }
   },
   "extras": {
    "weekNote": "No wonder you’re wiped.",
    "loader": [
     "Reading what drains you and what recharges you",
     "Looking for what keeps coming up"
    ],
    "resultHeading": "What’s wiping you out, in your answers",
    "paywallTitle": [
     "See what’s wearing you down.",
     "Get back what recharges you."
    ],
    "trust": [
     "What drains you and what recharges you",
     "Mood and habits tracked, no typing",
     "A weekly report on what keeps coming up"
    ],
    "todaysRead": "Your worst days came after skipped workouts. Worth a look.",
    "feeling": "wiped"
   }
  }
 },
 "progress": {
  "women": {
   "steps": {
    "pain": {
     "options": {
      "blur": "I’m going through the motions",
      "year": "Where did this year go?"
     }
    },
    "goal": {
     "sub": "Mondays and New Year’s count too."
    },
    "want": {
     "options": {
      "coming": "What keeps getting in my way"
     }
    },
    "week": {
     "title": "What do you keep meaning to get to?",
     "sub": "Tap everything you’d fit in this week if you could."
    },
    "s-see": {
     "right": "I can’t tell what’s in the way"
    }
   },
   "config": {
    "reassure": {
     "body2": "Ripple sees it for you. Just talk about your days. It tracks your goals and habits and shows you what keeps coming up, week by week."
    },
    "preview": {
     "caption": "This is what you see after a debrief. Your list, your habits and your goals, so week by week you can see what’s moving and what’s stuck."
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
      "line": "More is changing than you can see. Nobody’s keeping track of it for you."
     },
     {
      "name": "The Quiet Climber",
      "line": "You’re getting somewhere, a little at a time, and little steps are easy to miss."
     }
    ]
   },
   "extras": {
    "weekMeter": "Your meant-to list",
    "weekNote": "You’re not lazy. That’s a lot to fit in.",
    "paywallTitle": [
     "See what’s in the way.",
     "Then get moving again."
    ],
    "todaysRead": "Your walks slipped on the late-work days. Worth a look."
   }
  },
  "men": {
   "steps": {
    "pain": {
     "options": {
      "blur": "Same stuff, different day",
      "restart": "I get traction, then lose it",
      "year": "Nowhere near where I thought I’d be"
     }
    },
    "goal": {
     "sub": "Mondays and New Year’s count too."
    },
    "want": {
     "options": {
      "coming": "What keeps getting in my way"
     }
    },
    "week": {
     "title": "What do you keep meaning to get to?",
     "sub": "Tap everything you’d fit in this week if you could."
    },
    "s-see": {
     "right": "No clue what’s in the way"
    }
   },
   "config": {
    "reassure": {
     "body2": "Ripple sees it for you. Just talk about your days. It tracks your goals and habits and shows you what keeps coming up, week by week."
    },
    "preview": {
     "caption": "This is what you see after a debrief. Your list, your habits and your goals, so week by week you can see what’s moving and what’s stuck."
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
      "line": "More is changing than you can see. Nobody’s keeping track of it for you."
     },
     {
      "name": "The Quiet Climber",
      "line": "You’re getting somewhere, a little at a time, and little steps are easy to miss."
     }
    ]
   },
   "extras": {
    "weekMeter": "Still on your list",
    "weekNote": "You’re not slacking. That’s a lot to fit in.",
    "paywallTitle": [
     "See what’s in the way.",
     "Then get traction."
    ],
    "todaysRead": "Both missed gym days came after late nights at work."
   }
  }
 },
 "focus": {
  "women": {
   "steps": {
    "apps": {
     "sub": "Planners, apps, sticky notes, texts to yourself. They all count."
    },
    "ideas": {
     "sub": "Usually somewhere you can’t write them down."
    },
    "want": {
     "options": {
      "talk": "Talking it out, no voice memos to replay"
     }
    }
   },
   "config": {
    "results": [
     {
      "name": "The System Collector",
      "line": "You’ve tried system after system. None of them were built for a brain that moves this fast."
     },
     {
      "name": "The Tab Opener",
      "line": "Something new grabs you before the last thing’s done, so a lot stays open."
     },
     {
      "name": "The Vanishing Thought",
      "line": "Good thoughts show up at the worst moments and are gone a minute later."
     },
     {
      "name": "The Fast Thinker",
      "line": "Your brain moves fast. Your list just has to keep up."
     }
    ],
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
       "Every loose end",
       "On one list"
      ],
      [
       "Missed a day, quit the app",
       "Nothing resets",
       "Pick up anytime"
      ]
     ]
    },
    "stamps": {
     "fail": {
      "typing": "Half-typed note"
     }
    }
   },
   "extras": {
    "weekMeter": "Your tabs",
    "paywallTitle": [
     "Say it once.",
     "It’s on your list."
    ],
    "trust": [
     "Talk in any order, nothing to replay",
     "One list, nothing to set up",
     "Miss a day, nothing resets"
    ],
    "todaysRead": "You mentioned the dentist three times. It’s on your list now."
   }
  },
  "men": {
   "steps": {
    "pain": {
     "options": {
      "forget": "It slips my mind the second I walk away"
     }
    },
    "apps": {
     "sub": "Notes app, whiteboard, texts to yourself. They all count."
    },
    "fail": {
     "options": {
      "setup": "Spent a weekend setting it up, then dropped it"
     }
    },
    "ideas": {
     "sub": "Usually somewhere you can’t write them down.",
     "options": {
      "car": "On the drive"
     }
    },
    "want": {
     "options": {
      "dump": "Getting it out of my head, fast",
      "talk": "Talking it out, no voice memos to replay"
     }
    }
   },
   "config": {
    "results": [
     {
      "name": "The System Collector",
      "line": "You’ve tried system after system. None of them were built for a brain that moves this fast."
     },
     {
      "name": "The Tab Opener",
      "line": "Something new grabs you before the last thing’s done, so a lot stays open."
     },
     {
      "name": "The Vanishing Thought",
      "line": "Good thoughts show up at the worst moments and are gone a minute later."
     },
     {
      "name": "The Fast Thinker",
      "line": "Your brain moves fast. Your list just has to keep up."
     }
    ],
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
       "Every loose end",
       "On one list"
      ],
      [
       "Missed a day, ditched the app",
       "Nothing resets",
       "Pick up anytime"
      ]
     ]
    },
    "stamps": {
     "fail": {
      "typing": "Half-typed note"
     }
    }
   },
   "extras": {
    "weekMeter": "Your tabs",
    "paywallTitle": [
     "Say it once.",
     "It’s on your list."
    ],
    "trust": [
     "Talk in any order, nothing to replay",
     "One list, nothing to set up",
     "Miss a day, nothing resets"
    ],
    "todaysRead": "You mentioned the invoice three times. It’s on your list now."
   }
  }
 },
 "journal": {
  "women": {
   "steps": {
    "often": {
     "title": "How often does something fall through?"
    },
    "happens": {
     "options": {
      "blank": "I never know what to write, so I stop"
     }
    },
    "st-upkeep": {
     "statement": "I keep everyone on track. Why can’t I keep a planner going?"
    },
    "easier": {
     "title": "What would finally make it stick?"
    }
   },
   "config": {
    "reassure": {
     "body2": "Ripple flips that. You talk, and it keeps track for you."
    },
    "preview": {
     "caption": "This is what you see after every debrief. It’s already on your list, with nothing to copy out by hand."
    },
    "results": [
     {
      "name": "The Restarter",
      "line": "You keep buying fresh pages, hoping this one fits a life this full. None of them could."
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
    ],
    "vs": {
     "left": "Paper planner",
     "sub": "Why people are switching",
     "rows": [
      [
       "You write every task out by hand",
       "Just talk",
       "It writes the list"
      ],
      [
       "In a drawer by February",
       "Always on you",
       "Right on your phone"
      ],
      [
       "Habit boxes you forget to tick",
       "Tracks habits",
       "From what you say"
      ],
      [
       "Can’t show what keeps coming up",
       "Your patterns",
       "Week to week"
      ],
      [
       "Miss a week, and it feels ruined",
       "Never resets",
       "Picks up anytime"
      ]
     ]
    }
   },
   "extras": {
    "loader": [
     "Reading what you’ve tried so far",
     "Lining up a way with nothing to keep up"
    ]
   }
  },
  "men": {
   "steps": {
    "often": {
     "title": "How often does something get dropped?"
    },
    "easier": {
     "title": "What would finally make it stick?"
    }
   },
   "config": {
    "reassure": {
     "body2": "Ripple flips that. You talk, and it keeps track for you."
    },
    "preview": {
     "caption": "This is what you see after every debrief. It’s already on your list, with nothing to type in or sort."
    },
    "results": [
     {
      "name": "The Restarter",
      "line": "You keep rebuilding the system, hoping this one survives a busy week. None of them could."
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
   },
   "extras": {
    "loader": [
     "Reading what you’ve tried so far",
     "Lining up a system with nothing to maintain"
    ],
    "todaysRead": "Two things have dates this week. Both are on your list."
   }
  }
 }
};
