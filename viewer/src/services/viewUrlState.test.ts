/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import Tree, { type TreeNode } from "../features/Dashboard/lib/tree";
import type { CoverageRecord, CoverageSourceRef } from "@/types/coverageSession";
import {
    getNodeIdentity,
    getRecordIdentity,
    isViewUrlStateEmpty,
    joinIndexedIdentity,
    parseViewUrlState,
    resolveNodeKey,
    resolveRecordId,
    serializeViewUrlState,
    splitIndexedIdentity,
    treeHasMultipleRecords,
    type ViewUrlState,
} from "./viewUrlState";

class TestTree extends Tree {
    getViewsByKey() {
        return [];
    }
}

function node(
    key: string,
    name: string,
    readout: object,
    children: TreeNode[] = [],
): TreeNode {
    return {
        key,
        title: name,
        children,
        data: { readout, point: { name } },
    };
}

const readoutA = { id: "A" };
const readoutB = { id: "B" };

function buildTree(): TestTree {
    return new TestTree([
        node("0-0-10", "top", readoutA, [
            node("0-1-5", "dogs", readoutA, [node("0-2-3", "chew_toys", readoutA)]),
            node("0-5-9", "cats", readoutA),
        ]),
        node("1-0-10", "top", readoutB, [
            node("1-1-5", "dogs", readoutB, [node("1-2-3", "chew_toys", readoutB)]),
        ]),
    ]);
}

describe("indexed identities", () => {
    test("join omits a zero index and split reads it back", () => {
        expect(joinIndexedIdentity("run.bktgz", 0)).toBe("run.bktgz");
        expect(joinIndexedIdentity("run.bktgz", 2)).toBe("run.bktgz~2");
        expect(splitIndexedIdentity("run.bktgz~2")).toEqual({ base: "run.bktgz", index: 2 });
        expect(splitIndexedIdentity("run.bktgz")).toEqual({ base: "run.bktgz", index: 0 });
        expect(splitIndexedIdentity("odd~name~3")).toEqual({ base: "odd~name", index: 3 });
        expect(splitIndexedIdentity("odd~name")).toEqual({ base: "odd~name", index: 0 });
    });
});

describe("node identity", () => {
    test("builds a dotted path with the loaded record index", () => {
        const tree = buildTree();
        expect(getNodeIdentity(tree, "0-2-3")).toEqual({ path: "top.dogs.chew_toys", recordIndex: 0 });
        expect(getNodeIdentity(tree, "1-1-5")).toEqual({ path: "top.dogs", recordIndex: 1 });
        expect(getNodeIdentity(tree, "0-0-10")).toEqual({ path: "top", recordIndex: 0 });
        expect(getNodeIdentity(tree, "missing")).toBeNull();
        expect(treeHasMultipleRecords(tree)).toBe(true);
    });

    test("resolves a dotted path back to a key, preferring the named record", () => {
        const tree = buildTree();
        expect(resolveNodeKey(tree, "top.dogs.chew_toys")).toBe("0-2-3");
        expect(resolveNodeKey(tree, "top.dogs.chew_toys", 1)).toBe("1-2-3");
        expect(resolveNodeKey(tree, "top.cats", 1)).toBe("0-5-9");
        expect(resolveNodeKey(tree, "top.birds")).toBeUndefined();
        expect(resolveNodeKey(tree, "nope")).toBeUndefined();
        expect(resolveNodeKey(tree, "")).toBeUndefined();
    });

    test("round-trips every node through identity and back", () => {
        const tree = buildTree();
        for (const [treeNode] of tree.walk()) {
            const identity = getNodeIdentity(tree, treeNode.key);
            expect(identity).not.toBeNull();
            expect(resolveNodeKey(tree, identity!.path, identity!.recordIndex)).toBe(treeNode.key);
        }
    });

    test("single-record trees report no ambiguity", () => {
        const tree = new TestTree([node("0-0-2", "top", readoutA, [node("0-1-2", "x", readoutA)])]);
        expect(treeHasMultipleRecords(tree)).toBe(false);
    });
});

describe("record identity", () => {
    const sources: CoverageSourceRef[] = [
        { id: "source-1", kind: "fileObject", label: "run_a.bktgz" },
        { id: "source-2", kind: "fileObject", label: "run_b.bktgz" },
    ];
    const records: CoverageRecord[] = [
        { id: "record-1", readout: {} as Readout, sourceRef: "source-1", sourceRecordIndex: 0, isLoaded: true },
        { id: "record-2", readout: {} as Readout, sourceRef: "source-1", sourceRecordIndex: 1, isLoaded: true },
        { id: "record-3", readout: {} as Readout, sourceRef: "source-2", sourceRecordIndex: 0, isLoaded: true },
    ];

    test("encodes label plus record index and resolves it again", () => {
        expect(getRecordIdentity(records[0], sources)).toBe("run_a.bktgz");
        expect(getRecordIdentity(records[1], sources)).toBe("run_a.bktgz~1");
        expect(resolveRecordId("run_a.bktgz~1", records, sources)).toBe("record-2");
        expect(resolveRecordId("run_b.bktgz", records, sources)).toBe("record-3");
        expect(resolveRecordId("run_b.bktgz~4", records, sources)).toBeUndefined();
        expect(resolveRecordId("unknown.bktgz", records, sources)).toBeUndefined();
        expect(
            getRecordIdentity(
                { ...records[0], sourceRef: "source-9" },
                sources,
            ),
        ).toBeNull();
    });
});

describe("serialize / parse", () => {
    test("omits defaults and keeps the query short", () => {
        expect(serializeViewUrlState({})).toBe("");
        expect(serializeViewUrlState({ view: "table" })).toBe("");
        expect(serializeViewUrlState({ view: "point" })).toBe("");
        expect(serializeViewUrlState({ compare: { active: false } })).toBe("");
        expect(serializeViewUrlState({ nodePath: "top.dogs", nodeRecordIndex: 0 })).toBe("n=top.dogs");
        expect(serializeViewUrlState({ nodePath: "top.dogs", nodeRecordIndex: 1, view: "donut" })).toBe(
            "n=top.dogs~1&v=donut",
        );
    });

    test("round-trips a full state", () => {
        const state: ViewUrlState = {
            nodePath: "top.dogs.chew toys",
            nodeRecordIndex: 2,
            view: "pivot",
            search: "tag:smoke chew",
            compare: {
                active: true,
                setMode: "a_only",
                definition: "met_goal",
                recordA: "run a.bktgz",
                recordB: "run b.bktgz~1",
            },
        };
        const query = serializeViewUrlState(state);
        expect(query).toBe(
            "n=top.dogs.chew+toys~2&v=pivot&q=tag:smoke+chew&c=1&cs=a_only&cd=met_goal&ca=run+a.bktgz&cb=run+b.bktgz~1",
        );
        expect(parseViewUrlState(query)).toEqual(state);
        expect(parseViewUrlState(new URLSearchParams(query))).toEqual(state);
    });

    test("compare defaults parse as undefined and inactive compare drops details", () => {
        expect(parseViewUrlState("c=1")).toEqual({
            compare: {
                active: true,
                setMode: undefined,
                definition: undefined,
                recordA: undefined,
                recordB: undefined,
            },
        });
        expect(parseViewUrlState("c=0&cs=both")).toEqual({ compare: { active: false } });
    });

    test("ignores unknown and malformed parameters", () => {
        expect(parseViewUrlState("?foo=bar&v=cube&cs=sideways&cd=maybe&n=")).toEqual({});
        expect(parseViewUrlState("v=donut&junk")).toEqual({ view: "donut" });
        expect(isViewUrlStateEmpty(parseViewUrlState("foo=bar"))).toBe(true);
        expect(isViewUrlStateEmpty(parseViewUrlState("q=x"))).toBe(false);
    });

    test("encodes characters that would break the query", () => {
        const query = serializeViewUrlState({ search: "a&b=c#d%e+f" });
        expect(query).toBe("q=a%26b%3Dc%23d%25e%2Bf");
        expect(parseViewUrlState(query).search).toBe("a&b=c#d%e+f");
    });
});
