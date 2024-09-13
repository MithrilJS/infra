import * as http from "node:http"
import * as https from "node:https"

import * as tunnel from "tunnel"
import {ProxyAgent, fetch} from "undici"
import {request} from "@octokit/request"

// Check both hostname and hostname + port
const proxyHasGitHubApi = /(?:^|,)\s*(?:\*|(?:(?:(?:(?:api)?\.)?github)?\.)?com(?::443)?)\s*(?:$|,)/i

// Note: this assumes the public `https://api.github.com` URL is being used for the API.

// This sets up any potential internal proxying Github might use in its runtime.
const maxSockets = http.globalAgent.maxSockets
let proxyUrl2

const noProxy = process.env.no_proxy || process.env.NO_PROXY

if (!noProxy || !proxyHasGitHubApi.test(noProxy)) {
    const proxyVar = process.env.https_proxy || process.env.HTTPS_PROXY

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

    const overHttps = proxyUrl2.protocol === "https:"
    const tunnelAgent = overHttps ? tunnel.httpsOverHttps : tunnel.httpsOverHttp

    agent = dispatcher = tunnelAgent(agentOptions)
} else {
    const options = {keepAlive: false, maxSockets}
    agent = new https.Agent(options)
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

export {agent as apiAgent}

/**
 * @param {string} token
 */
export function getRequest(token) {
    return request.defaults({
        headers: {
            "X-GitHub-Api-Version": "2022-11-28",
            authorization: `token ${token}`
        },
        request: {
            agent,
            fetch: (url, opts) => fetch(url, {dispatcher, ...opts}),
        },
    })
}
