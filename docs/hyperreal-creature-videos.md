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
3. **One clip:** Seedance 2.5, start and end photos, 15s, 720p, sound on, 9:16. The model animates the journey between the two frames.
4. **Delivery:** upload to our storage, then email with a "Save to camera roll" button (`/save-video`). Use a direct REST/curl upload for files over ~10MB, because supabase-js timed out.

| Item | Setting | Cost |
|---|---|---|
| Photos | `gpt_image_2_5`, quality high, 2k, 9:16; end photo uses the start photo as `image_references` | 2.75 credits each |
| Video | `seedance_2_5`, mode `omni_reference`, `start_image` + `end_image`, 720p, `generate_audio: true`, 15s | 105 credits (25s is 175) |
| Ignore | Higgsfield's "IN THE DARK" preset suggestion; resubmit with `declined_preset_id` | n/a |

Seedance 2.0 (67.5 credits) was tested once, on the roller coaster, and judged no better or worse there. Keenan wants **Seedance 2.5 only**. Never switch models without asking.

---

## Rules

### Setting
- **Calm, everyday travel shot with relative motion.** The camera is inside something moving, with a fixed foreground anchor (wing, railing, bow, window frame, dashboard) while the world slides past. Proven: plane window, cruise railing, car on a bridge, ferry deck, boat on a forest river.
- **No people in frame.** No hands, riders or faces. The roller coaster (hands on the lap bar) was "awful".
- **Plain, real light:** midday sun, overcast or light mist. Avoid low sunsets (they backlight the creature into a muddy silhouette) and heavy fog (flat grey, kills texture; the ferry failed partly on this).
- **Phone-camera realism** in the photo prompt: ordinary iPhone photo, no color grading, true-to-life exposure, slight haze or reflection.

### Creature
- **Never in the start photo.** It enters from off-screen, or rises out of water, clouds or forest. The empty first seconds are the hook.
- **Instantly recognizable, classic anatomy.** Fans love dragons, krakens, serpents and giants. A kraken is a traditional two-eyed octopus/squid with a beak, never a cyclops.
- **One creature, one continuous body.** A serpent surfaces head-first and its body follows as ONE connected back. Never write "coils on both sides" (that produced disconnected rubber rings).
- **It physically interacts, with weight.** It grabs, crushes, bends or tilts something, and the vehicle reacts (rolls, lurches, wave hits). The cruise kraken crushing a lifeboat was "excellent".
- **No famous-character lookalikes.** Seedance blocks a Godzilla-style kaiju every time (4 blocks, status `nsfw`, not charged). Keep away from upright dinosaur bodies with rows of back plates.
- **No people hurt, no gore.** Destroying objects is fine.

### Prompt wording
- Every photo and video prompt includes **"hyper-realistic, high detail, 4K"**. It's wording only; it doesn't change the render resolution.
- Video prompts use **timed beats** (0-4s / 4-8s / 8-12s / 12-15s) so nothing stalls or crams.
- State the physics: heavy, massive, slow realistic motion; real water physics; believable scale; no slow motion; no cuts.
- List the sound: ambient bed first, then the creature (rumble, hiss, roar), then impact (metal groaning, wave slapping the hull).
- End with: No people. No text.

---

## Templates

**Start photo**
> Hyper-realistic, high detail, 4K ordinary iPhone photo taken from [POV: the bow of a small wooden boat / a cruise ship balcony railing / a plane window], vertical. In the foreground: [fixed anchor details]. Beyond: [the scene, the movement it implies, distance cues]. [Plain light]. True-to-life colors, no color grading, realistic phone-camera exposure, fine texture on [materials]. The [sky/water/forest] is empty. No people, no text.

**End photo** (edit with the start photo as reference)
> Hyper-realistic, high detail, 4K edit of this exact [scene] photo, keeping the camera position, [foreground anchor], [scene], light and phone-camera look identical. [ONE creature, classic anatomy, colors, size relative to the vehicle/trees], [what it is physically doing to the vehicle or scene, with visible consequence]. Realistic [wet skin / scales / moss] texture, believable massive scale against [reference object], [light]. No people, no text.

**Video (Seedance 2.5)**
> Hyper-realistic, high detail, 4K handheld iPhone footage from [POV], one continuous 15-second shot, slight natural [hand shake / boat sway], the [anchor] staying fixed in frame. 0-4 seconds: [calm normal scene + ambient detail]. 4-7 seconds: [warning signs: water darkens, trees shake, birds flee, a rumble]. 7-11 seconds: [the creature emerges as ONE continuous body, and the first physical contact]. 11-15 seconds: [peak moment: the vehicle reacts with weight, the creature looks at the camera]. Slow, heavy, massive, realistic motion, real [water] physics, believable scale, [light], no slow motion, no cuts. Sound: [ambient], [creature], [impacts]. No people, no text.

---

## Checklist (run before spending video credits)

- [ ] Start photo has NO creature and no people.
- [ ] End photo keeps the exact camera and foreground of the start photo.
- [ ] One creature, one continuous body, classic recognizable anatomy, no famous-character look.
- [ ] The creature physically affects something, and the vehicle reacts.
- [ ] Light is plain daylight, overcast or light mist: no low sunset, no heavy fog.
- [ ] Prompt says hyper-realistic, high detail, 4K; has timed beats, physics and sound.
- [ ] Model is Seedance 2.5, 720p, 15s, sound on.

---

## Log

| Date | Clip | Model | Result | What worked / failed | Lesson |
|---|---|---|---|---|---|
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
| 10-09 | Forest giant, river boat | Seedance 2.5 | Pending | Start = empty river; hillside tears free, steps into river | Review frames when done |
