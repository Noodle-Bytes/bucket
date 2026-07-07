/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    buildComparison,
    getCompareCompatibility,
} from "@/services/coverageCompare";
import type {
    CompareRecordMeta,
    CompareSetMode,
    ComparisonResult,
    CoverageDefinition,
} from "@/types/coverageCompare";

export type CompareRecordRow = {
    id: string;
    label: string;
    readout: Readout;
};

function buildRecordMeta(record: CompareRecordRow): CompareRecordMeta {
    return {
        id: record.id,
        label: record.label,
        source: record.readout.get_source(),
        sourceKey: record.readout.get_source_key(),
        defSha: record.readout.get_def_sha(),
        recSha: record.readout.get_rec_sha(),
    };
}

export type UseCoverageCompareResult = {
    active: boolean;
    setActive: (active: boolean) => void;
    canCompare: boolean;
    compatibilityMessage: string | null;
    compatibleRecordIds: string[];
    recordIdA: string | null;
    recordIdB: string | null;
    setRecordIdA: (id: string) => void;
    setRecordIdB: (id: string) => void;
    definition: CoverageDefinition;
    setDefinition: (definition: CoverageDefinition) => void;
    setMode: CompareSetMode;
    setSetMode: (mode: CompareSetMode) => void;
    comparison: ComparisonResult | null;
    comparisonError: string | null;
    readoutA: Readout | null;
    readoutB: Readout | null;
};

export function useCoverageCompare(records: CompareRecordRow[]): UseCoverageCompareResult {
    const [active, setActive] = useState(false);
    const [recordIdA, setRecordIdA] = useState<string | null>(null);
    const [recordIdB, setRecordIdB] = useState<string | null>(null);
    const [definition, setDefinition] = useState<CoverageDefinition>("any_hit");
    const [setMode, setSetMode] = useState<CompareSetMode>("all");

    const compatibility = useMemo(
        () => getCompareCompatibility(records),
        [records],
    );

    const compatibleRecordIds = useMemo(
        () => compatibility.compatibleGroups.flatMap((group) => group.map((record) => record.id)),
        [compatibility.compatibleGroups],
    );

    const recordsById = useMemo(
        () => new Map(records.map((record) => [record.id, record])),
        [records],
    );

    useEffect(() => {
        if (!compatibility.canCompare) {
            setActive(false);
            setRecordIdA(null);
            setRecordIdB(null);
            return;
        }

        const defaultGroup = compatibility.compatibleGroups[0] ?? [];
        if (defaultGroup.length < 2) {
            return;
        }

        setRecordIdA((current) => {
            if (current && compatibleRecordIds.includes(current)) {
                return current;
            }
            return defaultGroup[0].id;
        });
        setRecordIdB((current) => {
            if (current && compatibleRecordIds.includes(current) && current !== recordIdA) {
                return current;
            }
            const fallback = defaultGroup.find((record) => record.id !== defaultGroup[0].id);
            return fallback?.id ?? defaultGroup[1]?.id ?? null;
        });
    }, [compatibility, compatibleRecordIds, recordIdA]);

    useEffect(() => {
        if (recordIdA && recordIdB && recordIdA === recordIdB) {
            const alternative = compatibleRecordIds.find((id) => id !== recordIdA);
            if (alternative) {
                setRecordIdB(alternative);
            }
        }
    }, [recordIdA, recordIdB, compatibleRecordIds]);

    useEffect(() => {
        if (active && recordIdA && !compatibleRecordIds.includes(recordIdA)) {
            setActive(false);
        }
        if (active && recordIdB && !compatibleRecordIds.includes(recordIdB)) {
            setActive(false);
        }
    }, [active, recordIdA, recordIdB, compatibleRecordIds]);

    const comparisonState = useMemo(() => {
        if (!recordIdA || !recordIdB || recordIdA === recordIdB) {
            return { comparison: null, error: null, readoutA: null, readoutB: null };
        }
        const recordA = recordsById.get(recordIdA);
        const recordB = recordsById.get(recordIdB);
        if (!recordA || !recordB) {
            return { comparison: null, error: "Selected records are unavailable.", readoutA: null, readoutB: null };
        }
        try {
            const comparison = buildComparison(
                recordA.readout,
                recordB.readout,
                buildRecordMeta(recordA),
                buildRecordMeta(recordB),
                definition,
            );
            return {
                comparison,
                error: null,
                readoutA: recordA.readout,
                readoutB: recordB.readout,
            };
        } catch (error) {
            return {
                comparison: null,
                error: error instanceof Error ? error.message : String(error),
                readoutA: recordA.readout,
                readoutB: recordB.readout,
            };
        }
    }, [recordIdA, recordIdB, recordsById, definition]);

    const handleSetRecordIdA = useCallback(
        (id: string) => {
            setRecordIdA(id);
            if (id === recordIdB) {
                const alternative = compatibleRecordIds.find((candidate) => candidate !== id);
                if (alternative) {
                    setRecordIdB(alternative);
                }
            }
        },
        [recordIdB, compatibleRecordIds],
    );

    const handleSetRecordIdB = useCallback(
        (id: string) => {
            setRecordIdB(id);
            if (id === recordIdA) {
                const alternative = compatibleRecordIds.find((candidate) => candidate !== id);
                if (alternative) {
                    setRecordIdA(alternative);
                }
            }
        },
        [recordIdA, compatibleRecordIds],
    );

    return {
        active,
        setActive,
        canCompare: compatibility.canCompare,
        compatibilityMessage: compatibility.message,
        compatibleRecordIds,
        recordIdA,
        recordIdB,
        setRecordIdA: handleSetRecordIdA,
        setRecordIdB: handleSetRecordIdB,
        definition,
        setDefinition,
        setMode,
        setSetMode,
        comparison: comparisonState.comparison,
        comparisonError: comparisonState.error,
        readoutA: comparisonState.readoutA,
        readoutB: comparisonState.readoutB,
    };
}
