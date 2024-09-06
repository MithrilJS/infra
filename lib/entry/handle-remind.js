import {localTokenExpiryDates, projects} from "../config.js"

import {getOctokit} from "../client.js"

const thresholdDays = 30

const [thisOwner, thisRepo] = process.env.GITHUB_ACTION_REPOSITORY.split("/")

const threshold = thresholdDays * (24*60*60*1000) /* ms/day */

const now = Date.now()
const localNeedsRotated = []
const repoNeedsRotated = []

for (const [name, tokenExpiryDate] of Object.entries(localTokenExpiryDates)) {
    if (now + threshold >= tokenExpiryDate) {
        localNeedsRotated.push({name, tokenExpiryDate})
    }
}

for (const [subcomponent, spec] of Object.entries(projects)) {
    for (const [name, {location, tokenExpiryDate}] of Object.entries(spec)) {
        if (now + threshold >= tokenExpiryDate) {
            repoNeedsRotated.push({
                subcomponent,
                name,
                location,
                tokenExpiryDate,
            })
        }
    }
}

if (localNeedsRotated.length || repoNeedsRotated.length) {
    let body = "@MithrilJS/admins\n\n"

    if (localNeedsRotated.length) {
        body += "The following secrets need rotated in this repo:\n"
        for (const {name, tokenExpiryDate} of localNeedsRotated) {
            body += `- \`${name}\`: ${expireDuration(tokenExpiryDate)}\n`
        }
    }

    if (repoNeedsRotated.length) {
        if (body) body += "\n"
        body += "The following deploy secrets need rotated:"
        for (const {subcomponent, name, location, tokenExpiryDate} of repoNeedsRotated) {
            body += `- \`${name}\` (${subcomponent}) in [${location}](https://github.com/${location}): ${expireDuration(tokenExpiryDate)}\n`
        }
    }

    const octokit = getOctokit(process.env.GITHUB_TOKEN)
    await octokit.request("POST /repos/{owner}/{repo}/issues", {
        owner: thisOwner,
        repo: thisRepo,
        title: "Secrets need rotated",
        body,
    })
}

function expireDuration(timestamp) {
    // Round to the nearest minute, rounding towards zero
    const delta = Math.trunc((now - timestamp) / (60 * 1000))

    if (delta === 0) {
        return "expired just now"
    }

    const absDelta = Math.abs(delta)
    const absDays = Math.floor(absDelta / (60 * 24))
    const absHours = Math.floor((absDelta / 60) % 24)
    const absMinutes = Math.floor(absDelta % 60)

    let duration = ""

    if (absDays > 0) duration += `${absDays}d`
    if (absHours > 0) duration += `${absHours}h`
    if (absMinutes > 0) duration += `${absHours}m`

    return delta > 0 ? `expires ${duration} from now` : `expired ${duration} ago`
}
