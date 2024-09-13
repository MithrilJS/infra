# Admin Runbook

- [Create a new deployment token](#create-a-new-deployment-token)
- [Update an existing deployment token](#update-an-existing-deployment-token)
- [Create a new npm token](#create-a-new-npm-token)
- [Update the org-level GitHub Pages token](#update-the-org-level-github-pages-token)

## Create a new deployment token

This is for a given repository `$REPO`, like `MithrilJS/mithril.js`, and package name `$NAME`, like `mithril.js`.

1. Create a new [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new).
2. For the name, use `$REPO deploy request`. Feel free to shorten the repo name if needed - it's just important that you're able to find it.
3. Set the expiration to 1 year from now. This is the longest the selector will let you choose.
4. For the description, it's up to you.
5. Set the resource owner to `@MithrilJS`.
6. In repository access, click "Only select repositories", open the "Select repositories" dropdown, and search and add `MithrilJS/infra` as the sole repository.
7. In "Permissions", set Repository Permissions > Deployments to "Read and write"
   > Unfortunately, this isn't as secure as it could be: https://github.com/orgs/community/discussions/138551, https://github.com/MithrilJS/infra/issues/1
8. Go to the bottom of the page and click "Generate token".
9.  Copy the resulting token.
10. Go to the target repo's settings, find "Secrets and variables", click the navigation dropdown, and click "Actions".
8. Click "New repository secret".
9. Set the name to `DEPLOY_TOKEN`. If it's not the only deployment token, feel free to pick another name.
10. Paste the copied token into the "Secret" field.
11. Click "Add secret".
12. Come back to this repo, and in the relevant project object of `projects` in `lib/config.js`, add a `$NAME` property set to an object with the following properties:
    - `location`: `$REPO`.
    - `tokenExpiryDate`: the expiry date for the newly created token.
    - `tokenName`: the token needed to perform the deployment.

## Update an existing deployment token

This is for a given repository `$REPO`, like `MithrilJS/mithril.js`, and package name `$NAME`, like `mithril.js`.

If the token is yours:

1. [Go to your developer settings](https://github.com/settings/apps), click the "Personal access tokens" navigation dropdown, and click "Fine-grained tokens".
2. Find the token those name is `$REPO deploy request` and click its linked title.
3. Find the "Regenerate token" button and click it.
4. Set the expiration to 1 year from now. This is the longest the selector will let you choose.
5. Click "Regenerate token".
6. Copy the resulting token.
7. Go to the target repo's settings, find "Secrets and variables", click the navigation dropdown, and click "Actions".
8. In "Repository secrets", find `GH_PAGES_TOKEN` and click its edit icon.
9. Paste the copied token into the "Secret" field.
10. Click "Add secret".
11. Come back to this repo, find the `$NAME` property in the relevant project object of `projects` in `lib/config.js`, and update its `tokenExpiryDate` to match the new expiry date for the token you're updating.

If the token is not yours:

1. Create a new [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new).
2. For the name, use `$REPO deploy request`. Feel free to shorten the repo name if needed - it's just important that you're able to find it.
3. Set the expiration to 1 year from now. This is the longest the selector will let you choose.
4. For the description, it's up to you.
5. Set the resource owner to `@MithrilJS`.
6. In repository access, click "Only select repositories", open the "Select repositories" dropdown, and search and add `MithrilJS/infra` as the sole repository.
7. In "Permissions", set Repository Permissions > Deployments to "Read and write"
   > Unfortunately, this isn't as secure as it could be: https://github.com/orgs/community/discussions/138551, https://github.com/MithrilJS/infra/issues/1
8. Go to the bottom of the page and click "Generate token".
9.  Copy the resulting token.
10. Go to the target repo's settings, find "Secrets and variables", click the navigation dropdown, and click "Actions".
11. In "Repository secrets", find `GH_PAGES_TOKEN` and click its edit icon.
12. Paste the copied token into the "Secret" field.
13. Click "Add secret".
14. Come back to this repo, find the `$NAME` property in the relevant project object of `projects` in `lib/config.js`, and update its `tokenExpiryDate` to match the new expiry date for the token you're updating.

## Create a new npm token

For now, create a classic token of type "Automation". We can switch to the fine-grained ones once a centralized system is set up.

1. [Sign into npm on the web.](https://www.npmjs.com/login)
2. Click your avatar on the upper right of the page, and select "Access Tokens".
3. Click "Generate New Token", then in the dropdown, click "Classic Token".
4. For the name, choose something descriptive enough for you to be able to find it. Listing out accessible packages in the name is good enough.
5. Click "Generate Token".
6. Copy the token from above the table.
7. [Go to this repo's Actions secrets page.](https://github.com/MithrilJS/infra/settings/secrets/actions)
8. Click "New repository secret".
9. Come up with a unique, descriptive name, and use that for the name.
10. Paste the copied token into the "Secret" field.
11. Click "Add secret".

## Update the org-level GitHub Pages token

This is for a given repository `$REPO`, like `MithrilJS/mithril.js`.

If the token is yours:

1. [Go to your developer settings](https://github.com/settings/apps), click the "Personal access tokens" navigation dropdown, and click "Fine-grained tokens".
2. Set the expiration to 1 year from now. This is the longest the selector will let you choose.
3. Go to the bottom of the page and click "Regenerate token".
4. Copy the resulting token.
5. [Go to this repo's Actions secrets page.](https://github.com/MithrilJS/infra/settings/secrets/actions)
6. In "Repository secrets", find `GH_PAGES_TOKEN` and click its edit icon.
7. Paste the copied token into the "Secret" field.
8. Click "Update secret".

If the token is not yours:

1. Create a new [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new).
2. For the name, use `$REPO deploy pages`. Feel free to shorten the repo name if needed - it's just important that you're able to find it
3. Set the expiration to 1 year from now. This is the longest the selector will let you choose.
4. For the description, it's up to you.
5. Set the resource owner to `@MithrilJS`.
6. In repository access, click "Only select repositories", open the "Select repositories" dropdown, and search and add the following repositories:
   - `MithrilJS/mithril.js`
7. In "Permissions", set Repository Permissions > Deployments to "Read and write"
8. Go to the bottom of the page and click "Generate token".
9. Copy the resulting token.
10. [Go to this repo's Actions secrets page.](https://github.com/MithrilJS/infra/settings/secrets/actions)
11. In "Repository secrets", find `GH_PAGES_TOKEN` and click its edit icon.
12. Paste the copied token into the "Secret" field.
13. Click "Update secret".
