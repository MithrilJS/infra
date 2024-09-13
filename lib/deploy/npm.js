import * as fs from "node:fs/promises"
import * as path from "node:path"
import {once} from "node:events"
import {spawn} from "node:child_process"

import artifact from "@actions/artifact"

import {captureToString, fail, getDeployToken, parsePackageInfo} from "../util.js"
import {projects} from "../config.js"

/**
 * @param {import("../util.js").DeployPayload} payload
 * @param {AbortSignal} signal
 */
export async function deployToNpm(payload) {
    const deployToken = getDeployToken(payload, projects.npm)

    const artifactFile = path.join(process.env.GITHUB_WORKSPACE, payload.tarballName)

    console.log("::group::Validating file")

    try {
        console.log(`Downloading artifact from ${payload.repo}`)

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

        // Use GNU `tar` instead of the built-in BSD `tar`, so I can depend on its options format.
        const tarProcess = spawn(process.platform === "darwin" ? "gtar" : "tar", [
            "--extract",
            "--to-stdout",
            `--file=${artifactFile}`,
            "package/package.json",
        ], {
            stdio: [null, "pipe", null],
        })

        let killedByThisProcess = false

        const [stdout] = await Promise.all([
            captureToString(tarProcess.stdout).finally(() => {
                if (tarProcess.exitCode === null) {
                    killedByThisProcess = true
                    tarProcess.kill("SIGTERM")
                }
            }),
            once(tarProcess, "exit"),
        ])

        if (tarProcess.exitCode) {
            fail(`\`tar\` extraction failed with code ${tarProcess.exitCode}.`)
        }

        if (tarProcess.signalCode && (!killedByThisProcess || tarProcess.signalCode !== "SIGTERM")) {
            fail(`\`tar\` extraction failed with signal ${tarProcess.signalCode}.`)
        }

        const packageInfo = await parsePackageInfo(artifactFile, stdout)

        if (packageInfo.name !== payload.packageName) {
            fail(`Tarball package name ${packageInfo.name} does not match provided package name ${payload.packageName}.`)
        }
    } finally {
        console.log("::endgroup::")
    }

    console.log("::group::Deploy to npm")

    try {
        // Don't use `npm config set` here, so the token can remain secret.
        console.log("Registering authorization token secret")

        await fs.appendFile(
            path.join(process.env.HOME, ".npmrc"),
            `\n//registry.npmjs.org/:_authToken=${deployToken}\n`,
            {encoding: "utf-8"},
        )

        console.log(`Publishing package ${payload.packageName}`)

        const publishProcess = spawn("npm", ["publish", artifactFile])
        await once(publishProcess, "exit")

        if (publishProcess.exitCode) {
            fail(`\`npm publish\` failed with code ${publishProcess.exitCode}.`)
        }

        if (publishProcess.signalCode) {
            fail(`\`npm publish\` failed with signal ${publishProcess.signalCode}.`)
        }
    } finally {
        console.log("::endgroup::")
    }

    console.log(`Package ${payload.packageName} published successfully`)
}
