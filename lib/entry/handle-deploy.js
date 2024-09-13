// This package assumes a site has already been built and the files exist in the current workspace
// If there's an artifact named `artifact.tar`, it can upload that to actions on its own,
// without the user having to do the tar process themselves.

import {getDeployPayload, run} from "../util.js"

run(async() => {
    const payload = await getDeployPayload()

    if (payload.type === "npm") {
        const {deployToNpm} = await import("../deploy/npm.js")
        await deployToNpm(payload)
    } else if (payload.type === "github-pages") {
        const {deployToGitHubPages} = await import("../deploy/github-pages.js")
        await deployToGitHubPages(payload)
    } else {
        throw new Error(`Unimplemented payload type: ${payload.type}`)
    }
})
