import * as fs from "node:fs/promises"
import * as path from "node:path"
import {once} from "node:events"
import {spawn} from "node:child_process"

import artifact from "@actions/artifact"

import {
    checkSecretExpiration,
    fail,
    getAllowedPackages,
    getDeployPayload,
    parsePackageInfo,
    run,
} from "./util.js"
import {projects} from "./config.js"

run(async () => {
    if (!process.env.GITHUB_EVENT_PATH) {
        fail("::error::`GITHUB_EVENT_PATH` environment variable not set")
    }

    checkSecretExpiration("NPM_TOKEN")

    const registry = "registry.npmjs.org"
    const npmToken = process.env.INPUT_NPM_TOKEN

    const payload = await getDeployPayload()

    const allowedPackages = getAllowedPackages(payload.repo, projects.npm)

    console.log(`Downloading artifact from ${payload.repo}`)
    const artifactFile = path.join(process.env.GITHUB_WORKSPACE, payload.tarballName)

    const [repositoryOwner, repositoryName] = payload.repo.split("/")

    await artifact.downloadArtifact(payload.artifactId, {
        findBy: {
            token: process.env.GITHUB_TOKEN,
            repositoryOwner,
            repositoryName,
            workflowRunId: payload.workflowRunId,
        },
    })

    console.log("Extracting package info for validation")
    let stdout

    const tarProcess = spawn("tar", [
        "--extract",
        "--to-stdout",
        `--file=${artifactFile}`,
        "package/package.json",
    ], {
        stdio: [null, "pipe", null],
    })

    tarProcess.stdout.setEncoding("utf-8")
    tarProcess.stdout.on("data", (chunk) => {
        stdout += chunk
    })

    await Promise.all([
        once(tarProcess.stdout, "close"),
        once(tarProcess, "exit"),
    ])

    if (tarProcess.exitCode) {
        fail(`\`tar\` extraction failed with code ${tarProcess.exitCode}.`)
    }

    if (tarProcess.signalCode) {
        fail(`\`tar\` extraction failed with signal ${tarProcess.signalCode}.`)
    }

    const packageInfo = await parsePackageInfo(artifactFile, stdout.received)
    console.log(`Package ${packageInfo.name} detected`)

    if (!allowedPackages.has(packageInfo.name)) {
        fail(`Refusing to publish ${packageInfo.name} as it is not allowlisted`)
    }

    // Don't use `npm config set` here, so the token can remain secret.
    console.log("Registering authorization token secret")
    await fs.appendFile(
        path.join(process.env.HOME, ".npmrc"),
        `\n//${registry}/:_authToken=${npmToken}\n`,
        {encoding: "utf-8"},
    )

    console.log(`Publishing package ${packageInfo.name}`)

    const publishProcess = spawn("npm", ["publish", artifactFile])
    await once(publishProcess, "exit")

    if (publishProcess.exitCode) {
        fail(`\`npm publish\` failed with code ${publishProcess.exitCode}.`)
    }

    if (publishProcess.signalCode) {
        fail(`\`npm publish\` failed with signal ${publishProcess.signalCode}.`)
    }

    console.log(`Package ${packageInfo.name} published successfully`)
})
