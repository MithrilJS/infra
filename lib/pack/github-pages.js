import * as fs from "node:fs/promises"
import * as path from "node:path"
import {open, readFile, readdir} from "node:fs/promises"

import {fail, getProject, getTemp, reportRunError} from "../util.js"
import {TarBuilder} from "../tar-builder.js"

/**
 * @param {string} rootDir
 * @param {string} repo
 */
export async function packGitHubPages(rootDir, repo) {
    const temp = await getTemp()

    console.log("Retrieving domain name")

    let target

    try {
        target = (await fs.readFile(path.join(rootDir, "CNAME"), "utf-8")).trim().toLowerCase()
    } catch (e) {
        if (e.code !== "ENOENT" && e.code !== "EISDIR") throw e
    }

    if (target === undefined) {
        const [user = "", name = ""] = repo.split("/")
        target = `${user.toLowerCase()}.github.io/${name}`
    }

    console.log(`Checking allowlist status for ${target} in repo ${repo}`)

    void getProject({repo, type: "github-pages", target})

    const artifactFile = path.resolve(temp, "artifact.tar")

    console.log(`Creating asset archive at ${artifactFile}`)

    const artifactHandle = await open(artifactFile, "w")
    const tar = new TarBuilder()

    try {
        const normalize = (file) => path.relative(rootDir, file).replaceAll("\\", "/")

        const visit = async(parent, name) => {
            const file = path.join(parent, name)

            try {
                tar.emitFile(normalize(file), await readFile(file))
                return
            } catch (e) {
                if (e.code === "ENOENT") throw e
                if (e.code !== "EISDIR") return
            }

            try {
                const entries = await readdir(file)
                if (entries.length === 0) return
                tar.emitDirectory(normalize(file))
                for (const child of entries) {
                    await visit(file, child)
                }
            } catch (e) {
                if (e.code !== "ENOENT") throw e
            }
        }

        for (const child of await readdir(rootDir)) {
            await visit(rootDir, child)
        }

        await artifactHandle.writeFile(tar.read())
        await artifactHandle.sync()
    } catch (e) {
        reportRunError("Tarball generation failed.")
        fail(e)
    } finally {
        await artifactHandle.close()
    }

    console.log("Asset archive generated")
}
