# docs

The documentation site, built with [SvelteKit](https://svelte.dev/docs/kit) and [mdsvex](https://mdsvex.pngwn.io/). It is a fully static site: `pnpm build` writes plain HTML to `build/`.

Pages are the markdown files in `content/`. To add one, drop a `.md` file there; see [Writing docs](content/guide/writing-docs.md).

```sh
pnpm dev     # dev server
pnpm build   # static site in build/
pnpm preview # serve the built site
```
