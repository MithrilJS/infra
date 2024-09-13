**⚠⚠⚠ Warning: this repo is under construction. ⚠⚠⚠**

# MithrilJS global deploy scripts

This handles all deploy processes and centralizes all the permissions.

Admin note: to use this, it's a multi-step process.

1. Determine the repo you want to add it to. Anywhere you see `$REPO` here, substitute that with the name of the repo you chose.
2. Determine the module name you want to publish or register. Anywhere you see `$MODULE` here, substitute that with the name of the module you chose.
3. Create a new [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new).
   - Name: `$REPO`
   - Expiration: 1 year from now (you'll need to manually enter it).
   - Description: up to you.
   - Resource owner: MithrilJS
   - Repository access:
     - Click "Only select repositories", open the "Select repositories" dropdown, and search and add `$REPO`.
     - Set Repository Permissions > Contents to "Read and write"
     - Set Repository Permissions > Metadata to "Read"
4. [Go to the MithrilJS org's settings.](https://github.com/organizations/MithrilJS/settings) Scroll down to "Personal Access Tokens" and click it. Then, click "Pending Requests". From here, approve your token so it can be used.
   - If you're not an admin, you'll need an admin to do this for you.
5. Add `"$MODULE": "$REPO"` to [`lib/projects.js`](./lib/projects.js) in the relevant command's object.
6. Add `"$REPO": "$EXPIRY"` to [`lib/expiry.js`](./lib/expiry.js) in `repoExpiryDates`, where `$EXPIRY` is the day before your token expires in ISO format, like `2020-01-02`.
7. Add the personal access token as the `DEPLOY_TOKEN` secret. If a repo has multiple of these, it's okay to change this name to something more meaningful.
8. Create a pull request to the source repo where you want to call from, with the following (adjusted as needed):
   - Deploy to npm:
     ```yml
     - uses: MithrilJS/infra/deploy-npm@main
       with:
         token: ${{ secrets.DEPLOY_TOKEN }}
     ```
   - Deploy to GitHub Pages:
     ```yml
     - uses: MithrilJS/infra/deploy-gh-pages@main
       with:
         token: ${{ secrets.DEPLOY_TOKEN }}
     ```
   To deploy a package not located in the repo root, set the `package_dir` option:
   ```yml
   with:
     package_dir: ${{ env.GITHUB_WORKSPACE }}/path/to/package
   ```

## License

Copyright 2024 Mithril.js Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

You can also find a copy of the license [here](./LICENSE).
