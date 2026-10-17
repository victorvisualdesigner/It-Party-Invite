# Only Yes: design build

A high fidelity, clickable build of every interface in `CLAUDE.md`: the Guest page, the Member app, the Admin portal and the Resistance Board. They share one set of demo data in the browser, so an invite sent in the Member app opens on the Guest page, and a payment confirmed in the Admin portal turns the guest's card over live in the other tab.

This is the design reference for Phases 1 to 6. It is not the production app: there is no server, and the demo data lives in `localStorage`.

## Run it

```bash
node ui/tools/serve.mjs
```

Then open http://127.0.0.1:4173/ui/. The hub page links to every interface and lists the demo numbers and keys.

| Who | Number | Key |
| --- | --- | --- |
| Ada (guest, invited by Tolu) | 0803 123 4234 | VELVET 4827 |
| Tolu (member, 5 slots) | 0803 111 0001 | LANTERN 5372 |
| Dayo (member, Unlimited) | 0805 222 0002 | CROWN 8264 |
| Ife (member, 2 slots) | 0809 333 0003 | PEARL 3957 |
| Host | any email and password | |

Every page has a dashed **Prototype** button with shortcuts: fill in the key, pretend to be another phone, see what a stranger sees, act as the host, and reset the demo.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The hub: the four doors, the full loop, the palette and type, design decisions |
| `guest.html`, `assets/guest.css`, `assets/guest.js` | The guest page, every state in one route |
| `member.html`, `assets/member.js` | The Member app |
| `admin.html`, `assets/admin.css`, `assets/admin.js` | The Admin portal |
| `board.html` | The Resistance Board for the TV |
| `assets/composer.js`, `assets/composer.css` | The invite composer and pay sheet, shared by members and the host |
| `assets/base.css` | Shared components: buttons, fields, chips, sheets, the envelope and seal |
| `assets/kit.js` | Copy lookup, motion helpers, toast, clipboard, the wax seal, envelope, icons and QR |
| `assets/store.js` | The stand-in backend. Each function maps to a server action in the real build |
| `assets/content.js` | Generated from `content/*.json`. Rebuild with `node ui/tools/build-content.mjs` |

Colours, type, space and motion come from `design/tokens.css`. The few extra tokens the build needed sit at the top of `assets/base.css`, ready to promote.

## What changed from the brief and the prototype

- **Nothing leaks on the lock screen.** The prototype wrote "For Ada" on the letter inside the sealed envelope. The letter now stays blank until the key matches, then the name appears as the letter rises.
- **The expired screen** uses "the person who invited you" unless this phone already unlocked the invite, so a forwarded link never reveals the inviter's name.
- **Paste the whole message.** The key field pulls `VELVET 4827` out of anything pasted, including the full WhatsApp text. The phone field formats as you type.
- **The envelope has a lining.** When the flap opens, the inside shows bottle green with a fine gold lattice. The front carries a small "By hand" mark in gold.
- **The card is a ticket.** The premium card has a perforated stub with notches, the QR on cream, and the ticket code under it. Save card renders a real PNG; Add to calendar downloads an .ics once the date is revealed.
- **Members see exactly what lands.** The composer previews the WhatsApp chat: the sealed envelope link card, the message, the link and the key, highlighted.
- **The host sees what guests see.** Event settings has a live preview of the invite card that follows every field and reveal mode.
- **Animations never hold the page.** Every sequence resolves on its own deadline and a tap skips it, so a busy or backgrounded phone never gets stuck mid seal.
- **The event date** moved to Saturday 19 December 2026. The brief's sample said "Saturday, 20 December", which is a Sunday in 2026.

## Copy

All strings come from `content/copy.json`. New strings were added in the same voice (no dashes between clauses, no emojis, sentence case buttons), including the No chase labels, the time aware greeting, the composer helpers, the ticket lines, the admin activity feed, and the Door and Members screens. One existing string changed: `guest.lock.error_network` lost a comma splice.
