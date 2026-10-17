# Start here

This kit is everything Claude Code needs to build the invite platform. You don't need to explain the idea again. The rules, the data, the copy and the look are all in these files.

## What's inside

| File | Purpose |
| --- | --- |
| `CLAUDE.md` | The build spec. Claude Code reads this automatically when it sits in the project folder. |
| `content/invite-messages.json` | 80 written lines that combine into 160,000 unique invite messages, plus key, covered, card ready and reveal lines |
| `content/key-words.json` | 40 words for access keys like VELVET 4827 |
| `content/no-chase.json` | The No button deck: 12 moves in 3 tiers, lines, idle behaviour, reduced motion |
| `content/copy.json` | Every word on every screen of the three interfaces |
| `design/tokens.css` | Colours, type, spacing, radius and motion |
| `prototype/guest.html` | The guest experience, working. Open it in a browser and play with it. |

## Before you start

You'll need three free accounts:

1. **GitHub**, to hold the code.
2. **Supabase**, for the database and the admin login. Create a new project and keep the URL and the service role key handy.
3. **A host for Next.js**, such as Vercel or Netlify. Check the free plan's terms allow a small paid event.

Also decide:

- The admin's email, password, first name and phone number.
- The payout account: bank, account number and account name.

## Step 1: set up the folder

1. Create an empty folder for the project.
2. Copy everything from this kit into it, keeping the folders as they are. `CLAUDE.md` must sit at the top level.
3. Open Claude Code in that folder.

## Step 2: the first prompt

Paste this exactly:

```
Read CLAUDE.md in full, then every file in content/ and design/, then read prototype/guest.html closely, because the guest page must match its look and motion.

We are building Phase 1 only. Before writing any code, show me:
1. The project setup you'll run
2. The database migration (all tables in section 4, with RLS on)
3. The admin screens for Phase 1 and their routes

Wait for my go ahead before you build.
```

## Step 3: one phase at a time

After you approve and Phase 1 is built and checked, move on with:

```
Phase 1 checks pass. Build Phase 2 from CLAUDE.md section 14. Show me the plan first, then build, then run the Phase 2 checks and show me the results.
```

Repeat for Phases 3 to 6, changing the number each time.

For Phase 3, add this line, because it's the heart of the product:

```
Port the guest experience from prototype/guest.html faithfully: the envelope, the seal crack, the card reveal, every No chase move, the transfer sheet, the waiting state and the card turning over. Keep the guest page under 300 KB.
```

## Prompts for when things go wrong

- **It drifts from the spec:** `Re-read CLAUDE.md section {n} and fix what doesn't match it.`
- **The copy changed:** `Use the exact strings in content/copy.json. Don't write new copy where a string exists.`
- **The guest page is heavy:** `Measure the guest page's first load. Get it under 300 KB compressed without removing any chase move.`
- **Before launch:** `Run the full security checklist in CLAUDE.md section 13 and show me each item with proof.`

## Testing before invites go out

- Open a test invite inside WhatsApp on a real Android phone, ideally a budget one, on mobile data.
- Forward a test invite to a friend and confirm it stays locked for them.
- Make a real ₦100 test event, pay it, confirm it in the admin portal, and scan the card at the door page.
- Fight the No button for a full minute. It should still be surprising.
