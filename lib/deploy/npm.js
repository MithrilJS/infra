import * as fs from "node:fs/promises"
import * as path from "node:path"
import {once} from "node:events"
import {spawn} from "node:child_process"

import artifact from "@actions/artifact"

import {
    checkSecretExpiration,
    fail,
    getAllowedPackages,
    parsePackageInfo,
} from "../util.js"
import {projects} from "../config.js"

/**
 * @param {import("../util.js").DeployPayload} payload
 * @param {AbortSignal} signal
 */
export async function deployToNpm(payload) {
    checkSecretExpiration("NPM_TOKEN")
    const artifactFile = path.join(process.env.GITHUB_WORKSPACE, payload.tarballName)
    let packageName

    console.log("::group::Validating file")

    try {
        console.log(`Downloading artifact from ${payload.repo}`)
        const allowedPackages = getAllowedPackages(payload.repo, projects.npm)

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
        packageName = packageInfo.name
        console.log(`Package ${packageName} detected`)

        if (!allowedPackages.has(packageName)) {
            fail(`Refusing to publish ${packageName} as it is not allowlisted`)
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
            `\n//registry.npmjs.org/:_authToken=${process.env.INPUT_NPM_TOKEN}\n`,
            {encoding: "utf-8"},
        )

        console.log(`Publishing package ${packageName}`)

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

    console.log(`Package ${packageName} published successfully`)
}
