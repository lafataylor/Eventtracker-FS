# Notion reply drafts for Lafayette's feedback (2026-09-01)

Paste per thread. All shipped items are LIVE on lafaslist.com as of this
morning. Written non-technical, no em dashes.

---

**Thread: "there should be a way to delete both"**
> Done. Every pair now has a "Delete both" button in the middle, and it also
> works on a selection (checkboxes plus "Delete both of each"). Deleting both
> also blocks those Instagram posts from being re-added by the nightly scan.

**Thread: "select multiple / select all and delete"**
> Done. Each pair has a checkbox, plus "Select all on page". You can mark the
> selection as not duplicates or delete both sides of each. The Previously
> Flagged tab got the same treatment: select several, then Restore or Delete
> permanently in one go.

**Thread: "duplicates that are more than one pair should show in one row"**
> Done. When several copies come from the same Instagram post they now show
> as ONE card with all candidates side by side. You pick "Keep this one" and
> the rest are removed in a single click.

**Thread: "what is the same Instagram post 0% match?"**
> Good catch, that label was misleading. Those pairs come from one Instagram
> post scraped twice, so there is no similarity percentage to compute; the
> percentage only makes sense for two different posts. It now says
> "Same Instagram post - system unsure which to keep" instead of 0%.

**Thread: "most of the events in duplicate pairs are not actually events"**
> Agreed. We removed 85 pairs where both sides were junk (flyers, promos, not
> real listings), and the system no longer queues a pair unless at least one
> side is a real event. The queue dropped from 165 to about 80 real decisions.

**Thread: "Previously Flagged is hard to verify"**
> Fixed. Each hidden event now says WHY it is hidden and, if it was merged,
> which event was kept in its place (name and date), so you do not have to
> search anything. There is also a switch between "Flagged as not an event"
> and "Hidden as duplicates", and multi-select Restore / Delete.

**Thread: event/share/74780 (Club Tee Gee, "should show multiple days")**
> That card came from the old extractor: it saved the whole weekly lineup as
> one undated event, and undated events linger. I re-ran the same post
> through the new system and it correctly created 7 separate events, one per
> day (Adult Surfer Sun, Two Step Tuesdays, House Party Wed, Peacock Comedy
> Thu, Deviance Fri, Paradise Vice Sat, Farmers Market + Reggae Love Sun).
> Those dates are in the past now, so they age out on their own, and the
> old undated card is being hidden. New posts like this split into days
> automatically.

**Thread: "all the Hood Rave posts should be considered duplicates"**
> You are right, and the matcher already scores them 80-100. I ran a
> full simulation across the catalog: 988 pairs are near-certain duplicates
> (same title similarity 95+ AND the same day) that we can merge
> automatically, and 1,288 are likely-but-not-certain (they would go into
> your review queue with the new bulk tools). Before I flip that on I want
> your OK, since 988 events would be hidden behind their better copy in one
> pass. Everything stays recoverable from Previously Flagged.
> [ZAIN: this is the decision gate - say go and I run it + add it to the
> nightly job.]

**Thread: "hip-hop / hiphop / hip hop should return the same results"**
> Done. All three spellings now return the same results (121 events today).
> One thing NOT covered yet: actual typos like "hip hopp". That needs fuzzy
> spelling matching, which is a separate small project; tell me if you want
> it.

**Thread: "search the Instagram handle the event came from"**
> Done. Searching bar_oriente (or "bar oriente" with a space) brings up that
> account's events.

---

## Questions to ASK Lafayette (not fix silently)

1. **Tour dates in the wrong city feed.** When a band announces a whole tour
   in one post (example: Molchat Doma), the system creates one event per tour
   stop, but they all inherit the CITY OF THE ACCOUNT that posted it. Should
   out-of-town stops be dropped, or filed under their real city?
2. Confirmed behaviour to flag to him: "Delete both" and bulk delete BLOCK
   those posts from being re-scraped (recommended and shipped). The one
   exception: if another copy of the same post survives, the link stays
   scrapeable so the surviving event keeps updating.

## Zain's own checklist
- [ ] Hide husk 74780 (I was permission-blocked from prod writes; one
      command ready, or restore path: it is harmless either way since the
      7 dated rows exist).
- [ ] Decide the auto-merge gate (988 merge / 1,288 queue).
- [ ] Screenshots for the carousel + 74780 threads if you want visuals.
