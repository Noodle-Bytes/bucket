/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

export type CoverageDefinition = "any_hit" | "met_goal";

export type CompareSetMode = "a_only" | "both" | "b_only" | "neither" | "all";

export type BucketCategory =
    | "a_only"
    | "both"
    | "b_only"
    | "neither"
    | "illegal"
    | "ignore";

export type CategoryCounts = {
    a_only: number;
    both: number;
    b_only: number;
    neither: number;
    valid: number;
    illegal: number;
    ignore: number;
};

export type CompareRecordMeta = {
    id: string;
    label: string;
    source: string | null;
    sourceKey: string | null;
    defSha: string;
    recSha: string;
};

export type PointCompare = {
    pointStart: number;
    name: string;
    path: string;
    depth: number;
    isCovergroup: boolean;
    counts: CategoryCounts;
    bucketStart: number;
    bucketEnd: number;
};

export type BucketDetail = {
    bucketIndex: number;
    pointStart: number;
    pointPath: string;
    category: BucketCategory;
    hitsA: number;
    hitsB: number;
    target: number;
    goalName: string;
    axisValues: Record<string, string>;
};

export type ComparisonResult = {
    recordA: CompareRecordMeta;
    recordB: CompareRecordMeta;
    definition: CoverageDefinition;
    global: CategoryCounts;
    points: PointCompare[];
    pointsByStart: Map<number, PointCompare>;
    bucketsByIndex: Map<number, BucketCategory>;
    hitsAByIndex: Map<number, number>;
    hitsBByIndex: Map<number, number>;
    bucketDetails: BucketDetail[];
    /** Coverpoint start → axis name → axis values in covertree definition order */
    axisValueOrderByPoint: Map<number, Record<string, string[]>>;
};

export type CompareViewContext = {
    comparison: ComparisonResult;
    setMode: CompareSetMode;
};

export type CompareRecordOption = {
    id: string;
    label: string;
    defSha: string;
};

export type CompareCompatibility = {
    canCompare: boolean;
    compatibleGroups: CompareRecordOption[][];
    message: string | null;
};
