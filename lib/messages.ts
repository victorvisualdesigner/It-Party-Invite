// Invite messages, assembled only from content/invite-messages.json. Nobody types message text.
import { randomInt } from "node:crypto";
import messages from "@/content/invite-messages.json";
import { fill } from "@/lib/copy";

export type Combo = [number, number, number, number];

export const PART_SIZES = [messages.opening.length, messages.pull.length, messages.mystery.length, messages.close.length] as const;

export function randomCombo(): Combo {
  return [randomInt(PART_SIZES[0]), randomInt(PART_SIZES[1]), randomInt(PART_SIZES[2]), randomInt(PART_SIZES[3])];
}

export function randomKeyLine(): number {
  return randomInt(messages.key_lines.length);
}

export function randomCoveredLine(): number {
  return randomInt(messages.covered_lines.length);
}

export type MessageInput = {
  guest: string;
  inviter: string;
  link: string;
  key: string;
  combo: number[];
  keyLine: number;
  /** Only when the inviter has already paid for the guest. */
  coveredLine?: number | null;
};

/** The full WhatsApp text: invite, link on its own line, then the key line. */
export function assembleMessage(input: MessageInput): string {
  const vars = { guest: input.guest, inviter: input.inviter, link: input.link, key: input.key };
  const [o, p, m, c] = input.combo;
  const covered = input.coveredLine != null ? " " + fill(messages.covered_lines[input.coveredLine], vars) : "";
  return fill(messages.assembly.template, {
    opening: fill(messages.opening[o], vars),
    pull: fill(messages.pull[p], vars),
    mystery: fill(messages.mystery[m], vars),
    covered,
    close: fill(messages.close[c], vars),
    link: input.link,
    key_line: fill(messages.key_lines[input.keyLine], vars),
  });
}

/** Splits an assembled message into the invite body, the link and the key line. */
export function messageParts(full: string): { body: string; link: string; keyLine: string } {
  const [body = "", link = "", keyLine = ""] = full.split("\n\n");
  return { body, link, keyLine };
}

export function cardReadyMessage(guest: string, link: string): string {
  const lines = messages.card_ready_messages.lines;
  return fill(lines[randomInt(lines.length)], { guest, link });
}

export function revealMessage(guest: string, link: string): string {
  const lines = messages.reveal_messages.lines;
  return fill(lines[randomInt(lines.length)], { guest, link });
}

/**
 * The line a guest sends their inviter after tapping {inviter} is paying for me. `link` is the
 * inviter's own page. `pick` keeps the same line across polls of the waiting screen.
 */
export function askInviterMessage(inviter: string, guest: string, link: string, pick = randomInt(1e6)): string {
  const lines = messages.ask_inviter_messages.lines;
  return fill(lines[Math.abs(Math.trunc(pick)) % lines.length], { inviter, guest, link });
}
