import { describe, expect, it } from "vitest";
import { addressCeoCorrectly } from "@/lib/people/address";

const names = ["Ananya", "Meera", "Vikram", "Fatima"];

describe("CEO form of address", () => {
  it("replaces a colleague's name used as a greeting", () => {
    expect(addressCeoCorrectly("Meera, the numbers are steady.", "Ananya", names)).toBe("Ananya, the numbers are steady.");
    expect(addressCeoCorrectly("Hi Vikram, settling in well.", "Ananya", names)).toBe("Hi Ananya, settling in well.");
  });

  it("replaces a trailing address", () => {
    expect(addressCeoCorrectly("It's on track, Meera.", "Ananya", names)).toBe("It's on track, Ananya.");
  });

  it("leaves colleagues mentioned in the sentence alone", () => {
    expect(addressCeoCorrectly("Karthik ran it while Fatima was away.", "Ananya", names)).toBe(
      "Karthik ran it while Fatima was away.",
    );
  });
});

import { formalAddress } from "@/lib/people/address";

describe("formal address for people below the CEO's direct reports", () => {
  it("replaces her first name as a form of address with ma'am", () => {
    expect(formalAddress("Ananya, the incident load is heavy.", "Ananya")).toBe("Ma'am, the incident load is heavy.");
    expect(formalAddress("Good morning, Ananya! Thank you for asking.", "Ananya")).toBe("Good morning, ma'am! Thank you for asking.");
    expect(formalAddress("I'm sorry for the delay, Ananya.", "Ananya")).toBe("I'm sorry for the delay, ma'am.");
  });
  it("leaves mentions inside a sentence alone", () => {
    expect(formalAddress("I sent Ananya's note to Vikram.", "Ananya")).toBe("I sent Ananya's note to Vikram.");
  });
});
