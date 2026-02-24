<script lang="ts">
    import toPX from "to-px";
    import { onMount } from "svelte";
    import { cubicOut } from "svelte/easing";
    import { Tween } from "svelte/motion";
    import { loadEmbeddings, type Embeddings } from "./tools/loadWordVec";
    import { similarity } from "./tools/vectorSimilarity";

    let currentTheme = $state(
        window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light",
    );
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
    const activeKanjiColor = $derived({
        l: currentTheme === "dark" ? 0.7864 : 0.6142,
        c: 0.1036,
    });
    let isClosingDisplayMode = $state(false);
    let isShowingHelp = $state(false);
    let error = $state("");
    let showError = $state(false);

    if (window.matchMedia) {
        window
            .matchMedia("(prefers-color-scheme: dark)")
            .addEventListener("change", function () {
                currentTheme = this.matches ? "dark" : "light";
            });
    }

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
            error = "熟語を入力してください（漢字のみ）";
            showError = true;
            return;
        }

        if (input.length < 2) {
            error = "熟語は2文字以上で入力してください";
            showError = true;
            return;
        }

        if (embeddings === null) {
            error = "埋め込みの読み込みに失敗しました。";
            showError = true;
            return;
        }
        const embeddingData = embeddings;

        if (!embeddingData.index.has(input)) {
            error = `語彙に存在しない熟語です: ${input}`;
            showError = true;
            return;
        }

        const similarities = kanjis.map((kanji) => {
            const s = similarity(embeddingData, input, kanji);
            if (s === null) {
                error = `語彙に存在しない文字が含まれています: ${kanji}`;
                showError = true;
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

    function onclick(e: MouseEvent) {
        if (e.target !== e.currentTarget) return;

        if (isDisplayMode) {
            void closeDisplayMode();
        } else {
            run();
        }
    }

    function oninput() {
        if (!input) {
            showError = false;
        }
    }
</script>

<svelte:window onkeydown={handleDisplayModeKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<main {onclick}>
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
        <div class="input-wrapper">
            <input
                type="text"
                placeholder="熟語を入力..."
                onkeydown={handleKeydown}
                bind:value={input}
                {oninput}
            />
            <p class="error" style:opacity={showError ? 1 : 0}>{error}</p>
        </div>
    {/if}
</main>
<div
    class="legend"
    style:opacity={isDisplayMode && !isClosingDisplayMode ? 1 : 0}
>
    <span class="label">強</span>
    <div class="gradient"></div>
    <span class="label">弱</span>
</div>
<span class="description">
    <div class="enter">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
            ><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
                d="M160 128C142.3 128 128 113.7 128 96C128 78.3 142.3 64 160 64L256 64C309 64 352 107 352 160L352 466.7L425.4 393.3C437.9 380.8 458.2 380.8 470.7 393.3C483.2 405.8 483.2 426.1 470.7 438.6L342.7 566.6C330.2 579.1 309.9 579.1 297.4 566.6L169.4 438.6C156.9 426.1 156.9 405.8 169.4 393.3C181.9 380.8 202.2 380.8 214.7 393.3L288 466.7L288 160C288 142.3 273.7 128 256 128L160 128z"
            /></svg
        >
    </div>
    キーか背景をクリック
</span>
<button class="help" onclick={() => (isShowingHelp = !isShowingHelp)}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"
        ><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path
            d="M528 320C528 205.1 434.9 112 320 112C205.1 112 112 205.1 112 320C112 434.9 205.1 528 320 528C434.9 528 528 434.9 528 320zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320zM320 240C302.3 240 288 254.3 288 272C288 285.3 277.3 296 264 296C250.7 296 240 285.3 240 272C240 227.8 275.8 192 320 192C364.2 192 400 227.8 400 272C400 319.2 364 339.2 344 346.5L344 350.3C344 363.6 333.3 374.3 320 374.3C306.7 374.3 296 363.6 296 350.3L296 342.2C296 321.7 310.8 307 326.1 302C332.5 299.9 339.3 296.5 344.3 291.7C348.6 287.5 352 281.7 352 272.1C352 254.4 337.7 240.1 320 240.1zM288 432C288 414.3 302.3 400 320 400C337.7 400 352 414.3 352 432C352 449.7 337.7 464 320 464C302.3 464 288 449.7 288 432z"
        /></svg
    >
</button>
{#if isShowingHelp}
    <div class="settings-modal-layer">
        <button
            class="settings-modal-backdrop"
            type="button"
            aria-label="Close settings modal"
            onclick={() => (isShowingHelp = false)}
        ></button>
        <div
            id="toolbar-settings-modal"
            class="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
        >
            <img src="./image.png" alt="Screenshot of this website" />
            <p>
                このサイトは、熟語を構成する各漢字の意味的な重みを視覚化するツールです。
                <br />
                入力された熟語に対して、各漢字がどれだけ意味的に重要であるかを色で表現します。
            </p>
        </div>
    </div>
{/if}

<style>
    main {
        height: 100vh;
        width: 100vw;

        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;

        .input-wrapper {
            position: relative;

            input {
                font-size: 2rem;
                padding: 0.5em 1em;
                border: none;
                background-color: var(--color-transparent);
                border-radius: 4px;
                outline: none;
                transition: border-color 0.3s ease;

                font-family: "Zen Old Mincho", serif;

                text-align: center;

                color: var(--color-text-primary);

                &::placeholder {
                    color: var(--color-text-primary-muted);
                }
            }

            .error {
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);

                color: var(--color-error);
                font-size: 0.875rem;

                transition: opacity 0.3s ease;
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

    .legend {
        position: fixed;
        bottom: 7rem;
        left: 50%;
        transform: translateX(-50%);

        display: flex;
        align-items: center;
        gap: 1.5rem;

        transition: opacity 0.3s ease;

        .gradient {
            width: 50vw;
            height: 20px;

            background: linear-gradient(
                in oklch longer hue to right,
                var(--color-gradient-strong),
                var(--color-gradient-weak)
            );
            border-radius: 20px;
        }

        .label {
            font-size: 2rem;
            color: var(--color-text-primary);

            transform: translateY(-0.03em);
        }
    }

    .description {
        position: fixed;
        bottom: 1.5rem;
        right: 1.5rem;

        font-size: 0.875rem;
        color: var(--color-ui-secondary);

        display: flex;
        align-items: center;
        gap: 0.5em;

        .enter {
            display: flex;
            align-items: center;

            border: 1px solid var(--color-ui-secondary);
            border-radius: 5px;

            padding: 0.1em 0.2em;

            svg {
                width: 1em;
                height: 1em;

                transform: translateY(0.1em) rotate(90deg);

                path {
                    fill: var(--color-ui-secondary);
                }
            }
        }
    }

    .help {
        cursor: pointer;

        position: fixed;
        top: 1.5rem;
        right: 1.5rem;

        padding: 0.5rem;

        background-color: var(--color-transparent);
        border: none;

        svg {
            width: 2em;
            aspect-ratio: 1;

            path {
                fill: var(--color-ui-secondary);
            }
        }
    }

    .settings-modal-layer {
        position: fixed;
        inset: 0;
        z-index: 1100;

        display: grid;
        place-items: center;
        padding: 10rem;

        .settings-modal-backdrop {
            position: absolute;
            inset: 0;

            border: none;
            background-color: var(--color-overlay);

            cursor: pointer;
        }

        .settings-modal {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3rem;

            position: relative;
            z-index: 1;

            height: 100%;
            width: 100%;

            border: solid 1px var(--color-modal-border);
            border-radius: 1rem;
            background-color: var(--color-bg-base);

            img {
                width: 50%;

                object-fit: cover;
                border-radius: 0.5rem;

                --shadow-color: var(--shadow-color-base);
                box-shadow:
                    0px 1px 1.1px hsl(var(--shadow-color) / 0.05),
                    0px 3.3px 3.7px -0.8px hsl(var(--shadow-color) / 0.05),
                    0px 8.2px 9.2px -1.7px hsl(var(--shadow-color) / 0.05),
                    0px 20px 22.5px -2.5px hsl(var(--shadow-color) / 0.05);
            }
        }
    }
</style>
