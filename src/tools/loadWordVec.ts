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

type PartProgress = {
    loadedBytes: number;
    totalBytes: number | null;
};

async function fetchVectorPart(
    url: string,
    onProgress?: (progress: PartProgress) => void,
): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(
            `failed to fetch ${url} (${res.status} ${res.statusText})`,
        );
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("text/html")) {
        throw new Error(
            `${url} request returned HTML (${res.url}); add binary chunk files to public/`,
        );
    }

    const body = res.body;
    if (body === null) {
        const buf = await res.arrayBuffer();
        onProgress?.({ loadedBytes: buf.byteLength, totalBytes: buf.byteLength });
        return buf;
    }

    const contentLength = Number.parseInt(
        res.headers.get("content-length") ?? "",
        10,
    );
    const totalBytes =
        Number.isFinite(contentLength) && contentLength > 0
            ? contentLength
            : null;

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;
    onProgress?.({ loadedBytes, totalBytes });

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        loadedBytes += value.byteLength;
        onProgress?.({ loadedBytes, totalBytes });
    }

    const merged = new Uint8Array(loadedBytes);
    let cursor = 0;
    for (const chunk of chunks) {
        merged.set(chunk, cursor);
        cursor += chunk.byteLength;
    }

    return merged.buffer;
}

export async function loadEmbeddings(
    onProgress?: (ratio: number) => void,
): Promise<Embeddings> {
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

    const partLoadedBytes = vecPartUrls.map(() => 0);
    const partTotalBytes = vecPartUrls.map(() => 0);
    const partDone = vecPartUrls.map(() => false);
    const reportProgress = () => {
        if (!onProgress) return;

        const hasAllTotals = partTotalBytes.every((total) => total > 0);
        if (hasAllTotals) {
            const loaded = partLoadedBytes.reduce((sum, value) => sum + value, 0);
            const total = partTotalBytes.reduce((sum, value) => sum + value, 0);
            onProgress(total > 0 ? Math.min(loaded / total, 1) : 0);
            return;
        }

        const avgPartProgress =
            partLoadedBytes.reduce((sum, loaded, index) => {
                const total = partTotalBytes[index];
                if (total > 0) return sum + Math.min(loaded / total, 1);
                return sum + (partDone[index] ? 1 : 0);
            }, 0) / vecPartUrls.length;
        onProgress(avgPartProgress);
    };

    onProgress?.(0);

    const vecPartBuffers = await Promise.all(
        vecPartUrls.map((url, index) =>
            fetchVectorPart(url, (progress) => {
                partLoadedBytes[index] = progress.loadedBytes;
                if (progress.totalBytes !== null) {
                    partTotalBytes[index] = progress.totalBytes;
                }
                reportProgress();
            }).then((buffer) => {
                partDone[index] = true;
                if (partTotalBytes[index] === 0) {
                    partTotalBytes[index] = partLoadedBytes[index];
                }
                reportProgress();
                return buffer;
            }),
        ),
    );
    onProgress?.(1);

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
