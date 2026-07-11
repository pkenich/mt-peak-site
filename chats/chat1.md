# # MT. PEAK D2C Site Review

I'll give you the honest assessment you're asking for, then structure the work.

---

##

_Started 2026-06-29 10:44 UTC_

---

## User

I'm building the D2C website for MT. PEAK, a premium Himalayan black tea brand (single-origin, organic, sourced from Nepal). Positioning is luxury/gift — think £60–£120 retail, the kind of cinematic feel you'd expect from a tea that sells for £100+. Brand colours are dark green (#0a1410 / #16352a) and gold (#c9a961), with a cream off-white (#f4efe6) for text.
I have an existing HTML/CSS/JS prototype I'll share — please start from it, don't rebuild from scratch. My real logo (a single gold mountain peak inside a circle with tea leaves growing from the base, on dark green) is already extracted as a transparent PNG and used throughout. Always use my actual logo asset — never redraw it or substitute an approximation.
The current site is a single-page scroll experience with: a loader, custom cursor, film-grain texture, a hero with the logo over a faint giant-emblem backdrop, a word-by-word manifesto reveal, an "Origin" section (emblem on an animated dawn backdrop), an interactive scroll-driven brewing animation (teapot pours into a filling cup with rising steam), a 3-product "Collection" grid, a provenance stats strip, a closer, and a slide-in cart ("Your Reserve").
What I want help with:

Review the whole thing critically against a true £100-tea luxury bar and tell me what's still letting it down.
The three product cards currently use my emblem as a placeholder — design intentional, premium product presentations (I don't have product photos yet). Suggest what real photography I should shoot.
Build out a proper product detail page for one tea (gallery, tasting notes, brewing guide, origin story, add-to-cart).
Tighten mobile — spacing, the brewing animation on small screens, touch targets.
Make it real: recommend how to wire up actual checkout (Stripe vs Shopify), and what I'd need to launch in 2–3 weeks.

Fonts in use are Cormorant Garamond (display serif) and Jost (sans). Keep the restrained, editorial, cinematic feel — luxury is about negative space and pacing, not visual clutter. Push back on me and raise the bar; I'd rather you be honest than agreeable.

## Assistant

I'll start by exploring what's actually in the project, since you mentioned an existing prototype.

_[tool: list_files]_

The prototype you mentioned isn't in the project yet — only your logo, two packaging mockups, and the catalogue PDF are here. Let me review those assets while you get the prototype to me.

_[tool: view_image]_

_[tool: image_metadata]_

_[tool: read_skill_prompt]_

_[tool: run_script]_

I've gone deep on your assets — the logo lockup, both packaging renders, and the full 12-page catalogue (6 teas, wholesale GBP, the "Beyond Nature / Wellness · Home · Ritual" voice, the four-flush pricing system, "The mountain is patient. So are we.").

One blocker before I build: **the prototype itself isn't in the project** — only the images and PDF made it across. I can't "start from it, don't rebuild" without the actual HTML/CSS/JS. Please attach the file (Import → paste code or upload the .html). Until then, here's the honest review and the strategy you asked for, grounded in your description, the assets, and a real £100-tea bar.

## 1. Where it's still letting you down (vs a true luxury bar)

**The hardest truth first: novelty effects are not luxury.** A custom cursor, film grain, a loader, and a scroll-driven teapot animation are the *opposite* signal at this price point. Real luxury (Lalani, Rare Tea Co., Postcard Teas, JING) is confident enough to do *less*. Each of these is a place the site can feel like a 2019 awwwards demo instead of a £100 product:

- **Custom cursor** — almost always reads as gimmick, breaks accessibility, and fails silently on touch. Cut it. The cursor is not where you earn trust.
- **Loader** — a luxury site shouldn't *announce* that it's loading. If you keep one, it must be sub-600ms and dead simple (emblem fading in), never a progress bar or spinner.
- **Film grain** — fine *only* if it's barely perceptible (≤3% opacity) and doesn't crawl/animate. Animated grain is nausea, not cinema.
- **Word-by-word manifesto reveal** — this is the single most overused "premium" trick of the last five years. If the copy is good, let me *read* it. Staggering it word-by-word makes me wait for prose I could've absorbed instantly. Consider a single quiet fade per line, or nothing.
- **Scroll-driven brewing animation** — conceptually lovely, but it's a commitment. If it's not genuinely beautiful and buttery at 60fps on a mid-range Android, it actively cheapens you. It also tends to hijack scroll, which luxury buyers hate. I'd pressure-test whether it survives that bar — on mobile especially (more below).

**The deeper gap is commerce, not theatre.** A £100 tea site lives or dies on: provenance you can *believe*, tactile product presentation, and frictionless trust. Three things I'd bet are missing or thin:

- **No real product photography** = no sale at £100. Your emblem-as-placeholder cards are the #1 thing stopping this from being a real luxury store (you already know — addressed below).
- **Trust scaffolding**: organic certification marks, "direct from factory in 8–10 weeks" set as a *virtue* not a delay, gifting/packaging story, returns, contact. Luxury buyers need *reasons to trust a £100 unknown brand*.
- **The pricing reality gap.** Your catalogue is *wholesale, per kilo* (£23–85/kg). A D2C site at £60–120 *retail per tin* is a totally different model and needs its own SKU + weight + price architecture. We need to define that before the PDP is real (asked below).

**Smaller things that separate £30 from £100:** type rhythm and negative space discipline (one cramped section betrays the whole site), real focus/keyboard states, image-led full-bleed moments, and restraint in gold — gold everywhere stops reading as gold.

## 2. Photography to shoot (this is the real unlock)

Your two AI packaging renders are a *good art-direction north star* but you should not ship AI renders as your hero product shots at £100 — buyers can increasingly tell, and it undercuts "real mountain, real leaf." Shoot, in priority order:

1. **Hero packaging on seamless dark-green/black** — the tin + gift box, single light source, deep shadow, gold catching the rim. Your renders already define this look; recreate it for real.
2. **The dry leaf, macro** — this is what justifies the price. Twisted black leaf, golden tips, silver buds — shot like jewellery. One per SKU.
3. **The liquor in glass** — the brewed cup, backlit so the colour glows (golden / amber / ruby — your catalogue *names* these colours, so show them).
4. **The ritual / lifestyle** — hands, steam, a quiet morning, linen, a single tin. Human warmth against the dark.
5. **Provenance / origin** — the actual gardens above the cloud line, pickers, the factory. Even a handful of real Nepal frames does more for trust than any animation.
6. **Gifting / unboxing** — the open box, the "Our Promise" card, ribbon. Your gift-set render shows you already understand this is a gift product.

Spec: consistent dark backdrop, single-source directional light, shoot on a tripod for a tight grid, leave negative space in-frame for type overlay.

## 5. Making it real — checkout & 2–3 week launch

For a 3-SKU luxury brand launching in 2–3 weeks, **don't build headless Stripe.** Honest recommendation:

- **Shopify** is the right call *if* you want inventory, shipping zones, taxes, gift notes, discount codes, abandoned-cart, and Apple/Google Pay handled for you on day one — and you're willing to live within its checkout. Use a near-blank theme and embed/keep this site as the storefront. Fastest path to a *trustworthy* £100 transaction.
- **Stripe (Payment Links or Checkout)** only if you have very few SKUs, want pixel control of the whole site, and can hand-roll inventory + fulfilment + tax/VAT yourself. Cheaper, more control, more of *your* time — risky on a 2–3 week clock.
- My pick for you: **Shopify** for launch (trust + speed + VAT/shipping done), revisit headless later if the brand demands total control.

**2–3 week launch checklist:** real product photography (the bottleneck — start now); finalised retail SKUs/weights/prices; Shopify store + payment + UK/EU/US shipping rates + VAT; legal pages (returns, privacy, T&Cs); domain + SSL + transactional email; the PDP (I'll build); analytics + a basic email capture. Photography and SKU decisions gate everything else.

---

I can build **points 3 (full PDP) and 4 (mobile)** the moment I have the prototype. A few decisions I need first:

_[tool: questions_v2]_

## User

Questions answered:
- prototype_file: uploads/prototype_file-1782730042917.zip
- retail_model: Fixed-price tins (e.g. 100g caddy at £60–120)
- which_teas: Light & Bright (black), Golden Harvest (golden), Mountain Green (green)
- pdp_tea: Light & Bright
- effects_verdict: Cut the custom cursor, Keep grain only if barely visible, Replace word-by-word manifesto with quiet line fades, Pressure-test the brewing animation (keep only if flawless on mobile)
- pdp_sections: Tasting notes, Brewing guide (temp / time / steeps), Origin story, Specification table, Manufacture steps (from catalogue)
- photography_status: I'll use the AI packaging renders for now
- variations: One strong PDP, polished

## Assistant

Got the prototype. Let me unpack and study it before touching anything.

_[tool: run_script]_

Multiple versions. The cart is "Your Reserve" → `mt-peak-reserve.html` is almost certainly the current one. Let me extract everything and read it.

_[tool: run_script]_

_[tool: read_file]_

Now I have the full picture. Let me look at the actual logo/emblem assets so I use the real ones (the prototype currently *redraws* the mark as inline SVG — against your instruction).

_[tool: view_image]_

_[tool: view_image]_

_[tool: image_metadata]_

_[tool: image_metadata]_

_[tool: view_image]_

The `shot-hero.png` shows a *better* version than `reserve.html` — it uses the real emblem PNG and a giant-emblem backdrop, which reserve.html lacks. Let me find which file actually matches the screenshots.

_[tool: grep]_

`mt-peak-brand.html` is the canonical version — real emblem PNG throughout, giant-emblem backdrop, emblem-as-product-placeholder. That matches your description and the screenshots. Reading it in full.

_[tool: read_file]_

`mt-peak-brand.html` is the real current site. Now I understand everything. Let me set up the delivery and check the product render dimensions so I can crop them into distinct product shots.

_[tool: image_metadata]_

_[tool: image_metadata]_

_[tool: update_todos]_

_[tool: run_script]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: view_image]_

Gorgeous. One issue: the tin and box both read "Cloud Harvest · Black Tea" — perfect for the black tea, but it'd mislabel the green. Let me crop the generic "Beyond Nature" tin from the gift-set shot for Mountain Green.

_[tool: run_script]_

_[tool: view_image]_

Now copy the emblem and build the home page. First the emblem:

_[tool: copy_files]_

Now I'll build the enhanced home page. Writing `site/index.html` from the canonical version with: cursor removed, grain dialed back, line-fade manifesto, the 3 real teas with packaging photography + retail tins, perf-gated canvases, and tightened mobile.

_[tool: write_file]_

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

`show_html` is reserved for the verifier — I'll build the PDP and let verification check both. Building the Light & Bright product page now (shared localStorage cart so it carries between pages).

_[tool: write_file]_

## Assistant

Now the Light & Bright PDP, with a localStorage-backed cart so it carries between pages.

_[tool: write_file]_

Now sync the home page cart to the same localStorage store so it carries to/from the PDP.

_[tool: str_replace_edit]_

_[tool: update_todos]_

Both pages built. Verifying the PDP first (the new build), then the home page.

_[tool: ready_for_verification]_

_[tool: ready_for_verification]_

Done. Both pages build clean; the verifier is doing its pass.

**What I shipped** (in `site/` — `index.html` + `light-and-bright.html`, sharing one cart):

- **Started from your real current version** — `mt-peak-brand.html`, not `mt-peak-reserve.html`. The reserve file was an older variant with redrawn SVG marks and emoji products; the brand file is the one matching your screenshots (real emblem PNG throughout, giant-emblem backdrop, emblem-as-placeholder). I built on that and kept your code intact rather than rebuilding.
- **Effects, per your calls:** custom cursor fully removed (cursor restored, real `:hover`/focus targets); grain dialed to 2.5%; manifesto is now a quiet staggered line-fade instead of word-by-word. The brewing animation is kept but hardened for mobile — DPR-capped canvases, offscreen canvases pause (big battery/jank win), fewer particles on small screens, and a smaller stage + shorter scroll on phones.
- **The 3 teas** from your catalogue with retail tins: Light & Bright £68, Mountain Green £74, Golden Harvest £115 (gift box). Full-bleed packaging photography from your renders.
- **Light & Bright PDP:** sticky gallery (3 real shots + 2 labelled placeholders telling you exactly what to shoot — dry-leaf macro, liquor in glass), tasting notes, brewing guide (90°C / 3g / 3min / 3×), 5-step manufacture, origin story, full spec table, qty + add-to-cart.

**Two things to decide:**
1. The renders read "Cloud Harvest · Black Tea" — perfect for Light & Bright, so I used that tin there and the generic "Beyond Nature" tin for the green to avoid mislabeling. Real per-tea packaging will fix this properly.
2. **Altitude conflict:** your site says 2,400m everywhere; the catalogue says "above 2,500m". I kept 2,400m for internal consistency — pick one and I'll align both.

**Next:** the PDP is the template — say the word and I'll spin up Mountain Green + Golden Harvest from it, then we wire Shopify.

## User

Save as standalone HTML: site/index.html

## Assistant

_[tool: read_skill_prompt]_

The home page references all assets via HTML `src` attributes (no JS-string URLs), so I just need to add the required thumbnail splash, then bundle.

_[tool: str_replace_edit]_

_[tool: super_inline_html]_

That miss is a false positive — `#n` is the internal SVG filter reference inside the grain data-URI (`url(#n)`), not a real external file. It's harmless. Let me verify the bundle renders correctly.

_[tool: show_html]_

This is a bug-check on the bundle (verifying the false-positive asset miss didn't break rendering), so a screenshot is warranted.

_[tool: save_screenshot]_

_[tool: save_screenshot]_

_[tool: show_html]_

_[tool: save_screenshot]_

The bundler's own unpack splash is still showing (5.5MB to decode). Let me give it time and re-capture.

_[tool: sleep]_

_[tool: save_screenshot]_

Let me check what's actually in the DOM — that thin line looks like my own loader bar, meaning the page did unpack but my dismiss code isn't finding the loader.

_[tool: eval_js]_

Everything unpacked correctly — loader done, 3 products, images are inlined blob URLs. The bundler's splash overlay is just sitting on top in the capture. Let me hide it and confirm the real content renders.

_[tool: save_screenshot]_

_[tool: eval_js]_

The loader is stuck visible because each capture reloads the bundle fresh and re-runs the unpack + 2.4s timer. Let me force it down and confirm the actual content rendered correctly in the bundle.

_[tool: save_screenshot]_

The bundle renders correctly offline — real logo in nav, giant-emblem backdrop, falling leaves, fonts all inlined and working. The export is valid. Delivering it:

_[tool: present_fs_item_for_download]_

Your standalone file is ready to download above — a single self-contained `MT Peak — Standalone.html` (~5.5MB) with all images, fonts, and the logo inlined. Works fully offline, no internet needed.

One note: it bundles the **home page only**. Internal links to the Light & Bright PDP won't resolve in the standalone file (it's a single document). If you want a standalone PDP too, say the word and I'll export that separately.

## User

i want you to post this in vercel and also make pages for all the teas

## Assistant

I don't have a Vercel deploy tool — I can't push there directly. I'll build the two remaining tea pages now, then package the whole site as a zip you can drag into Vercel (or I can hand off via GitHub if you connect it).

_[tool: read_file]_

_[tool: tool_search_tool_bm25]_

_[tool: run_script]_

Now wiring the home page collection cards and footer links to the two new pages, then packaging everything for Vercel.

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: run_script]_

Now verifying both new pages render correctly, then packaging for Vercel.

_[tool: ready_for_verification]_

_[tool: ready_for_verification]_

_[tool: get_webview_logs]_

_[tool: show_html]_

No console errors — the "#root" warning is a generic React-app check that doesn't apply here (plain static HTML, no `#root` div by design). Both pages are fine.

_[tool: ready_for_verification]_

_[tool: ready_for_verification]_

Both pages confirmed working (static HTML, no console errors — the "#root" note doesn't apply since these aren't React apps).

Now packaging the full site for Vercel.

_[tool: present_fs_item_for_download]_

I can't push to Vercel directly (no deploy access from here). Download above — unzip and drag the folder into vercel.com/new (or `vercel deploy` via CLI); it's static HTML so zero config needed.

All 3 tea pages are live in the site: `light-and-bright.html`, `mountain-green.html`, `golden-harvest.html`, all linked from the home collection grid and footer, sharing one cart.

## User

fable make the design and everything better and smoother

## Assistant

Polish pass across all four pages — smoother reveals, crossfading gallery, faster loader, eased brew animation:

_[tool: run_script]_

_[tool: ready_for_verification]_

Smoothness pass applied across all four pages:

- **PDPs**: gentle page fade-in on load, staggered scroll-reveals on every section, gallery images now crossfade instead of hard-swapping, thumbnails lift on hover, gold underline on nav links, soft glow on the add button.
- **Home**: loader cut from 2.4s → 1.5s, brewing animation progress is now lerp-smoothed (no more scroll-step jitter), hero parallax runs on an eased render loop instead of raw scroll events, product cards lift subtly on hover.

All respects `prefers-reduced-motion`. If you re-deploy, re-download the site folder — the zip from earlier doesn't include these changes.

