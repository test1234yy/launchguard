# FAQ & Troubleshooting

## General Questions

### Q: Does LaunchGuard store my code?
**A:** No. LaunchGuard never persists uploads to disk or stores scan reports on the server. Scans are processed entirely in-memory and discarded after completion. See [SECURITY.md](SECURITY.md) for detailed safety guarantees.

### Q: Can I use LaunchGuard in CI/CD?
**A:** Yes! LaunchGuard provides HTTP APIs for integration:
- `/api/scan` — POST with GitHub URL or demo mode
- `/api/upload` — POST with ZIP file
- `/api/badge` — GET to retrieve readiness badge
- `/api/health` — GET to check liveness

See README.md for detailed API documentation.

### Q: Can I suppress specific rules?
**A:** Yes! Create a `launchguard.config.json` in your project root:

```json
{
  "ignoreRules": ["CFG004", "ADV001"],
  "minSeverity": "low"
}
```

All suppressions are disclosed in the report, preventing silent failures.

### Q: What's the maximum project size?
**A:** LaunchGuard can scan projects up to ~500MB when loaded into memory. For very large projects, consider excluding node_modules and build artifacts via `.gitignore`.

### Q: Can I use custom rules?
**A:** Not yet. Custom rules are planned for v1.4.0. Currently, all 62 built-in rules can be configured per-project via `launchguard.config.json`.

## Troubleshooting

### App Won't Start

**Problem:** `npm run dev` shows errors

**Solutions:**
1. Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Verify Node.js version:
   ```bash
   node --version  # Should be 20.x or higher
   ```

3. Check for port conflicts (default: 3000):
   ```bash
   npm run dev -- -p 3001  # Use different port
   ```

### Demo Scan Not Working

**Problem:** "Run demo scan" button doesn't produce results

**Solutions:**
1. Check browser console for errors (F12)
2. Verify API is responding:
   ```bash
   curl http://localhost:3000/api/health
   ```

3. Clear browser cache and localStorage:
   - Chrome: Cmd/Ctrl + Shift + Delete
   - Reload the page

### GitHub Scan Fails

**Problem:** "Failed to scan the repository"

**Solutions:**
1. **Verify repository exists:** Is it public? Try pasting the URL in a browser.

2. **Check rate limits:** GitHub has anonymous API limits. Set `GITHUB_TOKEN` in `.env.local`:
   ```bash
   GITHUB_TOKEN=ghp_xxxx...
   ```

3. **Network access:** If behind a firewall, LaunchGuard needs HTTPS access to api.github.com

4. **Repository size:** Very large repos (>500MB) may timeout. Try `/api/upload` instead with a ZIP.

### ZIP Upload Fails

**Problem:** "Could not parse the upload" or "File is X MB, over the limit"

**Solutions:**
1. **File size:** Maximum 15 MB. Compress or split if needed.

2. **File format:** Only `.zip` files are supported. Verify with:
   ```bash
   file your-archive.zip  # Should show "Zip archive data"
   ```

3. **File permissions:** Ensure the file is readable:
   ```bash
   ls -lh your-archive.zip
   ```

4. **Corrupted ZIP:** Try re-creating the archive:
   ```bash
   zip -r new-archive.zip your-project/
   ```

### Tests Fail

**Problem:** `npm test` shows failures

**Solutions:**
1. **Verify environment:** Node.js 20+ required
   ```bash
   node --version
   ```

2. **Clear cache:**
   ```bash
   npm test -- --clearCache
   ```

3. **Run specific test:**
   ```bash
   npm test -- tests/unit/rules.test.ts
   ```

4. **Check for console errors:**
   ```bash
   npm test 2>&1 | grep -A5 "error"
   ```

### Build Fails

**Problem:** `npm run build` shows errors

**Solutions:**
1. **Type errors:**
   ```bash
   npm run typecheck  # Shows all TypeScript issues
   ```

2. **Module not found:** Reinstall dependencies:
   ```bash
   npm ci
   ```

3. **Memory issues:** Increase Node.js heap:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm run build
   ```

### Performance Issues

**Problem:** Slow scan times or high memory usage

**Solutions:**
1. **Large projects:** Exclude unnecessary files in `.gitignore`

2. **Network:** GitHub scans require internet. Check connection:
   ```bash
   curl -I https://api.github.com
   ```

3. **Disk space:** Ensure adequate free space (>1GB recommended)

4. **Browser:** Clear localStorage if scan history is very large:
   ```javascript
   localStorage.clear(); // In browser console
   ```

## API Issues

### Rate Limiting

**Problem:** Getting "429 Too Many Requests"

**Solutions:**
1. **Wait before retrying:** Response includes `Retry-After` header
2. **Per-client limits:**
   - Demo scans: 30 per minute
   - GitHub scans: 10 per minute
   - ZIP uploads: 10 per minute
3. **Identified by:** Client IP address

### Badge Returns Error

**Problem:** `/api/badge?score=XX` returns 400 error

**Solutions:**
1. **Verify score:** Must be 0-100 (e.g., `/api/badge?score=75`)
2. **Add .svg extension:** Some tools require `/api/badge?score=75.svg`
3. **Cache issues:** Badges are cached by CDN. Clear cache if showing old data.

## Deployment Issues

### Vercel Deployment

**Problem:** Build fails on Vercel

**Solutions:**
1. **Node.js version:** Set in `vercel.json`:
   ```json
   {
     "buildCommand": "npm run build",
     "env": {
       "NODE_VERSION": "20.11.0"
     }
   }
   ```

2. **Environment variables:** Set in Vercel dashboard:
   - `OPENAI_API_KEY` (optional)
   - `GITHUB_TOKEN` (optional)

3. **Build logs:** Check Vercel deployment logs for details

### Docker Deployment

**Problem:** Container fails to start

**Solutions:**
1. **Build command:**
   ```dockerfile
   RUN npm run build
   CMD ["npm", "start"]
   ```

2. **Port exposure:**
   ```dockerfile
   EXPOSE 3000
   ```

3. **Environment:**
   ```dockerfile
   ENV NODE_ENV=production
   ENV NODE_OPTIONS=--max-old-space-size=2048
   ```

## Browser Compatibility

**Supported:**
- ✅ Chrome/Chromium 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

**Mobile:**
- ✅ iOS Safari 14+
- ✅ Android Chrome/Firefox

**Known Issues:**
- 🔄 IE11: Not supported (use modern browser)
- 🔄 Private browsing: May require localStorage permission

## Getting Help

1. **Check this FAQ** — Covers common issues
2. **Review [CONTRIBUTING.md](CONTRIBUTING.md)** — Development guidance
3. **Check [ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Technical details
4. **Open an issue** — With [BUG], [FEATURE], or [QUESTION] tags
5. **Report security issues** — See [SECURITY.md](SECURITY.md)

## Reporting Bugs Effectively

When reporting an issue, include:

1. **Version:** `npm list launchguard` or check /api/health
2. **Environment:** OS, Node.js version, browser
3. **Steps to reproduce:** Exact sequence
4. **Expected vs actual:** What should happen vs what did
5. **Error logs:** Terminal output, browser console (F12)
6. **Screenshots:** UI state if relevant

Example:
```
Using LaunchGuard 1.2.0 on macOS with Node 20.11.0
1. Run `npm run dev`
2. Click "Demo scan"
3. Scan completes but findings don't display

Expected: See findings list
Actual: Shows blank white screen
Error in console: [screenshot attached]
```

## Still Having Issues?

- **Open a GitHub issue:** https://github.com/test1234yy/launchguard/issues
- **Start a discussion:** For non-urgent questions
- **Email:** For security concerns (see SECURITY.md)
