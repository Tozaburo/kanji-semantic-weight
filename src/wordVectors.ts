import * as fs from "node:fs";

type VocabJson = {
    dim: number;
    words: string[];
};

function dot(a: Float32Array, b: Float32Array): number {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
        s += a[i] * b[i];
    }
    return s;
}

function l2NormalizeCopy(v: Float32Array): Float32Array {
    let s = 0;
    for (let i = 0; i < v.length; i++) {
        const x = v[i];
        s += x * x;
    }
    const norm = Math.sqrt(s);
    if (!Number.isFinite(norm) || norm === 0) {
        return v.slice();
    }
    const inv = 1 / norm;
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) {
        out[i] = v[i] * inv;
    }
    return out;
}

export class WordVectors {
    readonly dim: number;
    readonly words: string[];
    readonly vectors: Float32Array;
    readonly index: Map<string, number>;

    private constructor(dim: number, words: string[], vectors: Float32Array) {
        this.dim = dim;
        this.words = words;
        this.vectors = vectors;
        this.index = new Map(words.map((w, i) => [w, i]));
    }

    static async load(
        vocabPath: string,
        vectorsPath: string,
    ): Promise<WordVectors> {
        const vocabRaw = await fs.promises.readFile(vocabPath, "utf8");
        const vocab = JSON.parse(vocabRaw) as VocabJson;

        if (!Number.isFinite(vocab.dim) || vocab.dim <= 0) {
            throw new Error("Invalid dim");
        }
        if (!Array.isArray(vocab.words) || vocab.words.length === 0) {
            throw new Error("Invalid words");
        }

        const buf = await fs.promises.readFile(vectorsPath);
        if (buf.byteLength % 4 !== 0) {
            throw new Error("vectors.f32 must be float32 aligned");
        }

        const floats = new Float32Array(
            buf.buffer,
            buf.byteOffset,
            buf.byteLength / 4,
        );
        const expected = vocab.words.length * vocab.dim;
        if (floats.length !== expected) {
            throw new Error("vectors length mismatch");
        }

        return new WordVectors(vocab.dim, vocab.words, floats);
    }

    has(word: string): boolean {
        return this.index.has(word);
    }

    vector(word: string): Float32Array | null {
        const i = this.index.get(word);
        if (i === undefined) return null;
        const start = i * this.dim;
        return this.vectors.subarray(start, start + this.dim);
    }

    similarity(a: string, b: string): number | null {
        const va = this.vector(a);
        const vb = this.vector(b);
        if (!va || !vb) return null;
        return dot(va, vb);
    }

    nearest(
        word: string,
        topK: number,
    ): Array<{ word: string; score: number }> {
        const v = this.vector(word);
        if (!v) return [];
        return this.nearestByVector(v, topK, new Set([word]));
    }

    analogy(
        a: string,
        b: string,
        c: string,
        topK: number,
    ): Array<{ word: string; score: number }> {
        const va = this.vector(a);
        const vb = this.vector(b);
        const vc = this.vector(c);
        if (!va || !vb || !vc) return [];

        const q = new Float32Array(this.dim);
        for (let i = 0; i < this.dim; i++) {
            q[i] = vb[i] - va[i] + vc[i];
        }
        const qn = l2NormalizeCopy(q);
        return this.nearestByVector(qn, topK, new Set([a, b, c]));
    }

    private nearestByVector(
        q: Float32Array,
        topK: number,
        exclude: Set<string>,
    ): Array<{ word: string; score: number }> {
        const k = Math.max(1, Math.floor(topK));
        const best: Array<{ idx: number; score: number }> = [];

        for (let i = 0; i < this.words.length; i++) {
            const w = this.words[i];
            if (exclude.has(w)) continue;

            const start = i * this.dim;
            const v = this.vectors.subarray(start, start + this.dim);
            const s = dot(q, v);

            if (best.length < k) {
                best.push({ idx: i, score: s });
                if (best.length === k) {
                    best.sort((x, y) => x.score - y.score);
                }
                continue;
            }

            if (s <= best[0].score) continue;
            best[0] = { idx: i, score: s };
            best.sort((x, y) => x.score - y.score);
        }

        best.sort((x, y) => y.score - x.score);
        return best.map((x) => ({ word: this.words[x.idx], score: x.score }));
    }
}
