import {Fail, fail, getRequiredEnv, reportRunError, run} from "../util.js"
import {getIDToken} from "../oidc-get-token.js"
import {getRequest} from "../api-client.js"

const DEPLOYMENT_TIMEOUT = 60_000
const SIZE_LIMIT_BYTES = 2 ** 30
const SIZE_LIMIT_DESCRIPTION = "1 GB"

const MIN_REPORTING_INTERVAL = 5000
const MAX_REPORTING_INTERVAL = 15000
const MAX_ERROR_COUNT = 10

/**
 * @type {Map<
 *     import("@octokit/openapi-types").components["schemas"]["pages-deployment-status"],
 *     {fatal: boolean, message: string}
 * >}
 */
const deploymentErrorMessageMap = new Map([
    ["unknown_status", {
        fatal: false,
        message: "Unable to get deployment status.",
    }],
    ["not_found", {
        fatal: false,
        message: "Deployment not found.",
    }],
    ["deployment_attempt_error", {
        fatal: false,
        message: "Deployment temporarily failed, a retry will be automatically scheduled...",
    }],
    ["deployment_failed", {
        fatal: true,
        message: "Deployment failed, try again later.",
    }],
    ["deployment_content_failed", {
        fatal: true,
        message: "Artifact could not be deployed. Please ensure the content does not contain any hard links, symlinks and total size is less than 10GB.",
    }],
    ["deployment_cancelled", {
        fatal: true,
        message: "Deployment cancelled.",
    }],
    ["deployment_lost", {
        fatal: true,
        message: "Deployment failed to report final status.",
    }],
])

/**
 * @param {import("../util.js").DeployPayload} payload
 * @param {string} deployToken
 */
export async function deployToGitHubPages(payload, deployToken) {
    const idToken = await getIDToken()

    const request = getRequest(deployToken)

    const buildActor = getRequiredEnv("GITHUB_ACTOR")
    let deploymentPending = false
    let startTime

    /** @type {string | number} */
    let deploymentId = ""

    /** @type {undefined | import("@octokit/openapi-types").components["schemas"]["page-deployment"]} */
    let deploymentInfo

    async function cancelDeployment() {
        // Don't attempt to cancel if no deployment was created
        if (!deploymentPending) {
            console.log("::debug::No deployment to cancel")
            return
        }

        // Cancel the deployment
        console.log("Canceling Pages deployment...")
        try {
            await request("POST /repos/{owner}/{repo}/pages/deployments/{deploymentId}/cancel", {
                owner,
                repo,
                deploymentId,
            })
            console.log(`Canceled deployment with ID ${deploymentId}`)

            deploymentPending = false
        } catch (error) {
            const data = error.response?.data

            reportRunError("Canceling Pages deployment failed")
            reportRunError(error)

            if (data) {
                reportRunError(JSON.stringify(data))
            }

            throw new Fail()
        }
    }

    let errorReportingIntervalTimer

    // Handlers aren't registered until they're actually needed.
    const onCancel = () => {
        process.off("SIGINT", onCancel)
        process.off("SIGTERM", onCancel)
        clearTimeout(errorReportingIntervalTimer)
        // Let it wait indefinitely until the action runner either shuts down or times out.
        run(cancelDeployment)
    }

    const registerCancel = () => {
        process.on("SIGINT", onCancel)
        process.on("SIGTERM", onCancel)
    }

    const [owner, repo] = payload.repo.split("/")

    console.log("::group::Deploy to GitHub Pages")

    try {
        try {
            console.log(`::debug::Actor: ${buildActor}`)
            console.log(`::debug::Actions Workflow Run ID: ${payload.workflowRunId}`)

            const {data: artifactData} = await request("GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}", {
                owner,
                repo,
                artifact_id: payload.artifactId,
            })

            if (artifactData.size_in_bytes > SIZE_LIMIT_BYTES) {
                // I'm failing this. If it's too big to fit, I don't want to chance it bugging out.
                fail(
                    `Uploaded artifact size of ${artifactData.size_in_bytes
                    } bytes exceeds the allowed size of ${SIZE_LIMIT_DESCRIPTION}.`
                )
            }

            // It's at this point where the termination handlers need to be active.
            registerCancel()

            const response = await request("POST /repos/{owner}/{repo}/pages/deployments", {
                owner,
                repo,
                artifact_id: payload.artifactId,
                oidc_token: idToken,
            })

            deploymentInfo = response.data
            deploymentId = response.data.id || payload.buildVersion
            deploymentPending = true
            startTime = Date.now()

            console.log(`Created deployment for ${deploymentId}, ID: ${deploymentInfo.id}`)
        } catch (e) {
            // build customized error message based on server response
            if (!e.response) {
                fail(e)
            }

            reportRunError(`Failed to create deployment (status: ${e.status}) with build version ${payload.buildVersion}.`)

            if (e.response.headers["x-github-request-id"]) {
                reportRunError(`Request ID: ${e.response.headers["x-github-request-id"]}`)
            }

            if (e.status >= 500) {
                reportRunError("Check https://githubstatus.com for a possible GitHub Pages outage and re-run the deployment at a later time.")
            } else if (e.status === 400) {
                reportRunError(`Response: ${e.message}`)
            } else if (e.status === 403) {
                reportRunError('Ensure GITHUB_TOKEN has permission "pages: write".')
            } else if (e.status === 404) {
                reportRunError(`Ensure GitHub Pages has been enabled: https://github.com/${payload.repo}/settings/pages`)
            }

            throw new Fail()
        }

        // Don't attempt to check status if no deployment was created
        if (!deploymentInfo) {
            fail(deploymentErrorMessageMap.get("not_found"))
        }

        if (deploymentPending) {
            fail(deploymentErrorMessageMap.get("unknown_status"))
        }

        let errorCount = 0
        let errorBurstCount = 0
        let errorStatus = 0

        for (;;) {
            await new Promise((resolve) => {
                const ms = Math.min(MAX_REPORTING_INTERVAL, MIN_REPORTING_INTERVAL + 2 ** errorBurstCount)
                errorReportingIntervalTimer = setTimeout(resolve, ms)
            })
            errorReportingIntervalTimer = undefined

            // Check status
            try {
                console.log("Getting Pages deployment status...")
                const {data: deploymentStatus} = await request("GET /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}", {
                    owner,
                    repo,
                    pages_deployment_id: deploymentId,
                })


                const entry = deploymentErrorMessageMap.get(deploymentStatus.status)

                if (entry !== undefined) {
                    if (entry.fatal) {
                        fail(entry.message)
                    }

                    console.log(`::warning::${entry.message}`)
                } else if (deploymentStatus.status === "succeed") {
                    break
                } else {
                    console.log(`Current status: ${deploymentStatus.status}`)
                }

                // reset the error reporting interval once get the proper status back.
                errorBurstCount = 0
            } catch (e) {
                console.log("::error::Getting Pages deployment status failed")
                reportRunError(e)

                // build customized error message based on server response
                if (e.response) {
                    errorStatus = e.status || e.response.status
                    errorCount++
                    errorBurstCount++
                }
            }

            if (errorCount >= MAX_ERROR_COUNT) {
                reportRunError("Too many errors, aborting!")
                reportRunError(`Failed with status code: ${errorStatus}`)
                // Explicitly cancel the deployment
                onCancel()
                throw new Fail()
            }

            // Handle timeout
            if (Date.now() - startTime >= DEPLOYMENT_TIMEOUT) {
                reportRunError("Timeout reached, aborting!")
                // Explicitly cancel the deployment
                onCancel()
                throw new Fail()
            }
        }
    } finally {
        console.log("::endgroup::")
        deploymentPending = false
    }

    console.log("Deployment successful!")
}
