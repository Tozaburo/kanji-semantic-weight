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

export async function loadEmbeddings(): Promise<Embeddings> {
    const vocabUrl = "vocab.json";
    const vecUrl = "vectors.f32";

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

    const vecRes = await fetch(vecUrl);
    if (!vecRes.ok) {
        throw new Error(
            `failed to fetch vectors.f32 (${vecRes.status} ${vecRes.statusText}) from ${vecUrl}`,
        );
    }
    const buf = await vecRes.arrayBuffer();
    const contentType = (vecRes.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("text/html")) {
        throw new Error(
            `vectors.f32 request returned HTML (${vecRes.url}); add binary embeddings to public/vectors.f32`,
        );
    }
    if (buf.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
        const shownType = contentType || "unknown";
        throw new Error(
            `vectors.f32 is not float32-aligned (${buf.byteLength} bytes, content-type: ${shownType}, url: ${vecRes.url})`,
        );
    }
    const vectors = new Float32Array(buf);

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
