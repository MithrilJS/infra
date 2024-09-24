**⚠⚠⚠ Warning: this repo is under construction. ⚠⚠⚠**

# MithrilJS shared infra workflows and scripts

This handles all deploy processes and centralizes all the permissions. It also includes some utility scripts

> Admins should consult [the runbook](./RUNBOOK.md) as well.

- [Deploy](#deploy)
- [Block a PR with a comment](#block-a-pr-with-a-comment)
- [Notify triage](#notify-triage)
- [License](#license)

## Deploy

It's a multi-step process.

1. Determine the repo you want to add it to. Anywhere you see `$REPO` here, substitute that with the name of the repo you chose.
2. Determine the module name you want to publish or register. Anywhere you see `$MODULE` here, substitute that with the name of the module you chose.
3. If your package requires publishing to a new npm module, reach out to an admin to create a new local access token if needed and tell you what to fill. You will need to rebase your pull request for later steps with this repo name, or (better) just allow maintainers to write to your pull request. The admin will also set up a secret for you to send deploy requests with.
4. Add the personal access token as the `DEPLOY_TOKEN` secret (or whatever the admin told you).
5. Create a pull request to the source repo where you want to call from, with the following (adjusted as needed):
   - Deploy to npm:
     ```yml
     - uses: MithrilJS/infra/deploy@main
       with:
         type: npm
         token: ${{ secrets.DEPLOY_TOKEN }}
     ```
   To deploy a package not located in the repo root, set the `root_dir` option:
   ```yml
   with:
     root_dir: ${{ github.workspace }}/path/to/package
   ```

## Block a PR with a comment

Usage is pretty simple. Suppose development is occurring on `main` and the PR is to the special branch `release`. You can use this workflow to handle it easily.

```yml
name: Deny pushing to `release`
on:
  pull_request:
    types: [opened]
    branches: [release]
permissions:
  id-token: write
  pull-requests: write
jobs:
  reject:
    uses: MithrilJS/infra/.github/workflows/reject-pr.yml@main
```

If the right branch isn't `main`, you can specify it explicitly. Suppose it's `next` instead. It's still just as easy.

```yml
name: Deny pushing to `release`
on:
  pull_request:
    types: [opened]
    branches: [release]
permissions:
  id-token: write
  pull-requests: write
jobs:
  reject:
    uses: MithrilJS/infra/.github/workflows/reject-pr.yml@main
    with:
      correct_branch: next
```

## Notify triage

Usage is extremely simple. This also implicitly adds the issue to [our tracking project](https://github.com/orgs/MithrilJS/projects/2) for triage.

```yml
name: Notify triage on issue create
on:
  issues:
    types: [opened]
  pull_request:
    types: [opened]
permissions:
  id-token: write
  issues: write
  pull-requests: write
  repository-projects: write
jobs:
  reject:
    uses: MithrilJS/infra/.github/workflows/notify-triage.yml@main
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
