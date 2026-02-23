<script lang="ts">
    import toPX from "to-px";
    import { onMount } from "svelte";
    import { cubicOut } from "svelte/easing";
    import { Tween } from "svelte/motion";
    import { loadEmbeddings, type Embeddings } from "./tools/loadWordVec";
    import { similarity } from "./tools/vectorSimilarity";

    let input = $state("");
    const kanjis = $derived(Array.from(input));
    let isDisplayMode = $state(false);
    let weights: number[] = $state([]);
    const baseSizeVw = toPX("2rem")! / toPX("1vw")!;
    const displayedKanjisVw = new Tween(baseSizeVw, {
        duration: 380,
        easing: cubicOut,
    });
    const displayedKanjisSize = $derived(
        `calc(${displayedKanjisVw.current} * 1vw)`,
    );
    const displayedKanjisColorProgress = new Tween(0, {
        duration: 380,
        easing: cubicOut,
    });
    const baseKanjiColor = { l: 0.11, c: 0.0135, h: 91.45 };
    const minKanjiHue = 29.23;
    const maxKanjiHue = 264.052;
    const activeKanjiColor = { l: 0.6142, c: 0.1036 };
    let isClosingDisplayMode = $state(false);

    function handleKeydown(event: KeyboardEvent) {
        if (event.key !== "Enter") return;
        if (event.isComposing || event.keyCode === 229) return;
        event.stopPropagation();
        run();
    }

    function handleDisplayModeKeydown(event: KeyboardEvent) {
        if (!isDisplayMode) return;
        if (event.key !== "Enter") return;
        if (event.isComposing || event.keyCode === 229) return;
        void closeDisplayMode();
    }

    function getDisplayedKanjiColor(weight: number) {
        const t = displayedKanjisColorProgress.current;
        const activeHue =
            minKanjiHue + (maxKanjiHue - minKanjiHue) * (1 - weight);

        const l =
            baseKanjiColor.l + (activeKanjiColor.l - baseKanjiColor.l) * t;
        const c =
            baseKanjiColor.c + (activeKanjiColor.c - baseKanjiColor.c) * t;
        const h = baseKanjiColor.h + (activeHue - baseKanjiColor.h) * t;

        return `oklch(${l} ${c} ${h})`;
    }

    let embeddings: Embeddings | null = null;

    onMount(async () => {
        try {
            embeddings = await loadEmbeddings();
        } catch (error) {
            console.error("Failed to load embeddings:", error);
            embeddings = null;
        }
    });

    function run() {
        const beta = 10;

        // Validate whether the input is only kanji
        if (!/^[一-龯]+$/.test(input)) {
            alert("熟語を入力してください（漢字のみ）");
            return;
        }

        if (input.length < 2) {
            alert("熟語は2文字以上で入力してください");
            return;
        }

        if (embeddings === null) {
            alert("埋め込みの読み込みに失敗しました。");
            return;
        }
        const embeddingData = embeddings;

        if (!embeddingData.index.has(input)) {
            alert(`語彙に存在しない熟語です: ${input}`);
            return;
        }

        const similarities = kanjis.map((kanji) => {
            const s = similarity(embeddingData, input, kanji);
            if (s === null) {
                alert(`語彙に存在しない文字が含まれています: ${kanji}`);
                throw new Error(
                    `語彙に存在しない文字が含まれています: ${kanji}`,
                );
            }
            return s;
        });

        const denominator = kanjis.reduce((acc, kanji) => {
            return acc + Math.exp(similarities[kanjis.indexOf(kanji)] * beta);
        }, 0);

        weights = kanjis.map((kanji) => {
            return (
                Math.exp(similarities[kanjis.indexOf(kanji)] * beta) /
                denominator
            );
        });

        isDisplayMode = true;
        void Promise.all([
            displayedKanjisVw.set(50 / input.length),
            displayedKanjisColorProgress.set(1),
        ]);
    }

    async function closeDisplayMode() {
        if (isClosingDisplayMode) return;
        isClosingDisplayMode = true;

        try {
            await Promise.all([
                displayedKanjisVw.set(baseSizeVw),
                displayedKanjisColorProgress.set(0),
            ]);
            isDisplayMode = false;
        } finally {
            isClosingDisplayMode = false;
        }
    }
</script>

<svelte:window onkeydown={handleDisplayModeKeydown} />

<main>
    {#if isDisplayMode}
        <div class="displayed-kanjis">
            {#each kanjis as kanji, i}
                <div class="displayed-kanji">
                    <span
                        class="kanji"
                        style:color={getDisplayedKanjiColor(weights[i])}
                        style:font-size={displayedKanjisSize}>{kanji}</span
                    >
                    <span
                        class="percentage"
                        style:color={getDisplayedKanjiColor(weights[i])}
                        style:font-size="calc({displayedKanjisSize} * 0.1)"
                        >{(weights[i] * 100).toFixed(1)}%</span
                    >
                </div>
            {/each}
        </div>
    {:else}
        <input
            type="text"
            placeholder="熟語を入力..."
            onkeydown={handleKeydown}
            bind:value={input}
        />
    {/if}
</main>

<style>
    main {
        height: 100vh;
        width: 100vw;

        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;

        input {
            font-size: 2rem;
            padding: 0.5em 1em;
            border: none;
            background-color: transparent;
            border-radius: 4px;
            outline: none;
            transition: border-color 0.3s ease;

            font-family: "Zen Old Mincho", serif;

            text-align: center;

            color: oklch(0.11 0.0135 91.45);

            &::placeholder {
                color: oklch(0.11 0.0135 91.45 / 0.5);
            }
        }

        .displayed-kanjis {
            display: flex;

            .displayed-kanji {
                display: flex;
                flex-direction: column;
                align-items: center;

                .kanji {
                    line-height: 1.2em;
                }

                .percentage {
                    margin-top: 0.25em;
                    font-size: 0.75rem;
                }
            }
        }
    }
</style>
