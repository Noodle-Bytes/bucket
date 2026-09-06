/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";

import type { PointNode } from "./coveragetree";
import { arcPath, buildNode, flattenData } from "./coveragedonut-utils";

function createLeafNode(
    key: string,
    title: string,
    target: number,
    hits: number,
): PointNode {
    return {
        key,
        title,
        children: [],
        data: {
            readout: {} as Readout,
            point: { target } as unknown as PointTuple,
            point_hit: { hits } as unknown as PointHitTuple,
        },
    } as PointNode;
}

describe("coveragedonut buildNode", () => {
    test("builds a leaf from point metrics", () => {
        const leaf = createLeafNode("leaf", "Leaf", 10, 7);
        const built = buildNode(leaf);

        expect(built.name).toBe("Leaf");
        expect(built.target).toBe(10);
        expect(built.hits).toBe(7);
        expect(built.coverage).toBe(0.7);
        expect(built.value).toBe(10);
        expect(built.children).toBeUndefined();
    });

    test("builds synthetic root nodes without point metrics from children", () => {
        const childA = createLeafNode("a", "A", 10, 3);
        const childB = createLeafNode("b", "B", 20, 12);
        const syntheticRoot = {
            key: "_ROOT_",
            title: "Root",
            data: {} as unknown,
            children: [childA, childB],
        } as PointNode;

        const built = buildNode(syntheticRoot);

        expect(built.target).toBe(30);
        expect(built.hits).toBe(15);
        expect(built.coverage).toBe(0.5);
        expect(built.value).toBe(30);
        expect(built.children).toHaveLength(2);
    });

    test("handles nodes missing metrics and children without throwing", () => {
        const syntheticLeaf = {
            key: "synthetic",
            title: "Synthetic",
            data: {} as unknown,
            children: [],
        } as PointNode;

        const built = buildNode(syntheticLeaf);

        expect(built.target).toBe(0);
        expect(built.hits).toBe(0);
        expect(built.coverage).toBe(0);
        expect(built.value).toBe(1);
    });
});

describe("coveragedonut arcPath", () => {
    test("partial wedges produce a single closed subpath", () => {
        const path = arcPath(40, 80, 0, Math.PI / 2);
        expect(path.match(/Z/g)).toHaveLength(1);
        expect(path.match(/ A /g)).toHaveLength(2);
    });

    test("full rings split into two half-turn subpaths", () => {
        const path = arcPath(40, 80, 0, 2 * Math.PI);
        // Degenerate single-arc full circles collapse in SVG; two halves must paint.
        expect(path.match(/Z/g)).toHaveLength(2);
        expect(path.match(/ A /g)).toHaveLength(4);
        expect(path).toContain("M ");
    });

    test("single-child covergroups flatten to a full-ring child wedge", () => {
        const leaf = createLeafNode("flag", "flag_generation", 280, 230);
        const group = {
            key: "compare_flags",
            title: "compare_flags",
            data: {} as unknown,
            children: [leaf],
        } as PointNode;

        const built = buildNode(group);
        const flat = flattenData(built, 0, 0, built.value);
        const child = flat.find((n) => n.depth === 1);

        expect(child).toBeDefined();
        expect(child!.endAngle - child!.startAngle).toBeCloseTo(2 * Math.PI, 10);

        const path = arcPath(40, 80, child!.startAngle, child!.endAngle);
        expect(path.match(/Z/g)).toHaveLength(2);
    });
});
