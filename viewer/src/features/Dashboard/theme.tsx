/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2024 Vypercore. All Rights Reserved
 */

import theme from "@/theme";
import type {
    SiderProps,
    ThemeConfig,
    TreeProps,
    LayoutProps,
    BreadcrumbProps,
    TableProps,
    SegmentedProps,
    FlexProps,
    FloatButtonProps,
} from "antd";
import type { SearchProps } from "antd/es/input";
import { ComponentPropsWithoutRef } from "react";
const cl = theme.colors;

const sider = {
    props: {
        collapsible: false,
        defaultCollapsed: false,
        reverseArrow: false,
        width: "auto",
        collapsedWidth: 0,
        style: {
            padding: 5,
            borderRightColor: cl.tertiarybg.toString(),
            borderRightWidth: 1,
            borderRightStyle: "solid",
            maxWidth: "auto",
            overflowY: "auto",
            overflowX: "hidden",
        },
        zeroWidthTriggerStyle: {
            background: cl.accentbg.toString(),
            zIndex: 10,
        },
    } as SiderProps,
    search: {
        props: {
            placeholder: "Search",
            variant: "outlined",
        } as SearchProps,
    },
    tree: {
        props: {
            showLine: true,
            showIcon: true,
            multiple: false,
        } as TreeProps,
        searchlight: {
            props: {
                style: {
                    fontWeight: "bolder",
                    color: cl.saturatedtxt.toString(),
                },
            } as ComponentPropsWithoutRef<"div">,
        },
    },
};

const body = {
    props: {} as LayoutProps,
    header: {
        props: {
            style: {
                boxShadow: `0 0 2px 2px ${cl.secondarybg}`,
                height: "auto",
            },
        } as LayoutProps,
        flex: {
            props: {
                justify: "space-between",
                align: "center",
            } as FlexProps,
            breadcrumb: {
                props: {
                    style: {
                        margin: 5,
                        marginLeft: 10,
                    },
                } as BreadcrumbProps,
            },
            segmented: {
                props: {
                    block: false,
                    size: "small",
                    style: {
                        margin: 5,
                        marginRight: 10,
                    },
                } as Omit<SegmentedProps, "ref">,
            },
        },
    },
    content: {
        props: {
            style: {
                margin: 0,
                minHeight: 280,
                overflow: "scroll",
            },
        } as ComponentPropsWithoutRef<"div">,
        table: {
            props: {
                pagination: false,
                sticky: true,
                size: "small",
                tableLayout: "auto",
                bordered: true,
            } as TableProps,
        },
    },
};

export const view = {
    props: {
        style: {
            height: "100vh",
            overflow: "hidden",
        },
    } as LayoutProps,
    body,
    sider,
    float: {
        theme: {
            props: {} as FloatButtonProps,
        },
    },
};

export const antTheme: ThemeConfig = (() => {
    const siderBg = cl.secondarybg.toString();
    return {
        token: {
            colorText: cl.primarytxt.toString(),
            // These tokens are used in the breadcrumb menu
            colorBgElevated: cl.secondarybg.toString(),
            controlItemBgHover: cl.highlightbg.toString(),
            controlItemBgActive: cl.lowlightbg.toString(),
            controlItemBgActiveHover: cl.highlightbg.toString(),
        },
        components: {
            Layout: {
                bodyBg: cl.primarybg.toString(),
                siderBg: siderBg,
                headerBg: cl.primarybg.toString(),
                headerPadding: 0,
                // This token doesn't work - set above in style instead
                // triggerBg: cl.loContrast.toString(),
            },
            Tree: {
                // This is the background of the tree
                colorBgContainer: siderBg,
                // This is used for lines between nodes
                colorBorder: cl.primarytxt.toString(),
                nodeSelectedBg: cl.highlightbg.toString(),
                nodeHoverBg: cl.lowlightbg.toString(),
                borderRadius: 0,
            },
            Input: {
                borderRadius: 0,
                colorBorder: cl.secondarybg.toString(),
                colorBgContainer: cl.tertiarybg.toString(),
                colorTextPlaceholder: cl.desaturatedtxt.toString(),
            },
            Breadcrumb: {
                itemColor: cl.primarytxt.toString(),
                separatorColor: cl.primarytxt.toString(),
                linkColor: cl.primarytxt.toString(),
                linkHoverColor: cl.saturatedtxt.toString(),
                colorBgTextHover: cl.lowlightbg.toString(),
            },
            Segmented: {
                trackBg: undefined,
                itemColor: cl.primarytxt.toString(),
                itemHoverBg: cl.lowlightbg.toString(),
                itemSelectedBg: cl.highlightbg.toString(),
                trackPadding: 0,
            },
            FloatButton: {
                colorBgElevated: cl.highlightbg.toString(),
            },
            Table: {
                // colorBgContainer: cl.primarybg.toString(),
                headerBg: cl.tertiarybg.toString(),
                colorBgContainer: cl.primarybg.toString(),
                borderColor: cl.secondarybg.toString(),
                headerBorderRadius: 0,
                rowHoverBg: cl.secondarybg.toString(),
                headerSortHoverBg: cl.secondarybg.toString(),
                headerSortActiveBg: cl.primarybg.toString(),
                bodySortBg: cl.tertiarybg.toString(),
            },
        },
    };
})();
