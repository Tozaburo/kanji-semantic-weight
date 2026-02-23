type VocabFile = {
    dim: number;
    vocab: string[];
};

export type Embeddings = {
    dim: number;
    vocab: string[];
    index: Map<string, number>;
    vectors: Float32Array;
};

async function fetchVectorPart(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(
            `failed to fetch ${url} (${res.status} ${res.statusText})`,
        );
    }

    const buf = await res.arrayBuffer();
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("text/html")) {
        throw new Error(
            `${url} request returned HTML (${res.url}); add binary chunk files to public/`,
        );
    }

    return buf;
}

export async function loadEmbeddings(): Promise<Embeddings> {
    const vocabUrl = "vocab.json";
    const vecPartUrls = [
        "vectors.f32.part0",
        "vectors.f32.part1",
        "vectors.f32.part2",
    ];

    const vocabRes = await fetch(vocabUrl);
    if (!vocabRes.ok) {
        throw new Error(
            `failed to fetch vocab.json (${vocabRes.status} ${vocabRes.statusText}) from ${vocabUrl}`,
        );
    }
    const vocabFile = (await vocabRes.json()) as VocabFile;
    if (!Number.isInteger(vocabFile.dim) || vocabFile.dim <= 0) {
        throw new Error(`invalid dim in vocab.json (${vocabUrl})`);
    }
    if (!Array.isArray(vocabFile.vocab) || vocabFile.vocab.length === 0) {
        throw new Error(`invalid vocab array in vocab.json (${vocabUrl})`);
    }

    const vecPartBuffers = await Promise.all(
        vecPartUrls.map((url) => fetchVectorPart(url)),
    );
    const totalBytes = vecPartBuffers.reduce(
        (sum, part) => sum + part.byteLength,
        0,
    );
    if (totalBytes % Float32Array.BYTES_PER_ELEMENT !== 0) {
        throw new Error(
            `vector chunks are not float32-aligned (${totalBytes} bytes total)`,
        );
    }

    const mergedBytes = new Uint8Array(totalBytes);
    let cursor = 0;
    for (const part of vecPartBuffers) {
        mergedBytes.set(new Uint8Array(part), cursor);
        cursor += part.byteLength;
    }
    const vectors = new Float32Array(mergedBytes.buffer);

    const expected = vocabFile.vocab.length * vocabFile.dim;
    if (vectors.length !== expected) {
        throw new Error(
            `vector length mismatch (expected ${expected}, got ${vectors.length})`,
        );
    }

    const index = new Map<string, number>();
    for (let i = 0; i < vocabFile.vocab.length; i++)
        index.set(vocabFile.vocab[i], i);

    return { dim: vocabFile.dim, vocab: vocabFile.vocab, index, vectors };
}
