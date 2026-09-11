/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { Flex, Typography } from "antd";
import { waiverAxesEntries, type WaiverAxes } from "@/services/waiverSpec";

type WaiverAxesListProps = {
    axes: WaiverAxes;
};

/** Scannable axis list: one axis per line with its values. */
export default function WaiverAxesList({ axes }: WaiverAxesListProps) {
    const entries = waiverAxesEntries(axes);
    if (entries.length === 0) {
        return (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                All axes
            </Typography.Text>
        );
    }
    return (
        <Flex vertical gap={6}>
            {entries.map(({ axis, values }) => (
                <div key={axis}>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {axis}
                    </Typography.Text>
                    <div
                        style={{
                            fontSize: 12,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            lineHeight: 1.4,
                        }}
                    >
                        {values.join(", ")}
                    </div>
                </div>
            ))}
        </Flex>
    );
}
