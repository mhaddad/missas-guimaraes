import { describe, expect, it } from "vitest";
import { FUSO_HORARIO } from "./index.ts";

describe("motor de horários", () => {
  it("usa a hora de Lisboa", () => {
    expect(FUSO_HORARIO).toBe("Europe/Lisbon");
  });
});
