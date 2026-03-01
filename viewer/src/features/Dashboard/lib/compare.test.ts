/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { axisValueCompare, natCompare, numCompare } from "./compare";
import { expect, test } from "vitest";

test("numCompare", () => {
    expect(numCompare(1, 2)).toBeLessThan(0);
    expect(numCompare(2, 1)).toBeGreaterThan(0);
    expect(numCompare(1, 1)).toBe(0);
    expect(numCompare(NaN, NaN)).toBe(0);
    expect(numCompare(NaN, 1)).toBeLessThan(0);
    expect(numCompare(1, NaN)).toBeGreaterThan(0);
    expect(numCompare(-0, 0)).toBeLessThan(0);
    expect(numCompare(0, -0)).toBeGreaterThan(0);
    expect(numCompare(-0, -0)).toBe(0);
    expect(numCompare(0, 0)).toBe(0);
})

test("natCompare", () => {
    expect(natCompare("a", "b")).toBeLessThan(0);
    expect(natCompare("b", "a")).toBeGreaterThan(0);
    expect(natCompare("a", "a")).toBe(0);
    expect(natCompare("1", "2")).toBeLessThan(0);
    expect(natCompare(2, "1")).toBeGreaterThan(0);
    expect(natCompare("1", 1)).toBe(0);
    expect(natCompare("1.5", "1.6")).toBeLessThan(0);
    expect(natCompare(1.6, 1.5)).toBeGreaterThan(0);
    expect(natCompare("1.5", "1.5")).toBe(0);
    expect(natCompare("a10", "a2")).toBeGreaterThan(0);
    expect(natCompare("a2", "a10")).toBeLessThan(0);
    expect(natCompare("a2b", "a2b0")).toBeLessThan(0);
    expect(natCompare("2b1", "2b")).toBeGreaterThan(0);
});

test("axisValueCompare", () => {
    expect(axisValueCompare("2", "10")).toBeLessThan(0);
    expect(axisValueCompare("3 -> 9", "10 -> 20")).toBeLessThan(0);
    expect(axisValueCompare("5", "3 -> 9")).toBeLessThan(0);
    expect(axisValueCompare("3 -> 9", "apple")).toBeLessThan(0);
    expect(
        axisValueCompare(
            "small",
            "medium",
            { sort_kind: "range", sort_low: 0, sort_high: 3 },
            { sort_kind: "range", sort_low: 4, sort_high: 7 },
        ),
    ).toBeLessThan(0);
    expect(
        axisValueCompare(
            "high",
            "low",
            { sort_kind: "number", sort_low: 9, sort_high: 9 },
            { sort_kind: "number", sort_low: 1, sort_high: 1 },
        ),
    ).toBeGreaterThan(0);
});
