import * as fs from "node:fs/promises"
import * as path from "node:path"
import {projects} from "./config.js"

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
export class Fail extends Error {
    name = "Fail"
}

/**
 * @param {string | Error} messages
 * @returns {never}
 */
export function fail(message) {
    reportRunError(message)
    throw new Fail()
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
    if (e instanceof Fail) return
    const message = e instanceof Error ? e.stack : `${e}`
    console.log(message.replace(/^(?!::error(?: |::))/gm, "::error::"))
    if (e instanceof AggregateError) {
        for (const inner of e.errors) {
            reportRunError(inner)
        }
    }
}

/** @param {keyof NodeJS.ProcessEnv} name */
export function getRequiredEnv(name) {
    if (!Object.hasOwn(process.env, name)) {
        return fail(`\`${name}\` is unset.`)
    }

    const value = process.env[name]

    if (!value) {
        return fail(`\`${name}\` is empty.`)
    }

    return value
}

// This also allows this to work in contexts where the variable isn't set (like locally).
export async function getTemp() {
    let temp = process.env.RUNNER_TEMP

    if (!temp) {
        const {tmpdir} = await import("node:os")
        temp = tmpdir()
    }

    let stats

    try {
        stats = await fs.stat(temp)
    } catch (e) {
        if (e.code === "ENOENT") {
            return fail(`Temporary directory missing: ${temp}`)
        }

        return fail(e)
    }

    if (stats.isDirectory()) {
        return temp
    }

    if (stats.isBlockDevice()) {
        return fail(`Temporary directory is a block device: ${temp}`)
    }

    if (stats.isCharacterDevice()) {
        return fail(`Temporary directory is a character device: ${temp}`)
    }

    if (stats.isFIFO()) {
        return fail(`Temporary directory is a FIFO: ${temp}`)
    }

    if (stats.isFile()) {
        return fail(`Temporary directory is an ordinary file: ${temp}`)
    }

    if (stats.isSocket()) {
        return fail(`Temporary directory is a socket: ${temp}`)
    }

    return fail(`Temporary directory is not a directory: ${temp}`)
}

/** @param {Pick<DeployPayload, "type" | "target" | "repo">} payload */
export function getProject(payload) {
    if (!Object.hasOwn(projects, payload.type)) {
        return fail(`Unrecognized project type: ${payload.type}`)
    }

    if (!Object.hasOwn(projects[payload.type], payload.target)) {
        return fail(`Refusing to publish ${payload.target} as it is not allowlisted for`)
    }

    const project = projects[payload.type][payload.target]

    if (project.location !== payload.repo) {
        return fail(`Refusing to publish ${payload.target} as its repo (${payload.repo}) is not allowlisted for that target`)
    }

    return project
}

/**
 * @typedef DeployPayload
 * @property {string} repo
 * @property {"npm" | "github-pages"} type
 * @property {string} target
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
    // Note: changes to this *must* be reflected in `.github/workflows/deploy.yml`.
    payload = extractJsonFields(undefined, "payload", payload, {
        repo: "string",
        type: "string",
        packageName: "string",
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
 * @returns {{[P in keyof Spec]: JsonType[Spec[P] extends unknown[] ? Spec[P][number] : Spec[P]]}}
 */
export function extractJsonFields(file, thing, object, spec) {
    if (object === null || typeof object !== "object") {
        return fail(`::error file=${file}::\`${thing}\` is not an object`)
    }

    let foundInvalidProperties = false

    for (const [name, type] of Object.entries(spec)) {
        let typeString

        if (Array.isArray(type)) {
            if (type.length === 0) {
                throw new TypeError(`Field spec for \`${name}\` must include at least one type.`)
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

    if (foundInvalidProperties) throw new Fail()

    return Object.fromEntries((
        Object.keys(spec)
            .map((k) => [k, Object.hasOwn(object, k) ? object[k] : undefined])
    ))
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

    extractJsonFields(packageFile, "package", parsedData, {
        name: "string",
        version: "string",
    })

    return {
        name: parsedData.name,
        version: parsedData.version,
        private: Boolean(parsedData.private),
    }
}
