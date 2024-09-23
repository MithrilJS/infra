/** @type {Record<"npm", Record<string, Project>>} */
export const projects = {
    "npm": {
        // "ospec": {
        //     location: "MithrilJS/ospec",
        //     tokenExpiryDate: d(1970, 1, 1),
        //     tokenName: "NPM_TOKEN",
        // },
        // "mithriljs": {
        //     location: "MithrilJS/mithriljs",
        //     tokenExpiryDate: d(1970, 1, 1),
        //     tokenName: "NPM_TOKEN",
        // },
        // "mithril-query": {
        //     location: "MithrilJS/mithril-query",
        //     tokenExpiryDate: d(1970, 1, 1),
        //     tokenName: "NPM_TOKEN",
        // },
        // "mithril-node-render": {
        //     location: "MithrilJS/mithril-node-render",
        //     tokenExpiryDate: d(1970, 1, 1),
        //     tokenName: "NPM_TOKEN",
        // },

        // These are only for testing purposes.
        "test-package": {
            location: "MithrilJS/infra",
            tokenExpiryDate: d(1970, 1, 1),
            tokenName: "INFRA_TEST_TOKEN",
        },
    },
}

export const localTokenExpiryDates = {
    INFRA_TEST_TOKEN: 8640000000000000, // max date
    NPM_TOKEN: d(2025, 9, 13),
    GH_PAGES_TOKEN: d(2025, 9, 13),
}

/**
 * @typedef Project
 * @property {string} location
 * The location in which the request should come from. For GitHub pages deployments, this is also
 * the repo where the deployment should go.
 *
 * @property {number} tokenExpiryDate
 * The date when the repo's corresponding in-repo token is expected to expire.
 *
 * Note: GitHub deletes tokens after a year, so make sure to not create tokens lasting longer than
 * that.
 *
 * @property {keyof localTokenExpiryDates} tokenName
 * For npm deployments, this specifies the token name.
 */

function d(year, month, day) {
    return Date.UTC(year, month - 1, day)
}

// Check config for validity
for (const [name, date] of Object.entries(localTokenExpiryDates)) {
    if (typeof date !== "number") {
        throw new TypeError(`\`localTokenExpiryDates\` key ${name} must be a numeric date value.`)
    }

    if (!Number.isFinite(date)) {
        throw new TypeError(`\`localTokenExpiryDates\` key ${name} must be finite.`)
    }
}

for (const [type, map] of Object.entries(projects)) {
    for (const [name, project] of Object.entries(map)) {
        if (project === null || typeof project !== "object") {
            throw new TypeError(`${type} project ${name} must be an object.`)
        }

        if (project.location === undefined) {
            throw new TypeError(`${type} project ${name} is missing a location.`)
        }

        if (typeof project.location !== "string") {
            throw new TypeError(`${type} project ${name}'s location must be a string.`)
        }

        if (project.tokenExpiryDate === undefined) {
            throw new TypeError(`${type} project ${name} is missing a token expiry date.`)
        }

        if (typeof project.tokenExpiryDate !== "number") {
            throw new TypeError(
                `${type} project ${name}'s token expiry date is supposed to be a number. Use the ` +
                "`d(year, month day)` helper factory."
            )
        }

        if (project.tokenName === undefined) {
            throw new TypeError(`${type} project ${name} is missing a token name.`)
        }

        if (typeof project.tokenName !== "string") {
            throw new TypeError(`${type} project ${name}'s token name must be a string.`)
        }

        if (!Object.hasOwn(localTokenExpiryDates, project.tokenName)) {
            throw new TypeError(
                `${type} project ${name}'s token name must be oe of the following: ${Object.keys(localTokenExpiryDates).join(", ")}`,
            )
        }
    }
}
