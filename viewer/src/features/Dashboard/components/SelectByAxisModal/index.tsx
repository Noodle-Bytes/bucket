/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useMemo, useState } from "react";
import { Modal, Flex, Typography, Button, Space } from "antd";
import { bucketsMatchingAxisFilters } from "@/services/inferWaiverRules";
import type { SelectedBucket } from "@/services/inferWaiverRules";
import AxisFilterPicker, {
    type AxisValueOption,
} from "../AxisFilterPicker";

export type { AxisValueOption };

type SelectByAxisModalProps = {
    open: boolean;
    onClose: () => void;
    onApply: (filters: Record<string, string[]>) => void;
    axes: AxisValueOption[];
    initialFilters: Record<string, string[]>;
    allWaivable: SelectedBucket[];
};

export default function SelectByAxisModal({
    open,
    onClose,
    onApply,
    axes,
    initialFilters,
    allWaivable,
}: SelectByAxisModalProps) {
    const [draft, setDraft] = useState<Record<string, string[]>>(initialFilters);

    useEffect(() => {
        if (open) {
            setDraft(initialFilters);
        }
    }, [open, initialFilters]);

    const matchCount = useMemo(
        () => bucketsMatchingAxisFilters(allWaivable, draft).length,
        [allWaivable, draft],
    );

    const apply = () => {
        onApply(draft);
        onClose();
    };

    return (
        <Modal
            title="Select by axis"
            open={open}
            onCancel={onClose}
            width={520}
            destroyOnClose
            footer={
                <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                    <Button onClick={() => setDraft({})}>Clear</Button>
                    <Space>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button type="primary" onClick={apply}>
                            Apply selection
                        </Button>
                    </Space>
                </Flex>
            }
        >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                Tick values on an axis to <strong>add</strong> them (OR). Tick values on other
                axes to <strong>narrow</strong> the set (AND).
            </Typography.Paragraph>

            <AxisFilterPicker
                axes={axes}
                filters={draft}
                onChange={setDraft}
                matchCount={matchCount}
                emptySummary="No axis values selected yet"
            />
        </Modal>
    );
}
