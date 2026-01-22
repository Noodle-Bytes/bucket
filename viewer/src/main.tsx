/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2024 Vypercore. All Rights Reserved
 */

import "normalize.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";

// Hide scrollbars globally - they can still scroll but won't be visible
const style = document.createElement("style");
style.textContent = `
  /* Hide scrollbars for Chrome, Safari and Opera */
  *::-webkit-scrollbar {
    display: none;
  }
  /* Hide scrollbars for IE, Edge and Firefox */
  * {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
  }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
