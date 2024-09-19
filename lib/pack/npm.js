import * as path from "node:path"
import {once} from "node:events"
import {spawn} from "node:child_process"

import {fail, getPackageInfo, getProject, getTemp} from "../util.js"

export async function packNpm(packageDir, repo) {
    const temp = await getTemp()
    const pkg = await getPackageInfo(packageDir)

    if (pkg.private) {
        return fail(`Package ${pkg.name} is private and cannot be published.`)
    }

    console.log(`Checking allowlist status for project ${pkg.name}`)

    void getProject({repo, type: "npm", target: pkg.name})

    console.log(`Packing package ${pkg.name}`)

    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
    const npmEsc = (v) => (process.platform === "win32" ? `"${v}"` : v)
    const packProcess = spawn(npmCmd, ["pack", "--pack-destination", npmEsc(temp)], {
        cwd: packageDir,
        shell: process.platform === "win32",
    })
    await once(packProcess, "exit")

    if (packProcess.exitCode) {
        return fail(`\`npm pack\` failed with code ${packProcess.exitCode}.`)
    }

    if (packProcess.signalCode) {
        return fail(`\`npm pack\` failed with signal ${packProcess.signalCode}.`)
    }

    const artifactFile = path.join(temp, `${pkg.name}-${pkg.version}.tgz`)

    console.log(`Validating ${artifactFile}`)

    const publishProcess = spawn(npmCmd, ["publish", npmEsc(artifactFile), "--dry-run"], {
        shell: process.platform === "win32",
    })

    await once(publishProcess, "exit")

    if (publishProcess.exitCode) {
        return fail(`::error file=${artifactFile}::\`npm publish\` check failed with code ${publishProcess.exitCode}.`)
    }

    if (publishProcess.signalCode) {
        return fail(`::error file=${artifactFile}::\`npm publish\` check failed with signal ${publishProcess.signalCode}.`)
    }

    return artifactFile
}
