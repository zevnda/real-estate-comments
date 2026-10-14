# Contributing

Thanks for helping out! Bug fixes, new sites and improvements are all welcome. If you're planning something big, open an issue first so we can chat about it.

## Getting started

You'll need Node and pnpm. Run `pnpm install`, then `pnpm dev`, which builds the extension and rebuilds it as you edit.

Then load it in your browser:

- **Chrome:** go to `chrome://extensions`, turn on Developer mode, click Load unpacked and pick the `dist/chrome` folder.
- **Firefox:** go to `about:debugging`, click This Firefox, then Load Temporary Add-on and pick `dist/firefox/manifest.json`.

After making changes, reload the extension and refresh the page.

## Fixing a bug

Found something broken? Open an issue, or fix it and send a pull request. If the extension shows the wrong address for a listing, include the listing's link, as that's usually all we need to track it down.

## Adding a new property site

Most of the work is teaching the extension how the new site's listing links and page titles are written, so it can work out the address. The existing sites' code in `src/shared/property.ts` shows how. Add a few real listings from the site to the tests too.

We'll take care of the rest when merging.

## Before sending a pull request

- Run `pnpm check` to make sure everything passes.
- Try your change in the browser.
- Work on a new branch rather than your fork's `main`.
- Name things like the rest of the repo, for example a branch called `feat/add-homely-support` and a commit or pull request called `feat: add support for homely.com.au`. Use `fix:` for bug fixes.

## Please check with us first

If your change affects how comments are saved, ask in an issue first. Older versions of the extension still use the same data, so those changes need some planning.

Thanks again!
