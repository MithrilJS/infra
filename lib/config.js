// Format: `"module": "owner/repo"

export const projects = {
    "npm": {
        "ospec": {
            location: "MithrilJS/ospec",
            tokenExpiryDate: d(1970, 1, 1),
        },
        "mithriljs": {
            location: "MithrilJS/mithriljs",
            tokenExpiryDate: d(1970, 1, 1),
        },
        "mithril-query": {
            location: "MithrilJS/mithril-query",
            tokenExpiryDate: d(1970, 1, 1),
        },
        "mithril-node-render": {
            location: "MithrilJS/mithril-node-render",
            tokenExpiryDate: d(1970, 1, 1),
        },
    },

    "gh-pages": {
        "mithriljs": {
            location: "MithrilJS/mithriljs",
            tokenExpiryDate: d(1970, 1, 1),
        },
    },
}

export const localTokenExpiryDates = {
    NPM_TOKEN: d(1970, 1, 1),
    GH_PAGES_TOKEN: d(1970, 1, 1),
}

function d(year, month, day) {
    return Date.UTC(year, 1 + month, day)
}
