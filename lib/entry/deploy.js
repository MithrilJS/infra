import * as path from "node:path"

import {fail, run, validateDeployPayload} from "../util.js"
import {getRequest} from "../api-client.js"

import {packGitHubPages} from "../pack/github-pages.js"
import {packNpm} from "../pack/npm.js"

run(async() => {
    if (process.platform !== "linux") {
        fail("This action can only be run on Linux hosts.")
    }

    const type = process.env.INPUT_TYPE

    const rootDir = path.resolve(
        process.env.INPUT_ROOT_DIR ||
        process.env.GITHUB_WORKSPACE ||
        process.cwd()
    )

    let artifactFile

    console.log(`::group::Packing ${rootDir}`)

    try {
        switch (type) {
            case undefined:
                return fail("Input `type` is required")

            case "npm":
                artifactFile = await packNpm(rootDir)
                break

            case "github-pages":
                artifactFile = await packGitHubPages(rootDir)
                break

            default:
                return fail(`\`${JSON.stringify(type)}\` is not a valid input type.`)
        }
    } finally {
        console.log("::endgroup::")
    }

    console.log(`::group::Uploading tarball ${artifactFile} as an artifact`)

    try {
        if (!process.env.INPUT_TOKEN) {
            throw new TypeError("Deploy token must be present and non-empty")
        }

        const {base: tarballName, dir: artifactDir} = path.parse(artifactFile)

        console.log(`Uploading ${artifactFile} as artifact ${type}`)

        const {default: artifact} = await import("@actions/artifact")
        const uploadResponse = await artifact.uploadArtifact(type, [tarballName], artifactDir)

        if (uploadResponse.id === undefined) {
            fail("Artifact upload failed to yield an ID")
        }

        const [thisOwner, thisRepo] = process.env.GITHUB_ACTION_REPOSITORY.split("/")

        console.log(`Issuing dispatch event to ${thisOwner}/${thisRepo}`)

        try {
            const request = getRequest(process.env.INPUT_TOKEN)

            await request("POST /repos/{owner}/{repo}/dispatches", {
                owner: thisOwner,
                repo: thisRepo,
                event_type: "deploy",
                client_payload: validateDeployPayload({
                    repo: process.env.GITHUB_REPOSITORY,
                    type,
                    tarballName,
                    artifactId: uploadResponse.id,
                    workflowRunId: process.env.GITHUB_RUN_ID,
                    buildVersion: process.env.GITHUB_SHA,
                }),
            })
        } catch (e) {
            fail(`::error title=Failed to create dispatch event::${e.message}`)
        }
    } finally {
        console.log("::endgroup::")
    }
})
