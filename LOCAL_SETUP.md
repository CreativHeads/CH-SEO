# Run SEO Studio on your Windows PC

## 1. Start the website

1. Install Node.js 24 or later from https://nodejs.org if it is not installed.
2. Extract this ZIP into a folder such as `D:\CH SEO Agentic\SEO_Studio`.
3. Double-click **START_SEO_STUDIO.bat**. The first run downloads dependencies and builds the website. Keep the command window open.
4. The launcher opens **http://127.0.0.1:8000**. If it does not open automatically, enter that exact address in your browser.
5. Click **API Keys & Connections** at the top of the page.

This local version signs you in as the local owner. It is intended for your PC, not public hosting or a shared team server. It binds only to 127.0.0.1. Press Ctrl+C in the command window to stop it.

## 2. Paste keys and test access

Choose a provider, paste its settings and click **Save securely**, then **Test saved connection**. Blank fields preserve saved values; saved keys are never displayed again. Use **Remove saved settings** to remove the provider settings saved through this screen.

- **OpenAI:** API key, model ID, maximum reserved cost per draft/answer, and model input/output token prices. Use a model supporting the Responses API with structured JSON output. The test confirms key/model access without generating content; billing and generation access are checked when a real job runs.
- **Google:** Upload or paste the service-account JSON. Enable Search Console API and Google Analytics Data API in that Google Cloud project. Add the service-account `client_email` to Search Console and as a Viewer of the GA4 property. Each client must also have its GSC property and numeric GA4 property ID entered in Client Setup.
- **PageSpeed:** Paste a Google API key with PageSpeed Insights API enabled. Create/select a client before testing; the test runs against that website.
- **DataForSEO:** API login and API password, request cost reservations, and models for the ChatGPT/Gemini answer checks. Verify the reservation amounts against provider pricing and your crawl size before a paid request. A paid provider may charge more than an underestimated reservation; these are application budgets, not provider-enforced billing limits.
- **Knowledgebase:** Your existing Knowledgebase API URL, bearer key and writing-context path. The default path is `clients/{client_id}/writing-context?platform=website&content_type=blog`. Choose the matching client ID in Client Setup. AI drafting stops if this verified context is unavailable.

Do not paste keys into chat, screenshots or CSV files. Browser tests send credentials only to this website's server; provider calls originate from the server.

## 3. Configure each client

Open All Clients → Add Client. Enter its HTTPS website, platform and monthly target. Open Client Setup to add GSC / GA4 properties, Knowledgebase client ID and WordPress credentials. Use each service's Test button to check the client's actual access.

For WordPress:

1. Create a dedicated WordPress user with the permissions needed to edit posts. Generate an Application Password in that user's WordPress profile.
2. Enter the WordPress URL and username in Client Setup. Click **Set WordPress password** and save the application password.
3. Test the connection. Standard approved draft creation works through the WordPress REST API.
4. For SEO metadata, schema and redirect fixes, upload `downloads/ch-seo-connector.zip` through WordPress → Plugins → Add New → Upload Plugin, then activate it. This connector is extracted from Appendix C of your PDF; its PHP syntax is checked during build. It has not been tested on your live WordPress site yet.
5. Yoast or Rank Math is required for SEO metadata writes. Redirects require the connector's `ch_seo_manage` capability. Administrators receive it on plugin activation; your WordPress administrator can grant it to the dedicated editor using `wp user add-cap USERNAME ch_seo_manage` if needed.
6. Test on staging before applying live changes. Fix approval remains required. Content is sent only as a WordPress draft.

## User and profile controls

Click your name/avatar in the top-right corner to edit your display name. Admin users can choose **Manage users**, add a member, or edit a member's name, role and active status under Reports & Admin → People. People and Administration also work before a client has been created.

On your PC, **Switch local user** selects an active saved member for testing that role. This is a local development feature, not a production login system. On the hosted website, **Sign out / change account** uses the site's normal sign-in flow; the other account still needs an active membership.

Filters now filter the displayed records; CSV export uses the filtered table. Global Search finds modules, clients and records in the selected client. The bell opens pending reviews and issues; Inspect opens Site Audit.

## 4. Keep your local work and credentials

The website creates `.local/studio.sqlite` for data and `.local/encryption.key` for encrypted credentials. Keep both together. Close the website before copying the entire `.local` folder as a backup. Treat the backup as sensitive because it includes the decryption key. Never share or commit it.

When updating code, keep your existing `.local` folder. The launcher applies new database migrations automatically. Do not replace the encryption key: saved credentials cannot be read without the original key. The downloadable code contains no credentials or client database.

Advanced server settings can be supplied in `.env`; the launcher reads that file automatically. Saved UI provider settings take precedence over matching environment settings. Removing a saved provider returns to environment values if present.

## 5. Current scope

The setup screen makes the implemented integrations configurable; it does not complete all of the PDF's production scope. Scheduled background automation, the complete audit catalogue and advanced monitoring remain unfinished. The hosted website and your local PC have separate databases and credentials. See `docs/IMPLEMENTATION_STATUS.md` for the full coverage list.

Provider setup references:
- Google Analytics: https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart
- Search Console API: https://developers.google.com/webmaster-tools/v1/sites/list
- OpenAI models: https://platform.openai.com/docs/api-reference/models
