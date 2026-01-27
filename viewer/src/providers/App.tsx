/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2024 Vypercore. All Rights Reserved
 */

import * as React from "react";
import { PropsWithChildren } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { MemoryRouter as Router } from "react-router-dom";
import Theme from "./Theme";

function ErrorFallback({ error, resetErrorBoundary }: { error?: Error; resetErrorBoundary?: () => void }) {
    return (
        <Theme.Consumer>
            {({ theme }) => {
                const styles = {
                    container: {
                        color: theme.theme.colors.negativebg.value,
                        width: '100vw',
                        height: '100vh',
                        display: 'flex',
                        flexDirection: 'column' as const,
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '2rem',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        backgroundColor: theme.theme.colors.primarybg.value,
                    },
                    heading: {
                        fontSize: '1.25rem',
                        fontWeight: '600',
                        marginBottom: '1rem',
                        color: theme.theme.colors.negativebg.value,
                    },
                    errorBox: {
                        marginTop: '1rem',
                        padding: '1rem',
                        backgroundColor: theme.theme.colors.secondarybg.value,
                        border: `1px solid ${theme.theme.colors.negativebg.value}`,
                        borderRadius: '0.25rem',
                        maxWidth: '42rem',
                        width: '100%'
                    },
                    errorMessage: {
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        color: theme.theme.colors.primarytxt.value,
                        wordBreak: 'break-all' as const
                    },
                    button: {
                        marginTop: '1rem',
                        padding: '0.5rem 1rem',
                        backgroundColor: theme.theme.colors.accentbg.value,
                        border: `1px solid ${theme.theme.colors.saturatedtxt.value}`,
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        color: theme.theme.colors.saturatedtxt.value,
                    }
                };

                return (
                    <div style={styles.container} role="alert">
                        <h2 style={styles.heading}>
                            Ooops, something went wrong :(
                        </h2>
                        {error && (
                            <div style={styles.errorBox}>
                                <p style={styles.errorMessage}>
                                    {error.message}
                                </p>
                                {error.stack && (
                                    <details style={{ marginTop: '0.5rem' }}>
                                        <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: theme.theme.colors.negativebg.value }}>
                                            Stack trace
                                        </summary>
                                        <pre style={{
                                            marginTop: '0.5rem',
                                            fontSize: '0.75rem',
                                            color: theme.theme.colors.primarytxt.value,
                                            overflow: 'auto',
                                            maxHeight: '16rem'
                                        }}>
                                            {error.stack}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}
                        <button
                            style={styles.button}
                            onClick={() => {
                                if (resetErrorBoundary) {
                                    resetErrorBoundary();
                                } else {
                                    window.location.reload();
                                }
                            }}>
                            Refresh
                        </button>
                    </div>
                );
            }}
        </Theme.Consumer>
    );
}

export default function AppProvider({ children }: PropsWithChildren) {
    const loadFallback = (
        <div className="flex items-center justify-center w-screen h-screen">
            pending...
        </div>
    );
    return (
        <React.Suspense fallback={loadFallback}>
            <ErrorBoundary
                FallbackComponent={ErrorFallback}
                onError={(error, errorInfo) => {
                    console.error('Error caught by boundary:', error, errorInfo);
                }}>
                <Theme.Provider>
                    <Router>{children}</Router>
                </Theme.Provider>
            </ErrorBoundary>
        </React.Suspense>
    );
}
