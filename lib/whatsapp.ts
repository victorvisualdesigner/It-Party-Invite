// Deep links that open the inviter's own WhatsApp or SMS app with the message filled in.

export function waLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function smsLink(e164: string, text: string): string {
  return `sms:${e164}?body=${encodeURIComponent(text)}`;
}
