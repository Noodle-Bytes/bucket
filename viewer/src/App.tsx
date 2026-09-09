/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import AppProvider from "./providers/App";
import { AppRoutes } from "./routes";

function App() {
    return (
        <AppProvider>
            <AppRoutes />
        </AppProvider>
    );
}
export default App;
