// This package assumes a site has already been built and the files exist in the current workspace
// If there's an artifact named `artifact.tar`, it can upload that to actions on its own,
// without the user having to do the tar process themselves.

import * as fs from "node:fs/promises"
import * as path from "node:path"

import {extractJsonFields, fail, run, validateDeployPayload} from "../util.js"
import {localTokenExpiryDates, projects} from "../config.js"

async function getPayload() {
    switch (process.env.GITHUB_EVENT_NAME) {
        case "workflow_dispatch": {
            const eventPath = path.resolve(process.env.GITHUB_EVENT_PATH)
            const event = JSON.parse(await fs.readFile(eventPath, "utf-8"))
            const raw = extractJsonFields(eventPath, "event", event, {inputs: "object"}).inputs
            return validateDeployPayload(raw)
        }

        case "repository_dispatch": {
            const eventPath = path.resolve(process.env.GITHUB_EVENT_PATH)
            const event = JSON.parse(await fs.readFile(eventPath, "utf-8"))
            const raw = extractJsonFields(eventPath, "event", event, {client_payload: "object"}).client_payload
            return validateDeployPayload(raw)
        }

        default:
            return fail(`Unknown value for \`GITHUB_EVENT_NAME\`: ${process.env.GITHUB_EVENT_NAME}`)
    }
}

/** @param {import("../util.js").DeployPayload} payload */
function getDeployToken(payload) {
    const now = Date.now()

    if (!Object.hasOwn(projects, payload.type)) {
        return fail(`Unrecognized project type: ${payload.type}`)
    }

    if (!Object.hasOwn(projects[payload.type], payload.target)) {
        return fail(`Refusing to publish ${payload.target} as it is not allowlisted for`)
    }

    const project = projects[payload.type][payload.target]

    if (project.location !== payload.repo) {
        return fail(`Refusing to publish ${payload.target} as its repo is not allowlisted for`)
    }

    if (project.tokenExpiryDate <= now) {
        return fail(`Refusing to publish ${payload.target} as its public token appears to have expired`)
    }

    if (localTokenExpiryDates[project.tokenName] <= now) {
        return fail(`Refusing to publish ${payload.target} as the local deploy token for it (${project.tokenName}) appears to have expired`)
    }

    let deployToken = process.env[`INPUT_${project.tokenName}`]

    if (!deployToken || !(deployToken = deployToken.trim())) {
        return fail(`Refusing to publish ${payload.target} as the local deploy token (${project.tokenName}) is empty or missing`)
    }

    return deployToken
}

run(async() => {
    const payload = await getPayload()
    const deployToken = getDeployToken(payload)
    let deployFn

    if (payload.type === "npm") {
        deployFn = (await import("../deploy/npm.js")).deployToNpm
    } else if (payload.type === "github-pages") {
        deployFn = (await import("../deploy/github-pages.js")).deployToGitHubPages
    } else {
        throw new Error(`Unimplemented payload type: ${payload.type}`)
    }

    return deployFn(payload, deployToken)
})
