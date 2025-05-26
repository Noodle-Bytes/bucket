/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

import { natCompare, numCompare } from "./compare";
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
