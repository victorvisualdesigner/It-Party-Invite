import { describe, expect, it } from "vitest";
import { localPhone, maskPhone, normalizePhone } from "@/lib/phone";
import { formatPhoneTyping } from "@/lib/phone-typing";

describe("normalizePhone", () => {
  it.each([
    "0803 123 4567",
    "803 123 4567",
    "+234 803 123 4567",
    "2348031234567",
    "+234 0803 123 4567",
    "00234 803 123 4567",
    "0803-123-4567",
  ])("accepts %s as +2348031234567", (input) => {
    expect(normalizePhone(input)).toBe("+2348031234567");
  });

  it("accepts foreign numbers written with + and a country code", () => {
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
    expect(normalizePhone("+1 415 555 2671")).toBe("+14155552671");
  });

  it.each(["", "12345", "0803 123 456", "0103 123 4567", "+999 1234", "hello"])("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("display", () => {
  it("masks Nigerian numbers as 080•••••567", () => {
    expect(maskPhone("+2348031234567")).toBe("080•••••567");
  });
  it("masks foreign numbers as country code, dots, last 3", () => {
    expect(maskPhone("+447911123456")).toBe("+44 •••••456");
  });
  it("formats local numbers", () => {
    expect(localPhone("+2348031110001")).toBe("0803 111 0001");
  });
  it("formats as the admin types", () => {
    expect(formatPhoneTyping("08031234567")).toBe("0803 123 4567");
    expect(formatPhoneTyping("0803")).toBe("0803");
    expect(formatPhoneTyping("+2348031234567")).toBe("+234 803 123 4567");
  });
});
