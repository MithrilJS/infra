import * as http from "node:http"
import * as https from "node:https"
import {StringDecoder} from "node:string_decoder"
import {once} from "node:events"
import {setTimeout} from "node:timers/promises"

import {Fail, fail, getRequiredEnv, reportRunError} from "./util.js"
import {apiAgent} from "./api-client.js"

const MAX_TRIES = 10
const EXPONENTIAL_BACKOFF_SCALE = 5

export async function getIDToken() {
    let statusCode = 0
    let contents = ""
    let result

    try {
        const requestUrl = getRequiredEnv("ACTIONS_ID_TOKEN_REQUEST_URL")

        console.log(`::debug::ID token url is ${requestUrl}`)

        void getRequiredEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN")

        const idTokenUrl = new URL(requestUrl)

        let numTries = 0
        let response

        responseIsFinal:
        for (;;) {
            response = await requestRaw(idTokenUrl)

            let redirectsRemaining = 50
            while (
                isRedirectCode(response.statusCode) &&
                redirectsRemaining > 0 &&
                // Don't redirect without a location.
                response.headers.location
            ) {
                redirectsRemaining--

                const redirectUrl = new URL(response.headers.location)

                if (idTokenUrl.protocol === "https:" && redirectUrl.protocol !== "https:") {
                    reportRunError("Blocked HTTPS to HTTP redirect downgrade.")
                    reportRunError(`Source URL: ${idTokenUrl}`)
                    reportRunError(`Target URL: ${redirectUrl}`)
                    throw new Fail()
                }

                // Drain the response before reassigning, so the old socket won't leak.
                await dropResponse(response)

                // strip authorization header if redirected to a different hostname
                if (redirectUrl.hostname !== idTokenUrl.hostname) {
                    break responseIsFinal
                }

                // let's make the request with the new redirectUrl
                response = await requestRaw(redirectUrl)
            }

            // If a successful response or not a retryable failure, return immediately
            if (!isRetryableCode(response.statusCode)) {
                break
            }

            // Check for retries.
            if (++numTries > MAX_TRIES) {
                break
            }

            await dropResponse(response)
            await setTimeout(EXPONENTIAL_BACKOFF_SCALE * 2 ** numTries)
        }

        statusCode = response.statusCode

        if (statusCode !== 404) {
            const decoder = new StringDecoder("utf-8")

            for await (const chunk of response) {
                contents = `${contents}${decoder.write(chunk)}`
            }

            contents = `${contents}${decoder.end()}`

            try {
                result = JSON.parse(contents)
            } catch {
                // Leave result as `undefined` if the response isn't valid JSON.
            }
        }
    } catch (error) {
        reportRunError(`Failed to get ID token (status code: ${statusCode})`)
        reportRunError(error)
        reportRunError("Ensure GITHUB_TOKEN has permission \"id-token: write\".")
        throw new Fail()
    }

    // 3xx redirects are handled by the http layer, so they don't need handled here.
    if (statusCode > 299) {
        // The error message might be in the response, so try that as a fallback.
        const message = result?.message || contents

        reportRunError(`Failed to get ID token (status code: ${statusCode})`)
        if (message) reportRunError(message)
        fail("Ensure GITHUB_TOKEN has permission \"id-token: write\".")
    }

    if (result === null || typeof result !== "object") {
        fail("Response body is not an object.")
    }

    if (!Object.hasOwn(result, "value")) {
        fail("Response body lacks a \"value\" field, and thus an ID token.")
    }

    const idToken = result.value

    if (typeof idToken !== "string") {
        fail("Returned ID token is not a string")
    }

    console.log(`::add-mask::${idToken}`)

    return idToken
}

function isRedirectCode(code) {
    return code === 301 || code === 302 || code === 303 || code === 307 || code === 308
}

function isRetryableCode(code) {
    return code === 502 || code === 503 || code === 504
}

function dropResponse(response) {
    const endP = once(response, "end")
    response.resume()
    return endP
}

async function requestRaw(targetUrl) {
    const requestPath = `${targetUrl.pathname || ""}${targetUrl.search || ""}`
    let requestPort = 443
    let httpModule = https

    if (targetUrl.protocol === "http:") {
        requestPort = 80
        httpModule = http
    }

    if (targetUrl.port) {
        requestPort = Number.parseInt(targetUrl.port, 10)
    }

    const req = httpModule.request({
        method: "GET",
        agent: apiAgent,
        headers: {
            "accept": "application/json",
            "user-agent": "actions/oidc-client",
            "authorization": `Bearer ${getRequiredEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN")}`,
        },
        port: requestPort,
        path: requestPath,
        // Time out after 3 minutes so it doesn't take forever.
        timeout: 3 * 60_000,
    })

    const ctrl = new AbortController()

    /** @type {Promise<[undefined | http.IncomingMessage]>} */
    const responseP = Promise.race([
        once(req, "response", {signal: ctrl.signal}),
        once(req, "timeout", {signal: ctrl.signal}),
    ]).finally(() => ctrl.abort())

    req.end()

    /** @type {[undefined | http.IncomingMessage]} */
    const [response] = await responseP

    if (!response) {
        req.socket?.end()
        fail(`Request timeout: ${requestPath}`)
    }

    return response
}
