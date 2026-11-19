import { describe, expect, it } from "vitest";
import { correctNames, matchFirstName } from "@/lib/people/names";

const first = ["Ananya", "Manoj", "Meera", "Vikram", "Deepa", "Nikhil", "Priya", "Divya", "Arjun", "Karthik", "Aisha", "Sneha", "Siddharth", "Fatima", "Rohan", "Imran", "Lakshmi", "Rahul", "Kavya"];

describe("name correction", () => {
  it("maps transcript and model misspellings to the directory", () => {
    expect(matchFirstName("Pria", first)).toBe("Priya");
    expect(matchFirstName("Snehal", first)).toBe("Sneha");
    expect(matchFirstName("Ayesha", first)).toBe("Aisha");
  });

  it("leaves ordinary words and correct names alone", () => {
    for (const word of ["Atlas", "August", "Arjun", "Meera", "Board", "Marketing", "Finance", "Rahul", "Sales", "Kolkata", "Deadline"]) {
      expect(matchFirstName(word, first)).toBe(word === "Arjun" || word === "Meera" || word === "Rahul" ? null : null);
    }
  });

  it("corrects inside sentences", () => {
    expect(correctNames("Pria has been doing late nights; Snehal owns on-call.", first)).toBe(
      "Priya has been doing late nights; Sneha owns on-call.",
    );
  });
});
