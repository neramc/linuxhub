# Linuxhub

리눅스 배포판을 둘러보고, 공식 미러에서 내려받고, 설치까지 따라 할 수 있는
빠르고 깔끔한 카탈로그입니다. A fast, clean catalog of Linux distributions with
official downloads and install guides (Korean / English).

- **Astro 7** static site with a **GNOME libadwaita** look
- ~50 popular distributions, official logos, short overviews, step-by-step install guides
- Guided downloads from **official mirrors/CDNs**, nearest mirror suggested from your IP
- Release data refreshed every 6 hours by GitHub Actions
- A complete Linux guide, distro finder, comparisons, family tree and release news

## Development

```bash
bun install
bun run dev        # http://localhost:4321
bun run build      # production build (dist/ + .vercel/output)
bun run sync       # refresh release + mirror data from official sources
```

Quality gates: `bun run lint`, `bun run check`, `bun run test`, `bun run build`,
`bun run test:e2e`.

See `docs/plan.md` for the project plan and `docs/decisions.md` for decisions.

## License

Code: MIT (see `LICENSE`). Written content in `src/content/`: CC BY-SA 4.0.
Distribution names and logos are trademarks of their respective owners and are
used only to identify the projects; see the About page for sources.
