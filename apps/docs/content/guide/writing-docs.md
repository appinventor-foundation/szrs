---
title: Writing docs
---

# Writing docs

Every markdown file under `apps/docs/content/` is a page on this site. There is nothing to register: add the file and it appears in the sidebar.

## Adding a page

1. Create `apps/docs/content/<name>.md`.
2. Write markdown.
3. Run `pnpm dev` in `apps/docs`, or `pnpm build` to produce the static site in `apps/docs/build/`.

The file path is the URL: `content/guide/writing-docs.md` is served at `/guide/writing-docs/`.

## Folders

A folder is a section in the sidebar. If it has an `index.md`, the section heading links to it and that page is served at the folder's URL. The top level `content/index.md` is the home page.

## Titles and order

Frontmatter is optional. All of these work:

```md
---
title: Writing docs
order: 2
---
```

- `title` is the name in the sidebar and in the browser tab. Without it, the first `# heading` of the page is used, and without that, the file name.
- `order` sorts pages within a section, lowest first. Pages without one come after, alphabetically by title.

## Links

Link to other pages with a relative path to the markdown file, for example `[the guide](../guide/index.md#adding-a-page)`. The links work on GitHub and on the site. A link that points at a page that doesn't exist fails the build, so broken links get caught before they ship.

Headings get an id automatically, and the second and third level ones are listed in the "On this page" table of contents.

## Images

Put images in `apps/docs/static/` and reference them with an absolute path, like `![diagram](/diagram.png)`.

## Hosting under a sub path

If the site is not served from the root of its domain, set `BASE_PATH` when building, for example `BASE_PATH=/szrs pnpm build`.
