/* eslint-disable no-bitwise */
/*
It's simple enough that I'll just build the GH pages `tar` in memory. Plus, there's enough RAM on
runners to let me do it directly in-memory like this.

It's documented pretty well in a couple locations:

- https://man.freebsd.org/cgi/man.cgi?query=tar&apropos=0&sektion=5&manpath=FreeBSD+14.1-RELEASE+and+Ports&arch=default&format=html
- https://www.gnu.org/software/tar/manual/html_node/Standard.html
- https://www.gnu.org/software/tar/manual/html_node/Extensions.html

Note that directories should be pushed before their files, so programs will more likely be able to
read it correctly.
*/

const MAX_BUFFER_LENGTH = 1 << 30
const BLOCK_SIZE = 512
const END_PADDING = 1024

export class TarBuilder {
    // Allocate 1 GB right off the bat. The largest artifact file accepted is 1 GB, and GH Pages
    // expects a raw tar file, not a compressed one.
    #buffer = new Uint8Array(MAX_BUFFER_LENGTH + BLOCK_SIZE * 2)
    #view = new DataView(this.#buffer.buffer)
    #length = 0
    #encoder = new TextEncoder()

    constructor() {
        // I'm writing a GNU-style `tar` file. Most `tar` readers understand this.

        // eslint-disable-next-line no-multi-str
        const metadataTemplate = Buffer.from("\
0000664\x000000000\x000000000\x0000000000000\x0000000000000\x00        0\
\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\
\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\
\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\
\0\0\0\0ustar  \0root\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0root", "binary")

        // Get the time in seconds. Note that the year 2038 problem is avoided due to using the GNU
        // extension of writing too-large bytes as raw binary instead.
        //
        // If that ends up breaking in year 2038, I can dig into it then.
        const snapshotTime = Math.floor(Date.now() / 1000)

        const FILE_TEMPLATE = MAX_BUFFER_LENGTH
        const DIR_TEMPLATE = MAX_BUFFER_LENGTH + BLOCK_SIZE

        // This sets uid/gid/size to 0
        this.#buffer.set(metadataTemplate, FILE_TEMPLATE + 100)
        this.#buffer.set(metadataTemplate, DIR_TEMPLATE + 100)

        this.#write12(FILE_TEMPLATE + 136, snapshotTime)
        this.#write12(DIR_TEMPLATE + 136, snapshotTime)

        this.#view.setUint8(DIR_TEMPLATE + 156, 0x35)
        this.#view.setInt32(DIR_TEMPLATE + 104, /* `0755` */ 0x35353730, true)
    }

    /**
     * @param {DataView} view
     * @param {number} offset
     * @param {number} value
     */
    #write12(offset, value) {
        const lo = value | 0

        if (lo === value) {
            if (lo < 0) {
                throw new TypeError("Value cannot be negative")
            }

            // ...ABCD -> ...CD...AB
            this.#buffer[offset + 0] = lo >>> 30 | 0x30
            this.#buffer[offset + 1] = lo >>> 27 & 7 | 0x30
            this.#buffer[offset + 2] = lo >>> 24 & 7 | 0x30
            this.#buffer[offset + 3] = lo >>> 21 & 7 | 0x30
            this.#buffer[offset + 4] = lo >>> 18 & 7 | 0x30
            this.#buffer[offset + 5] = lo >>> 15 & 7 | 0x30
            this.#buffer[offset + 6] = lo >>> 12 & 7 | 0x30
            this.#buffer[offset + 7] = lo >>> 9 & 7 | 0x30
            this.#buffer[offset + 8] = lo >>> 6 & 7 | 0x30
            this.#buffer[offset + 9] = lo >>> 3 & 7 | 0x30
            this.#buffer[offset + 10] = lo & 7 | 0x30
            this.#buffer[offset + 11] = 0
        } else {
            if (!Number.isFinite(value)) {
                throw new TypeError("Value must be finite")
            }

            if (value < 0) {
                throw new TypeError("Value must be non-negative")
            }

            if (value > Number.MAX_SAFE_INTEGER) {
                throw new TypeError("Value is inexact")
            }

            const hi = (value / 2**32) | 0

            this.#view.setUint8(offset, 0x80, true)
            this.#view.setInt32(offset + 1, lo, true)
            this.#view.setInt32(offset + 5, hi, true)
        }
    }

    #advance(length) {
        const offset = this.#length
        let nextOffset = offset + length

        if (nextOffset % BLOCK_SIZE) {
            nextOffset += (BLOCK_SIZE - nextOffset % BLOCK_SIZE)
        }

        if (nextOffset + END_PADDING > MAX_BUFFER_LENGTH) {
            throw new Error("Next chunk would exceed buffer capacity of 1 GB")
        }

        this.#length = nextOffset
        return offset
    }

    #writeHeader(name, size) {
        if ((/[^\x20-\x7E]/).test(name)) {
            throw new Error(`Name contains non-ASCII or controls: ${name}`)
        }

        // Way easier than trying to support long names in extended attributes
        if (name.length > 99) {
            throw new Error(`Name exceeds 100 characters: ${name}`)
        }

        const offset = this.#advance(BLOCK_SIZE)

        this.#buffer.copyWithin(
            offset,
            size < 0 ? MAX_BUFFER_LENGTH + BLOCK_SIZE : MAX_BUFFER_LENGTH,
            size < 0 ? MAX_BUFFER_LENGTH + BLOCK_SIZE * 2 : MAX_BUFFER_LENGTH + BLOCK_SIZE,
        )

        const target = new Uint8Array(this.#buffer.buffer, offset, BLOCK_SIZE)

        this.#encoder.encodeInto(name, target)
        if (size < 0 && !name.endsWith("/")) {
            target[name.length] = 0x2F // `/`
        }

        this.#write12(offset + 124, Math.max(size, 0))

        // Simpler checksum I know is correct. I can optimize it later if it's too slow.
        const cs = target.reduce((a, b) => a + b, 0)

        target[148] = cs >>> 15 & 7 | 0x30
        target[149] = cs >>> 12 & 7 | 0x30
        target[150] = cs >>> 9 & 7 | 0x30
        target[151] = cs >>> 6 & 7 | 0x30
        target[152] = cs >>> 3 & 7 | 0x30
        target[153] = cs & 7 | 0x30
        target[154] = 0
        target[155] = 0x20
    }

    /**
     * @param {string} name
     */
    emitDirectory(name) {
        this.#writeHeader(name, -1)
    }

    /**
     * @param {string} name
     * @param {Uint8Array} contents
     */
    async emitFile(name, contents) {
        this.#writeHeader(name, contents.length)
        const offset = this.#advance(contents.length)
        this.#buffer.set(contents, offset)
    }

    read() {
        return this.#buffer.subarray(0, this.#length + END_PADDING)
    }
}
