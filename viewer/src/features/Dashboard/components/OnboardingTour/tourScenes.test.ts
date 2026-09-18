/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";

import CoverageTree from "../../lib/coveragetree";
import type { PointNode } from "../../lib/coveragetree";
import Tree from "../../lib/tree";
import {
    expandedKeysForTourNode,
    findTourCoverpoint,
    findTourSummaryNode,
    tourSceneAt,
} from "./tourScenes";

function group(key: string, children: PointNode[]): PointNode {
    return {
        key,
        title: key,
        children,
        data: {
            point: { axis_start: 0, axis_end: 0 },
        },
    } as unknown as PointNode;
}

function leaf(
    key: string,
    axes: number,
    coverage?: { buckets: number; full: number },
): PointNode {
    const buckets = coverage?.buckets ?? 0;
    const full = coverage?.full ?? 0;
    return {
        key,
        title: key,
        children: [],
        data: {
            point: {
                axis_start: 0,
                axis_end: axes,
                target: buckets,
                target_buckets: buckets,
            },
            point_hit: {
                hits: full,
                hit_buckets: full,
                full_buckets: full,
            },
        },
    } as unknown as PointNode;
}

describe("tour scenes", () => {
    test("maps step indexes", () => {
        expect(tourSceneAt(0)).toBe("records");
        expect(tourSceneAt(3)).toBe("pivot");
        expect(tourSceneAt(9)).toBeUndefined();
    });

    test("picks a covergroup for summary views", () => {
        const tree = new CoverageTree([
            group("root", [leaf("one-axis", 1), leaf("three-axis", 3)]),
        ]);
        expect(findTourSummaryNode(tree)?.key).toBe("root");
    });

    test("prefers a multi-axis coverpoint", () => {
        const tree = new CoverageTree([
            group("root", [leaf("one-axis", 1), leaf("three-axis", 3), leaf("two-axis", 2)]),
        ]);
        expect(findTourCoverpoint(tree)?.key).toBe("three-axis");
    });

    test("prefers a compact mixed-coverage coverpoint for pivot", () => {
        const tree = new CoverageTree([
            group("root", [
                leaf("huge-full", 5, { buckets: 1200, full: 1200 }),
                leaf("jump-holes", 3, { buckets: 90, full: 40 }),
                leaf("tiny-empty", 2, { buckets: 4, full: 0 }),
            ]),
        ]);
        expect(findTourCoverpoint(tree)?.key).toBe("jump-holes");
    });

    test("falls back to the first leaf", () => {
        const tree = new CoverageTree([group("root", [leaf("only", 1)])]);
        expect(findTourCoverpoint(tree)?.key).toBe("only");
    });

    test("expands ancestors so the selected node is visible", () => {
        const tree = new CoverageTree([
            group("root", [group("inner", [leaf("point", 2)])]),
        ]);
        expect(expandedKeysForTourNode(tree, "point")).toEqual(["root", "inner", "point"]);
        expect(expandedKeysForTourNode(tree, "root")).toEqual(["root"]);
        expect(expandedKeysForTourNode(tree, Tree.ROOT)).toEqual([]);
    });
});
