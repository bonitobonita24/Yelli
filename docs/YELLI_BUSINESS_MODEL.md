# Yelli — SaaS Business Model

---

## 1. Revenue Model: Hybrid (Subscription + Usage-Based)

Yelli uses a **generous freemium model with soft usage gates** — the core video intercom is free and fully functional. Paid plans unlock extended duration, recording, file persistence, and higher participant limits. This mirrors how Zoom gives 40 minutes free and Google Meet gives 60 minutes — except Yelli is more generous to build adoption in the Philippine hospital/LGU/corporate market first.

### Why Hybrid?
- **Pure per-seat pricing** (like Zoom at $13.33/user/month) penalizes large departments that have many users but low call volume — bad for hospitals with rotating shift staff.
- **Pure usage-based pricing** (like Twilio at $0.004/participant/minute) is unpredictable and scares budget-conscious LGUs.
- **Hybrid** gives a predictable monthly base + soft overage cushion. Tenants know what they'll pay, but aren't punished for occasional spikes.

---

## 2. Pricing Tiers

### Target Market Context (Philippines)
- Average hospital IT budget: ₱15,000–₱50,000/month for communication tools
- LGU/City Hall: ₱5,000–₱25,000/month
- Private corporate offices: ₱10,000–₱80,000/month
- Zoom Pro equivalent in PH: ~₱750/user/month (~$13.33 USD)
- Microsoft Teams Essentials: ~₱225/user/month (~$4 USD)

### Yelli's pricing is per-organization, not per-user — this is the competitive advantage.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         YELLI PRICING TIERS                            │
├──────────────┬──────────────┬──────────────────┬───────────────────────┤
│              │   STARTER    │       PRO        │     ENTERPRISE        │
│              │   (Free)     │   ₱2,999/mo      │   ₱8,499/mo          │
├──────────────┼──────────────┼──────────────────┼───────────────────────┤
│ Users        │ Up to 10     │ Up to 50         │ Unlimited             │
│ Departments  │ Up to 5      │ Up to 25         │ Unlimited             │
│ Group call   │ 45 minutes   │ 4 hours          │ Unlimited             │
│   duration   │              │                  │                       │
│ 1:1 intercom │ Unlimited    │ Unlimited        │ Unlimited             │
│   duration   │              │                  │                       │
│ Participants │ Up to 8      │ Up to 25         │ Up to 50              │
│   per call   │              │                  │                       │
│ Recording    │ ✗ Not        │ ✓ Up to 20hrs    │ ✓ Up to 100hrs        │
│              │   available  │   /month storage │   /month storage      │
│ File sharing │ During call  │ ✓ Persisted &    │ ✓ Persisted &         │
│              │ only (no     │   downloadable   │   downloadable        │
│              │ save)        │                  │                       │
│ Whiteboard   │ During call  │ ✓ Snapshots      │ ✓ Snapshots           │
│              │ only (no     │   saved          │   saved               │
│              │ save)        │                  │                       │
│ Chat history │ ✓ 30 days    │ ✓ 1 year         │ ✓ Unlimited           │
│ Auto-answer  │ ✓ Up to 2    │ ✓ Up to 10       │ ✓ Unlimited           │
│   stations   │   stations   │   stations       │   stations            │
│ Analytics    │ Basic (call  │ Full dashboard   │ Full dashboard +      │
│              │ count only)  │ + export CSV/PDF │ export + API access   │
│ Admin roles  │ 1 admin      │ Up to 3 admins   │ Unlimited admins      │
│ Branding     │ Yelli badge  │ Yelli badge      │ ✓ White-label         │
│              │ shown        │ removable        │   (your logo/colors)  │
│ Support      │ Community    │ Email support    │ Priority email +      │
│              │ (docs/FAQ)   │ (48hr response)  │ dedicated chat        │
│              │              │                  │ (4hr response)        │
├──────────────┼──────────────┼──────────────────┼───────────────────────┤
│ BEST FOR     │ Small clinics│ Mid-size         │ Large hospitals,      │
│              │ small offices│ hospitals, LGU   │ multi-branch corps,   │
│              │ trying it out│ offices, corps   │ provincial LGUs       │
└──────────────┴──────────────┴──────────────────┴───────────────────────┘
```

### Usage Add-Ons (available on Pro and Enterprise)

| Add-On | Price | Notes |
|--------|-------|-------|
| Extra recording storage | ₱299/10hrs block | One-time purchase, doesn't expire |
| Extra participants (above plan limit) | ₱499/month per +10 participants | Monthly add-on |
| Additional departments (above plan limit) | ₱199/month per +5 departments | Monthly add-on |
| SMS/Viber call notifications | ₱0.50 per notification | Pay-as-you-go, via Xendit |

---

## 3. Why This Pricing Beats Competitors

### Cost Comparison: 20-user hospital department (verified May 2026 pricing)

| Platform | Monthly Cost for 20 users | Per-user equivalent | What you get |
|----------|--------------------------|---------------------|--------------|
| **Zoom Pro** | ₱15,389 ($13.33 × 20 users) | ₱769/user | 30hr meetings, 5GB cloud storage |
| **Zoom Business** | ₱21,161 ($18.33 × 20 users) | ₱1,058/user | 300 participants, SSO, whiteboards |
| **Google Workspace Std** | ₱16,160 ($14 × 20 users) | ₱808/user | Meet + Gmail + Drive + Gemini AI |
| **Google Workspace Plus** | ₱25,394 ($22 × 20 users) | ₱1,270/user | 500 participants, Vault, 5TB/user |
| **MS Teams Essentials** | ₱4,616 ($4 × 20 users) | ₱231/user | Unlimited meetings, 10GB storage |
| **MS 365 Business Basic** | ₱6,926 ($6 × 20 users) | ₱346/user | Teams + email + OneDrive 1TB/user |
| **Yelli Pro** | **₱2,999 flat** (all 20 users) | **₱150/user** | 4hr meetings, 20hrs recording, intercom, auto-answer |
| **Yelli Enterprise** | **₱8,499 flat** (all 20 users) | **₱425/user** | Unlimited, white-label, priority support |

**Yelli Pro is 5x cheaper than Zoom, 5x cheaper than Google, and 35% cheaper than MS Teams** — while being the only platform with intercom speed dial, department presence, and auto-answer features. The gap widens with more users since Yelli is flat-rate.

---

## 4. Monetization Funnel

```
AWARENESS           ACTIVATION              CONVERSION            EXPANSION
─────────           ──────────              ──────────            ─────────
Blog/SEO ──→  Sign up (free, 2min) ──→  Hit 45-min cap  ──→  Add departments
Social ads      Create 5 departments      or need recording     Add users
Hospital IT     Set up speed dial         or want file save     Add recording
  conferences   First intercom call       ──→ Upgrade to Pro    ──→ Upgrade to
LGU outreach    ──→ "Aha moment":                                  Enterprise
                    instant video call
                    with one tap
```

### Key Conversion Triggers (Free → Pro)
1. **45-minute group call cap** — meeting ends with "Upgrade to continue" message (not mid-sentence — give 5-minute warning)
2. **Recording grayed out** — button visible but shows "Pro feature" tooltip when clicked
3. **File sharing expires** — shared file disappears after call ends with "Upgrade to keep files" prompt
4. **6th department blocked** — "You've reached the Starter limit" when adding department #6
5. **11th user blocked** — "Upgrade to add more team members"

### Conversion Trigger Philosophy
- **NEVER interrupt an active call** — the cap warning appears 5 minutes before limit, and the call gracefully ends at the cap. No mid-conversation cutoffs.
- **NEVER hide core functionality** — video, audio, screen share, chat, intercom always work on all plans.
- **Soft nudges, not hard walls** — show what Pro offers contextually (e.g., when they try to record), not via constant banner ads.

---

## 5. Revenue Projections (Conservative, Year 1)

### Assumptions
- Philippines market entry, targeting Metro Manila + key provinces
- 6-month ramp to meaningful adoption
- Conversion rate: 5% free → Pro, 1% free → Enterprise (industry average for freemium SaaS: 2-5%)

### Month 12 Target

| Metric | Count | Revenue |
|--------|-------|---------|
| Total tenants (free) | 200 | ₱0 |
| Pro tenants | 15 | ₱44,985/mo |
| Enterprise tenants | 3 | ₱25,497/mo |
| Add-on revenue | — | ~₱8,000/mo |
| **Monthly Recurring Revenue (MRR)** | | **~₱78,482/mo** |
| **Annual Run Rate (ARR)** | | **~₱941,784/yr** |

### Month 24 Target (Year 2)

| Metric | Count | Revenue |
|--------|-------|---------|
| Total tenants (free) | 800 | ₱0 |
| Pro tenants | 60 | ₱179,940/mo |
| Enterprise tenants | 12 | ₱101,988/mo |
| Add-on revenue | — | ~₱35,000/mo |
| **MRR** | | **~₱316,928/mo** |
| **ARR** | | **~₱3,803,136/yr** |

---

## 6. Cost Structure (SaaS Operations)

### Monthly Infrastructure Costs (at scale — ~100 active tenants)

| Item | Cost/month | Notes |
|------|-----------|-------|
| VPS (app + DB) | ₱3,500 | 4 vCPU, 8GB RAM, DigitalOcean/Hetzner |
| VPS (LiveKit media server) | ₱5,000 | 4 vCPU, 8GB RAM, high bandwidth |
| VPS (TURN/Coturn) | ₱2,000 | 2 vCPU, 2GB RAM |
| Object storage (recordings/files) | ₱1,500 | ~500GB on R2/S3 |
| Domain + SSL | ₱200 | Annual cost amortized |
| Email (SMTP) | ₱0 | Self-hosted at mail.powerbyteitsolutions.com |
| Xendit payment fees | ~2-3% of revenue | ~₱1,500–₱2,000 at early scale |
| **Total monthly infra** | **~₱13,700** | |

### Gross Margin Estimate

| Revenue | ₱78,482 (Month 12) |
|---------|---------------------|
| Infra cost | ₱13,700 |
| **Gross margin** | **~83%** |

This is healthy for SaaS. Infrastructure costs scale sub-linearly — doubling tenants doesn't double costs because many tenants share idle capacity.

---

## 7. Payment Flow (via Xendit)

### Subscription Billing Cycle
1. Tenant Admin selects plan (Pro or Enterprise)
2. Chooses billing cycle: **Monthly** or **Annual** (annual = 2 months free = ₱24,990/yr for Pro instead of ₱29,988)
3. Xendit checkout opens — accepts: credit/debit card, GCash, Maya, BPI/BDO online banking, GrabPay
4. On success: plan activates immediately, limits updated in real-time
5. Xendit sends webhook → Yelli backend creates subscription record + invoice
6. Auto-renewal: Xendit charges recurring on cycle date
7. Failed payment: 3-day grace period → "past due" status → 7-day grace → downgrade to Starter (no data deleted, just features gated)

### Annual Discount Pricing

| Plan | Monthly | Annual (per month) | Annual Total | Savings |
|------|---------|-------------------|--------------|---------|
| Pro | ₱2,999/mo | ₱2,499/mo | ₱29,990/yr | ₱5,998 (~2 months free) |
| Enterprise | ₱8,499/mo | ₱7,083/mo | ₱84,990/yr | ₱16,998 (~2 months free) |

### Xendit Fees Impact
- Credit card: ~3.0% + ₱15 per transaction
- E-wallet (GCash/Maya): ~2.7% + ₱8 per transaction
- On ₱2,999 Pro monthly: fee = ~₱105 → net = ₱2,894
- On ₱29,990 Pro annual: fee = ~₱915 → net = ₱29,075

---

## 8. Growth Levers

### Organic / Free
1. **"Powered by Yelli" badge** on Starter plan — every guest who joins sees the brand
2. **SEO content** — "free video intercom for hospitals Philippines", "self-hosted video conferencing"
3. **Product Hunt / PH startup communities** launch
4. **Open-source self-hosted version** drives awareness → some self-hosted users convert to SaaS for convenience

### Paid (when revenue justifies it)
1. **Facebook/Meta ads** — target hospital administrators, LGU IT departments in PH
2. **Google Ads** — "video conferencing for hospitals", "intercom system for offices Philippines"
3. **Hospital/LGU IT conferences** — demo booth showing the speed dial tablet wall

### Retention / Expansion
1. **Usage reports email** (monthly) — "Your team made 312 calls this month" → reinforces value
2. **Department growth prompt** — when hitting department limit, suggest next plan naturally
3. **Annual lock-in discount** — 2 months free on annual billing to reduce churn
4. **White-label on Enterprise** — once a hospital puts their logo on it, switching cost is high

---

## 9. Churn Mitigation

| Risk | Mitigation |
|------|------------|
| Free tenants never convert | Generous free tier builds habit → conversion triggers are contextual, not annoying |
| Pro tenants downgrade | Monthly usage reports showing value; annual discount locks in commitment |
| Enterprise leaves for Zoom | Intercom speed dial has no Zoom equivalent — switching means losing a core workflow |
| Hospital switches to self-hosted | Self-hosted requires IT staff to maintain — SaaS "just works" pitch |
| Payment failures | 3-day + 7-day grace periods; email + in-app notifications before downgrade |

---

## 10. Billing Data Entities (for PRODUCT.md)

These entities are already in PRODUCT.md but here's the billing-specific schema detail:

**PlanDefinition (seed data):**
- id, name (starter/pro/enterprise), display_name, monthly_price_cents, annual_price_cents
- max_users, max_departments, max_participants_per_call, group_call_duration_limit_minutes
- recording_enabled, recording_storage_hours, file_persistence_enabled
- whiteboard_persistence_enabled, chat_retention_days, auto_answer_station_limit
- max_admins, white_label_enabled, support_tier (community/email/priority)

**Subscription:**
- id, organization_id, plan_id, billing_cycle (monthly/annual)
- xendit_subscription_id, xendit_customer_id
- status (active/past_due/cancelled/trialing)
- current_period_start, current_period_end
- cancel_at_period_end (boolean)

**Invoice:**
- id, organization_id, subscription_id
- xendit_invoice_id, xendit_invoice_url
- amount_cents, currency (PHP), tax_cents
- status (draft/open/paid/void/uncollectable)
- issued_at, due_at, paid_at

**UsageRecord:**
- id, organization_id, period_start, period_end
- total_calls, total_minutes, total_participants
- recording_hours_used, storage_bytes_used
- computed_at

---

## 11. Self-Hosted vs SaaS Feature Matrix

| Feature | Self-Hosted (Free) | SaaS Starter (Free) | SaaS Pro | SaaS Enterprise |
|---------|-------------------|---------------------|----------|-----------------|
| Users | Unlimited | 10 | 50 | Unlimited |
| Departments | Unlimited | 5 | 25 | Unlimited |
| 1:1 Intercom | ✓ Unlimited | ✓ Unlimited | ✓ Unlimited | ✓ Unlimited |
| Group calls | Unlimited duration | 45 min | 4 hours | Unlimited |
| Recording | ✓ Free, local | ✗ | ✓ 20hrs/mo | ✓ 100hrs/mo |
| File persistence | ✓ Configurable | ✗ | ✓ | ✓ |
| Whiteboard save | ✓ Configurable | ✗ | ✓ | ✓ |
| Auto-answer | ✓ Unlimited | 2 stations | 10 stations | Unlimited |
| Analytics | Full | Basic | Full + export | Full + export |
| White-label | ✓ (your deploy) | ✗ | ✗ | ✓ |
| Updates | Manual (pull image) | Automatic | Automatic | Automatic |
| Support | Community/GitHub | Docs/FAQ | Email (48hr) | Priority (4hr) |
| Server maintenance | You manage | We manage | We manage | We manage |
| Price | Free forever | Free forever | ₱2,999/mo | ₱8,499/mo |
