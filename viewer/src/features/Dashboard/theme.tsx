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
            placeholder: "Search name, tag:…, tier:…",
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
    props: {
        style: {
            display: "flex",
            flexDirection: "column",
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
        },
    } as LayoutProps,
    header: {
        props: {
            style: {
                borderBottom: `1px solid ${cl.secondarybg}`,
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
                minHeight: 0,
                flex: "1 1 auto",
                display: "flex",
                flexDirection: "column",
                overflow: "auto",
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
    const isDarkUi =
        activeTheme.name === "dark" || activeTheme.name.startsWith("auto (dark)");
    return {
        token: {
            colorText: colors.primarytxt.value,
            colorTextSecondary: colors.primarytxt.value,
            colorTextTertiary: colors.desaturatedtxt.value,
            colorTextPlaceholder: colors.desaturatedtxt.value,
            // Disabled controls must stay readable in dark themes (Ant defaults are light-theme greys).
            colorTextDisabled: colors.desaturatedtxt.value,
            colorBgContainerDisabled: colors.tertiarybg.value,
            colorBorder: colors.lowlightbg.value,
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
                borderRadius: 4,
            },
            Input: {
                borderRadius: 4,
                colorBorder: colors.secondarybg.value,
                colorBgContainer: colors.tertiarybg.value,
                colorTextPlaceholder: colors.desaturatedtxt.value,
            },
            Select: {
                borderRadius: 4,
                selectorBg: colors.tertiarybg.value,
                clearBg: colors.tertiarybg.value,
                optionActiveBg: colors.lowlightbg.value,
                optionSelectedBg: colors.highlightbg.value,
                optionSelectedColor: colors.saturatedtxt.value,
                activeBorderColor: colors.accentbg.value,
                hoverBorderColor: colors.accentbg.value,
                multipleItemBg: colors.secondarybg.value,
                multipleItemBorderColor: colors.lowlightbg.value,
            },
            Breadcrumb: {
                itemColor: colors.primarytxt.value,
                separatorColor: colors.primarytxt.value,
                linkColor: colors.primarytxt.value,
                linkHoverColor: colors.saturatedtxt.value,
                colorBgTextHover: colors.lowlightbg.value,
            },
            Segmented: {
                // Light: white selected pill on grey track. Dark: raised selected on darker track.
                // (highlightbg is white in light theme, so it cannot be both track and selection.)
                trackBg: colors.secondarybg.value,
                itemColor: colors.desaturatedtxt.value,
                itemHoverColor: colors.saturatedtxt.value,
                itemHoverBg: colors.lowlightbg.value,
                itemSelectedBg: isDarkUi ? colors.highlightbg.value : colors.tertiarybg.value,
                itemSelectedColor: colors.saturatedtxt.value,
                trackPadding: 2,
                borderRadius: 8,
                borderRadiusSM: 6,
            },
            Button: {
                borderRadius: 4,
                // Default buttons: sit slightly off the page background so they
                // remain visible in both light and dark themes.
                defaultBg: colors.tertiarybg.value,
                defaultColor: colors.saturatedtxt.value,
                defaultBorderColor: colors.secondarybg.value,
                defaultHoverBg: colors.highlightbg.value,
                defaultHoverColor: colors.saturatedtxt.value,
                defaultHoverBorderColor: colors.lowlightbg.value,
                defaultActiveBg: colors.lowlightbg.value,
                defaultActiveColor: colors.saturatedtxt.value,
                defaultActiveBorderColor: colors.secondarybg.value,
            },
            FloatButton: {
                colorBgElevated: colors.highlightbg.value,
            },
            Table: {
                headerBg: colors.tertiarybg.value,
                colorBgContainer: colors.primarybg.value,
                borderColor: colors.secondarybg.value,
                headerBorderRadius: 4,
                rowHoverBg: colors.secondarybg.value,
                headerSortHoverBg: colors.secondarybg.value,
                headerSortActiveBg: colors.primarybg.value,
                bodySortBg: colors.tertiarybg.value,
            },
            Modal: {
                borderRadiusLG: 12,
                titleColor: colors.saturatedtxt.value,
                titleFontSize: 15,
                contentBg: colors.tertiarybg.value,
                headerBg: colors.tertiarybg.value,
                footerBg: colors.tertiarybg.value,
            },
            Dropdown: {
                borderRadiusLG: 8,
                controlItemBgHover: colors.lowlightbg.value,
                controlItemBgActive: colors.highlightbg.value,
            },
        },
    };
}
