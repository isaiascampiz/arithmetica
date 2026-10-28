# Naming and corner-logo directions

Date: 2026-10-19. These are proposed identities; the running application has not been renamed.

Status: the user rejected this first shortlist. Retained as design history; see the [second-round ranked names and logos](round-2/README.md) for the current exploration.

## Design brief

The application coordinates a learning center's arrivals, worksheet preparation, instructor handoffs, observations and recorded history. Its identity should communicate calm, careful coordination around students. A credible engineering portfolio can describe the workflow, constraints and implementation directly; the name should make that story easy to remember.

Criteria: understandable when spoken, practical to spell, distinctive enough to search, readable in the existing sidebar, and broad enough for the actual operations workflows. Preserve the interface's existing blue, navy, system typography and generous spacing. The corner mark needs to work inside the current 39px icon container and as an icon without a wordmark.

## Shortlist

| Rank | Name | Pronunciation | Why it fits | Tradeoff | Logo direction |
| --- | --- | --- | --- | --- | --- |
| 1 | **Folioway** | FOH-lee-oh-way | Folio evokes the paper packets and records; way suggests an orderly path through the learning day. Warm, professional and broad enough for both physical and digital work. | Four syllables; introduce it with a clear product descriptor. | Folded-page F with an open path through its negative space, white on the existing blue. |
| 2 | **Lessonarc** | LESS-un-ark | Immediately suggests education and continuity across visits. Easy to pronounce, remember and explain. | Could be mistaken for lesson-planning or curriculum software, which is not the application's purpose. | An L-shaped stroke and a single arc suggesting an open book and connected path. |
| 3 | **Handfolio** | HAND-foh-lee-oh | Emphasizes passing work and context between people while keeping a record. Closely tied to instructor handoffs. | Can sound like a portfolio product; the coined word is less immediately natural than the first two. | Two offset page tabs joined by a bridge, forming a simple H. |

Recommendation: **Folioway**, paired with **Learning-center operations** as its descriptive line. Suggested supporting copy: **A clear path through the learning day.** The descriptor belongs on a portfolio or sign-in page; the compact sidebar needs only the icon and wordmark.

Portfolio label:

> Folioway — a learning-center operations platform for attendance, worksheet preparation and instructor handoffs.

## Preliminary collision screening

Exact-name web queries and queries restricted to indexed Apple App Store, Google Play and GitHub pages did not surface an obvious same-name software product for these three candidates during this pass. Results for Folioway included historical surname references; Handfolio appeared as generic product-description wording; Lessonarc appeared incidentally inside a document. Search coverage is incomplete. Domain ownership, social handles, similar-sounding brands and trademark availability have not been verified; these candidates are not claimed to be cleared or globally unique.

Examples excluded because direct software/product matches were found:

- [Dayweave](https://dayweave.app/): a planning application.
- [Pacefold](https://apps.apple.com/us/app/pacefold-interval-timer/id6817954990): an interval timer.
- [Pacewright](https://pacewright.com/): a running application.
- [Foliara](https://play.google.com/store/apps/details?id=com.rafaelkasper.foliara): a reading application.

## Visual deliverable and implementation boundary

The [comparison sheet](name-and-logo-concepts-2026-10-19.png) uses the built-in image-generation tool in preview mode. Each candidate has a primary wordmark, a simple symbol and a sidebar placement. It is concept artwork, not a replacement app asset. Small-size drawings on a raster sheet do not establish actual icon legibility or accessibility. The [full generation prompt](concept-board-prompt.txt) is retained alongside it.

After a direction is selected, reproduce the chosen mark as a simple SVG and review it at actual header/favicon sizes and in both themes. A coherent rename then covers the staff header, sign-in, accessible labels, document title, manifest, installation icons and offline copy. Keep persistence paths, browser preference keys, installed-app identity, request IDs and migration history stable unless a separately reviewed migration is necessary. Do not perform a repository-wide text replacement: historical documentation and stored identifiers have different purposes.

No runtime files, records or existing assets were modified for this naming exploration. Application verification results in the audit report describe the previous implementation changes; no new application test run is claimed for these design artifacts.

### Generation prompt summary

Built-in image generation; one original comparison sheet on an off-white background with three aligned columns for `folioway`, `lessonarc`, and `handfolio`. Existing blue/navy palette; flat geometry; generous spacing; precise lowercase wordmarks. Each column includes its matching 39px sidebar-header concept and the existing Home, Student Roster and Homework Preparation labels. Avoid gears, school crests, graduation caps, mascots, gradients, fabricated student data and invented features. The respective symbols are a folded-page F, an L with a connecting arc, and bridged page tabs forming an H.
