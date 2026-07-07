/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

type MaterializedReadoutData = {
    defSha: string;
    recSha: string;
    source: string | null;
    sourceKey: string | null;
    bucketVersion: string;
    points: PointTuple[];
    bucketGoals: BucketGoalTuple[];
    axes: AxisTuple[];
    axisValues: AxisValueTuple[];
    goals: GoalTuple[];
    pointHits: PointHitTuple[];
    bucketHits: BucketHitTuple[];
};

function clonePointTuple(point: PointTuple): PointTuple {
    return { ...point };
}

function cloneBucketGoalTuple(bucketGoal: BucketGoalTuple): BucketGoalTuple {
    return { ...bucketGoal };
}

function cloneAxisTuple(axis: AxisTuple): AxisTuple {
    return { ...axis };
}

function cloneAxisValueTuple(axisValue: AxisValueTuple): AxisValueTuple {
    return { ...axisValue };
}

function cloneGoalTuple(goal: GoalTuple): GoalTuple {
    return { ...goal };
}

function clonePointHitTuple(pointHit: PointHitTuple): PointHitTuple {
    return { ...pointHit };
}

function cloneBucketHitTuple(bucketHit: BucketHitTuple): BucketHitTuple {
    return { ...bucketHit };
}

function toSliceEnd<T>(items: T[], end: number | null): number {
    return end === null ? items.length : end;
}

export class InMemoryReadout implements Readout {
    private data: MaterializedReadoutData;

    constructor(data: MaterializedReadoutData) {
        this.data = data;
    }

    get_def_sha(): string {
        return this.data.defSha;
    }

    get_rec_sha(): string {
        return this.data.recSha;
    }

    get_source(): string | null {
        return this.data.source;
    }

    get_source_key(): string | null {
        return this.data.sourceKey;
    }

    get_bucket_version(): string {
        return this.data.bucketVersion;
    }

    *iter_points(
        start: number = 0,
        end: number | null = null,
        depth: number = 0,
    ): Generator<PointTuple> {
        const offsetStart = start + depth;
        const offsetEnd = end === null ? null : end + depth;
        yield* this.data.points
            .slice(offsetStart, toSliceEnd(this.data.points, offsetEnd))
            .map(clonePointTuple);
    }

    *iter_bucket_goals(
        start: number = 0,
        end: number | null = null,
    ): Generator<BucketGoalTuple> {
        yield* this.data.bucketGoals
            .slice(start, toSliceEnd(this.data.bucketGoals, end))
            .map(cloneBucketGoalTuple);
    }

    *iter_axes(start: number = 0, end: number | null = null): Generator<AxisTuple> {
        yield* this.data.axes
            .slice(start, toSliceEnd(this.data.axes, end))
            .map(cloneAxisTuple);
    }

    *iter_axis_values(
        start: number = 0,
        end: number | null = null,
    ): Generator<AxisValueTuple> {
        yield* this.data.axisValues
            .slice(start, toSliceEnd(this.data.axisValues, end))
            .map(cloneAxisValueTuple);
    }

    *iter_goals(start: number = 0, end: number | null = null): Generator<GoalTuple> {
        yield* this.data.goals
            .slice(start, toSliceEnd(this.data.goals, end))
            .map(cloneGoalTuple);
    }

    *iter_point_hits(
        start: number = 0,
        end: number | null = null,
        depth: number = 0,
    ): Generator<PointHitTuple> {
        const offsetStart = start + depth;
        const offsetEnd = end === null ? null : end + depth;
        yield* this.data.pointHits
            .slice(offsetStart, toSliceEnd(this.data.pointHits, offsetEnd))
            .map(clonePointHitTuple);
    }

    *iter_bucket_hits(
        start: number = 0,
        end: number | null = null,
    ): Generator<BucketHitTuple> {
        yield* this.data.bucketHits
            .slice(start, toSliceEnd(this.data.bucketHits, end))
            .map(cloneBucketHitTuple);
    }
}

export function materializeReadout(readout: Readout): MaterializedReadoutData {
    return {
        defSha: readout.get_def_sha(),
        recSha: readout.get_rec_sha(),
        source: readout.get_source(),
        sourceKey: readout.get_source_key(),
        bucketVersion: readout.get_bucket_version(),
        points: Array.from(readout.iter_points()).map(clonePointTuple),
        bucketGoals: Array.from(readout.iter_bucket_goals(0, null)).map(cloneBucketGoalTuple),
        axes: Array.from(readout.iter_axes(0, null)).map(cloneAxisTuple),
        axisValues: Array.from(readout.iter_axis_values(0, null)).map(cloneAxisValueTuple),
        goals: Array.from(readout.iter_goals(0, null)).map(cloneGoalTuple),
        pointHits: Array.from(readout.iter_point_hits()).map(clonePointHitTuple),
        bucketHits: Array.from(readout.iter_bucket_hits(0, null)).map(cloneBucketHitTuple),
    };
}

function getMergedSourceName(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const second = String(now.getSeconds()).padStart(2, "0");
    return `Merged_${year}${month}${day}_${hour}${minute}${second}`;
}

function buildMergedPointHits(
    points: PointTuple[],
    bucketGoals: BucketGoalTuple[],
    goals: GoalTuple[],
    bucketHits: BucketHitTuple[],
): PointHitTuple[] {
    const goalTargetByStart = new Map<number, number>();
    for (const goal of goals) {
        goalTargetByStart.set(goal.start, goal.target);
    }

    const bucketGoalByStart = new Map<number, BucketGoalTuple>();
    for (const bucketGoal of bucketGoals) {
        bucketGoalByStart.set(bucketGoal.start, bucketGoal);
    }

    const bucketHitByStart = new Map<number, BucketHitTuple>();
    for (const bucketHit of bucketHits) {
        bucketHitByStart.set(bucketHit.start, bucketHit);
    }

    const pointHits: PointHitTuple[] = [];
    for (const point of points) {
        let hits = 0;
        let hitBuckets = 0;
        let fullBuckets = 0;
        for (let bucketIdx = point.bucket_start; bucketIdx < point.bucket_end; bucketIdx += 1) {
            const bucketHit = bucketHitByStart.get(bucketIdx);
            if (!bucketHit) {
                continue;
            }
            const bucketGoal = bucketGoalByStart.get(bucketIdx);
            if (!bucketGoal) {
                continue;
            }
            const target = goalTargetByStart.get(bucketGoal.goal) ?? 0;
            if (target <= 0) {
                continue;
            }
            const cappedBucketHits = Math.min(bucketHit.hits, target);
            if (bucketHit.hits > 0) {
                hitBuckets += 1;
                if (cappedBucketHits >= target) {
                    fullBuckets += 1;
                }
                hits += cappedBucketHits;
            }
        }
        pointHits.push({
            start: point.start,
            depth: point.depth,
            hits,
            hit_buckets: hitBuckets,
            full_buckets: fullBuckets,
        });
    }
    return pointHits;
}

/** Sum bucket hits from two compare records (different rec_sha allowed). */
export function mergeCompareReadoutsForDisplay(readoutA: Readout, readoutB: Readout): Readout {
    const master = materializeReadout(readoutA);
    const dataB = materializeReadout(readoutB);

    if (master.defSha !== dataB.defSha) {
        throw new Error("Cannot merge compare records with different covertree definitions.");
    }
    if (master.bucketGoals.length !== dataB.bucketGoals.length) {
        throw new Error("Cannot merge compare records with different bucket counts.");
    }

    const hitsBByStart = new Map<number, number>();
    for (const bucketHit of dataB.bucketHits) {
        hitsBByStart.set(bucketHit.start, bucketHit.hits);
    }

    const mergedBucketHits = master.bucketHits.map((bucketHit) => ({
        ...bucketHit,
        hits: bucketHit.hits + (hitsBByStart.get(bucketHit.start) ?? 0),
    }));

    const mergedPointHits = buildMergedPointHits(
        master.points,
        master.bucketGoals,
        master.goals,
        mergedBucketHits,
    );

    return new InMemoryReadout({
        defSha: master.defSha,
        recSha: master.recSha,
        source: "Compare merged (A+B)",
        sourceKey: "",
        bucketVersion: master.bucketVersion,
        points: master.points,
        bucketGoals: master.bucketGoals,
        axes: master.axes,
        axisValues: master.axisValues,
        goals: master.goals,
        pointHits: mergedPointHits,
        bucketHits: mergedBucketHits,
    });
}

export function mergeReadoutsStrict(readouts: Readout[]): Readout {
    if (readouts.length === 0) {
        throw new Error("No records selected for merge.");
    }

    const [masterReadout, ...otherReadouts] = readouts;
    const master = materializeReadout(masterReadout);

    const hitsByBucketStart = new Map<number, number>();
    for (const bucketHit of master.bucketHits) {
        hitsByBucketStart.set(bucketHit.start, bucketHit.hits);
    }

    for (const readout of otherReadouts) {
        if (readout.get_def_sha() !== master.defSha) {
            throw new Error("Tried to merge coverage with two different definition hashes!");
        }
        if (readout.get_rec_sha() !== master.recSha) {
            throw new Error("Tried to merge coverage with two different record hashes!");
        }

        for (const bucketHit of readout.iter_bucket_hits(0, null)) {
            if (!hitsByBucketStart.has(bucketHit.start)) {
                throw new Error(
                    `Record has unexpected bucket index ${bucketHit.start}; merge aborted.`,
                );
            }
            hitsByBucketStart.set(
                bucketHit.start,
                (hitsByBucketStart.get(bucketHit.start) ?? 0) + bucketHit.hits,
            );
        }
    }

    const mergedBucketHits = master.bucketHits.map((bucketHit) => ({
        ...bucketHit,
        hits: hitsByBucketStart.get(bucketHit.start) ?? bucketHit.hits,
    }));

    const mergedPointHits = buildMergedPointHits(
        master.points,
        master.bucketGoals,
        master.goals,
        mergedBucketHits,
    );

    return new InMemoryReadout({
        defSha: master.defSha,
        recSha: master.recSha,
        source: getMergedSourceName(),
        sourceKey: "",
        bucketVersion: master.bucketVersion,
        points: master.points,
        bucketGoals: master.bucketGoals,
        axes: master.axes,
        axisValues: master.axisValues,
        goals: master.goals,
        pointHits: mergedPointHits,
        bucketHits: mergedBucketHits,
    });
}
