# Admin Runbook

- [Create a new issue/PR/projects token](#create-a-new-issueprprojects-token)
- [Create a new npm token](#create-a-new-npm-token)

## Create a new issue/PR/projects token

This is used for commenting on issues and PRs and adding them to projects.

1. Create a new [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new).
2. For the name, use `MithrilJS projects and comment token`
3. Set the expiration to 1 year from now. This is the longest the selector will let you choose.
4. Set the resource owner to `@MithrilJS`.
5. In repository access, click "All repositories".
6. In "Permissions", set:
   - Repository Permissions > Issues to "Read and write"
   - Repository Permissions > Pull requests to "Read and write"
   - Organization Permissions > Projects to "Read and write"
   > I wish these could be narrowed...
7. Go to the bottom of the page and click "Generate token".
8. Copy the resulting token.
9. Go to the target repo's settings, find "Secrets and variables", click the navigation dropdown, and click "Actions".
10. In "Repository secrets", find `ISSUE_PR_PROJECTS_TOKEN` and click its edit icon.
11. Paste the copied token into the "Secret" field.
12. Click "Add secret".
13. Come back to this repo, find the `$NAME` property in the relevant project object of `projects` in `lib/config.js`, and update its `tokenExpiryDate` to match the new expiry date for the token you're updating.

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
