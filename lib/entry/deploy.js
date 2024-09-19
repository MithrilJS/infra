import * as path from "node:path"

import artifact from "@actions/artifact"

import {fail, getRequiredEnv, run, validateDeployPayload} from "../util.js"
import {getRequest} from "../api-client.js"

import {packGitHubPages} from "../pack/github-pages.js"
import {packNpm} from "../pack/npm.js"

run(async() => {
    if (process.platform !== "linux") {
        return fail("This action can only be run on Linux hosts.")
    }

    const repo = getRequiredEnv("GITHUB_REPOSITORY")
    const type = getRequiredEnv("INPUT_TYPE")
    const token = getRequiredEnv("INPUT_TOKEN")
    const actionRepo = getRequiredEnv("GITHUB_ACTION_REPOSITORY")
    const workflowRunId = getRequiredEnv("GITHUB_RUN_ID")
    const buildVersion = getRequiredEnv("GITHUB_SHA")


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
                artifactFile = await packNpm(rootDir, repo)
                break

            case "github-pages":
                artifactFile = await packGitHubPages(rootDir, repo)
                break

            default:
                return fail(`\`${JSON.stringify(type)}\` is not a valid input type.`)
        }
    } finally {
        console.log("::endgroup::")
    }

    console.log(`::group::Uploading tarball ${artifactFile} as an artifact ${type}`)

    try {
        const {base: tarballName, dir: artifactDir} = path.parse(artifactFile)

        const uploadResponse = await artifact.uploadArtifact(type, [tarballName], artifactDir)

        if (uploadResponse.id === undefined) {
            return fail("Artifact upload failed to yield an ID")
        }

        console.log(`Issuing dispatch event to ${actionRepo}`)

        try {
            const request = getRequest(token)
            const [thisOwner, thisRepo] = actionRepo.split("/")

            await request("POST /repos/{owner}/{repo}/dispatches", {
                owner: thisOwner,
                repo: thisRepo,
                event_type: "deploy",
                client_payload: validateDeployPayload({
                    repo,
                    type,
                    tarballName,
                    artifactId: uploadResponse.id,
                    workflowRunId,
                    buildVersion,
                }),
            })
        } catch (e) {
            return fail(`::error title=Failed to create dispatch event::${e.message}`)
        }
    } finally {
        console.log("::endgroup::")
    }
})
