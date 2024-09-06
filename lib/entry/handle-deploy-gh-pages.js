// This package assumes a site has already been built and the files exist in the current workspace
// If there's an artifact named `artifact.tar`, it can upload that to actions on its own,
// without the user having to do the tar process themselves.

import {getIDToken} from "@actions/core"

import {fail, run} from "../util.js"
import {Deployment} from "./internal/deployment"


const deployment = new Deployment()

async function cancelHandler(evtOrExitCodeOrError) {
    await deployment.cancel()
    // eslint-disable-next-line no-process-exit
    process.exit(Number.isNaN(evtOrExitCodeOrError) ? 1 : evtOrExitCodeOrError)
}

// Register signal handlers for workflow cancellation
process.on("SIGINT", cancelHandler)
process.on("SIGTERM", cancelHandler)

// Main
run(async () => {
    let idToken = ""
    try {
        idToken = await getIDToken()
    } catch (error) {
        fail([
            error,
            "Ensure GITHUB_TOKEN has permission \"id-token: write\".",
        ])
    }

    await deployment.create(idToken)
    await deployment.check()
})
