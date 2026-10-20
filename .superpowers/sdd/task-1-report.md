# Task 1 implementation report

## Result

Implemented the Tauri v2 desktop shell and desktop Vite mode. The renderer remains the existing React application; the existing web build command is unchanged.

## Changes

- Added the Tauri CLI as a development dependency and the API, dialog, and filesystem JavaScript packages as runtime dependencies, with npm lockfile updates.
- Added `desktop:dev` (`tauri dev`), `desktop:build` (`tauri build`), and `build:desktop` (`tsc -b && vite build --mode desktop`). The desktop frontend build deliberately skips the web homepage prerender script.
- Vite uses relative asset paths only for desktop mode, retaining the existing `/` base for web builds. The development server uses port 5173 with strict port binding so the Tauri dev URL cannot point at the wrong server after an automatic port fallback.
- Added the Rust entry point, build script, and Cargo manifest. Registered dialog and filesystem plugins.
- Configured product name `ExtractMint`, identifier `com.iangoh.extractmint`, local `../dist` release assets, development URL `http://127.0.0.1:5173`, and the specified frontend development/build hooks.
- Added one resizable main window at 1440 × 960 with minimum dimensions 1100 × 720.
- Configured `dmg` and `nsis` bundle targets and generated desktop PNG, ICNS, and ICO assets from the existing favicon via `npx tauri icon public/favicon.svg`. Removed generated mobile and Appx assets because they are outside the pilot scope.
- Added `src-tauri/.gitignore` for generated Rust build output and capability schemas.

## Permission model

The main window receives only `dialog:allow-save` and `fs:allow-write-file`. There is no static broad directory scope, default filesystem permission set, read permission, open-dialog permission, persisted scope, or remote capability. Tauri's Save dialog adds the selected file path to the filesystem scope for the application session, so the later export implementation can pass binary bytes to `writeFile` at that path.

Sources consulted:

- https://v2.tauri.app/reference/javascript/dialog/
- https://v2.tauri.app/plugin/file-system/
- https://v2.tauri.app/develop/icons/

## Commands and limitations

- Dependency installation completed successfully.
- The Tauri icon command completed successfully and produced the required desktop icon formats.
- Inspected the package, lockfile, Vite, and scaffold changes for task scope.
- No tests, frontend builds, native compilation, or runtime checks were run, per the task instruction. Rust is unavailable in this environment and no system toolchain was installed. Native packaging and runtime behavior remain unverified.
- npm installation reported 26 dependency vulnerabilities (1 low, 8 moderate, 17 high); no broad dependency remediation was attempted as part of this scaffold task.
- Desktop privacy controls and the actual export flow belong to later tasks and are not implemented here.

## Plan adjustments

The initial brief's file list named only `icons/icon.png`; working macOS and Windows bundles also require platform icon formats. The generated desktop icon set is included. The parent explicitly requested the API/dialog/filesystem JavaScript dependencies in this task, together with the frontend desktop build script referenced by Tauri.

## Review follow-up: preserve web development port fallback

Changed files: `vite.config.ts`, `src-tauri/tauri.conf.json`, and this report.

- Changed Vite's `server.strictPort` to `mode === 'desktop'`, so normal `npm run dev` can advance to another available port while desktop development requires port 5173.
- Added `--mode desktop` to Tauri's `beforeDevCommand` so the desktop dev server enables strict binding and relative asset paths explicitly.
- Static verification: inspected the focused diff and the development script (`dev` remains `vite`). The mode comparison now makes strict binding false for normal development and true for desktop development; the configured Tauri development URL remains `http://127.0.0.1:5173`.
- No tests, builds, or runtime checks were run, as instructed. Runtime port fallback has not been exercised.
