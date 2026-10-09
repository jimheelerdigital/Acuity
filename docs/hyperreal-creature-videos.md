# Hyper-real creature videos: playbook

Living playbook for the Legendary Mythicals "it's real footage" creature clips: a calm, ordinary travel shot where a colossal creature shows up and does something physical. Keenan's direction, 2026-10-08 → 10-09.

**Every session that makes one of these clips:**
1. Read this file first and write prompts from the templates below.
2. Run the checklist before spending video credits.
3. After the clip renders, pull frames (0, 25%, 50%, 75%, 100%), review them against the checklist, and add a row to the Log with what worked, what failed, and the lesson.
4. If a lesson changes how prompts should be written, update the Rules or Templates in the same session.

---

## The recipe (proven)

1. **Start photo:** the empty real-world scene. No creature anywhere in it.
2. **End photo:** an edit of the start photo (same camera, same foreground), with the creature at its peak moment.
3. **Extra references for multi-step clips** (Seedance `image_references`, 10-09): add (a) a clean full-body **creature reference** to lock its design, and (b) a **mid-moment reference** for each big change between the start and end (e.g. "dragon landing on the first jet"). In the script, say which reference shows what and when ("reference 2 is the moment at 6-10s"). References guide the look; they aren't timed keyframes. Only the start and end are exact.
4. **One clip:** Seedance 2.5, start and end photos, 15s, 720p, sound on, 9:16. The model animates the journey between the two frames.
5. **Delivery:** upload to our storage, then email with a "Save to camera roll" button (`/save-video`). Use a direct REST/curl upload for files over ~10MB, because supabase-js timed out.

| Item | Setting | Cost |
|---|---|---|
| Photos | `gpt_image_2_5`, quality high, 2k, 9:16; end photo uses the start photo as `image_references` | 2.75 credits each |
| Video | `seedance_2_5`, mode `omni_reference`, `start_image` + `end_image`, 720p, `generate_audio: true`, 15s | 105 credits (25s is 175) |
| Ignore | Higgsfield's "IN THE DARK" preset suggestion; resubmit with `declined_preset_id` | n/a |

Seedance 2.0 (67.5 credits) was tested once, on the roller coaster, and judged no better or worse there. Keenan wants **Seedance 2.5 only**. Never switch models without asking.

---

## Rules

### Style: always hyper-realistic
- **Everything we make is hyper-realistic, photoreal live-action, never cartoon, stylized or 3D-animated** (Keenan, 10-09, after the "Hatchling's First Flame" frames came out as a 3D animated movie: "why did this come out like a cartoon/3d animated? everything we do is hyper realistic"). Words like "film", "cinematic" or "animated film style" mean **a live-action feature film shot on a cinema camera with photoreal creatures**. Never write "3D animated", "animated feature", "stylized" or "cartoon" in a prompt.

### Setting
- **Calm, everyday travel shot with relative motion.** The camera is inside something moving, with a fixed foreground anchor (wing, railing, bow, window frame, dashboard) while the world slides past. Proven: plane window, cruise railing, car on a bridge, ferry deck, boat on a forest river.
- **No people in frame.** No hands, riders or faces. The roller coaster (hands on the lap bar) was "awful".
- **Plain, real light:** midday sun, overcast or light mist. Avoid low sunsets (they backlight the creature into a muddy silhouette) and heavy fog (flat grey, kills texture; the ferry failed partly on this).
- **Phone-camera realism** in the photo prompt: ordinary iPhone photo, no color grading, true-to-life exposure, slight haze or reflection.

### Creature
- **Never in the start photo.** It enters from off-screen, or rises out of water, clouds or forest. The empty first seconds are the hook.
- **The end photo must be reachable by PHYSICAL motion from the start photo.** If the gap can't be explained by movement, Seedance cheats with a crossfade/dissolve (the forest giant, 10-09: "a fucking fade... didn't look realistic whatsoever"). Safe entries: rises out of water or clouds, flies or walks in from beyond the frame edge. If the creature must emerge from land (forest, hillside), it has to be **hidden in the start photo as terrain** (a mossy mound that stands up), or drop the end photo and use start-only with a step-by-step break-out prompt.
- **Instantly recognizable, classic anatomy.** Fans love dragons, krakens, serpents and giants. A kraken is a traditional two-eyed octopus/squid with a beak, never a cyclops.
- **One creature, one continuous body.** A serpent surfaces head-first and its body follows as ONE connected back. Never write "coils on both sides" (that produced disconnected rubber rings).
- **It physically interacts, with weight.** It grabs, crushes, bends or tilts something, and the vehicle reacts (rolls, lurches, wave hits). The cruise kraken crushing a lifeboat was "excellent".
- **No famous-character lookalikes.** Seedance blocks a Godzilla-style kaiju every time (4 blocks, status `nsfw`, not charged). Keep away from upright dinosaur bodies with rows of back plates.
- **No people hurt, no gore.** Destroying objects is fine.

- **Creature design standing rules (10-04/05):** no human faces on creatures (no lamassu, sphinx, manticore, centaur, harpy, naga, siren); every dragon has wings; beasts never hold or use weapons.

### Prompt wording
- **Never put a prohibition inside the action beats.** Video models execute every verb they read: a 10-07 shot sheet with "no fire" inside its action text rendered fire downward. Keep the beats purely positive ("breathes a jet of fire up into the sky"). Put the few must-nots in ONE short closing line ("No people, no text.") and nowhere else.
- **Give a clear, confident action in every beat.** Ambient "stay still" prompts made clips that were "basically just zooming in" (09-29). Action prompts produced 2–3× more motion and "looks way better".
- **Fire looks like a DIRECTED BEAM, never a house fire** (Keenan, 10-09: "it needs to be almost like a directed fire energy beam and right now it looks like a house fire"). Write: a tightly focused, coherent straight jet, like a high-pressure flamethrower or an energy beam, with a blinding white-hot core, a sharp yellow-orange sheath and a thin outer flame licking off its edges, heat distortion along it, almost no smoke except at the impact point. Never "billowing", "torrent", "fireball from the mouth" or "smoke clouds".
- **Fire or ice breath:** a head-raise beat first, then a powerful sustained jet (about 2s of a 5s clip, 3–4s of 10s+), up into the sky or sideways across the scene, never at a person. Writing it as head up → column of fire → jaws close fixed the downward-fire bug.
- **Make the whole scene move:** 2–3 secondary motions (water surging, mist drifting, trees swaying, spray, debris), not just the creature (10-08).
- Every photo and video prompt includes **"hyper-realistic, high detail, 4K"**. It's wording only; it doesn't change the render resolution.
- Video prompts are **shot sheets** (see Templates) with timed beats (0-4s / 4-7s / 7-11s / 11-15s) so nothing stalls or crams.
- State the physics: heavy, massive, slow realistic motion; real water physics; believable scale; no slow motion; no cuts.
- List the sound: ambient bed first, then the creature (rumble, hiss, roar), then impact (metal groaning, wave slapping the hull).
- End with: No people. No text.

---

## Templates

**Start photo**
> Hyper-realistic, high detail, 4K ordinary iPhone photo taken from [POV: the bow of a small wooden boat / a cruise ship balcony railing / a plane window], vertical. In the foreground: [fixed anchor details]. Beyond: [the scene, the movement it implies, distance cues]. [Plain light]. True-to-life colors, no color grading, realistic phone-camera exposure, fine texture on [materials]. The [sky/water/forest] is empty. No people, no text.

**End photo** (edit with the start photo as reference)
> Hyper-realistic, high detail, 4K edit of this exact [scene] photo, keeping the camera position, [foreground anchor], [scene], light and phone-camera look identical. [ONE creature, classic anatomy, colors, size relative to the vehicle/trees], [what it is physically doing to the vehicle or scene, with visible consequence]. Realistic [wet skin / scales / moss] texture, believable massive scale against [reference object], [light]. No people, no text.

**Video: Keenan's SHOT SHEET format (required; supplied 10-06, used by `lib/content-factory/shot-sheet.ts`)**

> **Which version, per model (Keenan, 10-09):** the short, compact shot sheet (`shot-sheet.ts`, ~2,450 chars) is fine **for Kling only**. It is **NOT OK for Seedance.** Seedance always gets the full, long, scene-by-scene script below, with detailed continuity and a full block per scene.

Every video prompt is ONE JSON shot sheet broken down SCENE BY SCENE (Keenan, 10-09: "the script breakdown that we talked about using for all future videos where it breaks it down into scenes"). Never a prose paragraph: the 10-09 clips were written as paragraphs, and lost the continuity locks that stop morphing (the serpent) and dissolves (the giant). Keys, in order:

```json
{
  "style": "Hyper-realistic, high detail, 4K handheld phone footage, true-to-life color, no grading; <subject material>.",
  "aspect_ratio": "9:16",
  "duration": "15 seconds",
  "environment_continuity": "<the place exactly as the START frame shows it: vehicle, fixed foreground anchor, terrain/water/sky, scale cues; what stays identical to the end>",
  "lighting": "<source, direction, color temp, haze, exactly as the frames; how any breath/glow/splash is lit by it>",
  "character_continuity": {
    "<vehicle_or_anchor>": "<what it is, materials, fixed position in frame>. Preserve exactly.",
    "<creature>": "<from the END frame: species, anatomy WITH COUNTS (exactly two eyes, eight tentacles, two wings, four legs), colors, skin/scale texture, size relative to the vehicle, one single continuous body>. Preserve exactly."
  },
  "effect_continuity": "<breath / water / debris behaviour in positive terms. Breath: head turns to one side, long straight jet shoots sideways out of the side of the frame, ~3-4s, then jaws close. Or: No breath, no effects.>",
  "take": "One continuous 15-second real-time take, broken down into the scenes below. Scenes flow into each other through physical motion only.",
  "scenes": [
    {"scene": 1, "time": "0-4s", "framing": "Start frame: <matches start image exactly>", "camera_motion": "<vehicle drift + slight natural sway>", "action": "<calm, concrete life: what moves, what is heard>", "emotion": "<calm, ordinary>", "sound": "<ambient bed>"},
    {"scene": 2, "time": "4-7s", "framing": "<same view>", "camera_motion": "<continues>", "action": "<physical warning signs: water darkens and bulges, trees lean, birds lift off, a shadow passes>", "emotion": "<unease>", "sound": "<rumble, creak>"},
    {"scene": 3, "time": "7-11s", "framing": "<same view, creature entering>", "camera_motion": "<continues; may tilt to follow>", "action": "<creature physically emerges from water/cloud/frame edge, or the hidden terrain shape rises, step by step, as ONE connected body; first physical contact>", "emotion": "<shock>", "sound": "<water, snapping, groaning>"},
    {"scene": 4, "time": "11-15s", "framing": "Ends on the end frame: <matches end image exactly>", "camera_motion": "<settles>", "action": "<peak: physical damage or contact, the vehicle reacts with weight, creature turns its eyes to the lens>", "emotion": "<awe, dread>", "sound": "<impact + creature>. No music, no speech."}
  ],
  "visual_constraints": [
    "One continuous real-time take: no cuts, crossfades, dissolves, fades or transitions; the creature appears only by physical movement into frame.",
    "No morphing: the creature keeps one exact design and one connected body; no new creatures or people.",
    "No text, logos or watermarks."
  ]
}
```

Writing rules (from `shot-sheet.ts`, Keenan's format):
- **Only positive verbs in `action` and `camera_motion`.** Any unwanted action named there (even "no fire") gets performed. Every must-not lives in `visual_constraints` and nowhere else.
- **Counts and materials in `character_continuity` are what stop morphing.** Praise words waste space.
- **Roar without breath:** nothing in that beat may blast, spray, pour, burst or gush, or the model turns it into breath. Debris and water around it only fall or drift.
- **Breath:** sideways out of the side of the frame, never at the lens (it pours down the chest).
- Every beat is a timed range covering the whole duration with no gaps.
- **Length:** Seedance takes HIGHLY detailed scripts; that detail is what we pay its higher price for (Keenan, 10-09). Target **~6,000–8,000 characters**. A ~8,000-char prompt was accepted in a Higgsfield cost check on 10-09 (no error, normal 105 credits). Spend it on detail: per-scene framing, camera, beat-by-beat physical action, secondary motion, light, sound, and full continuity (anatomy counts, textures, scale cues, what stays fixed). Never pad with repetition. The first real 8k render is the final proof that nothing gets truncated; log it. (The ~2,450 cap only applies to Kling.)

---

## History: lessons from earlier work (pre-10-09)

**One shot only, never stitched scenes.** Multi-shot storyboard videos failed three times:
- the August illustrated story
- the calm voiced video
- the 10-01 storyboard scenes, which had redrawn shots, stray animals, a dragon that froze in the sky and jump-cut

Keenan: "looked absolutely terrible", "not cohesive even slightly". Don't pitch stitched or multi-scene formats again unless a model genuinely does continuous long takes.

**Never judge a clip from a few stills.** Calling the storyboard test good from 5 frames was a mistake. Pull 8+ frames across the clip (watch for disconnected body parts, morphing, things that don't react), and treat Keenan's viewing as the real verdict.

**Same recipe, already automated once:** the Colossal Encounters lane (`lib/content-factory/cinematic-shot.ts`, 10-04) did hidden start frame → reveal end frame on Kling 3.0 4K through the dev API (`image_url` + `last_image_url`). On 10-05 it was cut to Kling 3.0 Turbo, which has no end frame, and the reveal was lost. The lane was retired 10-06. Its pipeline (writer → Jev pick → photos → submit → poll → `finishCinematicVideo`) is the starting point if these clips get automated.

**Movement ceiling is per format.** The 10-05 "too much movement / openings way too over the top" rules (subjects mostly still, subtle effects) apply to the Mythicals pick-post slides. These hyper-real clips are the opposite: big physical action with weight is what Keenan loved (the kraken remake). Keep the CALM in the opening seconds only.

**Finishing (`living-reel.ts` `finishCinematicVideo`):**
- 1s fade up from black, 1.5s fade to black, on picture and sound
- loudness normalized to -14 LUFS
- native model sound preferred
- music only from our owned AI tracks; never downloaded songs (Facebook muted those, 10-03)

**Models and billing:**
- **Higgsfield app account** (the MCP in chat): has Seedance 2.5 and Kling 3.0. These clips run here.
- **Developer API** (Vercel `HIGGSFIELD_API_KEY`): separate credits, used by the pipeline.
- **The `hf-probe` trigger** submits to BOTH and bills twice. Don't use it for volume.
- **Kling 2.5 Turbo:** 5 or 10s only.
- **Kling 3.0 Turbo:** 3–15s, but no end frame and no sound.
- **Kling prompts** cap at about 2,500 characters.
- **Hailuo** removed per Keenan (10-05); **DoP Lite** is dead on the dev API.

**Platforms:**
- Instagram reels can't be deleted through the API, so only post clips that are good to keep.
- Every platform carries the AI-content label (10-07), and TikTok's toggle is set by hand.

---

## Checklist (run before spending video credits)

- [ ] Start photo has NO creature and no people.
- [ ] End photo keeps the exact camera and foreground of the start photo.
- [ ] One creature, one continuous body, classic recognizable anatomy, no famous-character look.
- [ ] The creature physically affects something, and the vehicle reacts.
- [ ] Light is plain daylight, overcast or light mist: no low sunset, no heavy fog.
- [ ] Video prompt is a SHOT SHEET (JSON, Keenan's format) with counts in character_continuity, timed beats, sound, and the no-dissolve and no-morph constraints; style says hyper-realistic, high detail, 4K.
- [ ] No "no/never/without" inside the action beats; must-nots only in the closing line.
- [ ] No human-faced creature; dragons have wings; no weapons on beasts.
- [ ] End photo reachable from start photo by physical motion (water, clouds, frame edge, or hidden-as-terrain). Otherwise expect a dissolve.
- [ ] After render: review 8+ frames AND run the dissolve check (compare consecutive frames in the reveal window for ghosting or double images; a transparent creature = a fade), then add a Log row.
- [ ] Model is Seedance 2.5, 720p, 15s, sound on.

---

## Log

| Date | Clip | Model | Result | What worked / failed | Lesson |
|---|---|---|---|---|---|
| 09-29 | Mythicals option clips (ambient prompts) | Kling | "Basically just zooming in" | Stillness wording | Every beat needs a real action |
| 10-01 | Storyboard scenes (kirin, valley dragon) | Kling Std | Scrapped | Stitched shots incoherent; dragon froze, then jump-cut | One continuous shot only |
| 10-04 | Colossal Encounters tests (Leviathan, Above the Clouds, Shibuya, Summit Watcher) | Kling 3.0 4K | Posted to IG | Hidden start → reveal end worked | Same recipe as now |
| 10-05 | Mythicals powers as big actions | Kling | "Too much movement" | Rearing, swings, torrents | (For pick slides) subtle; hyper-real clips differ |
| 10-07 | Dragon egg hatch | Kling | Fire went downward | "no fire" inside the action text | No prohibitions inside beats |
| 10-09 | Dragon rises beside the plane window | Kling 3.0 Pro | Good | Wing fixed in frame; dragon rises from clouds to the window | Plane window = great anchor |
| 10-09 | Kraken rises beside the cruise ship (v1) | Seedance 2.5 | Loved, but cyclops eye | Railing anchor, water physics strong | Kraken must have two eyes |
| 10-09 | Dragon lands on the tower across the street | Seedance + Kling | Good | Night city, fire upward | Both models handled it |
| 10-09 | Sky dragon over a plain (16:9) | Kling 3.0 Turbo | OK | Static landscape, figure in frame | Not the vehicle format |
| 10-09 | Godzilla-style kaiju, sunset beach | Seedance ×3 | Blocked | Famous-monster look | Avoid Godzilla look on Seedance |
| 10-09 | Same kaiju, sunset beach | Kling 3.0 Pro | Rendered | Sunset backlight made it muddy | Avoid low sunsets |
| 10-09 | Kaiju walks in at the ocean bridge | Kling Pro / Seedance | Kling OK, Seedance blocked | Creature visible at frame 1 | Creature must enter from off-screen |
| 10-09 | Leviathan sea dragon (preview photo) | n/a | Disliked | Busy, sunset | n/a |
| 10-09 | Roller coaster dragon | Seedance 2.5 + 2.0 | "Awful" | Riders' hands in frame, theme-park chaos | No people or hands; calm travel settings |
| 10-09 | Kraken attacks the cruise ship (remake) | Seedance 2.5 | **"Excellent"** | Classic two-eyed kraken, crushes lifeboat, bends railing, real weight | Physical damage with weight = the formula |
| 10-09 | Sea serpent attacks the ferry in fog | Seedance 2.5 | **Poor** | Coils = disconnected rubber rings; no weight (nothing bends, ferry barely moves); head appears late and floats; heavy fog flattened texture | One continuous body, head first; vehicle must react; light mist max; one action |
| 10-09 | Forest giant, river boat | Seedance 2.5 | **Terrible** | The giant CROSSFADED in (a dissolve between the start and end photos), not a physical emergence; I missed it reviewing stills | End photo must be physically reachable; hide land creatures as terrain; run the dissolve check |
