/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
// Plugin that synchronises vite's path searching with tsconfig settings.
import tsconfigPaths from "vite-tsconfig-paths";
// Plugin to allow download as a Progressive Web Application (PWA)
import { VitePWA } from 'vite-plugin-pwa'

const githubRepoBase = (() => {
    if (process.env.GITHUB_PAGES !== "true") {
        return "/";
    }
    const repo = process.env.GITHUB_REPOSITORY?.split("/").pop();
    return repo ? `/${repo}/` : "/";
})();

const resolveAsset = (name: string) => `${githubRepoBase}${name}`;


const getPluginPWA = ((env) => {
    const manifest = {
        name: 'Bucket',
        short_name: 'Bucket',
        description: 'Buckets of coverage!',
        theme_color: '#ffffff',
        start_url: githubRepoBase,
        scope: githubRepoBase,
        file_handlers: [
            {
                action: githubRepoBase,
                accept: {
                    "application/gzip": [".bktgz"],
                }
            }
        ],
        icons: [
            {
                src: resolveAsset('pwa-192x192.png'),
                sizes: '192x192',
                type: 'image/png'
            },
            {
                src: resolveAsset('pwa-512x512.png'),
                sizes: '512x512',
                type: 'image/png'
            },
        ],
        // TODO: Installation splash screen
        // screenshots : [
        //     {
        //         src: "screenshot-wide.png",
        //         sizes: "1920x1080",
        //         type: "image/png",
        //         form_factor: "wide"
        //     },
        //     {
        //         src: "screenshot-narrow.png",
        //         sizes: "1080x1920",
        //         type: "image/png",
        //         form_factor: "narrow"
        //     }
        // ]
    };

    const includeAssets = [
        resolveAsset('favicon.ico'),
        resolveAsset('apple-touch-icon-180x180.png'),
        resolveAsset('maskable-icon-512x512.png')
    ];

    const devConfig = {};

    if (env.mode === 'development') {
        devConfig['devOptions'] = {
            enabled: true,
            type: 'module'
        };
    }

    return VitePWA({
        registerType: 'autoUpdate',
        includeAssets,
        manifest,
        ...devConfig
    })
})

// https://vitejs.dev/config/
export default defineConfig((env) => {
    return {
        base: githubRepoBase,
        plugins: [react(),
        tsconfigPaths(),
        getPluginPWA(env)
        ],
    }
});
