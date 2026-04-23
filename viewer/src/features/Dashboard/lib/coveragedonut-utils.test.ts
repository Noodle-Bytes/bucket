/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";

import type { PointNode } from "./coveragetree";
import { buildNode } from "./coveragedonut-utils";

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
