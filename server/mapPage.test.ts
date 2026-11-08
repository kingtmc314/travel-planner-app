import { describe, expect, it } from "vitest";
import {
  buildActivityPinPreview,
  summarizeItineraryLocations,
  mapNotesForDisplay,
  preserveMapNoteProvenance,
} from "../client/src/components/ActivityPinImport";

const activity = (id: number, patch: Record<string, unknown> = {}) => ({
  id,
  title: `Activity ${id}`,
  lat: null as unknown,
  lng: null as unknown,
  location: null as string | null,
  notes: null as string | null,
  ...patch,
});

describe("map activity pin preview", () => {
  it("accepts real zero coordinates and valid geographic range endpoints", () => {
    const records = [
      activity(1, { lat: "0", lng: "0" }),
      activity(2, { lat: "90", lng: "-180" }),
    ];
    const preview = buildActivityPinPreview(records);
    expect(preview.valid.map(item => item.id)).toEqual([1, 2]);
    expect(preview.excluded).toEqual([]);
  });

  it.each([
    [null, null],
    ["", "10"],
    [" ", "10"],
    ["NaN", "10"],
    ["Infinity", "0"],
    ["90.001", "0"],
    ["-90.001", "0"],
    ["0", "180.001"],
    ["0", "-180.001"],
  ])(
    "excludes invalid coordinates %s,%s without inventing a location",
    (lat, lng) => {
      const record = activity(1, { lat, lng, location: "Real location text" });
      const preview = buildActivityPinPreview([record]);
      expect(preview.valid).toEqual([]);
      expect(preview.excluded).toEqual([record]);
    }
  );

  it("excludes whitespace titles and identifies linked records with no coordinates", () => {
    const linked = activity(1, {
      notes: "[voyageai:connected:v1:flight:trip:1:source:99]",
      location: "HKG → NRT",
    });
    const blank = activity(2, { title: " ", lat: "22.3", lng: "114.2" });
    const manual = activity(3, { location: "Museum" });
    const preview = buildActivityPinPreview([linked, blank, manual]);
    expect(preview.valid).toEqual([]);
    expect(preview.excluded).toHaveLength(3);
    expect(preview.linkedExcluded).toEqual([linked]);
  });

  it("keeps stored date-only values and source records unchanged", () => {
    const record = Object.freeze({
      ...activity(1, { lat: "22.3", lng: "114.2" }),
      date: "2026-11-08",
    });
    const records = Object.freeze([record]);
    const preview = buildActivityPinPreview(records);
    expect(preview.valid[0]).toBe(record);
    expect(preview.valid[0].date).toBe("2026-11-08");
  });
});

describe("real itinerary location coverage", () => {
  it("counts described but unlocated activities separately from coordinate-ready ones", () => {
    const result = summarizeItineraryLocations([
      activity(1, { lat: "0", lng: "0" }),
      activity(2, { location: "Museum" }),
      activity(3, { location: "Hotel", lat: "100", lng: "10" }),
      activity(4, { location: " " }),
      activity(5),
    ]);
    expect(result).toMatchObject({
      total: 3,
      mapped: 1,
      unmapped: 2,
      noLocation: 2,
    });
    expect(result.first?.id).toBe(1);
  });

  it("counts activities, not unique coordinate pairs, and never guesses from location text", () => {
    const result = summarizeItineraryLocations([
      activity(1, { lat: "22.3", lng: "114.2", location: "Museum" }),
      activity(2, { lat: "22.3", lng: "114.2", location: "Museum" }),
      activity(3, { location: "22.3, 114.2" }),
    ]);
    expect(result).toMatchObject({
      total: 3,
      mapped: 2,
      unmapped: 1,
      noLocation: 0,
    });
  });

  it("returns an empty genuine dataset, with no fictitious default locations", () => {
    expect(summarizeItineraryLocations([])).toEqual({
      total: 0,
      mapped: 0,
      unmapped: 0,
      noLocation: 0,
      first: undefined,
    });
  });
});

describe("map note provenance", () => {
  const marker = "[voyageai:connected:v1:pin:trip:1:source:20]";

  it("hides system metadata while showing user notes verbatim", () => {
    expect(
      mapNotesForDisplay(`Visit before noon\n${marker}\nKeep my note`)
    ).toBe("Visit before noon\nKeep my note");
    expect(mapNotesForDisplay(marker)).toBe("");
    expect(mapNotesForDisplay(null)).toBe("");
  });

  it("preserves stable source markers after the user edits a note", () => {
    expect(
      preserveMapNoteProvenance("My updated note", `Old note\n${marker}`)
    ).toBe(`My updated note\n${marker}`);
    expect(preserveMapNoteProvenance("", marker)).toBe(marker);
  });

  it("leaves ordinary bracketed text and manual notes untouched", () => {
    expect(mapNotesForDisplay("[Reservation required]\n[Bring ID]")).toBe(
      "[Reservation required]\n[Bring ID]"
    );
    expect(preserveMapNoteProvenance("A manual note", null)).toBe(
      "A manual note"
    );
    expect(mapNotesForDisplay(`Discuss ${marker} with the team`)).toBe(
      `Discuss ${marker} with the team`
    );
  });
});
