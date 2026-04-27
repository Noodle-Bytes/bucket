/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2024 Vypercore. All Rights Reserved
 */

import { PropsWithChildren, createContext, useState } from "react";
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

/**
 * Theme context for using and setting the theme
 */
const Theme = {
    Provider: ({ children }: PropsWithChildren) => {
        const [theme, setTheme] = useTheme();
        return (
            <ThemeContext.Provider value={{ theme, setTheme }}>
                <div className={theme.theme.className}>{children}</div>
            </ThemeContext.Provider>
        );
    },
    Consumer: ThemeContext.Consumer,
};
export default Theme;
