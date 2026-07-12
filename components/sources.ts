// Source registry for evidence tags. Rendered as info buttons in chat.
export const SOURCES: Record<string, { name: string; desc: string; url?: string }> = {
  NSCA: {
    name: "NSCA - Essentials of Strength Training and Conditioning",
    desc: "The certifying body's standards: max strength = 85%+ 1RM, 2-6 reps, 2-5 min rest; hypertrophy = 67-85%, 6-12 reps, 60-90s rest; compounds before isolation.",
    url: "https://www.nsca.com/education/articles/",
  },
  SCHOENFELD: {
    name: "Schoenfeld et al. - volume dose-response meta-analyses",
    desc: "~10-20 hard sets per muscle per week; 2x/week frequency beats 1x at equal volume; progress load only when all reps complete at 1-3 reps in reserve.",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=schoenfeld+resistance+training+volume+meta-analysis",
  },
  DANIELS: {
    name: "Jack Daniels - Daniels' Running Formula",
    desc: "Run intensity zones: Easy 65-78% HRmax, Threshold 88-92% ('comfortably hard', 20-60 min), Interval 98-100% in bouts under 5 min with equal recoveries.",
    url: "https://www.youtube.com/results?search_query=jack+daniels+running+formula+explained",
  },
  "80/20": {
    name: "Seiler - polarized training research",
    desc: "Roughly 80% of endurance training at low intensity, 20% moderate-to-hard. Audited weekly against your actual HR zone data.",
    url: "https://www.youtube.com/results?search_query=stephen+seiler+polarized+training",
  },
  CONCURRENT: {
    name: "Wilson meta-analysis · Viada, The Hybrid Athlete · Tactical Barbell",
    desc: "Managing lifting + endurance interference: separate heavy lower-body lifting and hard endurance by 6-24h; interference hits legs hardest; 2-3 lifts/week is the sustainable dose alongside serious endurance work.",
    url: "https://pubmed.ncbi.nlm.nih.gov/22002517/",
  },
  KOOP: {
    name: "Jason Koop - Training Essentials for Ultrarunning",
    desc: "Ultra prep: time-on-feet over mileage ego, back-to-back long days, terrain specificity, and fueling practice (30-60g carbs/h) in every session over 90 minutes.",
    url: "https://www.youtube.com/results?search_query=jason+koop+ultramarathon+training",
  },
  CSS: {
    name: "Swim Smooth - Critical Swim Speed method",
    desc: "Threshold swim training anchored to CSS pace (sustainable 1500m effort): intervals like 8-12x100 or 5x200 at CSS with 10-20s rest; SWOLF and strokes/length gate progression.",
    url: "https://www.swimsmooth.com/training/css",
  },
  BONESTRESS: {
    name: "Warden et al. - bone stress injury return-to-run protocols",
    desc: "Gates: pain-free daily life, no palpation tenderness, pain-free single-leg hops. Walk/run progression on soft flat ground, one variable per session, weekly load +10-20% max, any pain 3/10+ = stop and regress.",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=warden+bone+stress+injury+return+to+running",
  },
  RECOVERY: {
    name: "HRV / readiness research consensus",
    desc: "Suppressed readiness or a multi-day HRV downtrend: keep the session but cut volume 30-50% or swap intensity for zone 2. Never add intensity on a red day.",
  },
  JUDGMENT: {
    name: "Coaching judgment call",
    desc: "Not directly covered by the evidence library - this is the coach's reasoned opinion given your history and constraints. Weigh it accordingly.",
  },
};

// Tolerant: matches [NSCA] and also [NSCA anything...] so a chatty model
// can't break the chip rendering.
export const SOURCE_TAG_RE = /\[(NSCA|SCHOENFELD|DANIELS|80\/20|CONCURRENT|KOOP|CSS|BONESTRESS|RECOVERY|JUDGMENT)(?:[^\]]*)\]/g;
