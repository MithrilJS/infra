import * as path from "node:path"
import {once} from "node:events"
import {spawn} from "node:child_process"

import {fail, getPackageInfo} from "../util.js"
import {projects} from "../config.js"

export async function packNpm(packageDir) {
    const pkg = await getPackageInfo(packageDir)

    console.log(`::group::Packing ${pkg.name}`)

    if (pkg.private) {
        return fail(`Package ${pkg.name} is private and cannot be published.`)
    }

    console.log(`Checking package ${pkg.name} for deployment registration`)

    if (!Object.hasOwn(projects.npm, pkg.name)) {
        return fail(`Package ${pkg.name} is not yet registered for deployment.`)
    }

    console.log(`Packing package ${pkg.name}`)

    const packProcess = spawn("npm", ["pack"], {cwd: packageDir})
    await once(packProcess, "exit")

    if (packProcess.exitCode) {
        return fail(`\`npm pack\` failed with code ${packProcess.exitCode}.`)
    }

    if (packProcess.signalCode) {
        return fail(`\`npm pack\` failed with signal ${packProcess.signalCode}.`)
    }

    const tarballName = `${pkg.name}-${pkg.version}.tgz`
    const artifactFile = path.join(packageDir, tarballName)

    console.log(`Validating ${tarballName}`)

    const publishProcess = spawn("npm", ["publish", artifactFile, "--dry-run"])
    await once(publishProcess, "exit")

    if (publishProcess.exitCode) {
        return fail(`::error file=${artifactFile}::\`npm publish\` check failed with code ${publishProcess.exitCode}.`)
    }

    if (publishProcess.signalCode) {
        return fail(`::error file=${artifactFile}::\`npm publish\` check failed with signal ${publishProcess.signalCode}.`)
    }

    return artifactFile
}
