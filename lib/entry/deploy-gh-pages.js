import * as path from "node:path"
import {once} from "node:events"
import {spawn} from "node:child_process"

import {fail, run} from "../util.js"
import {getOctokit} from "../api-client.js"

const artifactP = import("@actions/artifact")

run(async () => {
    const [thisOwner, thisRepo] = process.env.GITHUB_ACTION_REPOSITORY.split("/")
    const sourceRepository = process.env.GITHUB_REPOSITORY

    const deployToken = process.env.INPUT_TOKEN

    // Switch to GNU tar instead of the default bsdtar so I can use for `--hard-dereference`.
    const tarCmd = process.platform === "darwin" ? "gtar" : "tar"
    const tarArgs = [
        "--dereference", "--hard-dereference",
        "--directory", process.env.INPUT_PATH,
        "-cvf", path.join(process.env.RUNNER_TEMP, "artifact.tar"),
        "--exclude=.git",
        "--exclude=.github",
        ...(process.platform === "win32" ? ["--force-local"] : []),
        ".",
    ]

    console.log("::group::Archive artifact")
    const tarProcess = spawn(tarCmd, tarArgs)
    await once(tarProcess, "exit")

    if (tarProcess.exitCode) {
        fail(`::error::\`tar\` extraction failed with code ${tarProcess.exitCode}.`)
    }

    if (tarProcess.signalCode) {
        fail(`::error::\`tar\` extraction failed with signal ${tarProcess.signalCode}.`)
    }

    console.log("::endgroup::")

    console.log("Uploading artifact")
    const {default: artifact} = await artifactP
    const uploadResponse = await artifact.uploadArtifact("github-pages", ["artifact.tar"], process.env.RUNNER_TEMP)

    if (uploadResponse.id === undefined) {
        fail("Artifact upload failed to yield an ID")
    }

    console.log(`Issuing dispatch event to ${thisOwner}/${thisRepo}`)

    const octokit = getOctokit(deployToken)

    try {
        await octokit.request("POST /repos/{owner}/{repo}/dispatches", {
            owner: thisOwner,
            repo: thisRepo,
            event_type: "deploy-gh-pages",
            client_payload: {
                repo: sourceRepository,
                artifactName: "github-pages",
                artifactId: uploadResponse.id,
                workflowRunId: process.env.GITHUB_RUN_ID,
            },
        })
    } catch (e) {
        fail(`::error title=Failed to create dispatch event::${e.message}`)
    }
})
