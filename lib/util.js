import * as fs from "node:fs/promises"
import * as path from "node:path"
import {StringDecoder} from "node:string_decoder"
import {Writable} from "node:stream"

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

class Fail {
    /** @param {FailDetail[]} details */
    constructor(details) {
        this.details = details
    }
}

/**
 * @param {string} message
 * @param {string | string[]} detail
 * @returns {never}
 */
export function fail(detail) {
    if (!Array.isArray(detail)) {
        detail = [detail]
    } else if (detail.length === 0) {
        throw new TypeError("At least one detail object must be present in detail arrays.")
    }
    throw new Fail(detail)
}

/**
 * @param {() => Promise<void>} init
 */
export async function run(init) {
    try {
        await init()
    } catch (e) {
        process.exitCode = 1
        reportErrorOrFail(e)
    }
}

function reportErrorOrFail(e) {
    if (e instanceof Fail) {
        for (const detail of e.details) {
            reportErrorOrFail(detail)
        }
    } else {
        reportRunError(e)
    }
}

export function reportRunError(detail) {
    if (detail instanceof Error) {
        detail = detail.stack.replace(/^/gm, "::error::")
    } else {
        detail = `${detail}`
        if (!detail.startsWith("::")) detail = detail.replace(/^/gm, "::error::")
    }
    console.log(detail)
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
 * @property {string} artifactName
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
        artifactName: "string",
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

    /** @type {FailDetail[]} */
    const errors = []

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

        errors.push({detail: `\`${thing}.${name}\` is not of type ${typeString}`, file})
    }

    if (errors.length !== 0) {
        fail(`${thing} contains invalid properties`, errors)
    }

    return Object.fromEntries((
        Object.keys(spec)
            .map((k) => [k, Object.hasOwn(object, k) ? object[k] : undefined])
    ))
}

export class CaptureToString extends Writable {
    #received = ""
    #decoder

    get received() {
        return this.#received
    }

    _write(chunk, _enc, callback) {
        if (typeof chunk === "string") {
            if (this.#decoder) {
                this.#received += this.#decoder.end()
                this.#decoder = undefined
            }
            this.#received += chunk
        } else {
            if (!this.#decoder) {
                this.#decoder = new StringDecoder("utf-8")
            }
            this.#received += this.#decoder.write(chunk)
        }
        return callback()
    }

    _final(callback) {
        if (this.#decoder) {
            this.#received += this.#decoder.end()
            this.#decoder = undefined
        }
        return callback()
    }
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
