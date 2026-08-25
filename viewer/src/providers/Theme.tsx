/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { PropsWithChildren, createContext, useContext, useEffect, useState } from "react";
import * as themes from "@/theme";
import { getThemePreference, setStoredThemePreference } from "@/utils/themePreference";

/**
 * Get the current theme, and a method to update it
 *
 * @returns current theme, theme setter
 */
function useTheme() {
    const initialTheme = getThemePreference();
    const [theme, setTheme] = useState(initialTheme);

    const setAndSaveTheme = (newTheme: themes.Theme | null): void => {
        // Set the theme, saving the preference in local storage if possible
        // null resets the theme to auto
        if (newTheme === null) {
            setStoredThemePreference(null);
            setTheme(getThemePreference());
        } else {
            setStoredThemePreference(newTheme.name);
            setTheme(newTheme);
        }
    };

    // Listen the color preference media events, and set theme when they do.
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => setTheme(getThemePreference()));

    window
        .matchMedia("(prefers-color-scheme: light)")
        .addEventListener("change", () => setTheme(getThemePreference()));

    return [theme, setAndSaveTheme] as const;
}

/**
 * Internal theme context, exposed on 'Theme'
 */
const ThemeContext = createContext({
    theme: themes.themes[0],
    setTheme: (_theme: themes.Theme | null) => {
        void _theme;
    },
});

const THEME_CLASS_PREFIX = "t-";

/**
 * Theme context for using and setting the theme
 */
const Theme = {
    Provider: ({ children }: PropsWithChildren) => {
        const [theme, setTheme] = useTheme();

        // Mirror stitches tokens onto <html> so Ant portals (filter/select dropdowns)
        // inherit --colors-* and scrollbars stay themed outside the app wrapper.
        useEffect(() => {
            const root = document.documentElement;
            const nextClass = theme.theme.className;
            for (const className of Array.from(root.classList)) {
                if (className === nextClass) {
                    continue;
                }
                if (className.startsWith(THEME_CLASS_PREFIX)) {
                    root.classList.remove(className);
                }
            }
            root.classList.add(nextClass);
            root.dataset.bucketTheme = theme.name;
            root.style.colorScheme = theme.name === "dark" ? "dark" : "light";
            return () => {
                root.classList.remove(nextClass);
                delete root.dataset.bucketTheme;
                root.style.colorScheme = "";
            };
        }, [theme]);

        return (
            <ThemeContext.Provider value={{ theme, setTheme }}>
                <div className={theme.theme.className}>{children}</div>
            </ThemeContext.Provider>
        );
    },
    Consumer: ThemeContext.Consumer,
    /** Hook equivalent of Consumer, for use in function component bodies. */
    useContext: () => useContext(ThemeContext),
};
export default Theme;
