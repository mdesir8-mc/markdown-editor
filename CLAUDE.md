# markdown-editor

## after every change

1. Commit and push all changes with a semantic commit message.
2. Clear `dist/` and run `npm run build` to rebuild the app.
3. Delete `/Applications/Markdown Editor.app` if it exists.
4. Copy the freshly built app to `/Applications/`: `cp -r "dist/mac-arm64/Markdown Editor.app" /Applications/`

Do this automatically after every code change unless explicitly told otherwise.
