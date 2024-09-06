import * as path from "node:path"
import {once} from "node:events"
import {spawn} from "node:child_process"

import {fail, getPackageInfo, run} from "../util.js"
import {getOctokit} from "../api-client.js"
import {projects} from "../config.js"

const artifactP = import("@actions/artifact")

run(async () => {
    const [thisOwner, thisRepo] = process.env.GITHUB_ACTION_REPOSITORY.split("/")
    const sourceRepository = process.env.GITHUB_REPOSITORY

    const deployToken = process.env.INPUT_TOKEN

    const packageDir = path.resolve(
        process.env.INPUT_PACKAGE_DIR ||
		process.env.GITHUB_WORKSPACE ||
		process.cwd()
    )

    const pkg = await getPackageInfo(packageDir)

    if (pkg.private) {
        fail(`Package ${pkg.name} is private and cannot be published.`)
    }

    console.log(`Checking package ${pkg.name} for deployment registration`)

    if (!Object.hasOwn(projects.npm, pkg.name)) {
        fail(`Package ${pkg.name} is not yet registered for deployment.`)
    }

    console.log(`Packing package ${pkg.name}`)

    const packProcess = spawn("npm", ["pack"], {cwd: packageDir})
    await once(packProcess, "exit")

    if (packProcess.exitCode) {
        fail(`\`npm pack\` failed with code ${packProcess.exitCode}.`)
    }

    if (packProcess.signalCode) {
        fail(`\`npm pack\` failed with signal ${packProcess.signalCode}.`)
    }

    const artifactName = "npm-tarball.tgz"
    const tarballName = `${pkg.name}-${pkg.version}.tgz`
    const artifactFile = path.join(packageDir, tarballName)

    console.log(`Validating ${tarballName}`)

    const publishProcess = spawn("npm", ["publish", artifactFile, "--dry-run"])
    await once(publishProcess, "exit")

    if (publishProcess.exitCode) {
        fail(`::error file=${artifactFile}::\`npm publish\` check failed with code ${publishProcess.exitCode}.`)
    }

    if (publishProcess.signalCode) {
        fail(`::error file=${artifactFile}::\`npm publish\` check failed with signal ${publishProcess.signalCode}.`)
    }

    console.log(`Uploading tarball ${tarballName} as artifact`)

    const {default: artifact} = await artifactP
    const uploadResponse = await artifact.uploadArtifact(artifactName, [tarballName], packageDir, {
        compressionLevel: 0,
    })

    if (uploadResponse.id === undefined) {
        fail("Artifact upload failed to yield an ID")
    }

    console.log(`Issuing dispatch event to ${thisOwner}/${thisRepo}`)

    const octokit = getOctokit(deployToken)

    try {
        await octokit.request("POST /repos/{owner}/{repo}/dispatches", {
            owner: thisOwner,
            repo: thisRepo,
            event_type: "deploy-npm",
            client_payload: {
                repo: sourceRepository,
                artifactName,
                tarballName,
                artifactId: uploadResponse.id,
                workflowRunId: process.env.GITHUB_RUN_ID,
            },
        })
    } catch (e) {
        fail(`::error title=Failed to create dispatch event::${e.message}`)
    }
})
