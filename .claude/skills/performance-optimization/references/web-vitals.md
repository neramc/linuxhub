# Core Web Vitals on Linuxhub (LCP, INP, CLS)

> Adapted from [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) @ afa8da9,
> `skills/core-web-vitals/references/{LCP,INP,CLS}.md` — MIT License, Copyright (c) 2026 Addy Osmani
> (full text in `../LICENSE-web-quality-skills`). Changes: merged into one file, headings demoted,
> framework sections (React, Next.js, Nuxt) and the critical-CSS `onload` pattern replaced with Linuxhub notes,
> production `web-vitals` attribution replaced (no RUM by design).

Thresholds (p75): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Linuxhub's own lab budgets are stricter — see the overlay in `../SKILL.md`.

## LCP


### What is LCP?

Largest Contentful Paint (LCP) measures when the largest content element in the viewport becomes visible. This is typically:

- An `<img>` element
- An `<image>` element inside `<svg>`
- A `<video>` element with poster image
- An element with a background image via `url()`
- A block-level element containing text nodes

### LCP timeline

```
[  Server Response  ][  Resource Load  ][  Render  ]
       TTFB              Download         Paint
       └─────────────────────────────────────┘
                         LCP Time
```

### Detailed optimizations

#### 1. Server response time (TTFB)

Target: < 800ms

**Causes:**
- Slow server/database queries
- No CDN/edge caching
- Inefficient backend code
- Cold starts (serverless)

**Solutions:**
```javascript
// Use edge functions for dynamic content
// Vercel example
export const config = { runtime: 'edge' };

// Use stale-while-revalidate caching
// Cache-Control header
res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
```

#### 2. Resource load time

**For images:**
```html
<!-- Preload only when a trace shows the LCP image is discovered late -->
<link rel="preload" as="image" href="/hero.webp" 
      imagesrcset="/hero-400.webp 400w, /hero-800.webp 800w"
      imagesizes="100vw"
      fetchpriority="high">

<!-- Modern format with fallback -->
<picture>
  <source srcset="/hero.avif" type="image/avif">
  <source srcset="/hero.webp" type="image/webp">
  <img src="/hero.jpg" width="1200" height="600" 
       fetchpriority="high" alt="Hero">
</picture>
```

**For text (web fonts):**
```css
@font-face {
  font-family: 'Heading';
  src: url('/fonts/heading.woff2') format('woff2');
  font-display: swap; /* Show fallback immediately */
}
```


#### 3–4. Render-blocking resources and client-side rendering (Linuxhub)

- CSS is already inlined and hashed (`build.inlineStylesheets: "always"`); fonts are preloaded by the Astro Fonts API. Do not add critical-CSS `onload` tricks: inline handlers break the CSP (CLAUDE.md rule 2).
- Pages are static HTML; there is no client-side rendering. Keep LCP content in the server HTML and never make it depend on an island.
- Distro logos are small SVG/PNG files in AppTile; the LCP candidate on the home page is the first carousel slide. Keep its logo `eager` with `fetchpriority="high"` and every other logo `loading="lazy"`.
- `imageService` is off; image width/height are always set (CLS).

### Debugging LCP

```javascript
// Identify LCP element
new PerformanceObserver((entryList) => {
  const entries = entryList.getEntries();
  const lastEntry = entries[entries.length - 1];
  
  console.log('LCP:', {
    element: lastEntry.element,
    time: lastEntry.startTime,
    size: lastEntry.size,
    url: lastEntry.url,
    renderTime: lastEntry.renderTime,
    loadTime: lastEntry.loadTime
  });
}).observe({ type: 'largest-contentful-paint', buffered: true });
```

### Common issues

| Issue | Evidence to confirm | Typical fix |
|-------|---------------------|-------------|
| LCP resource discovered late | Large resource load delay in `LCPBreakdown` or `LCPDiscovery` | Put it in initial HTML, add priority, and preload only when still necessary |
| Large image transfer | Resource load duration and response bytes dominate | Resize/compress and choose an appropriate format |
| Render-blocking CSS | `RenderBlocking` insight and long render delay | Remove unused rules, split non-critical CSS, or inline only proven critical CSS |
| Slow TTFB | `DocumentLatency` insight or LCP TTFB subpart dominates | Cache, reduce redirects, or optimize server work |
| Client-rendered LCP | LCP element absent from initial HTML and render delay dominates | SSR, static rendering, or earlier rendering |

Do not attach generic millisecond savings to these fixes. Measure the relevant LCP subpart before and after under equivalent conditions.


## INP


Read this reference when field INP is poor, a trace identifies a slow interaction, or source inspection finds interaction work that needs runtime verification.

### Diagnose the interaction phases

INP spans three phases. Do not optimize the event handler until the trace shows which phase dominates.

| Phase | Evidence to inspect | Typical fixes |
|-------|---------------------|---------------|
| Input delay | Long tasks already occupying the main thread before the event callback starts | Reduce startup work, split long tasks, delay third parties |
| Processing time | Event callbacks and synchronous work attached to the interaction | Remove unnecessary work, simplify handlers, use workers for CPU-heavy computation |
| Presentation delay | Style, layout, paint, or later main-thread work before the next frame | Reduce DOM scope, rendering cost, and layout invalidation |

### Yield long work

**Bad:**

```javascript
function processLargeArray(items) {
  items.forEach(item => expensiveOperation(item));
}
```

**Good:**

```javascript
async function processLargeArray(items) {
  const chunkSize = 100;

  for (let i = 0; i < items.length; i += chunkSize) {
    items.slice(i, i + chunkSize).forEach(expensiveOperation);

    if ('scheduler' in window && 'yield' in scheduler) {
      await scheduler.yield();
    } else {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}
```

Choose chunk boundaries from trace evidence. A fixed item count does not guarantee an acceptable task duration on representative devices.

### Prioritize visible feedback

**Bad:**

```javascript
button.addEventListener('click', () => {
  const result = calculateComplexThing();
  updateUI(result);
  trackEvent('click');
});
```

**Good:**

```javascript
button.addEventListener('click', async () => {
  button.classList.add('loading');

  if ('scheduler' in window && 'yield' in scheduler) {
    await scheduler.yield();
  }

  const result = calculateComplexThing();
  updateUI(result);

  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => trackEvent('click'));
  } else {
    setTimeout(() => trackEvent('click'), 0);
  }
});
```

Yielding helps only when the UI update can paint before the remaining work. Confirm the frame in the trace.

### Check common causes

* **Third-party code.** Attribute long tasks to their script URLs. Delay nonessential widgets until interaction or visibility, but avoid making the first user interaction pay the full initialization cost without feedback.
* **Framework rendering.** Profile the affected state transition. Memoization is useful only when it removes measured repeated work; do not apply it indiscriminately.
* **Large DOM updates.** Reduce the number of invalidated nodes and avoid forced synchronous layout caused by interleaved reads and writes.
* **CPU-heavy computation.** Move suitable work to a Web Worker and measure serialization overhead.

### Inspect one browser session

This observer reports interactions seen in the current page session. It is not field INP.

```javascript
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 200) {
      console.warn('Slow interaction', {
        type: entry.name,
        duration: entry.duration,
        processingStart: entry.processingStart,
        processingEnd: entry.processingEnd,
        target: entry.target
      });
    }
  }
}).observe({ type: 'event', buffered: true, durationThreshold: 40 });
```

Linuxhub has no production RUM (CLAUDE.md rule 9, ADR-0013): diagnose INP with a DevTools trace and TBT in Lighthouse, not with the `web-vitals` library.

### Verification checklist

- [ ] Reproduce the important interaction on a representative device or CPU profile
- [ ] Identify the dominant input, processing, or presentation phase
- [ ] Confirm which first- or third-party task owns the delay
- [ ] Provide visible feedback before deferred work where appropriate
- [ ] Re-run the same interaction and conditions after the fix
- [ ] Wait for new first-party RUM or CrUX visits before claiming field improvement

### Sources

* [Optimize INP](https://web.dev/articles/optimize-inp)
* [`scheduler.yield()`](https://web.dev/articles/optimize-long-tasks#scheduler-yield)


## CLS


Read this reference when field CLS is poor, a performance trace reports layout shifts, or source inspection finds content that changes geometry without reserved space.

CLS scores unexpected shift clusters across a page visit. A layout-shift score is the `impact fraction × distance fraction`. Use the shifted-node and initiator evidence: the element that moved may be the victim of content inserted above it.

### Reserve media space

**Bad:**

```html
<img src="photo.jpg" alt="Photo">
<iframe src="https://video.example/embed/123" title="Demo"></iframe>
```

**Good:**

```html
<img src="photo.jpg" alt="Photo" width="800" height="600">

<div class="video-frame">
  <iframe src="https://video.example/embed/123" title="Demo"></iframe>
</div>
```

```css
.video-frame {
  aspect-ratio: 16 / 9;
}

.video-frame iframe {
  height: 100%;
  width: 100%;
}
```

Reserve a realistic minimum for ads and embeds whose final size can vary. A placeholder that later collapses can also shift content.

### Handle dynamic content deliberately

Do not insert banners, validation summaries, consent UI, or notifications above visible content without reserving space. Prefer an overlay, insert outside the active viewport, or allocate a stable container before the content arrives.

**Bad:**

```javascript
main.prepend(notification);
```

**Good:**

```javascript
const slot = document.querySelector('[data-notification-slot]');
slot.replaceChildren(notification);
```

The corresponding slot must already have appropriate reserved dimensions. Verify that responsive content and localization do not overflow it.

### Stabilize fonts

Use a fallback with similar metrics and tune it with `size-adjust`, `ascent-override`, `descent-override`, and `line-gap-override` when trace evidence attributes shifts to font replacement.

```css
@font-face {
  font-family: "Brand Fallback";
  src: local("Arial");
  size-adjust: 102%;
  ascent-override: 92%;
  descent-override: 24%;
  line-gap-override: 0%;
}
```

Do not copy these values to another font pair; derive them from the actual font metrics and test representative text.

### Animate without layout

Prefer `transform` and `opacity` for visual motion. Animating `height`, `width`, `top`, or `left` can trigger layout, but replacing them mechanically is not enough: confirm the transformed element does not obscure content or change the intended hit area.

```css
.toast {
  inset-block-start: 1rem;
  inset-inline-end: 1rem;
  position: fixed;
  transform: translateY(-150%);
  transition: transform 200ms;
}

.toast.is-visible {
  transform: translateY(0);
}
```

### Inspect one browser session

This observer reports shifts seen during the current page session. It is not the distribution of real visits.

```javascript
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) {
      console.log('Layout shift', entry.value);
      entry.sources?.forEach(source => {
        console.log('Shifted node', source.node);
        console.log('Previous rect', source.previousRect);
        console.log('Current rect', source.currentRect);
      });
    }
  }
}).observe({ type: 'layout-shift', buffered: true });
```

### Verification checklist

- [ ] Images and responsive media reserve intrinsic space
- [ ] Ads, embeds, and async components have stable containers
- [ ] Banners and validation messages do not displace visible content unexpectedly
- [ ] Font swaps use measured fallback metrics when they cause shifts
- [ ] Animations avoid unnecessary layout work
- [ ] The relevant page state and viewport are exercised, not only the initial load
- [ ] Field improvement is claimed only after new RUM or CrUX visits

### Sources

* [Optimize CLS](https://web.dev/articles/optimize-cls)
* [Debug layout shifts](https://developer.chrome.com/docs/devtools/performance/insights#cls-culprits)
* [CSS font metric overrides](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/size-adjust)
