# Deploy the frontend to Netlify

For a separate frontend GitHub repository, upload **the contents of `Frontend/`**, including
`package.json`, `package-lock.json`, `netlify.toml`, `.node-version`, `index.html`, `src/`,
`public/` and Vite configuration. Do not upload `node_modules`, `dist`, or `.env` files.

1. Import the repository through Netlify's GitHub integration.
2. For a frontend-only repository, leave Base directory blank. Build command is
   `npm run build`; Publish directory is `dist`. The included `netlify.toml` supplies these
   and selects Node 22.
3. If importing the whole project repository instead, use the root `netlify.toml`:
   Base directory is `Frontend`, build command `npm run build`, publish directory `dist`
   relative to that base. Do not add another `Frontend/` prefix to publish.
4. Before deploying, set this environment variable in Netlify with build scope:

   ```text
   VITE_API_BASE_URL=https://YOUR-ACTUAL-HEROKU-HOST.herokuapp.com/api
   ```

   Copy the actual backend hostname from Heroku, including any generated suffix. Include
   `/api`. Netlify builds fail with an explanatory message if this URL is missing or invalid.
5. Deploy. On Heroku, set both `FRONTEND_APP_URL` and `CORS_ORIGINS` to your actual Netlify
   HTTPS origin (for example `https://your-site.netlify.app`) with no trailing slash.
6. Open the site, sign up/sign in, and verify requests go to the Heroku hostname in the
   browser Network tab. Confirm email invitation/reset links return to the Netlify site.

`VITE_*` values are public and embedded at build time. Put only the API's public URL here;
SMTP passwords, MongoDB URLs, LLM keys and encryption keys belong exclusively in Heroku.
Changing `VITE_API_BASE_URL` requires a new Netlify build/deploy. The development Vite `/api`
proxy only runs locally; production uses the absolute backend URL directly.

The included SPA rewrite serves `index.html` for frontend routes, including direct links
from emails. It is not an API proxy. The application's existing hash navigation still works.
If adding a custom domain, update Heroku's frontend/CORS URLs too. Deploy-preview origins
must be explicitly allowed if they need API access; production does not automatically trust
all Netlify preview domains.

References: [Netlify build configuration](https://docs.netlify.com/build/configure-builds/overview/),
[SPA routing](https://docs.netlify.com/build/configure-builds/javascript-spas/),
[build environment variables](https://docs.netlify.com/build/environment-variables/get-started/).
