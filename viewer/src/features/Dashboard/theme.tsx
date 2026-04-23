/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2024 Vypercore. All Rights Reserved
 */

import defaultTheme, { Theme as AppTheme } from "@/theme";
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
const cl = defaultTheme.colors;

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
            overflow: "hidden",
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
                        margin: 0,
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
                overflow: "auto", // Use auto instead of scroll - scrollbars hidden via CSS
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

export function antTheme(activeTheme: AppTheme): ThemeConfig {
    const colors = activeTheme.theme.colors;
    const siderBg = colors.secondarybg.value;
    return {
        token: {
            colorText: colors.primarytxt.value,
            colorTextSecondary: colors.primarytxt.value,
            colorTextTertiary: colors.desaturatedtxt.value,
            colorTextPlaceholder: colors.desaturatedtxt.value,
            // These tokens are used in the breadcrumb menu
            colorBgElevated: colors.secondarybg.value,
            controlItemBgHover: colors.highlightbg.value,
            controlItemBgActive: colors.lowlightbg.value,
            controlItemBgActiveHover: colors.highlightbg.value,
        },
        components: {
            Layout: {
                bodyBg: colors.primarybg.value,
                siderBg: siderBg,
                headerBg: colors.primarybg.value,
                headerPadding: 0,
                // This token doesn't work - set above in style instead
                // triggerBg: cl.loContrast.toString(),
            },
            Tree: {
                // This is the background of the tree
                colorBgContainer: siderBg,
                // This is used for lines between nodes
                colorBorder: colors.primarytxt.value,
                nodeSelectedBg: colors.highlightbg.value,
                nodeHoverBg: colors.lowlightbg.value,
                borderRadius: 0,
            },
            Input: {
                borderRadius: 0,
                colorBorder: colors.secondarybg.value,
                colorBgContainer: colors.tertiarybg.value,
                colorTextPlaceholder: colors.desaturatedtxt.value,
            },
            Select: {
                selectorBg: colors.tertiarybg.value,
                clearBg: colors.tertiarybg.value,
                optionActiveBg: colors.lowlightbg.value,
                optionSelectedBg: colors.highlightbg.value,
                optionSelectedColor: colors.saturatedtxt.value,
                activeBorderColor: colors.accentbg.value,
                hoverBorderColor: colors.accentbg.value,
                multipleItemBg: colors.secondarybg.value,
                multipleItemBorderColor: colors.lowlightbg.value,
                multipleItemColor: colors.primarytxt.value,
            },
            Breadcrumb: {
                itemColor: colors.primarytxt.value,
                separatorColor: colors.primarytxt.value,
                linkColor: colors.primarytxt.value,
                linkHoverColor: colors.saturatedtxt.value,
                colorBgTextHover: colors.lowlightbg.value,
            },
            Segmented: {
                trackBg: undefined,
                itemColor: colors.primarytxt.value,
                itemHoverBg: colors.lowlightbg.value,
                itemSelectedBg: colors.highlightbg.value,
                trackPadding: 0,
            },
            Button: {
                // Keep default (non-primary/non-danger) buttons readable in dark themes.
                defaultBg: colors.tertiarybg.value,
                defaultColor: colors.saturatedtxt.value,
                defaultBorderColor: colors.lowlightbg.value,
                defaultHoverBg: colors.highlightbg.value,
                defaultHoverColor: colors.saturatedtxt.value,
                defaultHoverBorderColor: colors.highlightbg.value,
                defaultActiveBg: colors.lowlightbg.value,
                defaultActiveColor: colors.saturatedtxt.value,
                defaultActiveBorderColor: colors.lowlightbg.value,
            },
            FloatButton: {
                colorBgElevated: colors.highlightbg.value,
            },
            Table: {
                headerBg: colors.tertiarybg.value,
                colorBgContainer: colors.primarybg.value,
                borderColor: colors.secondarybg.value,
                headerBorderRadius: 0,
                rowHoverBg: colors.secondarybg.value,
                headerSortHoverBg: colors.secondarybg.value,
                headerSortActiveBg: colors.primarybg.value,
                bodySortBg: colors.tertiarybg.value,
            },
            Modal: {
                titleColor: colors.saturatedtxt.value,
                titleFontSize: 15,
                contentBg: colors.tertiarybg.value,
                headerBg: colors.tertiarybg.value,
                footerBg: colors.tertiarybg.value,
            },
        },
    };
}
