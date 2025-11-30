/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const packageJson = require('./package.json');
const windowStateKeeper = require('electron-window-state');

// Register app:// as a secure, standard scheme before the app is ready.
// This lets us keep webSecurity enabled while serving the viewer from a
// custom protocol.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// Determine if we're in development mode
// Also check if we're running from source (not from built app)
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Set app name for macOS
app.setName('Bucket');

let mainWindow = null;
let pendingFilePath = null;

// Recent files management
const MAX_RECENT_FILES = 10;
const recentFilesPath = path.join(app.getPath('userData'), 'recent-files.json');

function loadRecentFiles() {
  try {
    if (fs.existsSync(recentFilesPath)) {
      const data = fs.readFileSync(recentFilesPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load recent files:', error);
  }
  return [];
}

function saveRecentFiles(files) {
  try {
    fs.writeFileSync(recentFilesPath, JSON.stringify(files, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save recent files:', error);
  }
}

function addToRecentFiles(filePath) {
  const recentFiles = loadRecentFiles();
  // Remove if already exists
  const filtered = recentFiles.filter(f => f.path !== filePath);
  // Add to beginning
  filtered.unshift({ path: filePath, name: path.basename(filePath) });
  // Keep only MAX_RECENT_FILES
  const trimmed = filtered.slice(0, MAX_RECENT_FILES);
  saveRecentFiles(trimmed);
  updateRecentFilesMenu();
}

function updateRecentFilesMenu() {
  const recentFiles = loadRecentFiles();
  const menu = Menu.getApplicationMenu();
  if (!menu) return;

  const fileMenu = menu.items.find(item => item.label === 'File');
  if (!fileMenu || !fileMenu.submenu) return;

  // Find or create "Open Recent" submenu
  let openRecentItem = fileMenu.submenu.items.find(item => item.label === 'Open Recent');

  if (recentFiles.length === 0) {
    // Remove Open Recent if no files
    if (openRecentItem) {
      const index = fileMenu.submenu.items.indexOf(openRecentItem);
      if (index > -1) {
        fileMenu.submenu.items.splice(index, 1);
      }
    }
  } else {
    // Create or update Open Recent submenu
    const recentSubmenu = recentFiles.map(file => ({
      label: file.name,
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('file-opened', file.path);
        }
      },
    }));

    recentSubmenu.push({ type: 'separator' });
    recentSubmenu.push({
      label: 'Clear Menu',
      click: () => {
        saveRecentFiles([]);
        updateRecentFilesMenu();
      },
    });

    if (openRecentItem) {
      openRecentItem.submenu = Menu.buildFromTemplate(recentSubmenu);
    } else {
      // Insert after "Open..." and before separator
      const openIndex = fileMenu.submenu.items.findIndex(item => item.label === 'Open...');
      const separatorIndex = fileMenu.submenu.items.findIndex((item, idx) => idx > openIndex && item.type === 'separator');
      const insertIndex = separatorIndex > -1 ? separatorIndex : openIndex + 1;

      fileMenu.submenu.insert(insertIndex, {
        label: 'Open Recent',
        submenu: recentSubmenu,
      });
    }
  }

  Menu.setApplicationMenu(menu);
}
// In built app, viewer/dist is in extraResources, so it's in Resources/viewer/dist
// In development, path is relative to electron directory
const distPath = app.isPackaged
  ? path.join(process.resourcesPath, 'viewer', 'dist')
  : path.join(__dirname, '../viewer/dist');

// Register custom protocol to serve files from dist directory
function setupProtocol() {
  protocol.registerFileProtocol('app', (request, callback) => {
    try {
      let url = request.url.replace('app://', '');

      // Remove query string and hash if present
      url = url.split('?')[0].split('#')[0];

      // Normalise trailing slash, e.g. "index-electron.html/" -> "index-electron.html"
      if (url.endsWith('/')) {
        url = url.slice(0, -1);
      }

      // Handle root path
      if (url === '' || url === '/') {
        url = 'index-electron.html';
      }

      // Remove leading slash if present
      if (url.startsWith('/')) {
        url = url.substring(1);
      }

      const filePath = path.join(distPath, url);

      // Pass path directly to Electron - it will handle file not found errors
      // This avoids race conditions from checking existence separately
      if (isDevelopment) {
        console.log('Protocol: Serving file:', filePath);
      }
      callback({ path: filePath });
    } catch (error) {
      console.error('Protocol error:', error);
      callback({ error: -2 }); // FILE_NOT_FOUND
    }
  });
}

function showAboutDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Bucket',
    message: 'Bucket',
    detail: `Version ${packageJson.version}\n\n${packageJson.description}\n\nCopyright © 2023-2025 Noodle-Bytes. All Rights Reserved.\n\nLicensed under the MIT License.`,
    buttons: ['OK'],
  });
}

function createMenu() {
  const template = [
    {
      label: app.getName(),
      submenu: [
        {
          label: 'About Bucket',
          click: showAboutDialog,
        },
        { type: 'separator' },
        { role: 'services', label: 'Services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Bucket' },
        { role: 'hideOthers', label: 'Hide Others' },
        { role: 'unhide', label: 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Bucket' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (mainWindow) {
              const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openFile'],
                filters: [
                  { name: 'Bucket Archive', extensions: ['bktgz'] },
                  { name: 'All Files', extensions: ['*'] },
                ],
              });

              if (!result.canceled && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                addToRecentFiles(filePath);
                mainWindow.webContents.send('file-opened', filePath);
              }
            }
          },
        },
        { type: 'separator' },
        { role: 'close', label: 'Close Window' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force Reload' },
        { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual Size' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Full Screen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', label: 'Minimize' },
        { role: 'close', label: 'Close' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  // Initialize recent files menu after menu is created
  updateRecentFilesMenu();
}

async function createWindow() {
  // Load window state or use defaults
  let mainWindowState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 900,
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // webSecurity can remain enabled because app:// is registered as a
      // privileged, secure scheme (see protocol.registerSchemesAsPrivileged
      // at the top of this file). This lets us load the viewer via app://
      // while keeping Chromium's normal security checks.
      webSecurity: true,
    },
    backgroundColor: '#ffffff',
    frame: true, // Use standard frame to ensure window is movable
    titleBarStyle: 'default', // Use default title bar style
    show: false, // Don't show until ready
  });

  // Let windowStateKeeper manage the window state
  mainWindowState.manage(mainWindow);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the React viewer
  if (isDevelopment) {
    // In development, load from dev server
    mainWindow.loadURL('http://localhost:4000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built React viewer
    const htmlPath = path.join(distPath, 'index.html');

    try {
      // Read file directly - handle errors if file doesn't exist
      // This avoids race conditions from checking existence separately
      const html = await fsp.readFile(htmlPath, 'utf8');

      // Add base tag to set the base URL for relative paths
      let modifiedHtml = html;
      if (!modifiedHtml.includes('<base')) {
        modifiedHtml = modifiedHtml.replace('<head>', '<head>\n    <base href="app://">');
      }

      // Replace all absolute paths (starting with /) with app:// protocol
      modifiedHtml = modifiedHtml
        .replace(/(href|src|action)="\//g, '$1="app://')
        .replace(/(href|src|action)='\//g, "$1='app://")
        .replace(/url\("\//g, 'url("app://')
        .replace(/url\('\//g, "url('app://")
        .replace(/url\(\/\//g, 'url(app://');

      // Write modified HTML to dist directory and load via app:// protocol
      const tempHtmlPath = path.join(distPath, 'index-electron.html');
      await fsp.writeFile(tempHtmlPath, modifiedHtml, 'utf8');
      mainWindow.loadURL('app://index-electron.html');
    } catch (err) {
      // Show error - this helps identify issues
      console.error('Failed to load viewer:', err.message);
      console.error('Stack:', err.stack);
      console.error('distPath:', distPath);
      console.error('htmlPath:', htmlPath);
      // Load a simple error page
      const errorHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Error - Bucket</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 40px;
      text-align: center;
      background: #fff;
      color: #333;
    }
    h1 { color: #d32f2f; margin-bottom: 16px; }
    p { color: #666; line-height: 1.6; }
    .error-detail {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 4px;
      margin: 20px 0;
      font-family: monospace;
      font-size: 12px;
      text-align: left;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <h1>Error Loading Viewer</h1>
  <p>Failed to load the coverage viewer.</p>
  <div class="error-detail">${err.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  <p style="color: #999; font-size: 12px; margin-top: 20px;">Please check the console for details.</p>
</body>
</html>`;
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    }
  }

  // Open dev tools in development for debugging
  if (isDevelopment) {
    mainWindow.webContents.openDevTools();
  }

  // Log failed resource loads and show error
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL, 'isMainFrame:', isMainFrame);
    // Only show error for main page (top-level) load failures, not subresources
    if (isMainFrame) {
      const errorHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Error - Bucket</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 40px;
      text-align: center;
      background: #fff;
      color: #333;
    }
    h1 { color: #d32f2f; margin-bottom: 16px; }
    p { color: #666; line-height: 1.6; }
    .error-detail {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 4px;
      margin: 20px 0;
      font-family: monospace;
      font-size: 12px;
      text-align: left;
    }
  </style>
</head>
<body>
  <h1>Error Loading Viewer</h1>
  <p>Failed to load the coverage viewer.</p>
  <div class="error-detail">
    <div><strong>Error:</strong> ${errorDescription}</div>
    <div><strong>Code:</strong> ${errorCode}</div>
    <div><strong>URL:</strong> ${validatedURL}</div>
  </div>
  <p style="color: #999; font-size: 12px; margin-top: 20px;">Please check the console for details.</p>
</body>
</html>`;
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    }
  });

  // Log console errors from renderer
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) { // Error or warning
      console.log(`[Renderer ${level === 2 ? 'Warn' : 'Error'}]`, message);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle pending file open (for macOS file association)
  if (pendingFilePath) {
    mainWindow.webContents.once('did-finish-load', () => {
      // Send file path to renderer
      addToRecentFiles(pendingFilePath);
      mainWindow.webContents.send('file-opened', pendingFilePath);
      pendingFilePath = null;
    });
  }

  // Update recent files menu after window is ready
  mainWindow.webContents.once('did-finish-load', () => {
    updateRecentFilesMenu();
  });
}

app.whenReady().then(() => {
  // Register custom protocol before creating window
  setupProtocol();
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Handle file open on macOS
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    addToRecentFiles(filePath);
    if (mainWindow && mainWindow.webContents) {
      // Window is ready, send immediately
      mainWindow.webContents.send('file-opened', filePath);
    } else {
      // Window not ready yet, store for later
      pendingFilePath = filePath;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle file picker
ipcMain.handle('open-file-dialog', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Bucket Archive', extensions: ['bktgz'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// Handle file reading
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const buffer = await fsp.readFile(filePath);
    return Array.from(new Uint8Array(buffer));
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
});

// Handle drag and drop
ipcMain.handle('get-dropped-file', async (event, filePath) => {
  try {
    const stats = await fsp.stat(filePath);
    if (stats.isFile() && filePath.endsWith('.bktgz')) {
      const buffer = await fsp.readFile(filePath);
      return Array.from(new Uint8Array(buffer));
    }
    return null;
  } catch (error) {
    return null;
  }
});
