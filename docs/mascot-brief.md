# VibePeep mascot: master design brief

For: the mascot designer (coding agent) and the mascot reviewer. Repo `TamaTauira/Outza`, PR #75, branch `cursor/fix-vibepeep-mascot-b603`. Owner: Tama Tauira. Written 5 Nov 2026 (AEDT).

## 0. NON-NEGOTIABLE RULE: his look comes from Tama's reference sheet

- His look must always be taken from Tama's 23-image reference character sheet in `/workspace/mascot-ref` (to be copied to `docs/mascot-ref/`). That sheet is the single source of truth.
- Never invent, simplify, restyle or "reinterpret" his look. If a pose isn't on the sheet, build it from the parts as they appear on the sheet.
- Every round, put your frames side by side with the reference images and compare before submitting.
- Contact sheet of all 23: `/workspace/mascot-ref-contact.jpg`.
- Snake dance reference: `/workspace/britney-ref.png` (Britney Spears, 2001 VMAs, python on shoulders).
- Note: the reference JPGs have a small "Grok" watermark bottom-right and a white background. Neither must ever appear in the site art.

### Reference files (numbered as in the contact sheet)

| # | File | What it shows |
|---|------|---------------|
| 01 | 01M66F5AT2P0XQ40WSKXP5T70Q.jpg | Excited jump, one arm up, orange "surprise" dashes |
| 02 | 01M66F5DTK1KHJNF2A01HTQRP7.jpg | Three-quarter view, waving, hand on hip |
| 03 | 01M66F5GWM4CCQXTRDMV11FY2Q.jpg | Happy hop, one knee raised, arms out |
| 04 | 01M66F5M3MTT5X2716GN95140Q.jpg | Running, three-quarter side view |
| 05 | 01M66F5NXD44K5SBGE3PPMZSK8.jpg | Pointing (finger point), mid-stride |
| 06 | 01M66F5RKMHSDG4M4SYQQJTXHJ.jpg | Three-quarter standing, arms relaxed |
| 07 | 01M66F5TCHWAKJHPJAF77N2292.jpg | Front, hands on hips |
| 08 | 01M66F5W639MZQ54GBS4W69PAH.jpg | Surprised walk, orange dashes |
| 09 | 01M66F5XWX2K503VP5SY9EW6P7.jpg | Side-on stride, arm pointing forward |
| 10 | 01M66F5Z8Y27BE2FEHKAATJ2Q1.jpg | Front, hands on hips, wide stance |
| 11 | 01M66F62CZ0N6MBK3NPQZRE3G5.jpg | Front T-pose: master proportions and colours |
| 12 | 01M66F65RFGS066YWEPQDM32VD.jpg | Three-quarter, arms out, one foot lifted |
| 13 | 01M66F698AX5FM6GQTGM3Z38GH.jpg | Side-on run with surprise dashes |
| 14 | 01M66F6CG4846G8VRK1Y8JFDD0.jpg | True side profile walking (key walk-cycle reference) |
| 15 | 01M66F6FX4KZBSF8KQ4Z9N56G7.jpg | Back view (antenna, back seams, boots from behind) |
| 16 | 01M66F73XQPVBE9J9HHWX3C1B3.jpg | Side-on walk/run, arms swinging |
| 17 | 01M66F76Q7GF33EHWBV3B1JJZ2.jpg | Front, arms relaxed at sides (idle) |
| 18 | 01M66F7AD8H9175HJPJ3584S0V.jpg | Front wave |
| 19 | 01M66F7DAYCZN91XG7KYBH117F.jpg | Three-quarter, laughing, arms at sides |
| 20 | 01M66F7H0N1ME1M6W96E7F5F5T.jpg | Sitting on the ground |
| 21 | 01M66F7M2X309TWMGKRWWQ7Q0V.jpg | Front, both arms raised a little |
| 22 | 01M66F7RA82167Y0SSEXTNEWRS.jpg | Cheering, both arms up |
| 23 | 01M66F7WN1S4FRZYQX9YVF8MP1.jpg | Jumping, arms up, legs tucked |

## 1. His look in detail (from the sheet)

### Overall build and proportions (ref 11, 17, 07)
- Glossy-matte soft black vinyl toy, 3D-rendered, rounded everywhere. No hard corners, no flat cartoon outlines.
- Total height (antenna tip to boot sole) is about 1.0. Antenna (ball and stem) is about 0.13, body about 0.62, legs and boots about 0.25.
- Body: an upright egg or bean, a bit wider at the bottom, about 0.78 as wide as it is tall. Smooth domed top.
- The face mask sits in the upper half of the body. The eyes' centre line is about 42% down from the top of the body.

### Colours (sampled from ref 11)
| Part | Hex |
|---|---|
| Body base | `#2c2c2e` (range `#202020` to `#303030`) |
| Body deepest shadow | `#101010` to `#151517` |
| Body highlight / rim light | `#585659` |
| Orange eye ring (left) | `#ff8d44` (range `#f08030` to `#f09050`) |
| Pink eye ring (right) | `#f0627a` (range `#e06070` to `#f07080`) |
| Eye white | `#fef7ef` (warm off-white, fully opaque) |
| Pupil | `#040507` |
| Mouth inside | `#cc514c` |
| Tongue | `#d45244` with lighter pink top |
| Antenna ball highlight | `#565457` on a `#2c2c2e` base |
| Boots | `#282828` with sole rim around `#4a4a4a` |

### Shading and gloss
- Soft studio lighting from upper left. Broad soft highlight on the top-left of the head dome and the antenna ball, and a soft darker shadow toward the bottom and right.
- A subtle satin sheen, not mirror chrome. Thin lighter rim light along the body edges so his silhouette reads on a dark background.
- Faint panel seams: a curved seam on each side of the body from shoulder down (ref 11, 15), and a horizontal belt-line seam low on the belly with a small dip in the middle (ref 11). Keep them faint.
- A soft contact shadow under him on the ground, never a white floor patch.

### Antenna (ref 11, 15, 01)
- A thin dark stem with a small collar or flare where it meets the top-centre of the head, topped by a round glossy ball about 1.5 times the stem's height in diameter, with a highlight on its upper left.
- It is ALWAYS present and ALWAYS attached to the top-centre of his head, in every frame of every pose, reaction and dance, including when he is lying down, upside down, face-down, lifting the snake, spinning or jumping. It moves with his head as one piece, and may wobble slightly but never detaches, floats or disappears.

### Face mask and eyes (ref 11, 17, 19)
- One joined mask shaped like a figure eight or sideways heart: an orange ring around his left eye (viewer's left) and a pink ring around his right eye. The rings overlap at the centre above the mouth and blend orange to pink. The mask extends down into a soft point around the mouth.
- The rings are raised and glossy, with a soft inner bevel.
- Eyes: big round off-white eyeballs, fully solid and opaque (never see-through, never body colour showing through), with large black pupils looking slightly up and forward, and two white catch-lights (one large upper-left, one small lower-right).
- Mouth: a small open happy smile (D-shape) under the eye join, dark red inside with a pink tongue. Expressions can change (laugh in ref 19, surprise in ref 01 and 08), but the style stays the same.
- Side profile (ref 14): only one eye and its ring show at the front edge, and the mask follows the body's curve.
- The logo and site icon use these same eyes.

### Arms and mittens (ref 11, 18, 22, 02)
- Rounded tube arms, about the thickness of the legs, attached high on the sides of the body at shoulder level. Each arm has a subtle joint seam at the elbow (ref 11).
- They are always complete and solid, and join the shoulder cleanly with no gap or offset. They are never boxy, rectangular, stick-thin, wireframe or outline-only.
- Hands are mittens: a rounded mitten shape with a small thumb nub. For pointing (ref 05, 09) and the disco point, one finger extends from the mitten.
- At rest the arms hang down by his sides (ref 17).

### Legs and boots (ref 11, 15, 14)
- Short, thick, rounded cylinder legs set apart under the body. They join the body with no gap.
- Boots are chunky and rounded at the toe, solid black, with a slightly lighter grey rim only along the sole. Side-on (ref 14), the boot is a rounded wedge with the toe pointing forward and a solid black upper, never a hollow ring or outline.

### Outline style
- No drawn black outline strokes. Edges are defined by shading and rim light, like the 3D renders.
- Clean, transparent background (PNG or SVG with alpha). No white halos, fringes, boxes or floor patches, in light or dark mode.

### Personality
- Cute, fun, energetic and super lovable. Brand voice: playful, curious, social, energetic, approachable, urban and spontaneous.

## 2. Size and placement
- One consistent compact size everywhere: about 84px tall on desktop and about 75px on phone, the same on Board, Map and Local. He must never hog the screen.
- Only one live mascot roams the site, with no separate mascot in the header or hero.
- He never overlaps the header, logo, tagline and headline, clock, city selector, search bar, section headings, event cards, buttons (including "Feature Your Event" and "List your thing free"), links such as "See all", map pins, the location prompt or the Ask box.
- His speech bubbles never cover controls, buttons or cards either.
- Fixed parking spots, deterministic on every page load:
  - Desktop Board: in the "Hot right now" row, just left of "Feature Your Event" (16px clear of it).
  - Phone Board: the gap under the hero, clear of the clock and "Answer it."
  - Local: the right-hand gutter, never over the event cards.
  - Map: open map area, away from pins and map controls.
- The × close (hide) button is always fully on screen.
- On mobile, his invisible tap area must not block taps on the page beneath him.
- Reactions such as the spin must never be clipped by their container.

## 3. Movement
- He moves like a living robot and is never frozen in a single photo or pose.
- Walking:
  - Real stepping legs, built from the sheet's walk poses (ref 14, 16, 04).
  - Arms down by his sides, swinging naturally in opposition to the legs.
  - Fun, stompy robot steps with a little bounce and tilt on each step. Playful, not glitchy.
  - He turns side-on (profile) and faces the direction he is travelling. He never walks backwards. Any speech bubble or label about direction matches where he is going.
  - Feet plant on the ground without sliding, the stride length matches his travel speed, and legs never snap, pop or jitter between frames.
- Idle animations (blinks, small sways, looks around).
- At least 10 expressive click reactions, kept at all times.
- The option to hide him (×) is always available and remembered. Avoid hydration mismatches when reading the saved state.
- He can jump (ref 01, 23).
- Props are held properly. For example, a pizza is held in his mitten and the arm brings it to his mouth. It never floats.
- No emoji stand-ins (for example, no yellow hand emoji for the wave). Everything is drawn on-model.

## 4. Dances
- Double-click plays a random one of the 20 dances in a hidden dance party.
- Dances are varied, fun and iconic, and each one must clearly read as its named dance: moonwalk, YMCA, Macarena, a Hawaiian dance, the Britney snake dance, the robot, the griddy, the twist, the running man, post-2020 viral dances and so on. Nothing culturally sensitive.
- His arms stay attached at the shoulders in every dance (past failures: chicken, cha-cha, disco point, goth snap, shuffle, sprinkler, robot).
- Disco: a single big realistic mirrored disco ball with light beams and sparkles, never several small ones. The disco point is a raised mitten with one finger pointing up.
- Britney snake dance (ref `/workspace/britney-ref.png`):
  - Recreates the 2001 VMAs moment: a big yellow python draped over his shoulders, lifted overhead at times, while he does a slow body roll.
  - The python is a smooth organic curve with a tapered tail and a proper head. It is never blocky, segmented or jagged, and it never covers his face or eyes.
  - The antenna stays visible and attached while he lifts the snake.
- Dance name labels sit below his feet, never over his body or legs.
- Eyes stay solid and the antenna stays attached in every dance frame (for example, in the worm, when he is face-down).

## 5. Process
- Change only what Tama asks for. Anything that already passed stays as it is.
- Mascot work needs a demo video and Tama's explicit approval before any merge. No auto-merge.
- Redraws continue without pausing.
- Reviews use fresh live-preview frames (not cached screenshots), on desktop and phone, in light and dark mode, and check frame by frame, including the antenna in every frame.
- Parking is checked over several reloads and several screenshots after the page loads. The demo fails automatically if he overlaps anything on Board, Map or Local.
- Use the 12-hour clock in any labels or notes.

## 6. Reviewer acceptance checklist (tick every item, every round)

Look
- [ ] Compared side by side with the reference sheet. Matches proportions, colours, seams and gloss.
- [ ] Antenna present and attached at the top-centre of the head in every frame of every pose, reaction and dance.
- [ ] Eyes are fully opaque, with orange left and pink right rings joined in the middle, and two catch-lights each.
- [ ] Arms are rounded tubes with mittens, complete and attached at the shoulders, in every frame.
- [ ] Legs join the body with no gaps.
- [ ] Boots are solid black with a grey rim only along the sole, front and side-on.
- [ ] Transparent background with no halos or white patches, in light and dark mode.
- [ ] No watermark, emoji stand-ins or floating props.

Size and placement
- [ ] About 84px desktop and about 75px phone, the same on Board, Map and Local.
- [ ] Only one mascot on screen.
- [ ] No overlap with the header, clock, headings, cards, buttons, pins, the location prompt or the Ask box, across several reloads.
- [ ] Parks in the fixed spot for each view, every time.
- [ ] Speech bubbles don't cover controls. The × is fully on screen. The tap area doesn't block the page.

Movement
- [ ] Side-on while walking, facing the direction of travel. Never backwards.
- [ ] Feet plant without sliding, stride matches speed, no leg popping or jitter.
- [ ] Arms down and swinging, stompy bounce and tilt per step.
- [ ] Idle animation, at least 10 click reactions, hide option, jump all work. Spin isn't clipped.

Dances
- [ ] Double-click plays a random dance from the 20, each clearly its iconic dance.
- [ ] One big realistic disco ball with beams and sparkles. Disco point has the finger up.
- [ ] Snake dance: yellow python with smooth curves, draped and lifted overhead, slow body roll, face uncovered.
- [ ] Labels sit below his feet.

Process
- [ ] Only requested changes made. Earlier passes didn't regress.
- [ ] Fresh live-preview frames, checked frame by frame. Demo videos ready for Tama.

## 7. Known past failures: never regress
- See-through eyes (transparent eye whites after background removal).
- Double arms or body (hip pose photo showing over the rig).
- Pizza floating at his mouth instead of held in his mitten.
- Walk was one frozen photo gliding across the page. Jump, sit and wave were single stills.
- Arms detached from the shoulders in several dances.
- Dances that all looked the same.
- Spin reaction clipped by its container.
- Yellow hand emoji used for the wave.
- iPhone: parked over "See all" and event cards, partly off-screen, tap area blocked taps, speech bubble over cards.
- White floor patch under the sit pose. Straight stick arms on the idle rig.
- Boxy arms, then wireframe or outline arms.
- Hollow grey-ring boots side-on.
- Several small disco balls instead of one big one.
- Mascot too large and different sizes per view. A second mascot at the top of the page.
- Parked over the clock and "Answer it." on Board. Walked over the first Local card. Random parking on desktop Board (once landed far right over a card with the × off screen).
- Walked over map pins, parked on "List your thing free" and partly over the Ask box.
- Antenna missing while he lifts the snake overhead, and detached and floating in the worm (v24, caught by Tama).
- Walking backwards (moving left while facing right, with a "Walk right" bubble), sliding feet, legs snapping straight mid-step.
- Blocky, jagged snake.
- Dance labels over his legs.
