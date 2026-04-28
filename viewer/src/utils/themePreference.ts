/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import * as themes from "@/theme";

const localStorageKey = "color-theme";

function getStoredThemePreference(): string | null {
    try {
        return window.localStorage.getItem(localStorageKey);
    } catch {
        return null;
    }
}

/**
 * Set the preferred theme in local storage, or clear it.
 */
export function setStoredThemePreference(theme: string | null): boolean {
    try {
        if (theme === null) {
            window.localStorage.removeItem(localStorageKey);
        } else {
            window.localStorage.setItem(localStorageKey, theme);
        }
        return true;
    } catch {
        return false;
    }
}

function getMediaThemePreference(): string | null {
    if (matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
    }
    if (matchMedia("(prefers-color-scheme: light)").matches) {
        return "light";
    }
    return null;
}

/**
 * Resolved Bucket theme (saved choice, media, or default) — safe to use outside React, e.g. for
 * imperative modals that render outside Theme.Provider's DOM subtree.
 */
export function getThemePreference(): themes.Theme {
    const savedThemeName = getStoredThemePreference();
    const savedTheme = themes.themes.find((v) => v.name === savedThemeName);
    if (savedTheme) {
        return savedTheme;
    }
    const mediaThemeName = getMediaThemePreference();
    const mediaTheme = themes.themes.find((v) => v.name === mediaThemeName);
    const backupTheme = mediaTheme ?? themes.themes[0];
    return {
        name: `auto (${backupTheme.name})`,
        theme: backupTheme.theme,
    };
}
