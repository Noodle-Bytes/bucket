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


const getPluginPWA = ((env) => {
    const manifest = {
        name: 'Bucket',
        short_name: 'Bucket',
        description: 'Buckets of coverage!',
        theme_color: '#ffffff',
        file_handlers: [
            {
                action: '/',
                accept: {
                    "application/json": [".json"],
                }
            }
        ],
        icons: [
            {
                src: '/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png'
            },
            {
                src: '/pwa-512x512.png',
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
        '/favicon.ico',
        '/apple-touch-icon-180x180.png',
        '/maskable-icon-512x512.png'
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
        plugins: [react(),
        tsconfigPaths(),
        getPluginPWA(env)
        ],
    }
});
