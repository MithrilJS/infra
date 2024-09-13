import * as fs from "node:fs/promises"
import * as path from "node:path"

import {localTokenExpiryDates} from "./config.js"

/**
 * @typedef FailDetail
 * @property {string | Error} detail
 * @property {string} [file]
 * @property {string} [startLine]
 * @property {string} [startColumn]
 * @property {string} [endLine]
 * @property {string} [endColumn]
 */

/**
 * Throw this error to fail the action without raising a stack trace.
 */
export const FAIL = new Error("fail")

/**
 * @param {...(string | Error)} messages
 * @returns {never}
 */
export function fail(message) {
    reportRunError(message)
    throw FAIL
}

/**
 * @param {() => Promise<void>} init
 */
export async function run(init) {
    try {
        await init()
    } catch (e) {
        process.exitCode = 1
        reportRunError(e)
    }
}

export function reportRunError(e) {
    // Don't log these. Filtering them out here makes error handling a lot simpler.
    if (e === FAIL) return
    const message = e instanceof Error ? e.stack : `${e}`
    console.log(message.replace(/^(?!::error(?: |::))/gm, "::error::"))
    if (e instanceof AggregateError) {
        for (const inner of e.errors) {
            reportRunError(inner)
        }
    }
}

export function parseExpiryDate(dateString) {
    return new Date(`${dateString}T00:00:00.000Z`).getTime()
}

/** @param {keyof typeof localTokenExpiryDates} name */
export function checkSecretExpiration(name) {
    if (Date.now() >= parseExpiryDate(localTokenExpiryDates[name])) {
        fail(`Secret \`${name}\` has expired. This secret must be replaced as soon as possible.`)
    }
}

/**
 * @typedef DeployPayload
 * @property {string} repo
 * @property {"npm" | "github-pages"} type
 * @property {string} tarballName
 * @property {number} artifactId
 * @property {number} workflowRunId
 * @property {number} buildVersion
 */

/**
 * @param {DeployPayload} payload
 * @returns {DeployPayload}
 */
export function validateDeployPayload(payload) {
    payload = extractJsonFields(undefined, "Payload", payload, {
        repo: "string",
        type: "string",
        tarballName: "string",
        artifactId: "number",
        workflowRunId: "number",
        buildVersion: "number",
    })
    if (!(/^(?:npm|github-pages)$/).test(payload.type)) {
        throw new Error(`Unknown payload type: ${payload.type}`)
    }
    return payload
}

/**
 * @returns {Promise<DeployPayload>}
 */
export async function getDeployPayload() {
    if (!process.env.GITHUB_EVENT_PATH) {
        fail("::error::`GITHUB_EVENT_PATH` environment variable not set")
    }

    const eventData = await fs.readFile(process.env.GITHUB_EVENT_PATH, "utf-8")
    return validateDeployPayload(JSON.parse(eventData))
}

export function getAllowedPackages(repository, expectedMap) {
    return new Set((
        Object.keys(expectedMap)
            .filter((key) => expectedMap[key].location === repository)
    ))
}

/**
 * @typedef {{
 *     missing: undefined
 *     null: null
 *     boolean: boolean
 *     number: number
 *     string: string
 *     object: object
 *     array: unknown[]
 * }} JsonType
 */

/**
 * @typedef {{[key: string]: (keyof JsonType) | Array<keyof JsonType>}} JsonTypeSpec
 */

/**
 * @param {object} host
 * @param {string} key
 * @param {keyof JsonType} type
 */
function jsonFieldMatchesStringType(host, key, type) {
    switch (type) {
        case "missing": return !Object.hasOwn(host, key)
        case "null": return Object.hasOwn(host, key) && host[key] === null
        case "boolean": return Object.hasOwn(host, key) && typeof host[key] === "boolean"
        case "number": return Object.hasOwn(host, key) && typeof host[key] === "number"
        case "string": return Object.hasOwn(host, key) && typeof host[key] === "string"
        case "object":
            return Object.hasOwn(host, key) &&
                host[key] !== null && typeof host[key] === "object" &&
                !Array.isArray(host[key])
        case "array": return Object.hasOwn(host, key) && Array.isArray(host[key])
        default: throw new TypeError(`Unrecognized type: ${type}`)
    }
}

/**
 * @template {JsonTypeSpec} Spec
 * @param {string} file
 * @param {string} name
 * @param {unknown} object
 * @param {Spec} spec
 * @returns {{[P in keyof Spec]: JsonType[
 *     Spec[P] extends Array<keyof JsonType> ? Spec[P][number] : Spec[P]
 * ]}}
 */
function extractJsonFields(file, thing, object, spec) {
    if (object === null || typeof object !== "object") {
        fail(`${thing} is not an object`, {file})
    }

    let foundInvalidProperties = false

    for (const [name, type] of Object.entries(spec)) {
        let typeString

        if (Array.isArray(type)) {
            if (type.length === 0) {
                throw new TypeError(`Field spec for ${name} must include at least one type.`)
            }

            if (type.some((t) => jsonFieldMatchesStringType(object, name, t))) continue
            switch (type.length) {
                case 1: typeString = `\`${type[0]}\``; break
                case 2: typeString = `\`${type[0]}\` or \`${type[1]}\``; break
                default:
                    typeString = type
                        .map((t, i) => `${i === type.length - 1 ? "or " : ""}\`${t}\``)
                        .join(", ")
            }
        } else {
            if (jsonFieldMatchesStringType(object, name, type)) continue
            typeString = `\`${type}\``
        }

        if (!foundInvalidProperties) {
            reportRunError(`${thing} contains invalid properties`)
        }
        reportRunError(`::error file=${file}::\`${thing}.${name}\` is not of type ${typeString}`)
        foundInvalidProperties = true
    }

    if (foundInvalidProperties) throw FAIL

    return Object.fromEntries((
        Object.keys(spec)
            .map((k) => [k, Object.hasOwn(object, k) ? object[k] : undefined])
    ))
}

/**
 * @param {number} maxTokens
 * @returns {<T>(task: () => T | PromiseLike<T>) => Promise<T>}
 */
export function makeSemaphore(maxTokens) {
    // eslint-disable-next-line no-bitwise
    let state = maxTokens | 0

    return async(task) => {
        if (state === 0) {
            await new Promise((resolve) => state = [resolve])
        } else if (Array.isArray(state)) {
            await new Promise((resolve) => state.push(resolve))
        } else {
            state--
        }

        try {
            await task()
        } finally {
            if (!Array.isArray(state)) {
                state++
            } else if (state.length === 0) {
                state = 1
            } else {
                state.shift()()
            }
        }
    }
}

/** @param {(track: (task: () => any) => void) => any} init */
export function waitJobs(init) {
    let resolve, reject
    const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
    })

    let pending = 1
    let error

    async function track(task, ...args) {
        try {
            await task(...args)
        } catch (e) {
            if (resolve !== reject) {
                resolve = reject
                error = e
            } else if (!(error instanceof AggregateError)) {
                error = new AggregateError("Multiple errors occurred", [error, e])
            } else {
                error.errors.push(e)
            }
        }

        if (--pending === 0) {
            resolve(error)
            // Break the one other reference to user stuff, to ensure its collection.
            error = undefined
        }
    }

    track(init, (task) => {
        if (resolve === undefined) {
            throw new ReferenceError("Outer waiter already resolved!")
        }

        pending++
        track(task)
    })

    return promise
}

/** @param {import("node:stream").Readable} readable */
export async function captureToString(readable) {
    const {StringDecoder} = await import("node:string_decoder")

    const decoder = new StringDecoder("utf-8")
    let result = ""

    for await (const chunk of readable) {
        result = `${result}${typeof chunk === "string" ? chunk : decoder.write(chunk)}`
    }

    return `${result}${decoder.end()}`
}

/**
 * @param {string} packageDir
 * @returns {Promise<{name: string, version: string, private: boolean}>}
 */
export async function getPackageInfo(packageDir) {
    const packageFile = path.join(packageDir, "package.json")

    let packageData

    try {
        packageData = await fs.readFile(packageFile, {encoding: "utf-8"})
    } catch (e) {
        fail(`::error title=Unable to read package file::${e.message}`)
    }

    return parsePackageInfo(packageFile, packageData)
}

/**
 * @param {string} packageFile
 * @param {string} packageData
 */
export async function parsePackageInfo(packageFile, packageData) {
    let parsedData

    try {
        parsedData = JSON.parse(packageData)
    } catch (e) {
        fail(`::error title=Package file contains invalid syntax,file=${packageFile}::${e.message}`)
    }

    extractJsonFields(packageFile, "Package file", parsedData, {
        name: "string",
        version: "string",
    })

    return {
        name: parsedData.name,
        version: parsedData.version,
        private: Boolean(parsedData.private),
    }
}
