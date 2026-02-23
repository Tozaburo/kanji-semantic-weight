import type { Embeddings } from "./loadWordVec";

export function similarity(e: Embeddings, a: string, b: string): number | null {
    const ia = e.index.get(a);
    const ib = e.index.get(b);
    if (ia === undefined || ib === undefined) return null;

    const dim = e.dim;
    const offA = ia * dim;
    const offB = ib * dim;

    let dot = 0;
    for (let i = 0; i < dim; i++)
        dot += e.vectors[offA + i] * e.vectors[offB + i];
    if (!Number.isFinite(dot)) return null;

    return dot;
}
