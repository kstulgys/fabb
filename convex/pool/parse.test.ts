/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import scheduleHtml from "./fixtures/schedule.html?raw";
import eventWithCalories from "./fixtures/event-with-calories.html?raw";
import eventNoCalories from "./fixtures/event-no-calories.html?raw";
import eventCaloriesAlt from "./fixtures/event-calories-alt.html?raw";
import eventNoMax from "./fixtures/event-no-max.html?raw";
import {
  parseAvailability,
  parseBookingResult,
  parseEventDetail,
  parseSchedule,
} from "./parse";

describe("parseSchedule", () => {
  const classes = parseSchedule(scheduleHtml);

  test("returns every class on the page", () => {
    expect(classes.length).toBe(29);
  });

  test("parses the span-wrapped name variant, stripping the inner time span", () => {
    // <em class="event-name"><span class="event-date">07:00 - 07:50</span>TRX treniruotė</em>
    const trx = classes.find((c) => c.pid === "258");
    expect(trx).toBeDefined();
    expect(trx?.name).toBe("TRX treniruotė");
    expect(trx?.name).not.toContain("07:00");
    expect(trx?.startTime).toBe("07:00");
    expect(trx?.endTime).toBe("07:50");
    expect(trx?.date).toBe("2026-06-15");
  });

  test("parses the bare name variant (no inner time span)", () => {
    // <em class="event-name">FIT BOX treniruotė</em>
    const bare = classes.find((c) => c.pid === "230");
    expect(bare).toBeDefined();
    expect(bare?.name).toBe("FIT BOX treniruotė");
    expect(bare?.date).toBe("2026-06-19");
  });

  test("unescapes HTML entities in the name", () => {
    const fk = classes.find((c) => c.pid === "213");
    expect(fk?.name).toBe('"Fat Killer" SALĖ 2');
  });

  test("counts intensity hearts", () => {
    expect(classes.find((c) => c.pid === "258")?.intensity).toBe(2); // ❤❤
    expect(classes.find((c) => c.pid === "121")?.intensity).toBe(3); // ❤❤❤
    expect(classes.find((c) => c.pid === "125")?.intensity).toBe(1); // ❤
  });
});

describe("parseEventDetail", () => {
  test("parses a calorie range and duration", () => {
    expect(parseEventDetail(eventWithCalories)).toEqual({
      kcalMin: 500,
      kcalMax: 800,
      durationMin: 50,
    });
  });

  test("parses a different calorie range from the same markup", () => {
    expect(parseEventDetail(eventCaloriesAlt)).toEqual({
      kcalMin: 800,
      kcalMax: 1400,
      durationMin: 50,
    });
  });

  test("returns null calories when the modal has no Kalorijos line", () => {
    expect(parseEventDetail(eventNoCalories)).toEqual({
      kcalMin: null,
      kcalMax: null,
      durationMin: 50,
    });
  });
});

describe("parseAvailability", () => {
  test("parses full counts (free, registered, max)", () => {
    expect(parseAvailability(eventWithCalories)).toEqual({
      free: 14,
      registered: 6,
      max: 20,
    });
  });

  test("absorbs the &nbsp; the pool puts before the cap's <b>", () => {
    // event-no-calories' cap line is `Maks. vietų sk:&nbsp; <b>24</b>`.
    expect(parseAvailability(eventNoCalories)).toEqual({
      free: 1,
      registered: 23,
      max: 24,
    });
  });

  test("returns null for a field the modal omits (no cap line)", () => {
    expect(parseAvailability(eventNoMax)).toEqual({
      free: 5,
      registered: 10,
      max: null,
    });
  });

  test("returns all-null when the modal has no availability section", () => {
    expect(parseAvailability("<div>nothing here</div>")).toEqual({
      free: null,
      registered: null,
      max: null,
    });
  });
});

describe("parseBookingResult", () => {
  // Fixtures are constructed from the documented exact response strings — a real
  // booking response cannot be obtained without booking a real, limited spot.
  test("classifies a successful registration", () => {
    expect(
      parseBookingResult(
        "<div class='msg'>Jūs sėkmingai užsiregistravote į užsiėmimą.</div>",
      ),
    ).toBe("registered");
  });

  test("classifies an already-registered response", () => {
    expect(
      parseBookingResult("<p>Jūs jau esate užsiregistravęs į šį užsiėmimą.</p>"),
    ).toBe("already");
  });

  test.each([
    "atsiprašome, nėra laisvų vietų šiam užsiėmimui",
    "deja, nėra vietų",
    "vietų nebėra",
    "nebėra vietų šiam užsiėmimui",
  ])("classifies a full class from %j", (phrase) => {
    expect(parseBookingResult(`<div>${phrase}.</div>`)).toBe("full");
  });

  test("falls back to error for an unrecognised response", () => {
    expect(parseBookingResult("<div>Įvyko nenumatyta klaida.</div>")).toBe(
      "error",
    );
  });

  test("never optimistically reports success — empty input is error", () => {
    expect(parseBookingResult("")).toBe("error");
  });

  test("a success banner wins over an incidental 'vietų' mention", () => {
    // Registered/already are checked before the full phrasings, so a success
    // response that also says "vietų nebėra" (for others) is still 'registered'.
    expect(
      parseBookingResult(
        "<div>sėkmingai užsiregistravote — daugiau vietų nebėra kitiems.</div>",
      ),
    ).toBe("registered");
  });
});
