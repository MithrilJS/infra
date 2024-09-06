export async function getIDToken(audience) {
    // New ID Token is requested from action service
    let idTokenUrl = process.env["ACTIONS_ID_TOKEN_REQUEST_URL"]
    if (!idTokenUrl) {
        throw new Error("Unable to get ACTIONS_ID_TOKEN_REQUEST_URL env variable")
    }

    if (audience) {
        const encodedAudience = encodeURIComponent(audience)
        idTokenUrl = `${idTokenUrl}&audience=${encodedAudience}`
    }

    console.log(`::debug::ID token url is ${idTokenUrl}`)

    let res

    try {
        res = await processResponse(await request(idTokenUrl))
    } catch (error) {
        throw new Error(
            `Failed to get ID Token.
    Error Code:    ${error.statusCode}
    Error Message: ${error.message}`
        )
    }

    const idToken = res.result?.value
    if (!idToken) {
        throw new Error("Response json body do not have ID Token field")
    }

    console.log(`::add-mask::${idToken}`)

    return idToken
}

import * as http from "node:http"
import * as https from "node:https"

import {getRequestContext} from "./api-client.js"

const HttpRedirectCodes = [301, 302, 303, 307, 308]
const HttpResponseRetryCodes = [502, 503, 504]
const ExponentialBackoffCeiling = 10
const ExponentialBackoffTimeSlice = 5
const maxTries = 10

class HttpClientError extends Error {
    name = "HttpClientError"
    constructor(message, statusCode, result) {
        super(message)
        this.statusCode = statusCode
        this.result = result
    }
}

async function readBody(message) {
    return new Promise((resolve) => {
        const chunks = []

        message.on("data", (chunk) => {
            chunks.push(chunk)
        })

        message.on("end", () => {
            resolve(Buffer.concat(chunks).toString())
        })
    })
}

async function request(requestUrl) {
    const requestToken = process.env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]
    if (!requestToken) {
        throw new Error("Unable to get ACTIONS_ID_TOKEN_REQUEST_TOKEN env variable")
    }

    const {agent} = getRequestContext()

    const parsedUrl = new URL(requestUrl)

    const usingSsl = requestUrl.protocol === "https:"
    const defaultPort = usingSsl ? 443 : 80

    let info = {
        httpModule: usingSsl ? https : http,
        options: {
            port: requestUrl.port ? parseInt(requestUrl.port, 10) : defaultPort,
            path: `${requestUrl.pathname || ""}${requestUrl.search || ""}`,
            method: "GET",
            headers: {
                "accept": "application/json",
                "user-agent": "actions/oidc-client",
                "authorization": `Bearer ${requestToken}`,
            },
            agent,
        },
    }

    // Only perform retries on reads since writes may not be idempotent.
    let numTries = 0

    let response
    for (;;) {
        response = await requestRaw(info)

        // Check if it's an authentication challenge
        if (response && response.statusCode === 403) {
            return response
        }

        let redirectsRemaining = 50
        while (
            response.statusCode &&
            HttpRedirectCodes.includes(response.statusCode) &&
            redirectsRemaining > 0
        ) {
            const redirectUrl = response.headers["location"]
            if (!redirectUrl) {
                // if there's no location to redirect to, we won't
                break
            }
            const parsedRedirectUrl = new URL(redirectUrl)
            if (
                parsedUrl.protocol === "https:" &&
                parsedUrl.protocol !== parsedRedirectUrl.protocol
            ) {
                throw new Error(
                    "Redirect from HTTPS to HTTP protocol. This downgrade is not allowed for security reasons. If you want to allow this behavior, set the allowRedirectDowngrade option to true."
                )
            }

            // we need to finish reading the response before reassigning response
            // which will leak the open socket.
            await readBody(response)

            // strip authorization header if redirected to a different hostname
            if (parsedRedirectUrl.hostname !== parsedUrl.hostname) {
                return response
            }

            // let's make the request with the new redirectUrl
            const {agent} = getRequestContext()

            const usingSsl = parsedRedirectUrl.protocol === "https:"
            const defaultPort = usingSsl ? 443 : 80
            info = {
                httpModule: usingSsl ? https : http,
                options: {
                    port: parsedRedirectUrl.port ? parseInt(parsedRedirectUrl.port, 10) : defaultPort,
                    path: `${parsedRedirectUrl.pathname || ""}${parsedRedirectUrl.search || ""}`,
                    method: "GET",
                    headers: info.options.headers,
                    agent,
                },
            }
            response = await requestRaw(info)
            redirectsRemaining--
        }

        if (
            !response.message.statusCode ||
            !HttpResponseRetryCodes.includes(response.message.statusCode)
        ) {
            // If not a retry code, return immediately instead of retrying
            return response
        }

        numTries += 1

        if (numTries > maxTries) break

        await readBody(response)
        await performExponentialBackoff(numTries)
    }

    return response
}

async function requestRaw(info) {
    return new Promise((resolve, reject) => {
        let callbackCalled = false

        const req = info.httpModule.request(
            info.options,
            (msg) => {
                if (callbackCalled) return
                callbackCalled = true
                resolve(msg)
            }
        )

        let socket
        req.on("socket", (sock) => {
            socket = sock
        })

        // If we ever get disconnected, we want the socket to timeout eventually
        req.setTimeout(3 * 60000, () => {
            if (socket) {
                socket.end()
            }
            if (callbackCalled) return
            callbackCalled = true
            reject(new Error(`Request timeout: ${info.options.path}`))
        })

        // err has statusCode property
        // res should have headers
        req.on("error", (err) => {
            if (callbackCalled) return
            callbackCalled = true
            reject(err)
        })

        req.end()
    })
}

async function performExponentialBackoff(retryNumber) {
    retryNumber = Math.min(ExponentialBackoffCeiling, retryNumber)
    const ms = ExponentialBackoffTimeSlice * Math.pow(2, retryNumber)
    return new Promise((resolve) => setTimeout(() => resolve(), ms))
}

async function processResponse(res) {
    const statusCode = res.message.statusCode || 0

    const response = {
        statusCode,
        result: null,
        headers: {}
    }

    // not found leads to null obj returned
    if (statusCode === 404) {
        return response
    }

    // get the result from the body
    let obj
    let contents

    try {
        contents = await readBody(res.message)
        if (contents && contents.length > 0) {
            obj = JSON.parse(contents)
            response.result = obj
        }

        response.headers = res.message.headers
    } catch {
        // Invalid resource (contents not json);  leaving result obj null
    }

    // note that 3xx redirects are handled by the http layer.
    if (statusCode > 299) {
        let msg

        // if exception/error in body, attempt to get better error
        if (obj && obj.message) {
            msg = obj.message
        } else if (contents && contents.length > 0) {
            // it may be the case that the exception is in the body message as string
            msg = contents
        } else {
            msg = `Failed request: (${statusCode})`
        }

        throw new HttpClientError(msg, statusCode, response.result)
    } else {
        return response
    }
}
