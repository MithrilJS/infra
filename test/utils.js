import * as assert from "node:assert/strict"

import * as fs from "node:fs/promises"
import * as path from "node:path"
import {fileURLToPath} from "node:url"
import {inspect} from "node:util"

import {Fail, getTemp} from "../lib/util.js"

async function beforeEach() {
    const temp = await getTemp()
    await fs.rm(path.join(temp, "artifact.tar"), {recursive: true, force: true})
    await fs.rm(path.join(temp, "test-package-1.0.0.tgz"), {recursive: true, force: true})
    await fs.rm(path.join(temp, "not-test-package-1.0.0.tgz"), {recursive: true, force: true})
}

export function p(...args) {
    const dirname = path.dirname(fileURLToPath(import.meta.url))
    return path.resolve(dirname, ...args)
}

export function assertFail(fn) {
    return assert.rejects(fn, new Fail())
}

let temp

async function tempFile(name) {
    return path.resolve(temp ??= await getTemp(), name)
}

async function checkExists(file) {
    try {
        await fs.access(file)
        return true
    } catch (e) {
        if (e.code === "ENOENT") return false
        throw e
    }
}

export async function assertTarballPresent(name) {
    const file = await tempFile(name)
    if (!await checkExists(file)) throw new Error(`Expected ${file} to be present`)
}

export async function assertTarballMissing(name) {
    const file = await tempFile(name)
    if (await checkExists(file)) throw new Error(`Expected ${file} to be missing`)
}

function errorify(message, indent) {
    return message.replace(/^(?!::error(?: |::))/gm, `::error::${indent}`)
}

function reportTestError(e, indent) {
    console.log(errorify(e && e instanceof Error ? e.stack : `${e}`, indent))
    if (!e) return
    if (e.code) console.log(errorify(`Code: ${inspect(e.code)}`, indent))
    if (e.path) console.log(errorify(`Path: ${inspect(e.path)}`, indent))
    if (e.port) console.log(errorify(`Port: ${inspect(e.port)}`, indent))
    if (e instanceof assert.AssertionError) {
        console.log(errorify(`Expected: ${inspect(e.expected)}`, indent))
        console.log(errorify(`Actual:   ${inspect(e.actual)}`, indent))
    }
    if (e instanceof AggregateError) {
        for (const inner of e.errors) {
            reportTestError(inner, `${indent}> `)
        }
    }
    if (e.cause) {
        console.log(errorify("Caused by:", indent))
        reportTestError(e.cause, indent)
    }
}

let tests = 0
let testFails = 0

export async function suite(name, fn) {
    Object.defineProperty(fn, "name", {value: JSON.stringify(name)})
    console.log(`::group::▶ ${name}`)
    try {
        await fn()
    } finally {
        console.log("::endgroup::")
    }
}

export async function test(name, fn) {
    Object.defineProperty(fn, "name", {value: JSON.stringify(name)})
    console.log(`::group::  ? ${name}`)
    tests++
    try {
        await beforeEach()
        await fn()
    } catch (e) {
        testFails++
        reportTestError(e, "    ")
    } finally {
        console.log("::endgroup::")
    }
}

export function printReport() {
    console.log(`${tests} tests run (${tests - testFails} passed, ${testFails} failed)`)
}
