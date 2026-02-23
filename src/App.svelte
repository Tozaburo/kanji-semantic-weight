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

    function handleKeydown(event: KeyboardEvent) {
        if (event.key !== "Enter") return;
        if (event.isComposing || event.keyCode === 229) return;
        run();
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
        displayedKanjisVw.target = 50 / input.length;
    }
</script>

<main>
    {#if isDisplayMode}
        <span class="displayed-kanjis" style:font-size={displayedKanjisSize}
            >{#each kanjis as kanji, i}
                <span style="opacity: {weights[i]}">{kanji}</span>
            {/each}</span
        >
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
            font-size: 2rem;

            span {
                color: oklch(0.11 0.0135 91.45);
            }
        }
    }
</style>
