import * as http from "node:http"
import * as https from "node:https"

import {ProxyAgent, fetch} from "undici"

import * as tunnel from "tunnel"
import {Octokit} from "@octokit/core"

const isLoopbackAddress = /^LOCALHOST$|^127\.|^\[::1]|^\[0:0:0:0:0:0:0:1]/

/** @param {URL} reqUrl */
function checkBypass(reqUrl) {
    const hostnameUpper = reqUrl.hostname.toUpperCase()
    if (!hostnameUpper) return false
    if (isLoopbackAddress.test(hostnameUpper)) return true

    const noProxy = process.env["no_proxy"] || process.env["NO_PROXY"]
    if (!noProxy) return false

    // Determine the request port
    let reqPort

    if (reqUrl.port) {
        reqPort = Number(reqUrl.port)
    } else if (reqUrl.protocol === "http:") {
        reqPort = 80
    } else if (reqUrl.protocol === "https:") {
        reqPort = 443
    } else{
        return false
    }

    // Compare request host against noproxy
    // Check both hostname and hostname + port
    const hostPortUpper = `${hostnameUpper}:${reqPort}`

    for (let part of noProxy.split(",")) {
        part = part.trim()
        if (!part) continue
        if (part === "*") return true
        part = part.toUpperCase()
        if (hostnameUpper === part) return true
        if (hostPortUpper === part) return true
        if (!part.startsWith(".")) part = `.${part}`
        if (hostnameUpper.endsWith(part)) return true
        if (hostPortUpper.endsWith(part)) return true
    }

    return false
}

let context

/**
 * @returns {{
 *     agent: TunnelingAgent | http.Agent;
 *     dispatcher: undefined | import("undici").Dispatcher
 *     baseUrl: string;
 * }}
 */
export function getRequestContext() {
    if (context) return context

    // This sets up any potential internal proxying Github might use in its runtime.
    const parsedUrl = new URL(process.env.GITHUB_API_URL || "https://api.github.com")
    const usingSsl = parsedUrl.protocol === "https:"
    const maxSockets = http.globalAgent.maxSockets
    let proxyUrl2

    if (!checkBypass(parsedUrl)) {
        let proxyVar

        if (usingSsl) {
            proxyVar = process.env["https_proxy"] || process.env["HTTPS_PROXY"]
        } else {
            proxyVar = process.env["http_proxy"] || process.env["HTTP_PROXY"]
        }


        if (proxyVar) {
            try {
                proxyUrl2 = new URL(proxyVar)
            } catch {
                if (!proxyVar.startsWith("http://") && !proxyVar.startsWith("https://")) {
                    proxyUrl2 = new URL(`http://${proxyVar}`)
                }
            }
        }
    }

    const useProxy = proxyUrl2 && proxyUrl2.hostname
    let agent, dispatcher

    // This is `useProxy` again, but we need to check `proxyURl` directly for TypeScripts's flow analysis.
    if (proxyUrl2 && proxyUrl2.hostname) {
        const agentOptions = {
            maxSockets,
            keepAlive: false,
            proxy: {
                host: proxyUrl2.hostname,
                port: proxyUrl2.port,
            },
        }

        const proxyUsername = decodeURIComponent(proxyUrl2.username)
        const proxyPassword = decodeURIComponent(proxyUrl2.password)

        if (proxyUsername || proxyPassword) {
            agentOptions.proxy.proxyAuth = `${proxyUsername}:${proxyPassword}`
        }

        let tunnelAgent
        const overHttps = proxyUrl2.protocol === "https:"
        if (usingSsl) {
            tunnelAgent = overHttps ? tunnel.httpsOverHttps : tunnel.httpsOverHttp
        } else {
            tunnelAgent = overHttps ? tunnel.httpOverHttps : tunnel.httpOverHttp
        }

        agent = dispatcher = tunnelAgent(agentOptions)
    } else {
        const options = {keepAlive: false, maxSockets}
        agent = usingSsl ? new https.Agent(options) : new http.Agent(options)
        if (useProxy) {
            const agentOptions = {
                url: proxyUrl2.href,
                pipelining: 0,
            }

            const proxyUsername = decodeURIComponent(proxyUrl2.username)
            const proxyPassword = decodeURIComponent(proxyUrl2.password)

            if (proxyUsername || proxyPassword) {
                const userPass = `${proxyUsername}:${proxyPassword}`
                agentOptions.token = `Basic ${Buffer.from(userPass).toString("base64")}`
            }

            dispatcher = new ProxyAgent(options)
        }
    }

    return context = {agent, dispatcher, baseUrl: parsedUrl.href}
}

const octokitCache = new Map()

export function getOctokit(token) {
    if (!token) {
        throw new Error("Token is required")
    }

    const found = octokitCache.get(token)
    if (found) return found

    const {agent, dispatcher, baseUrl} = getRequestContext()

    const octokit = new Octokit({
        auth: `token ${token}`,
        baseUrl,
        request: {
            agent,
            fetch: (url, opts) => fetch(url, {dispatcher, ...opts}),
        }
    })
    octokitCache.set(found, octokit)
    return octokit
}
